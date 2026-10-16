import { useCallback, useMemo, useState } from 'react';
import { DEMO_GROUP, fetchBankLedger, type BankLedgerEntry } from '../../api/groupClient';
import { useUrlState, useUrlText } from '../../hooks/useUrlState';
import {
  DATE_RANGES,
  dayLabel,
  rangeBounds,
  toDayInput,
  type DateRange,
} from '../../lib/day';
import { colorForName, formatQty, itemName } from '../../lib/items';
import { useItemNames } from '../../lib/itemNames';
import { formatGp, getItemPrices } from '../../lib/itemPrices';
import { timestamp, toUnix } from '../../lib/time';
import { usePagedHistory } from '../../hooks/usePagedHistory';
import { DayNav, RANGE_OPTIONS } from './DayNav';
import { Dropdown, type DropdownOption } from './Dropdown';
import { downloadCsv, downloadJson } from '../../lib/exportTable';
import { BankGlyph, EmptyState, SearchGlyph } from './EmptyState';
import { ExportMenu, type ExportFormat } from './ExportMenu';
import { ItemIcon } from './ItemIcon';
import type { MemberBadge } from './memberOptions';
import { LoadMoreButton, PanelStatus } from './PanelChrome';
import { Segmented, type SegmentedOption } from './Segmented';

const PAGE_SIZE = 100;
const MINUS = '−';

type Direction = 'all' | 'in' | 'out';

const DIRECTION_VALUES: Direction[] = ['all', 'in', 'out'];

const DIRECTIONS: Array<DropdownOption<Direction>> = [
  { id: 'all', label: 'All movements' },
  { id: 'in', label: 'Deposits' },
  { id: 'out', label: 'Withdrawals' },
];

type LedgerView = 'list' | 'tiles';

const VIEW_VALUES: LedgerView[] = ['list', 'tiles'];

const VIEWS: Array<SegmentedOption<LedgerView>> = [
  { id: 'list', label: 'List' },
  { id: 'tiles', label: 'Tiles' },
];

const EXPORT_FORMATS: ExportFormat[] = ['csv', 'json'];

function compactQty(n: number) {
  const abs = Math.abs(n);
  return abs < 10_000 ? abs.toLocaleString() : formatGp(abs);
}

type LedgerPanelProps = {
  groupName?: string;
  groupToken?: string;
  dataRevision?: number;
  members?: ReadonlyArray<MemberBadge>;
  /** ISO instant the group was created; the calendar stops there. */
  createdAt?: string;
  injected?: ReadonlyArray<BankLedgerEntry>;
};

