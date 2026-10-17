(function () {
  "use strict";
  var P = UI.page,
    F = UI.forum,
    list = P.el("postList"),
    category = "讨论",
    posts = [],
    shown = 0,
    controller;
  var more = P.el("loadMore"),
    form = P.el("postForm"),
    dialog = P.el("postDialog");
  function postHtml(p) {
    return (
      '<article class="card card--interactive post" data-post-id="' +
      UI.esc(p.id) +
      '"><header class="post__head">' +
      UI.userLine(F.user(p), { meta: UI.timeEl(p.created_at) }) +
      '<span class="tag tag--primary">' +
      UI.esc(p.category) +
      "</span>" +
      (F.canDelete(p)
        ? '<div class="menu card__action" data-menu><button type="button" class="icon-btn icon-btn--sm" data-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">' +
          UI.icon("more") +
          '</button><div class="menu__panel" role="menu" hidden><button type="button" class="menu__item menu__item--danger" role="menuitem" data-delete>' +
          UI.icon("trash") +
          "删除帖子</button></div></div>"
        : "") +
      '</header><h2 class="post__title"><a class="card__link" href="post.html?id=' +
      encodeURIComponent(p.id) +
      '">' +
      UI.esc(p.title) +
      '</a></h2><p class="post__excerpt">' +
      UI.esc(p.content) +
      '</p><footer class="post__foot">' +
      F.likeButton(p) +
      F.collectButton(p) +
      '<button type="button" class="action-btn card__action" aria-expanded="false" aria-label="展开回复" data-replies-toggle>' +
      UI.icon("message") +
      "<span data-reply-count>" +
      UI.esc(p.reply_count || 0) +
      '</span></button></footer><div class="post__replies card__action" data-replies hidden></div></article>'
    );
  }
  function batch() {
    var next = posts.slice(shown, shown + UI.config.pageSize);
    if (!shown) list.innerHTML = "";
    list.insertAdjacentHTML("beforeend", next.map(postHtml).join(""));
    shown += next.length;
    more.hidden = posts.length <= UI.config.pageSize;
    P.el("moreBtn").hidden = shown >= posts.length;
    P.el("moreInfo").textContent =
      shown >= posts.length
        ? "已显示全部 " + posts.length + " 条帖子"
        : "已显示 " + shown + " / " + posts.length;
  }
  async function load() {
    if (controller) controller.abort();
    controller = new AbortController();
    list.innerHTML = UI.html.skeleton("post", 3);
    more.hidden = true;
    var r = await UI.api(
      "/api/forum/posts?category=" + encodeURIComponent(category),
      { signal: controller.signal, auth: !!UI.session.token() },
    );
    if (r.aborted) return;
    if (!r.ok) {
      P.error(list, r, load);
      return;
    }
    posts = r.data.posts || [];
    shown = 0;
    if (!posts.length) {
      list.innerHTML = UI.html.empty({
        icon: "message",
        title: "还没有帖子",
        desc: "来发第一帖吧，分享一下你在校园里的发现。",
        actions: UI.session.token()
          ? [{ label: "发布帖子", icon: "plus", id: "emptyNew" }]
          : [{ label: "去登录", href: P.loginUrl() }],
      });
      if (P.el("emptyNew")) P.el("emptyNew").addEventListener("click", open);
      return;
    }
    batch();
  }
  var tabs = UI.tabs(UI.qs('[role="tablist"]'), {
    onChange: function (key, tab) {
      category = tab.dataset.cat;
      load();
    },
  });
  P.el("moreBtn").addEventListener("click", batch);
  function open() {
    if (!UI.session.token()) {
      UI.toast.warning("请先登录");
      setTimeout(UI.goLogin, 900);
      return;
    }
    P.el("category").value = category;
    UI.dialog.open(dialog);
  }
  P.el("newPostBtn").addEventListener("click", open);
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = P.el("postSubmit");
    if (
      btn.disabled ||
      !P.validate(form, [
        ["title", "标题不能为空"],
        ["content", "内容不能为空"],
      ])
    )
      return;
    var selected = P.value("category");
    var r = await P.request(
      btn,
      "/api/forum/posts",
      {
        method: "POST",
        body: {
          title: P.value("title"),
          content: P.value("content"),
          category: selected,
        },
      },
      "已发布",
    );
    if (r && r.ok) {
      UI.dialog.close(dialog);
      P.reset(form);
      category = selected;
      tabs.select(selected === "讨论" ? "discussBtn" : "questionBtn");
    }
  });
  list.addEventListener("click", function (e) {
    var post = e.target.closest("[data-post-id]");
    if (!post) return;
    var id = post.dataset.postId;
    if (e.target.closest("[data-like]")) {
      F.like(post, id);
      return;
    }
    var toggle = e.target.closest("[data-replies-toggle]");
    if (toggle) {
      var box = post.querySelector("[data-replies]");
      box.hidden = !box.hidden;
      toggle.setAttribute("aria-expanded", String(!box.hidden));
      toggle.setAttribute("aria-label", box.hidden ? "展开回复" : "收起回复");
      if (!box.hidden && !box.dataset.loaded) {
        box.dataset.loaded = "true";
        F.replies(box, id, post.querySelector("[data-reply-count]"));
      }
      return;
    }
    var del = e.target.closest("[data-delete]");
    if (del) F.remove(del, id, load);
  });
  P.el("loginHint").hidden = !!UI.session.token();
  load();
})();
