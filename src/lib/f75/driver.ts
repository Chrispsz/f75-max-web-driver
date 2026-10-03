/**
 * F75 Driver — transporte WebHID do Aula F75 Max.
 *
 * Porta fiel de LinuxHIDBackend.swift + WirelessAulaDevice.swift com:
 *  - seleção automática de endpoints por usage page (0xFF13 comando,
 *    0xFF68 display, 0xFF60 receiver 2.4G);
 *  - semântica de wire byte-idêntica ao hidapi/hidraw, com estratégias de
 *    fallback e log de cada tentativa (o descriptor real decide);
 *  - listeners persistentes de input report (bateria em tempo real, ACKs);
 *  - reconexão automática em hotplug (eventos connect/disconnect do WebHID);
 *  - modo simulação completo pra desenvolver/testar sem o teclado.
 */

import {
  AULA,
  batteryQueryPacket,
  describeWired,
  describeWireless,
  gameModeReport,
  hex2,
  parseBatteryReport,
  rgbCommitReport,
  rgbLEDReport,
  timePayload,
  wiredPacket,
  type EncodedDisplayStream,
  type GameFlags,
  type RgbSettings,
} from "./protocol";
import { f75log } from "./logger";

export class F75Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "F75Error";
  }
}

export type EndpointRole = "wiredCommand" | "wiredDisplay" | "dongle";

export interface DriverStatus {
  sim: boolean;
  wiredCommand: boolean;
  wiredDisplay: boolean;
  dongle: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Endpoint = { kind: "real"; device: HIDDevice } | { kind: "sim"; role: EndpointRole };

interface ReportSize {
  id: number;
  bytes: number;
}

function reportBytes(infos: HIDReportInfo[]): ReportSize[] {
  return infos.map((info) => ({
    id: info.reportId,
    bytes: Math.ceil(info.items.reduce((acc, item) => acc + (item.reportCount ?? 1) * (item.reportSize ?? 0), 0) / 8),
  }));
}

export interface UploadProgress {
  sent: number;
  total: number;
  chunksPerSecond: number;
  etaSeconds: number;
}

export interface CancelToken {
  cancelled: boolean;
}

export interface PerformanceOptions extends GameFlags {
  level: number; // 1..5
  sleep: number; // 0..3
}

export class F75Driver {
  private wiredCommand?: Endpoint;
  private wiredDisplay?: Endpoint;
  private dongle?: Endpoint;
  private simMode = false;
  private statusListeners = new Set<(s: DriverStatus) => void>();
  private batteryWaiters: ((percent: number | null) => void)[] = [];
  private displayAckCounter = 0;
  private hidListenersAttached = false;

  onStatus: ((s: DriverStatus) => void) | null = null;
  onBattery: ((percent: number | null) => void) | null = null;

  /* -------------------------------- status -------------------------------- */

  get status(): DriverStatus {
    return {
      sim: this.simMode,
      wiredCommand: !!this.wiredCommand,
      wiredDisplay: !!this.wiredDisplay,
      dongle: !!this.dongle,
    };
  }

  private notify(): void {
    const s = this.status;
    this.statusListeners.forEach((fn) => fn(s));
    this.onStatus?.(s);
  }

