import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AppearanceTheme, GroupMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupsService } from './groups.service';
import { XpHistoryService } from './xp-history.service';
import { GamevalsService } from '../gamevals/gamevals.service';
import { QuestCatalogService } from '../gamevals/quest-catalog.service';

const DEMO_TOKEN = 'demo-token-value';
const REAL_TOKEN = 'real-token-value';

function groupRow(name: string, token: string) {
  return {
    id: `id-${name}`,
    name,
    nameKey: name.toLowerCase(),
    token,
    mode: GroupMode.normal,
    appearance: AppearanceTheme.rs3,
    memberSlots: 5,
    members: [{ id: 'm1', name: 'IronJackery' }],
  };
}

const GROUPS: Record<string, ReturnType<typeof groupRow>> = {
  'demo group': groupRow('Demo Group', DEMO_TOKEN),
  'real group': groupRow('Real Group', REAL_TOKEN),
};

function makeService() {
  const prisma = {
    group: {
      findUnique: jest.fn(({ where }: { where: { nameKey: string } }) =>
        Promise.resolve(GROUPS[where.nameKey] ?? null),
      ),
    },
  } as unknown as PrismaService;
  return new GroupsService(
    prisma,
    {} as XpHistoryService,
    new GamevalsService(),
    new QuestCatalogService(),
  );
}

describe('GroupsService auth boundaries', () => {
  const originalEnv = process.env.DEMO_WRITABLE;
  let groups: GroupsService;

  beforeEach(() => {
    delete process.env.DEMO_WRITABLE;
    groups = makeService();
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.DEMO_WRITABLE;
    else process.env.DEMO_WRITABLE = originalEnv;
  });

  describe('authenticateRead', () => {
    it('serves the demo group with no token', async () => {
      const group = await groups.authenticateRead('Demo Group', undefined);
      expect(group.name).toBe('Demo Group');
    });

    it('is case-insensitive about the demo group name', async () => {
      const group = await groups.authenticateRead('demo group', undefined);
      expect(group.name).toBe('Demo Group');
    });

    it('rejects any other group without a token', async () => {
      await expect(
        groups.authenticateRead('Real Group', undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('uses the same message for an unknown group as for a bad token', async () => {
      const unknown = await groups
        .authenticateRead('Nope', undefined)
        .catch((e: Error) => e.message);
      const badToken = await groups
        .authenticateRead('Real Group', 'wrong')
        .catch((e: Error) => e.message);
      expect(unknown).toBe(badToken);
    });

    it('still accepts a valid token', async () => {
      const group = await groups.authenticateRead('Real Group', REAL_TOKEN);
      expect(group.name).toBe('Real Group');
    });
  });

  describe('authenticateWrite', () => {
    it('rejects the demo group even with its real token', async () => {
      await expect(
        groups.authenticateWrite('Demo Group', DEMO_TOKEN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects the demo group with no token', async () => {
      await expect(
        groups.authenticateWrite('Demo Group', undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('allows demo writes when DEMO_WRITABLE=1', async () => {
      process.env.DEMO_WRITABLE = '1';
      const group = await groups.authenticateWrite('Demo Group', DEMO_TOKEN);
      expect(group.name).toBe('Demo Group');
    });

    it('allows a normal group with its token', async () => {
      const group = await groups.authenticateWrite('Real Group', REAL_TOKEN);
      expect(group.name).toBe('Real Group');
    });

    it('rejects a wrong token of the same length', async () => {
      await expect(
        groups.authenticateWrite('Real Group', 'reol-token-value'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('amILoggedIn', () => {
    it('does not echo a token back on a tokenless demo read', async () => {
      const info = await groups.amILoggedIn('Demo Group', undefined);
      expect(info).not.toHaveProperty('token');
      expect(info.name).toBe('Demo Group');
    });

    it('echoes the token back to an authenticated caller', async () => {
      const info = await groups.amILoggedIn('Real Group', REAL_TOKEN);
      expect(info).toHaveProperty('token', REAL_TOKEN);
    });
  });
});
