/**
 * The JSON shape get-group-data and the SSE stream return.
 *
 * Field names are the plugin's, not the schema's: `inventory`/`bank`/
 * `equipment` instead of the inv/worn/bank gameval keys, snake_case instead of
 * camelCase. Changing any of them breaks every shipped plugin build, so the
 * mapping is written out rather than derived from the models.
 */
import type { Member, MemberSkill } from '@prisma/client';
import { SHARED_MEMBER } from './group.types';
import {
  WIRE_INVENTORIES,
  rowsToPairs,
  statsFromArray,
  statsToArray,
} from './item-codec';
import { skillsToWire } from './skill-codec';

type InventoryRowLike = { slot: number; itemId: number; quantity: number };

/** Any inventory with its contents, member-owned or group-owned. */
type InventoryLike = { key: string; items: InventoryRowLike[] };

export type MemberWithData = Member & {
  inventories: InventoryLike[];
  skills: MemberSkill[];
};

/** Inventory keys that already have a named wire field. */
const STANDARD_INVENTORY_KEYS: ReadonlySet<string> = new Set(
  Object.values(WIRE_INVENTORIES),
);

/**
 * Inventories as wire fields: inv/worn/bank under their historical names,
 * anything else in a generic `inventories` map keyed by gameval, omitted
 * entirely when there is nothing extra.
 */
export function inventoriesToWire(inventories: InventoryLike[]) {
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

export function toWireMember(member: MemberWithData) {
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
    ...inventoriesToWire(member.inventories),
    skills: skillsToWire(member.skills),
  };
}

/**
 * A member whose light fields changed but whose inventories and skills did
 * not. Only sent when the caller opted in with `split=1`.
 *
 * `partial: true` is what tells the client to merge these fields onto its
 * cached copy instead of replacing it — without the marker, an absent `bank`
 * would be indistinguishable from an empty one.
 */
export function toPartialWireMember(member: Member) {
  return {
    name: member.name,
    partial: true as const,
    nickname: member.nickname ?? undefined,
    discord_id: member.discordId ?? undefined,
    color: member.color ?? undefined,
    use_discord_avatar: member.useDiscordAvatar,
    online: member.online,
    last_updated: member.lastUpdated.toISOString(),
    stats: statsToArray(member),
    coordinates: [member.x, member.y, member.plane],
  };
}

/** The group's inventories presented as the "@SHARED" pseudo-member. */
export function toSharedWireMember(
  inventories: InventoryLike[],
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
    ...inventoriesToWire(inventories),
    skills: skillsToWire([]),
  };
}

/** One entry in the payload: a full member, light fields only, or a name-only stub. */
export type WireEntry =
  | { name: string }
  | ReturnType<typeof toWireMember>
  | ReturnType<typeof toPartialWireMember>;
