(function () {
  "use strict";
  if (!window.L) {
    UI.page.error(
      document.getElementById("mapStatus"),
      { status: 500 },
      function () {
        location.reload();
      },
      "地图组件加载失败",
    );
    return;
  }
  var popupOptions = {
    minWidth: 140,
    maxWidth: 260,
    autoPanPaddingTopLeft: [16, 72],
    autoPanPaddingBottomRight: [72, 16],
  };

  var map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -2,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    maxZoom: 6,
    zoomControl: false,
    attributionControl: false,
    keyboard: false,
    scrollWheelZoom: true,
    dragging: true,
    closePopupOnClick: true,
  });

  L.control
    .zoom({
      position: "bottomright",
      zoomInText: UI.icon("plus"),
      zoomOutText: UI.icon("minus"),
      zoomInTitle: "放大地图",
      zoomOutTitle: "缩小地图",
    })
    .addTo(map);

  map.createPane("labelsPane");
  map.getPane("labelsPane").style.zIndex = 650;
  map.getPane("labelsPane").style.pointerEvents = "none";

  map.on("popupopen", function (e) {
    var el = e.popup.getElement();
    if (!el) {
      return;
    }
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    L.DomEvent.on(el, "click", function (ev) {
      if (ev.target && ev.target.tagName === "A") {
        ev.preventDefault();
      }
      L.DomEvent.stopPropagation(ev);
    });
  });

  var AXIS_Y = 420;
  var RECT_W = 1200;
  var RECT_H = 700;

  var style = null;
  var baseZoom = 1;
  var scalablePaths = [];
  var currentFloor = 1;
  var currentRole = "guest";
  var canEditPopups = false;
  var popupShapes = [];
  var lastEditedName = null;
  var zoomHandlerBound = false;

  var baseLayer = L.layerGroup().addTo(map);
  var floorGroups = {
    1: L.layerGroup(),
    2: L.layerGroup(),
    3: L.layerGroup(),
    4: L.layerGroup(),
  };

  function point(x, y) {
    return [y, x];
  }

  function mirrorY(y) {
    return 2 * AXIS_Y - y;
  }

  function createAreaLabel(text, x1, y1, x2, y2, color, scale) {
    var w = Math.abs(x2 - x1);
    var h = Math.abs(y2 - y1);
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("font-weight", "400");
    var fillColor = color || style.labelColor;
    var textScale = scale || 0.8;

    var chars = text.split("");
    var vertical = h >= w;
    var fontSize;

    if (vertical) {
      fontSize = Math.min(w * textScale, (h / chars.length) * textScale);
      chars.forEach(function (ch, index) {
        var t = document.createElementNS(ns, "text");
        t.setAttribute("x", w / 2);
        t.setAttribute("y", (index + 0.5) * (h / chars.length));
        t.setAttribute("font-size", fontSize);
        t.setAttribute("fill", fillColor);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("dominant-baseline", "central");
        t.setAttribute(
          "font-family",
          "Microsoft YaHei, PingFang SC, sans-serif",
        );
        t.textContent = ch;
        svg.appendChild(t);
      });
    } else {
      fontSize = Math.min((w / chars.length) * textScale, h * textScale);
      var t = document.createElementNS(ns, "text");
      t.setAttribute("x", w / 2);
      t.setAttribute("y", h / 2);
      t.setAttribute("font-size", fontSize);
      t.setAttribute("fill", fillColor);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "central");
      t.setAttribute("font-family", "Microsoft YaHei, PingFang SC, sans-serif");
      t.textContent = text;
      svg.appendChild(t);
    }

    return svg;
  }

  function targetGroups(layers) {
    var out = [];
    layers.forEach(function (l) {
      if (l === "base") {
        out.push(baseLayer);
      } else if (floorGroups[l]) {
        out.push(floorGroups[l]);
      }
    });
    return out;
  }

  function styleOptions(feat) {
    var opts = {
      color: style.outline,
      weight: feat.weight || 1,
      opacity: 1,
      fill: !!feat.fill && feat.cat !== "none",
      fillColor: style.palette[feat.cat] || style.outline,
      fillOpacity: style.fillOpacity,
      stroke: feat.stroke !== false,
    };
    if (feat.type === "polyline") {
      opts.fill = false;
      opts.stroke = true;
    }
    if (feat.dash) {
      opts.dashArray = feat.dash;
    }
    return opts;
  }

  function buildPopupContent(feat) {
    var wrap = document.createElement("div");
    wrap.className = "map-popup";
    var span = document.createElement("div");
    span.className = "map-popup__text";
    span.textContent =
      feat.popup === undefined || feat.popup === null ? "" : String(feat.popup);
    wrap.appendChild(span);
    if (canEditPopups) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--sm map-popup__edit";
      btn.textContent = "编辑";
      L.DomEvent.on(btn, "click", function (ev) {
        L.DomEvent.stop(ev);
        openEditPrompt(feat.name, span);
      });
      wrap.appendChild(btn);
    }
    return wrap;
  }

  async function openEditPrompt(name, spanEl) {
    var input = await UI.prompt({
      title: "修改弹窗内容",
      label: name || "建筑介绍",
      value: spanEl.textContent,
      multiline: true,
      confirmText: "保存",
    });
    if (input === null) return;
    var r = await UI.api("/api/admin/map-popup", {
      method: "PUT",
      body: { name: name, popup: input },
    });
    if (!r.ok) {
      UI.toast.error("修改失败：" + UI.errorText(r));
      return;
    }
    spanEl.textContent = input;
    lastEditedName = name;
    UI.toast.success("已保存");
    await refreshMapData();
  }

  function renderFeature(feat) {
    var groups = targetGroups(feat.layers);

    if (feat.type === "label") {
      groups.forEach(function (g) {
        var clickable = !!feat.popup;
        var overlay = L.svgOverlay(
          createAreaLabel(
            feat.text,
            feat.x1,
            feat.y1,
            feat.x2,
            feat.y2,
            style.labelColor,
            feat.scale,
          ),
          L.latLngBounds(point(feat.x1, feat.y1), point(feat.x2, feat.y2)),
          { pane: "labelsPane", interactive: clickable },
        ).addTo(g);
        var overlayEl = overlay.getElement();
        if (overlayEl) {
          overlayEl.style.pointerEvents = clickable ? "auto" : "none";
          if (clickable) {
            overlayEl.style.cursor = "pointer";
          }
        }
        if (clickable) {
          overlay.bindPopup(buildPopupContent(feat), popupOptions);
        }
      });
      return;
    }

    var pts = feat.points.map(function (p) {
      return point(p[0], p[1]);
    });
    var opts = styleOptions(feat);

    groups.forEach(function (g) {
      var shape =
        feat.type === "polygon" ? L.polygon(pts, opts) : L.polyline(pts, opts);
      if (feat.popup) {
        shape.bindPopup(buildPopupContent(feat), popupOptions);
        shape._popupName = feat.name;
        popupShapes.push(shape);
      }
      shape.addTo(g);
      scalablePaths.push(shape);
    });
  }

  function collectPaths(obj) {
    if (obj instanceof L.Path) {
      if (obj.options.baseWeight === undefined) {
        obj.options.baseWeight = obj.options.weight;
      }
    } else if (obj && typeof obj.eachLayer === "function") {
      obj.eachLayer(function (child) {
        collectPaths(child);
      });
    }
  }

  function updateLineWeights() {
    var factor = Math.pow(2, map.getZoom() - baseZoom);
    factor = Math.min(1, Math.max(0.3, factor));
    scalablePaths.forEach(function (path) {
      var base =
        path.options.baseWeight === undefined
          ? path.options.weight
          : path.options.baseWeight;
      path.setStyle({ weight: Math.max(0.4, base * factor) });
    });
  }

  function setFloor(n) {
    currentFloor = n;
    [1, 2, 3, 4].forEach(function (f) {
      var g = floorGroups[f];
      if (f === n) {
        if (!map.hasLayer(g)) {
          g.addTo(map);
        }
      } else if (map.hasLayer(g)) {
        map.removeLayer(g);
      }
    });
    for (var i = 1; i <= 4; i++) {
      document
        .getElementById("floor" + i + "Btn")
        .setAttribute("aria-pressed", String(i === n));
    }
  }

  function renderMap(data) {
    baseLayer.clearLayers();
    [1, 2, 3, 4].forEach(function (f) {
      floorGroups[f].clearLayers();
    });
    scalablePaths = [];
    popupShapes = [];

    var order = { polygon: 0, polyline: 1, label: 2 };
    var feats = data.features.slice().sort(function (a, b) {
      return (
        (order[a.type] === undefined ? 0 : order[a.type]) -
        (order[b.type] === undefined ? 0 : order[b.type])
      );
    });

    feats.forEach(renderFeature);

    collectPaths(baseLayer);
    [1, 2, 3, 4].forEach(function (f) {
      collectPaths(floorGroups[f]);
    });
    updateLineWeights();
  }

  function build(data) {
    style = data.style;
    AXIS_Y = data.meta.axisY;
    RECT_W = data.meta.rectW;
    RECT_H = data.meta.rectH;
    map.setMinZoom(data.meta.minZoom);
    map.setMaxZoom(data.meta.maxZoom);

    renderMap(data);

    map.invalidateSize();
    map.fitBounds(contentBounds(data), { padding: [16, 16] });
    var savedFloor =
      preferredFloor !== null
        ? preferredFloor
        : parseInt(localStorage.getItem("defaultFloor"), 10);
    currentFloor = savedFloor >= 1 && savedFloor <= 4 ? savedFloor : 1;
    setFloor(currentFloor);
    baseZoom = map.getZoom();
    updateLineWeights();
    map.fire("viewreset");

    if (!zoomHandlerBound) {
      map.on("zoomend", updateLineWeights);
      zoomHandlerBound = true;
    }
  }

  async function refreshMapData() {
    var r = await UI.api("/api/map-data", { auth: false });
    if (!r.ok) {
      UI.toast.error(UI.errorText(r));
      return;
    }
    renderMap(r.data);
    setFloor(currentFloor);
    if (lastEditedName) {
      var shape = popupShapes.find(function (item) {
        return item._popupName === lastEditedName && map.hasLayer(item);
      });
      if (shape) shape.openPopup();
    }
  }
  var preferredFloor = null;
  async function load() {
    var P = UI.page,
      status = P.el("mapStatus"),
      wrap = P.el("mapStatusWrap");
    wrap.hidden = false;
    status.innerHTML =
      '<span class="spinner spinner--lg"></span><span>地图加载中…</span>';
    var fallback = Number(localStorage.getItem("defaultFloor")) || 1;
    preferredFloor = fallback;
    if (UI.session.token()) {
      var responses = await Promise.all([
        UI.api("/api/user/profile", { on401: false }),
        UI.api("/api/me", { on401: false }),
      ]);
      if (responses[0].ok)
        preferredFloor =
          Number(responses[0].data.user.default_floor) || fallback;
      var user = responses[1].ok ? responses[1].data.user : null;
      canEditPopups = !!user && UI.session.can("map_popup_edit", "admin", user);
    }
    var r = await UI.api("/api/map-data", { auth: false });
    if (!r.ok) {
      P.error(status, r, load, "地图加载失败");
      return;
    }
    try {
      build(r.data);
      wrap.hidden = true;
    } catch (err) {
      P.error(status, { status: 500 }, load, "地图数据无法显示");
    }
  }
  function contentBounds(data) {
    var points = [];
    data.features.forEach(function (feat) {
      if (feat.name === "地图边界") return;
      if (feat.points)
        feat.points.forEach(function (p) {
          points.push(point(p[0], p[1]));
        });
      if (feat.type === "label") {
        points.push(point(feat.x1, feat.y1), point(feat.x2, feat.y2));
      }
    });
    return points.length
      ? L.latLngBounds(points)
      : [
          [0, 0],
          [RECT_H, RECT_W],
        ];
  }
  document.getElementById("helpBtn").addEventListener("click", function () {
    var panel = document.getElementById("helpPanel");
    panel.hidden = !panel.hidden;
    this.setAttribute("aria-expanded", String(!panel.hidden));
  });
  window.setFloor = setFloor;
  new ResizeObserver(function () {
    map.invalidateSize();
  }).observe(document.getElementById("map"));
  load();

  document.addEventListener("keydown", function (e) {
    if (
      e.target.closest(
        "input,textarea,select,button,a,[contenteditable],dialog",
      ) ||
      document.querySelector("dialog[open]")
    )
      return;
    var k = e.key.toLowerCase();
    var step = 90;
    var moved = true;

    if (k === "w" || e.key === "ArrowUp") {
      map.panBy([0, -step], { animate: false });
    } else if (k === "s" || e.key === "ArrowDown") {
      map.panBy([0, step], { animate: false });
    } else if (k === "a" || e.key === "ArrowLeft") {
      map.panBy([-step, 0], { animate: false });
    } else if (k === "d" || e.key === "ArrowRight") {
      map.panBy([step, 0], { animate: false });
    } else {
      moved = false;
    }

    if (moved) {
      e.preventDefault();
    }
  });
})();
