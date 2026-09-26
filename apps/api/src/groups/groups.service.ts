import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AchievementKind,
  AppearanceTheme,
  GroupMode,
  Prisma,
  type GroupInventory,
  type GroupInventoryItem,
  type Member,
  type MemberInventory,
  type MemberInventoryItem,
  type MemberSkill,
} from '@prisma/client';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
  WIRE_INVENTORIES,
  coordsFromArray,
  diffItemTotals,
  mergeItemPairs,
  pairsToRows,
  rowsToPairs,
  totalsByItemId,
  statsFromArray,
  statsToArray,
} from './item-codec';
import { normalizeSeedSkills, skillsToWire } from './skill-codec';
import {
  buildSyntheticAchievements,
  detectSkillMilestones,
  parseAchievedAt,
  parseAchievementKind,
  parseAchievementLimit,
  parseAchievementMember,
  toAchievementEntry,
  validateImageUrl,
} from './achievements';
import { SKILL_BY_ID, type SkillId } from '../skills/skills.catalog';
import {
  ACHIEVEMENT_KIND_TO_GAMEVAL,
  gamevalDedupeKey,
  isGamevalName,
} from '../gamevals/gamevals.catalog';
import { GamevalsService } from '../gamevals/gamevals.service';
import { QuestCatalogService } from '../gamevals/quest-catalog.service';
import { planQuestUpdate, resolveQuestInputs } from './quests';
import {
  AddMemberBody,
  CreateAchievementBody,
  CreateGroupBody,
  MAX_BANK,
  MAX_INVENTORIES,
  MAX_MEMBERS,
  MAX_NAME_LENGTH,
  MIN_MEMBERS,
  RenameMemberBody,
  SHARED_MEMBER,
  type SkillPayloadValue,
  type StoreFile,
  UpdateGroupSettingsBody,
  UpdateMemberBody,
  UpdateMemberProfileBody,
  UpdateMemberQuestsBody,
  PlayerMovedBody,
  SetMemberOnlineBody,
} from './group.types';
import { type DbClient, XpHistoryService } from './xp-history.service';

type InventoryWithItems = MemberInventory & { items: MemberInventoryItem[] };
type GroupInventoryWithItems = GroupInventory & { items: GroupInventoryItem[] };
type MemberWithData = Member & {
  inventories: InventoryWithItems[];
  skills: MemberSkill[];
};

/** Inventory keys that already have a named wire field. */
const STANDARD_INVENTORY_KEYS: ReadonlySet<string> = new Set(
  Object.values(WIRE_INVENTORIES),
);

/** Minimal projection used for auth + membership checks on every request. */
const groupLightSelect = {
  id: true,
  name: true,
  nameKey: true,
  token: true,
  mode: true,
  appearance: true,
  memberSlots: true,
  members: { select: { id: true, name: true } },
} satisfies Prisma.GroupSelect;

type GroupLight = Prisma.GroupGetPayload<{ select: typeof groupLightSelect }>;

const DEFAULT_STATS = [10, 10, 1, 1, 1, 1, 1];
const DEFAULT_COORDS = [3200, 3200, 0];

/** Rows per createMany chunk when seeding. */
const SEED_CHUNK = 5000;

/** Max number of keys accepted in an `update-group-member` skills object. */
const MAX_SKILL_KEYS = 64;

/**
 * The seeded demo group's token is public (it ships in the web bundle), so it
 * is read-only unless DEMO_WRITABLE=1.
 */
const DEMO_GROUP_KEY = 'demo group';

function parseGroupMode(raw?: string): GroupMode {
  if (raw === 'competitive') return GroupMode.competitive;
  return GroupMode.normal;
}

function parseAppearance(raw?: string): AppearanceTheme {
  if (raw === 'modern') return AppearanceTheme.modern;
  return AppearanceTheme.rs3;
}

function normalizeDiscordId(raw?: string | null): string | null {
  if (raw == null) return null;
  const id = String(raw).trim();
  if (!id) return null;
  if (!/^\d{17,20}$/.test(id)) {
    throw new ConflictException(
      'Discord user id must be a 17–20 digit snowflake',
    );
  }
  return id;
}

function normalizeNickname(raw?: string | null): string | null {
  if (raw == null) return null;
  const nick = String(raw).trim();
  return nick ? nick.slice(0, 32) : null;
}

function normalizeColor(raw?: string | null): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const short = /^#([0-9a-fA-F]{3})$/.exec(value);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new ConflictException('Colour must be a hex value like #4a8f3c');
  }
  return value.toLowerCase();
}

function normalizeUseDiscordAvatar(raw?: boolean): boolean {
  return raw !== false;
}

function validateDisplayName(raw: string | undefined, label: string) {
  const name = raw?.trim() ?? '';
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    throw new ConflictException(
      `${label} must be 1–${MAX_NAME_LENGTH} characters`,
    );
  }
  return name;
}

function nameKeyOf(name: string) {
  return name.toLowerCase();
}

function safeTokenEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isValidSkillNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * `skills` is validated loosely by the pipe (@IsObject); enforce the value
 * shape here: `number` or `{ xp?, level?, baseLevel? }` of finite, >= 0 numbers.
 */
function validateSkillsPayload(
  skills: unknown,
): Record<string, SkillPayloadValue> {
  if (skills === null || typeof skills !== 'object' || Array.isArray(skills)) {
    throw new BadRequestException('skills must be an object keyed by skill id');
  }
  const entries = Object.entries(skills as Record<string, unknown>);
  if (entries.length > MAX_SKILL_KEYS) {
    throw new BadRequestException('skills has too many entries');
  }
  for (const [key, value] of entries) {
    if (isValidSkillNumber(value)) continue;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`skills.${key} must be a number or object`);
    }
    for (const field of ['xp', 'level', 'baseLevel'] as const) {
      const v = (value as Record<string, unknown>)[field];
      if (v !== undefined && !isValidSkillNumber(v)) {
        throw new BadRequestException(
          `skills.${key}.${field} must be a finite non-negative number`,
        );
      }
    }
  }
  return skills as Record<string, SkillPayloadValue>;
}

/**
 * `inventories` is validated loosely by the pipe (@IsObject); enforce the
 * shape here: keys are inv gamevals, values are flat non-negative int lists.
 */
function validateInventoriesPayload(
  raw: unknown,
  isKnownKey: (key: string) => boolean,
): Record<string, number[]> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException(
      'inventories must be an object keyed by inventory gameval',
    );
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_INVENTORIES) {
    throw new BadRequestException('inventories has too many entries');
  }
  const out: Record<string, number[]> = {};
  for (const [rawKey, value] of entries) {
    const key = rawKey.trim().toLowerCase();
    if (!isKnownKey(key)) {
      throw new BadRequestException(
        `inventories.${rawKey} is not a known inventory gameval`,
      );
    }
    if (!Array.isArray(value) || value.length > MAX_BANK) {
      throw new BadRequestException(
        `inventories.${rawKey} must be a list of at most ${MAX_BANK} numbers`,
      );
    }
    for (const n of value) {
      if (!Number.isInteger(n) || n < 0) {
        throw new BadRequestException(
          `inventories.${rawKey} must contain non-negative integers`,
        );
      }
    }
    out[key] = value as number[];
  }
  return out;
}

