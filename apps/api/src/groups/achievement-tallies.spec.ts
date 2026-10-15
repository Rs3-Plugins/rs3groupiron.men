import { resolveAchievementTallies } from './achievement-sync';

const resolver = {
  nameOf: (_kind: 'achievement', id: number) =>
    id === 1 ? 'cheevo_one' : id === 2 ? 'cheevo_two' : undefined,
  hasName: (_kind: 'achievement', name: string) =>
    name === 'cheevo_one' || name === 'cheevo_two',
};

describe('achievement tallies', () => {
  it('keeps one that is part way there', () => {
    expect(
      resolveAchievementTallies([{ achievement_id: 1, progress: 37, target: 50 }], resolver),
    ).toEqual([{ gameval: 'cheevo_one', progress: 37, target: 50 }]);
  });

  it('drops a finished one, which is a completion instead', () => {
    expect(
      resolveAchievementTallies([{ achievement_id: 1, progress: 50, target: 50 }], resolver),
    ).toEqual([]);
  });

  it('drops an untouched one rather than storing a row of zeroes', () => {
    expect(
      resolveAchievementTallies([{ achievement_id: 1, progress: 0, target: 50 }], resolver),
    ).toEqual([]);
  });

  it('drops one with no target to measure against', () => {
    expect(
      resolveAchievementTallies([{ achievement_id: 1, progress: 3, target: 0 }], resolver),
    ).toEqual([]);
  });

  it('skips an achievement this dump does not know', () => {
    expect(
      resolveAchievementTallies([{ achievement_id: 999, progress: 3, target: 9 }], resolver),
    ).toEqual([]);
  });

  it('accepts a gameval as well as an id', () => {
    expect(
      resolveAchievementTallies([{ gameval: 'cheevo_two', progress: 1, target: 9 }], resolver),
    ).toEqual([{ gameval: 'cheevo_two', progress: 1, target: 9 }]);
  });

  it('lets the last entry for an achievement win', () => {
    expect(
      resolveAchievementTallies(
        [
          { achievement_id: 1, progress: 10, target: 50 },
          { achievement_id: 1, progress: 11, target: 50 },
        ],
        resolver,
      ),
    ).toEqual([{ gameval: 'cheevo_one', progress: 11, target: 50 }]);
  });
});
