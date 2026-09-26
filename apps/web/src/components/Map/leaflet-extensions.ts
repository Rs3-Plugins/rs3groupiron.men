/* eslint-disable @typescript-eslint/no-explicit-any */
import L from 'leaflet';

export type BaseMapEntry = {
  mapId: number;
  bounds: [[number, number], [number, number]];
};

export type GameMapOptions = L.MapOptions & {
  x?: number;
  y?: number;
  plane?: number;
  minPlane?: number;
  maxPlane?: number;
  initialMapId?: number;
  baseMaps?: string;
  showMapBorder?: boolean;
  customZoomControl?: boolean | Record<string, unknown>;
  fullscreenControl?: boolean | Record<string, unknown>;
  planeControl?: boolean | Record<string, unknown>;
};

export type GameMap = L.Map & {
  getPlane(): number;
  getMapId(): number;
  getMinPlane(): number;
  getMaxPlane(): number;
  setPlane(plane: number): GameMap | undefined;
  setMapId(mapId: number): GameMap | undefined;
};

export type MapLabelOptions = {
  API_KEY: string;
  SHEET_ID: string;
};

// Extra control corners used by mejrs-style controls
;(L.Map as any).include({
  _initControlPos(this: any) {
    const corners = (this._controlCorners = {});
    const prefix = 'leaflet-';
    const container = (this._controlContainer = L.DomUtil.create(
      'div',
      `${prefix}control-container`,
      this.getContainer(),
    ));

    const createCorner = (vSide: string, hSide: string) => {
      (corners as Record<string, HTMLElement>)[`${vSide}${hSide}`] = L.DomUtil.create(
        'div',
        `${prefix}${vSide} ${prefix}${hSide}`,
        container,
      );
    };

    createCorner('top', 'left');
    createCorner('top', 'right');
    createCorner('bottom', 'left');
    createCorner('bottom', 'right');
    createCorner('top', 'center');
    createCorner('middle', 'center');
    createCorner('middle', 'left');
    createCorner('middle', 'right');
    createCorner('bottom', 'center');
  },
});

function castBaseMaps(data: BaseMapEntry[]) {
  const baseMaps: Record<number, BaseMapEntry> = {};
  for (const entry of data) {
    baseMaps[entry.mapId] = entry;
  }
  return baseMaps;
}

const GameMapClass = (L.Map as any).extend({
  initialize(this: any, id: string | HTMLElement, options: GameMapOptions = {}) {
    this._plane = this._limitPlane(options.plane ?? 0);
    this._mapId = options.initialMapId ?? -1;

    const x = options.x ?? 3232;
    const y = options.y ?? 3232;
    options.center = [y, x];
    options.crs = L.CRS.Simple;

    ;(L.Map.prototype as any).initialize.call(this, id, options);

    if (options.baseMaps) {
      fetch(options.baseMaps)
        .then((response) => response.json())
        .then((data: BaseMapEntry[] | Record<number, BaseMapEntry>) => {
          this._baseMaps = Array.isArray(data) ? castBaseMaps(data) : data;
          this._allowedMapIds = Object.keys(this._baseMaps).map(Number);
          const bounds = this.getMapIdBounds(this._mapId);

          if (options.showMapBorder) {
            this.boundsRect = L.rectangle(bounds, {
              color: '#ffffff',
              weight: 1,
              fill: false,
              smoothFactor: 1,
            }).addTo(this);
          }

          this.setMaxBounds(bounds.pad(0.1));
        })
        .catch(() => {
          /* basemaps optional */
        });
    }
  },

  _limitPlane(this: any, plane: number) {
    return Math.max(this.getMinPlane(), Math.min(this.getMaxPlane(), plane));
  },

  _validateMapId(this: any, mapId: number | string) {
    const parsed = Number.parseInt(String(mapId), 10);
    if (!this._allowedMapIds) return this._mapId;
    if (this._allowedMapIds.includes(parsed)) return parsed;
    return this._mapId;
  },

  getPlane(this: any) {
    return this._plane;
  },

  getMapId(this: any) {
    return this._mapId;
  },

  getMinPlane(this: any) {
    return this.options.minPlane ?? 0;
  },

  getMaxPlane(this: any) {
    return this.options.maxPlane ?? 3;
  },

  setPlane(this: any, plane: number) {
    const newPlane = this._limitPlane(plane);
    const oldPlane = this._plane;
    if (oldPlane === newPlane) return undefined;

    this.fire('preplanechange', { oldPlane, newPlane });
    this.fire('viewprereset');
    this._plane = newPlane;
    this.fire('viewreset');
    this.fire('planechange', { oldPlane, newPlane });
    return this;
  },

  setMapId(this: any, mapId: number) {
    const newMapId = this._validateMapId(mapId);
    const oldMapId = this._mapId;
    if (oldMapId === newMapId) return undefined;

    this.fire('premapidchange', { oldMapId, newMapId });
    this.fire('viewprereset');
    this._mapId = newMapId;
    this.fire('viewreset');
    this.fire('mapidchange', { oldMapId, newMapId });
    this.setMapIdBounds(newMapId);
    return this;
  },

  getMapIdBounds(this: any, mapId: number) {
    const [[west, south], [east, north]] = this._baseMaps[mapId].bounds;
    return L.latLngBounds([
      [south, west],
      [north, east],
    ]);
  },

  setMapIdBounds(this: any, newMapId: number) {
    if (!this._baseMaps?.[newMapId]) return;
    const bounds = this.getMapIdBounds(newMapId);
    this.boundsRect?.setBounds(bounds);
    this.setMaxBounds(bounds.pad(0.1));
    this.fitBounds(bounds);
  },
});

