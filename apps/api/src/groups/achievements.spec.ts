import {
  ACHIEVEMENT_LIMIT_DEFAULT,
  ACHIEVEMENT_LIMIT_MAX,
  ACHIEVEMENT_LIMIT_MIN,
  XP_MILESTONE,
  buildSyntheticAchievements,
  cdnAllowedOrigins,
  detectSkillMilestones,
  parseAchievedAt,
  parseAchievementKind,
  parseAchievementLimit,
  parseAchievementMember,
  toAchievementEntry,
  validateImageUrl,
} from './achievements';
import { SKILL_BY_ID } from '../skills/skills.catalog';

type Snap = {
  skillId: string;
  xp: number | bigint;
  level: number;
  baseLevel?: number;
};

const skill = (skillId: string, baseLevel: number, xp = 0): Snap => ({
  skillId,
  xp,
  level: baseLevel,
  baseLevel,
});

describe('detectSkillMilestones', () => {
  it('treats a first-ever snapshot as the baseline and records nothing', () => {
    // A maxed account's very first sync would otherwise emit dozens of rows.
    const maxed = [
      skill('slayer', 120, XP_MILESTONE),
      skill('agility', 99, XP_MILESTONE),
      skill('mining', 110, XP_MILESTONE),
    ];
    expect(detectSkillMilestones('IronMayo', [], maxed)).toEqual([]);
    expect(detectSkillMilestones('IronMayo', undefined, maxed)).toEqual([]);
    expect(detectSkillMilestones('IronMayo', null, maxed)).toEqual([]);
  });

  it('records nothing when no milestone is crossed', () => {
    expect(
      detectSkillMilestones(
        'IronMayo',
        [skill('slayer', 80)],
        [skill('slayer', 92)],
      ),
    ).toEqual([]);
  });

  it('records a single crossing with the expected shape', () => {
    expect(
      detectSkillMilestones(
        'IronMayo',
        [skill('slayer', 98)],
        [skill('slayer', 99)],
      ),
    ).toEqual([
      {
        memberName: 'IronMayo',
        kind: 'level',
        title: '99 Slayer',
        detail: 'Reached level 99',
        skillId: 'slayer',
        dedupeKey: 'level:IronMayo:slayer:99',
      },
    ]);
  });

  it('records every milestone crossed at once', () => {
    const out = detectSkillMilestones(
      'IronMayo',
      [skill('slayer', 80)],
      [skill('slayer', 120)],
    );
    expect(out.map((m) => m.title)).toEqual([
      '99 Slayer',
      '110 Slayer',
      '120 Slayer',
    ]);
    expect(out.map((m) => m.dedupeKey)).toEqual([
      'level:IronMayo:slayer:99',
      'level:IronMayo:slayer:110',
      'level:IronMayo:slayer:120',
    ]);
  });

  it('records nothing for already-past milestones', () => {
    expect(
      detectSkillMilestones(
        'IronMayo',
        [skill('slayer', 120, XP_MILESTONE)],
        [skill('slayer', 120, XP_MILESTONE)],
      ),
    ).toEqual([]);
  });

  it('offers 99, 110 and 120 for every skill', () => {
    // Every skill now runs to the virtual cap of 120, so all three milestones
    // are reachable regardless of the skill's in-game cap.
    for (const id of ['agility', 'mining', 'necromancy'] as const) {
      expect(SKILL_BY_ID[id].maxLevel).toBe(120);
    }

    expect(
      detectSkillMilestones(
        'A',
        [skill('agility', 1)],
        [skill('agility', 120)],
      ).map((m) => m.title),
    ).toEqual(['99 Agility', '110 Agility', '120 Agility']);

    // Stopping partway only records what was actually crossed.
    expect(
      detectSkillMilestones(
        'A',
        [skill('mining', 1)],
        [skill('mining', 110)],
      ).map((m) => m.title),
    ).toEqual(['99 Mining', '110 Mining']);
  });

  it('records the 200m xp milestone once it is first crossed', () => {
    const out = detectSkillMilestones(
      'IronMayo',
      [skill('slayer', 120, XP_MILESTONE - 1)],
      [skill('slayer', 120, XP_MILESTONE)],
    );
    expect(out).toEqual([
      {
        memberName: 'IronMayo',
        kind: 'level',
        title: '200M Slayer XP',
        detail: 'Reached 200,000,000 XP',
        skillId: 'slayer',
        dedupeKey: 'xp200m:IronMayo:slayer',
      },
    ]);
    // Not re-recorded on the next sync.
    expect(
      detectSkillMilestones(
        'IronMayo',
        [skill('slayer', 120, XP_MILESTONE)],
        [skill('slayer', 120, XP_MILESTONE)],
      ),
    ).toEqual([]);
  });

  it('emits both the level and the 200m milestone together', () => {
    const out = detectSkillMilestones(
      'IronMayo',
      [skill('slayer', 119, XP_MILESTONE - 10)],
      [skill('slayer', 120, XP_MILESTONE)],
    );
    expect(out.map((m) => m.title)).toEqual(['120 Slayer', '200M Slayer XP']);
  });

  it('accepts bigint xp straight from Prisma', () => {
    const out = detectSkillMilestones(
      'IronMayo',
      [{ skillId: 'slayer', xp: BigInt(1), level: 98, baseLevel: 98 }],
      [
        {
          skillId: 'slayer',
          xp: BigInt(XP_MILESTONE),
          level: 99,
          baseLevel: 99,
        },
      ],
    );
    expect(out.map((m) => m.title)).toEqual(['99 Slayer', '200M Slayer XP']);
  });

  it('uses the unboosted base level, not the boosted one', () => {
    // A 98 base boosted to 104 is not a 99.
    expect(
      detectSkillMilestones(
        'A',
        [skill('slayer', 90)],
        [{ skillId: 'slayer', xp: 0, level: 104, baseLevel: 98 }],
      ),
    ).toEqual([]);
  });

  it('treats a skill missing from a non-empty snapshot as level 1', () => {
    const out = detectSkillMilestones(
      'A',
      [skill('mining', 50)],
      [skill('mining', 50), skill('slayer', 99)],
    );
    expect(out.map((m) => m.title)).toEqual(['99 Slayer']);
  });

  it('ignores unknown skill ids and empty incoming snapshots', () => {
    expect(
      detectSkillMilestones('A', [skill('mining', 1)], [skill('banana', 120)]),
    ).toEqual([]);
    expect(detectSkillMilestones('A', [skill('mining', 1)], [])).toEqual([]);
  });

  it('scopes dedupe keys per member', () => {
    const [a] = detectSkillMilestones(
      'A',
      [skill('slayer', 98)],
      [skill('slayer', 99)],
    );
    const [b] = detectSkillMilestones(
      'B',
      [skill('slayer', 98)],
      [skill('slayer', 99)],
    );
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
  });
});

