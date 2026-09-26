import raw from '../data/quests.json';

/**
 * Static quest data comes from the client cache dump (src/data/quests.json)
 * keyed by gameval name. The API only stores per-member state, so quest
 * points and progress are derived here.
 */

export type QuestState = 'started' | 'finished';

/** `{ gameval: state }`; a quest that is absent is not started. */
export type MemberQuestStates = Record<string, QuestState>;

/**
 * How the wiki files a journal entry. Only `quest` and `subquest` award
 * points; the rest are shown on request.
 */
export type QuestCategory = 'quest' | 'subquest' | 'miniquest' | 'saga' | 'seasonal';

export type QuestDef = {
  id: number;
  gameval: string;
  name: string;
  questPoints: number;
  questPointsReq: number;
  category: QuestCategory;
  /** Display name of the parent quest, for subquests only. */
  parentName?: string;
  releaseYear: number | null;
  /** Journal length bucket, 1 (very short) to 9 (very very long). */
  length: number | null;
  /** 1 Fifth Age, 2 Ambiguous, 3 Sixth Age, 4 Age of Chaos. */
  age: number | null;
  /** Journal combat difficulty rank; higher is harder. */
  combatDifficulty: number | null;
  combatText: string | null;
  series: number | null;
  seriesNumber: number | null;
  seriesName: string | null;
  startLocation: number | null;
  startLocationName: string | null;
  timeline: number | null;
  timelineName: string | null;
  firstLetter: string;
  members: boolean | null;
  difficulty: QuestDifficulty | null;
  /** Quests that must be finished first. */
  questReqs: Array<{ gameval: string; name: string }>;
  /** Skill levels needed; `skill` matches the ids in skills.ts. */
  statReqs: Array<{ skill: string; level: number }>;
};

/** Journal difficulty tiers in ascending order; `multi` is a multi-part hub. */
export const QUEST_DIFFICULTIES = [
  'novice',
  'intermediate',
  'experienced',
  'master',
  'grandmaster',
  'multi',
] as const;
export type QuestDifficulty = (typeof QUEST_DIFFICULTIES)[number];

export function difficultyRank(difficulty: QuestDifficulty | null): number {
  const index = difficulty ? QUEST_DIFFICULTIES.indexOf(difficulty) : -1;
  return index === -1 ? QUEST_DIFFICULTIES.length : index;
}

export const AGE_LABEL: Record<number, string> = {
  1: 'Fifth Age',
  2: 'Ambiguous',
  3: 'Sixth Age',
  4: 'Age of Chaos',
};

export const LENGTH_LABEL: Record<number, string> = {
  1: 'Very short',
  2: 'Short',
  3: 'Short to Medium',
  4: 'Medium',
  5: 'Medium to Long',
  6: 'Long',
  7: 'Long to Very long',
  8: 'Very long',
  9: 'Very very long',
};

export const DIFFICULTY_LABEL: Record<QuestDifficulty, string> = {
  novice: 'Novice',
  intermediate: 'Intermediate',
  experienced: 'Experienced',
  master: 'Master',
  grandmaster: 'Grandmaster',
  multi: 'Multi-part',
};

/**
 * Parents for hidden subquests whose names don't carry a "Parent: Chapter"
 * prefix. Everything else derives the parent from the name.
 */
const SUBQUEST_PARENT_BY_PREFIX: Array<[prefix: RegExp, parentName: string]> = [
  [/^necromancy_city_band_/, 'That Old Black Magic'],
  [/^out\d$/, 'Once Upon a Time in Gielinor'],
];

