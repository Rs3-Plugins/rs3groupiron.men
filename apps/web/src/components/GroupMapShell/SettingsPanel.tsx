import { useMemo, useState } from 'react';
import {
  addGroupMember,
  deleteGroupMember,
  DEMO_GROUP,
  updateGroupSettings,
  updateMemberProfile,
  type GroupMode,
  type GroupShares,
  type GroupVisibility,
} from '../../api/groupClient';
import { MIN_SLOTS, SITE_URL } from '../../lib/constants';
import type { PlayerView } from '../../lib/items';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { AddMemberModal } from './AddMemberModal';
import { AppearanceSection, GroupModeSection } from './AppearanceSection';
import type { LayoutDir, ThemePref } from '../../lib/uiPrefs';
import { Banner } from './PanelChrome';
import { PlusIcon } from './icons';
import { MemberCard } from './MemberCard';
import { RemoveMemberModal } from './RemoveMemberModal';
import { VisibilitySection } from './VisibilitySection';

const READ_ONLY_NOTICE =
  'You are a visitor here. You can still change the theme below; everything else needs this group’s token.';

type SettingsPanelProps = {
  groupName?: string;
  groupToken?: string;
  players: PlayerView[];
  memberSlots: number;
  theme: ThemePref;
  dir: LayoutDir;
  navFull: boolean;
  navHide: boolean;
  mapBg: boolean;
  groupMode: GroupMode;
  visibility: GroupVisibility;
  shares: GroupShares;
  panelOpacity: number;
  onPanelOpacityChange: (value: number) => void;
  onChanged: () => void;
  onThemeChange: (theme: ThemePref) => void;
  onDirChange: (dir: LayoutDir) => void;
  onNavFullChange: (full: boolean) => void;
  onNavHideChange: (hide: boolean) => void;
  onMapBgChange: (on: boolean) => void;
  onModeChange: (mode: GroupMode) => void;
  onVisibilityChange: (visibility: GroupVisibility) => void;
  onSharesChange: (shares: GroupShares) => void;
  onOpenSetup: () => void;
};

export function SettingsPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  players,
  memberSlots,
  theme,
  dir,
  navFull,
  navHide,
  mapBg,
  groupMode,
  visibility,
  shares,
  panelOpacity,
  onPanelOpacityChange,
  onChanged,
  onThemeChange,
  onDirChange,
  onNavFullChange,
  onNavHideChange,
  onMapBgChange,
  onModeChange,
  onVisibilityChange,
  onSharesChange,
  onOpenSetup,
}: SettingsPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [removeName, setRemoveName] = useState<string | null>(null);
  const { isBusy, message, error, setMessage, setError, run } = useAsyncAction();

  // No token means this is the public demo, which the server serves read-only.
  const readOnly = !groupToken;
  const canAdd = players.length < memberSlots && !readOnly;
  const canRemove = players.length > MIN_SLOTS && !readOnly;

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  function save(key: string, action: () => Promise<void>) {
    if (readOnly) {
      setMessage(null);
      setError(READ_ONLY_NOTICE);
      return;
    }
    void run(key, async () => {
      await action();
      onChanged();
    });
  }

  return (
    <section className="gms-settings" aria-label="Settings">
      {/* On a card like every other section, rather than floating loose above
          them: the title, the setup shortcut and whatever the page needs to
          say about this group all belong to the same block. */}
      <section className="gms-panel gms-settings-card gms-settings-intro">
        <div className="gms-settings-head">
          <div className="gms-settings-head-text">
            <h1 className="gms-page-title">Settings</h1>
            <span className="gms-settings-hint">Group “{groupName}”</span>
          </div>
          <button type="button" className="gms-setup-btn" onClick={onOpenSetup}>
            <strong>Open setup</strong>
            <em>Token &amp; plugin guide</em>
          </button>
        </div>

        {readOnly && (
          <Banner>
            {groupName === DEMO_GROUP
              ? 'You are viewing the read-only demo group. The theme and panel opacity below are yours to change — anything else needs your own group.'
              : `You are viewing “${groupName}” as a visitor. The theme and panel opacity below are yours to change — anything else needs this group’s token.`}
          </Banner>
        )}
        {error && <Banner tone="error">{error}</Banner>}
        {message && <Banner>{message}</Banner>}
      </section>

      <section className="gms-panel gms-settings-card">
        <div className="gms-settings-card-head">
          <h2 className="gms-section-title">Members</h2>
          <span className="gms-settings-hint">
            {players.length} / {memberSlots} slots filled
            {canAdd ? ' · open slot available' : ' · group full'}
          </span>
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
                save(`save-${player.name}`, async () => {
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
      </section>

      <AppearanceSection
        theme={theme}
        dir={dir}
        navFull={navFull}
        navHide={navHide}
        mapBg={mapBg}
        panelOpacity={panelOpacity}
        onPanelOpacityChange={onPanelOpacityChange}
        // Appearance is a personal preference kept in localStorage, not group
        // data, so it never travels to the server and works without a token.
        onSelectTheme={(next) => {
          onThemeChange(next);
          setError(null);
        }}
        onSelectDir={(next) => {
          onDirChange(next);
          setError(null);
        }}
        onSelectNavFull={(next) => {
          onNavFullChange(next);
          setError(null);
        }}
        onSelectNavHide={(next) => {
          onNavHideChange(next);
          setError(null);
        }}
        onSelectMapBg={(next) => {
          onMapBgChange(next);
          setError(null);
        }}
      />

      <VisibilitySection
        visibility={visibility}
        shares={shares}
        busy={isBusy}
        publicUrl={`${SITE_URL}/g/${encodeURIComponent(groupName)}`}
        onSelectVisibility={(next) =>
          save(`visibility-${next}`, async () => {
            const info = await updateGroupSettings(groupName, groupToken, {
              visibility: next,
            });
            onVisibilityChange(info.visibility);
            onSharesChange(info.shares);
            setMessage(
              next === 'public'
                ? 'Your group can now be found by name'
                : 'Your group is private again',
            );
          })
        }
        onToggleShare={(key, on) =>
          save(`share-${key}`, async () => {
            const info = await updateGroupSettings(groupName, groupToken, {
              shares: { [key]: on },
            });
            onSharesChange(info.shares);
            setMessage(on ? 'Now shared' : 'No longer shared');
          })
        }
      />

      <GroupModeSection
        groupMode={groupMode}
        busy={isBusy}
        onSelectMode={(mode) =>
          save(`mode-${mode}`, async () => {
            const info = await updateGroupSettings(groupName, groupToken, { mode });
            onModeChange(info.mode);
            setMessage(`Mode set to ${mode === 'normal' ? 'Normal' : 'Competitive'}`);
          })
        }
      />

      {addOpen && (
        <AddMemberModal
          busy={isBusy}
          onClose={() => setAddOpen(false)}
          onSubmit={(member) => {
            if (!canAdd) return;
            save('add', async () => {
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
          busy={isBusy}
          onClose={() => setRemoveName(null)}
          onConfirm={() =>
            save(`del-${removeName}`, async () => {
              await deleteGroupMember(groupName, groupToken, removeName);
              setRemoveName(null);
              setMessage(`Removed ${removeName}`);
            })
          }
        />
      )}
    </section>
  );
}
