import { useEffect, useMemo, useRef, useState } from 'react';
import type { Achievement, AchievementKind, BankLedgerEntry } from '../api/groupClient';
import type { ItemStack, PlayerView } from '../lib/items';
import { QUESTS, type MemberQuestStates, type QuestState } from '../lib/quests';

type PatchPlayers = (update: (prev: PlayerView[]) => PlayerView[]) => void;
type Heading = { dx: number; dy: number };

export type DemoSkillGains = Record<string, number>;
export type DemoXpTotals = Record<string, DemoSkillGains>;

export type DemoXp = {
  totals: DemoXpTotals;
  samples: Array<{ t: string; totals: DemoXpTotals }>;
};

export type DemoActivity = {
  achievements: Achievement[];
  ledger: BankLedgerEntry[];
  quests: Record<string, MemberQuestStates>;
  xp: DemoXp;
};

const TICK_MS = 1200;
const ACHIEVEMENT_MS = 14_000;
const MAX_DEMO_ACHIEVEMENTS = 20;
const LEDGER_MS = 4500;
const MAX_DEMO_LEDGER = 60;
const QUEST_MS = 9000;
const MAX_XP_SAMPLES = 16;

export const DEMO_XP_SAMPLE_MS = 12_000;

const XP_BUCKETS = [12, 24, 50, 84, 132, 220, 360, 540, 920, 1500];

const LOOT = [
  995, 1050, 1249, 1163, 1127, 4151, 11832, 11834, 1515, 441, 453, 1623, 1631,
  2357, 2363, 561, 565, 560, 384, 391, 7937, 15271, 23351,
];

const BANK_QUANTITIES = [1, 1, 2, 3, 5, 10, 24, 50, 100, 280, 1000, 5000, 24_000, 150_000];

const DEMO_QUESTS = QUESTS.filter((q) => q.category === 'quest' && q.questPoints > 0);
const QUEST_BY_GAMEVAL = new Map(DEMO_QUESTS.map((q) => [q.gameval, q]));

