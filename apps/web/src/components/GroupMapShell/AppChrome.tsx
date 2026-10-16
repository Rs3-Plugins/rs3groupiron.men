import { useRef } from 'react';
import { useHeaderFit } from '../../hooks/useHeaderFit';
import { BurgerIcon, CaretIcon } from './icons';
import { NavMenu, type NavMenuItem } from './NavMenu';

export type NavItem<T extends string> = { id: T; label: string };

export type ChromeMenu = 'more' | 'settings' | null;

export type ChromeActions = {
  onBrand: () => void;
  onSettings: () => void;
  onSetup: () => void;
  onToggleTheme: () => void;
  themeMenuLabel: string;
  themeMenuHint: string;
  supportHref: string;
  onLogout: () => void;
};

type ChromeProps<T extends string> = {
  tabs: ReadonlyArray<NavItem<T>>;
  active: T;
  groupName: string;
  canManage: boolean;
  settingsActive: boolean;
  openMenu: ChromeMenu;
  onOpenMenu: (menu: ChromeMenu) => void;
  onSelect: (id: T) => void;
  actions: ChromeActions;
  hidden: boolean;
  onEnter: () => void;
  onLeave: () => void;
};

type HeaderProps<T extends string> = ChromeProps<T> & { variant: 'inline' | 'full' };

function settingsMenuItems(actions: ChromeActions, withLogout: boolean): NavMenuItem[] {
  return [
    { key: 'settings', label: 'Settings', onSelect: actions.onSettings },
    { key: 'setup', label: 'Setup', onSelect: actions.onSetup },
    {
      key: 'theme',
      label: actions.themeMenuLabel,
      hint: actions.themeMenuHint,
      onSelect: actions.onToggleTheme,
    },
    { key: 'support', label: 'Support', hint: '↗', href: actions.supportHref },
    ...(withLogout
      ? [{ key: 'logout', label: 'Log out', onSelect: actions.onLogout }]
      : []),
  ];
}

function ThemeButton({
  actions,
  className,
}: {
  actions: ChromeActions;
  className: string;
}) {
  return (
    <button
      type="button"
      className={className}
      title={actions.themeMenuLabel}
      aria-label={actions.themeMenuLabel}
      onClick={actions.onToggleTheme}
    >
      <span aria-hidden>{actions.themeMenuHint}</span>
      {actions.themeMenuLabel}
    </button>
  );
}

function Brand({ icon, text, onClick }: { icon: boolean; text: boolean; onClick: () => void }) {
  if (!icon && !text) return null;
  return (
    <button type="button" className="gms-brand" title="RuneScape Group Ironman" onClick={onClick}>
      {icon && (
        <img
          className="gms-brand-logo"
          src="/logo-512.png"
          alt="RuneScape Group Ironman"
          width={46}
          height={46}
        />
      )}
      {text && (
        <span className="gms-wordmark">
          <span className="gms-wordmark-eyebrow">RUNESCAPE 3</span>
          <span className="gms-wordmark-title">
            Group <span>Ironman</span>
          </span>
        </span>
      )}
    </button>
  );
}

