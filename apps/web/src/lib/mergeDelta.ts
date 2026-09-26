import {
  isFullMember,
  isPartialMember,
  type WireEntry,
  type WireMember,
} from './items';

export type GroupCache = {
  members: WireMember[];
  /** Max last_updated in `members`; sent as from_time on delta polls. */
  since: string | null;
};

export function maxLastUpdated(members: WireMember[]) {
  let max: string | null = null;
  for (const m of members) {
    if (m.last_updated && (!max || m.last_updated > max)) max = m.last_updated;
  }
  return max;
}

/**
 * Merge a delta response into the cached members. Three shapes arrive:
 *
 *   `{ name }`           unchanged — keep the cached member
 *   `{ partial: true }`  light fields only — merge over the cached one so
 *                        inventories and skills survive
 *   full member          replace
 *
 * Returns null for an entry naming a member the cache has never seen: there is
 * nothing to merge into, so the caller must do a full refetch.
 */
export function mergeDelta(cache: GroupCache, response: WireEntry[]) {
  const byName = new Map(cache.members.map((m) => [m.name, m]));
  const merged: WireMember[] = [];
  let changed = response.length !== cache.members.length;

  for (let i = 0; i < response.length; i++) {
    const entry = response[i]!;
    const cached = byName.get(entry.name);

    if (isPartialMember(entry)) {
      if (!cached) return null;
      // Identical timestamp means nothing actually moved; reuse the same object
      // so React sees no change.
      if (cached.last_updated === entry.last_updated) {
        if (cache.members[i] !== cached) changed = true;
        merged.push(cached);
        continue;
      }
      const { partial: _partial, ...light } = entry;
      merged.push({ ...cached, ...light });
      changed = true;
      continue;
    }

    if (isFullMember(entry)) {
      // Server uses `lastUpdated < from_time`, so the newest member comes back
      // in full every poll; keep the cached object when nothing moved.
      if (cached && cached.last_updated === entry.last_updated) {
        if (cache.members[i] !== cached) changed = true;
        merged.push(cached);
      } else {
        merged.push(entry);
        changed = true;
      }
      continue;
    }

    if (!cached) return null;
    if (cache.members[i] !== cached) changed = true;
    merged.push(cached);
  }

  return { merged, changed };
}
