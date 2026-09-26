import { useCallback, useEffect, useRef } from 'react';

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export function useLatestRequest() {
  const inFlight = useRef<AbortController | null>(null);
  const seq = useRef(0);

  useEffect(() => () => inFlight.current?.abort(), []);

  return useCallback(
    async <T>(task: (signal: AbortSignal) => Promise<T>): Promise<Settled<T> | null> => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const mine = ++seq.current;
      try {
        const value = await task(controller.signal);
        return mine === seq.current ? { ok: true, value } : null;
      } catch (error) {
        if (controller.signal.aborted || (error as Error)?.name === 'AbortError') {
          return null;
        }
        return mine === seq.current ? { ok: false, error } : null;
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [],
  );
}
