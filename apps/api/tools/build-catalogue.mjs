/**
 * Builds the static catalogues the API serves, from a zwyz/rs3-cache dump.
 *
 *   node tools/build-catalogue.mjs <dump-root> [--only items,npcs,achievements,quests]
 *                                              [--cache-id N] [--revision N]
 *
 * Field values come from the config dumps; every *id* comes from the cache's
 * own asset name tables (archive 67, via OpenRS2), not from the dump's .sym
 * files, so ids share one authority with rs3-api-ts. The cache is matched to
 * the dump's revision by default so the two halves cannot drift apart.
 *
 * Item examine text is deliberately absent: RS3 no longer ships it in the
 * config archives (46,089 obj names but only 130 descs, and no npc descs at
 * all), so there is nothing to read.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAssetNames, resolveCache } from './asset-names.mjs';
import {
  dumpRevision,
  flag,
  int,
  many,
  one,
  parts,
  readBlocks,
  realName,
} from './dump-reader.mjs';

const root = process.argv[2];
if (!root) {
  console.error(
    'usage: node tools/build-catalogue.mjs <dump-root> [--only a,b] [--cache-id N]',
  );
  process.exit(1);
}

function arg(name) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
}
const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
const noWiki = process.argv.includes('--no-wiki');
const wanted = (kind) => !only || only.has(kind);

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const nameCache = join(here, '.cache-names');
const revision = Number(arg('--revision')) || dumpRevision(root);
const updated = new Date().toISOString().slice(0, 10);

/** RS3 skill ids, which statreq lines reference by gameval. */
const STATS = [
  'attack', 'defence', 'strength', 'constitution', 'ranged', 'prayer',
  'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking',
  'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving',
  'slayer', 'farming', 'runecrafting', 'hunter', 'construction', 'summoning',
  'dungeoneering', 'divination', 'invention', 'archaeology', 'necromancy',
];
const STAT_ID = new Map(STATS.map((name, id) => [name, id]));
/** statreq lines still use the pre-rename gamevals for two skills. */
const STAT_ALIAS = { hitpoints: 'constitution', runecraft: 'runecrafting' };

/**
 * Quest params worth keeping. The rest are prose or per-item reward lists that
 * would several times the size of a file the web bundles; this set is what the
 * shipped catalogue has always carried.
 */
const QUEST_PARAMS = new Set([
  'quest_achievement', 'quest_age', 'quest_combat', 'quest_combat_difficulty',
  'quest_hidden', 'quest_holiday_hub_signposting', 'quest_icon_big',
  'quest_length', 'quest_name_first_letter_no_accents', 'quest_release_year',
  'quest_requires_kudos', 'quest_requires_morytania', 'quest_requires_special',
  'quest_series', 'quest_series_number', 'quest_start_location',
  'quest_timeline_category', 'quest_voice_acted',
]);

const assets = {};
async function load(kind, cacheId) {
  assets[kind] = await readAssetNames(cacheId, kind, nameCache);
  return assets[kind];
}
const idFor = (kind, gameval) => assets[kind]?.idOf.get(gameval);

function write(file, payload) {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, file);
  writeFileSync(path, JSON.stringify({ updated, revision, ...payload }), 'utf8');
  return path;
}

const WIKI_API = 'https://runescape.wiki/api.php';
const WIKI_IMAGES = 'https://runescape.wiki/images/';
/** The wiki's API caps anonymous `titles` at 50 per request. */
const WIKI_BATCH = 50;
const USER_AGENT =
  'rs3-group-ironman/1.0 (group ironman tracker; +https://rs3groupiron.men)';

/**
 * Stack art for items whose icon changes with quantity.
 *
 * The cache gives the variant ids and their thresholds but no image: those
 * variant ids are not rendered by the icon CDN, and RS3 builds item icons from
 * 3D models rather than storing them, so the wiki is the only source. Its
 * files are named "<Item name>_<threshold>.png".
 *
 * Resolved here rather than guessed in the browser so a name the wiki does not
 * have simply gets no entry, instead of the site rendering a broken image. The
 * returned URL keeps the wiki's own version hash, which busts caches when the
 * art is redrawn.
 */
