export type MapMode = 'satellite' | 'flat' | 'walled' | 'classic';

export type ElevationConfig = { dxdy: number; dzdy: number };

export const SATELLITE_ELEVATION: ElevationConfig = { dxdy: 0.0046875, dzdy: 0.015625 };

export const ELEVATION_MIN_ZOOM = 3;

export type SatelliteSource = {
  file: string;
  from?: number;
  to?: number;
};

export type MapModeLayer = {
  sources: SatelliteSource[];
  maxNativeZoom: number;
  smooth?: boolean;
};

export type MapModeDef = {
  id: MapMode;
  label: string;
  hint: string;
  layers: MapModeLayer[];
  maxZoom: number;
  elevation?: ElevationConfig;
};

const TOPDOWN: MapModeLayer = {
  sources: [{ file: 'topdown-{plane}/{z}/{x}-{y}.webp' }],
  maxNativeZoom: 5,
  smooth: true,
};

export const MAP_MODES: MapModeDef[] = [
  {
    id: 'satellite',
    label: 'Satellite',
    hint: 'Birds-eye 3D render',
    layers: [
      {
        sources: [{ file: 'level-{plane}/{z}/{x}-{y}.webp' }],
        maxNativeZoom: 5,
        smooth: true,
      },
    ],
    maxZoom: 5,
    elevation: SATELLITE_ELEVATION,
  },
  {
    id: 'flat',
    label: 'Flat',
    hint: '3D render viewed straight down',
    layers: [TOPDOWN],
    maxZoom: 5,
  },
  {
    id: 'walled',
    label: 'Walled',
    hint: 'Flat render with wall outlines',
    layers: [
      TOPDOWN,
      {
        sources: [
          { to: 2, file: 'walls-{plane}/{z}/{x}-{y}.webp' },
          { from: 3, to: 3, file: 'walls-{plane}/{z}/{x}-{y}.svg' },
        ],
        maxNativeZoom: 3,
      },
    ],
    maxZoom: 5,
  },
  {
    id: 'classic',
    label: 'Classic',
    hint: 'The in-game 2D world map',
    layers: [],
    maxZoom: 4,
  },
];

export const DEFAULT_MAP_MODE: MapMode = 'satellite';

export function findMapMode(mode: MapMode): MapModeDef {
  return MAP_MODES.find((m) => m.id === mode) ?? MAP_MODES[MAP_MODES.length - 1];
}

const STORAGE_KEY = 'rs3-map-mode-v1';

export function readMapMode(): MapMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as MapMode | null;
    return raw && MAP_MODES.some((m) => m.id === raw) ? raw : DEFAULT_MAP_MODE;
  } catch {
    return DEFAULT_MAP_MODE;
  }
}

export function writeMapMode(mode: MapMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}
