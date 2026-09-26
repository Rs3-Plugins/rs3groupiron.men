import {
  LIFE_POINTS_PER_LEVEL,
  SKILLS,
  lifePointsForLevel,
  type SkillCurve,
  type SkillId,
} from './skills';

/**
 * Life points, not a Constitution level.
 *
 * Maximum is always derived from the Constitution level (100 per level), so
 * the bar is right even when a client reports the cap oddly. The current value
 * is what the client sent, clamped to the maximum.
 *
 * A client that reports the level rather than life points (99 where 9900 is
 * expected) is scaled up, so the bar is never stuck near empty.
 */
function healthFromStats(
  stats: number[],
  skills: PlayerSkill[],
): { current: number; max: number } {
  const constitution = skills.find((s) => s.id === 'constitution');
  const max = lifePointsForLevel(constitution?.baseLevel ?? 0);

  let current = Math.max(0, Math.floor(stats[0] ?? 0));
  // Below a tenth of the cap almost certainly means levels, not life points.
  if (current > 0 && current * LIFE_POINTS_PER_LEVEL <= max) {
    current *= LIFE_POINTS_PER_LEVEL;
  }
  return { current: Math.min(current, max), max };
}

export type WireSkill = {
  id: string;
  xp: number;
  level: number;
  baseLevel: number;
};

export type WireMember = {
  name: string;
  nickname?: string;
  discord_id?: string;
  color?: string;
  use_discord_avatar?: boolean;
  online?: boolean;
  last_updated?: string;
  stats?: number[];
  coordinates?: number[];
  inventory?: number[];
  bank?: number[];
  equipment?: number[];
  /** Any further inventories keyed by RS3 inv gameval (e.g. money_pouch). */
  inventories?: Record<string, number[]>;
  skills?: WireSkill[];
};

/** Delta-poll placeholder: member unchanged since `from_time`. */
export type WireMemberStub = { name: string };

/**
 * Delta-poll partial: the member moved (or their vitals/profile changed) but
 * their inventories and skills did not, so those are omitted and merged from
 * the cached copy. Only sent when the request asked for `split=1`.
 */
export type WirePartialMember = {
  name: string;
  partial: true;
  nickname?: string;
  discord_id?: string;
  color?: string;
  use_discord_avatar?: boolean;
  online?: boolean;
  last_updated?: string;
  stats?: number[];
  coordinates?: number[];
};

export type WireEntry = WireMember | WireMemberStub | WirePartialMember;

export function isPartialMember(member: WireEntry): member is WirePartialMember {
  return 'partial' in member && member.partial === true;
}

export function isFullMember(member: WireEntry): member is WireMember {
  // Partial entries also carry last_updated, so they must be excluded first or
  // they would be mistaken for complete members and wipe the cached items.
  return !isPartialMember(member) && 'last_updated' in member;
}

export type ItemStack = {
  id: number;
  quantity: number;
};

export type PlayerSkill = {
  id: SkillId;
  name: string;
  icon: string;
  xp: number;
  level: number;
  baseLevel: number;
  maxLevel: number;
  /** Elite skills need their own curve for "XP to next level". */
  curve?: SkillCurve;
};

export type PlayerView = {
  name: string;
  nickname: string | null;
  displayName: string;
  discordId: string | null;
  /** Discord CDN URL when available; display uses avatarUrl. */
  discordAvatarUrl: string | null;
  /** Resolved avatar for map/panel (null when Discord avatar is off). */
  avatarUrl: string | null;
  useDiscordAvatar: boolean;
  online: boolean;
  /** Game world the member is on, or 0 when the plugin hasn't reported one. */
  world: number;
  lastSeen: string | null;
  avatarColor: string;
  health: { current: number; max: number };
  prayer: { current: number; max: number };
  summoning: { current: number; max: number };
  coordinates: number[];
  inventory: ItemStack[];
  bank: ItemStack[];
  equipment: ItemStack[];
  skills: PlayerSkill[];
  totalLevel: number;
  /** Change key used by membersToPlayers() to reuse unchanged views. */
  viewKey?: string;
};

export type GroupItemShare = {
  player: string;
  quantity: number;
};

export type GroupItem = {
  id: number;
  name: string;
  quantity: number;
  shares: GroupItemShare[];
};

const SHARED = '@SHARED';

const ITEM_NAMES: Record<number, string> = {
  995: 'Coins',
  4151: 'Abyssal whip',
  11694: 'Armadyl godsword',
  1127: 'Rune platebody',
  1079: 'Rune platelegs',
  1351: 'Bronze axe',
  1265: 'Bronze pickaxe',
  1511: 'Logs',
  440: 'Iron ore',
  554: 'Fire rune',
  560: 'Death rune',
  565: 'Blood rune',
  6685: 'Saradomin brew',
  3024: 'Super restore',
  15259: 'Dragon hatchet',
  2434: 'Prayer potion',
  23351: 'Elder overload',
  23354: 'Holy agony',
};

export function itemIconUrl(itemId: number) {
  return `https://chisel.weirdgloop.org/gazproj/icons/png/${itemId}.png`;
}

export function itemName(itemId: number) {
  return ITEM_NAMES[itemId] ?? `Item ${itemId}`;
}

