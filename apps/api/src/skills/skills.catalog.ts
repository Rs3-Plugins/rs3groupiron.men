/** RS3 skills in interface display order (left→right, top→bottom). */
export type SkillId =
  | 'attack'
  | 'constitution'
  | 'mining'
  | 'strength'
  | 'agility'
  | 'smithing'
  | 'defence'
  | 'herblore'
  | 'fishing'
  | 'ranged'
  | 'thieving'
  | 'cooking'
  | 'prayer'
  | 'crafting'
  | 'firemaking'
  | 'magic'
  | 'fletching'
  | 'woodcutting'
  | 'runecrafting'
  | 'slayer'
  | 'farming'
  | 'construction'
  | 'hunter'
  | 'summoning'
  | 'dungeoneering'
  | 'divination'
  | 'invention'
  | 'archaeology'
  | 'necromancy';

/**
 * Elite skills climb a different, much steeper XP curve. Invention is the
 * only one: its level 120 is 80,618,654 XP, not the 104,273,167 a standard
 * skill needs. Treating it as standard under-reports a maxed Invention by
 * several levels.
 */
export type SkillCurve = 'standard' | 'elite';

export type SkillDef = {
  id: SkillId;
  name: string;
  maxLevel: number;
  /** Lowest possible level. Only Constitution differs: it starts at 10. */
  minLevel?: number;
  sortOrder: number;
  /** File under /skills/{file} */
  icon: string;
  /** Defaults to 'standard' when omitted. */
  curve?: SkillCurve;
};

/** Life points are 100 per Constitution level: 10 -> 1000, 99 -> 9900. */
export const LIFE_POINTS_PER_LEVEL = 100;

export const MAX_SKILL_XP = 200_000_000;

export const SKILLS: SkillDef[] = [
  {
    id: 'attack',
    name: 'Attack',
    maxLevel: 120,
    sortOrder: 0,
    icon: 'attack.png',
  },
  {
    id: 'constitution',
    name: 'Constitution',
    maxLevel: 120,
    minLevel: 10,
    sortOrder: 1,
    icon: 'constitution.png',
  },
  {
    id: 'mining',
    name: 'Mining',
    maxLevel: 120,
    sortOrder: 2,
    icon: 'mining.png',
  },
  {
    id: 'strength',
    name: 'Strength',
    maxLevel: 120,
    sortOrder: 3,
    icon: 'strength.png',
  },
  {
    id: 'agility',
    name: 'Agility',
    maxLevel: 120,
    sortOrder: 4,
    icon: 'agility.png',
  },
  {
    id: 'smithing',
    name: 'Smithing',
    maxLevel: 120,
    sortOrder: 5,
    icon: 'smithing.png',
  },
  {
    id: 'defence',
    name: 'Defence',
    maxLevel: 120,
    sortOrder: 6,
    icon: 'defence.png',
  },
  {
    id: 'herblore',
    name: 'Herblore',
    maxLevel: 120,
    sortOrder: 7,
    icon: 'herblore.png',
  },
  {
    id: 'fishing',
    name: 'Fishing',
    maxLevel: 120,
    sortOrder: 8,
    icon: 'fishing.png',
  },
  {
    id: 'ranged',
    name: 'Ranged',
    maxLevel: 120,
    sortOrder: 9,
    icon: 'ranged.png',
  },
  {
    id: 'thieving',
    name: 'Thieving',
    maxLevel: 120,
    sortOrder: 10,
    icon: 'thieving.png',
  },
  {
    id: 'cooking',
    name: 'Cooking',
    maxLevel: 120,
    sortOrder: 11,
    icon: 'cooking.png',
  },
  {
    id: 'prayer',
    name: 'Prayer',
    maxLevel: 120,
    sortOrder: 12,
    icon: 'prayer.png',
  },
  {
    id: 'crafting',
    name: 'Crafting',
    maxLevel: 120,
    sortOrder: 13,
    icon: 'crafting.png',
  },
  {
    id: 'firemaking',
    name: 'Firemaking',
    maxLevel: 120,
    sortOrder: 14,
    icon: 'firemaking.png',
  },
  {
    id: 'magic',
    name: 'Magic',
    maxLevel: 120,
    sortOrder: 15,
    icon: 'magic.png',
  },
  {
    id: 'fletching',
    name: 'Fletching',
    maxLevel: 120,
    sortOrder: 16,
    icon: 'fletching.png',
  },
  {
    id: 'woodcutting',
    name: 'Woodcutting',
    maxLevel: 120,
    sortOrder: 17,
    icon: 'woodcutting.png',
  },
  {
    id: 'runecrafting',
    name: 'Runecrafting',
    maxLevel: 120,
    sortOrder: 18,
    icon: 'runecrafting.png',
  },
  {
    id: 'slayer',
    name: 'Slayer',
    maxLevel: 120,
    sortOrder: 19,
    icon: 'slayer.png',
  },
  {
    id: 'farming',
    name: 'Farming',
    maxLevel: 120,
    sortOrder: 20,
    icon: 'farming.png',
  },
  {
    id: 'construction',
    name: 'Construction',
    maxLevel: 120,
    sortOrder: 21,
    icon: 'construction.png',
  },
  {
    id: 'hunter',
    name: 'Hunter',
    maxLevel: 120,
    sortOrder: 22,
    icon: 'hunter.png',
  },
  {
    id: 'summoning',
    name: 'Summoning',
    maxLevel: 120,
    sortOrder: 23,
    icon: 'summoning.png',
  },
  {
    id: 'dungeoneering',
    name: 'Dungeoneering',
    maxLevel: 120,
    sortOrder: 24,
    icon: 'dungeoneering.png',
  },
  {
    id: 'divination',
    name: 'Divination',
    maxLevel: 120,
    sortOrder: 25,
    icon: 'divination.png',
  },
  {
    id: 'invention',
    name: 'Invention',
    maxLevel: 120,
    sortOrder: 26,
    icon: 'invention.png',
    curve: 'elite',
  },
  {
    id: 'archaeology',
    name: 'Archaeology',
    maxLevel: 120,
    sortOrder: 27,
    icon: 'archaeology.png',
  },
  {
    id: 'necromancy',
    name: 'Necromancy',
    maxLevel: 120,
    sortOrder: 28,
    icon: 'necromancy.png',
  },
];

