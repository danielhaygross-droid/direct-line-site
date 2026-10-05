/* Direct Line client portal: Home, Orders (with order details + chat), New order, Messages, Payments, Shipping rates. */
(function () {
  const { api, money, esc, trackingUrl, logout, renderLogin, quote, destinationPicker, hasRate, categoryOptions, countryName, RATES, COUNTRIES, $, $$ } = window.DL;
  const UI = window.DLOrderUI, N = window.DLNotify;
  const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const S = { me: null, orders: [], payments: [], notes: [], seenAt: 0, route: 'home', id: null, filter: 'all', q: '' };
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
  };
  const ic = n => UI.svg(P[n]);
  const ROUTES = {
    home: { title: 'Home', sub: 'Your orders at a glance' },
    orders: { title: 'Orders', sub: 'Every order you’ve sent us' },
    new: { title: 'New order', sub: 'Send us an order to process' },
    edit: { title: 'Edit order', sub: 'Change the details of an order' },
    messages: { title: 'Messages', sub: 'Your conversations with Direct Line' },
    payments: { title: 'Payments', sub: 'What you’ve been billed and paid' },
    rates: { title: 'Shipping rates', sub: 'Work out a shipping fee before you order' },
  };
  const NAV = [['home', 'Home', 'home'], ['orders', 'Orders', 'orders'], ['new', 'New order', 'plus'], ['messages', 'Messages', 'chat'], ['payments', 'Payments', 'wallet'], ['rates', 'Shipping rates', 'calc']];
  const shortCat = c => ({ general: 'General goods', battery: 'Battery / sensitive', cosmetic: 'Cosmetics / liquids' }[c] || c || '—');
  const place = d => (d ? countryName(d) : '—');
  const ago = sec => N.timeAgo(sec * 1000);
  const fullDate = sec => (sec ? new Date(sec * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const orderName = o => o.orderRef || 'Order #' + o.id;
  const divisor = () => Number(S.me?.settings?.volumetric_divisor) || 6000;

  // ---------- boot ----------
  async function boot() {
    try { S.me = await api('/me'); }
    catch (e) {
      if (e.status === 401 || e.status === 403) return renderLogin(document.body, { title: 'Welcome back', subtitle: 'Sign in to add and track your orders.', portal: true });
      $('#boot').textContent = e.message; return;
    }
    if (S.me.role === 'admin') {
      // Admins don't get bounced to the dashboard any more: they pick a client and preview their portal (view only).
      const as = Number(new URLSearchParams(location.search).get('as'));
      if (!as) return adminScreen();
      window.DL_VIEW_AS = as;
      try { S.me = await api('/me'); } catch (e) { return adminScreen(e.message); }
    }
    shell();
    if (S.me.preview) previewBanner();
    $('#boot').remove(); $('#app').hidden = false;
    await refresh(true);
    route();
    addEventListener('hashchange', route);
    setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(() => {}); });
  }

  // ---------- admin opening the client portal ----------
  async function adminScreen(err) {
    let clients = [];
    try { clients = (await api('/admin/overview')).clients; } catch (e) { /* ignore */ }
    $('#boot')?.remove();
    const app = $('#app'); app.hidden = false; app.className = 'admin-pick';
    app.innerHTML = `<div class="pick-card card">
      <a class="brand" href="/portal/" style="color:var(--text)"><span>direct<b>↗</b>line.</span><small>CLIENT PORTAL</small></a>
      <div><h1>You’re signed in as the Direct Line admin</h1><p class="muted">This page is the client portal, what your clients see. Pick a client to see their portal exactly as they do (view only), or go back to the admin dashboard.</p></div>
      ${err ? `<p class="form-msg err">${esc(err)}</p>` : ''}
      <div class="pick-list">${clients.length ? clients.map(c => `<a class="pick-row" href="/portal/?as=${c.id}"><span class="avatar">${esc((c.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span><b>${esc(c.name)}</b><small>@${esc(c.username)} · ${c.orders} order${c.orders === 1 ? '' : 's'}${c.active ? '' : ' · disabled'}</small></span><em>See their portal →</em></a>`).join('')
        : '<p class="muted">No client accounts yet. Add one in the admin dashboard → Clients & orders.</p>'}</div>
      <div class="pick-actions"><a class="btn btn-primary" href="/en/#client-orders">Go to admin dashboard</a><button type="button" class="btn" data-pick-logout>Sign out (to log in as a client)</button></div>
      <p class="note">To test as a client (add orders, send messages), open this page in an incognito window and sign in with the client’s username and password.</p>
    </div>`;
    $('[data-pick-logout]').addEventListener('click', logout);
  }
  function previewBanner() {
    const bar = document.createElement('div');
    bar.className = 'preview-bar';
    bar.innerHTML = `<span><b>Preview:</b> you’re seeing ${esc(S.me.name)}’s portal as admin. View only, nothing you click here changes their account.</span><a href="/portal/">Pick another client</a><a href="/en/#client-orders">Back to admin dashboard</a>`;
    document.body.prepend(bar);
    document.body.classList.add('is-preview');
  }

  // ---------- data ----------
  let known = null;
  async function refresh(first) {
    const [me, o, p, n] = await Promise.all([api('/me'), api('/orders'), api('/payments'), api('/notifications').catch(() => null)]);
    S.me = { ...S.me, ...me }; S.orders = o.orders; S.payments = p.payments;
    if (n) { S.notes = n.items; S.seenAt = n.seenAt; }
    const fresh = known ? S.notes.filter(x => !known.has(x.id)) : [];
    known = new Set(S.notes.map(x => x.id));
    updateChrome();
    if (!first) {
      if (S.route !== 'new' && S.route !== 'edit') renderView(true);
      refreshDrawer();
      fresh.slice(0, 3).reverse().map(noteItem).filter(x => x.unread)
        .forEach(x => N.popup(x, { onClick: () => { markRead(x); openOrder(x.orderId, x.focus); }, duration: 10000 }));
    }
  }

  // ---------- notifications ----------
  const readKey = () => 'dl_portal_read_' + S.me.id, badgeKey = () => 'dl_portal_badge_' + S.me.id;
  let readIds = null;
  const reads = () => (readIds ||= new Set(store.get(readKey(), [])));
  function noteItem(e) {
    const o = S.orders.find(x => x.id === e.orderId), ref = e.orderRef || (o ? orderName(o) : '#' + e.orderId);
    const base = { id: 'n' + e.id, orderId: e.orderId, time: e.createdAt * 1000, action: 'View order' };
    let it;
    if (e.kind === 'status') {
      const words = { processing: 'We’re working on it now.', shipped: 'It’s on its way to your customer.', delivered: 'It was delivered to your customer.', cancelled: 'This order was cancelled.', pending: 'It’s back to pending.' };
      it = { ...base, icon: e.detail === 'cancelled' ? 'alert' : e.detail === 'delivered' ? 'check' : 'status', tone: { processing: 'blue', shipped: 'gold', delivered: 'mint', cancelled: 'red' }[e.detail] || 'orange', title: `${ref} is now ${e.detail}`, text: words[e.detail] || '' };
    } else if (e.kind === 'tracking') it = { ...base, icon: 'status', tone: 'mint', title: 'Tracking number added', text: `${ref} · ${e.detail}` };
    else if (e.kind === 'message') it = { ...base, icon: 'message', tone: 'blue', focus: 'chat', action: 'Reply', title: 'Direct Line replied', text: `${ref}: ${e.detail}` };
    else if (e.kind === 'created') it = { ...base, icon: 'order', tone: 'gold', title: 'We added an order for you', text: ref };
    else it = { ...base, icon: 'edit', tone: 'orange', title: 'We updated your order', text: ref };
    it.unread = it.time > S.seenAt * 1000 && !reads().has(it.id);
    return it;
  }
  const noteItems = () => S.notes.map(noteItem);
  function markRead(x) { reads().add(x.id); store.set(readKey(), [...reads()].slice(-300)); updateChrome(); }
  let panel;

  // ---------- layout ----------
  function shell() {
    const me = S.me, initials = (me.name || me.username || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    $('#app').innerHTML = `
      <aside class="side" id="side">
        <a class="brand" href="#/home"><span>direct<b>↗</b>line.</span><small>CLIENT PORTAL</small></a>
        <nav class="nav" aria-label="Main">${NAV.map(([r, label, icon]) => `<a href="#/${r}" data-nav="${r}">${ic(icon)}<span>${label}</span><em data-nav-badge="${r}"></em></a>`).join('')}</nav>
        <div class="side-foot">
          <div class="help"><b>Questions about an order?</b>Open the order and send us a message. <a href="#/messages">Messages →</a></div>
          <div class="me"><span class="avatar">${esc(initials)}</span><div><b>${esc(me.name)}</b><small>@${esc(me.username)}</small></div><button type="button" data-theme-toggle title="Light / dark" aria-label="Switch light/dark">${ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button><button type="button" data-logout title="Log out" aria-label="Log out">${ic('logout')}</button></div>
        </div>
      </aside>
      <div class="scrim" data-close-menu></div>
      <div class="main">
        <header class="top">
          <button type="button" class="icon-btn menu-btn" data-menu aria-label="Menu">${ic('menu')}</button>
          <div class="title"><h1 data-title>Home</h1><p data-sub></p></div>
          <span class="spacer"></span>
          <div class="top-actions">
            <button type="button" class="icon-btn theme-btn" data-theme-toggle aria-label="Switch light/dark">${ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
            <button type="button" class="icon-btn" data-bell aria-label="Notifications">${ic('bell')}<span class="count" data-bell-count hidden></span></button>
            <a class="btn btn-primary new-btn" href="#/new">${ic('plus')}New order</a>
          </div>
        </header>
        <main class="view" id="view" tabindex="-1"></main>
      </div>
      <nav class="tabs" aria-label="Quick">
        <a href="#/home" data-tab="home">${ic('home')}Home</a>
        <a href="#/orders" data-tab="orders">${ic('orders')}Orders</a>
        <a href="#/new" data-tab="new" class="fab" aria-label="New order"><span>${ic('plus')}</span></a>
        <a href="#/messages" data-tab="messages">${ic('chat')}Messages<em data-tab-badge></em></a>
        <a href="#/payments" data-tab="payments">${ic('wallet')}Payments</a>
      </nav>`;
    const bell = $('[data-bell]');
    panel = N.panel({
      anchor: bell,
      onItem: x => { markRead(x); openOrder(x.orderId, x.focus); },
      onMarkAll: async () => { try { const r = await api('/notifications/seen', { method: 'POST' }); S.seenAt = r.seenAt; readIds = new Set(); store.set(readKey(), []); updateChrome(); if (S.route === 'home' || S.route === 'orders') renderView(true); } catch (e) { /* offline */ } },
      onOpen: () => { store.set(badgeKey(), Date.now()); updateChrome(); },
      footer: 'Updates come in by themselves every 20 seconds.',
    });
    bell.addEventListener('click', () => panel.toggle());
    $('#app').addEventListener('click', onClick);
    $('#app').addEventListener('input', onInput);
  }

  function updateChrome() {
    if (!panel) return;
    const items = noteItems();
    panel.set(items);
    const badgeAt = store.get(badgeKey(), 0);
    const n = items.filter(x => x.unread && x.time > badgeAt).length;
    const c = $('[data-bell-count]'); c.textContent = n > 9 ? '9+' : n; c.hidden = !n;
    const unreadMsgs = S.orders.reduce((t, o) => t + (o.unreadMessages || 0), 0);
    const badge = v => (v ? `<span class="badge-new">${v}</span>` : '');
    $('[data-nav-badge="messages"]').innerHTML = badge(unreadMsgs);
    const ob = $('[data-nav-badge="orders"]'); ob.className = 'n'; ob.textContent = S.orders.length || '';
    $('[data-tab-badge]').innerHTML = badge(unreadMsgs);
    const unreadAll = items.filter(x => x.unread).length;
    document.title = (unreadAll ? `(${unreadAll}) ` : '') + 'Direct Line · Client Portal';
  }

  // ---------- routing ----------
  function route() {
    const [r, id] = location.hash.replace(/^#\/?/, '').split('/');
    S.route = ROUTES[r] ? r : 'home'; S.id = id ? Number(id) : null;
    if (S.route === 'edit' && !S.orders.some(o => o.id === S.id && o.status !== 'cancelled')) { location.hash = '#/orders'; return; }
    document.body.classList.remove('menu-open');
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === S.route || (S.route === 'edit' && a.dataset.nav === 'orders')));
    $$('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === S.route));
    $('[data-title]').textContent = ROUTES[S.route].title;
    $('[data-sub]').textContent = ROUTES[S.route].sub;
    $('.new-btn').hidden = S.route === 'new' || S.route === 'edit';
    renderView();
    scrollTo({ top: 0 });
  }
  const go = path => { location.hash = '#/' + path; };
  function renderView(soft) {
    const view = $('#view');
    if (soft && S.route === 'orders' && $('[data-orders-list]')) { renderChips(); renderOrdersList(); return; }
    view.innerHTML = { home: viewHome, orders: viewOrders, new: viewForm, edit: viewForm, messages: viewMessages, payments: viewPayments, rates: viewRates }[S.route]();
    if (soft) view.querySelectorAll(':scope > *').forEach(el => { el.style.animation = 'none'; });
    ({ orders: bindOrders, new: bindForm, edit: bindForm, rates: bindRates })[S.route]?.();
  }
  const empty = (icon, title, text, extra = '') => `<div class="empty"><span class="empty-ic">${ic(icon)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra}</div>`;

  // ---------- home ----------
  function viewHome() {
    const me = S.me, s = me.summary, o = S.orders;
    const h = new Date().getHours(), hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const count = st => o.filter(x => x.status === st).length;
    const active = o.filter(x => !['delivered', 'cancelled'].includes(x.status)).length;
    const credit = s.outstanding < 0;
    const live = o.filter(x => x.status !== 'cancelled'), total = live.length || 1;
    const items = noteItems().slice(0, 6);
    return `
      <section class="hello"><div><p class="eyebrow">Client portal</p><h2>${hello}, <span>${esc((me.name || '').split(' ')[0] || me.username)}</span></h2><p>${o.length ? `You have ${active} order${active === 1 ? '' : 's'} in progress.` : 'Add your first order to get started.'}</p></div>
        <div class="hello-actions"><a class="btn" href="#/rates">${ic('calc')}Shipping rates</a><a class="btn btn-primary" href="#/new">${ic('plus')}New order</a></div></section>
      <section class="stats">
        <div class="stat hero"><span class="stat-ic">${ic('wallet')}</span><small>${credit ? 'Credit on your account' : 'Balance due'}</small><strong>${money(Math.abs(s.outstanding))}</strong><em>${credit ? 'You’ve paid more than you were billed' : s.outstanding > 0 ? 'Billed ' + money(s.billed) + ' · paid ' + money(s.paid) : 'You’re all paid up'}</em></div>
        <div class="stat" style="--tone:var(--blue)"><span class="stat-ic">${ic('orders')}</span><small>Orders</small><strong>${s.orders}</strong><em>${active} in progress</em></div>
        <div class="stat" style="--tone:var(--orange)"><span class="stat-ic">${ic('money')}</span><small>Total billed</small><strong>${money(s.billed)}</strong><em>Product + shipping</em></div>
        <div class="stat" style="--tone:var(--mint)"><span class="stat-ic">${ic('check')}</span><small>Paid</small><strong>${money(s.paid)}</strong><em>${S.payments.length} payment${S.payments.length === 1 ? '' : 's'}</em></div>
        <div class="stat" style="--tone:var(--gold)"><span class="stat-ic">${ic('chart')}</span><small>Your profit</small><strong class="${s.clientProfit < 0 ? 'neg' : ''}">${money(s.clientProfit)}</strong><em>Selling price − total</em></div>
      </section>
      <div class="home-grid">
        <section class="card"><div class="card-head"><h3>Order status</h3><a class="link" href="#/orders">View orders</a></div>
          <div class="pipe">${UI.STEPS.map(st => `<button type="button" class="t-${st}" data-go-filter="${st}"><small>${UI.LABEL[st]}</small><strong>${count(st)}</strong></button>`).join('')}</div>
          <div class="pipe-bar" aria-hidden="true">${live.length ? UI.STEPS.map(st => `<i class="t-${st}" style="width:${(count(st) / total) * 100}%"></i>`).join('') : ''}</div>
          ${count('cancelled') ? `<p class="pipe-note">${count('cancelled')} cancelled order${count('cancelled') > 1 ? 's' : ''} not shown.</p>` : ''}
        </section>
        <section class="card"><div class="card-head"><h3>Latest updates</h3><button type="button" class="link" data-open-bell>See all</button></div>
          ${items.length ? `<div class="feed">${items.map(x => `<button type="button" class="${x.unread ? 'unread' : ''}" data-open-order="${x.orderId}" data-focus="${x.focus || ''}" data-note="${x.id}"><span class="dln-ic t-${x.tone}">${N.icon(x.icon)}</span><span style="display:grid;min-width:0"><b>${esc(x.title)}</b><span>${esc(x.text)}</span><time>${esc(N.timeAgo(x.time))}</time></span></button>`).join('')}</div>`
            : empty('bell', 'No updates yet', 'When we change an order’s status or reply to you, it shows up here.')}
        </section>
        <section class="card span2"><div class="card-head"><h3>Recent orders</h3><a class="link" href="#/orders">See all ${o.length ? '(' + o.length + ')' : ''}</a></div>
          ${o.length ? `<div class="table-wrap">${ordersTable(o.slice(0, 5), true)}</div>` : empty('orders', 'No orders yet', 'Add an order with its tracking number, product cost and selling price. We work out the shipping fee for you.', '<a class="btn btn-primary" href="#/new">New order</a>')}
        </section>
        <section class="card span2"><div class="card-head"><h3>Profit by month</h3><span class="tag">Last 6 months</span></div>${profitChart()}</section>
      </div>`;
  }

  function profitChart() {
    const months = [], d = new Date(); d.setDate(1);
    for (let i = 5; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push({ y: m.getFullYear(), m: m.getMonth(), label: m.toLocaleDateString(undefined, { month: 'short' }), profit: 0, orders: 0 }); }
    for (const o of S.orders) {
      if (o.status === 'cancelled') continue;
      const t = new Date(o.createdAt * 1000), b = months.find(x => x.y === t.getFullYear() && x.m === t.getMonth());
      if (b) { b.orders++; b.profit += Number(o.profit || 0); }
    }
    const max = Math.max(1, ...months.map(x => Math.abs(x.profit)));
    const total = months.reduce((t, x) => t + x.profit, 0), orders = months.reduce((t, x) => t + x.orders, 0);
    return `<div class="bars" role="img" aria-label="Profit for the last 6 months">${months.map(x => `<div class="bar-col" title="${esc(x.label)}: ${money(x.profit)} profit, ${x.orders} order${x.orders === 1 ? '' : 's'}">
        <span class="bar-val">${x.orders ? money(x.profit) : ''}</span><i class="${x.profit < 0 ? 'neg' : ''}${x.orders ? '' : ' none'}" style="height:${x.orders ? Math.max(4, Math.abs(x.profit) / max * 100) : 0}%"></i><small>${esc(x.label)}</small></div>`).join('')}</div>
      <div class="chart-legend"><span>${orders} order${orders === 1 ? '' : 's'} in 6 months</span><span>Profit: <b class="${total < 0 ? 'neg' : ''}">${money(total)}</b></span></div>`;
  }

  // ---------- orders ----------
  const unreadOrderIds = () => new Set(noteItems().filter(x => x.unread).map(x => x.orderId));
  function ordersTable(list, compact) {
    const fresh = unreadOrderIds();
    return `<table class="tbl stack"><thead><tr><th>Order</th><th>Destination</th>${compact ? '' : '<th>Tracking</th>'}<th class="num">Total</th>${compact ? '' : '<th class="num">Profit</th>'}<th>Status</th><th class="hide-sm"></th></tr></thead><tbody>
      ${list.map(o => `<tr class="click${fresh.has(o.id) ? ' is-new' : ''}" data-open-order="${o.id}" tabindex="0">
        <td class="wide"><div class="ord-ref"><span class="ord-ic t-${o.status}">${ic('orders')}</span><span class="t-main"><b>${esc(orderName(o))}${fresh.has(o.id) ? '<span class="dot-new" title="Updated"></span>' : ''}</b><small>${esc(fullDate(o.createdAt))}</small></span></div></td>
        <td data-label="Destination">${esc(place(o.destination))}</td>
        ${compact ? '' : `<td data-label="Tracking">${o.trackingNumber ? `<span class="tracking">${esc(o.trackingNumber)}</span>` : '<span class="dim">Not yet</span>'}</td>`}
        <td data-label="Total" class="num"><b>${money(o.price)}</b></td>
        ${compact ? '' : `<td data-label="Profit" class="num ${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}">${money(o.profit)}</td>`}
        <td data-label="Status">${UI.pill(o.status)}</td>
        <td class="num hide-sm">${o.messages ? `<span class="msg-count${o.unreadMessages ? ' unread' : ''}" title="Messages">${ic('chat')}${o.unreadMessages || o.messages}</span> ` : ''}${UI.svg(P.chev).replace('<svg', '<svg class="chev"')}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  const viewOrders = () => `<div class="toolbar"><div class="chips" data-chips></div><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, tracking, country…" value="${esc(S.q)}" data-q></label></div>
      <section class="card" data-orders-list></section>`;
  function renderChips() {
    const c = st => S.orders.filter(o => st === 'all' || o.status === st).length;
    $('[data-chips]').innerHTML = ['all', ...STATUSES].filter(st => st === 'all' || c(st) || st === S.filter)
      .map(st => `<button type="button" class="chip${S.filter === st ? ' on' : ''} t-${st}" data-filter="${st}">${st !== 'all' ? '<i class="dot"></i>' : ''}${st === 'all' ? 'All' : UI.LABEL[st]} <span>${c(st)}</span></button>`).join('');
  }
  function renderOrdersList() {
    const q = S.q.toLowerCase();
    const list = S.orders.filter(o => (S.filter === 'all' || o.status === S.filter)
      && (!q || [o.orderRef, o.trackingNumber, o.notes, o.destination, place(o.destination)].join(' ').toLowerCase().includes(q)));
    $('[data-orders-list]').innerHTML = list.length ? `<div class="table-wrap">${ordersTable(list)}</div>`
      : S.orders.length ? empty('search', 'No orders match', 'Try another search or status.') : empty('orders', 'No orders yet', 'Add your first order and we’ll take it from there.', '<a class="btn btn-primary" href="#/new">New order</a>');
  }
  function bindOrders() { renderChips(); renderOrdersList(); }

  // ---------- order drawer ----------
  let chatCtl = null, drawerEvents = [];
  function openOrder(id, focus) {
    const o = S.orders.find(x => x.id === Number(id));
    if (!o) return;
    const d = UI.getDrawer();
    chatCtl?.destroy(); drawerEvents = [];
    d.foot.dataset.confirm = '';
    d.onClose = () => { chatCtl?.destroy(); chatCtl = null; };
    d.open(o.id);
    d.body.innerHTML = '<div data-d-info style="display:grid;gap:16px"></div><section><h3 class="sec-title">Messages with Direct Line</h3><div data-d-chat></div></section>';
    fillDrawer(o);
    chatCtl = UI.chat($('[data-d-chat]', d.body), { orderId: o.id, role: 'client', onLoad: data => {
      drawerEvents = data.events || [];
      const cur = S.orders.find(x => x.id === o.id);
      if (cur && cur.unreadMessages) { cur.unreadMessages = 0; updateChrome(); if (S.route !== 'new' && S.route !== 'edit') renderView(true); }
      if (cur && d.isOpen && d.key === cur.id) fillDrawer(cur, true);
    } });
    // Opening an order marks its notifications as read.
    noteItems().filter(x => x.orderId === o.id && x.unread).forEach(x => reads().add(x.id));
    store.set(readKey(), [...reads()].slice(-300)); updateChrome();
    if (S.route === 'home' || S.route === 'orders') renderView(true);
    if (focus === 'chat') setTimeout(() => { $('[data-d-chat]', d.body)?.scrollIntoView({ block: 'start' }); chatCtl?.focus(); }, 320);
  }
  function fillDrawer(o, keepFoot) {
    const d = UI.getDrawer();
    d.head.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2>${esc(orderName(o))}</h2>${UI.pill(o.status)}</div><p>Added ${esc(fullDate(o.createdAt))} · to ${esc(place(o.destination))}</p>`;
    $('[data-d-info]', d.body).innerHTML = `
      <section class="card card-pad">${UI.tracker(o, drawerEvents)}</section>
      <section class="card card-pad"><h3 class="sec-title">Tracking</h3>${o.trackingNumber
        ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="tracking" style="font-size:16px;font-weight:600">${esc(o.trackingNumber)}</span><span style="flex:1"></span><button type="button" class="btn btn-sm" data-copy="${esc(o.trackingNumber)}">${ic('copy')}Copy</button><a class="btn btn-sm" href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${ic('ext')}Track parcel</a></div>`
        : '<p class="muted" style="margin:0">No tracking number yet. Add it with “Edit order”, or we’ll add it when the parcel ships.</p>'}</section>
      <section class="card card-pad"><h3 class="sec-title">Details</h3><dl class="kv">
        <div><dt>Order number</dt><dd>${esc(o.orderRef) || '—'}</dd></div><div><dt>Destination</dt><dd>${esc(place(o.destination))}</dd></div>
        <div><dt>Product type</dt><dd>${esc(shortCat(o.category))}</dd></div><div><dt>Weight</dt><dd>${o.weightKg != null ? esc(o.weightKg) + ' kg' : '—'}</dd></div>
        ${o.notes ? `<div class="full"><dt>Notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl></section>
      <section class="card card-pad"><h3 class="sec-title">Money</h3><div class="money-rows">
        <div><span>Product cost</span><span>${money(o.productCost)}</span></div><div><span>Shipping fee</span><span>${money(o.shippingFee)}</span></div>
        <div class="total"><span>Total you pay</span><span>${money(o.price)}</span></div>
        <div><span>Sold for</span><span>${money(o.sellingPrice)}</span></div>
        <div><span>Your profit</span><span class="${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}"><b>${money(o.profit)}</b></span></div></div></section>`;
    if (keepFoot && d.foot.dataset.confirm) return;
    d.foot.innerHTML = `${o.status !== 'cancelled' ? `<a class="btn" href="#/edit/${o.id}" data-close-drawer>${ic('edit')}Edit order</a>` : ''}<span class="spacer"></span>${o.status === 'pending' ? `<button type="button" class="btn btn-danger" data-cancel-order="${o.id}">Cancel order</button>` : o.status === 'cancelled' ? '<span class="muted" style="font-size:13px">This order was cancelled.</span>' : '<span class="muted" style="font-size:13px">Need a change? Send us a message.</span>'}`;
  }
  function refreshDrawer() {
    const d = UI.getDrawer();
    if (!d.isOpen) return;
    const o = S.orders.find(x => x.id === d.key);
    if (o) fillDrawer(o, true);
  }

  // ---------- new / edit order ----------
  function viewForm() {
    const ed = S.route === 'edit' ? S.orders.find(o => o.id === S.id) : null;
    const v2 = x => (x != null ? Number(x).toFixed(2) : '');
    const fee = ed ? (ed.shippingFee != null ? v2(ed.shippingFee) : ed.productCost == null ? v2(ed.price) : '') : '';
    return `<form class="form-layout" id="order-form" novalidate>
      <div class="form-main">
        <section class="card card-pad"><h3 class="form-sec"><i>1</i>Order details</h3><div class="form-grid">
          <label class="field"><span>Order number / reference <small>optional</small></span><input name="orderRef" maxlength="120" placeholder="e.g. Etsy #3412" value="${esc(ed?.orderRef)}"></label>
          <label class="field"><span>Tracking number <small>optional</small></span><input name="trackingNumber" maxlength="120" placeholder="e.g. LX123456789CN" value="${esc(ed?.trackingNumber)}"></label>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>2</i>Package &amp; destination</h3><div class="form-grid">
          <label class="field"><span>Destination</span><select name="destination"></select></label>
          <label class="field" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" placeholder="e.g. Sweden" autocomplete="off"></label>
          <label class="field"><span>Product type</span><select name="category">${categoryOptions(ed?.category || 'general')}</select></label>
          <label class="field"><span>Weight (kg)</span><input name="weightKg" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 0.25" value="${ed?.weightKg ?? ''}"></label>
          <div class="field"><span>Size L × W × H (cm) <small>optional</small></span><div class="dims"><input name="lengthCm" type="number" min="0" step="0.1" inputmode="decimal" placeholder="L" aria-label="Length (cm)"><input name="widthCm" type="number" min="0" step="0.1" inputmode="decimal" placeholder="W" aria-label="Width (cm)"><input name="heightCm" type="number" min="0" step="0.1" inputmode="decimal" placeholder="H" aria-label="Height (cm)"></div></div>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>3</i>Prices</h3><div class="form-grid">
          <label class="field"><span>Product cost (USD)</span><span class="money"><input name="productCost" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(ed?.productCost)}"></span></label>
          <label class="field"><span>Shipping fee (USD) <small data-fee-hint></small></span><span class="money"><input name="price" type="number" min="0" step="0.01" inputmode="decimal" value="${fee}"></span></label>
          <label class="field full"><span>Selling price, what your customer paid (USD) <small>for your profit</small></span><span class="money"><input name="sellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(ed?.sellingPrice)}"></span></label>
          <label class="field full"><span>Notes <small>optional</small></span><textarea name="notes" maxlength="2000" placeholder="Anything we should know about this order">${esc(ed?.notes)}</textarea></label>
        </div></section>
      </div>
      <aside class="form-side">
        <section class="card card-pad" style="display:grid;gap:14px"><h3 style="font-size:16px">Order summary</h3>
          <div class="quote-box" data-quote>Pick a destination and enter the weight to see the shipping fee.</div>
          <div class="money-rows" data-sum></div>
          <div class="sum-profit" data-profit hidden></div>
          <button class="btn btn-primary btn-block" type="submit" data-submit>${ed ? 'Save changes' : 'Send order'}</button>
          <a class="btn btn-ghost btn-block" href="${ed ? '#/orders' : '#/home'}">Cancel</a>
          <p class="form-msg" data-form-msg></p>
        </section>
      </aside></form>`;
  }
  function bindForm() {
    const form = $('#order-form'), ed = S.route === 'edit' ? S.orders.find(o => o.id === S.id) : null;
    const dest = destinationPicker(form.destination, $('[data-other-country]', form));
    dest.set(ed?.destination || '');
    let autoPrice = null;
    const cur = () => quote({ country: dest.get(), category: form.category.value, weightKg: form.weightKg.value, lengthCm: form.lengthCm.value, widthCm: form.widthCm.value, heightCm: form.heightCm.value, divisor: divisor() });
    const setMsg = (t, k) => { const m = $('[data-form-msg]'); m.textContent = t; m.className = 'form-msg ' + (k || ''); };
    function updateQuote() {
      const q = cur(), box = $('[data-quote]'), hint = $('[data-fee-hint]');
      if (!q) {
        const name = dest.label();
        box.innerHTML = name && !hasRate(dest.get()) ? `We don’t have a set rate for <b>${esc(name)}</b> yet. Enter the shipping fee yourself and we’ll confirm it.`
          : dest.isOther() ? 'Type the country name, then enter the shipping fee. We’ll confirm it with you.' : 'Pick a destination and enter the weight to see the shipping fee.';
        hint.textContent = '';
        if (autoPrice !== null && form.price.value === autoPrice) form.price.value = '';
        autoPrice = null; return;
      }
      if (form.price.value === '' || form.price.value === autoPrice) { form.price.value = q.total.toFixed(2); autoPrice = form.price.value; }
      const kg = q.usedVolumetric ? `${q.chargeable} kg (size-based)` : `${q.chargeable} kg`;
      box.innerHTML = `<span>Shipping fee from our rates</span><strong>${money(q.total)}</strong><div class="bd">${kg} × ${money(q.perKg)}/kg = ${money(q.freight)} + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}${q.estimated ? '<br>Estimated: we’ll confirm the final fee for this country.' : ''}</div>${form.price.value !== q.total.toFixed(2) ? '<button class="btn btn-sm" type="button" data-use-quote>Use this fee</button>' : ''}`;
      hint.textContent = form.price.value === q.total.toFixed(2) ? 'filled in from our rates' : '';
    }
    function updateSum() {
      const pc = parseFloat(form.productCost.value), sh = parseFloat(form.price.value), sell = parseFloat(form.sellingPrice.value);
      const has = Number.isFinite(pc) || Number.isFinite(sh), total = (Number.isFinite(pc) ? pc : 0) + (Number.isFinite(sh) ? sh : 0);
      $('[data-sum]').innerHTML = `<div><span>Product cost</span><span>${Number.isFinite(pc) ? money(pc) : '—'}</span></div><div><span>Shipping fee</span><span>${Number.isFinite(sh) ? money(sh) : '—'}</span></div>
        <div class="total"><span>Total you pay</span><span data-total>${has ? money(total) : '—'}</span></div>${Number.isFinite(sell) ? `<div><span>Sold for</span><span>${money(sell)}</span></div>` : ''}`;
      const pr = $('[data-profit]');
      if (has && Number.isFinite(sell)) { const v = sell - total; pr.hidden = false; pr.className = 'sum-profit' + (v < 0 ? ' neg' : ''); pr.innerHTML = `<span>Your profit</span><b class="${v >= 0 ? 'pos' : 'neg'}">${money(v)}</b>`; }
      else pr.hidden = true;
    }
    form.addEventListener('input', e => {
      if (e.target.name === 'price') autoPrice = null;
      if (['destination', 'otherCountry', 'category', 'weightKg', 'lengthCm', 'widthCm', 'heightCm', 'price'].includes(e.target.name)) updateQuote();
      updateSum();
    });
    form.addEventListener('change', e => { if (['destination', 'category'].includes(e.target.name)) { updateQuote(); updateSum(); } });
    form.addEventListener('click', e => {
      if (!e.target.closest('[data-use-quote]')) return;
      const q = cur(); if (!q) return;
      form.price.value = q.total.toFixed(2); autoPrice = form.price.value; updateQuote(); updateSum();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (dest.isOther() && !dest.get()) { setMsg('Please type the country name.', 'err'); form.otherCountry.focus(); return; }
      if (form.productCost.value === '') { setMsg('Please enter the product cost.', 'err'); form.productCost.focus(); return; }
      if (form.price.value === '') { setMsg('Please enter the shipping fee, or pick a destination and weight to fill it in.', 'err'); form.price.focus(); return; }
      const body = { orderRef: form.orderRef.value, trackingNumber: form.trackingNumber.value, destination: dest.get(), category: form.category.value,
        weightKg: form.weightKg.value === '' ? null : form.weightKg.value, productCost: form.productCost.value, shippingFee: form.price.value,
        sellingPrice: form.sellingPrice.value === '' ? null : form.sellingPrice.value, notes: form.notes.value };
      const btn = $('[data-submit]'); btn.disabled = true; setMsg('');
      try {
        const r = ed ? await api('/orders/' + ed.id, { method: 'PUT', body }) : await api('/orders', { method: 'POST', body });
        await refresh(true);
        S.filter = 'all'; go('orders');
        N.popup({ icon: 'check', tone: 'mint', title: ed ? 'Order updated' : 'Order sent', text: ed ? orderName(r.order) + ' was saved.' : `${orderName(r.order)} is now pending. We’ll update you as it moves.` }, { duration: 6000 });
        setTimeout(() => openOrder(r.order.id), 200);
      } catch (ex) { setMsg(ex.message, 'err'); btn.disabled = false; }
    });
    updateQuote(); updateSum();
    if (!ed) form.orderRef.focus({ preventScroll: true });
  }

  // ---------- messages ----------
  function viewMessages() {
    const list = S.orders.filter(o => o.messages > 0).sort((a, b) => (b.unreadMessages > 0) - (a.unreadMessages > 0) || (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    const open = S.orders.filter(o => o.status !== 'cancelled');
    return `<section class="card">
      ${list.length ? `<div class="convos">${list.map(o => `<button type="button" class="convo${o.unreadMessages ? ' unread' : ''}" data-open-order="${o.id}" data-focus="chat">
        <span class="ord-ic t-${o.status}">${ic('chat')}</span>
        <span style="min-width:0"><b>${esc(orderName(o))} ${UI.pill(o.status)}</b><p>${o.lastMessage ? (o.lastMessage.author === 'client' ? 'You: ' : 'Direct Line: ') + esc(o.lastMessage.body) : ''}</p></span>
        <aside><time>${o.lastMessageAt ? esc(ago(o.lastMessageAt)) : ''}</time>${o.unreadMessages ? `<span class="badge-new">${o.unreadMessages}</span>` : ''}</aside></button>`).join('')}</div>`
        : empty('chat', 'No conversations yet', 'Have a question about an order? Pick it below and send us a message.')}
      ${open.length ? `<div class="ask"><span class="muted" style="font-size:14px">Ask about an order:</span><select data-ask aria-label="Choose an order">${open.map(o => `<option value="${o.id}">${esc(orderName(o))} · ${esc(UI.LABEL[o.status])}</option>`).join('')}</select><button type="button" class="btn btn-primary" data-ask-go>${ic('chat')}Message us</button></div>` : ''}
    </section>`;
  }

  // ---------- payments ----------
  function viewPayments() {
    const s = S.me.summary, credit = s.outstanding < 0;
    return `<section class="stats">
        <div class="stat"><small>Total billed</small><strong>${money(s.billed)}</strong><em>${s.orders} order${s.orders === 1 ? '' : 's'}, cancelled ones not counted</em></div>
        <div class="stat"><small>Paid</small><strong class="pos">${money(s.paid)}</strong><em>${S.payments.length} payment${S.payments.length === 1 ? '' : 's'}</em></div>
        <div class="stat hero"><small>${credit ? 'Credit on your account' : 'Balance due'}</small><strong>${money(Math.abs(s.outstanding))}</strong><em>${credit ? 'It counts toward your next orders' : s.outstanding > 0 ? 'Please send this to Direct Line' : 'You’re all paid up'}</em></div>
      </section>
      <section class="card"><div class="card-head" style="padding-bottom:6px"><h3>Payment history</h3></div>
        ${S.payments.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Date</th><th>Method</th><th>Note</th><th class="num">Amount</th></tr></thead><tbody>
          ${S.payments.map(p => `<tr><td data-label="Date">${esc(fullDate(p.paidAt))}</td><td data-label="Method">${esc(p.method) || '—'}</td><td data-label="Note" class="wide">${esc(p.note) || '<span class="dim">—</span>'}</td><td data-label="Amount" class="num"><b class="pos">${money(p.amount)}</b></td></tr>`).join('')}
        </tbody></table></div>` : empty('wallet', 'No payments yet', 'When we receive a payment from you, we record it here.')}
      </section>
      <p class="note">Your bill is the product cost plus the shipping fee of each order. Payments are added by the Direct Line team once they arrive.</p>`;
  }

  // ---------- shipping rates ----------
  function viewRates() {
    const rated = COUNTRIES.filter(([c]) => RATES[c]);
    const rows = rated.map(([c, name]) => { const r = RATES[c]; return `<tr><td class="wide"><b>${esc(name)}</b>${r.est ? ' <span class="tag">Estimated</span>' : ''}${r.eu ? ' <span class="tag tag-gold">+$4 EU tax</span>' : ''}</td><td data-label="General" class="num">$${r.general}</td><td data-label="Battery" class="num">$${r.battery}</td><td data-label="Cosmetics" class="num">$${r.cosmetic}</td></tr>`; }).join('');
    return `<div class="rates-grid">
      <section class="card card-pad"><h3 class="form-sec"><i>$</i>Shipping calculator</h3>
        <form class="form-grid" data-calc onsubmit="return false">
          <label class="field full"><span>Destination</span><select name="country">${rated.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}</select></label>
          <label class="field full"><span>Product type</span><select name="category">${categoryOptions('general')}</select></label>
          <label class="field"><span>Weight (kg)</span><input name="weight" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 0.25"></label>
          <div class="field"><span>Size L × W × H (cm)</span><div class="dims"><input name="l" type="number" min="0" placeholder="L" aria-label="Length"><input name="w" type="number" min="0" placeholder="W" aria-label="Width"><input name="h" type="number" min="0" placeholder="H" aria-label="Height"></div></div>
        </form>
        <div class="calc-out" data-calc-out><small>Shipping fee</small><strong>—</strong><div class="bd">Enter a weight to see the fee.</div></div>
        <a class="btn btn-primary btn-block" href="#/new" style="margin-top:12px">${ic('plus')}Start a new order</a>
      </section>
      <section class="card"><div class="card-head" style="padding-bottom:6px"><h3>Rates per kg</h3><span class="tag">USD</span></div>
        <div class="table-wrap"><table class="tbl stack"><thead><tr><th>Country</th><th class="num">General</th><th class="num">Battery</th><th class="num">Cosmetics</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="note" style="margin:12px 16px 16px">Fee = rate per kg × weight + $4 registration (+ $4 EU tax where shown). Big, light boxes are charged by size (L × W × H ÷ ${divisor()}). For other countries, enter your own fee on the order and we’ll confirm it.</p>
      </section></div>`;
  }
  function bindRates() {
    const f = $('[data-calc]'), out = $('[data-calc-out]');
    const upd = () => {
      const q = quote({ country: f.country.value, category: f.category.value, weightKg: f.weight.value, lengthCm: f.l.value, widthCm: f.w.value, heightCm: f.h.value, divisor: divisor() });
      out.innerHTML = q ? `<small>Shipping fee to ${esc(countryName(f.country.value))}</small><strong>${money(q.total)}</strong><div class="bd">${q.chargeable} kg${q.usedVolumetric ? ' (size-based)' : ''} × ${money(q.perKg)}/kg = ${money(q.freight)} + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}${q.estimated ? '<br>Estimated rate, we’ll confirm it.' : ''}</div>`
        : '<small>Shipping fee</small><strong>—</strong><div class="bd">Enter a weight to see the fee.</div>';
    };
    f.addEventListener('input', upd); f.addEventListener('change', upd);
  }

  // ---------- events ----------
  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-menu]')) { document.body.classList.toggle('menu-open'); return; }
    if (t.closest('[data-close-menu]')) { document.body.classList.remove('menu-open'); return; }
    if (t.closest('[data-logout]')) { logout(); return; }
    if (t.closest('[data-theme-toggle]')) {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('dl_portal_theme', next); } catch (ex) { /* private mode */ }
      $$('[data-theme-toggle]').forEach(b => { b.innerHTML = ic(next === 'dark' ? 'sun' : 'moon'); });
      return;
    }
    if (t.closest('[data-open-bell]')) { e.stopPropagation(); panel.open(); return; }
    const f = t.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; renderChips(); renderOrdersList(); return; }
    const gf = t.closest('[data-go-filter]'); if (gf) { S.filter = gf.dataset.goFilter; S.q = ''; go('orders'); return; }
    if (t.closest('[data-ask-go]')) { openOrder($('[data-ask]').value, 'chat'); return; }
    const oo = t.closest('[data-open-order]');
    if (oo && !t.closest('a')) {
      const note = oo.dataset.note && noteItems().find(x => x.id === oo.dataset.note);
      if (note) markRead(note);
      openOrder(oo.dataset.openOrder, oo.dataset.focus);
    }
  }
  function onInput(e) { if (e.target.matches('[data-q]')) { S.q = e.target.value; renderOrdersList(); } }
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('tr[data-open-order]')) openOrder(e.target.dataset.openOrder); });
  // Drawer actions (the drawer lives outside #app).
  document.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-close-drawer]')) { UI.getDrawer().close(); return; }
    const cp = t.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); cp.innerHTML = ic('check') + 'Copied'; } catch (ex) { /* no clipboard */ } return; }
    const c = t.closest('[data-cancel-order]');
    if (c) {
      const foot = UI.getDrawer().foot; foot.dataset.confirm = '1';
      foot.innerHTML = `<span style="font-weight:600">Cancel this order?</span><span class="spacer"></span><button type="button" class="btn" data-keep>Keep it</button><button type="button" class="btn btn-danger" data-really-cancel="${c.dataset.cancelOrder}">Yes, cancel it</button>`;
      return;
    }
    if (t.closest('[data-keep]')) { const d = UI.getDrawer(); d.foot.dataset.confirm = ''; fillDrawer(S.orders.find(x => x.id === d.key)); return; }
    const rc = t.closest('[data-really-cancel]');
    if (rc) {
      rc.disabled = true;
      try {
        await api('/orders/' + rc.dataset.reallyCancel, { method: 'PUT', body: { status: 'cancelled' } });
        UI.getDrawer().foot.dataset.confirm = '';
        await refresh();
        N.popup({ icon: 'alert', tone: 'red', title: 'Order cancelled' }, { duration: 5000 });
      } catch (ex) { rc.disabled = false; N.popup({ icon: 'alert', tone: 'red', title: 'Couldn’t cancel', text: ex.message }); }
    }
  });

  boot();
})();
