/* 收藏页浏览器（#23）：个人中心与用户主页共用
   - owner：当前用户的收藏夹，可切换公开状态
   - public：他人主页的公开收藏夹，只读
   只复用 site.css 的组件与设计令牌，不新增 CSS 类。 */
(function () {
  "use strict";

  var SECTIONS = [
    { key: "forum", label: "论坛", icon: "message" },
    { key: "shops", label: "必吃榜", icon: "store" }
  ];

  function sectionMeta(key) {
    return SECTIONS.filter(function (s) { return s.key === key; })[0] || SECTIONS[0];
  }

  UI.collectionsBrowser = function (container, options) {
    if (!container) return;
    var opt = options || {};
    var mode = opt.mode === "public" ? "public" : "owner";
    var mobile = UI.isMobile;
    var id = UI.uid("collections");
    var state = {
      section: opt.defaultSection === "shops" ? "shops" : "forum",
      collectionId: null,
      page: 1,
      lists: { forum: [], shops: [] },
      defaults: { forum: null, shops: null },
      collection: null,
      items: [],
      total: 0,
      totalPages: 1,
      busy: false
    };

    container.innerHTML =
      '<div class="shell">' +
      '<div class="shell__nav">' +
      '<div class="field" data-mobile hidden>' +
      '<label class="field__label" for="' + id + '-mobile">选择收藏夹</label>' +
      '<select class="select" id="' + id + '-mobile" data-mobile-select></select>' +
      "</div>" +
      '<nav class="side-nav" data-sections aria-label="收藏版块"></nav>' +
      '<nav class="side-nav" data-collections aria-label="收藏夹" style="margin-top:var(--sp-4)"></nav>' +
      "</div>" +
      '<div class="shell__main">' +
      '<div class="row row--between" style="margin-bottom:var(--sp-4)">' +
      '<nav class="breadcrumb" data-path aria-label="当前位置" style="margin-bottom:0"></nav>' +
      '<label class="switch-row" data-public-wrap hidden style="padding-block:0">' +
      '<span class="switch-row__text"><span class="switch-row__title">公开</span>' +
      '<span class="switch-row__desc">其他人可在你的主页查看</span></span>' +
      '<input type="checkbox" class="switch" data-public>' +
      "</label>" +
      '<span class="badge badge--ok" data-public-badge hidden>公开</span>' +
      "</div>" +
      '<div class="grid" data-grid style="--grid-min:20rem"></div>' +
      '<nav class="pager" data-pager hidden></nav>' +
      "</div>" +
      "</div>";

    var sectionsEl = container.querySelector("[data-sections]");
    var collectionsEl = container.querySelector("[data-collections]");
    var mobileSelect = container.querySelector("[data-mobile-select]");
    var pathEl = container.querySelector("[data-path]");
    var publicWrap = container.querySelector("[data-public-wrap]");
    var publicInput = container.querySelector("[data-public]");
    var publicBadge = container.querySelector("[data-public-badge]");
    var grid = container.querySelector("[data-grid]");
    var pager = container.querySelector("[data-pager]");

    if (mobile) {
      container.querySelector("[data-mobile]").hidden = false;
      sectionsEl.hidden = true;
      collectionsEl.hidden = true;
    }

    function listOf(section) {
      return state.lists[section] || [];
    }

    function findCollection(collectionId) {
      var found = null;
      SECTIONS.forEach(function (s) {
        listOf(s.key).forEach(function (c) {
          if (Number(c.id) === Number(collectionId)) found = c;
        });
      });
      return found;
    }

    function currentCollection() {
      return findCollection(state.collectionId);
    }

    function renderSections() {
      sectionsEl.innerHTML = SECTIONS.map(function (s) {
        var active = s.key === state.section;
        return '<button type="button" class="side-nav__item' + (active ? " is-active" : "") +
          '" data-section="' + s.key + '"' + (active ? ' aria-current="page"' : "") + ">" +
          UI.icon(s.icon) + UI.esc(s.label) + "</button>";
      }).join("");
    }

    function renderCollections() {
      var list = listOf(state.section);
      collectionsEl.innerHTML =
        '<div class="side-nav__group">' + UI.esc(sectionMeta(state.section).label) + " · 收藏夹</div>" +
        (list.length
          ? list.map(function (c) {
              var active = Number(c.id) === Number(state.collectionId);
              return '<button type="button" class="side-nav__item' + (active ? " is-active" : "") +
                '" data-collection="' + UI.esc(c.id) + '"' + (active ? ' aria-current="page"' : "") + ">" +
                "<span>" + UI.esc(c.name) + "</span>" +
                '<span class="side-nav__count">' + UI.esc(c.items_count || 0) + "</span></button>";
            }).join("")
          : '<span class="u-muted u-fs-sm" style="padding:var(--sp-2)">暂无收藏夹</span>');
    }

    function renderMobileSelect() {
      if (!mobile) return;
      var html = "";
      SECTIONS.forEach(function (s) {
        var list = listOf(s.key);
        if (!list.length) return;
        html += '<optgroup label="' + UI.esc(s.label) + '">' +
          list.map(function (c) {
            var value = s.key + ":" + c.id;
            var selected = s.key === state.section && Number(c.id) === Number(state.collectionId);
            return '<option value="' + value + '"' + (selected ? " selected" : "") + ">" + UI.esc(c.name) + "</option>";
          }).join("") + "</optgroup>";
      });
      mobileSelect.innerHTML = html || '<option value="">暂无收藏夹</option>';
    }

    function renderPath() {
      var collection = currentCollection();
      pathEl.innerHTML = "<span>" + UI.esc(sectionMeta(state.section).label) + "</span>" +
        (collection ? '<span aria-hidden="true">·</span><strong>' + UI.esc(collection.name) + "</strong>" : "");
    }

    function renderPublic() {
      if (mode === "public") {
        publicWrap.hidden = true;
        publicBadge.hidden = false;
        return;
      }
      publicWrap.hidden = false;
      publicBadge.hidden = true;
      var collection = currentCollection();
      publicInput.checked = !!(collection && collection.is_public);
      publicInput.disabled = !collection;
    }

    function renderAll() {
      renderSections();
      renderCollections();
      renderMobileSelect();
      renderPath();
      renderPublic();
    }

    function forumItem(item) {
      if (item.deleted) {
        return '<article class="card"><p class="u-muted u-fs-sm">内容已删除</p></article>';
      }
      var author = item.author || {};
      var name = author.nickname || author.username || "已注销用户";
      return '<article class="card card--interactive" style="height:12rem;max-width:20rem;width:100%;overflow:hidden;display:flex;flex-direction:column;gap:var(--sp-2)">' +
        '<h2 class="card__title" style="font-size:var(--fs-lg);line-height:var(--lh-snug)">' +
        '<a class="card__link" href="post.html?id=' + encodeURIComponent(item.item_id) + '">' + UI.esc(item.title) + "</a></h2>" +
        '<p class="u-muted u-fs-xs" style="margin:0">' + UI.esc(name) + " · " + UI.timeEl(item.created_at) + "</p>" +
        '<p class="prose u-fs-sm" style="margin:0;overflow:hidden">' + UI.esc(item.excerpt || "") + "</p>" +
        "</article>";
    }

    function renderGrid() {
      if (!state.items.length) {
        grid.innerHTML = '<div style="grid-column:1/-1">' + UI.html.empty({
          icon: "star",
          title: "收藏夹还是空的",
          desc: "在论坛或必吃榜点击「收藏」，内容会出现在这里。"
        }) + "</div>";
        return;
      }
      grid.innerHTML = state.items.map(function (item) {
        if (item.item_type === "forum_post") return forumItem(item);
        if (item.item_type === "shop" && item.shop) {
          return '<div style="max-width:20rem;width:100%">' + UI.shopCard(item.shop, { collect: false }) + "</div>";
        }
        return '<article class="card"><p class="u-muted u-fs-sm">内容已删除</p></article>';
      }).join("");
    }

    function renderPager() {
      var html = UI.pagerHtml(state.page, state.totalPages);
      pager.innerHTML = html;
      pager.hidden = !html;
    }

    function renderEmpty() {
      state.collection = null;
      state.items = [];
      state.total = 0;
      state.totalPages = 1;
      renderPath();
      renderPublic();
      grid.innerHTML = '<div style="grid-column:1/-1">' + UI.html.empty({
        icon: "star",
        title: mode === "public" ? "没有公开收藏夹" : "还没有收藏夹",
        desc: mode === "public" ? "该用户暂未公开收藏夹。" : "在论坛或必吃榜收藏内容后，会在这里看到。"
      }) + "</div>";
      pager.hidden = true;
      pager.innerHTML = "";
    }

    function loadItems() {
      if (!state.collectionId || state.busy) return;
      state.busy = true;
      grid.innerHTML = '<div style="grid-column:1/-1">' + UI.html.skeleton("card", 3) + "</div>";
      pager.hidden = true;
      UI.api("/api/collections/" + encodeURIComponent(state.collectionId) + "/items?page=" + state.page, {
        on401: false
      }).then(function (r) {
        state.busy = false;
        if (!r.ok) {
          grid.innerHTML = '<div class="callout" style="grid-column:1/-1">' +
            '<span class="callout__text">' + UI.esc(UI.errorText(r, "收藏加载失败")) + "</span>" +
            '<button type="button" class="btn btn--sm" data-retry>重试</button></div>';
          return;
        }
        state.collection = r.data.collection;
        state.items = r.data.items || [];
        state.total = r.data.total || 0;
        state.totalPages = r.data.total_pages || 1;
        state.page = r.data.page || 1;
        if (state.collection) {
          var inList = findCollection(state.collection.id);
          if (inList) inList.is_public = state.collection.is_public;
        }
        renderPath();
        renderPublic();
        renderGrid();
        renderPager();
      });
    }

    function selectSection(key) {
      state.section = key;
      state.page = 1;
      var list = listOf(key);
      var preferred = state.defaults[key];
      var chosen = null;
      list.forEach(function (c) { if (Number(c.id) === Number(preferred)) chosen = c.id; });
      if (!chosen && list.length) chosen = list[0].id;
      state.collectionId = chosen;
      renderAll();
      if (state.collectionId) loadItems();
      else renderEmpty();
    }

    function selectCollection(collectionId) {
      state.collectionId = Number(collectionId);
      state.page = 1;
      renderCollections();
      renderMobileSelect();
      renderPath();
      renderPublic();
      loadItems();
    }

    sectionsEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-section]");
      if (btn) selectSection(btn.getAttribute("data-section"));
    });
    collectionsEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-collection]");
      if (btn) selectCollection(btn.getAttribute("data-collection"));
    });
    mobileSelect.addEventListener("change", function () {
      var parts = mobileSelect.value.split(":");
      if (parts.length !== 2) return;
      state.section = parts[0];
      state.collectionId = Number(parts[1]);
      state.page = 1;
      renderSections();
      renderCollections();
      renderPath();
      renderPublic();
      loadItems();
    });
    pager.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-page]");
      if (!btn) return;
      var page = Number(btn.getAttribute("data-page"));
      if (!page || page === state.page) return;
      state.page = page;
      loadItems();
    });
    grid.addEventListener("click", function (e) {
      if (e.target.closest("[data-retry]")) loadItems();
    });
    publicInput.addEventListener("change", function () {
      if (mode !== "owner" || !state.collectionId) return;
      var desired = publicInput.checked;
      publicInput.disabled = true;
      UI.api("/api/collections/" + encodeURIComponent(state.collectionId) + "/public", {
        method: "PUT",
        body: { is_public: desired },
        on401: false
      }).then(function (r) {
        publicInput.disabled = false;
        if (!r.ok) {
          publicInput.checked = !desired;
          UI.toast.error(UI.errorText(r, "保存失败"));
          return;
        }
        var collection = findCollection(state.collectionId);
        if (collection) collection.is_public = !!desired;
        UI.toast.success(desired ? "已设为公开" : "已设为私密");
      });
    });

    if (mode === "public") {
      UI.api("/api/users/" + encodeURIComponent(opt.userId) + "/collections", { on401: false }).then(function (r) {
        if (!r.ok) {
          renderEmpty();
          return;
        }
        (r.data.collections || []).forEach(function (c) {
          if (state.lists[c.section]) state.lists[c.section].push(c);
        });
        if (!state.lists.forum.length && state.lists.shops.length) state.section = "shops";
        var list = listOf(state.section);
        state.collectionId = list.length ? list[0].id : null;
        renderAll();
        if (state.collectionId) loadItems();
        else renderEmpty();
      });
      return;
    }

    Promise.all([
      UI.api("/api/collections?section=forum", { on401: false }),
      UI.api("/api/collections?section=shops", { on401: false })
    ]).then(function (results) {
      if (results[0] && results[0].ok) {
        state.lists.forum = results[0].data.collections || [];
        state.defaults.forum = results[0].data.defaults ? results[0].data.defaults.forum : null;
      }
      if (results[1] && results[1].ok) {
        state.lists.shops = results[1].data.collections || [];
        state.defaults.shops = results[1].data.defaults ? results[1].data.defaults.shops : null;
      }
      if (!results[0].ok || !results[1].ok) UI.toast.error("部分收藏夹加载失败");
      var initial = state.section;
      if (!listOf(initial).length && listOf(initial === "forum" ? "shops" : "forum").length) {
        state.section = initial === "forum" ? "shops" : "forum";
      }
      var list = listOf(state.section);
      var preferred = state.defaults[state.section];
      var chosen = null;
      list.forEach(function (c) { if (Number(c.id) === Number(preferred)) chosen = c.id; });
      if (!chosen && list.length) chosen = list[0].id;
      state.collectionId = chosen;
      renderAll();
      if (state.collectionId) loadItems();
      else renderEmpty();
    });
  };
})();
