
  // ---------- pages, events, boot ----------
  function readHash() {
    const h = location.hash.replace(/^#/, ''), m = /^client\/(\d+)$/.exec(h);
    if (m) { S.page = 'client'; S.clientId = Number(m[1]); } else if (h === 'password') S.page = 'password'; else if (['billing', 'quotes', 'requests', 'receipts'].includes(h)) S.page = h; else S.page = 'orders';
  }
  const loading = () => `<p class="sp-empty">${t('Loading…')}</p>`;
  const failed = e => `<div class="sp-empty"><p>${esc(e.message)}</p><button type="button" class="btn" data-retry>${t('Try again')}</button></div>`;
  function render() {
    if (!S.me) return loginScreen();
    const body = S.page === 'password' ? passwordHTML()
      : S.page === 'client' ? (S.client && S.client.id === S.clientId ? clientHTML(S.client) : S.error || loading())
      : S.page === 'orders' ? ordersHTML() : S.page === 'quotes' ? quotesHTML() : S.page === 'requests' ? requestsHTML() : S.page === 'receipts' ? receiptsHTML()
      : S.billing ? billingHTML(S.billing) : S.error || loading();
    const y = window.scrollY, drawer = S.drawer;
    document.body.innerHTML = shell(body);
    document.title = (S.page === 'client' && S.client ? S.client.name + ' · ' : '') + 'Direct Line · ' + t({ orders: 'Orders', quotes: 'Quotes', requests: 'Price requests', receipts: 'Receipts' }[S.page] || 'Billing');
    if (S.keepScroll) window.scrollTo(0, y);
    S.keepScroll = false;
    bindPassword();
    if (drawer && S.page === 'orders') openDrawer(drawer);
    else if (S.openAfter && S.page === 'orders' && S.queue?.orders.some(o => o.id === S.openAfter)) { const id = S.openAfter; S.openAfter = null; openDrawer(id); }
  }
  async function load() {
    S.error = null;
    try {
      if (S.page === 'client') { if (!S.client || S.client.id !== S.clientId) { render(); const d = await api('/supplier/billing/' + S.clientId); S.client = d.client; S.clientAt = d.updatedAt; } }
      else if (S.page === 'billing') { if (!S.billing) render(); const d = await api('/supplier/billing'); S.billing = d; }
      else if (S.page === 'orders') { if (!S.queue) render(); S.queue = await api('/supplier/orders'); S.pinned.clear(); }
      else if (S.page === 'quotes') { if (!S.quotes) render(); S.quotes = await api('/supplier/quotes'); }
      else if (S.page === 'requests') { if (!S.requests) render(); S.requests = await api('/supplier/price-requests'); }
      else if (S.page === 'receipts') { if (!S.receipts) render(); S.receipts = await api('/supplier/receipts'); }
    } catch (e) { if (e.status === 401) { S.me = null; return render(); } S.error = failed(e); }
    render();
  }
  const rerenderOrders = () => { S.keepScroll = true; render(); };
  document.addEventListener('click', async e => {
    const l = e.target.closest('[data-lang]'); if (l) { setLang(l.dataset.lang); return; }
    if (e.target.closest('[data-supplier-login]')) { S.me = null; S.view = false; render(); return; }
    if (e.target.closest('[data-logout]')) { await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-dl-portal': S.view ? 'admin' : 'supplier' } }).catch(() => {}); location.href = S.view ? '/' : '/supplier/'; return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    if (e.target.closest('[data-see-new]')) { seeNew(); return; }
    const bg = e.target.closest('[data-bell-go]'); if (bg) { bellGo(bg.dataset.bellGo); return; }
    if (e.target.closest('[data-notify-on]')) { setNotify(true).then(() => { $('.sp-notify')?.remove(); const b = $('.sp-bell'); if (b && !b.open) b.outerHTML = bellHTML(); }); return; }
    if (e.target.closest('[data-notify-later]')) { try { localStorage.setItem('dl_supplier_notify_ask', 'no'); } catch (x) { /* private mode */ } $('.sp-notify')?.remove(); return; }
    const p = e.target.closest('[data-pay]'); if (p) { const id = Number(p.dataset.pay); S.open.has(id) ? S.open.delete(id) : S.open.add(id); S.keepScroll = true; render(); return; }
    const c = e.target.closest('[data-client]'); if (c) { location.hash = 'client/' + c.dataset.client; return; }
    // Orders
    const qt = e.target.closest('[data-qtab]'); if (qt) { S.qtab = qt.dataset.qtab; rerenderOrders(); return; }
    const rt = e.target.closest('[data-rtab]'); if (rt) { S.rtab = rt.dataset.rtab; rerenderOrders(); return; }
    const rct = e.target.closest('[data-rctab]'); if (rct) { S.rcTab = rct.dataset.rctab; rerenderOrders(); return; }
    const qe = e.target.closest('[data-qedit]'); if (qe) { S.qEdit.add(Number(qe.dataset.qedit)); rerenderOrders(); return; }
    const av = e.target.closest('[data-avail]'); if (av) { const [pid, v] = av.dataset.avail.split(':'); S.qAvail[pid] = v === '1'; rerenderOrders(); return; }
    const tb = e.target.closest('[data-tab]'); if (tb) { S.tab = tb.dataset.tab; S.onlyCancelReq = false; S.pinned.clear(); S.limit = 50; rerenderOrders(); return; }
    if (e.target.closest('[data-cxreq]')) { S.onlyCancelReq = !S.onlyCancelReq; rerenderOrders(); return; }
    if (e.target.closest('[data-filters]')) { S.showFilters = !S.showFilters; rerenderOrders(); return; }
    if (e.target.closest('[data-clear]')) { S.q = ''; S.f = {}; S.onlyCancelReq = false; rerenderOrders(); return; }
    if (e.target.closest('[data-more]')) { S.limit += 50; rerenderOrders(); return; }
    if (e.target.closest('[data-export-orders]')) { exportOrders(); return; }
    const op = e.target.closest('[data-open]'); if (op) { openDrawer(Number(op.dataset.open)); return; }
    if (e.target.closest('[data-close]')) { closeDrawer(); return; }
    if (e.target.closest('[data-next]')) { nextOrder(); return; }
    const ph = e.target.closest('[data-photo]'); if (ph) { S.photo = Number(ph.dataset.photo); drawerFill(); return; }
    const ca = e.target.closest('[data-copy-address]'); if (ca) { const o = S.queue?.orders.find(x => x.id === Number(ca.dataset.copyAddress)); if (o) copyText(addressText(o), ca); return; }
    const cp = e.target.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy, cp); return; }
  });
  // Gold boxes save when they change (selects) or when you leave them (text); Enter saves and jumps to the same box in the next order.
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-notify]')) { setNotify(el.checked).then(() => { el.checked = notifyOn(); }); return; }
    if (el.matches('[data-sound]')) { soundOn = el.checked; try { localStorage.setItem('dl_supplier_sound', soundOn ? '1' : '0'); } catch (x) { /* private mode */ } if (soundOn) beep(); return; }
    if (el.matches('[data-fl]')) { S.f = { ...S.f, [el.dataset.fl]: el.type === 'checkbox' ? el.checked : el.value }; S.limit = 50; rerenderOrders(); return; }
    if (el.matches('[data-rchoice]')) { S.rChoice[el.dataset.rchoice] = el.value; rerenderOrders(); return; }
    if (el.matches('[data-o][data-f]')) saveBox(el);
  });
  let qTimer;
  document.addEventListener('input', e => {
    if (e.target.matches('[data-q]')) { clearTimeout(qTimer); const v = e.target.value; qTimer = setTimeout(() => { S.q = v; S.limit = 50; rerenderOrders(); const q = $('[data-q]'); if (q) { q.focus(); q.setSelectionRange(v.length, v.length); } }, 250); }
  });
  document.addEventListener('keydown', e => {
    const c = e.target.closest?.('tr[data-client]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = 'client/' + c.dataset.client; return; }
    if (e.key === 'Escape' && S.drawer) { closeDrawer(); return; }
    const el = e.target; if (e.key !== 'Enter' || !el.matches?.('input[data-o][data-f]')) return;
    e.preventDefault();
    saveBox(el);
    const f = el.dataset.f, scope = el.closest('#sp-drawer') ? null : el.closest('.sp-qcards') ? '.sp-ocard' : 'tr', id = el.dataset.o;
    if (scope) { const boxes = [...document.querySelectorAll(`${scope}[data-row] input[data-f="${f}"]:not([disabled])`)], i = boxes.findIndex(b => b.dataset.o === id); (boxes[i + 1] || el).focus(); boxes[i + 1]?.select(); }
    else el.blur();
  });
  document.addEventListener('submit', e => {
    const q = e.target.closest('form[data-quote]'); if (q) { e.preventDefault(); sendQuote(q); return; }
    const r = e.target.closest('form[data-req]'); if (r) { e.preventDefault(); sendRequest(r); return; }
    const rc = e.target.closest('form[data-receipt]'); if (rc) { e.preventDefault(); sendReceipt(rc); return; }
  });
  window.addEventListener('hashchange', () => { readHash(); closeDrawer(); window.scrollTo(0, 0); load(); });
  async function boot() {
    readHash();
    try { S.me = await api('/me'); }
    catch (e) { S.me = null; return render(); }
    // An admin works in the supplier portal with the supplier's screens (edits are recorded under the admin's name).
    if (S.me.role === 'admin') { S.view = true; S.me = { ...S.me, name: t('Admin view') }; }
    else if (S.me.role !== 'supplier') { location.href = '/portal/'; return; }
    S.billing = null; S.client = null; S.queue = null;
    await pollAlerts(true);
    load();
  }

  boot();
})();
