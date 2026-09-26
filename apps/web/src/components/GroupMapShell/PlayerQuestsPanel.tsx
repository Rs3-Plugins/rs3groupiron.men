import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AGE_LABEL,
  DIFFICULTY_LABEL,
  LENGTH_LABEL,
  MAX_QUEST_POINTS,
  QUESTS,
  QUEST_DATA_AVAILABLE,
  difficultyRank,
  questPointsFor,
  questWikiUrl,
  unmetRequirements,
  type MemberQuestStates,
  type QuestDef,
  type QuestState,
} from '../../lib/quests';
import { SKILL_BY_ID, type SkillId } from '../../lib/skills';
import type { PlayerSkill } from '../../lib/items';
import { useDismiss } from '../../hooks/useDismiss';
import { FilterIcon, LockIcon } from './icons';

/** Sort orders in the same order as the in-game journal menu. */
type Sort =
  | 'alphabetical'
  | 'difficulty'
  | 'combat'
  | 'age'
  | 'members'
  | 'length'
  | 'progress'
  | 'release'
  | 'series'
  | 'start_location'
  | 'timeline';

const SORTS: Array<{ key: Sort; label: string; available: boolean; hint?: string }> = [
  { key: 'alphabetical', label: 'Alphabetical', available: true },
  {
    key: 'difficulty',
    label: 'Difficulty',
    available: QUEST_DATA_AVAILABLE.difficulty,
    hint: 'Needs difficulty in the quest dump',
  },
  { key: 'combat', label: 'Combat', available: true },
  { key: 'age', label: 'Fifth/Sixth Age', available: true },
  {
    key: 'members',
    label: 'Free/Members',
    available: QUEST_DATA_AVAILABLE.members,
    hint: 'Needs members in the quest dump',
  },
  { key: 'length', label: 'Length', available: true },
  { key: 'progress', label: 'Progress', available: true },
  { key: 'release', label: 'Release Date', available: true },
  { key: 'series', label: 'Series', available: true },
  { key: 'start_location', label: 'Start Location', available: true },
  { key: 'timeline', label: 'Timeline', available: true },
];

const STATE_ORDER: Record<string, number> = { started: 0, not_started: 1, finished: 2 };
const STATE_HEADING: Record<string, string> = {
  started: 'In progress',
  not_started: 'Not started',
  finished: 'Completed',
};

type Row = {
  quest: QuestDef;
  state: QuestState | 'not_started';
  /** Unmet requirements; non-empty means the quest is locked. */
  unmet: string[];
  locked: boolean;
};

const skillLabel = (skill: string) => SKILL_BY_ID[skill as SkillId]?.name ?? skill;

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const byName = (a: Row, b: Row) => collator.compare(a.quest.name, b.quest.name);

/** Nulls sort last so quests missing a field gather at the bottom. */
function num(value: number | null, missing = Number.POSITIVE_INFINITY) {
  return value ?? missing;
}

function comparator(sort: Sort): (a: Row, b: Row) => number {
  switch (sort) {
    case 'progress':
      return (a, b) => STATE_ORDER[a.state]! - STATE_ORDER[b.state]! || byName(a, b);
    case 'release':
      return (a, b) => num(a.quest.releaseYear) - num(b.quest.releaseYear) || byName(a, b);
    case 'length':
      return (a, b) => num(a.quest.length) - num(b.quest.length) || byName(a, b);
    case 'age':
      return (a, b) => num(a.quest.age) - num(b.quest.age) || byName(a, b);
    case 'combat':
      return (a, b) =>
        num(a.quest.combatDifficulty, -1) - num(b.quest.combatDifficulty, -1) || byName(a, b);
    case 'difficulty':
      return (a, b) =>
        difficultyRank(a.quest.difficulty) - difficultyRank(b.quest.difficulty) || byName(a, b);
    case 'members':
      return (a, b) =>
        Number(a.quest.members ?? true) - Number(b.quest.members ?? true) || byName(a, b);
    case 'series':
      return (a, b) =>
        num(a.quest.series) - num(b.quest.series) ||
        num(a.quest.seriesNumber) - num(b.quest.seriesNumber) ||
        byName(a, b);
    case 'start_location':
      return (a, b) => num(a.quest.startLocation) - num(b.quest.startLocation) || byName(a, b);
    case 'timeline':
      return (a, b) => num(a.quest.timeline) - num(b.quest.timeline) || byName(a, b);
    default:
      return byName;
  }
}

/** Section heading for a row under the given sort, or null for a flat list. */
function headingFor(sort: Sort, row: Row): string | null {
  const q = row.quest;
  switch (sort) {
    case 'alphabetical':
      return q.firstLetter;
    case 'progress':
      return STATE_HEADING[row.state]!;
    case 'release':
      return q.releaseYear ? String(q.releaseYear) : 'Unknown';
    case 'length':
      return q.length ? (LENGTH_LABEL[q.length] ?? `Length ${q.length}`) : 'Unknown';
    case 'age':
      return q.age ? (AGE_LABEL[q.age] ?? `Age ${q.age}`) : 'Unknown';
    case 'difficulty':
      return q.difficulty ? DIFFICULTY_LABEL[q.difficulty] : 'Unknown';
    case 'members':
      return q.members === null ? 'Unknown' : q.members ? 'Members' : 'Free to play';
    case 'series':
      return q.series === null ? 'No series' : (q.seriesName ?? `Series ${q.series}`);
    case 'start_location':
      return q.startLocation === null
        ? 'Unknown'
        : (q.startLocationName ?? `Location ${q.startLocation}`);
    case 'timeline':
      return q.timeline === null ? 'Unplaced' : (q.timelineName ?? `Timeline ${q.timeline}`);
    default:
      return null;
  }
}

