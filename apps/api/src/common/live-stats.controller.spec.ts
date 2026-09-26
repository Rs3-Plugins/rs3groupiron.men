import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

type LiveStatsBody = {
  viewers: number;
  groupsWatched: number;
  playersOnline: number;
  groupsTotal: number;
  membersTotal: number;
  uptimeSeconds: number;
  at: string;
};

/**
 * Boots the real app so the ThrottlerGuard on this controller is resolved the
 * way a request resolves it. A guard that cannot be constructed is invisible to
 * tsc and to a module-compile test — it only fails on the first live request.
 */
describe('GET /api/stats/live', () => {
  let app: INestApplication<App>;
  let memberCount: jest.Mock;
  let groupCount: jest.Mock;

  beforeEach(async () => {
    memberCount = jest.fn().mockResolvedValue(3);
    groupCount = jest.fn().mockResolvedValue(1);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
        member: { count: memberCount },
        group: { count: groupCount },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['/', 'health', 'health/ready'] });
    await app.init();
    // init() runs the seed service's boot check, which counts groups itself.
    memberCount.mockClear();
    groupCount.mockClear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers with the activity counts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/stats/live')
      .expect(200);
    const body = res.body as LiveStatsBody;

    expect(body).toMatchObject({
      viewers: 0,
      groupsWatched: 0,
      playersOnline: 3,
      groupsTotal: 1,
      membersTotal: 3,
    });
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  // The endpoint is unauthenticated and the counts are unindexed aggregates, so
  // a request loop must not become a database load amplifier.
  it('serves repeat requests from cache instead of re-counting', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get('/api/stats/live').expect(200);
    }

    expect(groupCount).toHaveBeenCalledTimes(1);
    // One for the online window, one for the total.
    expect(memberCount).toHaveBeenCalledTimes(2);
  });

  it('never exposes names, group names or addresses', async () => {
    const res = await request(app.getHttpServer()).get('/api/stats/live');

    expect(Object.keys(res.body as LiveStatsBody).sort()).toEqual([
      'at',
      'groupsTotal',
      'groupsWatched',
      'membersTotal',
      'playersOnline',
      'uptimeSeconds',
      'viewers',
    ]);
  });
});
