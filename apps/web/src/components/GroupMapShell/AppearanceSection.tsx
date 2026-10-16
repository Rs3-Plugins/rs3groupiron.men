import type { GroupMode } from '../../api/groupClient';
import {
  PANEL_OPACITY_MAX,
  PANEL_OPACITY_MIN,
  PANEL_OPACITY_STEP,
  type LayoutDir,
  type ThemePref,
} from '../../lib/uiPrefs';
import { Segmented } from './Segmented';

type AppearanceSectionProps = {
  theme: ThemePref;
  dir: LayoutDir;
  navFull: boolean;
  navHide: boolean;
  mapBg: boolean;
  panelOpacity: number;
  onSelectTheme: (theme: ThemePref) => void;
  onSelectDir: (dir: LayoutDir) => void;
  onSelectNavFull: (full: boolean) => void;
  onSelectNavHide: (hide: boolean) => void;
  onSelectMapBg: (on: boolean) => void;
  onPanelOpacityChange: (value: number) => void;
};

type ModeSectionProps = {
  groupMode: GroupMode;
  busy: boolean;
  onSelectMode: (mode: GroupMode) => void;
};

const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

const LAYOUTS = [
  { id: 'a', label: 'Top header' },
  { id: 'b', label: 'Side rail' },
] as const;

const NAV_POSITIONS = [
  { id: 'inline', label: 'Beside members' },
  { id: 'full', label: 'Full width' },
] as const;

const ON_OFF = [
  { id: 'off', label: 'Off' },
  { id: 'on', label: 'On' },
] as const;

const OFF_ON = [
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
] as const;

const MODE_CARDS: Array<{ id: GroupMode; label: string; sub: string; icon: string }> = [
  {
    id: 'normal',
    label: 'Normal',
    sub: 'Shared bank, shared progress',
    icon: '/group-modes/normal.webp',
  },
  {
    id: 'competitive',
    label: 'Competitive',
    sub: 'Race each other on XP',
    icon: '/group-modes/competitive.webp',
  },
];

export function AppearanceSection({
  theme,
  dir,
  navFull,
  navHide,
  mapBg,
  panelOpacity,
  onSelectTheme,
  onSelectDir,
  onSelectNavFull,
  onSelectNavHide,
  onSelectMapBg,
  onPanelOpacityChange,
}: AppearanceSectionProps) {
  return (
    <section className="gms-panel gms-settings-card">
      <div className="gms-settings-card-head">
        <h2 className="gms-section-title">Appearance</h2>
        <span className="gms-settings-hint">
          Theme, layout, background and panel transparency. Saved on this device.
        </span>
      </div>

      <div className="gms-settings-grid">
        <span className="gms-settings-label">Theme</span>
        <Segmented
          options={THEMES}
          value={theme}
          ariaLabel="Theme"
          onChange={onSelectTheme}
        />

        <span className="gms-settings-label">Layout</span>
        <Segmented options={LAYOUTS} value={dir} ariaLabel="Layout" onChange={onSelectDir} />

        {dir === 'a' && (
          <>
            <span className="gms-settings-label">Header position</span>
            <Segmented
              options={NAV_POSITIONS}
              value={navFull ? 'full' : 'inline'}
              ariaLabel="Header position"
              onChange={(id) => onSelectNavFull(id === 'full')}
            />
          </>
        )}

        <span className="gms-settings-label">Auto-hide navigation</span>
        <div className="gms-settings-stack">
          <Segmented
            options={ON_OFF}
            value={navHide ? 'on' : 'off'}
            ariaLabel="Auto-hide navigation"
            onChange={(id) => onSelectNavHide(id === 'on')}
          />
          <span className="gms-settings-note">
            Slides away until you hover the edge of the screen.
          </span>
        </div>

        <span className="gms-settings-label">Map background</span>
        <Segmented
          options={OFF_ON}
          value={mapBg ? 'on' : 'off'}
          ariaLabel="Map background"
          onChange={(id) => onSelectMapBg(id === 'on')}
        />

        <span className="gms-settings-label">Panel opacity</span>
        <div className="gms-settings-opacity">
          <span className="gms-settings-note">Clear</span>
          <input
            type="range"
            min={PANEL_OPACITY_MIN}
            max={PANEL_OPACITY_MAX}
            step={PANEL_OPACITY_STEP}
            value={panelOpacity}
            aria-label="Panel opacity"
            onChange={(e) => onPanelOpacityChange(Number(e.target.value))}
          />
          <span className="gms-settings-note">Solid</span>
          <span className="gms-settings-opacity-value">{panelOpacity}%</span>
        </div>
      </div>
    </section>
  );
}

export function GroupModeSection({ groupMode, busy, onSelectMode }: ModeSectionProps) {
  return (
    <section className="gms-panel gms-settings-card">
      <div className="gms-settings-card-head">
        <h2 className="gms-section-title">Group mode</h2>
        <span className="gms-settings-hint">
          Competitive hides other members’ banks and ranks everyone on XP.
        </span>
      </div>

      <div className="gms-settings-modes" role="radiogroup" aria-label="Group mode">
        {MODE_CARDS.map((card) => {
          const active = card.id === groupMode;
          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy}
              className={active ? 'gms-mode-card gms-mode-card--active' : 'gms-mode-card'}
              onClick={() => onSelectMode(card.id)}
            >
              <span className="gms-mode-radio" aria-hidden />
              <img src={card.icon} alt="" width={26} height={26} loading="lazy" />
              <span className="gms-mode-text">
                <strong>{card.label}</strong>
                <em>{card.sub}</em>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
