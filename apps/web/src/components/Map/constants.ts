export const MAP_TILES_URL =
  'https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/map_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png';

export const ICON_TILES_URL =
  'https://raw.githubusercontent.com/mejrs/layers_rs3/refs/heads/master/icon_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png';

export const BASEMAPS_URL =
  'https://raw.githubusercontent.com/mejrs/data_rs3/refs/heads/master/basemaps.json';

/** Default label sheet from mejrs map (x, y, plane, description). */
export const DEFAULT_LABELS_SHEET_ID = '1apnt91ud4GkWsfuxJTXdhrGjyGFL0hNz6jYDED3abX0';

/**
 * Google Sheets API key for the label sheet. Override with VITE_LABELS_API_KEY.
 * The fallback is the upstream public mejrs key (read-only, referrer-restricted).
 */
export const DEFAULT_LABELS_API_KEY: string =
  import.meta.env.VITE_LABELS_API_KEY || 'AIzaSyBrYT0-aS9VpW2Aenm-pJ2UCUhih8cZ4g8';

export const DEFAULT_CENTER = { x: 3200, y: 3200 };
export const DEFAULT_ZOOM = 2;
export const DEFAULT_MAP_ID = -1;
