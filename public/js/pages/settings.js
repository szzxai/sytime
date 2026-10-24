(function () {
  "use strict";
  var P = UI.page;
  if (!P.requireLogin()) return;
  var main = P.el("main"),
    status = P.el("settingsStatus"),
    me;
  var collectionPublicToggle = P.el("collectionDefaultPublic");
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
  async function loadCollectionDefaults(user) {
    var results = await Promise.all([
      UI.api("/api/collections?section=shops", { on401: false }),
    ]);
    fillCollectionSelect(
      "defaultCollectionShops",
      results[0],
      user.default_collection_shops,
    );
  }
  function fillCollectionSelect(id, res, selectedId) {
    var select = P.el(id);
    if (!select) return;
    if (!res || !res.ok) {
      select.innerHTML = '<option value="">收藏夹加载失败</option>';
      select.disabled = true;
      return;
    }
    var collections = res.data.collections || [];
    select.innerHTML = collections
      .map(function (c) {
        return '<option value="' + UI.esc(c.id) + '">' + UI.esc(c.name) + "</option>";
      })
      .join("");
    var fallback =
      collections.filter(function (c) {
        return c.name === "默认收藏夹";
      })[0] || collections[0];
    var chosen = null;
    collections.forEach(function (c) {
      if (
        selectedId !== null &&
        selectedId !== undefined &&
        Number(c.id) === Number(selectedId)
      )
        chosen = c.id;
    });
    if (chosen === null && fallback) chosen = fallback.id;
    select.value = chosen === null ? "" : String(chosen);
    select.disabled = collections.length === 0;
  }
  async function loadSettings() {
    main.setAttribute("aria-busy", "true");
    collectionPublicToggle.disabled = true;
    UI.qsa('form button[type="submit"]', main).forEach(function (btn) {
      btn.disabled = true;
    });
    status.innerHTML =
      '<div class="loading-block"><span class="spinner"></span>正在加载设置…</div>';
    var r = await UI.api("/api/user/profile");
    main.removeAttribute("aria-busy");
    if (!r.ok) {
      P.error(status, r, loadSettings, "设置加载失败");
      return;
    }
    me = r.data.user;
    UI.session.save(me);
    collectionPublicToggle.checked = me.collection_default_public === 1;
    var page =
      me.default_page || localStorage.getItem("defaultPage") || "index.html";
    P.el("defaultPage").value = [
      "index.html",
      "map.html",
      "recipe.html",
    ].includes(page)
      ? page
      : "index.html";
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
      var layoutMode = me.shop_layout_mode === "auto" ? "auto" : "manual";
      var modeInput = main.querySelector(
        'input[name="shopLayoutMode"][value="' + layoutMode + '"]',
      );
      if (modeInput) modeInput.checked = true;
    }
    await loadCollectionDefaults(me);
    // 权限等级标签：普通用户强制展示（不可关闭），其余角色可自行选择
    var forceRole = me.role === "user";
    var showRole = me.show_role;
    if (showRole === undefined || showRole === null) {
      showRole = localStorage.getItem("showRole") === "0" ? 0 : 1;
    }
    var showRoleInput = P.el("showRole");
    showRoleInput.checked = forceRole ? true : Number(showRole) !== 0;
    showRoleInput.disabled = forceRole;
    P.el("showRoleHint").textContent = forceRole
      ? "普通用户始终展示权限等级，无需设置。"
      : "关闭后，你的权限等级标签将不在评价等位置显示。";
    UI.qsa("[data-counter]", main).forEach(function (input) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    UI.qsa('form button[type="submit"]', main).forEach(function (btn) {
      btn.disabled = false;
    });
    collectionPublicToggle.disabled = false;
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
  P.panels(P.el("settingsNav"), function (name) {
    if (name === "tickets") loadTickets();
  });
  collectionPublicToggle.addEventListener("change", async function () {
    if (!me) return;
    var previous = me.collection_default_public === 1 ? 1 : 0;
    var value = collectionPublicToggle.checked ? 1 : 0;
    collectionPublicToggle.disabled = true;
    collectionPublicToggle.setAttribute("aria-busy", "true");
    P.el("siteMsg").textContent = "正在保存默认公开设置…";
    var result = await UI.api("/api/user/settings", {
      method: "PUT",
      body: { collection_default_public: value },
      on401: false,
    });
    collectionPublicToggle.disabled = false;
    collectionPublicToggle.removeAttribute("aria-busy");
    if (result.ok) {
      me.collection_default_public = value;
      UI.session.patch({ collection_default_public: value });
      P.el("siteMsg").textContent = "默认公开设置已保存";
      UI.toast.success("默认公开设置已保存");
    } else {
      collectionPublicToggle.checked = previous === 1;
      P.el("siteMsg").textContent = "未能保存默认公开设置，已恢复原设置。";
      UI.toast.error(UI.errorText(result, "默认公开设置保存失败"));
    }
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
    var modeChoice = main.querySelector(
      'input[name="shopLayoutMode"]:checked',
    );
    var body = {
      default_page: P.value("defaultPage"),
      recipe_default_view: P.value("recipeDefaultView"),
      shop_default_sort: P.value("shopDefaultSort"),
      shop_default_type: P.value("shopDefaultType"),
      shop_layout_mode: modeChoice ? modeChoice.value : "manual",
      show_role: P.el("showRole").checked ? 1 : 0,
    };
    var r = await P.request(
      P.el("siteSubmit"),
      "/api/user/settings",
      { method: "PUT", body: body },
    );
    if (r && r.ok) {
      localStorage.setItem("defaultPage", body.default_page);
      localStorage.setItem("recipeDefaultView", body.recipe_default_view);
      if (body.shop_default_sort)
        localStorage.setItem("shopDefaultSort", body.shop_default_sort);
      localStorage.setItem("shopDefaultType", body.shop_default_type || "");
      localStorage.setItem("shopLayoutMode", body.shop_layout_mode);
      localStorage.setItem("showRole", body.show_role ? "1" : "0");
      UI.session.patch(body);
      var collectionBody = {};
      var shopsSelect = P.el("defaultCollectionShops");
      if (shopsSelect && !shopsSelect.disabled && shopsSelect.value)
        collectionBody.default_collection_shops = Number(shopsSelect.value);
      var cr = await UI.api("/api/user/settings/collection", {
        method: "PUT",
        body: collectionBody,
        on401: false,
      });
      UI.session.patch(collectionBody);
      if (!cr || !cr.ok) {
        UI.toast.error(
          cr ? UI.errorText(cr, "收藏默认页保存失败") : "收藏默认页保存失败",
        );
        return;
      }
      UI.toast.success("网站设置已保存到账号");
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
  loadSettings();
})();
