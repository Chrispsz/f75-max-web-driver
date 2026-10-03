/**
 * Protocolo do Aula F75 Max — port TypeScript fiel de AulaCore.swift,
 * LinuxHIDBackend.swift, WirelessAulaDevice.swift e DisplayEncoder.swift.
 *
 * Funções puras: builders de pacotes, decodificadores legíveis (pra log),
 * encoder de display RGB565 e decodificadores de imagem/GIF.
 */

/* ================================ constantes ============================== */

export const AULA = {
  wiredVendorId: 0x0c45,
  wiredProductId: 0x800a,
  dongleVendorId: 0x05ac,
  dongleProductId: 0x024f,
  wiredCommandPage: 0xff13,
  wiredRawPage: 0xff68,
  dongleCommandPage: 0xff59,
  dongleRawPage: 0xff60,
  commandLength: 64,
  ackLength: 128,
  headerLength: 256,
  frameBytes: 128 * 128 * 2,
  chunkLength: 4096,
  maxFrames: 255,
} as const;

export const RGB_MODES: { id: number; name: string }[] = [
  { id: 0, name: "Desligado" },
  { id: 1, name: "Static (cor fixa)" },
  { id: 2, name: "SingleOn" },
  { id: 3, name: "SingleOff" },
  { id: 4, name: "Glittering" },
  { id: 5, name: "Falling" },
  { id: 6, name: "Colourful" },
  { id: 7, name: "Breath" },
  { id: 8, name: "Spectrum" },
  { id: 9, name: "Outward" },
  { id: 10, name: "Scrolling" },
  { id: 11, name: "Rolling" },
  { id: 12, name: "Rotating" },
  { id: 13, name: "Explode" },
  { id: 14, name: "Launch" },
  { id: 15, name: "Ripples" },
  { id: 16, name: "Flowing" },
  { id: 17, name: "Pulsating" },
  { id: 18, name: "Tilt" },
  { id: 19, name: "Shuttle" },
];

export const DIRECTIONS = ["Direita", "Baixo", "Esquerda", "Cima"] as const;

export const SLEEP_OPTIONS = [
  { id: 0, name: "Nunca" },
  { id: 1, name: "1 min" },
  { id: 2, name: "5 min" },
  { id: 3, name: "30 min" },
] as const;

export const RESPONSE_LEVELS = [
  { id: 1, name: "Nível 1 · mais rápido (5–6 ms)" },
  { id: 2, name: "Nível 2 · equilibrado (7–9 ms)" },
  { id: 3, name: "Nível 3 · estável (10–12 ms)" },
  { id: 4, name: "Nível 4 · conservador (15–17 ms)" },
  { id: 5, name: "Nível 5 · máxima estabilidade (19–21 ms)" },
] as const;

export interface RgbSettings {
  mode: number; // 0..19 (0 = LED off)
  brightness: number; // 1..5
  speed: number; // 1..5
  direction: number; // 0 direita, 1 baixo, 2 esquerda, 3 cima
  colorful: boolean;
  color: number; // 0xRRGGBB
}

export interface GameFlags {
  game: boolean;
  lockAltTab: boolean;
  lockAltF4: boolean;
  lockWin: boolean;
}

/* ============================== hex utilities ============================= */

export function hex2(n: number): string {
  return (n & 0xff).toString(16).padStart(2, "0").toUpperCase();
}

export function hexLine(bytes: Uint8Array, max = 32): string {
  return Array.from(bytes.subarray(0, max), (b) => hex2(b)).join(" ") + (bytes.length > max ? " …" : "");
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16) & 0xffffff;
}

export function intToHex(value: number): string {
  return "#" + value.toString(16).padStart(6, "0").toUpperCase();
}

function sum8(bytes: Uint8Array, checksumIndex: number): void {
  if (checksumIndex >= bytes.length) return;
  bytes[checksumIndex] = 0;
  let sum = 0;
  for (const b of bytes) sum = (sum + b) & 0xff;
  bytes[checksumIndex] = sum;
}

export function checkSum8(bytes: Uint8Array, checksumIndex: number): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (i === checksumIndex) continue;
    sum = (sum + bytes[i]) & 0xff;
  }
  return sum;
}

