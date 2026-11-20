import { Map, Popup, setWorkerUrl, type MapMouseEvent, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { campusPlaces, type Place } from './catalog';
import { campusData, campusBounds, centers, boundaryFor } from './survey';
import { experimentalLayers, makeStyle, overviewLayerIds, selectableLayers } from './style';
import { overviewBoundary } from './overview';
import type { PlanPoint } from './model';
import { installTrackpadGestures } from './trackpad';
import { campusSurfaces } from './surfaces';
import { detailReadings } from './detail-readings';
export type CampusMode = '2.5d' | '2d' | 'experimental';
const overviewBearing = -22;
const overviewPitch = 32;
const overviewFocusZoom = 18.8;
export type CampusViewport = Awaited<ReturnType<typeof mountCampus>>;
export async function mountCampus(
  host: HTMLDivElement,
  onPick: (place: Place) => void,
  signal: AbortSignal,
  initialMode: CampusMode = '2.5d',
) {
  setWorkerUrl(workerUrl);
  const meshes = campusSurfaces();
  const map = new Map({
    container: host,
    style: makeStyle(),
    center: centers.get('daoshan'),
    zoom: 17,
    pitch: initialMode === '2d' ? 0 : initialMode === 'experimental' ? 42 : overviewPitch,
    bearing: initialMode === 'experimental' ? -18 : overviewBearing,
    maxPitch: initialMode === '2d' ? 0 : 55,
    bearingSnap: 0,
    touchPitch: false,
    minZoom: 15,
    maxZoom: 22,
    attributionControl: false,
    canvasContextAttributes: { antialias: true },
    renderWorldCopies: false,
  });
  map.on('styleimagemissing', (event) => {
    const p = campusPlaces.find((p) => 'place-' + p.id === event.id);
    if (p) map.addImage(event.id, labelImage(p.name));
    else if (event.id.startsWith('street-'))
      map.addImage(event.id, labelImage(event.id.slice(7), true));
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let currentMode = initialMode;
  let experimentalPitch = 42;
  let meshMounted = false;
  meshes.mode(false);
  let disposed = false,
    overview = true,
    active: string | undefined,
    hover: string | undefined;
  const hoverPopup = new Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 14,
    className: 'campus-hover',
  });
  const removeTrackpad = installTrackpadGestures(map, () => {
    overview = false;
    hoverPopup.remove();
  });
  function reset(duration = 600) {
    overview = true;
    const compact = host.clientWidth < 650 || host.clientHeight < 440;
    if (currentMode !== 'experimental') {
      map.fitBounds(campusBounds, {
        bearing: overviewBearing,
        pitch: currentMode === '2d' ? 0 : overviewPitch,
        maxZoom: 18.2,
        padding: compact
          ? { top: 54, bottom: 55, left: 24, right: 24 }
          : { top: 55, bottom: 65, left: 45, right: 85 },
        duration: reduced ? 0 : duration,
      });
      return;
    }
    const camera = map.cameraForBounds(campusBounds, {
      // Replace the asymmetric padding left behind by a focused place.
      absolutePadding: true,
      padding: compact
        ? { top: 42, bottom: 52, left: 22, right: 22 }
        : { top: 65, bottom: 90, left: 58, right: 58 },
      bearing: -18,
      offset: [0, !compact ? -host.clientHeight * 0.06 : 0],
    });
    if (!camera || camera.zoom === undefined) return;
    map.easeTo({
      ...camera,
      zoom: camera.zoom + (!compact ? 0.26 : 0),
      pitch: 42,
      duration: reduced ? 0 : duration,
    });
  }
  function fail() {
    if (!disposed) host.dispatchEvent(new Event('campus-failed'));
  }
  const canvas = map.getCanvas();
  map.on('webglcontextlost', fail);
  canvas.addEventListener('webglcontextlost', fail, true);
  const abort = () => destroy();
  signal.addEventListener('abort', abort, { once: true });
  const resize = new ResizeObserver(() => {
    map.resize();
    if (overview) reset(0);
  });
  await new Promise<void>((resolve, reject) => {
    map.once('error', (e) => {
      reject(e.error);
      destroy();
    });
    map.once('load', () => {
      if (signal.aborted) {
        destroy();
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      resolve();
    });
  });
  // Offline rasterized text is placed by MapLibre's native collision engine, not DOM chips.
  function labelImage(text: string, road = false) {
    const c = document.createElement('canvas'),
      ctx = c.getContext('2d')!;
    c.width = Math.ceil(text.length * (road ? 25 : 27) + 24);
    c.height = 50;
    ctx.font = `${road ? '400' : '600'} 26px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fffdf4';
    ctx.lineWidth = 6;
    ctx.strokeText(text, c.width / 2, 25);
    ctx.fillStyle = road ? '#96937e' : '#465348';
    ctx.fillText(text, c.width / 2, 25);
    return ctx.getImageData(0, 0, c.width, c.height);
  }
  campusPlaces.forEach((p) => {
    if (!map.hasImage('place-' + p.id)) map.addImage('place-' + p.id, labelImage(p.name));
  });
  for (const name of ['书院巷', '人民路', '蔚然大道'])
    if (!map.hasImage('street-' + name)) map.addImage('street-' + name, labelImage(name, true));
  const states = (id: string | undefined, key: 'selected' | 'hover', value: boolean) => {
    if (!id) return;
    campusData.features.forEach((f, index) => {
      if (f.properties.place === id)
        map.setFeatureState({ source: 'survey', id: index }, { [key]: value });
    });
  };
  function pick(e: MapMouseEvent) {
    const hits = map.queryRenderedFeatures(e.point, { layers: selectableLayers });
    const label = hits.find((f) => f.layer.id === 'place-labels');
    const volume = hits.find(
      (f) =>
        ['volumes', 'overview-blocks', 'overview-roofs'].includes(f.layer.id) && f.properties.place,
    );
    const id =
      label?.properties.place ??
      volume?.properties.place ??
      (currentMode === 'experimental' ? meshes.pick(e.point) : undefined) ??
      hits.find((f) => f.properties.place)?.properties.place;
    return campusPlaces.find((p) => p.id === id);
  }
  function setHover(id?: string) {
    if (hover === id) return;
    states(hover, 'hover', false);
    hover = id;
    states(hover, 'hover', true);
    meshes.hover(id);
    map.triggerRepaint();
  }
  function clearHover() {
    canvas.style.cursor = '';
    setHover();
    hoverPopup.remove();
  }
  map.on('click', (e) => {
    const place = pick(e);
    if (place) onPick(place);
  });
  map.on('mousemove', (e) => {
    const place = pick(e);
    if (!place) return clearHover();
    canvas.style.cursor = 'pointer';
    setHover(place.id);
    if (place.id === active) hoverPopup.remove();
    else {
      hoverPopup.setLngLat(e.lngLat).setText(place.name);
      if (!hoverPopup.isOpen()) hoverPopup.addTo(map);
    }
  });
  map.on('mouseout', clearHover);
  map.on('dragstart', () => {
    overview = false;
    hoverPopup.remove();
  });
  for (const event of ['zoomstart', 'rotatestart'] as const) {
    map.on(event, (e) => {
      if ('originalEvent' in e) overview = false;
    });
  }
  const emitCamera = () => {
    host.dataset.zoom = map.getZoom().toFixed(3);
    host.dataset.bearing = map.getBearing().toFixed(2);
    const center = map.getCenter();
    host.dataset.center = `${center.lng.toFixed(8)},${center.lat.toFixed(8)}`;
    host.dataset.pitch = map.getPitch().toFixed(2);
  };
  map.on('move', emitCamera);
  map.on('error', fail);
  resize.observe(host);
  const updateSelection = () => {
    const features = active
      ? currentMode === 'experimental'
        ? boundaryFor(active)
        : overviewBoundary(active)
      : [];
    const base = currentMode === 'experimental' ? '#bf8d55' : '#28654c';
    map.setPaintProperty('selected-ground', 'fill-color', base);
    map.setPaintProperty('selected-edge', 'line-width', currentMode === 'experimental' ? 2 : 2.5);
    map.setPaintProperty(
      'selected-edge',
      'line-color',
      currentMode === 'experimental' ? '#b47e42' : base,
    );
    (map.getSource('selected') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
  };
  function mode(next: CampusMode) {
    map.stop();
    if (currentMode === 'experimental' && next !== currentMode)
      experimentalPitch = Math.max(15, map.getPitch());
    currentMode = next;
    clearHover();
    const experimental = next === 'experimental';
    if (experimental && !meshMounted) {
      try {
        map.addLayer(meshes.layer, 'selected-ground');
        meshMounted = true;
      } catch {
        fail();
        return;
      }
    }
    meshes.mode(experimental);
    const show = (id: string, visible: boolean) =>
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    for (const id of experimentalLayers) show(id, experimental);
    // Remove the inactive building layer from placement while its replacement loads.
    for (const id of overviewLayerIds)
      show(
        id,
        !experimental &&
          (id === 'overview-roofs'
            ? next === '2d'
            : id === 'overview-blocks'
              ? next === '2.5d'
              : true),
      );
    updateSelection();
    const maxPitch = next === '2d' ? 0 : experimental ? 60 : 55;
    if (next !== '2d') map.setMaxPitch(maxPitch);
    map.easeTo({
      pitch: experimental ? experimentalPitch : next === '2d' ? 0 : overviewPitch,
      ...(experimental ? {} : { padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
      duration: reduced ? 0 : 500,
    });
    if (next === '2d') {
      if (reduced) map.setMaxPitch(0);
      else
        map.once('moveend', () => {
          if (currentMode === '2d') map.setMaxPitch(0);
        });
    }
    host.dataset.mode = next;
    emitCamera();
  }
  try {
    mode(initialMode);
    reset(0);
  } catch (error) {
    destroy();
    throw error;
  }
  host.dataset.engine = 'maplibre-survey';
  function destroy() {
    if (disposed) return;
    disposed = true;
    resize.disconnect();
    hoverPopup.remove();
    removeTrackpad();
    signal.removeEventListener('abort', abort);
    canvas.removeEventListener('webglcontextlost', fail, true);
    map.remove();
    delete host.dataset.engine;
  }
  return {
    mode,
    reset: () => reset(),
    zoom: (delta: number) => map.zoomTo(map.getZoom() + delta, { duration: reduced ? 0 : 260 }),
    north: () => map.easeTo({ bearing: 0, duration: reduced ? 0 : 400 }),
    orbit: () =>
      map.easeTo({
        bearing: map.getBearing() + 45,
        pitch: currentMode === 'experimental' ? 48 : currentMode === '2d' ? 0 : overviewPitch,
        duration: reduced ? 0 : 500,
      }),
    focus: (id: string) => {
      const center = centers.get(id);
      if (!center) return;
      overview = false;
      const compact = host.clientWidth <= 700;
      const short = host.clientHeight < 440;
      if (currentMode !== 'experimental') {
        const shapes = overviewBoundary(id);
        const positions = shapes.flatMap(({ geometry }) =>
          geometry.type === 'Polygon' ? geometry.coordinates[0] : [],
        );
        const xs = positions.map(([x]) => x);
        const ys = positions.map(([, y]) => y);
        const bounds: [PlanPoint, PlanPoint] = positions.length
          ? [
              [Math.min(...xs), Math.min(...ys)],
              [Math.max(...xs), Math.max(...ys)],
            ]
          : [
              [center[0] - 0.00003, center[1] - 0.00003],
              [center[0] + 0.00003, center[1] + 0.00003],
            ];
        map.fitBounds(bounds, {
          bearing: map.getBearing(),
          maxZoom: overviewFocusZoom,
          padding:
            !compact || short
              ? {
                  top: short ? 35 : 90,
                  right: Math.min(350, host.clientWidth * 0.52),
                  bottom: short ? 30 : 70,
                  left: 45,
                }
              : { top: 64, right: 30, bottom: Math.min(host.clientHeight * 0.5, 290), left: 30 },
          duration: reduced ? 0 : 650,
        });
        return;
      }
      map.flyTo({
        center,
        zoom: detailReadings[id] ? 19.1 : 18.5,
        bearing: map.getBearing(),
        pitch: 48,
        padding: !compact
          ? { top: 80, right: 350, bottom: 80, left: 45 }
          : { top: 55, right: 30, bottom: Math.min(host.clientHeight * 0.5, 260), left: 30 },
        duration: reduced ? 0 : 700,
      });
    },
    select: (id?: string) => {
      states(active, 'selected', false);
      active = id;
      meshes.select(id);
      states(id, 'selected', true);
      hoverPopup.remove();
      updateSelection();
    },
    filter: (ids: Set<string>) => {
      const list: ['literal', string[]] = ['literal', [...ids]];
      map.setFilter('place-labels', [
        'all',
        ['==', ['get', 'kind'], 'place'],
        ['in', ['get', 'place'], list],
      ]);
    },
    snapshot: () => map.getCanvas(),
    destroy,
  };
}
