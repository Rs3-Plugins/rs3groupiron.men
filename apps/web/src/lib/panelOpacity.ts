import type { AppearanceTheme } from '../api/groupClient';

const STORAGE_KEY = 'rs3-ui-panel-opacity-by-theme-v1';

/** Panel fill opacity percent. Higher = more opaque. */
export const PANEL_OPACITY_MIN = 25;
export const PANEL_OPACITY_MAX = 100;

const DEFAULTS: Record<AppearanceTheme, number> = {
  rs3: 96,
  modern: 82,
};

type OpacityByTheme = Record<AppearanceTheme, number>;

export function clampPanelOpacity(
  value: number,
  fallback: number = DEFAULTS.rs3,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(PANEL_OPACITY_MAX, Math.max(PANEL_OPACITY_MIN, Math.round(value)));
}

/** Debounce window for localStorage writes while the slider is dragged. */
const WRITE_DEBOUNCE_MS = 150;

let pending: OpacityByTheme | null = null;
let pendingTimer: number | null = null;

function readAll(): OpacityByTheme {
  if (pending) return { ...pending };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<OpacityByTheme>;
    return {
      rs3: clampPanelOpacity(Number(parsed.rs3), DEFAULTS.rs3),
      modern: clampPanelOpacity(Number(parsed.modern), DEFAULTS.modern),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function flushWrite() {
  pendingTimer = null;
  const next = pending;
  pending = null;
  if (!next) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

function scheduleWrite(next: OpacityByTheme) {
  pending = next;
  if (pendingTimer != null) window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(flushWrite, WRITE_DEBOUNCE_MS);
}

export function readPanelOpacity(theme: AppearanceTheme): number {
  return readAll()[theme];
}

/**
 * Persist an opacity value. The clamped value is returned synchronously (and
 * visible to subsequent reads immediately); the localStorage write itself is
 * debounced so slider drags don't hammer storage.
 */
export function writePanelOpacity(theme: AppearanceTheme, value: number) {
  const all = readAll();
  all[theme] = clampPanelOpacity(value, DEFAULTS[theme]);
  scheduleWrite(all);
  return all[theme];
}

export function panelOpacityToAlpha(percent: number) {
  return clampPanelOpacity(percent) / 100;
}

export function defaultPanelOpacity(theme: AppearanceTheme) {
  return DEFAULTS[theme];
}
