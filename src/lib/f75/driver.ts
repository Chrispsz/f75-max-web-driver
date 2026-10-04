/**
 * F75 Driver — transporte WebHID do Aula F75 Max (v2 · descriptor-aware).
 *
 * A v1 falhava com NotAllowedError: "Failed to write the report" porque a
 * escrita chegava ao kernel e era rejeitada — a interface errada do receiver
 * era vinculada (a primeira que aparecia, que pode ser a de teclado) e os
 * report IDs não respeitavam o descritor real. Esta versão reproduz a
 * semântica EXATA do trio hidapi/hidraw + Chromium no Linux:
 *
 *  - Chromium SEMPRE prefixa o byte de report ID na wire:
 *      sendReport(id, payload)        → hidraw write([id] + payload)
 *      sendFeatureReport(id, payload) → HIDIOCSFEATURE([id] + payload)
 *  - O Chrome exige has_report_id(interface) === (id !== 0): interface COM
 *    report IDs numerados PRECISA de id ≠ 0; SEM IDs, PRECISA de id 0.
 *  - Kernel (hidraw_send_report): count < 2 → EINVAL; count > 4096
 *    (HID_MAX_BUFFER_SIZE) → EINVAL; no caminho interrupt OUT o conteúdo vai
 *    cru (sem validação de ID); no fallback SET_REPORT o ID é validado no
 *    descritor e o byte de ID é stripado.
 *  - Driver nativo (LinuxHIDBackend.swift):
 *      · receiver 2.4G → hid_write na interface 0xFF60 (raw 32B primeiro,
 *        fallback [0x00]+pacote), candidatos ordenados: 0xFF60 → maior output;
 *      · cabo → feature reports 64B no 0xFF13 (raw primeiro, fallback [0x00]+);
 *      · display → writes de 4096B no 0xFF68.
 *
 * A matriz de estratégias abaixo tenta as equivalentes na ordem que o
 * DESCRITOR real sugere, loga cada tentativa (F12 / painel) e cacheia a
 * vencedora. DETALHE CRÍTICO (v4): o firmware do receiver IGNORA rotas
 * erradas em silêncio — "aceito pelo SO" NÃO prova que o teclado processou
 * o pacote. Por isso a rota do receiver é validada por SONDA: um sweep de
 * rotas candidatas com a query de bateria, onde a RESPOSTA REAL do teclado
 * (input report 0x20 0x01 .. %) confirma a rota certa. A rota validada
 * fica cacheada e passa a ser usada por RGB, desempenho e bateria.
 *
 * Contabilidade real da wire no Linux (hidraw):
 *   sendReport(0, N)  → Chrome escreve [0x00]+N · kernel usbhid REMOVE o
 *   0x00 (usbhid_output_report/usbhid_set_raw_report) → N bytes na wire.
 *   Ou seja: sendReport(0, pacote32) = 32B na wire = hid_write nativo.
 *   NUNCA prefixe 0x00 manualmente — vira 33B na wire e o firmware descarta.
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
export type WireMode = "output" | "feature";

export interface DriverStatus {
  sim: boolean;
  wiredCommand: boolean;
  wiredDisplay: boolean;
  dongle: boolean;
}

/* ----------------------------- diagnóstico ------------------------------- */

export interface EndpointDiag {
  key: string;
  role: string;
  product: string;
  vid: string;
  pid: string;
  usagePages: string;
  hasNumberedIds: boolean;
  maxOutput: number;
  maxFeature: number;
  outputIds: string;
  featureIds: string;
  opened: boolean;
}

export interface TxAttemptDiag {
  target: string;
  mode: string;
  reportId: string;
  wire: string;
  result: string;
}

export interface DriverDiagnostics {
  sim: boolean;
  endpoints: EndpointDiag[];
  lastTx: { label: string; attempts: TxAttemptDiag[] } | null;
  dongleRoute: string | null;
}

/* ------------------------------ resumo HID ------------------------------- */

interface ReportSize {
  id: number;
  bytes: number;
}

interface DeviceSummary {
  usagePages: number[];
  hasNumberedIds: boolean;
  maxOutput: number;
  maxFeature: number;
  outputIds: ReportSize[];
  featureIds: ReportSize[];
}

function reportBytes(infos: HIDReportInfo[]): ReportSize[] {
  return infos.map((info) => ({
    id: info.reportId,
    bytes: Math.ceil(info.items.reduce((acc, item) => acc + (item.reportCount ?? 1) * (item.reportSize ?? 0), 0) / 8),
  }));
}

function walkCollections(
  c: HIDCollectionInfo,
  acc: { all: HIDReportInfo[]; out: HIDReportInfo[]; feat: HIDReportInfo[]; pages: Set<number> }
): void {
  acc.pages.add(c.usagePage);
  acc.all.push(...c.inputReports, ...c.outputReports, ...c.featureReports);
  acc.out.push(...c.outputReports);
  acc.feat.push(...c.featureReports);
  for (const child of c.children ?? []) walkCollections(child, acc);
}

function summarizeDevice(device: HIDDevice): DeviceSummary {
  const acc = { all: [] as HIDReportInfo[], out: [] as HIDReportInfo[], feat: [] as HIDReportInfo[], pages: new Set<number>() };
  for (const c of device.collections) walkCollections(c, acc);
  const outputIds = reportBytes(acc.out);
  const featureIds = reportBytes(acc.feat);
  return {
    usagePages: [...acc.pages],
    hasNumberedIds: acc.all.some((r) => r.reportId !== 0),
    maxOutput: outputIds.reduce((m, r) => Math.max(m, r.bytes), 0),
    maxFeature: featureIds.reduce((m, r) => Math.max(m, r.bytes), 0),
    outputIds,
    featureIds,
  };
}

function fmtSizes(list: ReportSize[]): string {
  return list.length ? list.map((r) => `0x${hex2(r.id)}:${r.bytes}B`).join(",") : "—";
}

const padTo = (src: Uint8Array, size: number): Uint8Array => {
  if (src.length >= size) return src;
  const out = new Uint8Array(size);
  out.set(src);
  return out;
};

/* -------------------------------- tipos TX -------------------------------- */

interface TxSpec {
  mode: WireMode;
  reportId: number;
  payloadLen: number;
  padded: boolean;
  note: string;
}

type TxAttemptLog = TxAttemptDiag;

