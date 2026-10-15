import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEMO_GROUP,
  fetchAchievements,
  type Achievement,
  type AchievementKind,
} from '../../api/groupClient';
import {
  DATE_RANGES,
  dayLabel,
  rangeBounds,
  toDayInput,
  type DateRange,
} from '../../lib/day';
import { downloadRemoteImage } from '../../lib/download';
import { downloadCsv, downloadJson } from '../../lib/exportTable';
import { colorForName } from '../../lib/items';
import { useItemNames } from '../../lib/itemNames';
import { SKILL_BY_ID, type SkillId } from '../../lib/skills';
import { timestamp, toUnix } from '../../lib/time';
import { usePagedHistory } from '../../hooks/usePagedHistory';
import { useUrlState, useUrlText } from '../../hooks/useUrlState';
import { Modal } from '../Modal';
import { DayNav, RANGE_OPTIONS } from './DayNav';
import { Dropdown, type DropdownOption } from './Dropdown';
import { ExportMenu, type ExportFormat } from './ExportMenu';
import { EmptyState, SearchGlyph, TrophyGlyph } from './EmptyState';
import { ItemIcon } from './ItemIcon';
import type { MemberBadge } from './memberOptions';
import { LoadMoreButton, PanelStatus } from './PanelChrome';
import { Segmented } from './Segmented';

const PAGE_SIZE = 50;

const EXPORT_FORMATS: ExportFormat[] = ['csv', 'json'];

const KINDS: AchievementKind[] = ['level', 'drop', 'quest', 'diary', 'other'];

const KIND_LABEL: Record<AchievementKind, string> = {
  level: 'Level',
  drop: 'Drop',
  quest: 'Quest',
  diary: 'Diary',
  other: 'Other',
};

type KindFilter = 'all' | AchievementKind;

const KIND_FILTERS: KindFilter[] = ['all', ...KINDS];

/** "Milestones" is what the design calls the catch-all `other` kind. */
const KIND_OPTIONS: Array<DropdownOption<KindFilter>> = [
  { id: 'all', label: 'All kinds' },
  { id: 'level', label: 'Levels' },
  { id: 'quest', label: 'Quests' },
  { id: 'other', label: 'Milestones' },
  { id: 'drop', label: 'Drops' },
  { id: 'diary', label: 'Diaries' },
];

type AchievementsPanelProps = {
  groupName?: string;
  groupToken?: string;
  dataRevision?: number;
  members?: ReadonlyArray<MemberBadge>;
  /** ISO instant the group was created; the calendar stops there. */
  createdAt?: string;
  /** Client-side entries shown above the fetched ones (the demo's activity). */
  injected?: ReadonlyArray<Achievement>;
};

