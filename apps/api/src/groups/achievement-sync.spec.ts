import { BadRequestException } from '@nestjs/common';
import {
  achievementTitle,
  isFeedWorthyAchievement,
  planAchievementUpdate,
  resolveAchievementRefs,
} from './achievement-sync';

const resolver = {
  nameOf: (_kind: 'achievement', id: number) =>
    ({ 2: 'quest_cooks_assistant', 1: 'cheevo_all_quests' })[id],
  hasName: (_kind: 'achievement', name: string) =>
    ['quest_cooks_assistant', 'cheevo_all_quests'].includes(name),
};

describe('resolveAchievementRefs', () => {
  it('accepts ids or gamevals and lowercases names', () => {
    const out = resolveAchievementRefs(
      [{ achievement_id: 2 }, { gameval: 'Cheevo_All_Quests' }],
      resolver,
    );
    expect([...out.completed]).toEqual([
      'quest_cooks_assistant',
      'cheevo_all_quests',
    ]);
    expect(out.skipped).toEqual([]);
  });

  it('skips unknown references but keeps the known ones', () => {
    const out = resolveAchievementRefs(
      [{ achievement_id: 99999 }, { gameval: 'nope' }, { achievement_id: 2 }],
      resolver,
    );
    expect([...out.completed]).toEqual(['quest_cooks_assistant']);
    expect(out.skipped).toHaveLength(2);
  });

  it('deduplicates repeated references', () => {
    const out = resolveAchievementRefs(
      [{ achievement_id: 2 }, { gameval: 'quest_cooks_assistant' }],
      resolver,
    );
    expect(out.completed.size).toBe(1);
  });

  it('rejects a reference with neither id nor gameval', () => {
    expect(() => resolveAchievementRefs([{}], resolver)).toThrow(
      BadRequestException,
    );
  });
});

describe('planAchievementUpdate', () => {
  const stored = new Set(['a', 'b']);

  it('adds only what is newly complete', () => {
    const plan = planAchievementUpdate(stored, new Set(['a', 'b', 'c']), false);
    expect(plan).toEqual({ add: ['c'], remove: [] });
  });

  it('a partial update never removes', () => {
    const plan = planAchievementUpdate(stored, new Set(['a']), false);
    expect(plan).toEqual({ add: [], remove: [] });
  });

  it('a full snapshot removes what it omits', () => {
    const plan = planAchievementUpdate(stored, new Set(['a', 'c']), true);
    expect(plan).toEqual({ add: ['c'], remove: ['b'] });
  });

  it('an unchanged full snapshot is a no-op', () => {
    const plan = planAchievementUpdate(stored, new Set(['a', 'b']), true);
    expect(plan).toEqual({ add: [], remove: [] });
  });
});

describe('feed presentation', () => {
  it('keeps quest mirrors out of the feed, since the quest sync posts them', () => {
    expect(isFeedWorthyAchievement('quest_cooks_assistant')).toBe(false);
    expect(isFeedWorthyAchievement('cheevo_all_quests')).toBe(true);
    expect(isFeedWorthyAchievement('miniquest_barcrawl')).toBe(true);
  });

  it('titles drop the cheevo prefix', () => {
    expect(achievementTitle('cheevo_all_quests')).toBe('All quests');
    expect(achievementTitle('miniquest_barcrawl')).toBe('Miniquest barcrawl');
  });
});
