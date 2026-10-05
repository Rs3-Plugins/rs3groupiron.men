/* eslint-disable @typescript-eslint/no-explicit-any */
import L from 'leaflet';
import { RUNEAPPS_TILES_URL } from './constants';
import type { ElevationConfig, SatelliteSource } from './mapModes';

const TILE_SIZE = 512;
const ORIGIN_X = -16.5;
const ORIGIN_Y = 12783.5;
const MIN_NATIVE_ZOOM = -5;

export type SatelliteLayerOptions = L.TileLayerOptions;

const SatelliteTileLayer = (L.TileLayer as any).extend({
  initialize(this: any, sources: SatelliteSource[], options?: SatelliteLayerOptions) {
    this._sources = sources;
    L.setOptions(this, { tileSize: TILE_SIZE, minZoom: MIN_NATIVE_ZOOM, ...options });
  },

  _sourceFor(this: any, zoom: number): SatelliteSource | undefined {
    return this._sources.find(
      (source: SatelliteSource) =>
        (source.from ?? -Infinity) <= zoom && zoom <= (source.to ?? Infinity),
    );
  },

  getTileUrl(this: any, coords: L.Coords) {
    const source = this._sourceFor(coords.z);
    if (!source) return this.options.errorTileUrl ?? '';
    const path = L.Util.template(source.file, {
      plane: this._map?.getPlane?.() ?? 0,
      z: coords.z,
      x: coords.x,
      y: coords.y,
    });
    return `${RUNEAPPS_TILES_URL}/${path}`;
  },

  _getTiledPixelBounds(this: any, center: L.LatLng) {
    return (L.TileLayer.prototype as any)._getTiledPixelBounds.call(
      this,
      L.latLng(center.lat - ORIGIN_Y, center.lng - ORIGIN_X),
    );
  },

  _getTilePos(this: any, coords: L.Coords) {
    const tilesPerSquare = 2 ** coords.z / TILE_SIZE;
    const shifted = L.point(
      coords.x + ORIGIN_X * tilesPerSquare,
      coords.y - ORIGIN_Y * tilesPerSquare,
    ) as L.Coords;
    shifted.z = coords.z;
    return (L.TileLayer.prototype as any)._getTilePos.call(this, shifted);
  },
});

export function satelliteTileLayer(
  sources: SatelliteSource[],
  options?: SatelliteLayerOptions,
): L.TileLayer {
  return new SatelliteTileLayer(sources, options) as L.TileLayer;
}

const CHUNK = 64;

export class ElevationSource {
  private readonly chunks = new Map<string, Uint16Array | null>();
  private readonly onLoad: () => void;
  private disposed = false;

  constructor(onLoad: () => void) {
    this.onLoad = onLoad;
  }

  heightAt(x: number, y: number, plane: number): number {
    const chunkX = Math.floor(x / CHUNK);
    const chunkY = Math.floor(y / CHUNK);
    const key = `${plane}/${chunkX}/${chunkY}`;
    const chunk = this.chunks.get(key);

    if (chunk === undefined) {
      this.chunks.set(key, null);
      void this.fetchChunk(key, chunkX, chunkY, plane);
      return 0;
    }
    if (!chunk) return 0;

    const localX = clampLocal(Math.round(x) - chunkX * CHUNK);
    const localY = clampLocal(Math.round(y) - chunkY * CHUNK);
    return chunk[2 * (localX + localY * CHUNK)] ?? 0;
  }

  private async fetchChunk(key: string, chunkX: number, chunkY: number, plane: number) {
    try {
      const res = await fetch(`${RUNEAPPS_TILES_URL}/height-${plane}/${chunkX}-${chunkY}.bin`);
      if (!res.ok) return;
      const buffer = await res.arrayBuffer();
      if (this.disposed) return;
      this.chunks.set(key, new Uint16Array(buffer));
      this.onLoad();
    } catch {}
  }

  dispose() {
    this.disposed = true;
    this.chunks.clear();
  }
}

function clampLocal(value: number) {
  return Math.min(CHUNK - 1, Math.max(0, value));
}

export function applyElevation(
  x: number,
  y: number,
  plane: number,
  elevation: ElevationConfig | undefined,
  source: ElevationSource | null,
): L.LatLng {
  if (!elevation || !source) return L.latLng(y, x);
  const height = source.heightAt(x, y, plane);
  return L.latLng(y + height * elevation.dzdy, x + height * elevation.dxdy);
}
