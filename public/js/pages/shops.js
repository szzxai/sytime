/* 三元坊必吃榜 · 列表页（shops.html）
   - GET /api/shops（类型筛选 + 排序）、GET /api/shops/meta（类型、地图配置、上传权限）
   - 高德地图标记店铺；未配置 JS key 时降级为列表 + 高德地图外链 */

(function () {
  "use strict";
  var page = UI.page;
  var grid = page.el("shopGrid");
  var mapBox = page.el("shopMap");
  var legendBox = page.el("mapLegend");
  var summary = page.el("shopSummary");
  var live = page.el("shopLive");
  var filterBox = page.el("typeFilter");
  var sortSelect = page.el("sortSelect");
  var loadMore = page.el("loadMore");
  var moreBtn = page.el("moreBtn");
  var moreInfo = page.el("moreInfo");
  var createAction = page.el("createAction");
  var addHint = page.el("addHint");
  var addHintText = page.el("addHintText");
  var addHintActions = page.el("addHintActions");
  var searchInput = page.el("shopSearch");
  var distanceMinInput = page.el("distanceMin");
  var distanceMaxInput = page.el("distanceMax");
  var walkMinInput = page.el("walkMin");
  var walkMaxInput = page.el("walkMax");
  var likesMinInput = page.el("likesMin");
  var likesMaxInput = page.el("likesMax");
  var reviewsMinInput = page.el("reviewsMin");
  var reviewsMaxInput = page.el("reviewsMax");
  var ratingMinInput = page.el("ratingMin");
  var ratingMaxInput = page.el("ratingMax");
  var clearFiltersBtn = page.el("clearShopFilters");

  var PAGE_SIZE = UI.config.pageSize || 20;
  var NAME_COLLATOR;
  try { NAME_COLLATOR = new Intl.Collator("zh-CN-u-co-pinyin", { sensitivity: "base", numeric: true }); }
  catch (err) { NAME_COLLATOR = new Intl.Collator("zh-CN", { sensitivity: "base", numeric: true }); }
  var state = { shops: [], meta: null, type: "", sort: "campus", q: "", distanceMin: "", distanceMax: "", walkMin: "", walkMax: "", likesMin: "", likesMax: "", reviewsMin: "", reviewsMax: "", ratingMin: "", ratingMax: "", shown: 0, map: null, mapFailed: false, requestSeq: 0 };

  function queryNumber(params, key, max) {
    var raw = params.get(key);
    if (raw === null || raw === "") return "";
    var value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= max ? String(value) : "";
  }

  function queryDecimal(params, key, max) {
    var raw = params.get(key);
    if (raw === null || raw === "") return "";
    var value = Number(raw);
    return isFinite(value) && value >= 0 && value <= max ? String(value) : "";
  }

  function readUrl() {
    var params = new URLSearchParams(location.search);
    var type = params.get("type") || "";
    var sort = params.get("sort") || "campus";
    if (sort === "north" || sort === "east") sort = "campus";
    if (["campus", "az", "metro", "likes", "reviews", "rating", "new"].indexOf(sort) === -1) sort = "campus";
    return {
      type: type, sort: sort, q: (params.get("q") || "").slice(0, 80),
      distanceMin: queryNumber(params, "distance_min_m", 50000),
      distanceMax: queryNumber(params, "distance_max_m", 50000),
      walkMin: queryNumber(params, "walk_min", 240),
      walkMax: queryNumber(params, "walk_max", 240),
      likesMin: queryNumber(params, "likes_min", 1000000),
      likesMax: queryNumber(params, "likes_max", 1000000),
      reviewsMin: queryNumber(params, "reviews_min", 1000000),
      reviewsMax: queryNumber(params, "reviews_max", 1000000),
      ratingMin: queryDecimal(params, "rating_min", 5),
      ratingMax: queryDecimal(params, "rating_max", 5)
    };
  }

  function syncUrl() {
    var query = [];
    if (state.type) query.push("type=" + encodeURIComponent(state.type));
    if (state.sort && state.sort !== "campus") query.push("sort=" + encodeURIComponent(state.sort));
    if (state.q) query.push("q=" + encodeURIComponent(state.q));
    if (state.distanceMin) query.push("distance_min_m=" + encodeURIComponent(state.distanceMin));
    if (state.distanceMax) query.push("distance_max_m=" + encodeURIComponent(state.distanceMax));
    if (state.walkMin) query.push("walk_min=" + encodeURIComponent(state.walkMin));
    if (state.walkMax) query.push("walk_max=" + encodeURIComponent(state.walkMax));
    if (state.likesMin) query.push("likes_min=" + encodeURIComponent(state.likesMin));
    if (state.likesMax) query.push("likes_max=" + encodeURIComponent(state.likesMax));
    if (state.reviewsMin) query.push("reviews_min=" + encodeURIComponent(state.reviewsMin));
    if (state.reviewsMax) query.push("reviews_max=" + encodeURIComponent(state.reviewsMax));
    if (state.ratingMin) query.push("rating_min=" + encodeURIComponent(state.ratingMin));
    if (state.ratingMax) query.push("rating_max=" + encodeURIComponent(state.ratingMax));
    history.replaceState(null, "", location.pathname + (query.length ? "?" + query.join("&") : ""));
  }

  function stat(icon, big, small) {
    return (
      '<span class="stat">' + UI.icon(icon) + "<b>" + UI.esc(big) + "</b><small>" + UI.esc(small) + "</small></span>"
    );
  }

  function shopCard(shop) {
    var ratingText = shop.rating_avg === null || shop.rating_avg === undefined
      ? "暂无"
      : Number(shop.rating_avg).toFixed(1) + " / 5";
    return (
      '<article class="card card--interactive shop">' +
      '<div class="shop__top">' +
      '<h2 class="card__title"><a class="card__link" href="shop.html?id=' + encodeURIComponent(shop.id) + '">' + UI.esc(shop.name) + "</a></h2>" +
      '<span class="tag" data-hue="' + ShopsMap.hue(shop.type) + '">' + UI.esc(shop.type) + "</span>" +
      "</div>" +
      '<p class="shop__addr">' + UI.icon("map-pin") + "<span>" + UI.esc(shop.address) +
      (shop.location_note ? "<small>" + UI.esc(shop.location_note) + "</small>" : "") +
      "</span></p>" +
      '<div class="shop__stats">' +
      stat("route", UI.formatDistance(shop.campus_distance_m), "距苏州中学本部 · 步行 " + UI.formatMinutes(shop.campus_walk_min)) +
      "</div>" +
      '<p class="shop__addr">' + UI.icon("compass") + "<span>最近地铁：" + UI.esc(shop.metro_station + " " + shop.metro_exit) +
      "<small>步行 " + UI.esc(UI.formatDistance(shop.metro_distance_m)) + " · " + UI.esc(UI.formatMinutes(shop.metro_walk_min)) + "</small></span></p>" +
      (shop.dianping_url ? '<a class="shop__dianping" href="' + UI.esc(shop.dianping_url) + '" target="_blank" rel="noopener noreferrer">' + UI.icon("external", "icon--sm") + "大众点评</a>" : "") +
      '<div class="shop__engagement" aria-label="店铺互动统计">' +
      '<span>' + UI.icon("heart") + '<b>' + UI.esc(shop.likes_count || 0) + '</b><small>点赞</small></span>' +
      '<span>' + UI.icon("message") + '<b>' + UI.esc(shop.reviews_count || 0) + '</b><small>评价</small></span>' +
      '<span>' + UI.icon("star") + '<b>' + UI.esc(ratingText) + '</b><small>' + UI.esc(shop.ratings_count || 0) + ' 次评分</small></span>' +
      "</div>" +
      "</article>"
    );
  }

  function renderFilters(types, current) {
    var all = ((types && types.all) || []).slice();
    // URL 里的自定义类型即使暂无店铺也保留一个选项，避免筛选状态无法回落
    if (current && all.indexOf(current) === -1) all.push(current);
    var items = [{ value: "", label: "全部" }].concat(
      all.map(function (type) {
        return { value: type, label: type };
      })
    );
    filterBox.innerHTML = items
      .map(function (item) {
        return (
          '<label class="chip"><input class="chip__input" type="radio" name="type" value="' + UI.esc(item.value) + '"' +
          (item.value === current ? " checked" : "") +
          '><span class="chip__face">' + UI.esc(item.label) + "</span></label>"
        );
      })
      .join("");
  }

  function renderCreate(meta) {
    var can = !!(meta && meta.can_create);
    createAction.innerHTML = can
      ? '<a class="btn btn--primary" href="shop-new.html">' + UI.icon("plus", "icon--sm") + "添加店铺</a>"
      : "";
    if (!can && UI.session.token() && meta) {
      addHint.hidden = false;
      addHintText.textContent =
        "添加店铺需要「" + (UI.ROLE_LABELS[meta.create_min_role] || meta.create_min_role) + "」及以上权限，当前账号暂无此权限。";
      addHintActions.textContent = "";
    } else {
      addHint.hidden = true;
    }
  }

  function renderLegend(shops) {
    var seen = [];
    var items = [];
    shops.forEach(function (shop) {
      if (seen.indexOf(shop.type) !== -1) return;
      seen.push(shop.type);
      items.push(shop.type);
    });
    if (items.length < 2) {
      legendBox.hidden = true;
      legendBox.innerHTML = "";
      return;
    }
    legendBox.hidden = false;
    legendBox.innerHTML = items
      .map(function (type) {
        return (
          '<span class="shop-map-legend__item"><span class="shop-map-legend__dot" style="background:' +
          ShopsMap.colorForType(type) + '"></span>' + UI.esc(type) + "</span>"
        );
      })
      .join("");
  }

  function mapNotice(message) {
    mapBox.classList.add("shop-map--fallback");
    mapBox.innerHTML = '<p class="u-muted u-fs-sm" style="margin:0">' + UI.esc(message) + "</p>";
    legendBox.hidden = true;
  }

  function renderMap() {
    var meta = state.meta;
    if (!meta) return;
    var config = {
      center: meta.map.center,
      area: meta.map.area,
      shops: state.shops
    };
    if (meta.map.static_map_configured && window.ShopInteractiveMap) {
      var interactiveResult = ShopsMap.renderStatic(mapBox, config);
      if (!interactiveResult.ok) mapNotice(interactiveResult.message || "交互地图初始化失败");
      else { state.map = interactiveResult.map; renderLegend(state.shops); }
      return;
    }
    if (!meta.map.key_configured) {
      if (meta.map.static_map_configured) {
        var staticResult = ShopsMap.renderStatic(mapBox, config);
        if (!staticResult.ok) mapNotice(staticResult.message || "静态地图初始化失败");
        else { state.map = staticResult.map || null; renderLegend(state.shops); }
        return;
      }
      mapNotice("高德地图未启用：请配置高德地图服务 Key。下方列表仍可正常浏览。");
      return;
    }
    if (state.mapFailed) return;
    mapBox.classList.remove("shop-map--fallback");
    ShopsMap.load(meta.map.js_key, meta.map.security_code)
      .then(function () {
        var result;
        mapBox.innerHTML = "";
        result = ShopsMap.render(mapBox, config);
        if (!result.ok) {
          state.mapFailed = true;
          mapNotice(result.message || "地图初始化失败，可在下方列表浏览店铺。");
          return;
        }
        state.map = result.map;
        renderLegend(state.shops);
      })
      .catch(function () {
        state.mapFailed = true;
        mapNotice("高德地图加载失败（请检查网络、JS Key 白名单和安全密钥配置）。下方列表仍可正常浏览。");
      });
  }

  function updateMap() {
    var meta = state.meta;
    if (!meta) return;
    if (state.map && state.map.__staticInteractiveMap) {
      ShopsMap.update(state.map, state.shops, { area: meta.map.area });
      renderLegend(state.shops);
      return;
    }
    if (meta.map.static_map_configured && window.ShopInteractiveMap) {
      renderMap();
      return;
    }
    if (!meta.map.key_configured) {
      renderMap();
      return;
    }
    if (state.map) {
      ShopsMap.update(state.map, state.shops, { area: meta.map.area });
      renderLegend(state.shops);
      return;
    }
    renderMap();
  }

  function renderList() {
    var total = state.shops.length;
    state.shown = Math.min(total, PAGE_SIZE);
    if (!total) {
      var hasSearchFilters = !!(state.q || state.distanceMin || state.distanceMax || state.walkMin || state.walkMax || state.likesMin || state.likesMax || state.reviewsMin || state.reviewsMax || state.ratingMin || state.ratingMax);
      if (state.type || hasSearchFilters) {
        grid.innerHTML = UI.html.empty({
          icon: "filter",
          title: state.type ? "没有「" + state.type + "」类的店铺" : "没有符合筛选条件的店铺",
          desc: "调整关键词、距离或步行时间范围后重试。",
          actions: [{ label: "清除筛选", id: "resetFilter" }]
        });
      } else {
        grid.innerHTML = UI.html.empty({
          icon: "store",
          title: "三元坊还没有店铺",
          desc: "第一个推荐周边美食的人就是你。",
          actions: state.meta && state.meta.can_create ? [{ label: "添加店铺", href: "shop-new.html", primary: true, icon: "plus" }] : []
        });
      }
    } else {
      grid.innerHTML = state.shops.slice(0, state.shown).map(shopCard).join("");
    }
    summary.textContent = total
      ? "共 " + total + " 家店铺" + (state.type ? "（" + state.type + "）" : "") + "，已显示 " + state.shown + " 家"
      : "";
    live.textContent = total ? "已加载 " + total + " 家店铺" + (state.type ? "，分类 " + state.type : "") : "没有符合条件的店铺";
    loadMore.hidden = total <= state.shown;
    moreInfo.textContent = total > state.shown ? "已显示 " + state.shown + " / " + total : "";
  }

  function load() {
    var requestId = ++state.requestSeq;
    grid.innerHTML = UI.html.skeleton("card", 6);
    var params = new URLSearchParams();
    params.set("sort", state.sort === "az" ? "campus" : state.sort);
    if (state.type) params.set("type", state.type);
    if (state.q) params.set("q", state.q);
    if (state.distanceMin) params.set("distance_min_m", state.distanceMin);
    if (state.distanceMax) params.set("distance_max_m", state.distanceMax);
    if (state.walkMin) params.set("walk_min", state.walkMin);
    if (state.walkMax) params.set("walk_max", state.walkMax);
    if (state.likesMin) params.set("likes_min", state.likesMin);
    if (state.likesMax) params.set("likes_max", state.likesMax);
    if (state.reviewsMin) params.set("reviews_min", state.reviewsMin);
    if (state.reviewsMax) params.set("reviews_max", state.reviewsMax);
    if (state.ratingMin) params.set("rating_min", state.ratingMin);
    if (state.ratingMax) params.set("rating_max", state.ratingMax);
    var query = "/api/shops?" + params.toString();
    return Promise.all([
      UI.api(query, { on401: false }),
      UI.api("/api/shops/meta", { on401: false })
    ]).then(function (results) {
      if (requestId !== state.requestSeq) return;
      var listResult = results[0];
      var metaResult = results[1];
      if (!listResult.ok) {
        page.error(grid, listResult, load, "店铺列表加载失败");
        summary.textContent = "";
        return;
      }
      state.shops = listResult.data.shops || [];
      if (state.sort === "az") state.shops.sort(function (a, b) { return NAME_COLLATOR.compare(a.name, b.name) || a.id - b.id; });
      state.meta = metaResult.ok
        ? metaResult.data
        : { types: listResult.data.types, can_create: !!listResult.data.can_create, create_min_role: listResult.data.create_min_role, area: listResult.data.area, map: { key_configured: false, static_map_configured: false, js_key: "", security_code: "" } };
      var validTypes = (state.meta.types && state.meta.types.all) || [];
      if (state.type && validTypes.indexOf(state.type) === -1) {
        state.type = "";
        syncUrl();
        return load();
      }
      renderFilters(state.meta.types, state.type);
      page.el("areaText").textContent = "覆盖范围：" + (state.meta.area && state.meta.area.text ? state.meta.area.text : "三元坊周边");
      renderCreate(state.meta);
      renderList();
      updateMap();
    });
  }

  function readSearchControls() {
    state.q = searchInput.value.trim().slice(0, 80);
    state.distanceMin = distanceMinInput.value.trim();
    state.distanceMax = distanceMaxInput.value.trim();
    state.walkMin = walkMinInput.value.trim();
    state.walkMax = walkMaxInput.value.trim();
    state.likesMin = likesMinInput.value.trim();
    state.likesMax = likesMaxInput.value.trim();
    state.reviewsMin = reviewsMinInput.value.trim();
    state.reviewsMax = reviewsMaxInput.value.trim();
    state.ratingMin = ratingMinInput.value.trim();
    state.ratingMax = ratingMaxInput.value.trim();
    syncUrl();
    load();
  }
  var debouncedSearch = UI.debounce(readSearchControls, 250);
  searchInput.addEventListener("input", debouncedSearch);
  var debouncedRangeSearch = UI.debounce(readSearchControls, 200);
  [distanceMinInput, distanceMaxInput, walkMinInput, walkMaxInput, likesMinInput, likesMaxInput, reviewsMinInput, reviewsMaxInput, ratingMinInput, ratingMaxInput].forEach(function (input) {
    input.addEventListener("input", debouncedRangeSearch);
    input.addEventListener("change", readSearchControls);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); readSearchControls(); } });
  });
  function clearAllFilters() {
    state.type = "";
    state.q = "";
    state.distanceMin = "";
    state.distanceMax = "";
    state.walkMin = "";
    state.walkMax = "";
    state.likesMin = "";
    state.likesMax = "";
    state.reviewsMin = "";
    state.reviewsMax = "";
    state.ratingMin = "";
    state.ratingMax = "";
    state.sort = "campus";
    filterBox.querySelectorAll('input[name="type"]').forEach(function (input) { input.checked = input.value === ""; });
    sortSelect.value = "campus";
    searchInput.value = "";
    distanceMinInput.value = "";
    distanceMaxInput.value = "";
    walkMinInput.value = "";
    walkMaxInput.value = "";
    likesMinInput.value = "";
    likesMaxInput.value = "";
    reviewsMinInput.value = "";
    reviewsMaxInput.value = "";
    ratingMinInput.value = "";
    ratingMaxInput.value = "";
    syncUrl();
    load();
  }
  clearFiltersBtn.addEventListener("click", clearAllFilters);
  filterBox.addEventListener("change", function (e) {
    if (!e.target || e.target.name !== "type") return;
    state.type = e.target.value;
    syncUrl();
    load();
  });
  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value;
    syncUrl();
    load();
  });
  moreBtn.addEventListener("click", function () {
    state.shown = Math.min(state.shops.length, state.shown + PAGE_SIZE);
    renderList();
  });
  grid.addEventListener("click", function (e) {
    var reset = e.target.closest && e.target.closest("#resetFilter");
    if (!reset) return;
    clearAllFilters();
  });
  // 高德信息窗里的详情链接
  mapBox.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest("a[data-shop-link]");
    if (link) location.href = link.getAttribute("href");
  });

  var initial = readUrl();
  state.type = initial.type;
  state.sort = initial.sort;
  state.q = initial.q;
  state.distanceMin = initial.distanceMin;
  state.distanceMax = initial.distanceMax;
  state.walkMin = initial.walkMin;
  state.walkMax = initial.walkMax;
  state.likesMin = initial.likesMin;
  state.likesMax = initial.likesMax;
  state.reviewsMin = initial.reviewsMin;
  state.reviewsMax = initial.reviewsMax;
  state.ratingMin = initial.ratingMin;
  state.ratingMax = initial.ratingMax;
  sortSelect.value = initial.sort;
  searchInput.value = state.q;
  distanceMinInput.value = state.distanceMin;
  distanceMaxInput.value = state.distanceMax;
  walkMinInput.value = state.walkMin;
  walkMaxInput.value = state.walkMax;
  likesMinInput.value = state.likesMin;
  likesMaxInput.value = state.likesMax;
  reviewsMinInput.value = state.reviewsMin;
  reviewsMaxInput.value = state.reviewsMax;
  ratingMinInput.value = state.ratingMin;
  ratingMaxInput.value = state.ratingMax;
  UI.ready(function () {
    load();
  });
})();