  subscribe(fn: (s: DriverStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  /* -------------------------------- hotplug ------------------------------- */

  private attachHidListeners(): void {
    if (this.hidListenersAttached || !navigator.hid) return;
    this.hidListenersAttached = true;
    navigator.hid.addEventListener("connect", (ev) => {
      const d = ev.device as HIDDevice;
      f75log.info(`🔌 Sistema: dispositivo HID presente 0x${d.vendorId.toString(16).padStart(4, "0")}:0x${d.productId.toString(16).padStart(4, "0")} — tentando rebinar endpoints…`);
      void this.reconnectSaved(true);
    });
    navigator.hid.addEventListener("disconnect", (ev) => {
      const d = ev.device as HIDDevice;
      if ([this.wiredCommand, this.wiredDisplay, this.dongle].some((ep) => ep?.kind === "real" && ep.device === d)) {
        f75log.warn(`⚠ O dispositivo ${d.productName || "HID"} foi desconectado do sistema. Reconecte e clique em Reconectar.`);
        this.clearRealEndpoints();
        this.notify();
      }
    });
  }

  private clearRealEndpoints(): void {
    this.wiredCommand = undefined;
    this.wiredDisplay = undefined;
    this.dongle = undefined;
  }

  /* ------------------------------- conexão -------------------------------- */

  static get supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.hid && !!window.isSecureContext;
  }

  /** Abre o seletor do navegador (precisa de gesto do usuário). */
  async connectPicker(): Promise<DriverStatus> {
    if (this.simMode) return this.simConnect();
    if (!navigator.hid) throw new F75Error("WebHID indisponível — use Chrome/Chromium/Edge/Brave (não existe no Firefox).");
    this.attachHidListeners();

    f75log.info("Abrindo seletor de dispositivos WebHID (filtros: 0x0C45:0x800A cabo, 0x05AC:0x024F receiver)…");
    const devices = await navigator.hid.requestDevice({
      filters: [
        { vendorId: AULA.wiredVendorId, productId: AULA.wiredProductId },
        { vendorId: AULA.dongleVendorId, productId: AULA.dongleProductId },
      ],
    });
    f75log.info(`Seletor retornou ${devices.length} interface(s) — vincular as que forem do F75 Max.`);
    await this.bindDevices(devices);
    if (!this.wiredCommand && !this.wiredDisplay && !this.dongle) {
      throw new F75Error(
        "Nenhum endpoint vinculado. Selecione TODAS as entradas 'Aula F75 Max' / 'Aula F75 Max 2.4G' no seletor e tente de novo."
      );
    }
    this.notify();
    return this.status;
  }

  /** Rebinding silencioso dos dispositivos já autorizados (sem seletor). */
  async reconnectSaved(silent = false): Promise<DriverStatus> {
    if (this.simMode) return this.simConnect();
    if (!navigator.hid) throw new F75Error("WebHID indisponível neste navegador.");
    this.attachHidListeners();
    const granted = await navigator.hid.getDevices();
    const ours = granted.filter(
      (d) =>
        (d.vendorId === AULA.wiredVendorId && d.productId === AULA.wiredProductId) ||
        (d.vendorId === AULA.dongleVendorId && d.productId === AULA.dongleProductId)
    );
    if (!silent) f75log.info(`Reconectar: ${ours.length} interface(s) já autorizadas neste navegador.`);
    if (ours.length === 0 && !silent) {
      throw new F75Error("Nenhum dispositivo autorizado ainda — use 'Conectar' para abrir o seletor uma vez.");
    }
    await this.bindDevices(ours);
    this.notify();
    return this.status;
  }

  private async bindDevices(devices: HIDDevice[]): Promise<void> {
    for (const device of devices) {
      const isWired = device.vendorId === AULA.wiredVendorId && device.productId === AULA.wiredProductId;
      const isDongle = device.vendorId === AULA.dongleVendorId && device.productId === AULA.dongleProductId;
      if (!isWired && !isDongle) continue;

      const role = isWired
        ? device.collections.some((c) => c.usagePage === AULA.wiredCommandPage)
          ? "wiredCommand"
          : device.collections.some((c) => c.usagePage === AULA.wiredRawPage)
            ? "wiredDisplay"
            : null
        : device.collections.some((c) => c.usagePage === AULA.dongleRawPage || c.usagePage === AULA.dongleCommandPage)
          ? "dongle"
          : "dongle"; // receiver: aceita qualquer interface dele

      if (!role) {
        f75log.debug(`Interface ignorada (sem usage page conhecida): ${this.describeDevice(device)}`);
        continue;
      }
      if (this[role]) continue; // já vinculado

      try {
        if (!device.opened) await device.open();
      } catch (err) {
        f75log.err(`Falha ao abrir ${device.productName || "HID"}: ${String(err)} — confira a regra udev (make linux-install-udev).`);
        continue;
      }

      this[role] = { kind: "real", device };
      device.addEventListener("inputreport", (ev) => this.handleInput(role, ev.reportId, new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength)));
      f75log.ok(`✔ ${role === "dongle" ? "Receiver 2.4G" : role === "wiredCommand" ? "Cabo · comando" : "Cabo · display"} vinculado — ${this.describeDevice(device)}`);
    }
  }

