// Generates favicons, PWA icons and the Open Graph share image from
// design/gim-logo-source.png. Run with a sharp install on the NODE_PATH:
//   node apps/web/design/build-icons.mjs
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'gim-logo-source.png');
const OUT = join(here, '..', 'public');
const BG = '#14171a';
const SITE = 'rs3groupiron.men';

async function logoSquare(size, padRatio, background = { r: 0, g: 0, b: 0, alpha: 0 }) {
  // Trim transparent margins, fit inside a square with padding.
  const inner = Math.round(size * (1 - padRatio * 2));
  const trimmed = await sharp(SRC).trim().toBuffer();
  return sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: Math.floor((size - inner) / 2),
      bottom: Math.ceil((size - inner) / 2),
      left: Math.floor((size - inner) / 2),
      right: Math.ceil((size - inner) / 2),
      background,
    })
    .png()
    .toBuffer();
}

function icoFromPngs(entries) {
  // ICO container with PNG-compressed images (supported by all modern browsers).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = [];
  const blobs = [];
  let offset = 6 + 16 * entries.length;
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    blobs.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...dir, ...blobs]);
}

async function ogImage() {
  const W = 1200;
  const H = 630;
  const logoH = 470;
  const trimmed = await sharp(SRC).trim().toBuffer();
  const logo = await sharp(trimmed)
    .resize({ height: logoH, fit: 'inside' })
    .png()
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const logoX = 70;
  const logoY = Math.round((H - meta.height) / 2);
  const textX = logoX + meta.width + 60;

  const overlay = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="22%" cy="50%" r="60%">
        <stop offset="0%" stop-color="#e8a04a" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#e8a04a" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1c2024"/>
        <stop offset="100%" stop-color="#0e1013"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <rect x="0" y="${H - 6}" width="${W}" height="6" fill="#c47a2c"/>
    <g font-family="Cinzel, Palatino Linotype, Palatino, Georgia, serif" fill="#f0d4a8">
      <text x="${textX}" y="250" font-size="64" font-weight="700">Group Ironman</text>
      <text x="${textX}" y="315" font-size="40" font-weight="600" fill="#e8a04a">Tracker for RuneScape 3</text>
    </g>
    <g font-family="Segoe UI, Sora, Helvetica, Arial, sans-serif" fill="#c9ced3" font-size="28">
      <text x="${textX}" y="385">Live map  •  Shared bank  •  Skills  •  XP graphs</text>
    </g>
    <text x="${textX}" y="470" font-family="Segoe UI, Sora, Helvetica, Arial, sans-serif"
      font-size="30" font-weight="700" fill="#e8a04a">${SITE}</text>
  </svg>`;

  return sharp(Buffer.from(overlay))
    .composite([{ input: logo, left: logoX, top: logoY }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const write = (name, buf) => writeFile(join(OUT, name), buf);

  // Favicons (transparent)
  const fav16 = await logoSquare(16, 0);
  const fav32 = await logoSquare(32, 0);
  const fav48 = await logoSquare(48, 0);
  await write('favicon-16x16.png', fav16);
  await write('favicon-32x32.png', fav32);
  await write('favicon.ico', icoFromPngs([
    { size: 16, png: fav16 },
    { size: 32, png: fav32 },
    { size: 48, png: fav48 },
  ]));

  // Apple touch icon (opaque, iOS rounds the corners itself)
  await write('apple-touch-icon.png', await logoSquare(180, 0.1, BG));

  // PWA icons: "any" (transparent) and "maskable" (opaque with safe-zone padding)
  await write('icon-192.png', await logoSquare(192, 0.04));
  await write('icon-512.png', await logoSquare(512, 0.04));
  await write('icon-maskable-192.png', await logoSquare(192, 0.18, BG));
  await write('icon-maskable-512.png', await logoSquare(512, 0.18, BG));

  // Share image
  await write('og-image.png', await ogImage());

  await write('site.webmanifest', JSON.stringify({
    name: 'RS3 Group Ironman',
    short_name: 'RS3 GIM',
    description: 'Track your RuneScape 3 Group Ironman: live map, shared bank, skills and XP graphs.',
    start_url: '/',
    display: 'standalone',
    background_color: BG,
    theme_color: '#1c2024',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n');

  console.log('icons written to', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
