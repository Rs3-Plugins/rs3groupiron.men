import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DEMO_GROUP,
  fetchXpHistory,
  type XpHistoryPeriod,
  type XpHistoryResponse,
} from '../../api/groupClient';
import { colorForName, formatQty } from '../../lib/items';
import { SKILL_BY_ID, SKILLS, type SkillDef } from '../../lib/skills';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

const PERIODS: Array<{ id: XpHistoryPeriod; label: string }> = [
  { id: '24h', label: '24 Hours' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: '365d', label: '12 Months' },
];

const PERIOD_TITLE: Record<XpHistoryPeriod, string> = {
  '24h': 'Day',
  '7d': 'Week',
  '30d': 'Month',
  '365d': 'Year',
};

const SKILL_OPTIONS: Array<{ id: string; name: string; icon?: string }> = [
  { id: 'overall', name: 'Overall' },
  ...[...SKILLS].sort((a, b) => a.name.localeCompare(b.name)).map((s: SkillDef) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
  })),
];

/** Module-level response cache so switching tabs doesn't refetch. */
const CACHE_TTL_MS = 60_000;
const historyCache = new Map<string, { at: number; data: XpHistoryResponse }>();

function cacheKey(group: string, period: XpHistoryPeriod, skill: string) {
  return `${group}|${period}|${skill}`;
}

function readCache(key: string) {
  const hit = historyCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    historyCache.delete(key);
    return null;
  }
  return hit.data;
}

type GraphsPanelProps = {
  groupName?: string;
  groupToken?: string;
  /** Bumps on each incoming group poll; redraws the chart in place. */
  dataRevision?: number;
};

