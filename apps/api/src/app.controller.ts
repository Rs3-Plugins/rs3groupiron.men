import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return this.appService.getHello();
  }

  /** Liveness — always 200, see AppService.getHealth. */
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  /** Readiness — 503 when the database round trip fails. */
  @Get('health/ready')
  async getReady() {
    const body = await this.appService.getReady();
    if (!body.db.ok) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
