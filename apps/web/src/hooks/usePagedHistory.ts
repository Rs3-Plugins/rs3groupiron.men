import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { useLatestRequest } from './useLatestRequest';
import { useLiveRefresh } from './useLiveRefresh';

export type HistoryPage<T> = { entries: T[]; has_more: boolean };

type Options<T> = {
  fetchPage: (args: {
    before: string | undefined;
    limit: number;
    signal: AbortSignal;
  }) => Promise<HistoryPage<T>>;
  pageSize: number;
  errorFallback: string;
  dataRevision?: number;
  refreshMs?: number;
};

export function usePagedHistory<T extends { at: string }>({
  fetchPage,
  pageSize,
  errorFallback,
  dataRevision,
  refreshMs = 15_000,
}: Options<T>) {
  const [entries, setEntries] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useLatestRequest();

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError(null);
      const settled = await request((signal) => fetchPage({ before, limit: pageSize, signal }));
      if (!settled) return;
      if (settled.ok) {
        setEntries((prev) => (before ? [...prev, ...settled.value.entries] : settled.value.entries));
        setHasMore(settled.value.has_more);
      } else {
        setError(errorMessage(settled.error, errorFallback));
        if (!before) {
          setEntries([]);
          setHasMore(false);
        }
      }
      setLoading(false);
    },
    [request, fetchPage, pageSize, errorFallback],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(
    useCallback(() => {
      if (entries.length > pageSize) return;
      void load();
    }, [load, entries.length, pageSize]),
    { signal: dataRevision, intervalMs: refreshMs },
  );

  const oldest = entries.length ? entries[entries.length - 1]! : null;

  return {
    entries,
    hasMore,
    error,
    loading,
    refreshing: loading && entries.length > 0,
    oldest,
    loadMore: () => oldest && void load(oldest.at),
  };
}
