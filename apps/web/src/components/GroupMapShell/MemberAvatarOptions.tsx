import { useRef, useState } from 'react';
import { MEMBER_COLORS, isPresetColor } from '../../lib/colorPicker';
import { ColorPicker } from './ColorPicker';

type MemberAvatarOptionsProps = {
  color: string;
  useDiscordAvatar: boolean;
  hasDiscord: boolean;
  busy: boolean;
  colorLabel: string;
  onColorChange: (color: string) => void;
  onUseDiscordAvatarChange: (use: boolean) => void;
};

export function MemberAvatarOptions({
  color,
  useDiscordAvatar,
  hasDiscord,
  busy,
  colorLabel,
  onColorChange,
  onUseDiscordAvatarChange,
}: MemberAvatarOptionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const customRef = useRef<HTMLButtonElement>(null);
  const custom = !isPresetColor(color);

  return (
    <div className="gms-settings-member-opts">
      <div className="gms-settings-color" role="group" aria-label={colorLabel}>
        <span className="gms-settings-color-label">Colour</span>

        {MEMBER_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={
              color.toLowerCase() === swatch
                ? 'gms-swatch gms-swatch--on'
                : 'gms-swatch'
            }
            style={{ background: swatch }}
            disabled={busy}
            aria-label={swatch}
            aria-pressed={color.toLowerCase() === swatch}
            onClick={() => onColorChange(swatch)}
          />
        ))}

        {/* Rainbow until a custom colour is chosen, then it wears that colour
            so the row always shows which of the six is active. */}
        <button
          type="button"
          ref={customRef}
          className={
            custom
              ? 'gms-swatch gms-swatch--custom gms-swatch--on'
              : 'gms-swatch gms-swatch--custom'
          }
          style={custom ? { background: color } : undefined}
          disabled={busy}
          title="Custom colour"
          aria-label="Custom colour"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
        >
          <span aria-hidden>+</span>
        </button>

        <span className="gms-settings-hex">{color.toUpperCase()}</span>

        {pickerOpen && (
          <ColorPicker
            color={color}
            anchorRef={customRef}
            onChange={onColorChange}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {hasDiscord && (
        <label className="gms-settings-toggle">
          <input
            type="checkbox"
            checked={useDiscordAvatar}
            disabled={busy}
            onChange={(e) => onUseDiscordAvatarChange(e.target.checked)}
          />
          <span>Discord avatar</span>
        </label>
      )}
    </div>
  );
}
