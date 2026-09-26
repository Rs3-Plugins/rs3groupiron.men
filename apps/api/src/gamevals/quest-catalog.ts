/**
 * Static quest metadata from the client's quest dump (`data/quests.json`),
 * keyed by gameval name. The API only needs display names (for achievement
 * titles) and quest points; the web ships its own copy for everything else.
 */

export type QuestCatalogEntry = {
  gameval: string;
  name: string;
  questPoints: number;
};

type RawQuest = {
  id?: number;
  quest_gameval?: string | null;
  name?: string | null;
  questPoints?: number | null;
};

/** Parse the dump. Entries without a gameval or display name are skipped. */
export function parseQuestCatalog(
  raw: unknown,
): ReadonlyMap<string, QuestCatalogEntry> {
  if (!Array.isArray(raw)) {
    throw new Error('quests.json: expected a JSON array');
  }
  const out = new Map<string, QuestCatalogEntry>();
  for (const item of raw as RawQuest[]) {
    const gameval = item?.quest_gameval?.trim();
    const name = item?.name?.trim();
    if (!gameval || !name) continue;
    const questPoints =
      typeof item.questPoints === 'number' && Number.isFinite(item.questPoints)
        ? Math.max(0, Math.trunc(item.questPoints))
        : 0;
    // First occurrence wins so lookups stay deterministic.
    if (!out.has(gameval)) out.set(gameval, { gameval, name, questPoints });
  }
  return out;
}

/** `cooks_assistant` -> `Cooks assistant`; last resort when the dump lacks a quest. */
export function humanizeGameval(gameval: string): string {
  const words = gameval.replace(/_+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : gameval;
}
