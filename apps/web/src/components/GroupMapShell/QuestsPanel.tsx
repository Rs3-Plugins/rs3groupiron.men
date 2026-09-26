import { useMemo, useState } from 'react';
import {
  MAX_QUEST_POINTS,
  QUEST_CATEGORIES,
  QUEST_CATEGORY_LABEL,
  countQuests,
  questPointsFor,
  questWikiUrl,
  questsInCategory,
  type MemberQuestStates,
  type QuestCategory,
  type QuestDef,
  type QuestState,
} from '../../lib/quests';
import { SearchField } from './SearchField';

type Progress = 'all' | 'finished' | 'started' | 'not_started';

const PROGRESS: Array<{ key: Progress; label: string; groupHint: string }> = [
  { key: 'all', label: 'All', groupHint: 'Every quest in this list' },
  { key: 'finished', label: 'Finished', groupHint: 'Finished by every member' },
  { key: 'started', label: 'In progress', groupHint: 'At least one member has started it' },
  { key: 'not_started', label: 'Not started', groupHint: 'Nobody has started it yet' },
];

type QuestsPanelProps = {
  /** Member names in display order; drives the columns. */
  memberNames: string[];
  byMember: Record<string, MemberQuestStates>;
  loading?: boolean;
  error?: string | null;
};

function stateOf(states: MemberQuestStates | undefined, quest: QuestDef): QuestState | null {
  return states?.[quest.gameval] ?? null;
}

/**
 * Progress of one quest across the selected members. With a single member
 * it is that member's state; across the group "finished" means everyone,
 * "started" means anyone has begun, "not started" means nobody has.
 */
function groupProgress(
  quest: QuestDef,
  names: string[],
  byMember: Record<string, MemberQuestStates>,
): Exclude<Progress, 'all'> {
  if (!names.length) return 'not_started';
  let finished = 0;
  let touched = 0;
  for (const name of names) {
    const state = stateOf(byMember[name], quest);
    if (state) touched += 1;
    if (state === 'finished') finished += 1;
  }
  if (finished === names.length) return 'finished';
  if (touched > 0) return 'started';
  return 'not_started';
}

