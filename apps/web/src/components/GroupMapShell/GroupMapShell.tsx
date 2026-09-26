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
import {
  DEMO_GROUP,
  type AppearanceTheme,
  type GroupMode,
} from '../../api/groupClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useGroupData } from '../../hooks/useGroupData';
import { useGroupQuests } from '../../hooks/useGroupQuests';
import { useXpDrops } from '../../hooks/useXpDrops';
import {
  clearGroupSession,
  readGroupSession,
  writeGroupSession,
} from '../../lib/groupSession';
import { aggregateGroupItems, type PlayerView } from '../../lib/items';
import {
  panelOpacityToAlpha,
  readPanelOpacity,
  writePanelOpacity,
} from '../../lib/panelOpacity';
import { POLL_MS_DEFAULT, POLL_MS_MAP } from '../../lib/polling';
import { questPointsFor } from '../../lib/quests';
import { DEFAULT_CENTER, Rs3Map } from '../Map';
import { ActionsMenu } from './ActionsMenu';
import { AchievementsPanel } from './AchievementsPanel';
import { ItemsPanel } from './ItemsPanel';
import { LedgerPanel } from './LedgerPanel';
import { PlayerCard } from './PlayerCard';
import { QuestsPanel } from './QuestsPanel';
import { SettingsPanel } from './SettingsPanel';
import { SetupModal } from './SetupModal';
import './GroupMapShell.css';
import './GroupMapShell.theme-rs3.css';

// Recharts is heavy; only load it when the graphs tab is opened.
const GraphsPanel = lazy(() =>
  import('./GraphsPanel').then((m) => ({ default: m.GraphsPanel })),
);

const SUPPORT_URL = 'https://discord.gg/esbqXjUT6Z';
const DEFAULT_MEMBER_SLOTS = 5;

export type ShellTab =
  | 'items'
  | 'map'
  | 'graphs'
  | 'ledger'
  | 'quests'
  | 'achievements'
  | 'settings';

export type GroupMapShellProps = {
  /** When given, always wins over any saved session. */
  groupName?: string;
  groupToken?: string;
  initialTab?: ShellTab;
  /** Show demo-only controls (e.g. Test XP drop). */
  demoTools?: boolean;
  children?: ReactNode;
};

type MapFocus = {
  name: string;
  x: number;
  y: number;
  plane: number;
};

/**
 * Explicit props win; otherwise fall back to the saved session, then demo.
 */
