import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import alphaPixel from './assets/alpha_pixel.png';
import {
  BASEMAPS_URL,
  DEFAULT_CENTER,
  DEFAULT_LABELS_API_KEY,
  DEFAULT_LABELS_SHEET_ID,
  DEFAULT_MAP_ID,
  DEFAULT_MIN_ZOOM,
  DEFAULT_ZOOM,
  ICON_TILES_URL,
  MAP_TILES_URL,
} from './constants';
import {
  ensureLeafletExtensions,
  gameMap,
  mainTileLayer,
  mapLabelGroup,
  type GameMap,
} from './leaflet-extensions';
import { ELEVATION_MIN_ZOOM, findMapMode, readMapMode, type MapMode } from './mapModes';
import { applyElevation, ElevationSource, satelliteTileLayer } from './satelliteLayer';
import './Rs3Map.css';

ensureLeafletExtensions();

export type Rs3MapMarker = {
  id: string;
  name: string;
  x: number;
  y: number;
  plane: number;
  color: string;
  avatarUrl?: string | null;
  /** Offline players stay on the map but render grayed. */
  online?: boolean;
};

export type Rs3MapProps = {
  className?: string;
  /** Game X coordinate (east). Default 3200. */
  x?: number;
  /** Game Y coordinate (north). Default 3200. */
  y?: number;
  zoom?: number;
  plane?: number;
  mapId?: number;
  minZoom?: number;
  maxZoom?: number;
  showIcons?: boolean;
  showLabels?: boolean;
  markers?: Rs3MapMarker[];
  activeMarkerId?: string | null;
  /** Height of the map container. Default 70vh. */
  height?: string | number;
  labelsApiKey?: string;
  labelsSheetId?: string;
  /** When false, map is display-only (no pan/zoom/controls). */
  interactive?: boolean;
  mode?: MapMode;
};

const CLASSIC_TILE_OPTS = {
  minZoom: -4,
  maxNativeZoom: 3,
  maxZoom: 5,
  errorTileUrl: alphaPixel,
};

const OVERLAY_Z_INDEX = 20;

