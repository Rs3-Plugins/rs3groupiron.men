import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
};

export function EmptyState({ icon, title, body, children }: EmptyStateProps) {
  return (
    <div className="gms-empty">
      <span className="gms-empty-icon" aria-hidden>
        {icon}
      </span>
      <h3 className="gms-empty-title">{title}</h3>
      <p className="gms-empty-body">{body}</p>
      {children && <div className="gms-empty-action">{children}</div>}
    </div>
  );
}

const GLYPH = {
  viewBox: '0 0 24 24',
  width: 28,
  height: 28,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: 'false' as const,
};

export function GemGlyph() {
  return (
    <svg {...GLYPH}>
      <path d="M12 3l7 9-7 9-7-9z" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function BankGlyph() {
  return (
    <svg {...GLYPH}>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v9h14v-9" />
      <path d="M9 19v-5h6v5" />
    </svg>
  );
}

export function TrophyGlyph() {
  return (
    <svg {...GLYPH}>
      <path d="M8 4h8v5a4 4 0 01-8 0z" />
      <path d="M8 5H5v2a3 3 0 003 3M16 5h3v2a3 3 0 01-3 3" />
      <path d="M10 13h4v3h-4zM8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

export function ChartGlyph() {
  return (
    <svg {...GLYPH}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15l3.5-5 3 3L20 7" />
    </svg>
  );
}

export function SearchGlyph() {
  return (
    <svg {...GLYPH}>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </svg>
  );
}

export function BoxGlyph() {
  return (
    <svg {...GLYPH}>
      <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
      <path d="M4 8l8 4 8-4M12 12v8" />
    </svg>
  );
}
