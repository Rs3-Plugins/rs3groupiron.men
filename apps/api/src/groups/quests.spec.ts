import { BadRequestException } from '@nestjs/common';
import { QuestState } from '@prisma/client';
import { humanizeGameval, parseQuestCatalog } from '../gamevals/quest-catalog';
import { planQuestUpdate, resolveQuestInputs } from './quests';

const resolver = {
  nameOf: (_kind: 'quest', id: number) =>
    ({ 257: 'cooks_assistant', 0: 'cabinfever' })[id],
  hasName: (_kind: 'quest', name: string) =>
    ['cooks_assistant', 'cabinfever'].includes(name),
};

describe('resolveQuestInputs', () => {
  it('accepts ids or gamevals and lowercases names', () => {
    const out = resolveQuestInputs(
      [
        { quest_id: 257, state: 'finished' },
        { gameval: 'CabinFever', state: 'started' },
      ],
      resolver,
    );
    expect([...out.states]).toEqual([
      ['cooks_assistant', 'finished'],
      ['cabinfever', 'started'],
    ]);
    expect(out.skipped).toEqual([]);
  });

  it('lets gameval win over quest_id and the last entry win per quest', () => {
    const out = resolveQuestInputs(
      [
        { quest_id: 0, gameval: 'cooks_assistant', state: 'started' },
        { gameval: 'cooks_assistant', state: 'finished' },
      ],
      resolver,
    );
    expect(out.states.get('cooks_assistant')).toBe('finished');
    expect(out.states.has('cabinfever')).toBe(false);
  });

  // A quest newer than the server's dump must not block the rest of the sync.
  it('skips unknown ids and names but keeps the known ones', () => {
    const out = resolveQuestInputs(
      [
        { quest_id: 9999, state: 'finished' },
        { gameval: 'nope', state: 'finished' },
        { quest_id: 257, state: 'finished' },
      ],
      resolver,
    );
    expect([...out.states]).toEqual([['cooks_assistant', 'finished']]);
    expect(out.skipped).toEqual([
      { quest_id: 9999, gameval: undefined },
      { quest_id: undefined, gameval: 'nope' },
    ]);
  });

  it('rejects bad states and empty refs', () => {
    expect(() =>
      resolveQuestInputs([{ quest_id: 257, state: 'done' }], resolver),
    ).toThrow(BadRequestException);
    expect(() => resolveQuestInputs([{ state: 'finished' }], resolver)).toThrow(
      BadRequestException,
    );
  });
});

describe('planQuestUpdate', () => {
  const stored = new Map<string, QuestState>([
    ['cooks_assistant', QuestState.started],
    ['cabinfever', QuestState.finished],
  ]);

  it('writes only changed rows and reports new completions', () => {
    const plan = planQuestUpdate(
      stored,
      new Map([
        ['cooks_assistant', 'finished'],
        ['cabinfever', 'finished'],
        ['tower_of_life', 'started'],
      ] as const),
      false,
    );
    expect(plan.write).toEqual([
      { gameval: 'cooks_assistant', state: 'finished' },
      { gameval: 'tower_of_life', state: 'started' },
    ]);
    expect(plan.finished).toEqual(['cooks_assistant']);
    expect(plan.remove).toEqual([]);
  });

  it('removes rows reset to not_started and ignores unknown not_started', () => {
    const plan = planQuestUpdate(
      stored,
      new Map([
        ['cabinfever', 'not_started'],
        ['tower_of_life', 'not_started'],
      ] as const),
      false,
    );
    expect(plan.remove).toEqual(['cabinfever']);
    expect(plan.write).toEqual([]);
  });

  it('treats a full snapshot as authoritative', () => {
    const plan = planQuestUpdate(
      stored,
      new Map([['cabinfever', 'finished']] as const),
      true,
    );
    expect(plan.remove).toEqual(['cooks_assistant']);
    expect(plan.write).toEqual([]);
    expect(plan.finished).toEqual([]);
  });

  it('does not re-report a quest that was already finished', () => {
    const plan = planQuestUpdate(
      stored,
      new Map([['cabinfever', 'finished']] as const),
      false,
    );
    expect(plan.finished).toEqual([]);
  });
});

describe('quest catalog', () => {
  it('indexes by gameval and drops nameless entries', () => {
    const catalog = parseQuestCatalog([
      {
        id: 257,
        quest_gameval: 'cooks_assistant',
        name: "Cook's Assistant",
        questPoints: 1,
      },
      { id: 1, quest_gameval: 'hw17_quest', name: '', questPoints: 0 },
      { id: 2, quest_gameval: null, name: 'Ghost', questPoints: 0 },
    ]);
    expect(catalog.size).toBe(1);
    expect(catalog.get('cooks_assistant')).toEqual({
      gameval: 'cooks_assistant',
      name: "Cook's Assistant",
      questPoints: 1,
    });
  });

  it('rejects a non-array dump', () => {
    expect(() => parseQuestCatalog({})).toThrow(/array/);
  });

  it('humanises a gameval as a fallback title', () => {
    expect(humanizeGameval('cooks_assistant')).toBe('Cooks assistant');
  });
});