export function gameMap(id: string | HTMLElement, options?: GameMapOptions): GameMap {
  return new GameMapClass(id, options) as GameMap;
}

const MainTileLayer = (L.TileLayer as any).extend({
  initialize(this: any, url: string, options?: L.TileLayerOptions) {
    this._url = url;
    L.setOptions(this, options);
  },

  onAdd(this: any, map: L.Map) {
    if (this.options.errorTileUrl) {
      this.options.resolved_error_url = new URL(this.options.errorTileUrl, document.location.href).href;
    }
    return (L.TileLayer.prototype as any).onAdd.call(this, map);
  },

  getTileUrl(this: any, coords: L.Coords) {
    return L.Util.template(this._url, {
      source: this.options.source,
      mapId: this._map._mapId,
      zoom: coords.z,
      plane: this._map._plane || 0,
      x: coords.x,
      y: -(1 + coords.y),
    });
  },

  createTile(this: any, coords: L.Coords, done: L.DoneCallback) {
    const tile = (L.TileLayer.prototype as any).createTile.call(this, coords, done);
    tile.onerror = (error: Event) => {
      if (typeof error.preventDefault === 'function') error.preventDefault();
    };
    return tile;
  },
});

export function mainTileLayer(url: string, options?: L.TileLayerOptions): L.TileLayer {
  return new MainTileLayer(url, options) as L.TileLayer;
}

/* ---------- Plane control ---------- */

