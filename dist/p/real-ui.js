// Real notifications (bell dropdown + pop-ups) and a real "last updated" time in the sidebar.
// Client activity (new orders, follow-ups, cancellations, edits) comes from the server's activity log
// with real times. Store/supplier to-dos are worked out from the live data.
(function () {
  if (typeof renderAll !== 'function' || typeof state === 'undefined' || !window.DLNotify) return;
  const HE = document.documentElement.lang === 'he';
  const L = (en, he) => (HE ? he : en);
  const $ = (s, r = document) => r.querySelector(s);
  const money = n => (typeof exactMoney === 'function' ? exactMoney(n) : '$' + Number(n || 0).toFixed(2));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  // Read state (per browser): everything older than readAt is read, plus items opened one by one.
  // badgeAt: when the bell was last opened (the red number only counts things newer than that).
  const firstRun = store.get('dl_notif_read_at', null) === null;
  let readAt = store.get('dl_notif_read_at', Date.now());
  let badgeAt = store.get('dl_notif_badge_at', readAt);
  const readIds = new Set(store.get('dl_notif_read_ids', []));
  if (firstRun) { store.set('dl_notif_read_at', readAt); store.set('dl_notif_badge_at', badgeAt); }
  const todoTimes = store.get('dl_todo_times', {});

  // events: the newest page (refreshed every 30s); older: pages loaded with "Load older"; found: search results.
  let events = [], older = [], hasMore = false, found = null, portal = null, lastLoad = 0, loaded = false;
  const known = new Set();
  async function load(force) {
    if (!document.body.classList.contains('authenticated')) return;
    if (!force && Date.now() - lastLoad < 20000) return;
    lastLoad = Date.now();
    try {
      const [n, o] = await Promise.all([
        fetch('/api/portal/admin/notifications', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)),
        fetch('/api/portal/admin/overview', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)),
      ]);
      if (n?.ok) { events = n.items; if (!older.length) hasMore = !!n.hasMore; }
      if (o?.ok) portal = o;
    } catch (e) { return; }
    const fresh = events.filter(e => !known.has(e.id));
    fresh.forEach(e => known.add(e.id));
    update();
    // Pop up client activity that arrived while the dashboard is open (not on first load).
    if (loaded) fresh.slice(0, 3).reverse().map(eventItem).filter(isUnread)
      .forEach(n => DLNotify.popup(n, { onClick: () => { markRead(n); openItem(n); }, duration: 10000 }));
    loaded = true;
  }

  // ----- items -----
  // Each item has a category for the filter chips in the bell (2 Nov 2026).
  const KINDS = [{ key: 'orders', label: L('Orders', 'הזמנות') }, { key: 'messages', label: L('Messages', 'הודעות') }, { key: 'costs', label: L('Costs', 'עלויות') },
    { key: 'cancel', label: L('Cancellations', 'ביטולים') }, { key: 'problems', label: L('Problems', 'בעיות') }, { key: 'products', label: L('Products', 'מוצרים') }, { key: 'todo', label: L('To-dos', 'משימות') }];
  const catOf = e => e.kind === 'message' ? 'messages' : e.kind === 'claim' || e.kind === 'duplicate' || /"f":"dup_/.test(e.detail || '') ? 'problems' : e.kind === 'supplier_sheet' || e.kind === 'revision_requested' || (e.kind === 'product' && /^Cost revision requested/.test(e.detail || '')) ? 'costs'
    : e.kind === 'product' ? 'products' : e.kind === 'status' && ['cancellation_requested', 'cancelled'].includes(e.detail) ? 'cancel' : 'orders';
  function eventItem(e) { return { ...eventItemBase(e), cat: catOf(e) }; }
  function eventItemBase(e) {
    const who = e.clientName || L('A client', 'לקוח'), ref = e.orderRef || '#' + e.orderId;
    const base = { id: 'ev-' + e.id, time: e.createdAt * 1000, orderId: e.orderId, action: L('Open order', 'פתח הזמנה') };
    // The supplier changed a cost in their Google Sheet (Erwin, 26 Oct 2026: know it even when nobody was online).
    if (e.kind === 'supplier_sheet') { let d = {}; try { d = JSON.parse(e.detail); } catch (x) { /* old row */ } const usd = v => (/^\d+(\.\d+)?$/.test(v || '') ? '$' + Number(v).toFixed(2) : v || '—');
      // Duplicates in the sheet (2 Nov 2026): two orders with the same order number or tracking number.
      if (d.f === 'dup_tracking') return { ...base, icon: 'alert', tone: 'red', title: L('Same tracking number on two orders', 'אותו מספר מעקב בשתי הזמנות'), text: `${ref} · ${d.to}${d.with?.length ? ' · ' + L('also on', 'גם ב-') + ' ' + d.with.join(', ') : ''}` };
      if (d.f === 'dup_order') return { ...base, icon: 'alert', tone: 'red', title: L('Order number twice in the supplier sheet', 'מספר הזמנה פעמיים בגיליון הספק'), text: `${ref} · ${who}` };
      // Cost revisions answered in the sheet (3 Nov 2026): approved by themselves when lower, kept on NO, else waiting for an admin.
      if (d.f === 'rev_auto') return { ...base, icon: 'wallet', tone: 'mint', title: L('Cost revision approved automatically', 'עדכון העלות אושר אוטומטית'), text: `${ref} · ${who} · ${usd(d.from)} ${L('→', '←')} ${usd(d.to)}` };
      if (d.f === 'rev_no') return { ...base, icon: 'wallet', tone: 'gold', title: L('Supplier can’t lower the cost', 'הספק לא יכול להוריד את העלות'), text: `${ref} · ${who}${d.to ? ' · ' + usd(d.to) : ''}${d.why ? ' · ' + L('reason', 'סיבה') + ': ' + d.why : ''} · ${L('price kept, client told', 'המחיר נשאר, הלקוח עודכן')}` };
      if (d.f === 'rev_check') return { ...base, icon: 'alert', tone: 'red', title: L('New supplier cost needs your OK', 'עלות חדשה מהספק מחכה לאישורך'), text: `${ref} · ${who} · ${usd(d.to)} · ${d.why === 'half' ? L('less than half the price, check for a typo', 'פחות מחצי מהמחיר, בדקו שאין טעות הקלדה') : d.why === 'same' ? L('same price as now', 'אותו מחיר כמו עכשיו') : L('higher than now', 'גבוה מהמחיר הנוכחי')}` };
      if (d.f === 'cancel_fee') return { ...base, icon: 'alert', tone: 'red', title: L('Supplier set a cancellation fee', 'הספק קבע עמלת ביטול'), text: `${ref} · ${who} · ${usd(d.to)}` };
      return { ...base, icon: 'alert', tone: 'orange', title: L('Supplier changed a cost in the sheet', 'הספק שינה עלות בגיליון'), text: `${ref} · ${who} · ${usd(d.from)} ${L('→', '←')} ${usd(d.to)}` }; }
    if(e.kind==='claim')return {...base,icon:'alert',tone:'orange',title:L(`${who} reported an order problem`,`${who} דיווח/ה על בעיה בהזמנה`),text:ref};
    // Cost revision requests (Erwin, 27 Oct 2026): the client's competitor price is in the detail.
    if (e.kind === 'revision_requested') return { ...base, icon: 'alert', tone: 'orange', title: L(`${who} asked for a cost revision`, `${who} ביקש/ה עדכון עלות`), text: `${ref} · ${L('competitor', 'מתחרה')} ${e.detail}` };
    if(e.kind==='product'&&/^Cost revision requested/.test(e.detail||''))return {...base,view:'client-products',action:L('View products','צפייה במוצרים'),icon:'alert',tone:'orange',title:L(`${who} asked for a cost revision`,`${who} ביקש/ה עדכון עלות`),text:`${e.productName} · ${String(e.detail).replace(/^Cost revision requested · /,'')}`};
    if(e.kind==='product')return {...base,view:'client-products',action:L('View products','צפייה במוצרים'),icon:'order',tone:'gold',title:L(`${who} submitted a product for quote`,`${who} שלח/ה מוצר להצעת מחיר`),text:e.productName};
    // Sent anyway after the duplicate warning (2 Nov 2026).
    if (e.kind === 'duplicate') return { ...base, icon: 'alert', tone: 'red', title: L(`${who} sent a possible duplicate order`, `${who} שלח/ה הזמנה שאולי כפולה`), text: `${ref} · ${e.detail}` };
    if (e.kind === 'created') return { ...base, icon: 'order', tone: 'gold', title: L(`${who} added a new order`, `${who} הוסיף/ה הזמנה חדשה`), text: L(`${ref} · waiting to be processed`, `${ref} · ממתינה לטיפול`) };
    if (e.kind === 'message') return { ...base, icon: 'message', tone: 'blue', focus: 'chat', action: L('Reply', 'השב'), title: L(`${who} sent a follow-up`, `${who} שלח/ה פנייה`), text: `${ref}: ${e.detail}` };
    if (e.kind === 'status' && e.detail === 'cancellation_requested') return { ...base, icon: 'alert', tone: 'orange', title: L(`${who} requested cancellation`, `${who} ביקש/ה ביטול`), text: ref };
    if (e.kind === 'status' && e.detail === 'delivered') return { ...base, icon: 'check', tone: 'mint', title: L(`${who} marked an order as delivered`, `${who} סימן/ה הזמנה כנמסרה`), text: ref };
    if (e.kind === 'status' && e.detail === 'cancelled') return { ...base, icon: 'alert', tone: 'red', title: L(`${who} cancelled an order`, `${who} ביטל/ה הזמנה`), text: ref };
    if (e.kind === 'status') return { ...base, icon: 'status', tone: 'mint', title: L(`${who} changed an order status`, `${who} שינה/תה סטטוס`), text: `${ref} → ${e.detail}` };
    if (e.kind === 'tracking') return { ...base, icon: 'status', tone: 'mint', title: L(`${who} added a tracking number`, `${who} הוסיף/ה מספר מעקב`), text: `${ref} · ${e.detail}` };
    if (e.kind === 'photo') return { ...base, icon: 'edit', tone: 'orange', title: e.detail === 'removed' ? L(`${who} removed a product photo`, `${who} הסיר/ה תמונת מוצר`) : L(`${who} added a product photo`, `${who} הוסיף/ה תמונת מוצר`), text: ref };
    if (e.kind === 'edited' && e.detail === 'customer') { const running = e.status === 'processing'; return { ...base, icon: 'alert', tone: running ? 'red' : 'orange', title: L(`${who} changed the customer's details`, `${who} שינה/תה פרטי לקוח`), text: running ? L(`${ref} · already in progress: tell the supplier`, `${ref} · כבר בטיפול: עדכנו את הספק`) : ref }; }
    return { ...base, icon: 'edit', tone: 'orange', title: L(`${who} edited an order`, `${who} ערך/ה הזמנה`), text: ref };
  }

  const SHIPPED = ['נשלח', 'Shipped', 'Delivered'], CANCELLED = ['בוטלה', 'בוטל', 'Cancelled'];
  // Things that need attention right now. Each has a "sig" that changes when the situation changes;
  // its time is when we first saw that situation.
  function todos() {
    const list = [];
    const shop = typeof liveShopify !== 'undefined' ? liveShopify : null;
    const sup = typeof supplierLive !== 'undefined' && supplierLive ? supplierLive.orders || [] : [];
    if (shop && Array.isArray(shop.orders)) {
      const toShip = shop.orders.filter(o => !o.cancelledAt && !['FULFILLED', 'RESTOCKED'].includes(o.displayFulfillmentStatus));
      if (toShip.length) list.push({ id: 'todo-shopify-to-ship', sig: toShip.map(o => o.name).join(','), icon: 'shop', tone: 'gold', view: 'orders',
        title: L(`${toShip.length} Z-Royal order${toShip.length > 1 ? 's' : ''} to ship`, `${toShip.length} הזמנות Z-Royal ממתינות למשלוח`), text: toShip.map(o => o.name).slice(0, 5).join(', ') });
    } else if (typeof shopifyUnavailable !== 'undefined' && shopifyUnavailable) {
      list.push({ id: 'todo-shopify-off', sig: 'off', icon: 'alert', tone: 'red', view: 'data', title: L('Shopify isn’t connected', 'Shopify לא מחובר'), text: L('Z-Royal sales can’t be shown until it’s connected.', 'אי אפשר להציג את המכירות של Z-Royal עד שיחובר.') });
    }
    const open = sup.filter(o => !CANCELLED.includes(o.shippingStatus) && !SHIPPED.includes(o.shippingStatus));
    if (open.length) list.push({ id: 'todo-supplier-open', sig: open.map(o => o.orderNumber).join(','), icon: 'status', tone: 'orange', view: 'shipments',
      title: L(`${open.length} supplier order${open.length > 1 ? 's' : ''} not shipped yet`, `${open.length} הזמנות ספק שעוד לא נשלחו`), text: L('Still processing or waiting at the supplier.', 'עדיין בטיפול או ממתינות אצל הספק.') });
    const noTrack = sup.filter(o => SHIPPED.includes(o.shippingStatus) && !o.trackingNumber);
    if (noTrack.length) list.push({ id: 'todo-supplier-notrack', sig: noTrack.map(o => o.orderNumber).join(','), icon: 'alert', tone: 'red', view: 'shipments',
      title: L(`${noTrack.length} shipped order${noTrack.length > 1 ? 's' : ''} without tracking`, `${noTrack.length} הזמנות שנשלחו בלי מספר מעקב`), text: noTrack.map(o => o.orderNumber).slice(0, 4).join(', ') });
    const unpaid = sup.filter(o => o.paymentStatus === 'Unpaid' && !CANCELLED.includes(o.shippingStatus));
    if (unpaid.length) list.push({ id: 'todo-supplier-unpaid', sig: unpaid.map(o => o.orderNumber).join(','), icon: 'money', tone: 'orange', view: 'profit',
      title: L(`${unpaid.length} order${unpaid.length > 1 ? 's' : ''} unpaid to the supplier`, `${unpaid.length} הזמנות שלא שולמו לספק`), text: money(unpaid.reduce((t, o) => t + Number(o.supplierCost || 0) * Number(o.quantity || 1), 0)) });
    if (portal?.clients) {
      const owing = portal.clients.filter(c => c.outstanding > 0);
      if (owing.length) list.push({ id: 'todo-client-owing', sig: owing.map(c => c.id + ':' + c.outstanding).join(','), icon: 'money', tone: 'blue', view: 'client-orders',
        title: L(`${owing.length} client${owing.length > 1 ? 's' : ''} with a balance due`, `${owing.length} לקוחות עם יתרה לתשלום`), text: money(owing.reduce((t, c) => t + c.outstanding, 0)) + L(' outstanding', ' לגבייה') });
    }
    let dirty = false;
    for (const t of list) {
      const rec = todoTimes[t.id];
      // On the very first run, what's already there counts as seen.
      if (!rec || rec.sig !== t.sig) { todoTimes[t.id] = { sig: t.sig, at: firstRun && !rec ? readAt - 1000 : Date.now() }; dirty = true; }
      t.time = todoTimes[t.id].at;
    }
    if (dirty) store.set('dl_todo_times', todoTimes);
    return list.map(t => ({ ...t, cat: 'todo' }));
  }
  const isUnread = n => n.time > readAt && !readIds.has(n.id);
  const uniq = list => { const seen = new Set(); return list.filter(e => !seen.has(e.id) && seen.add(e.id)); };
  const todoMatch = (t, q) => !q || (t.title + ' ' + (t.text || '')).toLowerCase().includes(q.toLowerCase());
  const items = () => (found ? [...found.items.map(eventItem), ...todos().filter(t => todoMatch(t, found.q))] : [...uniq([...events, ...older]).map(eventItem), ...todos()]).map(n => ({ ...n, unread: isUnread(n) }));
  const api = async qs => { const r = await fetch('/api/portal/admin/notifications?' + qs, { credentials: 'same-origin' }); return r.ok ? r.json() : null; };
  // "Load older": the page before the oldest one we have (or the oldest search result).
  async function loadOlder() {
    const list = (found ? found.items : uniq([...events, ...older])).filter(e => typeof e.id === 'number'); if (!list.length) return;
    const before = Math.min(...list.map(e => e.createdAt)), beforeId = Math.min(...list.filter(e => e.createdAt === before).map(e => e.id));
    const n = await api(new URLSearchParams({ before, beforeId, limit: 60, ...(found ? { q: found.q } : {}) })); if (!n?.ok) return;
    if (found) { found.items = uniq([...found.items, ...n.items]); found.more = n.hasMore; } else { older = uniq([...older, ...n.items]); hasMore = n.hasMore; }
    update();
  }
  // Search goes to the server, so it finds old notifications too (order number, client name or text).
  async function search(q) {
    if (!q) { found = null; update(); return; }
    const n = await api(new URLSearchParams({ q, limit: 100 })); if (!n?.ok) return;
    found = { q, items: n.items, more: n.hasMore }; update();
  }
  function markRead(n) { readIds.add(n.id); store.set('dl_notif_read_ids', [...readIds].slice(-2000)); update(); }

  // ----- bell -----
  const old = $('.notifications');
  if (!old) return;
  const bell = old.cloneNode(true); // drop the sample handler
  old.replaceWith(bell);
  let badge = bell.querySelector('i');
  if (!badge) { badge = document.createElement('i'); bell.appendChild(badge); }
  const baseTitle = document.title;
  const panel = DLNotify.panel({
    anchor: bell,
    onItem: n => { markRead(n); openItem(n); },
    onMarkAll: () => { readAt = Date.now(); readIds.clear(); store.set('dl_notif_read_at', readAt); store.set('dl_notif_read_ids', []); update(); },
    onOpen: () => { badgeAt = Date.now(); store.set('dl_notif_badge_at', badgeAt); update(); load(true); },
    footer: () => L('Client activity updates by itself every 30 seconds.', 'פעילות לקוחות מתעדכנת אוטומטית כל 30 שניות.'),
    kinds: KINDS, onSearch: search, onLoadMore: loadOlder, hasMore: () => (found ? found.more : hasMore),
  });
  // Seen / not seen is shared with Clients & orders (same browser): opening an order there clears it here too.
  addEventListener('storage', e => { if (!/^dl_notif_read/.test(e.key || '')) return; readAt = store.get('dl_notif_read_at', readAt); readIds.clear(); store.get('dl_notif_read_ids', []).forEach(id => readIds.add(id)); update(); });
  bell.addEventListener('click', () => panel.toggle());
  function update() {
    const list = items();
    panel.set(list);
    const n = list.filter(x => x.unread && x.time > badgeAt).length;
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.hidden = n === 0;
    bell.setAttribute('aria-label', n ? L(`Notifications, ${n} new`, `התראות, ${n} חדשות`) : L('Notifications', 'התראות'));
    const unreadAll = list.filter(x => x.unread).length;
    document.title = (unreadAll ? `(${unreadAll}) ` : '') + baseTitle;
  }

  // ----- opening an item -----
  function sendToAdminView(msg) {
    const f = document.querySelector('#client-orders iframe'); if (!f) return;
    let ready = false;
    try { ready = !!f.contentWindow?.DLAdminReady; } catch (e) { /* not loaded */ }
    if (ready) { f.contentWindow.postMessage(msg, location.origin); return; }
    const onMsg = e => { if (e.source === f.contentWindow && e.data?.type === 'dl-admin-ready') { removeEventListener('message', onMsg); setTimeout(() => f.contentWindow.postMessage(msg, location.origin), 50); } };
    addEventListener('message', onMsg);
  }
  function openItem(n) {
    if(n.view==='client-products'){document.getElementById('nav-client-orders')?.click();sendToAdminView({type:'dl-open-products'});return;}
    if (n.orderId || n.view === 'client-orders') {
      document.getElementById('nav-client-orders')?.click();
      if (n.orderId) sendToAdminView({ type: 'dl-open-order', id: n.orderId, focus: n.focus || 'details' });
      return;
    }
    document.querySelector(`.nav-item[data-section="${n.view}"]`)?.click();
  }

  // ----- sidebar "updated" time -----
  function updateSidebar() {
    const times = [typeof supplierLive !== 'undefined' && supplierLive?.syncedAt, typeof liveShopify !== 'undefined' && liveShopify?.syncedAt]
      .filter(Boolean).map(t => new Date(t).getTime()).filter(Number.isFinite);
    const el = $('.sidebar-foot small'); if (!el) return;
    if (!times.length) { el.textContent = L('Waiting for data…', 'ממתין לנתונים…'); return; }
    el.textContent = L('Updated ', 'עודכן ') + DLNotify.timeAgo(Math.max(...times));
  }

  // Block the sample "Ask Control" search shortcut (the search button is hidden).
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') e.stopImmediatePropagation(); }, true);

  const original = renderAll;
  renderAll = function () { const r = original.apply(this, arguments); try { update(); updateSidebar(); } catch (e) { console.warn('real ui', e); } return r; };
  // Check for client activity every 30s, right away when the tab comes back into view,
  // and whenever the Clients & orders view says something changed.
  // Neon free plan (26 Oct 2026): a tab left open must not keep the database awake. After 10 minutes without
  // mouse / keyboard / touch the bell stops refreshing; the next refresh after any activity brings them up to date.
  let lastActive = Date.now();
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'focus']) addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastActive = Date.now(); });
  const idle = () => Date.now() - lastActive > 10 * 60 * 1000;
  setInterval(() => { updateSidebar(); if (!document.hidden && !idle()) load(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
  addEventListener('focus', () => load());
  addEventListener('message', e => { if (e.origin === location.origin && e.data?.type === 'dl-followups') load(true); });
  let started = false;
  const start = () => { if (started || !document.body.classList.contains('authenticated')) return; started = true; load(true); };
  new MutationObserver(start).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  start();
  update(); updateSidebar();
})();
