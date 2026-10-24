// Keep the desktop hero flush with the viewport, including async/dismissed banners.
UI.ready(function () {
  var hero = document.querySelector('.landing-hero');
  if (!hero) return;
  var header = document.getElementById('siteHeader');
  var banner = document.getElementById('siteBanner');
  function fitHero() {
    hero.style.setProperty('--landing-top', ((header ? header.offsetHeight : 0) + (banner ? banner.offsetHeight : 0)) + 'px');
  }
  var observer = new ResizeObserver(fitHero);
  [header, banner].forEach(function (el) { if (el) observer.observe(el); });
  fitHero();

  // Native details semantics, with the reference's single-open 200ms slide.
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var items = Array.from(document.querySelectorAll('.landing-accordion details'));
  var controllers = items.map(function (item) {
    var summary = item.querySelector('summary');
    var content = summary.nextElementSibling;
    var animation = null;
    var expanded = item.open;
    function settle() {
      if (animation) { animation.cancel(); animation = null; }
      item.open = expanded;
      item.removeAttribute('data-closing');
      content.inert = !expanded;
    }
    function setOpen(next) {
      var from = item.open ? content.getBoundingClientRect().height : 0;
      expanded = next;
      if (animation) { animation.cancel(); animation = null; }
      content.inert = !next;
      if (reducedMotion.matches) { settle(); return; }
      item.open = true;
      item.toggleAttribute('data-closing', !next);
      animation = content.animate([
        { height: from + 'px' },
        { height: (next ? content.scrollHeight : 0) + 'px' }
      ], { duration: 200, easing: 'ease-out' });
      animation.onfinish = settle;
    }
    summary.addEventListener('click', function (event) {
      event.preventDefault();
      var next = !expanded;
      if (next) controllers.forEach(function (controller) {
        if (controller.item !== item) controller.close();
      });
      setOpen(next);
    });
    reducedMotion.addEventListener('change', function () {
      if (reducedMotion.matches) settle();
    });
    // Recompute the natural height if wrapping changes during an animation.
    var contentWidth = 0;
    new ResizeObserver(function (entries) {
      var width = entries[0].contentRect.width;
      if (contentWidth && width && width !== contentWidth && animation && expanded) setOpen(true);
      if (width) contentWidth = width;
    }).observe(content.firstElementChild);
    return { item: item, close: function () { if (expanded) setOpen(false); } };
  });
});

(function () {
  "use strict";
  if (location.pathname !== "/" || location.hash) return;
  function go(target) {
    if (
      ["map.html", "recipe.html", "announcements.html"].includes(
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
