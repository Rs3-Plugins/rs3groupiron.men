import { useEffect, useRef } from 'react';

type Options = {
  /**
   * Bumps whenever the group poll brings new member data. Panels that derive
   * from member data (ledger, graphs) reload as soon as this changes.
   */
  signal?: number;
  /**
   * Backstop for data that arrives without touching a member row — an
   * achievement posted by the plugin, for example. Set 0 to disable.
   */
  intervalMs?: number;
  /** Skip refreshing while the panel cannot usefully use the result. */
  enabled?: boolean;
};

/**
 * Keeps a panel's fetched data current without needing a tab switch.
 *
 * The panel still loads itself on mount; this only handles the follow-ups, so
 * the first render is never doubled. Refreshing pauses while the browser tab
 * is hidden, and resumes with an immediate refresh when it comes back.
 */
export function useLiveRefresh(refresh: () => void, options: Options = {}) {
  const { signal, intervalMs = 0, enabled = true } = options;

  // Keep the latest callback without making the effects depend on its
  // identity, which would restart the interval on every render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // The panel already fetched on mount, so the first signal value is a no-op.
  const seenSignal = useRef(signal);

  useEffect(() => {
    if (!enabled) return;
    if (signal === undefined || signal === seenSignal.current) return;
    seenSignal.current = signal;
    refreshRef.current();
  }, [signal, enabled]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    const hidden = () =>
      typeof document !== 'undefined' && document.visibilityState === 'hidden';

    const id = window.setInterval(() => {
      if (!hidden()) refreshRef.current();
    }, intervalMs);

    // Coming back to the tab should show current data straight away rather
    // than waiting out the remainder of the interval.
    const onVisible = () => {
      if (!hidden()) refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
}