const PlaneControl = (L.Control as any).extend({
  options: {
    position: 'topright',
    upicon:
      '<svg viewBox="0 0 64 64" height="24px" width="24px"><g style="display:inline" transform="translate(0,-233)"> <path d="m 27,238 -19,-0 7,7 -11,11 5,5 11,-11 7,7 z" style="fill:#000000;fill-opacity:1" /><path d="M 4,61 V 47 H 19 V 33 H 33 V 18 H 47 V 4 H 61 V 12 L 12,61 Z" style="display:inline;fill:#000000" transform="translate(0,233)"/></g></svg>',
    downicon:
      '<svg viewBox="0 0 64 64" height="24px" width="24px"><g style="display:inline" transform="translate(0,-233)"> <path d="m 4,261 19,0 -7,-7 11,-11 -5,-5 -11,11 -7,-7 z" style="fill:#000000;fill-opacity:1" /><path d="M 4,61 V 47 H 19 V 33 H 33 V 18 H 47 V 4 H 61 V 12 L 12,61 Z" style="display:inline;fill:#000000" transform="translate(0,233)"/></g></svg>',
  },

  onAdd(this: any, map: GameMap) {
    this._map = map;
    const container = L.DomUtil.create('div', 'leaflet-control-plane leaflet-bar');
    const disabled = 'leaflet-disabled';

    this._buttonUp = this.createElement(
      'a',
      this.options.upicon,
      'Move up',
      `leaflet-control-plane-up ${map.getPlane() + 1 > map.getMaxPlane() ? disabled : ''}`,
      container,
      () => map.setPlane(map.getPlane() + 1),
      'click',
    );
    this._buttonPlane = this.createElement(
      'a',
      String(map.getPlane()),
      'Current plane',
      'leaflet-control-plane-plane',
      container,
      () => map.setPlane(map.getMinPlane()),
      'click',
    );
    this._buttonDown = this.createElement(
      'a',
      this.options.downicon,
      'Move down',
      `leaflet-control-plane-down ${map.getPlane() - 1 < map.getMinPlane() ? disabled : ''}`,
      container,
      () => map.setPlane(map.getPlane() - 1),
      'click',
    );

    map.on('planechange maxplanechange', this.updateButtons, this);
    return container;
  },

  createElement(
    this: any,
    tag: string,
    html: string,
    title: string,
    className: string,
    container: HTMLElement,
    fn: () => void,
    event: string,
  ) {
    const el = L.DomUtil.create(tag, className, container);
    el.innerHTML = html;
    el.title = title;
    L.DomEvent.disableClickPropagation(el)
      .on(el, event, fn, this)
      .on(el, event, this._refocusOnMap, this);
    return el;
  },

  updateButtons(this: any) {
    const plane = this._map._plane;
    const maxPlane = this._map.getMaxPlane();
    const minPlane = this._map.getMinPlane();

    this._buttonPlane.textContent = String(plane);
    L.DomUtil.removeClass(this._buttonUp, 'leaflet-disabled');
    L.DomUtil.removeClass(this._buttonDown, 'leaflet-disabled');
    L.DomUtil.removeClass(this._buttonPlane, 'leaflet-disabled');

    if (plane === minPlane) L.DomUtil.addClass(this._buttonPlane, 'leaflet-disabled');
    if (plane - 1 < minPlane) L.DomUtil.addClass(this._buttonDown, 'leaflet-disabled');
    if (plane + 1 > maxPlane) L.DomUtil.addClass(this._buttonUp, 'leaflet-disabled');
  },
});

L.Map.mergeOptions({ zoomControl: false });
L.Map.addInitHook(function (this: any) {
  if (this.options.planeControl) {
    this.addControl(
      new PlaneControl(typeof this.options.planeControl === 'object' ? this.options.planeControl : undefined),
    );
  }
});

/* ---------- Custom zoom control ---------- */

