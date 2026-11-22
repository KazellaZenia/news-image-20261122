// main.ts — news-image-20261122
// "THE WORLD IN ONE DAY — Sunday 22 November 2026"
// Renders a 1024x1024 front page to $MAKEFUN_OUTPUT_DIR/entry.png.
// Node stdlib only. No network, no randomness, no Date: fully deterministic.
// Original vector-stroke type, original drawings, original layout.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [248, 245, 238];
const INK: RGB = [26, 26, 26];
const RED: RGB = [163, 30, 34];
const BLUE: RGB = [29, 78, 137];
const GOLD: RGB = [146, 110, 24];
const GREY: RGB = [96, 92, 84];
const LIGHT: RGB = [232, 227, 214];
const SEA: RGB = [213, 227, 233];
const LAND: RGB = [206, 194, 152];
const LANDLINE: RGB = [138, 127, 92];
const WHITE: RGB = [255, 255, 255];

function setPx(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      i += 3;
    }
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r2) setPx(xx, yy, c);
    }
  }
}

function line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const r = Math.max(0.5, w / 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    disc(x0 + dx * t, y0 + dy * t, r, c);
  }
}

type Pt = [number, number];
function polyline(pts: Pt[], w: number, c: RGB, closed = false): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  }
  if (closed && pts.length > 2) {
    line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], w, c);
  }
}

function fillPoly(pts: Pt[], c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.max(0, Math.ceil(minY)); y <= Math.min(H - 1, Math.floor(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
        setPx(x, y, c);
      }
    }
  }
}

function circlePts(cx: number, cy: number, r: number, n = 28): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 28): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

