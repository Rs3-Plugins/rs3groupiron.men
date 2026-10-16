import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_DELAY_MS = 350;

export function useAutoHide(enabled: boolean, pinned: boolean) {
  const [hovered, setHovered] = useState(false);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  useEffect(() => {
    if (!enabled) setHovered(false);
  }, [enabled]);

  const onEnter = useCallback(() => {
    clear();
    setHovered(true);
  }, [clear]);

  const onLeave = useCallback(() => {
    clear();
    timer.current = window.setTimeout(() => setHovered(false), HIDE_DELAY_MS);
  }, [clear]);

  return { hidden: enabled && !hovered && !pinned, onEnter, onLeave };
}