export function LedgerPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  dataRevision,
  members = [],
  createdAt,
  injected,
}: LedgerPanelProps) {
  const [direction, setDirection] = useUrlState<Direction>('dir', 'all', {
    allowed: DIRECTION_VALUES,
  });
  const [memberFilter, setMemberFilter] = useUrlState('member', 'all');
  const [today] = useState(() => toDayInput(new Date()));
  const [day, setDay] = useUrlState('day', today);
  // Subscribes to the item catalogue: without it nothing starts the fetch and
  // every row stays on its "Item 1623" fallback.
  useItemNames();
  const [query, setQuery] = useUrlText('q');
  const [range, setRange] = useUrlState<DateRange>('range', '24h', { allowed: DATE_RANGES });
  const [view, setView] = useUrlState<LedgerView>('view', 'list', { allowed: VIEW_VALUES });

  const fetchPage = useCallback(
    ({ before, limit, signal }: { before?: string; limit: number; signal: AbortSignal }) => {
      const bounds = rangeBounds(range, day, today);
      return fetchBankLedger(groupName, groupToken, {
        limit,
        before,
        from: bounds?.from,
        to: bounds?.to,
        signal,
      });
    },
    [groupName, groupToken, range, day, today],
  );

  const {
    entries: fetched,
    hasMore,
    error,
    loading,
    oldest,
    loadMore,
  } = usePagedHistory<BankLedgerEntry>({
    fetchPage,
    pageSize: PAGE_SIZE,
    errorFallback: 'Failed to load bank ledger',
    dataRevision,
    refreshMs: 300_000,
  });

  const entries = useMemo(() => {
    if (!injected?.length) return fetched;
    const bounds = rangeBounds(range, day, today);
    const extra = injected.filter(
      (entry) =>
        !bounds ||
        (entry.at >= bounds.from && (bounds.to === undefined || entry.at < bounds.to)),
    );
    return extra.length ? [...extra, ...fetched] : fetched;
  }, [injected, fetched, range, day, today]);

  const memberChoices = useMemo<Array<DropdownOption<string>>>(() => {
    const byName = new Map(members.map((m) => [m.name, m.color]));
    const names = [...new Set(entries.map((e) => e.name))].sort((a, b) => a.localeCompare(b));
    return [
      { id: 'all', label: 'All members' },
      ...names.map((name) => ({
        id: name,
        label: name,
        icon: (
          <span
            className="gms-dot"
            style={{ background: byName.get(name) ?? colorForName(name) }}
            aria-hidden
          />
        ),
      })),
    ];
  }, [entries, members]);

  // Days with movement get a dot in the calendar.
  const markedDays = useMemo(
    () => new Set(entries.map((entry) => toDayInput(new Date(entry.at)))),
    [entries],
  );

  // Nothing exists before the group did, so the calendar stops there. Older
  // API builds omit created_at, in which case the picker stays unbounded.
  const earliest = useMemo(() => {
    if (!createdAt) return undefined;
    const at = new Date(createdAt);
    return Number.isNaN(at.getTime()) ? undefined : toDayInput(at);
  }, [createdAt]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (memberFilter !== 'all' && entry.name !== memberFilter) return false;
      if (q && !itemName(entry.item_id).toLowerCase().includes(q)) return false;
      if (direction === 'in') return entry.delta >= 0;
      if (direction === 'out') return entry.delta < 0;
      return true;
    });
  }, [entries, direction, memberFilter, query]);

  const groups = useMemo(() => {
    const out: Array<{ day: string; rows: BankLedgerEntry[] }> = [];
    for (const entry of visible) {
      const label = dayLabel(entry.at);
      const last = out[out.length - 1];
      if (last && last.day === label) last.rows.push(entry);
      else out.push({ day: label, rows: [entry] });
    }
    return out;
  }, [visible]);

  const allTime = range === 'all';
  const searching = query.trim().length > 0;

  // Exports what is on screen, filters and all, rather than the raw page.
  const runExport = useCallback(
    (format: ExportFormat) => {
      const rows = visible.map((entry) => ({
        at: toUnix(entry.at),
        member: entry.name,
        operation: entry.delta >= 0 ? 'deposit' : 'withdrawal',
        item: itemName(entry.item_id),
        item_id: entry.item_id,
        quantity: Math.abs(entry.delta),
        value: getItemPrices(entry.item_id).ge * Math.abs(entry.delta),
      }));
      const filename = `${groupName}-bank-ledger-${range}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');

      if (format === 'json') {
        downloadJson(filename, rows);
        return;
      }
      downloadCsv({
        filename,
        sheet: 'Bank ledger',
        headers: [
          'Time (unix)',
          'Member',
          'Operation',
          'Item',
          'Item ID',
          'Quantity',
          'Value',
        ],
        rows: rows.map((r) => [
          r.at,
          r.member,
          r.operation,
          r.item,
          r.item_id,
          r.quantity,
          r.value,
        ]),
      });
    },
    [visible, groupName, range],
  );

  return (
    <section className="gms-ledger gms-panel" aria-label="Shared bank ledger" aria-busy={loading}>
      <div className="gms-panel-head">
        <div className="gms-panel-head-text">
          <h1 className="gms-page-title">Shared bank ledger</h1>
          <span className="gms-panel-sub">Deposits and withdrawals from the group bank</span>
        </div>

        <input
          className="gms-input gms-ledger-search"
          value={query}
          placeholder="Search items"
          aria-label="Search items"
          onChange={(e) => setQuery(e.target.value)}
        />

        <Dropdown
          className="gms-ledger-dd"
          options={DIRECTIONS}
          value={direction}
          ariaLabel="Show"
          onChange={setDirection}
        />

        <Dropdown
          ariaLabel="Member"
          value={memberFilter}
          options={memberChoices}
          onChange={setMemberFilter}
        />

        <Segmented
          options={RANGE_OPTIONS}
          value={range}
          ariaLabel="Range"
          onChange={setRange}
        />

        <DayNav
          day={day || today}
          today={today}
          earliest={earliest}
          marked={markedDays}
          picked={range === 'day'}
          onChange={(next) => {
            setDay(next);
            setRange('day');
          }}
        />

        <Segmented options={VIEWS} value={view} ariaLabel="View" onChange={setView} />

        <ExportMenu
          busy={null}
          disabled={visible.length === 0}
          formats={EXPORT_FORMATS}
          onExport={runExport}
        />
      </div>

      {/* Outside the scroller so it stays put while the sticky day headers
          move past it. Labels only — each row reads out in full on its own. */}
      {visible.length > 0 && view === 'list' && (
        <div className="gms-ledger-cols" aria-hidden>
          <span>Operation</span>
          <span>Time</span>
          <span>Item</span>
          <span />
          <span className="gms-ledger-col-right">Amount</span>
          <span className="gms-ledger-col-right">Cost</span>
          <span>Player</span>
        </div>
      )}

      <div className="gms-panel-body gms-ledger-body">
        <PanelStatus
          error={error}
          loading={loading && entries.length === 0}
        />

        {!loading && !error && visible.length === 0 && searching && (
          <EmptyState
            icon={<SearchGlyph />}
            title={`No items match “${query.trim()}”`}
            body="Check the spelling or clear the search to see every movement."
          >
            <button type="button" className="gms-btn" onClick={() => setQuery('')}>
              Clear search
            </button>
          </EmptyState>
        )}

        {!loading && !error && visible.length === 0 && !searching && (
          <EmptyState
            icon={<BankGlyph />}
            title="No bank movements"
            body="Deposits and withdrawals from the shared bank will be listed here, grouped by day."
          >
            <button
              type="button"
              className="gms-btn"
              onClick={() => setRange(allTime ? '24h' : 'all')}
            >
              {allTime ? 'Back to the last 24 hours' : 'Show all time'}
            </button>
          </EmptyState>
        )}

        {groups.map((group) => (
          <div key={group.day} className="gms-ledger-group">
            <div className="gms-day-head">{group.day}</div>
            <div className={`gms-ledger-${view}`}>
              {group.rows.map((entry) =>
                view === 'list' ? (
                  <LedgerRow key={entry.id} entry={entry} />
                ) : (
                  <LedgerCard key={entry.id} entry={entry} />
                ),
              )}
            </div>
          </div>
        ))}

        {hasMore && (
          <LoadMoreButton loading={loading} disabled={!oldest} onClick={loadMore} />
        )}
      </div>
    </section>
  );
}

/** Compact tile: the border carries the direction, green in and red out. */
function LedgerCard({ entry }: { entry: BankLedgerEntry }) {
  const deposited = entry.delta >= 0;
  const { absolute, stamp } = timestamp(entry.at, false);
  const qty = Math.abs(entry.delta);
  const value = getItemPrices(entry.item_id).ge * qty;
  const name = itemName(entry.item_id);

  return (
    <article
      className={`gms-ledger-card gms-ledger-card--${deposited ? 'in' : 'out'}`}
      title={`${entry.name} · ${deposited ? 'deposited' : 'withdrew'} ${formatQty(qty)} ${name} · ${absolute}`}
    >
      <span className="gms-ledger-card-art">
        <ItemIcon itemId={entry.item_id} quantity={qty} />
        <span className="gms-ledger-badge">
          <span aria-hidden>{deposited ? '+' : MINUS}</span>
        </span>
      </span>

      <span className="gms-ledger-card-name">{name}</span>

      <span className="gms-ledger-delta">
        {deposited ? '+' : MINUS}
        {compactQty(qty)}
      </span>

      <span className="gms-ledger-card-meta">
        <span className="gms-ledger-name">
          <span
            className="gms-dot"
            style={{ background: colorForName(entry.name) }}
            aria-hidden
          />
          {entry.name}
        </span>
        <span className="gms-ledger-value">{value > 0 ? formatGp(value) : '—'}</span>
      </span>

      <span className="gms-ledger-time">{stamp}</span>
    </article>
  );
}

function LedgerRow({ entry }: { entry: BankLedgerEntry }) {
  const deposited = entry.delta >= 0;
  const { absolute, stamp } = timestamp(entry.at, false);
  const qty = Math.abs(entry.delta);
  const value = getItemPrices(entry.item_id).ge * qty;

  return (
    <div className={`gms-ledger-row gms-ledger-row--${deposited ? 'in' : 'out'}`}>
      <span className="gms-ledger-badge">
        <span className="sr-only">{deposited ? 'Deposited' : 'Withdrew'}</span>
        <span aria-hidden>{deposited ? '+' : MINUS}</span>
      </span>
      <span className="gms-ledger-time" title={absolute}>
        {stamp}
      </span>
      <span className="gms-ledger-item">
        <ItemIcon itemId={entry.item_id} quantity={qty} className="gms-ledger-icon" />
        <span>{itemName(entry.item_id)}</span>
      </span>
      {/* Splits the row into a left and a right group. */}
      <span />
      <span className="gms-ledger-delta">
        {deposited ? '+' : MINUS}
        {compactQty(qty)}
      </span>
      <span className="gms-ledger-value">{value > 0 ? formatGp(value) : '—'}</span>
      <span className="gms-ledger-name">
        <span
          className="gms-dot"
          style={{ background: colorForName(entry.name) }}
          aria-hidden
        />
        {entry.name}
      </span>
    </div>
  );
}
