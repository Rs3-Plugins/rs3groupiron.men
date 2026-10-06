import { planItemChanges } from './item-changes';

const CURRENT = [
  { slot: 0, itemId: 995, quantity: 1_000_000 },
  { slot: 1, itemId: 4151, quantity: 1 },
  { slot: 2, itemId: 1038, quantity: 1 },
];

describe('planItemChanges', () => {
  it('changes a quantity in place, keeping the slot', () => {
    const plan = planItemChanges(CURRENT, [995, 1_000_500]);
    expect(plan.changed).toBe(true);
    expect(plan.deleteItemIds).toEqual([995]);
    expect(plan.insert).toEqual([
      { slot: 0, itemId: 995, quantity: 1_000_500 },
    ]);
    expect(plan.movements).toEqual([{ itemId: 995, delta: 500 }]);
    expect(plan.rows).toHaveLength(3);
  });

  it('removes an item when its total drops to zero', () => {
    const plan = planItemChanges(CURRENT, [4151, 0]);
    expect(plan.deleteItemIds).toEqual([4151]);
    expect(plan.insert).toEqual([]);
    expect(plan.movements).toEqual([{ itemId: 4151, delta: -1 }]);
    expect(plan.rows.map((r) => r.itemId)).toEqual([995, 1038]);
  });

  it('appends a new item after the highest slot', () => {
    const plan = planItemChanges(CURRENT, [11802, 1]);
    expect(plan.deleteItemIds).toEqual([]);
    expect(plan.insert).toEqual([{ slot: 3, itemId: 11802, quantity: 1 }]);
    expect(plan.movements).toEqual([{ itemId: 11802, delta: 1 }]);
  });

  it('is a no-op when the totals already match', () => {
    const plan = planItemChanges(CURRENT, [995, 1_000_000, 4151, 1]);
    expect(plan.changed).toBe(false);
    expect(plan.rows).toHaveLength(3);
    expect(plan.movements).toEqual([]);
  });

  it('removing an item the inventory never had is a no-op, not a movement', () => {
    const plan = planItemChanges(CURRENT, [999_999, 0]);
    expect(plan.changed).toBe(false);
    expect(plan.movements).toEqual([]);
  });

  it('collapses duplicate rows for one item into a single row', () => {
    const split = [
      { slot: 0, itemId: 995, quantity: 10 },
      { slot: 5, itemId: 995, quantity: 5 },
    ];
    const plan = planItemChanges(split, [995, 15]);
    expect(plan.changed).toBe(true);
    expect(plan.movements).toEqual([]);
    expect(plan.insert).toEqual([{ slot: 0, itemId: 995, quantity: 15 }]);
  });
});
