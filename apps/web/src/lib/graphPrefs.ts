import type { XpHistoryPeriod } from '../api/groupClient';

const STORAGE_KEY = 'rs3-ui-graph-prefs-v1';

export type GraphMode = 'cumulative' | 'interval';

export type ChartKind = 'line' | 'area' | 'bar' | 'pie';

export const TIME_CHARTS: ChartKind[] = ['line', 'area'];

export type GraphPrefs = {
  period: XpHistoryPeriod;
  skill: string;
  player: string;
  mode: GraphMode;
  logScale: boolean;
  chart: ChartKind;
};

const CHARTS: ChartKind[] = ['line', 'area', 'bar', 'pie'];

const PERIODS: XpHistoryPeriod[] = ['24h', '7d', '30d', '365d'];

export const DEFAULT_GRAPH_PREFS: GraphPrefs = {
  period: '24h',
  skill: 'overall',
  player: 'all',
  mode: 'cumulative',
  logScale: false,
  chart: 'line',
};

export function readGraphPrefs(): GraphPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPH_PREFS };
    const parsed = JSON.parse(raw) as Partial<GraphPrefs>;
    return {
      period: PERIODS.includes(parsed.period as XpHistoryPeriod)
        ? (parsed.period as XpHistoryPeriod)
        : DEFAULT_GRAPH_PREFS.period,
      skill: typeof parsed.skill === 'string' ? parsed.skill : DEFAULT_GRAPH_PREFS.skill,
      player: typeof parsed.player === 'string' ? parsed.player : DEFAULT_GRAPH_PREFS.player,
      mode: parsed.mode === 'interval' ? 'interval' : 'cumulative',
      logScale: parsed.logScale === true,
      chart: CHARTS.includes(parsed.chart as ChartKind)
        ? (parsed.chart as ChartKind)
        : DEFAULT_GRAPH_PREFS.chart,
    };
  } catch {
    return { ...DEFAULT_GRAPH_PREFS };
  }
}

export function writeGraphPrefs(prefs: GraphPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
  }
}
