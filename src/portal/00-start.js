/* Direct Line client portal: Home, Orders (with order details + chat), New order, Messages, Payments. */
(function () {
  const { api, money, esc, trackingUrl, fullLink, logout, renderLogin, quote, destinationPicker, hasRate, categoryOptions, countryName, shrinkImage, photoUrl, productMedia, RATES, COUNTRIES, $, $$ } = window.DL;
  const MAX_PHOTOS = 8;
  const UI = window.DLOrderUI, N = window.DLNotify;
  const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancellation_requested', 'cancelled'];
  const S = { me: null, orders: [], payments: [], transfers: [], adjustments: [], invoices: [], products: [], claims: [], stores: [], storeId:0, period:'month', from:'', to:'', notes: [], seenAt: 0, route: 'home', id: null, filter: 'all', q: '' };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const P = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    orders: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    logout: '<path d="M15 4h4v16h-4M10 16l-4-4 4-4M6 12h10"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5v11"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M5 9v11h14V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M10 20v-5h4v5"/>',
    tag: '<path d="M20 12l-8 8-8-8V4h8z"/><circle cx="8.5" cy="8.5" r="1.5"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  };
  const ic = n => UI.svg(P[n]);
  const ROUTES = {
    stores: {title:'My Stores',sub:'Manage stores and keep their order history'},
    products: {title:'My Products',sub:'Check product prices before you sell them'},
    home: { title: 'Home', sub: 'Your orders at a glance' },
    orders: { title: 'Orders', sub: 'Every order you’ve sent us' },
    new: { title: 'Send a new order', sub: 'Fill in 3 short steps and press Send' },
    edit: { title: 'Edit order', sub: 'Change the details of an order' },
    messages: { title: 'Messages', sub: 'Your conversations with Direct Line' },
    terms: { title: 'Terms of Service', sub: 'Service, fulfillment and after-sales policy' },
    payments: { title: 'Payments', sub: 'What you’ve been billed and paid' },
  };
  const NAV = [['home', 'Home', 'home'], ['orders', 'Orders', 'orders'], ['new', 'New order', 'plus'], ['messages', 'Messages', 'chat'], ['payments', 'Payments', 'wallet'], ['stores','My Stores','store'], ['products','My Products','tag'], ['terms', 'Terms of Service', 'doc']];
  const shortCat = c => ({ general: 'General goods', battery: 'Battery / sensitive', cosmetic: 'Cosmetics / liquids' }[c] || c || '—');
  const place = d => (d ? countryName(d) : '—');
  const ago = sec => N.timeAgo(sec * 1000);
  const fullDate = sec => window.DL.displayTime(sec);
  const orderName = o => o.orderRef || 'Order #' + o.id;
  const editable = o => o.status === 'pending' && !o.editLocked && Number(o.createdAt) > 0 && Date.now() < (Number(o.createdAt) + 72 * 3600) * 1000;
  const hoursLeft = o => Math.ceil(((Number(o.createdAt) + 72 * 3600) * 1000 - Date.now()) / 3600000);
  const divisor = () => Number(S.me?.settings?.volumetric_divisor) || 6000;
  // Today's date on this device (toISOString alone gives the UTC date, which is yesterday after midnight in Israel).
  const localDay = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  // Customer details can be changed until the parcel ships, also after the full-edit window closed.
  const canChangeCustomer = o => !S.me?.preview && ['pending', 'processing'].includes(o.status) && !editable(o);
  // Earned = what the client earned on Etsy after Etsy’s fees: Etsy's own "You earned", or customer paid - the Etsy fee.
  // Profit = earned - what the client pays Direct Line. (Same as our own profit tracker: Buyer Paid - Etsy Fee - Product Cost.)
  // Nothing is estimated: without the Etsy fee (or "You earned") there is no profit figure.
  const earnedOf = o => o.earned ?? null;
  const profitOf = o => o.status === 'cancelled' || !o.priced || earnedOf(o) == null ? null : o.profit;
  const money2 = (v, o) => (o.currency || 'USD') === 'USD' ? money(v) : `${o.currency} ${Number(v).toFixed(2)}`;
  const earnedCell = o => earnedOf(o) != null ? `<b>${esc(money2(earnedOf(o), o))}</b>` : o.sellingPrice != null && o.status !== 'cancelled' ? '<span class="dim">Add Etsy fee</span>' : '<span class="dim">—</span>';
  const notUsd = o => (o.currency || 'USD') !== 'USD';
  const profitCell = o => o.status === 'cancelled' ? '<span class="dim">—</span>' : !o.priced ? '<span class="dim">Pending</span>' : notUsd(o) && earnedOf(o) != null ? '<span class="dim" title="Profit is only worked out for orders in USD">Not in USD</span>' : profitOf(o) == null ? '<span class="dim">—</span>' : `<b>${money(profitOf(o))}</b>`;
  const customerPaid = o => o.sellingPrice == null ? '' : `${o.currency || 'USD'} ${Number(o.sellingPrice).toFixed(2)}`;
  const inProgress = o => !['delivered', 'cancelled'].includes(o.status);

