import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEMO_GROUP,
  fetchBankLedger,
  type BankLedgerEntry,
} from '../../api/groupClient';
import { dayBounds, shiftDay, toDayInput } from '../../lib/day';
import { colorForName, formatQty, itemName } from '../../lib/items';
import { formatGp } from '../../lib/itemPrices';
import { ItemIcon } from './ItemIcon';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

/**
 * Quantity shown beside the item name: exact under 10k so small stacks read
 * literally (1, 2,300), abbreviated above it (100K, 16M) like the Items tab.
 */
function compactQty(n: number) {
  const abs = Math.abs(n);
  return abs < 10_000 ? abs.toLocaleString() : formatGp(abs);
}

const PAGE_SIZE = 100;
const MINUS = '−';

const TIME_ONLY = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});
const DATE_AND_TIME = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

type Direction = 'all' | 'in' | 'out';

const DIRECTIONS: Array<{ id: Direction; label: string }> = [
  { id: 'all', label: 'All movements' },
  { id: 'in', label: 'Deposits only' },
  { id: 'out', label: 'Withdrawals only' },
];

type LedgerPanelProps = {
  groupName?: string;
  groupToken?: string;
  /** Bumps on each incoming group poll; reloads the newest page. */
  dataRevision?: number;
};

export function LedgerPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  dataRevision,
}: LedgerPanelProps) {
  const [entries, setEntries] = useState<BankLedgerEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [direction, setDirection] = useState<Direction>('all');
  const [memberFilter, setMemberFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [today] = useState(() => toDayInput(new Date()));
  /** Selected calendar day, or '' for the whole history. */
  const [day, setDay] = useState(today);

  // Same guard as GraphsPanel: abort the in-flight request and ignore any
  // response that is not from the latest sequence number.
  const inFlight = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (before?: string) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const mySeq = ++seq.current;
      setLoading(true);
      setError(null);
      const bounds = day ? dayBounds(day) : null;
      try {
        const next = await fetchBankLedger(groupName, groupToken, {
          limit: PAGE_SIZE,
          before,
          from: bounds?.from,
          to: bounds?.to,
          signal: controller.signal,
        });
        if (mySeq !== seq.current) return;
        setEntries((prev) => (before ? [...prev, ...next.entries] : next.entries));
        setHasMore(next.has_more);
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (mySeq !== seq.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load bank ledger');
        if (!before) {
          setEntries([]);
          setHasMore(false);
        }
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
        if (mySeq === seq.current) setLoading(false);
      }
    },
    [groupName, groupToken, day],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Pull in new movements as they land, plus a slow backstop for entries that
  // arrive without a member update. Paging past the first page opts out: the
  // reader is browsing history, and reloading would throw their place away.
  useLiveRefresh(
    useCallback(() => {
      if (entries.length > PAGE_SIZE) return;
      void load();
    }, [load, entries.length]),
    { signal: dataRevision, intervalMs: 15000 },
  );

  useEffect(() => () => inFlight.current?.abort(), []);

  const members = useMemo(() => {
    const names = new Set(entries.map((e) => e.name));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const summary = useMemo(() => {
    const byMember = new Map<string, { deposited: number; withdrawn: number }>();
    for (const entry of entries) {
      const row = byMember.get(entry.name) ?? { deposited: 0, withdrawn: 0 };
      if (entry.delta >= 0) row.deposited += entry.delta;
      else row.withdrawn += -entry.delta;
      byMember.set(entry.name, row);
    }
    return [...byMember.entries()]
      .map(([name, totals]) => ({ name, ...totals }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const visible = useMemo(
    () =>
      entries.filter((entry) => {
        if (memberFilter !== 'all' && entry.name !== memberFilter) return false;
        if (direction === 'in') return entry.delta >= 0;
        if (direction === 'out') return entry.delta < 0;
        return true;
      }),
    [entries, direction, memberFilter],
  );

  const oldest = entries.length ? entries[entries.length - 1] : null;
  const busy = loading && entries.length > 0;

  return (
    <section className="gms-ledger" aria-label="Shared bank ledger" aria-busy={loading}>
      <div className="gms-ledger-toolbar">
        <h2 className="gms-ledger-title">Shared bank ledger</h2>
        <label className="gms-ledger-field">
          <span className="gms-ledger-field-label">Show</span>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as Direction)}
          >
            {DIRECTIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="gms-ledger-field">
          <span className="gms-ledger-field-label">Member</span>
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
          >
            <option value="all">All members</option>
            {members.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="gms-ledger-day">
          <button
            type="button"
            className="gms-ledger-day-step"
            aria-label="Previous day"
            disabled={!day}
            onClick={() => setDay((d) => shiftDay(d, -1))}
          >
            ‹
          </button>
          <label className="gms-ledger-field">
            <span className="gms-ledger-field-label">Day</span>
            <input
              type="date"
              value={day}
              max={today}
              aria-label="Filter by day"
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="gms-ledger-day-step"
            aria-label="Next day"
            disabled={!day || day >= today}
            onClick={() => setDay((d) => shiftDay(d, 1))}
          >
            ›
          </button>
          <button
            type="button"
            className="gms-ledger-day-all"
            aria-pressed={day === ''}
            onClick={() => setDay((d) => (d ? '' : today))}
          >
            {day ? 'All time' : 'Today'}
          </button>
        </div>
      </div>

      {summary.length > 0 && (
        <ul className="gms-ledger-summary" aria-label="Net movement per member">
          {summary.map((row) => (
            <li key={row.name} className="gms-ledger-summary-chip">
              <span
                className="gms-ledger-dot"
                style={{ background: colorForName(row.name) }}
                aria-hidden
              />
              <span className="gms-ledger-summary-name">{row.name}</span>
              <span className="gms-ledger-summary-in" title="Deposited">
                {'↑'}+{formatQty(row.deposited)}
              </span>
              <span className="gms-ledger-summary-out" title="Withdrawn">
                {'↓'}
                {MINUS}
                {formatQty(row.withdrawn)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="gms-ledger-body">
        {error && <p className="gms-ledger-status gms-ledger-status--error">{error}</p>}
        {loading && entries.length === 0 && !error && (
          <p className="gms-ledger-status">Loading…</p>
        )}
        {busy && (
          <p className="gms-ledger-status" aria-live="polite">
            Refreshing…
          </p>
        )}
        {!loading && !error && visible.length === 0 && (
          <p className="gms-ledger-status">
            {day
              ? 'No shared bank movements on this day'
              : 'No shared bank movements yet'}
            {day && (
              <>
                {' · '}
                <button
                  type="button"
                  className="gms-ledger-inline-btn"
                  onClick={() => setDay('')}
                >
                  Show all time
                </button>
              </>
            )}
          </p>
        )}

        {visible.length > 0 && (
          <>
            {/* Visual column labels only — each row already reads out in full. */}
            <div className="gms-ledger-head" aria-hidden>
              <span />
              <span>Member</span>
              <span />
              <span>Item</span>
              <span className="gms-ledger-head-amount">Amount</span>
              <span className="gms-ledger-head-time">
                {day ? 'Time' : 'Date'}
              </span>
            </div>
            <ul className="gms-ledger-list">
              {visible.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} showDate={!day} />
              ))}
            </ul>
          </>
        )}

        {hasMore && (
          <button
            type="button"
            className="gms-ledger-more"
            disabled={loading || !oldest}
            onClick={() => oldest && void load(oldest.at)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </section>
  );
}

function LedgerRow({
  entry,
  showDate,
}: {
  entry: BankLedgerEntry;
  showDate: boolean;
}) {
  const deposited = entry.delta >= 0;
  const amount = `${deposited ? '+' : MINUS}${formatQty(Math.abs(entry.delta))}`;
  const at = new Date(entry.at);
  const valid = !Number.isNaN(at.getTime());
  const absolute = valid ? at.toLocaleString() : entry.at;
  // Within a single day the clock time is enough; across all time show the date.
  const stamp = valid
    ? (showDate ? DATE_AND_TIME : TIME_ONLY).format(at)
    : entry.at;

  return (
    <li
      className={
        deposited
          ? 'gms-ledger-row gms-ledger-row--in'
          : 'gms-ledger-row gms-ledger-row--out'
      }
    >
      <span
        className="gms-ledger-dot"
        style={{ background: colorForName(entry.name) }}
        aria-hidden
      />
      <span className="gms-ledger-name">{entry.name}</span>
      <ItemIcon itemId={entry.item_id} size={24} className="gms-ledger-icon" />
      <span className="gms-ledger-item">
        {itemName(entry.item_id)}
        <span
          className="gms-ledger-amount"
          title={`${formatQty(Math.abs(entry.delta))} ${deposited ? 'deposited' : 'removed'}`}
        >
          {' '}
          (x{compactQty(entry.delta)})
        </span>
      </span>
      <span className="gms-ledger-delta">
        <span className="gms-ledger-arrow" aria-hidden>
          {deposited ? '↑' : '↓'}
        </span>
        <span className="gms-ledger-sr">
          {deposited ? 'Deposited ' : 'Withdrew '}
        </span>
        {amount}
      </span>
      <time className="gms-ledger-time" dateTime={entry.at} title={absolute}>
        <span className="gms-ledger-clock">{stamp}</span>
        <span className="gms-ledger-ago">{relativeTime(at)}</span>
      </time>
    </li>
  );
}

const UNITS: Array<[limitSeconds: number, seconds: number, suffix: string]> = [
  [60, 1, 's'],
  [3600, 60, 'm'],
  [86_400, 3600, 'h'],
  [2_592_000, 86_400, 'd'],
  [31_536_000, 2_592_000, 'mo'],
  [Number.POSITIVE_INFINITY, 31_536_000, 'y'],
];

function relativeTime(at: Date, now = Date.now()) {
  const time = at.getTime();
  if (Number.isNaN(time)) return '';
  const diff = Math.max(0, Math.round((now - time) / 1000));
  if (diff < 45) return 'just now';
  for (const [limit, size, suffix] of UNITS) {
    if (diff < limit) return `${Math.floor(diff / size)}${suffix} ago`;
  }
  return '';
}
