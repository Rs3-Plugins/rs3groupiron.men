import { useEffect, type RefObject } from 'react';

export type DismissReason = 'escape' | 'outside';

export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: (reason: DismissReason) => void,
) {
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onDismiss('outside');
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onDismiss('escape');
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, ref, onDismiss]);
}
