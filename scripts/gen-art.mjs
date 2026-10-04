/**
 * Gerador de pixelart 128×128 pro display do Aula F75 Max.
 *
 * Paleta calibrada pra composição do usuário: keycaps branco/cinza + LED ciano #41E8FF.
 * Todas as cores são arredondadas pro espectro EXATO do RGB565 do firmware —
 * o pipeline do web driver (r>>3, g>>2, b>>3) reproduz essas cores sem perda.
 * Loop perfeito: todas as fases usam períodos inteiros sobre o total de frames.
 *
 * v8: F75 shine (badge premium: glint varrendo o logo + partículas),
 * Matrix ciano (chuva de glifos), Pulso EQ com pico que cai,
 * Aurora com estrela cadente.
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
  // dígitos extras pra chuva de glifos (Matrix)
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "6": [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b11110, 0b10001, 0b10001, 0b11110, 0b00001, 0b00001, 0b11110],
};
const GLYPH_KEYS = Object.keys(GLYPHS); // letras + dígitos pra chuva

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

/** Desenha UM glifo 5×7 (pro Matrix) na posição dada. */
function drawGlyph(f, ch, ox, oy, color) {
  const glyph = GLYPHS[ch];
  if (!glyph) return;
  for (let gy = 0; gy < 7; gy++)
    for (let gx = 0; gx < 5; gx++)
      if (glyph[gy] & (1 << (4 - gx))) px(f, ox + gx, oy + gy, color);
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

/** Fundo com grade + cantos em L (base compartilhada dos badges). */
function badgeBase(fr) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (y % 16 === 0) px(fr, x, y, "PANEL");
      else if (x % 16 === 0) px(fr, x, y, "BG2");
      else px(fr, x, y, y < 100 ? "BG" : "BG2");
    }
  const corner = (cx, cy, dx, dy, color) => {
    for (let i = 0; i < 14; i++) {
      px(fr, cx + dx * i, cy, color);
      px(fr, cx, cy + dy * i, color);
    }
  };
  return corner;
}

/** "F75" escala 6 centrado + sombra. Retorna bbox do logo. */
function drawLogo(fr, shadow) {
  const scale = 6;
  const total = 3 * 6 * scale - scale;
  const ox = Math.round((W - total) / 2);
  drawText(fr, "F75", ox, 34, scale, "SILVER", shadow);
  return { ox, oy: 34, w: total, h: 7 * scale };
}

/** "MAX" pequeno embaixo. */
function drawMax(fr, color = "GRAY3") {
  const mscale = 2;
  const mtotal = 3 * 6 * mscale - mscale;
  drawText(fr, "MAX", Math.round((W - mtotal) / 2), 106, mscale, color);
}

/* ------------------- 1. F75 shine (48 frames) · badge premium -------------- */
function f75Shine() {
  const FRAMES = 48;
  const rnd = mulberry(0x51a3 | 0);
  const particles = Array.from({ length: 14 }, (_, i) => ({
    x: Math.floor(rnd() * W),
    y: Math.floor(rnd() * H),
    phase: Math.floor(rnd() * FRAMES), // inteiro → seamless
  }));

  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES;
    const fr = newFrame();
    const corner = badgeBase(fr);

    // cantos pulsando com o glow
    const glow = 0.5 + 0.5 * Math.sin(t * TAU);
    const cornerColor = glow > 0.6 ? "CYAN" : glow > 0.3 ? "GRAY2" : "GRAY1";
    corner(6, 6, 1, 1, cornerColor);
    corner(121, 6, -1, 1, cornerColor);
    corner(6, 121, 1, -1, cornerColor);
    corner(121, 121, -1, -1, cornerColor);

    const shadow = glow > 0.55 ? "CYAN" : glow > 0.25 ? "CYAN_DIM" : "GRAY1";
    const logo = drawLogo(fr, shadow);

    // GLINT diagonal varrendo o logo: clareia pixels prata/ciano próximos à linha
    const sweepX = -24 + t * (W + 48);
    for (let y = logo.oy - 2; y < logo.oy + logo.h + 2; y++) {
      for (let x = logo.ox - 6; x < logo.ox + logo.w + 6; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const d = Math.abs(x - (sweepX + (y - logo.oy) * 0.6));
        if (d >= 3.5) continue;
        const cur = fr[y * W + x];
        if (d < 1.5 && cur === idx("SILVER")) px(fr, x, y, "WHITE");
        else if (cur === idx("SILVER")) px(fr, x, y, "CYAN_HI");
        else if (cur === idx("CYAN") || cur === idx("CYAN_DIM")) px(fr, x, y, "CYAN_HI");
      }
    }

    // sublinhado com brilho residual do glint
    const sweep2 = Math.round(t * (W + 44)) - 44;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - sweep2);
      if (d < 10) px(fr, x, 92, d < 3 ? "CYAN_HI" : "CYAN");
      else if (d < 22) px(fr, x, 92, "CYAN_DIM");
      else if (x % 4 === 0) px(fr, x, 92, "GRAY1");
    }

    drawMax(fr, "GRAY3");

    // partículas prateadas subindo (1 volta por loop = seamless)
    for (const p of particles) {
      const py = (p.y - t * H + H) % H;
      const wobble = Math.round(2 * Math.sin(t * TAU * 2 + p.phase));
      const tw = Math.sin(t * TAU + (p.phase / FRAMES) * TAU);
      if (tw > -0.2) px(fr, (p.x + wobble + W) % W, Math.round(py), tw > 0.5 ? "WHITE" : "SILVER");
    }

    out.push(fr);
  }
  return out;
}

