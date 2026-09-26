import { Injectable, OnModuleInit } from '@nestjs/common';
import { GroupsService } from './groups.service';

@Injectable()
export class GroupsSeedService implements OnModuleInit {
  constructor(private readonly groups: GroupsService) {}

  async onModuleInit() {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.SEED_DEMO !== '1'
    ) {
      return;
    }
    await this.groups.seedIfEmpty();
  }
}
