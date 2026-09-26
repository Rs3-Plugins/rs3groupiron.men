import { useCallback, useMemo, useState } from 'react';
import { DEMO_GROUP, fetchBankLedger, type BankLedgerEntry } from '../../api/groupClient';
import { dayBounds, toDayInput } from '../../lib/day';
import { colorForName, formatQty, itemName } from '../../lib/items';
import { formatGp } from '../../lib/itemPrices';
import { timestamp } from '../../lib/time';
import { usePagedHistory } from '../../hooks/usePagedHistory';
import { DayPicker, ShowAllTimeButton } from './DayPicker';
import { IconSelect } from './IconSelect';
import { ItemIcon } from './ItemIcon';
import { memberOptions, type MemberBadge } from './memberOptions';
import { LoadMoreButton, PanelStatus, PanelToolbar } from './PanelChrome';
import { SelectField, type SelectOption } from './SelectField';

const PAGE_SIZE = 100;
const MINUS = '−';

type Direction = 'all' | 'in' | 'out';

const DIRECTIONS: SelectOption[] = [
  { value: 'all', label: 'All movements' },
  { value: 'in', label: 'Deposits only' },
  { value: 'out', label: 'Withdrawals only' },
];

function compactQty(n: number) {
  const abs = Math.abs(n);
  return abs < 10_000 ? abs.toLocaleString() : formatGp(abs);
}

type LedgerPanelProps = {
  groupName?: string;
  groupToken?: string;
  dataRevision?: number;
  members?: ReadonlyArray<MemberBadge>;
};

export function LedgerPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  dataRevision,
  members = [],
}: LedgerPanelProps) {
  const [direction, setDirection] = useState<Direction>('all');
  const [memberFilter, setMemberFilter] = useState('all');
  const [today] = useState(() => toDayInput(new Date()));
  const [day, setDay] = useState(today);

  const fetchPage = useCallback(
    ({ before, limit, signal }: { before?: string; limit: number; signal: AbortSignal }) => {
      const bounds = day ? dayBounds(day) : null;
      return fetchBankLedger(groupName, groupToken, {
        limit,
        before,
        from: bounds?.from,
        to: bounds?.to,
        signal,
      });
    },
    [groupName, groupToken, day],
  );

  const { entries, hasMore, error, loading, refreshing, oldest, loadMore } =
    usePagedHistory<BankLedgerEntry>({
      fetchPage,
      pageSize: PAGE_SIZE,
      errorFallback: 'Failed to load bank ledger',
      dataRevision,
    });

  const memberChoices = useMemo(() => {
    const names = [...new Set(entries.map((e) => e.name))].sort((a, b) => a.localeCompare(b));
    return memberOptions(names, members);
  }, [entries, members]);

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

  return (
    <section className="gms-ledger gms-panel" aria-label="Shared bank ledger" aria-busy={loading}>
      <PanelToolbar title="Shared bank ledger">
        <SelectField label="Show" value={direction} options={DIRECTIONS} onChange={setDirection} />
        <IconSelect
          label="Member"
          value={memberFilter}
          options={memberChoices}
          onChange={setMemberFilter}
        />
        <DayPicker day={day} today={today} onChange={setDay} />
      </PanelToolbar>

      {summary.length > 0 && (
        <ul className="gms-panel-summary" aria-label="Net movement per member">
          {summary.map((row) => (
            <li key={row.name} className="gms-panel-summary-chip">
              <span
                className="gms-ledger-dot"
                style={{ background: colorForName(row.name) }}
                aria-hidden
              />
              <span className="gms-panel-summary-name">{row.name}</span>
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

      <div className="gms-panel-body">
        <PanelStatus
          error={error}
          loading={loading && entries.length === 0}
          refreshing={refreshing}
          empty={!loading && visible.length === 0}
          emptyText={
            <>
              {day ? 'No shared bank movements on this day' : 'No shared bank movements yet'}
              {day && <ShowAllTimeButton onClick={() => setDay('')} />}
            </>
          }
        />

        {visible.length > 0 && (
          <>
            {/* Visual column labels only — each row already reads out in full. */}
            <div className="gms-ledger-head" aria-hidden>
              <span />
              <span>Member</span>
              <span />
              <span>Item</span>
              <span className="gms-ledger-head-amount">Amount</span>
              <span className="gms-ledger-head-time">{day ? 'Time' : 'Date'}</span>
            </div>
            <ul className="gms-panel-list">
              {visible.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} showDate={!day} />
              ))}
            </ul>
          </>
        )}

        {hasMore && (
          <LoadMoreButton loading={loading} disabled={!oldest} onClick={loadMore} />
        )}
      </div>
    </section>
  );
}

function LedgerRow({ entry, showDate }: { entry: BankLedgerEntry; showDate: boolean }) {
  const deposited = entry.delta >= 0;
  const amount = `${deposited ? '+' : MINUS}${formatQty(Math.abs(entry.delta))}`;
  const { absolute, stamp, ago } = timestamp(entry.at, showDate);

  return (
    <li className={`gms-ledger-row gms-ledger-row--${deposited ? 'in' : 'out'}`}>
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
        <span className="sr-only">{deposited ? 'Deposited ' : 'Withdrew '}</span>
        {amount}
      </span>
      <time className="gms-panel-time" dateTime={entry.at} title={absolute}>
        <span className="gms-panel-clock">{stamp}</span>
        <span className="gms-panel-ago">{ago}</span>
      </time>
    </li>
  );
}
