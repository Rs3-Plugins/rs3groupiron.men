import { useCallback, useEffect, useRef, useState } from 'react';

export type CoinDelta = { id: number; amount: number };

/** How long the displayed total takes to catch up to a change. */
const COUNT_MS = 700;

/**
 * Tracks the money pouch so a change can be shown rather than just swapped in:
 * the total eases to its new value, the icon gets a pop, and the difference
 * floats up as a `+1,234` / `-900` bubble.
 *
 * Bubbles are removed by the caller on animationend, so one that is interrupted
 * (or skipped under reduced motion) still clears.
 */
export function useCoinPouch(total: number) {
  const [shown, setShown] = useState(total);
  const [deltas, setDeltas] = useState<CoinDelta[]>([]);
  const [bump, setBump] = useState(0);
  const previous = useRef(total);
  const frame = useRef<number | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    const from = previous.current;
    previous.current = total;
    if (from === total) return;

    nextId.current += 1;
    const id = nextId.current;
    setDeltas((prev) => [...prev, { id, amount: total - from }]);
    setBump((n) => n + 1);

    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(from + (total - from) * eased));
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [total]);

  const dismiss = useCallback((id: number) => {
    setDeltas((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { shown, deltas, bump, dismiss };
}
