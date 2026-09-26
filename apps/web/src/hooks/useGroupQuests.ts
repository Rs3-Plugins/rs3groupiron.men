import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchQuests } from '../api/groupClient';
import type { MemberQuestStates } from '../lib/quests';
import { useLiveRefresh } from './useLiveRefresh';

export type GroupQuests = {
  /** Member name -> quest states. Members with no progress are present but empty. */
  byMember: Record<string, MemberQuestStates>;
  loading: boolean;
  error: string | null;
};

const REFRESH_MS = 30_000;

/**
 * Quest progress for the whole group. Loaded once, then refreshed when the
 * member poll brings new data and on a slow interval as a backstop, since a
 * quest sync does not touch the member rows the main poll watches.
 */
export function useGroupQuests(
  groupName: string,
  token: string,
  dataRevision?: number,
): GroupQuests {
  const [byMember, setByMember] = useState<Record<string, MemberQuestStates>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const mySeq = ++seq.current;
    try {
      const res = await fetchQuests(groupName, token, controller.signal);
      if (mySeq !== seq.current) return;
      const next: Record<string, MemberQuestStates> = {};
      for (const m of res.members) next[m.name] = m.quests;
      setByMember(next);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
      if (mySeq !== seq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load quests');
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (mySeq === seq.current) setLoading(false);
    }
  }, [groupName, token]);

  useEffect(() => {
    setByMember({});
    setLoading(true);
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  useLiveRefresh(load, { signal: dataRevision, intervalMs: REFRESH_MS });

  return { byMember, loading, error };
}