/** Rota de TX do receiver validada por RESPOSTA real do teclado (probe). */
interface DongleRoute {
  endpointKey: string;
  label: string; // ex.: "0xff60 · output 32B"
  mode: WireMode;
  pad: number; // 0 = payload cru; N = padTo(payload, N)
}

interface Endpoint {
  kind: "real";
  key: string;
  device: HIDDevice;
  summary: DeviceSummary;
  role: EndpointRole;
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class F75Driver {
  private wiredCommand?: Endpoint;
  private wiredDisplay?: Endpoint;
  private dongleInterfaces: Endpoint[] = []; // TODAS as interfaces do receiver (0xFF60 primeiro)
  private dongle?: Endpoint;
  private bound = new WeakSet<HIDDevice>();
  private keySeq = 0;
  private simMode = false;
  private statusListeners = new Set<(s: DriverStatus) => void>();
  private batteryWaiters: ((percent: number | null) => void)[] = [];
  private displayAckCounter = 0;
  private hidListenersAttached = false;
  private wireCache = new Map<string, { endpointKey: string; spec: TxSpec }>();
  private lastTx: { label: string; attempts: TxAttemptLog[] } | null = null;
  private dongleRoute: DongleRoute | null = null;
  private probing = false;

  onStatus: ((s: DriverStatus) => void) | null = null;
  onBattery: ((percent: number | null) => void) | null = null;

  /* -------------------------------- status -------------------------------- */

  get status(): DriverStatus {
    if (this.simMode) return { sim: true, wiredCommand: true, wiredDisplay: true, dongle: true };
    return {
      sim: false,
      wiredCommand: !!this.wiredCommand,
      wiredDisplay: !!this.wiredDisplay,
      dongle: this.dongleInterfaces.length > 0,
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
      if (this.bound.has(d)) {
        f75log.warn(`⚠ O dispositivo ${d.productName || "HID"} foi desconectado do sistema. Reconecte e clique em Reconectar.`);
        this.clearRealEndpoints();
        this.notify();
      }
    });
  }

  private clearRealEndpoints(): void {
    this.wiredCommand = undefined;
    this.wiredDisplay = undefined;
    this.dongleInterfaces = [];
    this.dongle = undefined;
    this.wireCache.clear();
    this.dongleRoute = null;
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
    f75log.info(`Seletor retornou ${devices.length} interface(s) — vinculando as do F75 Max.`);
    await this.bindDevices(devices);
    if (!this.wiredCommand && !this.wiredDisplay && this.dongleInterfaces.length === 0) {
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

  private async openDevice(device: HIDDevice): Promise<boolean> {
    if (this.bound.has(device)) return false;
    try {
      if (!device.opened) await device.open();
    } catch (err) {
      f75log.err(`Falha ao abrir ${device.productName || "HID"}: ${String(err)} — confira a regra udev (sudo cp packaging/linux/60-aula-f75-max.rules /etc/udev/rules.d/ && sudo udevadm control --reload && replug).`);
      return false;
    }
    this.bound.add(device);
    return true;
  }

  private makeEndpoint(device: HIDDevice, role: EndpointRole): Endpoint {
    const summary = summarizeDevice(device);
    const ep: Endpoint = { kind: "real", key: `ep${this.keySeq++}`, device, summary, role };
    const pages = summary.usagePages.map((p) => `0x${p.toString(16)}`).join("/");
    f75log.debug(
      `Interface ${role} aberta: ${device.productName || "HID"} · pages ${pages} · reportIds ${summary.hasNumberedIds ? "NUMERADOS" : "ausentes"} · out ${fmtSizes(summary.outputIds)} · feat ${fmtSizes(summary.featureIds)}`
    );
    return ep;
  }

  private async bindDevices(devices: HIDDevice[]): Promise<void> {
    const dongleCandidates: HIDDevice[] = [];

    for (const device of devices) {
      const isWired = device.vendorId === AULA.wiredVendorId && device.productId === AULA.wiredProductId;
      const isDongle = device.vendorId === AULA.dongleVendorId && device.productId === AULA.dongleProductId;
      if ((!isWired && !isDongle) || this.bound.has(device)) continue;

      if (isDongle) {
        dongleCandidates.push(device);
        continue;
      }

      const role: EndpointRole | null = device.collections.some((c) => c.usagePage === AULA.wiredCommandPage)
        ? "wiredCommand"
        : device.collections.some((c) => c.usagePage === AULA.wiredRawPage)
          ? "wiredDisplay"
          : null;
      if (!role) {
        f75log.debug(`Interface do cabo ignorada (sem usage page 0xFF13/0xFF68): ${device.productName || "HID"}`);
        continue;
      }
      if (this[role]) continue; // já vinculada
      if (!(await this.openDevice(device))) continue;
      const ep = this.makeEndpoint(device, role);
      this[role] = ep;
      ep.device.addEventListener("inputreport", (ev) =>
        this.handleInput(role, ev.reportId, new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength))
      );
      f75log.ok(`✔ ${role === "wiredCommand" ? "Cabo · comando 0xFF13" : "Cabo · display 0xFF68"} vinculado — ${device.productName || "HID"}`);
    }

    /* Receiver 2.4G: o nativo (openDongleRaw) varre TODAS as interfaces do
     * 05AC:024F e ordena: usagePage 0xFF60 primeiro, depois maior output.
     * A v1 pegava a primeira interface que aparecia — que pode ser a de
     * teclado do receiver, sem output de 32B → NotAllowedError. */
    for (const device of dongleCandidates) {
      if (!(await this.openDevice(device))) continue;
      const ep = this.makeEndpoint(device, "dongle");
      this.dongleInterfaces.push(ep);
      // Interfaces vendor (0xFF59/0xFF60) podem trazer ACKs/respostas como
      // input report SEM report ID (id=0x00) — não filtrar como ruído.
      const vendor = ep.summary.usagePages.includes(AULA.dongleCommandPage) || ep.summary.usagePages.includes(AULA.dongleRawPage);
      ep.device.addEventListener("inputreport", (ev) =>
        this.handleInput("dongle", ev.reportId, new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength), vendor)
      );
    }
    if (this.dongleInterfaces.length > 0) {
      this.dongleInterfaces.sort((a, b) => {
        const aRaw = a.summary.usagePages.includes(AULA.dongleRawPage) ? 0 : 1;
        const bRaw = b.summary.usagePages.includes(AULA.dongleRawPage) ? 0 : 1;
        if (aRaw !== bRaw) return aRaw - bRaw;
        return b.summary.maxOutput - a.summary.maxOutput;
      });
      this.dongle = this.dongleInterfaces[0];
      f75log.ok(
        `✔ Receiver 2.4G vinculado em ${this.dongleInterfaces.length} interface(s) — canal preferido: ${this.dongle.summary.usagePages.map((p) => `0x${p.toString(16)}`).join("/")} (output ${this.dongle.summary.maxOutput}B).`
      );
      if (!this.dongle.summary.usagePages.includes(AULA.dongleRawPage)) {
        f75log.warn("Nenhuma interface do receiver expôs a usage page 0xFF60 — usando a de maior output. Se RGB falhar, reconecte com o cabo e refaça o pareamento (Fn+R).");
      }
      void this.calibrateDongle();
    }
  }

