(function () {
  "use strict";
  var P = UI.page,
    F = UI.forum,
    detail = P.el("detail"),
    id = new URLSearchParams(location.search).get("id");
  function missing(title) {
    document.title = title + " · 校园信息网";
    detail.innerHTML =
      '<h1 class="sr-only">' +
      UI.esc(title) +
      "</h1>" +
      UI.html.empty({
        icon: "compass",
        title: title,
        actions: [{ label: "返回论坛", href: "forum.html" }],
      });
  }
  async function load() {
    if (!id || !/^\d+$/.test(id)) {
      missing("缺少有效的帖子 id");
      return;
    }
    detail.innerHTML =
      '<h1 class="sr-only">帖子详情</h1><div class="loading-block" aria-busy="true"><span class="spinner"></span>正在加载…</div>';
    var r = await UI.api("/api/forum/posts/" + encodeURIComponent(id), {
      auth: !!UI.session.token(),
    });
    if (r.status === 404) {
      missing("帖子不存在或已被删除");
      return;
    }
    if (!r.ok) {
      P.error(detail, r, load);
      detail.insertAdjacentHTML(
        "afterbegin",
        '<h1 class="sr-only">帖子详情</h1>',
      );
      return;
    }
    var p = r.data.post;
    document.title = p.title + " · 校园信息网";
    detail.innerHTML =
      '<a class="back-link" href="forum.html">' +
      UI.icon("arrow-left", "icon--sm") +
      '返回论坛</a><article class="card" data-post-id="' +
      UI.esc(p.id) +
      '"><span class="tag tag--primary">' +
      UI.esc(p.category) +
      '</span><h1 class="post-detail__title">' +
      UI.esc(p.title) +
      '</h1><div class="post-detail__meta">' +
      UI.userLine(F.user(p), { size: "md", meta: UI.timeEl(p.created_at) }) +
      '</div><div class="post-detail__body prose">' +
      UI.esc(p.content) +
      '</div><div class="post-detail__actions">' +
      F.likeButton(p) +
      '<span class="grow"></span>' +
      (F.canDelete(p)
        ? '<button type="button" class="action-btn" data-delete>' +
          UI.icon("trash") +
          "删除</button>"
        : "") +
      '</div></article><section class="section"><div class="section__head"><h2 class="section__title">回复</h2><span class="u-muted u-fs-sm" id="replyTotal"></span></div><div class="card" id="repliesBox"></div></section>';
    F.replies(P.el("repliesBox"), id, P.el("replyTotal"));
  }
  detail.addEventListener("click", function (e) {
    if (e.target.closest("[data-like]")) F.like(detail, id);
    var del = e.target.closest("[data-delete]");
    if (del)
      F.remove(del, id, function () {
        setTimeout(function () {
          location.href = "forum.html";
        }, 500);
      });
  });
  load();
})();
