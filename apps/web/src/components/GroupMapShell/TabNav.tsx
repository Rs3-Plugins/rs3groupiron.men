import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActionsMenu, type ActionsMenuItem } from './ActionsMenu';
import { MoreIcon } from './icons';

export type NavTab<T extends string> = { id: T; label: string; icon?: ReactNode };

export type NavAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onSelect: () => void;
};

export type NavMenu = {
  label: string;
  icon?: ReactNode;
  items: ActionsMenuItem[];
};

type TabNavProps<T extends string> = {
  tabs: ReadonlyArray<NavTab<T>>;
  active: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
  overflowLabel?: string;
  actions?: ReadonlyArray<NavAction>;
  menu?: NavMenu;
};

type Layout = { labelCount: number; fit: number };

export function TabNav<T extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
  overflowLabel = 'More',
  actions = [],
  menu,
}: TabNavProps<T>) {
  const rowRef = useRef<HTMLElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const trailingCount = actions.length + (menu ? 1 : 0);
  const [layout, setLayout] = useState<Layout>({
    labelCount: tabs.length + trailingCount,
    fit: tabs.length,
  });

  useLayoutEffect(() => {
    const row = rowRef.current;
    const full = fullRef.current;
    const icon = iconRef.current;
    if (!row || !full || !icon) return;

    const recompute = () => {
      const widthsOf = (el: HTMLElement) =>
        Array.from(el.children).map((c) => c.getBoundingClientRect().width);
      const fullWidths = widthsOf(full);
      const iconWidths = widthsOf(icon);
      const moreWidth = moreRef.current?.getBoundingClientRect().width ?? 0;
      const slots = tabs.length + trailingCount;
      if (fullWidths.length !== slots || iconWidths.length !== slots) return;

      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const available = row.clientWidth;
      if (available === 0) return;

      const spacerGap = trailingCount > 0 ? gap : 0;

      const total = (indices: number[], labelCount: number, withMore: boolean) => {
        let width = spacerGap;
        indices.forEach((index, slot) => {
          const labelled = index < labelCount;
          width += (labelled ? fullWidths[index]! : iconWidths[index]!) + (slot > 0 ? gap : 0);
        });
        if (withMore) width += gap + moreWidth;
        return width;
      };

      const everything = Array.from({ length: slots }, (_, i) => i);
      const fits = (width: number) => width <= available + 0.5;

      for (let labelCount = slots; labelCount >= 0; labelCount -= 1) {
        if (fits(total(everything, labelCount, false))) {
          setLayout({ labelCount, fit: tabs.length });
          return;
        }
      }

      const trailing = everything.slice(tabs.length);
      const activeIndex = tabs.findIndex((t) => t.id === active);
      for (let count = tabs.length - 1; count >= 0; count -= 1) {
        const kept = everything.slice(0, count);
        if (activeIndex >= 0 && !kept.includes(activeIndex)) {
          if (kept.length > 0) kept[kept.length - 1] = activeIndex;
          else kept.push(activeIndex);
        }
        if (fits(total([...kept, ...trailing], 0, true))) {
          setLayout({ labelCount: 0, fit: count });
          return;
        }
      }
      setLayout({ labelCount: 0, fit: 0 });
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(row);
    observer.observe(full);
    observer.observe(icon);
    return () => observer.disconnect();
  }, [tabs, active, actions, menu, trailingCount]);

  const overflowing = layout.fit < tabs.length;
  let shown = overflowing ? tabs.slice(0, layout.fit) : [...tabs];

  if (overflowing && !shown.some((t) => t.id === active)) {
    const current = tabs.find((t) => t.id === active);
    if (current) shown = [...shown.slice(0, Math.max(0, layout.fit - 1)), current];
  }

  const shownIds = new Set(shown.map((t) => t.id));
  const hidden = tabs.filter((t) => !shownIds.has(t.id));
  const labelled = (slot: number) => slot < layout.labelCount;

  return (
    <nav className="gms-tabs" aria-label={ariaLabel} ref={rowRef}>
      {shown.map((t) => {
        const withLabel = labelled(tabs.findIndex((x) => x.id === t.id));
        return (
          <button
            key={t.id}
            type="button"
            className={[
              'gms-tab',
              t.id === active ? 'gms-tab--active' : '',
              withLabel ? '' : 'gms-tab--icon',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-current={t.id === active ? 'page' : undefined}
            aria-label={withLabel ? undefined : t.label}
            title={withLabel ? undefined : t.label}
            onClick={() => onSelect(t.id)}
          >
            {t.icon}
            {withLabel && <span className="gms-tab-label">{t.label}</span>}
          </button>
        );
      })}

      {hidden.length > 0 && (
        <ActionsMenu
          label={overflowLabel}
          hideLabel
          icon={<MoreIcon />}
          title={`${ariaLabel} (${hidden.length} more)`}
          items={hidden.map((t) => ({
            key: t.id,
            label: t.label,
            active: t.id === active,
            onSelect: () => onSelect(t.id),
          }))}
        />
      )}

      {trailingCount > 0 && <span className="gms-tabs-spacer" />}

      {actions.map((action, i) => {
        const withLabel = labelled(tabs.length + i);
        return (
          <button
            key={action.key}
            type="button"
            className={[
              'gms-tab',
              action.active ? 'gms-tab--active' : '',
              withLabel ? '' : 'gms-tab--icon',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={withLabel ? undefined : action.label}
            title={action.label}
            onClick={action.onSelect}
          >
            {action.icon}
            {withLabel && <span className="gms-tab-label">{action.label}</span>}
          </button>
        );
      })}

      {menu && (
        <ActionsMenu
          label={menu.label}
          icon={menu.icon}
          hideLabel={!labelled(tabs.length + actions.length)}
          items={menu.items}
        />
      )}

      <div className="gms-tabs-measure" aria-hidden>
        <div className="gms-tabs-measure-row" ref={fullRef}>
          {tabs.map((t) => (
            <button key={t.id} type="button" className="gms-tab" tabIndex={-1}>
              {t.icon}
              <span className="gms-tab-label">{t.label}</span>
            </button>
          ))}
          {actions.map((a) => (
            <button key={a.key} type="button" className="gms-tab" tabIndex={-1}>
              {a.icon}
              <span className="gms-tab-label">{a.label}</span>
            </button>
          ))}
          {menu && (
            <span className="gms-menu">
              <button type="button" className="gms-action gms-action--with-icon" tabIndex={-1}>
                {menu.icon}
                <span className="gms-action-label">{menu.label}</span>
                <span className="gms-menu-caret">▾</span>
              </button>
            </span>
          )}
        </div>
        <div className="gms-tabs-measure-row" ref={iconRef}>
          {tabs.map((t) => (
            <button key={t.id} type="button" className="gms-tab gms-tab--icon" tabIndex={-1}>
              {t.icon}
            </button>
          ))}
          {actions.map((a) => (
            <button key={a.key} type="button" className="gms-tab gms-tab--icon" tabIndex={-1}>
              {a.icon}
            </button>
          ))}
          {menu && (
            <span className="gms-menu">
              <button type="button" className="gms-action gms-action--icon" tabIndex={-1}>
                {menu.icon}
              </button>
            </span>
          )}
        </div>
        <div className="gms-tabs-measure-row" ref={moreRef}>
          <button type="button" className="gms-action gms-action--icon" tabIndex={-1}>
            <MoreIcon />
          </button>
        </div>
      </div>
    </nav>
  );
}
