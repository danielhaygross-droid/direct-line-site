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
    total_desc: ['Total: high to low', bySort.num(o => o.price, true)], total_asc: ['Total: low to high', bySort.num(o => o.price)],
    status: ['Status', (a, b) => rank(STATUSES, a.status) - rank(STATUSES, b.status) || bySort.newest(a, b)],
  };
  const ADMIN_ORDER_SORTS = { ...ORDER_SORTS, client: ['Client A–Z', (a, b) => bySort.text(o => clientName(o.clientId))(a, b) || bySort.newest(a, b)] };
  const P_STATUS = ['awaiting_quote', 'approved', 'not_available'];
  const PRODUCT_SORTS = {
    waiting: ['Waiting for price first', (a, b) => rank(P_STATUS, a.status) - rank(P_STATUS, b.status) || bySort.newest(a, b)],
    newest: ['Newest first', bySort.newest], oldest: ['Oldest first', bySort.oldest],
    name: ['Name A–Z', (a, b) => bySort.text(p => p.name)(a, b) || bySort.newest(a, b)],
    price_asc: ['Price: low to high', bySort.num(p => p.unitPrice)], price_desc: ['Price: high to low', bySort.num(p => p.unitPrice, true)],
  };
  const ADMIN_PRODUCT_SORTS = { ...PRODUCT_SORTS, client: ['Client A–Z', (a, b) => bySort.text(p => p.clientName)(a, b) || bySort.newest(a, b)] };
  const CLIENT_SORTS = {
    name: ['Name A–Z', bySort.text(c => c.name)],
    outstanding: ['Outstanding: high to low', bySort.num(c => c.outstanding, true)],
    orders: ['Most orders', bySort.num(c => c.orders, true)],
    billed: ['Billed: high to low', bySort.num(c => c.billed, true)],
    login: ['Last sign-in', bySort.num(c => c.lastLogin, true)],
  };
  const S = { picked: new Set(), ov: null, orders: [], archivedOrders: [], tab: 'overview', filter: null, q: '', client: '', cq: '', drawer: null, products:[], claims:[], claimFilter:'all', stores:[], period:'month', from:'', to:'' };
  const embedded = window.top !== window.self;
  const tell = m => { if (embedded) parent.postMessage(m, location.origin); };
  const P = {
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

