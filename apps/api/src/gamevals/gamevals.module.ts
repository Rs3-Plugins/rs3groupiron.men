import { Global, Module } from '@nestjs/common';
import { GamevalsService } from './gamevals.service';
import { QuestCatalogService } from './quest-catalog.service';

/**
 * Server-side only: no routes. Global so GroupsService can resolve
 * quest/achievement names without importing. The web reads the JSON dumps
 * directly if it ever needs names.
 */
@Global()
@Module({
  providers: [GamevalsService, QuestCatalogService],
  exports: [GamevalsService, QuestCatalogService],
})
export class GamevalsModule {}