export const SKILL_BY_ID = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
) as Record<SkillId, SkillDef>;

/**
 * Cumulative XP for each elite level, 1 to 120.
 *
 * Taken verbatim from the official table at
 * https://runescape.wiki/w/Experience/Table — the elite curve has no published
 * closed form, so it is data rather than a formula.
 */
const ELITE_XP: readonly number[] = [
  0, 830, 1861, 2902, 3980, 5126, 6380, 7787, 9400, 11275,
  13605, 16372, 19656, 23546, 28134, 33520, 39809, 47109, 55535, 65209,
  77190, 90811, 106221, 123573, 143025, 164742, 188893, 215651, 245196, 277713,
  316311, 358547, 404634, 454796, 509259, 568254, 632019, 700797, 774834, 854383,
  946227, 1044569, 1149696, 1261903, 1381488, 1508756, 1644015, 1787581, 1939773,
  2100917, 2283490, 2476369, 2679917, 2894505, 3120508, 3358307, 3608290,
  3870846, 4146374, 4435275, 4758122, 5096111, 5449685, 5819299, 6205407,
  6608473, 7028964, 7467354, 7924122, 8399751, 8925664, 9472665, 10041285,
  10632061, 11245538, 11882262, 12542789, 13227679, 13937496, 14672812,
  15478994, 16313404, 17176661, 18069395, 18992239, 19945833, 20930821,
  21947856, 22997593, 24080695, 25259906, 26475754, 27728955, 29020233,
  30350318, 31719944, 33129852, 34580790, 36073511, 37608773, 39270442,
  40978509, 42733789, 44537107, 46389292, 48291180, 50243611, 52247435,
  54303504, 56412678, 58575824, 60793812, 63067521, 65397835, 67785643,
  70231841, 72737330, 75303019, 77929820, 80618654,
];

/**
 * Cumulative XP required for a level.
 *
 * The standard curve is the published formula and matches the official table
 * exactly for all 126 levels. Elite skills use the embedded table instead.
 */
export function xpForLevel(level: number, curve: SkillCurve = 'standard'): number {
  if (level <= 1) return 0;

  if (curve === 'elite') {
    const index = Math.min(level, ELITE_XP.length) - 1;
    return ELITE_XP[index];
  }

  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(i + 300 * Math.pow(2, i / 7));
  }
  return Math.min(MAX_SKILL_XP, Math.floor(total / 4));
}

export function levelFromXp(
  xp: number,
  maxLevel: number,
  curve: SkillCurve = 'standard',
): number {
  let level = 1;
  while (level < maxLevel && xpForLevel(level + 1, curve) <= xp) {
    level += 1;
  }
  return level;
}
