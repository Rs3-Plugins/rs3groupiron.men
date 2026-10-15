import { detectSkillMilestones } from './achievements';

const flat = (level: number) =>
  ['attack','defence','strength','constitution','ranged','prayer','magic','cooking','woodcutting','fletching','fishing','firemaking','crafting','smithing','mining','herblore','agility','thieving','slayer','farming','runecrafting','hunter','construction','summoning','dungeoneering','divination','invention','archaeology','necromancy']
    .map((skillId) => ({ skillId, xp: 0, level, baseLevel: level }));

describe('total level milestones', () => {
  it('fires when the total crosses a threshold', () => {
    // 29 skills: 17 -> 493 total, 18 -> 522, crossing 500.
    const found = detectSkillMilestones('Tester', flat(17), flat(18));
    const totals = found.filter((m) => m.title.includes('total level'));
    expect(totals.map((m) => m.title)).toEqual(['500 total level']);
    expect(totals[0]!.skillId).toBeUndefined();
  });

  it('does not fire twice for the same threshold', () => {
    const found = detectSkillMilestones('Tester', flat(18), flat(19));
    expect(found.filter((m) => m.title.includes('total level'))).toEqual([]);
  });

  it('merges a partial update onto the stored snapshot', () => {
    // 29 x 17 = 493 stored; raising one skill by 7 reaches exactly 500.
    const before = flat(17);
    const next = [{ skillId: 'attack', xp: 0, level: 24, baseLevel: 24 }];
    const found = detectSkillMilestones('Tester', before, next);
    expect(found.filter((m) => m.title.includes('total level')).map((m) => m.title)).toEqual([
      '500 total level',
    ]);
  });
});
