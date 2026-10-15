import { BadRequestException } from '@nestjs/common';
import { isGamevalName } from '../gamevals/gamevals.catalog';
import { humanizeGameval } from '../gamevals/quest-catalog';

/**
 * Roughly 300 achievements mirror a quest and share its name, e.g.
 * `quest_cooks_assistant`. The quest sync already posts those completions, so
 * they are stored but kept out of the feed to avoid a double entry.
 */
export function isFeedWorthyAchievement(gameval: string): boolean {
  return !gameval.startsWith('quest_');
}

/** `cheevo_` prefixes every ordinary achievement and reads as noise. */
export function achievementTitle(gameval: string): string {
  const stripped = gameval.startsWith('cheevo_')
    ? gameval.slice('cheevo_'.length)
    : gameval;
  return humanizeGameval(stripped);
}

/** RS3 has ~5000 achievements; a full sync lists only the completed ones. */
export const MAX_ACHIEVEMENT_UPDATES = 6000;

/** One achievement reference: `gameval` wins over `achievement_id`. */
export type AchievementRef = {
  achievement_id?: number;
  gameval?: string;
};

export type AchievementNameResolver = {
  nameOf(kind: 'achievement', id: number): string | undefined;
  hasName(kind: 'achievement', name: string): boolean;
};

export type ResolvedAchievementRefs = {
  completed: Set<string>;
  /** References this server's gameval dump does not know; reported, not fatal. */
  skipped: AchievementRef[];
};

/**
 * Normalise references to a set of gameval names. An achievement newer than
 * the server's dump is skipped rather than rejected, so one unknown entry
 * cannot block a sync carrying thousands of known ones.
 */
export function resolveAchievementRefs(
  refs: AchievementRef[],
  resolver: AchievementNameResolver,
): ResolvedAchievementRefs {
  const completed = new Set<string>();
  const skipped: AchievementRef[] = [];

  for (const [index, ref] of refs.entries()) {
    let gameval: string | undefined;
    const rawName = ref.gameval?.trim().toLowerCase();
    if (rawName) {
      if (isGamevalName(rawName) && resolver.hasName('achievement', rawName)) {
        gameval = rawName;
      }
    } else if (ref.achievement_id != null) {
      gameval = resolver.nameOf('achievement', ref.achievement_id);
    } else {
      throw new BadRequestException(
        `completed[${index}] needs an achievement_id or gameval`,
      );
    }

    if (!gameval) {
      skipped.push(ref);
      continue;
    }
    completed.add(gameval);
  }

  return { completed, skipped };
}

export type AchievementUpdatePlan = {
  /** Newly completed, so new rows and new feed entries. */
  add: string[];
  /** No longer complete; only ever produced by a full snapshot. */
  remove: string[];
};

/**
 * Diff stored completions against the incoming set.
 *
 * `full` marks the input as the member's complete list, so anything stored but
 * absent is treated as no longer complete. A partial update only adds.
 */
export type AchievementTally = {
  achievement_id?: number;
  gameval?: string;
  progress: number;
  target: number;
};

export type ResolvedTally = { gameval: string; progress: number; target: number };

/**
 * Tallies named the same way as completions, dropping any this server's dump
 * does not know and any that are finished or untouched — a finished one is a
 * completion, and a zero is just noise.
 */
export function resolveAchievementTallies(
  tallies: AchievementTally[],
  resolver: AchievementNameResolver,
): ResolvedTally[] {
  const out = new Map<string, ResolvedTally>();

  for (const tally of tallies) {
    let gameval: string | undefined;
    const rawName = tally.gameval?.trim().toLowerCase();
    if (rawName) {
      if (isGamevalName(rawName) && resolver.hasName('achievement', rawName)) {
        gameval = rawName;
      }
    } else if (tally.achievement_id != null) {
      gameval = resolver.nameOf('achievement', tally.achievement_id);
    }
    if (!gameval) continue;

    const target = Math.max(0, Math.round(tally.target));
    const progress = Math.max(0, Math.round(tally.progress));
    if (target <= 0 || progress <= 0 || progress >= target) continue;

    out.set(gameval, { gameval, progress, target });
  }

  return [...out.values()];
}

export function planAchievementUpdate(
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
  full: boolean,
): AchievementUpdatePlan {
  const plan: AchievementUpdatePlan = { add: [], remove: [] };

  for (const gameval of next) {
    if (!previous.has(gameval)) plan.add.push(gameval);
  }
  if (full) {
    for (const gameval of previous) {
      if (!next.has(gameval)) plan.remove.push(gameval);
    }
  }

  plan.add.sort();
  plan.remove.sort();
  return plan;
}
