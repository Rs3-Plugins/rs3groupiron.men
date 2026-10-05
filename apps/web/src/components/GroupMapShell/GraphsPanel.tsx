import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEMO_GROUP,
  fetchXpHistory,
  type XpHistoryPeriod,
  type XpHistoryResponse,
} from '../../api/groupClient';
import { clickDownload, svgToPngBlob } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { downloadCsv, downloadXlsx, type Table } from '../../lib/exportTable';
import {
  DEFAULT_GRAPH_PREFS,
  PERIODS as PERIOD_VALUES,
  readGraphPrefs,
  writeGraphPrefs,
  TIME_CHARTS,
  type ChartKind,
  type GraphPrefs,
} from '../../lib/graphPrefs';
import { colorForName, formatQty } from '../../lib/items';
import { SKILL_BY_ID, SKILLS } from '../../lib/skills';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { useUrlState } from '../../hooks/useUrlState';
import { Spinner } from '../Spinner';
import { ChartOptionsMenu } from './ChartOptionsMenu';
import { ExportMenu, type ExportFormat } from './ExportMenu';
import { IconSelect, type IconOption } from './IconSelect';
import { SkillIcon } from './MemberAvatar';
import { memberOptions, type MemberBadge } from './memberOptions';
import { PanelStatus } from './PanelChrome';
import { RefreshIcon } from './icons';
import { SelectField, type SelectOption } from './SelectField';
import { XpChart, type ChartRow, type Slice } from './XpChart';

const PERIODS: SelectOption[] = [
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '365d', label: '12 Months' },
];

const PERIOD_TITLE: Record<XpHistoryPeriod, string> = {
  '24h': 'Day',
  '7d': 'Week',
  '30d': 'Month',
  '365d': 'Year',
};

const SKILL_OPTIONS: IconOption[] = [
  {
    value: 'overall',
    label: 'Overall',
    icon: <SkillIcon skillId="overall" />,
  },
  ...[...SKILLS]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({ value: s.id, label: s.name, icon: <SkillIcon skillId={s.id} /> })),
];

const SKILL_VALUES: string[] = SKILL_OPTIONS.map((o) => o.value);

const MAX_SLICES = 10;

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
  dataRevision?: number;
  members?: ReadonlyArray<MemberBadge>;
};

