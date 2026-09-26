import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchGroupData,
  fetchGroupInfo,
  type GroupInfo,
} from '../api/groupClient';
import {
  isFullMember,
  membersToPlayers,
  type PlayerView,
  type WireMember,
} from '../lib/items';
import { openGroupStream } from '../lib/groupStream';
import { maxLastUpdated, mergeDelta, type GroupCache } from '../lib/mergeDelta';
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

type Cache = GroupCache;

function samePlayers(a: PlayerView[], b: PlayerView[]) {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

export function useGroupData(groupName: string, token: string, pollMs: number): GroupData {
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [rawMembers, setRawMembers] = useState<WireMember[]>([]);
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** True while the SSE stream is live; the poll loop stands down. */
  const [streaming, setStreaming] = useState(false);
  /** Bumped to retry the stream after a failure. */
  const [streamAttempt, setStreamAttempt] = useState(0);

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

  /**
   * Live stream. While it is connected the poll loop stands down, so a group
   * costs one connection instead of a request every 1.5s.
   *
   * Any failure — an old server without the endpoint, a proxy that breaks
   * streaming, a dropped connection — just flips `streaming` back off and the
   * poll loop resumes. Polling therefore stays the fallback, never removed.
   */
  useEffect(() => {
    const generation = generationRef.current;
    let retry: number | undefined;

    const stop = openGroupStream(groupName, token, {
      onOpen: () => {
        if (generation !== generationRef.current) return;
        setStreaming(true);
      },
      onEvent: (event) => {
        if (generation !== generationRef.current) return;
        const seq = ++seqRef.current;

        if (event.type === 'snapshot') {
          commit(seq, event.data.filter(isFullMember));
          setLoading(false);
          setError(null);
          return;
        }

        const result = mergeDelta(
          cacheRef.current ?? { members: [], since: null },
          event.data,
        );
        // An unknown member means our cache is stale; a full refresh repairs it.
        if (!result) {
          needFullRef.current = true;
          void refresh();
          return;
        }
        if (result.changed) commit(seq, result.merged);
        setError(null);
      },
      onError: () => {
        if (generation !== generationRef.current) return;
        // Fall back to polling immediately, then try the stream again later.
        setStreaming(false);
        retry = window.setTimeout(() => setStreamAttempt((n) => n + 1), 30_000);
      },
    });

    return () => {
      stop();
      if (retry !== undefined) window.clearTimeout(retry);
      setStreaming(false);
    };
    // streamAttempt is the reconnect trigger.
  }, [groupName, token, streamAttempt, commit, refresh]);

  // Poll loop. Re-created on cadence change without dropping cached data.
  // Skipped entirely while the live stream is connected.
  useEffect(() => {
    if (streaming) return;
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
  }, [load, pollMs, streaming]);

  return { players, rawMembers, info, loading, error, refresh, patchPlayers };
}