function rowTitle(row: Row) {
  const q = row.quest;
  const parts = [q.name, STATE_HEADING[row.state]!, `${q.questPoints} QP`];
  if (row.locked) parts.push(`Locked: needs ${row.unmet.join(', ')}`);
  if (q.difficulty) parts.push(DIFFICULTY_LABEL[q.difficulty]);
  if (q.members !== null) parts.push(q.members ? 'Members' : 'Free to play');
  if (q.length) parts.push(LENGTH_LABEL[q.length] ?? '');
  if (q.combatText) parts.push(q.combatText);
  return parts.filter(Boolean).join(' · ');
}

const FILTERS = [
  { key: 'locked', label: 'Show Locked' },
  { key: 'completed', label: 'Show Completed' },
  { key: 'quests', label: 'Show Quests' },
  { key: 'miniquests', label: 'Show Miniquests' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

/**
 */
export function PlayerQuestsPanel({
  states,
  skills = [],
}: {
  states: MemberQuestStates | undefined;
  /** The member's skills, for stat requirement checks. */
  skills?: PlayerSkill[];
}) {
  // Progress first: in-progress quests at the top is the most useful default.
  const [sort, setSort] = useState<Sort>('progress');
  // Locked quests are hidden by default so the list shows what can be done now.
  const [show, setShow] = useState<Record<FilterKey, boolean>>({
    locked: false,
    completed: true,
    quests: true,
    miniquests: false,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useDismiss(
    filtersOpen,
    filterRef,
    useCallback(() => setFiltersOpen(false), []),
  );

  const points = questPointsFor(states);
  const baseLevels = useMemo(
    () => Object.fromEntries(skills.map((s) => [s.id, s.baseLevel])),
    [skills],
  );

  const all = useMemo<Row[]>(
    () =>
      QUESTS.filter((q) => q.category === 'quest' || q.category === 'miniquest').map((quest) => {
        const state = states?.[quest.gameval] ?? 'not_started';
        const unmet =
          state === 'not_started'
            ? unmetRequirements(quest, states, baseLevels, points, skillLabel)
            : [];
        return { quest, state, unmet, locked: unmet.length > 0 };
      }),
    [states, baseLevels, points],
  );

  const inScope = useCallback(
    (quest: QuestDef) => (quest.category === 'quest' ? show.quests : show.miniquests),
    [show.quests, show.miniquests],
  );

  const rows = useMemo(() => {
    const list = all.filter(({ quest, state, locked }) => {
      if (!show.completed && state === 'finished') return false;
      if (!show.locked && locked) return false;
      return inScope(quest);
    });
    return list.sort(comparator(sort));
  }, [all, sort, show.completed, show.locked, inScope]);

  const total = all.filter((r) => inScope(r.quest)).length;

  let lastHeading: string | null = null;

  return (
    <div className="gms-player-panel">
      <div className="gms-player-panel-title">Quests</div>

      <div className="gms-pq-toolbar">
        <div className="gms-pq-filter" ref={filterRef}>
          <button
            type="button"
            className="gms-pq-filter-btn"
            aria-label="Filter quests"
            aria-expanded={filtersOpen}
            aria-haspopup="true"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <FilterIcon className="gms-pq-filter-icon" />
          </button>
          {filtersOpen && (
            <div className="gms-pq-popover" role="group" aria-label="Show">
              {FILTERS.map(({ key, label }) => (
                <Check
                  key={key}
                  label={label}
                  on={show[key]}
                  onChange={(next) => setShow((prev) => ({ ...prev, [key]: next }))}
                />
              ))}
            </div>
          )}
        </div>
        <select
          className="gms-pq-select"
          aria-label="Sort quests"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key} disabled={!s.available} title={s.hint}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <p className="gms-pq-count">
        Showing {rows.length} of {total} items
      </p>

      <ul className="gms-pq-list">
        {rows.map((row) => {
          const heading = headingFor(sort, row);
          const showHeading = heading !== null && heading !== lastHeading;
          lastHeading = heading;
          return (
            <li key={row.quest.gameval} className="gms-pq-item">
              {showHeading && <div className="gms-pq-heading">{heading}</div>}
              <a
                className={`gms-pq-quest gms-pq-quest--${row.state}${row.locked ? ' gms-pq-quest--locked' : ''}`}
                href={questWikiUrl(row.quest)}
                target="_blank"
                rel="noopener noreferrer"
                title={rowTitle(row)}
              >
                {row.quest.name}
                {row.locked && <LockIcon />}
              </a>
            </li>
          );
        })}
        {rows.length === 0 && <li className="gms-player-panel-empty">Nothing to show</li>}
      </ul>

      <div className="gms-pq-footer">
        Quest Points: <strong>{points}</strong> / {MAX_QUEST_POINTS}
      </div>
    </div>
  );
}

function Check({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="gms-pq-check">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="gms-pq-check-box" aria-hidden>
        {on ? '✓' : ''}
      </span>
      {label}
    </label>
  );
}
