import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { XpHistoryPeriod } from '../../api/groupClient';
import type { ChartKind, GraphMode } from '../../lib/graphPrefs';
import { colorForName, formatQty } from '../../lib/items';

export type ChartRow = Record<string, string | number>;
export type Slice = { name: string; value: number };

const AXIS = '#8a949e';
const TICK = { fill: '#a8b0b8', fontSize: 11 };

type TooltipItem = { name?: unknown; value?: unknown; payload?: Record<string, unknown> };

type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipItem[];
  label?: unknown;
  period?: XpHistoryPeriod;
  categorical?: boolean;
  total?: number;
};

function ChartTooltip({
  active,
  payload,
  label,
  period,
  categorical,
  total = 0,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  if (categorical) {
    const item = payload[0]!;
    const name = String(item.payload?.name ?? item.name ?? label ?? '');
    const value = Number(item.value ?? 0);
    return (
      <div className="gms-chart-tip">
        <p className="gms-chart-tip-title">
          <span className="gms-chart-tip-dot" style={{ background: colorForName(name) }} />
          {name}
        </p>
        <p className="gms-chart-tip-big">+{formatQty(value)}</p>
        {total > 0 && <p className="gms-chart-tip-sub">{share(value, total)} of the total</p>}
      </div>
    );
  }

  const rows = payload
    .map((item) => ({ name: String(item.name ?? ''), value: Number(item.value ?? 0) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="gms-chart-tip">
      <p className="gms-chart-tip-title">
        {period ? formatTooltipTime(String(label), period) : String(label ?? '')}
      </p>
      <ul className="gms-chart-tip-rows">
        {rows.map((row) => (
          <li key={row.name}>
            <span className="gms-chart-tip-dot" style={{ background: colorForName(row.name) }} />
            <span className="gms-chart-tip-name">{row.name}</span>
            <span className="gms-chart-tip-value">+{formatQty(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatAxisXp(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function formatTick(period: XpHistoryPeriod) {
  return (value: string) => {
    const d = new Date(value);
    if (period === '24h') return d.toLocaleTimeString([], { hour: 'numeric' });
    if (period === '365d') return d.toLocaleDateString([], { month: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
}

function formatTooltipTime(value: string, period: XpHistoryPeriod) {
  const d = new Date(value);
  if (period === '24h') return d.toLocaleString();
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

type XpChartProps = {
  kind: ChartKind;
  period: XpHistoryPeriod;
  mode: GraphMode;
  logScale: boolean;
  rows: ChartRow[];
  slices: Slice[];
  seriesNames: string[];
  /** Member to emphasise; the rest fade back. Null means show them evenly. */
  highlight: string | null;
  start: number;
  end: number;
  drag: { from: number; to: number } | null;
  onDragStart: (index: number) => void;
  onDragMove: (index: number) => void;
  onDragEnd: () => void;
  onBrush: (start: number, end: number) => void;
};

export function XpChart(props: XpChartProps) {
  if (props.kind === 'pie') return <SharePie {...props} />;
  // Bar is a time series like line and area — one stacked bar per bucket —
  // not a totals-per-member chart.
  return <TimeChart {...props} />;
}

// Recharts types this as `number | TooltipIndex | undefined`; TooltipIndex is a
// string, so a `typeof === 'number'` check silently drops every event.
function activeIndex(state: { activeTooltipIndex?: number | string | null }): number | null {
  const raw = state?.activeTooltipIndex;
  if (raw == null) return null;
  const i = Number(raw);
  return Number.isInteger(i) && i >= 0 ? i : null;
}

function TimeChart({
  kind,
  period,
  mode,
  logScale,
  rows,
  seriesNames,
  highlight,
  start,
  end,
  drag,
  onDragStart,
  onDragMove,
  onDragEnd,
  onBrush,
}: XpChartProps) {
  // Everything stays on the chart; a highlight only changes emphasis.
  const dim = (name: string) => (highlight && highlight !== name ? 0.18 : 1);
  const lead = (name: string) => highlight === name;
  const Chart = kind === 'area' ? AreaChart : kind === 'bar' ? BarChart : LineChart;

  const handlers = {
    onMouseDown: (state: { activeTooltipIndex?: number | string | null }) => {
      const i = activeIndex(state);
      if (i !== null) onDragStart(i);
    },
    onMouseMove: (state: { activeTooltipIndex?: number | string | null }) => {
      const i = activeIndex(state);
      if (drag && i !== null) onDragMove(i);
    },
    onMouseUp: onDragEnd,
    onMouseLeave: onDragEnd,
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }} {...handlers}>
        <CartesianGrid stroke="#2c3238" strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          tickFormatter={formatTick(period)}
          stroke={AXIS}
          tick={TICK}
          minTickGap={28}
        />
        <YAxis
          stroke={AXIS}
          tick={TICK}
          tickFormatter={formatAxisXp}
          width={64}
          allowDataOverflow
          scale={logScale ? 'log' : 'auto'}
          domain={logScale ? [1, 'auto'] : [0, 'auto']}
          label={{
            value: mode === 'interval' ? 'XP per step' : 'Total XP',
            angle: -90,
            position: 'insideLeft',
            fill: AXIS,
            style: { textAnchor: 'middle' },
          }}
        />
        {/* The panel renders the only legend, under the hint line; Recharts'
            own would be a second copy floating inside the plot.
            Bar's default cursor is a solid #ccc rectangle — a white slab on a
            dark panel — so it gets a faint gold wash; line and area keep the
            default vertical guide. */}
        <Tooltip
          cursor={kind === 'bar' ? { fill: 'rgba(202, 164, 77, 0.12)' } : undefined}
          content={<ChartTooltip period={period} />}
        />
        {seriesNames.map((name) => {
          if (kind === 'area') {
            return (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stackId="xp"
                stroke={colorForName(name)}
                fill={colorForName(name)}
                fillOpacity={0.35 * dim(name)}
                strokeOpacity={dim(name)}
                strokeWidth={lead(name) ? 3 : 2}
                isAnimationActive={false}
              />
            );
          }
          if (kind === 'bar') {
            return (
              <Bar
                key={name}
                dataKey={name}
                stackId="xp"
                fill={colorForName(name)}
                fillOpacity={dim(name)}
                isAnimationActive={false}
              />
            );
          }
          return (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={colorForName(name)}
              strokeOpacity={dim(name)}
              strokeWidth={lead(name) ? 3 : 2}
              dot={false}
              isAnimationActive={false}
            />
          );
        })}
        {drag && drag.from !== drag.to && (
          <ReferenceArea
            x1={String(rows[drag.from]?.t ?? '')}
            x2={String(rows[drag.to]?.t ?? '')}
            strokeOpacity={0}
            fill="#e8a04a"
            fillOpacity={0.15}
          />
        )}
        {rows.length > 2 && (
          <Brush
            dataKey="t"
            height={28}
            travellerWidth={8}
            stroke="var(--line2)"
            fill="var(--surface2)"
            startIndex={start}
            endIndex={end}
            tickFormatter={(value: string) => formatTick(period)(value)}
            onChange={(next) => {
              if (typeof next?.startIndex !== 'number') return;
              if (typeof next?.endIndex !== 'number') return;
              onBrush(next.startIndex, next.endIndex);
            }}
          >
            {/* Panorama: the whole period in miniature, so the strip shows
                where the activity is while you are zoomed into part of it. */}
            <AreaChart>
              {seriesNames.map((name) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stackId="timeline"
                  stroke="none"
                  fill={colorForName(name)}
                  fillOpacity={0.55 * dim(name)}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </Brush>
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

function SharePie({ slices }: XpChartProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <Tooltip content={<ChartTooltip categorical total={total} />} />
        <Legend />
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          innerRadius="45%"
          outerRadius="75%"
          paddingAngle={1}
          isAnimationActive={false}
          stroke="#12100c"
          strokeWidth={2}
          label={({ name, value }) =>
            (value as number) / total >= 0.06 ? `${name} ${share(value as number, total)}` : ''
          }
          labelLine={false}
        >
          {slices.map((slice) => (
            <Cell key={slice.name} fill={colorForName(slice.name)} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function share(value: number, total: number) {
  if (!total) return '0%';
  const pct = (value / total) * 100;
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}