  async disconnect(): Promise<void> {
    if (this.simMode) {
      this.simMode = false;
      f75log.info("🧪 Simulação encerrada.");
      this.clearRealEndpoints();
      this.notify();
      return;
    }
    const all = [this.wiredCommand, this.wiredDisplay, ...this.dongleInterfaces];
    for (const ep of all) {
      if (ep?.kind === "real") {
        try {
          await ep.device.close();
        } catch {
          /* ignore */
        }
        this.bound.delete(ep.device);
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
    this.wiredCommand = undefined;
    this.wiredDisplay = undefined;
    this.dongleInterfaces = [];
    this.dongle = undefined;
    f75log.warn("🧪 MODO SIMULAÇÃO ativo — nenhum hardware é acessado. Pacotes são montados de verdade, mas 'enviados' pro nada. Tudo que a UI fizer aparece aqui igual.");
    this.notify();
    return this.status;
  }

  get isSim(): boolean {
    return this.simMode;
  }

  /* ------------------------------ input reports ---------------------------- */

  private handleInput(role: EndpointRole, reportId: number, data: Uint8Array, vendor = false): void {
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
      // Interfaces vendor do receiver: qualquer input que não é bateria é
      // evidência (ACK/status do firmware) — loga sempre, até com id 0x00.
      if (vendor) {
        f75log.rx(
          `RX receiver (id=0x${hex2(reportId)}, ${data.length}B): ${Array.from(data.subarray(0, Math.min(data.length, 16)), (b) => hex2(b)).join(" ")}${data.length > 16 ? " …" : ""}`
        );
        return;
      }
      // teclado/mouse padrão do receiver — ruído de digitação, não loga
      if (reportId === 0x00 || reportId === 0x01 || reportId === 0x02) return;
      f75log.debug(`Input do receiver (id=0x${hex2(reportId)}): ${Array.from(data.subarray(0, 16), (b) => hex2(b)).join(" ")}`);
      return;
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

  private waitForInput(ep: Endpoint | undefined, timeoutMs: number): Promise<Uint8Array | null> {
    if (!ep) return Promise.resolve(null);
    if (this.simMode) {
      return sleep(Math.min(timeoutMs, 25)).then(() => new Uint8Array([0x01]));
    }
    if (ep.kind !== "real") return Promise.resolve(null);
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

  /**
   * Constrói a matriz de tentativas para um pacote, na ordem sugerida pelo
   * descritor REAL da interface (equivalentes exatas das duas rotas do
   * nativo: raw direto e [0x00]-prefixado).
   */
  private buildAttempts(s: DeviceSummary, packet: Uint8Array, modes: WireMode[]): TxSpec[] {
    const attempts: TxSpec[] = [];
    const numbered = s.hasNumberedIds;

    for (const mode of modes) {
      const max = mode === "output" ? s.maxOutput : s.maxFeature;
      const declared = mode === "output" ? s.outputIds : s.featureIds;
      if (max <= 0) {
        attempts.push({
          mode,
          reportId: -1,
          payloadLen: 0,
          padded: false,
          note: `PULADO — interface não declara ${mode === "output" ? "output" : "feature"} reports (o Chrome rejeita na hora)`,
        });
        continue;
      }
      const wire = (payloadLen: number) => payloadLen + 1;
      if (numbered) {
        const id = packet[0];
        if (id !== 0) {
          const payloadLen = packet.length - 1;
          if (payloadLen <= max) {
            attempts.push({
              mode,
              reportId: id,
              payloadLen,
              padded: false,
              note: `id=0x${hex2(id)} + ${payloadLen}B payload → ${wire(payloadLen)}B na wire (device numerado — rota "raw" do nativo)`,
            });
          }
          const decl = declared.find((r) => r.id === id);
          if (decl && decl.bytes - 1 > payloadLen && decl.bytes - 1 <= max) {
            attempts.push({
              mode,
              reportId: id,
              payloadLen: decl.bytes - 1,
              padded: true,
              note: `id=0x${hex2(id)} + payload padded a ${decl.bytes - 1}B (report 0x${hex2(id)} declara ${decl.bytes}B)`,
            });
          }
        }
      } else {
        if (packet.length <= max) {
          attempts.push({
            mode,
            reportId: 0,
            payloadLen: packet.length,
            padded: false,
            note: `id=0 + pacote ${packet.length}B → wire real ${packet.length}B (Chrome injeta id 0x00 e o kernel hidraw remove — interrupt OUT cru, igual ao hid_write nativo)`,
          });
        }
        if (max > packet.length && max <= 4095) {
          attempts.push({
            mode,
            reportId: 0,
            payloadLen: max,
            padded: true,
            note: `id=0 + pacote padded a ${max}B (maior ${mode} declarado)`,
          });
        }
      }
    }

    if (attempts.every((a) => a.reportId === -1)) {
      // Último recurso cruzado — gera evidência no log mesmo sabendo que o
      // Chrome deve rejeitar (divergência has_report_id).
      const mode: WireMode = s.maxOutput > 0 ? "output" : "feature";
      const max = mode === "output" ? s.maxOutput : s.maxFeature;
      if (max > 0) {
        if (numbered && packet[0] !== 0) {
          attempts.push({ mode, reportId: packet[0], payloadLen: packet.length - 1, padded: false, note: "cruzado: id=primeiro byte" });
        } else {
          attempts.push({ mode, reportId: 0, payloadLen: packet.length, padded: false, note: "cruzado: id=0 (esperado falhar — evidência)" });
        }
      }
    }
    return attempts;
  }

  private candidatesFor(role: EndpointRole): Endpoint[] {
    if (this.simMode) return [];
    if (role === "dongle") return this.dongleInterfaces;
    const ep = role === "wiredCommand" ? this.wiredCommand : this.wiredDisplay;
    return ep ? [ep] : [];
  }

  private requireMessage(role: EndpointRole): string {
    return role === "dongle"
      ? "Conecte o receiver 2.4G (dongle 05AC:024F) — RGB, bateria e desempenho só funcionam por ele. Plugue o dongle e clique em Conectar, selecionando TODAS as entradas 'Aula F75 Max 2.4G'."
      : role === "wiredCommand"
        ? "Conecte o teclado via CABO USB-C (canal de comando 0xFF13) e selecione todas as entradas 'Aula F75 Max' no seletor."
        : "Conecte o teclado via CABO USB-C (canal de display 0xFF68) e selecione todas as entradas 'Aula F75 Max' no seletor.";
  }

  private async emit(
    ep: Endpoint,
    spec: TxSpec,
    packet: Uint8Array,
    label: string,
    logs: TxAttemptLog[],
    dump: boolean
  ): Promise<boolean> {
    const target = `${ep.role}·${ep.summary.usagePages.map((p) => `0x${p.toString(16)}`).join("/")}`;
    if (spec.reportId === -1) {
      logs.push({ target, mode: spec.mode, reportId: "—", wire: "—", result: spec.note });
      f75log.debug(`TX ${spec.mode} · ${label} · ${spec.note}`);
      return false;
    }
    const payload = spec.reportId === 0
      ? spec.padded
        ? padTo(packet, spec.payloadLen)
        : packet
      : spec.padded
        ? padTo(packet.subarray(1), spec.payloadLen)
        : packet.subarray(1);
    const wire = payload.length + 1;
    const idTxt = `0x${hex2(spec.reportId)}`;
    logs.push({
      target,
      mode: spec.mode,
      reportId: idTxt,
      wire: `${payload.length}B+id`,
      result: "…",
    });
    f75log.cmd(`TX ${spec.mode} id=${idTxt} · ${label} · ${payload.length}B payload / ${wire}B na wire · ${spec.note}`);
    if (dump) f75log.dump(payload, `TX ${spec.mode} id=${idTxt} · ${label}`);
    else f75log.debug(`TX ${spec.mode} id=${idTxt} · ${label} · primeiros bytes: ${Array.from(payload.subarray(0, 12), (b) => hex2(b)).join(" ")}`);
    try {
      if (spec.mode === "output") {
        await ep.device.sendReport(spec.reportId, payload);
      } else {
        await ep.device.sendFeatureReport(spec.reportId, payload);
      }
      logs[logs.length - 1].result = "✔ ok";
      f75log.debug(`✔ ${spec.mode} id=${idTxt} aceito pelo SO · ${label}`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      logs[logs.length - 1].result = `✗ ${msg}`;
      f75log.warn(`${spec.mode} id=${idTxt} falhou · ${label} · ${msg}`);
      return false;
    }
  }

  /** Chave de cache da wire: mesmo endpoint + modo + id + tamanho de payload. */
  private specKey(epKey: string, spec: TxSpec): string {
    return `${epKey}|${spec.mode}|${spec.reportId}|${spec.padded ? "p" : "r"}|${spec.payloadLen}`;
  }

  /** Spec vencedora de outro comando serve para este pacote? (mesma forma de wire) */
  private reusable(ep: Endpoint, packet: Uint8Array, spec: TxSpec): boolean {
    if (spec.reportId < 0) return false;
    if (spec.reportId === 0 && ep.summary.hasNumberedIds) return false;
    if (spec.reportId !== 0 && spec.reportId !== packet[0]) return false;
    const base = spec.reportId !== 0 ? packet.length - 1 : packet.length;
    return spec.padded ? spec.payloadLen >= base : spec.payloadLen === base;
  }

  /** Candidatos capazes de carregar este pacote — evita gastar tentativas na
   *  interface de teclado/mouse do receiver, que não tem output de 32 B. */
  private capableCandidates(role: EndpointRole, packet: Uint8Array, modes: WireMode[]): Endpoint[] {
    const all = this.candidatesFor(role);
    const capable = all.filter((ep) => {
      const need = ep.summary.hasNumberedIds ? packet.length - 1 : packet.length;
      return (
        (modes.includes("output") && ep.summary.maxOutput >= need) ||
        (modes.includes("feature") && ep.summary.maxFeature >= need)
      );
    });
    return capable.length > 0 ? capable : all;
  }

  /**
   * Envia um pacote pela matriz de estratégias. Primeiro tenta as specs
   * vencedoras de comandos anteriores com a mesma forma de wire (cache
   * global), depois varre candidatos × modos. Primeiro sucesso vence; tudo
   * falhou → F75Error com resumo completo das tentativas.
   */
  private async tx(
    packet: Uint8Array,
    label: string,
    role: EndpointRole,
    modes: WireMode[] = ["output", "feature"],
    dump = true
  ): Promise<void> {
    if (this.simMode) {
      f75log.cmd(`TX (sim) · ${label} · ${role === "dongle" ? describeWireless(packet) : describeWired(packet)}`);
      if (dump) f75log.dump(packet, `TX sim · ${label}`);
      this.lastTx = {
        label,
        attempts: [{ target: "sim", mode: "sim", reportId: "—", wire: `${packet.length}B`, result: "✔ ok (sim)" }],
      };
      return;
    }

    // Fast path do receiver: rota já validada por RESPOSTA do teclado (probe).
    // "Aceito pelo SO" não prova processamento — só a sonda prova. Se a rota
    // calibrada deixar de ser aceita pelo SO, limpa e cai na varredura abaixo.
    if (role === "dongle" && this.dongleRoute) {
      const r = this.dongleRoute;
      const ep = this.dongleInterfaces.find((e) => e.key === r.endpointKey);
      if (ep) {
        const logs: TxAttemptLog[] = [];
        const ok = await this.sendRoute(
          { ep, mode: r.mode, pad: r.pad, label: r.label, note: "rota calibrada por resposta" },
          packet,
          label,
          dump,
          logs
        );
        this.lastTx = { label, attempts: logs };
        if (ok) return;
        f75log.warn("Rota calibrada deixou de ser aceita pelo SO — re-sondando com a matriz completa…");
      }
      this.dongleRoute = null;
    }

    const candidates = this.capableCandidates(role, packet, modes);
    if (candidates.length === 0) throw new F75Error(this.requireMessage(role));

    const logs: TxAttemptLog[] = [];

    for (const [key, entry] of this.wireCache) {
      const ep = candidates.find((c) => c.key === entry.endpointKey);
      if (!ep || !this.reusable(ep, packet, entry.spec)) continue;
      if (await this.emit(ep, entry.spec, packet, label, logs, dump)) {
        this.lastTx = { label, attempts: logs };
        return;
      }
      this.wireCache.delete(key);
      f75log.warn("Spec em cache deixou de funcionar — revarrendo matriz completa…");
    }

    for (const ep of candidates) {
      for (const spec of this.buildAttempts(ep.summary, packet, modes)) {
        const ok = await this.emit(ep, spec, packet, label, logs, dump);
        if (ok) {
          this.wireCache.set(this.specKey(ep.key, spec), { endpointKey: ep.key, spec });
          this.lastTx = { label, attempts: logs };
          return;
        }
      }
    }

    this.lastTx = { label, attempts: logs };
    const summary = logs
      .filter((l) => l.result !== "…" && !l.result.startsWith("✔"))
      .map((l) => `${l.target}/${l.mode}/id=${l.reportId}: ${l.result}`)
      .join(" · ");
    throw new F75Error(`TX falhou em ${logs.length} tentativa(s) — ${label}. ${this.requireMessage(role)} Detalhe: ${summary || "nenhuma estratégia aplicável ao descritor"}`);
  }

  /** SET feature + GET feature de ACK — mesma tolerância do commandExchange nativo.
   *  Retorna o ACK lido (DataView) quando disponível — o byte [3] é o status
   *  do firmware (0x01 = ok, visível nos logs: `04 02 00 01`, `04 72 02 01`…). */
  private async commandExchange(packet: Uint8Array, label: string): Promise<DataView | null> {
    await this.tx(packet, label, "wiredCommand", ["feature", "output"]);
    return this.readFeatureAck(label);
  }

  private async readFeatureAck(label: string): Promise<DataView | null> {
    if (this.simMode) return null;
    const ep = this.wiredCommand;
    if (!ep) return null;
    const declared = ep.summary.featureIds.map((r) => r.id);
    const ids = [...new Set([0, ...declared, 0x04])];
    for (const id of ids) {
      try {
        const view = await ep.device.receiveFeatureReport(id);
        f75log.rx(`GET feature id=0x${hex2(id)} · ${label} · ${view.byteLength}B`);
        f75log.dump(view, `GET feature · ${label}`);
        return view;
      } catch {
        /* tenta próximo id */
      }
    }
    f75log.debug(`GET feature indisponível (${label}) — seguindo sem ACK (o conteúdo não é validado nem pelo nativo).`);
    return null;
  }

  /** ACK de comando do cabo: byte [3] do GET feature = 0x01 quando o firmware aceita. */
  private static ackOk(ack: DataView | null): boolean {
    if (!ack || ack.byteLength < 4) return false;
    return new Uint8Array(ack.buffer, ack.byteOffset, ack.byteLength)[3] === 0x01;
  }

  /* ------------------------------- papel/moeda ------------------------------ */

  async syncClock(date: Date = new Date()): Promise<void> {
    f75log.info(`⏰ Sincronizando relógio da telinha: ${date.toLocaleString("pt-BR")}`);
    await this.commandExchange(wiredPacket(0x04, 0x18), "relógio · abrir sessão");
    const prepare = wiredPacket(0x04, 0x28);
    prepare[8] = 0x01;
    await this.commandExchange(prepare, "relógio · prepare");
    await this.commandExchange(timePayload(date), "relógio · payload de tempo");
    await this.commandExchange(wiredPacket(0x04, 0x02), "relógio · commit");
    f75log.ok(`Relógio da telinha sincronizado (${date.toLocaleTimeString("pt-BR")}).`);
  }

  /* --------------------------------- display -------------------------------- */

  /**
   * Bloco de 4 KB do display. O nativo faz hid_write(4096) cru — o kernel
   * aceita (≤ HID_MAX_BUFFER_SIZE) porque interrupt OUT não valida ID. O
   * WebHID SEMPRE injeta o byte de ID, então:
   *  - interface numerada  → sendReport(chunk[0], chunk[1..]) recria a wire
   *    nativa 4096B byte a byte;
   *  - interface sem IDs   → sendReport(0, pedaço) com pedaços ≤ min(maxOut,
   *    4095); a wire ganha um 0x00 por write (o firmware aceita framing
   *    prefixed — o nativo usa esse caminho como fallback).
   */
  private async writeDisplayChunk(ep: Endpoint | undefined, chunk: Uint8Array, index: number, total: number): Promise<void> {
    if (this.simMode) {
      if (index === 1 || index % 64 === 0) f75log.cmd(`TX (sim) · bloco display ${index}/${total} · ${chunk.length}B`);
      return;
    }
    if (!ep) throw new F75Error(this.requireMessage("wiredDisplay"));
    const s = ep.summary;
    if (s.maxOutput <= 0 && s.maxFeature <= 0) {
      throw new F75Error("Interface de display não declara output/feature reports — impossível enviar blocos.");
    }
    if (s.hasNumberedIds && s.maxOutput >= chunk.length - 1) {
      // wire nativa idêntica: [chunk[0]] + chunk[1..4095] = 4096B
      await ep.device.sendReport(chunk[0], chunk.subarray(1));
      if (index === 1) f75log.ok("Estratégia de display: monolítica numerada (wire idêntica ao nativo: [chunk[0]]+4095B).");
      return;
    }
    const piece = Math.min(s.maxOutput > 0 ? s.maxOutput : s.maxFeature, 4095);
    if (piece < 2) throw new F75Error(`Interface de display declara reports muito pequenos (${piece}B).`);
    if (index === 1) {
      f75log.info(
        `Estratégia de display: stream em pedaços de ${piece}B com id=0 (interface sem report IDs; wire = [0x00]+pedaço — kernel limita a 4096B).`
      );
    }
    const useFeature = s.maxOutput <= 0;
    for (let off = 0; off < chunk.length; off += piece) {
      const slice = chunk.subarray(off, Math.min(off + piece, chunk.length));
      if (useFeature) await ep.device.sendFeatureReport(0, slice);
      else await ep.device.sendReport(0, slice);
    }
  }

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
    if (!this.simMode) {
      if (!this.wiredCommand) throw new F75Error(this.requireMessage("wiredCommand"));
      if (!this.wiredDisplay) throw new F75Error(this.requireMessage("wiredDisplay"));
    }

    const raw = this.simMode ? undefined : this.wiredDisplay!;
    const started = performance.now();
    this.displayAckCounter = 0;

    f75log.info(`📤 Upload slot ${slot}: ${stream.frameCount} frames · ${stream.chunkCount} blocos · ${(stream.data.length / 1024).toFixed(0)} KB · ${stream.avgFps.toFixed(1)} fps médios`);
    await this.commandExchange(wiredPacket(0x04, 0x18), "upload · abrir sessão");

    const metadata = wiredPacket(0x04, 0x72);
    metadata[2] = slot;
    metadata[8] = stream.chunkCount & 0xff;
    metadata[9] = (stream.chunkCount >> 8) & 0xff;
    await this.commandExchange(metadata, "upload · metadados");
    const firstAck = await this.waitForInput(raw, 150);
    if (!firstAck) f75log.warn("Sem ACK após metadados (150 ms) — o nativo segue mesmo assim.");

    let lastLog = 0;
    for (let index = 0; index < stream.chunkCount; index++) {
      if (token?.cancelled) throw new F75Error("Upload cancelado pelo usuário.");
      const chunk = stream.data.subarray(index * AULA.chunkLength, (index + 1) * AULA.chunkLength);
      try {
        await this.writeDisplayChunk(raw, chunk, index + 1, stream.chunkCount);
      } catch (err) {
        throw new F75Error(`Bloco ${index + 1}/${stream.chunkCount} falhou: ${err instanceof Error ? err.message : String(err)}`);
      }
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

    await this.commandExchange(wiredPacket(0x04, 0x02), "upload · commit");
    const seconds = (performance.now() - started) / 1000;
    f75log.ok(`Upload concluído no slot ${slot}: ${stream.chunkCount} blocos em ${seconds.toFixed(1)} s (${(stream.chunkCount / Math.max(seconds, 0.001)).toFixed(0)} blocos/s).`);
  }

  /* ------------------------- display: slots e memória ----------------------- */

  /** Páginas zeradas de 64 B — mesmo ritmo do nativo (40 ms entre writes). */
  private async zeroPages(count: number): Promise<void> {
    const zero = new Uint8Array(AULA.commandLength);
    for (let i = 0; i < count - 1; i++) {
      await this.tx(zero, `zero page ${i + 1}/${count}`, "wiredCommand", ["feature", "output"], false);
      await sleep(40);
    }
    await this.commandExchange(zero, `zero page final ${count}/${count}`);
  }

  /**
   * Troca o slot exibido pela telinha SEM reenviar conteúdo.
   *
   * O driver nativo não tem comando dedicado de "ativar slot" — ele só
   * escreve num slot via metadados 0x04 0x72 + commit 0x04 0x02, e a telinha
   * passa a mostrar o último slot escrito. Esta função reproduz esse caminho
   * no modo mínimo: abrir sessão → metadados apontando pro slot com 0 blocos
   * de payload → commit. O ACK do firmware (byte [3] do GET feature = 0x01)
   * confirma se o comando foi aceito.
   *
   * Se a telinha não mudar em ~2 s, o firmware da sua unidade só troca de
   * slot no upload — aí o caminho garantido é reenviar a imagem pro slot.
   */
  async activateDisplaySlot(slot: number): Promise<void> {
    if (!Number.isInteger(slot) || slot < 1 || slot > 255) {
      throw new F75Error("Slot precisa ser um número entre 1 e 255.");
    }
    if (!this.simMode && !this.wiredCommand) throw new F75Error(this.requireMessage("wiredCommand"));

    f75log.info(`📺 Ativando slot ${slot} da telinha (sem reenviar conteúdo)…`);
    await this.commandExchange(wiredPacket(0x04, 0x18), `slot ${slot} · abrir sessão`);
    const metadata = wiredPacket(0x04, 0x72);
    metadata[2] = slot;
    // [8..9] = 0 blocos — a sessão aponta pro slot sem payload de dados
    const metaAck = await this.commandExchange(metadata, `slot ${slot} · metadados (0 blocos)`);
    const commitAck = await this.commandExchange(wiredPacket(0x04, 0x02), `slot ${slot} · commit`);

    if (F75Driver.ackOk(commitAck) || F75Driver.ackOk(metaAck)) {
      f75log.ok(
        `✔ Firmware aceitou a ativação do slot ${slot} (ACK 0x01). A telinha deve trocar em até ~2 s — se continuar no outro conteúdo, seu firmware só troca de slot no upload: reenvie a imagem pro slot ${slot}.`
      );
    } else {
      f75log.warn(
        `Comando aceito pelo SO, mas sem ACK de sucesso do firmware — a telinha provavelmente NÃO mudou. Caminho garantido: reenvie a imagem pro slot ${slot} (o upload ativa o slot automaticamente no commit).`
      );
    }
  }

  /**
   * Apaga TODA a memória de display (todos os slots) — exatamente o bloco de
   * limpeza do factoryReset nativo, isolado pra poder remover GIFs sem
   * resetar keymap/lighting. Requer cabo USB-C.
   */
  async eraseDisplayMemory(onStage: (stage: string) => void): Promise<void> {
    if (!this.simMode && (!this.wiredCommand || !this.wiredDisplay)) {
      throw new F75Error(this.requireMessage("wiredCommand"));
    }
    onStage("Apagando memória de display (todos os slots)");
    await this.commandExchange(wiredPacket(0x04, 0x19), "display · clear memory");
    const clearSlots = wiredPacket(0x04, 0x15);
    clearSlots[8] = 0x08;
    await this.commandExchange(clearSlots, "display · clear slots");
    await this.zeroPages(8);
    await this.commandExchange(wiredPacket(0x04, 0x02), "display · commit");
    f75log.ok("✅ Memória de display apagada — replugue o cabo pra telinha reassumir.");
  }

  /* ------------------------------ factory reset ----------------------------- */

  async factoryReset(onStage: (stage: string) => void): Promise<void> {
    const exchange = async (packet: Uint8Array, label: string) => this.commandExchange(packet, label);

    onStage("Apagando memória de display");
    await exchange(wiredPacket(0x04, 0x19), "reset · clear display memory");
    const clearSlots = wiredPacket(0x04, 0x15);
    clearSlots[8] = 0x08;
    await exchange(clearSlots, "reset · clear slots");
    await this.zeroPages(8);
    await exchange(wiredPacket(0x04, 0x02), "reset · commit display");

    onStage("Resetando keymap e macros");
    await exchange(wiredPacket(0x04, 0x18), "reset · abrir sessão keymap");
    const keymap = wiredPacket(0x04, 0x11);
    keymap[8] = 0x09;
    await exchange(keymap, "reset · keymap header");
    await this.zeroPages(9);
    await exchange(wiredPacket(0x04, 0x02), "reset · commit keymap");
    await exchange(wiredPacket(0x04, 0xf0), "reset · finalizar keymap");

    onStage("Resetando lighting");
    await exchange(wiredPacket(0x04, 0x18), "reset · abrir sessão lighting");
    const lighting = wiredPacket(0x04, 0x27);
    lighting[8] = 0x09;
    await exchange(lighting, "reset · lighting header");
    await this.zeroPages(9);
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

  /* ------------------ receiver: rotas, sonda e bateria --------------------- */

  /**
   * Rotas candidatas do receiver, em ordem de prioridade. A 1ª equivale ao
   * hid_write cru do nativo na 0xFF60; as demais cobrem a interface de
   * comando 0xFF59 (com padding ao tamanho nativo de 64 B) e o caminho de
   * controle SET_REPORT (feature). O firmware ignora rotas erradas em
   * silêncio — só a SONDA (resposta real de bateria) escolhe a certa.
   */
  private routeCandidates(): { ep: Endpoint; mode: WireMode; pad: number; label: string; note: string }[] {
    const rank = (ep: Endpoint) =>
      ep.summary.usagePages.includes(0xff60) ? 0 : ep.summary.usagePages.includes(0xff59) ? 1 : 2;
    const ifaces = [...this.dongleInterfaces].sort((a, b) => rank(a) - rank(b));
    const routes: { ep: Endpoint; mode: WireMode; pad: number; label: string; note: string }[] = [];
    for (const ep of ifaces) {
      if (ep.summary.hasNumberedIds) continue;
      const page = ep.summary.usagePages.includes(0xff60)
        ? "0xff60"
        : ep.summary.usagePages.includes(0xff59)
          ? "0xff59"
          : `pg:${ep.summary.usagePages.map((p) => `0x${p.toString(16)}`).join("/")}`;
      if (ep.summary.maxOutput >= 32) {
        routes.push({ ep, mode: "output", pad: 0, label: `${page} · output ${ep.summary.maxOutput}B`, note: "output cru — equivalente exato ao hid_write do nativo" });
      }
      if (ep.summary.maxOutput >= 64) {
        routes.push({ ep, mode: "output", pad: 64, label: `${page} · output padded 64B`, note: "output com padding ao tamanho nativo da interface de comando" });
      }
      if (ep.summary.maxFeature >= 32) {
        routes.push({ ep, mode: "feature", pad: 0, label: `${page} · feature ${ep.summary.maxFeature}B`, note: "SET_REPORT via endpoint de controle" });
      }
    }
    return routes;
  }

  /**
   * Envia por uma rota concreta com contabilidade REAL da wire: no Linux,
   * sendReport(0, N) vira write([0x00]+N) no hidraw e o kernel usbhid REMOVE
   * o 0x00 → N bytes chegam ao device. Nunca prefixar 0x00 manualmente.
   */
  private async sendRoute(
    r: { ep: Endpoint; mode: WireMode; pad: number; label: string; note: string },
    packet: Uint8Array,
    label: string,
    dump: boolean,
    logs: TxAttemptLog[]
  ): Promise<boolean> {
    const payload = r.pad > packet.length ? padTo(packet, r.pad) : packet;
    const wireTxt =
      r.mode === "output"
        ? `${payload.length}B na wire (Chrome prefixa id 0x00 · kernel hidraw remove → interrupt OUT cru)`
        : `${payload.length}B via SET_REPORT no endpoint de controle (id 0x00 stripado pelo kernel)`;
    logs.push({ target: r.label, mode: r.mode, reportId: "0x00", wire: `${payload.length}B`, result: "…" });
    f75log.cmd(`TX ${r.mode} · ${label} · ${r.label} · ${payload.length}B payload → ${wireTxt}`);
    if (dump) f75log.dump(payload, `TX ${r.mode} · ${label} · ${r.label}`);
    else f75log.debug(`TX ${r.mode} · ${label} · primeiros bytes: ${Array.from(payload.subarray(0, 12), (b) => hex2(b)).join(" ")}`);
    try {
      if (r.mode === "output") await r.ep.device.sendReport(0, payload);
      else await r.ep.device.sendFeatureReport(0, payload);
      logs[logs.length - 1].result = "✔ aceito pelo SO";
      f75log.debug(`✔ ${r.mode} aceito pelo SO · ${label} · ${r.label} (processamento pelo teclado só a sonda prova)`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      logs[logs.length - 1].result = `✗ ${msg}`;
      f75log.warn(`${r.mode} falhou · ${label} · ${r.label} · ${msg}`);
      return false;
    }
  }

  /** Espera resposta de bateria — registrar ANTES do send (sem corrida). */
  private batteryWaiter(timeoutMs: number): Promise<number | null> {
    return new Promise((resolve) => {
      this.batteryWaiters.push(resolve);
      setTimeout(() => {
        const i = this.batteryWaiters.indexOf(resolve);
        if (i >= 0) {
          this.batteryWaiters.splice(i, 1);
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  /**
   * SONDA de rotas do receiver: envia a query de bateria por cada rota
   * candidata e espera a RESPOSTA real do teclado. A rota que responder é
   * a certa — fica cacheada e passa a valer para RGB/desempenho/bateria.
   * Se nenhuma responder, o teclado provavelmente não está falando com o
   * receiver (dormindo, fora do 2.4G ou sem pareamento Fn+R).
   */
  private async probeDongleRoutes(verbose: boolean): Promise<number | null> {
    if (this.probing) return null;
    this.probing = true;
    try {
      // Rota já validada — usa direto, sem re-sweep.
      if (this.dongleRoute) {
        const r = this.dongleRoute;
        const ep = this.dongleInterfaces.find((e) => e.key === r.endpointKey);
        if (ep) {
          const logs: TxAttemptLog[] = [];
          const wait = this.batteryWaiter(400);
          await this.sendRoute(
            { ep, mode: r.mode, pad: r.pad, label: r.label, note: "rota calibrada" },
            batteryQueryPacket(false, 32),
            "probe bateria",
            false,
            logs
          );
          const percent = await wait;
          this.lastTx = { label: "probe bateria (rota calibrada)", attempts: logs };
          if (percent !== null) return percent;
          if (verbose) f75log.warn("Rota calibrada não recebeu resposta agora — teclado dormindo? Aperte uma tecla e tente de novo.");
          return null;
        }
        this.dongleRoute = null;
      }

      const routes = this.routeCandidates();
      if (routes.length === 0) {
        if (verbose) f75log.warn("Receiver sem interface utilizável — nenhuma declara output/feature ≥ 32 B.");
        return null;
      }
      if (verbose) f75log.info(`🔎 Sondando ${routes.length} rota(s) do receiver com a query de bateria — a resposta real do teclado valida a rota…`);

      const pkt = batteryQueryPacket(false, 32);
      const logs: TxAttemptLog[] = [];
      for (const r of routes) {
        const wait = this.batteryWaiter(380); // waiter ANTES do send — sem corrida
        await this.sendRoute(r, pkt, "probe bateria", false, logs);
        const percent = await wait;
        if (percent !== null) {
          this.dongleRoute = { endpointKey: r.ep.key, label: r.label, mode: r.mode, pad: r.pad };
          f75log.ok(
            `✔ Rota do receiver VALIDADA por resposta do teclado: ${r.label} · ${r.mode}${r.pad ? ` padded ${r.pad}B` : ""} — bateria ${percent}%. RGB/desempenho/bateria usam esta rota.`
          );
          this.lastTx = { label: "probe de rotas (validada)", attempts: logs };
          return percent;
        }
        if (verbose) f75log.debug(`Rota ${r.label} · ${r.mode}: aceita pelo SO, sem resposta do teclado — próxima…`);
      }
      this.lastTx = { label: "probe de rotas (sem resposta)", attempts: logs };
      if (verbose)
        f75log.warn(
          "Nenhuma rota recebeu resposta do teclado. O receiver está ligado no PC, mas o teclado provavelmente NÃO está falando com ele: aperte qualquer tecla pra acordar, segure Fn pra ver o modo na telinha (precisa ser 2.4G) e re-emparelhe com Fn+R segurado ~3s se precisar."
        );
      return null;
    } finally {
      this.probing = false;
    }
  }

  /** Label da rota calibrada — vai pro painel de diagnóstico. */
  get dongleRouteLabel(): string | null {
    const r = this.dongleRoute;
    if (!r) return null;
    return `${r.label} · ${r.mode}${r.pad ? ` padded ${r.pad}B` : ""} — validada por resposta do teclado`;
  }

  /**
   * Auto-calibração ao vincular o receiver: roda a sonda de rotas em modo
   * silencioso. Valida a rota ANTES do primeiro Aplicar e de quebra já
   * traz a bateria se o teclado estiver acordado.
   */
  private async calibrateDongle(): Promise<void> {
    if (this.simMode || this.dongleInterfaces.length === 0) return;
    try {
      const percent = await this.probeDongleRoutes(false);
      if (percent !== null) this.onBattery?.(percent);
      else f75log.debug("Sonda de rotas concluída sem resposta — RGB usará a melhor rota candidata; re-sonda a cada clique em bateria.");
    } catch (err) {
      f75log.warn(`Sonda de rotas do receiver falhou: ${err instanceof Error ? err.message : String(err)} — a matriz re-tenta no próximo comando.`);
    }
  }

  /**
   * Query de bateria pública: roda a sonda de rotas (que usa a PRÓPRIA
   * resposta de bateria pra validar a rota de TX do receiver).
   */
  async queryBattery(quiet = false): Promise<number | null> {
    if (this.simMode) {
      f75log.cmd("TX (sim) · battery query");
      await sleep(300);
      f75log.rx("🔋 Bateria via input report: 87% (sim)");
      this.onBattery?.(87);
      return 87;
    }
    if (this.dongleInterfaces.length === 0) throw new F75Error(this.requireMessage("dongle"));
    if (!quiet) f75log.info("🔋 Consultando bateria — a resposta real do teclado valida a rota de TX do receiver.");
    const percent = await this.probeDongleRoutes(!quiet);
    if (percent !== null) this.onBattery?.(percent);
    return percent;
  }

  /* ---------------------------- receiver: RGB ------------------------------- */

  async applyRGB(settings: RgbSettings): Promise<void> {
    f75log.info(`🎨 Aplicando RGB: ${describeWireless(rgbLEDReport(settings)).replace("LED 0x05 · ", "")}`);
    await this.tx(rgbCommitReport(), "RGB commit", "dongle", ["output", "feature"]);
    await sleep(50);
    await this.tx(rgbLEDReport(settings), "RGB LED", "dongle", ["output", "feature"]);
    f75log.ok("RGB aplicado via receiver 2.4G.");
  }

  /* ------------------------ receiver: performance/jogo ---------------------- */

  /**
   * Um único report 0x07 com response level + sleep + flags de jogo.
   * Diferente do nativo (que zera as flags no applyPerformance), aqui as flags
   * SEMPRE vão junto — impossível "perder" o estado do Alt+Tab sem querer.
   */
  async applyPerformance(options: PerformanceOptions): Promise<void> {
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
    await this.tx(report, "performance + game mode", "dongle", ["output", "feature"]);
    f75log.ok("Performance e flags de jogo aplicadas via receiver 2.4G.");
  }

  /* ------------------------------ diagnóstico ------------------------------- */

  getDiagnostics(): DriverDiagnostics {
    const endpoints: EndpointDiag[] = [];
    const push = (ep: Endpoint | undefined, role: string) => {
      if (!ep) return;
      endpoints.push({
        key: ep.key,
        role,
        product: ep.device.productName || "HID",
        vid: `0x${ep.device.vendorId.toString(16).padStart(4, "0")}`,
        pid: `0x${ep.device.productId.toString(16).padStart(4, "0")}`,
        usagePages: ep.summary.usagePages.map((p) => `0x${p.toString(16)}`).join("/"),
        hasNumberedIds: ep.summary.hasNumberedIds,
        maxOutput: ep.summary.maxOutput,
        maxFeature: ep.summary.maxFeature,
        outputIds: fmtSizes(ep.summary.outputIds),
        featureIds: fmtSizes(ep.summary.featureIds),
        opened: ep.device.opened,
      });
    };
    push(this.wiredCommand, "cabo · comando");
    push(this.wiredDisplay, "cabo · display");
    this.dongleInterfaces.forEach((ep, i) => push(ep, i === 0 ? "receiver · preferido" : `receiver · alt ${i}`));
    return { sim: this.simMode, endpoints, lastTx: this.lastTx, dongleRoute: this.dongleRouteLabel };
  }
}