export function QuestsPanel({
  memberNames,
  byMember,
  loading = false,
  error = null,
}: QuestsPanelProps) {
  const [query, setQuery] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [progress, setProgress] = useState<Progress>('all');
  // Real quests by default; miniquests, subquests, sagas and seasonal
  // quests are separate lists like on the wiki.
  const [category, setCategory] = useState<QuestCategory | 'all'>('quest');

  const columns = useMemo(
    () => (memberFilter === 'all' ? memberNames : memberNames.filter((n) => n === memberFilter)),
    [memberNames, memberFilter],
  );

  const pool = useMemo(() => questsInCategory(category), [category]);
  const poolPoints = useMemo(() => pool.reduce((sum, q) => sum + q.questPoints, 0), [pool]);

  // Search narrows the pool; progress is then applied on top, so the counts
  // on the progress buttons reflect what a click would show.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? pool.filter((quest) => quest.name.toLowerCase().includes(q)) : pool;
  }, [pool, query]);

  const progressCounts = useMemo(() => {
    const counts: Record<Progress, number> = {
      all: searched.length,
      finished: 0,
      started: 0,
      not_started: 0,
    };
    for (const quest of searched) counts[groupProgress(quest, columns, byMember)] += 1;
    return counts;
  }, [searched, columns, byMember]);

  const rows = useMemo(
    () =>
      progress === 'all'
        ? searched
        : searched.filter((quest) => groupProgress(quest, columns, byMember) === progress),
    [searched, progress, columns, byMember],
  );

  /** Per-column stats shown in the table header. */
  const stats = useMemo(
    () =>
      Object.fromEntries(
        columns.map((name) => {
          const states = byMember[name];
          return [name, { points: questPointsFor(states), ...countQuests(states, pool) }];
        }),
      ),
    [columns, byMember, pool],
  );

  const singleMember = columns.length === 1;
  const typeLabel = category === 'all' ? 'entries' : QUEST_CATEGORY_LABEL[category].toLowerCase();

  return (
    <section className="gms-quests gms-ach" aria-label="Group quests" aria-busy={loading}>
      <header className="gms-quests-head">
        <div className="gms-quests-heading">
          <h2 className="gms-ach-title">Quests</h2>
          <p className="gms-quests-subtitle">
            {pool.length} {typeLabel}
            {poolPoints > 0 ? ` · ${poolPoints} quest points` : ''}
          </p>
        </div>
        <div className="gms-quests-controls">
          <SearchField
            className="gms-quests-search"
            label="Search quests"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="gms-quests-select"
            aria-label="Quest type"
            value={category}
            onChange={(e) => setCategory(e.target.value as QuestCategory | 'all')}
          >
            {QUEST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {QUEST_CATEGORY_LABEL[c]}
              </option>
            ))}
            <option value="all">Everything</option>
          </select>
          <select
            className="gms-quests-select"
            aria-label="Member"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
          >
            <option value="all">All members</option>
            {memberNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="gms-quests-filters">
        <div className="gms-quests-segmented" role="group" aria-label="Filter by progress">
          {PROGRESS.map(({ key, label, groupHint }) => (
            <button
              key={key}
              type="button"
              className={`gms-quests-seg gms-quests-seg--${key}`}
              aria-pressed={progress === key}
              title={singleMember ? undefined : groupHint}
              onClick={() => setProgress(key)}
            >
              {label}
              <span className="gms-quests-seg-count">{progressCounts[key]}</span>
            </button>
          ))}
        </div>
        <ul className="gms-quests-legend" aria-hidden>
          <li>
            <Mark state="finished" /> Finished
          </li>
          <li>
            <Mark state="started" /> In progress
          </li>
        </ul>
      </div>

      <div className="gms-ach-body gms-quests-body">
        {error && <p className="gms-ach-status gms-ach-status--error">{error}</p>}
        {!error && loading && memberNames.length === 0 && (
          <p className="gms-ach-status">Loading…</p>
        )}
        {!error && !loading && rows.length === 0 && (
          <p className="gms-ach-status">No quests match.</p>
        )}
        {rows.length > 0 && (
          <table className="gms-quests-table">
            <thead>
              <tr>
                <th scope="col" className="gms-quests-th gms-quests-th--name">
                  Quest
                </th>
                <th scope="col" className="gms-quests-th gms-quests-th--qp" title="Quest points">
                  QP
                </th>
                {columns.map((name) => {
                  const s = stats[name]!;
                  return (
                    <th key={name} scope="col" className="gms-quests-th gms-quests-th--member">
                      <span className="gms-quests-th-name" title={name}>
                        {name}
                      </span>
                      <span
                        className="gms-quests-th-stat"
                        title={`${s.points} of ${MAX_QUEST_POINTS} quest points · ${s.finished} of ${s.total} ${typeLabel} finished · ${s.started} in progress`}
                      >
                        <strong>{s.points}</strong> QP · {s.finished}/{s.total}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((quest) => {
                const rowState = groupProgress(quest, columns, byMember);
                return (
                  <tr key={quest.gameval} className={`gms-quests-row gms-quests-row--${rowState}`}>
                    <th scope="row" className="gms-quests-name">
                      <a
                        className="gms-quests-name-text"
                        href={questWikiUrl(quest)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${quest.name} on the RuneScape Wiki`}
                      >
                        {quest.name}
                        <WikiIcon />
                      </a>
                      {category === 'all' && quest.category !== 'quest' && (
                        <span className="gms-quests-tag">{quest.category}</span>
                      )}
                      {quest.parentName && (
                        <span className="gms-quests-parent">{quest.parentName}</span>
                      )}
                    </th>
                    <td className="gms-quests-qp">{quest.questPoints || ''}</td>
                    {columns.map((name) => {
                      const state = stateOf(byMember[name], quest);
                      const label =
                        state === 'finished'
                          ? 'Finished'
                          : state === 'started'
                            ? 'In progress'
                            : 'Not started';
                      return (
                        <td
                          key={name}
                          className={`gms-quests-cell gms-quests-cell--${state ?? 'not_started'}`}
                          title={`${name} · ${quest.name} · ${label}`}
                        >
                          <Mark state={state} label={label} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Small external-link arrow shown on hover next to a quest name. */
function WikiIcon() {
  return (
    <svg
      className="gms-quests-wiki-icon"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M6.5 3.5H3.5v9h9V9.5" />
      <path d="M9 3h4v4" />
      <path d="M13 3 7.5 8.5" />
    </svg>
  );
}

/** Completion glyph: filled check, half-filled circle, or an empty ring. */
function Mark({ state, label }: { state: QuestState | null; label?: string }) {
  const common = {
    className: `gms-quests-mark gms-quests-mark--${state ?? 'not_started'}`,
    viewBox: '0 0 16 16',
    width: 16,
    height: 16,
    'aria-label': label,
    role: label ? 'img' : undefined,
    'aria-hidden': label ? undefined : true,
    focusable: 'false' as const,
  };
  if (state === 'finished') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M4.6 8.3l2.3 2.3 4.6-4.8" fill="none" stroke="#0e1a12" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'started') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 1.6A6.4 6.4 0 0 1 8 14.4z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
