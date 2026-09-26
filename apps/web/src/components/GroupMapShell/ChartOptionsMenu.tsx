import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import type { ChartKind, GraphMode } from '../../lib/graphPrefs';
import {
  AreaChartIcon,
  BarChartIcon,
  LineChartIcon,
  PieChartIcon,
  SlidersIcon,
} from './icons';

const CHARTS: Array<{
  value: ChartKind;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    value: 'line',
    label: 'Line',
    description: 'One line per member, tracking XP across the period.',
    icon: <LineChartIcon />,
  },
  {
    value: 'area',
    label: 'Area',
    description: 'Stacked bands — the height is the group total, each band a member’s share.',
    icon: <AreaChartIcon />,
  },
  {
    value: 'bar',
    label: 'Bar',
    description: 'Totals for the whole period, one bar each, biggest first.',
    icon: <BarChartIcon />,
  },
  {
    value: 'pie',
    label: 'Pie',
    description: 'A donut of who contributed what share of the period’s XP.',
    icon: <PieChartIcon />,
  },
];

const MODES: Array<{ value: GraphMode; label: string; description: string }> = [
  {
    value: 'cumulative',
    label: 'Total',
    description: 'A running total — the line only ever climbs, and its height is XP so far.',
  },
  {
    value: 'interval',
    label: 'Per step',
    description: 'XP gained in each bucket on its own. Peaks show when someone was training.',
  },
];

const LOG_DESCRIPTION =
  'Squashes the axis so a member on 200K stays readable next to one on 9M. Off by default because it makes gaps look smaller than they are.';

type ChartOptionsMenuProps = {
  chart: ChartKind;
  onChartChange: (chart: ChartKind) => void;
  showMode: boolean;
  mode: GraphMode;
  onModeChange: (mode: GraphMode) => void;
  showLogScale: boolean;
  logScale: boolean;
  onLogScaleChange: (on: boolean) => void;
};

export function ChartOptionsMenu({
  chart,
  onChartChange,
  showMode,
  mode,
  onModeChange,
  showLogScale,
  logScale,
  onLogScaleChange,
}: ChartOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useDismiss(
    open,
    rootRef,
    useCallback((reason) => {
      setOpen(false);
      if (reason === 'escape') triggerRef.current?.focus();
    }, []),
  );

  return (
    <div className="gms-chart-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={open ? 'gms-graphs-toggle gms-graphs-toggle--active' : 'gms-graphs-toggle'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersIcon />
        Options
        <span className="gms-menu-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="gms-chart-menu-pop" role="menu" aria-label="Chart options">
          {/* Chart style is the one pick that works as plain buttons: four short
              labels, and the chart itself shows you what you chose. */}
          <p className="gms-chart-menu-head">Chart</p>
          <div className="gms-chart-menu-segmented" role="group" aria-label="Chart type">
            {CHARTS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  chart === option.value
                    ? 'gms-chart-menu-seg gms-chart-menu-seg--on'
                    : 'gms-chart-menu-seg'
                }
                role="menuitemradio"
                aria-checked={chart === option.value}
                title={option.description}
                onClick={() => onChartChange(option.value)}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>

          {showMode && (
            <>
              <p className="gms-chart-menu-head">Value</p>
              {MODES.map((option) => (
                <OptionRow
                  key={option.value}
                  role="menuitemradio"
                  checked={mode === option.value}
                  label={option.label}
                  description={option.description}
                  onSelect={() => onModeChange(option.value)}
                />
              ))}
            </>
          )}

          {showLogScale && (
            <>
              <p className="gms-chart-menu-head">Scale</p>
              <OptionRow
                role="menuitemcheckbox"
                checked={logScale}
                label="Log scale"
                description={LOG_DESCRIPTION}
                onSelect={() => onLogScaleChange(!logScale)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OptionRow({
  role,
  checked,
  label,
  description,
  onSelect,
}: {
  role: 'menuitemradio' | 'menuitemcheckbox';
  checked: boolean;
  label: ReactNode;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={checked ? 'gms-chart-menu-row gms-chart-menu-row--on' : 'gms-chart-menu-row'}
      role={role}
      aria-checked={checked}
      onClick={onSelect}
    >
      <span className="gms-chart-menu-row-top">
        {/* Reserved whether or not it is ticked, so labels stay aligned. */}
        <span className="gms-chart-menu-tick" aria-hidden>
          {checked ? '✓' : ''}
        </span>
        <span className="gms-chart-menu-label">{label}</span>
      </span>
      <span className="gms-chart-menu-desc">{description}</span>
    </button>
  );
}