function classify(raw: RawQuest): Pick<QuestDef, 'category' | 'parentName'> {
  const gameval = raw.quest_gameval!;
  const name = raw.name!;
  const questPoints = raw.questPoints ?? 0;

  // The journal suffixes these itself.
  if (/\(miniquest\)/i.test(name)) return { category: 'miniquest' };
  if (/\(saga\)/i.test(name)) return { category: 'saga' };

  // Rotating holiday quests are signposted from the hub; retired holiday
  // content has no achievement entry at all. Both award nothing.
  if (raw.quest_holiday_hub_signposting || raw.quest_achievement == null) {
    return { category: 'seasonal' };
  }

  // Hidden from the main journal list = a chapter of a bigger quest.
  if (raw.quest_hidden) {
    const colon = name.indexOf(': ');
    const parentName =
      colon > 0
        ? name.slice(0, colon)
        : SUBQUEST_PARENT_BY_PREFIX.find(([re]) => re.test(gameval))?.[1];
    return { category: 'subquest', parentName };
  }

  // Every real quest awards points. The remaining zero-point entries are
  // unsuffixed miniquests and events, except the Recipe for Disaster hub
  // whose points live on its subquests.
  if (questPoints === 0 && gameval !== 'recipe_for_disaster') return { category: 'miniquest' };
  return { category: 'quest' };
}

/** Fields we read from the OpenRune dump; it carries more than this. */
type RawQuest = {
  id: number;
  quest_gameval: string | null;
  name: string | null;
  sortName: string | null;
  questPoints: number | null;
  questPointsReq: number | null;
  /** Achievement id for the "complete this quest" entry; absent on retired content. */
  quest_achievement?: number;
  /** 1 when the journal hides it from the main list (subquests, seasonal). */
  quest_hidden?: number;
  /** Set only on the current rotating holiday quests. */
  quest_holiday_hub_signposting?: string;
  quest_release_year?: number;
  quest_length?: number;
  quest_age?: number;
  quest_combat_difficulty?: number;
  quest_combat?: string;
  quest_series?: number;
  quest_series_number?: number;
  quest_series_name?: string;
  quest_start_location?: number;
  quest_start_location_name?: string;
  quest_timeline_category?: number;
  quest_timeline_name?: string;
  quest_name_first_letter_no_accents?: string;
  members?: boolean;
  difficulty?: string;
  questReqs?: Array<{ id: number; quest_gameval?: string | null; name?: string | null }>;
  statReqs?: Array<{ stat: number; name?: string | null; level: number }>;
};