/* ============================ pacotes (cabo) ============================== */

/** Pacote de comando de 64 bytes do canal 0xFF13. */
export function wiredPacket(first: number, second: number): Uint8Array {
  const data = new Uint8Array(AULA.commandLength);
  data[0] = first;
  data[1] = second;
  return data;
}

/** Relógio: month/day/hour/min/sec/weekday + footer 0xAA55 (AulaWiredPackets.timePayload). */
export function timePayload(now: Date = new Date()): Uint8Array {
  const p = new Uint8Array(AULA.commandLength);
  p[0] = 0x00;
  p[1] = 0x01;
  p[2] = 0x5a;
  p[3] = 0x1a;
  p[4] = now.getMonth() + 1;
  p[5] = now.getDate();
  p[6] = now.getHours();
  p[7] = now.getMinutes();
  p[8] = now.getSeconds();
  p[10] = now.getDay(); // 0 = domingo (mesmo mapeamento do Swift: weekday - 1)
  p[62] = 0xaa;
  p[63] = 0x55;
  return p;
}

const WIRED_OPCODES: Record<string, string> = {
  "04-18": "abrir sessão de escrita",
  "04-72": "metadados de display (slot + nº de blocos)",
  "04-02": "commit (aplicar escrita)",
  "04-15": "apagar slots de display",
  "04-19": "apagar memória de display",
  "04-11": "reset de keymap/macros",
  "04-27": "reset de lighting",
  "04-13": "header de payload de reset",
  "04-17": "reset da config de display",
  "04-28": "prepare relógio",
  "04-f0": "finalizar bloco de escrita",
};

/** Descrição legível de um pacote do cabo — vai pro log. */
export function describeWired(packet: Uint8Array): string {
  const key = `${hex2(packet[0])}-${hex2(packet[1])}`;
  const known = WIRED_OPCODES[key];
  if (key === "04-72") {
    const slot = packet[2];
    const chunks = packet[8] | (packet[9] << 8);
    return `0x04 0x72 metadados · slot ${slot} · ${chunks} blocos de 4 KB`;
  }
  if (key === "04-28") {
    return `0x04 0x28 prepare relógio · flag[8]=0x${hex2(packet[8])}`;
  }
  if (packet[0] === 0x00 && packet[1] === 0x01) {
    return `relógio ${String(packet[4]).padStart(2, "0")}/${String(packet[5]).padStart(2, "0")} ${String(packet[6]).padStart(2, "0")}:${String(packet[7]).padStart(2, "0")}:${String(packet[8]).padStart(2, "0")} · dow=${packet[10]} · footer ${hex2(packet[62])}${hex2(packet[63])}`;
  }
  const extras: string[] = [];
  for (const i of [2, 8, 9]) {
    if (packet[i]) extras.push(`[${i}]=0x${hex2(packet[i])}`);
  }
  if (packet[14] === 0xaa && packet[15] === 0x55) extras.push("footer AA55");
  return `0x${hex2(packet[0])} 0x${hex2(packet[1])}${known ? ` (${known})` : ""}${extras.length ? " · " + extras.join(" ") : ""}`;
}

/* ========================= pacotes (receiver 2.4G) ======================== */

/** Report de commit RGB (0x0f) — enviado antes de cada relatório de LED. */
export function rgbCommitReport(): Uint8Array {
  const r = new Uint8Array(32);
  r[0] = 0x0f;
  sum8(r, 31);
  return r;
}

/** Report de LED (0x05) — mode 0 apaga (só o byte do modo importa). */
export function rgbLEDReport(s: RgbSettings): Uint8Array {
  const r = new Uint8Array(32);
  r[0] = 0x05;
  r[1] = 0x10;
  r[2] = 0x00;
  r[3] = s.mode & 0xff;
  if (s.mode !== 0) {
    r[4] = (s.color >> 16) & 0xff;
    r[5] = (s.color >> 8) & 0xff;
    r[6] = s.color & 0xff;
    r[11] = s.colorful ? 1 : 0;
    r[12] = Math.min(Math.max(s.brightness, 1), 5);
    r[13] = Math.min(Math.max(s.speed, 1), 5);
    r[14] = Math.min(Math.max(s.direction, 0), 3);
  }
  r[17] = 0xaa;
  r[18] = 0x55;
  sum8(r, 31);
  return r;
}