function playerDotIcon(
  color: string,
  name: string,
  active: boolean,
  avatarUrl?: string | null,
  online = true,
) {
  const safeName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
  const safeUrl = avatarUrl
    ? avatarUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    : null;
  const markerColor = online ? color : '#7a7f86';
  const face = safeUrl
    ? `<img class="rs3-player-marker-dot rs3-player-marker-dot--img" src="${safeUrl}" alt="" style="border-color:${markerColor}" />`
    : `<span class="rs3-player-marker-dot" style="background:${markerColor}"></span>`;
  const size = safeUrl ? 40 : 28;
  const half = size / 2;
  return L.divIcon({
    className: [
      'rs3-player-marker',
      active ? 'rs3-player-marker--active' : '',
      online ? '' : 'rs3-player-marker--offline',
    ]
      .filter(Boolean)
      .join(' '),
    html: `${face}<span class="rs3-player-marker-label">${safeName}${online ? '' : ' (offline)'}</span>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

/** Everything that affects a marker's icon/title; used to skip setIcon when unchanged. */
function markerIconKey(marker: Rs3MapMarker, active: boolean) {
  return [
    marker.name,
    marker.color,
    marker.avatarUrl ?? '',
    marker.online === false ? '0' : '1',
    active ? '1' : '0',
  ].join('|');
}

type MarkerEntry = { pin: L.Marker; iconKey: string };

export function Rs3Map({
  className,
  x = DEFAULT_CENTER.x,
  y = DEFAULT_CENTER.y,
  zoom = DEFAULT_ZOOM,
  plane = 0,
  mapId = DEFAULT_MAP_ID,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom,
  showIcons = true,
  showLabels = true,
  markers = [],
  activeMarkerId = null,
  height = '70vh',
  labelsApiKey = DEFAULT_LABELS_API_KEY,
  labelsSheetId = DEFAULT_LABELS_SHEET_ID,
  interactive = true,
  mode: modeProp,
}: Rs3MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GameMap | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerEntriesRef = useRef<Map<string, MarkerEntry>>(new Map());
  const elevationRef = useRef<ElevationSource | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [savedMode] = useState(readMapMode);
  const onMainMap = mapId === DEFAULT_MAP_ID;
  const mode: MapMode = onMainMap ? (modeProp ?? savedMode) : 'classic';
  const modeDef = findMapMode(mode);
  const effectiveMaxZoom = maxZoom ?? modeDef.maxZoom;

  const [detailZoom, setDetailZoom] = useState(() => zoom >= ELEVATION_MIN_ZOOM);
  const [heightsLoaded, setHeightsLoaded] = useState(0);
  const elevation = detailZoom ? modeDef.elevation : undefined;

  // The Leaflet map is created once; these options are read at mount only
  // (later prop changes are applied by the dedicated effects below).
  const mountOptionsRef = useRef({
    x,
    y,
    zoom,
    plane,
    mapId,
    minZoom,
    maxZoom: effectiveMaxZoom,
    showIcons,
    showLabels,
    labelsApiKey,
    labelsSheetId,
    interactive,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const opts = mountOptionsRef.current;

    const map = gameMap(el, {
      maxBounds: [
        [-1000, -1000],
        [13800, 13800],
      ],
      maxBoundsViscosity: 0.5,
      customZoomControl: false,
      planeControl: false,
      zoomControl: false,
      initialMapId: opts.mapId,
      plane: opts.plane,
      x: opts.x,
      y: opts.y,
      zoom: opts.zoom,
      minPlane: 0,
      maxPlane: 3,
      minZoom: opts.minZoom,
      maxZoom: opts.maxZoom,
      doubleClickZoom: false,
      dragging: opts.interactive,
      touchZoom: opts.interactive,
      scrollWheelZoom: opts.interactive,
      boxZoom: opts.interactive,
      keyboard: opts.interactive,
      attributionControl: false,
      baseMaps: BASEMAPS_URL,
    });

    if (opts.showIcons) {
      mainTileLayer(ICON_TILES_URL, {
        ...CLASSIC_TILE_OPTS,
        zIndex: OVERLAY_Z_INDEX,
      }).addTo(map);
    }

    if (opts.showLabels) {
      mapLabelGroup({
        API_KEY: opts.labelsApiKey,
        SHEET_ID: opts.labelsSheetId,
      }).addTo(map);
    }

    const markersLayer = L.layerGroup().addTo(map);
    const markerEntries = markerEntriesRef.current;
    markersLayerRef.current = markersLayer;
    elevationRef.current = new ElevationSource(() => setHeightsLoaded((n) => n + 1));
    mapRef.current = map;
    setMapReady(true);
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      elevationRef.current?.dispose();
      elevationRef.current = null;
      markerEntries.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const layers =
      modeDef.layers.length === 0
        ? [mainTileLayer(MAP_TILES_URL, CLASSIC_TILE_OPTS)]
        : modeDef.layers.map((layer) =>
            satelliteTileLayer(layer.sources, {
              errorTileUrl: alphaPixel,
              maxNativeZoom: layer.maxNativeZoom,
              className: layer.smooth ? 'rs3-map-tiles--smooth' : undefined,
            }),
          );

    layers.forEach((layer, i) => {
      (layer as L.GridLayer).setZIndex(i + 1);
      layer.addTo(map);
    });

    return () => {
      for (const layer of layers) layer.remove();
    };
  }, [mapReady, modeDef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.setMaxZoom(effectiveMaxZoom);
  }, [mapReady, effectiveMaxZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const sync = () => setDetailZoom(map.getZoom() >= ELEVATION_MIN_ZOOM);
    sync();
    map.on('zoomend', sync);
    return () => {
      map.off('zoomend', sync);
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(L.latLng(y, x), map.getZoom());
  }, [x, y]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    mapRef.current?.setPlane(plane);
  }, [plane]);

  useEffect(() => {
    mapRef.current?.setMapId(mapId);
  }, [mapId]);

  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!mapReady || !layer) return;
    const entries = markerEntriesRef.current;
    const seen = new Set<string>();

    for (const marker of markers) {
      if (marker.plane !== plane) continue;
      seen.add(marker.id);
      const online = marker.online !== false;
      const active = marker.id === activeMarkerId;
      const iconKey = markerIconKey(marker, active);
      const latLng = applyElevation(
        marker.x,
        marker.y,
        marker.plane,
        elevation,
        elevationRef.current,
      );
      const existing = entries.get(marker.id);

      if (existing) {
        const cur = existing.pin.getLatLng();
        if (cur.lat !== latLng.lat || cur.lng !== latLng.lng) existing.pin.setLatLng(latLng);
        if (existing.iconKey !== iconKey) {
          existing.pin.setIcon(
            playerDotIcon(marker.color, marker.name, active, marker.avatarUrl, online),
          );
          const el = existing.pin.getElement();
          if (el) el.title = online ? marker.name : `${marker.name} (offline)`;
          existing.iconKey = iconKey;
        }
        continue;
      }

      const pin = L.marker(latLng, {
        icon: playerDotIcon(marker.color, marker.name, active, marker.avatarUrl, online),
        title: online ? marker.name : `${marker.name} (offline)`,
        keyboard: false,
        interactive,
      });
      pin.addTo(layer);
      entries.set(marker.id, { pin, iconKey });
    }

    for (const [id, entry] of entries) {
      if (seen.has(id)) continue;
      layer.removeLayer(entry.pin);
      entries.delete(id);
    }
  }, [markers, plane, activeMarkerId, mapReady, interactive, elevation, heightsLoaded]);

  const styleHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      ref={containerRef}
      className={[
        'rs3-map',
        !interactive ? 'rs3-map--locked' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ height: styleHeight }}
      role="application"
      aria-label="RuneScape map"
      aria-hidden={!interactive || undefined}
    />
  );
}
