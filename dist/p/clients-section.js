// "Clients & orders" inside the store dashboard: shows the admin view (clients,
// orders, payments, earnings) as a section of the dashboard instead of a separate page.
(function () {
  const btn = document.getElementById('nav-client-orders');
  const section = document.getElementById('client-orders');
  if (!btn || !section) return;
  const frame = section.querySelector('iframe');
  const HASH = '#client-orders';

  function open() {
    if (!frame.src) frame.src = frame.dataset.src;
    section.hidden = false;
    document.body.classList.add('client-orders-open');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n === btn));
    document.body.classList.remove('menu-open');
    document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
    if (location.hash !== HASH) history.replaceState(null, '', HASH);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function close() {
    if (section.hidden) return;
    section.hidden = true;
    document.body.classList.remove('client-orders-open');
    btn.classList.remove('active');
    if (location.hash === HASH) history.replaceState(null, '', location.pathname + location.search);
  }

  // ----- real client accounts in the top "Client" dropdown -----
  const he = document.documentElement.lang === 'he';
  const select = document.getElementById('client-select');
  let pendingClient = null, frameReady = false, loaded = false;

  function showClient(id) {
    open();
    pendingClient = id;
    if (frameReady) { frame.contentWindow.postMessage({ type: 'dl-open-client', id }, location.origin); pendingClient = null; }
  }

  async function loadClients(force) {
    if ((loaded && !force) || !select) return;
    try {
      const res = await fetch('/api/portal/admin/overview', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      loaded = true;
      select.querySelector('optgroup[data-dl-clients]')?.remove();
      const group = document.createElement('optgroup');
      group.label = he ? 'לקוחות Direct Line' : 'Direct Line clients';
      group.dataset.dlClients = '';
      (data.clients || []).forEach(c => {
        const o = document.createElement('option');
        o.value = 'dl:' + c.id;
        o.textContent = c.name + (c.active ? '' : (he ? ' (מושבת)' : ' (disabled)'));
        group.appendChild(o);
      });
      if (!group.children.length) {
        const o = document.createElement('option'); o.disabled = true;
        o.textContent = he ? 'אין לקוחות עדיין' : 'No clients yet'; group.appendChild(o);
      }
      select.appendChild(group);
    } catch (e) { /* not signed in yet */ }
  }

  if (select) {
    let previous = select.value;
    select.addEventListener('focus', () => { previous = select.value; loadClients(true); });
    select.addEventListener('pointerdown', () => { previous = select.value; });
    // Runs before the dashboard's own handler; Direct Line clients never reach it.
    document.addEventListener('change', e => {
      if (e.target !== select || !select.value.startsWith('dl:')) return;
      e.stopImmediatePropagation();
      const id = Number(select.value.slice(3));
      select.value = previous;
      showClient(id);
    }, true);
    new MutationObserver(() => { if (document.body.classList.contains('authenticated')) loadClients(); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    loadClients();
  }

  btn.addEventListener('click', open);
  // Any other dashboard section closes this one (the dashboard handles its own nav after us).
  document.addEventListener('click', e => {
    if (e.target.closest('.nav-item[data-section], [data-section-jump]')) close();
  }, true);
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data?.type === 'dl-admin-height') frame.style.height = Math.max(400, Number(e.data.height) || 0) + 'px';
    if (e.data?.type === 'dl-admin-ready') {
      frameReady = true;
      if (pendingClient) { frame.contentWindow.postMessage({ type: 'dl-open-client', id: pendingClient }, location.origin); pendingClient = null; }
    }
    if (e.data?.type === 'dl-clients-changed') { loaded = false; loadClients(); }
  });
  window.addEventListener('hashchange', () => (location.hash === HASH ? open() : close()));
  if (location.hash === HASH) open();
})();
