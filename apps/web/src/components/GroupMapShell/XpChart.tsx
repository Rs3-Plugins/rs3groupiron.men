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
  hidden: Set<string>;
  onToggleSeries: (name: string) => void;
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
  if (props.kind === 'bar') return <TotalsBar {...props} />;
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

function legendProps({
  hidden,
  onToggleSeries,
}: Pick<XpChartProps, 'hidden' | 'onToggleSeries'>) {
  return {
    onClick: (entry: { dataKey?: unknown; value?: unknown }) =>
      onToggleSeries(String(entry.dataKey ?? entry.value)),
    formatter: (value: string) => (
      <span
        className={
          hidden.has(value) ? 'gms-graphs-legend gms-graphs-legend--off' : 'gms-graphs-legend'
        }
      >
        {value}
      </span>
    ),
  };
}

function TimeChart({
  kind,
  period,
  mode,
  logScale,
  rows,
  seriesNames,
  hidden,
  onToggleSeries,
  start,
  end,
  drag,
  onDragStart,
  onDragMove,
  onDragEnd,
  onBrush,
}: XpChartProps) {
  const Chart = kind === 'area' ? AreaChart : LineChart;

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
            value: mode === 'interval' ? 'XP per step' : 'XP Gain',
            angle: -90,
            position: 'insideLeft',
            fill: AXIS,
            style: { textAnchor: 'middle' },
          }}
        />
        <Tooltip content={<ChartTooltip period={period} />} />
        <Legend {...legendProps({ hidden, onToggleSeries })} />
        {seriesNames.map((name) =>
          kind === 'area' ? (
            <Area
              key={name}
              type="monotone"
              dataKey={name}
              stackId="xp"
              stroke={colorForName(name)}
              fill={colorForName(name)}
              fillOpacity={0.35}
              strokeWidth={2}
              isAnimationActive={false}
              hide={hidden.has(name)}
            />
          ) : (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={colorForName(name)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              hide={hidden.has(name)}
            />
          ),
        )}
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
            height={22}
            travellerWidth={8}
            stroke="#8a7340"
            fill="rgba(12, 14, 16, 0.6)"
            startIndex={start}
            endIndex={end}
            tickFormatter={(value: string) => formatTick(period)(value)}
            onChange={(next) => {
              if (typeof next?.startIndex !== 'number') return;
              if (typeof next?.endIndex !== 'number') return;
              onBrush(next.startIndex, next.endIndex);
            }}
          />
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

function TotalsBar({ slices, logScale }: XpChartProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={slices}
        layout="vertical"
        margin={{ top: 8, right: 48, left: 8, bottom: 8 }}
      >
        <CartesianGrid stroke="#2c3238" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          stroke={AXIS}
          tick={TICK}
          tickFormatter={formatAxisXp}
          allowDataOverflow
          scale={logScale ? 'log' : 'auto'}
          domain={logScale ? [1, 'auto'] : [0, 'auto']}
        />
        <YAxis type="category" dataKey="name" stroke={AXIS} tick={TICK} width={110} />
        <Tooltip
          cursor={{ fill: 'rgba(232, 160, 74, 0.08)' }}
          content={<ChartTooltip categorical total={total} />}
        />
        <Bar dataKey="value" isAnimationActive={false} radius={[0, 3, 3, 0]}>
          {slices.map((slice) => (
            <Cell key={slice.name} fill={colorForName(slice.name)} />
          ))}
        </Bar>
      </BarChart>
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
