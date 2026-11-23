/**
 * CodeFly brand asset generator - zero dependencies.
 *
 * Renders the CodeFly mark (a white paper plane on the blue->violet brand
 * gradient, matching .brand-mark in src/styles.css) and writes:
 *
 *   build/icon.png        512x512   electron-builder source icon
 *   build/icon.ico        256x256   Windows installer / executable icon
 *   assets/icon.png       1024x1024 @capacitor/android source icon
 *   assets/splash.png     2732x2732 Android splash screen
 *
 * PNGs are encoded by hand (zlib + CRC32); the ICO wraps a PNG payload,
 * which every supported Windows version understands. Run: node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- PNG encoding ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(png256) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256 encoded as 0
  entry[1] = 0;
  entry[2] = 0; // palette
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png256.length, 8);
  entry.writeUInt32LE(22, 12); // data offset
  return Buffer.concat([header, entry, png256]);
}

// ---------- rendering ----------

const GRADIENT_FROM = [91, 140, 255]; // --accent #5b8cff
const GRADIENT_TO = [138, 92, 255]; // --accent-2 #8a5cff
const BG = [7, 8, 12]; // --bg #07080c

/** Material "send" glyph in a 24x24 design space. */
const PLANE = [
  [2, 21],
  [23, 12],
  [2, 3],
  [2, 10],
  [17, 12],
  [2, 14],
];

function insidePolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Render the mark into an RGBA buffer. The plane occupies ~62% of the tile,
 * centered; 4x4 supersampling keeps edges smooth at every density.
 */
function renderMark(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const scale = (size * 0.62) / 24;
  const offset = (size - 24 * scale) / 2;
  const samples = 4;
  const step = 1 / samples;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) * step;
          const py = y + (sy + 0.5) * step;
          if (!insideRoundedRect(px, py, size, radius)) continue;
          const t = (px + py) / (2 * size);
          let cr = GRADIENT_FROM[0] + (GRADIENT_TO[0] - GRADIENT_FROM[0]) * t;
          let cg = GRADIENT_FROM[1] + (GRADIENT_TO[1] - GRADIENT_FROM[1]) * t;
          let cb = GRADIENT_FROM[2] + (GRADIENT_TO[2] - GRADIENT_FROM[2]) * t;
          const gx = (px - offset) / scale;
          const gy = (py - offset) / scale;
          if (insidePolygon(gx, gy, PLANE)) {
            cr = 255;
            cg = 255;
            cb = 255;
          }
          r += cr;
          g += cg;
          b += cb;
          a += 255;
        }
      }
      const count = samples * samples;
      const idx = (y * size + x) * 4;
      if (a === 0) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      } else {
        rgba[idx] = Math.round(r / count);
        rgba[idx + 1] = Math.round(g / count);
        rgba[idx + 2] = Math.round(b / count);
        rgba[idx + 3] = Math.round(a / count);
      }
    }
  }
  return rgba;
}

/** Splash: solid app background with the mark centered at ~38% of the canvas. */
function renderSplash(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = BG[0];
    rgba[i * 4 + 1] = BG[1];
    rgba[i * 4 + 2] = BG[2];
    rgba[i * 4 + 3] = 255;
  }
  const markSize = Math.round(size * 0.38);
  const mark = renderMark(markSize);
  const origin = Math.floor((size - markSize) / 2);
  for (let y = 0; y < markSize; y += 1) {
    mark.copy(rgba, ((origin + y) * size + origin) * 4, y * markSize * 4, (y + 1) * markSize * 4);
  }
  return rgba;
}

function write(relativePath, buffer) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  console.log(`wrote ${relativePath} (${buffer.length} bytes)`);
}

const icon1024 = encodePng(1024, 1024, renderMark(1024));
const icon512 = encodePng(512, 512, renderMark(512));
const icon256 = encodePng(256, 256, renderMark(256));

write('assets/icon.png', icon1024);
write('assets/splash.png', encodePng(2732, 2732, renderSplash(2732)));
write('build/icon.png', icon512);
write('build/icon.ico', encodeIco(icon256));
console.log('done');