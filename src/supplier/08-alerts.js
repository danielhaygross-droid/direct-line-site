  // ---------- alerts: badge on the bell, a short message, an optional sound, and a notification on this computer / phone ----------
  // Device notifications (16 Nov 2026, Erwin: no email, "just send a notification on their pc or phone when they use the
  // portal"). While the portal is open (also in a background tab), it checks every minute; when something new waits (new
  // orders, cancel requests, quotes, price requests, receipts sent back) the computer or phone shows a notification. No push
  // service: Google's push servers are blocked in China, so nothing arrives when the portal is closed.
  Object.assign(ZH, {
    'Notifications on this device': '在此设备上通知', 'Notifications are on for this device.': '此设备已开启通知。',
    'Notifications are blocked in this browser. Allow them in the browser settings (the lock icon next to the address).': '此浏览器已阻止通知。请在浏览器设置中允许（地址栏旁的锁形图标）。',
    'This browser can’t show notifications. On iPhone: Share, Add to Home Screen, then open the portal from the Home Screen.': '此浏览器无法显示通知。iPhone：点“分享”→“添加到主屏幕”，再从主屏幕打开门户。',
    'Get a notification on this computer or phone when a new order, cancel request, quote or price request comes in (while the portal is open).': '有新订单、取消申请、询价或降价请求时，在此电脑或手机上收到通知（门户打开时）。',
    'Turn on': '开启', 'Not now': '以后再说',
    'quote to answer': '个询价待回复', 'quotes to answer': '个询价待回复',
    'New order': '新订单', 'Cancel request': '取消申请', 'Quote': '询价', 'Price request': '降价请求', 'Receipt sent back': '收据被退回', 'Nothing new.': '没有新内容。',
    'price request': '个降价请求', 'price requests': '个降价请求', 'receipt sent back': '张收据被退回', 'receipts sent back': '张收据被退回',
  });
  let soundOn = false;
  try { soundOn = localStorage.getItem('dl_supplier_sound') === '1'; } catch (e) { /* private mode */ }
  const canNotify = 'Notification' in window;
  const notifyWanted = () => { try { return localStorage.getItem('dl_supplier_notify') === '1'; } catch (e) { return false; } };
  const notifyOn = () => canNotify && Notification.permission === 'granted' && notifyWanted();
  let swReg = null;
  async function registerWorker() {
    if (swReg || !('serviceWorker' in navigator)) return swReg;
    try { swReg = await navigator.serviceWorker.register('/supplier/sw.js', { scope: '/supplier/' }); await navigator.serviceWorker.ready; } catch (e) { swReg = null; }
    return swReg;
  }
  // A click on the notification (handled in sw.js) brings the portal forward and opens the page it is about.
  navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.hash) location.hash = e.data.hash; });
  async function deviceNotify(body, hash) {
    if (!notifyOn()) return;
    const opts = { body, tag: 'dl-supplier', renotify: true, data: { hash } };
    try {
      const reg = await registerWorker();
      if (reg) { await reg.showNotification('Direct Line', opts); return; }
      const n = new Notification('Direct Line', opts); n.onclick = () => { window.focus(); location.hash = hash; n.close(); };
    } catch (e) { /* the phone's browser can't: the bell and the message still show it */ }
  }
  async function setNotify(on) {
    if (!on) { try { localStorage.setItem('dl_supplier_notify', '0'); } catch (e) { /* private mode */ } return; }
    if (!canNotify) { toast(t('This browser can’t show notifications. On iPhone: Share, Add to Home Screen, then open the portal from the Home Screen.')); return; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (p !== 'granted') { toast(t('Notifications are blocked in this browser. Allow them in the browser settings (the lock icon next to the address).')); return; }
    try { localStorage.setItem('dl_supplier_notify', '1'); } catch (e) { /* private mode */ }
    await registerWorker(); toast(t('Notifications are on for this device.')); deviceNotify(t('Notifications are on for this device.'), 'orders');
  }
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
  // What became new since the last check, e.g. "2 new orders · 1 cancel request", and the page to open for it.
  const KINDS = [['newOrders', 'new order', 'new orders', 'orders'], ['cancelRequests', 'cancel request', 'cancel requests', 'orders'], ['quotes', 'quote to answer', 'quotes to answer', 'quotes'], ['requests', 'price request', 'price requests', 'requests'], ['receiptsSentBack', 'receipt sent back', 'receipts sent back', 'receipts']];
  function whatIsNew(before, now) {
    const parts = [], pages = [];
    for (const [k, one, many, page] of KINDS) { const d = Number(now[k] || 0) - Number(before[k] || 0); if (d > 0) { parts.push(`${d} ${t(d === 1 ? one : many)}`); pages.push(page); } }
    return { text: parts.join(' · '), page: pages[0] || 'orders' };
  }
  // The bell lists what waits (17 Nov 2026): each new order, cancel request, quote, price request and receipt sent back; a
  // click opens it. The badge counts all of them.
  const KIND_LABEL = { order: 'New order', cancel: 'Cancel request', quote: 'Quote', request: 'Price request', receipt: 'Receipt sent back' };
  const bellCount = A => ['newOrders', 'cancelRequests', 'quotes', 'requests', 'receiptsSentBack'].reduce((n, k) => n + Number(A?.[k] || 0), 0);
  function bellItem(x) {
    const line = [x.ref, x.title].filter(Boolean).join(' · ') || '—';
    return `<button type="button" class="sp-bitem k-${esc(x.kind)}" data-bell-go="${esc(x.kind)}:${x.id}"><small>${t(KIND_LABEL[x.kind] || '')}</small><span dir="auto">${esc(line)}</span></button>`;
  }
  function bellHTML() {
    const n = bellCount(S.alerts), newN = S.alerts?.newOrders || 0, items = S.alerts?.items || [];
    return `<details class="sp-bell"><summary class="icon-btn" aria-label="${esc(n ? `${n} · ${t('Notifications on this device')}` : t('Nothing new.'))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${n ? `<b class="sp-badge">${n}</b>` : ''}</summary>
      <div class="sp-menu sp-bellmenu"><p class="sp-menu-h">${newN ? esc(newCountText(newN)) : t(items.length ? 'No new orders.' : 'Nothing new.')}</p>
        ${items.length ? `<div class="sp-blist">${items.map(bellItem).join('')}</div>` : ''}${newN ? `<button type="button" data-see-new>${t('See new orders')}</button>` : ''}
        <label class="sp-check"><input type="checkbox" data-notify${notifyOn() ? ' checked' : ''}> <span>${t('Notifications on this device')}</span></label>
        <label class="sp-check"><input type="checkbox" data-sound${soundOn ? ' checked' : ''}> <span>${t('Sound for new orders')}</span></label></div></details>`;
  }
  // Shown on Orders until the supplier turns notifications on or says not now (per browser).
  function notifyBannerHTML() {
    let dismissed = false; try { dismissed = localStorage.getItem('dl_supplier_notify_ask') === 'no'; } catch (e) { /* private mode */ }
    if (S.view || !canNotify || dismissed || notifyOn() || Notification.permission === 'denied') return '';
    return `<div class="sp-notify" role="region" aria-label="${esc(t('Notifications on this device'))}"><p>${t('Get a notification on this computer or phone when a new order, cancel request, quote or price request comes in (while the portal is open).')}</p>
      <div class="sp-btnrow"><button type="button" class="btn btn-primary btn-sm" data-notify-on>${t('Turn on')}</button><button type="button" class="btn btn-sm" data-notify-later>${t('Not now')}</button></div></div>`;
  }
  async function pollAlerts(first = false) {
    try {
      const a = await api('/supplier/alerts'), before = S.alerts;
      S.alerts = a; if (S.seenAt == null) S.seenAt = a.seenAt;
      const bell = $('.sp-bell'); if (bell && !bell.open) bell.outerHTML = bellHTML();
      const nav = $('.sp-nav'); if (nav) nav.innerHTML = navItems('sp-tab'); const bot = $('.sp-bottom'); if (bot) bot.innerHTML = navItems('');
      if (first && a.newOrders) toast(newCountText(a.newOrders));
      if (!first && before) {
        const fresh = whatIsNew(before, a);
        if (fresh.text) {
          toast(fresh.text); beep();
          if (document.hidden || !document.hasFocus()) deviceNotify(fresh.text, fresh.page);
        }
        if (a.newOrders > (before.newOrders || 0) && S.page === 'orders' && !document.activeElement?.dataset?.f) { const d = await api('/supplier/orders'); S.queue = d; render(); }
      }
    } catch (e) { /* try again next minute */ }
  }
  // A click on a line in the bell: open that order, or the page for quotes, price requests or receipts.
  function bellGo(v) {
    const [kind, idText] = v.split(':'), id = Number(idText), page = { quote: 'quotes', receipt: 'receipts' }[kind] || (kind === 'request' ? 'requests' : 'orders');
    $('.sp-bell')?.removeAttribute('open');
    const isOrder = kind === 'order' || kind === 'cancel';
    if (isOrder) { S.openAfter = id; if (location.hash !== '#orders') { location.hash = 'orders'; return; } if (S.queue?.orders.some(o => o.id === id)) { S.openAfter = null; openDrawer(id); } else load(); return; }
    if (location.hash !== '#' + page) location.hash = page;
  }
  async function seeNew() {
    S.page = 'orders'; S.tab = 'new'; S.onlyCancelReq = false;
    if (location.hash !== '#orders') location.hash = 'orders'; else render();
    if (S.view) return;
    try { await api('/supplier/alerts/seen', { method: 'POST' }); S.alerts = { ...(S.alerts || {}), newOrders: 0 }; } catch (e) { /* later */ }
    const bell = $('.sp-bell'); if (bell) bell.outerHTML = bellHTML();
  }
  if (notifyOn()) registerWorker();
  setInterval(() => { if (S.me) pollAlerts(); }, 60000);
