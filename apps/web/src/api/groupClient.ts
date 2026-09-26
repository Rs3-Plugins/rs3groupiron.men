import type { WireMember, WireMemberStub } from '../lib/items';

const DEMO_GROUP = 'Demo Group';

export type GroupMode = 'normal' | 'competitive';
export type AppearanceTheme = 'rs3' | 'modern';
export type XpHistoryPeriod = '24h' | '7d' | '30d' | '365d';

export type GroupInfo = {
  ok: boolean;
  name: string;
  token?: string;
  mode: GroupMode;
  appearance: AppearanceTheme;
  member_count: number;
  member_slots: number;
};

export type XpHistoryResponse = {
  period: XpHistoryPeriod;
  skill: string;
  from: string;
  to: string;
  series: Array<{
    name: string;
    points: Array<{ t: string; gain: number }>;
  }>;
  players: Array<{
    name: string;
    totalGain: number;
    skills: Array<{ id: string; name: string; gain: number }>;
  }>;
};

/** One shared-bank movement. `delta` > 0 deposited, < 0 withdrawn. */
export type BankLedgerEntry = {
  id: string;
  name: string;
  item_id: number;
  delta: number;
  at: string;
};

export type BankLedgerResponse = {
  entries: BankLedgerEntry[];
  has_more: boolean;
};

/**
 * Response of get-group-data. With `from_time`, members whose last_updated is
 * older than that timestamp come back as `{ name }` only.
 */
export type GroupDataResponse = Array<WireMember | WireMemberStub>;

type ApiInit = RequestInit & { token?: string };

async function parseErrorMessage(res: Response) {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (typeof body.message === 'string') message = body.message;
    else if (Array.isArray(body.message)) message = body.message.join(', ');
  } catch {
    /* ignore non-JSON bodies */
  }
  return message;
}

async function api<T>(path: string, { token, ...init }: ApiInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: token } : {}),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return (await res.json()) as T;
}

function groupPath(groupName: string, endpoint: string) {
  return `/api/group/${encodeURIComponent(groupName)}/${endpoint}`;
}

/**
 * Fetch group members. Pass `fromTime` (ISO) to get a delta: members not
 * updated since then are returned as `{ name }` stubs.
 */
export async function fetchGroupData(
  groupName = DEMO_GROUP,
  token = '',
  fromTime?: string,
): Promise<GroupDataResponse> {
  const query = fromTime ? `?${new URLSearchParams({ from_time: fromTime })}` : '';
  return api(`${groupPath(groupName, 'get-group-data')}${query}`, { token });
}

