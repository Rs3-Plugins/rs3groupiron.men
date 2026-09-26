import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';

export type ActionsMenuItem = {
  key: string;
  label: string;
  /** Renders an external link instead of a button. */
  href?: string;
  onSelect?: () => void;
};

type ActionsMenuProps = {
  label?: string;
  items: ActionsMenuItem[];
};

export function ActionsMenu({ label = 'Menu', items }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useDismiss(
    open,
    rootRef,
    useCallback((reason) => {
      setOpen(false);
      if (reason === 'escape') triggerRef.current?.focus();
    }, []),
  );

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const nodes = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? [],
      );
      if (!nodes.length) return;
      e.preventDefault();
      const i = nodes.indexOf(document.activeElement as HTMLElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      nodes[(i + step + nodes.length) % nodes.length]?.focus();
    }

    document.addEventListener('keydown', onKeyDown);
    // Focus the first item so the menu is usable from the keyboard.
    listRef.current?.querySelector<HTMLElement>('[data-menu-item]')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="gms-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="gms-action"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="gms-menu-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="gms-menu-list" id={menuId} role="menu" ref={listRef}>
          {items.map((item) =>
            item.href ? (
              <a
                key={item.key}
                className="gms-menu-item"
                role="menuitem"
                data-menu-item
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                className="gms-menu-item"
                role="menuitem"
                data-menu-item
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
