/**
 * Gamevals are RS3's stable symbolic names for cache ids (e.g. quest 12 is
 * `quest_cooks_assistant`). Ids can be renumbered between cache revisions;
 * names do not. We store names for anything long-lived (quest/achievement
 * completion keys) and resolve id <-> name through these tables.
 *
 * Item (`obj`) ids are effectively permanent in RS3, so items stay as ints
 * and are deliberately not loaded here. Var tables (varp/varbit/varc/...) are
 * loaded so the plugin can address game state by name rather than by an id
 * that shifts with the cache.
 *
 * Pure parsing/lookup only: no Nest or filesystem access, so it is unit
 * testable. The service layer owns file IO.
 */

export const GAMEVAL_KINDS = [
  'achievement',
  'quest',
  'inv',
  // Var* tables are the ones most prone to renumbering between revisions.
  'var_clan',
  'var_clan_setting',
  'var_client',
  'var_npc',
  'var_object',
  'var_player',
  'var_player_group',
] as const;
export type GamevalKind = (typeof GAMEVAL_KINDS)[number];

export function isGamevalKind(raw: string): raw is GamevalKind {
  return (GAMEVAL_KINDS as readonly string[]).includes(raw);
}

/** Shape of a gameval dump: `{ revision, url?, date?, entries: { "<id>": "<name>" } }`. */
export type GamevalFile = {
  revision: number;
  url?: string;
  date?: string;
  entries: Record<string, string>;
};

export type GamevalTable = {
  kind: GamevalKind;
  /** Cache revision the dump was produced from (0 when unknown). */
  revision: number;
  idToName: ReadonlyMap<number, string>;
  nameToId: ReadonlyMap<string, number>;
};

/** Gameval names are `[a-z0-9_]`; anything else is not a gameval. */
const NAME_PATTERN = /^[a-z0-9_]{1,128}$/;

export function isGamevalName(raw: string): boolean {
  return NAME_PATTERN.test(raw);
}

export function emptyGamevalTable(kind: GamevalKind): GamevalTable {
  return { kind, revision: 0, idToName: new Map(), nameToId: new Map() };
}

/**
 * Parse one dump into a lookup table. Malformed entries (non-integer ids,
 * empty or non-string names) are skipped rather than failing the whole file
 * so a slightly odd dump still loads. Duplicate names keep the LOWEST id,
 * so `idOf` is deterministic.
 */
export function parseGamevalFile(
  kind: GamevalKind,
  raw: unknown,
): GamevalTable {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`gameval ${kind}: file is not a JSON object`);
  }
  const file = raw as Partial<GamevalFile>;
  if (!file.entries || typeof file.entries !== 'object') {
    throw new Error(`gameval ${kind}: missing "entries" object`);
  }

  const revision =
    typeof file.revision === 'number' && Number.isFinite(file.revision)
      ? Math.trunc(file.revision)
      : 0;

  const idToName = new Map<number, string>();
  const nameToId = new Map<string, number>();

  for (const [rawId, name] of Object.entries(file.entries)) {
    if (!/^\d+$/.test(rawId)) continue;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id)) continue;
    if (typeof name !== 'string' || !isGamevalName(name)) continue;

    idToName.set(id, name);
    const existing = nameToId.get(name);
    if (existing === undefined || id < existing) nameToId.set(name, id);
  }

  return { kind, revision, idToName, nameToId };
}

/** Achievement kinds that carry a gameval, mapped to the table they live in. */
export const ACHIEVEMENT_KIND_TO_GAMEVAL: Readonly<
  Record<string, GamevalKind | undefined>
> = {
  quest: 'quest',
  diary: 'achievement',
  other: 'achievement',
};

/**
 * Stable dedupe key for a gameval-backed achievement. Uses the name, not the
 * id, so a cache renumbering can never make an old completion look new.
 */
export function gamevalDedupeKey(
  memberName: string,
  kind: GamevalKind,
  name: string,
): string {
  return `gameval:${memberName}:${kind}:${name}`;
}
