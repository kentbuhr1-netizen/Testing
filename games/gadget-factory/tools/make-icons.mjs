/**
 * Regenerate icons/*.png from icons/icon.svg using the headless Chromium that
 * ships with this container.
 *
 *   node tools/make-icons.mjs [path/to/chrome]
 *
 * Headless Chromium hands back a screenshot the size of the *window* while
 * laying the page out in a slightly shorter viewport, so we render taller than
 * we need and crop the square back out.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';

const SIZES = [180, 192, 512];
const PAD = 160; // extra render height, cropped away afterwards
const CHROME = process.argv[2] || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const root = new URL('..', import.meta.url).pathname;

/* ---------- minimal PNG read/write (8-bit RGB or RGBA, no interlace) ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function decodePng(buf) {
  let pos = 8; // skip signature
  let width = 0, height = 0, channels = 3;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colorType = data[9];
      if (depth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG: depth ${depth}, color type ${colorType}`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = raw.subarray(src, src + stride);
    src += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let value = row[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

function encodePng({ width, height, channels, pixels }) {
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function cropTopLeft(image, size) {
  const { channels, pixels, width } = image;
  const out = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y++) {
    pixels.copy(out, y * size * channels, y * width * channels, y * width * channels + size * channels);
  }
  return { width: size, height: size, channels, pixels: out };
}

/* ---------- render ---------- */

const svg = readFileSync(join(root, 'icons/icon.svg'), 'utf8');
const work = mkdtempSync(join(tmpdir(), 'outbreak-icons-'));

for (const size of SIZES) {
  const page = join(work, `icon-${size}.html`);
  writeFileSync(
    page,
    `<html><head><style>html,body{margin:0;padding:0;background:#fff8e6}
     svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`
  );
  const shot = join(work, `shot-${size}.png`);
  execFileSync(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--screenshot=${shot}`, `--window-size=${size},${size + PAD}`, `file://${page}`,
  ], { stdio: 'ignore' });

  const image = decodePng(readFileSync(shot));
  if (image.width < size || image.height < size) {
    throw new Error(`render came back too small: ${image.width}x${image.height} for ${size}px`);
  }
  const target = join(root, `icons/icon-${size}.png`);
  writeFileSync(target, encodePng(cropTopLeft(image, size)));
  console.log(`icons/icon-${size}.png`);
}
