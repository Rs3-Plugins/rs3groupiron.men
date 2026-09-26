import { useState } from 'react';
import type { AppearanceTheme } from '../../api/groupClient';
import { discordAvatarUrl } from '../../lib/items';
import { Modal } from '../Modal';
import { PlusIcon } from './icons';

export type NewMember = {
  name: string;
  nickname?: string;
  discord_id?: string;
  color: string;
  use_discord_avatar: boolean;
};

type AddMemberModalProps = {
  appearance: AppearanceTheme;
  busy: boolean;
  onClose: () => void;
  onSubmit: (member: NewMember) => void;
};

const DEFAULT_COLOR = '#4a8f3c';

/** Mount only while open; the form state resets on unmount. */
export function AddMemberModal({ appearance, busy, onClose, onSubmit }: AddMemberModalProps) {
  const [name, setName] = useState('');
  const [nick, setNick] = useState('');
  const [discord, setDiscord] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [useDiscordAvatar, setUseDiscordAvatar] = useState(true);

  const hasValidDiscord = !!discordAvatarUrl(discord);

  return (
    <Modal
      open
      onClose={onClose}
      titleId="gms-add-member-title"
      title="Add member"
      appearance={appearance}
      closeDisabled={busy}
    >
      <form
        className="gms-modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          onSubmit({
            name: trimmed,
            nickname: nick.trim() || undefined,
            discord_id: discord.trim() || undefined,
            color,
            use_discord_avatar: hasValidDiscord ? useDiscordAvatar : false,
          });
        }}
      >
        <label>
          RuneScape name
          <input
            value={name}
            required
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Nickname
          <input value={nick} disabled={busy} onChange={(e) => setNick(e.target.value)} />
        </label>
        <label>
          Discord user id
          <input
            value={discord}
            disabled={busy}
            inputMode="numeric"
            onChange={(e) => setDiscord(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <div className="gms-settings-member-opts">
          <label className="gms-settings-color">
            <span>Colour</span>
            <input
              type="color"
              value={color}
              disabled={busy}
              aria-label="Member colour"
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          {hasValidDiscord && (
            <label className="gms-settings-toggle">
              <input
                type="checkbox"
                checked={useDiscordAvatar}
                disabled={busy}
                onChange={(e) => setUseDiscordAvatar(e.target.checked)}
              />
              <span>Discord avatar</span>
            </label>
          )}
        </div>
        <div className="gms-modal-actions">
          <button type="button" className="gms-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="gms-settings-text-btn gms-settings-save"
            disabled={busy || !name.trim()}
          >
            <PlusIcon />
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}
