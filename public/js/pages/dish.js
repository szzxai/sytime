(function () {
  "use strict";
  var pageHelpers = UI.page, id = new URLSearchParams(location.search).get("id");
  var dish = null, reviews = [], total = 0, nextOffset = 0, revision = 0, loading = false, controller;
  var state = pageHelpers.el("dishState"), list = pageHelpers.el("dishReviews"), more = pageHelpers.el("dishMore");
  var writer = UI.dishReview({ onPublished: function (review) {
    if (String(review.dish_id) !== id) location.href = "dish.html?id=" + encodeURIComponent(review.dish_id);
    else load();
  } });

  function renderReview(review) {
    var author = { id: review.user_id, username: review.username, nickname: review.nickname,
      avatar_url: review.avatar_url, role: review.role, show_role: review.show_role, title: review.user_title };
    return '<article class="card dish-review"><header class="dish-review__head">' +
      UI.userLine(author, { size: "sm", meta: UI.timeEl(review.created_at) }) + UI.stars(review.rating) + '</header>' +
      (review.comment ? '<p class="dish-review__text">' + UI.esc(review.comment) + '</p>' : "") +
      (review.image_url ? pageHelpers.picture(review.image_url, dish.name + "的评价图片", "dish-review__image") : "") + '</article>';
  }
  function missing() {
    pageHelpers.el("dishTitle").textContent = "菜品不存在";
    pageHelpers.el("dishSummary").textContent = "";
    pageHelpers.el("writeDishReview").hidden = true;
    pageHelpers.el("dishReviewsSection").hidden = true;
    state.innerHTML = UI.html.empty({ icon: "utensils", title: "没有找到这道菜品",
      desc: "菜品链接无效，或菜品已不在当前目录中。", actions: [{ label: "返回全部菜品", href: "recipe.html?view=all" }] });
  }
  async function loadReviews(reset) {
    if (loading && !reset) return;
    if (controller) controller.abort();
    controller = new AbortController();
    var current = ++revision;
    loading = true;
    pageHelpers.el("dishMoreButton").disabled = true;
    if (reset) {
      reviews = [];
      nextOffset = 0;
      more.hidden = true;
      list.innerHTML = UI.html.skeleton("post", 2);
    }
    var result = await UI.api("/api/dishes/" + encodeURIComponent(id) + "/reviews?offset=" + nextOffset,
      { auth: false, signal: controller.signal });
    if (current !== revision) return;
    loading = false;
    pageHelpers.el("dishMoreButton").disabled = false;
    if (result.aborted) return;
    if (!result.ok) {
      if (reset) pageHelpers.error(list, result, function () { loadReviews(true); }, "评价加载失败");
      else UI.toast.error(UI.errorText(result));
      return;
    }
    nextOffset = result.data.offset + (result.data.reviews || []).length;
    var existing = new Set(reviews.map(function (review) { return review.id; }));
    (result.data.reviews || []).forEach(function (review) {
      if (!existing.has(review.id)) { reviews.push(review); existing.add(review.id); }
    });
    total = result.data.total;
    list.innerHTML = reviews.length ? reviews.map(renderReview).join("") :
      UI.html.empty({ icon: "message", title: "还没有评价", desc: "吃过这道菜？来分享你的感受吧。" });
    more.hidden = !result.data.has_more;
    pageHelpers.el("dishMoreInfo").textContent = "已显示 " + reviews.length + " / " + total + " 条评价";
  }
  async function load() {
    if (!id || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) { missing(); return; }
    state.innerHTML = UI.html.skeleton("row", 1);
    pageHelpers.el("writeDishReview").hidden = true;
    var result = await UI.api("/api/dishes/" + encodeURIComponent(id), { auth: false });
    if (!result.ok) {
      if (result.status === 404) missing();
      else pageHelpers.error(state, result, load, "菜品加载失败");
      return;
    }
    dish = result.data.dish;
    document.title = dish.name + " · 菜品详情 · 拾光酥糕";
    pageHelpers.el("dishTitle").textContent = dish.name;
    pageHelpers.el("dishSummary").innerHTML = (dish.rating_avg === null ? '<span>暂无评分</span>' :
      UI.stars(dish.rating_avg) + '<span>' + dish.rating_avg.toFixed(1) + ' / 5</span>') +
      '<span>共 ' + dish.reviews_count + ' 条评价</span>';
    state.innerHTML = "";
    pageHelpers.el("writeDishReview").hidden = false;
    pageHelpers.el("dishReviewsSection").hidden = false;
    loadReviews(true);
  }
  pageHelpers.el("writeDishReview").addEventListener("click", function () { writer.open(dish); });
  pageHelpers.el("dishMoreButton").addEventListener("click", function () { loadReviews(false); });
  load();
})();