/** Report de performance (0x07): response level + sleep (sem flags de jogo). */
export function keyResponseReport(responseLevel: number, fnSwitch: number, sleepTime: number): Uint8Array {
  const r = new Uint8Array(32);
  r[0] = 0x07;
  r[1] = 0x10;
  r[2] = 0x00;
  r[3] = 0x00;
  r[4] = 0x01;
  r[5] = 0x01;
  r[6] = 0x01;
  r[7] = 0x01;
  r[8] = fnSwitch & 0xff;
  r[9] = sleepTime & 0xff;
  r[11] = Math.min(Math.max(responseLevel, 1), 5);
  r[17] = 0xaa;
  r[18] = 0x55;
  sum8(r, 31);
  return r;
}

/**
 * Game Mode com flags INDEPENDENTES (melhoria sobre o nativo, que força as
 * três juntas): [12]=game, [13]=disableAltTab, [14]=disableAltF4, [15]=disableWin.
 * É o disableAltTab=1 do firmware que mata o Alt+Tab do GNOME!
 */
export function gameModeReport(
  responseLevel: number,
  fnSwitch: number,
  sleepTime: number,
  flags: GameFlags
): Uint8Array {
  const r = keyResponseReport(responseLevel, fnSwitch, sleepTime);
  r[12] = flags.game ? 1 : 0;
  r[13] = flags.lockAltTab ? 1 : 0;
  r[14] = flags.lockAltF4 ? 1 : 0;
  r[15] = flags.lockWin ? 1 : 0;
  sum8(r, 31);
  return r;
}

/** Query de bateria (0x20 0x01), com variações de tamanho/report-id do nativo. */
export function batteryQueryPacket(includeReportId: boolean, length: number): Uint8Array {
  const p = new Uint8Array(Math.max(length, 0));
  if (p.length === 0) return p;
  if (includeReportId) {
    p[0] = 0x00;
    if (p.length > 1) p[1] = 0x20;
    if (p.length > 2) p[2] = 0x01;
  } else {
    p[0] = 0x20;
    if (p.length > 1) p[1] = 0x01;
  }
  sum8(p, includeReportId ? 32 : 31);
  return p;
}

/** Descrição legível de um report de 32 B do receiver — vai pro log. */
export function describeWireless(report: Uint8Array): string {
  const sum = checkSum8(report, 31);
  const checksumOk = sum === report[31];
  const tail = `ck=${checksumOk ? "ok" : `RUIM (esperado 0x${hex2(sum)})`}`;
  switch (report[0]) {
    case 0x05: {
      const mode = report[3];
      if (mode === 0) return `LED 0x05 · modo 0 (apagado) · ${tail}`;
      const color = (report[4] << 16) | (report[5] << 8) | report[6];
      return `LED 0x05 · modo ${mode} "${RGB_MODES.find((m) => m.id === mode)?.name ?? "?"}" · cor ${intToHex(color)} · brilho ${report[12]}/5 · vel ${report[13]}/5 · dir ${DIRECTIONS[report[14]] ?? report[14]} · colorful=${report[11]} · ${tail}`;
    }
    case 0x07:
      return `PERF 0x07 · level ${report[11]} · sleep ${report[9]} · fnSwitch ${report[8]} · game=${report[12]} altTab=${report[13]} altF4=${report[14]} win=${report[15]} · ${tail}`;
    case 0x0f:
      return `COMMIT RGB 0x0f · ${tail}`;
    case 0x20:
      return `BATERIA query 0x20 0x01 · ${tail}`;
    default:
      return `0x${hex2(report[0])} · ${tail}`;
  }
}

/** Parse de input report de bateria (aceita com e sem report-id à frente). */
export function parseBatteryReport(reportId: number, data: Uint8Array): number | null {
  if (reportId === 0x20 && data.length >= 4 && data[0] === 0x01) {
    const v = data[2];
    return v > 0 && v <= 100 ? v : null;
  }
  if (data.length >= 5 && data[0] === 0x20 && data[1] === 0x01) {
    const v = data[3];
    return v > 0 && v <= 100 ? v : null;
  }
  if (data.length >= 5 && data[0] === 0x00 && data[1] === 0x20 && data[2] === 0x01) {
    const v = data[4];
    return v > 0 && v <= 100 ? v : null;
  }
  return null;
}

