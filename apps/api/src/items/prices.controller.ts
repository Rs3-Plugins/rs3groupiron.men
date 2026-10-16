import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PricesService } from './prices.service';

// main.ts sets a global 'api' prefix, so this must not repeat it.
@Controller('items')
export class PricesController {
  constructor(private readonly prices: PricesService) {}

  /**
   * Grand Exchange prices for every traded item.
   *
   * The lifetime is whatever is left of the current refresh cycle rather than
   * a fixed figure, so a client revalidates once per refresh instead of
   * repeatedly collecting the same ETag. `stale-while-revalidate` lets it keep
   * showing the old prices while it picks up the new ones.
   */
  @Get('prices')
  gePrices(@Req() request: Request, @Res() response: Response) {
    const { body, etag } = this.prices.payload;
    const fresh = this.prices.freshSeconds;
    response.set(
      'Cache-Control',
      `public, max-age=${fresh}, stale-while-revalidate=43200`,
    );
    if (request.headers['if-none-match'] === etag) {
      response.status(304).set('ETag', etag).end();
      return;
    }
    response.status(200).set('ETag', etag).type('application/json').send(body);
  }
}
