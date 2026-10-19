/* Read the next page's direction before pagereveal snapshots the document. */
(function () {
  try {
    var bannerHeight = Number(sessionStorage.getItem('fuxue-banner-height'));
    if (Number.isFinite(bannerHeight) && bannerHeight > 0 && bannerHeight <= 256) {
      document.documentElement.style.setProperty('--banner-reserved-height', bannerHeight + 'px');
    }
    var pending = JSON.parse(sessionStorage.getItem('fuxue-page-direction') || 'null');
    sessionStorage.removeItem('fuxue-page-direction');
    if (pending && pending.target === location.pathname && Date.now() - pending.at < 2500 &&
        !(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      document.documentElement.dataset.pageDirection = pending.direction;
    }
  } catch (e) { /* Storage may be unavailable. */ }

  function guardTransition(vt) {
    if (!vt) return;
    if (vt.ready && typeof vt.ready.catch === 'function') vt.ready.catch(function () {});
    if (vt.finished && typeof vt.finished.catch === 'function') vt.finished.catch(function () {});
  }
  if ('onpagereveal' in window) {
    window.addEventListener('pagereveal', function (e) { guardTransition(e.viewTransition); });
  }
  if ('onpageswap' in window) {
    window.addEventListener('pageswap', function (e) { guardTransition(e.viewTransition); });
  }
  window.addEventListener('unhandledrejection', function (e) {
    if (e && e.reason && (
      (typeof e.reason.message === 'string' && e.reason.message.indexOf('Transition was aborted') !== -1) ||
      e.reason.name === 'AbortError'
    )) {
      e.preventDefault();
    }
  });
})();
