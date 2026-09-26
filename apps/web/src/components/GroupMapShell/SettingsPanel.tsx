import { useMemo, useState } from 'react';
import {
  addGroupMember,
  deleteGroupMember,
  DEMO_GROUP,
  updateGroupSettings,
  updateMemberProfile,
  type AppearanceTheme,
  type GroupMode,
} from '../../api/groupClient';
import { MIN_SLOTS } from '../../lib/constants';
import type { PlayerView } from '../../lib/items';
import { AddMemberModal } from './AddMemberModal';
import { AppearanceSection } from './AppearanceSection';
import { PlusIcon } from './icons';
import { MemberCard } from './MemberCard';
import { RemoveMemberModal } from './RemoveMemberModal';

type SettingsPanelProps = {
  groupName?: string;
  groupToken?: string;
  players: PlayerView[];
  memberSlots: number;
  appearance: AppearanceTheme;
  groupMode: GroupMode;
  panelOpacity: number;
  onPanelOpacityChange: (value: number) => void;
  onChanged: () => void;
  onAppearanceChange: (theme: AppearanceTheme) => void;
  onModeChange: (mode: GroupMode) => void;
};

export function SettingsPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  players,
  memberSlots,
  appearance,
  groupMode,
  panelOpacity,
  onPanelOpacityChange,
  onChanged,
  onAppearanceChange,
  onModeChange,
}: SettingsPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [removeName, setRemoveName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBusy = busy != null;
  // No token means this is the public demo, which the server serves read-only.
  const readOnly = !groupToken;
  const canAdd = players.length < memberSlots && !readOnly;
  const canRemove = players.length > MIN_SLOTS && !readOnly;

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  async function run(key: string, action: () => Promise<void>) {
    if (readOnly) {
      setMessage(null);
      setError(
        'This is the read-only demo. You can still switch the look below. Create your own group to change anything else.',
      );
      return;
    }
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="gms-settings" aria-label="Settings">
      <h2 className="gms-settings-title">Settings</h2>

      {readOnly && (
        <p className="gms-settings-banner" role="status">
          You are viewing the read-only demo group. Try the RS3 and Modern looks
          below — anything else needs your own group.
        </p>
      )}

      {error && (
        <p className="gms-settings-banner gms-settings-banner--error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="gms-settings-banner" role="status">
          {message}
        </p>
      )}

      <div className="gms-settings-section">
        <div className="gms-settings-section-head">
          <div>
            <h3 className="gms-settings-heading">Members</h3>
            <p className="gms-settings-hint">
              {players.length}/{memberSlots} slots filled
              {canAdd ? ' · open slot available' : ' · group full'}
            </p>
          </div>
        </div>

        <ul className="gms-settings-members">
          {sortedPlayers.map((player) => (
            <MemberCard
              key={player.name}
              player={player}
              canRemove={canRemove}
              busy={isBusy}
              onRemove={() => setRemoveName(player.name)}
              onSave={(draft) =>
                void run(`save-${player.name}`, async () => {
                  await updateMemberProfile(groupName, groupToken, {
                    name: player.name,
                    nickname: draft.nickname.trim() || null,
                    discord_id: draft.discordId.trim() || null,
                    color: draft.color,
                    use_discord_avatar: draft.useDiscordAvatar,
                  });
                  setMessage(`Saved ${player.name}`);
                })
              }
            />
          ))}
          {canAdd && (
            <li className="gms-settings-member gms-settings-member--add">
              <button
                type="button"
                className="gms-settings-add-card"
                disabled={isBusy}
                onClick={() => setAddOpen(true)}
              >
                <span className="gms-settings-add-card-icon" aria-hidden>
                  <PlusIcon />
                </span>
                <span className="gms-settings-add-card-label">Add</span>
              </button>
            </li>
          )}
        </ul>
      </div>

      <AppearanceSection
        appearance={appearance}
        groupMode={groupMode}
        panelOpacity={panelOpacity}
        busy={isBusy}
        onPanelOpacityChange={onPanelOpacityChange}
        onSelectAppearance={(theme) => {
          const label = theme === 'rs3' ? 'RS3' : 'Modern';
          // The look is a client-side skin, not group data, so the tokenless
          // demo can still switch it — it just isn't saved anywhere.
          if (readOnly) {
            onAppearanceChange(theme);
            setError(null);
            setMessage(`Previewing the ${label} look`);
            return;
          }
          void run(`appearance-${theme}`, async () => {
            const info = await updateGroupSettings(groupName, groupToken, {
              appearance: theme,
            });
            onAppearanceChange(info.appearance);
            setMessage(`Appearance set to ${label}`);
          });
        }}
        onSelectMode={(mode) =>
          void run(`mode-${mode}`, async () => {
            const info = await updateGroupSettings(groupName, groupToken, { mode });
            onModeChange(info.mode);
            setMessage(`Mode set to ${mode === 'normal' ? 'Normal' : 'Competitive'}`);
          })
        }
      />

      {addOpen && (
        <AddMemberModal
          appearance={appearance}
          busy={isBusy}
          onClose={() => setAddOpen(false)}
          onSubmit={(member) => {
            if (!canAdd) return;
            void run('add', async () => {
              await addGroupMember(groupName, groupToken, member);
              setAddOpen(false);
              setMessage(`Added ${member.name}`);
            });
          }}
        />
      )}

      {removeName != null && (
        <RemoveMemberModal
          name={removeName}
          appearance={appearance}
          busy={isBusy}
          onClose={() => setRemoveName(null)}
          onConfirm={() => {
            const name = removeName;
            void run(`del-${name}`, async () => {
              await deleteGroupMember(groupName, groupToken, name);
              setRemoveName(null);
              setMessage(`Removed ${name}`);
            });
          }}
        />
      )}
    </section>
  );
}
