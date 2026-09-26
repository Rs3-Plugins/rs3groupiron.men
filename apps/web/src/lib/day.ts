/**
 * Calendar-day helpers for the ledger and achievement filters.
 *
 * Days are handled in the viewer's own timezone: the `<input type="date">`
 * value is local, and `dayBounds` converts it to the real instants the API
 * filters on, so a "day" means what the person looking at it expects.
 */

/** `YYYY-MM-DD` for a Date, in local time (not UTC). */
export function toDayInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight-to-midnight instants for a `YYYY-MM-DD` value. */
export function dayBounds(day: string): { from: string; to: string } | null {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return null;
  return {
    from: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
    to: new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString(),
  };
}

/** Move a `YYYY-MM-DD` value by whole days, rolling months/years correctly. */
export function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return toDayInput(new Date(y, m - 1, d + days));
}