async function resolveStackIcons(items) {
  // Thousands of ids share a display name, so one title can be the art for
  // several items; every one of them has to receive the resolved URL.
  const wanted = new Map();
  let variants = 0;
  for (const entry of Object.values(items)) {
    if (!entry.counts) continue;
    for (const count of entry.counts) {
      const title = `File:${entry.name}_${count[1]}.png`;
      const sharing = wanted.get(title);
      if (sharing) sharing.push(count);
      else wanted.set(title, [count]);
      variants += 1;
    }
  }
  if (!wanted.size) return { found: 0, missing: 0, variants: 0 };

  const titles = [...wanted.keys()];
  let found = 0;
  for (let at = 0; at < titles.length; at += WIKI_BATCH) {
    const batch = titles.slice(at, at + WIKI_BATCH);
    const url = `${WIKI_API}?${new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url',
      titles: batch.join('|'),
    })}`;

    let payload;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = await response.json();
    } catch (err) {
      console.log(`::warning::wiki batch ${at / WIKI_BATCH} failed: ${err.message}`);
      continue;
    }

    const pages = payload?.query?.pages ?? {};
    // MediaWiki rewrites underscores to spaces, so map its titles back.
    const asked = new Map(batch.map((t) => [t.replace(/_/g, ' '), t]));
    for (const page of Object.values(pages)) {
      const original = asked.get(page.title);
      const sharing = original && wanted.get(original);
      if (!sharing || page.missing !== undefined || !page.imageinfo) continue;
      const file = page.imageinfo[0].url.replace(WIKI_IMAGES, '');
      for (const count of sharing) count[2] = file;
      found += sharing.length;
    }
  }
  return { found, missing: variants - found, variants };
}

const WIKI_MAPPING = 'https://prices.runescape.wiki/api/v2/rs/mapping';

/**
 * High and low alchemy values.
 *
 * The wiki publishes them, but only for the ~6k items the Grand Exchange
 * trades. For everything else they are derived from the cache's `cost`, which
 * is what the game bases them on: checked against every wiki entry, the rule
 * max(1, floor(cost * 0.6)) agrees on 5898 of 5964 items. The exceptions are
 * genuine overrides — an Air rune costs 17 in the cache but alchs for 3 — so
 * the wiki wins wherever it has an opinion.
 */