export function AppHeader<T extends string>({
  variant,
  tabs,
  active,
  groupName,
  canManage,
  settingsActive,
  openMenu,
  onOpenMenu,
  onSelect,
  actions,
  hidden,
  onEnter,
  onLeave,
}: HeaderProps<T>) {
  const { rowRef, measureRef, fit } = useHeaderFit(tabs.length, true);
  const moreRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);

  const shown = fit.burger ? [] : tabs.slice(0, Math.min(fit.count, tabs.length));
  const hiddenTabs = fit.burger ? [...tabs] : tabs.slice(shown.length);
  const activeTab = tabs.find((t) => t.id === active);
  const activeHidden = hiddenTabs.some((t) => t.id === active);
  const moreCurrent = fit.burger || activeHidden;
  const moreLabel = fit.burger
    ? (activeTab ?? tabs[0])?.label
    : activeHidden
      ? activeTab?.label
      : 'More';

  const className = [
    'gms-hdr',
    variant === 'full' ? 'gms-hdr--full' : 'gms-hdr--inline',
    hidden ? 'gms-hdr--hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={className} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="gms-hdr-row" ref={rowRef}>
        <Brand icon={fit.icon} text={fit.text} onClick={actions.onBrand} />

        {fit.group && (
          <span className="gms-group-pill" title={groupName}>
            {groupName}
          </span>
        )}

        <nav className="gms-nav" aria-label="Main">
          {shown.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === active ? 'gms-nav-link gms-nav-link--current' : 'gms-nav-link'}
              aria-current={t.id === active ? 'page' : undefined}
              onClick={() => onSelect(t.id)}
            >
              {t.label}
            </button>
          ))}

          {hiddenTabs.length > 0 && (
            <button
              type="button"
              ref={moreRef}
              className={
                moreCurrent ? 'gms-nav-link gms-nav-link--current' : 'gms-nav-link'
              }
              aria-haspopup="menu"
              aria-expanded={openMenu === 'more'}
              aria-label={fit.burger ? 'Pages menu' : 'More pages'}
              onClick={() => onOpenMenu(openMenu === 'more' ? null : 'more')}
            >
              {fit.burger && <BurgerIcon />}
              {moreLabel}
              <CaretIcon />
            </button>
          )}
        </nav>

        <div className="gms-hdr-right">
          {canManage ? (
            <>
              <button
                type="button"
                ref={settingsRef}
                className={
                  settingsActive
                    ? 'gms-hdr-settings gms-hdr-settings--active'
                    : 'gms-hdr-settings'
                }
                aria-haspopup="menu"
                aria-expanded={openMenu === 'settings'}
                onClick={() => onOpenMenu(openMenu === 'settings' ? null : 'settings')}
              >
                Settings
                <CaretIcon />
              </button>
              {fit.logout && (
                <button type="button" className="gms-hdr-logout" onClick={actions.onLogout}>
                  Log out
                </button>
              )}
            </>
          ) : (
            <ThemeButton actions={actions} className="gms-hdr-settings" />
          )}
        </div>
      </div>

      <div className="gms-hdr-band" aria-hidden />

      {openMenu === 'more' && (
        <NavMenu
          anchor={moreRef.current}
          align="left"
          ariaLabel={fit.burger ? 'Pages' : 'More pages'}
          items={hiddenTabs.map((t) => ({
            key: t.id,
            label: t.label,
            current: t.id === active,
            onSelect: () => onSelect(t.id),
          }))}
          onClose={() => onOpenMenu(null)}
        />
      )}

      {canManage && openMenu === 'settings' && (
        <NavMenu
          anchor={settingsRef.current}
          align="right"
          ariaLabel="Settings"
          items={settingsMenuItems(actions, !fit.logout)}
          onClose={() => onOpenMenu(null)}
        />
      )}

      <div className="gms-hdr-measure" aria-hidden ref={measureRef}>
        <span className="gms-brand-logo" />
        <span className="gms-wordmark">
          <span className="gms-wordmark-eyebrow">RUNESCAPE 3</span>
          <span className="gms-wordmark-title">
            Group <span>Ironman</span>
          </span>
        </span>
        <span className="gms-group-pill">{groupName}</span>
        {tabs.map((t) => (
          <span key={t.id} className="gms-nav-link">
            {t.label}
          </span>
        ))}
        <span className="gms-nav-link">
          More
          <CaretIcon />
        </span>
        <span className="gms-hdr-settings">
          Settings
          <CaretIcon />
        </span>
        <span className="gms-hdr-logout">Log out</span>
      </div>
    </header>
  );
}

export function SideRail<T extends string>({
  tabs,
  active,
  groupName,
  canManage,
  settingsActive,
  openMenu,
  onOpenMenu,
  onSelect,
  actions,
  hidden,
  onEnter,
  onLeave,
}: ChromeProps<T>) {
  const settingsRef = useRef<HTMLButtonElement>(null);

  return (
    <nav
      className={hidden ? 'gms-rail gms-rail--hidden' : 'gms-rail'}
      aria-label="Main"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        type="button"
        className="gms-rail-brand"
        title="RuneScape Group Ironman"
        onClick={actions.onBrand}
      >
        <img src="/logo-512.png" alt="RuneScape Group Ironman" width={132} height={132} />
      </button>

      <div className="gms-rail-group">
        <span className="gms-micro">GROUP</span>
        <span className="gms-rail-group-name">{groupName}</span>
      </div>

      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={t.id === active ? 'gms-rail-link gms-rail-link--current' : 'gms-rail-link'}
          aria-current={t.id === active ? 'page' : undefined}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}

      <div className="gms-rail-divider" aria-hidden />

      {canManage ? (
        <>
          <button
            type="button"
            ref={settingsRef}
            className={
              settingsActive ? 'gms-rail-link gms-rail-link--current' : 'gms-rail-link'
            }
            aria-haspopup="menu"
            aria-expanded={openMenu === 'settings'}
            onClick={() => onOpenMenu(openMenu === 'settings' ? null : 'settings')}
          >
            <span className="gms-rail-link-label">Settings</span>
            <CaretIcon />
          </button>

          <button type="button" className="gms-rail-logout" onClick={actions.onLogout}>
            Log out
          </button>
        </>
      ) : (
        <ThemeButton actions={actions} className="gms-rail-link" />
      )}

      {canManage && openMenu === 'settings' && (
        <NavMenu
          anchor={settingsRef.current}
          align="side"
          ariaLabel="Settings"
          items={settingsMenuItems(actions, false)}
          onClose={() => onOpenMenu(null)}
        />
      )}
    </nav>
  );
}
