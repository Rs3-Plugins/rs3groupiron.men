import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_QUEST_UPDATES, QUEST_STATE_INPUTS } from './quests';

/**
 * RS3 group member vitals packed as:
 * [hpCur, hpMax, prayCur, prayMax, summonCur, summonMax, world?]
 */
export type MemberStats = number[];

/** Flat [itemId, qty, itemId, qty, ...] */
export type ItemPairs = number[];

export type WireSkill = {
  id: string;
  xp: number;
  level: number;
  baseLevel: number;
};

export type SkillPayloadValue =
  number | { xp?: number; level?: number; baseLevel?: number };

export type GroupMember = {
  name: string;
  nickname?: string;
  discord_id?: string;
  color?: string;
  use_discord_avatar?: boolean;
  online?: boolean;
  last_updated: string;
  stats: MemberStats;
  coordinates: number[];
  inventory: ItemPairs;
  bank: ItemPairs;
  equipment: ItemPairs;
  /** Extra inventories keyed by inv gameval; absent when there are none. */
  inventories?: Record<string, ItemPairs>;
  skills?: Record<string, SkillPayloadValue>;
  shared_bank?: ItemPairs;
  deposited?: ItemPairs;
};

export type GroupRecord = {
  name: string;
  token: string;
  mode?: 'normal' | 'competitive';
  appearance?: 'rs3' | 'modern';
  member_slots?: number;
  created_at: string;
  members: GroupMember[];
};

export type StoreFile = {
  groups: GroupRecord[];
};

export const SHARED_MEMBER = '@SHARED';
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 5;
export const MAX_NAME_LENGTH = 16;

/** Upper bound on any incoming name string before service-level validation. */
const MAX_INPUT_NAME = 50;

export const MAX_STATS = 16;
export const MAX_COORDINATES = 3;
export const MAX_INVENTORY = 56;
export const MAX_EQUIPMENT = 40;
export const MAX_BANK = 4000;
export const MAX_DEPOSITED = 4000;
export const MAX_SHARED_BANK = 4000;
export const MAX_MEMBER_NAMES = 10;
/** Distinct inventories one update may carry (inv, worn, bank, pouches...). */
export const MAX_INVENTORIES = 32;

export const MAX_ACHIEVEMENT_TITLE = 120;
export const MAX_ACHIEVEMENT_DETAIL = 300;
export const MAX_ACHIEVEMENT_IMAGE_URL = 500;
export const MAX_GAMEVAL_NAME = 128;

/** Postgres Int4 upper bound; larger values would 500 inside Prisma. */
const MAX_INT32 = 2_147_483_647;

export class CreateGroupBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;

  /** normal | competitive — defaults to normal */
  @IsOptional()
  @IsIn(['normal', 'competitive'])
  mode?: 'normal' | 'competitive';

  /** Fixed capacity 2–5; must match member_names length when provided. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_MEMBERS)
  @Max(MAX_MEMBERS)
  member_slots?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEMBER_NAMES)
  @IsString({ each: true })
  @MaxLength(MAX_INPUT_NAME, { each: true })
  member_names?: string[];
}

export class UpdateMemberBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;

  /** Vitals may arrive as doubles from the plugin; rounded server-side. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_STATS)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @Min(0, { each: true })
  @Max(MAX_INT32, { each: true })
  stats?: MemberStats;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COORDINATES)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @Min(0, { each: true })
  @Max(MAX_INT32, { each: true })
  coordinates?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INVENTORY)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_INT32, { each: true })
  inventory?: ItemPairs;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BANK)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_INT32, { each: true })
  bank?: ItemPairs;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EQUIPMENT)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_INT32, { each: true })
  equipment?: ItemPairs;

  /** Keyed by skill id; values validated in the service. */
  @IsOptional()
  @IsObject()
  skills?: Record<string, SkillPayloadValue>;

  /**
   * Any inventory keyed by its RS3 inv gameval (e.g. money_pouch), each a
   * flat [itemId, qty, ...] list. `inventory`/`equipment`/`bank` above are
   * shorthands for the inv/worn/bank keys. Validated in the service.
   */
  @IsOptional()
  @IsObject()
  inventories?: Record<string, ItemPairs>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SHARED_BANK)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_INT32, { each: true })
  shared_bank?: ItemPairs;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DEPOSITED)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_INT32, { each: true })
  deposited?: ItemPairs;
}

export class MemberNameBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;
}

export class AddMemberBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  discord_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;

  @IsOptional()
  @IsBoolean()
  use_discord_avatar?: boolean;
}

export class UpdateMemberProfileBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  nickname?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  discord_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  use_discord_avatar?: boolean;
}

/** Lightweight location ping from the plugin / client. */
export class PlayerMovedBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;

  /** [x, y] or [x, y, plane]; doubles accepted and rounded server-side. */
  @IsArray()
  @ArrayMaxSize(MAX_COORDINATES)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @Min(0, { each: true })
  @Max(MAX_INT32, { each: true })
  coordinates!: number[];
}

/** Mark a member online or offline (plugin login/logout / heartbeat). */
export class SetMemberOnlineBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;

  @IsBoolean()
  online!: boolean;
}

export class UpdateGroupSettingsBody {
  @IsOptional()
  @IsIn(['rs3', 'modern'])
  appearance?: 'rs3' | 'modern';

  @IsOptional()
  @IsIn(['normal', 'competitive'])
  mode?: 'normal' | 'competitive';

  /** Rename the group (unique). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name?: string;
}

export class RenameMemberBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  original_name!: string;

  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  new_name!: string;
}

/** Plugin/web posted achievement. `image_url` is CDN-restricted in the service. */
export class CreateAchievementBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;

  @IsIn(['level', 'drop', 'quest', 'diary', 'other'])
  kind!: 'level' | 'drop' | 'quest' | 'diary' | 'other';

  @IsString()
  @MaxLength(MAX_ACHIEVEMENT_TITLE)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ACHIEVEMENT_DETAIL)
  detail?: string;

  /** Must exist in the skills catalog; checked in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  skill_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_INT32)
  item_id?: number;

  /**
   * RS3 gameval name for quest/diary/other kinds, e.g. quest_cooks_assistant.
   * Must exist in the gameval table for the kind; checked in the service.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_GAMEVAL_NAME)
  gameval?: string;

  /**
   * Cache id alternative to `gameval` for plugins that only see ids. Resolved
   * to the name server-side; ignored when `gameval` is also given.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_INT32)
  gameval_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ACHIEVEMENT_IMAGE_URL)
  image_url?: string;

  /** ISO timestamp; unparseable values fall back to now. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  achieved_at?: string;
}

/** One quest reference: `gameval` wins over `quest_id` when both are sent. */
export class QuestStateInput {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_INT32)
  quest_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_GAMEVAL_NAME)
  gameval?: string;

  @IsIn(QUEST_STATE_INPUTS)
  state!: (typeof QUEST_STATE_INPUTS)[number];
}

/**
 * Plugin-posted quest progress. Send `full: true` with the member's whole
 * quest list (e.g. on login) so anything missing is reset to not started;
 * otherwise only the listed quests change.
 */
export class UpdateMemberQuestsBody {
  @IsString()
  @MaxLength(MAX_INPUT_NAME)
  name!: string;

  @IsArray()
  @ArrayMaxSize(MAX_QUEST_UPDATES)
  @ValidateNested({ each: true })
  @Type(() => QuestStateInput)
  quests!: QuestStateInput[];

  @IsOptional()
  @IsBoolean()
  full?: boolean;
}
