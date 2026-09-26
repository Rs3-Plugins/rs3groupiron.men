import { MAX_LEVEL_BOOST, normalizeSeedSkills } from './skill-codec';
import { MAX_SKILL_XP, xpForLevel } from '../skills/skills.catalog';

function only(skills: Record<string, unknown>) {
  const rows = normalizeSeedSkills(skills as never);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('normalizeSeedSkills', () => {
  it('derives base level from xp, ignoring any sent base level', () => {
    // 52.8m Slayer really is level 113. A payload claiming 99 must not win.
    const row = only({
      slayer: { xp: 52_829_800, level: 113, baseLevel: 99 },
    });
    expect(row.baseLevel).toBe(113);
    expect(Number(row.xp)).toBe(52_829_800);
  });

  it('keeps the current level when a skill is drained', () => {
    // Poison drops the current level; the real level is unchanged.
    const row = only({ attack: { xp: xpForLevel(99), level: 82 } });
    expect(row.level).toBe(82);
    expect(row.baseLevel).toBe(99);
  });

  it('allows a boosted level above the skill cap', () => {
    const row = only({ attack: { xp: xpForLevel(99), level: 104 } });
    expect(row.level).toBe(104);
    expect(row.baseLevel).toBe(99);
  });

  it('caps an implausible boost', () => {
    // Every skill runs to the virtual cap of 120, so the ceiling is 120 plus
    // the room left for potion boosts.
    const row = only({ prayer: { xp: xpForLevel(99), level: 9999 } });
    expect(row.level).toBe(120 + MAX_LEVEL_BOOST);
  });

  it('defaults the current level to the base when none is sent', () => {
    const row = only({ attack: { xp: xpForLevel(70) } });
    expect(row.level).toBe(70);
    expect(row.baseLevel).toBe(70);
  });

  it('runs every skill to the virtual cap of 120', () => {
    // Identical XP on two standard skills derives the same level, because
    // they now share the same ceiling.
    const prayer = only({ prayer: { xp: 60_000_000 } });
    const slayer = only({ slayer: { xp: 60_000_000 } });
    expect(prayer.baseLevel).toBe(slayer.baseLevel);
    expect(prayer.baseLevel).toBeGreaterThan(99);

    // And nothing goes past 120.
    expect(only({ prayer: { xp: 200_000_000 } }).baseLevel).toBe(120);
  });

  it('accepts xp up to 200m and clamps beyond it', () => {
    const row = only({ slayer: { xp: MAX_SKILL_XP } });
    expect(Number(row.xp)).toBe(MAX_SKILL_XP);
    expect(row.baseLevel).toBe(120);

    const over = only({ slayer: { xp: MAX_SKILL_XP + 5_000_000 } });
    expect(Number(over.xp)).toBe(MAX_SKILL_XP);
  });

  it('never stores negative xp', () => {
    const row = only({ attack: { xp: -500 } });
    expect(Number(row.xp)).toBe(0);
    expect(row.baseLevel).toBe(1);
  });

  it('falls back to a level when no xp is sent', () => {
    const row = only({ attack: { level: 50 } });
    expect(Number(row.xp)).toBe(xpForLevel(50));
    expect(row.baseLevel).toBe(50);
  });

  it('treats a bare number as a level', () => {
    const row = only({ attack: 60 });
    expect(row.baseLevel).toBe(60);
    expect(row.level).toBe(60);
    expect(Number(row.xp)).toBe(xpForLevel(60));
  });

  it('floors Constitution at level 10', () => {
    // A brand new account has 10 Constitution and 1000 life points, never 1.
    expect(only({ constitution: { xp: 0 } }).baseLevel).toBe(10);
    expect(only({ constitution: { xp: 0, level: 1 } }).level).toBe(10);
    expect(only({ constitution: 1 }).baseLevel).toBe(10);

    // Other skills still start at 1.
    expect(only({ attack: { xp: 0 } }).baseLevel).toBe(1);
  });

  it('lets Constitution be drained, but not below its floor', () => {
    const row = only({ constitution: { xp: xpForLevel(99), level: 4 } });
    expect(row.level).toBe(10);
    expect(row.baseLevel).toBe(99);
  });

  it('drops unknown skill ids', () => {
    expect(normalizeSeedSkills({ nonsense: { xp: 100 } })).toHaveLength(0);
  });

  it('uses the elite curve for Invention', () => {
    // Official table: elite level 120 is 80,618,654 XP. On the standard curve
    // that same XP would read as level 117, under-reporting a maxed skill.
    const maxed = only({ invention: { xp: 80_618_654 } });
    expect(maxed.baseLevel).toBe(120);

    const ninetyNine = only({ invention: { xp: 36_073_511 } });
    expect(ninetyNine.baseLevel).toBe(99);

    // A standard skill with the same XP is nowhere near 120.
    const slayer = only({ slayer: { xp: 80_618_654 } });
    expect(slayer.baseLevel).toBeLessThan(120);
  });

  it('derives elite xp when only a level is given', () => {
    const row = only({ invention: { level: 99 } });
    expect(Number(row.xp)).toBe(36_073_511);
  });

  it('ignores a non-finite xp rather than storing NaN', () => {
    const row = only({ attack: { xp: Number.NaN, level: 40 } });
    expect(Number.isFinite(Number(row.xp))).toBe(true);
    expect(Number(row.xp)).toBe(xpForLevel(40));
  });
});
