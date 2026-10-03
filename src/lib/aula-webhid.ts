/**
 * Aula F75 Max over WebHID — port of LinuxHIDBackend.swift.
 *
 * Wire semantics preserved from the hidapi implementation:
 * - Wired command channel (usage page 0xFF13): FEATURE reports, 64 bytes.
 *   sendFeatureReport(packet[0], packet[1..]) ≡ hid_send_feature_report(packet);
 *   fallback sendFeatureReport(0, packet) ≡ hidapi's 0x00-prefixed retry.
 * - Wired raw display channel (0xFF68): raw 4096-byte output chunks written
 *   verbatim (hid_write) + input-report ACKs. sendReport(0, chunk) writes the
 *   buffer as-is on hidraw — byte-identical to the native driver.
 * - 2.4G receiver raw channel (0xFF60): 32/33/64-byte output reports,
 *   battery answers arrive as input reports (0x20 0x01 .. percent).
 */

import {
  AULA,
  batteryQueryPacket,
  gameModeReport,
  keyResponseReport,
  rgbCommitReport,
  rgbLEDReport,
  timePayload,
  wiredPacket,
  type EncodedDisplayStream,
  type RgbSettings,
} from "./aula-protocol";

export class AulaWebHidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AulaWebHidError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function hasUsagePage(device: HIDDevice, page: number): boolean {
  return device.collections.some(
    (c) => c.usagePage === page || c.children.some((child) => child.usagePage === page)
  );
}

export interface ConnectionStatus {
  wiredCommand: boolean;
  wiredDisplay: boolean;
  dongle: boolean;
}

export interface ConnectResult extends ConnectionStatus {
  productNames: string[];
}

export class AulaWebHid {
  private wired?: HIDDevice;
  private wiredRaw?: HIDDevice;
  private dongle?: HIDDevice;

  constructor(private readonly log: (line: string) => void) {}

