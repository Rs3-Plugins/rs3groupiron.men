// Generates the sample achievement screenshots used by the public demo
// (apps/web/public/demo-shots). These stand in for real player uploads so the
// Achievements tab shows the image feature without any CDN configured.
//   node apps/web/design/build-demo-shots.mjs
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'demo-shots');

const W = 640;
const H = 360;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** An RS3-ish game frame with a chat/level-up box, as a player would capture. */
function scene({ heading, lines, accent }) {
  const boxW = 470;
  const boxH = 132;
  const boxX = (W - boxW) / 2;
  const boxY = (H - boxH) / 2 + 10;

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8fb6c9"/>
      <stop offset="55%" stop-color="#6d8f76"/>
      <stop offset="100%" stop-color="#4a5f3f"/>
    </linearGradient>
    <linearGradient id="box" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b2f22"/>
      <stop offset="100%" stop-color="#241c14"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="45%" r="75%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>

  <!-- rough terrain silhouettes so it reads as a game scene, not a card -->
  <path d="M0,232 Q90,206 180,228 T360,222 T540,236 T640,224 L640,360 L0,360 Z" fill="#41563a" opacity="0.95"/>
  <path d="M0,268 Q120,248 250,268 T520,266 T640,274 L640,360 L0,360 Z" fill="#35472f"/>
  <g fill="#2f4029" opacity="0.9">
    <ellipse cx="86" cy="226" rx="44" ry="30"/>
    <ellipse cx="146" cy="238" rx="34" ry="24"/>
    <ellipse cx="556" cy="230" rx="48" ry="32"/>
    <ellipse cx="498" cy="242" rx="32" ry="22"/>
  </g>
  <g fill="#5b4a33" opacity="0.85">
    <rect x="80" y="240" width="9" height="26"/>
    <rect x="552" y="244" width="9" height="26"/>
  </g>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>

  <!-- minimap corner + hud hints -->
  <circle cx="588" cy="56" r="40" fill="#1a2118" stroke="#6b5836" stroke-width="3"/>
  <circle cx="588" cy="56" r="30" fill="#2c3a28"/>
  <rect x="16" y="16" width="118" height="20" rx="3" fill="#000" opacity="0.45"/>

  <!-- the message box -->
  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="3"
        fill="url(#box)" stroke="${accent}" stroke-width="2"/>
  <rect x="${boxX + 5}" y="${boxY + 5}" width="${boxW - 10}" height="${boxH - 10}"
        rx="2" fill="none" stroke="${accent}" stroke-width="1" opacity="0.45"/>

  <text x="${W / 2}" y="${boxY + 40}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="bold"
        fill="${accent}">${esc(heading)}</text>
  ${lines
    .map(
      (line, i) => `<text x="${W / 2}" y="${boxY + 72 + i * 25}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-size="17"
        fill="#f0e6d2">${esc(line)}</text>`,
    )
    .join('\n  ')}

  <text x="${W - 12}" y="${H - 12}" text-anchor="end"
        font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="11"
        fill="#ffffff" opacity="0.5">sample screenshot</text>
</svg>`;
}

const SHOTS = {
  levelup: {
    heading: 'Congratulations!',
    lines: ["You've just advanced a Slayer level.", 'You are now level 99.'],
    accent: '#e8c46a',
  },
  drop: {
    heading: 'Rare drop!',
    lines: ['You receive: Dragon hatchet.', 'Sent to the shared bank.'],
    accent: '#e0a04a',
  },
  quest: {
    heading: 'Quest complete!',
    lines: ['Dishonour among Thieves', '2 Quest points awarded.'],
    accent: '#9fd0ef',
  },
  diary: {
    heading: 'Achievements complete!',
    lines: ['Karamja Achievements', 'Rewards unlocked.'],
    accent: '#a8e08f',
  },
};

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const [name, spec] of Object.entries(SHOTS)) {
    const png = await sharp(Buffer.from(scene(spec)))
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(join(OUT, `${name}.png`), png);
    console.log(`${name}.png  ${png.length} bytes`);
  }
  console.log('written to', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
