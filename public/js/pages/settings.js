(function () {
  "use strict";
  var P = UI.page;
  if (!P.requireLogin()) return;
  var main = P.el("main"),
    status = P.el("settingsStatus"),
    me;
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
  async function loadSettings() {
    main.setAttribute("aria-busy", "true");
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
      : "关闭后，你的权限等级标签将不在论坛、评价等位置显示。";
    UI.qsa("[data-counter]", main).forEach(function (input) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    UI.qsa('form button[type="submit"]', main).forEach(function (btn) {
      btn.disabled = false;
    });
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
  async function loadPrefs() {
    var r = await UI.api("/api/user/preferences");
    if (!r.ok) return;
    P.el("prefComment").checked = !!r.data.comment;
    P.el("prefReply").checked = !!r.data.reply;
    P.el("prefLike").checked = !!r.data.like;
  }
  P.panels(P.el("settingsNav"), function (name) {
    if (name === "tickets") loadTickets();
    if (name === "messages") loadPrefs();
  });
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
      show_role: P.el("showRole").checked ? 1 : 0,
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
      localStorage.setItem("showRole", body.show_role ? "1" : "0");
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
  loadSettings();
})();