const CustomZoom = (L.Control.Zoom as any).extend({
  options: {
    position: 'topright',
    defaultZoom: 2,
    displayZoomLevel: true,
    className: 'leaflet-control-zoom',
    zoomIn: { innerHTML: '+', title: 'Zoom in', role: 'button' },
    zoomOut: { innerHTML: '-', title: 'Zoom out', role: 'button' },
    zoomReset: { innerHTML: '100%', title: 'Reset zoom', role: 'button' },
  },

  onAdd(this: any, map: L.Map) {
    this._map = map;
    this._container = L.DomUtil.create('div', 'leaflet-control-zoom leaflet-bar');

    this._zoomInButton = this.createElement('a', this.options.zoomIn, `${this.options.className}-in`, this._container, {
      click: this._zoomIn,
    });

    if (this.options.displayZoomLevel) {
      this._zoomLevel = this.createElement(
        'a',
        this.options.zoomReset,
        `${this.options.className}-level`,
        this._container,
        { click: this._resetZoom },
      );
    }

    this._zoomOutButton = this.createElement(
      'a',
      this.options.zoomOut,
      `${this.options.className}-out`,
      this._container,
      { click: this._zoomOut },
    );

    this._update();
    map.on('zoomend zoomlevelschange', this._update, this);
    return this._container;
  },

  createElement(
    this: any,
    tag: string,
    attributes: Record<string, string> | null,
    className: string,
    container: HTMLElement,
    eventfnpairs?: Record<string, (e: Event) => void>,
  ) {
    const el = L.DomUtil.create(tag, className, container);
    if (attributes) {
      for (const [property, value] of Object.entries(attributes)) {
        ;(el as any)[property] = value;
      }
    }
    if (eventfnpairs) {
      for (const [event, fn] of Object.entries(eventfnpairs)) {
        L.DomEvent.disableClickPropagation(el)
          .on(el, event, fn, this)
          .on(el, event, this._refocusOnMap, this);
      }
    }
    return el;
  },

  _update(this: any) {
    ;(L.Control.Zoom.prototype as any)._updateDisabled.call(this);
    if (this._zoomLevel) {
      this._zoomLevel.textContent = `${this.getZoomPercentage() * 100}%`;
    }
  },

  getZoomPercentage(this: any, zoom?: number) {
    return 1 / this._map.getZoomScale(zoom ?? this.options.defaultZoom);
  },

  _resetZoom(this: any) {
    this._map.setZoom(this.options.defaultZoom);
  },
});

L.Map.addInitHook(function (this: any) {
  if (this.options.customZoomControl) {
    this.addControl(
      new CustomZoom(
        typeof this.options.customZoomControl === 'object' ? this.options.customZoomControl : undefined,
      ),
    );
  }
});

/* ---------- Fullscreen control ---------- */

const FullscreenControl = (L.Control as any).extend({
  options: {
    position: 'topright',
    title: { false: 'View Fullscreen', true: 'Exit Fullscreen' },
  },

  onAdd(this: any, map: L.Map) {
    const container = L.DomUtil.create('div', 'leaflet-control-fullscreen leaflet-bar leaflet-control');
    this.link = L.DomUtil.create('a', 'leaflet-control-fullscreen-button leaflet-bar-part', container);
    this.link.href = '#';
    this._map = map;
    map.on('fullscreenchange', this._toggleTitle, this);
    this._toggleTitle();
    L.DomEvent.on(this.link, 'click', this._click, this);
    return container;
  },

  _click(this: any, e: Event) {
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
    this._map.toggleFullscreen(this.options);
  },

  _toggleTitle(this: any) {
    this.link.title = this.options.title[String(this._map.isFullscreen())];
  },
});

;(L.Map as any).include({
  isFullscreen(this: any) {
    return this._isFullscreen || false;
  },

  toggleFullscreen(this: any, options?: { pseudoFullscreen?: boolean }) {
    const container = this.getContainer();
    if (this.isFullscreen()) {
      if (options?.pseudoFullscreen) {
        this._disablePseudoFullscreen(container);
      } else if (document.exitFullscreen) {
        void document.exitFullscreen();
      } else {
        this._disablePseudoFullscreen(container);
      }
    } else if (options?.pseudoFullscreen) {
      this._enablePseudoFullscreen(container);
    } else if (container.requestFullscreen) {
      void container.requestFullscreen();
    } else {
      this._enablePseudoFullscreen(container);
    }
  },

  _enablePseudoFullscreen(this: any, container: HTMLElement) {
    L.DomUtil.addClass(container, 'leaflet-pseudo-fullscreen');
    this._setFullscreen(true);
    this.fire('fullscreenchange');
  },

  _disablePseudoFullscreen(this: any, container: HTMLElement) {
    L.DomUtil.removeClass(container, 'leaflet-pseudo-fullscreen');
    this._setFullscreen(false);
    this.fire('fullscreenchange');
  },

  _setFullscreen(this: any, fullscreen: boolean) {
    this._isFullscreen = fullscreen;
    const container = this.getContainer();
    if (fullscreen) L.DomUtil.addClass(container, 'leaflet-fullscreen-on');
    else L.DomUtil.removeClass(container, 'leaflet-fullscreen-on');
    this.invalidateSize();
  },

  _onFullscreenChange(this: any) {
    const fullscreenElement =
      document.fullscreenElement || (document as any).webkitFullscreenElement;
    if (fullscreenElement === this.getContainer() && !this._isFullscreen) {
      this._setFullscreen(true);
      this.fire('fullscreenchange');
    } else if (fullscreenElement !== this.getContainer() && this._isFullscreen) {
      this._setFullscreen(false);
      this.fire('fullscreenchange');
    }
  },
});

