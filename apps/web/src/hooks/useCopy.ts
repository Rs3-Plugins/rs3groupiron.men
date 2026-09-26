import { useCallback, useEffect, useRef, useState } from 'react';
import { COPY_FEEDBACK_MS } from '../lib/constants';

/**
 * Clipboard helper with transient "copied" feedback.
 * `copy` resolves `true` on success, `false` if the clipboard was unavailable.
 */
export function useCopy(feedbackMs = COPY_FEEDBACK_MS) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      setCopied(true);
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), feedbackMs);
      return true;
    },
    [feedbackMs],
  );

  return { copied, copy };
}
