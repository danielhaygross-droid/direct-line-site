
  // ---------- pages, events, boot ----------
  function readHash() {
    const h = location.hash.replace(/^#/, ''), m = /^client\/(\d+)$/.exec(h);
    if (m) { S.page = 'client'; S.clientId = Number(m[1]); } else if (h === 'password') S.page = 'password'; else S.page = 'billing';
  }
  const loading = () => `<p class="sp-empty">${t('Loading…')}</p>`;
  const failed = e => `<div class="sp-empty"><p>${esc(e.message)}</p><button type="button" class="btn" data-retry>${t('Try again')}</button></div>`;
  function render() {
    if (!S.me) return loginScreen();
    const body = S.page === 'password' ? passwordHTML()
      : S.page === 'client' ? (S.client && S.client.id === S.clientId ? clientHTML(S.client) : S.error || loading())
      : S.billing ? billingHTML(S.billing) : S.error || loading();
    const y = window.scrollY;
    document.body.innerHTML = shell(body);
    document.title = (S.page === 'client' && S.client ? S.client.name + ' · ' : '') + 'Direct Line · ' + t('Billing');
    if (S.keepScroll) window.scrollTo(0, y);
    S.keepScroll = false;
    bindPassword();
  }
  async function load() {
    S.error = null;
    try {
      if (S.page === 'client') { if (!S.client || S.client.id !== S.clientId) { render(); const d = await api('/supplier/billing/' + S.clientId); S.client = d.client; S.clientAt = d.updatedAt; } }
      else if (S.page === 'billing') { if (!S.billing) render(); const d = await api('/supplier/billing'); S.billing = d; }
    } catch (e) { if (e.status === 401) { S.me = null; return render(); } S.error = failed(e); }
    render();
  }
  document.addEventListener('click', async e => {
    const l = e.target.closest('[data-lang]'); if (l) { setLang(l.dataset.lang); return; }
    if (e.target.closest('[data-logout]')) { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/'; return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const p = e.target.closest('[data-pay]'); if (p) { const id = Number(p.dataset.pay); S.open.has(id) ? S.open.delete(id) : S.open.add(id); S.keepScroll = true; render(); return; }
    const c = e.target.closest('[data-client]'); if (c) { location.hash = 'client/' + c.dataset.client; return; }
  });
  document.addEventListener('keydown', e => { const c = e.target.closest?.('tr[data-client]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = 'client/' + c.dataset.client; } });
  window.addEventListener('hashchange', () => { readHash(); window.scrollTo(0, 0); load(); });
  async function boot() {
    readHash();
    try { S.me = await api('/me'); }
    catch (e) { S.me = null; return render(); }
    if (S.me.role !== 'supplier') { location.href = S.me.role === 'admin' ? '/admin/' : '/portal/'; return; }
    S.billing = null; S.client = null;
    load();
  }

  boot();
})();