describe('parseAchievementLimit', () => {
  it('defaults when missing or unparseable', () => {
    expect(parseAchievementLimit(undefined)).toBe(ACHIEVEMENT_LIMIT_DEFAULT);
    expect(parseAchievementLimit('')).toBe(ACHIEVEMENT_LIMIT_DEFAULT);
    expect(parseAchievementLimit('banana')).toBe(ACHIEVEMENT_LIMIT_DEFAULT);
    expect(parseAchievementLimit('NaN')).toBe(ACHIEVEMENT_LIMIT_DEFAULT);
  });

  it('clamps out-of-range values', () => {
    expect(parseAchievementLimit('0')).toBe(ACHIEVEMENT_LIMIT_MIN);
    expect(parseAchievementLimit('-5')).toBe(ACHIEVEMENT_LIMIT_MIN);
    expect(parseAchievementLimit('9999')).toBe(ACHIEVEMENT_LIMIT_MAX);
    expect(parseAchievementLimit('1e12')).toBe(ACHIEVEMENT_LIMIT_MAX);
  });

  it('accepts in-range values and truncates fractions', () => {
    expect(parseAchievementLimit('1')).toBe(1);
    expect(parseAchievementLimit('50')).toBe(50);
    expect(parseAchievementLimit('100')).toBe(100);
    expect(parseAchievementLimit('12.9')).toBe(12);
  });
});

