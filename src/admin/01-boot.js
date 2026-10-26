  // ---------- boot ----------
  async function boot() {
    let me;
    try { me = await api('/me'); }
    catch (e) {
      if (e.status === 401 || e.status === 403) return renderLogin(document.body, { title: 'Admin sign in', subtitle: 'Direct Line team access.' });
      $('#boot').textContent = e.message; return;
    }
    if (me.role !== 'admin') { location.href = '/portal/'; return; }
    shell();
    await loadAll();
    $('#boot').remove(); $('#app').hidden = false;
    renderTab();
    addEventListener('message', onParentMessage);
    window.DLAdminReady = true;
    tell({ type: 'dl-admin-ready' });
    setInterval(poll, 20000);
    document.addEventListener('visibilitychange', poll);
  }

  async function loadAll() {
    const [ov, o, p, c, stores, archived] = await Promise.all([api('/admin/overview'), api('/admin/orders'),api('/admin/products'),api('/admin/claims'),api('/admin/client-stores'),api('/admin/orders?archived=1')]);
    S.ov = ov; S.orders = o.orders; S.archivedOrders = archived.orders; S.products=p.products; S.claims=c.claims;S.stores=stores.stores; window.DL.setRates(ov.rates);
    if (S.filter === null) S.filter = S.orders.some(x => x.status === 'cancellation_requested') ? 'cancellation_requested' : S.orders.some(x => x.unreadMessages) ? 'followups' : S.orders.some(x => x.status === 'pending') ? 'pending' : 'all';
    renderKpis();
    tell({ type: 'dl-followups', unread: unreadTotal() });
  }
  // Refresh lists without wiping what the admin is doing.
  async function poll() {
    if (document.hidden || !S.ov || window.DL.idle()) return;
    const a = document.activeElement;
    const busy = a && a.matches('select, input, textarea') && !a.matches('[data-q],[data-cq]');
    try { await loadAll(); } catch (e) { return; }
    if (!busy) { renderList(); if (S.drawer?.kind==='client' && S.drawer.tab==='payments') await loadPayments(S.drawer.id); else refreshDrawer(); }
  }

