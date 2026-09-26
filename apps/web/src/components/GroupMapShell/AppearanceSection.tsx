import type { AppearanceTheme, GroupMode } from '../../api/groupClient';
import { PANEL_OPACITY_MAX, PANEL_OPACITY_MIN } from '../../lib/panelOpacity';

type AppearanceSectionProps = {
  appearance: AppearanceTheme;
  groupMode: GroupMode;
  panelOpacity: number;
  busy: boolean;
  onPanelOpacityChange: (value: number) => void;
  onSelectAppearance: (theme: AppearanceTheme) => void;
  onSelectMode: (mode: GroupMode) => void;
};

const APPEARANCES: Array<{ id: AppearanceTheme; label: string; blurb: string }> = [
  { id: 'rs3', label: 'RS3', blurb: 'Matches the game' },
  { id: 'modern', label: 'Modern', blurb: 'Modern UI' },
];

const MODES: Array<{ id: GroupMode; label: string; icon: string }> = [
  { id: 'normal', label: 'Normal', icon: '/group-modes/normal.webp' },
  { id: 'competitive', label: 'Competitive', icon: '/group-modes/competitive.webp' },
];

export function AppearanceSection({
  appearance,
  groupMode,
  panelOpacity,
  busy,
  onPanelOpacityChange,
  onSelectAppearance,
  onSelectMode,
}: AppearanceSectionProps) {
  return (
    <div className="gms-settings-section">
      <h3 className="gms-settings-heading">Appearance</h3>
      <p className="gms-settings-hint">
        Choose how the group UI looks, and how see-through panels are.
      </p>
      <label className="gms-settings-opacity">
        <span className="gms-settings-opacity-label">
          {appearance === 'rs3' ? 'RS3' : 'Modern'} panel opacity
          <em>{panelOpacity}%</em>
        </span>
        <input
          type="range"
          min={PANEL_OPACITY_MIN}
          max={PANEL_OPACITY_MAX}
          step={1}
          value={panelOpacity}
          aria-valuemin={PANEL_OPACITY_MIN}
          aria-valuemax={PANEL_OPACITY_MAX}
          aria-valuenow={panelOpacity}
          aria-label="Panel opacity"
          onChange={(e) => onPanelOpacityChange(Number(e.target.value))}
        />
        <span className="gms-settings-opacity-hints" aria-hidden>
          <span>Clear</span>
          <span>Solid</span>
        </span>
      </label>

      <div className="gms-settings-appearance">
        {APPEARANCES.map((opt) => (
          <label key={opt.id} className="gms-settings-choice">
            <input
              type="radio"
              name="appearance"
              checked={appearance === opt.id}
              disabled={busy}
              onChange={() => onSelectAppearance(opt.id)}
            />
            <span>
              <strong>{opt.label}</strong>
              <em>{opt.blurb}</em>
            </span>
          </label>
        ))}
      </div>

      <h4 className="gms-settings-subheading">Group mode</h4>
      <div className="gms-settings-modes">
        {MODES.map((opt) => (
          <label key={opt.id} className="gms-settings-choice gms-settings-choice--inline">
            <input
              type="radio"
              name="mode"
              checked={groupMode === opt.id}
              disabled={busy}
              onChange={() => onSelectMode(opt.id)}
            />
            <span>
              <img src={opt.icon} alt="" width={16} height={16} />
              <strong>{opt.label}</strong>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