describe('parseAchievementKind', () => {
  it('accepts every enum member', () => {
    for (const kind of ['level', 'drop', 'quest', 'diary', 'other']) {
      expect(parseAchievementKind(kind)).toBe(kind);
    }
  });

  it('ignores missing or invalid kinds', () => {
    expect(parseAchievementKind(undefined)).toBeUndefined();
    expect(parseAchievementKind('')).toBeUndefined();
    expect(parseAchievementKind('Level')).toBeUndefined();
    expect(parseAchievementKind('banana')).toBeUndefined();
  });
});

describe('parseAchievementMember', () => {
  it('trims exact names and ignores blanks/oversized values', () => {
    expect(parseAchievementMember('  IronMayo ')).toBe('IronMayo');
    expect(parseAchievementMember(undefined)).toBeUndefined();
    expect(parseAchievementMember('   ')).toBeUndefined();
    expect(parseAchievementMember('x'.repeat(51))).toBeUndefined();
  });
});

describe('cdnAllowedOrigins', () => {
  it('is empty when unset or unparseable', () => {
    expect(cdnAllowedOrigins(undefined)).toEqual([]);
    expect(cdnAllowedOrigins('')).toEqual([]);
    expect(cdnAllowedOrigins('not a url')).toEqual([]);
    expect(cdnAllowedOrigins('ftp://cdn.example.com')).toEqual([]);
  });

  it('normalises to origins and de-duplicates', () => {
    expect(cdnAllowedOrigins('https://cdn.rs3groupiron.men/images/')).toEqual([
      'https://cdn.rs3groupiron.men',
    ]);
    expect(
      cdnAllowedOrigins('https://a.example.com, https://b.example.com'),
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(
      cdnAllowedOrigins('https://a.example.com,https://a.example.com/x'),
    ).toEqual(['https://a.example.com']);
  });
});

describe('validateImageUrl', () => {
  const cdn = 'https://cdn.rs3groupiron.men';

  it('returns null for an absent value', () => {
    expect(validateImageUrl(undefined, cdn)).toBeNull();
    expect(validateImageUrl(null, cdn)).toBeNull();
    expect(validateImageUrl('   ', cdn)).toBeNull();
  });

  it('accepts a URL on the allow-listed origin', () => {
    expect(validateImageUrl(`${cdn}/shots/a.png`, cdn)).toBe(
      `${cdn}/shots/a.png`,
    );
  });

  it('rejects every image_url when no CDN is configured', () => {
    expect(() => validateImageUrl(`${cdn}/a.png`, undefined)).toThrow(
      /no CDN_BASE_URL/,
    );
    expect(() => validateImageUrl(`${cdn}/a.png`, '')).toThrow(
      /no CDN_BASE_URL/,
    );
  });

  it('rejects other origins, near-misses and non-absolute URLs', () => {
    expect(() =>
      validateImageUrl('https://evil.example.com/a.png', cdn),
    ).toThrow(/must be hosted on/);
    // Subdomain prefix attack — origin must match exactly.
    expect(() =>
      validateImageUrl('https://cdn.rs3groupiron.men.evil.com/a.png', cdn),
    ).toThrow(/must be hosted on/);
    // Scheme is part of the origin.
    expect(() =>
      validateImageUrl('http://cdn.rs3groupiron.men/a.png', cdn),
    ).toThrow(/must be hosted on/);
    expect(() => validateImageUrl('/relative/a.png', cdn)).toThrow(
      /absolute URL/,
    );
    expect(() => validateImageUrl('javascript:alert(1)', cdn)).toThrow(
      /must be hosted on/,
    );
  });
});

describe('parseAchievedAt', () => {
  const now = new Date('2026-09-18T04:00:00.000Z');

  it('defaults to now when missing or unparseable', () => {
    expect(parseAchievedAt(undefined, now)).toBe(now);
    expect(parseAchievedAt('', now)).toBe(now);
    expect(parseAchievedAt('not-a-date', now)).toBe(now);
  });

  it('accepts a past ISO timestamp', () => {
    expect(parseAchievedAt('2026-09-01T00:00:00.000Z', now).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('tolerates small clock skew but rejects far-future dates', () => {
    expect(parseAchievedAt('2026-09-18T05:00:00.000Z', now).toISOString()).toBe(
      '2026-09-18T05:00:00.000Z',
    );
    expect(() => parseAchievedAt('2030-01-01T00:00:00.000Z', now)).toThrow(
      /too far in the future/,
    );
  });
});

describe('toAchievementEntry', () => {
  it('nulls absent values rather than omitting them', () => {
    expect(
      toAchievementEntry({
        id: 'clx1',
        memberName: 'IronMayo',
        kind: 'level',
        title: '99 Slayer',
        detail: 'Reached level 99',
        skillId: 'slayer',
        itemId: null,
        imageUrl: null,
        achievedAt: new Date('2026-09-18T04:00:00.000Z'),
      }),
    ).toEqual({
      id: 'clx1',
      name: 'IronMayo',
      kind: 'level',
      title: '99 Slayer',
      detail: 'Reached level 99',
      skill_id: 'slayer',
      item_id: null,
      gameval: null,
      image_url: null,
      at: '2026-09-18T04:00:00.000Z',
    });
  });
});

describe('buildSyntheticAchievements', () => {
  const endAt = new Date('2026-09-18T00:00:00.000Z');

  it('returns nothing without members', () => {
    expect(buildSyntheticAchievements('g', 'G', [], [995], endAt)).toEqual([]);
  });

  it('generates 25-35 plausible entries within the last ~60 days', () => {
    const rows = buildSyntheticAchievements(
      'gid',
      'Demo Group',
      ['IronMayo', 'Brewer'],
      [995, 4151, 565],
      endAt,
    );
    expect(rows.length).toBeGreaterThanOrEqual(25);
    expect(rows.length).toBeLessThanOrEqual(35);

    const windowMs = 60 * 24 * 60 * 60 * 1000;
    for (const row of rows) {
      expect(['IronMayo', 'Brewer']).toContain(row.memberName);
      expect(row.groupId).toBe('gid');
      expect(row.title).toBeTruthy();
      // Some seeded rows carry a sample screenshot so the demo shows the
      // image feature; when present it must be a local demo asset, never an
      // arbitrary URL.
      if (row.imageUrl !== null) {
        expect(row.imageUrl).toMatch(/^\/demo-shots\/[a-z]+\.png$/);
      }
      // Seeded rows never carry a dedupe key.
      expect(row.dedupeKey).toBeNull();
      if (row.kind === 'level') expect(row.skillId).toBeTruthy();
      if (row.kind === 'drop') expect([995, 4151, 565]).toContain(row.itemId);
      const at = (row.achievedAt as Date).getTime();
      expect(at).toBeLessThanOrEqual(endAt.getTime());
      expect(at).toBeGreaterThanOrEqual(endAt.getTime() - windowMs);
    }

    // A mix of kinds, not one repeated kind.
    expect(new Set(rows.map((r) => r.kind)).size).toBeGreaterThan(1);

    // Enough screenshots to demonstrate the feature, but not on every row.
    const withImage = rows.filter((r) => r.imageUrl !== null);
    expect(withImage.length).toBeGreaterThan(0);
    expect(withImage.length).toBeLessThan(rows.length);
  });

  it('emits no drops when the group owns no items', () => {
    const rows = buildSyntheticAchievements('g', 'Demo', ['A'], [], endAt);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.kind === 'drop')).toBe(false);
  });

  it('is deterministic for the same group', () => {
    expect(
      buildSyntheticAchievements('g', 'Demo', ['A', 'B'], [995], endAt),
    ).toEqual(
      buildSyntheticAchievements('g', 'Demo', ['A', 'B'], [995], endAt),
    );
  });
});