L.Map.mergeOptions({ fullscreenControl: false });
L.Map.addInitHook(function (this: any) {
  if (this.options.fullscreenControl) {
    this.addControl(
      new FullscreenControl(
        typeof this.options.fullscreenControl === 'object' ? this.options.fullscreenControl : undefined,
      ),
    );
  }

  let fullscreenchange: string | undefined;
  if ('onfullscreenchange' in document) fullscreenchange = 'fullscreenchange';
  else if ('onwebkitfullscreenchange' in document) fullscreenchange = 'webkitfullscreenchange';

  if (fullscreenchange) {
    const onFullscreenChange = L.bind(this._onFullscreenChange, this);
    this.whenReady(() => {
      ;(L.DomEvent as any).on(document, fullscreenchange, onFullscreenChange);
    });
    this.on('unload', () => {
      ;(L.DomEvent as any).off(document, fullscreenchange, onFullscreenChange);
    });
  }
});

/* ---------- Text label layer ---------- */

const MaplabelGroup = (L.LayerGroup as any).extend({
  initialize(this: any, options: MapLabelOptions) {
    ;(L.LayerGroup.prototype as any).initialize.call(this, [], options);
  },

  onAdd(this: any, map: L.Map) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.options.SHEET_ID}/values/A:Z?key=${this.options.API_KEY}`;
    fetch(url)
      .then((res) => res.json())
      .then((sheet: { values?: string[][] }) => {
        for (const marker of this.parse_sheet(sheet)) {
          this.addLayer(marker);
        }
      })
      .catch(() => {
        /* labels optional */
      });

    ;(L.LayerGroup.prototype as any).eachLayer.call(this, map.addLayer, map);

    map.on('zoomanim', (e: L.ZoomAnimEvent) => {
      const scale = map.getZoomScale(e.zoom, 2);
      const labels = document.getElementsByClassName('map-label-container');
      for (const label of Array.from(labels)) {
        const first = label.firstElementChild as HTMLElement | null;
        if (first) first.style.transform = `scale(${scale})`;
        ;(label as HTMLElement).style.transform = 'translate(-50%, -50%)';
      }
    });
  },

  onRemove(this: any, map: L.Map) {
    ;(L.LayerGroup.prototype as any).eachLayer.call(this, map.removeLayer, map);
  },

  parse_sheet(this: any, sheet: { values?: string[][] }) {
    return (sheet.values ?? []).map((row: string[]) =>
      this.create_textlabel(row[0], row[1], row[2], row[3]),
    );
  },

  create_textlabel(this: any, x: string, y: string, _plane: string, description: string) {
    const sub = document.createElement('div');
    sub.appendChild(document.createTextNode(description ?? ''));
    sub.className = 'map-label-sub-container';
    const scale = this._map.getZoomScale(this._map.getZoom(), 2);
    sub.style.transform = `scale(${scale})`;

    const html = document.createElement('div');
    html.className = 'map-label-container';
    html.style.transform = 'translate(-50%, -50%)';
    html.appendChild(sub);

    const divicon = L.divIcon({
      html,
      iconSize: undefined as unknown as L.PointExpression,
      className: 'map-label',
    });

    return L.marker([Number(y), Number(x)], { icon: divicon });
  },
});

export function mapLabelGroup(options: MapLabelOptions): L.LayerGroup {
  return new MaplabelGroup(options) as L.LayerGroup;
}

/** Side-effect import registers controls / hooks. */
export function ensureLeafletExtensions() {
  /* noop — importing this module is enough */
}
