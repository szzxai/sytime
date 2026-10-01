/* Legacy entry point. New pages load /js/ui.js directly. */
(function () {
  if (window.UI) return;
  var script = document.createElement('script');
  script.src = '/js/ui.js';
  document.head.appendChild(script);
})();
