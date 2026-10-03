(function () {
  "use strict";
  var P = UI.page,
    root = P.el("annRoot"),
    items = [],
    canManage = false,
    list,
    detail;
  async function detectManage() {
    if (!UI.session.token()) return false;
    var r = await UI.api("/api/user/profile", { on401: false });
    return r.ok && UI.session.can("announcement_publish", "super_admin", r.data.user);
  }
  async function load() {
    root.classList.add("master-detail");
    root.classList.remove("is-detail");
    root.innerHTML =
      '<div class="master-list" id="annList" aria-label="公告列表"></div><article class="detail-pane" id="annDetail"></article>';
    list = P.el("annList");
    detail = P.el("annDetail");
    list.innerHTML = UI.html.skeleton("text", 3);
    if (UI.session.token()) canManage = await detectManage();
    var r = await UI.api("/api/announcements", { auth: false });
    if (!r.ok) {
      P.error(root, r, load);
      return;
    }
    items = r.data.announcements || [];
    if (!items.length) {
      root.classList.remove("master-detail");
      root.innerHTML = UI.html.empty({
        icon: "megaphone",
        title: "暂无公告",
        desc: "有新动态时会第一时间发布在这里。",
      });
      return;
    }
    list.innerHTML = items
      .map(function (a, i) {
        return (
          '<button type="button" class="master-item" data-id="' +
          UI.esc(a.id) +
          '"><span class="master-item__date">' +
          UI.esc(a.publish_date) +
          (i === 0 ? '<span class="tag tag--primary">最新</span>' : "") +
          '</span><span class="master-item__title">' +
          UI.esc(a.title) +
          "</span></button>"
        );
      })
      .join("");
    list.addEventListener("click", function (e) {
      var item = e.target.closest("[data-id]");
      if (item) {
        history.pushState(null, "", "#" + item.dataset.id);
        select(item.dataset.id);
      }
    });
    if (location.hash) select(location.hash.slice(1));
    else if (window.innerWidth >= 900) select(items[0].id);
  }
  function select(id) {
    var a = items.find(function (item) {
      return String(item.id) === String(id);
    });
    if (!a && window.innerWidth < 900) {
      root.classList.remove("is-detail");
      return;
    }
    if (!a) a = items[0];
    if (!a) return;
    UI.qsa("[data-id]", list).forEach(function (btn) {
      btn.setAttribute("aria-current", String(btn.dataset.id === String(a.id)));
    });
    detail.innerHTML =
      '<button type="button" class="back-link u-hide-desktop" id="annBack">' +
      UI.icon("arrow-left", "icon--sm") +
      '返回公告列表</button><h2 class="detail-pane__title">' +
      UI.esc(a.title) +
      '</h2><div class="detail-pane__meta">' +
      UI.icon("calendar", "icon--sm") +
      "发布于 " +
      UI.esc(a.publish_date) +
      '</div><div class="prose">' +
      UI.esc(a.content) +
      "</div>" +
      (canManage
        ? '<div class="row row--sm u-mt-4"><button type="button" class="btn btn--danger-quiet btn--sm" id="annDelete">' +
          UI.icon("trash", "icon--sm") +
          "删除公告</button></div>"
        : "");
    root.classList.add("is-detail");
    P.el("annBack").addEventListener("click", function () {
      history.pushState(null, "", location.pathname);
      root.classList.remove("is-detail");
      list.querySelector('[aria-current="true"]').focus();
    });
    var del = P.el("annDelete");
    if (del)
      del.addEventListener("click", async function () {
        var ok = await UI.confirm({
          title: "删除这条公告？",
          message: "删除后无法恢复，所有用户将不再看到这条公告。",
          confirmText: "删除",
          danger: true,
        });
        if (!ok) return;
        UI.form.busy(del, true);
        var rd = await UI.api(
          "/api/admin/announcements/" + encodeURIComponent(a.id),
          { method: "DELETE" },
        );
        UI.form.busy(del, false);
        if (rd.ok) {
          UI.toast.success("已删除");
        } else if (
          rd.status === 404 &&
          rd.data &&
          rd.data.error === "announcement not found"
        ) {
          UI.toast.warning("该公告已不存在，已为你刷新列表");
        } else {
          UI.toast.error(UI.errorText(rd));
          return;
        }
        history.replaceState(null, "", location.pathname);
        load();
      });
  }
  window.addEventListener("popstate", function () {
    select(location.hash.slice(1));
  });
  window.addEventListener("hashchange", function () {
    select(location.hash.slice(1));
  });
  load();
})();
