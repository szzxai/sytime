(function () {
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function injectStyle() {
    if (document.getElementById("authJsStyle")) return;
    var style = document.createElement("style");
    style.id = "authJsStyle";
    style.textContent =
      ".nav-avatar{display:inline-flex;align-items:center;justify-content:center;" +
      "width:38px;height:38px;border-radius:50%;border:2px solid #000000;" +
      "overflow:hidden;text-decoration:none;background:#000000;color:#ffffff;" +
      "font-size:16px;font-weight:bold;line-height:1;font-family:inherit;}" +
      ".nav-avatar img{width:100%;height:100%;object-fit:cover;display:block;}" +
      ".nav-avatar:hover{opacity:0.75;}" +
      ".site-banner{position:relative;background:#000000;color:#ffffff;text-align:center;" +
      "padding:8px 44px;font-size:14px;letter-spacing:1px;word-break:break-word;}" +
      ".site-banner-close{position:absolute;right:8px;top:50%;transform:translateY(-50%);" +
      "background:none;border:none;color:#ffffff;font-size:18px;line-height:1;" +
      "cursor:pointer;font-family:inherit;padding:0 6px;}" +
      ".header{position:relative;max-height:120px;overflow:hidden;" +
      "transition:max-height 0.35s ease,padding 0.35s ease,opacity 0.35s ease,border-bottom-width 0.35s ease;}" +
      "body.nav-collapsed .header{max-height:0;padding-top:0;padding-bottom:0;" +
      "border-bottom-width:0;opacity:0;}" +
      ".main{transition:height 0.35s ease;height:calc(100% - 63px - var(--banner-h,0px));}" +
      "body.nav-collapsed .main{height:calc(100% - var(--banner-h,0px));}" +
      ".layout{transition:min-height 0.35s ease;min-height:calc(100vh - 63px - var(--banner-h,0px));}" +
      "body.nav-collapsed .layout{min-height:calc(100vh - var(--banner-h,0px));}" +
      "#map{transition:top 0.35s ease;top:calc(63px + var(--banner-h,0px));}" +
      "body.nav-collapsed #map{top:var(--banner-h,0px);}" +
      ".top-right{transition:top 0.35s ease;top:calc(95px + var(--banner-h,0px));}" +
      "body.nav-collapsed .top-right{top:calc(30px + var(--banner-h,0px));}" +
      ".tri{display:inline-block;width:0;height:0;}" +
      ".tri-up{border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:7px solid #000000;}" +
      ".tri-down{border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #000000;}" +
      ".header-toggle{position:absolute;top:calc(63px + var(--banner-h,0px));right:14px;z-index:2000;" +
      "width:44px;height:22px;padding:0;border:2px solid #000000;border-top:none;background:#ffffff;" +
      "cursor:pointer;align-items:center;justify-content:center;line-height:0;}" +
      ".header-collapse{display:flex;}" +
      "body.nav-collapsed .header-collapse{display:none;}" +
      ".header-expand{position:fixed;top:var(--banner-h,0px);display:none;}" +
      "body.nav-collapsed .header-expand{display:flex;}" +
      ".logo{position:relative;cursor:pointer;user-select:none;}" +
      ".logo:hover{text-decoration:underline;}";
    document.head.appendChild(style);
  }

  function setupHeaderCollapse() {
    var header = document.querySelector(".header");
    if (!header || document.getElementById("headerCollapseBtn")) return;

    var collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.id = "headerCollapseBtn";
    collapseBtn.className = "header-toggle header-collapse";
    collapseBtn.title = "收起菜单栏";
    collapseBtn.setAttribute("aria-label", "收起菜单栏");
    collapseBtn.innerHTML = '<span class="tri tri-up"></span>';
    document.body.appendChild(collapseBtn);

    var expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.id = "headerExpandBtn";
    expandBtn.className = "header-toggle header-expand";
    expandBtn.title = "展开菜单栏";
    expandBtn.setAttribute("aria-label", "展开菜单栏");
    expandBtn.innerHTML = '<span class="tri tri-down"></span>';
    document.body.appendChild(expandBtn);

    function apply(collapsed) {
      document.body.classList.toggle("nav-collapsed", collapsed);
      localStorage.setItem("navCollapsed", collapsed ? "1" : "0");
    }

    collapseBtn.addEventListener("click", function () { apply(true); });
    expandBtn.addEventListener("click", function () { apply(false); });
    apply(localStorage.getItem("navCollapsed") === "1");
  }

  function setupLogoMenu() {
    var logo = document.querySelector(".logo");
    if (!logo) return;
    logo.addEventListener("click", function () {
      location.href = "index.html";
    });
  }

  function loginButtons() {
    return '<a class="btn" href="login.html">登录</a><a class="btn" href="register.html">注册</a>';
  }

  function adminLink(user) {
    if (!user) return "";
    var weight = ROLE_WEIGHTS[user.role] || 0;
    var hasPerms = user.permissions && user.permissions.length > 0;
    if (weight >= ROLE_WEIGHTS.super_admin || hasPerms) {
      return '<a class="btn" href="admin.html">管理后台</a>';
    }
    return "";
  }

  var ROLE_WEIGHTS = { developer: 6, super_admin: 5, admin: 4, student: 3, user: 2, guest: 1 };

  function studentLink(user) {
    if (user && (ROLE_WEIGHTS[user.role] || 0) >= ROLE_WEIGHTS.student) return "";
    return '<a class="btn" href="student_verify.html">学生认证</a>';
  }

  function avatarHtml(user) {
    var name = user.nickname || user.username || "";
    var inner = user.avatar_url
      ? '<img src="' + escapeHtml(user.avatar_url) + '" alt="' + escapeHtml(name) + '">'
      : escapeHtml(name.slice(0, 1));
    return '<a class="nav-avatar" href="profile.html" title="' + escapeHtml(name) + '">' + inner + '</a>';
  }

  function renderAuth() {
    var area = document.getElementById("authArea") || document.querySelector(".auth");
    if (!area) return;
    var token = localStorage.getItem("token");
    if (!token) {
      area.innerHTML = loginButtons();
      return;
    }
    fetch("/api/user/profile", { headers: { "Authorization": "Bearer " + token } })
      .then(function (res) {
        if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          area.innerHTML = loginButtons();
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.user) return;
        localStorage.setItem("user", JSON.stringify(data.user));
        area.innerHTML = studentLink(data.user) + adminLink(data.user) + avatarHtml(data.user);
      })
      .catch(function () {
        var user = null;
        try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch (e) { user = null; }
        area.innerHTML = user && user.username ? studentLink(user) + adminLink(user) + avatarHtml(user) : loginButtons();
      });
  }

  function bannerDismissKey() {
    var user = null;
    try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch (e) { user = null; }
    var name = user && user.username ? user.username : "guest";
    return "bannerDismissed:" + name;
  }

  function renderBanner() {
    if (document.querySelector(".site-banner")) return;
    fetch("/api/settings/banner")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var text = data && data.banner ? String(data.banner) : "";
        if (!text) return;
        var version = data && data.version !== undefined ? String(data.version) : "0";
        var key = bannerDismissKey();
        if (localStorage.getItem(key) === version) return;

        var banner = document.createElement("div");
        banner.className = "site-banner";
        var span = document.createElement("span");
        span.textContent = text;
        banner.appendChild(span);

        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "site-banner-close";
        closeBtn.setAttribute("aria-label", "关闭横幅");
        closeBtn.innerHTML = "&times;";
        closeBtn.addEventListener("click", function () {
          localStorage.setItem(key, version);
          if (banner.parentNode) banner.parentNode.removeChild(banner);
          document.documentElement.style.setProperty("--banner-h", "0px");
        });
        banner.appendChild(closeBtn);

        var header = document.querySelector(".header");
        if (header) {
          document.body.insertBefore(banner, header);
        } else {
          document.body.insertBefore(banner, document.body.firstChild);
        }
        document.documentElement.style.setProperty("--banner-h", banner.offsetHeight + "px");
      })
      .catch(function () {});
  }

  window.renderAuth = renderAuth;
  injectStyle();

  function init() {
    setupHeaderCollapse();
    setupLogoMenu();
    renderBanner();
    renderAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("resize", function () {
    var banner = document.querySelector(".site-banner");
    if (banner) {
      document.documentElement.style.setProperty("--banner-h", banner.offsetHeight + "px");
    }
  });
})();
