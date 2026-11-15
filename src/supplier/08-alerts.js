
  // ---------- new-order alerts: badge on the bell, a short message, an optional sound ----------
  let soundOn = false;
  try { soundOn = localStorage.getItem('dl_supplier_sound') === '1'; } catch (e) { /* private mode */ }
  function beep() {
    if (!soundOn) return;
    try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.4); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.45); } catch (e) { /* no sound */ }
  }
  function toast(text) {
    $('.sp-toast')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="sp-toast" role="status">${esc(text)}</div>`);
    setTimeout(() => $('.sp-toast')?.remove(), 4000);
  }
  const newCountText = n => `${n} ${t(n === 1 ? 'new order' : 'new orders')}`;
  function bellHTML() {
    const n = S.alerts?.newOrders || 0;
    return `<details class="sp-bell"><summary class="icon-btn" aria-label="${esc(newCountText(n))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${n ? `<b class="sp-badge">${n}</b>` : ''}</summary>
      <div class="sp-menu"><p class="sp-menu-h">${n ? esc(newCountText(n)) : t('No new orders.')}</p>${n ? `<button type="button" data-see-new>${t('See new orders')}</button>` : ''}
        <label class="sp-check"><input type="checkbox" data-sound${soundOn ? ' checked' : ''}> <span>${t('Sound for new orders')}</span></label></div></details>`;
  }
  async function pollAlerts(first = false) {
    try {
      const a = await api('/supplier/alerts'), before = S.alerts?.newOrders ?? null;
      S.alerts = a; if (S.seenAt == null) S.seenAt = a.seenAt;
      const bell = $('.sp-bell'); if (bell && !bell.open) bell.outerHTML = bellHTML();
      const nav = $('.sp-nav'); if (nav) nav.innerHTML = navItems('sp-tab'); const bot = $('.sp-bottom'); if (bot) bot.innerHTML = navItems('');
      if (first && a.newOrders) toast(newCountText(a.newOrders));
      if (!first && before != null && a.newOrders > before) {
        toast(newCountText(a.newOrders)); beep();
        if (S.page === 'orders' && !document.activeElement?.dataset?.f) { const d = await api('/supplier/orders'); S.queue = d; render(); }
      }
    } catch (e) { /* try again next minute */ }
  }
  async function seeNew() {
    S.page = 'orders'; S.tab = 'new'; S.onlyCancelReq = false;
    if (location.hash !== '#orders') location.hash = 'orders'; else render();
    if (S.view) return;
    try { await api('/supplier/alerts/seen', { method: 'POST' }); S.alerts = { ...(S.alerts || {}), newOrders: 0 }; } catch (e) { /* later */ }
    const bell = $('.sp-bell'); if (bell) bell.outerHTML = bellHTML();
  }
  setInterval(() => { if (S.me) pollAlerts(); }, 60000);