function starPts(cx: number, cy: number, rO: number, rI: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? rO : rI;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// ---------------------------------------------------------------- PNG out
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------- vector stroke font
// Single-stroke letterforms drawn with lines, on a 10-wide x 14-tall grid
// (baseline y=14; lowercase descenders reach y=19). Clean vector type,
// not a bitmap font: every glyph is a set of pen strokes.
const GLYPHS: Record<string, string> = {
  A: "0,14 5,0 10,14|2,9 8,9",
  B: "0,0 0,14|0,0 6,0 9,2 9,5 6,7 0,7|6,7 9,9 9,12 6,14 0,14",
  C: "9,3 7,1 3,1 1,3 0,7 1,11 3,13 7,13 9,11",
  D: "0,0 0,14|0,0 6,0 9,3 9,11 6,14 0,14",
  E: "9,0 0,0 0,14 9,14|0,7 7,7",
  F: "0,14 0,0 9,0|0,7 7,7",
  G: "9,3 7,1 3,1 1,3 0,7 1,11 3,13 7,13 9,11 9,7|9,7 6,7",
  H: "0,0 0,14|10,0 10,14|0,7 10,7",
  I: "3,0 7,0|5,0 5,14|3,14 7,14",
  J: "8,0 8,12 5,14 2,13",
  K: "0,0 0,14|9,0 0,7 10,14",
  L: "0,0 0,14 9,14",
  M: "0,14 0,0 5,8 10,0 10,14",
  N: "0,14 0,0 10,14 10,0",
  O: "3,0 7,0 9,3 9,11 7,14 3,14 1,11 1,3 3,0",
  P: "0,14 0,0 7,0 9,2 9,6 7,8 0,8",
  Q: "3,0 7,0 9,3 9,11 7,14 3,14 1,11 1,3 3,0|6,11 10,14",
  R: "0,14 0,0 7,0 9,2 9,6 7,8 0,8|6,8 10,14",
  S: "8,2 6,0 3,0 1,2 1,5 3,7 7,7 9,9 9,12 7,14 4,14 2,12",
  T: "0,0 10,0|5,0 5,14",
  U: "0,0 0,11 2,14 8,14 10,11 10,0",
  V: "0,0 5,14 10,0",
  W: "0,0 2,14 5,8 8,14 10,0",
  X: "0,0 10,14|10,0 0,14",
  Y: "0,0 5,7 10,0|5,7 5,14",
  Z: "0,0 10,0 0,14 10,14",
  "0": "3,0 7,0 9,3 9,11 7,14 3,14 1,11 1,3 3,0",
  "1": "5,0 5,14|3,2 5,0|2,14 8,14",
  "2": "1,3 2,1 7,1 9,3 9,6 5,10 1,14 9,14",
  "3": "1,2 3,0 7,0 9,2 9,6 7,8 5,8|7,8 9,10 9,12 7,14 3,14 1,12",
  "4": "1,10 7,0 7,14|0,10 8,10",
  "5": "9,0 1,0 1,7 8,7 9,9 9,12 7,14 3,14 1,12",
  "6": "9,2 7,0 3,0 1,3 0,7 1,11 3,14 7,14 9,11 9,8 6,7 2,7",
  "7": "0,0 10,0 6,14",
  "8": "3,0 7,0 9,2 9,6 7,8 3,8 1,6 1,2 3,0|3,8 7,8 9,10 9,12 7,14 3,14 1,12 1,10 3,8",
  "9": "9,13 7,14 3,14 1,12 1,9 3,7 7,7 9,5 9,2 7,0 3,0 1,3",
  a: "1,9 3,6 7,6 8,8 8,13 6,14 3,14 1,12|8,5 8,14",
  b: "1,0 1,14|1,9 3,6 7,6 9,9 9,12 7,14 3,14 1,12",
  c: "8,7 6,6 3,6 1,8 1,12 3,14 6,14 8,12",
  d: "9,0 9,14|9,9 7,6 3,6 1,9 1,12 3,14 7,14 9,12",
  e: "8,10 6,6 3,6 1,9 1,12 3,14 7,14 9,11|1,10 8,10",
  f: "6,0 4,1 3,4 3,14|3,6 8,6",
  g: "9,6 7,6 3,6 1,9 1,12 3,14 7,14 9,12|9,6 9,16 7,18 4,18 2,16",
  h: "1,0 1,14|1,8 3,6 7,6 9,8 9,14",
  i: "5,6 5,14|5,1 5,3",
  j: "6,6 6,15 4,17 2,16|6,1 6,3",
  k: "1,0 1,14|8,6 1,10 9,14",
  l: "5,0 5,14",
  m: "1,14 1,6 3,5 5,6 5,14|5,6 7,5 9,6 9,14",
  n: "1,14 1,6 3,5 7,5 9,7 9,14",
  o: "3,6 7,6 9,9 9,12 7,14 3,14 1,11 1,9 3,6",
  p: "1,6 1,18|1,10 3,6 7,6 9,9 9,12 7,14 3,14 1,12",
  q: "9,6 9,18|9,10 7,6 3,6 1,9 1,12 3,14 7,14 9,12",
  r: "1,14 1,6 4,5 7,6|1,10 4,8 7,7",
  s: "8,7 6,5 3,5 1,8 3,10 7,10 9,12 7,14 4,14 2,13",
  t: "5,1 5,14|2,6 8,6",
  u: "1,6 1,12 3,14 7,14 9,12 9,6",
  v: "1,6 5,14 9,6",
  w: "1,6 3,14 5,9 7,14 9,6",
  x: "1,6 9,14|9,6 1,14",
  y: "1,6 5,13 9,6|5,13 5,18 3,19 1,17",
  z: "1,6 9,6 1,14 9,14",
  ".": "5,13 5,14",
  ",": "5,13 5,15 4,17 3,17",
  ":": "5,5 5,6|5,12 5,13",
  ";": "5,5 5,6|5,12 5,14 4,16 3,16",
  "'": "5,0 5,3",
  '"': "3,0 3,3|7,0 7,3",
  "!": "5,0 5,10|5,13 5,14",
  "?": "2,3 3,1 6,0 8,2 8,5 6,7 5,8 5,10|5,13 5,14",
  "-": "1,8 9,8",
  "(": "7,0 4,3 3,7 4,11 7,14",
  ")": "3,0 6,3 7,7 6,11 3,14",
  "/": "8,0 2,14",
  "%": "9,0 1,14|2,2 4,2 4,4 2,4|6,10 8,10 8,12 6,12",
  $: "5,0 5,14|1,4 3,1 7,1 9,3 9,6 7,8 3,8 1,10 1,12 3,14 7,14 9,12",
  "+": "5,4 5,12|1,8 9,8",
  "=": "1,6 9,6|1,11 9,11",
  "°": "3,2 5,1 7,2 7,4 5,5 3,4 3,2",
};

const PARSED: Record<string, Pt[][]> = {};
for (const [ch, def] of Object.entries(GLYPHS)) {
  PARSED[ch] = def.split("|").map((s) =>
    s
      .trim()
      .split(/\s+/)
      .map((p) => {
        const [a, b] = p.split(",").map(Number);
        return [a, b] as Pt;
      }),
  );
}

const NARROW = new Set(["i", "l", "I", ".", ",", ":", ";", "'", "!", "/", "(", ")", "-"]);
function adv(ch: string): number {
  if (ch === " ") return 6;
  if (ch === "m" || ch === "w" || ch === "M" || ch === "W") return 13;
  if (NARROW.has(ch)) return 6.5;
  return 11;
}

function textWidth(s: string, sc: number, track = 0): number {
  let w = 0;
  for (const ch of s) w += (adv(ch) + track) * sc;
  return w;
}

function drawGlyph(ch: string, x: number, y: number, sc: number, wt: number, c: RGB): void {
  const strokes = PARSED[ch];
  if (!strokes) return;
  for (const st of strokes) {
    const pts = st.map(([gx, gy]) => [x + gx * sc, y + gy * sc] as Pt);
    polyline(pts, wt, c);
  }
}

function drawText(
  s: string,
  x: number,
  y: number,
  sc: number,
  c: RGB,
  wt = 1,
  align: "l" | "c" | "r" = "l",
  track = 0,
): void {
  let xx = x;
  if (align === "c") xx = x - textWidth(s, sc, track) / 2;
  if (align === "r") xx = x - textWidth(s, sc, track);
  for (const ch of s) {
    if (ch === "•") {
      disc(xx + 3 * sc, y + 7 * sc, Math.max(1.4, 2.1 * sc), c);
    } else {
      drawGlyph(ch, xx, y, sc, wt, c);
    }
    xx += (adv(ch) + track) * sc;
  }
}

function wrap(s: string, maxW: number, sc: number, track = 0): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, sc, track) <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPara(
  s: string,
  x: number,
  y: number,
  maxW: number,
  sc: number,
  c: RGB,
  lh: number,
  wt = 1,
  maxLines = 99,
  track = 0,
): number {
  const lines = wrap(s, maxW, sc, track).slice(0, maxLines);
  lines.forEach((ln, i) => drawText(ln, x, y + i * lh, sc, c, wt, "l", track));
  return y + lines.length * lh;
}

