import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AddMemberBody,
  CreateAchievementBody,
  CreateGroupBody,
  MemberNameBody,
  RenameMemberBody,
  UpdateGroupSettingsBody,
  UpdateMemberBody,
  UpdateMemberProfileBody,
  UpdateMemberQuestsBody,
  PlayerMovedBody,
  SetMemberOnlineBody,
} from './group.types';
import { GroupsService } from './groups.service';

/**
 * Unauthenticated routes only — rate limited. The authed
 * group/:groupName controller below is intentionally NOT throttled.
 */
@Controller()
@UseGuards(ThrottlerGuard)
export class GroupsPublicController {
  constructor(private readonly groups: GroupsService) {}

  @Post('create-group')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  createGroup(@Body() body: CreateGroupBody) {
    return this.groups.createGroup(body);
  }

  /**
   * Dev helper — wipe the DB and reload fake data from seed.json.
   * Opt-in only: requires ALLOW_DEV_RESET=1, so a deploy that forgets to set
   * NODE_ENV is still safe.
   */
  @Post('reset-fake-data')
  resetFakeData() {
    if (process.env.ALLOW_DEV_RESET !== '1') {
      throw new NotFoundException();
    }
    return this.groups.resetFromSeed();
  }
}

/**
 * Group-scoped routes. Reads accept the seeded demo group with no
 * Authorization header; everything else needs the group token.
 * Bodies are validated by the global ValidationPipe, so handlers can rely on
 * them being present and well-formed.
 */
@Controller('group/:groupName')
export class GroupsAuthedController {
  constructor(private readonly groups: GroupsService) {}

  @Get('am-i-logged-in')
  amILoggedIn(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.groups.amILoggedIn(groupName, authorization);
  }

  @Get('get-group-data')
  getGroupData(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('from_time') fromTime?: string,
  ) {
    return this.groups.getGroupData(groupName, authorization, fromTime);
  }

  @Get('xp-history')
  getXpHistory(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('period') period?: string,
    @Query('skill') skill?: string,
  ) {
    return this.groups.getXpHistory(groupName, authorization, period, skill);
  }

  /**
   * Shared ("group") bank movement log, newest first.
   * `from`/`to` are ISO instants bounding a calendar day in the viewer's
   * timezone; `before` pages backwards within that range.
   */
  @Get('bank-ledger')
  getBankLedger(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.groups.getBankLedger(
      groupName,
      authorization,
      limit,
      before,
      from,
      to,
    );
  }

  /**
   * Group achievement feed, newest first. `before` pages backwards;
   * `kind`/`member` narrow it. Invalid filters are ignored, not rejected.
   */
  @Get('achievements')
  getAchievements(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('kind') kind?: string,
    @Query('member') member?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.groups.getAchievements(
      groupName,
      authorization,
      limit,
      before,
      kind,
      member,
      from,
      to,
    );
  }

  @Post('achievements')
  @HttpCode(201)
  createAchievement(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateAchievementBody,
  ) {
    return this.groups.createAchievement(groupName, authorization, body);
  }

  /**
   * Quest progress per member, keyed by gameval name. Only started/finished
   * quests are listed; anything absent is not started.
   */
  @Get('quests')
  getQuests(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.groups.getMemberQuests(groupName, authorization);
  }

  /** Plugin quest sync. Newly finished quests also land in the achievement feed. */
  @Post('update-member-quests')
  @HttpCode(200)
  updateMemberQuests(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateMemberQuestsBody,
  ) {
    return this.groups.updateMemberQuests(groupName, authorization, body);
  }

  @Post('update-group-member')
  @HttpCode(200)
  updateGroupMember(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateMemberBody,
  ) {
    return this.groups.updateGroupMember(groupName, authorization, body);
  }

  /** Lightweight live map ping — updates [x, y, plane?] only. */
  @Post('player-moved')
  @HttpCode(200)
  playerMoved(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: PlayerMovedBody,
  ) {
    return this.groups.playerMoved(groupName, authorization, body);
  }

  /** Mark a member online/offline (plugin login/logout). */
  @Post('set-member-online')
  @HttpCode(200)
  setMemberOnline(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SetMemberOnlineBody,
  ) {
    return this.groups.setMemberOnline(groupName, authorization, body);
  }

  @Post('add-group-member')
  addGroupMember(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AddMemberBody,
  ) {
    return this.groups.addGroupMember(groupName, authorization, body);
  }

  @Put('update-member-profile')
  updateMemberProfile(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateMemberProfileBody,
  ) {
    return this.groups.updateMemberProfile(groupName, authorization, body);
  }

  @Put('update-group-settings')
  updateGroupSettings(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateGroupSettingsBody,
  ) {
    return this.groups.updateGroupSettings(groupName, authorization, body);
  }

  @Delete('delete-group-member')
  deleteGroupMember(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: MemberNameBody,
  ) {
    return this.groups.deleteGroupMember(groupName, authorization, body);
  }

  @Put('rename-group-member')
  renameGroupMember(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: RenameMemberBody,
  ) {
    return this.groups.renameGroupMember(groupName, authorization, body);
  }
}
