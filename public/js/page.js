/* Page helpers shared by the existing campus tools. */
(function () {
  "use strict";
  var P = (UI.page = {});
  P.el = function (id) {
    return document.getElementById(id);
  };
  P.value = function (id) {
    return P.el(id).value.trim();
  };
  P.loginUrl = function () {
    return (
      "/login.html?next=" +
      encodeURIComponent(location.pathname + location.search + location.hash)
    );
  };
  P.requireLogin = function () {
    if (UI.session.token()) return true;
    UI.goLogin();
    return false;
  };
  P.validate = function (root, required) {
    UI.form.clearAll(root);
    (required || []).forEach(function (pair) {
      var input = typeof pair[0] === "string" ? P.el(pair[0]) : pair[0];
      if (!input.value.trim()) UI.form.fieldError(input, pair[1]);
    });
    UI.qsa("[data-counter]", root).forEach(function (input) {
      var max = Number(input.dataset.counter);
      if (input.value.length > max)
        UI.form.fieldError(input, "不能超过 " + max + " 字");
    });
    var valid = !root.querySelector('[aria-invalid="true"]');
    if (!valid) UI.form.focusFirstInvalid(root);
    return valid;
  };
  P.reset = function (root) {
    root.reset();
    UI.form.clearAll(root);
    UI.qsa("[data-counter]", root).forEach(function (input) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    UI.qsa("[data-upload]", root).forEach(UI.upload.clear);
    if (root._guard) root._guard.clean();
  };
  P.request = async function (btn, path, options, success) {
    if (btn.disabled) return null;
    function busy(on) {
      if (btn.tagName === "SELECT") btn.disabled = on;
      else UI.form.busy(btn, on);
    }
    busy(true);
    try {
      var r = await UI.api(path, options);
      if (!r.ok) UI.toast.error(UI.errorText(r));
      else if (success) UI.toast.success(success);
      return r;
    } finally {
      busy(false);
    }
  };
  P.cooldown = function (btn, seconds) {
    var label = btn.textContent;
    btn.disabled = true;
    function tick(n) {
      btn.textContent = "等待 " + UI.formatCountdown(n);
    }
    tick(seconds);
    UI.countdown(seconds, tick, function () {
      btn.disabled = false;
      btn.textContent = label;
    });
  };
  P.readImage = function (file) {
    if (!file) return Promise.resolve("");
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error("图片读取失败，请重新选择"));
      };
      reader.readAsDataURL(file);
    });
  };
  P.imageValid = function (file, maxMB) {
    if (!file) return false;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      UI.toast.error("仅支持 JPG / PNG 格式的图片");
      return false;
    }
    if (file.size > maxMB * 1024 * 1024) {
      UI.toast.error(
        "图片不能超过 " +
          maxMB +
          " MB（当前 " +
          UI.formatBytes(file.size) +
          "）",
      );
      return false;
    }
    return true;
  };
  P.picture = function (url, caption, cls) {
    url = UI.safeUrl(url);
    if (!url) return "";
    return (
      '<button type="button" class="' +
      (cls || "thumb") +
      '" data-zoom="' +
      UI.esc(url) +
      '" data-caption="' +
      UI.esc(caption) +
      '" aria-label="查看' +
      UI.esc(caption) +
      '"><img src="' +
      UI.esc(url) +
      '" alt="' +
      UI.esc(caption) +
      '" loading="lazy" decoding="async"></button>'
    );
  };
  P.error = function (root, r, retry, title) {
    root.innerHTML = UI.html.loadError(r, title);
    var btn = root.querySelector("[data-retry]");
    if (btn) btn.addEventListener("click", retry);
  };
  P.panels = function (nav, onSelect) {
    var links = UI.qsa("[data-panel]", nav);
    function select(name) {
      var link = links.find(function (item) {
        return !item.hidden && item.dataset.panel === name;
      });
      if (!link)
        link = links.find(function (item) {
          return !item.hidden;
        });
      if (!link) return;
      name = link.dataset.panel;
      links.forEach(function (item) {
        item.classList.toggle("is-active", item === link);
        if (item === link) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      UI.qsa(".view").forEach(function (view) {
        var active = view.id === "view-" + name;
        view.hidden = !active;
        view.classList.toggle("is-active", active);
      });
      history.replaceState(null, "", "#" + name);
      if (onSelect) onSelect(name);
    }
    links.forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        select(link.dataset.panel);
      });
    });
    window.addEventListener("hashchange", function () {
      select(location.hash.slice(1));
    });
    select(location.hash.slice(1));
    return select;
  };
  P.ticketVisibility = {
    admin: "管理员及以上",
    super_admin: "超级管理员及以上",
    developer: "仅开发者",
  };
  P.ticket = function (t, admin) {
    var resolved = t.status === "resolved";
    var heading = admin ? "h2" : "h3";
    return (
      '<article class="card stack" data-ticket-id="' +
      UI.esc(t.id) +
      '"><div class="card__head"><' +
      heading +
      ' class="card__title">' +
      UI.esc(t.title) +
      "</" +
      heading +
      '><span class="badge badge--' +
      (resolved ? "ok" : "pending") +
      '">' +
      (resolved ? "已批复" : "待处理") +
      "</span></div>" +
      '<div class="u-muted u-fs-xs">' +
      (admin ? "提交人 " + UI.esc(t.username) + " · " : "") +
      "可见范围：" +
      UI.esc(P.ticketVisibility[t.visibility] || t.visibility) +
      " · " +
      UI.esc(UI.formatTime(t.created_at)) +
      '</div><div class="prose">' +
      UI.esc(t.content) +
      "</div>" +
      (resolved
        ? '<div class="queue-item__reply stack"><b>批复 · ' +
          UI.esc(t.reply_by || "管理员") +
          (t.replied_at ? " · " + UI.esc(UI.formatTime(t.replied_at)) : "") +
          '</b><div class="prose">' +
          UI.esc(t.reply_content) +
          "</div>" +
          P.picture(t.reply_image, "批复图片") +
          "</div>"
        : admin
          ? '<div><button type="button" class="btn btn--sm" data-reply-ticket="' +
            UI.esc(t.id) +
            '">批复</button></div>'
          : "") +
      "</article>"
    );
  };
  UI.ready(function () {
    UI.qsa(
      '#loginHint a[href="login.html"], .callout a[href="login.html"]',
    ).forEach(function (a) {
      a.href = P.loginUrl();
    });
    ["postForm", "recipeForm", "ticketForm", "annForm"].forEach(function (id) {
      var form = P.el(id);
      if (form) form._guard = UI.guardUnsaved(form);
    });
  });
})();