// ------------------------------------------------------------------ icons
// Small original line drawings, one per illustrated lead story.
function drawIcon(kind: string, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  fillRect(x, y, w, h, LIGHT);
  line(x, y + h - 1, x + w, y + h - 1, 1, GREY);
  switch (kind) {
    case "globe": {
      polyline(circlePts(cx, cy, 15), 2, BLUE, true);
      polyline(ellipsePts(cx, cy, 15, 6), 1.5, BLUE, true);
      polyline(ellipsePts(cx, cy, 6, 15), 1.5, BLUE, true);
      line(cx - 15, cy, cx + 15, cy, 1.5, BLUE);
      disc(cx - 6, cy - 6, 2.5, RED);
      break;
    }
    case "ship": {
      fillPoly(
        [
          [x + 8, cy + 2],
          [x + w - 8, cy + 2],
          [x + w - 16, cy + 12],
          [x + 16, cy + 12],
        ],
        INK,
      );
      fillRect(x + 22, cy - 10, 14, 12, BLUE);
      fillRect(x + 40, cy - 6, 14, 8, RED);
      fillRect(x + 58, cy - 12, 12, 14, GOLD);
      polyline(
        [
          [x + 30, cy - 16],
          [x + 34, cy - 22],
          [x + 30, cy - 28],
        ],
        2,
        GREY,
      );
      polyline(
        [
          [x + 6, cy + 18],
          [x + 26, cy + 14],
          [x + 46, cy + 18],
          [x + 66, cy + 14],
          [x + w - 6, cy + 18],
        ],
        2,
        BLUE,
      );
      break;
    }
    case "badge": {
      fillPoly(
        [
          [cx, y + 4],
          [cx + 15, y + 9],
          [cx + 13, y + 26],
          [cx, y + 36],
          [cx - 13, y + 26],
          [cx - 15, y + 9],
        ],
        BLUE,
      );
      fillPoly(starPts(cx, cy - 1, 9, 4), GOLD);
      break;
    }
    case "quake": {
      fillRect(x + 14, cy - 8, 16, 22, INK);
      fillPoly(
        [
          [x + 44, cy - 14],
          [x + 60, cy - 10],
          [x + 58, cy + 14],
          [x + 42, cy + 14],
        ],
        RED,
      );
      polyline(
        [
          [x + 6, cy + 16],
          [x + 22, cy + 12],
          [x + 34, cy + 18],
          [x + 52, cy + 10],
          [x + 70, cy + 16],
          [x + w - 6, cy + 12],
        ],
        2.5,
        INK,
      );
      break;
    }
    case "hospital": {
      fillRect(cx - 14, cy - 14, 28, 28, WHITE);
      polyline(
        [
          [cx - 14, cy - 14],
          [cx + 14, cy - 14],
          [cx + 14, cy + 14],
          [cx - 14, cy + 14],
          [cx - 14, cy - 14],
        ],
        2,
        INK,
      );
      fillRect(cx - 3, cy - 10, 6, 20, RED);
      fillRect(cx - 10, cy - 3, 20, 6, RED);
      break;
    }
    case "missile": {
      fillPoly(
        [
          [cx - 16, cy - 4],
          [cx + 8, cy - 4],
          [cx + 18, cy],
          [cx + 8, cy + 4],
          [cx - 16, cy + 4],
        ],
        INK,
      );
      fillPoly(
        [
          [cx - 16, cy - 4],
          [cx - 22, cy - 10],
          [cx - 16, cy + 4],
        ],
        RED,
      );
      fillPoly(
        [
          [cx - 22, cy],
          [cx - 30, cy - 4],
          [cx - 30, cy + 4],
        ],
        GOLD,
      );
      line(x + 8, cy - 12, x + 30, cy - 12, 2, GREY);
      line(x + 8, cy + 12, x + 30, cy + 12, 2, GREY);
      break;
    }
    case "flame": {
      fillPoly(
        [
          [cx, y + 4],
          [cx + 10, y + 18],
          [cx + 8, y + 30],
          [cx - 8, y + 30],
          [cx - 10, y + 18],
        ],
        RED,
      );
      fillPoly(
        [
          [cx, y + 16],
          [cx + 5, y + 24],
          [cx, y + 30],
          [cx - 5, y + 24],
        ],
        GOLD,
      );
      break;
    }
    case "rocket": {
      fillPoly(
        [
          [cx, y + 4],
          [cx + 7, y + 14],
          [cx + 7, y + 26],
          [cx - 7, y + 26],
          [cx - 7, y + 14],
        ],
        INK,
      );
      fillPoly(
        [
          [cx - 7, y + 24],
          [cx - 13, y + 32],
          [cx - 7, y + 30],
        ],
        RED,
      );
      fillPoly(
        [
          [cx + 7, y + 24],
          [cx + 13, y + 32],
          [cx + 7, y + 30],
        ],
        RED,
      );
      fillPoly(
        [
          [cx - 4, y + 30],
          [cx + 4, y + 30],
          [cx, y + 38],
        ],
        GOLD,
      );
      line(x + 6, cy - 10, x + 18, cy - 10, 2, GREY);
      line(x + 6, cy + 2, x + 18, cy + 2, 2, GREY);
      break;
    }
    case "shield": {
      fillPoly(
        [
          [cx, y + 4],
          [cx + 15, y + 9],
          [cx + 13, y + 26],
          [cx, y + 36],
          [cx - 13, y + 26],
          [cx - 15, y + 9],
        ],
        INK,
      );
      polyline(
        [
          [cx - 8, cy],
          [cx - 2, cy + 6],
          [cx + 9, cy - 6],
        ],
        3,
        WHITE,
      );
      break;
    }
    case "scales": {
      line(cx, y + 6, cx, y + 34, 2.5, INK);
      line(cx - 16, y + 10, cx + 16, y + 10, 2.5, INK);
      line(cx - 16, y + 10, cx - 20, y + 20, 2, INK);
      line(cx - 16, y + 10, cx - 12, y + 20, 2, INK);
      line(cx - 20, y + 20, cx - 12, y + 20, 2, INK);
      line(cx + 16, y + 10, cx + 12, y + 20, 2, INK);
      line(cx + 16, y + 10, cx + 20, y + 20, 2, INK);
      line(cx + 12, y + 20, cx + 20, y + 20, 2, INK);
      line(cx - 12, y + 34, cx + 12, y + 34, 2.5, INK);
      break;
    }
    case "cross": {
      polyline(circlePts(cx, cy, 16), 2, RED, true);
      fillRect(cx - 3, cy - 10, 6, 20, RED);
      fillRect(cx - 10, cy - 3, 20, 6, RED);
      break;
    }
    case "flags": {
      line(cx - 12, y + 6, cx - 12, y + 34, 2, INK);
      line(cx, y + 6, cx, y + 34, 2, INK);
      line(cx + 12, y + 6, cx + 12, y + 34, 2, INK);
      fillPoly(
        [
          [cx - 12, y + 6],
          [cx - 12, y + 16],
          [cx - 1, y + 11],
        ],
        RED,
      );
      fillPoly(
        [
          [cx, y + 6],
          [cx, y + 16],
          [cx + 11, y + 11],
        ],
        BLUE,
      );
      fillPoly(
        [
          [cx + 12, y + 6],
          [cx + 12, y + 16],
          [cx + 23, y + 11],
        ],
        GOLD,
      );
      break;
    }
    case "ball": {
      polyline(circlePts(cx, cy, 16), 2, INK, true);
      fillPoly(starPts(cx, cy, 7, 3), INK);
      polyline(
        [
          [cx, cy - 16],
          [cx, cy - 7],
        ],
        1.5,
        INK,
      );
      polyline(
        [
          [cx - 15, cy + 5],
          [cx - 7, cy + 2],
        ],
        1.5,
        INK,
      );
      polyline(
        [
          [cx + 15, cy + 5],
          [cx + 7, cy + 2],
        ],
        1.5,
        INK,
      );
      break;
    }
  }
}

