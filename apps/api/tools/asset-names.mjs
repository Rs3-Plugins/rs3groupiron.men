/**
 * Asset ids straight out of the cache.
 *
 * Every id the catalogues use comes from archive 67, the game's own asset name
 * tables (id -> gameval), fetched from OpenRS2. That is the same source
 * rs3-api-ts generates its `id` constants from, so both stay on one authority
 * instead of a second copy in dumped .sym files that can drift.
 *
 * Only beta caches carry archive 67, so that is the environment resolved here.
 */
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const OPENRS2 = (process.env.OPENRS2_BASE ?? 'https://archive.openrs2.org').replace(/\/$/, '');
const SCOPE = 'runescape';
const GAME = 'runescape';
const ENVIRONMENT = 'beta';
const ASSET_NAMES_ARCHIVE = 67;
/** How far back to look for a cache that actually carries archive 67. */
const CANDIDATES = 8;

/** Archive 67 group numbers for the asset kinds the catalogues need. */
export const ASSET_GROUPS = {
  obj: 36,
  npc: 35,
  achievement: 89,
  param: 37,
  quest: 41,
  graphic: 49,
};

export function decompress(raw) {
  const type = raw[0];
  const compressedSize = raw.readInt32BE(1);
  if (type === 0) return raw.subarray(5, 5 + compressedSize);
  const body = raw.subarray(9);
  if (type === 2) return zlib.gunzipSync(body);
  if (type === 1) {
    // js5 stores bzip2 bodies without their "BZh1" magic.
    const bzip2 = require('seek-bzip');
    return bzip2.decode(Buffer.concat([Buffer.from('BZh1'), body]));
  }
  throw new Error(`js5 container uses unsupported compression ${type}`);
}

/**
 * Pack type 1 numbers entries from zero; type 2 stores each id explicitly.
 * An offset of -1 marks a hole, and names run to a NUL or newline.
 */
function readNameTable(buffer) {
  let at = 0;
  const int = () => {
    const value = buffer.readInt32BE(at);
    at += 4;
    return value;
  };

  const packType = int();
  if (packType !== 1 && packType !== 2) {
    throw new Error(`unknown asset name pack type ${packType}`);
  }

  const count = int();
  const ids = new Array(count);
  const offsets = new Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = packType === 1 ? i : int();
    offsets[i] = int();
  }

  const tableStart = at;
  const names = new Map();
  for (let i = 0; i < count; i++) {
    if (offsets[i] === -1) continue;
    const start = tableStart + offsets[i];
    let end = start;
    while (end < buffer.length && buffer[end] !== 0 && buffer[end] !== 10) end++;
    names.set(ids[i], buffer.toString('latin1', start, end).toLowerCase());
  }
  return names;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** Raw js5 container for one group of any archive. */
export async function fetchArchiveGroup(cacheId, archive, group) {
  const url = `${OPENRS2}/caches/${SCOPE}/${cacheId}/archives/${archive}/groups/${group}.dat`;
  const response = await fetch(url);
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fetchGroup(cacheId, group) {
  return fetchArchiveGroup(cacheId, ASSET_NAMES_ARCHIVE, group);
}

async function listCaches() {
  const caches = await getJson(`${OPENRS2}/caches.json`);
  const seen = new Set();
  return caches
    .filter((c) => c.game === GAME && c.environment === ENVIRONMENT && !c.hidden)
    .sort((a, b) => b.id - a.id)
    .filter((c) => (seen.has(c.id) ? false : seen.add(c.id)))
    .map((c) => ({
      cacheId: c.id,
      revision: c.builds?.[0]?.major ?? null,
      minor: c.builds?.[0]?.minor ?? null,
      timestamp: c.timestamp,
      url: `${OPENRS2}/caches/${SCOPE}/${c.id}`,
    }));
}

/**
 * Picks the cache to read ids from. A revision can be given so the ids match
 * the config dump they will be joined against, rather than silently coming
 * from a newer build.
 */
export async function resolveCache({ cacheId, revision } = {}) {
  const caches = await listCaches();

  if (cacheId !== undefined) {
    const wanted = caches.find((c) => c.cacheId === Number(cacheId));
    if (!wanted) throw new Error(`openrs2 has no ${ENVIRONMENT} cache ${cacheId}`);
    return wanted;
  }

  const ordered = revision
    ? [
        ...caches.filter((c) => c.revision === Number(revision)),
        ...caches.filter((c) => c.revision !== Number(revision)),
      ]
    : caches;

  for (const cache of ordered.slice(0, CANDIDATES)) {
    if ((await fetchGroup(cache.cacheId, 0)) !== undefined) return cache;
  }
  throw new Error(
    `none of the newest ${CANDIDATES} ${ENVIRONMENT} caches carry archive ${ASSET_NAMES_ARCHIVE}`,
  );
}

/**
 * id <-> gameval for one asset kind. Results are cached on disk because a
 * rebuild re-reads the same handful of groups and OpenRS2 is someone else's
 * bandwidth.
 */
export async function readAssetNames(cacheId, kind, cacheDir) {
  const group = ASSET_GROUPS[kind];
  if (group === undefined) throw new Error(`unknown asset kind ${kind}`);

  const path = cacheDir
    ? join(cacheDir, `${cacheId}-${kind}.json`)
    : undefined;
  if (path && existsSync(path)) {
    const stored = JSON.parse(readFileSync(path, 'utf8'));
    return toMaps(Object.entries(stored).map(([id, name]) => [Number(id), name]));
  }

  const raw = await fetchGroup(cacheId, group);
  if (raw === undefined) {
    throw new Error(`cache ${cacheId} has no archive 67 group ${group} (${kind})`);
  }
  const names = readNameTable(decompress(raw));

  if (path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(Object.fromEntries(names)), 'utf8');
  }
  return toMaps([...names.entries()]);
}

function toMaps(entries) {
  const idOf = new Map();
  const nameOf = new Map();
  for (const [id, gameval] of entries) {
    if (!Number.isInteger(id) || typeof gameval !== 'string' || !gameval) continue;
    nameOf.set(id, gameval);
    // Later duplicates lose, matching how the client resolves a name.
    if (!idOf.has(gameval)) idOf.set(gameval, id);
  }
  return { idOf, nameOf };
}
