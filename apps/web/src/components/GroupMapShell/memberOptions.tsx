import type { IconOption } from './IconSelect';
import { AllMembersIcon, MemberAvatar } from './MemberAvatar';

export type MemberBadge = {
  name: string;
  avatarUrl: string | null;
  color: string;
};

export function memberOption(name: string, members: ReadonlyArray<MemberBadge>): IconOption {
  const member = members.find((m) => m.name === name);
  return {
    value: name,
    label: name,
    icon: <MemberAvatar name={name} avatarUrl={member?.avatarUrl} color={member?.color} />,
  };
}

export function memberOptions(
  names: ReadonlyArray<string>,
  members: ReadonlyArray<MemberBadge>,
  allLabel = 'All members',
): IconOption[] {
  return [
    { value: 'all', label: allLabel, icon: <AllMembersIcon /> },
    ...names.map((name) => memberOption(name, members)),
  ];
}
