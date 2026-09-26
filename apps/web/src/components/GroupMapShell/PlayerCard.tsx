import { memo, useState } from 'react';
import { formatQty, itemName, type ItemStack, type PlayerView } from '../../lib/items';
import type { CombinedXpDrop } from '../../lib/xpDrops';
import { totalXpAmount, xpPartsBackToFront } from '../../lib/xpDrops';
import type { MemberQuestStates } from '../../lib/quests';
import { ItemIcon } from './ItemIcon';
import { PlayerQuestsPanel } from './PlayerQuestsPanel';
import { SkillsPanel } from './SkillsPanel';

export type PlayerPanel = 'inventory' | 'equipment' | 'skills' | 'quests' | null;

type OpenPanel = Exclude<PlayerPanel, null>;

const ACTIONS: Array<{ panel: OpenPanel; label: string; icon: string }> = [
  { panel: 'inventory', label: 'Inventory', icon: '/sprites/tab_inventory.png' },
  { panel: 'equipment', label: 'Equipment', icon: '/sprites/tab_equipment.png' },
  { panel: 'skills', label: 'Skills', icon: '/sprites/skill_tab_skills.png' },
  { panel: 'quests', label: 'Quests', icon: '/sprites/quest_icon_skill_tab.png' },
];

const STACK_PANEL_LABEL = { inventory: 'Inventory', equipment: 'Equipment' } as const;

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

  const stackPanel = panel === 'inventory' || panel === 'equipment' ? panel : null;

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
            <Presence online={player.online} world={player.world} />
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
        <StatBar kind="hp" icon="/skills/constitution.png" value={player.health} />
        <StatBar kind="pray" icon="/skills/prayer.png" value={player.prayer} />
        <StatBar kind="summon" icon="/sprites/summon_icon.png" value={player.summoning} />
      </div>

      <div className="gms-player-actions">
        {ACTIONS.map((action) => {
          const active = panel === action.panel;
          return (
            <button
              key={action.panel}
              type="button"
              className={active ? 'gms-icon-btn gms-icon-btn--active' : 'gms-icon-btn'}
              title={action.label}
              aria-label={action.label}
              aria-pressed={active}
              onClick={() => setPanel((prev) => (prev === action.panel ? null : action.panel))}
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

      {stackPanel && (
        <StackPanel
          title={STACK_PANEL_LABEL[stackPanel]}
          stacks={stackPanel === 'inventory' ? player.inventory : player.equipment}
        />
      )}
    </article>
  );
});

function formatLastSeen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function Presence({ online, world }: { online: boolean; world: number }) {
  const known = online && world > 0;
  const text = online ? (known ? `W${world}` : 'Online') : 'Offline';

  return (
    <span
      className={`gms-player-presence gms-player-presence--${online ? 'online' : 'offline'}`}
      title={online ? (known ? `Online — world ${world}` : 'Online') : 'Offline'}
      aria-label={online ? (known ? `Online, world ${world}` : 'Online') : 'Offline'}
    >
      <span className="gms-player-presence-dot" aria-hidden />
      <span aria-hidden>{text}</span>
    </span>
  );
}

function StatBar({
  kind,
  icon,
  value,
}: {
  kind: 'hp' | 'pray' | 'summon';
  icon: string;
  value: { current: number; max: number };
}) {
  const label = `${value.current} / ${value.max}`;
  const pct = value.max
    ? Math.max(0, Math.min(100, Math.round((value.current / value.max) * 100)))
    : 0;

  return (
    <div className="gms-stat-row">
      <img className="gms-stat-icon" src={icon} alt="" width={18} height={18} draggable={false} />
      <div className={`gms-stat gms-stat--${kind}`} title={label}>
        {/* Trail layer: same width as the fill but a slower, delayed transition,
            fill and stays hidden. */}
        <div className="gms-stat-ghost" style={{ width: `${pct}%` }} aria-hidden />
        <div className={`gms-stat-bar gms-stat-bar--${kind}`} style={{ width: `${pct}%` }} />
        <span className="gms-stat-text">{label}</span>
      </div>
    </div>
  );
}

function StackPanel({ title, stacks }: { title: string; stacks: ItemStack[] }) {
  return (
    <div className="gms-player-panel">
      <div className="gms-player-panel-title">{title}</div>
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
