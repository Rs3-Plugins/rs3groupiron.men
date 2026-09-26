import { colorForName } from '../../lib/items';
import { SKILL_BY_ID, type SkillId } from '../../lib/skills';

export function MemberAvatar({
  name,
  avatarUrl,
  color,
}: {
  name: string;
  avatarUrl?: string | null;
  color?: string;
}) {
  if (avatarUrl) {
    return (
      <img
        className="gms-member-avatar"
        src={avatarUrl}
        alt=""
        width={16}
        height={16}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      className="gms-member-avatar gms-member-avatar--dot"
      style={{ background: color ?? colorForName(name) }}
      aria-hidden
    />
  );
}

export function SkillIcon({ skillId }: { skillId: string }) {
  const def = SKILL_BY_ID[skillId as SkillId];
  const src =
    skillId === 'overall'
      ? '/sprites/skill_tab_skills.png'
      : `/skills/${def?.icon ?? `${skillId}.png`}`;
  return (
    <img
      className="gms-member-avatar gms-member-avatar--skill"
      src={src}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
    />
  );
}

export function AllMembersIcon() {
  return (
    <svg
      className="gms-member-avatar gms-member-avatar--all"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3.2" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.9" />
      <path d="M16 4.1a4 4 0 0 1 0 5.8" />
    </svg>
  );
}