function initialSession(name?: string, token?: string) {
  if (name) return { name, token: token ?? '' };
  const cached = readGroupSession();
  if (cached) return cached;
  return { name: DEMO_GROUP, token: token ?? '' };
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
  const [appearance, setAppearance] = useState<AppearanceTheme>('rs3');
  /** Set once the visitor chooses a look, so info refreshes stop overriding it. */
  const themePicked = useRef(false);
  const [panelOpacityByTheme, setPanelOpacityByTheme] = useState(() => ({
    rs3: readPanelOpacity('rs3'),
    modern: readPanelOpacity('modern'),
  }));
  const panelOpacity = panelOpacityByTheme[appearance];
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);

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

  // Mirror server-side group info into local editable state.
  useEffect(() => {
    if (!info) return;
    setDisplayName(info.name);
    setGroupMode(info.mode);
    // Once the visitor picks a look, keep it. On the read-only demo the choice
    // is local only, so a later info refresh must not snap it back.
    if (!themePicked.current) setAppearance(info.appearance ?? 'rs3');
  }, [info]);

  const selectAppearance = useCallback((theme: AppearanceTheme) => {
    themePicked.current = true;
    setAppearance(theme);
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
              skills: p.skills.map((s) =>
                s.id === skill.id ? { ...s, xp: s.xp + amount } : s,
              ),
            },
      ),
    );
  }, [players, patchPlayers]);

  const groupItems = useMemo(
    () => (tab === 'items' ? aggregateGroupItems(rawMembers) : []),
    [rawMembers, tab],
  );

  // Bumps whenever a poll brings new member data. The fetch-backed panels
  // watch this so they refresh in place instead of only on a tab switch.
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

  return (
    <div
      className="gms"
      data-appearance={appearance}
      style={
        {
          '--gms-panel-alpha': String(panelOpacityToAlpha(panelOpacity)),
        } as CSSProperties
      }
    >
      <Rs3Map
        className="rs3-map--fullscreen"
        height="100vh"
        x={mapFocus?.x ?? DEFAULT_CENTER.x}
        y={mapFocus?.y ?? DEFAULT_CENTER.y}
        plane={mapFocus?.plane ?? 0}
        markers={mapMarkers}
        activeMarkerId={mapFocus?.name ?? null}
      />

      <div className={tab === 'map' ? 'gms-overlay gms-overlay--map' : 'gms-overlay'}>
        <div className={tab === 'map' ? 'gms-chrome gms-chrome--with-nav' : 'gms-chrome'}>
          <header className="gms-toolbar">
            <div className="gms-toolbar-left">
              <div className="gms-group-identity">
                <img
                  className="gms-group-mode-icon"
                  src={
                    groupMode === 'competitive'
                      ? '/group-modes/competitive.webp'
                      : '/group-modes/normal.webp'
                  }
                  alt={groupMode === 'competitive' ? 'Competitive' : 'Normal'}
                  title={groupMode === 'competitive' ? 'Competitive' : 'Normal'}
                  width={18}
                  height={18}
                />
                <span className="gms-group-name">{displayName}</span>
              </div>
              <nav className="gms-tabs" aria-label="Group sections">
                <TabButton active={tab === 'items'} onClick={() => setTab('items')}>
                  Items
                </TabButton>
                <TabButton active={tab === 'map'} onClick={() => setTab('map')}>
                  Map
                </TabButton>
                <TabButton active={tab === 'graphs'} onClick={() => setTab('graphs')}>
                  Graphs
                </TabButton>
                <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')}>
                  Bank Ledger
                </TabButton>
                <TabButton active={tab === 'quests'} onClick={() => setTab('quests')}>
                  Quests
                </TabButton>
                <TabButton
                  active={tab === 'achievements'}
                  onClick={() => setTab('achievements')}
                >
                  Achievements
                </TabButton>
              </nav>
            </div>
            <div className="gms-toolbar-right">
              {/* Settings sits left of the overflow menu. */}
              <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
                Settings
              </TabButton>
              <ActionsMenu
                items={[
                  {
                    key: 'setup',
                    label: 'Setup',
                    onSelect: () => setSetupOpen(true),
                  },
                  {
                    key: 'logout',
                    label: 'Logout',
                    onSelect: () => {
                      clearGroupSession();
                      navigate('/', { replace: true });
                    },
                  },
                  { key: 'support', label: 'Support', href: SUPPORT_URL },
                ]}
              />
            </div>
          </header>

          {tab === 'map' && (
            <nav className="gms-player-nav" aria-label="Player locations">
              {players.map((player) => {
                const hasLoc = player.coordinates.length >= 2;
                const active = mapFocus?.name === player.name;
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
                      !hasLoc
                        ? 'Location unknown'
                        : player.online
                          ? `Go to ${player.name}`
                          : `Go to last location (${player.name} offline)`
                    }
                    disabled={!hasLoc}
                    onClick={() => goToPlayer(player)}
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
                        style={{
                          background: player.online
                            ? player.avatarColor
                            : '#7a7f86',
                        }}
                        aria-hidden
                      />
                    )}
                    {player.displayName}
                    {!player.online ? (
                      <span className="gms-player-nav-offline">offline</span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        <aside className="gms-players" aria-label="Group members">
          {loading && players.length === 0 && <p className="gms-side-status">Loading…</p>}
          {error && <p className="gms-side-status gms-side-status--error">{error}</p>}
          {!loading && !error && players.length === 0 && (
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

        {tab === 'items' && <ItemsPanel items={groupItems} />}
        {tab === 'graphs' && (
          <Suspense
            fallback={
              <section className="gms-graphs" aria-label="XP graphs" aria-busy>
                <p className="gms-graphs-status">Loading…</p>
              </section>
            }
          >
            <GraphsPanel
              groupName={groupName}
              groupToken={groupToken}
              dataRevision={dataRevision.current}
            />
          </Suspense>
        )}
        {tab === 'ledger' && (
          <LedgerPanel
            groupName={groupName}
            groupToken={groupToken}
            dataRevision={dataRevision.current}
          />
        )}
        {tab === 'quests' && (
          <QuestsPanel
            memberNames={memberNames}
            byMember={quests.byMember}
            loading={quests.loading}
            error={quests.error}
          />
        )}
        {tab === 'achievements' && (
          <AchievementsPanel
            groupName={groupName}
            groupToken={groupToken}
            appearance={appearance}
            dataRevision={dataRevision.current}
          />
        )}
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
              setPanelOpacityByTheme((prev) => ({
                ...prev,
                [appearance]: next,
              }));
            }}
            onAppearanceChange={selectAppearance}
            onModeChange={setGroupMode}
            onChanged={() => void refresh()}
          />
        )}

        {children}
      </div>

      {demoTools ? (
        <button type="button" className="gms-demo-xp-btn" onClick={testXpDrop}>
          Test XP drop
        </button>
      ) : null}

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
