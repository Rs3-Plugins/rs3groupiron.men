/**
 * Extracts the sprites the catalogues reference, named by gameval.
 *
 *   node tools/build-sprites.mjs <dump-root> [--cache-id N] [--out <dir>]
 *
 * Only referenced sprites are pulled — the cache holds 36k graphics and the
 * quest and achievement lists need a few hundred between them. Files are named
 * after the asset's own gameval so a reference resolves without a lookup table,
 * and are rewritten only when the bytes change so a weekly sync touches just
 * what the game actually changed.
 *
 * Item icons are deliberately not here: RS3 renders those from 3D models with
 * per-item camera parameters (2dzoom/2dxan/2dyan/model on each obj), so there
 * is no stored image to extract.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decompress,
  fetchArchiveGroup,
  readAssetNames,
  resolveCache,
} from './asset-names.mjs';
import { decodeSprites, encodePng } from './sprites.mjs';
import { dumpRevision, many, one, parts, readBlocks } from './dump-reader.mjs';

const JS5_SPRITES = 8;
const USER_AGENT =
  'rs3-group-ironman/1.0 (group ironman tracker; +https://rs3groupiron.men)';

const root = process.argv[2];
if (!root) {
  console.error('usage: node tools/build-sprites.mjs <dump-root> [--cache-id N]');
  process.exit(1);
}
function arg(name) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = arg('--out') ?? join(here, '..', 'data', 'sprites');
const nameCache = join(here, '.cache-names');
const revision = Number(arg('--revision')) || dumpRevision(root);

/** Sprite refs are written "sheet,index" but named "sheet_index" in the cache. */
const normalise = (raw) => parts(raw).join('_');

function referenced() {
  const wanted = new Set();
  for (const block of readBlocks(root, 'achievement')) {
    for (const raw of many(block, 'sprite')) wanted.add(normalise(raw));
  }
  for (const block of readBlocks(root, 'quest')) {
    const icon = one(block, 'icon');
    if (icon !== undefined) wanted.add(normalise(icon));
    for (const raw of many(block, 'param')) {
      const comma = raw.indexOf(',');
      if (raw.slice(0, comma) === 'quest_icon_big') {
        wanted.add(normalise(raw.slice(comma + 1)));
      }
    }
  }
  return wanted;
}

const cache = await resolveCache({ cacheId: arg('--cache-id'), revision });
const { idOf } = await readAssetNames(cache.cacheId, 'graphic', nameCache);
const wanted = referenced();

console.log(
  `dump ${root} (revision ${revision || 'unknown'})\n` +
    `sprites from openrs2 cache ${cache.cacheId} (build ${cache.revision}.${cache.minor})\n` +
    `${wanted.size} referenced sprite names`,
);

mkdirSync(outDir, { recursive: true });
const before = new Set(
  existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith('.png')) : [],
);

let written = 0;
let unchanged = 0;
let missing = 0;
let failed = 0;
const produced = new Set();

for (const name of [...wanted].sort()) {
  const id = idOf.get(name);
  if (id === undefined) {
    missing += 1;
    continue;
  }
  try {
    const raw = await fetchArchiveGroup(cache.cacheId, JS5_SPRITES, id);
    if (raw === undefined) {
      missing += 1;
      continue;
    }
    const frames = decodeSprites(decompress(raw));
    frames.forEach((frame, index) => {
      // A group almost always holds one frame; only suffix when it does not,
      // so the common case keeps the plain gameval as its filename.
      const file = frames.length === 1 ? `${name}.png` : `${name}_${index}.png`;
      const png = encodePng(frame);
      const path = join(outDir, file);
      produced.add(file);
      if (existsSync(path) && readFileSync(path).equals(png)) {
        unchanged += 1;
        return;
      }
      writeFileSync(path, png);
      written += 1;
    });
  } catch (err) {
    failed += 1;
    console.log(`::warning::${name} (graphic ${id}) failed to decode: ${err.message}`);
  }
}

/**
 * Mirrors the wiki's stack art alongside the cache sprites.
 *
 * The wiki serves these with a year-long immutable cache, so a given visitor
 * only fetches each once — but every new visitor is still a request to someone
 * else's servers for art that never changes. Holding our own copy keeps the
 * site on one origin and leaves the wiki out of the hot path entirely.
 */
async function mirrorStackArt() {
  const itemsFile = join(here, '..', 'data', 'items.json');
  if (!existsSync(itemsFile)) return { copied: 0, kept: 0, failed: 0, files: [] };

  const { items } = JSON.parse(readFileSync(itemsFile, 'utf8'));
  const wanted = new Set();
  for (const item of Object.values(items)) {
    for (const count of item.counts ?? []) {
      if (count[2]) wanted.add(count[2]);
    }
  }

  let copied = 0;
  let kept = 0;
  let failed = 0;
  const files = [];
  for (const source of wanted) {
    // The "?hash" is the wiki's version marker, not part of the file name.
    const file = source.split('?')[0];
    files.push(file);
    const path = join(outDir, file);
    if (existsSync(path)) {
      kept += 1;
      continue;
    }
    try {
      const response = await fetch(`https://runescape.wiki/images/${source}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      writeFileSync(path, Buffer.from(await response.arrayBuffer()));
      copied += 1;
    } catch (err) {
      failed += 1;
      console.log(`::warning::stack art ${file} failed: ${err.message}`);
    }
  }
  return { copied, kept, failed, files };
}

const mirrored = await mirrorStackArt();
for (const file of mirrored.files) produced.add(file);
console.log(
  `stack art    ${mirrored.files.length} referenced, ${mirrored.copied} downloaded, ${mirrored.kept} already held` +
    (mirrored.failed ? `, ${mirrored.failed} failed` : ''),
);

const stale = [...before].filter((f) => !produced.has(f));
console.log(
  `sprites      ${produced.size} referenced, ${written} written, ${unchanged} unchanged` +
    (missing ? `, ${missing} not in the cache` : '') +
    (failed ? `, ${failed} failed` : '') +
    (stale.length ? `, ${stale.length} now unreferenced` : '') +
    ` -> ${outDir}`,
);
if (stale.length) {
  console.log(`  unreferenced: ${stale.slice(0, 10).join(', ')}`);
}
