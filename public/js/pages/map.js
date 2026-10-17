(function () {
  'use strict';
  var places = window.CampusPlaces;
  var categories = { study: '教学空间', heritage: '人文地标', nature: '校园园林', life: '校园生活', sport: '运动场地', gate: '校园出入口' };
  var $ = function (id) { return document.getElementById(id); };
  var ns = 'http://www.w3.org/2000/svg';
  var selected = null, category = 'all';
  var scene = null, map = null, fitted = true, selectSource = null;
  var bounds = [[-1540, 0], [0, 1000]];
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function svgNode(tag, attrs) {
    var node = document.createElementNS(ns, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }
  function thumbnail(place) {
    var svg = svgNode('svg', { viewBox: '0 0 160 120', 'aria-hidden': 'true' });
    svg.appendChild(svgNode('use', { href: '#art-' + place.icon }));
    return svg;
  }
  function toggleDirectory(open) {
    $('placesPanel').classList.toggle('is-open', open);
    $('placesToggle').setAttribute('aria-expanded', String(open));
  }
  function matchingPlaces() {
    var query = $('placeSearch').value.trim().toLocaleLowerCase();
    return places.filter(function (p) {
      return (category === 'all' || p.category === category) &&
        (!query || (p.name + (p.alias || '') + (p.summary || '') + p.area + categories[p.category]).toLocaleLowerCase().includes(query));
    });
  }
  function renderList() {
    var matches = matchingPlaces();
    $('placesCount').textContent = matches.length + ' 个地点';
    $('placesHeading').textContent = $('placeSearch').value.trim() ? '搜索结果' : category === 'all' ? '探索校园' : categories[category];
    $('clearSearch').hidden = !$('placeSearch').value;
    $('placesEmpty').hidden = matches.length !== 0;
    $('placeList').replaceChildren();
    matches.forEach(function (p) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'campus-place-row';
      button.dataset.place = p.id;
      button.setAttribute('aria-pressed', String(selected === p.id));
      var art = document.createElement('span');
      art.className = 'campus-place-thumb';
      art.appendChild(thumbnail(p));
      var text = document.createElement('span');
      text.className = 'campus-place-text';
      var title = document.createElement('strong');
      title.textContent = p.name;
      var subtitle = document.createElement('span');
      subtitle.textContent = p.summary || p.alias || categories[p.category];
      text.append(title, subtitle);
      var arrow = document.createElement('span');
      arrow.className = 'campus-row-arrow';
      arrow.textContent = '↗';
      arrow.setAttribute('aria-hidden', 'true');
      button.append(art, text, arrow);
      button.addEventListener('click', function () { selectPlace(p, button); });
      $('placeList').appendChild(button);
    });
    if (scene) {
      var ids = new Set(matches.map(function (p) { return p.id; }));
      scene.querySelectorAll('[data-map-place]').forEach(function (node) {
        var matched = ids.has(node.dataset.mapPlace);
        node.classList.toggle('is-muted', !matched);
        node.setAttribute('tabindex', matched ? '0' : '-1');
        node.setAttribute('aria-hidden', String(!matched));
        node.style.pointerEvents = matched ? '' : 'none';
      });
    }
    if (selected && !matches.some(function (p) { return p.id === selected; })) closeDetail(false);
  }
  function selectPlace(p, source) {
    if (!map || !scene) return;
    map.stop();
    selected = p.id;
    selectSource = source;
    $('detailArt').replaceChildren(thumbnail(p));
    $('detailCategory').textContent = categories[p.category] + (p.alias ? ' / ' + p.alias : '');
    $('detailName').textContent = p.name;
    $('detailDescription').replaceChildren();
    p.description.split('\n\n').forEach(function (text) {
      var paragraph = document.createElement('p');
      paragraph.textContent = text;
      $('detailDescription').appendChild(paragraph);
    });
    $('detailSources').replaceChildren();
    (p.sources || []).forEach(function (key) {
      var source = window.CampusSources[key];
      var link = document.createElement('a');
      link.textContent = source.label;
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      $('detailSources').appendChild(link);
    });
    $('detailSources').hidden = !p.sources || !p.sources.length;
    $('detailContent').scrollTop = 0;
    $('placeDetail').hidden = false;
    document.querySelectorAll('.campus-place-row').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.place === selected));
    });
    scene.querySelectorAll('[data-map-place]').forEach(function (node) {
      var active = node.dataset.mapPlace === selected;
      node.classList.toggle('is-selected', active);
      node.setAttribute('aria-pressed', String(active));
    });
    scene.querySelectorAll('[data-map-highlight]').forEach(function (node) { node.classList.toggle('is-selected', node.dataset.mapHighlight === selected); });
    toggleDirectory(false);
    revealPlace(p);
    $('detailName').setAttribute('tabindex', '-1');
    $('detailName').focus({ preventScroll: true });
  }
  function closeDetail(restoreFocus) {
    selected = null;
    $('placeDetail').hidden = true;
    if (scene) {
      scene.querySelectorAll('[data-map-place].is-selected').forEach(function (node) { node.classList.remove('is-selected'); node.setAttribute('aria-pressed', 'false'); });
      scene.querySelectorAll('[data-map-highlight].is-selected').forEach(function (node) { node.classList.remove('is-selected'); });
    }
    document.querySelectorAll('.campus-place-row[aria-pressed="true"]').forEach(function (node) { node.setAttribute('aria-pressed', 'false'); });
    if (restoreFocus && selectSource && selectSource.isConnected && selectSource.getClientRects().length) selectSource.focus({ preventScroll: true });
    else if (restoreFocus) $('guideMap').focus({ preventScroll: true });
  }
  function revealPlace(p) {
    // Preserve scale and context; move only as far as needed to uncover the landmark.
    map.stop();
    var rect = $('guideMap').getBoundingClientRect();
    var regions = [{ left: 24, top: 24, right: rect.width - 24, bottom: rect.height - 30 }];
    [$('placeDetail'), $('guideControls')].forEach(function (element) {
      if (element.hidden) return;
      var box = element.getBoundingClientRect();
      var obstacle = { left: box.left - rect.left - 14, top: box.top - rect.top - 14, right: box.right - rect.left + 14, bottom: box.bottom - rect.top + 14 };
      regions = regions.flatMap(function (r) {
        if (obstacle.right <= r.left || obstacle.left >= r.right || obstacle.bottom <= r.top || obstacle.top >= r.bottom) return [r];
        return [
          { left: r.left, top: r.top, right: r.right, bottom: Math.min(r.bottom, obstacle.top) },
          { left: r.left, top: Math.max(r.top, obstacle.bottom), right: r.right, bottom: r.bottom },
          { left: r.left, top: r.top, right: Math.min(r.right, obstacle.left), bottom: r.bottom },
          { left: Math.max(r.left, obstacle.right), top: r.top, right: r.right, bottom: r.bottom }
        ].filter(function (r) { return r.right - r.left >= 32 && r.bottom - r.top >= 32; });
      });
    });
    var point = map.latLngToContainerPoint([-p.y, p.x]);
    var scale = map.options.crs.scale(map.getZoom());
    var rx = Math.min(72, p.size * scale / 2 + 10);
    var ry = Math.min(80, (p.height || p.size * 0.75) * scale / 2 + 22);
    var candidates = regions.filter(function (r) { return r.right - r.left >= rx * 2 && r.bottom - r.top >= ry * 2; });
    if (!candidates.length) { candidates = regions; rx = ry = 24; }
    var best = null;
    candidates.forEach(function (r) {
      var padX = Math.min(rx, (r.right - r.left) / 2 - 1);
      var padY = Math.min(ry, (r.bottom - r.top) / 2 - 1);
      var x = Math.min(r.right - padX, Math.max(r.left + padX, point.x));
      var y = Math.min(r.bottom - padY, Math.max(r.top + padY, point.y));
      var dx = point.x - x, dy = point.y - y;
      var distance = dx * dx + dy * dy;
      if (!best || distance < best.distance) best = { dx: dx, dy: dy, distance: distance };
    });
    if (best && best.distance > 1) {
      fitted = false;
      map.panBy([best.dx, best.dy], { animate: !reducedMotion.matches, duration: 0.46, easeLinearity: 0.25 });
    }
  }
  function fitCampus() {
    if (!map) return;
    fitted = true;
    map.fitBounds(bounds, { paddingTopLeft: [25, 30], paddingBottomRight: [25, 48], animate: false });
  }
  function bindMapGestures() {
    var container = $('guideMap');
    var frame = null, panX = 0, panY = 0, targetZoom = null, anchor = null;
    var gesture = null, lastPointer = null;

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
    container.addEventListener('pointermove', function (e) { lastPointer = pointer(e); });
    container.addEventListener('wheel', function (e) {
      e.preventDefault();
      // macOS trackpad pinch arrives as Ctrl+wheel in Chromium/Firefox.
      // Safari's GestureEvents take precedence if both event streams arrive.
      if (gesture) return;
      fitted = false;
      map.stop();
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? container.clientHeight : 1;
      var dx = e.deltaX * unit, dy = e.deltaY * unit;
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
    }, { passive: false });
    container.addEventListener('gesturestart', function (e) {
      e.preventDefault();
      flush();
      fitted = false;
      map.stop();
      gesture = { zoom: map.getZoom(), scale: e.scale || 1, anchor: pointer(e) };
    }, { passive: false });
    container.addEventListener('gesturechange', function (e) {
      if (!gesture || !(e.scale > 0)) return;
      e.preventDefault();
      anchor = gesture.anchor;
      targetZoom = clampZoom(gesture.zoom + Math.log2(e.scale / gesture.scale));
      schedule();
    }, { passive: false });
    container.addEventListener('gestureend', function (e) {
      if (!gesture) return;
      e.preventDefault();
      flush();
      gesture = null;
    }, { passive: false });
    // Finish pending trackpad updates before a click, drag or keyboard command.
    container.addEventListener('pointerdown', flush, true);
    document.addEventListener('keydown', flush, true);
    $('guideControls').addEventListener('click', flush, true);
    $('placeList').addEventListener('click', flush, true);
  }
  function renderScene(svg) {
    var layer = svg.querySelector('#atlas-places');
    var highlights = svgNode('g', { id: 'atlas-highlights', 'aria-hidden': 'true', 'pointer-events': 'none' });
    layer.before(highlights);
    places.forEach(function (p) {
      var group = svgNode('g', { transform: 'translate(' + p.x + ' ' + p.y + ')', class: 'campus-map-place', 'data-map-place': p.id, role: 'button', tabindex: '0', 'aria-label': p.name + '，' + categories[p.category], 'aria-pressed': 'false' });
      var height = p.height || p.size * 0.75;
      // Every highlight is below every building, regardless of selection or hover.
      var halo = svgNode('ellipse', { cx: p.x, cy: p.y - 4, rx: p.size * 0.57, ry: height * 0.5, class: 'campus-map-halo', 'data-map-highlight': p.id });
      highlights.appendChild(halo);
      group.appendChild(svgNode('rect', { x: -p.size / 2, y: -height / 2, width: p.size, height: height + 40, fill: 'transparent', rx: 10 }));
      group.appendChild(svgNode('use', { href: '#art-' + p.icon, x: -p.size / 2, y: -height / 2, width: p.size, height: height, 'pointer-events': 'none', preserveAspectRatio: 'none' }));
      var label = svgNode('text', { x: 0, y: p.height ? height / 2 + 18 : height * 0.4 + 14, class: 'campus-map-label', 'text-anchor': 'middle', 'aria-hidden': 'true' });
      label.textContent = p.name;
      group.appendChild(label);
      group.addEventListener('click', function (e) {
        L.DomEvent.stopPropagation(e);
        if (!map.dragging.moved()) selectPlace(p, group);
      });
      group.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectPlace(p, group); }
      });
      group.addEventListener('pointerenter', function () { halo.classList.add('is-hovered'); });
      group.addEventListener('pointerleave', function () { halo.classList.remove('is-hovered'); });
      group.addEventListener('blur', function () { halo.classList.remove('is-focused'); });
      // Bring offscreen keyboard targets into view without stealing focus.
      group.addEventListener('focus', function () {
        if (!group.matches(':focus-visible')) return;
        halo.classList.add('is-focused');
        revealPlace(p);
      });
      layer.appendChild(group);
    });
    return svg;
  }
  async function loadGuide() {
    $('guideStatus').hidden = false;
    $('guideStatus').textContent = '正在展开校园…';
    try {
      if (!window.L) throw new Error('map component unavailable');
      var response = await fetch('/img/map/campus.svg');
      if (!response.ok) throw new Error('map artwork unavailable');
      var doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      if (doc.querySelector('parsererror') || !doc.querySelector('#atlas-places')) throw new Error('invalid artwork');
      scene = renderScene(document.importNode(doc.documentElement, true));
      map = L.map('guideMap', { crs: L.CRS.Simple, minZoom: -3, maxZoom: 1.5, zoomSnap: 0, zoomDelta: 0.4, scrollWheelZoom: false, zoomControl: false, attributionControl: false, keyboard: false });
      L.svgOverlay(scene, bounds, { interactive: true }).addTo(map);
      bindMapGestures();
      function sizeLabels() {
        var fontSize = Math.min(34, Math.max(23, 10.5 / Math.pow(2, map.getZoom())));
        scene.querySelectorAll('.campus-map-label').forEach(function (label) { label.style.fontSize = fontSize + 'px'; });
      }
      fitCampus();
      sizeLabels();
      map.on('zoomend', sizeLabels);
      map.on('dragstart zoomstart', function () { fitted = false; });
      // fitBounds fires zoomstart too; mark automatic resize fits after they finish.
      new ResizeObserver(function () {
        var shouldFit = fitted;
        map.invalidateSize({ pan: false });
        if (shouldFit) { fitCampus(); fitted = true; }
      }).observe($('guideMap'));
      renderList();
      $('guideStatus').hidden = true;
      document.body.dataset.guideReady = 'true';
    } catch (err) {
      $('guideStatus').textContent = '校园导览暂时无法加载';
      var retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = '重新加载';
      retry.addEventListener('click', loadGuide);
      $('guideStatus').appendChild(retry);
    }
  }
  $('placeSearch').addEventListener('input', function () { renderList(); toggleDirectory(true); });
  $('placeSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { var first = matchingPlaces()[0]; if (first) selectPlace(first, $('placeSearch')); }
  });
  $('clearSearch').addEventListener('click', function () { $('placeSearch').value = ''; renderList(); $('placeSearch').focus(); });
  $('resetSearch').addEventListener('click', function () { category = 'all'; $('placeSearch').value = ''; updateCategories(); renderList(); });
  function updateCategories() {
    document.querySelectorAll('[data-category]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.category === category)); });
  }
  document.querySelectorAll('[data-category]').forEach(function (button) {
    button.addEventListener('click', function () { category = button.dataset.category; updateCategories(); renderList(); toggleDirectory(true); });
  });
  $('placesToggle').addEventListener('click', function () { toggleDirectory(this.getAttribute('aria-expanded') !== 'true'); });
  $('closeDetail').addEventListener('click', function () { closeDetail(true); });
  $('guideZoomIn').addEventListener('click', function () { if (map) map.zoomIn(); });
  $('guideZoomOut').addEventListener('click', function () { if (map) map.zoomOut(); });
  $('guideReset').addEventListener('click', function () { closeDetail(false); fitCampus(); fitted = true; });
  $('guideMap').addEventListener('keydown', function (e) {
    if (!map || e.target !== $('guideMap')) return;
    var move = { ArrowUp: [0, -80], ArrowDown: [0, 80], ArrowLeft: [-80, 0], ArrowRight: [80, 0], w: [0, -80], s: [0, 80], a: [-80, 0], d: [80, 0] }[e.key];
    if (move) { fitted = false; map.panBy(move, { animate: false }); }
    else if (e.key === '+' || e.key === '=') map.zoomIn();
    else if (e.key === '-') map.zoomOut();
    else if (e.key === 'Home') { closeDetail(false); fitCampus(); fitted = true; }
    else return;
    e.preventDefault();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (!$('placeDetail').hidden) { closeDetail(true); e.preventDefault(); }
    if ($('placesToggle').getAttribute('aria-expanded') === 'true') { toggleDirectory(false); $('placesToggle').focus(); }
  });
  renderList();
  loadGuide();
})();