// ------------------------------------------------------------ big scenes
function drawScene(kind: string, x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  line(x, y + h - 1, x + w, y + h - 1, 1, GREY);
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (kind === "cop31") {
    disc(x + 52, y + 20, 12, GOLD);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(
        x + 52 + Math.cos(a) * 16,
        y + 20 + Math.sin(a) * 16,
        x + 52 + Math.cos(a) * 22,
        y + 20 + Math.sin(a) * 22,
        2,
        GOLD,
      );
    }
    polyline(circlePts(cx + 30, cy + 6, 24), 2.5, BLUE, true);
    polyline(ellipsePts(cx + 30, cy + 6, 24, 9), 1.5, BLUE, true);
    polyline(ellipsePts(cx + 30, cy + 6, 9, 24), 1.5, BLUE, true);
    fillRect(x + 10, y + h - 18, 18, 18, INK);
    fillRect(x + 32, y + h - 26, 18, 26, BLUE);
    fillRect(x + 54, y + h - 14, 18, 14, RED);
    fillRect(x + w - 90, y + h - 22, 18, 22, INK);
    fillRect(x + w - 68, y + h - 30, 18, 30, BLUE);
    fillRect(x + w - 46, y + h - 16, 18, 16, GOLD);
    fillRect(x + w - 24, y + h - 24, 18, 24, RED);
  } else if (kind === "sparta") {
    fillPoly(
      [
        [x + 60, cy - 6],
        [x + w - 60, cy - 6],
        [x + w - 80, cy + 12],
        [x + 80, cy + 12],
      ],
      INK,
    );
    fillRect(x + 110, cy - 24, 30, 18, BLUE);
    fillRect(x + 146, cy - 18, 30, 12, RED);
    fillRect(x + 182, cy - 28, 26, 22, GOLD);
    fillPoly(
      [
        [cx - 40, cy - 26],
        [cx - 28, cy - 8],
        [cx - 34, cy - 2],
        [cx - 46, cy - 8],
      ],
      RED,
    );
    fillPoly(
      [
        [cx + 10, cy - 30],
        [cx + 22, cy - 10],
        [cx + 14, cy - 2],
        [cx + 2, cy - 10],
      ],
      GOLD,
    );
    polyline(
      [
        [x + 8, cy + 20],
        [x + 60, cy + 14],
        [x + 120, cy + 20],
        [x + 180, cy + 14],
        [x + 240, cy + 20],
        [x + w - 8, cy + 14],
      ],
      2.5,
      BLUE,
    );
    polyline(
      [
        [x + 8, cy + 28],
        [x + 70, cy + 24],
        [x + 140, cy + 28],
        [x + 210, cy + 24],
        [x + w - 8, cy + 28],
      ],
      2,
      BLUE,
    );
  } else if (kind === "mexico") {
    fillPoly(
      [
        [x + 10, y + h - 10],
        [x + 70, y + 12],
        [x + 130, y + h - 10],
      ],
      BLUE,
    );
    fillPoly(
      [
        [x + 90, y + h - 10],
        [x + 160, y + 4],
        [x + 230, y + h - 10],
      ],
      INK,
    );
    fillPoly(
      [
        [x + 190, y + h - 10],
        [x + 250, y + 16],
        [x + w - 10, y + h - 10],
      ],
      RED,
    );
    disc(x + 52, y + 16, 10, GOLD);
    fillPoly(starPts(cx + 60, cy - 2, 14, 6), GOLD);
    polyline(circlePts(cx + 60, cy - 2, 18), 2, GOLD, true);
  }
}

