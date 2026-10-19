(function () {
  "use strict";
  var P = UI.page;
  if (!P.requireLogin()) return;
  var main = P.el("main"),
    status = P.el("profileStatus"),
    me;

  function caretToEnd(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // 优先使用纯文本编辑（不支持 plaintext-only 的浏览器退回并过滤粘贴 HTML）
  function preferPlaintext(el) {
    el.setAttribute("contenteditable", "plaintext-only");
    if (el.contentEditable === "plaintext-only") return;
    el.setAttribute("contenteditable", "true");
    el.addEventListener("paste", function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });
  }

  // 点击即可编辑：失焦时若内容有变，弹出「是否保存」确认
  function bindInlineEdit(el, opts) {
    var saved = "";
    function setEmpty() {
      el.classList.toggle("is-empty", !el.textContent.trim());
    }
    el.addEventListener("focus", function () {
      el.classList.add("is-editing");
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        el.textContent = saved;
        setEmpty();
        el.blur();
      }
    });
    el.addEventListener("input", function () {
      if (el.textContent.length > opts.max) {
        el.textContent = el.textContent.slice(0, opts.max);
        caretToEnd(el);
      }
      setEmpty();
    });
    el.addEventListener("blur", async function () {
      el.classList.remove("is-editing");
      var value = el.textContent.replace(/\s+/g, " ").trim();
      if (value === saved) {
        el.textContent = saved;
        setEmpty();
        return;
      }
      var ok = await UI.confirm({
        title: opts.confirmTitle,
        message: opts.confirmMessage,
        confirmText: "保存",
        cancelText: "不保存",
      });
      if (!ok) {
        el.textContent = saved;
        setEmpty();
        return;
      }
      if (opts.required && !value) {
        UI.toast.error(opts.requiredMessage);
        el.textContent = saved;
        setEmpty();
        return;
      }
      var r = await UI.api(opts.path, {
        method: "PUT",
        body: opts.body(value),
        on401: false,
      });
      if (!r || !r.ok) {
        UI.toast.error(r ? UI.errorText(r) : "保存失败，请稍后再试");
        el.textContent = saved;
        setEmpty();
        return;
      }
      saved = value;
      el.textContent = value;
      setEmpty();
      UI.toast.success(opts.success);
      if (opts.onSaved) opts.onSaved(value);
    });
    return {
      setValue: function (v) {
        saved = v || "";
        el.textContent = saved;
        setEmpty();
      },
    };
  }

  preferPlaintext(P.el("heroNickname"));
  preferPlaintext(P.el("heroSignature"));

  var nicknameEdit = bindInlineEdit(P.el("heroNickname"), {
    max: 20,
    confirmTitle: "保存昵称",
    confirmMessage: "是否保存昵称的修改？",
    required: true,
    requiredMessage: "昵称不能为空",
    path: "/api/user/nickname",
    body: function (v) {
      return { nickname: v };
    },
    success: "昵称修改成功",
    onSaved: function (v) {
      me.nickname = v;
      UI.session.patch({ nickname: v });
      P.el("avatarBox").innerHTML = UI.avatar(me, "xl");
      if (UI.shell && UI.shell.refreshAuth) UI.shell.refreshAuth();
    },
  });
  var signatureEdit = bindInlineEdit(P.el("heroSignature"), {
    max: 80,
    confirmTitle: "保存个性签名",
    confirmMessage: "是否保存个性签名的修改？",
    required: false,
    path: "/api/user/signature",
    body: function (v) {
      return { signature: v };
    },
    success: "个性签名已保存",
    onSaved: function (v) {
      me.signature = v;
      UI.session.patch({ signature: v });
    },
  });

  async function loadProfile() {
    main.setAttribute("aria-busy", "true");
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
    P.el("heroUsername").textContent = me.username || "";
    P.el("heroRole").innerHTML = UI.roleTag(me.role, 1);
    P.el("avatarBox").innerHTML = UI.avatar(me, "xl");
    nicknameEdit.setValue(me.nickname || "");
    signatureEdit.setValue(me.signature || "");
    status.innerHTML = "";
  }

  /* ---------- 空页面与我的头衔（#10） ---------- */
  P.el("view-home").innerHTML = UI.html.empty({
    icon: "compass",
    title: "个人主页",
    desc: "这里会展示你的动态与发布内容。",
  });

  /* ---------- 收藏（#23）：左右分栏 + 双层菜单 ---------- */
  var favoritesLoaded = false;
  function loadFavorites() {
    if (favoritesLoaded) return;
    favoritesLoaded = true;
    UI.collectionsBrowser(P.el("view-favorites"), { mode: "owner" });
  }

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
    if (name === "favorites") loadFavorites();
    if (name === "titles") loadTitles();
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

  loadProfile();
})();
