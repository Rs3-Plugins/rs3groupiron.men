import { useCallback, useEffect, useState } from 'react';
import { fetchQuests } from '../api/groupClient';
import { errorMessage } from '../lib/errors';
import type { MemberQuestStates } from '../lib/quests';
import { useLatestRequest } from './useLatestRequest';
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
  const request = useLatestRequest();

  const load = useCallback(async () => {
    const settled = await request((signal) => fetchQuests(groupName, token, signal));
    if (!settled) return;
    if (settled.ok) {
      setByMember(Object.fromEntries(settled.value.members.map((m) => [m.name, m.quests])));
      setError(null);
    } else {
      setError(errorMessage(settled.error, 'Failed to load quests'));
    }
    setLoading(false);
  }, [request, groupName, token]);

  useEffect(() => {
    setByMember({});
    setLoading(true);
    void load();
  }, [load]);

  useLiveRefresh(load, { signal: dataRevision, intervalMs: REFRESH_MS });

  return { byMember, loading, error };
}
