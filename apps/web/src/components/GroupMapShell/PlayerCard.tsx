import { memo, useState } from 'react';
import { formatQty, itemName, type ItemStack, type PlayerView } from '../../lib/items';
import type { CombinedXpDrop } from '../../lib/xpDrops';
import { totalXpAmount, xpPartsBackToFront } from '../../lib/xpDrops';
import type { MemberQuestStates } from '../../lib/quests';
import { ItemIcon } from './ItemIcon';
import { PlayerQuestsPanel } from './PlayerQuestsPanel';
import { SkillsPanel } from './SkillsPanel';

export type PlayerPanel = 'inventory' | 'equipment' | 'skills' | 'quests' | null;

type ActionId = 'inventory' | 'equipment' | 'xp' | 'book';

const ACTIONS: {
  id: ActionId;
  label: string;
  icon: string;
  panel?: Exclude<PlayerPanel, null>;
}[] = [
  {
    id: 'inventory',
    label: 'Inventory',
    icon: '/sprites/tab_inventory.png',
    panel: 'inventory',
  },
  {
    id: 'equipment',
    label: 'Equipment',
    icon: '/sprites/tab_equipment.png',
    panel: 'equipment',
  },
  {
    id: 'xp',
    label: 'Skills',
    icon: '/sprites/skill_tab_skills.png',
    panel: 'skills',
  },
  {
    id: 'book',
    label: 'Quests',
    icon: '/sprites/quest_icon_skill_tab.png',
    panel: 'quests',
  },
];

export type PlayerCardProps = {
  player: PlayerView;
  xpDrop?: CombinedXpDrop | null;
  /** Called when the drop animation finishes; stable across renders. */
  onXpDropDone?: (playerName: string, id: string) => void;
  /** Quest points from the member's finished quests. */
  questPoints?: number;
  /** The member's quest states, for the quest book panel. */
  quests?: MemberQuestStates;
};

