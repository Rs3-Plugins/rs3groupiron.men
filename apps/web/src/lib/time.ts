const UNITS: Array<[limitSeconds: number, seconds: number, suffix: string]> = [
  [60, 1, 's'],
  [3600, 60, 'm'],
  [86_400, 3600, 'h'],
  [2_592_000, 86_400, 'd'],
  [31_536_000, 2_592_000, 'mo'],
  [Number.POSITIVE_INFINITY, 31_536_000, 'y'],
];

export function relativeTime(at: Date, now = Date.now()): string {
  const time = at.getTime();
  if (Number.isNaN(time)) return '';
  const diff = Math.max(0, Math.round((now - time) / 1000));
  if (diff < 45) return 'just now';
  for (const [limit, size, suffix] of UNITS) {
    if (diff < limit) return `${Math.floor(diff / size)}${suffix} ago`;
  }
  return '';
}

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

export type Timestamp = {
  at: Date;
  absolute: string;
  stamp: string;
  ago: string;
};

export function timestamp(iso: string, showDate = true): Timestamp {
  const at = new Date(iso);
  const valid = !Number.isNaN(at.getTime());
  return {
    at,
    absolute: valid ? at.toLocaleString() : iso,
    stamp: valid ? (showDate ? DATE_AND_TIME : TIME_ONLY).format(at) : iso,
    ago: relativeTime(at),
  };
}
