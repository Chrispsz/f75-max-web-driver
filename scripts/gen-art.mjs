/**
 * Gerador de pixelart 128×128 pro display do Aula F75 Max.
 *
 * Paleta calibrada pra composição do usuário: keycaps branco/cinza + LED ciano #41E8FF.
 * Todas as cores são arredondadas pro espectro EXATO do RGB565 do firmware —
 * o pipeline do web driver (r>>3, g>>2, b>>3) reproduz essas cores sem perda.
 * Loop perfeito: todas as fases usam períodos inteiros sobre o total de frames.
 *
 * Uso: bun scripts/gen-art.mjs  (saída em public/art/)
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 128;
const H = 128;

/** Arredonda uma cor RGB pro espectro exato do RGB565 (o mesmo corte do firmware). */
const rgb565 = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return [(r >> 3) << 3, (g >> 2) << 2, (b >> 3) << 3];
};

// Paleta compartilhada (índices estáveis pra todos os frames)
const PALETTE_DEF = {
  BG: "#030608",
  BG2: "#0a1216",
  PANEL: "#131c21",
  GRAY1: "#232d33",
  GRAY2: "#3d4a51",
  GRAY3: "#6f8089",
  SILVER: "#bfcdd3",
  WHITE: "#f0f4f6",
  CYAN_DIM: "#0c5a68",
  CYAN: "#41e8ff",
  CYAN_HI: "#aef2ff",
};
const PAL = Object.fromEntries(Object.entries(PALETTE_DEF).map(([k, v]) => [k, rgb565(v)]));
const PALETTE = Object.values(PAL); // ordem = índice no GIF

const idx = (name) => Object.keys(PAL).indexOf(name);

/** Frame = Uint8Array de índices de paleta (W*H). */
const newFrame = () => new Uint8Array(W * H);
const px = (f, x, y, name) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  f[y * W + x] = idx(name);
};

/** Glifos 5×7 (linhas em binário, MSB à esquerda). */
const GLYPHS = {
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  "7": [0b11111, 0b00001, 0b00001, 0b00010, 0b00100, 0b00100, 0b00100],
  "5": [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
};

/** Desenha texto 5×7 escalado. Retorna largura total. */
function drawText(f, text, ox, oy, scale, color, shadow) {
  let cursor = ox;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) {
      cursor += 6 * scale;
      continue;
    }
    if (shadow) {
      for (let gy = 0; gy < 7; gy++)
        for (let gx = 0; gx < 5; gx++)
          if (glyph[gy] & (1 << (4 - gx)))
            for (let sy = 0; sy < scale; sy++)
              for (let sx = 0; sx < scale; sx++)
                px(f, cursor + gx * scale + sx + scale - 1, oy + gy * scale + sy + scale - 1, shadow);
    }
    for (let gy = 0; gy < 7; gy++)
      for (let gx = 0; gx < 5; gx++)
        if (glyph[gy] & (1 << (4 - gx)))
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++) px(f, cursor + gx * scale + sx, oy + gy * scale + sy, color);
    cursor += 6 * scale;
  }
  return cursor - ox;
}

/** PRNG determinístico (starfield estável entre frames). */
const mulberry = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const TAU = Math.PI * 2;

/* ------------------------- 1. F75 badge (30 frames) ------------------------ */
function f75Badge() {
  const FRAMES = 30;
  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES;
    const fr = newFrame();

    // fundo escuro com grade apagada
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (y % 16 === 0) px(fr, x, y, "PANEL");
        else if (x % 16 === 0) px(fr, x, y, "BG2");
        else px(fr, x, y, y < 100 ? "BG" : "BG2");
      }

    // cantos em L (brackets)
    const corner = (cx, cy, dx, dy) => {
      for (let i = 0; i < 14; i++) {
        px(fr, cx + dx * i, cy, "GRAY2");
        px(fr, cx, cy + dy * i, "GRAY2");
      }
    };
    corner(6, 6, 1, 1);
    corner(121, 6, -1, 1);
    corner(6, 121, 1, -1);
    corner(121, 121, -1, -1);

    // pulso de brilho: sombra do logo alterna GRAY1 → CYAN_DIM → CYAN
    const glow = 0.5 + 0.5 * Math.sin(t * TAU);
    const shadow = glow > 0.55 ? "CYAN" : glow > 0.25 ? "CYAN_DIM" : "GRAY1";

    // "F75" grande centralizado — prata com sombra ciano pulsante
    const scale = 6;
    const total = 3 * 6 * scale - scale; // 3 chars × 6 col × scale − espaçamento final
    const ox = Math.round((W - total) / 2);
    drawText(fr, "F75", ox, 34, scale, "SILVER", shadow);

    // sublinhado varrendo (loop perfeito)
    const sweep = Math.round(t * (W + 44)) - 44;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - sweep);
      if (d < 10) px(fr, x, 92, d < 3 ? "CYAN_HI" : "CYAN");
      else if (d < 22) px(fr, x, 92, "CYAN_DIM");
      else if (x % 4 === 0) px(fr, x, 92, "GRAY1");
    }

    // "MAX" pequeno embaixo, cinza
    const mscale = 2;
    const mtotal = 3 * 6 * mscale - mscale;
    drawText(fr, "MAX", Math.round((W - mtotal) / 2), 106, mscale, "GRAY3");

    out.push(fr);
  }
  return out;
}

