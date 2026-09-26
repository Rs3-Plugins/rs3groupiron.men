import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let queryRaw: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn().mockResolvedValue([{ '1': 1 }]);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return api info', () => {
      expect(appController.getHello()).toEqual({
        message: 'RS3 Group Ironman API',
        status: 'ok',
      });
    });
  });

  describe('health', () => {
    it('reports the database round trip', async () => {
      const body = await appController.getHealth();

      expect(queryRaw).toHaveBeenCalled();
      expect(body.status).toBe('healthy');
      expect(body.db.ok).toBe(true);
      expect(typeof body.db.latencyMs).toBe('number');
    });

    // A host that restarts on failed healthchecks points here, so a database
    // blip must not restart the container.
    it('stays 200 when the database is unreachable', async () => {
      queryRaw.mockRejectedValue(new Error('connection refused'));

      const body = await appController.getHealth();

      expect(body.status).toBe('healthy');
      expect(body.db).toMatchObject({ ok: false, error: 'connection refused' });
    });
  });

  describe('health/ready', () => {
    it('returns ready when the database answers', async () => {
      await expect(appController.getReady()).resolves.toMatchObject({
        status: 'ready',
        db: { ok: true },
      });
    });

    it('throws 503 when the database is unreachable', async () => {
      queryRaw.mockRejectedValue(new Error('connection refused'));

      await expect(appController.getReady()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
