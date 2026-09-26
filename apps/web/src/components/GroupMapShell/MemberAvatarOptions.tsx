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
  return (
    <div className="gms-settings-member-opts">
      <label className="gms-settings-color">
        <span>Colour</span>
        <input
          type="color"
          value={color}
          disabled={busy}
          aria-label={colorLabel}
          onChange={(e) => onColorChange(e.target.value)}
        />
      </label>
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
