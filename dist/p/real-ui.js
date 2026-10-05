// Real notifications (bell) and a real "last updated" time in the sidebar.
// Replaces the dashboard's sample notifications, which always showed the same 3 items.
(function () {
  if (typeof renderAll !== 'function' || typeof state === 'undefined') return;
  const HE = document.documentElement.lang === 'he';
  const L = (en, he) => (HE ? he : en);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => (typeof exactMoney === 'function' ? exactMoney(n) : '$' + Number(n || 0).toFixed(2));
  const SEEN_KEY = 'dl_seen_notifications';
  const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { return {}; } };
  const writeSeen = v => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } };

  let portal = null, portalOrders = null, lastPortalLoad = 0;
  async function loadPortal(force) {
    if (!force && Date.now() - lastPortalLoad < 60000) return;
    lastPortalLoad = Date.now();
    try {
      const [o, ord] = await Promise.all([
        fetch('/api/portal/admin/overview', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)),
        fetch('/api/portal/admin/orders', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)),
      ]);
      portal = o && o.ok ? o : null; portalOrders = ord && ord.ok ? ord.orders : null;
    } catch (e) { /* offline or not signed in */ }
  }

  const SHIPPED = ['נשלח', 'Shipped', 'Delivered'], CANCELLED = ['בוטלה', 'בוטל', 'Cancelled'];
  // Each notice: id (stable), sig (changes when the situation changes), level, title, text, view.
  function notices() {
    const list = [];
    const shop = typeof liveShopify !== 'undefined' ? liveShopify : null;
    const sup = typeof supplierLive !== 'undefined' && supplierLive ? supplierLive.orders || [] : [];
    if (shop && Array.isArray(shop.orders)) {
      const toShip = shop.orders.filter(o => !o.cancelledAt && !['FULFILLED', 'RESTOCKED'].includes(o.displayFulfillmentStatus));
      if (toShip.length) list.push({ id: 'shopify-to-ship', sig: toShip.map(o => o.name).join(','), level: 'high', view: 'orders',
        title: L(`${toShip.length} Z-Royal order${toShip.length > 1 ? 's' : ''} to ship`, `${toShip.length} הזמנות Z-Royal ממתינות למשלוח`),
        text: toShip.map(o => o.name).slice(0, 5).join(', ') });
    } else if (typeof shopifyUnavailable !== 'undefined' && shopifyUnavailable) {
      list.push({ id: 'shopify-off', sig: 'off', level: 'medium', view: 'data', title: L('Shopify isn’t connected', 'Shopify לא מחובר'), text: L('Z-Royal sales can’t be shown until it’s connected.', 'אי אפשר להציג את המכירות של Z-Royal עד שיחובר.') });
    }
    const open = sup.filter(o => !CANCELLED.includes(o.shippingStatus) && !SHIPPED.includes(o.shippingStatus));
    if (open.length) list.push({ id: 'supplier-open', sig: open.map(o => o.orderNumber).join(','), level: 'medium', view: 'shipments',
      title: L(`${open.length} supplier order${open.length > 1 ? 's' : ''} not shipped yet`, `${open.length} הזמנות ספק שעוד לא נשלחו`),
      text: L('Still processing or waiting at the supplier.', 'עדיין בטיפול או ממתינות אצל הספק.') });
    const noTrack = sup.filter(o => SHIPPED.includes(o.shippingStatus) && !o.trackingNumber);
    if (noTrack.length) list.push({ id: 'supplier-notrack', sig: noTrack.map(o => o.orderNumber).join(','), level: 'high', view: 'shipments',
      title: L(`${noTrack.length} shipped order${noTrack.length > 1 ? 's' : ''} without tracking`, `${noTrack.length} הזמנות שנשלחו בלי מספר מעקב`),
      text: noTrack.map(o => o.orderNumber).slice(0, 4).join(', ') });
    const unpaid = sup.filter(o => o.paymentStatus === 'Unpaid' && !CANCELLED.includes(o.shippingStatus));
    if (unpaid.length) list.push({ id: 'supplier-unpaid', sig: unpaid.map(o => o.orderNumber).join(','), level: 'medium', view: 'profit',
      title: L(`${unpaid.length} order${unpaid.length > 1 ? 's' : ''} unpaid to the supplier`, `${unpaid.length} הזמנות שלא שולמו לספק`),
      text: money(unpaid.reduce((t, o) => t + Number(o.supplierCost || 0) * Number(o.quantity || 1), 0)) });
    if (portalOrders) {
      const pending = portalOrders.filter(o => o.status === 'pending');
      if (pending.length) list.push({ id: 'client-pending', sig: pending.map(o => o.id).join(','), level: 'high', view: 'client-orders',
        title: L(`${pending.length} new client order${pending.length > 1 ? 's' : ''} waiting`, `${pending.length} הזמנות לקוח חדשות ממתינות`),
        text: L('Marked pending in Clients & orders.', 'מסומנות כממתינות בלקוחות והזמנות.') });
    }
    if (portal && portal.clients) {
      const owing = portal.clients.filter(c => c.outstanding > 0);
      if (owing.length) list.push({ id: 'client-owing', sig: owing.map(c => c.id + ':' + c.outstanding).join(','), level: 'low', view: 'client-orders',
        title: L(`${owing.length} client${owing.length > 1 ? 's' : ''} with a balance due`, `${owing.length} לקוחות עם יתרה לתשלום`),
        text: money(owing.reduce((t, c) => t + c.outstanding, 0)) + L(' outstanding', ' לגבייה') });
    }
    return list;
  }
  const unread = list => { const seen = readSeen(); return list.filter(n => seen[n.id] !== n.sig); };

  // ----- bell -----
  const old = $('.notifications');
  if (!old) return;
  const bell = old.cloneNode(true); // drop the sample handler
  old.replaceWith(bell);
  let badge = bell.querySelector('i');
  if (!badge) { badge = document.createElement('i'); bell.appendChild(badge); }
  function updateBadge() {
    const n = unread(notices()).length;
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.hidden = n === 0;
    bell.setAttribute('aria-label', n ? L(`Notifications, ${n} new`, `התראות, ${n} חדשות`) : L('Notifications', 'התראות'));
  }
  async function openBell() {
    await loadPortal(true);
    const list = notices(), fresh = new Set(unread(list).map(n => n.id));
    const body = list.length
      ? `<div class="notification-list">${list.map(n => `<button type="button" data-dl-notice="${n.view}"><i class="severity ${n.level}"></i><span><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span><em>${fresh.has(n.id) ? L('New', 'חדש') : ''}</em></button>`).join('')}</div>`
      : `<p class="ls-muted">${L('Nothing needs your attention right now.', 'אין כרגע משהו שדורש טיפול.')}</p>`;
    openDetail(L('Notifications', 'התראות'), list.length ? L(`${list.length} thing${list.length > 1 ? 's' : ''} to check`, `${list.length} דברים לבדיקה`) : L('All clear', 'הכל תקין'), body);
    // Opening the bell marks everything as seen; an item comes back as "new" only when it changes.
    const seen = readSeen(); list.forEach(n => { seen[n.id] = n.sig; }); writeSeen(seen);
    updateBadge();
  }
  bell.addEventListener('click', openBell);
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-dl-notice]'); if (!n) return;
    document.getElementById('detail-dialog')?.close();
    const v = n.dataset.dlNotice;
    if (v === 'client-orders') document.getElementById('nav-client-orders')?.click();
    else document.querySelector(`.nav-item[data-section="${v}"]`)?.click();
  });

  // ----- sidebar "updated" time -----
  function updateSidebar() {
    const times = [typeof supplierLive !== 'undefined' && supplierLive?.syncedAt, typeof liveShopify !== 'undefined' && liveShopify?.syncedAt]
      .filter(Boolean).map(t => new Date(t).getTime()).filter(Number.isFinite);
    const el = $('.sidebar-foot small'); if (!el) return;
    if (!times.length) { el.textContent = L('Waiting for data…', 'ממתין לנתונים…'); return; }
    const mins = Math.max(0, Math.round((Date.now() - Math.max(...times)) / 60000));
    el.textContent = mins < 1 ? L('Updated just now', 'עודכן עכשיו')
      : mins < 60 ? L(`Updated ${mins} min ago`, `עודכן לפני ${mins} דק׳`)
      : L(`Updated ${new Date(Math.max(...times)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
          `עודכן ${new Date(Math.max(...times)).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
  }

  // Block the sample "Ask Control" search shortcut (the search button is hidden).
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') e.stopImmediatePropagation(); }, true);

  const original = renderAll;
  renderAll = function () { const r = original.apply(this, arguments); try { updateBadge(); updateSidebar(); } catch (e) { console.warn('real ui', e); } return r; };
  setInterval(() => { updateSidebar(); if (document.body.classList.contains('authenticated')) loadPortal().then(updateBadge); }, 60000);
  let started = false;
  const start = () => { if (started || !document.body.classList.contains('authenticated')) return; started = true; loadPortal(true).then(updateBadge); };
  new MutationObserver(start).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  start();
  updateBadge(); updateSidebar();
})();
