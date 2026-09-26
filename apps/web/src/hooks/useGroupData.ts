import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchGroupData,
  fetchGroupInfo,
  type GroupDataResponse,
  type GroupInfo,
} from '../api/groupClient';
import {
  isFullMember,
  membersToPlayers,
  type PlayerView,
  type WireMember,
} from '../lib/items';
import { FULL_REFRESH_EVERY_N_POLLS } from '../lib/polling';

export type GroupData = {
  players: PlayerView[];
  rawMembers: WireMember[];
  info: GroupInfo | null;
  loading: boolean;
  error: string | null;
  /** Full refetch of members + info. Sets `error` on failure. */
  refresh: () => Promise<void>;
  /** Locally patch the player list (demo tooling only; overwritten by next poll). */
  patchPlayers: (update: (prev: PlayerView[]) => PlayerView[]) => void;
};

type Cache = {
  members: WireMember[];
  /** Max last_updated in `members`; sent as from_time on delta polls. */
  since: string | null;
};

function maxLastUpdated(members: WireMember[]) {
  let max: string | null = null;
  for (const m of members) {
    if (m.last_updated && (!max || m.last_updated > max)) max = m.last_updated;
  }
  return max;
}

/**
 * Merge a delta response into the cached full members.
 * Returns null when a stub refers to an unknown member (need a full refetch).
 */
function mergeDelta(cache: Cache, response: GroupDataResponse) {
  const byName = new Map(cache.members.map((m) => [m.name, m]));
  const merged: WireMember[] = [];
  let changed = response.length !== cache.members.length;
  for (let i = 0; i < response.length; i++) {
    const entry = response[i]!;
    const cached = byName.get(entry.name);
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

function samePlayers(a: PlayerView[], b: PlayerView[]) {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

export function useGroupData(groupName: string, token: string, pollMs: number): GroupData {
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [rawMembers, setRawMembers] = useState<WireMember[]>([]);
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Cache | null>(null);
  const playersRef = useRef<PlayerView[]>([]);
  const pollCountRef = useRef(0);
  const inFlightRef = useRef(false);
  // Bumped on group/token change so stale responses are ignored.
  const generationRef = useRef(0);
  // Every request gets a sequence number; a response older than the last
  // committed one is dropped so a slow delta can't overwrite a newer refresh.
  const seqRef = useRef(0);
  const committedSeqRef = useRef(0);
  const failCountRef = useRef(0);

  const commit = useCallback((seq: number, members: WireMember[]) => {
    if (seq < committedSeqRef.current) return;
    committedSeqRef.current = seq;
    cacheRef.current = { members, since: maxLastUpdated(members) };
    setRawMembers(members);
    const next = membersToPlayers(members, playersRef.current);
    if (!samePlayers(next, playersRef.current)) {
      playersRef.current = next;
      setPlayers(next);
    }
  }, []);

  const load = useCallback(
    async (opts: { full: boolean; withInfo: boolean }) => {
      const generation = generationRef.current;
      const seq = ++seqRef.current;
      const cache = cacheRef.current;
      const delta = !opts.full && cache?.since ? cache.since : undefined;

      const [data, nextInfo] = await Promise.all([
        fetchGroupData(groupName, token, delta),
        opts.withInfo ? fetchGroupInfo(groupName, token) : Promise.resolve(null),
      ]);
      if (generation !== generationRef.current) return;
      // A newer response already landed; this one is stale.
      if (seq < committedSeqRef.current) return;

      if (nextInfo) setInfo(nextInfo);

      if (!delta) {
        commit(seq, data.filter(isFullMember));
        return;
      }
      const result = mergeDelta(cacheRef.current ?? { members: [], since: null }, data);
      if (!result) {
        // Unknown member in delta response: fall back to a full fetch.
        const full = await fetchGroupData(groupName, token);
        if (generation !== generationRef.current) return;
        commit(seq, full.filter(isFullMember));
        return;
      }
      if (result.changed) commit(seq, result.merged);
      else committedSeqRef.current = Math.max(committedSeqRef.current, seq);
    },
    [groupName, token, commit],
  );

  const refresh = useCallback(async () => {
    try {
      await load({ full: true, withInfo: true });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group');
    }
  }, [load]);

  const patchPlayers = useCallback((update: (prev: PlayerView[]) => PlayerView[]) => {
    const next = update(playersRef.current);
    playersRef.current = next;
    setPlayers(next);
  }, []);

  const needFullRef = useRef(true);

  // Reset everything when the group (or token) changes.
  useEffect(() => {
    generationRef.current += 1;
    cacheRef.current = null;
    playersRef.current = [];
    pollCountRef.current = 0;
    inFlightRef.current = false;
    committedSeqRef.current = 0;
    failCountRef.current = 0;
    needFullRef.current = true;
    setPlayers([]);
    setRawMembers([]);
    setLoading(true);
    setError(null);
  }, [groupName, token]);

  // Poll loop. Re-created on cadence change without dropping cached data.
  useEffect(() => {
    const generation = generationRef.current;

    async function tick() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      pollCountRef.current += 1;
      const initial = cacheRef.current === null;
      const periodic = pollCountRef.current % FULL_REFRESH_EVERY_N_POLLS === 0;
      const full = needFullRef.current || periodic;
      try {
        // Periodic full refreshes also re-sync group info (mode, name, slots)
        // so settings changed from another client eventually show up.
        await load({ full, withInfo: initial || periodic });
        if (generation !== generationRef.current) return;
        needFullRef.current = false;
        failCountRef.current = 0;
        setError(null);
      } catch (err) {
        if (generation !== generationRef.current) return;
        // Recover with a full fetch on the next tick. Only surface the banner
        // after repeated failures (or on the very first load) so a single
        // dropped poll doesn't flash red.
        needFullRef.current = true;
        failCountRef.current += 1;
        if (initial || failCountRef.current >= 3) {
          setError(err instanceof Error ? err.message : 'Failed to load group');
        }
      } finally {
        if (generation === generationRef.current) {
          inFlightRef.current = false;
          if (initial) setLoading(false);
        }
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), pollMs);
    return () => {
      window.clearInterval(id);
    };
  }, [load, pollMs]);

  return { players, rawMembers, info, loading, error, refresh, patchPlayers };
}
