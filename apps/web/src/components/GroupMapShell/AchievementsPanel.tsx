import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEMO_GROUP,
  fetchAchievements,
  type Achievement,
  type AchievementKind,
  type AppearanceTheme,
} from '../../api/groupClient';
import { dayBounds, shiftDay, toDayInput } from '../../lib/day';
import { colorForName } from '../../lib/items';
import { SKILL_BY_ID, type SkillId } from '../../lib/skills';
import { ItemIcon } from './ItemIcon';
import { Modal } from '../Modal';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

const PAGE_SIZE = 50;

const KINDS: AchievementKind[] = ['level', 'drop', 'quest', 'diary', 'other'];

const KIND_LABEL: Record<AchievementKind, string> = {
  level: 'Level',
  drop: 'Drop',
  quest: 'Quest',
  diary: 'Diary',
  other: 'Other',
};

const DATE_AND_TIME = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

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

/**
 * Per-kind glyph. Shape differs per kind so the badge is never the only cue,
 * and the marks stay legible against both the RS3 and modern panel fills.
 */
function KindGlyph({ kind }: { kind: AchievementKind }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 22,
    height: 22,
    'aria-hidden': true,
    focusable: 'false' as const,
    className: 'gms-ach-glyph',
  };
  if (kind === 'quest') {
    // Five-point star — the quest-complete mark.
    return (
      <svg {...common}>
        <path
          d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (kind === 'diary') {
    // Open book.
    return (
      <svg {...common}>
        <path
          d="M3 5h6a3 3 0 013 3v11a3 3 0 00-3-3H3zM21 5h-6a3 3 0 00-3 3v11a3 3 0 013-3h6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // `other` (and any icon-less level/drop) — a rosette.
  return (
    <svg {...common}>
      <circle
        cx="12"
        cy="9"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8.5 13.5L7 21l5-2.2L17 21l-1.5-7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AchievementIcon({ entry }: { entry: Achievement }) {
  if (entry.kind === 'level' && entry.skill_id) {
    const def = SKILL_BY_ID[entry.skill_id as SkillId];
    return (
      <img
        className="gms-ach-icon"
        src={`/skills/${def?.icon ?? `${entry.skill_id}.png`}`}
        alt={def?.name ?? entry.skill_id}
        width={24}
        height={24}
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (entry.kind === 'drop' && entry.item_id != null) {
    return <ItemIcon itemId={entry.item_id} size={24} className="gms-ach-icon" />;
  }
  return <KindGlyph kind={entry.kind} />;
}

type AchievementsPanelProps = {
  groupName?: string;
  groupToken?: string;
  appearance?: AppearanceTheme;
  /** Bumps on each incoming group poll; reloads the newest page. */
  dataRevision?: number;
};

export function AchievementsPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  appearance = 'modern',
  dataRevision,
}: AchievementsPanelProps) {
  const [entries, setEntries] = useState<Achievement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | AchievementKind>('all');
  const [memberFilter, setMemberFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomed, setZoomed] = useState<Achievement | null>(null);
  const [today] = useState(() => toDayInput(new Date()));
  /**
   * Selected calendar day, or '' for the whole history. Unlike the bank
   * ledger this defaults to all time — achievements are sparse, so a
   * single day would usually be empty.
   */
  const [day, setDay] = useState('');
  /** Members ever seen, so the select does not empty out while filtered. */
  const [knownMembers, setKnownMembers] = useState<string[]>([]);

  // Same guard as LedgerPanel: abort the in-flight request and ignore any
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
        const next = await fetchAchievements(groupName, groupToken, {
          limit: PAGE_SIZE,
          before,
          kind: kindFilter === 'all' ? undefined : kindFilter,
          member: memberFilter === 'all' ? undefined : memberFilter,
          from: bounds?.from,
          to: bounds?.to,
          signal: controller.signal,
        });
        if (mySeq !== seq.current) return;
        setEntries((prev) => (before ? [...prev, ...next.entries] : next.entries));
        setHasMore(next.has_more);
        setKnownMembers((prev) => {
          const names = new Set(prev);
          for (const e of next.entries) names.add(e.name);
          return [...names].sort((a, b) => a.localeCompare(b));
        });
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (mySeq !== seq.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load achievements');
        if (!before) {
          setEntries([]);
          setHasMore(false);
        }
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
        if (mySeq === seq.current) setLoading(false);
      }
    },
    [groupName, groupToken, kindFilter, memberFilter, day],
  );

  // Refetches whenever a filter changes — history is paged, so filtering has
  // to happen server-side rather than over the rows already loaded.
  useEffect(() => {
    void load();
  }, [load]);

  // An achievement can be posted without any member row changing, so the
  // interval matters more here than the poll signal. Paging opts out.
  useLiveRefresh(
    useCallback(() => {
      if (entries.length > PAGE_SIZE) return;
      void load();
    }, [load, entries.length]),
    { signal: dataRevision, intervalMs: 15000 },
  );

  useEffect(() => () => inFlight.current?.abort(), []);

  const counts = useMemo(() => {
    const byKind = new Map<AchievementKind, number>();
    for (const entry of entries) {
      byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);
    }
    return KINDS.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      count: byKind.get(k) ?? 0,
    }));
  }, [entries]);

  const oldest = entries.length ? entries[entries.length - 1] : null;
  const busy = loading && entries.length > 0;

  return (
    <section
      className="gms-ach"
      aria-label="Group achievements"
      aria-busy={loading}
    >
      <div className="gms-ach-toolbar">
        <h2 className="gms-ach-title">Group achievements</h2>
        <label className="gms-ach-field">
          <span className="gms-ach-field-label">Kind</span>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | AchievementKind)}
          >
            <option value="all">All kinds</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="gms-ach-field">
          <span className="gms-ach-field-label">Member</span>
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
          >
            <option value="all">All members</option>
            {knownMembers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="gms-ach-day">
          <button
            type="button"
            className="gms-ach-day-step"
            aria-label="Previous day"
            disabled={!day}
            onClick={() => setDay((d) => shiftDay(d, -1))}
          >
            ‹
          </button>
          <label className="gms-ach-field">
            <span className="gms-ach-field-label">Day</span>
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
            className="gms-ach-day-step"
            aria-label="Next day"
            disabled={!day || day >= today}
            onClick={() => setDay((d) => shiftDay(d, 1))}
          >
            ›
          </button>
          <button
            type="button"
            className="gms-ach-day-all"
            aria-pressed={day === ''}
            onClick={() => setDay((d) => (d ? '' : today))}
          >
            {day ? 'All time' : 'Today'}
          </button>
        </div>
      </div>

      {counts.length > 0 && (
        <ul className="gms-ach-summary" aria-label="Loaded achievements per kind">
          {counts.map((row) => (
            <li
              key={row.kind}
              className={`gms-ach-summary-chip gms-ach-summary-chip--${row.kind}`}
            >
              <span className="gms-ach-summary-kind">{KIND_LABEL[row.kind]}</span>
              <strong>{row.count}</strong>
            </li>
          ))}
        </ul>
      )}

      <div className="gms-ach-body">
        {error && <p className="gms-ach-status gms-ach-status--error">{error}</p>}
        {loading && entries.length === 0 && !error && (
          <p className="gms-ach-status">Loading…</p>
        )}
        {busy && (
          <p className="gms-ach-status" aria-live="polite">
            Refreshing…
          </p>
        )}
        {!loading && !error && entries.length === 0 && (
          <p className="gms-ach-status">
            {day ? 'No achievements on this day' : 'No achievements yet'}
            {day && (
              <>
                {' · '}
                <button
                  type="button"
                  className="gms-ach-inline-btn"
                  onClick={() => setDay('')}
                >
                  Show all time
                </button>
              </>
            )}
          </p>
        )}

        {entries.length > 0 && (
          <ul className="gms-ach-list">
            {entries.map((entry) => (
              <AchievementCard
                key={entry.id}
                entry={entry}
                onZoom={() => setZoomed(entry)}
              />
            ))}
          </ul>
        )}

        {hasMore && (
          <button
            type="button"
            className="gms-ach-more"
            disabled={loading || !oldest}
            onClick={() => oldest && void load(oldest.at)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>

      <Modal
        open={zoomed !== null}
        onClose={() => setZoomed(null)}
        titleId="gms-ach-image-title"
        title={zoomed ? zoomed.title : 'Achievement'}
        className="gms-modal--achievement"
        appearance={appearance}
      >
        {zoomed?.image_url && <ZoomedImage entry={zoomed} />}
      </Modal>
    </section>
  );
}

/** Filesystem-safe name for the downloaded screenshot. */
function downloadName(entry: Achievement) {
  const slug = `${entry.name}-${entry.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'achievement'}.png`;
}

/**
 * Full-size screenshot with a download button.
 *
 * The image is rendered at its natural size and only scaled down when it does
 * not fit, so a screenshot stays pixel-for-pixel readable.
 */
function ZoomedImage({ entry }: { entry: Achievement }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const url = entry.image_url!;
  const filename = downloadName(entry);

  async function download() {
    setDownloading(true);
    try {
      // Blob download keeps the filename and works for a CDN on another
      // origin; falls back to a plain link if the fetch is blocked by CORS.
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="gms-modal-body gms-ach-zoom">
      <img
        className="gms-ach-full"
        src={url}
        alt={`${entry.name}: ${entry.title}`}
        decoding="async"
        onLoad={(e) =>
          setSize({
            w: e.currentTarget.naturalWidth,
            h: e.currentTarget.naturalHeight,
          })
        }
      />
      <div className="gms-ach-zoom-bar">
        <span className="gms-ach-zoom-dims">
          {size ? `${size.w} × ${size.h}` : ''}
        </span>
        <button
          type="button"
          className="gms-ach-download"
          onClick={() => void download()}
          disabled={downloading}
        >
          {downloading ? 'Saving…' : 'Download PNG'}
        </button>
      </div>
    </div>
  );
}

function AchievementCard({
  entry,
  onZoom,
}: {
  entry: Achievement;
  onZoom: () => void;
}) {
  // A 404 hides the thumbnail entirely rather than leaving a broken-image box.
  const [imageBroken, setImageBroken] = useState(false);
  const at = new Date(entry.at);
  const valid = !Number.isNaN(at.getTime());
  const absolute = valid ? at.toLocaleString() : entry.at;
  const stamp = valid ? DATE_AND_TIME.format(at) : entry.at;
  const showImage = Boolean(entry.image_url) && !imageBroken;

  return (
    <li className={`gms-ach-card gms-ach-card--${entry.kind}`}>
      <span className="gms-ach-icon-slot">
        <AchievementIcon entry={entry} />
      </span>
      <div className="gms-ach-main">
        <div className="gms-ach-who">
          <span
            className="gms-ach-dot"
            style={{ background: colorForName(entry.name) }}
            aria-hidden
          />
          <span className="gms-ach-name">{entry.name}</span>
          <span className={`gms-ach-badge gms-ach-badge--${entry.kind}`}>
            {KIND_LABEL[entry.kind]}
          </span>
        </div>
        <p className="gms-ach-headline">{entry.title}</p>
        {entry.detail && <p className="gms-ach-detail">{entry.detail}</p>}
      </div>
      {showImage && entry.image_url && (
        <button
          type="button"
          className="gms-ach-thumb-btn"
          onClick={onZoom}
          title="View full image"
        >
          <img
            className="gms-ach-thumb"
            src={entry.image_url}
            alt={`Screenshot of ${entry.name}: ${entry.title}`}
            width={72}
            height={48}
            loading="lazy"
            decoding="async"
            onError={() => setImageBroken(true)}
          />
        </button>
      )}
      <time className="gms-ach-time" dateTime={entry.at} title={absolute}>
        <span className="gms-ach-clock">{stamp}</span>
        <span className="gms-ach-ago">{relativeTime(at)}</span>
      </time>
    </li>
  );
}
