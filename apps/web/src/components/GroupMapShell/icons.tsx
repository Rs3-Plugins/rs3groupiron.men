import type { SVGProps } from 'react';

const BASE: SVGProps<SVGSVGElement> = {
  className: 'gms-settings-btn-icon',
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  preserveAspectRatio: 'xMidYMid meet',
  'aria-hidden': true,
  focusable: 'false',
};

const SMALL: SVGProps<SVGSVGElement> = {
  ...BASE,
  viewBox: '0 0 16 16',
  strokeWidth: 1.6,
};

const CHIP: SVGProps<SVGSVGElement> = {
  ...BASE,
  width: 14,
  height: 14,
  strokeWidth: 2,
  className: 'gms-btn-icon',
};

export function LineChartIcon() {
  return (
    <svg {...CHIP}>
      <path d="M4 4v16h16" />
      <path d="m7 15 3.5-4.5 3 2.5L20 6" />
    </svg>
  );
}

export function AreaChartIcon() {
  return (
    <svg {...CHIP}>
      <path d="M4 4v16h16" />
      <path d="M20 8v11H7v-4l3.5-3.5 3 2.5z" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

export function BarChartIcon() {
  return (
    <svg {...CHIP}>
      <path d="M4 4v16" />
      <path d="M7 7h12M7 12h7M7 17h10" />
    </svg>
  );
}

export function PieChartIcon() {
  return (
    <svg {...CHIP}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6.4 6.4" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg {...CHIP}>
      <path d="M12 3v12" />
      <path d="m7 10.5 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function SlidersIcon() {
  return (
    <svg {...CHIP}>
      <path d="M3 8h9M17 8h4" />
      <circle cx="14.5" cy="8" r="2.5" />
      <path d="M3 16h4M12 16h9" />
      <circle cx="9.5" cy="16" r="2.5" />
    </svg>
  );
}

export function FileTextIcon() {
  return (
    <svg {...CHIP}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

export function TableIcon() {
  return (
    <svg {...CHIP}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M10 10v10" />
    </svg>
  );
}

export function ImageIcon() {
  return (
    <svg {...CHIP}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 18 5-5 3 2.5L15.5 12l4.5 4.5" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...BASE}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SaveIcon() {
  return (
    <svg {...BASE}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

export function RemoveIcon() {
  return (
    <svg {...BASE}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg {...BASE} className={className ?? BASE.className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function FilterIcon({ className }: { className?: string }) {
  return (
    <svg {...BASE} className={className ?? BASE.className}>
      <path d="M3 5h18l-7 8v5l-4 2v-7z" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg {...BASE} className="gms-graphs-refresh-icon" width={18} height={18} strokeWidth={2.25}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function WikiIcon() {
  return (
    <svg {...SMALL} className="gms-quests-wiki-icon" width={12} height={12}>
      <path d="M6.5 3.5H3.5v9h9V9.5" />
      <path d="M9 3h4v4" />
      <path d="M13 3 7.5 8.5" />
    </svg>
  );
}

export function LayersIcon() {
  return (
    <svg {...CHIP}>
      <path d="M12 3 3 7.5l9 4.5 9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}

export function FullscreenIcon({ exit = false }: { exit?: boolean }) {
  return (
    <svg {...CHIP}>
      {exit ? (
        <>
          <path d="M9 3v6H3" />
          <path d="M15 21v-6h6" />
          <path d="M21 9h-6V3" />
          <path d="M3 15h6v6" />
        </>
      ) : (
        <>
          <path d="M3 9V3h6" />
          <path d="M21 15v6h-6" />
          <path d="M15 3h6v6" />
          <path d="M9 21H3v-6" />
        </>
      )}
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg
      {...SMALL}
      className="gms-pq-lock"
      width={10}
      height={10}
      aria-hidden={undefined}
      aria-label="Locked"
      role="img"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}
