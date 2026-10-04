/* Forum actions are identical in the feed and the reading page. */
(function () {
  "use strict";
  var P = UI.page,
    F = (UI.forum = {});
  F.user = function (p) {
    return {
      id: p.user_id,
      username: p.username,
      nickname: p.nickname,
      avatar_url: p.avatar_url,
      role: p.role,
      title: p.user_title,
    };
  };
  F.canDelete = function (p) {
    var me = UI.session.user();
    return !!(
      UI.session.token() &&
      me &&
      (UI.session.isAtLeast("admin", me) || String(me.id) === String(p.user_id))
    );
  };
  F.likeButton = function (p) {
    return (
      '<button type="button" class="action-btn card__action" aria-pressed="' +
      !!p.is_liked +
      '" aria-label="' +
      (p.is_liked ? "取消点赞" : "点赞") +
      '" data-like>' +
      UI.icon("heart") +
      "<span data-like-count>" +
      UI.esc(p.like_count || 0) +
      "</span></button>"
    );
  };
  F.like = async function (root, id) {
    if (!UI.session.token()) {
      UI.toast.warning("请先登录");
      return;
    }
    var btn = root.querySelector("[data-like]"),
      count = root.querySelector("[data-like-count]");
    if (btn.disabled) return;
    var liked = btn.getAttribute("aria-pressed") === "true",
      old = Number(count.textContent);
    btn.disabled = true;
    function update(value, n) {
      btn.setAttribute("aria-pressed", String(value));
      btn.setAttribute("aria-label", value ? "取消点赞" : "点赞");
      count.textContent = String(Math.max(0, n));
    }
    update(!liked, old + (liked ? -1 : 1));
    btn.classList.add("is-popping");
    setTimeout(function () {
      btn.classList.remove("is-popping");
    }, 350);
    var r = await UI.api("/api/forum/posts/" + id + "/like", {
      method: liked ? "DELETE" : "POST",
    });
    btn.disabled = false;
    if (!r.ok) {
      update(liked, old);
      UI.toast.error(UI.errorText(r));
      return;
    }
    if (typeof r.data.like_count === "number")
      count.textContent = String(r.data.like_count);
  };
  F.remove = async function (btn, id, after) {
    if (btn.disabled) return;
    btn.disabled = true;
    var ok = await UI.confirm({
      title: "删除这条帖子？",
      message: "帖子及其回复、点赞将一并删除，无法恢复。",
      confirmText: "删除",
      danger: true,
    });
    btn.disabled = false;
    if (!ok) return;
    var r = await P.request(
      btn,
      "/api/forum/posts/" + id,
      { method: "DELETE" },
      "已删除",
    );
    if (r && (r.ok || r.status === 404)) after();
  };
  F.replies = function (root, id, count) {
    var inputId = UI.uid("reply-input");
    root.innerHTML =
      '<div data-reply-list></div><div class="load-more" data-reply-more hidden><button type="button" class="btn">加载更多回复</button><span></span></div>' +
      (UI.session.token()
        ? '<form class="composer u-mt-4" novalidate><div class="field"><label class="sr-only" for="' +
          inputId +
          '">回复内容</label><textarea class="textarea" id="' +
          inputId +
          '" data-reply-input data-counter="1000" placeholder="写下你的回复…" required></textarea><div class="field__foot"><span class="field__hint"></span><span class="field__counter"></span></div></div><div class="composer__foot"><button type="submit" class="btn btn--primary btn--sm">发布回复</button></div></form>'
        : '<div class="callout u-mt-4"><span class="callout__text">登录后才能回复。</span><span class="callout__actions"><a class="btn btn--sm" href="' +
          UI.esc(P.loginUrl()) +
          '">登录</a></span></div>');
    var list = root.querySelector("[data-reply-list]"),
      more = root.querySelector("[data-reply-more]"),
      replies = [],
      shown = 0;
    function render() {
      list.innerHTML = replies.length
        ? '<ul class="reply-list">' +
          replies
            .slice(0, shown)
            .map(function (reply, i) {
              return (
                '<li class="reply" id="reply-' +
                UI.esc(reply.id) +
                '" tabindex="-1">' +
                UI.avatar(F.user(reply), "sm") +
                '<div class="reply__body"><div class="reply__meta"><span class="user-line__name">' +
                UI.esc(reply.nickname || reply.username || "已注销用户") +
                "</span>" +
                (UI.config.features.titles ? UI.titleBadge(reply.user_title) : "") +
                UI.roleTag(reply.role) +
                UI.timeEl(reply.created_at) +
                '<span class="reply__floor">' +
                (i + 1) +
                ' 楼</span></div><div class="reply__content">' +
                UI.esc(reply.content) +
                "</div></div></li>"
              );
            })
            .join("") +
          "</ul>"
        : '<p class="u-muted u-fs-sm">还没有回复</p>';
      more.hidden = replies.length <= UI.config.pageSize;
      more.querySelector("button").hidden = shown >= replies.length;
      more.querySelector("span").textContent =
        shown >= replies.length
          ? "已显示全部 " + replies.length + " 条回复"
          : "已显示 " + shown + " / " + replies.length;
    }
    function locate() {
      if (!/^#reply-\d+$/.test(location.hash)) return;
      var target = root.querySelector(location.hash);
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.focus({ preventScroll: true });
      }
    }
    async function load() {
      list.innerHTML = UI.html.skeleton("row", 2);
      var r = await UI.api("/api/forum/posts/" + id + "/replies", {
        auth: false,
      });
      if (!r.ok) {
        P.error(list, r, load);
        return;
      }
      replies = r.data.replies || [];
      shown = Math.min(UI.config.pageSize, replies.length);
      var targetIndex = replies.findIndex(function (reply) {
        return location.hash === "#reply-" + reply.id;
      });
      if (targetIndex >= shown)
        shown = Math.min(
          replies.length,
          Math.ceil((targetIndex + 1) / UI.config.pageSize) *
            UI.config.pageSize,
        );
      if (count) count.textContent = String(replies.length);
      render();
      locate();
    }
    more.querySelector("button").addEventListener("click", function () {
      shown = Math.min(shown + UI.config.pageSize, replies.length);
      render();
    });
    var form = root.querySelector("form");
    if (form) {
      var input = form.querySelector("textarea"),
        btn = form.querySelector("button");
      UI.form.counter(input);
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (btn.disabled || !P.validate(form, [[input, "回复内容不能为空"]]))
          return;
        var r = await P.request(
          btn,
          "/api/forum/posts/" + id + "/replies",
          { method: "POST", body: { content: input.value.trim() } },
          "已发布回复",
        );
        if (r && r.ok) {
          P.reset(form);
          await load();
        }
      });
    }
    window.addEventListener("hashchange", locate);
    load();
  };
})();
