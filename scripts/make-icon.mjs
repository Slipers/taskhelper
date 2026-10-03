/**
 * Génère l'icône (512×512) sans dépendance : build/icon.png, dont
 * electron-builder tire lui-même le .ico de l'installeur, plus les copies
 * utilisées par l'app (src/public) et le README (assets).
 *
 * Le motif est une coche blanche posée sur un carré arrondi en dégradé.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 512;
const RADIUS = 112;

/* ------------------------------------------------------------ dessin */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Distance signée à un carré arrondi centré. Négatif = intérieur. */
function roundedRectSD(x, y, halfW, halfH, r) {
  const qx = Math.abs(x) - (halfW - r);
  const qy = Math.abs(y) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Une coche franche, à bouts arrondis : le geste qu'on fait cent fois par jour dans l'app.
const CHECK = [
  [146, 270],
  [222, 344],
  [370, 180],
];
const CHECK_RADIUS = 31;

/** Distance signée à la coche. Négatif = intérieur. */
function checkSD(x, y) {
  let best = Infinity;
  for (let i = 0; i < CHECK.length - 1; i++) {
    const [ax, ay] = CHECK[i];
    const [bx, by] = CHECK[i + 1];
    best = Math.min(best, segmentDistance(x, y, ax, ay, bx, by));
  }
  return best - CHECK_RADIUS;
}

const rgba = Buffer.alloc(SIZE * SIZE * 4);
const half = SIZE / 2;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5;
    const py = y + 0.5;

    // Fond : dégradé diagonal, découpé par le carré arrondi.
    const g = clamp01((px + py) / (SIZE * 2));
    let r = Math.round(84 + (124 - 84) * g);
    let gr = Math.round(150 + (92 - 150) * g);
    let b = Math.round(255 + (236 - 255) * g);
    const bgAlpha = clamp01(0.5 - roundedRectSD(px - half, py - half, half, half, RADIUS));

    // Coche blanche par-dessus, anticrénelée sur un pixel.
    const inkAlpha = clamp01(0.5 - checkSD(px, py)) * bgAlpha;
    r = Math.round(r + (255 - r) * inkAlpha);
    gr = Math.round(gr + (255 - gr) * inkAlpha);
    b = Math.round(b + (255 - b) * inkAlpha);

    const o = (y * SIZE + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = gr;
    rgba[o + 2] = b;
    rgba[o + 3] = Math.round(bgAlpha * 255);
  }
}

/* --------------------------------------------------------------- PNG */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // profondeur
ihdr[9] = 6; // RGBA
// compression / filtre / entrelacement restent à 0

// Chaque ligne est préfixée de son octet de filtre (0 = aucun).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

for (const dir of ['build', path.join('src', 'public'), 'assets']) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon.png'), png);
}
console.log(
  `icon.png écrit dans build/, src/public/ et assets/ (${SIZE}×${SIZE}, ${(png.length / 1024).toFixed(1)} Ko)`,
);
