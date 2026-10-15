/**
 * Reader for zwyz/rs3-cache dump output.
 *
 * Each config file is a run of blocks, keyed by gameval name, holding repeated
 * `key=value` lines:
 *
 *   [potato_seed]
 *   count1=potato_seed_2,2
 *   cost=8
 *   name=Potato seed
 *
 * Ids live separately in symbols/<kind>.sym as "<id>\t<gameval>".
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Some kinds have no .sym in the dump (achievement, quest). Their ids come
 * from the gameval catalogue the rs3-api-ts sync already decodes out of cache
 * archive 67, which is the same id space.
 */
export function readGamevals(path) {
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const file = JSON.parse(readFileSync(path, 'utf8'));
  const entries = file?.entries;
  if (!entries || typeof entries !== 'object') {
    throw new Error(`${path} has no "entries" object`);
  }
  const idOf = new Map();
  const nameOf = new Map();
  for (const [key, gameval] of Object.entries(entries)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id < 0 || typeof gameval !== 'string') continue;
    idOf.set(gameval, id);
    nameOf.set(id, gameval);
  }
  return { idOf, nameOf };
}

/** Reads symbols/<kind>.sym into both directions of the id <-> gameval map. */
export function readSymbols(root, kind) {
  const path = join(root, 'symbols', `${kind}.sym`);
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const idOf = new Map();
  const nameOf = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const id = Number(line.slice(0, tab).trim());
    const gameval = line.slice(tab + 1).trim();
    if (!Number.isInteger(id) || id < 0 || !gameval) continue;
    idOf.set(gameval, id);
    nameOf.set(id, gameval);
  }
  return { idOf, nameOf };
}

/**
 * Reads config/dump.<kind> into blocks. Values are kept as arrays because
 * several keys legitimately repeat (param, statreq, varbitreq...).
 */
export function readBlocks(root, kind) {
  const path = join(root, 'config', `dump.${kind}`);
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const blocks = [];
  let current = null;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('[') && line.endsWith(']')) {
      current = { gameval: line.slice(1, -1), fields: new Map() };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    const existing = current.fields.get(key);
    if (existing) existing.push(value);
    else current.fields.set(key, [value]);
  }
  return blocks;
}

/**
 * Last occurrence wins. A block can set the same key more than once, the later
 * line overriding the earlier — `sortname=` then `sortname=Holly`, or two
 * `icon=` lines where only the second is the quest's real icon.
 */
export function one(block, key) {
  const values = block.fields.get(key);
  return values && values.length ? values[values.length - 1] : undefined;
}

export function many(block, key) {
  return block.fields.get(key) ?? [];
}

export function flag(block, key) {
  const value = one(block, key);
  return value === 'yes' || value === 'true' || value === '1';
}

export function int(block, key) {
  const value = Number(one(block, key));
  return Number.isFinite(value) ? Math.round(value) : undefined;
}

/**
 * Jagex writes "null" into unused cache slots; they are not real content and
 * would otherwise show up as thousands of items called "null".
 */
export function realName(block) {
  const name = one(block, 'name');
  return name && name !== 'null' ? name : undefined;
}

/** Splits a comma list, honouring the quoting zwyz uses for sprite refs. */
export function parts(value) {
  const trimmed = value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
  return trimmed.split(',');
}

export function dumpRevision(root) {
  const match = /rev(\d+)/.exec(root);
  return match ? Number(match[1]) : 0;
}