// ------------------------------------------------------------------- map
// Rough continent outlines in lon/lat, drawn equirectangular.
const NORTH_AMERICA: Pt[] = [
  [-168, 66], [-140, 70], [-125, 72], [-110, 73], [-95, 80], [-85, 80], [-80, 73],
  [-75, 72], [-65, 60], [-55, 52], [-60, 46], [-70, 42], [-75, 35], [-80, 32],
  [-81, 26], [-84, 30], [-90, 21], [-97, 16], [-92, 15], [-86, 12], [-83, 9],
  [-79, 9], [-85, 11], [-90, 14], [-97, 16], [-105, 20], [-110, 24], [-114, 28],
  [-120, 34], [-125, 40], [-124, 48], [-130, 55], [-145, 60], [-155, 58], [-165, 60],
];
const SOUTH_AMERICA: Pt[] = [
  [-79, 9], [-77, 4], [-80, -3], [-81, -6], [-77, -12], [-72, -18], [-70, -23],
  [-70, -30], [-73, -37], [-73, -44], [-74, -50], [-70, -54], [-66, -55], [-68, -50],
  [-65, -45], [-62, -40], [-58, -35], [-52, -32], [-48, -28], [-41, -23], [-39, -17],
  [-35, -9], [-35, -6], [-40, -3], [-44, -2], [-50, 0], [-53, 4], [-58, 6],
  [-62, 9], [-68, 11], [-72, 12], [-77, 8],
];
const AFRICA: Pt[] = [
  [-6, 35], [-10, 31], [-15, 27], [-17, 21], [-17, 15], [-15, 11], [-12, 8],
  [-8, 5], [-4, 5], [0, 6], [6, 4], [9, 4], [9, -1], [12, -5], [13, -10],
  [12, -17], [14, -22], [16, -28], [20, -35], [26, -34], [32, -26], [35, -20],
  [40, -15], [40, -10], [42, -4], [46, 0], [51, 11], [48, 11], [44, 13],
  [40, 15], [38, 18], [37, 22], [34, 27], [32, 31], [30, 32], [25, 32],
  [20, 32], [15, 32], [11, 34], [10, 37], [5, 37],
];
const EURASIA: Pt[] = [
  [-9, 37], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [-1, 49], [2, 51], [5, 53],
  [8, 55], [8, 57], [10, 59], [5, 60], [5, 62], [12, 64], [18, 69], [25, 71],
  [30, 70], [40, 68], [50, 69], [60, 69], [68, 72], [75, 73], [80, 73],
  [90, 75], [100, 77], [110, 76], [120, 73], [130, 72], [140, 72], [150, 70],
  [160, 70], [170, 66], [178, 65], [170, 62], [162, 58], [158, 52], [150, 59],
  [142, 58], [140, 50], [135, 43], [130, 42], [127, 40], [122, 38], [120, 34],
  [115, 30], [110, 28], [108, 22], [105, 20], [103, 15], [100, 13], [98, 10],
  [95, 16], [92, 21], [90, 22], [88, 22], [86, 20], [82, 17], [80, 14],
  [77, 8], [75, 12], [73, 18], [70, 21], [67, 24], [64, 25], [61, 25],
  [58, 25], [56, 26], [54, 26], [52, 25], [50, 29], [48, 30], [50, 26],
  [54, 24], [57, 22], [59, 22], [58, 20], [56, 18], [54, 17], [52, 15],
  [48, 14], [44, 13], [43, 12], [42, 15], [40, 16], [39, 20], [38, 24],
  [36, 28], [35, 29], [34, 28], [34, 31], [33, 35], [30, 36], [27, 37],
  [23, 36], [22, 38], [20, 40], [19, 42], [15, 44], [12, 44], [10, 44],
  [8, 44], [6, 43], [3, 42], [0, 39], [-2, 37], [-6, 36],
];
const AUSTRALIA: Pt[] = [
  [114, -22], [114, -30], [115, -35], [118, -35], [124, -33], [129, -32],
  [132, -32], [135, -35], [138, -35], [140, -38], [145, -38], [150, -37],
  [153, -32], [153, -27], [150, -23], [146, -19], [142, -15], [142, -11],
  [140, -17], [136, -15], [135, -12], [132, -11], [130, -13], [126, -14],
  [122, -17], [118, -20],
];
const UK: Pt[] = [
  [-5, 50], [-3, 53], [-5, 56], [-2, 58], [0, 53], [1, 51],
];
const JAPAN: Pt[] = [
  [130, 31], [132, 33], [135, 34], [137, 35], [139, 37], [141, 40], [142, 43],
  [144, 44], [142, 42], [140, 39], [138, 36], [135, 34], [132, 33],
];
const NEW_ZEALAND: Pt[] = [
  [167, -45], [170, -42], [174, -39], [177, -38], [175, -40], [172, -43],
  [168, -46],
];

// -------------------------------------------------------------- story data
// All 35 stories verified against wire reporting of 21-22 November 2026.
// Contested claims are worded as claims. Nothing invented.
type BigStory = {
  n: number;
  kicker: string;
  head: string;
  body: string;
  scene: string;
  region: string;
  lon: number;
  lat: number;
  place: string;
};
type Lead = {
  n: number;
  kicker: string;
  head: string;
  sub: string;
  icon: string;
  region: string;
  lon: number;
  lat: number;
  place: string;
};
type Brief = { n: number; text: string; region: string };