  private describeDevice(device: HIDDevice): string {
    const parts = device.collections.map((c) => {
      const fmt = (rs: ReportSize[]) => rs.map((r) => `0x${hex2(r.id)}:${r.bytes}B`).join(",");
      return `page=0x${c.usagePage.toString(16)} usage=0x${c.usage.toString(16)} feat[${fmt(reportBytes(c.featureReports))}] out[${fmt(reportBytes(c.outputReports))}] in[${fmt(reportBytes(c.inputReports))}]`;
    });
    return `${device.productName || "HID"} 0x${device.vendorId.toString(16)}:0x${device.productId.toString(16)} { ${parts.join(" | ")} }`;
  }

  async disconnect(): Promise<void> {
    if (this.simMode) {
      this.simMode = false;
      f75log.info("🧪 Simulação encerrada.");
      this.clearRealEndpoints();
      this.notify();
      return;
    }
    for (const ep of [this.wiredCommand, this.wiredDisplay, this.dongle]) {
      if (ep?.kind === "real") {
        try {
          await ep.device.close();
        } catch {
          /* ignore */
        }
      }
    }
    this.clearRealEndpoints();
    f75log.info("Desconectado (endpoints fechados). Autorização continua salva — use Reconectar.");
    this.notify();
  }

  /* ------------------------------ modo simulação --------------------------- */

  /** Liga o modo simulação (nenhum hardware é acessado). */
  async enableSim(): Promise<DriverStatus> {
    return this.simConnect();
  }

  private simConnect(): DriverStatus {
    this.simMode = true;
    this.wiredCommand = { kind: "sim", role: "wiredCommand" };
    this.wiredDisplay = { kind: "sim", role: "wiredDisplay" };
    this.dongle = { kind: "sim", role: "dongle" };
    f75log.warn("🧪 MODO SIMULAÇÃO ativo — nenhum hardware é acessado. Pacotes são montados de verdade, mas 'enviados' pro nada. Tudo que a UI fizer aparece aqui igual.");
    this.notify();
    return this.status;
  }

  get isSim(): boolean {
    return this.simMode;
  }

  /* ------------------------------ input reports ---------------------------- */

  private handleInput(role: EndpointRole, reportId: number, data: Uint8Array): void {
    if (role === "dongle") {
      const percent = parseBatteryReport(reportId, data);
      if (percent !== null) {
        f75log.rx(`🔋 Bateria via input report: ${percent}% (id=0x${hex2(reportId)})`);
        const waiters = [...this.batteryWaiters];
        this.batteryWaiters = [];
        waiters.forEach((resolve) => resolve(percent));
        this.onBattery?.(percent);
        return;
      }
    }
    if (role === "wiredDisplay") {
      this.displayAckCounter += 1;
      if (this.displayAckCounter === 1 || this.displayAckCounter % 64 === 0) {
        f75log.rx(`ACK display #${this.displayAckCounter} (id=0x${hex2(reportId)}, ${data.length}B)`);
      }
      return;
    }
    if (role === "wiredCommand") {
      f75log.rx(`Input no canal de comando (id=0x${hex2(reportId)}): ${Array.from(data.subarray(0, 16), (b) => hex2(b)).join(" ")}`);
    }
  }