export function AchievementsPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  dataRevision,
  members = [],
  createdAt,
  injected,
}: AchievementsPanelProps) {
  // Drop entries name an item, so this panel needs the catalogue too.
  useItemNames();
  const [kindFilter, setKindFilter] = useUrlState<KindFilter>('kind', 'all', {
    allowed: KIND_FILTERS,
  });
  const [memberFilter, setMemberFilter] = useUrlState('member', 'all');
  const [query, setQuery] = useUrlText('q');
  const [zoomedId, setZoomedId] = useUrlState('achievement', '', { history: 'push' });
  const [today] = useState(() => toDayInput(new Date()));
  const [day, setDay] = useUrlState('day', today);
  const [range, setRange] = useUrlState<DateRange>('range', '24h', { allowed: DATE_RANGES });

  const fetchPage = useCallback(
    ({ before, limit, signal }: { before?: string; limit: number; signal: AbortSignal }) => {
      const bounds = rangeBounds(range, day, today);
      return fetchAchievements(groupName, groupToken, {
        limit,
        before,
        kind: kindFilter === 'all' ? undefined : kindFilter,
        member: memberFilter === 'all' ? undefined : memberFilter,
        from: bounds?.from,
        to: bounds?.to,
        signal,
      });
    },
    [groupName, groupToken, kindFilter, memberFilter, range, day, today],
  );

  const { entries: fetched, hasMore, error, loading, refreshing, oldest, loadMore } =
    usePagedHistory<Achievement>({
      fetchPage,
      pageSize: PAGE_SIZE,
      errorFallback: 'Failed to load achievements',
      dataRevision,
    });

  // Injected entries skip the API, so the active filters are applied here.
  const entries = useMemo(() => {
    const all = injected?.length
      ? [
          ...injected.filter(
            (entry) =>
              (kindFilter === 'all' || entry.kind === kindFilter) &&
              (memberFilter === 'all' || entry.name === memberFilter),
          ),
          ...fetched,
        ]
      : fetched;

    const q = query.trim().toLowerCase();
    if (!q) return all;
    // Matches the sentence as it reads on screen: who, what, and the detail.
    return all.filter((entry) =>
      `${entry.name} ${entry.title} ${entry.detail ?? ''}`.toLowerCase().includes(q),
    );
  }, [injected, fetched, kindFilter, memberFilter, query]);

  const [knownMembers, setKnownMembers] = useState<string[]>([]);
  useEffect(() => {
    setKnownMembers((prev) => {
      const names = new Set(prev);
      for (const entry of entries) names.add(entry.name);
      if (names.size === prev.length) return prev;
      return [...names].sort((a, b) => a.localeCompare(b));
    });
  }, [entries]);

  const colorOf = useMemo(() => {
    const byName = new Map(members.map((m) => [m.name, m.color]));
    return (name: string) => byName.get(name) ?? colorForName(name);
  }, [members]);

  const memberChoices = useMemo<Array<DropdownOption<string>>>(
    () => [
      { id: 'all', label: 'All members' },
      ...knownMembers.map((name) => ({
        id: name,
        label: name,
        icon: <span className="gms-dot" style={{ background: colorOf(name) }} aria-hidden />,
      })),
    ],
    [knownMembers, colorOf],
  );

  const zoomed = useMemo(
    () => (zoomedId ? (entries.find((e) => e.id === zoomedId) ?? null) : null),
    [zoomedId, entries],
  );

  // Days with something logged get a dot in the calendar.
  const markedDays = useMemo(
    () => new Set(entries.map((entry) => toDayInput(new Date(entry.at)))),
    [entries],
  );

  const earliest = useMemo(() => {
    if (!createdAt) return undefined;
    const at = new Date(createdAt);
    return Number.isNaN(at.getTime()) ? undefined : toDayInput(at);
  }, [createdAt]);

  /** Exports what is on screen: when, who, and what they did. */
  const runExport = useCallback(
    (format: ExportFormat) => {
      const rows = entries.map((entry) => ({
        at: toUnix(entry.at),
        member: entry.name,
        kind: entry.kind,
        achievement: entry.title,
        detail: entry.detail ?? '',
      }));
      const filename = `${groupName}-achievements-${range}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');

      if (format === 'json') {
        downloadJson(filename, rows);
        return;
      }
      downloadCsv({
        filename,
        sheet: 'Achievements',
        headers: ['Time (unix)', 'Member', 'Kind', 'Achievement', 'Detail'],
        rows: rows.map((r) => [r.at, r.member, r.kind, r.achievement, r.detail]),
      });
    },
    [entries, groupName, range],
  );

  const groups = useMemo(() => {
    const out: Array<{ day: string; rows: Achievement[] }> = [];
    for (const entry of entries) {
      const label = dayLabel(entry.at);
      const last = out[out.length - 1];
      if (last && last.day === label) last.rows.push(entry);
      else out.push({ day: label, rows: [entry] });
    }
    return out;
  }, [entries]);

  return (
    <section className="gms-panel gms-ach" aria-label="Group achievements" aria-busy={loading}>
      <div className="gms-panel-head">
        <div className="gms-panel-head-text">
          <h1 className="gms-page-title">Group achievements</h1>
          <span className="gms-panel-sub">Levels, quests and milestones as they happen</span>
        </div>

        <input
          className="gms-input gms-ach-search"
          value={query}
          placeholder="Search achievements"
          aria-label="Search achievements"
          onChange={(e) => setQuery(e.target.value)}
        />

        <Dropdown
          ariaLabel="Kind"
          value={kindFilter}
          options={KIND_OPTIONS}
          onChange={setKindFilter}
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

        <ExportMenu
          busy={null}
          disabled={entries.length === 0}
          formats={EXPORT_FORMATS}
          onExport={runExport}
        />
      </div>

      <div className="gms-panel-body gms-ach-body">
        <PanelStatus
          error={error}
          loading={loading && entries.length === 0}
          refreshing={refreshing}
        />

        {!loading && !error && entries.length === 0 && query.trim() && (
          <EmptyState
            icon={<SearchGlyph />}
            title={`Nothing matches “${query.trim()}”`}
            body="Check the spelling or clear the search to see everything logged."
          >
            <button type="button" className="gms-btn" onClick={() => setQuery('')}>
              Clear search
            </button>
          </EmptyState>
        )}

        {!loading && !error && entries.length === 0 && !query.trim() && (
          <EmptyState
            icon={<TrophyGlyph />}
            title="No achievements yet"
            body="Level-ups, quest completions and milestones will be logged here as your group earns them."
          />
        )}

        {groups.map((group) => (
          <div key={group.day} className="gms-ach-group">
            <div className="gms-day-head">{group.day}</div>
            {group.rows.map((entry) => (
              <AchievementCard
                key={entry.id}
                entry={entry}
                color={colorOf(entry.name)}
                onZoom={() => setZoomedId(entry.id)}
              />
            ))}
          </div>
        ))}

        {hasMore && <LoadMoreButton loading={loading} disabled={!oldest} onClick={loadMore} />}
      </div>

      <Modal
        open={zoomed !== null}
        onClose={() => setZoomedId('')}
        titleId="gms-ach-image-title"
        title={zoomed ? zoomed.title : 'Achievement'}
        className="gms-modal--achievement"
      >
        {zoomed?.image_url && <ZoomedImage entry={zoomed} />}
      </Modal>
    </section>
  );
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
  return (
    <svg {...common}>
      <circle cx="12" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
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
    return (
      <ItemIcon
        itemId={entry.item_id}
        quantity={entry.quantity ?? undefined}
        className="gms-ach-icon"
      />
    );
  }
  return <KindGlyph kind={entry.kind} />;
}

function AchievementCard({
  entry,
  color,
  onZoom,
}: {
  entry: Achievement;
  color: string;
  onZoom: () => void;
}) {
  const [imageBroken, setImageBroken] = useState(false);
  const { absolute, stamp } = timestamp(entry.at, false);
  const showImage = Boolean(entry.image_url) && !imageBroken;

  return (
    <div className={`gms-ach-row gms-ach-row--${entry.kind}`}>
      <span className="gms-ach-icon-slot">
        <AchievementIcon entry={entry} />
      </span>

      <div className="gms-ach-main">
        {/* "Member did the thing" as one sentence, the way the design reads. */}
        <span className="gms-ach-headline">
          <strong style={{ color }}>{entry.name}</strong> {entry.title}
        </span>
        <span className="gms-ach-meta" title={absolute}>
          {stamp} · {KIND_LABEL[entry.kind]}
          {entry.detail ? ` · ${entry.detail}` : ''}
        </span>
      </div>

      {showImage && entry.image_url && (
        <button type="button" className="gms-ach-thumb-btn" onClick={onZoom} title="View full image">
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

      <span className={`gms-ach-badge gms-ach-badge--${entry.kind}`}>
        {KIND_LABEL[entry.kind]}
      </span>
    </div>
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
 */
function ZoomedImage({ entry }: { entry: Achievement }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const url = entry.image_url!;
  const filename = downloadName(entry);

  async function download() {
    setDownloading(true);
    try {
      await downloadRemoteImage(url, filename);
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
          setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
      />
      <div className="gms-ach-zoom-bar">
        <span className="gms-ach-zoom-dims">{size ? `${size.w} × ${size.h}` : ''}</span>
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