/* =========================== encoder de display =========================== */

export type FitMode = "contain" | "cover" | "stretch";

export interface DisplayFrame {
  bitmap?: ImageBitmap;
  image?: ImageData;
  delayMs: number;
}

export interface EncodedDisplayStream {
  data: Uint8Array;
  frameCount: number;
  chunkCount: number;
  delays: number[]; // byte de delay do device por frame (unidade 2 ms)
  avgFps: number;
}

function drawRect(srcW: number, srcH: number, fit: FitMode): [number, number, number, number] {
  const target = 128;
  if (fit === "stretch") return [0, 0, target, target];
  const scaleX = target / srcW;
  const scaleY = target / srcH;
  const scale = fit === "contain" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
  const width = srcW * scale;
  const height = srcH * scale;
  return [(target - width) / 2, (target - height) / 2, width, height];
}

/**
 * Monta o stream do display byte a byte como o DisplayEncoder.swift:
 * [0]=frameCount, [1..N]=delays (s×500, clamp 1..255), 256 B de header,
 * depois frames RGB565 little-endian 128×128, tudo zeropadded em blocos de 4 KB.
 */
export function buildDisplayStream(frames: DisplayFrame[], fit: FitMode): EncodedDisplayStream {
  const frameCount = Math.min(frames.length, AULA.maxFrames);
  if (frameCount === 0) throw new Error("Nenhum frame para enviar");
  const payloadLength = AULA.headerLength + frameCount * AULA.frameBytes;
  const chunkCount = Math.ceil(payloadLength / AULA.chunkLength);
  const stream = new Uint8Array(chunkCount * AULA.chunkLength);

  stream[0] = frameCount;
  let delaySum = 0;
  for (let i = 0; i < frameCount; i++) {
    const seconds = frames[i].delayMs > 0 ? frames[i].delayMs / 1000 : 0.01;
    const value = Math.round(seconds * 500);
    stream[1 + i] = Math.max(1, Math.min(255, value));
    delaySum += Math.max(1, Math.min(255, value)) * 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador");

  for (let i = 0; i < frameCount; i++) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 128, 128);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const frame = frames[i];
    if (frame.bitmap) {
      ctx.drawImage(frame.bitmap, ...drawRect(frame.bitmap.width, frame.bitmap.height, fit));
    } else if (frame.image) {
      ctx.putImageData(frame.image, 0, 0);
    }
    const rgba = ctx.getImageData(0, 0, 128, 128).data;
    const offset = AULA.headerLength + i * AULA.frameBytes;
    for (let px = 0; px < 128 * 128; px++) {
      const base = px * 4;
      const r = rgba[base] >> 3;
      const g = rgba[base + 1] >> 2;
      const b = rgba[base + 2] >> 3;
      const pixel = (r << 11) | (g << 5) | b;
      stream[offset + px * 2] = pixel & 0xff;
      stream[offset + px * 2 + 1] = (pixel >> 8) & 0xff;
    }
  }

  return {
    data: stream,
    frameCount,
    chunkCount,
    delays: Array.from(stream.subarray(1, 1 + frameCount)),
    avgFps: delaySum > 0 ? 1000 / (delaySum / frameCount) : 15,
  };
}

/** Decodifica o RGB565 de um frame do stream de volta pra ImageData (prévia fiel). */
export function decodeFrameToImageData(stream: Uint8Array, frameIndex: number): ImageData {
  const offset = AULA.headerLength + frameIndex * AULA.frameBytes;
  const rgba = new Uint8ClampedArray(128 * 128 * 4);
  for (let px = 0; px < 128 * 128; px++) {
    const pixel = stream[offset + px * 2] | (stream[offset + px * 2 + 1] << 8);
    const r5 = (pixel >> 11) & 0x1f;
    const g6 = (pixel >> 5) & 0x3f;
    const b5 = pixel & 0x1f;
    rgba[px * 4] = (r5 << 3) | (r5 >> 2);
    rgba[px * 4 + 1] = (g6 << 2) | (g6 >> 4);
    rgba[px * 4 + 2] = (b5 << 3) | (b5 >> 2);
    rgba[px * 4 + 3] = 255;
  }
  return new ImageData(rgba, 128, 128);
}

