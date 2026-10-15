import { Controller, Get } from '@nestjs/common';
import { RareItemsService } from './rare-items.service';

@Controller('api/items')
export class RareItemsController {
  constructor(private readonly rare: RareItemsService) {}

  /**
   * The flat id list, fetched by plugins on login so they can filter locally.
   * Unauthenticated: it is a static catalogue, not group data.
   */
  @Get('rare')
  rareItems() {
    return {
      updated: this.rare.updatedAt,
      count: this.rare.count,
      ids: this.rare.list(),
    };
  }
}