  static get supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.hid &&
      typeof window !== "undefined" &&
      window.isSecureContext
    );
  }

  get status(): ConnectionStatus {
    return {
      wiredCommand: !!this.wired,
      wiredDisplay: !!this.wiredRaw,
      dongle: !!this.dongle,
    };
  }

  /** Opens the browser device picker and binds the supported interfaces. */
  async connect(): Promise<ConnectResult> {
    if (!navigator.hid) throw new AulaWebHidError("WebHID indisponível — use Chrome/Chromium/Edge/Brave.");
    const devices = await navigator.hid.requestDevice({
      filters: [
        { vendorId: AULA.wiredVendorId, productId: AULA.wiredProductId },
        { vendorId: AULA.dongleVendorId, productId: AULA.dongleProductId },
      ],
    });
    this.log(`Selecionados ${devices.length} interface(s) HID no seletor do navegador.`);

    for (const device of devices) {
      if (device.opened) continue;
      try {
        await device.open();
      } catch (err) {
        this.log(`⚠ Falha ao abrir ${device.productName || "device"}: ${String(err)}`);
        continue;
      }
      const isWired = device.vendorId === AULA.wiredVendorId && device.productId === AULA.wiredProductId;
      const isDongle = device.vendorId === AULA.dongleVendorId && device.productId === AULA.dongleProductId;
      const name = isDongle ? "Aula F75 Max 2.4G" : "Aula F75 Max";

      if (isWired && hasUsagePage(device, AULA.wiredCommandPage)) {
        this.wired = device;
        this.log(`✔ Cabo · canal de comando (0xFF13) aberto — ${name}`);
      } else if (isWired && hasUsagePage(device, AULA.wiredRawPage)) {
        this.wiredRaw = device;
        this.log(`✔ Cabo · canal de display (0xFF68) aberto — ${name}`);
      } else if (isDongle && (hasUsagePage(device, AULA.dongleRawPage) || !this.dongle)) {
        this.dongle = device;
        this.log(`✔ Receiver 2.4G (0xFF60) aberto — ${name}`);
      }
    }

    if (!this.wired && !this.wiredRaw && !this.dongle) {
      throw new AulaWebHidError("Nenhum endpoint do Aula F75 Max foi aberto. Conecte o teclado/receiver e tente de novo.");
    }
    const status = this.status;
    this.log(
      `Pronto: comando cabo ${status.wiredCommand ? "✔" : "✗"} · display cabo ${status.wiredDisplay ? "✔" : "✗"} · 2.4G ${status.dongle ? "✔" : "✗"}`
    );
    return { ...status, productNames: [] };
  }

  async disconnect(): Promise<void> {
    for (const device of [this.wired, this.wiredRaw, this.dongle]) {
      try {
        await device?.close();
      } catch {
        /* ignore */
      }
    }
    this.wired = undefined;
    this.wiredRaw = undefined;
    this.dongle = undefined;
    this.log("Desconectado.");
  }

  /* ------------------------------ low-level I/O ----------------------------- */

  private async sendFeature(device: HIDDevice, packet: Uint8Array): Promise<void> {
    try {
      await device.sendFeatureReport(packet[0], packet.subarray(1));
    } catch {
      await device.sendFeatureReport(0, packet);
    }
  }

  private async readFeatureAck(device: HIDDevice): Promise<void> {
    try {
      await device.receiveFeatureReport(0);
    } catch {
      try {
        await device.receiveFeatureReport(0x04);
      } catch {
        /* ACK content is not verified by the native driver either */
      }
    }
  }

  private async commandExchange(device: HIDDevice, packet: Uint8Array): Promise<void> {
    await this.sendFeature(device, packet);
    await this.readFeatureAck(device);
  }

  private async sendOutput(device: HIDDevice, report: Uint8Array): Promise<void> {
    try {
      await device.sendReport(0, report);
    } catch {
      await device.sendReport(report[0], report.subarray(1));
    }
  }

  /** Resolves true if any input report arrives within the timeout. */
  private waitForInput(device: HIDDevice, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        device.removeEventListener("inputreport", handler);
        resolve(value);
      };
      const handler = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      device.addEventListener("inputreport", handler);
    });
  }

  private requireWired(): HIDDevice {
    if (!this.wired) throw new AulaWebHidError("Conecte o teclado via CABO USB-C (canal de comando).");
    return this.wired;
  }

  private requireDongle(): HIDDevice {
    if (!this.dongle) throw new AulaWebHidError("Conecte o receiver 2.4G para usar RGB/bateria/performance.");
    return this.dongle;
  }

  /* -------------------------------- clock sync ------------------------------- */

  async syncClock(): Promise<void> {
    const device = this.requireWired();
    const now = new Date();
    await this.commandExchange(device, wiredPacket(0x04, 0x18));
    const prepare = wiredPacket(0x04, 0x28);
    prepare[8] = 0x01;
    await this.commandExchange(device, prepare);
    await this.commandExchange(device, timePayload(now));
    await this.commandExchange(device, wiredPacket(0x04, 0x02));
    this.log(`⏰ Relógio da telinha sincronizado (${now.toLocaleTimeString("pt-BR")}).`);
  }

  /* ------------------------------ display upload ----------------------------- */

  async uploadDisplay(
    stream: EncodedDisplayStream,
    slot: number,
    onProgress: (sent: number, total: number) => void
  ): Promise<void> {
    if (!Number.isInteger(slot) || slot < 1 || slot > 255) {
      throw new AulaWebHidError("Slot deve estar entre 1 e 255.");
    }
    if (!this.wired || !this.wiredRaw) {
      throw new AulaWebHidError("Upload precisa dos DOIS endpoints do cabo (comando 0xFF13 + display 0xFF68).");
    }

    const total = stream.chunkCount;
    if (total > 0xffff) throw new AulaWebHidError("Payload grande demais para os metadados de 16 bits.");

    this.log(`📤 Upload: ${stream.frameCount} frames · ${total} blocos · slot ${slot}`);
    await this.commandExchange(this.wired, wiredPacket(0x04, 0x18));

    const metadata = wiredPacket(0x04, 0x72);
    metadata[2] = slot;
    metadata[8] = total & 0xff;
    metadata[9] = (total >> 8) & 0xff;
    await this.commandExchange(this.wired, metadata);
    await this.waitForInput(this.wiredRaw, 150);

    for (let index = 0; index < total; index++) {
      const chunk = stream.data.subarray(index * AULA.chunkLength, (index + 1) * AULA.chunkLength);
      await this.wiredRaw.sendReport(0, chunk);
      await this.waitForInput(this.wiredRaw, 350);
      onProgress(index + 1, total);
    }

    await this.commandExchange(this.wired, wiredPacket(0x04, 0x02));
    this.log(`✅ Upload concluído no slot ${slot}.`);
  }

  /* -------------------------------- factory reset ---------------------------- */

  async factoryReset(onProgress: (stage: string) => void): Promise<void> {
    const device = this.requireWired();
    const exchange = async (packet: Uint8Array) => this.commandExchange(device, packet);

    onProgress("Apagando memória de display");
    await exchange(wiredPacket(0x04, 0x19));
    const clearSlots = wiredPacket(0x04, 0x15);
    clearSlots[8] = 0x08;
    await exchange(clearSlots);
    await this.sendZeroPages(device, 8);
    await exchange(wiredPacket(0x04, 0x02));

    onProgress("Resetando keymap e macros");
    await exchange(wiredPacket(0x04, 0x18));
    const keymap = wiredPacket(0x04, 0x11);
    keymap[8] = 0x09;
    await exchange(keymap);
    await this.sendZeroPages(device, 9);
    await exchange(wiredPacket(0x04, 0x02));
    await exchange(wiredPacket(0x04, 0xf0));

    onProgress("Resetando lighting");
    await exchange(wiredPacket(0x04, 0x18));
    const lighting = wiredPacket(0x04, 0x27);
    lighting[8] = 0x09;
    await exchange(lighting);
    await this.sendZeroPages(device, 9);
    await exchange(wiredPacket(0x04, 0x02));
    await exchange(wiredPacket(0x04, 0xf0));

    onProgress("Enviando footer de reset");
    await exchange(wiredPacket(0x04, 0x18));
    const header = wiredPacket(0x04, 0x13);
    header[8] = 0x01;
    await exchange(header);
    const payload = wiredPacket(0x0b, 0xff);
    payload[8] = 0x01;
    payload[9] = 0x05;
    payload[10] = 0x03;
    payload[14] = 0xaa;
    payload[15] = 0x55;
    await exchange(payload);
    await exchange(wiredPacket(0x04, 0x02));
    await exchange(wiredPacket(0x04, 0xf0));

    onProgress("Resetando config de display");
    await exchange(wiredPacket(0x04, 0x18));
    const displayReset = wiredPacket(0x04, 0x17);
    displayReset[2] = 0x01;
    displayReset[8] = 0x01;
    await exchange(displayReset);
    const displayConfig = new Uint8Array(AULA.commandLength);
    displayConfig[0] = 0x00;
    displayConfig[1] = 0x01;
    displayConfig[6] = 0x02;
    displayConfig[8] = 0x02;
    await exchange(displayConfig);
    await exchange(wiredPacket(0x04, 0x02));
    this.log("✅ Factory reset completo. Replugue o cabo.");
  }

  private async sendZeroPages(device: HIDDevice, count: number): Promise<void> {
    if (count <= 0) return;
    const zero = new Uint8Array(AULA.commandLength);
    for (let i = 0; i < count - 1; i++) {
      await this.sendFeature(device, zero);
      await sleep(40);
    }
    await this.commandExchange(device, zero);
  }

  /* ------------------------------ receiver: battery -------------------------- */

  async queryBattery(): Promise<number | null> {
    const device = this.requireDongle();
    let percent: number | null = null;
    const handler = (event: HIDInputReportEvent) => {
      const data = event.data;
      if (event.reportId === 0x20 && data.byteLength >= 3 && data.getUint8(0) === 0x01) {
        const value = data.getUint8(2);
        if (value > 0 && value <= 100) percent = value;
      } else if (event.reportId === 0 && data.byteLength >= 5 && data.getUint8(1) === 0x20 && data.getUint8(2) === 0x01) {
        const value = data.getUint8(4);
        if (value > 0 && value <= 100) percent = value;
      }
    };
    device.addEventListener("inputreport", handler);

    try {
      for (const length of [64, 33, 32]) {
        for (const withId of [false, true]) {
          await this.sendOutput(device, batteryQueryPacket(withId, length));
          await sleep(250);
          if (percent !== null) return percent;
        }
      }
      return percent;
    } finally {
      device.removeEventListener("inputreport", handler);
    }
  }

  /* -------------------------------- receiver: RGB ---------------------------- */

  async applyRGB(settings: RgbSettings): Promise<void> {
    const device = this.requireDongle();
    await this.sendOutput(device, rgbCommitReport());
    await sleep(50);
    await this.sendOutput(device, rgbLEDReport(settings));
    this.log("🎨 RGB aplicado via receiver 2.4G.");
  }

  async applyPerformance(level: number, sleepTime: number): Promise<void> {
    const device = this.requireDongle();
    await this.sendOutput(device, keyResponseReport(level, 1, sleepTime));
    this.log(`⚡ Response level ${level} + sleep aplicados.`);
  }

  async setGameMode(enabled: boolean, level: number, sleepTime: number): Promise<void> {
    const device = this.requireDongle();
    const value = enabled ? 1 : 0;
    await this.sendOutput(device, gameModeReport(level, 1, sleepTime, value, value, value, value));
    this.log(`🎮 Game Mode ${enabled ? "ON (Win travada)" : "OFF"}.`);
  }
}