export function GraphsPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  dataRevision,
}: GraphsPanelProps) {
  const [period, setPeriod] = useState<XpHistoryPeriod>('24h');
  const [skill, setSkill] = useState('overall');
  const [playerFilter, setPlayerFilter] = useState('all');
  const [data, setData] = useState<XpHistoryResponse | null>(() =>
    readCache(cacheKey(groupName, '24h', 'overall')),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Rapid period/skill switching can let a slower earlier request resolve last;
  // abort the in-flight one and only accept the latest sequence number.
  const inFlight = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const key = cacheKey(groupName, period, skill);
      const cached = force ? null : readCache(key);
      inFlight.current?.abort();
      inFlight.current = null;
      const mySeq = ++seq.current;
      if (cached) {
        setData(cached);
        setError(null);
        setLoading(false);
        return;
      }
      const controller = new AbortController();
      inFlight.current = controller;
      setLoading(true);
      setError(null);
      try {
        const next = await fetchXpHistory(
          groupName,
          groupToken,
          period,
          skill,
          controller.signal,
        );
        historyCache.set(key, { at: Date.now(), data: next });
        if (mySeq !== seq.current) return;
        setData(next);
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (mySeq !== seq.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load XP history');
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
        if (mySeq === seq.current) setLoading(false);
      }
    },
    [groupName, groupToken, period, skill],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Redraw when a poll brings new XP, and on a slow timer as a backstop.
  // `force` skips the cache, which is the whole point of refreshing.
  useLiveRefresh(
    useCallback(() => {
      void load(true);
    }, [load]),
    { signal: dataRevision, intervalMs: 30000 },
  );

  useEffect(() => () => inFlight.current?.abort(), []);

  const allPlayerNames = useMemo(
    () => (data?.players ?? []).map((p) => p.name),
    [data],
  );

  const visibleSeries = useMemo(
    () =>
      (data?.series ?? []).filter(
        (s) => playerFilter === 'all' || s.name === playerFilter,
      ),
    [data, playerFilter],
  );

  const visiblePlayers = useMemo(
    () =>
      (data?.players ?? []).filter(
        (p) => playerFilter === 'all' || p.name === playerFilter,
      ),
    [data, playerFilter],
  );

  const chartRows = useMemo(() => {
    if (!visibleSeries.length) return [];
    const byTime = new Map<string, Record<string, string | number>>();
    for (const series of visibleSeries) {
      for (const point of series.points) {
        const row = byTime.get(point.t) ?? { t: point.t };
        row[series.name] = point.gain;
        byTime.set(point.t, row);
      }
    }
    return [...byTime.values()].sort(
      (a, b) => new Date(String(a.t)).getTime() - new Date(String(b.t)).getTime(),
    );
  }, [visibleSeries]);

  const skillLabel =
    skill === 'overall' ? 'Overall' : (SKILL_BY_ID[skill as keyof typeof SKILL_BY_ID]?.name ?? skill);
  const chartTitle = `${skillLabel} - ${PERIOD_TITLE[period]}`;
  const busy = loading && data != null;

  return (
    <section className="gms-graphs" aria-label="XP graphs" aria-busy={loading}>
      <div className="gms-graphs-toolbar">
        <button
          type="button"
          className="gms-graphs-refresh"
          aria-label="Refresh"
          title="Refresh"
          disabled={loading}
          onClick={() => void load(true)}
        >
          <img
            className="gms-graphs-refresh-rs3 gms-graphs-refresh-rs3--n"
            src="/sprites/refresh.png"
            alt=""
            width={32}
            height={32}
            draggable={false}
          />
          <img
            className="gms-graphs-refresh-rs3 gms-graphs-refresh-rs3--h"
            src="/sprites/refresh_hover.png"
            alt=""
            width={32}
            height={32}
            draggable={false}
          />
          <svg
            className="gms-graphs-refresh-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
        <label className="gms-graphs-field">
          <span className="gms-graphs-field-label">Period</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as XpHistoryPeriod)}
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="gms-graphs-field">
          <span className="gms-graphs-field-label">Skill</span>
          <select value={skill} onChange={(e) => setSkill(e.target.value)}>
            {SKILL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className="gms-graphs-field">
          <span className="gms-graphs-field-label">Player</span>
          <select value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}>
            <option value="all">All players</option>
            {allPlayerNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="gms-graphs-chart-wrap">
        <h2 className="gms-graphs-title">{chartTitle}</h2>
        {error && <p className="gms-graphs-status gms-graphs-status--error">{error}</p>}
        {loading && !data && <p className="gms-graphs-status">Loading…</p>}
        {busy && (
          <p className="gms-graphs-status" aria-live="polite">
            Refreshing…
          </p>
        )}
        {data && (
          <div className="gms-graphs-chart" style={busy ? { opacity: 0.6 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="#2c3238" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  tickFormatter={formatTick(period)}
                  stroke="#8a949e"
                  tick={{ fill: '#a8b0b8', fontSize: 11 }}
                  minTickGap={28}
                />
                <YAxis
                  stroke="#8a949e"
                  tick={{ fill: '#a8b0b8', fontSize: 11 }}
                  tickFormatter={(v: number) => formatAxisXp(v)}
                  width={64}
                  label={{
                    value: 'XP Gain',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#8a949e',
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(18, 16, 12, 0.96)',
                    border: '1px solid #8a7340',
                    borderRadius: 4,
                  }}
                  labelStyle={{ color: '#e8a04a' }}
                  labelFormatter={(label) => formatTooltipTime(String(label), period)}
                  formatter={(value, name) => [
                    `+${formatQty(Number(value ?? 0))}`,
                    String(name),
                  ]}
                />
                <Legend />
                {visibleSeries.map((series) => (
                  <Line
                    key={series.name}
                    type="monotone"
                    dataKey={series.name}
                    stroke={colorForName(series.name)}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div
        className={
          skill === 'overall'
            ? 'gms-graphs-players'
            : 'gms-graphs-players gms-graphs-players--totals'
        }
      >
        {skill !== 'overall' ? (
          <div className="gms-graphs-totals">
            {visiblePlayers.map((player) => {
              const color = colorForName(player.name);
              return (
                <div key={player.name} className="gms-graphs-total-chip">
                  <span className="gms-graphs-player-dot" style={{ background: color }} />
                  <span className="gms-graphs-total-name">{player.name}</span>
                  <span className="gms-graphs-player-total">
                    +{formatQty(player.totalGain)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          visiblePlayers.map((player) => {
            const maxSkill = Math.max(1, ...player.skills.map((s) => s.gain));
            const color = colorForName(player.name);
            return (
              <article key={player.name} className="gms-graphs-player">
                <header className="gms-graphs-player-head">
                  <span className="gms-graphs-player-dot" style={{ background: color }} />
                  <strong>{player.name}</strong>
                  <span className="gms-graphs-player-total">
                    +{formatQty(player.totalGain)}
                  </span>
                </header>
                {player.skills.length > 0 && (
                  <ul className="gms-graphs-skill-list">
                    {player.skills.slice(0, 12).map((row) => {
                      const def = SKILL_BY_ID[row.id as keyof typeof SKILL_BY_ID];
                      const pct = Math.max(4, (row.gain / maxSkill) * 100);
                      return (
                        <li key={row.id} className="gms-graphs-skill-row">
                          <img
                            className="gms-graphs-skill-icon"
                            src={`/skills/${def?.icon ?? `${row.id}.png`}`}
                            alt=""
                            width={18}
                            height={18}
                          />
                          <span className="gms-graphs-skill-name">{row.name}</span>
                          <div className="gms-graphs-skill-bar-track">
                            <div
                              className="gms-graphs-skill-bar"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                          <span className="gms-graphs-skill-gain">
                            +{formatQty(row.gain)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
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
    if (period === '24h') {
      return d.toLocaleTimeString([], { hour: 'numeric' });
    }
    if (period === '365d') {
      return d.toLocaleDateString([], { month: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
}

function formatTooltipTime(value: string, period: XpHistoryPeriod) {
  const d = new Date(value);
  if (period === '24h') return d.toLocaleString();
  return d.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