export function unpackPairs(pairs: number[] | undefined): ItemStack[] {
  if (!pairs?.length) return [];
  const out: ItemStack[] = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const id = pairs[i] ?? 0;
    const quantity = pairs[i + 1] ?? 0;
    if (id > 0 && quantity > 0) out.push({ id, quantity });
  }
  return out;
}

export function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hues = [120, 85, 40, 200, 280, 160];
  const h = hues[hash % hues.length];
  return hslToHex(h, 42, 38);
}

function hslToHex(h: number, s: number, l: number) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function resolveAvatarColor(name: string, color?: string | null) {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  return colorForName(name);
}

/** Discord default avatar from snowflake (custom avatars need the Discord API). */
export function discordAvatarUrl(discordId: string | null | undefined): string | null {
  if (!discordId || !/^\d{17,20}$/.test(discordId)) return null;
  const index = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function toPlayerView(member: WireMember): PlayerView | null {
  if (!member.name || member.name === SHARED) return null;
  const stats = member.stats ?? [];
  const skillById = new Map((member.skills ?? []).map((s) => [s.id, s]));
  const skills: PlayerSkill[] = SKILLS.map((def) => {
    const row = skillById.get(def.id);
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      xp: row?.xp ?? 0,
      // Constitution starts at 10; every other skill at 1.
      level: Math.max(def.minLevel ?? 1, row?.level ?? 1),
      baseLevel: Math.max(def.minLevel ?? 1, row?.baseLevel ?? 1),
      maxLevel: def.maxLevel,
      curve: def.curve,
    };
  });
  const nickname = member.nickname?.trim() || null;
  const discordId = member.discord_id?.trim() || null;
  const discordUrl = discordAvatarUrl(discordId);
  const useDiscordAvatar = member.use_discord_avatar !== false;

  return {
    name: member.name,
    nickname,
    displayName: nickname || member.name,
    discordId,
    discordAvatarUrl: discordUrl,
    useDiscordAvatar,
    avatarUrl: useDiscordAvatar ? discordUrl : null,
    online: member.online === true,
    world: stats[6] ?? 0,
    lastSeen: member.last_updated ?? null,
    avatarColor: resolveAvatarColor(member.name, member.color),
    health: healthFromStats(stats, skills),
    prayer: { current: stats[2] ?? 0, max: stats[3] ?? 0 },
    summoning: { current: stats[4] ?? 0, max: stats[5] ?? 0 },
    coordinates: member.coordinates ?? [],
    inventory: unpackPairs(member.inventory),
    bank: unpackPairs(member.bank),
    equipment: unpackPairs(member.equipment),
    skills,
    totalLevel: skills.reduce((sum, s) => sum + s.baseLevel, 0),
  };
}

/**
 * Identity of everything that feeds a PlayerView. Profile edits don't bump
 * last_updated on the server, so they are part of the key too.
 */
function memberViewKey(member: WireMember) {
  return [
    member.last_updated ?? '',
    member.nickname ?? '',
    member.discord_id ?? '',
    member.color ?? '',
    member.use_discord_avatar === false ? '0' : '1',
    member.online === true ? '1' : '0',
  ].join('|');
}

/**
 * Convert wire members to PlayerViews (shared bank skipped). When `prev` is
 * given, members whose data hasn't changed keep their previous PlayerView
 * object so memoised children don't re-render.
 */
export function membersToPlayers(
  members: WireMember[],
  prev: PlayerView[] = [],
): PlayerView[] {
  const prevByName = new Map(prev.map((p) => [p.name, p]));
  const out: PlayerView[] = [];
  for (const member of members) {
    const key = memberViewKey(member);
    const cached = prevByName.get(member.name);
    if (cached && cached.viewKey === key) {
      out.push(cached);
      continue;
    }
    const view = toPlayerView(member);
    if (view) out.push({ ...view, viewKey: key });
  }
  return out;
}

/** Aggregate inventory + bank + shared bank across members for the Items tab. */
export function aggregateGroupItems(members: WireMember[]): GroupItem[] {
  const map = new Map<number, Map<string, number>>();

  for (const member of members) {
    const stacks = [
      ...unpackPairs(member.inventory),
      ...unpackPairs(member.bank),
      ...unpackPairs(member.equipment),
    ];
    const label = member.name === SHARED ? 'Shared bank' : member.name;
    for (const stack of stacks) {
      let byPlayer = map.get(stack.id);
      if (!byPlayer) {
        byPlayer = new Map();
        map.set(stack.id, byPlayer);
      }
      byPlayer.set(label, (byPlayer.get(label) ?? 0) + stack.quantity);
    }
  }

  const items: GroupItem[] = [];
  for (const [id, byPlayer] of map) {
    const shares = [...byPlayer.entries()]
      .map(([player, quantity]) => ({ player, quantity }))
      .sort((a, b) => b.quantity - a.quantity);
    items.push({
      id,
      name: itemName(id),
      quantity: shares.reduce((sum, s) => sum + s.quantity, 0),
      shares,
    });
  }

  return items.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

export function formatQty(n: number) {
  return n.toLocaleString();
}
