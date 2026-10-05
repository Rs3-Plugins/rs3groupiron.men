import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_GROUP, type AppearanceTheme, type GroupMode } from '../../api/groupClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useGroupData } from '../../hooks/useGroupData';
import { useGroupQuests } from '../../hooks/useGroupQuests';
import { useXpDrops } from '../../hooks/useXpDrops';
import { DEFAULT_APPEARANCE, readAppearance, writeAppearance } from '../../lib/appearance';
import { DISCORD_URL } from '../../lib/constants';
import { clearGroupSession, readGroupSession, writeGroupSession } from '../../lib/groupSession';
import { aggregateGroupItems, type PlayerView } from '../../lib/items';
import { panelOpacityToAlpha, readPanelOpacity, writePanelOpacity } from '../../lib/panelOpacity';
import { POLL_MS_DEFAULT, POLL_MS_MAP } from '../../lib/polling';
import { questPointsFor } from '../../lib/quests';
import {
  DEFAULT_CENTER,
  findMapMode,
  MAP_MODES,
  readMapMode,
  Rs3Map,
  writeMapMode,
  type MapMode,
} from '../Map';
import { ActionsMenu } from './ActionsMenu';
import { AchievementsPanel } from './AchievementsPanel';
import { FullscreenIcon, LayersIcon } from './icons';
import { ItemsPanel } from './ItemsPanel';
import { LedgerPanel } from './LedgerPanel';
import type { MemberBadge } from './memberOptions';
import { PanelStatus } from './PanelChrome';
import { PlayerCard } from './PlayerCard';
import { PlayerCardSkeleton } from './PlayerCardSkeleton';
import { QuestsPanel } from './QuestsPanel';
import { SettingsPanel } from './SettingsPanel';
import { SetupModal } from './SetupModal';
import './GroupMapShell.css';
import './GroupMapShell.theme-rs3.css';

// Recharts is heavy; only load it when the graphs tab is opened.
const GraphsPanel = lazy(() => import('./GraphsPanel').then((m) => ({ default: m.GraphsPanel })));

const DEFAULT_MEMBER_SLOTS = 5;

export type ShellTab =
  | 'items'
  | 'map'
  | 'graphs'
  | 'ledger'
  | 'quests'
  | 'achievements'
  | 'settings';

const NAV_TABS: Array<{ id: ShellTab; label: string }> = [
  { id: 'items', label: 'Items' },
  { id: 'map', label: 'Map' },
  { id: 'graphs', label: 'Graphs' },
  { id: 'ledger', label: 'Bank Ledger' },
  { id: 'quests', label: 'Quests' },
  { id: 'achievements', label: 'Achievements' },
];

export type GroupMapShellProps = {
  /** When given, always wins over any saved session. */
  groupName?: string;
  groupToken?: string;
  initialTab?: ShellTab;
  /** Show demo-only controls (e.g. Test XP drop). */
  demoTools?: boolean;
  children?: ReactNode;
};

type MapFocus = { name: string; x: number; y: number; plane: number };

function initialSession(name?: string, token?: string) {
  if (name) return { name, token: token ?? '' };
  return readGroupSession() ?? { name: DEMO_GROUP, token: token ?? '' };
}

