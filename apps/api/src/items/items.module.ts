import { Global, Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { ItemNamesController } from './item-names.controller';
import { ItemNamesService } from './item-names.service';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { RareItemsController } from './rare-items.controller';
import { RareItemsService } from './rare-items.service';

/** Global so GroupsService can check a reported drop without importing. */
@Global()
@Module({
  controllers: [
    RareItemsController,
    ItemNamesController,
    PricesController,
    CatalogueController,
    AssetsController,
  ],
  providers: [
    RareItemsService,
    ItemNamesService,
    PricesService,
    CatalogueService,
    AssetsService,
  ],
  exports: [
    RareItemsService,
    ItemNamesService,
    PricesService,
    CatalogueService,
  ],
})
export class ItemsModule {}
