import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { allowDevReset } from '../config/env';
import { GroupAccessService } from './group-access.service';
import { GroupEventsService } from './group-events.service';
import { GroupsSeedService } from './groups-seed.service';
import {
  AddMemberBody,
  CreateAchievementBody,
  CreateGroupBody,
  MemberNameBody,
  RenameMemberBody,
  UpdateGroupSettingsBody,
  UpdateMemberAchievementsBody,
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
  constructor(
    private readonly groups: GroupsService,
    private readonly seed: GroupsSeedService,
  ) {}

  @Post('create-group')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  createGroup(@Body() body: CreateGroupBody) {
    return this.groups.createGroup(body);
  }

  /** Wipes the DB and reloads seed.json. Off unless ALLOW_DEV_RESET=1, never in production. */
  @Post('reset-fake-data')
  resetFakeData() {
    if (!allowDevReset()) {
      throw new NotFoundException();
    }
    return this.seed.resetFromSeed();
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
  constructor(
    private readonly groups: GroupsService,
    private readonly access: GroupAccessService,
    private readonly events$: GroupEventsService,
  ) {}

  @Get('am-i-logged-in')
  amILoggedIn(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.groups.amILoggedIn(groupName, authorization);
  }

  /**
   * Server-sent events: a snapshot on connect, then `split`-style deltas
   * coalesced to at most one every 750ms. A client on this stream stops
   * calling get-group-data; one that cannot stream keeps polling, so this is
   * purely additive.
   *
   * Auth is the usual Authorization header, so browsers must use fetch
   * streaming rather than EventSource, which cannot set headers.
   */
  // Belt and braces with nginx's proxy_buffering: a buffered stream fails
  // silently, with no error anywhere.
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Sse('events')
  async events(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    // Both checks run before the stream is returned, so a rejection is a clean
    // HTTP error rather than a stream that opens and closes immediately.
    const group = await this.access.readWithoutMembers(
      groupName,
      authorization,
    );
    if (!this.events$.hasCapacityFor(group.id)) {
      throw new ServiceUnavailableException('Too many open streams');
    }
    return this.events$
      .stream(group.id)
      .pipe(map((event) => ({ type: event.type, data: event })));
  }

  /**
   * `split=1` opts into partial members: one whose position changed but whose
   * inventories and skills did not comes back marked `partial: true` for the
   * client to merge. Without it the format is unchanged, so the plugin and any
   * cached browser bundle are unaffected.
   */
  @Get('get-group-data')
  getGroupData(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('from_time') fromTime?: string,
    @Query('split') split?: string,
  ) {
    return this.groups.getGroupData(
      groupName,
      authorization,
      fromTime,
      split === '1' || split === 'true',
    );
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

  /**
   * Completed RS3 achievements and diaries per member, keyed by gameval.
   * Anything absent is not complete.
   */
  @Get('achievement-progress')
  getAchievementProgress(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.groups.getMemberAchievements(groupName, authorization);
  }

  /** Plugin achievement sync. Newly completed ones also land in the feed. */
  @Post('update-member-achievements')
  @HttpCode(200)
  updateMemberAchievements(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateMemberAchievementsBody,
  ) {
    return this.groups.updateMemberAchievements(groupName, authorization, body);
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
