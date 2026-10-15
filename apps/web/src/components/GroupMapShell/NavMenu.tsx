import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type NavMenuItem = {
  key: string;
  label: string;
  hint?: string;
  current?: boolean;
  href?: string;
  onSelect?: () => void;
};

export type NavMenuAlign = 'left' | 'right' | 'side';

type NavMenuProps = {
  anchor: HTMLElement | null;
  align: NavMenuAlign;
  items: NavMenuItem[];
  ariaLabel: string;
  id?: string;
  onClose: () => void;
};

const MENU_WIDTH = 200;
const EDGE = 8;

function place(rect: DOMRect, align: NavMenuAlign): CSSProperties {
  const vw = window.innerWidth;
  const clampLeft = (left: number) =>
    Math.max(EDGE, Math.min(vw - MENU_WIDTH - EDGE, left));
  if (align === 'side') {
    return { left: rect.right + EDGE, top: Math.max(EDGE, rect.top - 6) };
  }
  const left = align === 'right' ? rect.right - MENU_WIDTH : rect.left;
  return { left: clampLeft(left), top: rect.bottom + 6 };
}

export function NavMenu({ anchor, align, items, ariaLabel, id, onClose }: NavMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const sync = () => setPos(place(anchor.getBoundingClientRect(), align));
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [anchor, align]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        anchor?.focus();
        return;
      }
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
    listRef.current?.querySelector<HTMLElement>('[data-menu-item]')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [anchor, onClose]);

  if (!pos) return null;

  return (
    <>
      <div className="gms-menu-scrim" onPointerDown={onClose} />
      <div
        className="gms-nav-menu"
        id={id}
        role="menu"
        aria-label={ariaLabel}
        style={pos}
        ref={listRef}
      >
        {items.map((item) => {
          const cls = item.current ? 'gms-nav-menu-item gms-nav-menu-item--current' : 'gms-nav-menu-item';
          const body = (
            <>
              <span className="gms-nav-menu-label">{item.label}</span>
              {item.hint && <span className="gms-nav-menu-hint">{item.hint}</span>}
            </>
          );
          return item.href ? (
            <a
              key={item.key}
              className={cls}
              role="menuitem"
              data-menu-item
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
            >
              {body}
            </a>
          ) : (
            <button
              key={item.key}
              type="button"
              className={cls}
              role="menuitem"
              data-menu-item
              aria-current={item.current ? 'page' : undefined}
              onClick={() => {
                onClose();
                item.onSelect?.();
              }}
            >
              {body}
            </button>
          );
        })}
      </div>
    </>
  );
}