const BIG: BigStory[] = [
  {
    n: 1,
    kicker: "1 - CLIMATE - ANTALYA, TURKEY",
    head: "COP31 NEARS A DEAL AFTER ALL-NIGHT TALKS",
    body: "After two weeks of deadlock in Antalya, a compromise text went to nearly 200 countries late on Saturday. Objections close 03:00 GMT; approval at 06:00 GMT.",
    scene: "cop31",
    region: "CLIMATE",
    lon: 30.7,
    lat: 36.9,
    place: "Antalya, Turkey - COP31 deal nears",
  },
  {
    n: 2,
    kicker: "2 - BALTIC - GULF OF FINLAND",
    head: "DRONES SET RUSSIAN SHIP ABLAZE IN THE BALTIC",
    body: "Two drones struck the Russian cargo ship Sparta II in the Gulf of Finland on Saturday morning. The crew of 16 evacuated; Finland imposed air and sea limits.",
    scene: "sparta",
    region: "EUROPE",
    lon: 24.5,
    lat: 59.8,
    place: "Gulf of Finland - Sparta II ablaze",
  },
  {
    n: 3,
    kicker: "3 - JUSTICE - GUASAVE, SINALOA",
    head: "MEXICO SEIZES FBI MOST-WANTED CARTEL BOSS",
    body: "Mexican special forces seized Fausto Isidro Meza Flores - 'El Chapo Isidro', one of the FBI's ten most wanted - in Guasave, Sinaloa, on Friday night.",
    scene: "mexico",
    region: "N. AMERICA",
    lon: -108.5,
    lat: 25.6,
    place: "Sinaloa, Mexico - cartel boss seized",
  },
];

const LEADS: Lead[] = [
  {
    n: 4,
    kicker: "4 - PERU",
    head: "QUAKE SHAKES THE ANDES",
    sub: "Magnitude 6.7 hits Junin; felt in Lima.",
    icon: "quake",
    region: "S. AMERICA",
    lon: -76,
    lat: -11,
    place: "Junin, Peru - magnitude 6.7 quake",
  },
  {
    n: 5,
    kicker: "5 - BRAZIL",
    head: "BOLSONARO IN ICU",
    sub: "Admitted with abdominal blockage. Stable.",
    icon: "hospital",
    region: "S. AMERICA",
    lon: -47.9,
    lat: -15.8,
    place: "Brasilia - Bolsonaro in ICU",
  },
  {
    n: 6,
    kicker: "6 - POLAND",
    head: "MISSILES LAND IN POLAND",
    sub: "Kh-101 crashes in south-east Poland.",
    icon: "missile",
    region: "EUROPE",
    lon: 22.5,
    lat: 50.5,
    place: "SE Poland - Russian missiles crash",
  },
  {
    n: 7,
    kicker: "7 - THE GULF",
    head: "GULF ON EDGE",
    sub: "Iran claims strikes on US sites in Bahrain.",
    icon: "flame",
    region: "MIDDLE EAST",
    lon: 50.6,
    lat: 26.2,
    place: "Bahrain - strikes claimed in Gulf",
  },
  {
    n: 8,
    kicker: "8 - SAUDI ARABIA",
    head: "MISSILES OVER RIYADH",
    sub: "Saudi defences stop three Houthi missiles.",
    icon: "rocket",
    region: "MIDDLE EAST",
    lon: 46.7,
    lat: 24.6,
    place: "Riyadh - Houthi missiles stopped",
  },
  {
    n: 9,
    kicker: "9 - UNITED STATES",
    head: "FBI DATABASE HACKED",
    sub: "NCIC database breached; Trump confirms it.",
    icon: "shield",
    region: "N. AMERICA",
    lon: -77,
    lat: 38.9,
    place: "Washington - FBI database hacked",
  },
  {
    n: 10,
    kicker: "10 - THE HAGUE",
    head: "MYANMAR GUILTY OF GENOCIDE",
    sub: "World court rules 9-6 on the 2017 case.",
    icon: "scales",
    region: "ASIA",
    lon: 4.3,
    lat: 52.1,
    place: "The Hague - Myanmar genocide ruling",
  },
  {
    n: 11,
    kicker: "11 - GAZA",
    head: "AID VEHICLE HIT IN GAZA",
    sub: "Israeli strike kills three in Gaza.",
    icon: "cross",
    region: "MIDDLE EAST",
    lon: 34.5,
    lat: 31.5,
    place: "Gaza - aid vehicle struck",
  },
  {
    n: 12,
    kicker: "12 - CHINA",
    head: "THE SHENZHEN TABLE",
    sub: "First trilateral ends in peace declaration.",
    icon: "flags",
    region: "ASIA",
    lon: 114,
    lat: 22.5,
    place: "Shenzhen - Trump, Xi, Putin meet",
  },
  {
    n: 13,
    kicker: "13 - ENGLAND",
    head: "LEEDS STUN CHELSEA 4-1",
    sub: "Okafor scores twice; City held 1-1.",
    icon: "ball",
    region: "SPORT",
    lon: -0.1,
    lat: 51.5,
    place: "London - Leeds thrash Chelsea",
  },
];

const BRIEFS: Brief[] = [
  { n: 14, text: "EU approves Indonesia trade deal; duties cut 90%.", region: "EUROPE" },
  { n: 15, text: "SoftBank's Son explored a $1tn buyout of SK Hynix.", region: "ASIA" },
  { n: 16, text: "Gold and copper dive to multi-month lows.", region: "MARKETS" },
  { n: 17, text: "GTA VI sets a record: $3.8bn in first-day sales.", region: "CULTURE" },
  { n: 18, text: "Eisenkot invites Likud to coalition talks.", region: "MIDDLE EAST" },
  { n: 19, text: "Boy, 13, shot dead near a school in Shuafat.", region: "MIDDLE EAST" },
  { n: 20, text: "Texas execution: witnesses report suffering.", region: "N. AMERICA" },
  { n: 21, text: "Al-Qaeda affiliates praise hijack attempt.", region: "MIDDLE EAST" },
  { n: 22, text: "American Airlines, Israir agree codeshare deal.", region: "MIDDLE EAST" },
  { n: 23, text: "Australia win the T20 series opener against England.", region: "SPORT" },
  { n: 24, text: "Harden's 51 passes Bryant on the 50-point games list.", region: "SPORT" },
  { n: 25, text: "Nepal's PM travels to India today to meet Modi.", region: "ASIA" },
  { n: 26, text: "Iraq to send forces into Hezbollah stronghold.", region: "MIDDLE EAST" },
  { n: 27, text: "Israel strikes Hezbollah site in east Lebanon.", region: "MIDDLE EAST" },
  { n: 28, text: "UN states agree to draft autonomous-weapons pact.", region: "WORLD" },
  { n: 29, text: "Kyiv to send thousands of tonnes of food aid abroad.", region: "EUROPE" },
  { n: 30, text: "EU signs 173m-euro Jordan deals; Medusa cable link.", region: "EUROPE" },
  { n: 31, text: "Saudi passes UAE as India's No. 2 oil source.", region: "ASIA" },
  { n: 32, text: "Japan to buy up to 8m barrels of Saudi crude.", region: "ASIA" },
  { n: 33, text: "Pochettino's first Man Utd game: Liverpool.", region: "SPORT" },
  { n: 34, text: "Newcastle hold leaders Arsenal 2-2.", region: "SPORT" },
  { n: 35, text: "Africa launches its own credit rating agency.", region: "AFRICA" },
];

