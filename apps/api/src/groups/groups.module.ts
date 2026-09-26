import { Module } from '@nestjs/common';
import {
  GroupsAuthedController,
  GroupsPublicController,
} from './groups.controller';
import { GroupsSeedService } from './groups-seed.service';
import { GroupsService } from './groups.service';
import { XpHistoryService } from './xp-history.service';

@Module({
  controllers: [GroupsPublicController, GroupsAuthedController],
  providers: [GroupsService, GroupsSeedService, XpHistoryService],
  exports: [GroupsService],
})
export class GroupsModule {}
