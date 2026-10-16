import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { setMenuOpen } from '../../lib/menuState';
import { shiftDay, toDayInput, type DateRange } from '../../lib/day';
import { Dropdown } from './Dropdown';
import type { SegmentedOption } from './Segmented';
import { CalendarIcon } from './icons';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Shared by every panel that filters a feed by time. */
export const RANGE_OPTIONS: Array<SegmentedOption<DateRange>> = [
  { id: '24h', label: 'Last 24h' },
  { id: 'today', label: 'Today' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Monday-first offset for the 1st of the month. */
function leadingBlanks(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2000, i, 1)),
);

/** True when no day of this month is selectable. */
function outOfRange(year: number, month: number, earliest: string | undefined, today: string) {
  const start = toDayInput(new Date(year, month, 1));
  const end = toDayInput(new Date(year, month + 1, 0));
  if (start > today) return true;
  return Boolean(earliest) && end < earliest!;
}

/**
 * Keeps a year jump inside the allowed span: picking the first year lands on
 * the creation month rather than a month that has no selectable days.
 */
function clampMonth(year: number, month: number, earliest: string | undefined, today: string) {
  let m = month;
  if (toDayInput(new Date(year, m, 1)) > today) m = Number(today.slice(5, 7)) - 1;
  if (earliest && toDayInput(new Date(year, m + 1, 0)) < earliest) {
    m = Number(earliest.slice(5, 7)) - 1;
  }
  return new Date(year, m, 1);
}

type DayNavProps = {
  day: string;
  today: string;
  /** Earliest selectable day, usually the group's creation date. */
  earliest?: string;
  /** Days that have entries, shown with a dot. */
  marked?: ReadonlySet<string>;
  /** Whether this day is the active filter, rather than a rolling range. */
  picked?: boolean;
  onChange: (day: string) => void;
};

export function DayNav({ day, today, earliest, marked, picked = true, onChange }: DayNavProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parseDay(day || today));
  const rootRef = useRef<HTMLDivElement>(null);

  useDismiss(
    open,
    rootRef,
    useCallback(() => setOpen(false), []),
  );

  const atStart = Boolean(earliest) && day <= earliest!;
  const atEnd = day >= today;

  /**
   * Announced globally so hover affordances underneath stay quiet, and
   * released on unmount. An effect rather than a call on each open/close path:
   * `setMenuOpen` keeps a count, and the paths that close the calendar without
   * announcing it — dismissing by click or Escape — left the count stuck above
   * zero, which silently suppressed every tooltip in the app until a reload.
   */
  useEffect(() => {
    if (!open) return;
    setMenuOpen(true);
    return () => setMenuOpen(false);
  }, [open]);

  const toggle = () => {
    setOpen((v) => {
      if (!v) setMonth(parseDay(day || today));
      return !v;
    });
  };

  const close = () => setOpen(false);

  const cells = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const total = new Date(year, m + 1, 0).getDate();
    const blanks = leadingBlanks(year, m);
    return [
      ...Array.from({ length: blanks }, () => null),
      ...Array.from({ length: total }, (_, i) => toDayInput(new Date(year, m, i + 1))),
    ];
  }, [month]);

  const monthStart = toDayInput(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthEnd = toDayInput(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  /**
   * A couple of years before the group existed are listed but disabled, so
   * the limit is visible rather than the years simply being missing.
   */
  const years = useMemo(() => {
    const last = Number(today.slice(0, 4));
    const made = earliest ? Number(earliest.slice(0, 4)) : last - 5;
    const first = earliest ? made - 2 : made;
    return Array.from({ length: last - first + 1 }, (_, i) => ({
      year: last - i,
      disabled: last - i < made,
    }));
  }, [earliest, today]);

  return (
    <div className="gms-daynav" ref={rootRef}>
      <button
        type="button"
        className="gms-daynav-step"
        aria-label="Previous day"
        disabled={atStart}
        onClick={() => onChange(shiftDay(day, -1))}
      >
        ‹
      </button>

      <button
        type="button"
        className={open ? 'gms-daynav-btn gms-daynav-btn--open' : 'gms-daynav-btn'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <CalendarIcon />
        {DAY_LABEL.format(parseDay(day || today))}
      </button>

      <button
        type="button"
        className="gms-daynav-step"
        aria-label="Next day"
        disabled={atEnd}
        onClick={() => onChange(shiftDay(day, 1))}
      >
        ›
      </button>


      {open && (
        <div className="gms-cal" role="dialog" aria-label="Pick a day">
          <div className="gms-cal-head">
            <button
              type="button"
              className="gms-daynav-step"
              aria-label="Previous month"
              disabled={Boolean(earliest) && monthStart <= earliest!}
              onClick={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            >
              ‹
            </button>

            {/* Jumping straight to a month or year beats clicking the arrows
                a dozen times to reach last spring. */}
            <Dropdown
              className="gms-cal-pick"
              small
              ariaLabel="Month"
              value={String(month.getMonth())}
              options={MONTHS.map((label, i) => ({
                id: String(i),
                label,
                disabled: outOfRange(month.getFullYear(), i, earliest, today),
              }))}
              onChange={(id) => setMonth(new Date(month.getFullYear(), Number(id), 1))}
            />

            <Dropdown
              className="gms-cal-pick"
              small
              ariaLabel="Year"
              value={String(month.getFullYear())}
              options={years.map(({ year, disabled }) => ({
                id: String(year),
                label: String(year),
                disabled,
                title: disabled ? 'Before the group was created' : undefined,
              }))}
              onChange={(id) => setMonth(clampMonth(Number(id), month.getMonth(), earliest, today))}
            />

            <button
              type="button"
              className="gms-daynav-step"
              aria-label="Next month"
              disabled={monthEnd >= today}
              onClick={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>

          <div className="gms-cal-week">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="gms-cal-grid">
            {cells.map((value, i) =>
              value === null ? (
                <span key={`blank-${i}`} />
              ) : (
                <button
                  key={value}
                  type="button"
                  className={[
                    'gms-cal-day',
                    value === day && picked ? 'gms-cal-day--sel' : '',
                    value === today ? 'gms-cal-day--today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={value > today || (Boolean(earliest) && value < earliest!)}
                  onClick={() => {
                    onChange(value);
                    close();
                  }}
                >
                  {Number(value.slice(-2))}
                  {marked?.has(value) && <span className="gms-cal-dot" aria-hidden />}
                </button>
              ),
            )}
          </div>

          <div className="gms-cal-foot">
            {earliest && (
              <span className="gms-cal-made">
                Group created {DAY_LABEL.format(parseDay(earliest))}
              </span>
            )}
            <button
              type="button"
              className="gms-cal-today"
              title="Jump to today"
              onClick={() => {
                onChange(today);
                close();
              }}
            >
              <CalendarIcon />
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
