(function () {
  "use strict";
  var P = UI.page;
  if (!P.requireLogin()) return;
  var main = P.el("main"),
    status = P.el("profileStatus"),
    me;
  var requires = {
    banner_edit: "super_admin",
    announcement_publish: "super_admin",
    student_review: "super_admin",
    invite_manage: "super_admin",
    user_manage: "super_admin",
    ban_appeal_review: "super_admin",
    weekly_menu_upload: "admin",
    map_popup_edit: "admin",
    ticket_manage: "admin",
    title_manage: "super_admin",
  };
  var SHOP_SORTS = ["campus", "az", "metro", "likes", "reviews", "rating", "new"];
  async function loadShopTypeOptions(current) {
    var select = P.el("shopDefaultType");
    if (!select) return;
    var meta = await UI.api("/api/shops/meta", { on401: false });
    var types = (meta.ok && meta.data.types && meta.data.types.all) || [];
    select.innerHTML =
      '<option value="">全部</option>' +
      types
        .map(function (t) {
          return '<option value="' + UI.esc(t) + '">' + UI.esc(t) + "</option>";
        })
        .join("");
    select.value = types.indexOf(current) !== -1 ? current : "";
  }
  async function loadProfile() {
    main.setAttribute("aria-busy", "true");
    UI.qsa('form button[type="submit"], #chooseAvatar', main).forEach(
      function (btn) {
        btn.disabled = true;
      },
    );
    status.innerHTML =
      '<div class="loading-block"><span class="spinner"></span>正在加载资料…</div>';
    var r = await UI.api("/api/user/profile");
    main.removeAttribute("aria-busy");
    if (!r.ok) {
      P.error(status, r, loadProfile, "资料加载失败");
      return;
    }
    me = r.data.user;
    UI.session.save(me);
    ["username", "nickname", "signature"].forEach(function (key) {
      P.el(key).value = me[key] || "";
    });
    P.el("profileName").textContent = me.nickname || me.username;
    P.el("avatarBox").innerHTML = UI.avatar(me, "xl");
    P.el("infoId").textContent = me.display_id || me.id;
    P.el("infoRole").textContent = UI.ROLE_LABELS[me.role] || me.role;
    P.el("infoPerms").textContent =
      (me.permissions || [])
        .filter(function (key) {
          return UI.session.weight(me) < UI.ROLE_WEIGHTS[requires[key]];
        })
        .map(function (key) {
          return UI.PERMISSION_LABELS[key] || key;
        })
        .join("、") || "无";
    var page =
      me.default_page || localStorage.getItem("defaultPage") || "index.html";
    P.el("defaultPage").value = [
      "index.html",
      "map.html",
      "forum.html",
      "recipe.html",
    ].includes(page)
      ? page
      : "index.html";
    var floor = Number(
      me.default_floor || localStorage.getItem("defaultFloor"),
    );
    P.el("defaultFloor").value = floor >= 1 && floor <= 4 ? String(floor) : "1";
    var recipeView =
      me.recipe_default_view || localStorage.getItem("recipeDefaultView");
    if (["all", "reviews", "weekly"].indexOf(recipeView) === -1) recipeView = "all";
    P.el("recipeDefaultView").value = recipeView;
    if (UI.config.features.shops) {
      P.el("shopPrefFields").hidden = false;
      var shopSort =
        me.shop_default_sort || localStorage.getItem("shopDefaultSort") || "campus";
      if (SHOP_SORTS.indexOf(shopSort) === -1) shopSort = "campus";
      P.el("shopDefaultSort").value = shopSort;
      await loadShopTypeOptions(
        me.shop_default_type || localStorage.getItem("shopDefaultType") || "",
      );
      var shopLayout =
        me.shop_layout || localStorage.getItem("shopLayout") || "stacked";
      if (shopLayout !== "split") shopLayout = "stacked";
      var layoutInput = main.querySelector(
        'input[name="shopLayout"][value="' + shopLayout + '"]',
      );
      if (layoutInput) layoutInput.checked = true;
    }
    UI.qsa("[data-counter]", main).forEach(function (input) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    UI.qsa('form button[type="submit"], #chooseAvatar', main).forEach(
      function (btn) {
        btn.disabled = false;
      },
    );
    status.innerHTML = "";
  }
  async function loadTickets() {
    var list = P.el("myTicketList");
    list.innerHTML = UI.html.skeleton("post", 2);
    var r = await UI.api("/api/tickets/mine");
    if (!r.ok) {
      P.error(list, r, loadTickets);
      return;
    }
    var tickets = r.data.tickets || [];
    list.innerHTML = tickets.length
      ? tickets
          .map(function (t) {
            return P.ticket(t, false);
          })
          .join("")
      : UI.html.empty({
          icon: "clipboard",
          title: "暂无工单",
          desc: "遇到问题可以提交工单。",
        });
  }
  /* ---------- 我的头衔（#10） ---------- */
  var titles = { owned: [], locked: [], equippedId: "", selected: "" };

  function titleDate(sec) {
    return sec ? UI.formatTime(sec).slice(0, 10) : "";
  }

  function titleSource(t) {
    return t.source === "auto" ? "自动获得" : "管理员授予";
  }

  function titleOptionHtml(t) {
    return (
      '<label class="choice" data-hue="' + UI.esc(t.hue || "stone") + '">' +
      '<input class="choice__input" type="radio" name="wear" value="' + UI.esc(String(t.id)) + '"' +
      (t.equipped ? " checked" : "") + ">" +
      '<span class="choice__body"><span class="choice__badge-row">' +
      UI.titleBadge(t) +
      UI.icon("check-circle", "choice__check") +
      "</span>" +
      '<span class="choice__desc">' + UI.esc(t.description || titleSource(t)) + "</span>" +
      '<span class="choice__meta">' + titleSource(t) +
      (t.granted_at ? " · " + UI.esc(titleDate(t.granted_at)) : "") +
      "</span></span></label>"
    );
  }

  // 未达成的自动头衔：灰化展示条件与当前进度，不可选择
  function lockedOptionHtml(t) {
    return (
      '<label class="choice choice--locked" data-hue="' + UI.esc(t.hue || "stone") + '">' +
      '<input class="choice__input" type="radio" name="wear" value="" disabled>' +
      '<span class="choice__body"><span class="choice__badge-row">' +
      UI.titleBadge(t) +
      UI.icon("lock", "icon--sm") +
      "</span>" +
      '<span class="choice__desc">' + UI.esc(t.description) + "</span>" +
      '<span class="choice__meta">未获得 · ' + UI.esc(t.text) + "</span></span></label>"
    );
  }

  function refreshWear() {
    var input = P.el("titleChoices").querySelector('input[name="wear"][value="' + titles.selected + '"]');
    if (input) input.checked = true;
    var badge = "";
    titles.owned.forEach(function (t) {
      if (String(t.id) === titles.selected) badge = UI.titleBadge(t);
    });
    P.el("titlePreview").innerHTML = badge || '<span class="u-muted u-fs-sm">不佩戴头衔</span>';
    P.el("wearSubmit").disabled = titles.selected === titles.equippedId;
  }

  function renderTitles() {
    var worn = titles.owned.some(function (t) { return t.equipped; });
    P.el("titleChoices").innerHTML =
      '<label class="choice"><input class="choice__input" type="radio" name="wear" value=""' +
      (worn ? "" : " checked") + '><span class="choice__body"><span class="choice__title">不佩戴' +
      UI.icon("check-circle", "choice__check") +
      '</span><span class="choice__desc">不显示任何头衔</span></span></label>' +
      titles.owned.map(titleOptionHtml).join("");
    P.el("titlesLocked").innerHTML = titles.locked.map(lockedOptionHtml).join("");
    P.el("titlesEmpty").innerHTML = titles.owned.length
      ? ""
      : UI.html.empty({
          compact: true,
          icon: "award",
          title: "暂无头衔",
          desc: "继续使用网站，可能会获得头衔。",
        });
    refreshWear();
  }

  async function loadTitles() {
    var r = await UI.api("/api/user/titles");
    if (!r.ok) {
      P.el("titleChoices").innerHTML = "";
      P.el("titlesLocked").innerHTML = "";
      P.error(P.el("titlesEmpty"), r, loadTitles, "头衔加载失败");
      return;
    }
    titles.owned = r.data.titles || [];
    // 只列出已着手（进度 > 0）的未达成头衔，按完成度从高到低排；完全没开始的留白太多
    titles.locked = (r.data.locked || [])
      .filter(function (t) { return !t.met && t.progress > 0; })
      .sort(function (a, b) { return b.progress / (b.target || 1) - a.progress / (a.target || 1); });
    var worn = titles.owned.filter(function (t) { return t.equipped; })[0];
    titles.equippedId = worn ? String(worn.id) : "";
    titles.selected = titles.equippedId;
    renderTitles();
  }

  if (!UI.config.features.titles) {
    P.el("titlesNav").hidden = true;
  } else {
    P.el("titleChoices").addEventListener("change", function (e) {
      var input = e.target.closest('input[name="wear"]');
      if (!input) return;
      titles.selected = input.value;
      P.el("wearMsg").textContent = "";
      P.el("wearMsg").className = "status-text";
      refreshWear();
    });
    P.el("wearSubmit").addEventListener("click", async function () {
      var btn = this;
      P.el("wearMsg").textContent = "";
      P.el("wearMsg").className = "status-text";
      UI.form.busy(btn, true);
      var r = await UI.api("/api/user/title", {
        method: "PUT",
        body: { title_id: titles.selected === "" ? null : Number(titles.selected) },
        on401: false,
      });
      UI.form.busy(btn, false);
      if (!r || !r.ok) {
        var msg = P.el("wearMsg");
        msg.className = "status-text is-error";
        msg.textContent = r ? UI.errorText(r) : "保存失败，请稍后再试";
        titles.selected = titles.equippedId;
        refreshWear();
        return;
      }
      titles.equippedId = titles.selected;
      titles.owned.forEach(function (t) { t.equipped = String(t.id) === titles.equippedId; });
      UI.session.patch({ title: r.data.title });
      if (UI.shell && UI.shell.refreshAuth) UI.shell.refreshAuth();
      UI.toast.success("佩戴已更新");
      renderTitles();
    });
  }

  P.panels(P.el("profileNav"), function (name) {
    if (name === "tickets") loadTickets();
    if (name === "messages") loadPrefs();
    if (name === "titles") loadTitles();
  });
  async function loadPrefs() {
    var r = await UI.api("/api/user/preferences");
    if (!r.ok) return;
    P.el("prefComment").checked = !!r.data.comment;
    P.el("prefReply").checked = !!r.data.reply;
    P.el("prefLike").checked = !!r.data.like;
  }
  ["prefComment", "prefReply", "prefLike"].forEach(function (id) {
    var key = id.replace("pref", "").toLowerCase();
    P.el(id).addEventListener("change", async function () {
      var input = this,
        body = {};
      body[key] = input.checked;
      var r = await UI.api("/api/user/preferences", {
        method: "PUT",
        body: body,
        on401: false,
      });
      if (r && r.ok) UI.toast.success("偏好已保存");
      else {
        input.checked = !input.checked;
        UI.toast.error(r ? UI.errorText(r) : "保存失败，请稍后再试");
      }
    });
  });
  P.el("chooseAvatar").addEventListener("click", function () {
    P.el("avatarFile").click();
  });
  P.el("avatarFile").addEventListener("change", async function () {
    var file = this.files[0],
      btn = P.el("chooseAvatar");
    if (!P.imageValid(file, 2)) {
      this.value = "";
      return;
    }
    var fd = new FormData();
    fd.append("avatar", file);
    var r = await P.request(
      btn,
      "/api/user/avatar",
      { method: "POST", form: fd },
      "头像更新成功",
    );
    this.value = "";
    if (r && r.ok) {
      me.avatar_url = r.data.avatar_url;
      UI.session.patch({ avatar_url: me.avatar_url });
      P.el("avatarBox").innerHTML = UI.avatar(me, "xl");
      UI.shell.refreshAuth();
    }
  });
  ["nickname", "signature"].forEach(function (key) {
    var form = P.el(key + "Form");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = P.el(key + "Submit");
      if (
        btn.disabled ||
        !P.validate(form, key === "nickname" ? [[key, "昵称不能为空"]] : [])
      )
        return;
      var body = {};
      body[key] = P.value(key);
      var r = await P.request(
        btn,
        "/api/user/" + key,
        { method: "PUT", body: body },
        key === "nickname" ? "昵称修改成功" : "个性签名已保存",
      );
      if (r && r.ok) {
        me[key] = body[key];
        UI.session.patch(body);
        P.el("profileName").textContent = me.nickname || me.username;
        P.el("avatarBox").innerHTML = UI.avatar(me, "xl");
        UI.shell.refreshAuth();
      }
    });
  });
  P.el("passwordForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = P.el("passwordSubmit");
    if (
      btn.disabled ||
      !P.validate(this, [
        ["oldPassword", "请输入旧密码"],
        ["newPassword", "请输入新密码"],
        ["confirmPassword", "请确认新密码"],
      ])
    )
      return;
    if (P.el("newPassword").value !== P.el("confirmPassword").value) {
      UI.form.fieldError(P.el("confirmPassword"), "两次输入的新密码不一致");
      UI.form.focusFirstInvalid(this);
      return;
    }
    var r = await P.request(
      btn,
      "/api/user/password",
      {
        method: "PUT",
        body: {
          oldPassword: P.el("oldPassword").value,
          newPassword: P.el("newPassword").value,
        },
      },
      "密码修改成功",
    );
    if (r && r.ok) P.reset(this);
    else if (r && r.data.error === "old password is incorrect")
      UI.form.fieldError(P.el("oldPassword"), "旧密码不正确");
  });
  P.el("siteForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var layoutChoice = main.querySelector(
      'input[name="shopLayout"]:checked',
    );
    var body = {
      default_page: P.value("defaultPage"),
      default_floor: Number(P.value("defaultFloor")),
      recipe_default_view: P.value("recipeDefaultView"),
      shop_default_sort: P.value("shopDefaultSort"),
      shop_default_type: P.value("shopDefaultType"),
      shop_layout: layoutChoice ? layoutChoice.value : "stacked",
    };
    var r = await P.request(
      P.el("siteSubmit"),
      "/api/user/settings",
      { method: "PUT", body: body },
      "网站设置已保存到账号",
    );
    if (r && r.ok) {
      localStorage.setItem("defaultPage", body.default_page);
      localStorage.setItem("defaultFloor", body.default_floor);
      localStorage.setItem("recipeDefaultView", body.recipe_default_view);
      if (body.shop_default_sort)
        localStorage.setItem("shopDefaultSort", body.shop_default_sort);
      localStorage.setItem("shopDefaultType", body.shop_default_type || "");
      localStorage.setItem("shopLayout", body.shop_layout);
      UI.session.patch(body);
    }
  });
  P.el("ticketForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = P.el("ticketSubmit");
    if (
      btn.disabled ||
      !P.validate(this, [
        ["ticketTitle", "请填写标题"],
        ["ticketContent", "请填写工单内容"],
      ])
    )
      return;
    var r = await P.request(
      btn,
      "/api/tickets",
      {
        method: "POST",
        body: {
          title: P.value("ticketTitle"),
          content: P.value("ticketContent"),
          visibility: P.value("ticketVisibility"),
        },
      },
      "工单已提交，请等待处理",
    );
    if (r && r.ok) {
      P.reset(this);
      loadTickets();
    }
  });
  loadProfile();
})();
