(function () {
  "use strict";
  var P = UI.page;
  if (!P.requireLogin()) return;
  var me,
    users = {},
    permissions = [],
    targets = {},
    weeklyFile = null,
    previewUrl = "";
  var panelPerms = {
    banner: ["banner_edit", "super_admin"],
    announce: ["announcement_publish", "super_admin"],
    notify: ["announcement_publish", "super_admin"],
    weekly: ["weekly_menu_upload", "admin"],
    review: ["student_review", "super_admin"],
    appeals: ["ban_appeal_review", "super_admin"],
    tickets: ["ticket_manage", "admin"],
    users: ["user_manage", "super_admin"],
    invite: ["invite_manage", "super_admin"],
    "titles-mgmt": ["title_manage", "super_admin"],
    menu: [null, "developer"],
    "menu-import": [null, "admin"],
  };
  var loaders = {
    banner: loadBanner,
    announce: loadAnnounce,
    notify: loadNotify,
    weekly: loadWeekly,
    review: loadReview,
    appeals: loadAppeals,
    tickets: loadTickets,
    users: loadUsers,
    invite: loadInvites,
    "titles-mgmt": function () { loadTitlesMgmt(); },
    menu: function () { UI.menuAdmin.load(); },
    "menu-import": function () { UI.menuImport.load(); },
  };
  function allowed(name) {
    if (name === "menu") return me.role === "developer" && me.status === "active";
    if (name === "menu-import") return ["developer","super_admin","admin"].includes(me.role) && me.status === "active";
    return UI.session.can(panelPerms[name][0], panelPerms[name][1], me);
  }
  async function counts() {
    var r = await UI.api("/api/admin/pending-counts");
    if (!r.ok) return;
    var keys = {
      review: "student_review",
      appeals: "ban_appeal_review",
      tickets: "ticket_manage",
    };
    UI.qsa("[data-count]").forEach(function (badge) {
      var n = Number((r.data.counts || {})[keys[badge.dataset.count]]) || 0;
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.setAttribute("aria-label", n + " 条待处理");
    });
  }
  async function queue(id, path, key, render, empty) {
    var root = P.el(id),
      serial = (root._serial || 0) + 1;
    root._serial = serial;
    root.innerHTML = UI.html.skeleton("post", 2);
    var r = await UI.api(path);
    if (serial !== root._serial) return;
    if (!r.ok) {
      P.error(root, r, function () {
        queue(id, path, key, render, empty);
      });
      return;
    }
    var rows = r.data[key] || [];
    root.innerHTML = rows.length
      ? rows.map(render).join("")
      : UI.html.empty({
          icon: "check-circle",
          title: empty,
          desc: "全部处理完毕。",
        });
  }
  async function init() {
    P.el("adminStatus").innerHTML =
      '<div class="loading-block" aria-busy="true"><span class="spinner"></span>正在核对管理权限…</div>';
    var r = await UI.api("/api/user/profile");
    if (!r.ok) {
      P.error(P.el("adminStatus"), r, init);
      return;
    }
    me = r.data.user;
    UI.session.save(me);
    P.el("adminStatus").innerHTML = "";
    var nav = P.el("adminNav"),
      buttons = UI.qsa("[data-panel]", nav);
    buttons.forEach(function (btn) {
      btn.hidden = !allowed(btn.dataset.panel);
    });
    UI.qsa(".side-nav__group", nav).forEach(function (group) {
      var item = group.nextElementSibling,
        any = false;
      while (item && !item.classList.contains("side-nav__group")) {
        if (!item.hidden) any = true;
        item = item.nextElementSibling;
      }
      group.hidden = !any;
    });
    if (
      !buttons.some(function (btn) {
        return !btn.hidden;
      })
    ) {
      var deny = P.el("denyBox");
      deny.hidden = false;
      deny.innerHTML = UI.html.empty({
        tone: "lock",
        icon: "lock",
        title: "暂无权限访问管理后台",
        actions: [{ label: "返回首页", href: "index.html" }],
      });
      return;
    }
    P.el("adminShell").hidden = false;
    P.panels(nav, function (name) {
      var label = nav.querySelector('[data-panel="' + name + '"]').cloneNode(true);
      UI.qsa('svg, .side-nav__count', label).forEach(function (node) { node.remove(); });
      P.el("adminTitle").textContent = label.textContent.trim();
      if (loaders[name]) loaders[name]();
    });
    counts();
  }
  async function loadBanner() {
    var btn = P.el("bannerSubmit"),
      clear = P.el("bannerClear");
    btn.disabled = true;
    clear.disabled = true;
    P.el("bannerMsg").textContent = "正在加载…";
    var r = await UI.api("/api/settings/banner", { auth: false });
    btn.disabled = false;
    clear.disabled = false;
    P.el("bannerMsg").textContent = "";
    if (r.ok) {
      P.el("bannerInput").value = r.data.banner || "";
      P.el("bannerInput").dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      P.el("bannerMsg").textContent = UI.errorText(r);
      UI.toast.error(UI.errorText(r));
    }
  }
  async function saveBanner(btn, value) {
    if (btn.disabled) return;
    btn.disabled = true;
    var ok = await UI.confirm({
      title: value ? "修改全站横幅？" : "取消全站横幅？",
      message: value
        ? "修改后所有用户都能看到新的横幅。"
        : "取消后全站不再显示横幅。",
      confirmText: value ? "确认修改" : "取消横幅",
    });
    btn.disabled = false;
    if (!ok) return;
    var r = await P.request(
      btn,
      "/api/admin/settings/banner",
      { method: "PUT", body: { value: value } },
      value ? "横幅已更新" : "横幅已取消",
    );
    if (r && r.ok) {
      P.el("bannerInput").value = value;
      P.el("bannerInput").dispatchEvent(new Event("input", { bubbles: true }));
      P.el("siteBanner").innerHTML = "";
      UI.shell.loadBanner();
    }
  }
  P.el("bannerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (P.validate(this))
      saveBanner(P.el("bannerSubmit"), P.value("bannerInput"));
  });
  P.el("bannerClear").addEventListener("click", function () {
    saveBanner(this, "");
  });
  P.el("annForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = P.el("annSubmit");
    if (
      btn.disabled ||
      !P.validate(this, [
        ["annTitle", "请填写公告标题"],
        ["annContent", "请填写公告内容"],
      ])
    )
      return;
    var r = await P.request(
      btn,
      "/api/admin/announcements",
      {
        method: "POST",
        body: { title: P.value("annTitle"), content: P.value("annContent") },
      },
      "公告已发布",
    );
    if (r && r.ok) {
      P.reset(this);
      loadAnnounce();
    }
  });
  function loadAnnounce() {
    return queue(
      "annList",
      "/api/announcements",
      "announcements",
      function (a) {
        var content = (a.content || "").length > 120 ? a.content.slice(0, 120) + "…" : a.content || "";
        return (
          '<article class="card queue-item"><div class="queue-item__main"><h2 class="queue-item__title">' +
          UI.esc(a.title) +
          '</h2><span class="queue-item__meta">发布于 ' +
          UI.esc(a.publish_date || "") +
          '</span><p class="prose">' +
          UI.esc(content) +
          '</p></div><button type="button" class="btn btn--sm btn--danger-quiet" data-delete-announce="' +
          UI.esc(a.id) +
          '">删除</button></article>'
        );
      },
      "暂无公告",
    );
  }
  P.el("annList").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-delete-announce]");
    if (!btn) return;
    confirmedAction(
      btn,
      "删除这条公告吗？",
      "/api/admin/announcements/" + btn.dataset.deleteAnnounce,
      null,
      "已删除",
      loadAnnounce,
      true,
    );
  });
  function loadNotify() {
    P.el("ntMsg").textContent = "";
  }
  P.el("notifyForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = P.el("ntSubmit");
    if (btn.disabled || !P.validate(this, [["ntTitle", "请填写标题"], ["ntBody", "请填写正文"]])) return;
    var ok = await UI.confirm({ title: "向全体用户发送这条通知？", message: "发送后不可撤回。", confirmText: "确认发送" });
    if (!ok) return;
    var r = await P.request(btn, "/api/admin/notifications", {
      method: "POST",
      body: { title: P.value("ntTitle"), body: P.value("ntBody"), important: P.el("ntImportant").checked },
    }, "已发送");
    if (r && r.ok) P.reset(this);
  });
  function loadReview() {
    return queue(
      "reviewList",
      "/api/admin/student-applications",
      "applications",
      function (a) {
        return (
          '<article class="card queue-item"><div class="queue-item__main"><h2 class="queue-item__title">' +
          UI.esc(a.username || a.user_id) +
          '</h2><div class="queue-item__fields"><span>新生号：' +
          UI.esc(a.student_id) +
          "</span><span>班级：" +
          UI.esc(a.class_name) +
          "</span><span>真实姓名：" +
          UI.esc(a.real_name) +
          '</span></div><p class="prose">' +
          UI.esc(a.extra_info || "") +
          '</p><span class="queue-item__meta">' +
          UI.timeEl(a.created_at) +
          '</span></div><div class="queue-item__actions"><button type="button" class="btn btn--sm" data-approve="' +
          UI.esc(a.id) +
          '">通过</button><button type="button" class="btn btn--sm" data-reject="' +
          UI.esc(a.id) +
          '">拒绝</button></div></article>'
        );
      },
      "暂无待审核申请",
    );
  }
  P.el("reviewList").addEventListener("click", async function (e) {
    var approve = e.target.closest("[data-approve]"),
      reject = e.target.closest("[data-reject]");
    if (approve) {
      var r = await P.request(
        approve,
        "/api/admin/student-applications/approve",
        { method: "PUT", body: { id: approve.dataset.approve } },
        "已通过",
      );
      if (r && (r.ok || r.status === 404)) {
        loadReview();
        counts();
      }
    } else if (reject) {
      targets.review = reject.dataset.reject;
      P.reset(P.el("rejectForm"));
      UI.dialog.open("rejectModal");
    }
  });
  P.el("rejectForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!P.validate(this)) return;
    var r = await P.request(
      P.el("rejectConfirm"),
      "/api/admin/student-applications/reject",
      {
        method: "PUT",
        body: { id: targets.review, reason: P.value("rejectReasonInput") },
      },
      "已拒绝",
    );
    if (r && (r.ok || r.status === 404)) {
      UI.dialog.close("rejectModal");
      loadReview();
      counts();
    }
  });
  function loadInvites() {
    return queue(
      "inviteList",
      "/api/admin/invite-codes",
      "invite_codes",
      function (it) {
        return (
          '<article class="card queue-item"><div class="queue-item__main"><h2 class="queue-item__title mono">' +
          UI.esc(it.code) +
          '</h2><span class="u-muted u-fs-sm">已用 ' +
          UI.esc(it.used_count) +
          " / " +
          (it.max_uses > 0 ? UI.esc(it.max_uses) : "不限") +
          '</span></div><button type="button" class="btn btn--sm btn--danger-quiet" data-delete-code="' +
          UI.esc(it.id) +
          '">删除</button></article>'
        );
      },
      "暂无邀请码",
    );
  }
  P.el("inviteForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!P.validate(this, [["inviteCodeInput", "请填写邀请码"]])) return;
    var n = Number(P.value("inviteMaxInput"));
    if (!Number.isInteger(n) || n < 0) {
      UI.form.fieldError(P.el("inviteMaxInput"), "请输入不小于 0 的整数");
      return;
    }
    var r = await P.request(
      P.el("inviteAdd"),
      "/api/admin/invite-codes",
      {
        method: "POST",
        body: { code: P.value("inviteCodeInput"), max_uses: n },
      },
      "邀请码已添加",
    );
    if (r && r.ok) {
      P.reset(this);
      loadInvites();
    }
  });
  async function confirmedAction(
    btn,
    question,
    path,
    body,
    success,
    after,
    danger,
  ) {
    if (btn.disabled) return;
    btn.disabled = true;
    var ok = await UI.confirm({
      title: question,
      confirmText: danger
        ? "删除"
        : body && body.action === "reject"
          ? "驳回"
          : "确认解封",
      danger: !!danger,
    });
    btn.disabled = false;
    if (!ok) return;
    var r = await P.request(
      btn,
      path,
      body === null ? { method: "DELETE" } : { method: "PUT", body: body },
      success,
    );
    if (r && (r.ok || r.status === 404)) {
      after();
      counts();
    }
  }
  P.el("inviteList").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-delete-code]");
    if (btn)
      confirmedAction(
        btn,
        "删除该邀请码吗？",
        "/api/admin/invite-codes/" + btn.dataset.deleteCode,
        null,
        "已删除",
        loadInvites,
        true,
      );
  });
  function clearWeekly() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    weeklyFile = null;
    P.el("weeklyFile").value = "";
    P.el("weeklyPreview").hidden = true;
    P.el("weeklyPreviewImg").removeAttribute("src");
  }
  P.el("weeklyChoose").addEventListener("click", function () {
    P.el("weeklyFile").click();
  });
  P.el("weeklyFile").addEventListener("change", function () {
    var file = this.files[0];
    if (!file) return;
    clearWeekly();
    if (!P.imageValid(file, 5)) return;
    weeklyFile = file;
    previewUrl = URL.createObjectURL(file);
    P.el("weeklyPreviewImg").src = previewUrl;
    P.el("weeklyPreviewName").textContent = file.name;
    P.el("weeklyPreviewSize").textContent = UI.formatBytes(file.size);
    P.el("weeklyPreview").hidden = false;
  });
  P.el("weeklyCancel").addEventListener("click", clearWeekly);
  P.el("weeklyForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (
      !P.validate(this, [
        ["weeklyStart", "请先选择第一天"],
        ["weeklyEnd", "请先选择最后一天"],
      ])
    )
      return;
    if (P.value("weeklyStart") > P.value("weeklyEnd")) {
      UI.form.fieldError(P.el("weeklyEnd"), "第一天不能晚于最后一天");
      return;
    }
    if (!weeklyFile) {
      UI.toast.warning("请先选择图片");
      return;
    }
    var fd = new FormData();
    fd.append("menu_start_date", P.value("weeklyStart"));
    fd.append("menu_end_date", P.value("weeklyEnd"));
    fd.append("image", weeklyFile);
    var r = await P.request(
      P.el("weeklyConfirm"),
      "/api/admin/weekly-menu/upload",
      { method: "POST", form: fd },
      "上传成功",
    );
    if (r && r.ok) {
      clearWeekly();
      loadWeekly();
    }
  });
  function loadWeekly() {
    return queue(
      "weeklyList",
      "/api/weekly-menu",
      "images",
      function (it) {
        var canDelete =
          UI.session.isAtLeast("super_admin", me) ||
          String(it.user_id) === String(me.id);
        return (
          '<article class="card queue-item">' +
          P.picture(it.url, "每周食谱") +
          '<div class="queue-item__main"><h2 class="queue-item__title">' +
          UI.esc(it.menu_start_date + " ~ " + it.menu_end_date) +
          '</h2><span class="queue-item__meta">上传者 ' +
          UI.esc(it.username || "未知") +
          " · " +
          UI.timeEl(it.uploaded_at) +
          "</span></div>" +
          (canDelete
            ? '<button type="button" class="btn btn--sm btn--danger-quiet" data-delete-weekly="' +
              UI.esc(it.id) +
              '">删除</button>'
            : "") +
          "</article>"
        );
      },
      "暂无菜谱图片",
    );
  }
  P.el("weeklyList").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-delete-weekly]");
    if (btn)
      confirmedAction(
        btn,
        "删除这张食谱图片？",
        "/api/admin/weekly-menu/" + btn.dataset.deleteWeekly,
        null,
        "已删除",
        loadWeekly,
        true,
      );
  });
  async function loadUsers() {
    var root = P.el("userList");
    root.innerHTML = UI.html.skeleton("post", 2);
    var results = await Promise.all([
      UI.api("/api/admin/users"),
      UI.api("/api/admin/permissions"),
    ]);
    if (!results[0].ok || !results[1].ok) {
      P.error(
        root,
        results.find(function (r) {
          return !r.ok;
        }),
        loadUsers,
      );
      return;
    }
    permissions = results[1].data.permissions || [];
    var rows = results[0].data.users || [];
    users = {};
    root.innerHTML =
      '<div class="table-wrap"><table class="table table--stack"><caption class="sr-only">用户与权限管理</caption><thead><tr>' +
      ["ID", "用户名", "昵称", "角色", "头衔", "状态", "操作"]
        .map(function (s) {
          return '<th scope="col">' + s + "</th>";
        })
        .join("") +
      "</tr></thead><tbody>" +
      rows
        .map(function (u) {
          users[u.id] = u;
          var editable =
            String(u.id) !== String(me.id) &&
            UI.session.weight(u) < UI.session.weight(me);
          var role = editable
            ? '<select class="select" data-role-select="' +
              UI.esc(u.id) +
              '" aria-label="' +
              UI.esc(u.username) +
              '的角色">' +
              ["user", "student", "admin", "super_admin", "developer"]
                .filter(function (role) {
                  return UI.ROLE_WEIGHTS[role] < UI.session.weight(me);
                })
                .map(function (role) {
                  return (
                    '<option value="' +
                    role +
                    '"' +
                    (u.role === role ? " selected" : "") +
                    ">" +
                    UI.ROLE_LABELS[role] +
                    "</option>"
                  );
                })
                .join("") +
              "</select>"
            : UI.esc(UI.ROLE_LABELS[u.role] || u.role);
          var actions = editable
            ? '<div class="row row--sm"><button type="button" class="btn btn--sm" data-titles="' +
              UI.esc(u.id) +
              '">头衔</button><button type="button" class="btn btn--sm" data-perms="' +
              UI.esc(u.id) +
              '">权限</button><button type="button" class="btn btn--sm' +
              (u.status === "banned" ? "" : " btn--danger-quiet") +
              '" data-' +
              (u.status === "banned" ? "unban" : "ban") +
              '="' +
              UI.esc(u.id) +
              '">' +
              (u.status === "banned" ? "解封" : "封号") +
              "</button></div>"
            : "—";
          return (
            '<tr><td data-label="ID" class="mono">' +
            UI.esc(u.display_id || u.id) +
            '</td><td data-label="用户名">' +
            UI.esc(u.username) +
            '</td><td data-label="昵称">' +
            UI.esc(u.nickname) +
            '</td><td data-label="角色">' +
            role +
            '</td><td data-label="头衔">' +
            userTitlesHtml(u, editable) +
            '</td><td data-label="状态"><span class="badge badge--' +
            (u.status === "banned" ? "danger" : "ok") +
            '">' +
            (u.status === "banned" ? "已封禁" : "正常") +
            '</span></td><td data-label="操作">' +
            actions +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";
  }
  /* ---------- 头衔管理（#10） ---------- */
  var TITLE_HUES = ["teal", "vermilion", "ochre", "bamboo", "wisteria", "indigo", "rose", "stone"];
  var HUE_LABELS = {
    teal: "黛青", vermilion: "朱印", ochre: "赭石", bamboo: "竹青",
    wisteria: "紫藤", indigo: "靛蓝", rose: "绛红", stone: "石灰",
  };
  var titleCatalog = [];
  var titleTargets = { id: null, user: null };

  // 用户表「头衔」列：徽章列表，每枚可撤销
  function userTitlesHtml(u, editable) {
    var list = u.titles || [];
    if (!list.length) return '<span class="u-muted">—</span>';
    return list
      .map(function (t) {
        // 自动头衔由规则管理，撤销会在下次评估时恢复，故不提供撤销按钮
        if (!editable || t.source === "auto") return UI.titleBadge(t);
        return (
          '<span class="row row--sm">' +
          UI.titleBadge(t) +
          '<button type="button" class="icon-btn icon-btn--sm" data-revoke-title="' +
          UI.esc(t.id) +
          '" data-revoke-user="' +
          UI.esc(u.id) +
          '" aria-label="撤销 ' +
          UI.esc(u.username) +
          " 的「" +
          UI.esc(t.name) +
          '」">' +
          UI.icon("close", "icon--sm") +
          "</button></span>"
        );
      })
      .join(" ");
  }

  // 颜色 chip 自带徽章预览，选择即预览
  function hueChipsHtml(name, current) {
    return TITLE_HUES.map(function (hue) {
      return (
        '<label class="chip"><input class="chip__input" type="radio" name="' +
        name +
        '" value="' +
        hue +
        '"' +
        (hue === current ? " checked" : "") +
        '><span class="chip__face"><span class="title-badge" data-hue="' +
        hue +
        '">' +
        UI.icon("award") +
        '<span class="title-badge__text">' +
        HUE_LABELS[hue] +
        "</span></span></span></label>"
      );
    }).join("");
  }

  async function loadTitlesMgmt() {
    var root = P.el("titleList");
    root.innerHTML = UI.html.skeleton("row", 3);
    var r = await UI.api("/api/admin/titles");
    if (!r.ok) {
      P.error(root, r, loadTitlesMgmt, "头衔加载失败");
      return;
    }
    titleCatalog = r.data.titles || [];
    root.innerHTML = titleCatalog.length
      ? '<div class="table-wrap"><table class="table table--stack"><caption class="sr-only">头衔目录</caption><thead><tr>' +
        ["徽章", "名称", "颜色", "来源", "持有人数", "操作"]
          .map(function (s) { return '<th scope="col">' + s + "</th>"; })
          .join("") +
        "</tr></thead><tbody>" +
        titleCatalog
          .map(function (t) {
            return (
              '<tr><td data-label="徽章">' + UI.titleBadge(t) +
              '</td><td data-label="名称">' + UI.esc(t.name) +
              '</td><td data-label="颜色">' + UI.esc(HUE_LABELS[t.hue] || t.hue) +
              '</td><td data-label="来源">' +
              (t.source === "auto" ? "自动 · " + UI.esc(t.rule) : "手动授予") +
              '</td><td data-label="持有人数" class="mono">' + UI.esc(t.holder_count) +
              '</td><td data-label="操作"><div class="row row--sm"><button type="button" class="btn btn--sm" data-edit-title="' +
              UI.esc(t.id) +
              '">编辑</button>' +
              // 内置头衔（带 key）每次启动会由 migrate 重新播种，删除不持久，故不提供删除按钮
              (t.key
                ? '<button type="button" class="btn btn--sm" disabled title="内置头衔不可删除">删除</button>'
                : '<button type="button" class="btn btn--danger-quiet btn--sm" data-delete-title="' +
                  UI.esc(t.id) +
                  '">删除</button>') +
              "</div></td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : UI.html.empty({ icon: "award", title: "暂无头衔", desc: "新建一个头衔后即可授予用户。" });
  }

  function openTitleDialog(id) {
    titleTargets.id = id || null;
    var t = id
      ? titleCatalog.filter(function (x) { return String(x.id) === String(id); })[0]
      : null;
    P.el("titleModal-t").textContent = t ? "编辑头衔" : "新建头衔";
    P.el("titleName").value = t ? t.name : "";
    P.el("titleDesc").value = t ? t.description : "";
    P.el("titleHueChips").innerHTML = hueChipsHtml("titleHue", t ? t.hue : "stone");
    P.el("titleSourceNote").textContent = t
      ? t.source === "auto"
        ? "自动头衔：由规则「" + t.rule + "」发放，不能手动授予。"
        : "手动头衔：需要在用户管理中授予。"
      : "新建后为手动头衔，可在用户管理中授予。";
    P.el("titleMsg").textContent = "";
    P.el("titleMsg").className = "status-text";
    UI.qsa("[data-counter]", P.el("titleForm")).forEach(function (input) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    UI.dialog.open("titleModal");
  }

  async function openGrantDialog(userId) {
    var u = users[userId];
    if (!u) return;
    titleTargets.user = userId;
    P.el("grantTargetName").textContent = u.username;
    P.el("grantMsg").textContent = "";
    P.el("grantMsg").className = "status-text";
    P.el("exclusiveName").value = "";
    P.el("exclusiveName").dispatchEvent(new Event("input", { bubbles: true }));
    P.el("exclusiveHues").innerHTML = hueChipsHtml("exclusiveHue", "stone");
    UI.dialog.open("grantModal");
    var r = await UI.api("/api/admin/titles");
    if (!r.ok) {
      P.el("grantChoices").innerHTML = "";
      P.el("grantOwned").innerHTML = '<span class="u-muted u-fs-sm">头衔加载失败</span>';
      return;
    }
    titleCatalog = r.data.titles || [];
    var owned = u.titles || [];
    var ownedIds = owned.map(function (t) { return String(t.id); });
    var available = titleCatalog.filter(function (t) {
      return t.source === "grant" && ownedIds.indexOf(String(t.id)) === -1;
    });
    P.el("grantChoices").innerHTML = available.length
      ? available
          .map(function (t) {
            return (
              '<label class="chip"><input class="chip__input" type="radio" name="grantTitle" value="' +
              UI.esc(t.id) + '"><span class="chip__face">' + UI.titleBadge(t) + "</span></label>"
            );
          })
          .join("")
      : '<span class="u-muted u-fs-sm">该用户已拥有全部可授予头衔</span>';
    P.el("grantOwned").innerHTML = owned.length
      ? owned
          .map(function (t) {
            return (
              '<span class="row row--sm">' + UI.titleBadge(t) +
              (t.equipped ? '<span class="badge badge--ok">佩戴中</span>' : "") +
              // 自动头衔由规则管理，不提供撤销（撤销会随下次评估恢复）
              (t.source === "auto"
                ? '<span class="u-muted u-fs-xs">自动</span>'
                : '<button type="button" class="btn btn--danger-quiet btn--sm" data-revoke-title="' +
                  UI.esc(t.id) + '" data-revoke-user="' + UI.esc(userId) + '">撤销</button>') +
              "</span>"
            );
          })
          .join("")
      : '<span class="u-muted u-fs-sm">尚未拥有任何头衔</span>';
    P.el("grantConfirm").disabled = !available.length;
  }

  async function revokeTitle(userId, titleId) {
    var u = users[userId] || {};
    var t = titleCatalog.filter(function (x) { return String(x.id) === String(titleId); })[0];
    var ok = await UI.confirm({
      title: "撤销 " + (u.username || "该用户") + " 的「" + (t ? t.name : "头衔") + "」？",
      message: "其佩戴状态将一并清除。",
      confirmText: "撤销",
    });
    if (!ok) return;
    var r = await UI.api("/api/admin/users/" + encodeURIComponent(userId) + "/titles/" + encodeURIComponent(titleId), { method: "DELETE" });
    if (!r.ok) {
      UI.toast.error(UI.errorText(r));
      return;
    }
    if (u.id !== undefined) u.titles = r.data.titles || [];
    UI.toast.success("已撤销");
    if (P.el("grantModal") && P.el("grantModal").open) openGrantDialog(userId);
    loadUsers();
  }

  P.el("titleAdd").addEventListener("click", function () { openTitleDialog(null); });

  P.el("titleList").addEventListener("click", async function (e) {
    var edit = e.target.closest("[data-edit-title]");
    if (edit) { openTitleDialog(edit.dataset.editTitle); return; }
    var del = e.target.closest("[data-delete-title]");
    if (!del) return;
    var t = titleCatalog.filter(function (x) { return String(x.id) === String(del.dataset.deleteTitle); })[0];
    var ok = await UI.confirm({
      title: "删除头衔「" + (t ? t.name : "") + "」？",
      message: "所有用户的拥有与佩戴记录都会一并移除，且不可恢复。",
      confirmText: "删除",
    });
    if (!ok) return;
    var r = await P.request(P.el("titleAdd"), "/api/admin/titles/" + del.dataset.deleteTitle, { method: "DELETE" }, "已删除");
    if (r && r.ok) loadTitlesMgmt();
  });

  P.el("titleForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!P.validate(this, [["titleName", "请填写头衔名称"]])) return;
    var hueInput = this.querySelector('input[name="titleHue"]:checked');
    var btn = P.el("titleConfirm");
    UI.form.busy(btn, true);
    var r = await UI.api(titleTargets.id ? "/api/admin/titles/" + titleTargets.id : "/api/admin/titles", {
      method: titleTargets.id ? "PUT" : "POST",
      body: {
        name: P.value("titleName"),
        hue: hueInput ? hueInput.value : "stone",
        description: P.value("titleDesc"),
      },
      on401: false,
    });
    UI.form.busy(btn, false);
    var msg = P.el("titleMsg");
    if (r && r.ok) {
      UI.dialog.close("titleModal");
      UI.toast.success("已保存");
      loadTitlesMgmt();
      return;
    }
    msg.className = "status-text is-error";
    msg.textContent =
      r && r.status === 409
        ? "头衔名称已存在"
        : r && r.status === 422
          ? "名称需 1–8 个字，描述不超过 40 字"
          : r
            ? UI.errorText(r)
            : "保存失败，请稍后再试";
  });

  P.el("grantConfirm").addEventListener("click", async function () {
    var picked = P.el("grantForm").querySelector('input[name="grantTitle"]:checked');
    if (!picked) return;
    var r = await P.request(
      P.el("grantConfirm"),
      "/api/admin/users/" + encodeURIComponent(titleTargets.user) + "/titles",
      { method: "POST", body: { title_id: Number(picked.value) } },
      "已授予",
    );
    if (r && r.ok) {
      if (users[titleTargets.user]) users[titleTargets.user].titles = r.data.titles || [];
      openGrantDialog(titleTargets.user);
      loadUsers();
    }
  });

  // 专属头衔：为该账号创建并颁发一个不进公共目录的自定义头衔
  P.el("exclusiveGrant").addEventListener("click", async function () {
    var name = P.value("exclusiveName");
    if (!name) {
      UI.toast.warning("请填写专属头衔名称");
      P.el("exclusiveName").focus();
      return;
    }
    var hue = P.el("exclusiveHues").querySelector("input:checked");
    var r = await P.request(
      P.el("exclusiveGrant"),
      "/api/admin/users/" + encodeURIComponent(titleTargets.user) + "/titles/custom",
      { method: "POST", body: { name: name, hue: hue ? hue.value : "stone" } },
      "已颁发专属头衔",
    );
    if (r && r.ok) {
      if (users[titleTargets.user]) users[titleTargets.user].titles = r.data.titles || [];
      await openGrantDialog(titleTargets.user);
      loadUsers();
    }
  });

  P.el("grantOwned").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-revoke-title]");
    if (btn) revokeTitle(btn.dataset.revokeUser, btn.dataset.revokeTitle);
  });

  P.el("userList").addEventListener("change", async function (e) {
    var input = e.target.closest("[data-role-select]");
    if (!input || input.disabled) return;
    var u = users[input.dataset.roleSelect],
      role = input.value;
    input.disabled = true;
    var ok = await UI.confirm({
      title: "将 " + u.username + " 的角色改为 " + UI.ROLE_LABELS[role] + "？",
      message: "该用户将立即获得新角色的权限。",
      confirmText: "确认修改",
    });
    input.disabled = false;
    if (!ok) {
      input.value = u.role;
      return;
    }
    await P.request(
      input,
      "/api/admin/users/role",
      { method: "PUT", body: { userId: u.id, newRole: role } },
      "角色已更新",
    );
    loadUsers();
  });
  P.el("userList").addEventListener("click", function (e) {
    var revoke = e.target.closest("[data-revoke-title]");
    if (revoke) {
      revokeTitle(revoke.dataset.revokeUser, revoke.dataset.revokeTitle);
      return;
    }
    var btn = e.target.closest("[data-ban], [data-unban], [data-perms], [data-titles]");
    if (!btn) return;
    if (btn.dataset.unban) {
      confirmedAction(
        btn,
        "解封该用户？",
        "/api/admin/users/unban",
        { userId: btn.dataset.unban },
        "已解封",
        loadUsers,
      );
      return;
    }
    if (btn.dataset.ban) {
      targets.ban = btn.dataset.ban;
      P.reset(P.el("banForm"));
      P.el("banTargetName").textContent = users[targets.ban].username;
      UI.dialog.open("banModal");
    } else if (btn.dataset.titles) {
      openGrantDialog(btn.dataset.titles);
    } else {
      targets.perms = btn.dataset.perms;
      P.el("permsTargetName").textContent = users[targets.perms].username;
      P.el("permsList").innerHTML = permissions
        .map(function (it) {
          return (
            '<label class="check-row"><input type="checkbox" class="check" value="' +
            UI.esc(it.key) +
            '"' +
            ((users[targets.perms].permissions || []).includes(it.key)
              ? " checked"
              : "") +
            '><span class="check-row__text">' +
            UI.esc(it.label || UI.PERMISSION_LABELS[it.key] || it.key) +
            "</span></label>"
          );
        })
        .join("");
      UI.dialog.open("permsModal");
    }
  });
  P.el("banForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!P.validate(this)) return;
    var fd = new FormData();
    fd.append("userId", targets.ban);
    fd.append("ban_reason", P.value("banReasonInput"));
    fd.append("allow_appeal", P.el("banAllowAppeal").checked ? "1" : "0");
    var file = UI.upload.get(this.querySelector("[data-upload]"));
    if (file) fd.append("ban_image", file);
    var r = await P.request(
      P.el("banConfirm"),
      "/api/admin/users/ban",
      { method: "PUT", form: fd },
      "已封禁",
    );
    if (r && r.ok) {
      UI.dialog.close("banModal");
      loadUsers();
    }
  });
  P.el("permsForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var selected = UI.qsa("input:checked", this).map(function (input) {
      return input.value;
    });
    var r = await P.request(
      P.el("permsConfirm"),
      "/api/admin/users/permissions",
      { method: "PUT", body: { userId: targets.perms, permissions: selected } },
      "权限已更新",
    );
    if (r && r.ok) {
      UI.dialog.close("permsModal");
      loadUsers();
    }
  });
  function loadAppeals() {
    return queue(
      "appealList",
      "/api/admin/ban-appeals",
      "appeals",
      function (a) {
        return (
          '<article class="card stack"><h2 class="queue-item__title">用户 ' +
          UI.esc(a.display_id || a.user_id) +
          "（" +
          UI.esc(a.username) +
          '）</h2><p class="prose">' +
          UI.esc(a.appeal_reason) +
          "</p>" +
          P.picture(a.appeal_image, "申诉图片") +
          '<div class="row row--sm"><button type="button" class="btn btn--sm" data-approve-appeal="' +
          UI.esc(a.id) +
          '">通过</button><button type="button" class="btn btn--sm" data-reject-appeal="' +
          UI.esc(a.id) +
          '">驳回</button></div></article>'
        );
      },
      "暂无待处理申诉",
    );
  }
  P.el("appealList").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-approve-appeal], [data-reject-appeal]");
    if (!btn) return;
    var approve = !!btn.dataset.approveAppeal;
    confirmedAction(
      btn,
      approve ? "通过该申诉并解封？" : "驳回该申诉？",
      "/api/admin/ban-appeals/review",
      {
        appealId: btn.dataset.approveAppeal || btn.dataset.rejectAppeal,
        action: approve ? "approve" : "reject",
      },
      approve ? "已解封" : "已驳回",
      loadAppeals,
    );
  });
  var tickets = {};
  function loadTickets() {
    return queue(
      "ticketList",
      "/api/admin/tickets",
      "tickets",
      function (t) {
        tickets[t.id] = t;
        return P.ticket(t, true);
      },
      "暂无工单",
    );
  }
  P.el("ticketList").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-reply-ticket]");
    if (!btn) return;
    targets.ticket = btn.dataset.replyTicket;
    P.reset(P.el("ticketReplyForm"));
    P.el("ticketTargetTitle").textContent = tickets[targets.ticket].title;
    P.el("ticketMsg").textContent = "";
    UI.dialog.open("ticketModal");
  });
  P.el("ticketReplyForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = P.el("ticketConfirm");
    if (
      btn.disabled ||
      !P.validate(this, [["ticketReplyInput", "请填写批复内容"]])
    )
      return;
    var id = targets.ticket,
      reply = P.value("ticketReplyInput");
    UI.form.busy(btn, true);
    try {
      var image = await P.readImage(
        UI.upload.get(this.querySelector("[data-upload]")),
      );
      var r = await UI.api("/api/admin/tickets/reply", {
        method: "PUT",
        body: { id: id, reply: reply, reply_image: image },
      });
      if (!r.ok) {
        UI.toast.error(UI.errorText(r));
        return;
      }
      UI.toast.success("已批复");
      UI.dialog.close("ticketModal");
      loadTickets();
      counts();
    } catch (err) {
      P.el("ticketMsg").textContent = err.message;
      UI.toast.error(err.message);
    } finally {
      UI.form.busy(btn, false);
    }
  });
  ["weeklyStart", "weeklyEnd"].forEach(function (id) {
    P.el(id).addEventListener("click", function () {
      if (this.showPicker) {
        try {
          this.showPicker();
        } catch (err) {
          /* Native date input remains available. */
        }
      }
    });
  });
  init();
})();
