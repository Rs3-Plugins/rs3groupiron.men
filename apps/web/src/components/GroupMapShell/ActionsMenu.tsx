import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../../hooks/useDismiss';

export type ActionsMenuItem = {
  key: string;
  label: string;
  hint?: string;
  active?: boolean;
  /** Renders an external link instead of a button. */
  href?: string;
  onSelect?: () => void;
};

type ActionsMenuProps = {
  label?: string;
  icon?: ReactNode;
  hideLabel?: boolean;
  title?: string;
  placement?: 'bottom' | 'top';
  items: ActionsMenuItem[];
};

function ItemBody({ item }: { item: ActionsMenuItem }) {
  if (!item.hint) return <>{item.label}</>;
  return (
    <span className="gms-menu-item-text">
      <span className="gms-menu-item-label">{item.label}</span>
      <span className="gms-menu-item-hint">{item.hint}</span>
    </span>
  );
}

function itemClass(item: ActionsMenuItem) {
  return item.active ? 'gms-menu-item gms-menu-item--active' : 'gms-menu-item';
}

export function ActionsMenu({
  label = 'Menu',
  icon,
  hideLabel = false,
  title,
  placement = 'bottom',
  items,
}: ActionsMenuProps) {
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
    <div className={placement === 'top' ? 'gms-menu gms-menu--up' : 'gms-menu'} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={[
          'gms-action',
          icon && !hideLabel ? 'gms-action--with-icon' : '',
          hideLabel ? 'gms-action--icon' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={title ?? (hideLabel ? label : undefined)}
        aria-label={hideLabel ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {!hideLabel && <span className="gms-action-label">{label}</span>}
        {!hideLabel && (
          <span className="gms-menu-caret" aria-hidden>
            ▾
          </span>
        )}
      </button>

      {open && (
        <div className="gms-menu-list" id={menuId} role="menu" ref={listRef}>
          {items.map((item) =>
            item.href ? (
              <a
                key={item.key}
                className={itemClass(item)}
                role="menuitem"
                data-menu-item
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
              >
                <ItemBody item={item} />
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                className={itemClass(item)}
                role={item.active === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.active}
                data-menu-item
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                <ItemBody item={item} />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
