// Real-data views for the dashboard sections that used to fall back to the overview
// cards in live mode: Profitability, Marketing, Inventory, Shipments, Connections,
// Value & Savings, Reports & Goals, Stores & Team. Every number comes from live
// sources (supplier order sheet, Shopify/Etsy when connected, the Direct Line
// client database). Loaded after app.js on both the English and Hebrew dashboards.
(function () {
  if (typeof renderAll !== 'function' || typeof state === 'undefined') return;
  const HE = document.documentElement.lang === 'he';
  const L = (en, he) => (HE ? he : en);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => (typeof exactMoney === 'function' ? exactMoney(n) : '$' + Number(n || 0).toFixed(2));
  const num = n => Number(n || 0).toLocaleString(HE ? 'he-IL' : 'en-US');
  const pct = n => (Number.isFinite(n) ? Math.round(n) + '%' : '—');
  const REAL_STORES = ['zroyal', 'cursed', 'select', 'nerd'];
  const ETSY_SHOP = { cursed: 'CursedCarvingsDesign', select: 'SelectSpark', nerd: 'NerdSparkArt' };
  const VIEWS = ['profit', 'marketing', 'inventory', 'shipments', 'data', 'value', 'management', 'clients'];

  // ---------- data helpers ----------
  const STATUS = {
    'נשלח': 'shipped', 'בטיפול': 'processing', 'ממתין': 'waiting', 'בוטלה': 'cancelled', 'בוטל': 'cancelled',
    Shipped: 'shipped', Fulfilled: 'shipped', Delivered: 'shipped', 'In transit': 'shipped',
    Processing: 'processing', Pending: 'waiting', Unfulfilled: 'processing', Cancelled: 'cancelled', Refunded: 'cancelled',
  };
  const STATUS_LABEL = {
    shipped: L('Shipped', 'נשלח'), processing: L('Processing', 'בטיפול'), waiting: L('Waiting', 'ממתין'),
    cancelled: L('Cancelled', 'בוטל'), other: L('Other', 'אחר'),
  };
  const statusKey = s => STATUS[String(s || '').trim()] || 'other';
  const itemName = s => String(s || '').replace(/^מוצר Etsy\s*·\s*/, HE ? 'מוצר Etsy · ' : 'Etsy item · ').replace(/^מוצר Etsy$/, L('Etsy item', 'מוצר Etsy')).split('\n')[0];
  const supplierRaw = () => (typeof supplierLive !== 'undefined' && supplierLive && supplierLive.orders) || [];
  const selectedStoreNames = () => (state.store === 'all'
    ? (accounts[state.client] || accounts.all).stores.map(id => stores[id]?.name)
    : [stores[state.store]?.name]).filter(Boolean);
  const rangeOrders = () => { try { return realOrdersForSelection(); } catch (e) { return []; } };
  const rawById = () => new Map(supplierRaw().map(o => [o.orderNumber, o]));
  const allStoreOrders = () => { const names = selectedStoreNames(); return supplierRaw().filter(o => names.includes(o.store)); };
  const dateOf = v => { try { return parseOrderDate(v); } catch (e) { return null; } };
  const fmtDate = v => { const d = dateOf(v); return d ? d.toLocaleDateString(HE ? 'he-IL' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : (v || '—'); };
  const track = n => 'https://t.17track.net/en#nums=' + encodeURIComponent(n);
  const rangeLabel = () => ({ today: L('today', 'היום'), '7d': L('last 7 days', '7 הימים האחרונים'), '30d': L('last 30 days', '30 הימים האחרונים'), '4m': L('last 4 months', '4 החודשים האחרונים'), custom: L('selected dates', 'התאריכים שנבחרו') }[state.range] || '');
  const salesKnown = list => list.some(o => Number(o.total) > 0);
  const shopifyConnected = () => typeof liveShopify !== 'undefined' && !!liveShopify;

  let portal = null, portalOrders = null, etsyStatus = null, filter = { ship: 'all', q: '' };
  async function getJSON(url) { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error(r.status); return r.json(); }
  async function loadPortal(force) {
    if (portal && !force) return portal;
    try { portal = await getJSON('/api/portal/admin/overview'); } catch (e) { portal = { error: true }; }
    return portal;
  }
  async function loadPortalOrders(force) {
    if (portalOrders && !force) return portalOrders;
    try { portalOrders = (await getJSON('/api/portal/admin/orders')).orders || []; } catch (e) { portalOrders = []; }
    return portalOrders;
  }
  async function loadEtsy(force) {
    if (etsyStatus && !force) return etsyStatus;
    try { etsyStatus = await getJSON('/api/etsy/status?fresh=' + Date.now()); } catch (e) { etsyStatus = { error: true, shops: [] }; }
    return etsyStatus;
  }

  // ---------- small UI builders ----------
  const cards = list => `<div class="ls-cards">${list.map(([k, v, note, cls]) => `<article class="${cls || ''}"><span>${k}</span><strong>${v}</strong>${note ? `<small>${note}</small>` : ''}</article>`).join('')}</div>`;
  const head = (kicker, title, text, actions = '') => `<div class="section-title"><div><span>${kicker}</span><h2>${title}</h2>${text ? `<p>${text}</p>` : ''}</div>${actions ? `<div class="ls-actions">${actions}</div>` : ''}</div>`;
  const btn = (label, action, extra = '', cls = 'secondary-button') => `<button class="${cls}" type="button" data-ls="${action}" ${extra}>${label}</button>`;
  const table = (cols, rows, empty, foot) => `<div class="table-card"><div class="table-scroll"><table class="ls-table"><thead><tr>${cols.map(c => `<th${c.num ? ' class="num"' : ''}>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${cols.length}" class="ls-empty">${empty}</td></tr>`}</tbody></table></div>${foot ? `<div class="table-footer"><span>${foot}</span></div>` : ''}</div>`;
  const badge = (text, kind) => `<span class="ls-badge ${kind || ''}">${text}</span>`;
  const note = (text, kind) => `<div class="ls-note ${kind || ''}">${text}</div>`;
  const bars = list => { const max = Math.max(1, ...list.map(x => x.value)); return `<div class="ls-bars">${list.map(x => `<div><span>${esc(x.label)}</span><i style="--w:${Math.round(x.value / max * 100)}%"></i><b>${x.display ?? num(x.value)}</b></div>`).join('')}</div>`; };
  const salesNote = () => note(L('Sale prices aren’t connected yet, so sales and profit can’t be calculated. Supplier costs below are real. Sales fill in automatically once the Etsy and Shopify keys are added.',
    'מחירי המכירה עדיין לא מחוברים, ולכן אי אפשר לחשב מכירות ורווח. עלויות הספק למטה אמיתיות. המכירות יתמלאו אוטומטית אחרי שיוזנו המפתחות של Etsy ו-Shopify.'), 'warn');

  // ---------- sections ----------
  function profitView() {
    const list = rangeOrders().filter(o => statusKey(o.status) !== 'cancelled'), raw = rawById();
    const sales = list.reduce((t, o) => t + Number(o.total || 0) - Number(o.refund || 0), 0);
    const cost = list.reduce((t, o) => t + Number(o.product || 0), 0);
    const known = list.filter(o => Number(o.total) > 0 && o.costComplete);
    const profit = known.reduce((t, o) => t + o.total - o.refund - o.product - o.shipping - o.fees, 0);
    const unpaid = list.filter(o => (raw.get(o.id)?.paymentStatus || '') === 'Unpaid').reduce((t, o) => t + Number(o.product || 0), 0);
    const byStore = REAL_STORES.map(id => { const name = stores[id]?.name, os = list.filter(o => o.client === name); return { name, n: os.length, sales: os.reduce((t, o) => t + Number(o.total || 0) - Number(o.refund || 0), 0), cost: os.reduce((t, o) => t + Number(o.product || 0), 0), sold: salesKnown(os) }; }).filter(s => s.n);
    const byItem = new Map();
    list.forEach(o => { const k = o.client + '|' + (o.listingId || o.item); const c = byItem.get(k) || { item: itemName(o.item), store: o.client, n: 0, units: 0, cost: 0 }; c.n++; c.units += Number(o.quantity || 1); c.cost += Number(o.product || 0); byItem.set(k, c); });
    const items = [...byItem.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    return head(L('Profitability', 'רווחיות'), L('Where the money goes', 'לאן הכסף הולך'), L(`Real orders from the ${rangeLabel()}.`, `הזמנות אמיתיות מ${rangeLabel()}.`), btn(L('Open orders', 'פתח הזמנות'), 'goto', 'data-view="orders"'))
      + cards([
        [L('Orders', 'הזמנות'), num(list.length), L('cancelled orders not counted', 'בלי הזמנות שבוטלו')],
        [L('Sales', 'מכירות'), salesKnown(list) ? money(sales) : '—', salesKnown(list) ? '' : L('waiting for store connection', 'ממתין לחיבור החנויות')],
        [L('Supplier cost', 'עלות ספק'), money(cost), L('from the supplier sheet', 'מגיליון הספק')],
        [L('Still unpaid to supplier', 'טרם שולם לספק'), money(unpaid), unpaid ? L('orders marked Unpaid', 'הזמנות שמסומנות כלא שולמו') : '', unpaid ? 'bad' : ''],
        [L('Net profit', 'רווח נקי'), known.length ? money(profit) : '—', known.length ? L(`${known.length} orders with full data`, `${known.length} הזמנות עם נתונים מלאים`) : L('needs sale prices', 'צריך מחירי מכירה'), 'accent'],
      ])
      + (salesKnown(list) ? '' : salesNote())
      + `<div class="ls-grid">`
      + `<div><h3>${L('By store', 'לפי חנות')}</h3>` + table([{ label: L('Store', 'חנות') }, { label: L('Orders', 'הזמנות'), num: 1 }, { label: L('Sales', 'מכירות'), num: 1 }, { label: L('Supplier cost', 'עלות ספק'), num: 1 }, { label: L('Profit', 'רווח'), num: 1 }],
        byStore.map(s => `<tr><td><b>${esc(s.name)}</b></td><td class="num">${num(s.n)}</td><td class="num">${s.sold ? money(s.sales) : '—'}</td><td class="num">${money(s.cost)}</td><td class="num">${s.sold ? money(s.sales - s.cost) : badge(L('needs sale prices', 'צריך מחירים'), 'warn')}</td></tr>`),
        L('No orders in this period.', 'אין הזמנות בתקופה הזו.')) + `</div>`
      + `<div><h3>${L('Top products by orders', 'המוצרים המובילים לפי הזמנות')}</h3>` + table([{ label: L('Product', 'מוצר') }, { label: L('Store', 'חנות') }, { label: L('Orders', 'הזמנות'), num: 1 }, { label: L('Avg. supplier cost', 'עלות ספק ממוצעת'), num: 1 }],
        items.map(i => `<tr><td>${esc(i.item)}</td><td>${esc(i.store)}</td><td class="num">${num(i.n)}</td><td class="num">${money(i.cost / i.n)}</td></tr>`),
        L('No orders in this period.', 'אין הזמנות בתקופה הזו.')) + `</div></div>`;
  }

  function marketingView() {
    const list = rangeOrders().filter(o => statusKey(o.status) !== 'cancelled');
    const byStore = REAL_STORES.map(id => ({ label: stores[id]?.name, value: list.filter(o => o.client === stores[id]?.name).length })).filter(x => x.value);
    const custs = new Map(); allStoreOrders().forEach(o => { const k = (o.store + '|' + (o.customerName || '')).toLowerCase(); if (o.customerName) custs.set(k, (custs.get(k) || 0) + 1); });
    const repeat = [...custs.values()].filter(n => n > 1).length;
    const platforms = [['Meta Ads', 'Facebook + Instagram'], ['TikTok Ads', L('Spend, creatives, conversions', 'הוצאה, קריאייטיב, המרות')], ['Google Ads & GA4', L('Search, Shopping, traffic', 'חיפוש, שופינג, תנועה')]];
    return head(L('Marketing', 'שיווק'), L('Ad spend and where orders come from', 'הוצאות פרסום ומאיפה מגיעות ההזמנות'), L('Ad accounts aren’t connected yet, so spend and ROAS can’t be shown. Order data below is real.', 'חשבונות הפרסום עדיין לא מחוברים, ולכן אין הוצאות ו-ROAS. נתוני ההזמנות למטה אמיתיים.'))
      + cards([
        [L('Orders', 'הזמנות'), num(list.length), rangeLabel()],
        [L('Unique customers', 'לקוחות ייחודיים'), num(custs.size), L('all time, selected stores', 'מאז ומעולם, בחנויות שנבחרו')],
        [L('Returning customers', 'לקוחות חוזרים'), num(repeat), custs.size ? pct(repeat / custs.size * 100) + L(' of customers', ' מהלקוחות') : ''],
        [L('Ad spend', 'הוצאות פרסום'), '—', L('no ad account connected', 'אין חשבון פרסום מחובר')],
      ])
      + `<div class="ls-grid"><div class="panel"><h3>${L('Orders by store', 'הזמנות לפי חנות')}</h3>${byStore.length ? bars(byStore) : `<p class="ls-muted">${L('No orders in this period.', 'אין הזמנות בתקופה הזו.')}</p>`}</div>`
      + `<div class="panel"><h3>${L('Connect ad accounts', 'חיבור חשבונות פרסום')}</h3><div class="ls-list">${platforms.map(([p, d]) => `<div><span><b>${p}</b><small>${d}</small></span>${badge(L('Not connected', 'לא מחובר'), 'warn')}${btn(L('How to connect', 'איך מחברים'), 'campaign', `data-platform="${esc(p)}"`)}</div>`).join('')}</div></div></div>`;
  }

  function inventoryView() {
    const now = Date.now(), day = 864e5, map = new Map();
    allStoreOrders().filter(o => statusKey(o.shippingStatus) !== 'cancelled').forEach(o => {
      const d = dateOf(o.date), k = o.store + '|' + (o.listingId || o.title), c = map.get(k) || { item: itemName(o.title), variant: '', store: o.store, d30: 0, d90: 0, all: 0, cost: 0, last: null };
      const q = Number(o.quantity || 1); c.all += q; c.cost = Number(o.supplierCost || 0) || c.cost;
      if (d && now - d < 30 * day) c.d30 += q; if (d && now - d < 90 * day) c.d90 += q;
      if (d && (!c.last || d > c.last)) c.last = d;
      if (!c.listing) c.listing = o.listingId;
      map.set(k, c);
    });
    const rows = [...map.values()].sort((a, b) => b.d30 - a.d30 || b.d90 - a.d90 || b.all - a.all);
    return head(L('Inventory', 'מלאי'), L('What’s selling, so you know what to restock', 'מה נמכר, כדי לדעת מה להשלים'), L('Stock levels come from Shopify and Etsy, which aren’t connected yet. Sales per product below come from the real supplier orders.', 'רמות המלאי מגיעות מ-Shopify ומ-Etsy, שעדיין לא מחוברים. המכירות לכל מוצר למטה מגיעות מהזמנות הספק האמיתיות.'))
      + cards([
        [L('Products ordered', 'מוצרים שהוזמנו'), num(rows.length), L('all time, selected stores', 'מאז ומעולם, בחנויות שנבחרו')],
        [L('Units, last 30 days', 'יחידות, 30 יום'), num(rows.reduce((t, r) => t + r.d30, 0)), ''],
        [L('Units, last 90 days', 'יחידות, 90 יום'), num(rows.reduce((t, r) => t + r.d90, 0)), ''],
        [L('Stock levels', 'רמות מלאי'), '—', L('needs Shopify / Etsy connection', 'צריך חיבור Shopify / Etsy')],
      ])
      + table([{ label: L('Product', 'מוצר') }, { label: L('Store', 'חנות') }, { label: L('Last 30 days', '30 יום'), num: 1 }, { label: L('Last 90 days', '90 יום'), num: 1 }, { label: L('All time', 'סה״כ'), num: 1 }, { label: L('Supplier cost', 'עלות ספק'), num: 1 }, { label: L('Last ordered', 'הזמנה אחרונה') }],
        rows.map(r => `<tr><td>${esc(r.item)}${r.listing ? `<small class="ls-sub">Etsy #${esc(r.listing)}</small>` : ''}</td><td>${esc(r.store)}</td><td class="num"><b>${num(r.d30)}</b></td><td class="num">${num(r.d90)}</td><td class="num">${num(r.all)}</td><td class="num">${money(r.cost)}</td><td>${r.last ? r.last.toLocaleDateString(HE ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' }) : '—'}</td></tr>`),
        L('No supplier orders for the selected stores yet.', 'אין עדיין הזמנות ספק לחנויות שנבחרו.'), L(`${rows.length} products · sorted by the last 30 days`, `${rows.length} מוצרים · ממוינים לפי 30 הימים האחרונים`));
  }

  function shipmentsView() {
    const list = rangeOrders();
    const counts = { shipped: 0, processing: 0, waiting: 0, cancelled: 0, other: 0 }; list.forEach(o => counts[statusKey(o.status)]++);
    const noTrack = list.filter(o => !o.trackingNumber && statusKey(o.status) !== 'cancelled').length;
    const chips = [['all', L('All', 'הכל'), list.length], ['shipped', STATUS_LABEL.shipped, counts.shipped], ['processing', STATUS_LABEL.processing, counts.processing], ['waiting', STATUS_LABEL.waiting, counts.waiting], ['cancelled', STATUS_LABEL.cancelled, counts.cancelled], ['notrack', L('No tracking', 'בלי מעקב'), noTrack]];
    const q = filter.q.toLowerCase();
    const shown = list.filter(o => (filter.ship === 'all' || (filter.ship === 'notrack' ? !o.trackingNumber && statusKey(o.status) !== 'cancelled' : statusKey(o.status) === filter.ship))
      && (!q || [o.id, o.customer, o.trackingNumber, o.client, o.courier].join(' ').toLowerCase().includes(q)));
    const kind = { shipped: 'good', processing: 'info', waiting: 'warn', cancelled: 'bad', other: '' };
    let html = head(L('Shipments', 'משלוחים'), L('Every parcel and where it is', 'כל חבילה ואיפה היא'), L(`Orders from the ${rangeLabel()} with their courier and tracking number. Click a tracking number to follow the parcel.`, `הזמנות מ${rangeLabel()} עם חברת השילוח ומספר המעקב. לחצו על מספר מעקב כדי לעקוב אחרי החבילה.`), btn(L('Sync supplier sheet', 'סנכרון גיליון ספק'), 'sync'))
      + cards([[STATUS_LABEL.shipped, num(counts.shipped), ''], [L('In progress', 'בתהליך'), num(counts.processing + counts.waiting), L('processing or waiting', 'בטיפול או ממתין')], [STATUS_LABEL.cancelled, num(counts.cancelled), ''], [L('Missing tracking', 'חסר מספר מעקב'), num(noTrack), noTrack ? L('check with the supplier', 'לבדוק מול הספק') : '', noTrack ? 'bad' : '']])
      + `<div class="ls-toolbar"><div class="ls-chips">${chips.map(([k, label, n]) => `<button type="button" class="ls-chip${filter.ship === k ? ' active' : ''}" data-ls="shipfilter" data-f="${k}">${label} <span>${n}</span></button>`).join('')}</div><input type="search" class="ls-search" data-ls-search placeholder="${L('Search order, customer, tracking…', 'חיפוש הזמנה, לקוח, מעקב…')}" value="${esc(filter.q)}"></div>`
      + table([{ label: L('Date', 'תאריך') }, { label: L('Order', 'הזמנה') }, { label: L('Store', 'חנות') }, { label: L('Customer', 'לקוח') }, { label: L('Courier', 'חברת שילוח') }, { label: L('Tracking', 'מעקב') }, { label: L('Status', 'סטטוס') }],
        shown.map(o => `<tr><td>${fmtDate(o.createdAt)}</td><td class="mono">${esc(o.id)}</td><td>${esc(o.client)}</td><td>${esc(o.customer)}</td><td>${esc(o.courier) || '—'}</td><td>${o.trackingNumber ? `<a href="${track(o.trackingNumber)}" target="_blank" rel="noopener" class="mono">${esc(o.trackingNumber)}</a>` : '—'}</td><td>${badge(STATUS_LABEL[statusKey(o.status)], kind[statusKey(o.status)])}</td></tr>`),
        L('No shipments match.', 'אין משלוחים שמתאימים.'), L(`Showing ${shown.length} of ${list.length}`, `מוצגים ${shown.length} מתוך ${list.length}`));
    // Direct Line client parcels
    const po = portalOrders || [], clientName = id => (portal?.clients || []).find(c => c.id === id)?.name || '—';
    html += `<div class="ls-sub-head">${head(L('Direct Line clients', 'לקוחות Direct Line'), L('Client parcels', 'חבילות של לקוחות'), L('Orders your clients entered in their portal.', 'הזמנות שהלקוחות הזינו בפורטל שלהם.'), btn(L('Open Clients & orders', 'פתח לקוחות והזמנות'), 'clients'))}</div>`
      + table([{ label: L('Date', 'תאריך') }, { label: L('Client', 'לקוח') }, { label: L('Order', 'הזמנה') }, { label: L('To', 'יעד') }, { label: L('Tracking', 'מעקב') }, { label: L('Status', 'סטטוס') }],
        po.slice(0, 50).map(o => `<tr><td>${new Date(o.createdAt * 1000).toLocaleDateString(HE ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' })}</td><td>${esc(clientName(o.clientId))}</td><td>${esc(o.orderRef) || '—'}</td><td>${esc(o.destination) || '—'}</td><td>${o.trackingNumber ? `<a href="${track(o.trackingNumber)}" target="_blank" rel="noopener" class="mono">${esc(o.trackingNumber)}</a>` : '—'}</td><td>${badge(o.status, { shipped: 'good', delivered: 'good', processing: 'info', pending: 'warn', cancelled: 'bad' }[o.status])}</td></tr>`),
        portalOrders === null ? L('Loading…', 'טוען…') : L('No client orders yet.', 'אין עדיין הזמנות של לקוחות.'));
    return html;
  }

  function dataView() {
    const et = etsyStatus, shopify = shopifyConnected();
    const synced = (typeof supplierLive !== 'undefined' && supplierLive?.syncedAt) ? new Date(supplierLive.syncedAt).toLocaleString(HE ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
    const etsyRow = id => { const shop = ETSY_SHOP[id], st = (et?.shops || []).find(s => s.shop === shop); const status = st?.connected ? badge(L('Connected', 'מחובר'), 'good') : et?.configured ? badge(L('Ready to connect', 'מוכן לחיבור'), 'info') : badge(L('Waiting for Etsy keys', 'ממתין למפתחות Etsy'), 'warn'); return `<div><i>ET</i><span><b>Etsy · ${esc(stores[id].name)}</b><small>etsy.com/shop/${shop}</small></span>${status}${btn(st?.connected ? L('Details', 'פרטים') : L('Connect', 'חיבור'), 'etsy', `data-shop="${shop}"`)}</div>`; };
    const rows = [
      `<div><i>SH</i><span><b>Shopify · Z‑Royal</b><small>by-z-royal.myshopify.com</small></span>${shopify ? badge(L('Connected', 'מחובר'), 'good') : badge(L('Waiting for API keys', 'ממתין למפתחות API'), 'warn')}${btn(L('Setup steps', 'שלבי הגדרה'), 'shopify')}${btn(L('Check again', 'בדוק שוב'), 'shopify-refresh')}</div>`,
      ...['cursed', 'select', 'nerd'].map(etsyRow),
      `<div><i>GS</i><span><b>${L('Supplier order sheet', 'גיליון הזמנות ספק')}</b><small>${esc(supplierLive?.sheet || '—')}${synced ? ' · ' + L('synced ', 'סונכרן ') + synced : ''} · ${num(supplierRaw().length)} ${L('orders', 'הזמנות')}</small></span>${supplierRaw().length ? badge(L('Live', 'פעיל'), 'good') : badge(L('Not loaded', 'לא נטען'), 'warn')}${btn(L('Sync now', 'סנכרן עכשיו'), 'sync')}</div>`,
      `<div><i>DL</i><span><b>${L('Direct Line client portal', 'פורטל הלקוחות של Direct Line')}</b><small>${portal && !portal.error ? num(portal.clients.length) + L(' client accounts', ' חשבונות לקוח') : '—'}</small></span>${portal && !portal.error ? badge(L('Live', 'פעיל'), 'good') : badge(L('Unavailable', 'לא זמין'), 'warn')}${btn(L('Open', 'פתח'), 'clients')}</div>`,
      `<div><i>17</i><span><b>${L('Parcel tracking', 'מעקב חבילות')}</b><small>${L('Tracking numbers open in 17TRACK. Live status inside the dashboard needs the carrier list from the supplier.', 'מספרי מעקב נפתחים ב-17TRACK. סטטוס חי בתוך הדשבורד דורש את רשימת חברות השילוח מהספק.')}</small></span>${badge(L('Links work', 'קישורים פעילים'), 'info')}</div>`,
      ...[['Meta Ads', 'ME'], ['TikTok Ads', 'TK'], ['Google Ads & GA4', 'GO']].map(([p, i]) => `<div><i>${i}</i><span><b>${p}</b><small>${L('Ad spend and conversions', 'הוצאות פרסום והמרות')}</small></span>${badge(L('Not connected', 'לא מחובר'), 'warn')}${btn(L('How to connect', 'איך מחברים'), 'campaign', `data-platform="${p}"`)}</div>`),
    ];
    const live = [shopify, ...(et?.shops || []).map(s => s.connected), supplierRaw().length > 0, !!(portal && !portal.error)];
    return head(L('Connections', 'חיבורים'), L('Where the data comes from', 'מאיפה מגיעים הנתונים'), L('The real status of every data source. Nothing here is sample data.', 'הסטטוס האמיתי של כל מקור נתונים. אין כאן נתוני דמו.'), btn(L('Check all again', 'בדוק הכל שוב'), 'recheck'))
      + cards([[L('Connected sources', 'מקורות מחוברים'), `${live.filter(Boolean).length} / ${live.length}`, ''], [L('Supplier orders', 'הזמנות ספק'), num(supplierRaw().length), synced ? L('last sync ', 'סנכרון אחרון ') + synced : ''], [L('Automations', 'אוטומציות'), '0', L('set up after stores are connected', 'יוגדרו אחרי חיבור החנויות')]])
      + `<div class="panel"><div class="ls-list ls-sources">${rows.join('')}</div></div>`;
  }

  function valueView() {
    const p = portal;
    if (!p) return head(L('Value', 'ערך'), L('Loading…', 'טוען…'), '');
    if (p.error) return head(L('Value', 'ערך'), L('Direct Line earnings', 'הכנסות Direct Line'), '') + note(L('Couldn’t load the client data. Try again.', 'לא הצלחנו לטעון את נתוני הלקוחות. נסו שוב.'), 'warn') + btn(L('Try again', 'נסה שוב'), 'recheck');
    const t = p.totals, list = rangeOrders().filter(o => statusKey(o.status) !== 'cancelled');
    return head(L('Value & savings', 'ערך וחיסכון'), L('What Direct Line earns and handles', 'מה Direct Line מרוויחה ומטפלת'), L('From the client accounts: the per-order fee, the supplier’s share, and what’s still owed.', 'מחשבונות הלקוחות: העמלה לכל הזמנה, החלק של הספק, ומה שעוד חייבים.'), btn(L('Open Clients & orders', 'פתח לקוחות והזמנות'), 'clients'))
      + cards([
        [L('Our earnings', 'ההכנסה שלנו'), money(t.ourShare), L(`${num(t.orders)} client orders`, `${num(t.orders)} הזמנות לקוחות`), 'accent'],
        [L('Fees collected', 'עמלות שנגבו'), money(t.commission), ''],
        [L('Supplier’s share', 'החלק של הספק'), money(t.supplierShare), ''],
        [L('Outstanding from clients', 'יתרה לגבייה מלקוחות'), money(t.outstanding), '', t.outstanding > 0 ? 'bad' : ''],
        [L('Supplier orders handled', 'הזמנות ספק שטופלו'), num(list.length), rangeLabel()],
      ])
      + table([{ label: L('Client', 'לקוח') }, { label: L('Orders', 'הזמנות'), num: 1 }, { label: L('Billed', 'חויב'), num: 1 }, { label: L('Paid', 'שולם'), num: 1 }, { label: L('Outstanding', 'יתרה'), num: 1 }, { label: L('Our earnings', 'ההכנסה שלנו'), num: 1 }],
        p.clients.map(c => `<tr><td><b>${esc(c.name)}</b><small class="ls-sub">${esc(c.username)}</small></td><td class="num">${num(c.orders)}</td><td class="num">${money(c.billed)}</td><td class="num">${money(c.paid)}</td><td class="num ${c.outstanding > 0 ? 'ls-bad' : ''}">${money(c.outstanding)}</td><td class="num"><b>${money(c.ourShare)}</b></td></tr>`),
        L('No client accounts yet.', 'אין עדיין חשבונות לקוח.'));
  }

  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthlyRows() {
    const m = new Map();
    allStoreOrders().forEach(o => {
      const d = dateOf(o.date); if (!d) return;
      const k = monthKey(d), c = m.get(k) || { key: k, label: d.toLocaleDateString(HE ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' }), orders: 0, units: 0, cost: 0, shipped: 0, cancelled: 0, sales: 0 };
      const st = statusKey(o.shippingStatus);
      if (st === 'cancelled') c.cancelled++; else { c.orders++; c.units += Number(o.quantity || 1); c.cost += Number(o.supplierCost || 0) * Number(o.quantity || 1); if (st === 'shipped') c.shipped++; if (o.priceMatched && o.salePrice) c.sales += Number(o.salePrice) * Number(o.quantity || 1); }
      m.set(k, c);
    });
    return [...m.values()].sort((a, b) => b.key.localeCompare(a.key));
  }
  function managementView() {
    const rows = monthlyRows(), goal = Number(portal?.settings?.monthly_order_goal || 0), cur = rows.find(r => r.key === monthKey(new Date()));
    const done = cur ? cur.orders : 0, progress = goal ? Math.min(100, done / goal * 100) : 0;
    return head(L('Reports & goals', 'דוחות ויעדים'), L('Month by month', 'חודש אחרי חודש'), L('Built from the real supplier orders for the selected stores. Download it to share.', 'נבנה מהזמנות הספק האמיתיות של החנויות שנבחרו. אפשר להוריד ולשתף.'),
      btn(L('Download monthly report (CSV)', 'הורדת דוח חודשי (CSV)'), 'csv-months') + btn(L('Download all orders (CSV)', 'הורדת כל ההזמנות (CSV)'), 'csv-orders'))
      + `<div class="panel ls-goal"><div><h3>${L('Monthly order goal', 'יעד הזמנות חודשי')}</h3><p class="ls-muted">${goal ? L(`${num(done)} of ${num(goal)} orders this month`, `${num(done)} מתוך ${num(goal)} הזמנות החודש`) : L('No goal set yet.', 'עדיין לא הוגדר יעד.')}</p>${goal ? `<div class="ls-progress"><i style="--w:${progress}%"></i></div>` : ''}</div><form data-ls-goal><label>${L('Goal (orders per month)', 'יעד (הזמנות בחודש)')}<input name="goal" type="number" min="0" step="1" value="${goal || ''}" inputmode="numeric"></label><button class="primary-button" type="submit">${L('Save goal', 'שמור יעד')}</button><span class="ls-msg" data-ls-goal-msg></span></form></div>`
      + table([{ label: L('Month', 'חודש') }, { label: L('Orders', 'הזמנות'), num: 1 }, { label: L('Units', 'יחידות'), num: 1 }, { label: L('Supplier cost', 'עלות ספק'), num: 1 }, { label: L('Shipped', 'נשלחו'), num: 1 }, { label: L('Cancelled', 'בוטלו'), num: 1 }, { label: L('Sales', 'מכירות'), num: 1 }],
        rows.map(r => `<tr><td><b>${esc(r.label)}</b></td><td class="num">${num(r.orders)}</td><td class="num">${num(r.units)}</td><td class="num">${money(r.cost)}</td><td class="num">${r.orders ? pct(r.shipped / r.orders * 100) : '—'}</td><td class="num">${num(r.cancelled)}</td><td class="num">${r.sales ? money(r.sales) : '—'}</td></tr>`),
        L('No supplier orders yet.', 'אין עדיין הזמנות ספק.'), L('Sales show once Etsy / Shopify sale prices are connected.', 'המכירות יופיעו אחרי חיבור מחירי המכירה של Etsy / Shopify.'));
  }

  function clientsView() {
    const list = rangeOrders(), et = etsyStatus, shopify = shopifyConnected();
    const status = id => id === 'zroyal' ? (shopify ? badge(L('Connected', 'מחובר'), 'good') : badge(L('Waiting for API keys', 'ממתין למפתחות API'), 'warn'))
      : ((et?.shops || []).find(s => s.shop === ETSY_SHOP[id])?.connected ? badge(L('Connected', 'מחובר'), 'good') : badge(L('Supplier orders only', 'רק הזמנות ספק'), 'info'));
    const admins = portal?.admins || [];
    return head(L('Stores & team', 'חנויות וצוות'), L('Your stores and who has access', 'החנויות שלכם ומי מקבל גישה'), '', btn(L('Connect a store', 'חבר חנות'), 'connect', '', 'primary-button'))
      + table([{ label: L('Store', 'חנות') }, { label: L('Platform', 'פלטפורמה') }, { label: L('Connection', 'חיבור') }, { label: L('Orders', 'הזמנות'), num: 1 }, { label: L('Supplier cost', 'עלות ספק'), num: 1 }, { label: '' }],
        REAL_STORES.filter(id => stores[id]).map(id => { const os = list.filter(o => o.client === stores[id].name); return `<tr><td><b>${esc(stores[id].name)}</b></td><td>${esc(stores[id].platformName)}</td><td>${status(id)}</td><td class="num">${num(os.length)}</td><td class="num">${money(os.reduce((t, o) => t + Number(o.product || 0), 0))}</td><td class="ls-row-actions">${btn(L('View', 'הצג'), 'store', `data-store="${id}"`)}${btn(id === 'zroyal' ? L('Setup', 'הגדרה') : L('Connect', 'חיבור'), id === 'zroyal' ? 'shopify' : 'etsy', id === 'zroyal' ? '' : `data-shop="${ETSY_SHOP[id]}"`)}</td></tr>`; }),
        '', L(`Orders and cost for the ${rangeLabel()}`, `הזמנות ועלויות ב${rangeLabel()}`))
      + `<div class="ls-grid"><div class="panel"><h3>${L('Team (admin access)', 'צוות (גישת מנהל)')}</h3><div class="ls-list">`
      + `<div><i>★</i><span><b>${L('Main admin login', 'כניסת המנהל הראשית')}</b><small>${L('Full access', 'גישה מלאה')}</small></span>${badge(L('Admin', 'מנהל'), 'good')}</div>`
      + admins.map(a => `<div><i>${esc((a.name || a.username).slice(0, 2).toUpperCase())}</i><span><b>${esc(a.name)}</b><small>${esc(a.username)}</small></span>${badge(a.active ? L('Admin', 'מנהל') : L('Disabled', 'מושבת'), a.active ? 'good' : '')}</div>`).join('')
      + `</div>${btn(L('Add team member', 'הוסף איש צוות'), 'add-admin')}</div>`
      + `<div class="panel"><h3>${L('Direct Line clients', 'לקוחות Direct Line')}</h3><p class="ls-big">${portal && !portal.error ? num(portal.clients.length) : '—'}</p><p class="ls-muted">${L('client accounts with portal access', 'חשבונות לקוח עם גישה לפורטל')}</p>${btn(L('Manage clients', 'ניהול לקוחות'), 'clients')}</div></div>`;
  }

  const RENDER = { profit: profitView, marketing: marketingView, inventory: inventoryView, shipments: shipmentsView, data: dataView, value: valueView, management: managementView, clients: clientsView };
  const TITLES = {
    profit: [L('Profitability', 'רווחיות'), L('Profitability. <span>Live data.</span>', 'רווחיות. <span>נתונים חיים.</span>')],
    marketing: [L('Marketing', 'שיווק'), L('Marketing. <span>Live data.</span>', 'שיווק. <span>נתונים חיים.</span>')],
    inventory: [L('Inventory', 'מלאי'), L('Inventory. <span>Live data.</span>', 'מלאי. <span>נתונים חיים.</span>')],
    shipments: [L('Shipments', 'משלוחים'), L('Shipments. <span>Live data.</span>', 'משלוחים. <span>נתונים חיים.</span>')],
    data: [L('Connections', 'חיבורים'), L('Connections. <span>Live status.</span>', 'חיבורים. <span>סטטוס חי.</span>')],
    value: [L('Value', 'ערך'), L('Value & savings. <span>Live data.</span>', 'ערך וחיסכון. <span>נתונים חיים.</span>')],
    management: [L('Reports', 'דוחות'), L('Reports & goals. <span>Live data.</span>', 'דוחות ויעדים. <span>נתונים חיים.</span>')],
    clients: [L('Stores & team', 'חנויות וצוות'), L('Stores & team. <span>Live data.</span>', 'חנויות וצוות. <span>נתונים חיים.</span>')],
  };

  // ---------- mount ----------
  const section = document.createElement('section');
  section.id = 'live-section'; section.className = 'live-section view-hidden';
  const kpi = $('.kpi-grid'); (kpi?.parentNode || $('#main')).insertBefore(section, kpi ? kpi.nextSibling : null);
  let loading = false;

  function draw() {
    const view = state.view;
    if (!RENDER[view]) return;
    section.innerHTML = RENDER[view]();
    const [eyebrow, title] = TITLES[view];
    const t = $('[data-view-title]'), e = $('[data-view-eyebrow]'), d = $('[data-view-description]');
    if (t) t.innerHTML = title; if (e) e.textContent = eyebrow.toUpperCase(); if (d) d.textContent = state.store === 'all' ? L('All stores', 'כל החנויות') : (stores[state.store]?.name || '');
  }
  async function ensureData(view) {
    const need = [];
    if (['value', 'clients', 'data', 'management', 'shipments'].includes(view) && !portal) need.push(loadPortal());
    if (view === 'shipments' && portalOrders === null) need.push(loadPortalOrders());
    if (['data', 'clients'].includes(view) && !etsyStatus) need.push(loadEtsy());
    if (!need.length || loading) return;
    loading = true; await Promise.allSettled(need); loading = false;
    if (state.view === view && !section.classList.contains('view-hidden')) draw();
  }
  let defaulted = false;
  function after() {
    const live = document.body.classList.contains('real-data-mode');
    // Until Shopify is connected Z-Royal has no data, so start on "All stores" (once).
    if (live && !defaulted) {
      defaulted = true;
      if (state.store === 'zroyal' && !shopifyConnected() && supplierRaw().length) {
        state.store = 'all'; const s = $('#store-select'); if (s) s.value = 'all';
        setTimeout(() => renderAll(), 0); return;
      }
    }
    if (live && RENDER[state.view]) {
      $('.kpi-grid')?.classList.add('view-hidden');
      section.classList.remove('view-hidden');
      draw(); ensureData(state.view);
    } else section.classList.add('view-hidden');
  }
  const original = renderAll;
  // eslint-disable-next-line no-global-assign
  renderAll = function () { if (stores.zroyal && !shopifyConnected()) stores.zroyal.status = L('Waiting for API keys', 'ממתין למפתחות API'); const r = original.apply(this, arguments); try { after(); } catch (e) { console.warn('live sections', e); } return r; };

  // ---------- actions ----------
  const clickHidden = sel => { const el = $(sel); if (el) el.click(); return !!el; };
  function csv(name, rows) {
    const text = rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  section.addEventListener('click', async e => {
    const b = e.target.closest('[data-ls]'); if (!b) return;
    const a = b.dataset.ls;
    if (a === 'goto') $(`.nav-item[data-section="${b.dataset.view}"]`)?.click();
    else if (a === 'clients') document.getElementById('nav-client-orders')?.click();
    else if (a === 'add-admin') { document.getElementById('nav-client-orders')?.click(); setTimeout(() => $('#client-orders iframe')?.contentWindow?.postMessage({ type: 'dl-add-admin' }, location.origin), 900); }
    else if (a === 'campaign') clickHidden(`[data-campaign-platform="${CSS.escape(b.dataset.platform)}"]`);
    else if (a === 'etsy') clickHidden(`.real-store-list [data-etsy-shop="${CSS.escape(b.dataset.shop)}"]`) || clickHidden(`[data-etsy-shop="${CSS.escape(b.dataset.shop)}"]`);
    else if (a === 'shopify') clickHidden('[data-shopify-store]');
    else if (a === 'connect') clickHidden('#connect-store');
    else if (a === 'store') { const s = $('#store-select'); if (s) { s.value = b.dataset.store; s.dispatchEvent(new Event('change', { bubbles: true })); } }
    else if (a === 'shipfilter') { filter.ship = b.dataset.f; draw(); }
    else if (a === 'shopify-refresh' || a === 'sync' || a === 'recheck') {
      b.disabled = true; const label = b.textContent; b.textContent = L('Checking…', 'בודק…');
      const jobs = [];
      if (a !== 'sync' && typeof refreshShopifyConnection === 'function') jobs.push(refreshShopifyConnection(true));
      if (a !== 'shopify-refresh' && typeof refreshSupplierConnection === 'function') jobs.push(refreshSupplierConnection());
      if (a === 'recheck') jobs.push(loadEtsy(true), loadPortal(true), loadPortalOrders(true));
      await Promise.allSettled(jobs);
      b.disabled = false; b.textContent = label;
      renderAll();
      if (typeof toast === 'function') toast(L('Updated', 'עודכן'));
    }
    else if (a === 'csv-months') {
      csv('direct-line-monthly-report.csv', [[L('Month', 'חודש'), L('Orders', 'הזמנות'), L('Units', 'יחידות'), L('Supplier cost (USD)', 'עלות ספק (USD)'), L('Shipped', 'נשלחו'), L('Cancelled', 'בוטלו'), L('Sales (USD)', 'מכירות (USD)')],
        ...monthlyRows().map(r => [r.label, r.orders, r.units, r.cost.toFixed(2), r.shipped, r.cancelled, r.sales ? r.sales.toFixed(2) : ''])]);
    }
    else if (a === 'csv-orders') {
      csv('direct-line-orders.csv', [[L('Date', 'תאריך'), L('Order', 'הזמנה'), L('Store', 'חנות'), L('Customer', 'לקוח'), L('Product', 'מוצר'), L('Quantity', 'כמות'), L('Supplier cost (USD)', 'עלות ספק (USD)'), L('Supplier payment', 'תשלום לספק'), L('Status', 'סטטוס'), L('Courier', 'חברת שילוח'), L('Tracking', 'מעקב')],
        ...allStoreOrders().map(o => [o.date, o.orderNumber, o.store, o.customerName, itemName(o.title), o.quantity, Number(o.supplierCost || 0).toFixed(2), o.paymentStatus, STATUS_LABEL[statusKey(o.shippingStatus)], o.courier, o.trackingNumber])]);
    }
  });
  section.addEventListener('input', e => { if (e.target.matches('[data-ls-search]')) { filter.q = e.target.value; const pos = e.target.selectionStart; draw(); const i = $('[data-ls-search]', section); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } });
  section.addEventListener('submit', async e => {
    if (!e.target.matches('[data-ls-goal]')) return;
    e.preventDefault();
    const v = Math.max(0, Math.round(Number(e.target.goal.value) || 0)), m = $('[data-ls-goal-msg]', section);
    try {
      const r = await fetch('/api/portal/admin/settings', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ monthly_order_goal: v }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'Error');
      if (portal && !portal.error) portal.settings = d.settings;
      draw(); if (typeof toast === 'function') toast(L('Goal saved', 'היעד נשמר'));
    } catch (err) { if (m) m.textContent = L('Couldn’t save: ', 'השמירה נכשלה: ') + err.message; }
  });
  window.addEventListener('message', e => { if (e.origin === location.origin && e.data?.type === 'dl-clients-changed') { portal = null; portalOrders = null; } });
  if (document.body.classList.contains('real-data-mode')) after();
})();
