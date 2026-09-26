import { createHash } from 'node:crypto';

/**
 * Inventories the plugin has always sent as named wire fields, mapped to the
 * RS3 inv gameval they are stored under. Anything else arrives through the
 * generic `inventories` map keyed by gameval directly.
 */
export const WIRE_INVENTORIES = {
  inventory: 'inv',
  equipment: 'worn',
  bank: 'bank',
} as const;

export type WireInventoryField = keyof typeof WIRE_INVENTORIES;

/** Inventories whose slot positions matter, so empty slots are kept. */
const POSITIONAL_INVENTORIES: ReadonlySet<string> = new Set([
  WIRE_INVENTORIES.inventory,
]);

export type InventoryRow = { slot: number; itemId: number; quantity: number };

/** Flat [itemId, qty, itemId, qty, ...] ↔ indexed rows */
export function pairsToRows(
  pairs: number[] | undefined,
  inventoryKey: string,
): InventoryRow[] {
  if (!pairs?.length) return [];
  const rows: InventoryRow[] = [];
  const positional = POSITIONAL_INVENTORIES.has(inventoryKey);
  let slot = 0;
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const itemId = pairs[i] ?? 0;
    const quantity = pairs[i + 1] ?? 0;
    // Keep empty inventory slots so plugin wire format stays aligned
    if (positional || itemId > 0) {
      rows.push({ slot, itemId, quantity });
      slot += 1;
    }
  }
  return rows;
}

/**
 * Fingerprints inventory contents so an unchanged sync can skip its write.
 *
 * The plugin resends a member's whole bank on every sync whether or not it
 * changed, and storing it means deleting and reinserting every row — up to
 * 4000 of them. Comparing this hash first turns that into a single read.
 *
 * Rows are sorted by slot so the result depends only on contents, never on
 * the order they happen to arrive in. Not security-sensitive: a collision
 * would mean a skipped write, not a vulnerability.
 */
export function inventoryContentHash(rows: InventoryRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => a.slot - b.slot)
    .map((row) => `${row.slot}:${row.itemId}:${row.quantity}`)
    .join(',');
  return createHash('sha256').update(canonical).digest('hex');
}

export function rowsToPairs(
  rows: { slot: number; itemId: number; quantity: number }[],
): number[] {
  const sorted = [...rows].sort((a, b) => a.slot - b.slot);
  const out: number[] = [];
  for (const row of sorted) {
    out.push(row.itemId, row.quantity);
  }
  return out;
}

export function mergeItemPairs(
  existing: number[],
  deposited: number[],
): number[] {
  const map = new Map<number, number>();
  for (let i = 0; i + 1 < existing.length; i += 2) {
    const id = existing[i];
    const qty = existing[i + 1];
    if (id) map.set(id, (map.get(id) ?? 0) + qty);
  }
  for (let i = 0; i + 1 < deposited.length; i += 2) {
    const id = deposited[i];
    const qty = deposited[i + 1];
    if (id) map.set(id, (map.get(id) ?? 0) + qty);
  }
  const out: number[] = [];
  for (const [id, qty] of map) out.push(id, qty);
  return out;
}

/**
 * Totals per itemId for a flat [itemId, qty, ...] list. The same itemId can
 * occupy several slots, so quantities are summed.
 */
export function totalsByItemId(
  pairs: number[] | undefined,
): Map<number, number> {
  const totals = new Map<number, number>();
  if (!pairs?.length) return totals;
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const id = pairs[i];
    const qty = pairs[i + 1] ?? 0;
    if (!id) continue;
    totals.set(id, (totals.get(id) ?? 0) + qty);
  }
  return totals;
}

/**
 * Per-item change between two shared-bank snapshots.
 * Positive delta = deposited, negative = withdrawn. Zero deltas are dropped.
 * Result is sorted by itemId for deterministic output.
 */
export function diffItemTotals(
  before: number[] | undefined,
  after: number[] | undefined,
): Array<{ itemId: number; delta: number }> {
  const beforeTotals = totalsByItemId(before);
  const afterTotals = totalsByItemId(after);
  const itemIds = new Set<number>([
    ...beforeTotals.keys(),
    ...afterTotals.keys(),
  ]);
  const out: Array<{ itemId: number; delta: number }> = [];
  for (const itemId of itemIds) {
    const delta =
      (afterTotals.get(itemId) ?? 0) - (beforeTotals.get(itemId) ?? 0);
    if (delta !== 0) out.push({ itemId, delta });
  }
  out.sort((a, b) => a.itemId - b.itemId);
  return out;
}

/** Vitals/coords may arrive as doubles; DB columns are Int. */
function toInt(value: number | undefined): number {
  return Number.isFinite(value) ? Math.round(value as number) : 0;
}

export function statsFromArray(stats: number[] | undefined) {
  return {
    hpCurrent: toInt(stats?.[0]),
    hpMax: toInt(stats?.[1]),
    prayerCurrent: toInt(stats?.[2]),
    prayerMax: toInt(stats?.[3]),
    summonCurrent: toInt(stats?.[4]),
    summonMax: toInt(stats?.[5]),
    world: toInt(stats?.[6]),
  };
}

export function statsToArray(m: {
  hpCurrent: number;
  hpMax: number;
  prayerCurrent: number;
  prayerMax: number;
  summonCurrent: number;
  summonMax: number;
  world: number;
}): number[] {
  return [
    m.hpCurrent,
    m.hpMax,
    m.prayerCurrent,
    m.prayerMax,
    m.summonCurrent,
    m.summonMax,
    m.world,
  ];
}

export function coordsFromArray(coordinates: number[] | undefined) {
  return {
    x: toInt(coordinates?.[0]),
    y: toInt(coordinates?.[1]),
    plane: toInt(coordinates?.[2]),
  };
}
