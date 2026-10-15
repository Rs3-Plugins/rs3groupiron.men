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

export type XpSnapshot = {
  skills: Map<string, Map<string, number>>;
  /** Presence at the time of the snapshot, so a re-login can be recognised. */
  online: Map<string, boolean>;
  /** Last login baseline per member; a change means the jump was catch-up. */
  baselineAt: Map<string, string | null>;
};

export function skillXpSnapshot(players: PlayerView[]): XpSnapshot {
  const skills = new Map<string, Map<string, number>>();
  const online = new Map<string, boolean>();
  const baselineAt = new Map<string, string | null>();
  for (const player of players) {
    const bySkill = new Map<string, number>();
    for (const skill of player.skills) {
      bySkill.set(skill.id, skill.xp);
    }
    skills.set(player.name, bySkill);
    online.set(player.name, player.online);
    baselineAt.set(player.name, player.baselineAt);
  }
  return { skills, online, baselineAt };
}

/** Compare previous XP snapshot to current players; return positive gains. */
export function diffXpDrops(
  prev: XpSnapshot | null,
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
    const prevSkills = prev.skills.get(player.name);
    if (!prevSkills) continue;
    // A member who just came online is reporting what they already had: the
    // plugin sends a full baseline on login, and catching up is not a gain.
    if (player.online && prev.online.get(player.name) === false) continue;
    // Same for a plugin enabled mid-session, which the presence check cannot
    // see: the server stamps the baseline, so a new stamp means catch-up.
    const previousBaseline = prev.baselineAt.get(player.name);
    if (
      player.baselineAt !== null &&
      previousBaseline !== undefined &&
      previousBaseline !== player.baselineAt
    ) {
      continue;
    }
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
