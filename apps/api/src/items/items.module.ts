import { Global, Module } from '@nestjs/common';
import { RareItemsController } from './rare-items.controller';
import { RareItemsService } from './rare-items.service';

/** Global so GroupsService can check a reported drop without importing. */
@Global()
@Module({
  controllers: [RareItemsController],
  providers: [RareItemsService],
  exports: [RareItemsService],
})
export class ItemsModule {}