function parseDifficulty(raw: string | undefined): QuestDifficulty | null {
  const value = raw?.trim().toLowerCase();
  return value && (QUEST_DIFFICULTIES as readonly string[]).includes(value)
    ? (value as QuestDifficulty)
    : null;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

/**
 * The dump also carries legacy definitions (old gamevals, no sort name, zero
 * points) that shadow the real quest journal entries. Only entries with a
 * sort name are what the game lists, and their points sum to the true cap.
 */
export const QUESTS: QuestDef[] = (raw as RawQuest[])
  .filter((q) => q.quest_gameval && q.name && q.sortName)
  .map((q) => ({
    id: q.id,
    gameval: q.quest_gameval!,
    name: q.name!,
    questPoints: q.questPoints ?? 0,
    questPointsReq: q.questPointsReq ?? 0,
    releaseYear: q.quest_release_year ?? null,
    length: q.quest_length ?? null,
    age: q.quest_age ?? null,
    combatDifficulty: q.quest_combat_difficulty ?? null,
    combatText: q.quest_combat ?? null,
    series: q.quest_series ?? null,
    seriesNumber: q.quest_series_number ?? null,
    seriesName: q.quest_series_name ?? null,
    startLocation: q.quest_start_location ?? null,
    startLocationName: q.quest_start_location_name ?? null,
    timeline: q.quest_timeline_category ?? null,
    timelineName: q.quest_timeline_name ?? null,
    firstLetter: (q.quest_name_first_letter_no_accents ?? q.name![0] ?? '#').toUpperCase(),
    members: typeof q.members === 'boolean' ? q.members : null,
    difficulty: parseDifficulty(q.difficulty),
    questReqs: (q.questReqs ?? [])
      .filter((r) => r.quest_gameval)
      .map((r) => ({ gameval: r.quest_gameval!, name: r.name ?? r.quest_gameval! })),
    statReqs: (q.statReqs ?? [])
      .filter((r) => r.name && r.level > 0)
      .map((r) => ({ skill: r.name!.toLowerCase(), level: r.level })),
    ...classify(q),
  }))
  .sort((a, b) => collator.compare(a.name, b.name));

/** Which optional dump fields are actually populated, so the UI can grey out sorts. */
export const QUEST_DATA_AVAILABLE = {
  members: QUESTS.some((q) => q.members !== null),
  difficulty: QUESTS.some((q) => q.difficulty !== null),
  seriesNames: QUESTS.some((q) => q.seriesName !== null),
  startLocationNames: QUESTS.some((q) => q.startLocationName !== null),
  timelineNames: QUESTS.some((q) => q.timelineName !== null),
};

export const QUEST_BY_GAMEVAL: Record<string, QuestDef> = Object.fromEntries(
  QUESTS.map((q) => [q.gameval, q]),
);

export const QUEST_CATEGORIES: QuestCategory[] = [
  'quest',
  'subquest',
  'miniquest',
  'saga',
  'seasonal',
];

export const QUEST_CATEGORY_LABEL: Record<QuestCategory, string> = {
  quest: 'Quests',
  subquest: 'Subquests',
  miniquest: 'Miniquests',
  saga: 'Sagas',
  seasonal: 'Seasonal',
};

const WIKI_BASE = 'https://runescape.wiki';

/**
 * Wiki page for a quest. Page titles match the journal name for quests and
 * sagas; miniquests drop their "(miniquest)" suffix. Subquest titles vary
 * ("Recipe for Disaster/Freeing Evil Dave"), so those go through the
 * wiki's go-to-title search, which lands on the page when it exists.
 */
export function questWikiUrl(quest: QuestDef): string {
  if (quest.category === 'subquest') {
    return `${WIKI_BASE}/w/Special:Search?go=Go&search=${encodeURIComponent(quest.name)}`;
  }
  const title = quest.name.replace(/\s*\(miniquest\)$/i, '').trim().replace(/ /g, '_');
  return `${WIKI_BASE}/w/${encodeURIComponent(title).replace(/%2F/g, '/')}`;
}

/**
 * Requirements a member has not met yet, as readable strings. Empty means
 * the quest can be started. Skill checks use unboosted levels; a skill the
 * member has no row for counts as level 1.
 */
export function unmetRequirements(
  quest: QuestDef,
  states: MemberQuestStates | undefined,
  baseLevels: Record<string, number>,
  questPoints: number,
  skillName: (skill: string) => string = (s) => s,
): string[] {
  const unmet: string[] = [];
  if (quest.questPointsReq > questPoints) {
    unmet.push(`${quest.questPointsReq} quest points`);
  }
  for (const req of quest.questReqs) {
    if (states?.[req.gameval] !== 'finished') unmet.push(req.name);
  }
  for (const req of quest.statReqs) {
    if ((baseLevels[req.skill] ?? 1) < req.level) {
      unmet.push(`${req.level} ${skillName(req.skill)}`);
    }
  }
  return unmet;
}

export function questsInCategory(category: QuestCategory | 'all'): QuestDef[] {
  return category === 'all' ? QUESTS : QUESTS.filter((q) => q.category === category);
}

/** Points on quests and their subquests; other categories award none. */
export const MAX_QUEST_POINTS = QUESTS.reduce((sum, q) => sum + q.questPoints, 0);

export function questPointsFor(states: MemberQuestStates | undefined): number {
  if (!states) return 0;
  let total = 0;
  for (const [gameval, state] of Object.entries(states)) {
    if (state === 'finished') total += QUEST_BY_GAMEVAL[gameval]?.questPoints ?? 0;
  }
  return total;
}

/** Finished / in-progress counts over `quests` (defaults to every quest). */
export function countQuests(
  states: MemberQuestStates | undefined,
  quests: QuestDef[] = QUESTS,
) {
  let finished = 0;
  let started = 0;
  if (states) {
    for (const quest of quests) {
      const state = states[quest.gameval];
      if (state === 'finished') finished += 1;
      else if (state === 'started') started += 1;
    }
  }
  return { finished, started, total: quests.length };
}