  private waitForInput(ep: Endpoint, timeoutMs: number): Promise<Uint8Array | null> {
    if (ep.kind === "sim") {
      return sleep(Math.min(timeoutMs, 25)).then(() => new Uint8Array([0x01]));
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (value: Uint8Array | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        ep.device.removeEventListener("inputreport", handler);
        resolve(value);
      };
      const handler = (ev: HIDInputReportEvent) =>
        finish(new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength));
      const timer = setTimeout(() => finish(null), timeoutMs);
      ep.device.addEventListener("inputreport", handler);
    });
  }

  /* ------------------------------- baixo nível ----------------------------- */

  /** SET_FEATURE no canal de comando — mesma wire do hid_send_feature_report. */
  private async sendFeature(ep: Endpoint, packet: Uint8Array, label: string): Promise<void> {
    f75log.cmd(`TX feature · ${label} · ${describeWired(packet)}`);
    f75log.dump(packet, `SET feature · ${label}`);
    if (ep.kind === "sim") return;

    const features = reportBytes(ep.device.collections.flatMap((c) => c.featureReports));
    const id = packet[0];
    const attempts: { id: number; data: Uint8Array; note: string }[] = [];
    const pad = (data: Uint8Array, size: number) => {
      if (data.length >= size) return data;
      const out = new Uint8Array(size);
      out.set(data);
      return out;
    };

    if (id !== 0) {
      const declared = features.find((f) => f.id === id);
      if (declared) {
        attempts.push({
          id,
          data: pad(packet.subarray(1), Math.max(declared.bytes - 1, 0)),
          note: `feature id=0x${hex2(id)} declarada (${declared.bytes}B) → id + payload ${Math.max(declared.bytes - 1, 0)}B`,
        });
      }
    }
    const declaredZero = features.find((f) => f.id === 0);
    if (id === 0 || declaredZero || features.length === 0 || attempts.length === 0) {
      attempts.push({ id: 0, data: packet, note: "verbatim 64 B sem report id (semântica hidraw)" });
    }

    for (const attempt of attempts) {
      try {
        await ep.device.sendFeatureReport(attempt.id, attempt.data);
        f75log.debug(`SET feature ok · ${attempt.note}`);
        return;
      } catch (err) {
        f75log.warn(`SET feature falhou (${attempt.note}): ${String(err)}`);
      }
    }
    throw new F75Error(`SET feature falhou em todas as estratégias — ${label}. Confira udev/permissões.`);
  }

  /** GET_FEATURE de ACK — o nativo não valida o conteúdo, só exige sucesso. */
  private async readFeatureAck(ep: Endpoint, label: string): Promise<void> {
    if (ep.kind === "sim") return;
    for (const id of [0, 0x04]) {
      try {
        const view = await ep.device.receiveFeatureReport(id);
        f75log.rx(`GET feature id=0x${hex2(id)} · ${label} · ${view.byteLength}B`);
        f75log.dump(view, `GET feature · ${label}`);
        return;
      } catch {
        /* tenta próximo id */
      }
    }
    f75log.debug(`GET feature indisponível (${label}) — seguindo sem ACK (mesma tolerância do nativo).`);
  }

  private async commandExchange(ep: Endpoint, packet: Uint8Array, label: string): Promise<void> {
    await this.sendFeature(ep, packet, label);
    await this.readFeatureAck(ep, label);
  }

  /** Saída por interrupt OUT — mesma wire do hid_write. */
  private async sendOutput(ep: Endpoint, bytes: Uint8Array, label: string, rawChunk = false): Promise<void> {
    if (!rawChunk) {
      f75log.cmd(`TX output · ${label} · ${describeWireless(bytes)}`);
      f75log.dump(bytes, `SET output · ${label}`);
    }
    if (ep.kind === "sim") return;

    try {
      await ep.device.sendReport(0, bytes);
      return;
    } catch (err) {
      if (rawChunk) throw new F75Error(`Falha ao escrever bloco de display: ${String(err)}`);
      f75log.warn(`sendReport(0) falhou (${String(err)}) — tentando com report id = primeiro byte (0x${hex2(bytes[0])})…`);
    }
    try {
      await ep.device.sendReport(bytes[0], bytes.subarray(1));
    } catch (err) {
      throw new F75Error(`TX output falhou nas duas estratégias — ${label}: ${String(err)}`);
    }
  }

  private require(role: EndpointRole): Endpoint {
    const ep = this[role];
    if (ep) return ep;
    const what =
      role === "dongle"
        ? "o receiver 2.4G (RGB/bateria/desempenho só vão pelo dongle)"
        : role === "wiredCommand"
          ? "o teclado via CABO USB-C (canal de comando 0xFF13)"
          : "o teclado via CABO USB-C (canal de display 0xFF68)";
    throw new F75Error(`Conecte ${what}.`);
  }

  /* --------------------------------- relógio ------------------------------- */

  async syncClock(date: Date = new Date()): Promise<void> {
    const cmd = this.require("wiredCommand");
    f75log.info(`⏰ Sincronizando relógio da telinha: ${date.toLocaleString("pt-BR")}`);
    await this.commandExchange(cmd, wiredPacket(0x04, 0x18), "relógio · abrir sessão");
    const prepare = wiredPacket(0x04, 0x28);
    prepare[8] = 0x01;
    await this.commandExchange(cmd, prepare, "relógio · prepare");
    await this.commandExchange(cmd, timePayload(date), "relógio · payload de tempo");
    await this.commandExchange(cmd, wiredPacket(0x04, 0x02), "relógio · commit");
    f75log.ok(`Relógio da telinha sincronizado (${date.toLocaleTimeString("pt-BR")}).`);
  }

  /* --------------------------------- display ------------------------------- */

  async uploadDisplay(
    stream: EncodedDisplayStream,
    slot: number,
    onProgress: (p: UploadProgress) => void,
    token?: CancelToken
  ): Promise<void> {
    if (!Number.isInteger(slot) || slot < 1 || slot > 255) {
      throw new F75Error("Slot precisa ser um número entre 1 e 255.");
    }
    if (stream.chunkCount > 0xffff) throw new F75Error("Payload grande demais pros metadados de 16 bits.");

    const cmd = this.require("wiredCommand");
    const raw = this.require("wiredDisplay");
    const started = performance.now();
    this.displayAckCounter = 0;

    f75log.info(`📤 Upload slot ${slot}: ${stream.frameCount} frames · ${stream.chunkCount} blocos · ${(stream.data.length / 1024).toFixed(0)} KB · ${stream.avgFps.toFixed(1)} fps médios`);
    await this.commandExchange(cmd, wiredPacket(0x04, 0x18), "upload · abrir sessão");

    const metadata = wiredPacket(0x04, 0x72);
    metadata[2] = slot;
    metadata[8] = stream.chunkCount & 0xff;
    metadata[9] = (stream.chunkCount >> 8) & 0xff;
    await this.commandExchange(cmd, metadata, "upload · metadados");
    const firstAck = await this.waitForInput(raw, 150);
    if (!firstAck) f75log.warn("Sem ACK após metadados (150 ms) — o nativo segue mesmo assim.");

    let lastLog = 0;
    for (let index = 0; index < stream.chunkCount; index++) {
      if (token?.cancelled) throw new F75Error("Upload cancelado pelo usuário.");
      const chunk = stream.data.subarray(index * AULA.chunkLength, (index + 1) * AULA.chunkLength);
      await this.sendOutput(raw, chunk, `bloco ${index + 1}/${stream.chunkCount}`, true);
      const ack = await this.waitForInput(raw, 350);
      if (!ack && index % 32 === 0) f75log.debug(`Bloco ${index + 1}: sem ACK em 350 ms (seguindo).`);

      if (index - lastLog >= 9 || index === stream.chunkCount - 1) {
        lastLog = index;
        const elapsed = (performance.now() - started) / 1000;
        const cps = (index + 1) / Math.max(elapsed, 0.001);
        f75log.debug(`Progresso: ${index + 1}/${stream.chunkCount} blocos · ${cps.toFixed(0)} blocos/s`);
        onProgress({
          sent: index + 1,
          total: stream.chunkCount,
          chunksPerSecond: cps,
          etaSeconds: (stream.chunkCount - index - 1) / Math.max(cps, 0.001),
        });
      }
    }
    onProgress({ sent: stream.chunkCount, total: stream.chunkCount, chunksPerSecond: stream.chunkCount / ((performance.now() - started) / 1000), etaSeconds: 0 });

    await this.commandExchange(cmd, wiredPacket(0x04, 0x02), "upload · commit");
    const seconds = (performance.now() - started) / 1000;
    f75log.ok(`Upload concluído no slot ${slot}: ${stream.chunkCount} blocos em ${seconds.toFixed(1)} s (${(stream.chunkCount / Math.max(seconds, 0.001)).toFixed(0)} blocos/s).`);
  }

  /* ------------------------------ factory reset ---------------------------- */

  async factoryReset(onStage: (stage: string) => void): Promise<void> {
    const device = this.require("wiredCommand");
    const exchange = async (packet: Uint8Array, label: string) => this.commandExchange(device, packet, label);
    const zero = new Uint8Array(AULA.commandLength);
    const zeroPages = async (count: number) => {
      for (let i = 0; i < count - 1; i++) {
        await this.sendFeature(device, zero, `zero page ${i + 1}/${count}`);
        await sleep(40);
      }
      await exchange(zero, `zero page final ${count}/${count}`);
    };

    onStage("Apagando memória de display");
    await exchange(wiredPacket(0x04, 0x19), "reset · clear display memory");
    const clearSlots = wiredPacket(0x04, 0x15);
    clearSlots[8] = 0x08;
    await exchange(clearSlots, "reset · clear slots");
    await zeroPages(8);
    await exchange(wiredPacket(0x04, 0x02), "reset · commit display");

    onStage("Resetando keymap e macros");
    await exchange(wiredPacket(0x04, 0x18), "reset · abrir sessão keymap");
    const keymap = wiredPacket(0x04, 0x11);
    keymap[8] = 0x09;
    await exchange(keymap, "reset · keymap header");
    await zeroPages(9);
    await exchange(wiredPacket(0x04, 0x02), "reset · commit keymap");
    await exchange(wiredPacket(0x04, 0xf0), "reset · finalizar keymap");

    onStage("Resetando lighting");
    await exchange(wiredPacket(0x04, 0x18), "reset · abrir sessão lighting");
    const lighting = wiredPacket(0x04, 0x27);
    lighting[8] = 0x09;
    await exchange(lighting, "reset · lighting header");
    await zeroPages(9);
    await exchange(wiredPacket(0x04, 0x02), "reset · commit lighting");
    await exchange(wiredPacket(0x04, 0xf0), "reset · finalizar lighting");

    onStage("Enviando footer de reset");
    await exchange(wiredPacket(0x04, 0x18), "reset · abrir sessão footer");
    const header = wiredPacket(0x04, 0x13);
    header[8] = 0x01;
    await exchange(header, "reset · footer header");
    const payload = wiredPacket(0x0b, 0xff);
    payload[8] = 0x01;
    payload[9] = 0x05;
    payload[10] = 0x03;
    payload[14] = 0xaa;
    payload[15] = 0x55;
    await exchange(payload, "reset · payload 0x0b");
    await exchange(wiredPacket(0x04, 0x02), "reset · commit footer");
    await exchange(wiredPacket(0x04, 0xf0), "reset · finalizar footer");

    onStage("Resetando config de display");
    await exchange(wiredPacket(0x04, 0x18), "reset · abrir sessão displaycfg");
    const displayReset = wiredPacket(0x04, 0x17);
    displayReset[2] = 0x01;
    displayReset[8] = 0x01;
    await exchange(displayReset, "reset · display config reset");
    const displayConfig = new Uint8Array(AULA.commandLength);
    displayConfig[0] = 0x00;
    displayConfig[1] = 0x01;
    displayConfig[6] = 0x02;
    displayConfig[8] = 0x02;
    await exchange(displayConfig, "reset · display config payload");
    await exchange(wiredPacket(0x04, 0x02), "reset · commit displaycfg");

    f75log.ok("✅ Factory reset completo — replugue o cabo pra religar a telinha limpa.");
  }

  /* --------------------------- receiver: bateria --------------------------- */

  async queryBattery(): Promise<number | null> {
    if (this.simMode) {
      f75log.cmd("TX output · battery query (sim)");
      await sleep(300);
      f75log.rx("🔋 Bateria via input report: 87% (sim)");
      this.onBattery?.(87);
      return 87;
    }
    const endpoint = this.require("dongle");
    if (endpoint.kind !== "real") return null; // modo simulação já tratado acima
    const device = endpoint.device;
    const maxOut = Math.max(
      ...reportBytes(device.collections.flatMap((c) => c.outputReports)).map((r) => r.bytes),
      32
    );
    const lengths = [64, 33, 32].filter((l) => l <= maxOut);
    f75log.info(`🔋 Consultando bateria (tamanhos candidatos: ${lengths.join(", ")} B; output máximo declarado: ${maxOut} B)…`);

    const waiter = new Promise<number | null>((resolve) => {
      this.batteryWaiters.push(resolve);
      setTimeout(() => {
        const i = this.batteryWaiters.indexOf(resolve);
        if (i >= 0) {
          this.batteryWaiters.splice(i, 1);
          resolve(null);
        }
      }, 250);
    });

    for (const length of lengths) {
      for (const withId of [false, true]) {
        await this.sendOutput(endpoint, batteryQueryPacket(withId, length), `battery query ${length}B id=${withId ? "sim" : "não"}`);
        const percent = await waiter;
        if (percent !== null) return percent;
      }
    }
    f75log.warn("Receiver não respondeu a query de bateria (teclado dormindo? aperte qualquer tecla e tente de novo).");
    return null;
  }

  /* ---------------------------- receiver: RGB ------------------------------ */

  async applyRGB(settings: RgbSettings): Promise<void> {
    const device = this.require("dongle");
    f75log.info(`🎨 Aplicando RGB: ${describeWireless(rgbLEDReport(settings)).replace("LED 0x05 · ", "")}`);
    await this.sendOutput(device, rgbCommitReport(), "RGB commit");
    await sleep(50);
    await this.sendOutput(device, rgbLEDReport(settings), "RGB LED");
    f75log.ok("RGB aplicado via receiver 2.4G.");
  }

  /* ------------------------ receiver: performance/jogo --------------------- */

  /**
   * Um único report 0x07 com response level + sleep + flags de jogo.
   * Diferente do nativo (que zera as flags no applyPerformance), aqui as flags
   * SEMPRE vão junto — impossível "perder" o estado do Alt+Tab sem querer.
   */
  async applyPerformance(options: PerformanceOptions): Promise<void> {
    const device = this.require("dongle");
    const report = gameModeReport(
      Math.min(Math.max(options.level, 1), 5),
      1,
      Math.min(Math.max(options.sleep, 0), 3),
      {
        game: options.game,
        lockAltTab: options.lockAltTab,
        lockAltF4: options.lockAltF4,
        lockWin: options.lockWin,
      }
    );
    f75log.info(
      `⚡ Aplicando: level ${options.level} · sleep ${options.sleep} · game=${options.game ? 1 : 0} altTab=${options.lockAltTab ? 1 : 0} altF4=${options.lockAltF4 ? 1 : 0} win=${options.lockWin ? 1 : 0}`
    );
    await this.sendOutput(device, report, "performance + game mode");
    f75log.ok("Performance e flags de jogo aplicadas via receiver 2.4G.");
  }
}