async function resolveAlchValues(items) {
  let exact = 0;
  let derived = 0;

  let mapping;
  try {
    const response = await fetch(WIKI_MAPPING, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    mapping = Array.isArray(payload) ? payload : (payload?.data ?? []);
  } catch (err) {
    console.log(`::warning::wiki alch mapping failed, deriving all: ${err.message}`);
    mapping = [];
  }

  const published = new Map();
  for (const entry of mapping) {
    if (Number.isInteger(entry?.id)) published.set(entry.id, entry);
  }

  for (const [key, item] of Object.entries(items)) {
    const known = published.get(Number(key));
    if (known?.highalch !== undefined) {
      item.alchHigh = known.highalch;
      if (known.lowalch !== undefined) item.alchLow = known.lowalch;
      exact += 1;
      continue;
    }
    // Nothing to derive from, and an item with no value cannot be alched.
    if (!item.cost) continue;
    item.alchHigh = Math.max(1, Math.floor(item.cost * 0.6));
    item.alchLow = Math.max(1, Math.floor(item.cost * 0.4));
    derived += 1;
  }

  return { exact, derived };
}

async function buildItems() {
  const items = {};
  let tradeable = 0;
  for (const block of readBlocks(root, 'obj')) {
    const id = idFor('obj', block.gameval);
    const name = realName(block);
    if (id === undefined || !name) continue;

    const entry = { name };
    // Exactly the items the Grand Exchange trades, which is what tells an
    // unpriced item apart from an untradeable one.
    if (flag(block, 'stockmarket')) {
      entry.ge = true;
      tradeable += 1;
    }
    const cost = int(block, 'cost');
    if (cost !== undefined && cost > 0) entry.cost = cost;
    if (flag(block, 'members')) entry.members = true;
    if (flag(block, 'stackable')) entry.stackable = true;

    // count1..countN swap in a different model once the stack reaches a
    // threshold, so the pairs are [item id, from this quantity up].
    const counts = [];
    for (let n = 1; n <= 10; n++) {
      const raw = one(block, `count${n}`);
      if (raw === undefined) continue;
      const [gameval, threshold] = parts(raw);
      const variant = idFor('obj', gameval);
      const from = Number(threshold);
      if (variant !== undefined && Number.isFinite(from)) {
        counts.push([variant, Math.round(from)]);
      }
    }
    if (counts.length) entry.counts = counts;

    items[id] = entry;
  }

  const stacks = noWiki
    ? { found: 0, missing: 0, skipped: true }
    : await resolveStackIcons(items);
  const alch = noWiki
    ? { exact: 0, derived: 0, skipped: true }
    : await resolveAlchValues(items);

  const path = write('items.json', { count: Object.keys(items).length, items });
  console.log(
    `items        ${Object.keys(items).length} (${tradeable} tradeable) -> ${path}`,
  );
  console.log(
    stacks.skipped
      ? '  stack icons  skipped (--no-wiki)'
      : `  stack icons  ${stacks.found} resolved` +
          (stacks.missing ? `, ${stacks.missing} not on the wiki` : ''),
  );
  console.log(
    alch.skipped
      ? '  alch values  skipped (--no-wiki)'
      : `  alch values  ${alch.exact} from the wiki, ${alch.derived} derived from cost`,
  );
}

function buildNpcs() {
  const names = {};
  for (const block of readBlocks(root, 'npc')) {
    const id = idFor('npc', block.gameval);
    const name = realName(block);
    if (id !== undefined && name) names[id] = name;
  }
  const path = write('npc-names.json', {
    count: Object.keys(names).length,
    names,
  });
  console.log(`npc names    ${Object.keys(names).length} -> ${path}`);
}

function buildAchievements() {
  const achievements = {};
  let unresolved = 0;
  for (const block of readBlocks(root, 'achievement')) {
    const name = realName(block);
    if (!name) continue;
    const id = idFor('achievement', block.gameval);
    if (id === undefined) {
      unresolved += 1;
      continue;
    }

    const entry = { name };
    // desc lines are "<index>,<text>"; the index orders multi-line blurbs.
    const descs = many(block, 'desc')
      .map((line) => {
        const comma = line.indexOf(',');
        return comma < 0 ? line : line.slice(comma + 1);
      })
      .filter(Boolean);
    if (descs.length) entry.desc = descs.join(' ');

    const category = one(block, 'category');
    if (category) entry.category = category;
    const subcat = one(block, 'subcat');
    if (subcat) entry.subcat = subcat;
    const runescore = int(block, 'runescore');
    if (runescore !== undefined && runescore > 0) entry.runescore = runescore;
    if (flag(block, 'hide')) entry.hidden = true;

    achievements[id] = entry;
  }
  const path = write('achievements.json', {
    count: Object.keys(achievements).length,
    achievements,
  });
  console.log(
    `achievements ${Object.keys(achievements).length} -> ${path}` +
      (unresolved ? ` (${unresolved} had no asset id, skipped)` : ''),
  );
}

/** dump.param records each param's value type, which is how values resolve. */
function paramTypes() {
  const types = new Map();
  for (const block of readBlocks(root, 'param')) {
    const type = one(block, 'type');
    if (type) types.set(block.gameval, type);
  }
  return types;
}

function paramValue(type, raw) {
  switch (type) {
    case 'int':
    case 'var_int': {
      const value = Number(raw);
      return Number.isFinite(value) ? Math.round(value) : undefined;
    }
    case 'boolean':
      // Stored as 1 and simply absent when false, as the shipped file has it.
      return raw === 'true' || raw === 'yes' || raw === '1' ? 1 : undefined;
    case 'obj':
      return idFor('obj', raw);
    case 'achievement':
      return idFor('achievement', raw);
    case 'graphic':
      // Sprite refs are written "sheet,index" in the dump but joined with an
      // underscore in the cache's own name table.
      return idFor('graphic', parts(raw).join('_'));
    default:
      return raw;
  }
}

/** "0_41_50_16_15" -> packed (level << 28) | (x << 14) | z. */
function packCoord(raw) {
  const bits = raw.split('_').map(Number);
  if (bits.length !== 5 || bits.some((n) => !Number.isFinite(n))) return undefined;
  const [level, squareX, squareZ, localX, localZ] = bits;
  const x = squareX * 64 + localX;
  const z = squareZ * 64 + localZ;
  return ((level << 28) | (x << 14) | z) >>> 0;
}

function buildQuests() {
  const types = paramTypes();
  const byGameval = new Map();
  const blocks = readBlocks(root, 'quest');
  for (const block of blocks) byGameval.set(block.gameval, block);

  const quests = [];
  let unresolved = 0;
  for (const block of blocks) {
    const id = idFor('quest', block.gameval);
    if (id === undefined) {
      unresolved += 1;
      continue;
    }
    // Placeholder quests carry an empty name rather than "null"; the shipped
    // catalogue keeps them, and consumers skip unnamed entries themselves.
    const name = one(block, 'name') ?? '';

    // A quest can list several places it can be started from.
    const startCoords = [];
    for (const key of ['mainstartcoord', 'startcoord']) {
      for (const raw of many(block, key)) {
        const packed = packCoord(raw);
        if (packed !== undefined) startCoords.push(packed);
      }
    }

    const entry = {
      id,
      quest_gameval: block.gameval,
      name,
    };
    if (block.fields.has('sortname')) {
      entry.sortName = one(block, 'sortname') ?? '';
    }
    entry.members = flag(block, 'members');
    entry.difficulty = one(block, 'difficulty') ?? 'novice';
    entry.questPoints = int(block, 'questpoints') ?? 0;
    entry.startCoords = startCoords;
    entry.questPointsReq = int(block, 'qpreq') ?? 0;

    const via = one(block, 'viacoord');
    if (via !== undefined) {
      const packed = packCoord(via);
      if (packed !== undefined) entry.viaCoord = packed;
    }

    // The quest's list icon, kept as both the resolved sprite id and the
    // gameval it came from.
    const icon = one(block, 'icon');
    if (icon !== undefined) {
      const sprite = idFor('graphic', parts(icon).join('_'));
      if (sprite !== undefined) entry.icon = sprite;
      entry.sprite_gameval = parts(icon).join('_');
    }

    for (const raw of many(block, 'param')) {
      const comma = raw.indexOf(',');
      if (comma < 0) continue;
      const key = raw.slice(0, comma);
      if (!QUEST_PARAMS.has(key)) continue;
      const value = paramValue(types.get(key) ?? 'string', raw.slice(comma + 1));
      if (value !== undefined) entry[key] = value;
    }

    entry.questReqs = many(block, 'questreq')
      .map((gameval) => {
        const required = byGameval.get(gameval);
        const requiredId = idFor('quest', gameval);
        if (requiredId === undefined || !required) return undefined;
        return {
          id: requiredId,
          quest_gameval: gameval,
          name: realName(required) ?? gameval,
        };
      })
      .filter(Boolean);

    entry.statReqs = many(block, 'statreq')
      .map((line) => {
        const [raw, level] = line.split(',');
        const stat = STAT_ALIAS[raw] ?? raw;
        const statId = STAT_ID.get(stat);
        const value = Number(level);
        if (statId === undefined || !Number.isFinite(value)) return undefined;
        return { stat: statId, name: stat, level: Math.round(value) };
      })
      .filter(Boolean);

    // Never populated in the shipped catalogue; kept so the shape is stable.
    entry.varpReqs = [];
    entry.varbitReqs = [];

    quests.push(entry);
  }

  quests.sort((a, b) => a.id - b.id);
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, 'quests.json');
  writeFileSync(path, JSON.stringify(quests), 'utf8');
  console.log(
    `quests       ${quests.length} -> ${path}` +
      (unresolved ? ` (${unresolved} had no asset id, skipped)` : ''),
  );
}

const cache = await resolveCache({
  cacheId: arg('--cache-id'),
  revision,
});
console.log(
  `dump ${root} (revision ${revision || 'unknown'})\n` +
    `asset ids from openrs2 cache ${cache.cacheId} (build ${cache.revision}.${cache.minor}, ${cache.timestamp.slice(0, 10)})`,
);
if (cache.revision !== revision) {
  console.log(
    `::warning::dump is revision ${revision} but asset ids come from ${cache.revision}`,
  );
}

if (wanted('items')) {
  await load('obj', cache.cacheId);
  await buildItems();
}
if (wanted('npcs')) {
  await load('npc', cache.cacheId);
  buildNpcs();
}
if (wanted('achievements')) {
  await load('achievement', cache.cacheId);
  buildAchievements();
}
if (wanted('quests')) {
  await load('quest', cache.cacheId);
  await load('achievement', cache.cacheId);
  await load('graphic', cache.cacheId);
  await load('obj', cache.cacheId);
  buildQuests();
}
