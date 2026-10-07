// "Direct Line clients" inside the dashboard: the admin view (overview, client orders, clients &
// payments, fees & settings) shown as the first group in the sidebar. It is also the landing page
// after sign-in; Daniel's own stores are the second group.
(function () {
  const section = document.getElementById('client-orders');
  const buttons = Array.from(document.querySelectorAll('.nav-item[data-client-tab]'));
  if (!section || !buttons.length) return;
  const frame = section.querySelector('iframe');
  const HASH = '#client-orders';
  const TABS = ['overview', 'orders', 'clients', 'settings'];
  let ready = false, queue = [], current = 'overview';
  const send = m => { if (ready) frame.contentWindow.postMessage(m, location.origin); else queue.push(m); };

  function sizeFrame() {
    if (section.hidden) return;
    const top = Math.max(0, frame.getBoundingClientRect().top);
    frame.style.height = Math.max(480, window.innerHeight - top) + 'px';
  }
  const mark = tab => document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.clientTab === tab));
  const hashFor = tab => (tab === 'overview' ? HASH : HASH + '/' + tab);
  const authed = () => document.body.classList.contains('authenticated');

  function open(tab = 'overview') {
    if (!TABS.includes(tab)) tab = 'overview';
    if (!frame.src && authed()) frame.src = frame.dataset.src;
    section.hidden = false;
    document.body.classList.add('client-orders-open');
    current = tab; mark(tab);
    document.body.classList.remove('menu-open');
    document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
    if (location.hash !== hashFor(tab)) history.replaceState(null, '', hashFor(tab));
    send({ type: 'dl-set-tab', tab });
    window.scrollTo({ top: 0 });
    requestAnimationFrame(sizeFrame);
  }
  function close() {
    if (section.hidden) return;
    section.hidden = true;
    document.body.classList.remove('client-orders-open');
    buttons.forEach(b => b.classList.remove('active'));
    if (location.hash.startsWith(HASH)) history.replaceState(null, '', location.pathname + location.search);
  }
  const tabFromHash = () => (location.hash.startsWith(HASH) ? (location.hash.slice(HASH.length + 1) || 'overview') : null);

  buttons.forEach(b => b.addEventListener('click', () => open(b.dataset.clientTab)));
  // Any of Daniel's store pages closes this one (the dashboard handles its own nav after us).
  document.addEventListener('click', e => { if (e.target.closest('.nav-item[data-section], [data-section-jump], [data-store-chip]')) close(); }, true);
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const m = e.data || {};
    if (m.type === 'dl-admin-ready') { ready = true; frame.dataset.ready = 'true'; queue.forEach(x => frame.contentWindow.postMessage(x, location.origin)); queue = []; }
    if (m.type === 'dl-tab-changed' && !section.hidden && TABS.includes(m.tab)) { current = m.tab; mark(m.tab); if (location.hash !== hashFor(m.tab)) history.replaceState(null, '', hashFor(m.tab)); }
    if (m.type === 'dl-followups') { const b = document.querySelector('[data-client-badge]'); if (b) { b.textContent = m.unread > 9 ? '9+' : String(m.unread || ''); b.hidden = !m.unread; } }
  });
  window.addEventListener('resize', sizeFrame);
  window.addEventListener('hashchange', () => { const t = tabFromHash(); if (t) open(t); else close(); });

  // Landing page: after sign-in, start on the clients overview unless a link asked for something else.
  let landed = false;
  function land() {
    if (landed || !authed()) return;
    landed = true;
    const t = tabFromHash();
    if (t) open(t);
    else if (!location.hash) open('overview');
    if (!section.hidden && !frame.src) frame.src = frame.dataset.src;
  }
  new MutationObserver(land).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  land();
  // The dashboard re-marks its own nav on every render; keep our item highlighted while this section is open.
  if (typeof renderAll === 'function') { const orig = renderAll; renderAll = function () { const r = orig.apply(this, arguments); if (!section.hidden) mark(current); return r; }; }
  window.DLClients = { open, send };
  window.DLOpenClient = id => { open('clients'); send({ type: 'dl-open-client', id }); };
})();