// playerMoved / setMemberOnline mirror the endpoints the game plugin calls;
// the web UI only uses them for demo/testing tooling.
export async function playerMoved(
  groupName: string,
  token: string,
  body: { name: string; coordinates: number[] },
) {
  return api<{
    ok: boolean;
    name: string;
    online: boolean;
    coordinates: number[];
    updated_at: string;
  }>(groupPath(groupName, 'player-moved'), {
    token,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function setMemberOnline(
  groupName: string,
  token: string,
  body: { name: string; online: boolean },
) {
  return api<{
    ok: boolean;
    name: string;
    online: boolean;
    updated_at: string;
  }>(groupPath(groupName, 'set-member-online'), {
    token,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchGroupInfo(
  groupName = DEMO_GROUP,
  token = '',
): Promise<GroupInfo> {
  return api(groupPath(groupName, 'am-i-logged-in'), { token });
}

export async function fetchXpHistory(
  groupName = DEMO_GROUP,
  token = '',
  period: XpHistoryPeriod = '24h',
  skill = 'overall',
  signal?: AbortSignal,
): Promise<XpHistoryResponse> {
  const params = new URLSearchParams({ period, skill });
  return api(`${groupPath(groupName, 'xp-history')}?${params}`, { token, signal });
}

/**
 * Shared ("group") bank movements, newest first. Pass the `at` of the last
 * entry you hold as `before` to page backwards through history.
 */
export async function fetchBankLedger(
  groupName = DEMO_GROUP,
  token = '',
  opts: {
    limit?: number;
    before?: string;
    /** ISO instant, inclusive. With `to`, bounds one calendar day. */
    from?: string;
    /** ISO instant, exclusive. */
    to?: string;
    signal?: AbortSignal;
  } = {},
): Promise<BankLedgerResponse> {
  const { limit = 100, before, from, to, signal } = opts;
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return api(`${groupPath(groupName, 'bank-ledger')}?${params}`, { token, signal });
}

/** What kind of thing a member achieved. */
export type AchievementKind = 'level' | 'drop' | 'quest' | 'diary' | 'other';

/** One group achievement. Every field after `kind`/`title` may be absent. */
export type Achievement = {
  id: string;
  name: string;
  kind: AchievementKind;
  title: string;
  detail: string | null;
  skill_id: string | null;
  item_id: number | null;
  /** RS3 gameval name for quests/diaries, e.g. quest_cooks_assistant. */
  gameval: string | null;
  image_url: string | null;
  at: string;
};

export type AchievementsResponse = {
  entries: Achievement[];
  has_more: boolean;
};

/**
 * Group achievement feed, newest first. Pass the `at` of the last entry you
 * hold as `before` to page backwards; `kind`/`member` filter server-side so
 * the paging stays correct across the whole history.
 */
export async function fetchAchievements(
  groupName = DEMO_GROUP,
  token = '',
  opts: {
    limit?: number;
    /** ISO instant of the oldest entry you hold (exclusive cursor). */
    before?: string;
    kind?: AchievementKind;
    member?: string;
    /** ISO instant, inclusive. With `to`, bounds one calendar day. */
    from?: string;
    /** ISO instant, exclusive. */
    to?: string;
    signal?: AbortSignal;
  } = {},
): Promise<AchievementsResponse> {
  const { limit = 50, before, kind, member, from, to, signal } = opts;
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  if (kind) params.set('kind', kind);
  if (member) params.set('member', member);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return api(`${groupPath(groupName, 'achievements')}?${params}`, { token, signal });
}

/** Per-member quest progress; only started/finished quests are listed. */
export type MemberQuests = {
  name: string;
  quests: Record<string, 'started' | 'finished'>;
};

export type QuestsResponse = {
  members: MemberQuests[];
};

export async function fetchQuests(
  groupName = DEMO_GROUP,
  token = '',
  signal?: AbortSignal,
): Promise<QuestsResponse> {
  return api(groupPath(groupName, 'quests'), { token, signal });
}

export async function addGroupMember(
  groupName: string,
  token: string,
  body: {
    name: string;
    nickname?: string;
    discord_id?: string;
    color?: string;
    use_discord_avatar?: boolean;
  },
) {
  return api(groupPath(groupName, 'add-group-member'), {
    token,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteGroupMember(
  groupName: string,
  token: string,
  name: string,
) {
  return api(groupPath(groupName, 'delete-group-member'), {
    token,
    method: 'DELETE',
    body: JSON.stringify({ name }),
  });
}

export async function updateMemberProfile(
  groupName: string,
  token: string,
  body: {
    name: string;
    nickname?: string | null;
    discord_id?: string | null;
    color?: string | null;
    use_discord_avatar?: boolean;
  },
) {
  return api(groupPath(groupName, 'update-member-profile'), {
    token,
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function updateGroupSettings(
  groupName: string,
  token: string,
  body: {
    appearance?: AppearanceTheme;
    mode?: GroupMode;
    name?: string;
  },
) {
  return api<GroupInfo>(groupPath(groupName, 'update-group-settings'), {
    token,
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export type CreateGroupResult = {
  name: string;
  mode: GroupMode;
  appearance: AppearanceTheme;
  member_slots: number;
  member_names: string[];
  token: string;
};

export async function createGroup(body: {
  name: string;
  mode: GroupMode;
  member_slots: number;
  member_names: string[];
}): Promise<CreateGroupResult> {
  return api('/api/create-group', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export { DEMO_GROUP };