export const PlayerCard = memo(function PlayerCard({
  player,
  xpDrop = null,
  onXpDropDone,
  questPoints = 0,
  quests,
}: PlayerCardProps) {
  const [panel, setPanel] = useState<PlayerPanel>(null);

  const hpPct = pct(player.health.current, player.health.max);
  const prayPct = pct(player.prayer.current, player.prayer.max);
  const sumPct = pct(player.summoning.current, player.summoning.max);

  const stacks =
    panel === 'inventory'
      ? player.inventory
      : panel === 'equipment'
        ? player.equipment
        : [];

  return (
    <article
      className={[
        'gms-player',
        panel ? 'gms-player--open' : '',
        panel === 'skills' ? 'gms-player--skills' : '',
        panel === 'quests' ? 'gms-player--quests' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="gms-xp-drops" aria-hidden>
        {xpDrop ? (
          <div
            key={xpDrop.id}
            className="gms-xp-drop"
            onAnimationEnd={() => onXpDropDone?.(player.name, xpDrop.id)}
          >
            <span className="gms-xp-drop-icons">
              {xpPartsBackToFront(xpDrop.parts).map((part, index) => (
                <img
                  key={part.skillId}
                  className="gms-xp-drop-icon"
                  src={`/skills/${part.icon}`}
                  alt=""
                  width={16}
                  height={16}
                  title={`${part.skillName} +${formatQty(part.amount)}`}
                  style={{
                    zIndex: index + 1,
                    marginLeft: index === 0 ? 0 : -7,
                  }}
                />
              ))}
            </span>
            <span>
              {xpDrop.playerName ? `${xpDrop.playerName} ` : ''}
              +{formatQty(totalXpAmount(xpDrop))} xp
            </span>
          </div>
        ) : null}
      </div>
      <header className="gms-player-head">
        {player.avatarUrl ? (
          <img
            className="gms-player-avatar gms-player-avatar--img"
            src={player.avatarUrl}
            alt=""
            width={28}
            height={28}
          />
        ) : (
          <span
            className="gms-player-avatar"
            style={{ background: player.avatarColor }}
            aria-hidden
          />
        )}
        <div className="gms-player-meta">
          <div className="gms-player-name-row">
            <strong className="gms-player-name">{player.displayName}</strong>
            {/* Showing a world already says they are online, so the badge
                carries the world when we know it and "Offline" otherwise.
                The dot keeps the state readable without relying on colour. */}
            <span
              className={
                player.online
                  ? 'gms-player-presence gms-player-presence--online'
                  : 'gms-player-presence gms-player-presence--offline'
              }
              title={
                player.online
                  ? player.world > 0
                    ? `Online — world ${player.world}`
                    : 'Online'
                  : 'Offline'
              }
              aria-label={
                player.online
                  ? player.world > 0
                    ? `Online, world ${player.world}`
                    : 'Online'
                  : 'Offline'
              }
            >
              <span className="gms-player-presence-dot" aria-hidden />
              <span aria-hidden>
                {player.online
                  ? player.world > 0
                    ? `W${player.world}`
                    : 'Online'
                  : 'Offline'}
              </span>
            </span>
          </div>
          {player.nickname ? (
            <span className="gms-player-rsn">{player.name}</span>
          ) : null}
          {player.lastSeen ? (
            <time className="gms-player-time" dateTime={player.lastSeen}>
              {formatLastSeen(player.lastSeen)}
            </time>
          ) : (
            <span className="gms-player-time">—</span>
          )}
        </div>
      </header>

      <div className="gms-player-stats">
        <StatBar
          kind="hp"
          icon="/skills/constitution.png"
          pct={hpPct}
          label={`${player.health.current} / ${player.health.max}`}
        />
        <StatBar
          kind="pray"
          icon="/skills/prayer.png"
          pct={prayPct}
          label={`${player.prayer.current} / ${player.prayer.max}`}
        />
        <StatBar
          kind="summon"
          icon="/sprites/summon_icon.png"
          pct={sumPct}
          label={`${player.summoning.current} / ${player.summoning.max}`}
        />
      </div>

      <div className="gms-player-actions">
        {ACTIONS.map((action) => {
          const active = action.panel != null && panel === action.panel;
          const enabled = action.panel != null;
          return (
            <button
              key={action.id}
              type="button"
              className={active ? 'gms-icon-btn gms-icon-btn--active' : 'gms-icon-btn'}
              title={action.label}
              aria-label={action.label}
              aria-pressed={active}
              disabled={!enabled}
              onClick={() => {
                if (!action.panel) return;
                const next = action.panel;
                setPanel((prev) => (prev === next ? null : next));
              }}
            >
              <img
                className="gms-icon-btn-img"
                src={action.icon}
                alt=""
                width={22}
                height={22}
                draggable={false}
              />
            </button>
          );
        })}
      </div>

      {panel === 'skills' && (
        <SkillsPanel
          skills={player.skills}
          totalLevel={player.totalLevel}
          questPoints={questPoints}
        />
      )}

      {panel === 'quests' && <PlayerQuestsPanel states={quests} skills={player.skills} />}

      {(panel === 'inventory' || panel === 'equipment') && (
        <div className="gms-player-panel">
          <div className="gms-player-panel-title">{panelLabel(panel)}</div>
          {stacks.length === 0 ? (
            <p className="gms-player-panel-empty">Empty</p>
          ) : (
            <div className="gms-inv-grid">
              {stacks.map((stack, index) => (
                <ItemSlot key={`${stack.id}-${index}`} stack={stack} />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
});

function formatLastSeen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function StatBar({
  kind,
  icon,
  pct: value,
  label,
}: {
  kind: 'hp' | 'pray' | 'summon';
  icon: string;
  pct: number;
  label: string;
}) {
  return (
    <div className="gms-stat-row">
      <img className="gms-stat-icon" src={icon} alt="" width={18} height={18} draggable={false} />
      <div className={`gms-stat gms-stat--${kind}`} title={label}>
        {/* Trail layer. Same width as the fill but a slower, delayed
            transition, so a drop leaves a visible tail that catches up. On a
            gain it sits behind the fill and stays hidden. */}
        <div className="gms-stat-ghost" style={{ width: `${value}%` }} aria-hidden />
        <div className={`gms-stat-bar gms-stat-bar--${kind}`} style={{ width: `${value}%` }} />
        <span className="gms-stat-text">{label}</span>
      </div>
    </div>
  );
}

function ItemSlot({ stack }: { stack: ItemStack }) {
  const name = itemName(stack.id);
  return (
    <div
      className="gms-inv-slot"
      title={stack.quantity > 1 ? `${name} × ${formatQty(stack.quantity)}` : name}
    >
      <ItemIcon itemId={stack.id} size={32} />
      {stack.quantity > 1 && <span className="gms-inv-qty">{formatQty(stack.quantity)}</span>}
    </div>
  );
}

function pct(current: number, max: number) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
}

function panelLabel(panel: 'inventory' | 'equipment') {
  if (panel === 'inventory') return 'Inventory';
  return 'Equipment';
}
