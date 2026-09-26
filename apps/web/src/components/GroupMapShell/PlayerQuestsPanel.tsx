import { useEffect, useMemo, useRef, useState } from 'react';
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
import { FilterIcon } from './icons';

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

/**
 * Per-player quest journal, styled after the in-game list: green when
 * complete, yellow when started, red when untouched. The sort menu and the
 * funnel filter mirror the journal's own controls.
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
  const [showLocked, setShowLocked] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showQuests, setShowQuests] = useState(true);
  const [showMiniquests, setShowMiniquests] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close the filter popover on outside click or Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  const points = questPointsFor(states);
  const baseLevels = useMemo(
    () => Object.fromEntries(skills.map((s) => [s.id, s.baseLevel])),
    [skills],
  );

  const all = useMemo<Row[]>(
    () =>
      QUESTS.filter((q) => q.category === 'quest' || q.category === 'miniquest').map((quest) => {
        const state = states?.[quest.gameval] ?? 'not_started';
        // Locked = can't be started yet: quest points, prerequisite quests
        // and skill levels, all from the dump. Started/finished quests are
        // never locked regardless.
        const unmet =
          state === 'not_started'
            ? unmetRequirements(quest, states, baseLevels, points, skillLabel)
            : [];
        return { quest, state, unmet, locked: unmet.length > 0 };
      }),
    [states, baseLevels, points],
  );

  const rows = useMemo(() => {
    const list = all.filter(({ quest, state, locked }) => {
      if (!showCompleted && state === 'finished') return false;
      if (!showLocked && locked) return false;
      if (quest.category === 'quest' && !showQuests) return false;
      if (quest.category === 'miniquest' && !showMiniquests) return false;
      return true;
    });
    return list.sort(comparator(sort));
  }, [all, sort, showLocked, showCompleted, showQuests, showMiniquests]);

  const total = all.filter((r) => (r.quest.category === 'quest' ? showQuests : showMiniquests)).length;

  let lastHeading: string | null = null;

  return (
    <div className="gms-player-panel gms-pq">
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
              <Check label="Show Locked" on={showLocked} onChange={setShowLocked} />
              <Check label="Show Completed" on={showCompleted} onChange={setShowCompleted} />
              <Check label="Show Quests" on={showQuests} onChange={setShowQuests} />
              <Check label="Show Miniquests" on={showMiniquests} onChange={setShowMiniquests} />
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

function LockIcon() {
  return (
    <svg
      className="gms-pq-lock"
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Locked"
      role="img"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
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
