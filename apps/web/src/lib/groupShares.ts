import type { GroupShares } from '../api/groupClient';
import type { ShellTab } from '../components/GroupMapShell/GroupMapShell';

export const SHARE_KEYS = ['map', 'skills', 'items', 'quests', 'achievements'] as const;

export type ShareKey = (typeof SHARE_KEYS)[number];

export const ALL_SHARED: GroupShares = {
  map: true,
  skills: true,
  items: true,
  quests: true,
  achievements: true,
};

export const DEFAULT_SHARES: GroupShares = {
  ...ALL_SHARED,
  map: false,
};

export const SHARE_FIELDS: Array<{
  key: ShareKey;
  label: string;
  hint: string;
}> = [
  {
    key: 'map',
    label: 'Live map',
    hint: 'Where each member is standing right now.',
  },
  {
    key: 'skills',
    label: 'Skills & XP',
    hint: 'Levels, total XP and the XP graphs.',
  },
  {
    key: 'items',
    label: 'Items & bank',
    hint: 'Inventories, banks, the shared bank and its ledger.',
  },
  {
    key: 'quests',
    label: 'Quests',
    hint: 'Quest progress and completed achievements.',
  },
  {
    key: 'achievements',
    label: 'Achievement feed',
    hint: 'Milestones, rare drops and kill counts.',
  },
];

export const TAB_SHARE: Partial<Record<ShellTab, ShareKey>> = {
  map: 'map',
  graphs: 'skills',
  items: 'items',
  ledger: 'items',
  quests: 'quests',
  achievements: 'achievements',
  drops: 'achievements',
};

export function describeShares(shares: GroupShares): string {
  const withheld = SHARE_FIELDS.filter((field) => !shares[field.key]);
  if (!withheld.length) return 'Shares everything';
  if (withheld.length === SHARE_FIELDS.length) return 'Shares nothing yet';
  return `Everything except ${withheld
    .map((field) => field.label.toLowerCase())
    .join(', ')}`;
}