const ACHIEVEMENT_TEMPLATES: Array<{ kind: AchievementKind; title: string; detail: string | null }> = [
  { kind: 'level', title: 'Reached level 99 Mining', detail: 'A new skill cape is earned' },
  { kind: 'level', title: 'Reached level 120 Slayer', detail: 'Mastery beyond 99' },
  { kind: 'drop', title: 'Received a Dragon pickaxe', detail: 'Rare drop from Kalphite Queen' },
  { kind: 'drop', title: 'Received an Armadyl hilt', detail: null },
  { kind: 'diary', title: 'Finished the Varrock achievements', detail: 'Hard tier complete' },
  { kind: 'other', title: 'Unlocked a new music track', detail: null },
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Drifts toward a healthy band so vitals wander without decaying to zero. */
function nudge(current: number, max: number) {
  const target = max * (0.55 + Math.random() * 0.45);
  const drift = (target - current) * 0.25;
  const jitter = (Math.random() - 0.5) * max * 0.08;
  return clamp(Math.round(current + drift + jitter), Math.round(max * 0.1), max);
}

function gainXp(player: PlayerView, log: DemoXpTotals): PlayerView {
  if (!player.skills.length) return player;
  const index = Math.floor(Math.random() * player.skills.length);
  const skill = player.skills[index]!;
  const amount = pick(XP_BUCKETS);
  const levelUp = Math.random() < 0.04 && skill.level < skill.maxLevel;
  const skills = [...player.skills];
  skills[index] = {
    ...skill,
    xp: skill.xp + amount,
    level: levelUp ? skill.level + 1 : skill.level,
  };
  const bySkill = (log[player.name] ??= {});
  bySkill[skill.id] = (bySkill[skill.id] ?? 0) + amount;
  return {
    ...player,
    skills,
    totalLevel: levelUp ? player.totalLevel + 1 : player.totalLevel,
    lastSeen: new Date().toISOString(),
  };
}

/** Keeps a heading per member so they walk a route instead of jittering. */
function move(player: PlayerView, headings: Map<string, Heading>): PlayerView {
  const [x = 3200, y = 3200, plane = 0] = player.coordinates;
  let heading = headings.get(player.name);
  if (!heading || Math.random() < 0.18) {
    const angle = Math.random() * Math.PI * 2;
    heading = { dx: Math.cos(angle), dy: Math.sin(angle) };
  }

  const speed = 2 + Math.random() * 4;
  const wantX = Math.round(x + heading.dx * speed);
  const wantY = Math.round(y + heading.dy * speed);
  const nextX = clamp(wantX, 2000, 3900);
  const nextY = clamp(wantY, 2900, 3800);
  headings.set(
    player.name,
    nextX !== wantX || nextY !== wantY ? { dx: -heading.dx, dy: -heading.dy } : heading,
  );

  return {
    ...player,
    coordinates: [nextX, nextY, plane],
    lastSeen: new Date().toISOString(),
  };
}

function vitals(player: PlayerView): PlayerView {
  return {
    ...player,
    health: { ...player.health, current: nudge(player.health.current, player.health.max) },
    prayer: { ...player.prayer, current: nudge(player.prayer.current, player.prayer.max) },
    summoning: {
      ...player.summoning,
      current: nudge(player.summoning.current, player.summoning.max),
    },
    lastSeen: new Date().toISOString(),
  };
}

function shuffleStacks(stacks: ItemStack[], slots: number): ItemStack[] {
  if (!stacks.length) return stacks;
  const next = [...stacks];
  for (let n = 0; n < slots; n += 1) {
    const index = Math.floor(Math.random() * next.length);
    const current = next[index]!;
    next[index] =
      Math.random() < 0.5
        ? { ...current, id: pick(LOOT) }
        : { ...current, quantity: Math.max(1, Math.round(current.quantity * (0.5 + Math.random()))) };
  }
  return next;
}

function items(player: PlayerView): PlayerView {
  const touchEquipment = Math.random() < 0.35 && player.equipment.length > 0;
  return {
    ...player,
    inventory: touchEquipment ? player.inventory : shuffleStacks(player.inventory, 2),
    equipment: touchEquipment ? shuffleStacks(player.equipment, 1) : player.equipment,
    lastSeen: new Date().toISOString(),
  };
}

function presence(player: PlayerView): PlayerView {
  const online = !player.online;
  return {
    ...player,
    online,
    world: online ? 1 + Math.floor(Math.random() * 140) : player.world,
    lastSeen: new Date().toISOString(),
  };
}

/**
 * Only online members do anything; an offline one can do nothing but log back
 * in. Every online member is stepped on every tick and each effect rolls
 * independently, so a tick can move several people while XP, vitals and loot
 * all land at once.
 */
function stepPlayer(
  player: PlayerView,
  headings: Map<string, Heading>,
  onlineCount: number,
  log: DemoXpTotals,
): PlayerView {
  if (!player.online) {
    headings.delete(player.name);
    return Math.random() < 0.02 ? presence(player) : player;
  }

  let next = player;
  if (Math.random() < 0.85) next = move(next, headings);
  if (Math.random() < 0.35) next = gainXp(next, log);
  if (Math.random() < 0.3) next = vitals(next);
  if (Math.random() < 0.12) next = items(next);
  // Never log out the last member, or the demo would go quiet for good.
  if (onlineCount > 1 && Math.random() < 0.012) next = presence(next);
  return next;
}

function cloneTotals(totals: DemoXpTotals): DemoXpTotals {
  const out: DemoXpTotals = {};
  for (const name of Object.keys(totals)) out[name] = { ...totals[name] };
  return out;
}

export function mergeQuestStates(
  base: Record<string, MemberQuestStates>,
  overlay: Record<string, MemberQuestStates>,
): Record<string, MemberQuestStates> {
  const names = Object.keys(overlay);
  if (!names.length) return base;
  const out = { ...base };
  for (const name of names) out[name] = { ...out[name], ...overlay[name] };
  return out;
}

export function demoGainFor(totals: DemoXpTotals, name: string, skill: string): number {
  const bySkill = totals[name];
  if (!bySkill) return 0;
  if (skill !== 'overall') return bySkill[skill] ?? 0;
  let sum = 0;
  for (const id of Object.keys(bySkill)) sum += bySkill[id]!;
  return sum;
}

const EMPTY_XP: DemoXp = { totals: {}, samples: [] };

/**
 * Keeps the read-only demo looking alive: XP ticks in, members wander the map,
 * vitals move, gear and inventories change, shared-bank movements land, quests
 * get started and finished and achievements drop. Returns the synthetic feeds
 * so each panel can show them alongside the real data.
 */
export function useDemoActivity(enabled: boolean, patchPlayers: PatchPlayers): DemoActivity {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [ledger, setLedger] = useState<BankLedgerEntry[]>([]);
  const [quests, setQuests] = useState<Record<string, MemberQuestStates>>({});
  const [xp, setXp] = useState<DemoXp>(EMPTY_XP);

  const namesRef = useRef<string[]>([]);
  const headingsRef = useRef(new Map<string, Heading>());
  const questsRef = useRef<Record<string, MemberQuestStates>>({});
  const totalsRef = useRef<DemoXpTotals>({});
  const pendingRef = useRef<{ id: number; log: DemoXpTotals } | null>(null);
  const committedRef = useRef(-1);
  const tickRef = useRef(0);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const push = (
      name: string,
      template: { kind: AchievementKind; title: string; detail: string | null },
      gameval: string | null = null,
    ) => {
      seqRef.current += 1;
      const entry: Achievement = {
        id: `demo-${seqRef.current}`,
        name,
        kind: template.kind,
        title: template.title,
        detail: template.detail,
        skill_id: template.kind === 'level' ? 'mining' : null,
        item_id: template.kind === 'drop' ? 1249 : null,
        gameval,
        image_url: null,
        at: new Date().toISOString(),
      };
      setAchievements((prev) => [entry, ...prev].slice(0, MAX_DEMO_ACHIEVEMENTS));
    };

    // The tick updater rolls dice, so React can run it twice and keep only the
    // second result. Its XP is therefore staged per tick id and folded in once.
    const commit = () => {
      const pending = pendingRef.current;
      if (!pending || pending.id === committedRef.current) return;
      committedRef.current = pending.id;
      const totals = totalsRef.current;
      for (const name of Object.keys(pending.log)) {
        const into = (totals[name] ??= {});
        const from = pending.log[name]!;
        for (const id of Object.keys(from)) into[id] = (into[id] ?? 0) + from[id]!;
      }
    };

    const tick = () => {
      commit();
      tickRef.current += 1;
      const id = tickRef.current;
      patchPlayers((prev) => {
        if (!prev.length) return prev;
        namesRef.current = prev.filter((p) => p.online).map((p) => p.name);
        const onlineCount = namesRef.current.length;
        const log: DemoXpTotals = {};
        const next = prev.map((player) =>
          stepPlayer(player, headingsRef.current, onlineCount, log),
        );
        pendingRef.current = { id, log };
        return next.some((player, i) => player !== prev[i]) ? next : prev;
      });
    };

    const sample = () => {
      commit();
      const totals = cloneTotals(totalsRef.current);
      if (!Object.keys(totals).length) return;
      setXp((prev) => ({
        totals,
        samples: [...prev.samples, { t: new Date().toISOString(), totals }].slice(
          -MAX_XP_SAMPLES,
        ),
      }));
    };

    const moveBank = () => {
      const names = namesRef.current;
      if (!names.length) return;
      const at = new Date().toISOString();
      const batch: BankLedgerEntry[] = [];
      for (let n = 0, count = 1 + Math.floor(Math.random() * 2); n < count; n += 1) {
        seqRef.current += 1;
        const quantity = pick(BANK_QUANTITIES);
        batch.push({
          id: `demo-bank-${seqRef.current}`,
          name: pick(names),
          item_id: pick(LOOT),
          delta: Math.random() < 0.6 ? quantity : -quantity,
          at,
        });
      }
      setLedger((prev) => [...batch, ...prev].slice(0, MAX_DEMO_LEDGER));
    };

    const progressQuest = () => {
      const names = namesRef.current;
      if (!names.length || !DEMO_QUESTS.length) return;
      const name = pick(names);
      const states = questsRef.current[name] ?? {};
      const started = Object.keys(states).filter((g) => states[g] === 'started');
      const finish = started.length > 0 && (started.length >= 3 || Math.random() < 0.45);

      let gameval: string;
      if (finish) {
        gameval = pick(started);
      } else {
        const options = DEMO_QUESTS.filter((q) => !states[q.gameval]);
        if (!options.length) return;
        gameval = pick(options).gameval;
      }

      const state: QuestState = finish ? 'finished' : 'started';
      questsRef.current = {
        ...questsRef.current,
        [name]: { ...states, [gameval]: state },
      };
      setQuests(questsRef.current);

      const quest = QUEST_BY_GAMEVAL.get(gameval);
      const title = quest?.name ?? gameval;
      push(
        name,
        {
          kind: 'quest',
          title: finish ? `Completed ${title}` : `Started ${title}`,
          detail: finish ? `${quest?.questPoints ?? 1} quest points awarded` : null,
        },
        gameval,
      );
    };

    const award = () => {
      const names = namesRef.current;
      if (!names.length) return;
      push(pick(names), pick(ACHIEVEMENT_TEMPLATES));
    };

    const timers = [
      window.setInterval(tick, TICK_MS),
      window.setInterval(sample, DEMO_XP_SAMPLE_MS),
      window.setInterval(moveBank, LEDGER_MS),
      window.setInterval(progressQuest, QUEST_MS),
      window.setInterval(award, ACHIEVEMENT_MS),
    ];
    return () => timers.forEach((timer) => window.clearInterval(timer));
  }, [enabled, patchPlayers]);

  return useMemo(
    () => ({ achievements, ledger, quests, xp }),
    [achievements, ledger, quests, xp],
  );
}
