import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEMO_GROUP,
  fetchAchievements,
  type Achievement,
  type AchievementKind,
  type AppearanceTheme,
} from '../../api/groupClient';
import { dayBounds, toDayInput } from '../../lib/day';
import { downloadRemoteImage } from '../../lib/download';
import { colorForName } from '../../lib/items';
import { SKILL_BY_ID, type SkillId } from '../../lib/skills';
import { timestamp } from '../../lib/time';
import { usePagedHistory } from '../../hooks/usePagedHistory';
import { useUrlState } from '../../hooks/useUrlState';
import { Modal } from '../Modal';
import { DayPicker, ShowAllTimeButton } from './DayPicker';
import { IconSelect } from './IconSelect';
import { ItemIcon } from './ItemIcon';
import { memberOptions, type MemberBadge } from './memberOptions';
import { LoadMoreButton, PanelStatus, PanelToolbar } from './PanelChrome';
import { SelectField, type SelectOption } from './SelectField';

const PAGE_SIZE = 50;

const KINDS: AchievementKind[] = ['level', 'drop', 'quest', 'diary', 'other'];

const KIND_LABEL: Record<AchievementKind, string> = {
  level: 'Level',
  drop: 'Drop',
  quest: 'Quest',
  diary: 'Diary',
  other: 'Other',
};

const KIND_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All kinds' },
  ...KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] })),
];

type KindFilter = 'all' | AchievementKind;

const KIND_FILTERS: KindFilter[] = ['all', ...KINDS];

type AchievementsPanelProps = {
  groupName?: string;
  groupToken?: string;
  appearance?: AppearanceTheme;
  dataRevision?: number;
  members?: ReadonlyArray<MemberBadge>;
};

export function AchievementsPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  appearance = 'modern',
  dataRevision,
  members = [],
}: AchievementsPanelProps) {
  const [kindFilter, setKindFilter] = useUrlState<KindFilter>('kind', 'all', {
    allowed: KIND_FILTERS,
  });
  const [memberFilter, setMemberFilter] = useUrlState('member', 'all');
  const [zoomedId, setZoomedId] = useUrlState('achievement', '', { history: 'push' });
  const [today] = useState(() => toDayInput(new Date()));
  const [day, setDay] = useUrlState('day', '');

  const fetchPage = useCallback(
    ({ before, limit, signal }: { before?: string; limit: number; signal: AbortSignal }) => {
      const bounds = day ? dayBounds(day) : null;
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
    [groupName, groupToken, kindFilter, memberFilter, day],
  );

  const { entries, hasMore, error, loading, refreshing, oldest, loadMore } =
    usePagedHistory<Achievement>({
      fetchPage,
      pageSize: PAGE_SIZE,
      errorFallback: 'Failed to load achievements',
      dataRevision,
    });

  const [knownMembers, setKnownMembers] = useState<string[]>([]);
  useEffect(() => {
    setKnownMembers((prev) => {
      const names = new Set(prev);
      for (const entry of entries) names.add(entry.name);
      if (names.size === prev.length) return prev;
      return [...names].sort((a, b) => a.localeCompare(b));
    });
  }, [entries]);

  const memberChoices = useMemo(
    () => memberOptions(knownMembers, members),
    [knownMembers, members],
  );

  const zoomed = useMemo(
    () => (zoomedId ? (entries.find((e) => e.id === zoomedId) ?? null) : null),
    [zoomedId, entries],
  );

  const counts = useMemo(() => {
    const byKind = new Map<AchievementKind, number>();
    for (const entry of entries) byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);
    return KINDS.filter((k) => byKind.has(k)).map((k) => ({ kind: k, count: byKind.get(k)! }));
  }, [entries]);

  return (
    <section className="gms-panel" aria-label="Group achievements" aria-busy={loading}>
      <PanelToolbar title="Group achievements">
        <SelectField
          label="Kind"
          value={kindFilter}
          options={KIND_OPTIONS}
          onChange={setKindFilter}
        />
        <IconSelect
          label="Member"
          value={memberFilter}
          options={memberChoices}
          onChange={setMemberFilter}
        />
        <DayPicker day={day} today={today} onChange={setDay} />
      </PanelToolbar>

      {counts.length > 0 && (
        <ul className="gms-panel-summary" aria-label="Loaded achievements per kind">
          {counts.map((row) => (
            <li
              key={row.kind}
              className="gms-panel-summary-chip gms-panel-summary-chip--baseline"
            >
              <span className="gms-ach-summary-kind">{KIND_LABEL[row.kind]}</span>
              <strong>{row.count}</strong>
            </li>
          ))}
        </ul>
      )}

      <div className="gms-panel-body">
        <PanelStatus
          error={error}
          loading={loading && entries.length === 0}
          refreshing={refreshing}
          empty={!loading && entries.length === 0}
          emptyText={
            <>
              {day ? 'No achievements on this day' : 'No achievements yet'}
              {day && <ShowAllTimeButton onClick={() => setDay('')} />}
            </>
          }
        />

        {entries.length > 0 && (
          <ul className="gms-panel-list">
            {entries.map((entry) => (
              <AchievementCard key={entry.id} entry={entry} onZoom={() => setZoomedId(entry.id)} />
            ))}
          </ul>
        )}

        {hasMore && <LoadMoreButton loading={loading} disabled={!oldest} onClick={loadMore} />}
      </div>

      <Modal
        open={zoomed !== null}
        onClose={() => setZoomedId('')}
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
    return <ItemIcon itemId={entry.item_id} size={24} className="gms-ach-icon" />;
  }
  return <KindGlyph kind={entry.kind} />;
}

function AchievementCard({ entry, onZoom }: { entry: Achievement; onZoom: () => void }) {
  const [imageBroken, setImageBroken] = useState(false);
  const { absolute, stamp, ago } = timestamp(entry.at);
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
      <time className="gms-panel-time" dateTime={entry.at} title={absolute}>
        <span className="gms-panel-clock">{stamp}</span>
        <span className="gms-panel-ago">{ago}</span>
      </time>
    </li>
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
