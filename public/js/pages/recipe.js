(function () {
  "use strict";
  var P = UI.page,
    list = P.el("recipeList"),
    form = P.el("recipeForm"),
    dialog = P.el("reviewDialog");
  var view = "all",
    recipes = [],
    shown = 0,
    controller,
    more = P.el("loadMore"),
    selected = false;
  function open() {
    if (!UI.session.token()) {
      UI.toast.warning("请先登录");
      setTimeout(UI.goLogin, 900);
      return;
    }
    UI.dialog.open(dialog);
  }
  function card(r) {
    var url = UI.safeUrl(r.image_url);
    var media = url
      ? P.picture(url, r.name, "card__media u-w-full")
      : '<div class="card__media"><span class="dish__placeholder">' +
        UI.icon("utensils", "icon--xl") +
        "</span></div>";
    return (
      '<article class="card card--flush review-card">' +
      media +
      '<div class="review-card__body"><div class="review-card__head"><h2 class="review-card__name">' +
      UI.esc(r.name) +
      "</h2>" +
      UI.stars(r.rating) +
      "</div>" +
      (r.comment
        ? '<p class="review-card__text">' + UI.esc(r.comment) + "</p>"
        : "") +
      '</div><div class="review-card__foot">' +
      UI.userLine(
        { id: r.user_id, username: r.username },
        { size: "xs", meta: UI.timeEl(r.created_at) },
      ) +
      "</div></article>"
    );
  }
  function batch() {
    var next = recipes.slice(shown, shown + UI.config.pageSize);
    list
      .querySelector(".grid")
      .insertAdjacentHTML("beforeend", next.map(card).join(""));
    shown += next.length;
    more.hidden = recipes.length <= UI.config.pageSize;
    P.el("moreBtn").hidden = shown >= recipes.length;
    P.el("moreInfo").textContent =
      shown >= recipes.length
        ? "已显示全部 " + recipes.length + " 条评价"
        : "已显示 " + shown + " / " + recipes.length;
  }
  function thisWeek(item) {
    var now = new Date(),
      today =
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0");
    return today >= item.menu_start_date && today <= item.menu_end_date;
  }
  function weekly(item) {
    var range =
      item.menu_start_date === item.menu_end_date
        ? item.menu_start_date
        : item.menu_start_date + " ~ " + item.menu_end_date;
    var active = thisWeek(item),
      me = UI.session.user(),
      canDelete =
        UI.session.token() &&
        me &&
        (UI.session.isAtLeast("super_admin", me) ||
          String(item.user_id) === String(me.id));
    return (
      '<div class="collapse' +
      (active ? " is-open" : "") +
      '"><button type="button" class="collapse__trigger" aria-expanded="' +
      active +
      '"><span class="num">' +
      UI.esc(range) +
      '</span><span class="row row--sm">' +
      (active ? '<span class="badge badge--info">本周</span>' : "") +
      UI.icon("chevron-down", "collapse__chevron") +
      '</span></button><div class="collapse__panel"><div class="collapse__inner"' +
      (active ? "" : " inert") +
      '><div class="collapse__content stack">' +
      P.picture(item.url, range + " · 每周食谱", "weekly-figure u-w-full") +
      '<div class="row row--between"><span class="u-muted u-fs-xs">上传者 ' +
      UI.esc(item.username || "未知") +
      " · " +
      UI.timeEl(item.uploaded_at) +
      "</span>" +
      (canDelete
        ? '<button type="button" class="btn btn--sm btn--danger-quiet" data-delete-weekly="' +
          UI.esc(item.id) +
          '">' +
          UI.icon("trash", "icon--sm") +
          "删除</button>"
        : "") +
      "</div></div></div></div></div>"
    );
  }
  async function load() {
    if (controller) controller.abort();
    controller = new AbortController();
    var wanted = view;
    more.hidden = true;
    list.innerHTML = UI.html.skeleton(view === "all" ? "card" : "post", 3);
    var r = await UI.api(view === "all" ? "/api/recipes" : "/api/weekly-menu", {
      auth: false,
      signal: controller.signal,
    });
    if (r.aborted || wanted !== view) return;
    if (!r.ok) {
      P.error(list, r, load);
      return;
    }
    if (view === "weekly") {
      var images = r.data.images || [];
      list.innerHTML = images.length
        ? '<div class="stack stack--md">' +
          images.map(weekly).join("") +
          "</div>"
        : UI.html.empty({
            icon: "calendar",
            title: "暂未上传本周食谱",
            desc: "请等待管理员上传。",
          });
      return;
    }
    recipes = r.data.recipes || [];
    recipes.sort(function (a, b) {
      return (
        new Intl.Collator("zh-Hans-CN-u-co-pinyin").compare(a.name, b.name) ||
        a.id - b.id
      );
    });
    shown = 0;
    if (!recipes.length) {
      list.innerHTML = UI.html.empty({
        icon: "utensils",
        title: "暂无菜谱评价",
        desc: "食堂的菜好不好吃，你来告诉大家。",
        actions: UI.session.token()
          ? [{ label: "写评价", icon: "pencil", id: "emptyWrite" }]
          : [{ label: "去登录", href: P.loginUrl() }],
      });
      if (P.el("emptyWrite"))
        P.el("emptyWrite").addEventListener("click", open);
    } else {
      list.innerHTML = '<div class="grid"></div>';
      batch();
    }
  }
  function setView(key, tab) {
    selected = true;
    view = tab.dataset.view;
    list.setAttribute("aria-labelledby", tab.id);
    P.el("writeAction").hidden = view !== "all";
    P.el("loginHint").hidden = view !== "all" || !!UI.session.token();
    load();
  }
  var tabs = UI.tabs(UI.qs('[role="tablist"]'), { onChange: setView });
  P.el("writeBtn").addEventListener("click", open);
  P.el("moreBtn").addEventListener("click", batch);
  list.addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-delete-weekly]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    var ok = await UI.confirm({
      title: "删除这张食谱图片？",
      message: "删除后学生端将不再显示。",
      confirmText: "删除",
      danger: true,
    });
    btn.disabled = false;
    if (!ok) return;
    var r = await P.request(
      btn,
      "/api/admin/weekly-menu/" + encodeURIComponent(btn.dataset.deleteWeekly),
      { method: "DELETE" },
      "已删除",
    );
    if (r && (r.ok || r.status === 404)) load();
  });
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = P.el("recipeSubmit");
    if (btn.disabled || !P.validate(form, [["name", "请填写菜名"]])) return;
    var data = new FormData();
    data.append("name", P.value("name"));
    data.append("comment", P.value("comment"));
    data.append(
      "rating",
      (form.querySelector('[name="rating"]:checked') || {}).value || "5",
    );
    var upload = form.querySelector("[data-upload]"),
      file = UI.upload.get(upload);
    if (file) data.append("image", file);
    var r = await P.request(
      btn,
      "/api/recipes",
      { method: "POST", form: data },
      "已发布",
    );
    if (r && r.ok) {
      UI.dialog.close(dialog);
      P.reset(form);
      load();
    }
  });
  async function initial() {
    var fallback = localStorage.getItem("recipeDefaultView") || "all",
      defaultView = fallback;
    if (UI.session.token()) {
      var r = await UI.api("/api/user/profile", { on401: false });
      if (r.ok && r.data.user)
        defaultView = r.data.user.recipe_default_view || fallback;
    }
    if (!selected)
      tabs.select(defaultView === "weekly" ? "weeklyBtn" : "allBtn");
  }
  initial();
})();
