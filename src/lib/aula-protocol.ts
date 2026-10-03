/**
 * Aula F75 Max protocol — TypeScript port of the packet builders and display
 * encoder from the native driver (AulaCore.swift + DisplayEncoder.swift).
 * Pure functions only: no DOM, no device I/O, fully testable.
 */

export const AULA = {
  wiredVendorId: 0x0c45,
  wiredProductId: 0x800a,
  dongleVendorId: 0x05ac,
  dongleProductId: 0x024f,
  wiredCommandPage: 0xff13,
  wiredRawPage: 0xff68,
  dongleRawPage: 0xff60,
  commandLength: 64,
  headerLength: 256,
  frameBytes: 128 * 128 * 2,
  chunkLength: 4096,
  maxFrames: 255,
} as const;

/* ------------------------------ wired packets ----------------------------- */

/** 64-byte command packet with opcode (first, second). */
export function wiredPacket(first: number, second: number): Uint8Array {
  const data = new Uint8Array(AULA.commandLength);
  data[0] = first;
  data[1] = second;
  return data;
}

/** Clock-sync payload: month/day/hour/min/sec/weekday + 0xAA55 footer. */
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
  p[10] = now.getDay(); // Swift: weekday - 1 with Sunday = 1 → getDay() (Sunday = 0)
  p[62] = 0xaa;
  p[63] = 0x55;
  return p;
}

/* ----------------------------- wireless reports ---------------------------- */

function sum8(bytes: Uint8Array, checksumIndex: number): void {
  if (checksumIndex >= bytes.length) return;
  bytes[checksumIndex] = 0;
  let sum = 0;
  for (const b of bytes) sum = (sum + b) & 0xff;
  bytes[checksumIndex] = sum;
}

/** 32-byte commit report (0x0f). Send before every LED report. */
export function rgbCommitReport(): Uint8Array {
  const r = new Uint8Array(32);
  r[0] = 0x0f;
  sum8(r, 31);
  return r;
}

export interface RgbSettings {
  mode: number; // 0..19 (0 = LED off)
  brightness: number; // 1..5
  speed: number; // 1..5
  direction: number; // 0 right, 1 down, 2 left, 3 up
  colorful: boolean; // multicolor flag for effects
  color: number; // 0xRRGGBB
}

/** 32-byte LED report (0x05). mode 0 = lights off (only the mode byte matters). */
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

/** 32-byte performance report (0x07): response level + sleep. */
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

/** Game Mode report: also disables Alt+Tab, Alt+F4 and the Win key. */
export function gameModeReport(
  responseLevel: number,
  fnSwitch: number,
  sleepTime: number,
  gameMode: number,
  disableAltTab: number,
  disableAltF4: number,
  disableWin: number
): Uint8Array {
  const r = keyResponseReport(responseLevel, fnSwitch, sleepTime);
  r[12] = gameMode & 0xff;
  r[13] = disableAltTab & 0xff;
  r[14] = disableAltF4 & 0xff;
  r[15] = disableWin & 0xff;
  sum8(r, 31);
  return r;
}

/** Battery query for the 2.4G receiver. */
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

/* ------------------------------ RGB catalogues ----------------------------- */

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

/* ----------------------------- display encoder ----------------------------- */

export type FitMode = "contain" | "cover" | "stretch";

export interface EncodedDisplayStream {
  data: Uint8Array;
  frameCount: number;
  chunkCount: number;
  delays: number[]; // per-frame device delay bytes
}

/**
 * Builds the device display stream: 1 byte frame count, N delay bytes
 * (units of 2 ms), 256-byte header, then RGB565 little-endian frames.
 * Mirrors DisplayEncoder.swift byte-for-byte.
 */
export function buildDisplayStream(
  sources: { bitmap: ImageBitmap; delayMs: number }[],
  fit: FitMode
): EncodedDisplayStream {
  const frameCount = Math.min(sources.length, AULA.maxFrames);
  const payloadLength = AULA.headerLength + frameCount * AULA.frameBytes;
  const chunkCount = Math.ceil(payloadLength / AULA.chunkLength);
  const stream = new Uint8Array(chunkCount * AULA.chunkLength);

  stream[0] = frameCount;
  for (let i = 0; i < frameCount; i++) {
    const seconds = sources[i].delayMs > 0 ? sources[i].delayMs / 1000 : 0.01;
    const value = Math.round(seconds * 500);
    stream[1 + i] = Math.max(1, Math.min(255, value));
  }

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador");

  for (let i = 0; i < frameCount; i++) {
    const bitmap = sources[i].bitmap;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (i === 0) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 128, 128);
    }
    ctx.drawImage(bitmap, ...drawRect(bitmap.width, bitmap.height, fit));

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

  return { data: stream, frameCount, chunkCount, delays: Array.from(stream.subarray(1, 1 + frameCount)) };
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

/** Decodes any browser-supported image (PNG/JPEG/WebP/BMP/first GIF frame). */
export async function decodeStillImage(file: Blob): Promise<{ bitmap: ImageBitmap; delayMs: number }[]> {
  const bitmap = await createImageBitmap(file);
  return [{ bitmap, delayMs: 100 }];
}

/** Decodes an animated GIF into bitmaps + per-frame delays (Chromium ImageDecoder). */
export async function decodeAnimatedGif(file: Blob): Promise<{ bitmap: ImageBitmap; delayMs: number }[]> {
  const data = await file.arrayBuffer();
  if (typeof ImageDecoder === "undefined") return decodeStillImage(file);

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

  const frames: { bitmap: ImageBitmap; delayMs: number }[] = [];
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

export function hexToInt(hex: string): number {
  const clean = hex.replace("#", "");
  return parseInt(clean, 16) & 0xffffff;
}