/* -------------------- 2. Matrix ciano (72 frames) -------------------------- */
function matrixCiano() {
  const FRAMES = 72;
  const COLS = 16; // célula 8×8
  const ROWS = 16;
  const rnd = mulberry(0x6d47);

  // por coluna: velocidade (células por loop — múltiplo de ROWS = seamless),
  // comprimento do rastro e defasagem inicial
  const cols = Array.from({ length: COLS }, (_, c) => ({
    speed: 16 * (1 + (c % 3 === 0 ? 1 : 0)), // 16 ou 32 células/loop
    trail: 5 + Math.floor(rnd() * 8), // 5..12
    offset: rnd() * ROWS,
  }));

  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES;
    const fr = newFrame();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) px(fr, x, y, (x + y) % 32 === 0 ? "BG2" : "BG");

    for (let c = 0; c < COLS; c++) {
      const col = cols[c];
      const head = (col.offset + col.speed * t) % ROWS; // posição do cabeçote (células)
      for (let r = 0; r < ROWS; r++) {
        const d = (head - r + ROWS * 2) % ROWS; // distância atrás do cabeçote
        if (d > col.trail) continue;
        // glifo estável enquanto cai: muda a cada avanço inteiro de célula
        const k = (Math.floor(head) - r + ROWS * 2) % ROWS;
        const ch = GLYPH_KEYS[(c * 31 + k * 17 + 7) % GLYPH_KEYS.length];
        const gx = c * 8 + 1;
        const gy = r * 8;
        let color;
        if (d < 1) color = "WHITE";
        else if (d < 2.5) color = "CYAN_HI";
        else if (d < col.trail * 0.55) color = "CYAN";
        else color = "CYAN_DIM";
        drawGlyph(fr, ch, gx, gy, color);
      }
    }
    out.push(fr);
  }
  return out;
}

/* ------------------------ 3. Pulso EQ (60 frames) ------------------------- */
function pulseEq() {
  const FRAMES = 60;
  const BARS = 14;
  const BW = 7;
  const GAP = 2;
  const total = BARS * BW + (BARS - 1) * GAP; // 124
  const ox = Math.floor((W - total) / 2);
  const BASE = 108; // linha de base
  const MAXH = 92;
  const PEAK_WIN = 10; // janela do pico (frames) — cai sozinho depois

  // alturas por barra/frame (ciclos inteiros = seamless)
  const heights = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES;
    const row = [];
    for (let b = 0; b < BARS; b++) {
      const cycles = 1 + (b % 4);
      const phase = (b / BARS) * TAU;
      const amp = 0.25 + 0.75 * Math.abs(Math.sin(t * TAU * cycles + phase));
      row.push(Math.max(4, Math.round(amp * MAXH)));
    }
    heights.push(row);
  }

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
      const h = heights[f][b];
      // pico = máximo da janela recente (cai quando a barra desce)
      let peak = 0;
      for (let w = 0; w < PEAK_WIN; w++) peak = Math.max(peak, heights[(f - w + FRAMES) % FRAMES][b]);
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
      // marca do pico (flutuando acima da barra)
      if (peak > h + 2) {
        const py = BASE - peak;
        for (let x = bx + 1; x < bx + BW - 1; x++) px(fr, x, py, "SILVER");
        for (let x = bx + 2; x < bx + BW - 2; x++) px(fr, x, py + 1, "GRAY3");
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
writeArt(f75Shine(), "public/art/f75-shine.gif");
writeArt(matrixCiano(), "public/art/matrix-ciano.gif");
writeArt(pulseEq(), "public/art/pulse-eq.gif");
console.log(
  "paleta 565-exata:",
  Object.entries(PAL)
    .map(([k, v]) => `${k}=#${v.map((c) => c.toString(16).padStart(2, "0")).join("")}`)
    .join(" ")
);
