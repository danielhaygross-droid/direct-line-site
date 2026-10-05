// The admin view lives inside the store dashboard (sidebar → "Clients & orders").
// Opened on its own, send the user there; opened inside the dashboard, drop the
// page chrome, follow the dashboard's light/dark theme and keep the dashboard told
// about our height so there's no inner scrollbar.
(function () {
  const embedded = window.top !== window.self;
  if (!embedded) { location.replace('/en/#client-orders'); return; }
  document.documentElement.classList.add('embed');
  // Theme: the dashboard is dark unless its <html> says data-theme="light".
  const syncTheme = () => {
    try { document.documentElement.dataset.theme = parent.document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; } catch (e) { /* not same-origin */ }
  };
  syncTheme();
  try { new MutationObserver(syncTheme).observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* ignore */ }
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