// ------------------------------------------------------------------ layout
const MX = 24; // left margin
const RX = 1000; // right edge
const CW = RX - MX; // 976 content width

function regionCounts(): [string, number][] {
  const order = ["N. AMERICA", "S. AMERICA", "EUROPE", "MIDDLE EAST", "ASIA", "SPORT", "WORLD"];
  const counts = new Map<string, number>();
  const all = [
    ...BIG.map((s) => s.region),
    ...LEADS.map((s) => s.region),
    ...BRIEFS.map((s) => s.region),
  ];
  for (const r of all) counts.set(r, (counts.get(r) ?? 0) + 1);
  const out: [string, number][] = [];
  for (const r of order) {
    if (r === "ASIA") out.push(["ASIA-PACIFIC", counts.get("ASIA") ?? 0]);
    else if (r === "WORLD") {
      const w =
        (counts.get("WORLD") ?? 0) +
        (counts.get("CLIMATE") ?? 0) +
        (counts.get("MARKETS") ?? 0) +
        (counts.get("CULTURE") ?? 0) +
        (counts.get("AFRICA") ?? 0);
      out.push(["WORLD", w]);
    } else out.push([r, counts.get(r) ?? 0]);
  }
  return out;
}

function render(): void {
  fillRect(0, 0, W, H, PAPER);

  // ---- masthead
  fillRect(MX, 10, CW, 2, INK);
  fillRect(MX, 14, CW, 1, INK);
  drawText("THE WORLD IN ONE DAY", 512, 24, 3.1, INK, 2.5, "c");
  drawText("SUNDAY 22 NOVEMBER 2026", MX, 72, 1.05, INK, 1.5, "l");
  drawText("35 STORIES - 7 REGIONS", 512, 72, 1.05, RED, 1.5, "c");
  drawText("ONE DAY - ONE PAGE", RX, 72, 1.05, INK, 1.5, "r");
  fillRect(MX, 92, CW, 2, INK);
  fillRect(MX, 95, CW, 1, INK);

  // ---- three big stories
  const colW = 312;
  const colX = [MX, MX + colW + 20, MX + 2 * (colW + 20)];
  BIG.forEach((s, i) => {
    const x = colX[i];
    drawScene(s.scene, x, 100, colW, 62);
    drawText(s.kicker, x, 168, 0.72, RED, 2, "l", 2.5);
    drawPara(s.head, x, 182, colW, 1.3, INK, 21, 2, 2);
    drawPara(s.body, x, 228, colW, 0.72, INK, 16, 2, 5, 2.5);
  });
  fillRect(MX, 322, CW, 1, GREY);

  // ---- ten illustrated leads, 5 x 2
  const lw = 185;
  const lgap = 12;
  LEADS.forEach((s, i) => {
    const c = i % 5;
    const r = Math.floor(i / 5);
    const x = MX + c * (lw + lgap);
    const y = 328 + r * 120;
    drawIcon(s.icon, x, y, lw, 38);
    drawText(s.kicker, x, y + 42, 0.68, RED, 2, "l", 2.5);
    drawPara(s.head, x, y + 54, lw, 0.95, INK, 19, 2, 2, 2.5);
    drawPara(s.sub, x, y + 88, lw, 0.62, GREY, 13, 2, 2, 2.5);
  });
  fillRect(MX, 570, CW, 1, GREY);

  // ---- briefs
  drawText("THE DAY IN BRIEF", MX, 578, 0.85, INK, 2, "l", 1);
  drawText("22 BRIEFS", RX, 578, 0.85, RED, 2, "r", 1);
  const bcolW = 482;
  BRIEFS.forEach((b, i) => {
    const c = Math.floor(i / 11);
    const r = i % 11;
    const x = MX + c * (bcolW + 12);
    const y = 596 + r * 14;
    drawText(String(b.n) + ".", x, y, 0.62, RED, 2, "l", 2.5);
    drawText(b.text, x + 28, y, 0.62, INK, 2, "l", 2.5);
  });
  fillRect(MX, 752, CW, 2, INK);

  // ---- number strip
  drawText("35 STORIES  -  3 LEADS  -  10 ILLUSTRATED  -  22 BRIEFS", 512, 760, 1.0, INK, 2, "c", 1);
  fillRect(MX, 778, CW, 1, GREY);

  // ---- region bar
  const rc = regionCounts();
  const regionLine = rc.map(([name, n]) => name + " " + n).join("  -  ");
  drawText(regionLine, 512, 784, 0.68, BLUE, 2, "c", 2.5);
  fillRect(MX, 800, CW, 1, GREY);

  // ---- world map + legend
  const mapX = MX;
  const mapY = 806;
  const mapW = 636;
  const mapH = 126;
  fillRect(mapX, mapY, mapW, mapH, SEA);
  // graticule
  for (let lon = -150; lon <= 150; lon += 30) {
    const gx = mapX + ((lon + 180) / 360) * mapW;
    line(gx, mapY, gx, mapY + mapH, 0.5, [190, 205, 210]);
  }
  for (let lat = -30; lat <= 60; lat += 30) {
    const gy = mapY + ((75 - lat) / 130) * mapH;
    line(mapX, gy, mapX + mapW, gy, 0.5, [190, 205, 210]);
  }
  const proj = (lon: number, lat: number): Pt => [
    mapX + ((lon + 180) / 360) * mapW,
    mapY + ((75 - lat) / 130) * mapH,
  ];
  const continents = [NORTH_AMERICA, SOUTH_AMERICA, AFRICA, EURASIA, AUSTRALIA, UK, JAPAN, NEW_ZEALAND];
  for (const cont of continents) {
    const pts = cont.map(([lo, la]) => proj(lo, la));
    fillPoly(pts, LAND);
    polyline(pts, 1, LANDLINE, true);
  }
  const pins: { n: number; lon: number; lat: number; place: string; dlon?: number; dlat?: number }[] = [
    ...BIG.map((s) => ({ n: s.n, lon: s.lon, lat: s.lat, place: s.place })),
    ...LEADS.map((s) => ({ n: s.n, lon: s.lon, lat: s.lat, place: s.place })),
  ];
  // Display offsets (lon/lat) for pins that would overlap on this small map;
  // a thin leader line joins each offset pin to its true position.
  const offsets: Record<number, [number, number]> = {
    1: [5.3, 7.1],
    2: [9.5, 4.2],
    8: [-4.7, -6.6],
    11: [-4.5, -5.5],
    13: [-5.9, 3.5],
  };
  for (const p of pins) {
    const [tx, ty] = proj(p.lon, p.lat);
    const off = offsets[p.n];
    const [pxx, pyy] = off ? proj(p.lon + off[0], p.lat + off[1]) : [tx, ty];
    if (off) line(tx, ty, pxx, pyy, 1, GREY);
    disc(pxx, pyy, 8, RED);
    polyline(circlePts(pxx, pyy, 8), 1.5, WHITE, true);
    drawText(String(p.n), pxx, pyy - 4.5, 0.58, WHITE, 1.5, "c", 1);
  }
  // legend: two columns, short place names, 15px rows so no lines touch
  const legX = 676;
  const legX2 = 840;
  drawText("WHERE IT HAPPENED", legX, 806, 0.85, INK, 2, "l", 1);
  pins.forEach((p, i) => {
    const col = i < 7 ? legX : legX2;
    const row = i < 7 ? i : i - 7;
    const short = p.place.split(" - ")[0];
    drawText(String(p.n), col, 822 + row * 15, 0.62, RED, 2, "l", 2.5);
    drawText(short, col + 22, 822 + row * 15, 0.62, INK, 2, "l", 2.5);
  });

  // ---- UTC timeline
  fillRect(MX, 936, CW, 1, GREY);
  const events: [string, string][] = [
    ["03:00", "Objections close"],
    ["06:00", "Approval session"],
    ["06:50", "Sparta II alert"],
    ["07:35", "Explosions aboard"],
  ];
  events.forEach(([t, label], i) => {
    const cx = MX + 122 + i * 244;
    drawText(t + "  " + label, cx, 942, 0.62, INK, 2, "c", 2.5);
  });
  const axisY = 960;
  line(MX, axisY, RX, axisY, 1.5, INK);
  for (let h = 0; h <= 24; h += 6) {
    const gx = MX + (h / 24) * CW;
    line(gx, axisY - 4, gx, axisY + 4, 1.5, INK);
    drawText(String(h).padStart(2, "0") + ":00", gx, 964, 0.55, GREY, 2, "c", 2);
  }
  // event markers on the axis (morning cluster, as reported)
  for (const [t] of events) {
    const [hh, mm] = t.split(":").map(Number);
    const gx = MX + ((hh + mm / 60) / 24) * CW;
    disc(gx, axisY, 3.5, RED);
  }

  // ---- date check + footer: three lines, 14px apart, no overlap
  fillRect(MX, 984, CW, 1, GREY);
  const datePrefix = "DATE CHECK - ";
  const dateLine =
    "This page sums up Sunday 22 November 2026: the stories the world was reporting that day.";
  const dateX = 512 - textWidth(datePrefix + dateLine, 0.6, 2.5) / 2;
  drawText(datePrefix, dateX, 985, 0.6, RED, 2, "l", 2.5);
  drawText(dateLine, dateX + textWidth(datePrefix, 0.6, 2.5), 985, 0.6, INK, 2, "l", 2.5);
  drawText(
    "SOURCES: REUTERS - AP - AFP - BBC - AL JAZEERA - CNN - THE GUARDIAN - YLE - FINNISH BORDER GUARD - USGS",
    512,
    999,
    0.6,
    GREY,
    2,
    "c",
    2.5,
  );
  drawText(
    "ORIGINAL DRAWINGS - CONTESTED CLAIMS ARE MARKED AS CLAIMS - THE WORLD IN ONE DAY - 22 NOVEMBER 2026",
    512,
    1013,
    0.6,
    GREY,
    2,
    "c",
    2.5,
  );
}

// --------------------------------------------------------------------- main
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR;
  if (!outDir) {
    throw new Error("MAKEFUN_OUTPUT_DIR is not set");
  }
  render();
  const png = encodePNG();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