export function GroupMapShell({
  groupName: initialGroupName,
  groupToken: initialGroupToken,
  initialTab = 'map',
  demoTools = false,
  children,
}: GroupMapShellProps) {
  const navigate = useNavigate();
  const [boot] = useState(() => initialSession(initialGroupName, initialGroupToken));
  const [tab, setTab] = useState<ShellTab>(initialTab);
  const [groupName, setGroupName] = useState(boot.name);
  const [groupToken, setGroupToken] = useState(boot.token);
  const [setupOpen, setSetupOpen] = useState(false);
  const [displayName, setDisplayName] = useState(boot.name);
  const [groupMode, setGroupMode] = useState<GroupMode>('normal');
  const [appearance, setAppearance] = useState<AppearanceTheme>(readAppearance);
  /** Set once the visitor chooses a look, so info refreshes stop overriding it. */
  const themePicked = useRef(false);
  const [panelOpacityByTheme, setPanelOpacityByTheme] = useState(() => ({
    rs3: readPanelOpacity('rs3'),
    modern: readPanelOpacity('modern'),
  }));
  const panelOpacity = panelOpacityByTheme[appearance];
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>(readMapMode);
  const fullscreen = useFullscreen();

  const selectMapMode = useCallback((next: MapMode) => {
    writeMapMode(next);
    setMapMode(next);
  }, []);

  const pollMs = tab === 'map' ? POLL_MS_MAP : POLL_MS_DEFAULT;
  const { players, rawMembers, info, loading, error, refresh, patchPlayers } = useGroupData(
    groupName,
    groupToken,
    pollMs,
  );
  const { xpDropsByPlayer, dismissXpDrop } = useXpDrops(players);
  const memberSlots = info?.member_slots ?? DEFAULT_MEMBER_SLOTS;
  // Group views are private (or the demo); keep them out of search results.
  useDocumentTitle(info?.name ?? groupName, { noindex: true });

  useEffect(() => {
    if (!info) return;
    setDisplayName(info.name);
    setGroupMode(info.mode);
    // Once the visitor picks a look, keep it. On the read-only demo the choice
    // is local only, so a later info refresh must not snap it back.
    if (!themePicked.current) {
      const next = info.appearance ?? DEFAULT_APPEARANCE;
      setAppearance(next);
      writeAppearance(next);
    }
  }, [info]);

  const selectAppearance = useCallback((theme: AppearanceTheme) => {
    themePicked.current = true;
    setAppearance(theme);
    writeAppearance(theme);
  }, []);

  useEffect(() => {
    // Tokenless views (e.g. the public demo) must not persist — an empty token
    // is not a valid session and would clobber a real saved one.
    if (!groupToken) return;
    writeGroupSession({ name: groupName, token: groupToken });
  }, [groupName, groupToken]);

  const testXpDrop = useCallback(() => {
    const pool = players.filter((p) => p.online);
    const player = pool[Math.floor(Math.random() * pool.length)] ?? players[0];
    if (!player?.skills.length) return;
    const skill = player.skills[Math.floor(Math.random() * player.skills.length)]!;
    const amount = [12, 20, 35, 50, 75, 100][Math.floor(Math.random() * 6)]!;
    // Bumping XP locally lets useXpDrops pick up the gain like a real poll.
    patchPlayers((prev) =>
      prev.map((p) =>
        p.name !== player.name
          ? p
          : {
              ...p,
              // Drop the viewKey so the next poll rebuilds this player from
              // server data instead of keeping the locally inflated XP.
              viewKey: undefined,
              skills: p.skills.map((s) => (s.id === skill.id ? { ...s, xp: s.xp + amount } : s)),
            },
      ),
    );
  }, [players, patchPlayers]);

  const groupItems = useMemo(
    () => (tab === 'items' ? aggregateGroupItems(rawMembers) : []),
    [rawMembers, tab],
  );

  const dataRevision = useRef(0);
  const lastMembers = useRef(rawMembers);
  if (lastMembers.current !== rawMembers) {
    lastMembers.current = rawMembers;
    dataRevision.current += 1;
  }

  // Quest progress feeds both the Quests tab and the quest points on each
  // player's skills panel, so it lives at shell level.
  const quests = useGroupQuests(groupName, groupToken, dataRevision.current);
  const memberNames = useMemo(() => players.map((p) => p.name), [players]);

  const memberBadges = useMemo<MemberBadge[]>(
    () =>
      players.map((p) => ({ name: p.name, avatarUrl: p.avatarUrl, color: p.avatarColor })),
    [players],
  );

  const mapMarkers = useMemo(
    () =>
      players.flatMap((player) => {
        const [x, y, plane = 0] = player.coordinates;
        if (typeof x !== 'number' || typeof y !== 'number') return [];
        return [
          {
            id: player.name,
            name: player.name,
            x,
            y,
            plane: plane ?? 0,
            color: player.avatarColor,
            avatarUrl: player.avatarUrl,
            online: player.online,
          },
        ];
      }),
    [players],
  );

  function goToPlayer(player: PlayerView) {
    const [x, y, plane = 0] = player.coordinates;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    setMapFocus({ name: player.name, x, y, plane: plane ?? 0 });
    setTab('map');
  }

  const panelProps = {
    groupName,
    groupToken,
    dataRevision: dataRevision.current,
    members: memberBadges,
  };

  return (
    <div
      className="gms"
      data-appearance={appearance}
      style={
        { '--gms-panel-alpha': String(panelOpacityToAlpha(panelOpacity)) } as CSSProperties
      }
    >
      <Rs3Map
        className="rs3-map--fullscreen"
        height="100vh"
        x={mapFocus?.x ?? DEFAULT_CENTER.x}
        y={mapFocus?.y ?? DEFAULT_CENTER.y}
        plane={mapFocus?.plane ?? 0}
        mode={mapMode}
        markers={mapMarkers}
        activeMarkerId={mapFocus?.name ?? null}
      />

      <div className={tab === 'map' ? 'gms-overlay gms-overlay--map' : 'gms-overlay'}>
        <div className={tab === 'map' ? 'gms-chrome gms-chrome--with-nav' : 'gms-chrome'}>
          <header className="gms-toolbar">
            <div className="gms-toolbar-left">
              <GroupIdentity name={displayName} mode={groupMode} />
              <nav className="gms-tabs" aria-label="Group sections">
                {NAV_TABS.map(({ id, label }) => (
                  <TabButton key={id} active={tab === id} onClick={() => setTab(id)}>
                    {label}
                  </TabButton>
                ))}
              </nav>
            </div>
            <div className="gms-toolbar-right">
              <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
                Settings
              </TabButton>
              <ActionsMenu
                items={[
                  { key: 'setup', label: 'Setup', onSelect: () => setSetupOpen(true) },
                  {
                    key: 'logout',
                    label: 'Logout',
                    onSelect: () => {
                      clearGroupSession();
                      navigate('/', { replace: true });
                    },
                  },
                  { key: 'support', label: 'Support', href: DISCORD_URL },
                ]}
              />
            </div>
          </header>

          {tab === 'map' && (
            <PlayerNav
              players={players}
              activeName={mapFocus?.name ?? null}
              onSelect={goToPlayer}
            />
          )}
        </div>

        <aside className="gms-players" aria-label="Group members">
          {error && <p className="gms-side-status gms-side-status--error">{error}</p>}
          {!error &&
            loading &&
            players.length === 0 &&
            Array.from({ length: memberSlots }, (_, i) => <PlayerCardSkeleton key={i} />)}
          {!error && !loading && players.length === 0 && (
            <p className="gms-side-status">No members yet</p>
          )}
          {players.map((player) => (
            <PlayerCard
              key={player.name}
              player={player}
              xpDrop={xpDropsByPlayer[player.name] ?? null}
              onXpDropDone={dismissXpDrop}
              questPoints={questPointsFor(quests.byMember[player.name])}
              quests={quests.byMember[player.name]}
            />
          ))}
        </aside>

        {tab === 'items' && <ItemsPanel items={groupItems} members={memberBadges} />}
        {tab === 'graphs' && (
          <Suspense
            fallback={
              <section className="gms-graphs gms-panel" aria-label="XP graphs" aria-busy>
                <PanelStatus loading />
              </section>
            }
          >
            <GraphsPanel {...panelProps} />
          </Suspense>
        )}
        {tab === 'ledger' && <LedgerPanel {...panelProps} />}
        {tab === 'quests' && (
          <QuestsPanel
            memberNames={memberNames}
            members={memberBadges}
            byMember={quests.byMember}
            loading={quests.loading}
            error={quests.error}
          />
        )}
        {tab === 'achievements' && <AchievementsPanel {...panelProps} appearance={appearance} />}
        {tab === 'settings' && (
          <SettingsPanel
            groupName={groupName}
            groupToken={groupToken}
            players={players}
            memberSlots={memberSlots}
            appearance={appearance}
            groupMode={groupMode}
            panelOpacity={panelOpacity}
            onPanelOpacityChange={(value) => {
              const next = writePanelOpacity(appearance, value);
              setPanelOpacityByTheme((prev) => ({ ...prev, [appearance]: next }));
            }}
            onAppearanceChange={selectAppearance}
            onModeChange={setGroupMode}
            onChanged={() => void refresh()}
          />
        )}

        {children}
      </div>

      <div className="gms-corner-tools">
        <div className="gms-maptools">
          <ActionsMenu
            label={findMapMode(mapMode).label}
            title="Map style"
            icon={<LayersIcon />}
            placement="top"
            items={MAP_MODES.map((style) => ({
              key: style.id,
              label: style.label,
              hint: style.hint,
              active: style.id === mapMode,
              onSelect: () => selectMapMode(style.id),
            }))}
          />
          {fullscreen.supported && (
            <button
              type="button"
              className="gms-action gms-action--icon"
              aria-pressed={fullscreen.active}
              title={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={fullscreen.toggle}
            >
              <FullscreenIcon exit={fullscreen.active} />
            </button>
          )}
        </div>

        {demoTools && (
          <button type="button" className="gms-demo-xp-btn" onClick={testXpDrop}>
            Test XP drop
          </button>
        )}
      </div>

      <SetupModal
        open={setupOpen}
        appearance={appearance}
        groupName={groupName}
        groupToken={groupToken}
        onClose={() => setSetupOpen(false)}
        onSaved={({ name, token }) => {
          setGroupName(name);
          setGroupToken(token);
          setDisplayName(name);
          writeGroupSession({ name, token });
        }}
      />
    </div>
  );
}

function GroupIdentity({ name, mode }: { name: string; mode: GroupMode }) {
  const label = mode === 'competitive' ? 'Competitive' : 'Normal';
  return (
    <div className="gms-group-identity">
      <img
        className="gms-group-mode-icon"
        src={`/group-modes/${mode === 'competitive' ? 'competitive' : 'normal'}.webp`}
        alt={label}
        title={label}
        width={18}
        height={18}
      />
      <span className="gms-group-name">{name}</span>
    </div>
  );
}

function PlayerNav({
  players,
  activeName,
  onSelect,
}: {
  players: PlayerView[];
  activeName: string | null;
  onSelect: (player: PlayerView) => void;
}) {
  return (
    <nav className="gms-player-nav" aria-label="Player locations">
      {players.map((player) => {
        const hasLocation = player.coordinates.length >= 2;
        const active = activeName === player.name;
        return (
          <button
            key={player.name}
            type="button"
            className={[
              'gms-player-nav-btn',
              active ? 'gms-player-nav-btn--active' : '',
              !player.online ? 'gms-player-nav-btn--offline' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={
              !hasLocation
                ? 'Location unknown'
                : player.online
                  ? `Go to ${player.name}`
                  : `Go to last location (${player.name} offline)`
            }
            disabled={!hasLocation}
            onClick={() => onSelect(player)}
          >
            {player.avatarUrl ? (
              <img
                className="gms-player-nav-avatar"
                src={player.avatarUrl}
                alt=""
                width={12}
                height={12}
              />
            ) : (
              <span
                className="gms-player-nav-dot"
                style={{ background: player.online ? player.avatarColor : '#7a7f86' }}
                aria-hidden
              />
            )}
            {player.displayName}
            {!player.online && <span className="gms-player-nav-offline">offline</span>}
          </button>
        );
      })}
    </nav>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? 'gms-tab gms-tab--active' : 'gms-tab'}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
