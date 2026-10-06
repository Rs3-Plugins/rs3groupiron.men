import { totalsByItemId } from './item-codec';

export type ItemRow = { slot: number; itemId: number; quantity: number };

export type ItemChangePlan = {
  changed: boolean;
  /** Item ids whose rows are removed before `insert` is written. */
  deleteItemIds: number[];
  insert: ItemRow[];
  /** The inventory's contents after the plan is applied. */
  rows: ItemRow[];
  /** Per-item quantity change, for the shared bank ledger. */
  movements: Array<{ itemId: number; delta: number }>;
};

/**
 * Turn a [itemId, newTotal, ...] change list into row operations against the
 * current contents. An item keeps its slot when it already has one and takes
 * the next free slot otherwise, so the stored order stays stable across
 * deltas. Only item totals are tracked; the backpack, where slots matter, is
 * never updated this way.
 */
export function planItemChanges(
  current: ItemRow[],
  pairs: number[],
): ItemChangePlan {
  const changes = totalsByItemId(pairs);
  const rowsById = new Map<number, ItemRow[]>();
  let nextSlot = 0;
  for (const row of current) {
    const rows = rowsById.get(row.itemId) ?? [];
    rows.push(row);
    rowsById.set(row.itemId, rows);
    nextSlot = Math.max(nextSlot, row.slot + 1);
  }

  const plan: ItemChangePlan = {
    changed: false,
    deleteItemIds: [],
    insert: [],
    rows: current.filter((row) => !changes.has(row.itemId)),
    movements: [],
  };

  for (const [itemId, total] of changes) {
    const rows = rowsById.get(itemId) ?? [];
    const currentTotal = rows.reduce((sum, row) => sum + row.quantity, 0);
    if (rows.length <= 1 && currentTotal === total) {
      plan.rows.push(...rows);
      continue;
    }
    plan.changed = true;
    if (currentTotal !== total) {
      plan.movements.push({ itemId, delta: total - currentTotal });
    }
    if (rows.length) plan.deleteItemIds.push(itemId);
    if (total > 0) {
      const row = {
        slot: rows[0]?.slot ?? nextSlot++,
        itemId,
        quantity: total,
      };
      plan.insert.push(row);
      plan.rows.push(row);
    }
  }

  plan.movements.sort((a, b) => a.itemId - b.itemId);
  return plan;
}
