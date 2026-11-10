/* Admin "Clients & orders": all client orders, clients, payments, fee settings.
   Runs inside the store dashboard (iframe). Order and client details open in a side panel. */
(function () {
  const MAX_PICKS = 8;
  const { api, money, esc, trackingUrl, renderLogin, quote, destinationPicker, categoryOptions, countryName, toast, shrinkImage, photoUrl, productMedia, RATES, COUNTRIES, sortPick, sortList, setSort, bySort, $, $$ } = window.DL;
  const UI = window.DLOrderUI;
  const STATUSES = ['pending','processing','shipped','delivered','cancellation_requested','cancelled'];
  const ADMIN_STATUSES = ['pending','processing','shipped','delivered'];
  // Sorting for the long lists ("Sort" dropdown, remembered in this browser). The first one is the default.
  const rank = (list, k) => { const i = list.indexOf(k); return i < 0 ? list.length : i; };
  const ORDER_SORTS = {
    newest: ['Newest first', bySort.newest], oldest: ['Oldest first', bySort.oldest],
    changed: ['Status changed: newest', bySort.changed], changed_old: ['Status changed: oldest', bySort.changedOld],
    total_desc: ['Total: high to low', bySort.num(o => o.price, true)], total_asc: ['Total: low to high', bySort.num(o => o.price)],
    status: ['Status', (a, b) => rank(STATUSES, a.status) - rank(STATUSES, b.status) || bySort.newest(a, b)],
    revision: ['Cost revision first', bySort.revision],
  };
  // New updates first (Erwin, 2 Nov 2026): orders with something the admin hasn't seen yet, latest update on top.
  const ADMIN_ORDER_SORTS = { updates: ['New updates first', (a, b) => lastNew(b) - lastNew(a) || bySort.newest(a, b)], ...ORDER_SORTS, client: ['Client A–Z', (a, b) => bySort.text(o => clientName(o.clientId))(a, b) || bySort.newest(a, b)] };
  const P_STATUS = ['awaiting_quote', 'approved', 'not_available'];
  const PRODUCT_SORTS = {
    waiting: ['Waiting for price first', (a, b) => rank(P_STATUS, a.status) - rank(P_STATUS, b.status) || bySort.newest(a, b)],
    newest: ['Newest first', bySort.newest], oldest: ['Oldest first', bySort.oldest],
    name: ['Name A–Z', (a, b) => bySort.text(p => p.name)(a, b) || bySort.newest(a, b)],
    price_asc: ['Price: low to high', bySort.num(p => p.unitPrice)], price_desc: ['Price: high to low', bySort.num(p => p.unitPrice, true)],
    revision: ['Cost revision first', bySort.revision],
  };
  const ADMIN_PRODUCT_SORTS = { ...PRODUCT_SORTS, client: ['Client A–Z', (a, b) => bySort.text(p => p.clientName)(a, b) || bySort.newest(a, b)] };
  const C_STATUS = ['open', 'approved', 'rejected', 'resolved'];
  const CLAIM_SORTS = {
    newest: ['Newest first', bySort.newest], oldest: ['Oldest first', bySort.oldest],
    status: ['Open first', (a, b) => rank(C_STATUS, a.status) - rank(C_STATUS, b.status) || bySort.newest(a, b)],
    client: ['Client A–Z', (a, b) => bySort.text(c => c.clientName)(a, b) || bySort.newest(a, b)],
  };
  const SAVED_PRICE_SORTS = {
    name: ['Product A–Z', (a, b) => bySort.text(p => p.label)(a, b)],
    updated: ['Recently updated', (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)],
    cost_desc: ['Cost: high to low', bySort.num(p => p.supplierCost, true)], cost_asc: ['Cost: low to high', bySort.num(p => p.supplierCost)],
  };
  // Who owes first (Erwin, 5 Nov 2026): the first sort is the default until the admin picks another.
  const CLIENT_SORTS = {
    outstanding: ['Outstanding: high to low', bySort.num(c => c.outstanding, true)],
    name: ['Name A–Z', bySort.text(c => c.name)],
    orders: ['Most orders', bySort.num(c => c.orders, true)],
    billed: ['Billed: high to low', bySort.num(c => c.billed, true)],
    login: ['Last sign-in', bySort.num(c => c.lastLogin, true)],
  };
  const S = { picked: new Set(), ov: null, orders: [], archivedOrders: [], tab: 'overview', filter: null, q: '', client: '', cq: '', drawer: null, products:[], pqOpen: {}, pqFilter: 'all', clOpen: {}, claims:[], claimFilter:'all', stores:[], period:'month', from:'', to:'' };
  const embedded = window.top !== window.self;
  const tell = m => { if (embedded) parent.postMessage(m, location.origin); };
  const P = {
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    orders: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5v11"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };
  const ic = n => UI.svg(P[n]);
  const place = d => (d ? countryName(d) : '—');
  const fullDate = sec => window.DL.displayTime(sec);
  const orderName = o => o.orderRef || 'Order #' + o.id;
  const clientOf = id => S.ov?.clients.find(c => c.id === Number(id));
  const clientName = id => clientOf(id)?.name || 'Client';
  const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const shortCat = c => ({ general: 'General goods', battery: 'Battery / sensitive', cosmetic: 'Cosmetics / liquids' }[c] || c || '—');
  const empty = (title, text, extra = '') => `<div class="empty"><span class="empty-ic">${ic('orders')}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra}</div>`;
  const divisor = () => Number(S.ov?.settings?.volumetric_divisor) || 6000;
  const unreadTotal = () => S.orders.reduce((t, x) => t + (x.unreadMessages || 0), 0);
  // ----- new updates on an order (Erwin, 2 Nov 2026) -----
  // The server sends each order's client / supplier updates of the last 30 days. Seen or not is the dashboard bell's
  // read state (same browser, same keys): opening an order here clears it in the bell, "Mark all as read" there clears it here.
  const readState = () => { try { let at = JSON.parse(localStorage.getItem('dl_notif_read_at')); if (at === null) { at = Date.now(); localStorage.setItem('dl_notif_read_at', JSON.stringify(at)); } return { at, ids: new Set(JSON.parse(localStorage.getItem('dl_notif_read_ids')) || []) }; } catch (e) { return { at: Date.now(), ids: new Set() }; } };
  let readCache = null;
  const freshRead = () => { readCache = readState(); return readCache; };
  const newUpdates = o => { const r = readCache || freshRead(); return (o.updates || []).filter(u => u.at * 1000 > r.at && !r.ids.has('ev-' + u.id)); };
  const lastNew = o => newUpdates(o)[0]?.at || 0;
  // New orders (Erwin, 11 Nov 2026: "I can't tell which are the newest orders"): sent by a client and not opened here yet.
  const isNewOrder = o => newUpdates(o).some(u => u.kind === 'created');
  const updateLabel = u => u.kind === 'created' ? ['New order', 'gold'] : u.kind === 'duplicate' ? ['Possible duplicate', 'red'] : u.kind === 'message' ? ['New message', 'blue'] : u.kind === 'revision_requested' ? ['Cost revision requested', 'orange']
    : u.kind === 'claim' ? ['Problem reported', 'red'] : u.kind === 'tracking' ? ['Tracking added', 'mint'] : u.kind === 'photo' ? [u.detail === 'removed' ? 'Photo removed' : 'Photo added', 'orange']
    : u.kind === 'supplier_sheet' ? (/"f":"dup_tracking"/.test(u.detail || '') ? ['Same tracking as another order', 'red'] : /"f":"dup_order"/.test(u.detail || '') ? ['Twice in the sheet', 'red'] : /"f":"cancel_fee"/.test(u.detail || '') ? ['Supplier cancellation fee', 'red']
      : /"f":"rev_auto"/.test(u.detail || '') ? ['Cost lowered automatically', 'mint'] : /"f":"rev_check"/.test(u.detail || '') ? ['Check the new cost', 'red'] : /"f":"rev_no"/.test(u.detail || '') ? ['Supplier can’t lower the cost', 'gold'] : ['Supplier changed cost', 'orange'])
    : u.kind === 'status' ? ({ cancellation_requested: ['Cancellation requested', 'red'], delivered: ['Marked delivered', 'mint'], cancelled: ['Cancelled by client', 'red'] }[u.detail] || ['Status changed', 'mint'])
    : u.kind === 'edited' ? (u.detail === 'customer' ? ['Customer details changed', 'orange'] : ['Order edited', 'orange']) : ['Order updated', 'gold'];
  // One tag per kind of change, newest first, with ×2 when it happened more than once.
  function updateTags(o) {
    const seen = new Map();
    for (const u of newUpdates(o)) { const [label, tone] = updateLabel(u); const x = seen.get(label); if (x) x.n++; else seen.set(label, { tone, n: 1 }); }
    return seen.size ? `<span class="upd-tags">${[...seen].map(([label, x]) => `<span class="upd-tag t-${x.tone}">${esc(label)}${x.n > 1 ? `<span data-no-i18n> ×${x.n}</span>` : ''}</span>`).join('')}</span>` : '';
  }
  // Opening an order marks its updates as seen (here and in the bell).
  function markSeen(o) {
    const ids = (o?.updates || []).map(u => 'ev-' + u.id); if (!ids.length) return;
    const r = readState(), add = ids.filter(id => !r.ids.has(id)); if (!add.length) return;
    try { localStorage.setItem('dl_notif_read_ids', JSON.stringify([...r.ids, ...add].slice(-2000))); } catch (e) { /* private mode */ }
    readCache = null; tell({ type: 'dl-followups', unread: unreadTotal() }); if (S.tab === 'orders') renderList();
  }

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
    if (S.filter === null) S.filter = S.orders.some(x => newUpdates(x).length) ? 'all' : S.orders.some(x => x.status === 'cancellation_requested') ? 'cancellation_requested' : S.orders.some(x => x.unreadMessages) ? 'followups' : S.orders.some(x => x.status === 'pending') ? 'pending' : 'all';
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

  // ---------- Overview cards: a details window + one smart button (Erwin, 5 Nov 2026) ----------
  // A click on a card opens a window under it with the numbers behind the card (every list adds up to the card's number)
  // and one main button, picked by cardActions(). The window sits next to the cards (data-kpi-wrap), not inside them.
  let kpiWin = null; // the card whose window is open: 'clients' | 'orders' | 'unpaid' | 'earnings'
  const kwPlural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // Red only for late money (Erwin, 5 Nov 2026): an unpaid order is late after 14 days, the same rule as the client's own
  // reminder in the portal (src/portal/13-payments.js). Days by order date, counted the same way.
  const LATE_DAYS = 14, unpaidDays = o => Math.floor((Date.now() - Date.parse(window.DLClientStoreMath.dateKey(o) + 'T12:00:00Z')) / 864e5);
  const lateClientIds = () => new Set(S.orders.filter(o => !o.archived && window.DLPayOrders.state(o) === 'unpaid' && !(unpaidDays(o) <= LATE_DAYS)).map(o => o.clientId));

  // Every number the four cards show, worked out once for the cards and for their windows.
  function kpiFacts() {
    const cl = S.ov.clients, M = window.DLClientStoreMath, UIS = window.DLClientStoreUI, PO = window.DLPayOrders;
    const cents = n => Math.round(Number(n || 0) * 100), feeC = o => cents(o.commission);
    const months = M.monthsOf(S.orders), month = months.includes(kpiMonth()) ? kpiMonth() : 'all', name = month === 'all' ? '' : UIS.monthName(month);
    const live = S.orders.filter(o => !o.archived), inMonth = month === 'all' ? live : live.filter(o => M.dateKey(o).slice(0, 7) === month);
    const os = inMonth.filter(o => o.status !== 'cancelled');
    // "Not paid yet" is what clients owe right now (billed orders with no payment linked), whatever month is picked.
    const unpaid = live.filter(o => PO.state(o) === 'unpaid'), owed = unpaid.reduce((n, o) => n + PO.dueCents(o), 0);
    const owing = new Set(unpaid.map(o => o.clientId)).size, oldest = unpaid.map(o => M.dateKey(o)).filter(Boolean).sort()[0];
    // Our earnings (Erwin, 4 Nov 2026): our fee on every order of the period, plus the fee we keep on a cancelled order the
    // client had paid; split into collected (paid orders), not paid yet, and not billed yet (no cost yet), which add up.
    // Since 8 Nov 2026 the admin picks it per order in the cancel window (keepFee: auto = only if paid, yes, no); a fee kept
    // on an order that was not paid is owed (in "not paid yet"), not collected (same rule as syncKeptFees on the server).
    const keptOn = inMonth.filter(o => o.status === 'cancelled' && cents(o.commission) > 0 && (o.keepFee === 'yes' || (o.keepFee !== 'no' && o.paymentId)));
    const keptC = keptOn.reduce((n, o) => n + feeC(o), 0), onOrdersC = os.reduce((n, o) => n + feeC(o), 0), feesC = onOrdersC + keptC;
    const keptOwedC = keptOn.filter(o => !o.paymentId).reduce((n, o) => n + feeC(o), 0);
    const collectedC = os.filter(o => PO.state(o) === 'paid').reduce((n, o) => n + feeC(o), 0) + keptC - keptOwedC;
    const noBillC = os.filter(o => PO.state(o) === 'unbilled').reduce((n, o) => n + feeC(o), 0);
    // Successful orders (Erwin/Shahar, 5 Nov 2026): not cancelled and paid by the client. The supplier pays us its own amount
    // for each of them ("two fees on all orders": the client's fee plus $1 from the supplier; Fees & settings sets it).
    const paidOs = os.filter(o => PO.state(o) === 'paid'), cxN = inMonth.length - os.length;
    const supRateC = cents(S.ov.settings?.supplier_bonus_per_order ?? 1), supC = paidOs.length * supRateC, totalC = feesC + supC;
    // What clients owe right now: each client's balance (unpaid orders minus credit and payments not linked to orders), and
    // that amount without our fee (admin only): minus our fee on the unpaid orders (credit lowers the supplier's part).
    const balanceC = cl.reduce((n, c) => n + Math.max(0, cents(c.outstanding)), 0);
    const unpaidFeeC = unpaid.reduce((n, o) => n + feeC(o), 0) + live.filter(o => o.status === 'cancelled' && !o.paymentId && o.keepFee === 'yes').reduce((n, o) => n + feeC(o), 0), feePartC = Math.min(unpaidFeeC, balanceC);
    const clientsN = month === 'all' ? cl.filter(c => c.active).length : new Set(os.map(o => o.clientId)).size;
    const lateIds = lateClientIds(), late = balanceC > 0 && f_late(cl, lateIds, cents);
    return { cl, M, PO, cents, feeC, months, month, name, live, inMonth, os, unpaid, owed, owing, oldest, keptOn, keptC, onOrdersC, feesC, collectedC, noBillC, paidOs, cxN, supRateC, supC, totalC, balanceC, feePartC, clientsN, lateIds, late };
  }

  // Late = a client who still owes money has an unpaid order older than 14 days.
  function f_late(cl, lateIds, cents) { return cl.some(c => lateIds.has(c.id) && cents(c.outstanding) > 0); }
  // A client's plan, when it needs the admin (the same rule as "Needs your attention").
  function planNote(c) {
    const s = c.subscription || {};
    if (s.status === 'overdue') return 'Subscription overdue';
    if (s.status !== 'trial') return '';
    if (s.trialEnded) return 'Free month over';
    const d = s.trialDaysLeft;
    return d === null || d === undefined || d < 0 || d > 7 ? '' : d === 0 ? 'Free month ends today' : d === 1 ? 'Free month ends tomorrow' : `Free month ends in ${d} days`;
  }

  // The one main button of each card (Erwin, 5 Nov 2026): the most urgent job behind that card's number, else the list that
  // explains the number. The first rule that matches wins, but a button never repeats a job of "Needs your attention" (the
  // list under the cards) or another card's button, so each button leads somewhere new. Cards are served most urgent
  // first: money owed, orders, earnings, clients. key = what the button does, used to spot repeats.
  function cardActions(f) {
    const owes = f.cl.filter(c => f.cents(c.outstanding) > 0).sort((a, b) => b.outstanding - a.outstanding);
    const sent = f.cl.filter(c => c.pendingTransfers > 0), nSent = sent.reduce((n, c) => n + c.pendingTransfers, 0);
    const toClient = (c, tab, label) => ({ label, name: c.name, key: 'client:' + c.id, attrs: `data-open-client="${c.id}" data-client-tab="${tab}"` });
    const rules = {
      unpaid: [
        // A client sent a transfer confirmation: check it first (recording it pays their orders).
        [nSent > 0, () => sent.length === 1 ? { ...toClient(sent[0], 'payments', `Check ${kwPlural(nSent, 'transfer confirmation')} from`) } : { label: `Check ${kwPlural(nSent, 'transfer confirmation')}`, key: 'job:transfers', attrs: 'data-go-tab="clients"' }],
        // One client owes: record their payment (opens their Payments with the form).
        [owes.length === 1, () => ({ label: 'Record payment from', name: owes[0].name, key: 'client:' + owes[0].id, attrs: `data-card-pay="${owes[0].id}"` })],
        [f.unpaid.length > 0, () => ({ label: 'Show unpaid orders', key: 'list:unpaid', attrs: 'data-go-filter="unpaid"' })],
      ],
      // The order jobs (waiting, need cost, no tracking, messages, revisions) are all in "Needs your attention".
      orders: [[true, () => ({ label: 'See all orders', key: 'list:orders', attrs: 'data-go-filter="all"' })]],
      earnings: [
        // Fees on orders with no cost can't be billed until the supplier adds the cost.
        [f.noBillC > 0, () => ({ label: 'See orders that need cost', key: 'job:needscost', attrs: 'data-go-filter="needscost"' })],
        [f.feesC - f.collectedC - f.noBillC > 0, () => ({ label: 'Show unpaid orders', key: 'list:unpaid', attrs: 'data-go-filter="unpaid"' })],
        [true, () => ({ label: 'See money by month', key: 'chart', attrs: 'data-card-scroll="chart"' })],
      ],
      clients: [
        [owes.length === 1, () => toClient(owes[0], 'orders', 'Go to')],
        [owes.length > 1, () => ({ label: 'See who owes', key: 'list:clients-owing', attrs: 'data-go-tab="clients"' })],
        [f.cl.some(planNote), () => ({ label: 'See plans that need you', key: 'job:plans', attrs: 'data-go-tab="clients"' })],
        [true, () => ({ label: 'See all clients', key: 'list:clients', attrs: 'data-go-tab="clients"' })],
      ],
    };
    const used = new Set(todoRows().map(r => r.key)), out = {};
    for (const k of ['unpaid', 'orders', 'earnings', 'clients']) {
      out[k] = rules[k].filter(([when]) => when).map(([, make]) => make()).find(a => !used.has(a.key)) || null;
      if (out[k]) used.add(out[k].key);
    }
    return out;
  }

  // Window parts. Labels are translated; amounts and client names are not (data-no-i18n).
  const kwRow = (op, label, value, meta = '', cls = '') => `<div class="kw-row${cls ? ' ' + cls : ''}"><span class="kw-op" aria-hidden="true">${op}</span><span class="kw-l"><span>${esc(label)}</span>${meta ? `<small>${esc(meta)}</small>` : ''}</span><b data-no-i18n>${value}</b></div>`;
  const kwItem = (attrs, name, meta, value, cls = '') => `<button type="button" class="kw-row kw-item" ${attrs}><span class="kw-op" aria-hidden="true"></span><span class="kw-l"><b data-no-i18n>${esc(name)}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span><b data-no-i18n class="${cls}">${value}</b></button>`;
  const kwBlock = (title, rows) => rows ? `<div class="kw-block">${title ? `<h4>${esc(title)}</h4>` : ''}${rows}</div>` : '';
  const kwMoney = c => money(c / 100);
  // Group orders by client: [{ c, list }] biggest first by the value given.
  const kwByClient = (orders, value) => [...new Set(orders.map(o => o.clientId))].map(id => ({ id, c: clientOf(id), list: orders.filter(o => o.clientId === id) }))
    .map(x => ({ ...x, v: value(x.list) })).sort((a, b) => b.v - a.v);

  function cardWindowBody(k, f) {
    if (k === 'unpaid') {
      if (!f.unpaid.length && !f.balanceC) return '<p class="muted kw-empty">Every billed order is paid</p>';
      const diff = f.owed - f.balanceC;
      const sum = kwRow('', 'Unpaid orders', kwMoney(f.owed), kwPlural(f.unpaid.length, 'order'))
        + (Math.abs(diff) >= 1 ? kwRow(diff > 0 ? '−' : '+', diff > 0 ? 'Credit and earlier payments' : 'Other amounts on the balance', kwMoney(Math.abs(diff))) : '')
        + kwRow('=', 'Clients owe now', kwMoney(f.balanceC), '', 'tot');
      const split = f.balanceC > 0 ? kwRow('', 'Without our fee', kwMoney(f.balanceC - f.feePartC)) + kwRow('+', 'Our fee', kwMoney(f.feePartC)) + kwRow('=', 'Total', kwMoney(f.balanceC), '', 'tot') : '';
      const owes = f.cl.filter(c => f.cents(c.outstanding) > 0).sort((a, b) => b.outstanding - a.outstanding);
      const clients = owes.map(c => {
        const mine = f.unpaid.filter(o => o.clientId === c.id), old = mine.map(o => f.M.dateKey(o)).filter(Boolean).sort()[0];
        return kwItem(`data-open-client="${c.id}" data-client-tab="payments"`, c.name, [mine.length ? kwPlural(mine.length, 'order') : '', old ? `oldest ${f.PO.day(old)}` : ''].filter(Boolean).join(' · '), kwMoney(f.cents(c.outstanding)), f.lateIds.has(c.id) ? 'neg' : '');
      }).join('');
      // How long the orders have been unpaid, by order date (before credit, so these add up to "Unpaid orders"); late in red.
      const ages = [['Up to 14 days', a => a <= 14, ''], ['15–30 days', a => a > 14 && a <= 30, 'late'], ['Over 30 days', a => !(a <= 30), 'late']].map(([label, test, cls]) => {
        const list = f.unpaid.filter(o => test(unpaidDays(o)));
        return list.length ? kwRow('', label, kwMoney(list.reduce((n, o) => n + f.PO.dueCents(o), 0)), kwPlural(list.length, 'order'), cls) : '';
      }).join('');
      return kwBlock('', sum) + kwBlock('Without our fee', split) + kwBlock('By client', clients) + kwBlock('How long unpaid (before credit)', ages);
    }
    if (k === 'orders') {
      if (!f.os.length) return '<p class="muted kw-empty">No orders yet</p>';
      const st = ['pending', 'processing', 'cancellation_requested', 'shipped', 'delivered'], n = s => f.os.filter(o => o.status === s).length;
      const other = f.os.filter(o => !st.includes(o.status)).length;
      const status = st.map(s => n(s) ? kwRow('', UI.LABEL[s], String(n(s))) : '').join('') + (other ? kwRow('', 'Other', String(other)) : '') + kwRow('=', 'Total', String(f.os.length), '', 'tot');
      // Successful orders = not cancelled and paid (what the supplier's $1 per order is counted on).
      const payState = kwRow('', 'Paid', String(f.paidOs.length), 'successful orders') + kwRow('+', 'Not paid yet', String(f.os.length - f.paidOs.length)) + kwRow('=', 'Total', String(f.os.length), 'cancelled not counted', 'tot');
      const per = kwByClient(f.os, l => l.length).map(x => kwItem(`data-open-client="${x.id}" data-client-tab="orders"`, x.c?.name || '—', '', String(x.v))).join('');
      const cx = f.inMonth.filter(o => o.status === 'cancelled').length;
      return kwBlock('By status', status) + kwBlock('Paid by the client', payState) + kwBlock('By client', per) + (cx ? `<p class="kw-note"><span>Cancelled orders, not counted above:</span> <b data-no-i18n>${cx}</b></p>` : '');
    }
    if (k === 'earnings') {
      if (!f.totalC) return '<p class="muted kw-empty">No fees yet</p>';
      const notPaid = f.feesC - f.collectedC - f.noBillC;
      const both = f.supC ? kwRow('', 'Client fees', kwMoney(f.feesC), kwPlural(f.os.length + f.keptOn.length, 'order')) + kwRow('+', 'From the supplier', kwMoney(f.supC), `${kwPlural(f.paidOs.length, 'paid order')} × ${kwMoney(f.supRateC)}`) + kwRow('=', 'Total', kwMoney(f.totalC), '', 'tot') : '';
      const sum = kwRow('', 'Collected', kwMoney(f.collectedC)) + kwRow('+', 'Not paid yet', kwMoney(notPaid)) + (f.noBillC ? kwRow('+', 'Not billed yet', kwMoney(f.noBillC), 'No cost yet, so not on a bill') : '') + kwRow('=', 'Total', kwMoney(f.feesC), '', 'tot');
      const from = f.keptC ? kwRow('', 'Our fee on orders', kwMoney(f.onOrdersC), kwPlural(f.os.length, 'order')) + kwRow('+', 'Fees kept on cancelled orders', kwMoney(f.keptC), kwPlural(f.keptOn.length, 'order')) + kwRow('=', 'Total', kwMoney(f.feesC), '', 'tot') : '';
      const per = kwByClient([...f.os, ...f.keptOn], l => l.reduce((t, o) => t + f.feeC(o) + (o.status !== 'cancelled' && f.PO.state(o) === 'paid' ? f.supRateC : 0), 0)).filter(x => x.v).map(x => kwItem(`data-open-client="${x.id}" data-client-tab="payments"`, x.c?.name || '—', kwPlural(x.list.length, 'order'), kwMoney(x.v))).join('');
      const supNote = f.supC ? `<p class="kw-note"><span>From the supplier: for each paid order that isn't cancelled. The supplier pays it, it's not on the client's bill.</span></p>` : '';
      return kwBlock('', both) + kwBlock(f.supC ? 'Client fees' : '', sum) + kwBlock('Where it comes from', from) + supNote + kwBlock('By client', per);
    }
    // Clients: all time = every active client, with what they owe and their plan; a month = clients with orders that month.
    if (f.month !== 'all') {
      const per = kwByClient(f.os, l => l.length).map(x => kwItem(`data-open-client="${x.id}" data-client-tab="orders"`, x.c?.name || '—', kwPlural(x.v, 'order'), '')).join('');
      return per ? kwBlock('', per) + `<p class="kw-note" data-kw-count><span>Clients with orders:</span> <b data-no-i18n>${f.clientsN}</b></p>` : '<p class="muted kw-empty">No orders yet</p>';
    }
    const active = f.cl.filter(c => c.active).sort((a, b) => b.outstanding - a.outstanding || String(a.name).localeCompare(String(b.name)));
    if (!active.length) return '<p class="muted kw-empty">No clients yet</p>';
    const orders = id => f.live.filter(o => o.clientId === id && o.status !== 'cancelled').length;
    const rows = active.map(c => kwItem(`data-open-client="${c.id}" data-client-tab="orders"`, c.name, [kwPlural(orders(c.id), 'order'), planNote(c)].filter(Boolean).join(' · '), f.cents(c.outstanding) > 0 ? kwMoney(f.cents(c.outstanding)) : '', f.lateIds.has(c.id) ? 'neg' : '')).join('');
    const off = f.cl.length - active.length;
    return kwBlock('', rows) + `<p class="kw-note" data-kw-count><span>Active clients:</span> <b data-no-i18n>${active.length}</b></p>` + (off ? `<p class="kw-note"><span>Disabled accounts, not counted:</span> <b data-no-i18n>${off}</b></p>` : '');
  }

  function cardWindowHTML(k, f, act) {
    const title = { clients: 'Clients', orders: f.month === 'all' ? 'Orders' : `Orders in ${f.name}`, unpaid: 'Not paid yet', earnings: f.month === 'all' ? 'Our earnings' : `Our earnings in ${f.name}` }[k];
    // A small link to the whole list, unless the main button already goes there.
    const more = { unpaid: f.unpaid.length ? { label: 'All unpaid orders', key: 'list:unpaid', attrs: 'data-go-filter="unpaid"' } : null, orders: { label: 'All orders', key: 'list:orders', attrs: 'data-go-filter="all"' },
      earnings: { label: 'Money by month', key: 'chart', attrs: 'data-card-scroll="chart"' }, clients: { label: 'All clients', key: 'list:clients', attrs: 'data-go-tab="clients"' } }[k];
    const main = act ? `<button type="button" class="btn btn-primary kw-go" ${act.attrs}><span>${esc(act.label)}</span>${act.name ? `<b data-no-i18n>${esc(act.name)}</b>` : ''}</button>` : '';
    const link = more && (!act || act.key !== more.key) ? `<button type="button" class="kw-more" ${more.attrs}>${esc(more.label)}</button>` : '';
    return `<div class="kw-head"><h3 id="kpi-win-h">${esc(title)}</h3><button type="button" class="kw-x" data-kw-close aria-label="Close">${UI.svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="kw-body">${cardWindowBody(k, f)}</div>${main || link ? `<div class="kw-foot">${main}${link}</div>` : ''}`;
  }

  function showCardWindow(k, focus) {
    const wrap = $('[data-kpi-wrap]'), card = wrap?.querySelector(`[data-kpi-card="${k}"]`); if (!card) return;
    const f = kpiFacts();
    let win = wrap.querySelector('[data-kpi-win]');
    if (!win) { wrap.insertAdjacentHTML('beforeend', '<div class="kpi-win" data-kpi-win id="kpi-win" role="dialog" aria-labelledby="kpi-win-h" tabindex="-1"></div>'); win = wrap.querySelector('[data-kpi-win]'); }
    win.dataset.kpiWin = k; win.innerHTML = cardWindowHTML(k, f, cardActions(f)[k]);
    kpiWin = k;
    for (const b of wrap.querySelectorAll('[data-kpi-card]')) b.setAttribute('aria-expanded', String(b === card));
    placeCardWindow();
    if (focus) win.focus({ preventScroll: true });
  }
  function closeCardWindow(back = true) {
    const wrap = $('[data-kpi-wrap]'), card = kpiWin && wrap?.querySelector(`[data-kpi-card="${kpiWin}"]`);
    kpiWin = null;
    wrap?.querySelector('[data-kpi-win]')?.remove();
    for (const b of wrap ? wrap.querySelectorAll('[data-kpi-card]') : []) b.setAttribute('aria-expanded', 'false');
    if (back && card) card.focus();
  }
  // Under its card, lined up with the card's start edge (right edge in Hebrew), and never wider than the cards. On a phone
  // (cards 2 by 2) it opens under all four cards, so it never covers one; the card that opened it is highlighted.
  function placeCardWindow() {
    const wrap = $('[data-kpi-wrap]'), win = wrap?.querySelector('[data-kpi-win]'), card = win && wrap.querySelector(`[data-kpi-card="${win.dataset.kpiWin}"]`); if (!card) return;
    const W = wrap.clientWidth, w = W < 640 ? W : Math.min(460, W), rtl = getComputedStyle(wrap).direction === 'rtl';
    const x = rtl ? card.offsetLeft + card.offsetWidth - w : card.offsetLeft;
    const grid = wrap.querySelector('[data-kpis]'), top = W < 640 ? grid.offsetTop + grid.offsetHeight : card.offsetTop + card.offsetHeight;
    Object.assign(win.style, { width: w + 'px', left: Math.max(0, Math.min(W - w, x)) + 'px', top: top + 8 + 'px' });
  }
  // Clicks for the card windows. Returns true when the click was only about the window.
  function cardWindowClick(t) {
    const card = t.closest('[data-kpi-card]');
    if (card) { if (kpiWin === card.dataset.kpiCard) closeCardWindow(); else showCardWindow(card.dataset.kpiCard, true); return true; }
    if (!t.closest('[data-kpi-win]')) return false;
    if (t.closest('[data-kw-close]')) { closeCardWindow(); return true; }
    const pay = t.closest('[data-card-pay]');
    if (pay) { closeCardWindow(false); payFrom(Number(pay.dataset.cardPay)); return true; }
    if (t.closest('[data-card-scroll]')) { closeCardWindow(false); $('[data-money-chart]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
    if (t.closest('button')) closeCardWindow(false); // a list or a client: the usual click handler opens it
    return false;
  }
  // "Record payment from …": the client's Payments, with the payment form open.
  async function payFrom(id) {
    await openClient(id, 'payments');
    if (S.drawer?.kind !== 'client' || S.drawer.id !== id) return;
    S.drawer.payNew = true; delete S.drawer.payEdit; delete S.drawer.payAttach;
    fillClient(clientOf(id), false);
    setTimeout(() => $('[data-pay-card]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  // Esc or a click anywhere else closes the window; it follows its card when the page changes width.
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && kpiWin) { e.stopPropagation(); closeCardWindow(); } }, true);
  document.addEventListener('click', e => { if (kpiWin && !e.target.closest?.('[data-kpi-win], [data-kpi-card]')) closeCardWindow(false); }, true);
  addEventListener('resize', () => { if (kpiWin) placeCardWindow(); });
  // ---------- layout ----------
  // Each section its own title, one line and only its own button (Erwin, 5 Nov 2026: no duplications on each section).
  // Titles are the Control sidebar names.
  const HEADS = {
    overview: ['Clients overview', 'What needs you today, and how the money stands.'],
    orders: ['Client orders', 'Every order your clients send in. Filter, search or open one.', 'order'],
    clients: ['Clients & payments', 'Each client’s account: billed, paid, still owed, and cancelled orders.', 'client'],
    claims: ['Claims', 'Problems clients report with an order, and what we decided.'],
    products: ['Client products', 'Products clients sent for a price, and their cost revision requests.'],
    settings: ['Fees & settings', 'Our fee per order, how clients pay, shipping, the supplier sheet and team accounts.'],
  };
  function headHTML(tab) {
    const [title, line, act] = HEADS[tab] || HEADS.overview;
    // English keeps the gold "&"; Hebrew gets the whole title as one phrase, so it is translated as one.
    const h1 = document.documentElement.lang !== 'he' && title.includes(' & ') ? title.split(' & ').map(esc).join(' <span>&amp;</span> ') : esc(title);
    // The month picker sits on the title line of Clients overview (7 Nov 2026: one row less); renderKpis fills it.
    const btn = tab === 'overview' ? `<label class="kpi-month"><span>Show</span><select data-kpi-month aria-label="Month"></select></label>` : act === 'order' ? `<button type="button" class="btn btn-primary" data-new-order>${ic('plus')}New order</button>` : act === 'client' ? `<button type="button" class="btn btn-primary" data-add-account="client">${ic('users')}Add client</button>` : '';
    return `<div><p class="eyebrow">Direct Line clients</p><h1>${h1}</h1><p>${esc(line)}</p></div>${btn ? `<div class="adm-actions">${btn}</div>` : ''}`;
  }
  function shell() {
    $('#app').innerHTML = `
      <section class="adm-head" data-adm-head>${headHTML(S.tab)}</section>
      <div class="kpi-wrap" data-kpi-wrap><section class="kpis" data-kpis></section></div>
      <div class="seg" role="tablist" data-main-tabs>${[['overview', 'Overview'], ['orders', 'Orders'], ['clients', 'Clients'], ['claims','Claims'], ['products','Products'], ['settings', 'Fees & settings']].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}<span data-tab-badge="${k}"></span></button>`).join('')}</div>
      <section data-tab-body style="display:grid;gap:14px"></section>`;
    // Inside the Control page its sidebar is the navigation (Erwin, 23 Oct 2026): no second row of tabs here.
    try { if (window.parent !== window && window.parent.document.querySelector('.nav-item[data-client-tab]')) document.body.classList.add('in-control'); } catch (e) { /* another origin */ }
    $('#app').addEventListener('click', onClick);
    $('#app').addEventListener('input', onInput);
    $('#app').addEventListener('change', onChange);
  }
  // The month picker above the cards: All time, or one calendar month (orders by order date).
  const kpiMonthKey = 'dl-admin-kpi-month';
  function kpiMonth() { try { return localStorage.getItem(kpiMonthKey) || 'all'; } catch (e) { return 'all'; } }
  document.addEventListener('change', e => { if (!e.target.matches?.('[data-kpi-month]')) return; try { localStorage.setItem(kpiMonthKey, e.target.value); } catch (x) { /* private mode */ } renderKpis(); });
  function renderKpis() {
    // Four cards (Erwin, 23 Oct 2026); a click opens the details window with one smart button (02-card-window.js, 5 Nov).
    const f = kpiFacts(), UIS = window.DLClientStoreUI, plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`, sel = $('[data-kpi-month]');
    if (sel) sel.innerHTML = `<option value="all">All time</option>` + f.months.map(k => `<option value="${k}"${k === f.month ? ' selected' : ''} data-no-i18n>${esc(UIS.monthName(k))}</option>`).join('');
    const { month, name, os, unpaid, owed, owing, oldest, balanceC, feePartC } = f;
    // Orders: how many are shipped (the jobs, like waiting or need cost, are in "Needs your attention" under the cards).
    const shipped = os.filter(o => ['shipped', 'delivered'].includes(o.status)).length, notShipped = os.length - shipped;
    const cards = [
      { key: 'clients', k: 'Clients', v: f.clientsN, sub: [month === 'all' ? (owing ? `${plural(owing, 'client')} with unpaid orders` : plural(f.cl.length, 'account')) : `with orders in ${name}`], icon: 'users', tone: 'var(--blue)' },
      { key: 'orders', k: month === 'all' ? 'Orders' : `Orders in ${name}`, v: os.length, sub: os.length ? [`${f.paidOs.length} paid`, notShipped ? `${notShipped} not shipped yet` : '', shipped ? `${shipped} shipped` : ''].filter(Boolean) : ['No orders yet'], sub2: f.cxN ? `${f.cxN} cancelled, not counted` : '', icon: 'orders', tone: 'var(--orange)' },
      { key: 'unpaid', k: 'Not paid yet', v: money(balanceC / 100), sub: unpaid.length ? [plural(unpaid.length, 'order'), plural(owing, 'client'), oldest ? `oldest ${f.PO.day(oldest)}` : ''].filter(Boolean) : ['Every billed order is paid'], sub2: Math.abs(owed - balanceC) >= 1 ? `Unpaid orders ${money(owed / 100)} − credit and earlier payments ${money((owed - balanceC) / 100)}` : '', sub3: balanceC > 0 ? `Without our fee ${money((balanceC - feePartC) / 100)} · our fee ${money(feePartC / 100)}` : '', icon: 'money', tone: f.late ? 'var(--red)' : balanceC > 0 ? 'var(--orange)' : 'var(--mint)', owe: balanceC > 0, late: f.late },
      { key: 'earnings', k: month === 'all' ? 'Our earnings' : `Our earnings in ${name}`, v: money(f.totalC / 100), sub: [...(f.supC ? [`${money(f.feesC / 100)} client fees`, `${money(f.supC / 100)} from the supplier`] : []), `${money(f.collectedC / 100)} collected`, `${money((f.feesC - f.collectedC - f.noBillC) / 100)} not paid yet`, ...(f.noBillC ? [`${money(f.noBillC / 100)} not billed yet`] : []), `${plural(os.length + f.keptOn.length, 'order')}`], icon: 'check', tone: 'var(--gold)', hero: true },
    ];
    $('[data-kpis]').innerHTML = cards.map(c => `<button type="button" class="stat stat-go${c.hero ? ' hero' : ''}${c.owe ? ' owe' : ''}${c.late ? ' late' : ''}" style="--tone:${c.tone}" data-kpi-card="${c.key}" aria-haspopup="dialog" aria-expanded="${kpiWin === c.key}" title="Show details"><span class="stat-ic">${ic(c.icon)}</span><small>${esc(c.k)}</small><strong>${c.v}</strong><em>${c.sub.map(x => `<span>${esc(x)}</span>`).join(' · ')}</em>${c.sub2 ? `<em class="stat-note">${esc(c.sub2)}</em>` : ''}${c.sub3 ? `<em class="stat-fee">${esc(c.sub3)}</em>` : ''}</button>`).join('');
    if (kpiWin) showCardWindow(kpiWin, false);
    const unread = S.orders.filter(o => o.unreadMessages).length;
    const b = $('[data-tab-badge="orders"]'); if (b) b.innerHTML = unread ? `<span class="badge-new">${unread}</span>` : '';
  }
  function renderTab() {
    $$('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === S.tab); b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)); });
    // The summary cards (and their month picker) belong to Clients overview only (Erwin, 4 Nov 2026), not to every section.
    for (const el of $$('[data-kpis]')) el.style.display = S.tab === 'overview' ? '' : 'none';
    if (S.tab !== 'overview') closeCardWindow(false);
    const head = $('[data-adm-head]'); if (head) head.innerHTML = headHTML(S.tab);
    if (S.tab === 'overview' && S.ov) renderKpis();
    if(S.tab==='claims'){renderClaims();return;}
    if(S.tab==='products'){renderProducts();return;}
    const body = $('[data-tab-body]');
    if (S.tab === 'orders') {
      body.innerHTML = `<div class="bar"><div class="chips" data-chips></div><div class="bar-r">${sortPick('admin-orders-2', ADMIN_ORDER_SORTS)}<select data-client-filter aria-label="Client"></select><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, tracking, client…" value="${esc(S.q)}" data-q></label></div></div>
        <section class="card" data-list></section>`;
    } else if (S.tab === 'clients') {
      body.innerHTML = `<div class="bar"><label class="search"><span class="sr">Search clients</span>${ic('search')}<input type="search" placeholder="Search clients…" value="${esc(S.cq)}" data-cq></label>${sortPick('admin-clients', CLIENT_SORTS)}</div>
        <section class="card" data-list></section><div data-cancelled-slot></div>`;
    } else if (S.tab === 'overview') body.innerHTML = '<div class="ovw" data-overview></div>';
    else body.innerHTML = settingsHTML();
    renderList();
    if (S.tab === 'settings') bindSettings();
  }
  // ---------- bulk edit (Orders tab): select orders, then change them all at once ----------
  function bulkBar(archivedView, allOn) {
    const n = S.picked.size, all = `<label class="bulk-all"><input type="checkbox" data-pick-all${allOn ? ' checked' : ''}><span>Select all</span></label>`;
    if (!n) return `<div class="bulk-bar bulk-hint">${all}<span class="dim">Tick orders to change several at once: status, courier, fee or archive.</span></div>`;
    const couriers = String(S.ov.settings.couriers || '').split('\n').filter(Boolean);
    return `<div class="bulk-bar" data-bulk-bar>${all}<b>${n} selected</b>
      ${archivedView ? '<button type="button" class="btn btn-sm" data-bulk="restore">Restore</button>' : `
      <label class="bulk-f"><span>Status</span><select data-bulk-status><option value="">Choose…</option>${ADMIN_STATUSES.map(s => `<option value="${s}">${UI.LABEL[s]}</option>`).join('')}<option value="cancelled">${UI.LABEL.cancelled}</option><option value="undo-cancel">Undo cancellation approval</option></select></label><button type="button" class="btn btn-sm" data-bulk="status">Set status</button>
      <label class="bulk-f"><span>Courier</span><input data-bulk-courier list="dl-bulk-couriers" maxlength="60" placeholder="e.g. Yanwen"><datalist id="dl-bulk-couriers">${couriers.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label><button type="button" class="btn btn-sm" data-bulk="courier">Set courier</button>
      <label class="bulk-f"><span>Fee</span><span class="money"><input data-bulk-fee type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.50"></span></label><button type="button" class="btn btn-sm" data-bulk="fee">Set fee</button>
      <button type="button" class="btn btn-sm btn-danger" data-bulk="archive">Archive</button>`}
      <button type="button" class="btn btn-sm btn-ghost" data-bulk="clear">Clear selection</button>
      <span class="bulk-msg" data-bulk-msg role="status"></span></div>`;
  }
  async function runBulk(kind, btn) {
    const bar = $('[data-bulk-bar]'), msg = $('[data-bulk-msg]', bar), ids = [...S.picked];
    if (kind === 'clear') { S.picked.clear(); renderOrders(); return; }
    let body = null;
    if (kind === 'status') { const v = $('[data-bulk-status]', bar).value; if (!v) { msg.textContent = 'Choose a status first.'; return; } body = { status: v }; }
    // Cancelled: requests are approved, other orders cancelled. Since 8 Nov 2026 the cancel window opens first, to choose
    // each order's cancellation fee (the supplier's from the sheet) and whether our fee is charged (03-cancel-window.js).
    if (kind === 'status' && body?.status === 'cancelled') { openCancelWindow(ids, failedIds => { S.picked = new Set(failedIds); renderOrders(); }); return; }
    if (kind === 'courier') { const v = $('[data-bulk-courier]', bar).value.trim(); if (!v) { msg.textContent = 'Type or pick a courier first.'; return; } body = { courier: v }; }
    if (kind === 'addrflag') body = { clearAddressFlag: true };
    if (kind === 'fee') { const v = $('[data-bulk-fee]', bar).value; if (v === '' || !(Number(v) >= 0)) { msg.textContent = 'Enter the fee first.'; return; } body = { commission: v }; }
    if (kind === 'archive' && !btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = `Click again to archive ${ids.length}`; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Archive'; } }, 4000); return; }
    $$('button, select, input', bar).forEach(x => { x.disabled = true; });
    const failed = [], failedIds = [];
    for (const [i, id] of ids.entries()) {
      msg.textContent = `Updating ${i + 1} of ${ids.length}…`;
      try {
        if (kind === 'archive' || kind === 'restore') await api('/admin/orders/' + id + '/archive', { method: 'POST', body: { archived: kind === 'archive' } });
        // Approved by mistake (8 Nov 2026): back to the client's cancellation request, fee removed.
        else if (body?.status === 'undo-cancel') await api('/orders/' + id + '/undo-cancellation', { method: 'POST', body: {} });
        else await api('/orders/' + id, { method: 'PUT', body });
      } catch (ex) { failedIds.push(id); failed.push(`${orderName(S.orders.find(o => o.id === id) || S.archivedOrders.find(o => o.id === id) || { id })}: ${ex.message}`); }
    }
    const done = ids.length - failed.length;
    S.picked = new Set(failedIds); // what didn't work stays selected, so it can be tried again
    await loadAll(); renderList(); if (kind === 'archive' || kind === 'restore') tell({ type: 'dl-clients-changed' });
    toast(`Updated ${done} order${done === 1 ? '' : 's'}.` + (failed.length ? ` ${failed.length} not changed — they stay selected.` : ''));
    if (failed.length) { const m = $('[data-bulk-msg]'); if (m) m.textContent = failed.slice(0, 3).join(' · '); }
  }
  function renderList() {
    if(S.tab==='products'||S.tab==='claims')return;
    if (S.tab === 'orders') renderOrders();
    else if (S.tab === 'clients') renderClients();
    else if (S.tab === 'overview') renderOverview();
    else { const a = $('[data-admins]'); if (a && !a.querySelector('[data-admin-form]')) a.innerHTML = adminsHTML(); }
  }

  // ---------- cancel window: decide each order's fees before cancelling (Erwin, 8 Nov 2026) ----------
  // "When I press Set status, a pop up asks me all relevant changes before proceeding with approval of cancellations:
  // which orders should I still charge our fee and not." Opens from bulk Set status → Cancelled and from Approve
  // cancellation / Cancelled in an order's panel. One row per order: in or out, the cancellation fee (the supplier's from
  // the sheet, editable) and whether our fee is charged. Our fee starts ticked only on orders the client already paid
  // (the rule since 29 Oct), so nothing changes unless Erwin changes it. Nothing is saved until the main button.
  // keepFee sent to the server: 'auto' when the tick matches that rule, else 'yes' / 'no' (syncKeptFees).
  // Admin only: clients see one "Cancellation fee" per order, our fee inside it.
  let cxWin = null;
  const cwCents = v => Math.round(Number(v || 0) * 100);
  const cwAuto = o => !!o.paymentId && Number(o.commission) > 0;
  function openCancelWindow(ids, onDone) {
    const list = ids.map(id => S.orders.find(o => o.id === Number(id))).filter(o => o && o.status !== 'cancelled');
    if (!list.length) { toast('These orders are already cancelled.'); return; }
    cxWin?.remove();
    const dlg = cxWin = document.createElement('dialog');
    dlg.className = 'cxw'; dlg.setAttribute('aria-labelledby', 'cxw-h'); dlg.dataset.cancelWindow = '';
    const fee = o => o.supplierCancelFee != null ? Number(o.supplierCancelFee).toFixed(2) : '';
    const row = o => `<div class="cxw-row" data-cw-row="${o.id}">
        <label class="cxw-in"><input type="checkbox" data-cw-in checked aria-label="Cancel ${esc(orderName(o))}"></label>
        <div class="cxw-who"><b data-no-i18n>${esc(orderName(o))}</b><small><span data-no-i18n>${esc(clientName(o.clientId))}</span> · ${o.paymentId ? '<span class="pay-tag paid">Paid</span>' : '<span class="pay-tag unpaid">Not paid</span>'} <span data-no-i18n>${money(o.price)}</span></small>${o.status === 'cancellation_requested' ? `<small class="cxw-why"><span>Client asked to cancel</span>${o.cancellationReason ? `: <span data-no-i18n>${esc(o.cancellationReason)}</span>` : ''}</small>` : ''}</div>
        <label class="field cxw-fee"><span>Cancellation fee</span><span class="money"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" data-cw-fee value="${fee(o)}"></span><small class="dim">${o.supplierCancelFee != null ? 'From the supplier sheet' : 'None in the sheet'}</small></label>
        <label class="cxw-keep${Number(o.commission) > 0 ? '' : ' off'}"><input type="checkbox" data-cw-keep${cwAuto(o) ? ' checked' : ''}${Number(o.commission) > 0 ? '' : ' disabled'}><span><span>Charge our fee</span> <b data-no-i18n>${money(o.commission)}</b></span></label>
      </div>`;
    dlg.innerHTML = `<form method="dialog" class="cxw-box" novalidate>
      <div class="kw-head"><h3 id="cxw-h">${list.length === 1 ? 'Cancel this order' : `Cancel ${list.length} orders`}</h3><button type="button" class="kw-x" data-cw-close aria-label="Close">${UI.svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <p class="muted cxw-lead">Check each order before it is cancelled: the cancellation fee and whether our fee is still charged. Our fee is ticked on orders the client already paid.</p>
      ${list.length > 1 ? `<div class="cxw-all"><b>Set for all</b><label class="field cxw-fee"><span>Cancellation fee</span><span class="money"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" data-cw-all-fee></span></label><button type="button" class="btn btn-sm" data-cw-all-apply>Use for all</button>
        <label class="field"><span>Charge our fee</span><select data-cw-all-keep><option value="">Choose…</option><option value="paid">Paid orders only</option><option value="all">All orders</option><option value="none">No orders</option></select></label></div>` : ''}
      <div class="cxw-list">${list.map(row).join('')}</div>
      <div class="cxw-sum" data-cw-sum aria-live="polite"></div>
      <p class="form-msg" data-cw-msg role="alert"></p>
      <div class="cxw-actions"><button type="button" class="btn btn-ghost" data-cw-close>Keep the orders</button><button type="submit" class="btn btn-danger" data-cw-go></button></div>
    </form>`;
    document.body.appendChild(dlg);
    const rows = () => [...dlg.querySelectorAll('[data-cw-row]')].map(r => ({ r, o: list.find(x => x.id === Number(r.dataset.cwRow)), on: r.querySelector('[data-cw-in]').checked, feeIn: r.querySelector('[data-cw-fee]'), keep: r.querySelector('[data-cw-keep]').checked }));
    // What each client is charged: cancellation fees + our fee, per client (the parts add up to the total).
    const sum = () => {
      const picked = rows().filter(x => x.on), by = new Map();
      for (const x of picked) {
        const k = x.o.clientId, s = by.get(k) || { n: 0, feeC: 0, oursC: 0 };
        s.n++; s.feeC += cwCents(x.feeIn.value); s.oursC += x.keep ? cwCents(x.o.commission) : 0; by.set(k, s);
      }
      dlg.querySelector('[data-cw-sum]').innerHTML = picked.length ? [...by].map(([k, s]) => `<div class="kw-row tot"><span class="kw-op"></span><span class="kw-l"><span data-no-i18n>${esc(clientName(k))}</span> <small><span>${s.n === 1 ? '1 order' : s.n + ' orders'}</span> · <span>cancellation fees</span> <span data-no-i18n>${money(s.feeC / 100)}</span> + <span>our fee</span> <span data-no-i18n>${money(s.oursC / 100)}</span></small></span><b data-no-i18n>${money((s.feeC + s.oursC) / 100)}</b></div>`).join('') + '<p class="dim cxw-note">Charged to the client for these cancellations. On a paid order it comes off their credit.</p>' : '<p class="muted">No order picked.</p>';
      const go = dlg.querySelector('[data-cw-go]'), n = picked.length;
      go.textContent = n === 1 ? 'Cancel 1 order' : `Cancel ${n} orders`; go.disabled = !n;
      for (const x of rows()) x.r.classList.toggle('out', !x.on);
    };
    dlg.addEventListener('input', sum); dlg.addEventListener('change', e => {
      const k = e.target.closest('[data-cw-all-keep]');
      if (k && k.value) { for (const x of rows()) { const b = x.r.querySelector('[data-cw-keep]'); if (!b.disabled) b.checked = k.value === 'all' || (k.value === 'paid' && cwAuto(x.o)); } k.value = ''; }
      sum();
    });
    dlg.addEventListener('click', async e => {
      if (e.target.closest('[data-cw-close]') || e.target === dlg) { dlg.close(); return; }
      if (e.target.closest('[data-cw-all-apply]')) { const v = dlg.querySelector('[data-cw-all-fee]').value; for (const x of rows()) x.feeIn.value = v; sum(); }
    });
    dlg.addEventListener('close', () => { dlg.remove(); if (cxWin === dlg) cxWin = null; });
    dlg.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = dlg.querySelector('[data-cw-msg]'), picked = rows().filter(x => x.on);
      const bad = picked.find(x => x.feeIn.value !== '' && !(Number(x.feeIn.value) >= 0));
      if (bad) { msg.textContent = 'Enter each cancellation fee as an amount, or leave it empty for no fee.'; bad.feeIn.focus(); return; }
      dlg.querySelectorAll('button, input, select').forEach(x => { x.disabled = true; });
      const failed = [];
      for (const [i, x] of picked.entries()) {
        msg.className = 'form-msg'; msg.textContent = `Cancelling ${i + 1} of ${picked.length}…`;
        const body = { fee: x.feeIn.value === '' ? 0 : x.feeIn.value, keepFee: x.keep === cwAuto(x.o) ? 'auto' : x.keep ? 'yes' : 'no' };
        try {
          if (x.o.status === 'cancellation_requested') await api('/orders/' + x.o.id + '/approve-cancellation', { method: 'POST', body });
          else await api('/orders/' + x.o.id, { method: 'PUT', body: { status: 'cancelled', ...body } });
        } catch (ex) { failed.push({ id: x.o.id, text: `${orderName(x.o)}: ${ex.message}` }); }
      }
      await loadAll(); renderList(); refreshDrawer();
      onDone?.(failed.map(f => f.id));
      const done = picked.length - failed.length;
      if (!failed.length) { dlg.close(); toast(done === 1 ? 'Order cancelled. The client sees it right away.' : `${done} orders cancelled. The client sees them right away.`); return; }
      msg.className = 'form-msg err'; msg.textContent = failed.map(f => f.text).slice(0, 3).join(' · ');
      for (const x of rows()) if (!failed.some(f => f.id === x.o.id)) x.r.remove();
      dlg.querySelectorAll('button, input, select').forEach(b => { b.disabled = false; }); sum();
    });
    sum(); dlg.showModal();
    dlg.querySelector('[data-cw-fee]')?.focus();
  }
  // ---------- overview tab: what needs doing for clients today ----------
  // "Needs your attention": the jobs waiting, most urgent first. key = the job, so a card's button never repeats one
  // (cardActions in 02-card-window.js). Money owed is not a row here: it is the "Not paid yet" card (Erwin, 5 Nov 2026).
  function todoRows() {
    const os = S.orders, cl = S.ov.clients, n = (list, w) => `${w}${list.length === 1 ? '' : 's'}`;
    const pending = os.filter(o => o.status === 'pending'), follow = os.filter(o => o.unreadMessages > 0);
    const noTrack = os.filter(o => o.status === 'processing' && !o.trackingNumber), noCost = os.filter(needsCost), revs = os.filter(o => ['open', 'offered'].includes(o.revision?.status)), revProducts = (S.products || []).filter(p => ['open', 'offered'].includes(p.revision?.status));
    const trialSoon = cl.filter(c => c.subscription?.status === 'trial' && c.subscription.trialDaysLeft !== null && c.subscription.trialDaysLeft >= 0 && c.subscription.trialDaysLeft <= 7);
    const subDue = cl.filter(c => (c.subscription?.status === 'trial' && c.subscription.trialEnded) || c.subscription?.status === 'overdue');
    return [
      [pending, `${n(pending, 'order')} waiting to be processed`, 'data-go-filter="pending"', 'var(--orange)', 'job:pending'],
      [follow, `${n(follow, 'order')} with unread client messages`, 'data-go-filter="followups"', 'var(--red)', 'job:followups'],
      [revs, `${n(revs, 'order')} with a cost revision request`, 'data-go-filter="revision"', 'var(--orange)', 'job:revision'],
      [revProducts, `${n(revProducts, 'product')} with a cost revision request`, 'data-go-tab="products"', 'var(--orange)', 'job:product-revision'],
      [noCost, `${n(noCost, 'order')} still need product + shipping cost`, 'data-go-filter="needscost"', 'var(--gold)', 'job:needscost'],
      [noTrack, `${n(noTrack, 'order')} in processing without tracking`, 'data-go-filter="processing"', 'var(--blue)', 'job:notrack'],
      [trialSoon, `${n(trialSoon, 'client')} with the free month ending in the next 7 days`, 'data-go-tab="clients"', 'var(--gold)', 'job:plans'],
      [subDue, `${n(subDue, 'client')} with the free month over or the subscription overdue`, 'data-go-tab="clients"', 'var(--red)', 'job:plans'],
    ].filter(x => x[0].length > 0).map(([list, text, attrs, tone, key]) => ({ n: list.length, text, attrs, tone, key }));
  }
  // ---------- overview tab: what needs doing for clients today ----------
  // Only what no other section shows (Erwin, 5 Nov 2026): the cards, the jobs and money by month. The client list and the
  // cancelled orders are in Clients & payments (and the cards' windows); the latest orders are Client orders and the bell.
  function renderOverview() {
    const box = $('[data-overview]'); if (!box) return;
    const todo = todoRows();
    box.innerHTML = `<section class="card card-pad"><h3 class="sec-title">Needs your attention</h3>${todo.length ? `<div class="todo-list">${todo.map(({ n, text, attrs, tone }) => `<button type="button" class="todo" ${attrs} style="--tone:${tone}"><b>${n}</b><span>${esc(text)}</span>${UI.svg(P.chev)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0">All caught up. Nothing is waiting on you.</p>'}</section>
      <section class="card card-pad mc" data-money-chart></section>`;
    // Three lines (Erwin, 5 Nov 2026): no "Unpaid orders" (the Not paid yet card explains it), no cancellation fees or refunds
    // (they are in Cancelled orders, all clients, in Clients & payments).
    // Our earnings = client fees + the supplier's own amount per paid, not cancelled order (Shahar, 5-6 Nov 2026), the same
    // rule as the Our earnings card (kpiFacts); per month by order date.
    const M = window.DLClientStoreMath, PO = window.DLPayOrders, rateC = Math.round(Number(S.ov.settings?.supplier_bonus_per_order ?? 1) * 100), sup = {};
    for (const o of S.orders) if (!o.archived && o.status !== 'cancelled' && PO.state(o) === 'paid') { const k = M.dateKey(o).slice(0, 7); sup[k] = (sup[k] || 0) + rateC; }
    const months = (S.ov.months || []).map(m => ({ ...m, earned: Math.round(Number(m.earned || 0) * 100 + (sup[m.month] || 0)) / 100 }));
    window.DLMoneyChart.mount($('[data-money-chart]'), { title: 'Money by month, all clients', key: 'dl-admin-money', months, money, series: [
      { key: 'billed', label: 'Billed', tone: 'var(--mc-gold)', note: 'What clients were billed for their orders (cancelled orders not counted)' },
      { key: 'paid', label: 'Paid', tone: 'var(--mc-teal)', note: 'Payments received from clients' },
      { key: 'earned', label: 'Our earnings', tone: 'var(--mc-blue)', note: 'Client fees on those orders, plus what the supplier pays us per paid order' }] });
  }

  // ---------- orders tab ----------
  // What the client's customer paid; left blank by many clients (it's optional), so never shown as 0.00.
  const customerPaid = o => o.sellingPrice == null ? '<span class="dim">Not entered</span>' : `${esc(o.currency || 'USD')} ${Number(o.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Not billed yet: no product cost or shipping fee, and no fixed unit quote (quoted orders are billed from the quote).
  const needsCost = o => o.status !== 'cancelled' && o.productCost == null && o.shippingFee == null && o.quotedUnitPrice == null;
  const matches = (o, f) => f === 'archived' ? o.archived : !o.archived && (f === 'all' || (f === 'neworders' ? isNewOrder(o) : f === 'updates' ? newUpdates(o).length > 0 : f === 'followups' ? o.unreadMessages > 0 : f === 'needscost' ? needsCost(o) : f === 'revision' ? ['open', 'offered'].includes(o.revision?.status) : f === 'unpaid' ? window.DLPayOrders.state(o) === 'unpaid' : o.status === f));
  // Long lists show the first rows, then "Show N more" (Erwin, 7 Nov 2026: shorter screens; 100+ orders made Client orders
  // 12,000 px long, 38,000 px on a phone). Search, filters, counts and sorting still use every row. S.shown keeps how many
  // rows a list shows until its filter, search or client changes.
  const LIST_PAGE = { orders: 50, clients: 20 };
  const listShown = (k, sig) => { const sh = S.shown ||= {}; if (sh[k]?.sig !== sig) sh[k] = { sig, n: LIST_PAGE[k] }; return sh[k].n; };
  const listMore = (k, shown, n) => n > shown ? `<div class="panel-more" data-list-more-bar="${k}"><button type="button" class="btn btn-sm" data-list-more="${k}"><span>Show ${Math.min(LIST_PAGE[k], n - shown)} more</span></button><small class="dim">${shown} of ${n} shown</small></div>` : '';
  function renderOrders() {
    freshRead();
    const all = [...S.orders,...S.archivedOrders];
    const inClient = all.filter(o => !S.client || String(o.clientId) === S.client);
    const count = f => inClient.filter(o => matches(o, f)).length;
    const label = f => (f === 'archived' ? 'Archived orders' : f === 'all' ? 'All' : f === 'neworders' ? 'New orders' : f === 'updates' ? 'New updates' : f === 'followups' ? 'New follow-ups' : f === 'needscost' ? 'Needs cost' : f === 'revision' ? 'Cost revision' : f === 'unpaid' ? 'Not paid' : UI.LABEL[f]);
    // Shipped is always there (Erwin, 29 Oct 2026: "we need a sort view for Shipped order"), even before anything ships.
    $('[data-chips]').innerHTML = ['all', 'neworders', 'updates', 'followups', 'revision', 'needscost', 'unpaid', ...STATUSES, 'archived'].filter(f => ['archived', 'all', 'neworders', 'shipped'].includes(f) || count(f) || f === S.filter)
      .map(f => `<button type="button" class="chip t-${f}${f === 'neworders' ? ' fresh' : f === 'followups' || f === 'updates' ? ' alert' : ''}${S.filter === f ? ' on' : ''}" data-filter="${f}">${!['all', 'neworders', 'followups', 'updates'].includes(f) ? '<i class="dot"></i>' : ''}${label(f)} <span>${count(f)}</span></button>`).join('');
    const sel = $('[data-client-filter]');
    sel.innerHTML = '<option value="">All clients</option>' + S.ov.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = S.client;
    const q = S.q.toLowerCase(), byChanged = window.DL.sortKey('admin-orders-2', ADMIN_ORDER_SORTS).startsWith('changed'); // date under the status
    const rows = sortList(inClient.filter(o => matches(o, S.filter) && (!q || [o.orderRef, o.trackingNumber, o.notes, o.destination, place(o.destination), clientName(o.clientId), o.itemTitle, o.sku, o.buyerName].join(' ').toLowerCase().includes(q))), 'admin-orders-2', ADMIN_ORDER_SORTS);
    // Bulk edit: only rows that are on screen can stay selected.
    const showN = listShown('orders', [S.filter, S.q, S.client].join('|')), seen = rows.slice(0, showN);
    const shown = new Set(seen.map(o => o.id)); for (const id of [...S.picked]) if (!shown.has(id)) S.picked.delete(id);
    const archivedView = S.filter === 'archived', allOn = seen.length > 0 && seen.every(o => S.picked.has(o.id));
    $('[data-list]').innerHTML = rows.length ? `${bulkBar(archivedView, allOn)}<div class="table-wrap"><table class="tbl stack"><thead><tr><th class="pick"></th><th>Client</th><th>Order</th><th>Destination</th><th class="num">Total</th><th>Status</th><th>Messages</th><th class="hide-sm"></th></tr></thead><tbody>
      ${seen.map(o => `<tr class="click${o.unreadMessages || newUpdates(o).length ? ' is-new' : ''}${S.picked.has(o.id) ? ' picked' : ''}" data-open-order="${o.id}" tabindex="0">
        <td class="pick"><input type="checkbox" data-pick="${o.id}" aria-label="Select ${esc(orderName(o))}"${S.picked.has(o.id) ? ' checked' : ''}></td>
        <td class="wide"><div class="who"><span class="ava">${esc(initials(clientName(o.clientId)))}</span><div><b>${esc(clientName(o.clientId))}</b><small>${esc(fullDate(o.createdAt))}</small></div></div></td>
        <td data-label="Order"><div class="ord-cell">${o.photos?.length ? `<img class="ord-thumb" src="${photoUrl(o.id, o.photos[0].id, true)}" alt="" loading="lazy">` : '<span class="ord-thumb none" title="No photo">—</span>'}<span class="t-main"><b>${esc(orderName(o))}</b>${o.itemTitle ? `<small>${esc(o.itemTitle)}</small>` : ''}<small class="mono">${esc(o.trackingNumber) || 'No tracking yet'}</small>${updateTags(o)}</span></div></td>
        <td data-label="Destination">${esc(place(o.destination))}</td>
        <td data-label="Total" class="num"><b>${money(o.price)}</b>${window.DLPayOrders.tag(o, [], true)}</td>
        <td data-label="Status"><select data-status="${o.id}" aria-label="Status of ${esc(orderName(o))}">${[o.status,...ADMIN_STATUSES.filter(s=>s!==o.status)].map(s => `<option value="${s}"${s === o.status ? ' selected' : ''}>${UI.LABEL[s]}</option>`).join('')}</select>${byChanged ? `<small class="st-when" data-no-i18n>${window.DL.shortTime(o.statusChangedAt || o.createdAt)}</small>` : ''}${UI.delayTag(o)}</td>
        <td data-label="Messages">${o.unreadMessages ? `<span class="unread-pill">${ic('chat')}${o.unreadMessages} new</span>` : o.messages ? `<span class="msgs">${ic('chat')}${o.messages}</span>` : '<span class="dim">—</span>'}</td>
        <td class="num hide-sm">${UI.svg(P.chev).replace('<svg', '<svg style="width:18px;height:18px;fill:none;stroke:var(--dim);stroke-width:2"')}</td></tr>`).join('')}
      </tbody></table></div>${listMore('orders', seen.length, rows.length)}`
      : S.orders.length ? empty('No orders here', S.filter === 'followups' ? 'No unread follow-ups. You’re all caught up.' : S.filter === 'neworders' ? 'No new orders. You’re all caught up.' : S.filter === 'updates' ? 'No new updates. You’re all caught up.' : S.filter === 'archived' ? 'No archived orders match this search.' : 'Try another filter or search.')
        : empty('No client orders yet', 'They show up here as soon as a client adds one in their portal. You can also add one for a client.', '<button type="button" class="btn btn-primary" data-new-order>New order</button>');
  }

  // ---------- subscription (first month free, then monthly) ----------
  const fmtDay = iso => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
  const shekels = n => (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n))) + ' ₪';
  function subPill(sub) {
    if (!sub || !sub.status) return '<span class="dim" style="font-size:13px">Not set</span>';
    if (sub.status === 'trial') {
      if (sub.trialEnded) return `<span class="st st-cancelled">Trial ended</span><small class="dim sub-when">${esc(fmtDay(sub.trialEnd))}</small>`;
      return `<span class="st st-pending">Free month</span><small class="dim sub-when">until ${esc(fmtDay(sub.trialEnd))}</small>`;
    }
    if (sub.status === 'active') return `<span class="st st-delivered">Paying</span>${sub.lastPayment ? `<small class="dim sub-when">paid ${esc(fmtDay(sub.lastPayment))}</small>` : ''}`;
    if (sub.status === 'overdue') return '<span class="st st-cancelled">Overdue</span>';
    return '<span class="st" style="--tone:var(--dim)">Cancelled</span>';
  }

  // ---------- claims ----------
  const CL_ST = { open: ['Open', 'pending'], approved: ['Approved', 'processing'], rejected: ['Rejected', 'na'], resolved: ['Resolved', 'delivered'] };
  const CL_TODO = c => ['open', 'approved'].includes(c.status);
  // What the claim is about, its files and the reply / decision form (the order panel card and the Claims rows share it).
  function claimBody(c) {
    return `<p><b>${esc(UI.CLAIM_LABEL[c.problem] || c.problem)}</b>${c.description ? `: <span data-no-i18n>${esc(c.description)}</span>` : ''}</p>${c.fileIds.length || c.reshipmentOrderId ? `<div class="claim-files">${UI.claimFiles(c).map(f => `<a class="btn btn-sm" href="/api/portal/files/${f.id}" target="_blank" rel="noopener">${f.label}</a>`).join('')}${c.reshipmentOrderId ? `<button class="btn btn-sm" type="button" data-open-order="${c.reshipmentOrderId}">Open reshipment</button>` : ''}</div>` : ''}${CL_TODO(c) ? `<form class="form-grid" data-claim-decision="${c.id}"><label class="field full"><span>Admin reply</span><textarea name="reply" rows="2" maxlength="2000">${esc(c.reply)}</textarea></label><div class="full claim-decide"><label class="field"><span>Decision</span><select name="status">${c.status === 'open' ? '<option value="approved">Approved</option><option value="rejected">Rejected</option>' : '<option value="resolved">Resolved</option>'}</select></label><button class="btn btn-primary" type="submit">Save claim decision</button></div><p class="form-msg full" data-claim-msg></p></form>` : c.reply ? `<p class="cl-reply"><span>Admin reply</span> <span data-no-i18n>${esc(c.reply)}</span></p>` : ''}`;
  }
  function adminClaimCard(c){return c?`<section class="card card-pad${c.overdue?' claim-overdue':''}"><h3 data-no-i18n>${esc(c.orderRef||'#'+c.orderId)} · ${esc(c.clientName)}</h3><p><span>${c.status==='open'?'Open':c.status==='approved'?'Approved':c.status==='rejected'?'Rejected':'Resolved'}</span> · <span>${c.resolution==='refund'?'Refund':'Reshipment'}</span></p><p><b data-no-i18n>${c.businessDays}</b> <span>business days (Mon–Fri)</span></p>${c.overdue?'<p class="err-text">Overdue: more than 3 business days</p>':''}${claimBody(c)}</section>`:'';}
  // Admin Claims (Erwin, 6 Nov 2026: make the admin screens shorter, like Client products): one short row per claim
  // (order, client, problem, refund or reshipment, days, status); a row opens to the claim. Claims waiting for a decision
  // (open / approved) open by themselves; what the admin opens or closes is kept until that claim is saved (S.clOpen).
  function claimRow(c) {
    const [label, tone] = CL_ST[c.status] || [c.status, 'na'], open = S.clOpen[c.id] ?? CL_TODO(c);
    return `<details class="card pq cl-row${CL_TODO(c) ? ' pq-todo' : ''}${c.overdue ? ' cl-late' : ''}" data-cl="${c.id}"${open ? ' open' : ''}><summary class="pq-sum">
      <span class="pq-name"><b data-no-i18n>${esc(c.orderRef || '#' + c.orderId)} · ${esc(c.clientName)}</b><small><span>${esc(UI.CLAIM_LABEL[c.problem] || c.problem)}</span> · <span>${c.resolution === 'refund' ? 'Refund' : 'Reshipment'}</span></small></span>
      <span class="pq-meta">${c.overdue ? '<span class="cl-overdue" title="More than 3 business days">Overdue</span>' : ''}<span class="cl-days"><b data-no-i18n>${c.businessDays}</b> <small>business days</small></span><span class="st st-${tone}">${label}</span></span>
      <span class="pq-chev" aria-hidden="true">${UI.svg('<path d="m6 9 6 6 6-6"/>')}</span></summary>
      <div class="pq-body cl-body">${c.overdue ? '<p class="err-text">Overdue: more than 3 business days</p>' : ''}${claimBody(c)}</div></details>`;
  }
  function renderClaims() {
    const list = sortList(S.claims.filter(c => S.claimFilter === 'all' || c.status === S.claimFilter), 'admin-claims', CLAIM_SORTS);
    $('[data-tab-body]').innerHTML = `<div class="pq-bar"><div class="chips" role="group" aria-label="Show claims">${['all', 'open', 'approved', 'rejected', 'resolved'].map(s => `<button class="chip${S.claimFilter === s ? ' on' : ''}" type="button" data-claim-filter="${s}" aria-pressed="${S.claimFilter === s}">${s === 'all' ? 'All' : CL_ST[s][0]} <span data-no-i18n>${S.claims.filter(c => s === 'all' || c.status === s).length}</span></button>`).join('')}</div>${S.claims.length > 1 ? sortPick('admin-claims', CLAIM_SORTS) : ''}</div>
      ${list.map(claimRow).join('') || `<p class="muted">${S.claims.length ? 'No claims here.' : 'No claims yet.'}</p>`}`;
  }
  // ---------- client products ----------
  // Erwin, 6 Nov 2026: Client products "took so much space, needs to scroll so far down". One short row per product
  // (photo, name, client, status, price); a row opens to its quote form. Products that need us (no price yet, or a cost
  // revision waiting) open by themselves; a row the admin opens or closes stays that way until its quote is saved (S.pqOpen).
  const PQ_TODO = p => p.status === 'awaiting_quote' || !!(p.revision && ['open', 'offered'].includes(p.revision.status));
  const PQ_ST = { awaiting_quote: ['Awaiting quote', 'pending'], approved: ['Approved', 'delivered'], not_available: ['Not available', 'na'] };
  const PQ_FILTERS = [['all', 'All', () => true], ['todo', 'Needs you', PQ_TODO], ['approved', 'Approved', p => p.status === 'approved'], ['not_available', 'Not available', p => p.status === 'not_available']];
  function productQuoteForm(p) {
    const rev = p.revision && ['open', 'offered'].includes(p.revision.status) ? `<div class="rev-admin-p" data-rev-product><p><b>Cost revision requested</b> · <span>Client’s competitor price</span>: <b data-no-i18n>${money(p.revision.competitorPrice)}</b>${p.revision.note ? ` · <span data-no-i18n>${esc(p.revision.note)}</span>` : ''}</p><p class="note">Save a lower price below (or the supplier changes it in the sheet): it’s used for this product’s next orders. Or keep the price:</p><div class="rev-keep-row"><input name="revReply" maxlength="1000" aria-label="Reply to the client" placeholder="Reply to the client (optional)"><a class="btn" href="https://wa.me/?text=${encodeURIComponent(`Hi Ye, our client asks for a lower price on the product "${p.name}" (orange row in the Product Quotes sheet). They sell it at $${Number(p.revision.competitorPrice).toFixed(2)} (competitor price); our price now is $${Number(p.supplierPrice ?? p.unitPrice ?? 0).toFixed(2)} per item. Can you check if you can lower it? If yes, please type the new Price per item in the sheet. Thank you!`)}" target="_blank" rel="noopener">${ic('chat')}Tell the supplier on WhatsApp</a><button type="button" class="btn" data-rev-keep-product="${p.id}">Keep the price</button></div></div>` : '';
    const side = `<div class="pq-side">${p.photoIds.length ? `<div class="qf-photos">${p.photoIds.map(id => `<img class="qf-photo" src="/api/portal/products/${p.id}/photos/${id}" width="112" height="112" alt="Product photo" loading="lazy" title="Open full size">`).join('')}</div>` : ''}<p><a href="${esc(p.link)}" target="_blank" rel="noopener">Product link</a></p>${p.variant || p.expectedQuantity ? `<p data-no-i18n>${esc(p.variant)}${p.expectedQuantity ? ' · ' + p.expectedQuantity : ''}</p>` : ''}${p.competitorPrice ? `<p><span>Competitor price (from the client):</span> <b data-no-i18n><bdi>${esc(p.competitorPrice)}</bdi></b></p>` : ''}</div>`;
    const from = p.priceOptions ? `<div class="note full" style="margin:0"><p style="margin:0"><span>Several prices from the sheet (supplier → client):</span></p><ul class="price-options">${p.priceOptions.map(o => `<li><span data-no-i18n>${esc(o.label)}</span> <b data-no-i18n dir="ltr">${money(o.supplierPrice)} → ${money(o.unitPrice)}</b></li>`).join('')}</ul><p style="margin:0"><span>Saving a price here replaces the options with one price.</span></p></div>`
      : p.supplierPrice != null ? `<p class="note full" style="margin:0"><span>Supplier price from the sheet:</span> <b data-no-i18n>${money(p.supplierPrice)}</b> <span>(the client price adds the client’s fee per order)</span></p>` : '';
    return `<form class="pq-form" data-product-quote="${p.id}">${rev}${side}<div class="form-grid pq-fields">
      <label class="field"><span>Status</span><select name="status" required>${p.status === 'awaiting_quote' ? '<option value="" selected disabled>Choose…</option>' : ''}<option value="approved"${p.status === 'approved' ? ' selected' : ''}>Approved</option><option value="not_available"${p.status === 'not_available' ? ' selected' : ''}>Not available</option></select></label>
      <label class="field"><span>Client price per item (USD) <small>product only</small></span><input name="unitPrice" type="number" min="0" step="0.01" value="${p.unitPrice ?? ''}"></label>
      <label class="field"><span>Shipping per order (USD) <small>one parcel, optional</small></span><input name="shipping" type="number" min="0" step="0.01" value="${p.shipping ?? ''}"></label>
      ${from}<label class="field full"><span>Note</span><textarea name="note" rows="2" maxlength="1000">${esc(p.note)}</textarea></label>
      <div class="full pq-actions"><button type="submit" class="btn btn-primary">Save quote</button><p class="form-msg" data-quote-msg></p></div></div></form>`;
  }
  function productRow(p) {
    const [label, tone] = PQ_ST[p.status] || [p.status, 'na'], open = S.pqOpen[p.id] ?? PQ_TODO(p), ph = p.photoIds[0];
    const price = p.priceOptions ? '<span class="pq-price">Several prices</span>' : p.unitPrice != null ? `<span class="pq-price"><b data-no-i18n>${money(p.unitPrice)}</b> <small>per item</small></span>` : '';
    return `<details class="card pq${PQ_TODO(p) ? ' pq-todo' : ''}" data-pq="${p.id}"${open ? ' open' : ''}><summary class="pq-sum">
      <span class="pq-thumb">${ph ? `<img src="/api/portal/products/${p.id}/photos/${ph}" width="48" height="48" alt="" loading="lazy">` : ic('doc')}</span>
      <span class="pq-name"><b data-no-i18n>${esc(p.name)}</b><small data-no-i18n>${esc(p.clientName)}${p.variant ? ' · ' + esc(p.variant) : ''}</small></span>
      <span class="pq-meta">${UI.revTag(p)}<span class="st st-${tone}">${label}</span>${price}</span>
      <span class="pq-chev" aria-hidden="true">${UI.svg('<path d="m6 9 6 6 6-6"/>')}</span></summary>
      <div class="pq-body">${productQuoteForm(p)}</div></details>`;
  }
  function renderProducts() {
    const f = PQ_FILTERS.find(x => x[0] === S.pqFilter) || PQ_FILTERS[0];
    const products = sortList(S.products.filter(f[2]), 'admin-products', ADMIN_PRODUCT_SORTS);
    $('[data-tab-body]').innerHTML = `<div class="pq-bar"><div class="chips" role="group" aria-label="Show products">${PQ_FILTERS.map(([k, l, t]) => `<button class="chip${f[0] === k ? ' on' : ''}" type="button" data-pq-filter="${k}" aria-pressed="${f[0] === k}">${l} <span data-no-i18n>${S.products.filter(t).length}</span></button>`).join('')}</div>${S.products.length > 1 ? sortPick('admin-products', ADMIN_PRODUCT_SORTS) : ''}</div>
      ${products.map(productRow).join('') || `<p class="muted">${S.products.length ? 'No products here.' : 'No products yet.'}</p>`}`;
  }
  // ---------- clients tab ----------
  function archivedHTML() {
    const a = S.ov.archived || [];
    if (!a.length) return '';
    return `<details class="archived"><summary>Archived clients (${a.length})</summary><div class="acc-list" style="padding:0 16px 16px">${a.map(c => `<div><span class="ava">${esc(initials(c.name))}</span><span class="who" style="flex:1"><span><b>${esc(c.name)}</b><small>@${esc(c.username)} · ${c.orders} order${c.orders === 1 ? '' : 's'} · hidden from totals</small></span></span><button type="button" class="btn btn-sm" data-restore="${c.id}">Restore</button></div>`).join('')}</div></details>`;
  }
  // All clients' cancelled orders (Erwin, 27 Oct 2026): fees, refunds and credit. Under the clients table since 5 Nov 2026
  // (it is billing), not on the Overview.
  function cancelledBoxHTML() {
    const cx = S.ov.cancelled, PO = window.DLPayOrders;
    // Credit already taken off later bills and fees already paid clear (6 Nov 2026), per client as in their panel.
    const rows = (cx?.clients || []).map(r => { const c = clientOf(r.clientId); return { ...r, st: c ? PO.cxSettle(r, creditLeftC(c, r.feesOwed), c.outstanding) : PO.cxSettle(r) }; });
    const leftC = rows.reduce((n, r) => n + r.st.leftC, 0), usedC = rows.reduce((n, r) => n + r.st.usedC, 0), feesOpen = rows.some(r => r.st.feesOpen), settled = cx?.fees > 0 && !feesOpen;
    const cxStat = (k, v, note, cls = '') => `<div class="cx-stat ${cls}"><small>${k}</small><b data-no-i18n>${v}</b>${note ? `<em>${note}</em>` : ''}</div>`;
    const cxBox = cx && (cx.count || cx.refunded) ? `<section class="card card-pad cx-box ovw-cx" data-cancelled-all><div class="mc-head"><h3 class="sec-title">Cancelled orders, all clients</h3><span class="muted">${cx.clients.length === 1 ? '1 client' : cx.clients.length + ' clients'}</span></div>
      <div class="cx-stats">${cxStat('Cancelled orders', String(cx.count), cx.paidCount ? `${cx.paidCount} already paid` : '')}${cxStat('Paid for them', money(cx.paid))}${cxStat('Cancellation fees', money(cx.fees), settled ? 'Settled' : '', feesOpen ? 'neg' : '')}${cxStat('Due back to clients', money(cx.dueBack), 'Paid minus all fees')}${cxStat('Refunded', money(cx.refunded))}${cxStat('Credit left', money(leftC / 100), usedC ? `${money(usedC / 100)} used on their bills` : leftC ? 'Counts toward their next orders' : '', leftC > 0 ? 'pos' : '')}</div>
      <div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">Cancelled</th><th class="num">Fees</th><th class="num">Due back</th><th class="num">Refunded</th><th class="num">Credit left</th></tr></thead><tbody>${rows.map((c, i) => `<tr class="click" data-open-client="${c.clientId}" data-client-tab="payments"${i >= 5 && !S.cxAll ? ' hidden' : ''} tabindex="0" title="Open this client's payments"><td class="wide"><b>${esc(c.name)}</b></td><td data-label="Cancelled" class="num">${c.count}</td><td data-label="Fees" class="num">${money(c.fees)}</td><td data-label="Due back" class="num">${money(c.dueBack)}</td><td data-label="Refunded" class="num">${money(c.refunded)}</td><td data-label="Credit left" class="num ${c.st.leftC > 0 ? 'pos' : ''}">${money(c.st.leftC / 100)}${c.st.usedC ? `<small class="cx-used">${money(c.st.usedC / 100)} used</small>` : ''}</td></tr>`).join('')}</tbody></table></div>${rows.length > 5 && !S.cxAll ? `<div class="panel-more"><button type="button" class="btn btn-sm" data-cx-all><span>Show all (${rows.length})</span></button></div>` : ''}</section>` : '';
    return cxBox;
  }
  function renderClients() {
    const q = S.cq.toLowerCase(), def = Number(S.ov.settings.commission_per_order);
    const lateIds = lateClientIds(); // red only when an unpaid order is over 14 days old (5 Nov 2026)
    const all = sortList(S.ov.clients.filter(c => !q || (c.name + ' ' + c.username).toLowerCase().includes(q)), 'admin-clients', CLIENT_SORTS);
    const list = all.slice(0, listShown('clients', S.cq));
    $('[data-list]').innerHTML = list.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">Orders</th><th class="num">Billed</th><th class="num" title="Billed minus our fee: the supplier's cost">Without our fee</th><th class="num">Paid</th><th class="num">Outstanding</th><th class="num">Our earnings</th><th class="num">Fee / order</th><th>Subscription</th><th>Status</th></tr></thead><tbody>
      ${list.map(c => `<tr class="click" data-open-client="${c.id}" tabindex="0">
        <td class="wide"><div class="who"><span class="ava">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>@${esc(c.username)}</small>${c.pendingTransfers ? `<small>${c.pendingTransfers} transfer confirmation${c.pendingTransfers === 1 ? '' : 's'} waiting</small>` : ''}</div></div></td>
        <td data-label="Orders" class="num">${c.orders}</td><td data-label="Billed" class="num">${money(c.billed)}</td><td data-label="Without our fee" class="num dim hide-sm">${money((c.billed || 0) - (c.ourShare || 0))}</td><td data-label="Paid" class="num">${money(c.paid)}</td>
        <td data-label="Outstanding" class="num ${c.outstanding > 0 && lateIds.has(c.id) ? 'neg' : ''}"><b><bdi>${money(c.outstanding)}</bdi></b></td><td data-label="Our earnings" class="num pos">${money(c.ourShare)}</td>
        <td data-label="Fee / order" class="num hide-sm">${money(c.commissionPerOrder ?? def)}${c.commissionPerOrder == null ? ' <span class="dim" style="font-size:12px">default</span>' : ''}</td>
        <td data-label="Subscription" class="sub-cell">${subPill(c.subscription)}</td>
        <td data-label="Status"${c.active ? ' class="hide-sm"' : ''}>${c.active ? '<span class="st st-delivered">Active</span>' : '<span class="st st-cancelled">Disabled</span>'}</td></tr>`).join('')}
      </tbody></table></div>${listMore('clients', list.length, all.length)}${archivedHTML()}` : empty(S.ov.clients.length ? 'No clients match' : 'No clients yet', S.ov.clients.length ? 'Try another search.' : 'Add a client account, then share the username and password with them.', '<button type="button" class="btn btn-primary" data-add-account="client">Add client</button>') + (list.length ? '' : archivedHTML());
    const slot = $('[data-cancelled-slot]'); if (slot) slot.innerHTML = cancelledBoxHTML();
  }

  // ---------- settings tab ----------
  function adminsHTML() {
    return S.ov.admins.map(x => `<div><span class="ava">${esc(initials(x.name))}</span><span class="who"><span><b>${esc(x.name)}</b><small>@${esc(x.username)}${x.active ? '' : ' · disabled'}</small></span></span><button type="button" class="btn btn-sm" data-edit-admin="${x.id}" style="margin-inline-start:auto">Edit</button></div>`).join('')
      + '<div><span class="ava">DL</span><span class="who"><span><b>Main admin login</b><small>set in Vercel</small></span></span></div>';
  }
  const BANK_UI = [['bank_currency', 'Currency'], ['bank_holder', 'Account holder name'], ['bank_account', 'Account number'], ['bank_ach', 'ACH routing number'],
    ['bank_wire', 'Wire routing number'], ['bank_swift', 'SWIFT/BIC'], ['bank_name', 'Bank name'], ['bank_address', 'Bank address'], ['bank_reference', 'Payment reference note']];
  // Erwin, 6 Nov 2026: Fees & settings "took so much space, needs to scroll so far down". The page is in sections with a
  // tab bar (same pattern as the client Payments page): only one section shows. All sections stay in the page (hidden), so
  // every form keeps what was typed when the admin switches. The last section is remembered in this browser.
  const SET_TABS = [['fees', 'Fees'], ['bank', 'Bank details'], ['supplier', 'Supplier'], ['terms', 'Terms'], ['team', 'Team & tools']];
  const SET_KEY = 'dl-admin-settings-tab';
  function setTab() {
    let t = S.setTab; if (!t) try { t = localStorage.getItem(SET_KEY); } catch { t = null; }
    return SET_TABS.some(([k]) => k === t) ? t : 'fees';
  }
  function settingsHTML() {
    const s = S.ov.settings, rated = COUNTRIES.filter(([c]) => RATES[c]), on = setTab();
    const tabs = `<nav class="set-tabs" role="tablist" aria-label="Settings sections">${SET_TABS.map(([k, l]) => `<button type="button" class="set-tab${k === on ? ' on' : ''}" role="tab" id="set-tab-${k}" aria-controls="set-panel-${k}" aria-selected="${k === on}" tabindex="${k === on ? 0 : -1}" data-set-tab="${k}">${l}${k === 'bank' && !String(s.bank_account || '').trim() ? '<span class="set-tab-dot" role="img" aria-label="Missing"></span>' : ''}</button>`).join('')}</nav>`;
    const panel = (k, cls, body) => `<div class="settings-grid${cls}" role="tabpanel" id="set-panel-${k}" aria-labelledby="set-tab-${k}" data-set-panel="${k}"${k === on ? '' : ' hidden'}>${body}</div>`;
    return tabs + panel('fees', '', `
      <section class="card card-pad"><h3 class="form-sec">Fee per order</h3>
        <form class="form-grid" id="settings-form" novalidate>
          <label class="field"><span>Fee per order (USD)</span><span class="money"><input name="commission_per_order" type="number" min="0" step="0.01" value="${esc(s.commission_per_order)}"></span></label>
          <label class="field"><span>From the supplier per order (USD) <small>the supplier pays us this for every order, apart from the client's fee</small></span><span class="money"><input name="supplier_bonus_per_order" type="number" min="0" step="0.01" value="${esc(s.supplier_bonus_per_order ?? 1)}"></span></label>
          <div class="full split" data-split></div>
          <label class="field"><span>Client subscription <small>₪ / month, after the free month</small></span><input name="subscription_price" type="number" min="0" step="0.01" value="${esc(s.subscription_price ?? 29)}"></label>
          <label class="field"><span>Size-to-weight divisor <small>cm³ per kg</small></span><input name="volumetric_divisor" type="number" min="1000" max="10000" step="1" value="${esc(s.volumetric_divisor)}"></label>
          <div class="full set-actions"><button class="btn btn-primary" type="submit">Save settings</button><p class="form-msg" data-settings-msg></p></div>
        </form>
        <p class="note set-note">The fee is already inside the product cost the client pays, so clients don’t see it. Changes apply to new orders only. Size-based weight = L × W × H ÷ divisor (6000 until the supplier confirms).</p>
      </section>
      <section class="card card-pad"><h3 class="form-sec">Shipping calculator</h3>
        <form class="form-grid" data-calc onsubmit="return false">
          <label class="field"><span>Destination</span><select name="country">${rated.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}</select></label>
          <label class="field"><span>Product type</span><select name="category">${categoryOptions('general')}</select></label>
          <label class="field"><span>Weight (kg)</span><input name="weight" type="number" min="0" step="0.01" placeholder="e.g. 0.25"></label>
          <div class="field"><span>Size L × W × H (cm)</span><div class="dims"><input name="l" type="number" min="0" placeholder="L" aria-label="Length"><input name="w" type="number" min="0" placeholder="W" aria-label="Width"><input name="h" type="number" min="0" placeholder="H" aria-label="Height"></div></div>
        </form>
        <div class="calc-out" data-calc-out><small>Shipping fee</small><strong>—</strong><div class="bd">Enter a weight.</div></div>
      </section>`) + panel('bank', ' one', `
      <section class="card card-pad"><h3 class="form-sec">How clients pay (bank details)</h3>
        <form class="form-grid set-bank" id="bank-form" novalidate>
          ${BANK_UI.map(([k, label]) => `<label class="field${k === 'bank_address' || k === 'bank_reference' ? ' wide' : ''}"><span>${label}</span><input name="${k}" type="text" maxlength="200" value="${esc(s[k] ?? '')}"></label>`).join('')}
          <div class="full set-actions"><button class="btn btn-primary" type="submit">Save bank details</button><p class="form-msg" data-bank-msg></p></div>
        </form>
        <p class="note set-note">Clients see these on their Payments page under “How to pay”, each with a Copy button. Leave a field empty to hide it.</p>
      </section>`) + panel('supplier', '', `
      <section class="card card-pad"><h3 class="form-sec">Supplier sheet</h3><div data-supplier-sheet><p class="muted" style="margin:0">Loading…</p></div>
        <div class="row-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-supplier-setup>Set up supplier sheet</button><button type="button" class="btn btn-sm" data-supplier-check hidden>Check sheet now</button></div>
        <p class="form-msg" data-supplier-msg role="status"></p></section>
      <section class="card card-pad"><h3 class="form-sec">Couriers</h3>
        <form class="form-grid" id="couriers-form" novalidate>
          <label class="field full"><span>Couriers the supplier can pick <small>one per line</small></span><textarea name="couriers" rows="4" maxlength="1000" data-no-i18n>${esc(String(s.couriers || ''))}</textarea></label>
          <div class="full set-actions"><button class="btn btn-primary" type="submit">Save couriers</button><p class="form-msg" data-couriers-msg></p></div>
        </form>
        <p class="note set-note">These show as a dropdown in the Courier column of the supplier sheet. The supplier can also type a name that isn’t listed. Clients see the courier next to the tracking number.</p>
      </section>`) + panel('terms', ' one', `
      <section class="card card-pad"><h3 class="form-sec">Terms of Service</h3><p class="note">Publishing a new version requires every client to accept again. Previous versions and acceptance records are preserved.</p>
        <form id="terms-publish" class="form-grid"><label class="field set-ver"><span>New version number</span><input name="version" type="number" min="${S.ov.termsPolicy.version + 1}" value="${S.ov.termsPolicy.version + 1}" required></label>
          <label class="field full-sm"><span>English policy text</span><textarea name="english" rows="12" maxlength="18000" required>${esc(S.ov.termsPolicy.english)}</textarea></label>
          <label class="field full-sm"><span>Hebrew policy text</span><textarea name="hebrew" rows="12" maxlength="18000" dir="rtl" required>${esc(S.ov.termsPolicy.hebrew)}</textarea></label>
          <div class="field full"><button type="submit" class="btn btn-primary">Publish new terms version</button></div><p class="form-msg full" data-terms-msg role="status"></p></form></section>`) + panel('team', '', `
      <section class="card card-pad"><h3 class="form-sec">Team accounts</h3><div class="acc-list" data-admins>${adminsHTML()}</div>
        <button type="button" class="btn" style="margin-top:12px" data-add-account="admin">${ic('plus')}Add admin</button></section>
      <section class="card card-pad"><h3 class="form-sec">Client portal link</h3><p class="muted" style="margin:0 0 10px;font-size:14px">Clients sign in here with the username and password you give them.</p>
        <div class="copy-line"><span style="flex:1">${esc(location.origin)}/portal/</span><button type="button" class="btn btn-sm" data-copy="${esc(location.origin)}/portal/">${ic('copy')}Copy</button></div></section>
      <section class="card card-pad"><h3 class="form-sec">Storage &amp; backups</h3><div data-storage><p class="muted" style="margin:0">Loading…</p></div>
        <div class="row-actions" data-storage-actions hidden style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-backup-now>Back up now</button><button type="button" class="btn btn-sm" data-copy-files>Copy files now</button></div>
        <p class="form-msg" data-storage-msg role="status"></p></section>`);
  }
  function bindSetTabs() {
    const tabs = $$('[data-set-tab]');
    const show = (k, focus) => {
      S.setTab = k; try { localStorage.setItem(SET_KEY, k); } catch { /* private window: the choice lasts for this visit */ }
      tabs.forEach(b => { const on = b.dataset.setTab === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      $$('[data-set-panel]').forEach(p => { p.hidden = p.dataset.setPanel !== k; });
    };
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => show(b.dataset.setTab));
      b.addEventListener('keydown', e => {
        const rtl = document.documentElement.dir === 'rtl', step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
        const to = step ? (i + step + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (to < 0) return; e.preventDefault(); show(tabs[to].dataset.setTab, true);
      });
    });
  }
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function storageHTML(d) {
    const s = d.storage;
    if (!s.configured) return '<p class="note" style="margin:0">File storage isn’t connected yet. Photos and documents stay in the database as before. Connect a private Blob store in Vercel to turn on file storage and daily backups.</p>';
    const total = s.kinds.reduce((n, k) => n + k.total, 0), copied = s.kinds.reduce((n, k) => n + k.copied, 0), cleared = s.kinds.reduce((n, k) => n + k.cleared, 0);
    const dbBytes = s.kinds.reduce((n, k) => n + k.databaseBytes, 0);
    const files = `<p style="margin:0 0 6px"><b>${copied} of ${total} files copied to file storage.</b></p>
      <p class="note" style="margin:0"><span>${s.clearing ? `${cleared} database copies removed after checking.` : 'Database copies are kept for safety.'}</span> <span>Files still in the database: ${kb(dbBytes)}</span></p>`;
    const list = d.backups.length ? `<div class="acc-list">${d.backups.slice(0, 7).map(b => `<div><span class="who"><span><b>${esc(fmtDay(b.date))}</b><small>${kb(b.bytes)}</small></span></span><a class="btn btn-sm" style="margin-inline-start:auto" href="/api/portal/admin/backups/${encodeURIComponent(b.name)}" target="_blank" rel="noopener" data-backup-link>Download</a></div>`).join('')}</div>`
      : `<p class="note" style="margin:0">${d.backupError ? esc(d.backupError) : 'No backups yet. The first one runs automatically within a day, or press Back up now.'}</p>`;
    return files + '<p style="margin:12px 0 6px"><b>Daily backups</b> <small class="muted">kept for 30 days</small></p>' + list;
  }
  async function loadStorage() {
    const box = $('[data-storage]'); if (!box) return;
    try { const d = await api('/admin/storage'); box.innerHTML = storageHTML(d); $('[data-storage-actions]').hidden = !d.storage.configured; }
    catch (ex) { box.innerHTML = `<p class="note" style="margin:0">${esc(ex.message)}</p>`; }
  }
  function bindStorage() {
    loadStorage();
    const m = $('[data-storage-msg]');
    const run = (sel, path, done) => { const b = $(sel); if (b) b.addEventListener('click', async () => {
      b.disabled = true; m.textContent = 'Working…'; m.className = 'form-msg';
      try { const r = await api(path, { method: 'POST' }); m.textContent = done(r); m.className = 'form-msg ok'; await loadStorage(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      b.disabled = false;
    }); };
    run('[data-backup-now]', '/admin/backups/run', r => r.configured === false ? 'File storage isn’t connected yet.' : 'Backup saved.');
    run('[data-copy-files]', '/admin/storage/sync', r => r.configured === false ? 'File storage isn’t connected yet.' : `${r.copied} files copied.${r.failed ? ` ${r.failed} will be retried.` : ''}${r.more ? ' More remain; they continue automatically every hour.' : ''}`);
  }
  // Supplier Work Queue: suppliers fill in total cost, tracking and shipping status in the Google Sheet.
  function supplierSheetHTML(d) {
    if (!d.configured) return '<p class="note" style="margin:0">The Google Sheet isn’t connected.</p>';
    if (!d.enabled) return '<p class="note" style="margin:0">Set up adds three yellow columns to the Orders tab for the supplier: Total cost (whole order, USD), Tracking number and Shipping status. The website then bills clients (total + fee), adds tracking and marks orders Shipped within a minute. The current tab is kept as a hidden backup tab.</p>';
    const l = d.last;
    return `<p style="margin:0 0 6px"><b>On.</b> <span>The website reads the supplier columns every minute.</span></p>${l ? `<p class="note" style="margin:0"><span>Last check</span> <span data-no-i18n>${esc(fullDate(l.at))}</span>: ${l.ok ? `<span data-no-i18n>${l.checked}</span> <span>orders checked</span>, <span data-no-i18n>${l.changed}</span> <span>updated</span>` : `<span>error</span> <span data-no-i18n>${esc(l.error)}</span>`}</p>${(l.skipped || []).length ? `<p class="note" style="margin:6px 0 0"><b>Needs a look:</b> <span data-no-i18n>${l.skipped.map(s => esc((s.ref || '#' + s.orderId) + ' — ' + s.why.join(', '))).join('; ')}</span></p>` : ''}` : ''}`;
  }
  async function loadSupplierSheet() {
    const box = $('[data-supplier-sheet]'); if (!box) return;
    try { const d = await api('/admin/supplier-sheet'); box.innerHTML = supplierSheetHTML(d); const setupBtn = $('[data-supplier-setup]'); setupBtn.hidden = !d.configured; setupBtn.textContent = d.enabled ? 'Rebuild supplier sheet' : 'Set up supplier sheet'; $('[data-supplier-check]').hidden = !d.enabled; }
    catch (ex) { box.innerHTML = `<p class="note" style="margin:0">${esc(ex.message)}</p>`; }
  }
  function bindSupplierSheet() {
    loadSupplierSheet();
    const m = $('[data-supplier-msg]');
    const run = (sel, path, done) => { const b = $(sel); if (b) b.addEventListener('click', async () => {
      b.disabled = true; m.textContent = 'Working…'; m.className = 'form-msg';
      try { const r = await api(path, { method: 'POST' }); m.textContent = done(r); m.className = r.ok === false ? 'form-msg err' : 'form-msg ok'; await loadSupplierSheet(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      b.disabled = false;
    }); };
    run('[data-supplier-setup]', '/admin/supplier-sheet/setup', r => `Supplier sheet is set up with ${r.rows} orders.`);
    run('[data-supplier-check]', '/admin/supplier-sheet/check', r => r.ok ? `${r.changed.length} orders updated from the sheet.` : r.error);
  }
  function bindSettings() {
    bindSetTabs();
    bindStorage();
    bindSupplierSheet();
    const tf = $('#terms-publish');
    if (tf) tf.addEventListener('submit', async e => {
      e.preventDefault(); const b = $('[type=submit]', tf), m = $('[data-terms-msg]'); b.disabled = true;
      try { await api('/admin/terms', { method: 'POST', body: { version: Number(tf.version.value), english: tf.english.value, hebrew: tf.hebrew.value } }); m.textContent = 'Published. Clients must accept the new version.'; m.className = 'form-msg full ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; b.disabled = false; }
    });
    const bf = $('#bank-form');
    if (bf) bf.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-bank-msg]');
      try { await api('/admin/settings', { method: 'POST', body: Object.fromEntries(BANK_UI.map(([k]) => [k, bf[k].value])) }); m.textContent = 'Saved. Clients see the new details right away.'; m.className = 'form-msg ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
    });
    const cf = $('#couriers-form');
    cf?.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-couriers-msg]'), b = $('[type=submit]', cf); if (b.disabled) return; b.disabled = true;
      try { await api('/admin/settings', { method: 'POST', body: { couriers: cf.couriers.value } }); m.textContent = 'Saved. The supplier sheet dropdown is updated.'; m.className = 'form-msg ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      finally { b.disabled = false; }
    });
    const f = $('#settings-form');
    const split = () => {
      const fee = parseFloat(f.commission_per_order.value), sup = parseFloat(f.supplier_bonus_per_order.value) || 0;
      $('[data-split]').innerHTML = `<div><small>Client pays (inside product cost)</small><b>${Number.isFinite(fee) ? money(fee) : '—'}</b></div><div><small>The supplier pays us</small><b>${money(sup)}</b></div><div><small>We earn per order</small><b class="pos">${Number.isFinite(fee) ? money(fee + sup) : '—'}</b></div>`;
    };
    f.addEventListener('input', split); split();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-settings-msg]');
      try { await api('/admin/settings', { method: 'POST', body: { commission_per_order: f.commission_per_order.value, supplier_bonus_per_order: f.supplier_bonus_per_order.value, volumetric_divisor: f.volumetric_divisor.value, subscription_price: f.subscription_price.value } }); m.textContent = 'Saved. New orders use the new fee.'; m.className = 'form-msg ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
    });
    const c = $('[data-calc]'), out = $('[data-calc-out]');
    const upd = () => {
      const q = quote({ country: c.country.value, category: c.category.value, weightKg: c.weight.value, lengthCm: c.l.value, widthCm: c.w.value, heightCm: c.h.value, divisor: divisor() });
      out.innerHTML = q ? `<small>Shipping fee to ${esc(countryName(c.country.value))}</small><strong>${money(q.total)}</strong><div class="bd">${q.chargeable} kg${q.usedVolumetric ? ' (size-based)' : ''} × ${money(q.perKg)}/kg = ${money(q.freight)} + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}${q.estimated ? '<br>Estimated rate (not confirmed by the supplier yet).' : ''}</div>` : '<small>Shipping fee</small><strong>—</strong><div class="bd">Enter a weight.</div>';
    };
    c.addEventListener('input', upd); c.addEventListener('change', upd);
  }

  // "Tell the supplier on WhatsApp" (Erwin, 28 Oct 2026): opens the admin's own WhatsApp with the message written;
  // they choose Ye's chat and press Send (automatic sending needs a WhatsApp Business account).
  const usd2 = n => (Number(n || 0) < 0 ? '-$' : '$') + Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function revisionWhatsApp(o, r) {
    const cost = o.supplierCost != null && r.status !== 'offered' ? o.supplierCost : Math.round((Number(o.price || 0) - Number(o.commission || 0)) * 100) / 100;
    const text = `Hi Ye, our client asks for a lower cost on order ${o.orderRef || '#' + o.id} (orange row in the Orders sheet). ${r.items ? `It has several products; their competitor prices: ${r.items}. The Total cost now is ${usd2(cost)}${o.itemCosts?.length ? ` (cost per product ${o.itemCosts.map(usd2).join(', ')})` : ''}` : `They sell it at ${usd2(r.competitorPrice)} (competitor price) and the Total cost now is ${usd2(cost)}`}, so they earn very little. Can you check if you can lower it? If yes, please type the new Total cost${r.items ? ' and the new Cost per product' : ''} in the sheet. Thank you!`;
    return 'https://wa.me/?text=' + encodeURIComponent(text);
  }
  // ---------- side panel: one order ----------
  // Boxes used now and then fold to one line with a short summary (Erwin, 7 Nov 2026: shorter screens). Open or closed is
  // remembered in this browser (foldOpen, 11-client-panel.js). Status, tracking, requests and Money stay open.
  const foldCard = (k, title, sum, body, attrs = '') => `<details class="card card-pad fold" data-fold="${k}"${attrs}${foldOpen(k) ? ' open' : ''}><summary><h3 class="sec-title">${title}</h3><small class="dim">${sum}</small></summary>${body}</details>`;
  let chatCtl = null, events = [];
  function closeChat() { chatCtl?.destroy(); chatCtl = null; }
  function openOrder(id, focus, back) {
    const o = [...S.orders,...S.archivedOrders].find(x => x.id === Number(id)); if (!o) return;
    const d = UI.getDrawer();
    closeChat(); events = [];
    S.drawer = { kind: 'order', id: o.id, back };
    d.onClose = () => { closeChat(); S.drawer = null; };
    d.open('o' + o.id);
    d.body.innerHTML = '<div data-d-info style="display:grid;gap:16px"></div><section><h3 class="sec-title">Messages with the client</h3><div data-d-chat></div></section>';
    markSeen(o); invoiceFiles=[];fillOrder(o);
    api('/admin/invoices?clientId='+o.clientId).then(r=>{if(S.drawer?.kind==='order'&&S.drawer.id===o.id){invoiceFiles=r.invoices;fillOrder(o,true);}}).catch(ex=>toast(ex.message));
    chatCtl = UI.chat($('[data-d-chat]', d.body), { orderId: o.id, role: 'admin', readOnly: !!o.archived, onLoad: data => {
      events = data.events || [];
      const cur = [...S.orders,...S.archivedOrders].find(x => x.id === o.id);
      const hadUnread=cur?.unreadMessages,oldCount=cur?.messages;UI.syncConversation(cur,data);
      if (cur && (hadUnread || oldCount!==cur.messages)) { cur.unreadMessages = 0; renderKpis(); renderList(); tell({ type: 'dl-followups', unread: unreadTotal() }); }
      if (cur && S.drawer?.kind === 'order' && S.drawer.id === cur.id) fillOrder(cur, true);
    } });
    if (focus === 'chat') setTimeout(() => { $('[data-d-chat]', d.body)?.scrollIntoView({ block: 'start' }); chatCtl?.focus(); }, 320);
  }
  function fillOrder(o, soft) {
    const d = UI.getDrawer(), back = S.drawer?.back;
    d.head.innerHTML = `${back ? `<button type="button" class="back" data-back>${ic('back')}${esc(clientName(back))}</button>` : ''}<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2>${esc(orderName(o))}</h2>${UI.pill(o.status)}${UI.delayTag(o)}</div><p>${esc(clientName(o.clientId))} · ordered ${esc(o.orderDate || fullDate(o.createdAt))} · to ${esc(place(o.destination))}</p><p><span>Added</span> ${esc(fullDate(o.createdAt))}</p>`;
    const info = $('[data-d-info]', d.body); if (!info) return;
    if (soft && $('[name=invoiceFile]',info)?.files.length) return;
    if (soft && info.contains(document.activeElement) && document.activeElement.matches('input')) return;
    if (o.archived) {
      info.innerHTML = `<section class="card card-pad"><h3 class="sec-title">Archived order</h3><p>This order is hidden from normal order lists. Billing and payment history are preserved.</p><p><span>Archived at</span> ${esc(fullDate(o.archivedAt))}</p>${UI.activity(events)}</section>`;
      d.foot.innerHTML = `<button type="button" class="btn btn-primary" data-restore-order="${o.id}">Restore order</button>`;
      return;
    }
    info.innerHTML = `
      <section class="card card-pad">${UI.delayNote(o)}${UI.tracker(o, events)}</section>
      ${foldCard('op-media', 'Product photos &amp; link', `${(o.photos || []).length ? `<span>${(o.photos || []).length === 1 ? '1 photo' : o.photos.length + ' photos'}</span>` : '<span>No photo yet</span>'}${o.etsyUrl ? ' · <span>link</span>' : ''}`, productMedia(o, { removable: true, canAdd: (o.photos || []).length < 8 }), ' data-d-media')}
      <section class="card card-pad"><h3 class="sec-title">Update status</h3>
        ${o.status==='cancelled' ? '<p class="note">This order is cancelled. Choose a status to reopen it; its cancellation fee is then removed.</p>' : ''}
        ${o.status==='cancelled' && (cx => cx?.detail === 'Cancellation approved' && !events.some(e => e.kind === 'status' && e.createdAt > cx.createdAt))(events.filter(e => e.kind === 'cancellation').at(-1)) ? `<div class="cancel-row undo-cx"><button type="button" class="btn" data-undo-cancel="${o.id}">Undo approval</button><small class="dim">Back to the client’s cancellation request, with no cancellation fee.</small></div>` : ''}
        <div class="status-btns">${ADMIN_STATUSES.map(s => `<button type="button" class="t-${s}${s === o.status ? ' on' : ''}" data-set-status="${s}" data-id="${o.id}">${UI.LABEL[s]}</button>`).join('')}${o.status === 'cancellation_requested' ? '' : `<button type="button" class="t-cancelled${o.status === 'cancelled' ? ' on' : ''}"${o.status === 'cancelled' ? '' : ` data-cancel-window="${o.id}" aria-haspopup="dialog"`}>${UI.LABEL.cancelled}</button>`}</div>
        <form class="track-form" data-track-form="${o.id}"><div class="track-fields"><label class="field"><span>Tracking number</span><input name="trackingNumber" maxlength="120" value="${esc(o.trackingNumber)}" placeholder="e.g. LX123456789CN"></label><label class="field"><span>Courier</span><input name="courier" maxlength="60" list="dl-couriers" value="${esc(o.courier)}" placeholder="e.g. Yanwen"></label><datalist id="dl-couriers">${String(S.ov.settings.couriers || '').split('\n').filter(Boolean).map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>${o.domesticTracking ? `<p class="dom-track"><span>Domestic tracking in China (from the supplier sheet)</span> <b data-no-i18n>${esc(o.domesticTracking)}</b></p>` : ''}<div class="form-actions"><button class="btn" type="submit">Save tracking</button><button type="button" class="btn" data-tracking-update="${o.id}">Tracking update received</button>${o.trackingNumber ? `<a class="btn btn-ghost" href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${ic('ext')}Track</a>` : ''}</div></form>
      </section>
      ${foldCard('op-store', 'Store', `<span data-no-i18n>${esc(S.stores.find(s => s.id === o.storeId)?.name || '')}</span>`, `<label class="field"><span>Move to another store</span><select data-move-order="${o.id}">${S.stores.filter(s=>s.clientId===o.clientId&&(!s.archived||s.id===o.storeId)).map(s=>`<option value="${s.id}"${s.id===o.storeId?' selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`)}
      ${adminClaimCard(S.claims.find(c=>c.orderId===o.id))}
      ${o.revision && ['open', 'offered'].includes(o.revision.status) ? (r => `<section class="card card-pad rev-admin" data-rev-admin><h3 class="sec-title">Cost revision requested</h3><div class="money-rows"><div><span>Client’s competitor price</span><span><b data-no-i18n>${r.items ? `<bdi dir="ltr">${esc(r.items)}</bdi>` : money(r.competitorPrice)}</b></span></div><div><span>Client pays now</span><span data-no-i18n>${money(o.price)}</span></div>${r.offeredCost != null ? `<div class="total"><span>Supplier’s new cost (sheet)</span><span><b data-no-i18n>${money(r.offeredCost)}</b> <small class="dim">→ <span>client pays</span> <span data-no-i18n>${money(r.offeredCost + (o.commission || 0))}</span></small></span></div>` : '<div><span>Supplier’s new cost</span><span class="dim">Waiting for the supplier in the sheet</span></div>'}</div>${r.offeredCost != null ? `<p class="note rev-why">${r.offeredCost + (o.commission || 0) >= o.price ? 'Not lower than what the client pays now, so it waits for you.' : 'More than half off: check it isn’t a typo before you approve.'}</p>` : '<p class="dim rev-why">A lower cost from the supplier is approved automatically. The supplier can type NO in the sheet if it can’t be lower.</p>'}${r.note ? `<p class="note" data-no-i18n>${esc(r.note)}</p>` : ''}<form class="form-grid rev-answer" data-rev-answer="${o.id}" novalidate><label class="field"><span>New supplier cost (USD) <small>our fee is added</small></span><span class="money"><input name="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${r.offeredCost ?? ''}"></span></label><label class="field"><span>Reply to the client <small>optional</small></span><input name="reply" maxlength="1000"></label><div class="full form-actions"><a class="btn" href="${revisionWhatsApp(o, r)}" target="_blank" rel="noopener" data-rev-wa>${ic('chat')}Tell the supplier on WhatsApp</a><button type="button" class="btn" data-rev-keep="${o.id}">Keep the price</button><button type="submit" class="btn btn-primary">Approve new cost</button></div></form></section>`)(o.revision) : ''}
      ${o.status==='cancellation_requested' ? `<section class="card card-pad"><h3 class="sec-title">Cancellation request</h3><p data-no-i18n>${esc(o.cancellationReason)}</p>${o.supplierCancelFee != null ? `<p class="note cancel-sup"><span>Supplier's cancellation fee (from the sheet)</span>: <b data-no-i18n>${money(o.supplierCancelFee)}</b></p>` : '<p class="note cancel-sup">No cancellation fee from the supplier yet.</p>'}<div class="cancel-row"><button type="button" class="btn btn-danger" data-cancel-window="${o.id}" aria-haspopup="dialog">Approve cancellation…</button><button type="button" class="btn" data-cancel-decision="reject" data-id="${o.id}">Reject cancellation</button></div></section>` : ''}
      ${(r => foldCard('op-receipts', 'Receipts', r.length ? `<span>${r.length === 1 ? '1 receipt' : r.length + ' receipts'}</span>` : '<span>None yet</span>', adminInvoiceLinks(r) + invoiceForm(o.clientId, o.id)))(invoiceFiles.filter(f => f.orderIds.includes(o.id)))}
      ${o.quotedUnitPrice!=null ? `<section class="card card-pad"><span>Fixed unit quote</span> <b>${money(o.quotedUnitPrice)}</b> × ${o.quantity} = <b>${money(o.price)}</b></section>` : billHTML(o)}
      ${foldCard('op-details', 'Details', `<span data-no-i18n>${esc(o.buyerName || '')}</span>${o.destination ? ` · <span>${esc(place(o.destination))}</span>` : ''}`, `<dl class="kv">
        <div><dt>Client</dt><dd><button type="button" class="back" style="margin:0" data-open-client="${o.clientId}">${esc(clientName(o.clientId))}</button></dd></div><div><dt>Order number</dt><dd>${esc(o.orderRef) || '—'}${o.source === 'etsy-csv' ? ' <span class="st" style="--tone:var(--blue);text-transform:none">From Etsy file</span>' : ''}</dd></div>
        <div><dt>Order date</dt><dd>${esc(o.orderDate) || fullDate(o.createdAt)}</dd></div><div><dt>Customer paid</dt><dd>${customerPaid(o)}</dd></div>
        ${o.itemTitle ? `<div class="full"><dt>Product</dt><dd>${esc(o.itemTitle)}</dd></div>` : ''}<div><dt>Quantity</dt><dd>${esc(o.quantity || 1)}</dd></div><div><dt>SKU / listing ID</dt><dd>${esc(o.sku) || '—'}</dd></div>
        ${o.variant ? `<div class="full"><dt>Variation / personalization</dt><dd style="white-space:pre-line">${esc(o.variant)}</dd></div>` : ''}
        ${o.competitorPrice ? `<div class="full"><dt>Competitor price <small>from the client</small></dt><dd data-no-i18n><bdi>${esc(o.competitorPrice)}</bdi></dd></div>` : ''}
        
        <div class="full"><dt>Recipient</dt><dd>${esc(o.buyerName) || '—'}</dd></div>
        <div class="full"><dt>Delivery address &amp; phone</dt><dd style="white-space:pre-line">${DL.addressLines(o, o.destination ? place(o.destination) : '', false).map(esc).join('\n') || '—'}</dd><button type="button" class="btn btn-sm" data-copy="${esc(DL.addressLines(o, o.destination ? place(o.destination) : '', true).join('\n'))}">Copy full address</button></div><div><dt>Country</dt><dd>${esc(place(o.destination))}</dd></div>
        <div><dt>Product type</dt><dd>${esc(shortCat(o.category))}</dd></div><div><dt>Weight</dt><dd>${o.weightKg != null ? esc(o.weightKg) + ' kg' : 'Not entered yet'}</dd></div><div><dt>Last update</dt><dd>${esc(fullDate(o.updatedAt))}</dd></div>
        <div><dt>Google Sheet</dt><dd>${o.sheetSyncStatus === 'synced' ? 'Synced' : o.sheetSyncStatus === 'error' ? 'Needs retry' : 'Waiting to sync'}</dd></div>
        ${o.sheetSyncError ? `<div class="full"><dt>Sheet sync note</dt><dd>${esc(o.sheetSyncError)}</dd></div>` : ''}
        ${o.taxNumber ? `<div class="full"><dt>Tax number</dt><dd data-no-i18n>${esc(o.taxNumber)}</dd></div>` : ''}${o.giftMessage ? `<div class="full"><dt>Gift message</dt><dd data-no-i18n style="white-space:pre-line">${esc(o.giftMessage)}</dd></div>` : ''}
        ${o.notes ? `<div class="full"><dt>Client’s notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl>`)}
      ${foldCard('op-fee', 'Fee on this order', `<span data-no-i18n>${money(o.commission)}</span>`, `<form class="form-grid" data-fees-form="${o.id}" novalidate>
        <label class="field"><span>Fee <small>kept in the client’s price</small></span><span class="money"><input name="commission" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(o.commission||0).toFixed(2)}"></span></label>
        <p class="note full" style="margin:0">Changes only this order. The default fee in Fees &amp; settings and each client’s own fee apply to new orders.</p>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save fee</button><p class="form-msg" data-fees-msg style="margin:0"></p></div></form>`)}
      <section class="card card-pad"><h3 class="sec-title">Money</h3><div class="money-rows">
        ${o.supplierCost != null ? `<div><span>Supplier total <span class="dim">(from supplier sheet)</span></span><span>${money(o.supplierCost)}</span></div>` : ''}
        <div><span>Product cost <span class="dim">(fee included)</span></span><span>${money(o.productCost)}</span></div><div><span>Shipping fee</span><span>${money(o.shippingFee)}</span></div>
        <div class="total"><span>Client pays</span><span>${money(o.price)}</span></div>
        <div><span>Payment</span><span>${o.paymentId ? `<span class="pay-tag paid">Paid</span> <small class="dim" data-no-i18n>${esc(window.DLPayOrders.day(o.paidAt))}</small>` : window.DLPayOrders.state(o) === 'unpaid' ? '<span class="pay-tag unpaid">Not paid</span>' : '<span class="dim">No bill yet</span>'}</span></div>${o.priceSource === 'saved' ? '<p class="note" style="margin:6px 0 0">Priced automatically from an earlier order of this client (same store, product, variation, country and quantity). The supplier can change the total cost in the sheet.</p>' : ''}
        <div><span>Customer paid client</span><span>${customerPaid(o)}</span></div><div><span>Client’s profit</span><span class="${o.profit != null && o.profit > 0 ? 'pos' : o.profit != null && o.profit < 0 ? 'neg' : ''}">${needsCost(o) ? 'Pending costs' : o.profit == null ? ((o.currency || 'USD') !== 'USD' && o.earned != null ? '<span class="dim">Not in USD</span>' : '<span class="dim">Needs the Etsy earnings</span>') : money(o.profit)}</span></div></div>
        <div class="split"><div><small>Fee on this order</small><b>${money(o.commission)}</b></div><div><small>We earn</small><b class="pos">${money(o.ourShare)}</b></div></div></section>
      ${UI.activity(events)}`; // history last: what needs doing comes first (Erwin, 7 Nov 2026)
    bindBill(o);
    d.foot.innerHTML = `<button type="button" class="btn" data-edit-order="${o.id}">${ic('edit')}Edit order</button><button type="button" class="btn" data-open-client="${o.clientId}">Open client</button><button type="button" class="btn btn-danger" data-archive-order="${o.id}">Archive order</button>`;
  }

  function subscriptionHTML(c) {
    const sub = c.subscription || {}, price = sub.price ?? Number(S.ov.settings.subscription_price ?? 29);
    const opt = (v, l) => `<option value="${v}"${(sub.status || 'trial') === v ? ' selected' : ''}>${l}</option>`;
    return `<section class="card card-pad"><h3 class="sec-title">Subscription</h3>
      <p class="muted" style="margin:0 0 12px;font-size:14px">First month free, then ${esc(shekels(price))} / month. The client sees this in their portal. Nothing is charged or blocked automatically.</p>
      <form class="form-grid" data-sub-form="${c.id}" novalidate>
        <label class="field"><span>Status</span><select name="subStatus">${opt('trial', 'Free month (trial)')}${opt('active', 'Active (paying)')}${opt('overdue', 'Overdue')}${opt('cancelled', 'Cancelled')}</select></label>
        <label class="field"><span>Last payment <small>optional</small></span><input name="subLastPayment" type="date" value="${esc(sub.lastPayment || '')}"></label>
        <label class="field"><span>Trial start</span><input name="trialStart" type="date" value="${esc(sub.trialStart || '')}"></label>
        <label class="field"><span>Trial end <small>1 month after start</small></span><input name="trialEnd" type="date" value="${esc(sub.trialEnd || '')}"></label>
        <div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Save subscription</button><p class="form-msg" data-sub-msg></p></div></form></section>`;
  }
  document.addEventListener('change', e => {
    const el = e.target; if (!el.matches?.('[data-sub-form] [name=trialStart]') || !el.value) return;
    el.form.trialEnd.value = addMonthIso(el.value);
  });
  const addMonthIso = iso => { const [y, m, d] = iso.split('-').map(Number); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10); };

  // Bill an order right from its panel: product type + weight (and size) → shipping fee from our rates,
  // plus product cost (our hidden fee included) = what the client pays. Saves onto the order.
  function billHTML(o) {
    const v2 = x => (x != null ? Number(x).toFixed(2) : '');
    const rated = !!RATES[o.destination];
    // Open while the order still needs a cost; once billed it folds to one line (7 Nov 2026: shorter order view).
    const form = `
      <form class="form-grid bill-form" data-bill-form="${o.id}" novalidate>
        <label class="field"><span>Product type</span><select name="category">${categoryOptions(o.category || 'general')}</select></label>
        <label class="field"><span>Weight (kg)</span><input name="weightKg" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 0.25" value="${o.weightKg ?? ''}"></label>
        <div class="field full"><span>Size L × W × H (cm) <small>optional · big, light boxes are charged by size</small></span><div class="dims"><input name="l" type="number" min="0" placeholder="L" aria-label="Length"><input name="w" type="number" min="0" placeholder="W" aria-label="Width"><input name="h" type="number" min="0" placeholder="H" aria-label="Height"></div></div>
        <label class="field"><span>Product cost <small>fee included</small></span><span class="money"><input name="productCost" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(o.productCost)}"></span></label>
        <label class="field"><span>Shipping fee <small data-bill-hint></small></span><span class="money"><input name="shippingFee" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(o.shippingFee)}"></span></label>
        <div class="full calc-out bill-out" data-bill-out></div>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save bill</button><p class="form-msg" data-bill-msg style="margin:0"></p></div>
        ${rated ? '' : `<p class="note full" style="margin:0">No shipping rate saved for ${esc(place(o.destination))} yet — type the shipping fee.</p>`}
      </form>`;
    return needsCost(o) ? `<section class="card card-pad"><h3 class="sec-title">Bill this order</h3>${form}</section>` : foldCard('op-bill', 'Bill this order', `<span>Billed</span> <span data-no-i18n>${money(o.price)}</span>`, form);
  }
  function bindBill(o) {
    const f = $(`[data-bill-form="${o.id}"]`); if (!f) return;
    let auto = null;
    const upd = () => {
      const q = quote({ country: o.destination, category: f.category.value, weightKg: f.weightKg.value, lengthCm: f.l.value, widthCm: f.w.value, heightCm: f.h.value, divisor: divisor() });
      const qs = q ? q.total.toFixed(2) : null;
      if (q && (f.shippingFee.value === '' || f.shippingFee.value === auto)) { f.shippingFee.value = qs; auto = qs; }
      $('[data-bill-hint]', f).innerHTML = !q ? '' : f.shippingFee.value === qs ? 'from our rates' : `<button type="button" class="back" style="margin:0" data-bill-use="${qs}">use ${money(q.total)}</button>`;
      const pc = parseFloat(f.productCost.value), sh = parseFloat(f.shippingFee.value), have = Number.isFinite(pc) || Number.isFinite(sh);
      $('[data-bill-out]', f).innerHTML = `<small>Client pays</small><strong>${have ? money((pc || 0) + (sh || 0)) : '—'}</strong><div class="bd">${q ? `Shipping: ${q.chargeable} kg${q.usedVolumetric ? ' (by size)' : ''} × ${money(q.perKg)}/kg + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}${q.estimated ? ' · estimated rate' : ''}` : 'Enter the weight to work out shipping from our rates.'}${Number.isFinite(pc) ? ` · Product ${money(pc)}` : ''}</div>`;
    };
    f.addEventListener('input', e => { if (e.target.name === 'shippingFee') auto = null; upd(); });
    f.addEventListener('change', upd);
    f.addEventListener('click', e => { const u = e.target.closest('[data-bill-use]'); if (u) { f.shippingFee.value = u.dataset.billUse; auto = f.shippingFee.value; upd(); } });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-bill-msg]', f);
      if (f.productCost.value === '' && f.shippingFee.value === '') { m.textContent = 'Enter the product cost and shipping fee.'; m.className = 'form-msg err'; return; }
      const body = { category: f.category.value, weightKg: f.weightKg.value === '' ? null : f.weightKg.value,
        productCost: f.productCost.value === '' ? null : f.productCost.value, shippingFee: f.shippingFee.value === '' ? null : f.shippingFee.value };
      const btn = $('[type=submit]', f); if (btn.disabled) return; btn.disabled = true;
      try {
        await api('/orders/' + o.id, { method: 'PUT', body });
        document.activeElement?.blur(); await loadAll(); renderList(); renderKpis();
        const cur = [...S.orders,...S.archivedOrders].find(x => x.id === o.id); if (cur) fillOrder(cur);
        toast('Bill saved. ' + money(cur?.price) + ' added to what ' + (clientName(o.clientId) || 'the client') + ' owes.');
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; btn.disabled = false; }
    });
    upd();
  }

  // ---------- side panel: one client ----------
  let cancelledMoney = null, payments = [], transferProofs = [], invoiceFiles=[], balanceAdjustments=[], billing = null, savedPrices = null, clientActivity = null;
  async function openClient(id, tab = 'orders') {
    const c = clientOf(id); if (!c) return;
    const d = UI.getDrawer();
    closeChat(); payments = []; transferProofs = []; invoiceFiles=[];balanceAdjustments=[]; billing = null; savedPrices = null; clientActivity = null;
    S.drawer = { kind: 'client', id: c.id, tab };
    d.onClose = () => { S.drawer = null; };
    d.open('c' + c.id);
    fillClient(c);
    await loadPayments(c.id);
  }
  async function loadSavedPrices(id) {
    try { savedPrices = (await api('/admin/saved-prices?clientId=' + id)).prices; } catch (ex) { savedPrices = []; toast(ex.message); }
    if (S.drawer?.kind === 'client' && S.drawer.id === id) fillClient(clientOf(id), true);
  }
  // Prices the supplier gave before, used automatically for the same order again (same store, product, variation, country, quantity).
  function savedPricesHTML(c) {
    const fee = Number(c.commissionPerOrder ?? S.ov.settings.commission_per_order ?? 0);
    const intro = '<p class="note" style="margin:0 0 12px">When the supplier fills in the total cost of an order, it is saved here. The next order with the same store, product, variation, country and quantity gets that price straight away. The supplier can still change it in the sheet, and the newest cost is kept.</p>';
    if (savedPrices === null) return `<section class="card card-pad"><h3 class="sec-title">Saved prices</h3>${intro}<p class="muted">Loading…</p></section>`;
    if (!savedPrices.length) return `<section class="card card-pad"><h3 class="sec-title">Saved prices</h3>${intro}${empty('No saved prices yet', 'They appear after the supplier prices this client’s orders.')}</section>`;
    return `<section class="card card-pad" style="padding-bottom:6px"><div class="sec-head"><h3 class="sec-title">Saved prices</h3>${savedPrices.length > 1 ? sortPick('client-saved-prices', SAVED_PRICE_SORTS) : ''}</div>${intro}</section><section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Product</th><th>Country</th><th class="num">Qty</th><th class="num">Supplier cost</th><th class="num">Client pays</th><th>Used</th><th></th></tr></thead><tbody>
      ${firstRows(sortList(savedPrices, 'client-saved-prices', SAVED_PRICE_SORTS), 'prices').map(p => `<tr><td data-label="Product"><b data-no-i18n>${esc(p.label) || '—'}</b>${p.variant ? `<br><small class="dim" data-no-i18n>${esc(p.variant)}</small>` : ''}${p.storeName ? `<br><small class="dim" data-no-i18n>${esc(p.storeName)}</small>` : ''}${p.link ? `<br><a href="${esc(p.link)}" target="_blank" rel="noopener"><small>Product link</small></a>` : ''}</td>
        <td data-label="Country">${esc(place(p.destination))}</td><td data-label="Qty" class="num">${p.quantity}</td>
        <td data-label="Supplier cost" class="num">${money(p.supplierCost)}</td><td data-label="Client pays" class="num"><b>${money(p.supplierCost + fee)}</b></td>
        <td data-label="Used"><small class="dim">${p.uses ? `${p.uses}×` : 'Not yet'}${p.lastUsedAt ? ` · ${esc(fmtDay(new Date(p.lastUsedAt * 1000).toISOString().slice(0, 10)))}` : ''}</small></td>
        <td class="num"><button type="button" class="btn btn-sm" data-forget-price="${p.id}">Forget</button></td></tr>`).join('')}
    </tbody></table></div>${moreRows(savedPrices.length, 'prices')}</section>`;
  }
  // Client activity: last sign-in / last time in the portal, what the client did, and what admins changed logged in as them.
  async function loadActivity(id) {
    try { clientActivity = await api('/admin/clients/' + id + '/activity'); } catch (ex) { clientActivity = { lastLogin: null, lastSeen: null, events: [], adminActions: [] }; toast(ex.message); }
    if (S.drawer?.kind === 'client' && S.drawer.id === id) fillClient(clientOf(id), true);
  }
  const CLIENT_DID = { duplicate: 'Sent a possible duplicate order', revision_requested: 'Asked for a cost revision', created: 'Added an order', edited: 'Edited an order', status: 'Changed an order status', cancellation: 'Asked to cancel an order', photo: 'Added a product photo', claim: 'Opened a claim', message: 'Sent a message', product: 'Sent a product for a quote' };
  const clientDid = e => e.kind === 'edited' && e.detail === 'customer' ? 'Changed customer details' : e.kind === 'photo' && e.detail === 'removed' ? 'Removed a product photo' : CLIENT_DID[e.kind] || e.kind;
  function adminDid(a) {
    const p = a.path, m = /^\/orders\/(\d+)/.exec(p);
    const label = p === '/acting/start' ? 'Logged in as this client'
      : p === '/orders' ? 'Added an order' : /\/photos\/\d+\/delete$/.test(p) ? 'Removed a product photo' : /\/photos$/.test(p) ? 'Added a product photo'
      : /\/request-cancellation$/.test(p) ? 'Asked to cancel an order' : /\/mark-delivered$/.test(p) ? 'Marked an order delivered' : /\/claims$/.test(p) ? 'Opened a claim'
      : /^\/orders\/\d+$/.test(p) ? 'Edited an order' : p.startsWith('/products') ? 'Sent a product for a quote' : p.startsWith('/client-stores') ? 'Saved a store'
      : p.startsWith('/transfers') ? 'Uploaded a transfer confirmation' : p === '/billing' ? 'Saved billing details' : /\/messages$/.test(p) ? 'Sent a message' : p === '/password' ? 'Changed the password'
      : p === '/terms/accept' ? 'Accepted the terms' : 'Other change';
    const order = m ? S.orders.find(o => o.id === Number(m[1])) : null;
    return { label, ref: order ? orderName(order) : m ? '#' + m[1] : '' };
  }
  const actRow = (label, ref, at, extra = '') => `<li><b>${esc(label)}</b>${ref ? ` <span class="dim" data-no-i18n>${esc(ref)}</span>` : ''}${extra}<time datetime="${new Date(at * 1000).toISOString()}">${esc(fullDate(at))}</time></li>`;
  // Client panel: 4 tabs, each with its own sections (sub-tabs) — Orders · Shop · Money · Account.
  const CLIENT_GROUPS = [['orders', 'Orders', ['orders']], ['shop', 'Shop', ['stores', 'products']], ['money', 'Money', ['payments', 'prices']], ['account', 'Account', ['account', 'activity']]];
  const groupOf = sec => (CLIENT_GROUPS.find(x => x[2].includes(sec)) || CLIENT_GROUPS[0])[0];
  // "Export to Excel" in the client panel: this client's orders (store filter and sort as on screen) with prices and a Paid column.
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-excel-export]'); if (!b || S.drawer?.kind !== 'client') return;
    const c = clientOf(S.drawer.id); if (!c) return;
    const list = sortList(S.orders.filter(o => o.clientId === c.id && (!S.drawer.storeId || o.storeId === S.drawer.storeId)), 'client-orders', ORDER_SORTS);
    const he = window.DLi18n?.lang === 'he', t = he ? window.DLi18n.t : s => s;
    const storeName = S.drawer.storeId ? S.stores.find(s => s.id === S.drawer.storeId)?.name : t('All stores');
    const blob = window.DLExcelExport.orders({ title: t('Orders') + ' — ' + c.name, subtitle: [storeName, t('Exported') + ' ' + new Date().toLocaleDateString('en-GB')].join(' · '), orders: list, statusLabel: s => t(UI.LABEL[s] || s), t, rtl: he });
    window.DLExcelExport.download(blob, `Direct-Line-orders-${String(c.username || c.id).replace(/[^\w-]+/g, '')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
  // A "Sort" dropdown changed: remember it and redraw that list (client panel, Products tab, or the Orders / Clients list).
  document.addEventListener('change', e => {
    const s = e.target.closest?.('[data-sort]'); if (!s) return;
    setSort(s.dataset.sort, s.value);
    if (s.closest('.drawer') && S.drawer?.kind === 'client') fillClient(clientOf(S.drawer.id)); else if (S.tab === 'products') renderProducts(); else if (S.tab === 'claims') renderClaims(); else renderList();
  });
  document.addEventListener('change', e => { const sel = e.target.closest?.('[data-client-store]'); if (sel && S.drawer?.kind === 'client') { S.drawer.storeId = Number(sel.value); fillClient(clientOf(S.drawer.id)); } });
  // Long lists: the newest 8, the rest behind "Show all".
  const foldList = rows => `<ol class="order-activity">${rows.slice(0, 8).join('')}</ol>` + (rows.length > 8 ? `<details class="fold-more" data-keep="more${rows.length}"><summary>Show all (${rows.length})</summary><ol class="order-activity">${rows.slice(8).join('')}</ol></details>` : '');
  // Folded sections remember whether they were open (this browser only).
  const foldOpen = k => { try { return localStorage.getItem('dl-fold-' + k) === '1'; } catch (e) { return false; } };
  document.addEventListener('toggle', e => { const k = e.target?.dataset?.fold; if (k) try { localStorage.setItem('dl-fold-' + k, e.target.open ? '1' : '0'); } catch (x) { /* private mode */ } }, true);
  // Long lists in the client panel show 20 rows, then "Show 20 more" (Erwin, 7 Nov 2026: shorter screens; a client with
  // 100+ orders made the Orders tab 7,000 px long). S.drawer.more keeps how many rows each list shows while the panel is open.
  const PANEL_PAGE = 20;
  const shownOf = k => (S.drawer.more ||= {})[k] || PANEL_PAGE;
  const firstRows = (list, k) => list.slice(0, shownOf(k));
  const moreRows = (n, k) => n > shownOf(k) ? `<div class="panel-more"><button type="button" class="btn btn-sm" data-panel-more="${k}"><span>Show ${Math.min(PANEL_PAGE, n - shownOf(k))} more</span></button><small class="dim">${shownOf(k)} of ${n} shown</small></div>` : '';
  // Client panel → Products: one short row per product; the price form opens on click. Waiting ones first.
  function productsPane(list) {
    if (!list.length) return `<section class="card card-pad"><h3 class="sec-title">My Products</h3><p class="muted">No products yet.</p></section>`;
    const sorted = sortList(list, 'client-products', PRODUCT_SORTS);
    const price = p => (p.status === 'not_available' ? '<span class="dim">—</span>' : p.unitPrice == null ? '<span class="dim">No price yet</span>' : p.priceOptions ? `<span>from</span> <b>${money(p.unitPrice)}</b>` : `<b>${money(p.unitPrice)}</b>`) + (p.status === 'approved' && p.shipping != null ? `<small class="dim" style="display:block">+ ${money(p.shipping)} <span>shipping</span></small>` : '');
    const status = p => p.status === 'awaiting_quote' ? '<span class="tag tag-gold">Waiting for price</span>' : p.status === 'approved' ? '<span class="tag">Approved</span>' : '<span class="tag">Not available</span>';
    return `<section class="card card-pad"><div class="sec-head"><h3 class="sec-title">My Products</h3>${sortPick('client-products', PRODUCT_SORTS)}</div>${firstRows(sorted, 'products').map(p => `<details class="prod-row" data-keep="p${p.id}"><summary>${p.photoIds[0] ? `<img src="/api/portal/products/${p.id}/photos/${p.photoIds[0]}" width="64" height="64" alt="" loading="lazy">` : '<span class="prod-ph"></span>'}<span class="prod-name"><b data-no-i18n>${esc(p.name)}</b>${p.variant ? `<small class="dim" data-no-i18n>${esc(p.variant)}</small>` : ''}</span>${status(p)}<span class="prod-price">${price(p)}</span></summary>${productQuoteForm(p)}</details>`).join('')}${moreRows(sorted.length, 'products')}</section>`;
  }
  function activityHTML(c) {
    const a = clientActivity;
    if (!a) return `<section class="card card-pad"><p class="muted">Loading…</p></section>`;
    const when = s => s ? `<time datetime="${new Date(s * 1000).toISOString()}">${esc(fullDate(s))}</time>` : '<span class="dim">Never</span>';
    return `<section class="card card-pad"><dl class="kv" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><dt>Last sign-in</dt><dd>${when(a.lastLogin)}</dd></div><div><dt>Last active in the portal</dt><dd>${when(a.lastSeen)}</dd></div></dl></section>
      <section class="card card-pad"><h3 class="sec-title">What the client did</h3>${a.events.length ? foldList(a.events.map(e => actRow(clientDid(e), e.orderRef || e.productName || (e.orderId ? '#' + e.orderId : ''), e.createdAt))) : '<p class="muted">Nothing yet.</p>'}</section>
      <section class="card card-pad"><h3 class="sec-title">Changes made by admins logged in as this client</h3>${a.adminActions.length ? foldList(a.adminActions.map(x => { const d = adminDid(x); return actRow(d.label, d.ref, x.createdAt, x.ok ? '' : ' <span class="neg">Didn’t go through</span>'); })) : '<p class="muted">None yet.</p>'}</section>`;
  }
  async function loadPayments(id) {
    try { const [p,t,f] = await Promise.all([api('/admin/payments?clientId=' + id), api('/admin/transfers?clientId=' + id),api('/admin/invoices?clientId='+id)]); payments=p.payments; cancelledMoney=p.cancelled||null; transferProofs=t.transfers;invoiceFiles=f.invoices;balanceAdjustments=p.adjustments||[];billing=p.billing||null; } catch (e) { payments = []; transferProofs = []; invoiceFiles=[]; toast('Couldn’t load payments: ' + e.message); }
    if (S.drawer?.kind === 'client' && S.drawer.id === id) fillClient(clientOf(id), true);
  }
  // Receipts (stored as portal_files kind 'invoice'): the file Direct Line sends the client for money already paid.
  const adminInvoiceLinks=files=>files.length ? files.map(f=>`<p><a href="/api/portal/files/${f.id}" target="_blank" rel="noopener"><span>Download receipt</span> <span data-no-i18n>${esc(f.filename)}</span></a></p>`).join('') : '<span class="muted">No receipt yet</span>';
  function invoiceFields(clientId,orderId,withOrders){
    return `<label class="field full"><span>Receipt file <small>PDF or image, maximum 2 MB</small></span><input name="invoiceFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label>${withOrders ? `<div class="field full"><span>Orders on this receipt <small>optional</small></span>${poList(clientId,{all:true,compare:false})}</div>` : ''}`;
  }
  function invoiceForm(clientId,orderId){
    const today=new Date().toLocaleDateString('en-CA');
    return `<form class="form-grid" data-invoice-form="${clientId}" data-order-id="${orderId||''}">${invoiceFields(clientId,orderId,!orderId)}<label class="field"><span>Receipt date</span><input name="invoiceDate" type="date" value="${today}" required></label>${orderId ? '' : `<label class="field"><span>Linked payment <small>optional</small></span><select name="invoicePayment"><option value="">No payment link</option>${payments.map(p=>`<option value="${p.id}">${money(p.amount)} · ${esc(fullDate(p.paidAt))}${p.archived?' · Archived':''}</option>`).join('')}</select></label>`}<button type="submit" class="btn btn-primary">Save receipt</button><p class="form-msg" data-invoice-msg></p></form>`;
  }
  async function invoiceFile(f){
    const file=f.invoiceFile.files[0];if(!file)return null;if(file.size>2*1024*1024)throw new Error('The file is too large. Maximum 2 MB.');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});return {filename:file.name,data};
  }
  // ---------- which orders a payment is for (Erwin, 21 Oct 2026) ----------
  // An order is paid while it is linked to a payment that is not archived; the balance itself is unchanged.
  const PO = window.DLPayOrders;
  const oldestFirst = (a, b) => window.DLClientStoreMath.dateKey(a).localeCompare(window.DLClientStoreMath.dateKey(b)) || a.createdAt - b.createdAt || a.id - b.id;
  const dayOf = o => PO.day(window.DLClientStoreMath.dateKey(o));
  // Orders a payment can be for: billed and not paid yet (plus the ones already on this payment), oldest first.
  // A cancellation fee the credit already paid (paidFromCredit) is paid: not in the list and not owed (7 Nov 2026).
  const payableOrders = (clientId, paymentId = null) => S.orders.filter(o => o.clientId === clientId && !o.archived && (paymentId && o.paymentId === paymentId || !o.paymentId && !o.paidFromCredit && PO.dueCents(o, balanceAdjustments) > 0)).sort(oldestFirst);
  // A new payment: the client's credit (balance lower than their unpaid orders) is taken off, as in the client's pay box.
  // Credit still on the account for the Cancelled orders box, worked out like the client's pay box: unpaid orders plus the
  // cancellation fees nobody paid yet (fees the credit already took are paid), minus the balance (6 Nov 2026).
  const creditLeftC = (c, feesOwed = 0) => PO.creditCents(S.orders.filter(o => o.clientId === c.id && !o.archived && o.status !== 'cancelled' && PO.state(o, []) === 'unpaid').reduce((n, o) => n + PO.dueCents(o, []), 0) + Math.round((Number(feesOwed) || 0) * 100), c.outstanding || 0);
  const clientCredit = c => PO.creditCents(payableOrders(c.id).reduce((n, o) => n + PO.dueCents(o, balanceAdjustments), 0), c.outstanding || 0);
  function poList(clientId, { paymentId = null, checked = [], amount = 0, compare = true, all = false, credit = 0 } = {}) {
    const orders = all ? S.orders.filter(o => o.clientId === clientId && !o.archived && o.status !== 'cancelled').sort(oldestFirst) : payableOrders(clientId, paymentId);
    return PO.checklist({ orders, checked: new Set(checked), adjustments: balanceAdjustments, orderName, dateOf: dayOf, esc, amount, compare, credit, empty: all ? 'No orders yet.' : 'No billed orders are waiting for payment.' });
  }
  const pendingTransfer = () => transferProofs.find(t => t.id === S.drawer?.transferId && t.status === 'pending');
  // Paid / not paid at a glance, and payments that still need their orders ticked.
  // What the client owes without our fee (admin only): the balance minus our fee on their unpaid orders (credit and
  // earlier payments lower the supplier's part; our fee stays ours). Same rule as the Overview's Not paid yet card.
  function owedNoFee(c) {
    const fee = S.orders.filter(o => o.clientId === c.id && !o.archived && PO.state(o) === 'unpaid').reduce((n, o) => n + Math.round(Number(o.commission || 0) * 100), 0);
    const owed = Math.round(Math.max(0, Number(c.outstanding || 0)) * 100);
    return Math.max(0, owed - fee) / 100;
  }
  function paySummary(c) {
    const mine = S.orders.filter(o => o.clientId === c.id && !o.archived), st = o => PO.state(o, balanceAdjustments);
    const unpaid = mine.filter(o => st(o) === 'unpaid'), due = unpaid.reduce((n, o) => n + PO.dueCents(o, balanceAdjustments), 0) / 100;
    const unpaidFee = unpaid.reduce((n, o) => n + Math.round(Number(o.commission || 0) * 100), 0) / 100;
    const live = payments.filter(p => !p.archived), loose = live.filter(p => !p.orderIds?.length), noReceipt = live.filter(p => !receiptsOf(p).length);
    const todo = [[loose, 'payment is not linked to orders yet', 'payments are not linked to orders yet', 'Press Edit on it and tick its orders.'],
      [noReceipt, 'payment has no receipt yet', 'payments have no receipt yet', 'Press Attach receipt: the client gets it in their portal.']].filter(([l]) => l.length);
    return `<section class="card card-pad"><h3 class="sec-title">Orders and payments</h3><div class="pay-sum">
        <div><small>Paid orders</small><b class="pos">${mine.filter(o => st(o) === 'paid').length}</b></div>
        <div><small>Not paid yet</small><b class="${unpaid.length ? 'neg' : ''}">${unpaid.length}</b><em>${money(due)}</em>${unpaid.length ? `<em><span>Without our fee</span> ${money(due - unpaidFee)}</em>` : ''}</div>
        <div><small>No bill yet</small><b>${mine.filter(o => st(o) === 'unbilled').length}</b><em>No cost yet</em></div>
        <div><small>Balance</small><b class="${c.outstanding > 0 ? 'neg' : ''}">${money(c.outstanding)}</b><em><span>Billed</span> ${money(c.billed)} · <span>Paid</span> ${money(c.paid)}</em><em><span>Without our fee</span> ${money(owedNoFee(c))}</em></div></div>
      ${todo.length ? `<div class="pay-todo"><b class="pay-todo-title">To do</b>${todo.map(([l, one, many, hint]) => `<p><button type="button" class="link-btn" data-scroll-pay="pay-${l[0].id}"><b>${l.length}</b> <span>${l.length === 1 ? one : many}</span></button> <span class="dim">${hint}</span></p>`).join('')}</div>` : ''}</section>`;
  }
  // Billing details for receipts (the client fills them in on their Payments page; Ada uses them for the invoice header).
  function billingHTML(c) {
    const b = billing, v = k => esc(b?.[k] || ''), copy = b ? [b.name, b.company, b.address, b.email, b.phone].filter(Boolean).join('\n') : '';
    return `<section class="card card-pad"><div class="bill-head"><h3 class="sec-title">Billing details for receipts</h3>${b ? `<button type="button" class="btn btn-sm" data-copy="${esc(copy)}">${ic('copy')}Copy</button>` : ''}</div>
      ${b ? `<div class="bill-view"><p><b data-no-i18n>${v('name')}</b>${b.company ? `<br><span data-no-i18n>${v('company')}</span>` : ''}</p><p data-no-i18n style="white-space:pre-line">${v('address')}</p><p data-no-i18n>${[b.email, b.phone].filter(Boolean).map(esc).join(' · ')}</p><small class="dim"><span>${b.updatedBy === 'admin' ? 'Last saved by Direct Line' : 'Last saved by the client'}</span> · <span data-no-i18n>${esc(PO.day(b.updatedAt))}</span></small></div>` : '<p class="muted">The client hasn’t added billing details yet. They can add them on their Payments page.</p>'}
      <details class="fold-row" data-keep="billing"><summary><b>${b ? 'Edit billing details' : '+ Add billing details'}</b></summary><form class="form-grid" data-admin-billing="${c.id}" novalidate>
        <label class="field"><span>Full name</span><input name="name" maxlength="120" value="${v('name')}"></label>
        <label class="field"><span>Company name <small>optional</small></span><input name="company" maxlength="120" value="${v('company')}"></label>
        <label class="field full"><span>Billing address</span><textarea name="address" rows="3" maxlength="400">${v('address')}</textarea></label>
        <label class="field"><span>Email</span><input name="email" type="email" maxlength="160" value="${v('email')}"></label>
        <label class="field"><span>Phone</span><input name="phone" type="tel" maxlength="60" value="${v('phone')}"></label>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save billing details</button><p class="form-msg" data-billing-msg style="margin:0"></p></div></form></details></section>`;
  }
  function transferProofHTML() {
    const list = transferProofs.filter(t => t.status !== 'recorded');
    return list.length ? `<section class="card card-pad attn-card"><h3 class="sec-title">Transfer confirmations to check</h3><p class="note">The client sent these. Check that the money arrived, then record the payment.</p>${list.map(t=>`<div class="confirmation-row"><div><b>${money(t.amount)}</b> <small data-no-i18n>${esc(PO.day(t.date))}</small><p><a href="/api/portal/files/${t.id}${t.mime.startsWith('image/') ? '?inline=1" data-photo="1' : ''}" target="_blank" rel="noopener">Open confirmation</a></p>${t.orderIds?.length ? `<small class="dim"><span>Orders ticked by the client:</span> ${t.orderIds.length}</small>` : ''}${t.mime.startsWith('image/') ? `<img data-photo src="/api/portal/files/${t.id}?inline=1" style="max-width:160px;max-height:120px;object-fit:contain" alt="Transfer confirmation">` : ''}</div>${t.status==='pending' ? `<button type="button" class="btn btn-primary" data-record-transfer="${t.id}">Record this payment</button><button type="button" class="btn btn-ghost" data-remove-transfer="${t.id}" title="For a confirmation sent twice or by mistake. Nothing is paid or deleted.">Remove</button>` : `<button type="button" class="btn" data-restore-payment="${t.paymentId}">Restore payment</button>`}</div>`).join('')}</section>` : '';
  }
  // ---------- Money > Payments (Erwin, 21 Oct 2026): one card per payment — the amount, the orders it pays and its
  // receipt. "Attach receipt" sends the receipt to the client (notification + download on their Payments page). ----------
  const receiptsOf = p => invoiceFiles.filter(f => f.paymentId === p.id);
  const dayInput = sec => new Date(Number(sec) * 1000).toISOString().slice(0, 10);
  const methods = m => { const base = ['Bank transfer', 'PayPal', 'Wise', 'Other']; return !m || base.includes(m) ? base : [m, ...base]; };
  const receiptInput = (required = false) => `<label class="field full"><span>Receipt file <small>PDF or image, maximum 2 MB</small></span><input name="invoiceFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"${required ? ' required' : ''}></label>`;
  function recordForm(c, iso) {
    const tr = pendingTransfer();
    return `<form class="form-grid pay-form" data-pay-form="${c.id}"${tr ? ` data-transfer="${tr.id}"` : ''} novalidate>
      ${tr ? `<div class="pay-from full"><span><b>From the client’s transfer confirmation</b> <span data-no-i18n>${money(tr.amount)} · ${esc(PO.day(tr.date))}</span></span></div>` : ''}
      <p class="pay-step full"><b>1</b><span>How much arrived, and when</span></p>
      <label class="field"><span>Amount received</span><span class="money"><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal"${tr ? ` value="${Number(tr.amount).toFixed(2)}"` : ''}></span></label>
      <label class="field"><span>Date</span><input name="paidAt" type="date" value="${tr ? esc(tr.date) : iso}"></label>
      <label class="field"><span>Method</span><select name="method">${methods('').map(m => `<option value="${m}">${m}</option>`).join('')}</select></label>
      <label class="field"><span>Note <small>optional</small></span><input name="note" maxlength="500"${tr ? ` placeholder="Transfer confirmation #${tr.id}"` : ''}></label>
      <p class="pay-step full"><b>2</b><span>Which orders it pays</span></p>
      <div class="full">${poList(c.id, { checked: tr ? tr.orderIds || [] : [], amount: tr ? tr.amount : 0, credit: clientCredit(c) })}</div>
      <p class="pay-step full"><b>3</b><span>Receipt for the client <small>optional: you can also attach it later</small></span></p>
      ${receiptInput()}
      <div class="full pay-actions"><button class="btn btn-primary" type="submit">Record payment</button><button type="button" class="btn" data-pay-cancel>Cancel</button><p class="form-msg" data-pay-msg></p></div></form>`;
  }
  function attachForm(p) {
    const b = billing, copy = b ? [b.name, b.company, b.address, b.email, b.phone].filter(Boolean).join('\n') : '';
    return `<form class="form-grid pay-inline" data-receipt-form="${p.id}" novalidate>
      <p class="pay-step full"><b>${ic('doc')}</b><span>Send a receipt for this payment</span></p>
      <div class="full bill-to">${b ? `<div><small class="dim">Bill to</small><p><b data-no-i18n>${esc(b.name)}</b>${b.company ? ` · <span data-no-i18n>${esc(b.company)}</span>` : ''}</p><p data-no-i18n style="white-space:pre-line">${esc(b.address)}</p><p data-no-i18n>${[b.email, b.phone].filter(Boolean).map(esc).join(' · ')}</p></div><button type="button" class="btn btn-sm" data-copy="${esc(copy)}">${ic('copy')}Copy</button>` : '<p class="pay-warn" style="margin:0">No billing details yet. The client can add them on their Payments page, or you can add them in Billing details below.</p>'}</div>
      ${receiptInput(true)}
      <label class="field"><span>Receipt date</span><input name="invoiceDate" type="date" value="${dayInput(p.paidAt)}"></label>
      <p class="note full" style="margin:0">The client gets a notification and can download the receipt on their Payments page.</p>
      <div class="full pay-actions"><button class="btn btn-primary" type="submit">Send receipt to the client</button><button type="button" class="btn" data-receipt-cancel>Cancel</button><p class="form-msg" data-receipt-msg></p></div></form>`;
  }
  function editForm(p) {
    return `<form class="form-grid pay-inline" data-payment-edit-form="${p.id}" novalidate>
      <label class="field"><span>Amount received</span><span class="money"><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${Number(p.amount).toFixed(2)}"></span></label>
      <label class="field"><span>Date</span><input name="paidAt" type="date" value="${dayInput(p.paidAt)}"></label>
      <label class="field"><span>Method</span><select name="method">${methods(p.method).map(m => `<option value="${esc(m)}"${m === p.method ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <label class="field"><span>Note <small>optional</small></span><input name="note" maxlength="500" value="${esc(p.note)}"></label>
      <div class="field full"><span>Orders this payment is for <small>tick the orders the money is for</small></span>${poList(p.clientId, { paymentId: p.id, checked: p.orderIds || [], amount: p.amount })}</div>
      <div class="full pay-actions"><button class="btn btn-primary" type="submit">Save payment</button><button type="button" class="btn" data-pay-edit="${p.id}">Cancel</button><p class="form-msg" data-payment-edit-msg></p><span class="pay-spacer"></span><button type="button" class="btn btn-sm btn-danger" data-del-payment="${p.id}">Archive payment</button></div></form>`;
  }
  function paymentCard(c, p) {
    const files = receiptsOf(p), editing = S.drawer.payEdit === p.id, attaching = S.drawer.payAttach === p.id;
    const tr = p.confirmationId ? transferProofs.find(t => t.id === p.confirmationId) : null;
    return `<article class="card pay-card${p.archived ? ' archived' : ''}${editing || attaching ? ' open' : ''}" id="pay-${p.id}">
      <div class="pay-card-head"><div class="pay-main"><b class="pay-amt">${money(p.amount)}</b><small><span data-no-i18n>${esc(PO.day(p.paidAt))}</span> · <span>${esc(p.method) || '—'}</span>${p.note ? ` · <span data-no-i18n>${esc(p.note)}</span>` : ''}</small></div>
        <div class="pay-tools">${p.archived ? `<span class="tag">Archived</span><button type="button" class="btn btn-sm" data-restore-payment="${p.id}">Restore payment</button>` : `<button type="button" class="btn btn-sm" data-pay-edit="${p.id}">${ic('edit')}${editing ? 'Close' : 'Edit'}</button>`}</div></div>
      <div class="pay-line"><span class="pay-label">Orders</span><div>${PO.linked({ payment: p, orders: S.orders.filter(o => o.clientId === c.id), adjustments: balanceAdjustments, orderName, esc, admin: true })}</div></div>
      <div class="pay-line"><span class="pay-label">Receipt</span><div class="receipt-cell">${files.length ? files.map(f => `<div class="receipt-file">${ic('doc')}<a href="/api/portal/files/${f.id}" target="_blank" rel="noopener" data-no-i18n>${esc(f.filename)}</a><small class="dim"><span>Sent to the client</span> · <span data-no-i18n>${esc(PO.day(f.createdAt))}</span></small><button type="button" class="btn btn-sm btn-ghost" data-receipt-remove="${f.id}">Remove</button></div>`).join('') : '<span class="pay-tag unpaid">Not sent yet</span>'}${p.archived || attaching ? '' : `<button type="button" class="btn btn-sm${files.length ? '' : ' btn-primary'}" data-pay-attach="${p.id}">${ic(files.length ? 'plus' : 'doc')}${files.length ? 'Attach another file' : 'Attach receipt'}</button>`}</div></div>
      ${tr ? `<div class="pay-line"><span class="pay-label">Source</span><div><a href="/api/portal/files/${tr.id}${tr.mime.startsWith('image/') ? '?inline=1" data-photo="1' : ''}" target="_blank" rel="noopener">The client’s transfer confirmation</a></div></div>` : ''}
      ${attaching ? attachForm(p) : ''}${editing ? editForm(p) : ''}
    </article>`;
  }
  // Cancelled orders in the panel fold to one line with the count and the credit left (7 Nov 2026: shorter Payments tab).
  function cancelledFold(c) {
    const box = PO.cancelledBox(cancelledMoney, { admin: true, creditLeft: creditLeftC(c, cancelledMoney?.feesOwed), balance: c.outstanding }); if (!box) return '';
    const st = PO.cxSettle(cancelledMoney, creditLeftC(c, cancelledMoney?.feesOwed), c.outstanding), n = cancelledMoney.count;
    return `<details class="cx-fold" data-fold="cx"${foldOpen('cx') ? ' open' : ''}><summary class="card card-pad"><h3 class="sec-title">Cancelled orders</h3><span class="cx-fold-sum"><span>${n === 1 ? '1 order' : n + ' orders'}</span> · <span>Credit left</span> <b data-no-i18n>${money(st.leftC / 100)}</b>${st.feesOpen ? ' · <span class="neg">Fees owed</span>' : ''}</span>${UI.svg('<path d="m6 9 6 6 6-6"/>')}</summary>${box}</details>`;
  }
  function paymentsPane(c, iso) {
    const adding = S.drawer.payNew || pendingTransfer(), other = invoiceFiles.filter(f => !f.paymentId || !payments.some(p => p.id === f.paymentId));
    return `${paySummary(c)}${cancelledFold(c)}${transferProofHTML()}
      ${adding ? `<section class="card card-pad" data-pay-card><h3 class="sec-title">Record a payment</h3>${recordForm(c, iso)}</section>` : ''}
      <section class="pay-cards"><div class="pay-cards-head"><h3 class="sec-title">Payments <small>${payments.length}</small></h3>${payments.length > 1 ? sortPick('client-payments', window.DL.LIST_SORTS.payments) : ''}${adding ? '' : `<button type="button" class="btn btn-primary btn-sm" data-pay-new>${ic('plus')}Record a payment</button>`}</div>
        ${payments.length ? sortList(payments, 'client-payments', window.DL.LIST_SORTS.payments).map(p => paymentCard(c, p)).join('') : `<div class="card">${empty('No payments yet', 'Payments you record show up here and lower what the client owes.')}</div>`}</section>
      ${other.length ? `<section class="card card-pad"><h3 class="sec-title">Other receipts</h3>${adminInvoiceLinks(other)}</section>` : ''}
      ${billingHTML(c)}`;
  }

  // Account form: which existing orders also get the fee when it is saved, with how many orders each choice changes.
  function feeScopes(c) {
    const os = S.orders.filter(o => o.clientId === c.id && o.status !== 'cancelled' && !o.archived), n = st => os.filter(o => st.includes(o.status)).length;
    return [['new', 'New orders only', null], ['pending', 'New + Pending orders', n(['pending'])], ['processing', 'New + In progress orders', n(['processing'])],
      ['open', 'New + Pending + In progress orders', n(['pending', 'processing'])], ['all', 'All orders (also shipped and delivered)', os.length]];
  }
  function fillClient(c, soft) {
    const d = UI.getDrawer(), tab = S.drawer.tab, allOrders=S.orders.filter(o=>o.clientId===c.id),orders=allOrders.filter(o=>!S.drawer.storeId||o.storeId===S.drawer.storeId),stores=S.stores.filter(s=>s.clientId===c.id),products=S.products.filter(p=>p.clientId===c.id),stats=window.DLClientStoreMath.performance(stores,allOrders,balanceAdjustments,window.DLClientStoreMath.periodRange(S.period,S.from,S.to)||window.DLClientStoreMath.periodRange('month'));
    d.head.innerHTML = `<div class="who"><span class="ava" style="width:44px;height:44px;border-radius:14px;font-size:14px">${esc(initials(c.name))}</span><div><h2 style="font-size:20px">${esc(c.name)}</h2><small>@${esc(c.username)} · ${c.active ? 'active' : 'disabled'}</small></div></div>`;
    if (soft && [...d.body.querySelectorAll('[name=invoiceFile]')].some(f=>f.files.length)) return;
    if (soft && $('[data-reset-result] input', d.body)) return;
    if (soft && d.body.querySelector('[data-payment-edit-form]')) return;
    if (soft && d.body.querySelector('form[data-dirty] [data-po], form[data-admin-billing][data-dirty], [data-receipt-form]')) return;
    if (soft && d.body.contains(document.activeElement) && document.activeElement.matches('input,select,textarea')) return;
    const t = new Date(), iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    const pane = tab === 'orders'
      // Orders tab: the order list, with the store performance folded away (one line until opened).
      ? `<div class="list-tools">${stores.length > 1 ? `<label class="store-pick"><span>Store</span><select data-client-store>${[`<option value="0">All stores (${stores.length})</option>`, ...stores.map(s => `<option value="${s.id}"${S.drawer.storeId === s.id ? ' selected' : ''} data-no-i18n>${esc(s.name)}</option>`)].join('')}</select></label>` : ''}${orders.length > 1 ? sortPick('client-orders', ORDER_SORTS) : ''}${orders.length ? `<button type="button" class="btn btn-sm" data-excel-export="${c.id}" title="An Excel file with these orders, their prices and a Paid column (Yes / No)">${ic('doc')}Export to Excel</button>` : ''}</div>`
        + `<details class="card card-pad fold" data-fold="perf"${foldOpen('perf') ? ' open' : ''}><summary><h3 class="sec-title">Performance by store</h3><small class="dim">${S.drawer.storeId ? 'One store shown' : 'All stores'}</small></summary>${window.DLClientStoreUI.periodFields(S.period,S.from,S.to,window.DLClientStoreMath.monthsOf(allOrders))}${window.DLClientStoreUI.table(stats,'data-admin-select-store')}</details>`
        // One compact row per order (order number, customer and store; total and status on the right).
        + (orders.length ? `<section class="card ord-list">${firstRows(sortList(orders, 'client-orders', ORDER_SORTS), 'orders').map(o=>`<button type="button" class="ord-row" data-open-order="${o.id}" data-back="${c.id}"><span class="ord-main"><span class="ord-title"><b>${esc(orderName(o))}</b><span class="ord-date" data-no-i18n title="Order date">${esc(dayOf(o))}</span></span><small><span data-no-i18n>${esc(o.buyerName) || '—'}</span> · ${window.DLClientStoreUI.label(stores.find(s=>s.id===o.storeId))}</small></span><span class="ord-side"><b class="ord-amt">${money(o.price)}</b><span class="ord-pay">${PO.tag(o, balanceAdjustments)}</span><span class="ord-st">${UI.pill(o.status)}</span></span></button>`).join('')}${moreRows(orders.length, 'orders')}</section>` : empty('No orders yet', 'Orders this client adds show up here.'))
      : tab === 'stores'
        ? `<section class="card card-pad"><div class="sec-head"><h3 class="sec-title">My Stores</h3>${stores.length > 1 ? sortPick('client-stores', window.DL.LIST_SORTS.stores) : ''}</div>${stores.length ? sortList(stores, 'client-stores', window.DL.LIST_SORTS.stores).map(s=>`<details class="fold-row" data-keep="s${s.id}"><summary>${window.DLClientStoreUI.label(s)}</summary>${window.DLClientStoreUI.form(s,c.id)}</details>`).join('') : '<p class="muted">No stores yet.</p>'}<details class="fold-row" data-keep="s-new"><summary><b>+ Add store</b></summary>${window.DLClientStoreUI.form(null,c.id)}</details></section>`
      : tab === 'products' ? productsPane(products)
      : tab === 'payments' ? paymentsPane(c, iso)
        : tab === 'prices' ? savedPricesHTML(c)
        : tab === 'activity' ? activityHTML(c)
        : `<section class="card card-pad"><form class="form-grid" data-account-form="${c.id}" novalidate>
            <label class="field full"><span>Name</span><input name="name" maxlength="120" value="${esc(c.name)}"></label>
            <label class="field"><span>Fee per order <small>empty = default</small></span><span class="money"><input name="commissionPerOrder" type="number" min="0" step="0.01" value="${c.commissionPerOrder ?? ''}"></span></label>
            <label class="field full"><span>Use this fee for <small>when you save</small></span><select name="applyFeeTo">${feeScopes(c).map(([v, l, n]) => `<option value="${v}">${l}${n == null ? '' : ` (${n})`}</option>`).join('')}</select></label>
            <label class="field"><span>Status</span><select name="active"><option value="true"${c.active ? ' selected' : ''}>Active</option><option value="false"${c.active ? '' : ' selected'}>Disabled (can’t sign in)</option></select></label>
            <div class="field full"><span>Username <small>used to sign in, and as the payment reference</small></span><div style="display:flex;gap:8px;align-items:center"><input name="username" maxlength="60" autocomplete="off" data-no-i18n value="${esc(c.username)}" style="flex:1;min-width:0"><button type="button" class="btn btn-sm" data-copy="${esc(c.username)}">Copy</button></div><p><span>Last login:</span> ${c.lastLogin ? esc(fullDate(c.lastLogin)) : 'Never'}</p><p>${c.termsAccepted ? `<span>Terms accepted:</span> <time data-no-i18n>${esc(fullDate(c.termsAccepted.acceptedAt))} · v${c.termsAccepted.version}</time>` : 'Not accepted yet'}</p>${c.termsAccepted && c.termsRequired ? '<p class="note">Current terms not accepted yet.</p>' : ''}<button type="button" class="btn" data-reset-password="${c.id}">Reset password</button><div data-reset-result role="status"></div></div>
            <div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Save account</button><p class="form-msg" data-account-msg></p></div></form>
            <p class="note" style="margin-top:12px">New orders always get this client’s fee. To change orders already in the system, choose which ones above before saving: prices that come from the supplier’s cost (cost + fee) follow the new fee. Cancelled and archived orders never change.</p></section>
          ${subscriptionHTML(c)}
          <details class="card card-pad fold" data-keep="archive"><summary><h3 class="sec-title">Archive</h3></summary><p class="muted" style="margin:0 0 12px;font-size:14px">For test accounts or clients you no longer work with. It hides this client, their orders and payments from every list and total, and stops them signing in. Nothing is deleted, and you can restore them any time from the Clients tab.</p><button type="button" class="btn btn-danger" data-archive="${c.id}">Archive client</button></details>`;
    const group = groupOf(tab), subs = CLIENT_GROUPS.find(x => x[0] === group)[2], waiting = products.some(p => p.status === 'awaiting_quote');
    const subLabel = Object.fromEntries([['stores', `Stores (${stores.length})`], ['products', `Products (${products.length})`], ['payments', `Payments (${payments.length})`], ['prices', savedPrices ? `Saved prices (${savedPrices.length})` : 'Saved prices'], ['account', 'Details'], ['activity', 'Activity']]);
    // The 20-second refresh redraws the panel: keep open rows open.
    const keep = soft ? [...d.body.querySelectorAll('details[open][data-keep]')].map(x => x.dataset.keep) : [];
    d.body.innerHTML = `
      <div class="kpis">
        <div><span>Orders</span><b>${c.orders}</b></div>
        <div><span>Outstanding</span><b class="${c.outstanding > 0 ? 'neg' : ''}">${money(c.outstanding)}</b><small><span>Billed</span> ${money(c.billed)}</small><small><span>Without our fee</span> ${money(owedNoFee(c))}</small></div>
        <div><span>Paid</span><b class="pos">${money(c.paid)}</b></div>
        <div><span>Our earnings</span><b>${money(c.ourShare)}</b><small><span>Client’s profit</span> ${money(c.clientProfit)}</small></div></div>
      <div class="gtabs" role="tablist">${CLIENT_GROUPS.map(([g, label, secs]) => `<button type="button" role="tab" aria-selected="${group === g}" class="${group === g ? 'on' : ''}" data-ctab="${S.drawer.last?.[g] || secs[0]}">${label}${g === 'orders' ? ` <small>${orders.length}</small>` : ''}${g === 'shop' && waiting ? '<i class="tab-dot" title="Waiting for a price"></i>' : ''}</button>`).join('')}</div>
      ${subs.length > 1 ? `<div class="subtabs">${subs.map(k => `<button type="button" class="${tab === k ? 'on' : ''}" data-ctab="${k}">${subLabel[k]}${k === 'products' && waiting ? '<i class="tab-dot" title="Waiting for a price"></i>' : ''}</button>`).join('')}</div>` : ''}
      ${pane}`;
    keep.forEach(k => { const x = d.body.querySelector(`details[data-keep="${k}"]`); if (x) x.open = true; });
    window.DLEnhancePasswords?.(d.body);
    d.foot.innerHTML = `<button type="button" class="btn btn-primary" data-new-order="${c.id}">${ic('plus')}Add order for ${esc(c.name)}</button><a class="btn" href="/portal/?as=${c.id}&act=1" target="_blank" rel="noopener" data-login-as="${c.id}">${ic('ext')}Log in as client</a><a class="btn" href="/portal/?as=${c.id}" target="_blank" rel="noopener">See their portal</a>`;
  }

  // ---------- side panel: new / edit order ----------
  function openOrderForm(order, clientId) {
    const d = UI.getDrawer();
    closeChat();
    S.drawer = { kind: 'form', id: order?.id || null };
    d.onClose = () => { S.drawer = null; };
    d.open('f' + (order?.id || 'new'));
    const v2 = x => (x != null ? Number(x).toFixed(2) : '');
    const cid = order?.clientId || Number(clientId) || 0;
    d.head.innerHTML = `<h2>${order ? 'Edit order' : 'New order'}</h2><p>${order ? esc(clientName(order.clientId)) + ' · ' + esc(orderName(order)) : 'Add an order on a client’s behalf (e.g. one they sent on WhatsApp)'}</p>`;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: window.DL.displayTimeZone() });
    const currencies = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD'];
    if (order?.currency && !currencies.includes(order.currency)) currencies.push(order.currency);
    d.body.innerHTML = `<form id="order-form" class="af" novalidate>
      <section class="af-sec"><h3 class="form-sec"><i>1</i>Order</h3><div class="form-grid">
      <label class="field full"><span>Client</span><select name="clientId"${order ? ' disabled' : ''}><option value="">Choose a client…</option>${S.ov.clients.filter(c => c.active || c.id === cid).map(c => `<option value="${c.id}"${c.id === cid ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field full"><span>Store</span><select name="storeId" required></select></label>
      <label class="field"><span>Order number</span><input name="orderRef" maxlength="120" value="${esc(order?.orderRef)}" placeholder="e.g. Etsy #3412"></label>
      <label class="field"><span>Order date</span><input name="orderDate" type="date" value="${esc(order ? order.orderDate : today)}"></label>
      <label class="field"><span>Customer paid <small>on Etsy, optional</small></span><span class="money"><input name="sellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(order?.sellingPrice)}"></span></label>
      <label class="field"><span>Currency</span><select name="currency">${currencies.map(c => `<option${c === (order?.currency || 'USD') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>2</i>Item sold</h3><div class="form-grid">
      ${order ? '<p class="note full">Photos: add or remove them in the order panel.</p>' : `<div class="field full photo-field"><span>Product photos / screenshots <small data-pick-count></small></span>
        <div class="pm-photos pick-zone" data-picks></div>
        <p class="pick-hint">Optional. Add the screenshot the client sent, or a photo of the product (up to ${MAX_PICKS}). You can also drag pictures here or paste with Ctrl+V.</p></div>`}
      <div class="field full"><span>Product links <small>one per product</small></span><div class="link-list" data-links></div>
        <button type="button" class="btn btn-sm link-add" data-link-add>+ Add another product link</button></div>
      <label class="field"><span>Quantity</span><input name="quantity" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${order?.quantity || 1}"></label>
      <label class="field"><span>SKU or listing ID <small>optional</small></span><input name="sku" maxlength="120" placeholder="e.g. LIGHTER-01" value="${esc(order?.sku)}"></label>
      <label class="field full"><span>Variation / personalization <small>optional</small></span><textarea name="variant" rows="2" maxlength="2000" placeholder="Color, size, engraving or personalization">${esc(order?.variant)}</textarea></label>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>3</i>Customer &amp; delivery address</h3><div class="form-grid">
      <label class="field full"><span>Customer / recipient name</span><input name="buyerName" maxlength="160" value="${esc(order?.buyerName)}"></label>
      <label class="field full"><span>Full address and phone <small>street, city, state, postal code, phone</small></span><textarea name="address1" maxlength="2000" rows="3" placeholder="Paste the full delivery address and phone number here">${esc(UI.addressText(order))}</textarea></label>
      <label class="field"><span>Destination</span><select name="destination"></select></label>
      <label class="field" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" placeholder="e.g. Sweden"></label>
      <label class="field full"><span>Tax number <small>optional · e.g. Etsy’s IOSS number on the order</small></span><input name="taxNumber" maxlength="300" data-no-i18n value="${esc(order?.taxNumber)}"></label><label class="field full"><span>Gift message <small>optional</small></span><textarea name="giftMessage" maxlength="1000" rows="3" data-no-i18n>${esc(order?.giftMessage)}</textarea></label>
      </div></section>
      <details class="af-sec af-fold" data-af-fold="bill"${order && (order.trackingNumber || order.productCost != null || order.shippingFee != null || order.weightKg != null) ? ' open' : ''}><summary><h3 class="form-sec"><i>4</i>Shipping &amp; bill <small class="af-opt">optional · can be added later with “Bill this order”</small></h3></summary><div class="form-grid">
      <label class="field"><span>Tracking number</span><input name="trackingNumber" maxlength="120" value="${esc(order?.trackingNumber)}"></label>
      <label class="field"><span>Product type</span><select name="category">${categoryOptions(order?.category || 'general')}</select></label>
      <label class="field"><span>Weight (kg)</span><input name="weightKg" type="number" min="0" step="0.01" value="${order?.weightKg ?? ''}"></label>
      <label class="field"><span>Product cost <small>fee included</small></span><span class="money"><input name="productCost" type="number" min="0" step="0.01" value="${v2(order?.productCost)}"></span></label>
      <label class="field"><span>Shipping fee <small data-quote-hint></small></span><span class="money"><input name="price" type="number" min="0" step="0.01" value="${order ? (order.shippingFee != null ? v2(order.shippingFee) : order.productCost == null && Number(order.price) ? v2(order.price) : '') : ''}"></span></label>
      <div class="full money-rows" data-sum></div>
      </div></details>
      <details class="af-sec af-fold" data-af-fold="notes"${order?.notes ? ' open' : ''}><summary><h3 class="form-sec"><i>5</i>Notes <small class="af-opt">optional · the client sees these</small></h3></summary>
      <label class="field"><span>Notes <small>the client sees these</small></span><textarea name="notes" maxlength="2000">${esc(order?.notes)}</textarea></label>
      </details>
      </form>`;
    d.foot.innerHTML = `<button type="submit" form="order-form" class="btn btn-primary" data-submit>${order ? 'Save changes' : 'Add order'}</button><button type="button" class="btn btn-ghost" data-close-drawer>Cancel</button><p class="form-msg foot-msg" data-form-msg role="alert"></p>`;
    const f = $('#order-form'), dest = destinationPicker(f.destination, $('[data-other-country]', f));
    dest.set(order?.destination || '');
    const setStores=()=>{const clientId=Number(f.clientId.value),stores=S.stores.filter(s=>s.clientId===clientId&&(!s.archived||s.id===order?.storeId));f.storeId.innerHTML='<option value="">Choose a store</option>'+stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');f.storeId.value=String(order?.storeId||(stores.length===1?stores[0].id:''));};setStores();f.clientId.addEventListener('change',setStores);
    const msg = $('[data-form-msg]', d.foot), err = t => { msg.textContent = t; msg.className = 'form-msg foot-msg err'; };
    // ----- product links: one box per product -----
    const linkBox = $('[data-links]', f);
    const linkRow = (v = '') => `<div class="link-row"><input data-link type="url" inputmode="url" maxlength="2000" placeholder="https://www.etsy.com/listing/..." value="${esc(v)}"><button type="button" class="btn btn-sm btn-ghost" data-link-remove aria-label="Remove link">×</button></div>`;
    const startLinks = order?.productLinks?.length ? order.productLinks : String(order?.etsyUrl || '').split(/\s+/).filter(Boolean);
    linkBox.innerHTML = (startLinks.length ? startLinks : ['']).map(linkRow).join('');
    const syncLinks = () => { const rows = $$('.link-row', linkBox); rows.forEach(r => { r.querySelector('[data-link-remove]').hidden = rows.length < 2; }); $('[data-link-add]', f).hidden = rows.length >= 10; };
    syncLinks();
    // ----- photos (new order only; existing orders manage photos in the order panel) -----
    let picks = [], pickSeq = 0;
    const zone = $('[data-picks]', f);
    const renderPicks = () => {
      if (!zone) return;
      zone.innerHTML = picks.map(p => `<figure class="pm-photo"><img src="${p.thumb}" alt="Product photo"><button type="button" class="pm-remove" data-pick-remove="${p.key}" aria-label="Remove photo">×</button></figure>`).join('')
        + (picks.length < MAX_PICKS ? `<label class="pm-add${picks.length ? '' : ' big'}"><input type="file" accept="image/*" multiple hidden data-pick-input><span>+</span><small>${picks.length ? 'Add more' : 'Add photo or screenshot'}</small></label>` : '');
      $('[data-pick-count]', f).textContent = picks.length ? `${picks.length} of ${MAX_PICKS}` : 'optional';
    };
    async function addFiles(files) {
      const list = [...files].filter(x => /^image\//.test(x.type || ''));
      if (!list.length) return err('Please choose a photo or screenshot (JPG, PNG or WebP).');
      const room = MAX_PICKS - picks.length; if (room <= 0) return err(`You can add up to ${MAX_PICKS} photos.`);
      zone.classList.add('busy'); let failed = '';
      for (const file of list.slice(0, room)) { try { picks.push({ key: 'n' + (++pickSeq), ...(await shrinkImage(file)) }); renderPicks(); } catch (ex) { failed = ex.message; } }
      zone.classList.remove('busy');
      if (failed) err(failed); else if (list.length > room) err(`Only ${MAX_PICKS} photos fit on one order.`); else { msg.textContent = ''; msg.className = 'form-msg foot-msg'; }
    }
    if (zone) {
      zone.addEventListener('change', e => { if (e.target.matches('[data-pick-input]')) { addFiles(e.target.files); e.target.value = ''; } });
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
      f.addEventListener('paste', e => { const fl = [...(e.clipboardData?.files || [])]; if (fl.length) { e.preventDefault(); addFiles(fl); } });
      renderPicks();
    }
    let auto = null;
    const upd = () => {
      const q = quote({ country: dest.get(), category: f.category.value, weightKg: f.weightKg.value, divisor: divisor() });
      if (q && (f.price.value === '' || f.price.value === auto)) { f.price.value = q.total.toFixed(2); auto = f.price.value; }
      $('[data-quote-hint]').innerHTML = q ? (f.price.value === q.total.toFixed(2) ? 'from our rates' : `<button type="button" class="back" style="margin:0" data-use-quote="${q.total.toFixed(2)}">use ${money(q.total)}</button>`) : '';
      const pc = parseFloat(f.productCost.value), sh = parseFloat(f.price.value), sp = parseFloat(f.sellingPrice.value), tot = (pc || 0) + (sh || 0), billed = Number.isFinite(pc) || Number.isFinite(sh);
      $('[data-sum]').innerHTML = `<div class="total"><span>Client pays</span><span>${billed ? money(tot) : 'not billed yet'}</span></div>${billed && Number.isFinite(sp) ? `<div><span>Client’s profit</span><span class="${sp - tot >= 0 ? 'pos' : 'neg'}">${money(sp - tot)}</span></div>` : ''}`;
    };
    f.addEventListener('input', e => { if (e.target.name === 'price') auto = null; if (msg.classList.contains('err')) { msg.textContent = ''; msg.className = 'form-msg foot-msg'; } upd(); });
    f.addEventListener('change', upd);
    f.addEventListener('click', e => {
      const u = e.target.closest('[data-use-quote]'); if (u) { f.price.value = u.dataset.useQuote; auto = f.price.value; upd(); }
      if (e.target.closest('[data-link-add]')) { linkBox.insertAdjacentHTML('beforeend', linkRow()); syncLinks(); $$('[data-link]', linkBox).pop().focus(); }
      const rm = e.target.closest('[data-link-remove]'); if (rm) { rm.closest('.link-row').remove(); syncLinks(); }
      const pr = e.target.closest('[data-pick-remove]'); if (pr) { picks = picks.filter(x => x.key !== pr.dataset.pickRemove); renderPicks(); }
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if(!f.storeId.value)return err('Choose a store.');
      if (!order && !f.clientId.value) return err('Please choose the client.');
      if (!f.buyerName.value.trim() || !f.address1.value.trim()) return err('Please fill in the customer name and full address.');
      if (!dest.get()) return err('Please choose a country.');
      if (dest.isOther() && !dest.get()) return err('Please type the country name.');
      $$('[data-link]', f).forEach(i => { i.value = window.DL.fullLink(i.value); });
      const linkInputs = $$('[data-link]', f), links = linkInputs.map(i => i.value.trim()).filter(Boolean);
      const badLink = linkInputs.find(i => i.value.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(i.value.trim()));
      if (badLink) { badLink.focus(); return err('Please paste each product link in full, starting with https://'); }
      const qty = parseInt(f.quantity.value, 10);
      if (!(qty >= 1 && qty <= 10000)) return err('Quantity must be between 1 and 10,000.');
      const body = { storeId:Number(f.storeId.value),clientId: order ? order.clientId : Number(f.clientId.value), orderRef: f.orderRef.value, orderDate: f.orderDate.value, currency: f.currency.value,
        sellingPrice: f.sellingPrice.value === '' ? null : f.sellingPrice.value,
        etsyUrl: links.join('\n'), quantity: qty, sku: f.sku.value, variant: f.variant.value,
        buyerName: f.buyerName.value, ...UI.addressFields(f.address1.value,order), taxNumber: f.taxNumber.value, giftMessage: f.giftMessage.value,
        trackingNumber: f.trackingNumber.value, destination: dest.get(), category: f.category.value,
        weightKg: f.weightKg.value === '' ? null : f.weightKg.value, productCost: f.productCost.value === '' ? null : f.productCost.value, shippingFee: f.price.value === '' ? null : f.price.value,
        notes: f.notes.value };
      const btn = $('[data-submit]'); btn.disabled = true; msg.textContent = ''; msg.className = 'form-msg foot-msg';
      const photoBody = p => ({ data: p.data, thumb: p.thumb, width: p.width, height: p.height });
      let r;
      try {
        r = order ? await api('/orders/' + order.id, { method: 'PUT', body }) : await api('/orders', { method: 'POST', body: { ...body, photos: picks.slice(0, 1).map(photoBody), ...(f.dataset.dupOk ? { confirmDuplicate: true } : {}) } });
      } catch (ex) {
        btn.disabled = false;
        // A possible duplicate (2 Nov 2026): say which order, and the next Save sends it anyway.
        if (!order && ex.data?.duplicate) { f.dataset.dupOk = '1'; return err(`${ex.message} (${ex.data.duplicate.ref}) Save again to send it anyway.`); }
        return err(ex.message);
      }
      // Saved. Upload the other photos one by one (keeps each request small).
      let failed = 0;
      for (const [i, p] of picks.slice(1).entries()) {
        msg.textContent = `Uploading photos… ${i + 1} of ${picks.length - 1}`;
        try { await api(`/orders/${r.order.id}/photos`, { method: 'POST', body: photoBody(p) }); } catch (ex) { failed++; }
      }
      await loadAll(); renderList();
      toast(failed ? `Order saved, but ${failed} photo${failed > 1 ? 's' : ''} didn’t upload. Add them in the order panel.` : order ? 'Order updated.' : 'Order added.');
      openOrder(r.order.id);
    });
    upd();
    if (!order) setTimeout(() => f.clientId.value ? f.orderRef.focus({ preventScroll: true }) : f.clientId.focus({ preventScroll: true }), 60);
  }

  // ---------- side panel: add account ----------
  function openAddAccount(role = 'client') {
    const d = UI.getDrawer();
    closeChat();
    S.drawer = { kind: 'account' };
    d.onClose = () => { S.drawer = null; };
    d.open('a');
    d.head.innerHTML = `<h2 data-acc-title>${role === 'admin' ? 'Add an admin' : 'Add a client'}</h2><p>Share the username and password with them privately.</p>`;
    d.body.innerHTML = `<form class="form-grid" id="user-form" novalidate>
      <label class="field full"><span>Account type</span><select name="role"><option value="client"${role === 'client' ? ' selected' : ''}>Client (their own portal)</option><option value="admin"${role === 'admin' ? ' selected' : ''}>Admin (full access)</option></select></label>
      <label class="field full"><span>Name</span><input name="name" maxlength="120"></label>
      <label class="field"><span>Username</span><input name="username" maxlength="60" autocomplete="off" placeholder="letters, numbers, . _ - @"></label>
      <label class="field"><span>Password <small>8+ characters</small></span><input name="password" type="password" autocomplete="new-password"></label>
      <label class="field full" data-cpo><span>Fee per order <small>empty = default (${money(S.ov.settings.commission_per_order)})</small></span><span class="money"><input name="commissionPerOrder" type="number" min="0" step="0.01"></span></label>
      <p class="form-msg full" data-user-msg></p></form>
      <p class="note" data-signin-note></p>`;
    window.DLEnhancePasswords?.(d.body);
    d.foot.innerHTML = '<button type="submit" form="user-form" class="btn btn-primary">Create account</button><button type="button" class="btn btn-ghost" data-close-drawer>Cancel</button>';
    const f = $('#user-form');
    const sync = () => {
      const admin = f.role.value === 'admin';
      $('[data-cpo]').hidden = admin;
      $('[data-acc-title]').textContent = admin ? 'Add an admin' : 'Add a client';
      f.name.placeholder = admin ? 'Team member’s name' : 'Client or store name';
      // Admins sign in on the main dashboard; clients on their portal. (The admin app runs inside the dashboard.)
      $('[data-signin-note]').innerHTML = admin
        ? `They sign in at <b>${esc(location.origin)}/</b> and get full access to the dashboard.`
        : `They sign in at <b>${esc(location.origin)}/portal/</b>. Their free month starts today (${esc(fmtDay(new Date().toLocaleDateString('en-CA', { timeZone: window.DL.displayTimeZone() })))}).`;
    };
    f.role.addEventListener('change', sync); sync();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-user-msg]');
      try {
        await api('/admin/users', { method: 'POST', body: { role: f.role.value, name: f.name.value, username: f.username.value.trim(), password: f.password.value, commissionPerOrder: f.commissionPerOrder.value === '' ? null : f.commissionPerOrder.value } });
        m.textContent = `Account “${f.username.value.trim()}” created.`; m.className = 'form-msg full ok';
        tell({ type: 'dl-clients-changed' });
        f.reset(); sync();
        await loadAll(); renderList();
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; }
    });
    setTimeout(() => f.name.focus({ preventScroll: true }), 60);
  }

  function refreshDrawer() {
    const s = S.drawer; if (!s) return;
    if (s.kind === 'order') { const o = [...S.orders,...S.archivedOrders].find(x => x.id === s.id); if (o) fillOrder(o, true); }
    if (s.kind === 'client') { const c = clientOf(s.id); if (c) fillClient(c, true); }
  }

  document.addEventListener('input',e=>{const bf=e.target.closest?.('[data-admin-billing]');if(bf)bf.dataset.dirty='1';if(e.target.name==='color'){const f=e.target.closest('[data-client-store-form]');if(f)f.dataset.colourEdited='1';}});
  document.addEventListener('change',async e=>{
    if(e.target.matches('[data-move-order]')){const f=e.target;f.disabled=true;try{await api('/orders/'+f.dataset.moveOrder,{method:'PUT',body:{storeId:Number(f.value)}});await loadAll();renderList();refreshDrawer();toast('Order moved to store.');}catch(ex){toast(ex.message);f.disabled=false;}}
    const p=e.target.closest('[data-period-form]');if(p&&S.drawer?.kind==='client'){S.period=p.period.value;if(p.from)S.from=p.from.value;if(p.to)S.to=p.to.value;if(e.target.name==='period'||window.DLClientStoreMath.periodRange('custom',S.from,S.to)){document.activeElement?.blur();fillClient(clientOf(S.drawer.id));}}
  });
  document.addEventListener('submit',e=>{if(e.target.matches('[data-period-form]'))e.preventDefault();});
  // ---------- events ----------
  async function setStatus(id, status, el) {
    if (el) el.disabled = true;
    try { await api('/orders/' + id, { method: 'PUT', body: { status } }); await loadAll(); renderList(); refreshDrawer(); toast(`Status set to ${UI.LABEL[status]}. The client sees it right away.`); }
    catch (ex) { toast(ex.message); if (el) el.disabled = false; }
  }
  function onClick(e) {
    const t = e.target;
    if (cardWindowClick(t)) return;
    const st=t.closest('[data-admin-select-store]');if(st&&S.drawer?.kind==='client'){S.drawer.storeId=Number(st.dataset.adminSelectStore);fillClient(clientOf(S.drawer.id));return;}
    const cf=t.closest('[data-claim-filter]');if(cf){S.claimFilter=cf.dataset.claimFilter;renderClaims();return;}
    const pf=t.closest('[data-pq-filter]');if(pf){S.pqFilter=pf.dataset.pqFilter;renderProducts();return;}
    const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const gt = t.closest('[data-go-tab]'); if (gt) { S.tab = gt.dataset.goTab; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const gf = t.closest('[data-go-filter]'); if (gf) { S.filter = gf.dataset.goFilter; S.tab = 'orders'; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const f = t.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; renderOrders(); return; }
    if (t.closest('[data-cx-all]')) { S.cxAll = true; renderClients(); return; }
    const lm = t.closest('[data-list-more]'); if (lm) { const k = lm.dataset.listMore; S.shown[k].n += LIST_PAGE[k]; (k === 'orders' ? renderOrders : renderClients)(); return; }
    const ea=t.closest('[data-edit-admin]');
    if(ea){
      const x=S.ov.admins.find(a=>a.id===Number(ea.dataset.editAdmin)),row=ea.parentElement;if(!x)return;
      if(row.nextElementSibling?.matches('[data-admin-form]')){row.nextElementSibling.remove();return;}
      row.insertAdjacentHTML('afterend',`<form class="form-grid" data-admin-form="${x.id}" novalidate style="padding:12px;border:1px solid var(--line);border-radius:12px">
        <label class="field"><span>Name</span><input name="name" maxlength="120" value="${esc(x.name)}"></label>
        <label class="field"><span>Username</span><input name="username" maxlength="60" autocomplete="off" data-no-i18n value="${esc(x.username)}"></label>
        <label class="field"><span>Status</span><select name="active"><option value="true"${x.active?' selected':''}>Active</option><option value="false"${x.active?'':' selected'}>Disabled (can’t sign in)</option></select></label>
        <label class="field"><span>New password <small>leave empty to keep the current one</small></span><input name="password" type="password" maxlength="128" autocomplete="new-password"></label>
        <p class="note full" style="margin:0">A disabled admin can’t sign in again. If they are signed in right now, they stay signed in until that session ends.</p>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save admin</button><button type="button" class="btn" data-admin-cancel>Cancel</button><p class="form-msg" data-admin-msg style="margin:0"></p></div></form>`);
      row.nextElementSibling.querySelector('[name=name]').focus();return;
    }
    if(t.closest('[data-admin-cancel]')){t.closest('[data-admin-form]').remove();return;}
    const acc = t.closest('[data-add-account]'); if (acc) { openAddAccount(acc.dataset.addAccount); return; }
    const no = t.closest('[data-new-order]'); if (no) { openOrderForm(null, no.dataset.newOrder); return; }
    const rs = t.closest('[data-restore]');
    if (rs) { setArchived(Number(rs.dataset.restore), false, rs); return; }
    const bk = t.closest('[data-bulk]'); if (bk) { runBulk(bk.dataset.bulk, bk); return; }
    if (t.closest('select') || t.closest('[data-bulk-bar]') || t.closest('td.pick, th.pick')) return;
    const oc = t.closest('[data-open-client]'); if (oc) { openClient(oc.dataset.openClient, oc.dataset.clientTab || 'orders'); return; }
    const oo = t.closest('[data-open-order]'); if (oo) openOrder(oo.dataset.openOrder);
  }
  async function setArchived(id, archived, el) {
    if (el) el.disabled = true;
    try {
      await api('/admin/users/' + id, { method: 'POST', body: { archived } });
      tell({ type: 'dl-clients-changed' });
      if (archived) UI.getDrawer().close();
      await loadAll(); renderList();
      toast(archived ? 'Client archived. Their orders and payments no longer count in the totals.' : 'Client restored.');
    } catch (ex) { toast(ex.message); if (el) el.disabled = false; }
  }
  function onInput(e) {
    if (e.target.matches('[data-q]')) { S.q = e.target.value; renderOrders(); }
    if (e.target.matches('[data-cq]')) { S.cq = e.target.value; renderClients(); }
  }
  function onChange(e) {
    if (e.target.matches('[data-client-filter]')) { S.client = e.target.value; renderOrders(); }
    if (e.target.matches('[data-status]')) setStatus(e.target.dataset.status, e.target.value, e.target);
    if (e.target.matches('[data-pick]')) { const id = Number(e.target.dataset.pick); if (e.target.checked) S.picked.add(id); else S.picked.delete(id); renderOrders(); }
    if (e.target.matches('[data-pick-all]')) { $$('[data-pick]').forEach(c => { const id = Number(c.dataset.pick); if (e.target.checked) S.picked.add(id); else S.picked.delete(id); }); renderOrders(); }
  }
  // Client products rows: keep what the admin opened or closed (toggle doesn't bubble, so listen in the capture phase).
  document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('[data-pq]')) S.pqOpen[d.dataset.pq] = d.open; else if (d.matches?.('[data-cl]')) S.clOpen[d.dataset.cl] = d.open; }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const row = e.target.closest?.('tr[data-open-order], tr[data-open-client]');
    if (row) { if (row.dataset.openOrder) openOrder(row.dataset.openOrder); else openClient(row.dataset.openClient, row.dataset.clientTab || 'orders'); }
  });
  // Admins can add product photos to an order (e.g. when a client sends them on WhatsApp).
  document.addEventListener('change', async e => {
    const inp = e.target.closest?.('[data-photo-add]'); if (!inp) return;
    const id = Number(inp.dataset.photoAdd), item = Number(inp.dataset.photoItem) || null, files = [...inp.files].slice(0, item ? 1 : 8); inp.value = '';
    if (!files.length) return;
    const box = inp.closest('.pm-add'); box?.classList.add('busy');
    let added = 0, err = '';
    // A "Photo per variation" box adds the photo of that line (#1, #2…).
    for (const f of files) {
      try { await api(`/orders/${id}/photos`, { method: 'POST', body: { ...(await shrinkImage(f)), item } }); added++; }
      catch (ex) { err = ex.message; }
    }
    await loadAll(); renderList(); refreshDrawer();
    toast(added ? `${added} photo${added > 1 ? 's' : ''} added.` + (err ? ' ' + err : '') : err || 'No photo added.');
  });
  // Clicks inside the side panel (it lives outside #app), plus copy buttons anywhere.
  document.addEventListener('click', async e => {
    const t = e.target, d = UI.getDrawer();
    const reset = t.closest('[data-reset-password]');
    if (reset) {
      reset.disabled = true;
      const result = $('[data-reset-result]'); result.textContent = '';
      api('/admin/users/' + reset.dataset.resetPassword + '/reset-password', { method: 'POST' }).then(r => {
        result.innerHTML = `<p>Temporary password — shown only here. Copy and share it privately.</p><div class="copy-line"><input type="text" readonly data-no-i18n value="${esc(r.temporaryPassword)}" aria-label="Temporary password"><button type="button" class="btn btn-sm" data-copy="${esc(r.temporaryPassword)}">Copy</button></div><p>The client must choose a new password at next login.</p>`;
      }).catch(ex => { result.textContent = ex.message; reset.disabled = false; });
      return;
    }

    const cp = t.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Copied.'); } catch (ex) { /* no clipboard */ } return; }
    if (!d.el.contains(t)) return;
    if (t.closest('[data-close-drawer]')) { d.close(); return; }
    if (t.closest('[data-back]') && S.drawer?.back) { openClient(S.drawer.back); return; }
    const pr = t.closest('[data-photo-remove]');
    if (pr) {
      if (!pr.dataset.armed) { pr.dataset.armed = '1'; pr.classList.add('confirm'); pr.textContent = 'Remove?'; setTimeout(() => { if (pr.isConnected) { delete pr.dataset.armed; pr.classList.remove('confirm'); pr.textContent = '×'; } }, 4000); return; }
      pr.disabled = true;
      try { await api(`/orders/${pr.dataset.order}/photos/${pr.dataset.photoRemove}/delete`, { method: 'POST' }); await loadAll(); renderList(); refreshDrawer(); toast('Photo removed.'); }
      catch (ex) { pr.disabled = false; toast(ex.message); }
      return;
    }
    // Money > Payments: which card is open (record / edit / attach a receipt) is kept on the drawer state.
    const pa = t.closest('[data-pay-new],[data-pay-cancel],[data-pay-edit],[data-pay-attach],[data-receipt-cancel],[data-scroll-pay]');
    if (pa && S.drawer?.kind === 'client') {
      const d = S.drawer;
      if (pa.hasAttribute('data-scroll-pay')) { document.getElementById(pa.dataset.scrollPay)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (pa.hasAttribute('data-pay-new')) { d.payNew = true; delete d.payEdit; delete d.payAttach; }
      else if (pa.hasAttribute('data-pay-cancel')) { delete d.payNew; delete d.transferId; }
      else if (pa.hasAttribute('data-pay-edit')) { const id = Number(pa.dataset.payEdit); if (d.payEdit === id) delete d.payEdit; else d.payEdit = id; delete d.payAttach; }
      else if (pa.hasAttribute('data-pay-attach')) { d.payAttach = Number(pa.dataset.payAttach); delete d.payEdit; }
      else delete d.payAttach;
      fillClient(clientOf(d.id), false);
      const go = d.payAttach || d.payEdit ? '#pay-' + (d.payAttach || d.payEdit) : d.payNew ? '[data-pay-card]' : null;
      if (go) setTimeout(() => $(go)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    }
    // Refunds (cancelled orders box): Undo archives the refund after a second click.
    const ru = t.closest('[data-refund-undo]');
    if (ru) {
      if (!ru.dataset.armed) { ru.dataset.armed = '1'; ru.textContent = 'Click again to undo'; setTimeout(() => { if (ru.isConnected) { delete ru.dataset.armed; ru.textContent = 'Undo'; } }, 4000); return; }
      if (ru.disabled) return; ru.disabled = true;
      try { await api('/admin/refunds/' + ru.dataset.refundUndo + '/archive', { method: 'POST' }); await loadAll(); await loadPayments(S.drawer.id); fillClient(clientOf(S.drawer.id), false); toast('Refund undone.'); }
      catch (ex) { toast(ex.message); ru.disabled = false; }
      return;
    }
    const rr = t.closest('[data-receipt-remove]');
    if (rr) {
      if (!rr.dataset.armed) { rr.dataset.armed = '1'; rr.textContent = 'Click again to remove'; setTimeout(() => { if (rr.isConnected) { delete rr.dataset.armed; rr.textContent = 'Remove'; } }, 4000); return; }
      if (rr.disabled) return; rr.disabled = true;
      try { await api('/admin/invoices/' + rr.dataset.receiptRemove + '/archive', { method: 'POST' }); await loadPayments(S.drawer.id); fillClient(clientOf(S.drawer.id), false); toast('Receipt removed. The client no longer sees it.'); }
      catch (ex) { toast(ex.message); rr.disabled = false; }
      return;
    }
    // "Cancelled" in the status row and "Approve cancellation…" open the cancel window (fees per order, 8 Nov 2026).
    const cw=t.closest('[data-cancel-window]');if(cw){openCancelWindow([Number(cw.dataset.cancelWindow)]);return;}
    // Cost revision: keep the price (with the optional reply).
    const rkp=t.closest('[data-rev-keep-product]');if(rkp){const f=rkp.closest('form');rkp.disabled=true;try{await api('/admin/products/'+rkp.dataset.revKeepProduct+'/cost-revision',{method:'POST',body:{action:'keep',reply:f.revReply.value}});await loadAll();renderTab();toast('Price kept. The client was told.');}catch(ex){rkp.disabled=false;toast(ex.message);}return;}
    const rk=t.closest('[data-rev-keep]');if(rk){const f=rk.closest('form');rk.disabled=true;try{await api('/admin/orders/'+rk.dataset.revKeep+'/cost-revision',{method:'POST',body:{action:'keep',reply:f.reply.value}});await loadAll();renderList();refreshDrawer();toast('Price kept. The client was told.');}catch(ex){rk.disabled=false;toast(ex.message);}return;}
    const uc=t.closest('[data-undo-cancel]');
    if(uc){uc.disabled=true;try{await api('/orders/'+uc.dataset.undoCancel+'/undo-cancellation',{method:'POST',body:{}});await loadAll();renderList();refreshDrawer();toast('Back to the cancellation request.');}catch(ex){uc.disabled=false;toast(ex.message);}return;}
    const decision=t.closest('[data-cancel-decision]');
    if(decision){decision.disabled=true;try{await api('/orders/'+decision.dataset.id+'/'+decision.dataset.cancelDecision+'-cancellation',{method:'POST',body:{}});await loadAll();renderList();refreshDrawer();toast('Cancellation request updated.');}catch(ex){decision.disabled=false;toast(ex.message);}return;}
    const tracking=t.closest('[data-tracking-update]');if(tracking){tracking.disabled=true;try{await api('/admin/orders/'+tracking.dataset.trackingUpdate+'/tracking-update',{method:'POST',body:{}});await loadAll();refreshDrawer();toast('Tracking update recorded.');}catch(ex){tracking.disabled=false;toast(ex.message);}return;}
    const ss = t.closest('[data-set-status]'); if (ss) { if (!ss.classList.contains('on')) setStatus(ss.dataset.id, ss.dataset.setStatus, ss); return; }
    const eo = t.closest('[data-edit-order]'); if (eo) { openOrderForm(S.orders.find(o => o.id === Number(eo.dataset.editOrder))); return; }
    const no = t.closest('[data-new-order]'); if (no) { openOrderForm(null, no.dataset.newOrder); return; }
    const oc = t.closest('[data-open-client]'); if (oc) { openClient(oc.dataset.openClient, oc.dataset.clientTab || 'orders'); return; }
    const oo = t.closest('[data-open-order]'); if (oo) { openOrder(oo.dataset.openOrder, null, oo.dataset.back ? Number(oo.dataset.back) : null); return; }
    const ct = t.closest('[data-ctab]'); if (ct) { S.drawer.tab = ct.dataset.ctab; S.drawer.last = { ...S.drawer.last, [groupOf(ct.dataset.ctab)]: ct.dataset.ctab }; fillClient(clientOf(S.drawer.id)); if (ct.dataset.ctab==='payments') await loadPayments(S.drawer.id); if (ct.dataset.ctab==='prices') await loadSavedPrices(S.drawer.id); if (ct.dataset.ctab==='activity') await loadActivity(S.drawer.id); return; }
    const pm = t.closest('[data-panel-more]'); if (pm && S.drawer?.kind === 'client') { const k = pm.dataset.panelMore; (S.drawer.more ||= {})[k] = (S.drawer.more[k] || 20) + 20; fillClient(clientOf(S.drawer.id)); return; }
    const fp = t.closest('[data-forget-price]');
    if (fp) {
      if (!fp.dataset.armed) { fp.dataset.armed = '1'; fp.textContent = 'Click again to forget'; setTimeout(() => { if (fp.isConnected) { delete fp.dataset.armed; fp.textContent = 'Forget'; } }, 4000); return; }
      fp.disabled = true;
      try { await api('/admin/saved-prices/' + fp.dataset.forgetPrice + '/forget', { method: 'POST', body: {} }); toast('Saved price forgotten. The next order like this is priced by the supplier again.'); await loadSavedPrices(S.drawer.id); }
      catch (ex) { toast(ex.message); fp.disabled = false; }
      return;
    }
    const ao = t.closest('[data-archive-order],[data-restore-order]');
    if (ao) {
      const archived = !!ao.dataset.archiveOrder, id = Number(ao.dataset.archiveOrder || ao.dataset.restoreOrder);
      if (archived && !ao.dataset.armed) { ao.dataset.armed='1';ao.textContent='Click again to archive';setTimeout(()=>{if(ao.isConnected){delete ao.dataset.armed;ao.textContent='Archive order';}},4000);return; }
      ao.disabled=true;
      try { await api('/admin/orders/'+id+'/archive',{method:'POST',body:{archived}});UI.getDrawer().close();await loadAll();renderList();tell({type:'dl-clients-changed'});toast(archived ? 'Order archived. Billing history is preserved.' : 'Order restored.'); }
      catch(ex){toast(ex.message);ao.disabled=false;}
      return;
    }
    const caf = t.closest('[data-clear-addr-flag]');
    if (caf) {
      caf.disabled = true;
      try { await api('/orders/' + caf.dataset.clearAddrFlag, { method: 'PUT', body: { clearAddressFlag: true } }); await loadAll(); refreshDrawer(); toast('Address warning cleared.'); }
      catch (ex) { toast(ex.message); caf.disabled = false; }
      return;
    }
    const ar = t.closest('[data-archive]');
    if (ar) {
      if (!ar.dataset.armed) { ar.dataset.armed = '1'; ar.textContent = 'Click again to archive'; setTimeout(() => { if (ar.isConnected) { delete ar.dataset.armed; ar.textContent = 'Archive client'; } }, 4000); return; }
      setArchived(Number(ar.dataset.archive), true, ar); return;
    }
    const record=t.closest('[data-record-transfer]'), restore=t.closest('[data-restore-payment]'), rmTr=t.closest('[data-remove-transfer]');
    if (rmTr) {
      if (!confirm('Remove this transfer confirmation? Use it for one sent twice or by mistake. No payment is recorded.')) return;
      rmTr.disabled=true;
      try { await api('/admin/transfers/'+rmTr.dataset.removeTransfer+'/remove',{method:'POST'}); await loadAll();renderList();await loadPayments(S.drawer.id);toast('Transfer confirmation removed.'); }
      catch(ex) {toast(ex.message);rmTr.disabled=false;} return;
    }
    if (record) { S.drawer.transferId=Number(record.dataset.recordTransfer); delete S.drawer.payEdit; delete S.drawer.payAttach; fillClient(clientOf(S.drawer.id), false); setTimeout(()=>$('[data-pay-card]')?.scrollIntoView({behavior:'smooth',block:'start'}),50); return; }
    if (restore) {
      const b=restore;b.disabled=true;
      try { const r=await api('/admin/payments/'+restore.dataset.restorePayment+'/restore',{method:'POST'}); await loadAll();renderList();await loadPayments(S.drawer.id);toast(r.dropped ? `Payment restored. ${r.dropped} of its orders were already paid by another payment and were taken off it.` : 'Payment restored.'); }
      catch(ex) {toast(ex.message);b.disabled=false;} return;
    }
    const dp = t.closest('[data-del-payment]');
    if (dp) {
      if (!dp.dataset.armed) { dp.dataset.armed = '1'; dp.textContent = 'Click again to archive'; setTimeout(() => { if (dp.isConnected) { delete dp.dataset.armed; dp.textContent = 'Archive payment'; } }, 4000); return; }
      if (dp.disabled) return; dp.disabled = true;
      try { await api('/admin/payments/' + dp.dataset.delPayment + '/delete', { method: 'POST' }); await loadAll(); renderList(); await loadPayments(S.drawer.id); toast('Payment archived.'); }
      catch (ex) { toast(ex.message); dp.disabled = false; }
    }
  });
  document.addEventListener('submit', async e => {
    // Cost revision: approve the new supplier cost (bill = cost + our fee); the client is told.
    const ra = e.target.closest('[data-rev-answer]');
    if (ra) { e.preventDefault(); const b = $('[type=submit]', ra), cost = ra.cost.value; if (cost === '' || !(Number(cost) >= 0)) { toast('Enter the new supplier cost.'); ra.cost.focus(); return; } b.disabled = true;
      try { await api('/admin/orders/' + ra.dataset.revAnswer + '/cost-revision', { method: 'POST', body: { action: 'approve', cost: Number(cost), reply: ra.reply.value } }); await loadAll(); renderList(); refreshDrawer(); toast('New cost approved. The client was told.'); } catch (ex) { b.disabled = false; toast(ex.message); } return; }
    const pe = e.target.closest('[data-payment-edit-form]');
    if (pe) {
      e.preventDefault();
      const b = $('[type=submit]', pe), m = $('[data-payment-edit-msg]', pe); if (b.disabled) return; b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      const p = payments.find(x => x.id === Number(pe.dataset.paymentEditForm)), listed = new Set([...pe.querySelectorAll('[name=poOrder]')].map(i => Number(i.value)));
      const orderIds = [...PO.picked(pe), ...(p?.orderIds || []).filter(id => !listed.has(id))];
      try { await api('/admin/payments/' + pe.dataset.paymentEditForm, { method: 'POST', body: { amount: pe.amount.value, paidAt: pe.paidAt.value, method: pe.method.value, note: pe.note.value, orderIds } }); delete S.drawer.payEdit; document.activeElement?.blur(); await loadAll(); renderList(); await loadPayments(S.drawer.id); fillClient(clientOf(S.drawer.id), false); toast('Payment updated.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const adf = e.target.closest('[data-admin-form]');
    if (adf) {
      e.preventDefault();
      const b = $('[type=submit]', adf), m = $('[data-admin-msg]', adf); if (b.disabled) return; m.textContent = ''; m.className = 'form-msg';
      if (adf.password.value && adf.password.value.length < 8) { m.textContent = 'Password must be at least 8 characters'; m.className = 'form-msg err'; return; }
      b.disabled = true;
      try { await api('/admin/users/' + adf.dataset.adminForm, { method: 'POST', body: { name: adf.name.value, username: adf.username.value.trim(), active: adf.active.value === 'true', ...(adf.password.value ? { password: adf.password.value } : {}) } }); adf.remove(); document.activeElement?.blur(); await loadAll(); renderList(); toast('Admin saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const ff = e.target.closest('[data-fees-form]');
    if (ff) {
      e.preventDefault();
      const b = $('[type=submit]', ff), m = $('[data-fees-msg]', ff); if (b.disabled) return; b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      try { await api('/orders/' + ff.dataset.feesForm, { method: 'PUT', body: { commission: ff.commission.value } }); document.activeElement?.blur(); await loadAll(); renderKpis(); renderList(); refreshDrawer(); toast('Fee saved for this order.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const tf = e.target.closest('[data-track-form]');
    if (tf) {
      e.preventDefault();
      const b = $('[type=submit]', tf); if (b.disabled) return; b.disabled = true;
      try { await api('/orders/' + tf.dataset.trackForm, { method: 'PUT', body: { trackingNumber: tf.trackingNumber.value, courier: tf.courier.value } }); document.activeElement?.blur(); await loadAll(); renderList(); refreshDrawer(); toast('Tracking saved. The client can see it now.'); }
      catch (ex) { toast(ex.message); }
      finally { b.disabled = false; }
      return;
    }
    const storeForm=e.target.closest('[data-client-store-form]');if(storeForm){e.preventDefault();const sf=storeForm,b=$('[type=submit]',sf),m=$('[data-store-msg]',sf);b.disabled=true;try{await api('/admin/client-stores'+(sf.dataset.clientStoreForm?'/'+sf.dataset.clientStoreForm:''),{method:'POST',body:{clientId:Number(sf.dataset.clientId),name:sf.storeName.value,platform:sf.platform.value,link:sf.link.value,color:sf.dataset.clientStoreForm||sf.dataset.colourEdited?sf.color.value:undefined,archived:!!sf.archived?.checked,status:sf.status?.value||'active'}});document.activeElement?.blur();await loadAll();refreshDrawer();toast('Store saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const cd=e.target.closest('[data-claim-decision]');if(cd){e.preventDefault();const b=$('[type=submit]',cd),m=$('[data-claim-msg]',cd);b.disabled=true;delete S.clOpen[cd.dataset.claimDecision];try{await api('/admin/claims/'+cd.dataset.claimDecision,{method:'POST',body:{status:cd.status.value,reply:cd.reply.value}});document.activeElement?.blur();await loadAll();if(S.tab==='claims')renderClaims();else refreshDrawer();toast('Claim decision saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const pq=e.target.closest('[data-product-quote]');if(pq){e.preventDefault();const b=$('[type=submit]',pq),m=$('[data-quote-msg]',pq);b.disabled=true;try{await api('/admin/products/'+pq.dataset.productQuote,{method:'POST',body:{status:pq.status.value,unitPrice:pq.unitPrice.value,shipping:pq.shipping.value,note:pq.note.value}});document.activeElement?.blur();delete S.pqOpen[pq.dataset.productQuote];await loadAll();if(S.tab==='products')renderProducts();else refreshDrawer();toast('Quote saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const inf=e.target.closest('[data-invoice-form]');
    if(inf){e.preventDefault();const b=$('[type=submit]',inf),m=$('[data-invoice-msg]',inf);b.disabled=true;try{const file=await invoiceFile(inf);if(!file)throw new Error('Choose the receipt file.');await api('/admin/invoices',{method:'POST',body:{clientId:Number(inf.dataset.invoiceForm),orderIds:inf.dataset.orderId?[Number(inf.dataset.orderId)]:PO.picked(inf),paymentId:inf.invoicePayment?.value||null,date:inf.invoiceDate.value,file}});document.activeElement?.blur();inf.reset();invoiceFiles=(await api('/admin/invoices?clientId='+inf.dataset.invoiceForm)).invoices;refreshDrawer();toast('Receipt saved. The client can download it now.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    // Attach a receipt to a payment: saved with the payment and its orders; the client is notified and can download it.
    // Record refund: money sent back to the client from cancelled orders' credit.
    const rff = e.target.closest('[data-refund-form]');
    if (rff) {
      e.preventDefault(); const b = $('[type=submit]', rff), m = $('[data-refund-msg]', rff); if (b.disabled) return; b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      try { await api('/admin/refunds', { method: 'POST', body: { clientId: S.drawer.id, amount: rff.amount.value, date: rff.date.value, method: rff.method.value, note: rff.note.value } }); await loadAll(); await loadPayments(S.drawer.id); fillClient(clientOf(S.drawer.id), false); toast('Refund recorded. The client sees it on their Payments page.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const rf = e.target.closest('[data-receipt-form]');
    if (rf) {
      e.preventDefault();
      const b = $('[type=submit]', rf), m = $('[data-receipt-msg]', rf); if (b.disabled) return; b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      try {
        const p = payments.find(x => x.id === Number(rf.dataset.receiptForm)), file = await invoiceFile(rf);
        if (!p) throw new Error('Payment not found.'); if (!file) throw new Error('Choose the receipt file.');
        await api('/admin/invoices', { method: 'POST', body: { clientId: S.drawer.id, paymentId: p.id, orderIds: p.orderIds || [], date: rf.invoiceDate.value, file } });
        delete S.drawer.payAttach; rf.reset(); document.activeElement?.blur(); await loadPayments(S.drawer.id); fillClient(clientOf(S.drawer.id), false); toast('Receipt sent. The client can download it now.');
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const abf = e.target.closest('[data-admin-billing]');
    if (abf) {
      e.preventDefault();
      const b = $('[type=submit]', abf), m = $('[data-billing-msg]', abf); if (b.disabled) return; b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      try { const r = await api('/admin/billing/' + abf.dataset.adminBilling, { method: 'POST', body: { name: abf.name.value, company: abf.company.value, address: abf.address.value, email: abf.email.value, phone: abf.phone.value } }); billing = r.billing; delete abf.dataset.dirty; document.activeElement?.blur(); fillClient(clientOf(Number(abf.dataset.adminBilling)), false); toast('Billing details saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const pf = e.target.closest('[data-pay-form]');
    if (pf) {
      e.preventDefault();
      const m = $('[data-pay-msg]');
      try {
        const b=$('[type=submit]',pf);if(b.disabled)return;b.disabled=true;
        const file=await invoiceFile(pf);
        let invoiceError='';
        // The ticked orders go with the payment; a transfer confirmation is recorded through its own route (credited once).
        const orderIds=PO.picked(pf), body={ amount: pf.amount.value, method: pf.method.value, note: pf.note.value, paidAt: pf.paidAt.value, orderIds };
        const paymentId=pf.dataset.transfer ? (await api('/admin/transfers/'+pf.dataset.transfer+'/record',{method:'POST',body})).transfer?.paymentId : (await api('/admin/payments', { method: 'POST', body: { clientId: Number(pf.dataset.payForm), ...body } })).id;
        if(file){try{await api('/admin/invoices',{method:'POST',body:{clientId:Number(pf.dataset.payForm),paymentId,orderIds,date:pf.paidAt.value,file}});}catch(ex){invoiceError='Payment recorded; the receipt upload failed. Use Attach receipt on the payment to try again. '+ex.message;}}
        delete S.drawer.transferId; delete S.drawer.payNew; delete pf.dataset.dirty; document.activeElement?.blur();pf.reset(); await loadAll(); renderList(); await loadPayments(Number(pf.dataset.payForm)); fillClient(clientOf(Number(pf.dataset.payForm)), false); toast(invoiceError||(orderIds.length ? `Payment recorded for ${orderIds.length} order${orderIds.length === 1 ? '' : 's'}.` : 'Payment recorded.'));
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err';$('[type=submit]',pf).disabled=false; }
      return;
    }
    const sf = e.target.closest('[data-sub-form]');
    if (sf) {
      e.preventDefault();
      const m = $('[data-sub-msg]');
      const body = { subStatus: sf.subStatus.value, trialStart: sf.trialStart.value, trialEnd: sf.trialEnd.value, subLastPayment: sf.subLastPayment.value };
      try { await api('/admin/users/' + sf.dataset.subForm, { method: 'POST', body }); document.activeElement?.blur(); await loadAll(); renderList(); fillClient(clientOf(sf.dataset.subForm)); toast('Subscription saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      return;
    }
    const af = e.target.closest('[data-account-form]');
    if (af) {
      e.preventDefault();
      const m = $('[data-account-msg]'), body = { name: af.name.value, username: af.username.value.trim(), active: af.active.value === 'true', commissionPerOrder: af.commissionPerOrder.value === '' ? null : af.commissionPerOrder.value, applyFeeTo: af.applyFeeTo.value };

      try { const r = await api('/admin/users/' + af.dataset.accountForm, { method: 'POST', body }); document.activeElement?.blur(); tell({ type: 'dl-clients-changed' }); await loadAll(); renderList(); fillClient(clientOf(af.dataset.accountForm)); toast(body.applyFeeTo !== 'new' ? `Account saved. Fee updated on ${r.ordersUpdated ?? 0} existing orders.` : 'Account saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
    }
  });
  function onParentMessage(e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const m = e.data || {};
    if (m.type === 'dl-open-client' && clientOf(m.id)) openClient(m.id);
    if (m.type === 'dl-add-admin') openAddAccount('admin');
    if (m.type === 'dl-set-tab' && ['overview', 'orders', 'clients', 'claims', 'products', 'settings'].includes(m.tab) && m.tab !== S.tab) { S.tab = m.tab; if (S.ov) renderTab(); }
    if(m.type==='dl-open-products'){S.tab='products';loadAll().then(renderTab);return;}
    if (m.type === 'dl-open-order') {
      const go = () => { if (S.orders.some(o => o.id === m.id)) openOrder(m.id, m.focus); };
      if (S.orders.some(o => o.id === m.id)) go(); else loadAll().then(() => { renderList(); go(); });
    }
  }

  // The bell ("Mark all as read", opening a notification) changed what's seen: refresh the update tags.
  addEventListener('storage', e => { if (/^dl_notif_read/.test(e.key || '')) { readCache = null; if (S.ov) { renderKpis(); renderList(); } } });

  boot();
})();
