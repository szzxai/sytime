(function () {
  "use strict";
  if (location.pathname !== "/" || location.hash) return;
  function go(target) {
    if (
      ["map.html", "forum.html", "recipe.html", "announcements.html"].includes(
        target,
      )
    )
      location.replace(target);
  }
  var fallback = localStorage.getItem("defaultPage");
  if (!UI.session.token()) {
    go(fallback);
    return;
  }
  UI.api("/api/user/profile", { on401: false }).then(function (r) {
    go(r.ok && r.data.user ? r.data.user.default_page : fallback);
  });
})();