export function GraphsPanel({
  groupName = DEMO_GROUP,
  groupToken = '',
  dataRevision,
  members = [],
}: GraphsPanelProps) {
  const [urlParams] = useSearchParams();
  const [prefs, setPrefs] = useState<GraphPrefs>(readGraphPrefs);
  const { mode, logScale, chart } = prefs;

  const [period, setPeriodUrl] = useUrlState('period', DEFAULT_GRAPH_PREFS.period, {
    allowed: PERIOD_VALUES,
  });
  const [skill, setSkillUrl] = useUrlState('skill', DEFAULT_GRAPH_PREFS.skill, {
    allowed: SKILL_VALUES,
  });
  const [playerFilter, setPlayerUrl] = useUrlState('member', DEFAULT_GRAPH_PREFS.player);

  const [data, setData] = useState<XpHistoryResponse | null>(() =>
    readCache(cacheKey(groupName, period, skill)),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [saving, setSaving] = useState<ExportFormat | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const request = useLatestRequest();

  const isTimeChart = TIME_CHARTS.includes(chart);

  const patch = useCallback(
    (next: Partial<GraphPrefs>) => {
      if (next.period !== undefined) setPeriodUrl(next.period);
      if (next.skill !== undefined) setSkillUrl(next.skill);
      if (next.player !== undefined) setPlayerUrl(next.player);
      setPrefs((prev) => {
        const merged = { ...prev, ...next };
        writeGraphPrefs(merged);
        return merged;
      });
    },
    [setPeriodUrl, setSkillUrl, setPlayerUrl],
  );

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (urlParams.has('period') || urlParams.has('skill') || urlParams.has('member')) return;
    const saved = readGraphPrefs();
    if (saved.period !== DEFAULT_GRAPH_PREFS.period) setPeriodUrl(saved.period);
    if (saved.skill !== DEFAULT_GRAPH_PREFS.skill) setSkillUrl(saved.skill);
    if (saved.player !== DEFAULT_GRAPH_PREFS.player) setPlayerUrl(saved.player);
  }, [urlParams, setPeriodUrl, setSkillUrl, setPlayerUrl]);

  const load = useCallback(
    async (force = false, silent = false) => {
      const key = cacheKey(groupName, period, skill);
      const cached = force ? null : readCache(key);
      if (!cached && !silent) setLoading(true);
      setError(null);
      const settled = await request(async (signal) => {
        if (cached) return cached;
        const next = await fetchXpHistory(groupName, groupToken, period, skill, signal);
        historyCache.set(key, { at: Date.now(), data: next });
        return next;
      });
      if (!settled) return;
      if (settled.ok) setData(settled.value);
      else setError(errorMessage(settled.error, 'Failed to load XP history'));
      setLoading(false);
    },
    [request, groupName, groupToken, period, skill],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // `force` skips the cache, which is the whole point of refreshing.
  useLiveRefresh(
    useCallback(() => void load(true, true), [load]),
    { signal: dataRevision, intervalMs: 30_000 },
  );

  useEffect(() => {
    if (!data || playerFilter === 'all') return;
    if (!data.players.some((p) => p.name === playerFilter)) patch({ player: 'all' });
  }, [data, playerFilter, patch]);

  const playerOptions = useMemo(
    () =>
      memberOptions(
        (data?.players ?? []).map((p) => p.name),
        members,
        'All players',
      ),
    [data, members],
  );

  const matchesFilter = useCallback(
    (name: string) => playerFilter === 'all' || name === playerFilter,
    [playerFilter],
  );

  const visibleSeries = useMemo(
    () => (data?.series ?? []).filter((s) => matchesFilter(s.name)),
    [data, matchesFilter],
  );

  const visiblePlayers = useMemo(
    () => (data?.players ?? []).filter((p) => matchesFilter(p.name)),
    [data, matchesFilter],
  );

  const chartRows = useMemo<ChartRow[]>(() => {
    if (!visibleSeries.length) return [];
    const byTime = new Map<string, ChartRow>();
    for (const series of visibleSeries) {
      let previous = 0;
      for (const point of series.points) {
        const row = byTime.get(point.t) ?? { t: point.t };
        row[series.name] = mode === 'interval' ? Math.max(0, point.gain - previous) : point.gain;
        previous = point.gain;
        byTime.set(point.t, row);
      }
    }
    return [...byTime.values()].sort(
      (a, b) => new Date(String(a.t)).getTime() - new Date(String(b.t)).getTime(),
    );
  }, [visibleSeries, mode]);

  const slices = useMemo<Slice[]>(() => {
    const raw =
      playerFilter === 'all'
        ? visiblePlayers.map((p) => ({ name: p.name, value: p.totalGain }))
        : (visiblePlayers[0]?.skills ?? []).map((s) => ({ name: s.name, value: s.gain }));

    const ranked = raw.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
    if (ranked.length <= MAX_SLICES) return ranked;
    const head = ranked.slice(0, MAX_SLICES - 1);
    const rest = ranked.slice(MAX_SLICES - 1).reduce((sum, s) => sum + s.value, 0);
    return rest > 0 ? [...head, { name: 'Other', value: rest }] : head;
  }, [playerFilter, visiblePlayers]);

  const lastIndex = Math.max(0, chartRows.length - 1);
  const start = Math.min(range?.start ?? 0, lastIndex);
  const end = Math.min(range?.end ?? lastIndex, lastIndex);
  const zoomed = isTimeChart && range !== null && (start > 0 || end < lastIndex);

  useEffect(() => setRange(null), [period, skill, mode]);

  const seriesNames = useMemo(() => visibleSeries.map((s) => s.name), [visibleSeries]);
  const shownNames = seriesNames.filter((name) => !hidden.has(name));

  const toggleSeries = useCallback(
    (name: string) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else if (seriesNames.length - next.size > 1) next.add(name);
        return next;
      });
    },
    [seriesNames.length],
  );

  const endDrag = useCallback(() => {
    setDrag((current) => {
      if (!current) return null;
      const [from, to] = [current.from, current.to].sort((a, b) => a - b);
      if (to - from >= 1) setRange({ start: from, end: to });
      return null;
    });
  }, []);

  const baseName = `${groupName}-${skill}-${period}-${chart}`
    .replace(/\s+/g, '-')
    .toLowerCase();

  function exportTable(): Table {
    if (isTimeChart) {
      return {
        filename: baseName,
        sheet: `${skillLabel} ${PERIOD_TITLE[period]}`,
        headers: ['Time', ...shownNames],
        rows: chartRows.map((row) => [
          new Date(String(row.t)),
          ...shownNames.map((name) => Number(row[name] ?? 0)),
        ]),
      };
    }
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    return {
      filename: baseName,
      sheet: `${skillLabel} ${PERIOD_TITLE[period]}`,
      headers: [playerFilter === 'all' ? 'Member' : 'Skill', 'XP', 'Share %'],
      rows: slices.map((s) => [
        s.name,
        s.value,
        total ? Math.round((s.value / total) * 1000) / 10 : 0,
      ]),
    };
  }

  async function downloadPng() {
    // Legend swatches carry .recharts-surface too and sort first in the DOM.
    const svg = chartRef.current?.querySelector<SVGSVGElement>('.recharts-wrapper > svg');
    if (!svg) throw new Error('The chart is not ready yet');
    const legend = isTimeChart
      ? shownNames.map((name) => ({ label: name, color: colorForName(name) }))
      : slices.map((s) => ({ label: s.name, color: colorForName(s.name) }));
    const blob = await svgToPngBlob(svg, {
      background: '#12100c',
      caption: `${skillLabel} — ${PERIOD_TITLE[period]}${mode === 'interval' && isTimeChart ? ' (per step)' : ''}`,
      legend,
    });
    const href = URL.createObjectURL(blob);
    clickDownload(href, `${baseName}.png`);
    URL.revokeObjectURL(href);
  }

  async function runExport(format: ExportFormat) {
    setSaving(format);
    try {
      if (format === 'png') await downloadPng();
      else if (format === 'csv') downloadCsv(exportTable());
      else await downloadXlsx(exportTable());
    } catch (err) {
      setError(errorMessage(err, 'Could not export the chart'));
    } finally {
      setSaving(null);
    }
  }

  const skillLabel =
    skill === 'overall' ? 'Overall' : (SKILL_BY_ID[skill as SkillKey]?.name ?? skill);
  const hasChart = data != null && (isTimeChart ? chartRows.length > 0 : slices.length > 0);

  return (
    <section className="gms-graphs gms-panel" aria-label="XP graphs" aria-busy={loading}>
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
          <RefreshIcon />
        </button>

        <SelectField
          label="Period"
          value={period}
          options={PERIODS}
          onChange={(value) => patch({ period: value as XpHistoryPeriod })}
        />
        <IconSelect
          label="Skill"
          value={skill}
          options={SKILL_OPTIONS}
          onChange={(value) => patch({ skill: value })}
        />
        <IconSelect
          label="Player"
          value={playerFilter}
          options={playerOptions}
          onChange={(value) => patch({ player: value })}
        />

        {/* Only while it applies — an always-there disabled button is noise. */}
        {zoomed && (
          <button
            type="button"
            className="gms-graphs-toggle"
            title="Show the whole period again"
            onClick={() => setRange(null)}
          >
            Reset zoom
          </button>
        )}

        <ChartOptionsMenu
          chart={chart}
          onChartChange={(value) => patch({ chart: value })}
          showMode={isTimeChart}
          mode={mode}
          onModeChange={(value) => patch({ mode: value })}
          showLogScale={chart !== 'pie'}
          logScale={logScale}
          onLogScaleChange={(on) => patch({ logScale: on })}
        />

        <ExportMenu
          busy={saving}
          disabled={!hasChart}
          onExport={(format) => void runExport(format)}
        />
      </div>

      <div className="gms-graphs-chart-wrap">
        <h2 className="gms-graphs-title">
          {`${skillLabel} - ${PERIOD_TITLE[period]}`}
          {isTimeChart && mode === 'interval' && (
            <span className="gms-graphs-title-tag">per step</span>
          )}
          {zoomed && <span className="gms-graphs-title-tag">zoomed</span>}
        </h2>

        {/* The spinner takes the chart's place rather than sitting beside it, so
            the panel doesn't reflow between states. */}
        {loading ? (
          <div className="gms-graphs-chart gms-graphs-chart--loading">
            <Spinner label="Loading XP history…" />
          </div>
        ) : (
          <>
            <PanelStatus error={error} />
            {!error && hasChart && (
              <div className="gms-graphs-chart" ref={chartRef}>
                <XpChart
                  kind={chart}
                  period={period}
                  mode={mode}
                  logScale={logScale}
                  rows={chartRows}
                  slices={slices}
                  seriesNames={seriesNames}
                  hidden={hidden}
                  onToggleSeries={toggleSeries}
                  start={start}
                  end={end}
                  drag={drag}
                  onDragStart={(i) => setDrag({ from: i, to: i })}
                  onDragMove={(i) => setDrag((d) => (d ? { from: d.from, to: i } : d))}
                  onDragEnd={endDrag}
                  onBrush={(s, e) => setRange({ start: s, end: e })}
                />
              </div>
            )}
            {!error && !hasChart && (
              <p className="gms-panel-status">No XP recorded in this period.</p>
            )}
          </>
        )}

        {!loading && hasChart && (
          <p className="gms-graphs-hint">
            {chartHint(chart, playerFilter === 'all')}
            {isTimeChart && hidden.size > 0 ? ` · ${hidden.size} hidden` : ''}
          </p>
        )}
      </div>

      <div
        className={
          skill === 'overall'
            ? 'gms-graphs-players'
            : 'gms-graphs-players gms-graphs-players--totals'
        }
      >
        {skill === 'overall' ? (
          visiblePlayers.map((player) => <PlayerBreakdown key={player.name} player={player} />)
        ) : (
          <div className="gms-graphs-totals">
            {visiblePlayers.map((player) => (
              <div key={player.name} className="gms-graphs-total-chip">
                <span
                  className="gms-graphs-player-dot"
                  style={{ background: colorForName(player.name) }}
                />
                <span className="gms-graphs-total-name">{player.name}</span>
                <span className="gms-graphs-player-total">+{formatQty(player.totalGain)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function chartHint(chart: ChartKind, wholeGroup: boolean) {
  if (TIME_CHARTS.includes(chart)) {
    return 'Drag across the chart to zoom · click a name to hide that line';
  }
  if (chart === 'pie') {
    return wholeGroup
      ? 'Share of the group’s XP this period'
      : 'Share of this member’s XP by skill';
  }
  return wholeGroup
    ? 'XP per member this period, biggest first'
    : 'XP per skill for this member, biggest first';
}

type SkillKey = keyof typeof SKILL_BY_ID;
type GraphPlayer = XpHistoryResponse['players'][number];

function PlayerBreakdown({ player }: { player: GraphPlayer }) {
  const color = colorForName(player.name);
  const maxSkill = Math.max(1, ...player.skills.map((s) => s.gain));

  return (
    <article className="gms-graphs-player">
      <header className="gms-graphs-player-head">
        <span className="gms-graphs-player-dot" style={{ background: color }} />
        <strong>{player.name}</strong>
        <span className="gms-graphs-player-total">+{formatQty(player.totalGain)}</span>
      </header>
      {player.skills.length > 0 && (
        <ul className="gms-graphs-skill-list">
          {player.skills.slice(0, 12).map((row) => {
            const def = SKILL_BY_ID[row.id as SkillKey];
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
                    style={{
                      width: `${Math.max(4, (row.gain / maxSkill) * 100)}%`,
                      background: color,
                    }}
                  />
                </div>
                <span className="gms-graphs-skill-gain">+{formatQty(row.gain)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
