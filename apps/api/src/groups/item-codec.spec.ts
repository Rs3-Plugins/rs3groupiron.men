import { inventoryContentHash, pairsToRows } from './item-codec';

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