/* ------------------------ 2. Aurora ciano (90 frames) ---------------------- */
function auroraCiano() {
  const FRAMES = 90;
  // starfield determinístico
  const rnd = mulberry(0xf75);
  const stars = Array.from({ length: 26 }, () => ({
    x: Math.floor(rnd() * W),
    y: Math.floor(rnd() * H),
    phase: Math.floor(rnd() * 45) * 2, // múltiplo de 2π no loop → seamless
  }));

  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = (f / FRAMES) * TAU;
    const fr = newFrame();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // 3 ondas com períodos inteiros → loop perfeito
        const v =
          Math.sin((x / W) * TAU * 2 + t) +
          Math.sin((y / H) * TAU * 1.5 - t) * 0.8 +
          Math.sin(((x + y) / (W + H)) * TAU * 2 + t * 2) * 0.5;
        const n = (v / 2.3 + 1) / 2; // 0..1
        // posterização em bandas (estética pixelart)
        let name;
        if (n > 0.86) name = "WHITE";
        else if (n > 0.74) name = "CYAN_HI";
        else if (n > 0.58) name = "CYAN";
        else if (n > 0.44) name = "CYAN_DIM";
        else if (n > 0.32) name = "GRAY2";
        else if (n > 0.22) name = "GRAY1";
        else name = "BG";
        px(fr, x, y, name);
      }
    }
    // estrelas prateadas piscando (fase inteira → seamless)
    for (const s of stars) {
      const tw = Math.sin(t + s.phase);
      if (tw > 0.3) px(fr, s.x, s.y, tw > 0.85 ? "WHITE" : "SILVER");
    }
    // moldura fina
    for (let x = 0; x < W; x++) {
      px(fr, x, 0, "GRAY1");
      px(fr, x, 127, "GRAY1");
    }
    for (let y = 0; y < H; y++) {
      px(fr, 0, y, "GRAY1");
      px(fr, 127, y, "GRAY1");
    }
    out.push(fr);
  }
  return out;
}

/* ------------------------- 3. Pulso EQ (60 frames) ------------------------- */
function pulseEq() {
  const FRAMES = 60;
  const BARS = 14;
  const BW = 7;
  const GAP = 2;
  const total = BARS * BW + (BARS - 1) * GAP; // 124
  const ox = Math.floor((W - total) / 2);
  const BASE = 108; // linha de base
  const MAXH = 92;

  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES;
    const fr = newFrame();
    // fundo + grade vertical apagada
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (x % 16 === 0) px(fr, x, y, "BG2");
        else px(fr, x, y, "BG");
      }
    // topo: título "F75" minúsculo
    drawText(fr, "F75", ox, 6, 1, "GRAY3");

    for (let b = 0; b < BARS; b++) {
      // cada barra: nº inteiro de oscilações por loop → seamless
      const cycles = 1 + (b % 4);
      const phase = (b / BARS) * TAU;
      const amp = 0.25 + 0.75 * Math.abs(Math.sin(t * TAU * cycles + phase));
      const h = Math.max(4, Math.round(amp * MAXH));
      const bx = ox + b * (BW + GAP);
      for (let i = 0; i < h; i++) {
        const y = BASE - i;
        let name;
        if (i >= h - 2) name = "WHITE"; // cap branco
        else if (i > h * 0.66) name = "CYAN_HI";
        else if (i > h * 0.33) name = "CYAN";
        else if (i > 6) name = "CYAN_DIM";
        else name = "GRAY2";
        for (let x = bx; x < bx + BW; x++) px(fr, x, y, name);
      }
    }
    // linha de base + reflexo apagado
    for (let x = ox - 2; x < ox + total + 2; x++) {
      px(fr, x, BASE + 1, "GRAY2");
      px(fr, x, BASE + 3, "GRAY1");
      px(fr, x, BASE + 5, "BG2");
    }
    out.push(fr);
  }
  return out;
}

/* ------------------------------- encoder ---------------------------------- */
const DELAY = 66; // ms → vira 7 centiseconds no GIF ≈ 14 fps (sweet spot do device)

function writeArt(frames, file) {
  const enc = GIFEncoder();
  frames.forEach((fr, i) => {
    enc.writeFrame(fr, W, H, {
      palette: PALETTE,
      delay: DELAY,
      first: i === 0,
      repeat: 0, // loop infinito
    });
  });
  enc.finish();
  const bytes = enc.bytes();
  writeFileSync(file, bytes);
  console.log(`${file} · ${frames.length} frames · ${(bytes.length / 1024).toFixed(0)} KB`);
}

mkdirSync("public/art", { recursive: true });
writeArt(f75Badge(), "public/art/f75-badge.gif");
writeArt(auroraCiano(), "public/art/aurora-ciano.gif");
writeArt(pulseEq(), "public/art/pulse-eq.gif");
console.log(
  "paleta 565-exata:",
  Object.entries(PAL)
    .map(([k, v]) => `${k}=#${v.map((c) => c.toString(16).padStart(2, "0")).join("")}`)
    .join(" ")
);
