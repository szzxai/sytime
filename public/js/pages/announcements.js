(function () {
  "use strict";
  var P = UI.page,
    root = P.el("annRoot"),
    items = [],
    list,
    detail;
  async function load() {
    root.classList.remove("is-detail");
    root.innerHTML =
      '<div class="master-list" id="annList" aria-label="公告列表"></div><article class="detail-pane" id="annDetail"></article>';
    list = P.el("annList");
    detail = P.el("annDetail");
    list.innerHTML = UI.html.skeleton("text", 3);
    var r = await UI.api("/api/announcements", { auth: false });
    if (!r.ok) {
      P.error(root, r, load);
      return;
    }
    items = r.data.announcements || [];
    if (!items.length) {
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
      "</div>";
    root.classList.add("is-detail");
    P.el("annBack").addEventListener("click", function () {
      history.pushState(null, "", location.pathname);
      root.classList.remove("is-detail");
      list.querySelector('[aria-current="true"]').focus();
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
