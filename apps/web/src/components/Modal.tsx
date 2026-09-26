import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AppearanceTheme } from '../api/groupClient';
import { Rs3Frame } from './GroupMapShell/Rs3Frame';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** id for the heading element; wired to aria-labelledby. */
  titleId: string;
  title: ReactNode;
  children: ReactNode;
  /** Extra class on the dialog frame (e.g. `gms-modal--setup`). */
  className?: string;
  appearance?: AppearanceTheme;
  /** Ignore Escape / backdrop / close button (e.g. while saving). */
  closeDisabled?: boolean;
};

function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Accessible dialog: portaled backdrop + Rs3Frame chrome. Handles Escape,
 * initial focus, focus restore on close and a Tab focus trap.
 */
export function Modal({
  open,
  onClose,
  titleId,
  title,
  children,
  className,
  appearance = 'modern',
  closeDisabled = false,
}: ModalProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) return;
    const root = frameRef.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;

    // Prefer the first control in the body over the close button in the header.
    const candidates = focusables(root);
    const first =
      candidates.find((el) => !el.classList.contains('gms-modal-close')) ?? candidates[0];
    (first ?? root).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (closeDisabledRef.current) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !root.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !root.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const frameClass = ['gms-modal', className].filter(Boolean).join(' ');

  return createPortal(
    <div
      className="gms-modal-backdrop"
      data-appearance={appearance}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose();
      }}
    >
      <Rs3Frame
        ref={frameRef}
        appearance={appearance}
        className={frameClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        header={
          <header className="gms-modal-head">
            <h3 id={titleId}>{title}</h3>
            <button
              type="button"
              className="gms-modal-close"
              aria-label="Close"
              disabled={closeDisabled}
              onClick={onClose}
            >
              ×
            </button>
          </header>
        }
      >
        {children}
      </Rs3Frame>
    </div>,
    document.body,
  );
}
