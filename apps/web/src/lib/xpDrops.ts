import type { PlayerSkill, PlayerView } from './items';
import type { SkillId } from './skills';

export type XpDropSkillPart = {
  skillId: SkillId | string;
  skillName: string;
  icon: string;
  amount: number;
};

/** One floating bubble per player — skills merge, amounts sum. */
export type CombinedXpDrop = {
  id: string;
  playerName?: string;
  parts: XpDropSkillPart[];
};

export function skillXpSnapshot(players: PlayerView[]) {
  const map = new Map<string, Map<string, number>>();
  for (const player of players) {
    const skills = new Map<string, number>();
    for (const skill of player.skills) {
      skills.set(skill.id, skill.xp);
    }
    map.set(player.name, skills);
  }
  return map;
}

/** Compare previous XP snapshot to current players; return positive gains. */
export function diffXpDrops(
  prev: Map<string, Map<string, number>> | null,
  players: PlayerView[],
): Array<{ playerName: string; displayName: string; skill: PlayerSkill; amount: number }> {
  if (!prev) return [];
  const out: Array<{
    playerName: string;
    displayName: string;
    skill: PlayerSkill;
    amount: number;
  }> = [];
  for (const player of players) {
    const prevSkills = prev.get(player.name);
    if (!prevSkills) continue;
    for (const skill of player.skills) {
      const before = prevSkills.get(skill.id);
      if (before == null) continue;
      const amount = skill.xp - before;
      if (amount > 0) {
        out.push({
          playerName: player.name,
          displayName: player.displayName || player.name,
          skill,
          amount,
        });
      }
    }
  }
  return out;
}

export function totalXpAmount(drop: CombinedXpDrop) {
  return drop.parts.reduce((sum, part) => sum + part.amount, 0);
}

/** Lowest amount first so the biggest XP icon paints last (in front). */
export function xpPartsBackToFront(parts: XpDropSkillPart[]) {
  return [...parts].sort((a, b) => a.amount - b.amount);
}

export function mergeXpDrop(
  existing: CombinedXpDrop | undefined,
  skill: PlayerSkill,
  amount: number,
  playerName?: string,
): CombinedXpDrop {
  const parts = existing?.parts.map((p) => ({ ...p })) ?? [];
  const idx = parts.findIndex((p) => p.skillId === skill.id);
  if (idx >= 0) {
    const cur = parts[idx]!;
    parts[idx] = { ...cur, amount: cur.amount + amount };
  } else {
    parts.push({
      skillId: skill.id,
      skillName: skill.name,
      icon: skill.icon,
      amount,
    });
  }
  return {
    id: `xp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    playerName: playerName ?? existing?.playerName,
    parts,
  };
}