/** Exact match first, then case-insensitive. */
function findMemberRef<T extends { name: string }>(
  members: T[],
  name: string,
): T | undefined {
  const exact = members.find((m) => m.name === name);
  if (exact) return exact;
  const key = name.toLowerCase();
  return members.find((m) => m.name.toLowerCase() === key);
}

function playableCount(members: Array<{ name: string }>) {
  return members.filter((m) => m.name !== SHARED_MEMBER).length;
}

@Injectable()
export class GroupsService {
  private readonly seedPath = join(process.cwd(), 'data', 'seed.json');

  constructor(
    private readonly prisma: PrismaService,
    private readonly xpHistory: XpHistoryService,
    private readonly gamevals: GamevalsService,
    private readonly questCatalog: QuestCatalogService,
  ) {}

  /** Group row + member ids/names only. Used for auth on every request. */
  async findGroupLight(groupName: string): Promise<GroupLight | null> {
    return this.prisma.group.findUnique({
      where: { nameKey: nameKeyOf(groupName) },
      select: groupLightSelect,
    });
  }

  /**
   * Read access. The seeded demo group is public sample data, so it is
   * readable with no Authorization header at all; every other group still
   * needs its token.
   */
  async authenticateRead(
    groupName: string,
    token: string | undefined,
  ): Promise<GroupLight> {
    if (!token) {
      const group = await this.findGroupLight(groupName);
      if (group?.nameKey === DEMO_GROUP_KEY) return group;
      // Same message as a bad token so this can't enumerate group names.
      throw new UnauthorizedException('Invalid group or token');
    }
    return this.authenticate(groupName, token);
  }

  /** authenticate() plus a write guard for the public demo group. */
  async authenticateWrite(
    groupName: string,
    token: string | undefined,
  ): Promise<GroupLight> {
    const group = await this.authenticate(groupName, token);
    if (group.nameKey === DEMO_GROUP_KEY && process.env.DEMO_WRITABLE !== '1') {
      throw new ForbiddenException('The demo group is read-only');
    }
    return group;
  }

  async authenticate(
    groupName: string,
    token: string | undefined,
  ): Promise<GroupLight> {
    if (!token) throw new UnauthorizedException('Missing Authorization token');
    const group = await this.findGroupLight(groupName);
    // Same response whether the group is unknown or the token is wrong so the
    // endpoint can't be used to enumerate group names.
    if (!group || !safeTokenEqual(group.token, token)) {
      throw new UnauthorizedException('Invalid group or token');
    }
    return group;
  }

  async createGroup(body: CreateGroupBody) {
    const name = validateDisplayName(body.name, 'Group name');

    const existing = await this.findGroupLight(name);
    if (existing) throw new ConflictException('Group already exists');

    const rawMembers = (body.member_names ?? [])
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && n !== SHARED_MEMBER);
    const seen = new Set<string>();
    const memberNames: string[] = [];
    for (const raw of rawMembers) {
      const memberName = validateDisplayName(raw, 'Player username');
      const key = memberName.toLowerCase();
      if (seen.has(key)) {
        throw new ConflictException('Player usernames must be unique');
      }
      seen.add(key);
      memberNames.push(memberName);
    }

    if (memberNames.length < MIN_MEMBERS || memberNames.length > MAX_MEMBERS) {
      throw new ConflictException(
        `Groups must have ${MIN_MEMBERS}-${MAX_MEMBERS} players`,
      );
    }

    const slots =
      body.member_slots != null
        ? Number(body.member_slots)
        : memberNames.length;
    if (
      !Number.isInteger(slots) ||
      slots < MIN_MEMBERS ||
      slots > MAX_MEMBERS
    ) {
      throw new ConflictException(
        `Group size must be ${MIN_MEMBERS}-${MAX_MEMBERS}`,
      );
    }
    if (memberNames.length !== slots) {
      throw new ConflictException(
        `Add exactly ${slots} unique player usernames`,
      );
    }

    const mode = parseGroupMode(body.mode);
    const token = randomUUID();
    const defaults = statsFromArray(DEFAULT_STATS);
    const coords = coordsFromArray(DEFAULT_COORDS);

