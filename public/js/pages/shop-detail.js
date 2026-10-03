/* 三元坊必吃榜 · 店铺详情（shop.html?id=）
   - GET /api/shops/:id 展示全部必填信息与高德地图位置
   - 缺 id / 不存在 / 加载失败分别给出空态与重试 */
(function () {
  "use strict";
  var page = UI.page;
  var body = page.el("shopBody");
  var paramId = new URLSearchParams(location.search).get("id");
  var meta = null;
  var currentShop = null;
  var currentCanInteract = false;

  function statBlock(icon, value, unit, label) {
    return (
      '<div class="stat-block"><span class="stat-block__num">' + UI.esc(value) + "<small>" + UI.esc(unit) + "</small></span>" +
      '<span class="stat-block__label">' + UI.icon(icon) + UI.esc(label) + "</span></div>"
    );
  }

  function distancePair(meters, minutes, label) {
    var distance = UI.formatDistance(meters) || "—";
    var match = String(distance).match(/^([\d.]+)\s*(.*)$/);
    return statBlock(
      "route",
      match ? match[1] : "—",
      (match && match[2]) || "",
      (label || "步行距离") + " · 步行 " + (UI.formatMinutes(minutes) || "—")
    );
  }

  function ratingText(shop) {
    return shop.rating_avg === null || shop.rating_avg === undefined ? "暂无评分" : Number(shop.rating_avg).toFixed(1);
  }

  function engagementStats(shop) {
    return (
      '<span>' + UI.icon("heart") + '<b>' + UI.esc(shop.likes_count || 0) + '</b><small>点赞</small></span>' +
      '<span>' + UI.icon("message") + '<b>' + UI.esc(shop.reviews_count || 0) + '</b><small>评价</small></span>' +
      '<span>' + UI.icon("star") + '<b>' + UI.esc(ratingText(shop)) + '</b><small>' + UI.esc((shop.ratings_count || 0) + " 次评分") + '</small></span>'
    );
  }

  function hero(shop) {
    return (
      '<article class="card shop-hero">' +
      '<div class="row row--sm u-mb-2"><span class="tag" data-hue="' + ShopsMap.hue(shop.type) + '">' + UI.esc(shop.type) + "</span></div>" +
      '<h1 class="shop-hero__title">' + UI.esc(shop.name) + "</h1>" +
      '<div class="shop-hero__line">' + UI.icon("map-pin") + "<span>" + UI.esc(shop.address) +
      (shop.location_note ? "<small>" + UI.esc(shop.location_note) + "</small>" : "") +
      "</span></div>" +
      '<div class="shop-hero__stats">' +
      distancePair(shop.campus_distance_m, shop.campus_walk_min, "距苏州中学本部") +
      statBlock("compass", UI.formatDistance(shop.metro_distance_m) || "—", "", "距 " + shop.metro_station + " " + shop.metro_exit + " 步行 " + (UI.formatMinutes(shop.metro_walk_min) || "—")) +
      "</div>" +
      '<div class="shop-detail__engagement" id="detailEngagementStats">' + engagementStats(shop) + "</div>" +
      '<div class="row row--sm u-mt-4">' +
      '<a class="btn btn--sm" href="' + UI.esc(ShopsMap.link(shop)) + '" target="_blank" rel="noopener noreferrer">' + UI.icon("external", "icon--sm") + "在高德地图打开</a>" +
      (shop.dianping_url ? '<a class="btn btn--sm" href="' + UI.esc(shop.dianping_url) + '" target="_blank" rel="noopener noreferrer">' + UI.icon("external", "icon--sm") + "大众点评</a>" : "") +
      "</div>" +
      '<p class="u-muted u-fs-xs u-mt-2">距离与步行时间按高德地图步行路线录入（步行距离，非直线距离）' + (shop.created_by ? "，由 " + UI.esc(shop.created_by) + " 添加" : "") + "</p>" +
      "</article>"
    );
  }

  function detail(shop) {
    return (
      hero(shop) +
      '<section class="card" aria-labelledby="mapTitle">' +
      '<div class="shop-section__head"><h2 class="section__title" id="mapTitle">位置与路线</h2></div>' +
      '<div class="shop-map shop-map--detail" id="detailMap" role="region" aria-label="店铺位置地图">' +
      '<div class="shop-map__state u-muted">地图加载中…</div></div>' +
      '<div class="stack stack--sm u-mt-4">' +
      distanceRow("距苏州中学本部", shop.campus_distance_m, shop.campus_walk_min) +
      distanceRow("最近地铁 " + shop.metro_station + " " + shop.metro_exit, shop.metro_distance_m, shop.metro_walk_min) +
      "</div>" +
      "</section>" +
      reviewSection()
    );
  }

  function reviewSection() {
    return (
      '<section class="card shop-review-card" id="reviewsPanel" aria-labelledby="reviewsTitle">' +
      '<div class="shop-section__head"><div><h2 class="section__title" id="reviewsTitle">同学评价</h2><p class="u-muted u-fs-sm" id="reviewSummary" role="status"></p></div></div>' +
      '<div class="shop-review-actions"><button type="button" class="btn btn--sm" id="likeShopButton" hidden></button><span class="u-muted u-fs-sm" id="reviewAccess"></span></div>' +
      '<form class="shop-review-form" id="reviewForm" hidden>' +
      '<fieldset class="shop-rating-fieldset"><legend class="field__label">评分（必选）</legend><div class="shop-rating-choices" role="radiogroup" aria-label="评分 1 到 5 星">' +
      [5, 4, 3, 2, 1].map(function (value) { return '<label class="shop-rating-choice"><input type="radio" name="rating" value="' + value + '"><span aria-hidden="true">★</span><span class="sr-only">' + value + ' 星</span></label>'; }).join("") +
      '</div></fieldset>' +
      '<label class="field__label" for="reviewContent">评价内容 <span class="field__opt">（选填，500 字以内）</span></label>' +
      '<textarea class="input shop-review-textarea" id="reviewContent" maxlength="500" rows="4" placeholder="分享口味、价格或排队情况"></textarea>' +
      '<button type="submit" class="btn btn--primary btn--sm" id="reviewSubmit">提交评价</button>' +
      '</form>' +
      '<div class="review-list" id="reviewList" aria-live="polite"></div>' +
      '</section>'
    );
  }

  function distanceRow(label, meters, minutes) {
    return (
      '<div class="row row--between row--top" style="gap:var(--sp-3)">' +
      '<span class="u-muted u-fs-sm">' + UI.esc(label) + "</span>" +
      '<span class="u-fs-sm">' + UI.esc(UI.formatDistance(meters) || "—") + " · 步行 " + UI.esc(UI.formatMinutes(minutes) || "—") + "</span>" +
      "</div>"
    );
  }

  function renderMap(shop) {
    var box = page.el("detailMap");
    if (!box) return;
    if (!meta || !meta.map || !meta.map.key_configured) {
      if (meta && meta.map && meta.map.static_map_configured) {
        var staticShops = [shop];
        (meta.map.anchors || []).forEach(function (anchor) {
          if (!anchor.configured) return;
          staticShops.push({ id: "anchor-" + anchor.key, name: anchor.name, address: "学校本部", type: "其他", lat: anchor.lat, lng: anchor.lng });
        });
        var staticResult = ShopsMap.renderStatic(box, { center: meta.map.center, area: meta.map.area, shops: staticShops });
        if (!staticResult.ok) {
          box.classList.add("shop-map--fallback");
          box.innerHTML = '<p class="u-muted u-fs-sm" style="margin:0">' + UI.esc(staticResult.message) + "</p>";
        }
      } else {
        box.classList.add("shop-map--fallback");
        box.innerHTML = '<p class="u-muted u-fs-sm" style="margin:0">高德地图底图不可用。可用上方「在高德地图打开」查看位置。</p>';
      }
      return;
    }
    var shops = [shop];
    (meta.map.anchors || []).forEach(function (anchor) {
      if (!anchor.configured) return;
      shops.push({ id: "anchor-" + anchor.key, name: anchor.name, address: "学校本部", type: "其他", lat: anchor.lat, lng: anchor.lng });
    });
    ShopsMap.load(meta.map.js_key, meta.map.security_code)
      .then(function () {
        box.innerHTML = "";
        var result = ShopsMap.render(box, { center: meta.map.center, area: meta.map.area, shops: shops });
        if (!result.ok) {
          box.classList.add("shop-map--fallback");
          box.innerHTML = '<p class="u-muted u-fs-sm" style="margin:0">' + UI.esc(result.message || "地图初始化失败") + "</p>";
        }
      })
      .catch(function () {
        box.classList.add("shop-map--fallback");
        box.innerHTML = '<p class="u-muted u-fs-sm" style="margin:0">高德地图加载失败，可用上方「在高德地图打开」查看位置。</p>';
      });
  }

  function updateEngagement(shop) {
    var stats = page.el("detailEngagementStats");
    if (stats) stats.innerHTML = engagementStats(shop);
    var summary = page.el("reviewSummary");
    if (summary) summary.textContent =
      (shop.likes_count || 0) + " 个赞 · " + (shop.reviews_count || 0) + " 条评价 · " +
      (shop.rating_avg === null || shop.rating_avg === undefined ? "暂无评分" : Number(shop.rating_avg).toFixed(1) + " / 5（" + (shop.ratings_count || 0) + " 次评分）");
    var likeButton = page.el("likeShopButton");
    if (likeButton) {
      likeButton.setAttribute("aria-pressed", shop.user_liked ? "true" : "false");
      likeButton.innerHTML = UI.icon("heart") + (shop.user_liked ? "已点赞" : "点赞") + " · " + UI.esc(shop.likes_count || 0);
    }
  }

  function reviewCard(review) {
    var timestamp = Number(review.updated_at || review.created_at);
    var date = isFinite(timestamp) ? new Date(timestamp * 1000).toLocaleDateString("zh-CN") : "";
    var stars = "★".repeat(Number(review.rating) || 0) + "☆".repeat(5 - (Number(review.rating) || 0));
    return (
      '<article class="shop-review-item">' +
      '<div class="shop-review-item__head"><strong>' + UI.esc(review.author || "同学") + '</strong><span class="shop-review-item__stars" aria-label="' + UI.esc(review.rating) + ' 星">' + stars + '</span><time>' + UI.esc(date) + "</time></div>" +
      '<p class="shop-review-item__content">' + (review.content ? UI.esc(review.content) : '<span class="u-muted">仅评分，未写文字</span>') + "</p>" +
      "</article>"
    );
  }

  function refreshReviews() {
    return UI.api("/api/shops/" + encodeURIComponent(paramId) + "/reviews?limit=50", { on401: false }).then(function (r) {
      if (!r.ok) {
        page.el("reviewList").innerHTML = '<p class="u-muted u-fs-sm">评价暂时无法加载。</p>';
        return;
      }
      page.el("reviewList").innerHTML = (r.data.reviews || []).length
        ? r.data.reviews.map(reviewCard).join("")
        : '<p class="u-muted u-fs-sm">还没有同学评价，认证学生可以写下第一条。</p>';
      var myReview = r.data.my_review;
      if (currentCanInteract && myReview) {
        var rating = page.el("reviewForm").querySelector('input[name="rating"][value="' + Number(myReview.rating) + '"]');
        if (rating) rating.checked = true;
        page.el("reviewContent").value = myReview.content || "";
        page.el("reviewSubmit").textContent = "更新我的评价";
      }
      updateEngagement(currentShop);
    });
  }

  function configureInteractions(shop, canInteract) {
    currentShop = shop;
    currentCanInteract = !!canInteract;
    updateEngagement(shop);
    var likeButton = page.el("likeShopButton");
    var form = page.el("reviewForm");
    var notice = page.el("reviewAccess");
    if (currentCanInteract) {
      likeButton.hidden = false;
      form.hidden = false;
      notice.textContent = "认证学生可点赞；每位学生可提交或更新一条 1–5 星评价。";
    } else {
      likeButton.hidden = true;
      form.hidden = true;
      notice.innerHTML = UI.session.token()
        ? '仅认证学生可点赞或评价。 <a href="student_verify.html">去完成学生认证</a>'
        : '仅认证学生可点赞或评价。 <a href="' + UI.esc(page.loginUrl()) + '">登录后认证</a>';
    }
    likeButton.addEventListener("click", function () {
      if (!currentCanInteract) return;
      likeButton.disabled = true;
      UI.api("/api/shops/" + encodeURIComponent(paramId) + "/like", { method: "POST", body: {} }).then(function (r) {
        if (!r.ok) { UI.toast.error(UI.errorText(r)); return; }
        currentShop = r.data.shop;
        updateEngagement(currentShop);
      }).catch(function () {
        UI.toast.error("点赞失败，请稍后重试");
      }).then(function () { likeButton.disabled = false; });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!currentCanInteract) return;
      var selected = form.querySelector('input[name="rating"]:checked');
      if (!selected) { UI.toast.error("请先选择 1–5 星评分"); return; }
      var submit = page.el("reviewSubmit");
      submit.disabled = true;
      UI.api("/api/shops/" + encodeURIComponent(paramId) + "/reviews", {
        method: "POST",
        body: { rating: Number(selected.value), content: page.el("reviewContent").value.trim() }
      }).then(function (r) {
        if (!r.ok) { UI.toast.error(UI.errorText(r)); return; }
        currentShop = r.data.shop;
        updateEngagement(currentShop);
        UI.toast.success(r.data.message || "评价已提交");
        return refreshReviews();
      }).catch(function () {
        UI.toast.error("评价提交失败，请稍后重试");
      }).then(function () { submit.disabled = false; });
    });
    refreshReviews();
  }

  function load() {
    body.innerHTML = UI.html.skeleton("text", 3);
    return UI.api("/api/shops/" + encodeURIComponent(paramId), { on401: false }).then(function (r) {
      if (!r.ok) {
        if (r.status === 404) {
          body.innerHTML =
            '<div class="card">' +
            UI.html.empty({ icon: "store", title: "店铺不存在或已被删除", desc: "可能链接已失效，去必吃榜看看其他店铺。", actions: [{ label: "返回必吃榜", primary: true, href: "shops.html" }] }) +
            "</div>";
          return;
        }
        page.error(body, r, load, "店铺加载失败");
        return;
      }
      var shop = r.data.shop;
      currentShop = shop;
      document.title = shop.name + " · 三元坊必吃榜 · 校园信息网";
      body.innerHTML = detail(shop);
      configureInteractions(shop, r.data.can_interact || shop.can_interact);
      UI.api("/api/shops/meta", { on401: false }).then(function (m) {
        meta = m.ok ? m.data : null;
        renderMap(shop);
      });
    });
  }

  UI.ready(function () {
    if (!paramId || !/^\d+$/.test(paramId)) {
      body.innerHTML =
        '<div class="card">' +
        UI.html.empty({ icon: "alert-circle", title: "缺少店铺编号", desc: "请从必吃榜列表点击店铺卡片进入。", actions: [{ label: "返回必吃榜", primary: true, href: "shops.html" }] }) +
        "</div>";
      return;
    }
    load();
  });
})();
