(function () {
  "use strict";
  var P = UI.page;
  var status = P.el("userStatus");
  var params = new URLSearchParams(location.search);
  var userId = parseInt(params.get("id"), 10);
  var initialHash = location.hash;
  var me = null,
    target = null,
    adminUser = null;
  var canManageUser = false,
    canManageTitle = false;
  var permissionCatalog = [],
    titleCatalog = [],
    ownedTitles = [];
  var TITLE_HUES = ["teal", "vermilion", "ochre", "bamboo", "wisteria", "indigo", "rose", "stone"];
  var HUE_LABELS = {
    teal: "黛青", vermilion: "朱印", ochre: "赭石", bamboo: "竹青",
    wisteria: "紫藤", indigo: "靛蓝", rose: "绛红", stone: "石灰",
  };

  function notFound() {
    P.el("userHero").hidden = true;
    P.el("userNav").hidden = true;
    status.innerHTML = UI.html.empty({
      tone: "error",
      icon: "x-circle",
      title: "用户不存在",
      desc: "该用户可能已被删除，或链接不正确。",
      actions: [{ label: "返回首页", href: "index.html" }],
    });
  }

  if (isNaN(userId)) {
    notFound();
    return;
  }

  function renderHero() {
    P.el("heroAvatar").innerHTML = UI.avatar(target, "xl");
    P.el("heroUsername").textContent = target.username || "";
    P.el("heroRole").innerHTML = UI.roleTag(target.role, target.show_role);
    P.el("heroNickname").textContent = target.nickname || "";
    P.el("heroSignature").textContent = target.signature || "";
  }

  async function load() {
    status.innerHTML =
      '<div class="loading-block"><span class="spinner"></span>正在加载用户主页…</div>';
    P.el("userHero").hidden = true;
    P.el("userNav").hidden = true;
    var meRes = UI.session.token() ? await UI.api("/api/me", { on401: false }) : null;
    me = meRes && meRes.ok ? meRes.data.user : null;
    if (me && me.id !== undefined && me.id !== null && String(me.id) === String(userId)) {
      location.replace("profile.html");
      return;
    }
    var r = await UI.api("/api/users/" + encodeURIComponent(userId) + "/profile", { auth: false });
    if (!r.ok) {
      P.error(status, r, load, "用户主页加载失败");
      return;
    }
    target = r.data.user;
    renderHero();
    status.innerHTML = "";
    P.el("userHero").hidden = false;
    P.el("userNav").hidden = false;
    var wMe = me ? UI.session.weight(me) : 0;
    var wT = UI.ROLE_WEIGHTS[target.role] || 0;
    var eligible = !!me && String(me.id) !== String(target.id) && wMe > wT;
    canManageUser = eligible && UI.session.can("user_manage", "super_admin", me);
    canManageTitle = eligible && UI.session.can("title_manage", "super_admin", me);
    P.el("manageNav").hidden = !(canManageUser || canManageTitle);
    P.el("view-home").innerHTML = UI.html.empty({
      icon: "compass",
      title: (target.nickname || target.username || "该用户") + " 的主页",
      desc: "这里会展示该用户的动态与发布内容。",
    });
    // 只有存在公开收藏夹时才显示「收藏」标签（#23）
    UI.api("/api/users/" + encodeURIComponent(userId) + "/collections", { auth: false }).then(function (cr) {
      if (cr.ok && (cr.data.collections || []).length) {
        P.el("favoritesNav").hidden = false;
        if (initialHash === "#favorites") P.el("favoritesNav").click();
      }
    });
  }

  /* ---------- 收藏（只读，公开收藏夹） ---------- */
  var favoritesLoaded = false;
  function loadPublicFavorites() {
    if (favoritesLoaded) return;
    favoritesLoaded = true;
    UI.collectionsBrowser(P.el("view-favorites"), { mode: "public", userId: userId });
  }

  /* ---------- 头衔（只读） ---------- */
  async function loadTitles() {
    var box = P.el("userTitles");
    box.innerHTML = UI.html.skeleton("row", 2);
    var r = await UI.api("/api/users/" + encodeURIComponent(userId) + "/titles", { auth: false });
    if (!r.ok) {
      P.error(box, r, loadTitles, "头衔加载失败");
      return;
    }
    var list = r.data.titles || [];
    if (!list.length) {
      box.innerHTML = UI.html.empty({
        compact: true,
        icon: "award",
        title: "暂无头衔",
        desc: "该用户还没有获得头衔。",
      });
      return;
    }
    box.innerHTML =
      '<div class="stack">' +
      list
        .map(function (t) {
          return (
            '<div class="row row--sm">' +
            UI.titleBadge(t) +
            (t.equipped ? '<span class="badge badge--ok">佩戴中</span>' : "") +
            (t.description ? '<span class="u-muted u-fs-sm">' + UI.esc(t.description) + "</span>" : "") +
            "</div>"
          );
        })
        .join("") +
      "</div>";
  }

  /* ---------- 管理（权限足够时） ---------- */
  async function loadManage() {
    var box = P.el("manageBox");
    box.innerHTML = UI.html.skeleton("post", 3);
    var results = await Promise.all([
      canManageUser ? UI.api("/api/admin/users/" + encodeURIComponent(userId)) : null,
      canManageUser ? UI.api("/api/admin/permissions") : null,
      canManageTitle ? UI.api("/api/admin/titles") : null,
      UI.api("/api/users/" + encodeURIComponent(userId) + "/titles", { auth: false }),
    ]);
    adminUser = results[0] && results[0].ok ? results[0].data.user : null;
    permissionCatalog = results[1] && results[1].ok ? results[1].data.permissions || [] : [];
    titleCatalog = results[2] && results[2].ok ? results[2].data.titles || [] : [];
    ownedTitles = results[3] && results[3].ok ? results[3].data.titles || [] : [];
    renderManage();
  }

  function rolePanel(u, wMe) {
    var roles = ["user", "student", "admin", "super_admin", "developer"].filter(function (r) {
      return UI.ROLE_WEIGHTS[r] < wMe;
    });
    if (!roles.length) return "";
    var opts = roles
      .map(function (r) {
        return '<option value="' + r + '"' + (u.role === r ? " selected" : "") + ">" + UI.esc(UI.ROLE_LABELS[r]) + "</option>";
      })
      .join("");
    return (
      '<div class="panel"><div class="panel__head"><h2 class="panel__title">权限等级</h2></div>' +
      '<div class="panel__body form"><div class="field"><label class="field__label" for="mgRole">权限等级</label>' +
      '<select class="select" id="mgRole">' + opts + "</select>" +
      '<span class="field__hint">不能设置为不低于自己的等级。</span></div></div>' +
      '<div class="panel__foot"><span class="status-text" id="mgRoleMsg"></span>' +
      '<button type="button" class="btn btn--primary" id="mgRoleSave">保存</button></div></div>'
    );
  }

  function permsPanel(u) {
    var current = u.permissions || [];
    var list = permissionCatalog
      .map(function (it) {
        return (
          '<label class="check-row"><input type="checkbox" class="check" value="' + UI.esc(it.key) + '"' +
          (current.indexOf(it.key) !== -1 ? " checked" : "") +
          '><span class="check-row__text">' +
          UI.esc(it.label || UI.PERMISSION_LABELS[it.key] || it.key) +
          "</span></label>"
        );
      })
      .join("");
    return (
      '<div class="panel"><div class="panel__head"><h2 class="panel__title">特殊权限</h2>' +
      '<p class="panel__desc">角色默认范围之外的额外权限。</p></div>' +
      '<div class="panel__body stack" id="mgPerms">' +
      (list || '<span class="u-muted">暂无可授予的权限</span>') +
      '</div><div class="panel__foot"><span class="status-text" id="mgPermsMsg"></span>' +
      '<button type="button" class="btn btn--primary" id="mgPermsSave">保存</button></div></div>'
    );
  }

  function statusPanel(u) {
    var banned = u.status === "banned";
    return (
      '<div class="panel"><div class="panel__head"><h2 class="panel__title">账号状态</h2></div>' +
      '<div class="panel__body form"><p>当前状态：<span class="badge badge--' +
      (banned ? "danger" : "ok") +
      '">' +
      (banned ? "已封禁" : "正常") +
      "</span></p>" +
      (banned
        ? ""
        : '<div class="field"><label class="field__label" for="mgBanReason">封禁原因（可选）</label>' +
          '<textarea class="textarea" id="mgBanReason"></textarea></div>' +
          '<label class="check-row"><input type="checkbox" class="check" id="mgAllowAppeal" checked>' +
          '<span class="check-row__text">允许该用户申诉</span></label>') +
      '</div><div class="panel__foot"><span class="status-text" id="mgBanMsg"></span>' +
      '<button type="button" class="btn ' +
      (banned ? "btn--primary" : "btn--danger-quiet") +
      '" id="mgBanBtn" data-banned="' +
      (banned ? "1" : "0") +
      '">' +
      (banned ? "解封" : "封号") +
      "</button></div></div>"
    );
  }

  function titlesPanel() {
    var ownedIds = ownedTitles.map(function (t) {
      return String(t.id);
    });
    var owned = ownedTitles.length
      ? ownedTitles
          .map(function (t) {
            return (
              '<div class="row row--sm">' +
              UI.titleBadge(t) +
              (t.equipped ? '<span class="badge badge--ok">佩戴中</span>' : "") +
              (t.source === "auto"
                ? '<span class="u-muted u-fs-xs">自动</span>'
                : '<button type="button" class="btn btn--danger-quiet btn--sm" data-revoke-title="' + UI.esc(t.id) + '">撤销</button>') +
              "</div>"
            );
          })
          .join("")
      : '<span class="u-muted">尚未拥有任何头衔</span>';
    var available = titleCatalog.filter(function (t) {
      return t.source === "grant" && ownedIds.indexOf(String(t.id)) === -1;
    });
    var grant = available.length
      ? '<div class="field"><label class="field__label" for="mgGrantTitle">授予头衔</label>' +
        '<div class="row row--sm"><select class="select" id="mgGrantTitle">' +
        available
          .map(function (t) {
            return '<option value="' + UI.esc(t.id) + '">' + UI.esc(t.name) + "</option>";
          })
          .join("") +
        '</select><button type="button" class="btn btn--primary" id="mgGrantBtn">授予</button></div></div>'
      : '<span class="u-muted u-fs-sm">该用户已拥有全部可授予头衔</span>';
    var chips = TITLE_HUES.map(function (hue) {
      return (
        '<label class="chip"><input class="chip__input" type="radio" name="mgExclusiveHue" value="' + hue + '"' +
        (hue === "stone" ? " checked" : "") +
        '><span class="chip__face"><span class="title-badge" data-hue="' + hue + '">' +
        UI.icon("award") +
        '<span class="title-badge__text">' +
        HUE_LABELS[hue] +
        "</span></span></span></label>"
      );
    }).join("");
    return (
      '<div class="panel"><div class="panel__head"><h2 class="panel__title">头衔</h2></div>' +
      '<div class="panel__body stack"><div class="stack">' + owned + "</div>" + grant +
      '<div class="field"><label class="field__label" for="mgExclusiveName">专属头衔</label>' +
      '<input class="input" id="mgExclusiveName" maxlength="8" placeholder="1–8 个字">' +
      '<div class="field__hint">仅为该账号颁发，不进公共目录。</div></div>' +
      '<div class="field"><span class="field__label">颜色</span><div class="chips" id="mgExclusiveHues">' + chips + "</div></div>" +
      '<div><button type="button" class="btn" id="mgExclusiveBtn">颁发专属头衔</button></div>' +
      '</div><div class="panel__foot"><span class="status-text" id="mgTitleMsg"></span></div></div>'
    );
  }

  function renderManage() {
    var box = P.el("manageBox");
    var parts = [];
    var wMe = me ? UI.session.weight(me) : 0;
    if (canManageUser) {
      if (adminUser) {
        parts.push(rolePanel(adminUser, wMe));
        parts.push(permsPanel(adminUser));
        parts.push(statusPanel(adminUser));
      } else {
        parts.push('<div class="callout"><span class="callout__text">无法加载该用户的管理信息（可能权限不足）。</span></div>');
      }
    }
    if (canManageTitle) parts.push(titlesPanel());
    box.innerHTML = parts.join("");
  }

  async function saveRole() {
    var sel = P.el("mgRole");
    if (!sel) return;
    var newRole = sel.value;
    if (adminUser && newRole === adminUser.role) {
      UI.toast("权限等级未变化");
      return;
    }
    var ok = await UI.confirm({
      title: "将该用户的权限等级改为「" + (UI.ROLE_LABELS[newRole] || newRole) + "」？",
      message: "该用户将立即获得新等级的权限。",
      confirmText: "确认修改",
    });
    if (!ok) return;
    var r = await P.request(
      P.el("mgRoleSave"),
      "/api/admin/users/role",
      { method: "PUT", body: { userId: Number(userId), newRole: newRole } },
      "权限等级已更新",
    );
    if (r && r.ok) {
      target.role = newRole;
      renderHero();
      loadManage();
    }
  }

  async function savePerms() {
    var box = P.el("mgPerms");
    if (!box) return;
    var selected = UI.qsa("input:checked", box).map(function (i) {
      return i.value;
    });
    var r = await P.request(
      P.el("mgPermsSave"),
      "/api/admin/users/permissions",
      { method: "PUT", body: { userId: Number(userId), permissions: selected } },
      "特殊权限已更新",
    );
    if (r && r.ok) loadManage();
  }

  async function toggleBan(btn) {
    var banned = btn.dataset.banned === "1";
    if (banned) {
      var ok = await UI.confirm({
        title: "解封该用户？",
        message: "解封后该用户可以重新登录。",
        confirmText: "解封",
      });
      if (!ok) return;
      var r = await P.request(
        btn,
        "/api/admin/users/unban",
        { method: "PUT", body: { userId: Number(userId) } },
        "已解封",
      );
      if (r && r.ok) loadManage();
      return;
    }
    var ok2 = await UI.confirm({
      title: "封禁该用户？",
      message: "封禁后该用户将无法登录，可设置是否允许申诉。",
      confirmText: "封号",
      danger: true,
    });
    if (!ok2) return;
    var fd = new FormData();
    fd.append("userId", String(userId));
    fd.append("ban_reason", P.el("mgBanReason") ? P.el("mgBanReason").value : "");
    fd.append("allow_appeal", P.el("mgAllowAppeal") && P.el("mgAllowAppeal").checked ? "1" : "0");
    var r2 = await P.request(btn, "/api/admin/users/ban", { method: "PUT", form: fd }, "已封禁");
    if (r2 && r2.ok) loadManage();
  }

  async function grantTitle() {
    var sel = P.el("mgGrantTitle");
    if (!sel || !sel.value) return;
    var r = await P.request(
      P.el("mgGrantBtn"),
      "/api/admin/users/" + encodeURIComponent(userId) + "/titles",
      { method: "POST", body: { title_id: Number(sel.value) } },
      "已授予",
    );
    if (r && r.ok) loadManage();
  }

  async function grantExclusive() {
    var name = (P.el("mgExclusiveName").value || "").trim();
    if (!name) {
      UI.toast.warning("请填写专属头衔名称");
      P.el("mgExclusiveName").focus();
      return;
    }
    var hueInput = P.el("mgExclusiveHues").querySelector("input:checked");
    var r = await P.request(
      P.el("mgExclusiveBtn"),
      "/api/admin/users/" + encodeURIComponent(userId) + "/titles/custom",
      { method: "POST", body: { name: name, hue: hueInput ? hueInput.value : "stone" } },
      "已颁发专属头衔",
    );
    if (r && r.ok) loadManage();
  }

  async function revokeTitle(titleId) {
    var t = ownedTitles.filter(function (x) {
      return String(x.id) === String(titleId);
    })[0];
    var ok = await UI.confirm({
      title: "撤销该用户的「" + (t ? t.name : "头衔") + "」？",
      message: "其佩戴状态将一并清除。",
      confirmText: "撤销",
    });
    if (!ok) return;
    var r = await UI.api(
      "/api/admin/users/" + encodeURIComponent(userId) + "/titles/" + encodeURIComponent(titleId),
      { method: "DELETE", on401: false },
    );
    if (!r || !r.ok) {
      UI.toast.error(r ? UI.errorText(r) : "撤销失败，请稍后再试");
      return;
    }
    UI.toast.success("已撤销");
    loadManage();
  }

  P.el("manageBox").addEventListener("click", function (e) {
    var revoke = e.target.closest("[data-revoke-title]");
    if (revoke) {
      revokeTitle(revoke.dataset.revokeTitle);
      return;
    }
    if (e.target.closest("#mgRoleSave")) saveRole();
    else if (e.target.closest("#mgPermsSave")) savePerms();
    else if (e.target.closest("#mgBanBtn")) toggleBan(e.target.closest("#mgBanBtn"));
    else if (e.target.closest("#mgGrantBtn")) grantTitle();
    else if (e.target.closest("#mgExclusiveBtn")) grantExclusive();
  });

  P.panels(P.el("userNav"), function (name) {
    if (name === "favorites") loadPublicFavorites();
    if (name === "titles") loadTitles();
    if (name === "manage") loadManage();
  });

  load();
})();