    try {
      await this.prisma.group.create({
        data: {
          name,
          nameKey: nameKeyOf(name),
          token,
          mode,
          appearance: AppearanceTheme.rs3,
          memberSlots: slots,
          members: {
            create: memberNames.map((memberName) => ({
              name: memberName,
              ...defaults,
              ...coords,
            })),
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Group already exists');
      }
      throw err;
    }

    return {
      name,
      mode,
      appearance: 'rs3' as const,
      member_slots: slots,
      member_names: memberNames,
      token,
    };
  }

  async amILoggedIn(groupName: string, token: string | undefined) {
    const group = await this.authenticateRead(groupName, token);
    return {
      ok: true,
      name: group.name,
      // Only echoed back to a caller that already proved it holds the token,
      // so the tokenless demo read never publishes one.
      ...(token ? { token: group.token } : {}),
      mode: group.mode,
      appearance: group.appearance,
      member_count: playableCount(group.members),
      member_slots: group.memberSlots,
    };
  }

  async getGroupData(
    groupName: string,
    token: string | undefined,
    fromTime?: string,
  ) {
    const group = await this.authenticateRead(groupName, token);
    const since = fromTime ? Date.parse(fromTime) : 0;

    const members = await this.prisma.member.findMany({
      where: { groupId: group.id },
    });

    // Only members changed since `from_time` need their items/skills loaded.
    const fresh = members.filter(
      (m) => !(since && m.lastUpdated.getTime() < since),
    );
    const freshIds = fresh.map((m) => m.id);

    const [inventories, skills, groupInventories] = await Promise.all([
      freshIds.length
        ? this.prisma.memberInventory.findMany({
            where: { memberId: { in: freshIds } },
            include: { items: true },
          })
        : ([] as InventoryWithItems[]),
      freshIds.length
        ? this.prisma.memberSkill.findMany({
            where: { memberId: { in: freshIds } },
          })
        : ([] as MemberSkill[]),
      this.prisma.groupInventory.findMany({
        where: { groupId: group.id },
        include: { items: true },
      }),
    ]);

    const inventoriesByMember = new Map<string, InventoryWithItems[]>();
    for (const inventory of inventories) {
      const list = inventoriesByMember.get(inventory.memberId);
      if (list) list.push(inventory);
      else inventoriesByMember.set(inventory.memberId, [inventory]);
    }
    const skillsByMember = new Map<string, MemberSkill[]>();
    for (const skill of skills) {
      const list = skillsByMember.get(skill.memberId);
      if (list) list.push(skill);
      else skillsByMember.set(skill.memberId, [skill]);
    }

    const wire: Array<
      { name: string } | ReturnType<GroupsService['toWireMember']>
    > = members.map((member) => {
      if (since && member.lastUpdated.getTime() < since) {
        return { name: member.name };
      }
      return this.toWireMember({
        ...member,
        inventories: inventoriesByMember.get(member.id) ?? [],
        skills: skillsByMember.get(member.id) ?? [],
      });
    });

    // The shared bank is group-owned but still travels as the "@SHARED"
    // pseudo-member so existing clients keep working. It follows the same
    // delta rule, keyed on when the plugin last synced it.
    if (groupInventories.length) {
      const updatedAt = Math.max(
        ...groupInventories.map((i) => i.updatedAt.getTime()),
      );
      wire.push(
        since && updatedAt < since
          ? { name: SHARED_MEMBER }
          : this.toSharedWireMember(groupInventories, new Date(updatedAt)),
      );
    }
    return wire;
  }

  async getXpHistory(
    groupName: string,
    token: string | undefined,
    period?: string,
    skill?: string,
  ) {
    return this.xpHistory.getXpHistory(
      groupName,
      token,
      (g, t) => this.authenticateRead(g, t),
      period,
      skill,
    );
  }

  /**
   * Shared bank movement log, newest first. Cursor paging via `before`
   * (ISO timestamp). Bad input is clamped/ignored rather than rejected.
   */
  async getBankLedger(
    groupName: string,
    token: string | undefined,
    limitRaw?: string,
    beforeRaw?: string,
    fromRaw?: string,
    toRaw?: string,
  ) {
    const group = await this.authenticateRead(groupName, token);
    const limit = parseLedgerLimit(limitRaw);
    const before = parseLedgerCursor(beforeRaw);
    // `from`/`to` bound a calendar day. The client sends real instants so the
    // day boundaries follow the viewer's timezone, not the server's.
    const from = parseLedgerCursor(fromRaw);
    const to = parseLedgerCursor(toRaw);

    const createdAt = ledgerDateWindow(before, from, to);

    const rows = await this.prisma.sharedBankEntry.findMany({
      where: {
        groupId: group.id,
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        memberName: true,
        itemId: true,
        delta: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const entries = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      id: row.id,
      name: row.memberName,
      item_id: row.itemId,
      delta: row.delta,
      at: row.createdAt.toISOString(),
    }));

    return { entries, has_more: hasMore };
  }

  /**
   * Group achievement feed, newest first. Cursor paging via `before` (ISO
   * timestamp). Bad input is clamped/ignored rather than rejected.
   */
  async getAchievements(
    groupName: string,
    token: string | undefined,
    limitRaw?: string,
    beforeRaw?: string,
    kindRaw?: string,
    memberRaw?: string,
    fromRaw?: string,
    toRaw?: string,
  ) {
    const group = await this.authenticateRead(groupName, token);
    const limit = parseAchievementLimit(limitRaw);
    const before = parseLedgerCursor(beforeRaw);
    const kind = parseAchievementKind(kindRaw);
    const member = parseAchievementMember(memberRaw);
    // Same calendar-day window as the bank ledger: the client sends real
    // instants so day boundaries follow the viewer's timezone.
    const achievedAt = ledgerDateWindow(
      before,
      parseLedgerCursor(fromRaw),
      parseLedgerCursor(toRaw),
    );

    const rows = await this.prisma.achievement.findMany({
      where: {
        groupId: group.id,
        ...(achievedAt ? { achievedAt } : {}),
        ...(kind ? { kind } : {}),
        ...(member ? { memberName: member } : {}),
      },
      orderBy: [{ achievedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        memberName: true,
        kind: true,
        title: true,
        detail: true,
        skillId: true,
        itemId: true,
        gameval: true,
        imageUrl: true,
        achievedAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const entries = (hasMore ? rows.slice(0, limit) : rows).map(
      toAchievementEntry,
    );

    return { entries, has_more: hasMore };
  }

  /** Manually posted achievement (plugin drop notifier / web form). */
  async createAchievement(
    groupName: string,
    token: string | undefined,
    body: CreateAchievementBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const name = validateDisplayName(body.name, 'Player username');

    const title = body.title?.trim();
    if (!title) throw new BadRequestException('title is required');
    const detail = body.detail?.trim() || null;

    let skillId: string | null = null;
    if (body.skill_id != null && body.skill_id.trim() !== '') {
      const candidate = body.skill_id.trim().toLowerCase();
      if (!SKILL_BY_ID[candidate as SkillId]) {
        throw new BadRequestException('skill_id is not a known RS3 skill');
      }
      skillId = candidate;
    }

    const imageUrl = validateImageUrl(body.image_url, process.env.CDN_BASE_URL);
    const achievedAt = parseAchievedAt(body.achieved_at);

    // Quest/diary posts may carry a gameval so the completion has a stable
    // key. A repeat post for the same member + gameval returns the existing
    // row instead of adding a duplicate to the feed.
    const gameval = this.resolveAchievementGameval(body);
    const gamevalKind = ACHIEVEMENT_KIND_TO_GAMEVAL[body.kind];
    const dedupeKey =
      gameval && gamevalKind
        ? gamevalDedupeKey(name, gamevalKind, gameval)
        : // Plain manual posts are never deduped: NULL never collides in a
          // Postgres unique index, so many may coexist per group.
          null;

    const select = {
      id: true,
      memberName: true,
      kind: true,
      title: true,
      detail: true,
      skillId: true,
      itemId: true,
      gameval: true,
      imageUrl: true,
      achievedAt: true,
    } as const;

    if (dedupeKey) {
      const existing = await this.prisma.achievement.findUnique({
        where: { groupId_dedupeKey: { groupId: group.id, dedupeKey } },
        select,
      });
      if (existing) return toAchievementEntry(existing);
    }

    const row = await this.prisma.achievement.create({
      data: {
        groupId: group.id,
        memberName: name,
        kind: body.kind,
        title,
        detail,
        skillId,
        itemId: body.item_id ?? null,
        gameval,
        imageUrl,
        dedupeKey,
        achievedAt,
      },
      select,
    });

    return toAchievementEntry(row);
  }

  /**
   * Gameval name for a posted achievement, or null when none was supplied.
   * `gameval` (name) wins over `gameval_id`; either must exist in the table
   * for the achievement kind, and kinds without a table (level/drop) reject
   * both so a client can't attach a meaningless key.
   */
  private resolveAchievementGameval(
    body: CreateAchievementBody,
  ): string | null {
    const rawName = body.gameval?.trim().toLowerCase();
    const hasName = !!rawName;
    const hasId = body.gameval_id != null;
    if (!hasName && !hasId) return null;

    const kind = ACHIEVEMENT_KIND_TO_GAMEVAL[body.kind];
    if (!kind) {
      throw new BadRequestException(
        `gameval is only accepted for quest, diary and other achievements`,
      );
    }

    if (hasName) {
      if (!isGamevalName(rawName) || !this.gamevals.hasName(kind, rawName)) {
        throw new BadRequestException(`gameval is not a known ${kind} name`);
      }
      return rawName;
    }

    const resolved = this.gamevals.nameOf(kind, body.gameval_id!);
    if (!resolved) {
      throw new BadRequestException(`gameval_id is not a known ${kind} id`);
    }
    return resolved;
  }

  /**
   * Quest progress for every playable member: `{ gameval: state }` with only
   * started/finished quests present. Static quest data (names, points) is
   * the web's job, so the payload stays small.
   */
  async getMemberQuests(groupName: string, token: string | undefined) {
    const group = await this.authenticateRead(groupName, token);
    const members = group.members.filter((m) => m.name !== SHARED_MEMBER);
    const rows = members.length
      ? await this.prisma.memberQuest.findMany({
          where: { memberId: { in: members.map((m) => m.id) } },
          select: { memberId: true, gameval: true, state: true },
        })
      : [];

    const byMember = new Map<string, Record<string, string>>();
    for (const row of rows) {
      let quests = byMember.get(row.memberId);
      if (!quests) {
        quests = {};
        byMember.set(row.memberId, quests);
      }
      quests[row.gameval] = row.state;
    }

    return {
      members: members.map((m) => ({
        name: m.name,
        quests: byMember.get(m.id) ?? {},
      })),
    };
  }

  /**
   * Plugin quest sync. Quests are stored by gameval name; ids in the body
   * are resolved through the gameval table first. A member's very first
   * sync is the baseline (like skills), so it records state but does not
   * flood the feed with one achievement per already-finished quest.
   */
  async updateMemberQuests(
    groupName: string,
    token: string | undefined,
    body: UpdateMemberQuestsBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const name = validateDisplayName(body.name, 'Player username');
    if (name === SHARED_MEMBER) {
      throw new ConflictException('Invalid member name');
    }
    const member = findMemberRef(group.members, name);
    if (!member) throw new NotFoundException('Member not found');

    // Validate everything before opening a transaction.
    const next = resolveQuestInputs(body.quests, this.gamevals);
    const full = body.full === true;
    const now = new Date();

    const plan = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.memberQuest.findMany({
        where: { memberId: member.id },
        select: { gameval: true, state: true },
      });
      const previous = new Map(stored.map((r) => [r.gameval, r.state]));
      const plan = planQuestUpdate(previous, next, full);

      // Changed rows are replaced rather than upserted one by one: two
      // statements regardless of how many quests a full sync touches.
      const replaced = [...plan.remove, ...plan.write.map((w) => w.gameval)];
      if (replaced.length) {
        await tx.memberQuest.deleteMany({
          where: { memberId: member.id, gameval: { in: replaced } },
        });
      }
      if (plan.write.length) {
        await tx.memberQuest.createMany({
          data: plan.write.map((w) => ({
            memberId: member.id,
            gameval: w.gameval,
            state: w.state,
            updatedAt: now,
          })),
        });
      }

      const isBaseline = previous.size === 0;
      if (plan.finished.length && !isBaseline) {
        await tx.achievement.createMany({
          data: plan.finished.map((gameval) => ({
            groupId: group.id,
            memberName: member.name,
            kind: AchievementKind.quest,
            title: this.questCatalog.nameOf(gameval),
            detail: 'Quest complete',
            gameval,
            // Same key a manual quest post would use, so the two never double up.
            dedupeKey: gamevalDedupeKey(member.name, 'quest', gameval),
            achievedAt: now,
          })),
          skipDuplicates: true,
        });
      }
      return { ...plan, isBaseline };
    });

    return {
      ok: true,
      name: member.name,
      written: plan.write.length,
      removed: plan.remove.length,
      finished: plan.finished,
      baseline: plan.isBaseline,
    };
  }

  async updateGroupMember(
    groupName: string,
    token: string | undefined,
    body: UpdateMemberBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const name = validateDisplayName(body.name, 'Player username');
    if (name === SHARED_MEMBER) {
      throw new ConflictException('Invalid member name');
    }

    // Validate before touching the DB so bad payloads never open a transaction.
    const skills = body.skills ? validateSkillsPayload(body.skills) : undefined;
    const inventories = body.inventories
      ? validateInventoriesPayload(body.inventories, (key) =>
          this.gamevals.hasName('inv', key),
        )
      : undefined;

    const existing = findMemberRef(group.members, name);
    if (!existing && playableCount(group.members) >= group.memberSlots) {
      throw new ConflictException(
        `Group is full (${group.memberSlots} players)`,
      );
    }

    const now = new Date();
    const vitals = body.stats ? statsFromArray(body.stats) : undefined;
    const coords = body.coordinates
      ? coordsFromArray(body.coordinates)
      : undefined;
    const hasDeposit = !!body.deposited?.length;

    await this.prisma.$transaction(
      async (tx) => {
        let memberId: string;
        if (existing) {
          memberId = existing.id;
          await tx.member.update({
            where: { id: memberId },
            data: {
              lastUpdated: now,
              online: true,
              ...(vitals ?? {}),
              ...(coords ?? {}),
            },
            select: { id: true },
          });
        } else {
          const created = await tx.member.create({
            data: {
              groupId: group.id,
              name,
              lastUpdated: now,
              online: true,
              ...statsFromArray(body.stats ?? DEFAULT_STATS),
              ...coordsFromArray(body.coordinates ?? DEFAULT_COORDS),
            },
            select: { id: true },
          });
          memberId = created.id;
        }

        // Named wire fields first, then the generic map. A key present in
        // both is written twice and the generic one wins, which is harmless.
        if (body.inventory) {
          await this.replaceMemberInventory(
            tx,
            memberId,
            WIRE_INVENTORIES.inventory,
            body.inventory,
            now,
          );
        }
        if (body.equipment) {
          await this.replaceMemberInventory(
            tx,
            memberId,
            WIRE_INVENTORIES.equipment,
            body.equipment,
            now,
          );
        }

        // Compute the final bank once: full bank (+ deposits) or current + deposits.
        let finalBank: number[] | undefined;
        if (body.bank && hasDeposit) {
          finalBank = mergeItemPairs(body.bank, body.deposited!);
        } else if (body.bank) {
          finalBank = body.bank;
        } else if (hasDeposit) {
          const currentBank = existing
            ? await this.memberInventoryPairs(
                tx,
                memberId,
                WIRE_INVENTORIES.bank,
              )
            : [];
          finalBank = mergeItemPairs(currentBank, body.deposited!);
        }
        if (finalBank) {
          await this.replaceMemberInventory(
            tx,
            memberId,
            WIRE_INVENTORIES.bank,
            finalBank,
            now,
          );
        }

        if (inventories) {
          for (const [key, pairs] of Object.entries(inventories)) {
            await this.replaceMemberInventory(tx, memberId, key, pairs, now);
          }
        }

        if (skills) {
          await this.replaceSkills(tx, group.id, memberId, name, skills, now);
        }

        if (body.shared_bank?.length) {
          // The shared bank is the group's own `bank` inventory. Snapshot
          // BEFORE replacing so the ledger can diff against it.
          const previousShared = await this.groupInventoryPairs(
            tx,
            group.id,
            WIRE_INVENTORIES.bank,
          );
          await this.replaceGroupInventory(
            tx,
            group.id,
            WIRE_INVENTORIES.bank,
            body.shared_bank,
            now,
          );

          const movements = diffItemTotals(previousShared, body.shared_bank);
          if (movements.length) {
            await tx.sharedBankEntry.createMany({
              data: movements.map((m) => ({
                groupId: group.id,
                memberName: name,
                itemId: m.itemId,
                delta: m.delta,
                createdAt: now,
              })),
            });
          }
        }
      },
      { maxWait: 5_000, timeout: 20_000 },
    );

    return { ok: true };
  }

  /** Fast path for live map — coordinates only. */
  async playerMoved(
    groupName: string,
    token: string | undefined,
    body: PlayerMovedBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const name = body.name?.trim();
    if (!name || name === SHARED_MEMBER) {
      throw new ConflictException('Invalid member name');
    }
    const member = findMemberRef(group.members, name);
    if (!member) throw new NotFoundException('Member not found');

    const coords = body.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      throw new ConflictException(
        'coordinates must be [x, y] or [x, y, plane]',
      );
    }
    const x = Number(coords[0]);
    const y = Number(coords[1]);
    const hasPlane = coords.length >= 3;
    const plane = hasPlane ? Number(coords[2]) : 0;
    if (![x, y, plane].every((n) => Number.isFinite(n))) {
      throw new ConflictException('coordinates must be finite numbers');
    }

    const now = new Date();
    const rounded = {
      x: Math.round(x),
      y: Math.round(y),
      ...(hasPlane ? { plane: Math.round(plane) } : {}),
    };

    // Single write; the returned row gives us the (possibly unchanged) plane.
    const updated = await this.prisma.member.update({
      where: { id: member.id },
      data: {
        ...rounded,
        online: true,
        lastUpdated: now,
      },
      select: { plane: true },
    });

    return {
      ok: true,
      name,
      online: true,
      coordinates: [rounded.x, rounded.y, updated.plane],
      updated_at: now.toISOString(),
    };
  }

  async setMemberOnline(
    groupName: string,
    token: string | undefined,
    body: SetMemberOnlineBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const name = body.name?.trim();
    if (!name || name === SHARED_MEMBER) {
      throw new ConflictException('Invalid member name');
    }
    const member = findMemberRef(group.members, name);
    if (!member) throw new NotFoundException('Member not found');

    const online = Boolean(body.online);
    const now = new Date();
    const result = await this.prisma.member.updateMany({
      where: { id: member.id, groupId: group.id },
      data: {
        online,
        lastUpdated: now,
      },
    });
    if (result.count === 0) throw new NotFoundException('Member not found');

    return {
      ok: true,
      name,
      online,
      updated_at: now.toISOString(),
    };
  }

  async addGroupMember(
    groupName: string,
    token: string | undefined,
    body: AddMemberBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const name = validateDisplayName(body.name, 'Player username');
    if (name === SHARED_MEMBER) {
      throw new ConflictException('Invalid member name');
    }
    if (findMemberRef(group.members, name)) {
      throw new ConflictException('Member already exists');
    }
    if (playableCount(group.members) >= group.memberSlots) {
      throw new ConflictException(
        `Group is full (${group.memberSlots} players)`,
      );
    }

    const nickname = normalizeNickname(body.nickname);
    const discordId = normalizeDiscordId(body.discord_id);
    const color = normalizeColor(body.color);
    const useDiscordAvatar = normalizeUseDiscordAvatar(body.use_discord_avatar);

    await this.prisma.member.create({
      data: {
        groupId: group.id,
        name,
        nickname,
        discordId,
        color,
        useDiscordAvatar,
        ...statsFromArray(DEFAULT_STATS),
        ...coordsFromArray(DEFAULT_COORDS),
      },
      select: { id: true },
    });

    return {
      ok: true,
      name,
      nickname,
      discord_id: discordId,
      color,
      use_discord_avatar: useDiscordAvatar,
    };
  }

  async updateMemberProfile(
    groupName: string,
    token: string | undefined,
    body: UpdateMemberProfileBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const name = body.name?.trim();
    if (!name || name === SHARED_MEMBER) {
      throw new ConflictException('Invalid member name');
    }
    const member = findMemberRef(group.members, name);
    if (!member) throw new NotFoundException('Member not found');

    const data: {
      nickname?: string | null;
      discordId?: string | null;
      color?: string | null;
      useDiscordAvatar?: boolean;
    } = {};
    // `!== undefined` (not `in`): the DTO class instance always owns these keys.
    if (body.nickname !== undefined) {
      data.nickname = normalizeNickname(body.nickname);
    }
    if (body.discord_id !== undefined) {
      data.discordId = normalizeDiscordId(body.discord_id);
    }
    if (body.color !== undefined) data.color = normalizeColor(body.color);
    if (body.use_discord_avatar !== undefined) {
      data.useDiscordAvatar = normalizeUseDiscordAvatar(
        body.use_discord_avatar,
      );
    }

    // The updated row already holds the untouched fields for the response.
    const updated = await this.prisma.member.update({
      where: { id: member.id },
      // Bump lastUpdated so delta pollers (from_time) pick up the change.
      data: { ...data, lastUpdated: new Date() },
      select: {
        nickname: true,
        discordId: true,
        color: true,
        useDiscordAvatar: true,
      },
    });

    return {
      ok: true,
      name,
      nickname: updated.nickname,
      discord_id: updated.discordId,
      color: updated.color,
      use_discord_avatar: updated.useDiscordAvatar,
    };
  }

  async updateGroupSettings(
    groupName: string,
    token: string | undefined,
    body: UpdateGroupSettingsBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const data: {
      appearance?: AppearanceTheme;
      mode?: GroupMode;
      name?: string;
      nameKey?: string;
    } = {};
    if (body.appearance) data.appearance = parseAppearance(body.appearance);
    if (body.mode) data.mode = parseGroupMode(body.mode);

    if (body.name !== undefined) {
      const nextName = validateDisplayName(body.name, 'Group name');
      if (nextName !== group.name) {
        // Case-only renames are allowed (same nameKey, same row).
        const taken = await this.findGroupLight(nextName);
        if (taken && taken.id !== group.id) {
          throw new ConflictException('Group name already taken');
        }
        data.name = nextName;
        data.nameKey = nameKeyOf(nextName);
      }
    }

    let updated: {
      name: string;
      token: string;
      mode: GroupMode;
      appearance: AppearanceTheme;
      memberSlots: number;
    };
    try {
      updated = await this.prisma.group.update({
        where: { id: group.id },
        data,
        select: {
          name: true,
          token: true,
          mode: true,
          appearance: true,
          memberSlots: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Group name already taken');
      }
      throw err;
    }

    return {
      ok: true,
      name: updated.name,
      token: updated.token,
      mode: updated.mode,
      appearance: updated.appearance,
      member_slots: updated.memberSlots,
    };
  }

  async deleteGroupMember(
    groupName: string,
    token: string | undefined,
    body: { name: string },
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const name = body.name?.trim();
    if (!name || name === SHARED_MEMBER) {
      throw new ConflictException('Cannot delete shared bank member');
    }
    const member = findMemberRef(group.members, name);
    if (!member) throw new NotFoundException('Member not found');
    if (playableCount(group.members) <= MIN_MEMBERS) {
      throw new ConflictException(
        `Groups must keep at least ${MIN_MEMBERS} players`,
      );
    }
    const result = await this.prisma.member.deleteMany({
      where: { id: member.id, groupId: group.id },
    });
    if (result.count === 0) throw new NotFoundException('Member not found');
    return { ok: true };
  }

  async renameGroupMember(
    groupName: string,
    token: string | undefined,
    body: RenameMemberBody,
  ) {
    const group = await this.authenticateWrite(groupName, token);
    const original = body.original_name?.trim();
    const next = validateDisplayName(body.new_name, 'Player username');
    if (!original || original === SHARED_MEMBER || next === SHARED_MEMBER) {
      throw new ConflictException('Invalid rename');
    }
    const member = findMemberRef(group.members, original);
    if (!member) throw new NotFoundException('Member not found');
    const clash = findMemberRef(group.members, next);
    if (clash && clash.id !== member.id) {
      throw new ConflictException('Name already taken');
    }
    await this.prisma.member.update({
      where: { id: member.id },
      data: { name: next, lastUpdated: new Date() },
      select: { id: true },
    });
    return { ok: true, name: next };
  }

  async resetFromSeed() {
    if (!existsSync(this.seedPath)) {
      throw new NotFoundException('data/seed.json missing');
    }
    const seed = JSON.parse(readFileSync(this.seedPath, 'utf8')) as StoreFile;

    // Build every row up front (ids generated here so FKs can be wired without
    // round-trips), then bulk insert per table inside one transaction.
    const groupRows: Prisma.GroupCreateManyInput[] = [];
    const memberRows: Prisma.MemberCreateManyInput[] = [];
    const inventoryRows: Prisma.MemberInventoryCreateManyInput[] = [];
    const itemRows: Prisma.MemberInventoryItemCreateManyInput[] = [];
    const groupInventoryRows: Prisma.GroupInventoryCreateManyInput[] = [];
    const groupItemRows: Prisma.GroupInventoryItemCreateManyInput[] = [];
    const skillRows: Prisma.MemberSkillCreateManyInput[] = [];
    const sampleRows: Prisma.SkillXpSampleCreateManyInput[] = [];
    const ledgerRows: Prisma.SharedBankEntryCreateManyInput[] = [];
    const achievementRows: Prisma.AchievementCreateManyInput[] = [];
    const seedNow = new Date();

    for (const group of seed.groups) {
      const playable = playableCount(group.members);
      const slots = Math.min(
        MAX_MEMBERS,
        Math.max(MIN_MEMBERS, group.member_slots ?? playable ?? MIN_MEMBERS),
      );

      const groupId = randomUUID();
      groupRows.push({
        id: groupId,
        name: group.name,
        nameKey: nameKeyOf(group.name),
        // Never use the token from seed.json: it is committed to the repo, so
        // a fresh random one keeps seeded groups from having a public
        // credential. The demo group is read-only and needs no token anyway.
        token: randomUUID(),
        mode: parseGroupMode(group.mode),
        appearance: parseAppearance(group.appearance),
        memberSlots: slots,
        createdAt: group.created_at ? new Date(group.created_at) : undefined,
      });

      for (const member of group.members) {
        // The seed still describes the shared bank as a "@SHARED" member for
        // readability; it is stored as the group's bank inventory.
        if (member.name === SHARED_MEMBER) {
          const pairs = member.bank?.length ? member.bank : member.shared_bank;
          const items = pairsToRows(pairs, WIRE_INVENTORIES.bank);
          if (items.length) {
            const inventoryId = randomUUID();
            groupInventoryRows.push({
              id: inventoryId,
              groupId,
              key: WIRE_INVENTORIES.bank,
              updatedAt: member.last_updated
                ? new Date(member.last_updated)
                : seedNow,
            });
            for (const item of items)
              groupItemRows.push({ ...item, inventoryId });
          }
          continue;
        }

        const memberId = randomUUID();
        let discordId: string | null = null;
        try {
          discordId = normalizeDiscordId(member.discord_id);
        } catch {
          discordId = null;
        }
        let color: string | null = null;
        try {
          color = normalizeColor(member.color);
        } catch {
          color = null;
        }

        memberRows.push({
          id: memberId,
          groupId,
          name: member.name,
          nickname: normalizeNickname(member.nickname),
          discordId,
          color,
          useDiscordAvatar: normalizeUseDiscordAvatar(
            member.use_discord_avatar,
          ),
          online: member.online === true,
          lastUpdated: member.last_updated
            ? new Date(member.last_updated)
            : seedNow,
          ...statsFromArray(member.stats),
          ...coordsFromArray(member.coordinates),
        });

        for (const [field, key] of Object.entries(WIRE_INVENTORIES)) {
          const pairs = member[field as keyof typeof WIRE_INVENTORIES];
          const items = pairsToRows(pairs, key);
          if (!items.length) continue;
          const inventoryId = randomUUID();
          inventoryRows.push({
            id: inventoryId,
            memberId,
            key,
            updatedAt: seedNow,
          });
          for (const item of items) itemRows.push({ ...item, inventoryId });
        }

        const skills = normalizeSeedSkills(member.skills);
        for (const skill of skills) {
          skillRows.push({ ...skill, memberId });
        }
        if (skills.length) {
          sampleRows.push(
            ...this.xpHistory.buildSyntheticSamples(
              memberId,
              skills.map((s) => ({ skillId: s.skillId, xp: s.xp })),
              seedNow,
            ),
          );
        }
      }

      // Synthetic shared-bank movement history so the demo shows a real ledger.
      const sharedSeed = group.members.find((m) => m.name === SHARED_MEMBER);
      const sharedItemIds = [
        ...totalsByItemId(sharedSeed?.bank ?? sharedSeed?.shared_bank).keys(),
      ];
      const playerNames = group.members
        .filter((m) => m.name !== SHARED_MEMBER)
        .map((m) => m.name);
      ledgerRows.push(
        ...buildSyntheticLedgerEntries(
          groupId,
          group.name,
          playerNames,
          sharedItemIds,
          seedNow,
        ),
      );

      // Synthetic achievement history. Drops reference item ids that really
      // exist somewhere in this group's data.
      const groupItemIds = new Set<number>(sharedItemIds);
      for (const member of group.members) {
        for (const id of totalsByItemId(member.bank).keys()) {
          groupItemIds.add(id);
        }
        for (const id of totalsByItemId(member.equipment).keys()) {
          groupItemIds.add(id);
        }
      }
      achievementRows.push(
        ...buildSyntheticAchievements(
          groupId,
          group.name,
          playerNames,
          [...groupItemIds],
          seedNow,
        ),
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        // Cascades handle members/items/skills/samples, but be explicit.
        await tx.achievement.deleteMany();
        await tx.sharedBankEntry.deleteMany();
        await tx.skillXpSample.deleteMany();
        await tx.memberSkill.deleteMany();
        await tx.memberInventoryItem.deleteMany();
        await tx.memberInventory.deleteMany();
        await tx.groupInventoryItem.deleteMany();
        await tx.groupInventory.deleteMany();
        await tx.member.deleteMany();
        await tx.group.deleteMany();

        if (groupRows.length) await tx.group.createMany({ data: groupRows });
        if (memberRows.length) await tx.member.createMany({ data: memberRows });
        for (const chunk of chunked(inventoryRows, SEED_CHUNK)) {
          await tx.memberInventory.createMany({ data: chunk });
        }
        for (const chunk of chunked(itemRows, SEED_CHUNK)) {
          await tx.memberInventoryItem.createMany({ data: chunk });
        }
        if (groupInventoryRows.length) {
          await tx.groupInventory.createMany({ data: groupInventoryRows });
        }
        for (const chunk of chunked(groupItemRows, SEED_CHUNK)) {
          await tx.groupInventoryItem.createMany({ data: chunk });
        }
        for (const chunk of chunked(skillRows, SEED_CHUNK)) {
          await tx.memberSkill.createMany({ data: chunk });
        }
        for (const chunk of chunked(sampleRows, SEED_CHUNK)) {
          await tx.skillXpSample.createMany({ data: chunk });
        }
        for (const chunk of chunked(ledgerRows, SEED_CHUNK)) {
          await tx.sharedBankEntry.createMany({ data: chunk });
        }
        for (const chunk of chunked(achievementRows, SEED_CHUNK)) {
          await tx.achievement.createMany({ data: chunk });
        }
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    return { ok: true, groups: seed.groups.length };
  }

  async seedIfEmpty() {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.SEED_DEMO !== '1'
    ) {
      return;
    }
    const count = await this.prisma.group.count();
    if (count === 0 && existsSync(this.seedPath)) {
      await this.resetFromSeed();
    }
  }

  /** Current contents of a member inventory as wire pairs (empty if absent). */
  private async memberInventoryPairs(
    db: DbClient,
    memberId: string,
    key: string,
  ) {
    const rows = await db.memberInventoryItem.findMany({
      where: { inventory: { memberId, key } },
      select: { slot: true, itemId: true, quantity: true },
    });
    return rowsToPairs(rows);
  }

  /** Current contents of a group inventory as wire pairs (empty if absent). */
  private async groupInventoryPairs(
    db: DbClient,
    groupId: string,
    key: string,
  ) {
    const rows = await db.groupInventoryItem.findMany({
      where: { inventory: { groupId, key } },
      select: { slot: true, itemId: true, quantity: true },
    });
    return rowsToPairs(rows);
  }

  /**
   * Replace a member inventory wholesale. The inventory row is created on
   * first sight and stamped on every write, so `updatedAt` says when the
   * plugin last reported it.
   */
  private async replaceMemberInventory(
    db: DbClient,
    memberId: string,
    key: string,
    pairs: number[],
    now: Date,
  ) {
    const inventory = await db.memberInventory.upsert({
      where: { memberId_key: { memberId, key } },
      create: { memberId, key, updatedAt: now },
      update: { updatedAt: now },
      select: { id: true },
    });
    await db.memberInventoryItem.deleteMany({
      where: { inventoryId: inventory.id },
    });
    const rows = pairsToRows(pairs, key).map((item) => ({
      ...item,
      inventoryId: inventory.id,
    }));
    if (rows.length) {
      await db.memberInventoryItem.createMany({ data: rows });
    }
  }

  /** Same as replaceMemberInventory, for group-owned inventories. */
  private async replaceGroupInventory(
    db: DbClient,
    groupId: string,
    key: string,
    pairs: number[],
    now: Date,
  ) {
    const inventory = await db.groupInventory.upsert({
      where: { groupId_key: { groupId, key } },
      create: { groupId, key, updatedAt: now },
      update: { updatedAt: now },
      select: { id: true },
    });
    await db.groupInventoryItem.deleteMany({
      where: { inventoryId: inventory.id },
    });
    const rows = pairsToRows(pairs, key).map((item) => ({
      ...item,
      inventoryId: inventory.id,
    }));
    if (rows.length) {
      await db.groupInventoryItem.createMany({ data: rows });
    }
  }

  /**
   * Plugin skill sync. Replaces the member's skill rows and, by diffing the
   * previous snapshot against the incoming one, records level/XP milestone
   * achievements. The previous snapshot is one indexed read; achievements are
   * a single `skipDuplicates` insert only when something actually crossed.
   */
  private async replaceSkills(
    db: DbClient,
    groupId: string,
    memberId: string,
    memberName: string,
    skills: Record<string, SkillPayloadValue>,
    sampledAt: Date,
  ) {
    // Read BEFORE deleting so milestone crossings can be diffed.
    const previous = await db.memberSkill.findMany({
      where: { memberId },
      select: { skillId: true, xp: true, level: true, baseLevel: true },
    });

    await db.memberSkill.deleteMany({ where: { memberId } });
    const rows = normalizeSeedSkills(skills).map((skill) => ({
      ...skill,
      memberId,
    }));
    if (rows.length) {
      await db.memberSkill.createMany({ data: rows });
      await this.xpHistory.recordXpSamples(
        memberId,
        rows.map((r) => ({ skillId: r.skillId, xp: r.xp })),
        sampledAt,
        db,
      );

      const milestones = detectSkillMilestones(memberName, previous, rows);
      if (milestones.length) {
        await db.achievement.createMany({
          data: milestones.map((m) => ({
            groupId,
            memberName: m.memberName,
            kind: AchievementKind.level,
            title: m.title,
            detail: m.detail,
            skillId: m.skillId,
            dedupeKey: m.dedupeKey,
            achievedAt: sampledAt,
          })),
          // Repeated syncs re-detect nothing, but a concurrent sync might.
          skipDuplicates: true,
        });
      }
    }
  }

  /**
   * Inventories as wire fields: inv/worn/bank under their historical names,
   * anything else in a generic `inventories` map keyed by gameval, omitted
   * entirely when there is nothing extra.
   */
  private inventoriesToWire(
    inventories: Array<{ key: string; items: InventoryRowLike[] }>,
  ) {
    const byKey = new Map<string, number[]>();
    for (const inventory of inventories) {
      byKey.set(inventory.key, rowsToPairs(inventory.items));
    }
    const extra: Record<string, number[]> = {};
    for (const [key, pairs] of byKey) {
      if (!STANDARD_INVENTORY_KEYS.has(key)) extra[key] = pairs;
    }
    return {
      inventory: byKey.get(WIRE_INVENTORIES.inventory) ?? [],
      bank: byKey.get(WIRE_INVENTORIES.bank) ?? [],
      equipment: byKey.get(WIRE_INVENTORIES.equipment) ?? [],
      ...(Object.keys(extra).length ? { inventories: extra } : {}),
    };
  }

  private toWireMember(member: MemberWithData) {
    return {
      name: member.name,
      nickname: member.nickname ?? undefined,
      discord_id: member.discordId ?? undefined,
      color: member.color ?? undefined,
      use_discord_avatar: member.useDiscordAvatar,
      online: member.online,
      last_updated: member.lastUpdated.toISOString(),
      stats: statsToArray(member),
      coordinates: [member.x, member.y, member.plane],
      ...this.inventoriesToWire(member.inventories),
      skills: skillsToWire(member.skills),
    };
  }

  /** The group's inventories presented as the "@SHARED" pseudo-member. */
  private toSharedWireMember(
    inventories: GroupInventoryWithItems[],
    updatedAt: Date,
  ) {
    return {
      name: SHARED_MEMBER,
      nickname: undefined,
      discord_id: undefined,
      color: undefined,
      use_discord_avatar: false,
      online: false,
      last_updated: updatedAt.toISOString(),
      stats: statsToArray(statsFromArray([])),
      coordinates: [0, 0, 0],
      ...this.inventoriesToWire(inventories),
      skills: skillsToWire([]),
    };
  }
}

type InventoryRowLike = { slot: number; itemId: number; quantity: number };

/** Window covered by the synthetic demo ledger. */
const LEDGER_SEED_DAYS = 14;
const LEDGER_SEED_MIN = 40;
const LEDGER_SEED_SPREAD = 21; // 40–60 entries

function seedHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Plausible shared-bank movements over the last ~14 days, spread across the
 * group's real members and the item ids actually present in its shared bank.
 * Deterministic (hashed off the group name) so reseeding is reproducible.
 */
export function buildSyntheticLedgerEntries(
  groupId: string,
  groupName: string,
  memberNames: string[],
  itemIds: number[],
  endAt = new Date(),
): Prisma.SharedBankEntryCreateManyInput[] {
  if (!memberNames.length || !itemIds.length) return [];

  const base = seedHash(groupName);
  const count = LEDGER_SEED_MIN + (base % LEDGER_SEED_SPREAD);
  const windowMs = LEDGER_SEED_DAYS * 24 * 60 * 60 * 1000;
  const rows: Prisma.SharedBankEntryCreateManyInput[] = [];

  for (let i = 0; i < count; i++) {
    const h = seedHash(`${groupName}:${i}`);
    const memberName =
      memberNames[seedHash(`m${i}${groupName}`) % memberNames.length];
    const itemId = itemIds[seedHash(`i${i}${groupName}`) % itemIds.length];
    // ~65% deposits, 35% withdrawals.
    const deposit = seedHash(`d${i}${groupName}`) % 100 < 65;
    const magnitude = 1 + (seedHash(`q${i}${groupName}`) % 40);
    // Coins-like stackables move in much larger amounts.
    const scale =
      itemId === 995 ? 25_000 * (1 + (seedHash(`s${i}${groupName}`) % 40)) : 1;
    const delta = (deposit ? 1 : -1) * magnitude * scale;
    // Evenly spread across the window, then jittered within its own slice so
    // the timeline looks organic instead of metronomic.
    const slice = 1 / count;
    const agoFraction = Math.min(
      1,
      (count - 1 - i) * slice + ((h % 1000) / 1000) * slice,
    );
    const createdAt = new Date(
      endAt.getTime() - Math.floor(agoFraction * windowMs),
    );
    rows.push({ groupId, memberName, itemId, delta, createdAt });
  }

  rows.sort((a, b) => +(a.createdAt as Date) - +(b.createdAt as Date));
  return rows;
}

export const LEDGER_LIMIT_DEFAULT = 100;
export const LEDGER_LIMIT_MIN = 1;
export const LEDGER_LIMIT_MAX = 200;

/** Clamp to 1–200; anything unparseable falls back to the default. */
export function parseLedgerLimit(raw?: string): number {
  if (raw == null || raw === '') return LEDGER_LIMIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return LEDGER_LIMIT_DEFAULT;
  const int = Math.trunc(n);
  if (int < LEDGER_LIMIT_MIN) return LEDGER_LIMIT_MIN;
  if (int > LEDGER_LIMIT_MAX) return LEDGER_LIMIT_MAX;
  return int;
}

/**
 * Prisma `createdAt` filter for the ledger query, or undefined for no bound.
 * `before` (paging cursor) and `to` (range end) both cap createdAt, so the
 * tighter of the two wins — that lets a cursor page inside a selected day.
 */
export function ledgerDateWindow(
  before?: Date,
  from?: Date,
  to?: Date,
): { lt?: Date; gte?: Date } | undefined {
  const upper =
    before && to ? new Date(Math.min(+before, +to)) : (before ?? to);
  const window = {
    ...(upper ? { lt: upper } : {}),
    ...(from ? { gte: from } : {}),
  };
  return Object.keys(window).length ? window : undefined;
}

/** ISO timestamp cursor; unparseable values are ignored (no cursor). */
export function parseLedgerCursor(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms);
}

function* chunked<T>(rows: T[], size: number): Generator<T[]> {
  for (let i = 0; i < rows.length; i += size) {
    yield rows.slice(i, i + size);
  }
}
