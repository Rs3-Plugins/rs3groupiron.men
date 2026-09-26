import { diffItemTotals, totalsByItemId } from './item-codec';
import {
  LEDGER_LIMIT_DEFAULT,
  LEDGER_LIMIT_MAX,
  LEDGER_LIMIT_MIN,
  buildSyntheticLedgerEntries,
  ledgerDateWindow,
  parseLedgerCursor,
  parseLedgerLimit,
} from './groups.service';

describe('ledgerDateWindow', () => {
  const early = new Date('2026-09-18T00:00:00.000Z');
  const late = new Date('2026-09-19T00:00:00.000Z');

  it('is undefined with no bounds at all', () => {
    expect(ledgerDateWindow(undefined, undefined, undefined)).toBeUndefined();
  });

  it('uses before alone as the upper bound', () => {
    expect(ledgerDateWindow(late, undefined, undefined)).toEqual({ lt: late });
  });

  it('bounds a day with from and to', () => {
    expect(ledgerDateWindow(undefined, early, late)).toEqual({
      gte: early,
      lt: late,
    });
  });

  it('takes the tighter upper bound when paging inside a day', () => {
    const cursor = new Date('2026-09-18T12:00:00.000Z');
    expect(ledgerDateWindow(cursor, early, late)).toEqual({
      gte: early,
      lt: cursor,
    });
    // A cursor later than the day end must not widen the range.
    expect(ledgerDateWindow(late, early, late)).toEqual({
      gte: early,
      lt: late,
    });
  });

  it('keeps the lower bound when only from is given', () => {
    expect(ledgerDateWindow(undefined, early, undefined)).toEqual({
      gte: early,
    });
  });
});

describe('totalsByItemId', () => {
  it('sums duplicate item ids across slots', () => {
    expect([...totalsByItemId([995, 10, 995, 5, 4151, 1])]).toEqual([
      [995, 15],
      [4151, 1],
    ]);
  });

  it('ignores empty slots and undefined input', () => {
    expect([...totalsByItemId([0, 0, 995, 3])]).toEqual([[995, 3]]);
    expect(totalsByItemId(undefined).size).toBe(0);
  });
});

describe('diffItemTotals', () => {
  it('returns [] for a no-op', () => {
    expect(diffItemTotals([995, 100, 4151, 1], [995, 100, 4151, 1])).toEqual(
      [],
    );
  });

  it('records additions as positive deltas', () => {
    expect(diffItemTotals([], [995, 5_000_000])).toEqual([
      { itemId: 995, delta: 5_000_000 },
    ]);
  });

  it('records removals as negative deltas', () => {
    expect(diffItemTotals([4151, 2], [])).toEqual([
      { itemId: 4151, delta: -2 },
    ]);
  });

  it('records quantity changes in both directions', () => {
    expect(diffItemTotals([995, 100, 4151, 3], [995, 250, 4151, 1])).toEqual([
      { itemId: 995, delta: 150 },
      { itemId: 4151, delta: -2 },
    ]);
  });

  it('aggregates duplicate item ids across slots on both sides', () => {
    // before: 995 -> 30; after: 995 -> 12  => -18
    expect(
      diffItemTotals([995, 10, 995, 20], [995, 4, 995, 4, 995, 4]),
    ).toEqual([{ itemId: 995, delta: -18 }]);
  });

  it('handles mixed adds/removes and skips unchanged items', () => {
    expect(
      diffItemTotals([995, 100, 4151, 1, 1234, 7], [1234, 7, 995, 100, 565, 4]),
    ).toEqual([
      { itemId: 565, delta: 4 },
      { itemId: 4151, delta: -1 },
    ]);
  });

  it('treats undefined like empty', () => {
    expect(diffItemTotals(undefined, [995, 1])).toEqual([
      { itemId: 995, delta: 1 },
    ]);
    expect(diffItemTotals([995, 1], undefined)).toEqual([
      { itemId: 995, delta: -1 },
    ]);
    expect(diffItemTotals(undefined, undefined)).toEqual([]);
  });

  it('is sorted by itemId', () => {
    const out = diffItemTotals([], [4151, 1, 995, 2, 565, 3]);
    expect(out.map((e) => e.itemId)).toEqual([565, 995, 4151]);
  });
});

