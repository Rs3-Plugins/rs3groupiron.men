import { BadRequestException } from '@nestjs/common';
import { QuestState } from '@prisma/client';
import { isGamevalName } from '../gamevals/gamevals.catalog';

/** States a client may send. `not_started` clears the stored row. */
export const QUEST_STATE_INPUTS = [
  'not_started',
  'started',
  'finished',
] as const;
export type QuestStateInputName = (typeof QUEST_STATE_INPUTS)[number];

/** Upper bound on one update; RS3 has ~530 quests. */
export const MAX_QUEST_UPDATES = 1000;

/** One quest reference from the wire: id or gameval, plus the new state. */
export type QuestInput = {
  quest_id?: number;
  gameval?: string;
  state: string;
};

/** The two gameval lookups the resolver needs; satisfied by GamevalsService. */
export type QuestNameResolver = {
  nameOf(kind: 'quest', id: number): string | undefined;
  hasName(kind: 'quest', name: string): boolean;
};

/**
 * Normalise inputs to gameval -> state. `gameval` wins over `quest_id`; each
 * must exist in the quest gameval table. The last entry for a quest wins so
 * a client that appends events can send them in order.
 */
export function resolveQuestInputs(
  inputs: QuestInput[],
  resolver: QuestNameResolver,
): Map<string, QuestStateInputName> {
  const out = new Map<string, QuestStateInputName>();
  for (const [index, input] of inputs.entries()) {
    if (!(QUEST_STATE_INPUTS as readonly string[]).includes(input.state)) {
      throw new BadRequestException(`quests[${index}].state is invalid`);
    }

    let gameval: string | undefined;
    const rawName = input.gameval?.trim().toLowerCase();
    if (rawName) {
      if (!isGamevalName(rawName) || !resolver.hasName('quest', rawName)) {
        throw new BadRequestException(
          `quests[${index}].gameval is not a known quest`,
        );
      }
      gameval = rawName;
    } else if (input.quest_id != null) {
      gameval = resolver.nameOf('quest', input.quest_id);
      if (!gameval) {
        throw new BadRequestException(
          `quests[${index}].quest_id is not a known quest`,
        );
      }
    } else {
      throw new BadRequestException(
        `quests[${index}] needs a quest_id or gameval`,
      );
    }

    out.set(gameval, input.state as QuestStateInputName);
  }
  return out;
}

export type QuestUpdatePlan = {
  /** Rows to (re)write with the given state. */
  write: Array<{ gameval: string; state: QuestState }>;
  /** Rows to delete (back to not started, or absent from a full snapshot). */
  remove: string[];
  /** Quests that transitioned into finished with this update. */
  finished: string[];
};

/**
 * Diff the stored rows against the incoming states.
 *
 * `full` marks the input as the member's complete quest list: anything stored
 * but absent is treated as not started and removed. Otherwise the input is a
 * partial update and untouched quests keep their rows.
 */
export function planQuestUpdate(
  previous: ReadonlyMap<string, QuestState>,
  next: ReadonlyMap<string, QuestStateInputName>,
  full: boolean,
): QuestUpdatePlan {
  const plan: QuestUpdatePlan = { write: [], remove: [], finished: [] };

  for (const [gameval, state] of next) {
    const prev = previous.get(gameval);
    if (state === 'not_started') {
      if (prev) plan.remove.push(gameval);
      continue;
    }
    if (prev === state) continue;
    plan.write.push({ gameval, state });
    if (state === 'finished') plan.finished.push(gameval);
  }

  if (full) {
    for (const gameval of previous.keys()) {
      if (!next.has(gameval)) plan.remove.push(gameval);
    }
  }

  plan.finished.sort();
  return plan;
}
