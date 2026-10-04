// The admin view lives inside the store dashboard (sidebar → "Clients & orders").
// Opened on its own, send the user there; opened inside the dashboard, drop the
// page chrome and keep the dashboard told about our height so there's no inner scrollbar.
(function () {
  const embedded = window.top !== window.self;
  if (!embedded) { location.replace('/en/#client-orders'); return; }
  document.documentElement.classList.add('embed');
  let last = 0;
  const send = () => {
    const h = Math.ceil(document.body.getBoundingClientRect().height) + 12;
    if (Math.abs(h - last) < 2) return;
    last = h;
    parent.postMessage({ type: 'dl-admin-height', height: h }, location.origin);
  };
  const start = () => { new ResizeObserver(send).observe(document.body); send(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
