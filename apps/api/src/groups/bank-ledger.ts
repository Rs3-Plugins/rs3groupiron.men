/**
 * Query-parameter handling for the shared-bank ledger and the achievement feed,
 * which page the same way. Bad input is clamped or ignored rather than rejected:
 * these are display filters, and a 400 for a stale cursor would break a client
 * that is merely out of date.
 */

export const LEDGER_LIMIT_DEFAULT = 100;
export const LEDGER_LIMIT_MIN = 1;
export const LEDGER_LIMIT_MAX = 200;

/** Clamp to 1–200; anything unparseable falls back to the default. */
export function parseLedgerLimit(raw?: string): number {
  if (raw == null || raw === '') return LEDGER_LIMIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return LEDGER_LIMIT_DEFAULT;
  const int = Math.trunc(n);
  if (int < LEDGER_LIMIT_MIN) return LEDGER_LIMIT_MIN;
  if (int > LEDGER_LIMIT_MAX) return LEDGER_LIMIT_MAX;
  return int;
}

/**
 * Prisma `createdAt` filter for the ledger query, or undefined for no bound.
 * `before` (paging cursor) and `to` (range end) both cap createdAt, so the
 * tighter of the two wins — that lets a cursor page inside a selected day.
 */
export function ledgerDateWindow(
  before?: Date,
  from?: Date,
  to?: Date,
): { lt?: Date; gte?: Date } | undefined {
  const upper =
    before && to ? new Date(Math.min(+before, +to)) : (before ?? to);
  const window = {
    ...(upper ? { lt: upper } : {}),
    ...(from ? { gte: from } : {}),
  };
  return Object.keys(window).length ? window : undefined;
}

/** ISO timestamp cursor; unparseable values are ignored (no cursor). */
export function parseLedgerCursor(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms);
}
