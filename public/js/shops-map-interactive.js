/* Interactive static map: same-origin AMap image proxy, drag/zoom, and screen-space shop clustering. */
(function (global) {
  "use strict";

  var WIDTH = 750;
  var HEIGHT = 420;
  var MIN_ZOOM = 9;
  var MAX_ZOOM = 18;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function pointOf(shop) {
    if (!shop) return null;
    var location = shop.location || shop.coordinates || shop;
    var lat = Number(location.lat != null ? location.lat : location.latitude);
    var lng = Number(location.lng != null ? location.lng : location.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat, lng: lng } : null;
  }

  function worldPixel(point, zoom) {
    var size = 256 * Math.pow(2, zoom);
    var lat = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
    var sin = Math.sin(lat * Math.PI / 180);
    return {
      x: (point.lng + 180) / 360 * size,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size
    };
  }

  function fromWorldPixel(pixel, zoom) {
    var size = 256 * Math.pow(2, zoom);
    var n = Math.PI - 2 * Math.PI * pixel.y / size;
    return {
      lat: 180 / Math.PI * Math.atan(Math.sinh(n)),
      lng: pixel.x / size * 360 - 180
    };
  }

  function polygonPoints(polygon, center, zoom) {
    if (!Array.isArray(polygon)) return "";
    var centerPixel = worldPixel(center, zoom);
    return polygon.map(function (value) {
      var p = Array.isArray(value) ? { lat: Number(value[0]), lng: Number(value[1]) } : pointOf(value);
      if (!p) return "";
      var pixel = worldPixel(p, zoom);
      return (WIDTH / 2 + pixel.x - centerPixel.x).toFixed(1) + "," + (HEIGHT / 2 + pixel.y - centerPixel.y).toFixed(1);
    }).filter(Boolean).join(" ");
  }

  function mapScreenPoint(point, center, zoom) {
    var p = worldPixel(point, zoom);
    var c = worldPixel(center, zoom);
    return { x: WIDTH / 2 + p.x - c.x, y: HEIGHT / 2 + p.y - c.y };
  }

  function makeClusters(shops, center, zoom, viewportWidth) {
    // A seed-based radius keeps clusters local instead of transitively merging a whole district.
    var radius = Math.max(22, 42 * WIDTH / Math.max(1, viewportWidth || WIDTH));
    var cellSize = radius;
    var buckets = new Map();
    var groups = [];
    shops.forEach(function (shop) {
      var point = pointOf(shop);
      if (!point) return;
      var pixel = mapScreenPoint(point, center, zoom);
      if (pixel.x < -radius || pixel.y < -radius || pixel.x > WIDTH + radius || pixel.y > HEIGHT + radius) return;
      var col = Math.floor(pixel.x / cellSize);
      var row = Math.floor(pixel.y / cellSize);
      var candidates = [];
      for (var dx = -1; dx <= 1; dx += 1) {
        for (var dy = -1; dy <= 1; dy += 1) {
          var list = buckets.get((col + dx) + "," + (row + dy));
          if (list) candidates.push.apply(candidates, list);
        }
      }
      var nearest = null, nearestDistance = radius;
      candidates.forEach(function (group) {
        var distance = Math.hypot(pixel.x - group.x, pixel.y - group.y);
        if (distance <= nearestDistance) { nearest = group; nearestDistance = distance; }
      });
      var item = { shop: shop, point: point, x: pixel.x, y: pixel.y };
      if (nearest) {
        nearest.items.push(item);
        nearest.lat += point.lat;
        nearest.lng += point.lng;
      } else {
        nearest = { x: pixel.x, y: pixel.y, seedX: pixel.x, seedY: pixel.y, lat: point.lat, lng: point.lng, items: [item] };
        groups.push(nearest);
        var key = col + "," + row;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(nearest);
      }
    });
    return groups.map(function (group) {
      group.count = group.items.length;
      group.point = { lat: group.lat / group.count, lng: group.lng / group.count };
      // Keep the visual anchor at the seed so neighboring cluster badges stay separated.
      group.x = group.seedX;
      group.y = group.seedY;
      return group;
    });
  }

  function clampView(map, center, zoom) {
    var bounds = map.bounds;
    if (bounds) {
      center = {
        lat: Math.max(bounds.minLat, Math.min(bounds.maxLat, center.lat)),
        lng: Math.max(bounds.minLng, Math.min(bounds.maxLng, center.lng))
      };
    }
    return {
      center: center,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)))
    };
  }

  function mapPointAt(map, screenX, screenY, center, zoom) {
    var rect = map.viewport.getBoundingClientRect();
    var x = screenX * WIDTH / rect.width;
    var y = screenY * HEIGHT / rect.height;
    var middle = worldPixel(center || map.center, zoom == null ? map.zoom : zoom);
    return fromWorldPixel({ x: middle.x + x - WIDTH / 2, y: middle.y + y - HEIGHT / 2 }, zoom == null ? map.zoom : zoom);
  }

  function centerKeepingAnchor(anchor, screenX, screenY, zoom, map) {
    var anchorPixel = worldPixel(anchor, zoom);
    var rect = map.viewport.getBoundingClientRect();
    var x = screenX * WIDTH / rect.width;
    var y = screenY * HEIGHT / rect.height;
    return fromWorldPixel({ x: anchorPixel.x - (x - WIDTH / 2), y: anchorPixel.y - (y - HEIGHT / 2) }, zoom);
  }

  function makeImageUrl(center, zoom) {
    return "/api/shops/map-image?lat=" + encodeURIComponent(center.lat.toFixed(6))
      + "&lng=" + encodeURIComponent(center.lng.toFixed(6)) + "&zoom=" + encodeURIComponent(zoom);
  }

  function drawMarkers(map) {
    var groups = makeClusters(map.shops, map.center, map.zoom, map.viewport.clientWidth);
    var visibleShops = 0;
    map.markerLayer.innerHTML = groups.map(function (group) {
      visibleShops += group.count;
      var left = (group.x / WIDTH * 100).toFixed(4) + "%";
      var top = (group.y / HEIGHT * 100).toFixed(4) + "%";
      if (group.count > 1) {
        return '<button type="button" class="shop-map__cluster" style="left:' + left + ";top:" + top + '"'
          + ' data-map-cluster="1" data-lat="' + group.point.lat.toFixed(6) + '" data-lng="' + group.point.lng.toFixed(6) + '"'
          + ' aria-label="' + group.count + ' 家店铺，点击放大地图" title="' + group.count + ' 家店铺，点击放大地图">'
          + escapeHtml(group.count.toLocaleString("zh-CN")) + "</button>";
      }
      var shop = group.items[0].shop;
      var title = String(shop.name || "店铺");
      var href = shop.id != null ? "shop.html?id=" + encodeURIComponent(shop.id) : "#";
      return '<a class="shop-map__pin" style="left:' + left + ";top:" + top + '" href="' + escapeHtml(href) + '"'
        + ' title="' + escapeHtml(title) + '" aria-label="查看店铺：' + escapeHtml(title) + '"><span></span></a>';
    }).join("");
    map.status.textContent = "显示 " + visibleShops.toLocaleString("zh-CN") + " 家店铺 · " + groups.length.toLocaleString("zh-CN") + " 个标记";
    map.zoomLabel.textContent = "缩放 " + map.zoom;
  }

  function drawPolygon(map) {
    map.polygon.setAttribute("points", polygonPoints(map.polygonSource, map.center, map.zoom));
  }

  function setView(map, center, zoom, force) {
    var next = clampView(map, center, zoom);
    var same = Math.abs(next.center.lat - map.center.lat) < 0.000001
      && Math.abs(next.center.lng - map.center.lng) < 0.000001 && next.zoom === map.zoom;
    if (same && !force) return;
    map.center = next.center;
    map.zoom = next.zoom;
    map.loading.hidden = false;
    map.loading.textContent = "正在载入地图…";
    map.viewport.setAttribute("aria-busy", "true");
    var requestId = ++map.requestId;
    var url = makeImageUrl(map.center, map.zoom);
    var preload = new Image();
    preload.onload = function () {
      if (requestId !== map.requestId) return;
      map.image.src = url;
      map.surface.style.transform = "";
      map.loading.hidden = true;
      map.viewport.setAttribute("aria-busy", "false");
      drawPolygon(map);
      drawMarkers(map);
    };
    preload.onerror = function () {
      if (requestId !== map.requestId) return;
      map.surface.style.transform = "";
      map.loading.hidden = true;
      map.viewport.setAttribute("aria-busy", "false");
      map.status.textContent = "底图暂不可用，仍可缩放查看店铺位置";
      drawPolygon(map);
      drawMarkers(map);
    };
    preload.src = url;
  }

  function setZoomAt(map, zoom, x, y) {
    var nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
    if (nextZoom === map.zoom) return;
    var anchor = mapPointAt(map, x, y, map.center, map.zoom);
    setView(map, centerKeepingAnchor(anchor, x, y, nextZoom, map), nextZoom);
  }

  function createMap(el, config) {
    var center = config.center || { lat: 31.31774845, lng: 120.59797698, zoom: 11 };
    var polygon = config.area && config.area.polygon || [];
    var polygonPointsList = polygon.map(function (point) {
      return Array.isArray(point) ? { lat: Number(point[0]), lng: Number(point[1]) } : pointOf(point);
    }).filter(Boolean);
    var lats = polygonPointsList.map(function (p) { return p.lat; });
    var lngs = polygonPointsList.map(function (p) { return p.lng; });
    var margin = 0.06;
    var map = {
      __staticInteractiveMap: true,
      container: el,
      center: { lat: Number(center.lat), lng: Number(center.lng) },
      zoom: Number(center.zoom || 11),
      initialCenter: { lat: Number(center.lat), lng: Number(center.lng) },
      initialZoom: Number(center.zoom || 11),
      polygonSource: polygonPointsList,
      shops: config.shops || [],
      requestId: 0,
      pointers: new Map(),
      gesture: null,
      wheelTimer: null,
      wheelDelta: 0,
      wheelAnchor: null,
      suppressClick: false,
      bounds: lats.length ? {
        minLat: Math.min.apply(Math, lats) - margin,
        maxLat: Math.max.apply(Math, lats) + margin,
        minLng: Math.min.apply(Math, lngs) - margin,
        maxLng: Math.max.apply(Math, lngs) + margin
      } : null
    };
    el.classList.add("shop-map--static", "shop-map--interactive");
    el.innerHTML = '<div class="shop-static-map shop-static-map--interactive" role="region" aria-label="可拖动和缩放的苏州市姑苏区店铺地图">'
      + '<div class="shop-map__viewport" tabindex="0" aria-label="地图，拖动移动，滚轮或双指缩放" aria-busy="true">'
      + '<div class="shop-map__surface"><img class="shop-static-map__image" alt="" draggable="false">'
      + '<svg class="shop-static-map__area" viewBox="0 0 750 420" preserveAspectRatio="none" aria-hidden="true"><polygon></polygon></svg>'
      + '<div class="shop-map__markers"></div></div>'
      + '<div class="shop-map__loading" role="status">正在载入地图…</div>'
      + '<div class="shop-map__hint">拖动地图 · 滚轮 / 双指缩放</div>'
      + '<div class="shop-map__controls" aria-label="地图控件">'
      + '<button type="button" data-map-action="in" aria-label="放大地图" title="放大">+</button>'
      + '<button type="button" data-map-action="out" aria-label="缩小地图" title="缩小">−</button>'
      + '<button type="button" data-map-action="reset" aria-label="回到姑苏区全域" title="回到全域">⌂</button></div>'
      + '<div class="shop-map__status" aria-live="polite"></div>'
      + '<div class="shop-map__zoom-label" aria-live="polite"></div>'
      + '<div class="shop-map__attribution">© 高德地图</div></div></div>';
    map.viewport = el.querySelector(".shop-map__viewport");
    map.surface = el.querySelector(".shop-map__surface");
    map.image = el.querySelector(".shop-static-map__image");
    map.polygon = el.querySelector(".shop-static-map__area polygon");
    map.markerLayer = el.querySelector(".shop-map__markers");
    map.loading = el.querySelector(".shop-map__loading");
    map.status = el.querySelector(".shop-map__status");
    map.zoomLabel = el.querySelector(".shop-map__zoom-label");

    function position(event) {
      var rect = map.viewport.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function updateGesturePreview() {
      var gesture = map.gesture;
      if (!gesture) return;
      if (gesture.mode === "pan") {
        var p = map.pointers.get(gesture.pointerId);
        if (!p) return;
        var dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) gesture.moved = true;
        map.surface.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
      } else if (gesture.mode === "pinch") {
        var values = Array.from(map.pointers.values());
        if (values.length < 2) return;
        var currentDistance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
        var midX = (values[0].x + values[1].x) / 2, midY = (values[0].y + values[1].y) / 2;
        var scale = Math.max(0.55, Math.min(2.2, currentDistance / gesture.distance));
        var tx = midX - scale * gesture.midX, ty = midY - scale * gesture.midY;
        map.surface.style.transformOrigin = "0 0";
        map.surface.style.transform = "translate3d(" + tx + "px," + ty + "px,0) scale(" + scale + ")";
        gesture.currentMid = { x: midX, y: midY };
        gesture.currentDistance = currentDistance;
        gesture.moved = Math.abs(currentDistance - gesture.distance) > 4 || Math.abs(midX - gesture.midX) + Math.abs(midY - gesture.midY) > 4;
      }
    }
    function beginPinch() {
      var values = Array.from(map.pointers.values());
      if (values.length < 2) return;
      var midX = (values[0].x + values[1].x) / 2, midY = (values[0].y + values[1].y) / 2;
      map.gesture = {
        mode: "pinch", center: { lat: map.center.lat, lng: map.center.lng }, zoom: map.zoom,
        distance: Math.max(1, Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y)),
        midX: midX, midY: midY, currentMid: { x: midX, y: midY }, moved: false,
        anchor: mapPointAt(map, midX, midY, map.center, map.zoom)
      };
      map.viewport.classList.add("is-dragging");
    }

    map.viewport.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || event.target.closest("button,a")) return;
      var p = position(event);
      map.pointers.set(event.pointerId, p);
      if (map.pointers.size === 1) {
        map.gesture = { mode: "pan", pointerId: event.pointerId, start: p, center: { lat: map.center.lat, lng: map.center.lng }, zoom: map.zoom, moved: false };
        map.viewport.classList.add("is-dragging");
      } else if (map.pointers.size === 2) beginPinch();
      if (map.viewport.setPointerCapture) map.viewport.setPointerCapture(event.pointerId);
    });
    map.viewport.addEventListener("pointermove", function (event) {
      if (!map.pointers.has(event.pointerId)) return;
      map.pointers.set(event.pointerId, position(event));
      updateGesturePreview();
      event.preventDefault();
    });
    function finishPointer(event) {
      if (!map.pointers.has(event.pointerId)) return;
      if (map.gesture && map.gesture.mode === "pinch") {
        var gesture = map.gesture;
        var values = Array.from(map.pointers.values());
        var midX = values.length > 1 ? (values[0].x + values[1].x) / 2 : gesture.currentMid.x;
        var midY = values.length > 1 ? (values[0].y + values[1].y) / 2 : gesture.currentMid.y;
        var distance = values.length > 1 ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) : gesture.currentDistance;
        var zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(gesture.zoom + Math.log2(Math.max(0.01, distance / gesture.distance)))));
        var anchorPixel = worldPixel(gesture.anchor, zoom);
        var rect = map.viewport.getBoundingClientRect();
        var target = fromWorldPixel({
          x: anchorPixel.x - (midX * WIDTH / rect.width - WIDTH / 2),
          y: anchorPixel.y - (midY * HEIGHT / rect.height - HEIGHT / 2)
        }, zoom);
        var moved = gesture.moved;
        map.pointers.clear();
        map.gesture = null;
        map.viewport.classList.remove("is-dragging");
        if (moved) {
          map.suppressClick = true;
          setView(map, target, zoom);
          setTimeout(function () { map.suppressClick = false; }, 250);
        } else map.surface.style.transform = "";
        return;
      }
      var gesturePan = map.gesture;
      var current = map.pointers.get(event.pointerId);
      map.pointers.delete(event.pointerId);
      map.gesture = null;
      map.viewport.classList.remove("is-dragging");
      if (gesturePan && gesturePan.mode === "pan" && current) {
        var dx = current.x - gesturePan.start.x, dy = current.y - gesturePan.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          var rect2 = map.viewport.getBoundingClientRect();
          var c = worldPixel(gesturePan.center, gesturePan.zoom);
          var targetCenter = fromWorldPixel({ x: c.x - dx * WIDTH / rect2.width, y: c.y - dy * HEIGHT / rect2.height }, gesturePan.zoom);
          map.suppressClick = true;
          setView(map, targetCenter, gesturePan.zoom);
          setTimeout(function () { map.suppressClick = false; }, 250);
        } else map.surface.style.transform = "";
      }
    }
    map.viewport.addEventListener("pointerup", finishPointer);
    map.viewport.addEventListener("pointercancel", finishPointer);
    map.viewport.addEventListener("wheel", function (event) {
      if (event.target.closest("button,a")) return;
      event.preventDefault();
      var p = position(event);
      var delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      if (event.deltaMode === 2) delta *= map.viewport.clientHeight;
      map.wheelDelta += delta;
      map.wheelAnchor = p;
      clearTimeout(map.wheelTimer);
      map.wheelTimer = setTimeout(function () {
        var steps = Math.max(1, Math.min(3, Math.round(Math.abs(map.wheelDelta) / 180)));
        setZoomAt(map, map.zoom + (map.wheelDelta < 0 ? steps : -steps), map.wheelAnchor.x, map.wheelAnchor.y);
        map.wheelDelta = 0;
        map.wheelTimer = null;
      }, 130);
    }, { passive: false });
    map.viewport.addEventListener("dblclick", function (event) {
      if (event.target.closest("button,a")) return;
      event.preventDefault();
      var p = position(event);
      setZoomAt(map, map.zoom + 1, p.x, p.y);
    });
    map.viewport.addEventListener("click", function (event) {
      if (map.suppressClick) { event.preventDefault(); event.stopPropagation(); return; }
      var cluster = event.target.closest("[data-map-cluster]");
      if (cluster) {
        event.preventDefault();
        var lat = Number(cluster.dataset.lat), lng = Number(cluster.dataset.lng);
        setView(map, { lat: lat, lng: lng }, Math.min(MAX_ZOOM, map.zoom + 2));
      }
    });
    el.addEventListener("click", function (event) {
      var action = event.target.closest("[data-map-action]");
      if (!action) return;
      if (action.dataset.mapAction === "in") setZoomAt(map, map.zoom + 1, map.viewport.clientWidth / 2, map.viewport.clientHeight / 2);
      if (action.dataset.mapAction === "out") setZoomAt(map, map.zoom - 1, map.viewport.clientWidth / 2, map.viewport.clientHeight / 2);
      if (action.dataset.mapAction === "reset") setView(map, map.initialCenter, map.initialZoom);
    });

    map.setShops = function (shops) {
      map.shops = Array.isArray(shops) ? shops : [];
      drawMarkers(map);
    };
    map.setView = function (nextCenter, nextZoom) { setView(map, nextCenter, nextZoom); };
    map.onResize = function () {
      clearTimeout(map.resizeTimer);
      map.resizeTimer = setTimeout(function () { drawMarkers(map); }, 120);
    };
    window.addEventListener("resize", map.onResize);
    map.destroy = function () {
      map.requestId += 1;
      clearTimeout(map.resizeTimer);
      window.removeEventListener("resize", map.onResize);
      map.pointers.clear();
      el.innerHTML = "";
    };
    drawPolygon(map);
    drawMarkers(map);
    setView(map, map.center, map.zoom, true);
    return map;
  }

  global.ShopInteractiveMap = { render: createMap };
})(window);
