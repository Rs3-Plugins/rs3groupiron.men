import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { GroupAccessService } from './groups/group-access.service';
import { GroupEventsService } from './groups/group-events.service';
import { GroupsSeedService } from './groups/groups-seed.service';
import { GroupsService } from './groups/groups.service';
import { PrismaService } from './prisma/prisma.service';
import { R2Service } from './uploads/r2.service';

/**
 * Compiles the real provider graph.
 *
 * A missing provider or a module that forgets to export one is invisible to
 * both tsc and the unit tests — it only surfaces as a crash on boot. This is
 * the cheapest place to catch that.
 */
describe('AppModule', () => {
  async function compile() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Nothing here should touch a database.
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn(), group: { count: jest.fn() } })
      .compile();
    // init() would run OnModuleInit hooks, including the demo seed.
    return moduleRef;
  }

  it('resolves every provider', async () => {
    const moduleRef = await compile();

    expect(moduleRef.get(GroupsService)).toBeInstanceOf(GroupsService);
    expect(moduleRef.get(GroupAccessService)).toBeInstanceOf(
      GroupAccessService,
    );
    expect(moduleRef.get(GroupEventsService)).toBeInstanceOf(
      GroupEventsService,
    );
    expect(moduleRef.get(GroupsSeedService)).toBeInstanceOf(GroupsSeedService);
    expect(moduleRef.get(R2Service)).toBeInstanceOf(R2Service);

    await moduleRef.close();
  });

  // UploadsModule only imports GroupsModule for a permission check, so the
  // access service has to be exported for it to resolve at all.
  it('lets the uploads controller reach the access service', async () => {
    const moduleRef = await compile();

    expect(moduleRef.get(GroupAccessService, { strict: false })).toBeDefined();

    await moduleRef.close();
  });
});
