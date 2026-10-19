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
  var currentMyReview = null;
  var reviewImageState = { existingUrl: "", removed: false };

  function formatMoney(n) {
    return "¥" + (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2));
  }

  function updatePerPersonPreview() {
    var box = page.el("reviewPerPerson");
    if (!box) return;
    var guests = Number(page.el("reviewGuests").value);
    var total = Number(page.el("reviewTotalPrice").value);
    if (guests >= 1 && isFinite(total) && page.el("reviewTotalPrice").value !== "") {
      box.textContent = "人均约 " + formatMoney(Math.round((total / guests) * 100) / 100) + "（" + guests + " 人 · 合计 " + formatMoney(total) + "）";
      box.hidden = false;
    } else {
      box.hidden = true;
      box.textContent = "";
    }
  }

  function renderExistingReviewImage() {
    var slot = UI.qs("#reviewUploadField .upload-preview-slot");
    if (!slot) return;
    var url = reviewImageState.removed ? "" : UI.safeUrl(reviewImageState.existingUrl);
    if (!url) { slot.innerHTML = ""; return; }
    slot.innerHTML = '<div class="upload-preview"><img class="upload-preview__img" alt="" src="' + UI.esc(url) + '">' +
      '<div class="upload-preview__meta"><div class="upload-preview__name">当前评价配图</div>' +
      '<div class="upload-preview__size">更换可重新选择，移除后提交将删除原图</div></div>' +
      '<button type="button" class="icon-btn icon-btn--sm" aria-label="移除当前配图" data-remove-existing-image>' + UI.icon("close") + '</button></div>' +
      '<button type="button" class="btn btn--danger-quiet btn--sm" data-remove-existing-image>' + UI.icon("trash", "icon--sm") + "移除配图</button>";
  }

  function syncUploadVisibility() {
    var field = page.el("reviewUploadField");
    if (!field) return;
    var on = page.el("reviewHasImage").checked;
    field.hidden = !on;
    if (on && !reviewImageState.removed && reviewImageState.existingUrl) renderExistingReviewImage();
    if (!on) {
      UI.upload.clear(field);
      slotIfNew(field);
    }
  }
  // 未选新图时恢复旧图预览（被 UI.upload 渲染覆盖后）
  function slotIfNew(field) {
    var slot = field.querySelector(".upload-preview-slot");
    if (slot && !slot.children.length && !reviewImageState.removed && reviewImageState.existingUrl) renderExistingReviewImage();
  }

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
      '<div class="row row--between row--top">' +
      '<div class="grow">' +
      '<div class="row row--sm u-mb-2"><span class="tag" data-hue="' + ShopsMap.hue(shop.type) + '">' + UI.esc(shop.type) + "</span></div>" +
      '<h1 class="shop-hero__title">' + UI.esc(shop.name) + "</h1>" +
      "</div>" +
      '<div class="segmented" role="group" aria-label="店铺详情页布局" id="layoutSwitch">' +
      '<button type="button" class="segmented__item" data-layout="stacked" aria-pressed="true">' + UI.icon("rows", "icon--sm") + "纵向</button>" +
      '<button type="button" class="segmented__item" data-layout="split" aria-pressed="false">' + UI.icon("columns", "icon--sm") + "双栏</button>" +
      "</div>" +
      "</div>" +
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

  function mapCard(shop) {
    return (
      '<section class="card" aria-labelledby="mapTitle">' +
      '<div class="shop-section__head"><h2 class="section__title" id="mapTitle">位置与路线</h2></div>' +
      '<div class="shop-map shop-map--detail" id="detailMap" role="region" aria-label="店铺位置地图">' +
      '<div class="shop-map__state u-muted">地图加载中…</div></div>' +
      '<div class="stack stack--sm u-mt-4">' +
      distanceRow("距苏州中学本部", shop.campus_distance_m, shop.campus_walk_min) +
      distanceRow("最近地铁 " + shop.metro_station + " " + shop.metro_exit, shop.metro_distance_m, shop.metro_walk_min) +
      "</div>" +
      "</section>"
    );
  }

  function subnav() {
    return (
      '<nav class="subnav" id="shopSubnav" aria-label="店铺分区">' +
      '<div class="tabs" role="tablist" aria-label="内容分区">' +
      '<button type="button" class="tab" role="tab" data-target="shopDishes" aria-selected="true">菜品<span class="tab__count" id="dishTabCount">0</span></button>' +
      '<button type="button" class="tab" role="tab" data-target="reviewsPanel" aria-selected="false">评价<span class="tab__count" id="reviewTabCount">0</span></button>' +
      "</div></nav>"
    );
  }

  function dishesSection() {
    return (
      '<section class="card shop-section shop-col--sticky" id="shopDishes" aria-labelledby="dishesTitle">' +
      '<div class="shop-section__head"><h2 class="section__title" id="dishesTitle">菜品</h2></div>' +
      UI.html.empty({ icon: "utensils", title: "这家店还没有菜品", desc: "暂无菜品信息。", compact: true }) +
      "</section>"
    );
  }

  function detail(shop) {
    return (
      hero(shop) +
      mapCard(shop) +
      subnav() +
      '<div class="shop-layout" id="shopLayout">' +
      dishesSection() +
      reviewSection() +
      "</div>"
    );
  }

  function reviewSection() {
    return (
      '<section class="card shop-review-card shop-section" id="reviewsPanel" aria-labelledby="reviewsTitle">' +
      '<div class="shop-section__head"><div><h2 class="section__title" id="reviewsTitle">同学评价</h2><p class="u-muted u-fs-sm" id="reviewSummary" role="status"></p></div></div>' +
      '<div class="shop-review-actions"><button type="button" class="btn btn--sm" id="likeShopButton" hidden></button><span class="u-muted u-fs-sm" id="reviewAccess"></span></div>' +
      '<form class="shop-review-form" id="reviewForm" hidden>' +
      '<fieldset class="shop-rating-fieldset"><legend class="field__label">评分（必选）</legend><div class="shop-rating-choices" role="radiogroup" aria-label="评分 1 到 5 星">' +
      [5, 4, 3, 2, 1].map(function (value) { return '<input class="shop-rating-input" type="radio" name="rating" id="shopRating' + value + '" value="' + value + '"><label class="shop-rating-choice" for="shopRating' + value + '"><span class="sr-only">' + value + ' 星</span><span aria-hidden="true">★</span></label>'; }).join("") +
      '</div></fieldset>' +
      '<label class="field__label" for="reviewContent">评价内容 <span class="field__opt">（选填，500 字以内）</span></label>' +
      '<textarea class="input shop-review-textarea" id="reviewContent" maxlength="500" rows="4" placeholder="分享口味、价格或排队情况"></textarea>' +
      '<div class="shop-review-numbers">' +
      '<label class="field shop-review-numbers__field" for="reviewGuests"><span class="field__label">就餐人数 <span class="field__opt">（选填）</span></span>' +
      '<input class="input" type="number" id="reviewGuests" min="1" max="99" step="1" inputmode="numeric" placeholder="例如 3"></label>' +
      '<label class="field shop-review-numbers__field" for="reviewTotalPrice"><span class="field__label">总价（元） <span class="field__opt">（选填）</span></span>' +
      '<input class="input" type="number" id="reviewTotalPrice" min="0" max="100000" step="0.01" inputmode="decimal" placeholder="例如 128"></label>' +
      '<p class="shop-review-perperson" id="reviewPerPerson" role="status" hidden></p>' +
      '</div>' +
      '<label class="check-row" for="reviewHasImage">' +
      '<input class="check" type="checkbox" id="reviewHasImage">' +
      '<span class="check-row__text"><span class="check-row__title">评价带图</span><span class="check-row__desc">选填一张实拍照片（JPG / PNG，不超过 2 MB）</span></span>' +
      '</label>' +
      '<div class="field shop-review-upload" id="reviewUploadField" data-upload data-max-mb="2" data-types="image/jpeg,image/png" hidden>' +
      '<label class="upload"><span class="upload__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="/img/icons.svg#i-image"></use></svg></span>' +
      '<span class="upload__title">点击选择或拖入图片</span><span class="upload__hint">JPG / PNG，不超过 2 MB</span>' +
      '<input aria-label="上传评价配图" type="file" accept="image/jpeg,image/png"></label>' +
      '<div class="upload-preview-slot"></div>' +
      '</div>' +
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
    var reviewTab = page.el("reviewTabCount");
    if (reviewTab) reviewTab.textContent = String(shop.reviews_count || 0);
  }

  var LAYOUTS = ["stacked", "split"];
  function setLayoutMode(mode, persist) {
    var split = mode === "split";
    var layout = page.el("shopLayout");
    if (layout) layout.classList.toggle("shop-layout--split", split);
    body.classList.toggle("shop-wrap--split", split);
    var sw = page.el("layoutSwitch");
    if (sw) {
      UI.qsa("[data-layout]", sw).forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-layout") === mode ? "true" : "false");
      });
    }
    try { localStorage.setItem("shopLayout", mode); } catch (e) { /* ignore */ }
    if (persist && UI.session.token()) {
      UI.api("/api/user/settings", { method: "PUT", body: { shop_layout: mode }, on401: false });
    }
  }
  function wireLayout() {
    var sw = page.el("layoutSwitch");
    if (sw) {
      sw.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-layout]");
        if (!btn) return;
        var mode = btn.getAttribute("data-layout");
        if (mode === "split" && window.innerWidth < 900)
          UI.toast.info("屏幕较窄，已使用纵向布局");
        setLayoutMode(mode, true);
      });
    }
    var sub = page.el("shopSubnav");
    if (sub) UI.scrollSpy(sub, [page.el("shopDishes"), page.el("reviewsPanel")]);
    function localMode() {
      var stored = localStorage.getItem("shopLayout");
      return LAYOUTS.indexOf(stored) !== -1
        ? stored
        : window.innerWidth >= 900
          ? "split"
          : "stacked";
    }
    if (UI.session.token()) {
      UI.api("/api/user/profile", { on401: false }).then(function (r) {
        var account = r.ok && r.data.user ? r.data.user.shop_layout : null;
        setLayoutMode(LAYOUTS.indexOf(account) !== -1 ? account : localMode(), false);
      });
    } else {
      setLayoutMode(localMode(), false);
    }
  }

  function priceLine(review) {
    var guests = review.guests === null || review.guests === undefined ? null : Number(review.guests);
    var per = review.per_person;
    if (!guests && (per === null || per === undefined)) return "";
    return '<p class="shop-review-item__price">' + UI.icon("coins", "icon--sm") +
      (guests ? "" + UI.esc(guests) + " 人" : "") +
      (per !== null && per !== undefined ? (guests ? " · " : "") + "人均 ¥" + UI.esc(Number(per).toFixed(2).replace(/\.00$/, "")) : "") +
      "</p>";
  }

  function reviewCard(review, isMine) {
    var timestamp = Number(review.updated_at || review.created_at);
    var date = isFinite(timestamp) ? new Date(timestamp * 1000).toLocaleDateString("zh-CN") : "";
    var stars = "★".repeat(Number(review.rating) || 0) + "☆".repeat(5 - (Number(review.rating) || 0));
    return (
      '<article class="shop-review-item">' +
      '<div class="shop-review-item__head">' +
      UI.userLine({
        id: review.user_id,
        username: review.username,
        nickname: review.nickname || review.author,
        avatar_url: review.avatar_url,
        role: review.role,
        show_role: review.show_role,
        title: review.user_title
      }) +
      '<span class="shop-review-item__stars" aria-label="' + UI.esc(review.rating) + ' 星">' + stars + '</span><time>' + UI.esc(date) + "</time>" +
      (isMine
        ? '<button type="button" class="btn btn--danger-quiet btn--sm" data-delete-my-review>' + UI.icon("trash", "icon--sm") + "删除</button>"
        : "") +
      "</div>" +
      '<p class="shop-review-item__content">' + (review.content ? UI.esc(review.content) : '<span class="u-muted">仅评分，未写文字</span>') + "</p>" +
      priceLine(review) +
      reviewMedia(review) +
      "</article>"
    );
  }

  function reviewMedia(review) {
    var url = UI.safeUrl(review.image_url);
    if (!url) return "";
    return page.picture(url, "评价配图", "shop-review-thumb");
  }

  function refreshReviews() {
    return UI.api("/api/shops/" + encodeURIComponent(paramId) + "/reviews?limit=50", { on401: false }).then(function (r) {
      if (!r.ok) {
        page.el("reviewList").innerHTML = '<p class="u-muted u-fs-sm">评价暂时无法加载。</p>';
        return;
      }
      currentMyReview = r.data.my_review || null;
      page.el("reviewList").innerHTML = (r.data.reviews || []).length
        ? r.data.reviews
            .map(function (review) {
              return reviewCard(
                review,
                !!(currentMyReview && String(review.id) === String(currentMyReview.id)),
              );
            })
            .join("")
        : '<p class="u-muted u-fs-sm">还没有同学评价，学生及以上可以写下第一条。</p>';
      var myReview = r.data.my_review;
      if (currentCanInteract && myReview) {
        var rating = page.el("reviewForm").querySelector('input[name="rating"][value="' + Number(myReview.rating) + '"]');
        if (rating) rating.checked = true;
        page.el("reviewContent").value = myReview.content || "";
        page.el("reviewGuests").value = myReview.guests === null || myReview.guests === undefined ? "" : myReview.guests;
        page.el("reviewTotalPrice").value = myReview.total_price === null || myReview.total_price === undefined ? "" : myReview.total_price;
        reviewImageState = { existingUrl: myReview.image_url || "", removed: false };
        page.el("reviewHasImage").checked = !!myReview.image_url;
        syncUploadVisibility();
        updatePerPersonPreview();
        page.el("reviewSubmit").textContent = "更新我的评价";
      }
      updateEngagement(currentShop);
    });
  }

  function deleteMyReview() {
    if (!currentCanInteract || !currentMyReview) return;
    UI.confirm({
      title: "删除这条评价？",
      message: "删除后无法恢复。",
      confirmText: "删除",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      UI.api("/api/shops/" + encodeURIComponent(paramId) + "/reviews/me", {
        method: "DELETE",
      })
        .then(function (r) {
          if (!r.ok) {
            UI.toast.error(UI.errorText(r));
            return;
          }
          currentShop = r.data.shop;
          currentMyReview = null;
          var form = page.el("reviewForm");
          if (form) {
            form.reset();
            reviewImageState = { existingUrl: "", removed: false };
            UI.upload.clear(page.el("reviewUploadField"));
            page.el("reviewUploadField").hidden = true;
            updatePerPersonPreview();
            page.el("reviewSubmit").textContent = "提交评价";
          }
          updateEngagement(currentShop);
          UI.toast.success(r.data.message || "评价已删除");
          return refreshReviews();
        })
        .catch(function () {
          UI.toast.error("删除失败，请稍后重试");
        });
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
      notice.textContent = "学生及以上可点赞；每人可提交或更新一条 1–5 星评价，可选填人数与总价自动算人均，也可带一张实拍图。";
    } else {
      likeButton.hidden = true;
      form.hidden = true;
      notice.innerHTML = UI.session.token()
        ? '学生及以上可点赞或评价。 <a href="student_verify.html">去完成学生认证</a>'
        : '学生及以上可点赞或评价。 <a href="' + UI.esc(page.loginUrl()) + '">登录后认证</a>';
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
    var uploadField = page.el("reviewUploadField");
    UI.upload.bind(uploadField, { onChange: function (file) { if (!file) slotIfNew(uploadField); } });
    page.el("reviewHasImage").addEventListener("change", syncUploadVisibility);
    page.el("reviewGuests").addEventListener("input", updatePerPersonPreview);
    page.el("reviewTotalPrice").addEventListener("input", updatePerPersonPreview);
    page.el("reviewList").addEventListener("click", function (e) {
      if (e.target.closest("[data-delete-my-review]")) deleteMyReview();
      if (e.target.closest("[data-remove-existing-image]")) {
        reviewImageState.removed = true;
        UI.upload.clear(uploadField);
        page.el("reviewHasImage").checked = false;
        syncUploadVisibility();
      }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!currentCanInteract) return;
      var selected = form.querySelector('input[name="rating"]:checked');
      if (!selected) { UI.toast.error("请先选择 1–5 星评分"); return; }
      var guestsRaw = page.el("reviewGuests").value.trim();
      var totalRaw = page.el("reviewTotalPrice").value.trim();
      if (guestsRaw !== "") {
        var guestsNum = Number(guestsRaw);
        if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > 99) { UI.toast.error("就餐人数须为 1–99 的整数"); return; }
      }
      if (totalRaw !== "") {
        var totalNum = Number(totalRaw);
        if (!isFinite(totalNum) || totalNum < 0 || totalNum > 100000) { UI.toast.error("总价须为 0–100000 的数字"); return; }
      }
      var data = new FormData();
      data.append("rating", selected.value);
      data.append("content", page.el("reviewContent").value.trim());
      if (guestsRaw !== "") data.append("guests", guestsRaw);
      if (totalRaw !== "") data.append("total_price", totalRaw);
      var withImage = page.el("reviewHasImage").checked;
      var file = UI.upload.get(uploadField);
      if (withImage && file) data.append("image", file);
      if (!withImage || reviewImageState.removed) data.append("remove_image", "1");
      var submit = page.el("reviewSubmit");
      submit.disabled = true;
      UI.api("/api/shops/" + encodeURIComponent(paramId) + "/reviews", { method: "POST", form: data }).then(function (r) {
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
      document.title = shop.name + " · 三元坊必吃榜 · 拾光酥糕";
      body.innerHTML = detail(shop);
      configureInteractions(shop, r.data.can_interact || shop.can_interact);
      wireLayout();
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
