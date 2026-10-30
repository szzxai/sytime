import { campusPlaces as places } from './places';
const categories = {
  study: '教学空间',
  heritage: '人文地标',
  nature: '校园园林',
  life: '校园生活',
  sport: '运动场地',
  gate: '校园出入口',
};
export async function createCampusMap(host, onSelect, signal) {
  if (!window.L)
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/leaflet/leaflet.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  if (signal.aborted) return;
  const L = window.L,
    ns = 'http://www.w3.org/2000/svg',
    bounds = [
      [-1540, 0],
      [0, 1000],
    ];
  const $ = (id) => document.getElementById(id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let scene,
    map,
    fitted = true;
  const listeners = [];
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }
  function svgNode(tag, attrs) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }
  function revealPlace(p) {
    // Preserve scale and context; move only as far as needed to uncover the landmark.
    map.stop();
    var rect = $('guideMap').getBoundingClientRect();
    var regions = [{ left: 24, top: 24, right: rect.width - 24, bottom: rect.height - 30 }];
    [$('placeDetail'), $('guideControls')].forEach(function (element) {
      if (element.hidden) return;
      var box = element.getBoundingClientRect();
      var obstacle = {
        left: box.left - rect.left - 14,
        top: box.top - rect.top - 14,
        right: box.right - rect.left + 14,
        bottom: box.bottom - rect.top + 14,
      };
      regions = regions.flatMap(function (r) {
        if (
          obstacle.right <= r.left ||
          obstacle.left >= r.right ||
          obstacle.bottom <= r.top ||
          obstacle.top >= r.bottom
        )
          return [r];
        return [
          { left: r.left, top: r.top, right: r.right, bottom: Math.min(r.bottom, obstacle.top) },
          { left: r.left, top: Math.max(r.top, obstacle.bottom), right: r.right, bottom: r.bottom },
          { left: r.left, top: r.top, right: Math.min(r.right, obstacle.left), bottom: r.bottom },
          { left: Math.max(r.left, obstacle.right), top: r.top, right: r.right, bottom: r.bottom },
        ].filter(function (r) {
          return r.right - r.left >= 32 && r.bottom - r.top >= 32;
        });
      });
    });
    var point = map.latLngToContainerPoint([-p.y, p.x]);
    var scale = map.options.crs.scale(map.getZoom());
    var rx = Math.min(72, (p.size * scale) / 2 + 10);
    var ry = Math.min(80, ((p.height || p.size * 0.75) * scale) / 2 + 22);
    var candidates = regions.filter(function (r) {
      return r.right - r.left >= rx * 2 && r.bottom - r.top >= ry * 2;
    });
    if (!candidates.length) {
      candidates = regions;
      rx = ry = 24;
    }
    var best = null;
    candidates.forEach(function (r) {
      var padX = Math.min(rx, (r.right - r.left) / 2 - 1);
      var padY = Math.min(ry, (r.bottom - r.top) / 2 - 1);
      var x = Math.min(r.right - padX, Math.max(r.left + padX, point.x));
      var y = Math.min(r.bottom - padY, Math.max(r.top + padY, point.y));
      var dx = point.x - x,
        dy = point.y - y;
      var distance = dx * dx + dy * dy;
      if (!best || distance < best.distance) best = { dx: dx, dy: dy, distance: distance };
    });
    if (best && best.distance > 1) {
      fitted = false;
      map.panBy([best.dx, best.dy], {
        animate: !reducedMotion.matches,
        duration: 0.46,
        easeLinearity: 0.25,
      });
    }
  }
  function fitCampus() {
    if (!map) return;
    fitted = true;
    map.fitBounds(bounds, {
      paddingTopLeft: [25, 30],
      paddingBottomRight: [25, 48],
      animate: false,
    });
  }
  function bindMapGestures() {
    var container = host;
    var frame = null,
      panX = 0,
      panY = 0,
      targetZoom = null,
      anchor = null;
    var gesture = null,
      lastPointer = null;

    function clampZoom(zoom) {
      return Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), zoom));
    }
    function flush() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      if (panX || panY) {
        map.panBy([panX, panY], { animate: false });
        panX = panY = 0;
      }
      if (targetZoom !== null) {
        map.setZoomAround(anchor, targetZoom, { animate: false });
        targetZoom = null;
      }
    }
    function schedule() {
      if (frame === null) frame = requestAnimationFrame(flush);
    }
    function pointer(e) {
      if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY) && (e.clientX || e.clientY)) {
        return map.mouseEventToContainerPoint(e);
      }
      return lastPointer || map.getSize().divideBy(2);
    }
    listen(container, 'pointermove', function (e) {
      lastPointer = pointer(e);
    });
    listen(
      container,
      'wheel',
      function (e) {
        e.preventDefault();
        // macOS trackpad pinch arrives as Ctrl+wheel in Chromium/Firefox.
        // Safari's GestureEvents take precedence if both event streams arrive.
        if (gesture) return;
        fitted = false;
        map.stop();
        var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? container.clientHeight : 1;
        var dx = e.deltaX * unit,
          dy = e.deltaY * unit;
        if (e.ctrlKey || e.metaKey) {
          if (panX || panY) flush();
          anchor = pointer(e);
          targetZoom = clampZoom((targetZoom === null ? map.getZoom() : targetZoom) - dy / 240);
        } else {
          if (targetZoom !== null) flush();
          panX += e.shiftKey && !dx ? dy : dx;
          panY += e.shiftKey && !dx ? 0 : dy;
        }
        schedule();
      },
      { passive: false },
    );
    listen(
      container,
      'gesturestart',
      function (e) {
        e.preventDefault();
        flush();
        fitted = false;
        map.stop();
        gesture = { zoom: map.getZoom(), scale: e.scale || 1, anchor: pointer(e) };
      },
      { passive: false },
    );
    listen(
      container,
      'gesturechange',
      function (e) {
        if (!gesture || !(e.scale > 0)) return;
        e.preventDefault();
        anchor = gesture.anchor;
        targetZoom = clampZoom(gesture.zoom + Math.log2(e.scale / gesture.scale));
        schedule();
      },
      { passive: false },
    );
    listen(
      container,
      'gestureend',
      function (e) {
        if (!gesture) return;
        e.preventDefault();
        flush();
        gesture = null;
      },
      { passive: false },
    );
    // Finish pending trackpad updates before a click, drag or keyboard command.
    listen(container, 'pointerdown', flush, true);
    listen(document, 'keydown', flush, true);
    listen($('guideControls'), 'click', flush, true);
    listen($('placeList'), 'click', flush, true);
  }
  function renderScene(svg) {
    var layer = svg.querySelector('#atlas-places');
    var highlights = svgNode('g', {
      id: 'atlas-highlights',
      'aria-hidden': 'true',
      'pointer-events': 'none',
    });
    layer.before(highlights);
    places.forEach(function (p) {
      var group = svgNode('g', {
        transform: 'translate(' + p.x + ' ' + p.y + ')',
        class: 'campus-map-place',
        'data-map-place': p.id,
        role: 'button',
        tabindex: '0',
        'aria-label': p.name + '，' + categories[p.category],
        'aria-pressed': 'false',
      });
      var height = p.height || p.size * 0.75;
      // Every highlight is below every building, regardless of selection or hover.
      var halo = svgNode('ellipse', {
        cx: p.x,
        cy: p.y - 4,
        rx: p.size * 0.57,
        ry: height * 0.5,
        class: 'campus-map-halo',
        'data-map-highlight': p.id,
      });
      highlights.appendChild(halo);
      // The footprint and its text are targets; do not extend over adjacent plots.
      group.appendChild(
        svgNode('rect', {
          x: -p.size / 2,
          y: -height / 2,
          width: p.size,
          height: height,
          fill: 'transparent',
          rx: 4,
        }),
      );
      group.appendChild(
        svgNode('use', {
          href: '#art-' + p.icon,
          x: -p.size / 2,
          y: -height / 2,
          width: p.size,
          height: height,
          'pointer-events': 'none',
          preserveAspectRatio: 'none',
        }),
      );
      var label = svgNode('text', {
        x: p.labelX || 0,
        y: p.labelY == null ? height / 2 + 18 : p.labelY,
        class: 'campus-map-label',
        'data-label-size': p.labelSize || 23,
        'text-anchor': 'middle',
        'aria-hidden': 'true',
      });
      if (p.labelSize) label.style.fontSize = p.labelSize + 'px';
      label.textContent = p.name;
      group.appendChild(label);
      listen(group, 'click', function (e) {
        L.DomEvent.stopPropagation(e);
        if (!map.dragging.moved()) onSelect(p, group);
      });
      listen(group, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect(p, group);
        }
      });
      listen(group, 'pointerenter', function () {
        halo.classList.add('is-hovered');
      });
      listen(group, 'pointerleave', function () {
        halo.classList.remove('is-hovered');
      });
      listen(group, 'blur', function () {
        halo.classList.remove('is-focused');
      });
      // Bring offscreen keyboard targets into view without stealing focus.
      listen(group, 'focus', function () {
        if (!group.matches(':focus-visible')) return;
        halo.classList.add('is-focused');
        revealPlace(p);
      });
      layer.appendChild(group);
    });
    return svg;
  }

  const response = await fetch('/img/map/campus.svg', { signal });
  if (!response.ok) throw new Error('map artwork unavailable');
  const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  if (doc.querySelector('parsererror') || !doc.querySelector('#atlas-places'))
    throw new Error('invalid artwork');
  scene = renderScene(document.importNode(doc.documentElement, true));
  map = L.map(host, {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 1.5,
    zoomSnap: 0,
    zoomDelta: 0.4,
    scrollWheelZoom: false,
    zoomControl: false,
    attributionControl: false,
    keyboard: false,
  });
  L.svgOverlay(scene, bounds, { interactive: true }).addTo(map);
  bindMapGestures();
  fitCampus();
  function sizeLabels() {
    const size = Math.min(34, Math.max(23, 10.5 / Math.pow(2, map.getZoom())));
    scene.querySelectorAll('.campus-map-label').forEach((label) => {
      label.style.fontSize = (size * Number(label.dataset.labelSize)) / 23 + 'px';
    });
  }
  sizeLabels();
  map.on('zoomend', sizeLabels);
  map.on('dragstart zoomstart', () => {
    fitted = false;
  });
  const resize = new ResizeObserver(() => {
    const fit = fitted;
    map.invalidateSize({ pan: false });
    if (fit) fitCampus();
  });
  resize.observe(host);
  return {
    zoom: (delta) => map.setZoom(map.getZoom() + delta),
    fit: fitCampus,
    pan: (move) => {
      fitted = false;
      map.panBy(move, { animate: false });
    },
    reveal: revealPlace,
    selection: (id) => {
      scene.querySelectorAll('[data-map-place]').forEach((node) => {
        const active = node.dataset.mapPlace === id;
        node.classList.toggle('is-selected', active);
        node.setAttribute('aria-pressed', String(active));
      });
      scene
        .querySelectorAll('[data-map-highlight]')
        .forEach((node) => node.classList.toggle('is-selected', node.dataset.mapHighlight === id));
    },
    filter: (ids) =>
      scene.querySelectorAll('[data-map-place]').forEach((node) => {
        const visible = ids.has(node.dataset.mapPlace);
        node.classList.toggle('is-muted', !visible);
        node.setAttribute('tabindex', visible ? '0' : '-1');
        node.setAttribute('aria-hidden', String(!visible));
        node.style.pointerEvents = visible ? '' : 'none';
      }),
    destroy: () => {
      listeners.forEach((fn) => fn());
      resize.disconnect();
      map.remove();
    },
  };
}