describe('parseLedgerLimit', () => {
  it('defaults when missing or unparseable', () => {
    expect(parseLedgerLimit(undefined)).toBe(LEDGER_LIMIT_DEFAULT);
    expect(parseLedgerLimit('')).toBe(LEDGER_LIMIT_DEFAULT);
    expect(parseLedgerLimit('banana')).toBe(LEDGER_LIMIT_DEFAULT);
    expect(parseLedgerLimit('NaN')).toBe(LEDGER_LIMIT_DEFAULT);
  });

  it('clamps out-of-range values', () => {
    expect(parseLedgerLimit('0')).toBe(LEDGER_LIMIT_MIN);
    expect(parseLedgerLimit('-5')).toBe(LEDGER_LIMIT_MIN);
    expect(parseLedgerLimit('9999')).toBe(LEDGER_LIMIT_MAX);
    expect(parseLedgerLimit('1e12')).toBe(LEDGER_LIMIT_MAX);
  });

  it('accepts in-range values and truncates fractions', () => {
    expect(parseLedgerLimit('1')).toBe(1);
    expect(parseLedgerLimit('50')).toBe(50);
    expect(parseLedgerLimit('200')).toBe(200);
    expect(parseLedgerLimit('12.9')).toBe(12);
  });
});

describe('parseLedgerCursor', () => {
  it('parses an ISO timestamp', () => {
    const d = parseLedgerCursor('2026-09-18T04:00:00.000Z');
    expect(d?.toISOString()).toBe('2026-09-18T04:00:00.000Z');
  });

  it('ignores missing or garbage cursors', () => {
    expect(parseLedgerCursor(undefined)).toBeUndefined();
    expect(parseLedgerCursor('')).toBeUndefined();
    expect(parseLedgerCursor('not-a-date')).toBeUndefined();
    expect(parseLedgerCursor('{}')).toBeUndefined();
  });
});

describe('buildSyntheticLedgerEntries', () => {
  const endAt = new Date('2026-09-18T00:00:00.000Z');

  it('returns nothing without members or items', () => {
    expect(buildSyntheticLedgerEntries('g', 'G', [], [995], endAt)).toEqual([]);
    expect(buildSyntheticLedgerEntries('g', 'G', ['A'], [], endAt)).toEqual([]);
  });

  it('generates 40-60 plausible entries within the last 14 days', () => {
    const rows = buildSyntheticLedgerEntries(
      'gid',
      'Demo Group',
      ['IronMayo', 'Brewer'],
      [995, 4151, 565],
      endAt,
    );
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.length).toBeLessThanOrEqual(60);

    const windowMs = 14 * 24 * 60 * 60 * 1000;
    for (const row of rows) {
      expect(['IronMayo', 'Brewer']).toContain(row.memberName);
      expect([995, 4151, 565]).toContain(row.itemId);
      expect(row.delta).not.toBe(0);
      expect(row.groupId).toBe('gid');
      const at = (row.createdAt as Date).getTime();
      expect(at).toBeLessThanOrEqual(endAt.getTime());
      expect(at).toBeGreaterThanOrEqual(endAt.getTime() - windowMs);
    }

    expect(rows.some((r) => r.delta > 0)).toBe(true);
    expect(rows.some((r) => r.delta < 0)).toBe(true);
  });

  it('is deterministic for the same group', () => {
    const a = buildSyntheticLedgerEntries(
      'g',
      'Demo',
      ['A', 'B'],
      [995],
      endAt,
    );
    const b = buildSyntheticLedgerEntries(
      'g',
      'Demo',
      ['A', 'B'],
      [995],
      endAt,
    );
    expect(a).toEqual(b);
  });
});