/* ========================= decodificadores de imagem ====================== */

/** Decodifica imagem estática (PNG/JPEG/WebP/BMP/1º frame de GIF). */
export async function decodeStillImage(file: Blob): Promise<DisplayFrame[]> {
  const bitmap = await createImageBitmap(file);
  return [{ bitmap, delayMs: 100 }];
}

/** Decodifica GIF animado com delays reais (WebCodecs ImageDecoder, Chromium). */
export async function decodeAnimatedGif(file: Blob): Promise<DisplayFrame[]> {
  const data = await file.arrayBuffer();
  if (typeof ImageDecoder === "undefined") {
    return decodeStillImage(file);
  }

  const decoder = new ImageDecoder({ data, type: "image/gif" });
  await decoder.tracks.ready;
  const track = decoder.tracks.selectedTrack;
  if (!track) return decodeStillImage(file);

  const rawCount = track.frameCount;
  const total = Math.min(typeof rawCount === "number" ? rawCount : await rawCount, AULA.maxFrames);
  if (total <= 1) {
    decoder.close();
    return decodeStillImage(file);
  }

  const frames: DisplayFrame[] = [];
  for (let i = 0; i < total; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    const durationUs = image.duration ?? 0;
    const delayMs = durationUs > 0 ? durationUs / 1000 : 100;
    const bitmap = await createImageBitmap(image);
    image.close();
    frames.push({ bitmap, delayMs });
  }
  decoder.close();
  return frames;
}

/* ========================= animações procedurais ========================== */

/** Gera frames de animação procedural direto em ImageData (sem GIF externo). */
export function generateAnimation(kind: "bounce" | "plasma", frameCount = 45): DisplayFrame[] {
  const frames: DisplayFrame[] = [];
  const delayMs = 1000 / 15;

  for (let f = 0; f < frameCount; f++) {
    const t = f / frameCount;
    const rgba = new Uint8ClampedArray(128 * 128 * 4);

    if (kind === "bounce") {
      // bola ciano quicando com rastro, loop perfeito (sin/cos de período inteiro)
      const cx = 64 + 44 * Math.sin(t * Math.PI * 2);
      const cy = 24 + 76 * (0.5 + 0.5 * Math.sin(t * Math.PI * 4 - Math.PI / 2));
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const dist = Math.hypot(x - cx, y - cy);
          const glow = Math.max(0, 1 - dist / 26);
          const trail = Math.max(0, 1 - Math.hypot(x - 64 - 44 * Math.sin((t - 0.06) * Math.PI * 2), y - 24 - 76 * (0.5 + 0.5 * Math.sin((t - 0.06) * Math.PI * 4 - Math.PI / 2))) / 40) * 0.3;
          const v = Math.min(1, glow + trail);
          const base = (y * 128 + x) * 4;
          rgba[base] = Math.round(16 + 65 * v);
          rgba[base + 1] = Math.round(20 + 232 * v);
          rgba[base + 2] = Math.round(28 + 255 * v);
          rgba[base + 3] = 255;
        }
      }
    } else {
      // plasma gelo: ondas ciano/branco com loop perfeito (fases múltiplas de 2π)
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const v =
            Math.sin((x / 128) * Math.PI * 4 + t * Math.PI * 2) +
            Math.sin((y / 128) * Math.PI * 3 - t * Math.PI * 2) +
            Math.sin(((x + y) / 128) * Math.PI * 2 + t * Math.PI * 4) * 0.5;
          const norm = (v / 2.5 + 1) / 2;
          const base = (y * 128 + x) * 4;
          rgba[base] = Math.round(10 + 55 * norm);
          rgba[base + 1] = Math.round(30 + 225 * norm);
          rgba[base + 2] = Math.round(60 + 195 * norm);
          rgba[base + 3] = 255;
        }
      }
    }

    frames.push({ image: new ImageData(rgba, 128, 128), delayMs });
  }

  return frames;
}
