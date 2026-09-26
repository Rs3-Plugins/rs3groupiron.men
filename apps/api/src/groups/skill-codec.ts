import {
  MAX_SKILL_XP,
  SKILL_BY_ID,
  SKILLS,
  levelFromXp,
  xpForLevel,
  type SkillId,
} from '../skills/skills.catalog';

/**
 * How far a current level may sit above the skill's natural cap. Potions and
 * other boosts push the current level past 99/110/120, so the clamp has to
 * leave room or a boosted skill would be silently truncated.
 */
export const MAX_LEVEL_BOOST = 30;

/**
 * `level` is the CURRENT level, which drains (poison, stat reducers) and
 * boosts (potions). `baseLevel` is never accepted from a caller: it is always
 * recomputed from XP, because XP is the only value that cannot go backwards.
 */
export type SeedSkillValue =
  number | { xp?: number; level?: number; baseLevel?: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export type NormalizedSkill = {
  skillId: string;
  xp: bigint;
  level: number;
  baseLevel: number;
};

export function normalizeSeedSkills(
  skills: Record<string, SeedSkillValue> | undefined,
): NormalizedSkill[] {
  if (!skills) return [];
  const rows: NormalizedSkill[] = [];

  for (const [skillId, value] of Object.entries(skills)) {
    const def = SKILL_BY_ID[skillId as SkillId];
    if (!def) continue;

    // Elite skills (Invention) climb a different curve, so every conversion
    // has to go through the skill's own.
    const curve = def.curve ?? 'standard';

    // XP is the source of truth. Only fall back to a level when no XP was
    // sent at all, which is how seed fixtures are written.
    let xp: number;
    if (typeof value === 'number') {
      xp = xpForLevel(clamp(value, 1, def.maxLevel), curve);
    } else if (typeof value.xp === 'number' && Number.isFinite(value.xp)) {
      xp = clamp(value.xp, 0, MAX_SKILL_XP);
    } else {
      const fromLevel = value.baseLevel ?? value.level ?? 1;
      xp = xpForLevel(clamp(fromLevel, 1, def.maxLevel), curve);
    }

    // Always derived, never trusted from the payload: a drained level must
    // not be able to lower someone's real level. Constitution floors at 10.
    const floor = def.minLevel ?? 1;
    const baseLevel = Math.max(floor, levelFromXp(xp, def.maxLevel, curve));

    // Current level: defaults to the base, may be drained below it or boosted
    // above the skill cap.
    const level =
      typeof value !== 'number' && typeof value.level === 'number'
        ? clamp(value.level, floor, def.maxLevel + MAX_LEVEL_BOOST)
        : baseLevel;

    rows.push({
      skillId,
      xp: BigInt(xp),
      level,
      baseLevel,
    });
  }

  return rows;
}

export function skillsToWire(
  rows: { skillId: string; xp: bigint; level: number; baseLevel: number }[],
) {
  const byId = new Map(rows.map((r) => [r.skillId, r]));
  return SKILLS.map((def) => {
    const row = byId.get(def.id);
    return {
      id: def.id,
      xp: row ? Number(row.xp) : 0,
      level: row?.level ?? 1,
      baseLevel: row?.baseLevel ?? 1,
    };
  });
}

export function replaceSkillsPayload(
  skills: Record<string, SeedSkillValue>,
): NormalizedSkill[] {
  return normalizeSeedSkills(skills);
}
