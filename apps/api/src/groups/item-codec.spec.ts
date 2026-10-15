import {
  inventoryContentHash,
  pairsToRows,
  statsFromArray,
  statsToArray,
} from './item-codec';

describe('inventoryContentHash', () => {
  it('is stable for identical contents', () => {
    const rows = pairsToRows([995, 1000, 1511, 5], 'bank');
    expect(inventoryContentHash(rows)).toBe(inventoryContentHash(rows));
  });

  // Contents decide the hash, never the order rows happen to arrive in.
  it('ignores row order', () => {
    const rows = pairsToRows([995, 1000, 1511, 5, 2, 7], 'bank');
    const shuffled = [rows[2], rows[0], rows[1]];
    expect(inventoryContentHash(shuffled)).toBe(inventoryContentHash(rows));
  });

  it('changes when a quantity changes', () => {
    const before = pairsToRows([995, 1000], 'bank');
    const after = pairsToRows([995, 1001], 'bank');
    expect(inventoryContentHash(after)).not.toBe(inventoryContentHash(before));
  });

  it('changes when an item id changes', () => {
    const before = pairsToRows([995, 1000], 'bank');
    const after = pairsToRows([996, 1000], 'bank');
    expect(inventoryContentHash(after)).not.toBe(inventoryContentHash(before));
  });

  it('changes when an item is added', () => {
    const before = pairsToRows([995, 1000], 'bank');
    const after = pairsToRows([995, 1000, 1511, 5], 'bank');
    expect(inventoryContentHash(after)).not.toBe(inventoryContentHash(before));
  });

  // Positional inventories keep empty slots, so a moved item must still differ.
  it('distinguishes an item moving between slots', () => {
    const before = pairsToRows([995, 1000, 0, 0], 'inv');
    const after = pairsToRows([0, 0, 995, 1000], 'inv');
    expect(inventoryContentHash(after)).not.toBe(inventoryContentHash(before));
  });

  it('handles an empty inventory', () => {
    expect(inventoryContentHash([])).toBe(inventoryContentHash([]));
    expect(inventoryContentHash([])).not.toBe(
      inventoryContentHash(pairsToRows([995, 1], 'bank')),
    );
  });
});

describe('weight slot', () => {
  const VITALS = [100, 990, 10, 100, 1, 10, 84];

  // A plugin that predates the slot must not zero a weight already stored.
  it('is omitted when the array stops at the world', () => {
    expect(statsFromArray(VITALS)).not.toHaveProperty('weight');
  });

  it('keeps one decimal', () => {
    expect(statsFromArray([...VITALS, 23.46])).toMatchObject({ weight: 23.5 });
  });

  // Weight-reducing gear takes it below zero, unlike every other slot.
  it('accepts a negative weight', () => {
    expect(statsFromArray([...VITALS, -4.5])).toMatchObject({ weight: -4.5 });
  });

  it('clamps the vitals it sits beside to zero', () => {
    expect(statsFromArray([-5, 990, 10, 100, 1, 10])).toMatchObject({
      hpCurrent: 0,
    });
  });

  it('round-trips through the wire array', () => {
    const decoded = statsFromArray([...VITALS, 23.5]);
    expect(
      statsToArray({ ...decoded, world: 84, weight: 23.5 }),
    ).toEqual([...VITALS, 23.5]);
  });
});
