/* Direct Line client portal: Home, Orders (with order details + chat), New order, Messages, Payments, Import from Etsy. */
(function () {
  const { api, money, esc, trackingUrl, logout, renderLogin, quote, destinationPicker, hasRate, categoryOptions, countryName, shrinkImage, photoUrl, productMedia, RATES, COUNTRIES, $, $$ } = window.DL;
  const MAX_PHOTOS = 8;
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
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  };
  const ic = n => UI.svg(P[n]);
  const ROUTES = {
    home: { title: 'Home', sub: 'Your orders at a glance' },
    orders: { title: 'Orders', sub: 'Every order you’ve sent us' },
    new: { title: 'New order', sub: 'Send us an order to process' },
    edit: { title: 'Edit order', sub: 'Change the details of an order' },
    messages: { title: 'Messages', sub: 'Your conversations with Direct Line' },
    payments: { title: 'Payments', sub: 'What you’ve been billed and paid' },
    import: { title: 'Import from Etsy', sub: 'Add many orders at once from your Etsy orders file' },
  };
  const NAV = [['home', 'Home', 'home'], ['orders', 'Orders', 'orders'], ['new', 'New order', 'plus'], ['import', 'Import from Etsy', 'upload'], ['messages', 'Messages', 'chat'], ['payments', 'Payments', 'wallet']];
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
    bar.innerHTML = `<span><b>Preview:</b> you’re seeing ${esc(S.me.name)}’s portal as admin. View only, nothing you click here changes their account.</span><a href="/portal/">Pick another client</a><a href="${window.DLi18n?.lang === 'he' ? '/' : '/en/'}#client-orders">Back to admin dashboard</a>`;
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
    else if (e.kind === 'photo') it = { ...base, icon: 'edit', tone: 'orange', title: e.detail === 'removed' ? 'We removed a product photo' : 'We added a product photo', text: ref };
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
            <button type="button" class="icon-btn lang-btn" data-lang-toggle aria-label="Language">${window.DLi18n?.lang === 'he' ? 'EN' : 'עב'}</button>
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
    // Admin preview is view only: no forms for adding, importing or editing orders.
    if (S.me?.preview && ['new', 'edit', 'import'].includes(S.route)) { location.hash = '#/home'; return; }
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
    view.innerHTML = { home: viewHome, orders: viewOrders, new: viewForm, edit: viewForm, messages: viewMessages, payments: viewPayments, import: viewImport }[S.route]();
    if (soft) view.querySelectorAll(':scope > *').forEach(el => { el.style.animation = 'none'; });
    ({ orders: bindOrders, new: bindForm, edit: bindForm, import: bindImport })[S.route]?.();
  }
  const empty = (icon, title, text, extra = '') => `<div class="empty"><span class="empty-ic">${ic(icon)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra}</div>`;

  // ---------- subscription banner (first month free, then monthly) ----------
  const fmtDay = iso => { const d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  const shekels = n => (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n))) + ' ₪';
  function subBanner(sub) {
    if (!sub || !sub.status || sub.status === 'cancelled') return '';
    const price = `<b>${shekels(sub.price)} / month</b>`;
    if (sub.status === 'trial' && sub.trialEnd && !sub.trialEnded) {
      const left = sub.trialDaysLeft, days = left === 0 ? 'last day today' : `${left} day${left === 1 ? '' : 's'} left`;
      return `<section class="sub-banner"><span class="sub-tag">First month free</span><p>Your free month runs until <b>${fmtDay(sub.trialEnd)}</b> (${days}). After that the subscription is ${price}.</p></section>`;
    }
    if (sub.status === 'trial' && sub.trialEnded) return `<section class="sub-banner due"><span class="sub-tag">Free month ended</span><p>Your free month ended on <b>${fmtDay(sub.trialEnd)}</b>. The subscription is ${price}.</p></section>`;
    if (sub.status === 'overdue') return `<section class="sub-banner due"><span class="sub-tag">Payment due</span><p>Your subscription payment (${price}) is due. Questions? <a href="#/messages">Message us</a>.</p></section>`;
    if (sub.status === 'active') return `<section class="sub-banner ok"><span class="sub-tag">Subscription active</span><p>${price}${sub.lastPayment ? ` · last payment ${fmtDay(sub.lastPayment)}` : ''}</p></section>`;
    return '';
  }

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
        <div class="hello-actions"><a class="btn" href="#/import">${ic('upload')}Import from Etsy</a><a class="btn btn-primary" href="#/new">${ic('plus')}New order</a></div></section>
      ${subBanner(me.subscription)}
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
          ${o.length ? `<div class="table-wrap">${ordersTable(o.slice(0, 5), true)}</div>` : empty('orders', 'No orders yet', 'Send the Etsy order number, sale details and customer delivery address. Direct Line handles fulfilment from there.', '<a class="btn btn-primary" href="#/new">New order</a>')}
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
    return `<table class="tbl stack"><thead><tr><th>Order</th><th>Destination</th>${compact ? '' : '<th>Tracking</th>'}<th class="num">Customer paid</th>${compact ? '' : '<th class="num">Profit</th>'}<th>Status</th><th class="hide-sm"></th></tr></thead><tbody>
      ${list.map(o => `<tr class="click${fresh.has(o.id) ? ' is-new' : ''}" data-open-order="${o.id}" tabindex="0">
        <td class="wide"><div class="ord-ref">${o.photos?.length ? `<img class="ord-thumb" src="${photoUrl(o.id, o.photos[0].id, true)}" alt="" loading="lazy">` : `<span class="ord-ic t-${o.status}">${ic('orders')}</span>`}<span class="t-main"><b>${esc(orderName(o))}${fresh.has(o.id) ? '<span class="dot-new" title="Updated"></span>' : ''}</b><small>${esc(fullDate(o.createdAt))}</small></span></div></td>
        <td data-label="Destination">${esc(place(o.destination))}</td>
        ${compact ? '' : `<td data-label="Tracking">${o.trackingNumber ? `<span class="tracking">${esc(o.trackingNumber)}</span>` : '<span class="dim">Not yet</span>'}</td>`}
        <td data-label="Customer paid" class="num"><b>${esc(o.currency || 'USD')} ${Number(o.sellingPrice || 0).toFixed(2)}</b></td>
        ${compact ? '' : `<td data-label="Profit" class="num ${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}">${o.productCost == null && o.shippingFee == null ? '<span class="dim">Pending</span>' : money(o.profit)}</td>`}
        <td data-label="Status">${UI.pill(o.status)}</td>
        <td class="num hide-sm">${o.messages ? `<span class="msg-count${o.unreadMessages ? ' unread' : ''}" title="Messages">${ic('chat')}${o.unreadMessages || o.messages}</span> ` : ''}${UI.svg(P.chev).replace('<svg', '<svg class="chev"')}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  const viewOrders = () => `<div class="toolbar"><div class="chips" data-chips></div><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, product, customer…" value="${esc(S.q)}" data-q></label></div>
      <section class="card" data-orders-list></section>`;
  function renderChips() {
    const c = st => S.orders.filter(o => st === 'all' || o.status === st).length;
    $('[data-chips]').innerHTML = ['all', ...STATUSES].filter(st => st === 'all' || c(st) || st === S.filter)
      .map(st => `<button type="button" class="chip${S.filter === st ? ' on' : ''} t-${st}" data-filter="${st}">${st !== 'all' ? '<i class="dot"></i>' : ''}${st === 'all' ? 'All' : UI.LABEL[st]} <span>${c(st)}</span></button>`).join('');
  }
  function renderOrdersList() {
    const q = S.q.toLowerCase();
    const list = S.orders.filter(o => (S.filter === 'all' || o.status === S.filter)
      && (!q || [o.orderRef, o.trackingNumber, o.itemTitle, o.sku, o.buyerName, o.notes, o.destination, place(o.destination)].join(' ').toLowerCase().includes(q)));
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
        : '<p class="muted" style="margin:0">No tracking number yet. Direct Line will add it after the parcel ships.</p>'}</section>
      <section class="card card-pad" data-d-media><h3 class="sec-title">Product photos &amp; link</h3>${productMedia(o)}</section>
      <section class="card card-pad"><h3 class="sec-title">Details</h3><dl class="kv">
        <div><dt>Order number</dt><dd>${esc(o.orderRef) || '—'}</dd></div><div><dt>Order date</dt><dd>${esc(o.orderDate) || fullDate(o.createdAt)}</dd></div>
        ${o.itemTitle ? `<div class="full"><dt>Product</dt><dd>${esc(o.itemTitle)}</dd></div>` : ''}<div><dt>Quantity</dt><dd>${esc(o.quantity || 1)}</dd></div><div><dt>SKU / listing ID</dt><dd>${esc(o.sku) || '—'}</dd></div>
        ${o.variant ? `<div class="full"><dt>Variation / personalization</dt><dd>${esc(o.variant)}</dd></div>` : ''}
        <div><dt>Customer</dt><dd>${esc(o.buyerName) || '—'}</dd></div><div><dt>Country</dt><dd>${esc(place(o.destination))}</dd></div>
        <div class="full"><dt>Delivery address &amp; phone</dt><dd style="white-space:pre-line">${[o.address1, o.address2, o.city, o.region, o.postalCode, o.buyerPhone].filter(Boolean).map(esc).join('\n') || '—'}</dd></div>
        ${o.notes ? `<div class="full"><dt>Notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl></section>
      <section class="card card-pad"><h3 class="sec-title">Sale &amp; fulfilment</h3><div class="money-rows">
        <div class="total"><span>Customer paid</span><span>${esc(o.currency || 'USD')} ${Number(o.sellingPrice || 0).toFixed(2)}</span></div>
        <div><span>Product cost</span><span>${o.productCost == null ? 'Pending Direct Line' : money(o.productCost)}</span></div><div><span>Shipping fee</span><span>${o.shippingFee == null ? 'Pending Direct Line' : money(o.shippingFee)}</span></div>
        <div><span>Total you pay</span><span>${o.productCost == null && o.shippingFee == null ? 'Pending Direct Line' : money(o.price)}</span></div>
        ${o.productCost == null && o.shippingFee == null ? '' : `<div><span>Your estimated profit</span><span class="${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}"><b>${money(o.profit)}</b></span></div>`}</div></section>`;
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
    const today = new Date().toISOString().slice(0, 10);
    const currencies = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD'];
    return `${ed ? '' : `<a class="imp-hint" href="#/import">${ic('upload')}<span><b>Many orders?</b> Import them all at once from your Etsy orders file</span>${ic('chev')}</a>`}<form class="form-layout" id="order-form" novalidate>
      <div class="form-main">
        <section class="card card-pad"><h3 class="form-sec"><i>1</i>Etsy order</h3><div class="form-grid">
          <label class="field"><span>Order number / receipt ID</span><input name="orderRef" required maxlength="120" placeholder="e.g. Etsy #3412" value="${esc(ed?.orderRef)}"></label>
          <label class="field"><span>Order date</span><input name="orderDate" required type="date" value="${esc(ed?.orderDate || today)}"></label>
          <label class="field"><span>Amount paid by customer</span><span class="money"><input name="sellingPrice" required type="number" min="0" step="0.01" inputmode="decimal" value="${ed?.sellingPrice == null ? '' : Number(ed.sellingPrice).toFixed(2)}"></span></label>
          <label class="field"><span>Currency</span><select name="currency">${currencies.map(c => `<option${c === (ed?.currency || 'USD') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>2</i>Item sold</h3><div class="form-grid">
          <div class="field full photo-field"><span>Product photos / screenshots <small data-pick-count></small></span>
            <div class="pm-photos pick-zone" data-picks></div>
            <p class="pick-hint">Add a screenshot of the Etsy order or listing, or a photo of the product (at least 1, up to ${MAX_PHOTOS}). On a computer you can also drag pictures here or paste a screenshot with Ctrl+V.</p></div>
          <div class="field full"><span>Product links <small>one per product</small></span><div class="link-list" data-links></div>
            <button type="button" class="btn btn-sm link-add" data-link-add>+ Add another product link</button></div>
          <label class="field"><span>SKU or listing ID <small>optional</small></span><input name="sku" maxlength="120" placeholder="e.g. LIGHTER-01" value="${esc(ed?.sku)}"></label>
          <label class="field"><span>Quantity</span><input name="quantity" required type="number" min="1" max="999" step="1" inputmode="numeric" value="${ed?.quantity || 1}"></label>
          <label class="field full"><span>Variation / personalization <small>optional</small></span><input name="variant" maxlength="500" placeholder="Color, size, engraving or personalization" value="${esc(ed?.variant)}"></label>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>3</i>Customer &amp; delivery address</h3><div class="form-grid">
          <label class="field full"><span>Customer / recipient name</span><input name="buyerName" required maxlength="160" autocomplete="name" value="${esc(ed?.buyerName)}"></label>
          <label class="field full"><span>Full address &amp; phone <small>street, city, state, postal code, phone</small></span><textarea name="address1" required maxlength="1000" rows="4" placeholder="Paste the whole address from Etsy, plus the phone number if there is one">${esc(ed ? [ed.address1, ed.address2, ed.city, ed.region, ed.postalCode, ed.buyerPhone].filter(Boolean).join('\n') : '')}</textarea></label>
          <label class="field full"><span>Country</span><select name="destination" autocomplete="country"></select></label>
          <label class="field full" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" placeholder="e.g. Sweden" autocomplete="country-name"></label>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>4</i>Notes</h3>
          <label class="field"><span>Anything Direct Line should know <small>optional</small></span><textarea name="notes" maxlength="2000" placeholder="Supplier link, deadline, special packaging or other instructions">${esc(ed?.notes)}</textarea></label>
        </section>
      </div>
      <aside class="form-side">
        <section class="card card-pad order-submit-card"><h3>Order summary</h3>
          <div class="client-order-summary" data-sum></div>
          <div class="next-steps"><b>Direct Line will add</b><ul><li>Product and shipping cost</li><li>Package weight and dimensions</li><li>Tracking number after shipment</li></ul></div>
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
    const setMsg = (t, k) => { const m = $('[data-form-msg]'); m.textContent = t; m.className = 'form-msg ' + (k || ''); };
    // ----- product photos: existing ones (edit) + new picks, uploaded after the order is saved -----
    const locked = ed && ['shipped', 'delivered'].includes(ed.status);
    let picks = (ed?.photos || []).map(p => ({ key: 'p' + p.id, id: p.id }));
    const removed = [];
    let pickSeq = 0;
    const zone = $('[data-picks]', form);
    function renderPicks() {
      zone.innerHTML = picks.map(p => `<figure class="pm-photo"><img src="${p.id ? photoUrl(ed.id, p.id, true) : p.thumb}" alt="Product photo">${p.id && locked ? '' : `<button type="button" class="pm-remove" data-pick-remove="${p.key}" aria-label="Remove photo">×</button>`}</figure>`).join('')
        + (picks.length < MAX_PHOTOS ? `<label class="pm-add${picks.length ? '' : ' big'}"><input type="file" accept="image/*" multiple hidden data-pick-input><span>+</span><small>${picks.length ? 'Add more' : 'Add photo or screenshot'}</small></label>` : '');
      $('[data-pick-count]', form).textContent = picks.length ? `${picks.length} of ${MAX_PHOTOS}` : 'required';
    }
    async function addFiles(files) {
      const list = [...files].filter(f => /^image\//.test(f.type || ''));
      if (!list.length) { setMsg('Please choose a photo or screenshot (JPG, PNG or WebP).', 'err'); return; }
      const room = MAX_PHOTOS - picks.length;
      if (room <= 0) { setMsg(`You can add up to ${MAX_PHOTOS} photos.`, 'err'); return; }
      zone.classList.add('busy');
      let failed = '';
      for (const file of list.slice(0, room)) {
        try { picks.push({ key: 'n' + (++pickSeq), ...(await shrinkImage(file)) }); renderPicks(); }
        catch (ex) { failed = ex.message; }
      }
      zone.classList.remove('busy');
      if (list.length > room) setMsg(`Only ${MAX_PHOTOS} photos fit on one order, so ${list.length - room} weren’t added.`, 'err');
      else setMsg(failed, failed ? 'err' : '');
    }
    form._addFiles = addFiles;
    zone.addEventListener('change', e => { if (e.target.matches('[data-pick-input]')) { addFiles(e.target.files); e.target.value = ''; } });
    zone.addEventListener('click', e => {
      const b = e.target.closest('[data-pick-remove]'); if (!b) return;
      const p = picks.find(x => x.key === b.dataset.pickRemove); if (!p) return;
      if (p.id) removed.push(p.id);
      picks = picks.filter(x => x !== p); renderPicks();
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
    renderPicks();
    // ----- product links: one box per product, add/remove -----
    const linkBox = $('[data-links]', form);
    const linkRow = (v = '') => `<div class="link-row"><input data-link type="url" inputmode="url" maxlength="300" placeholder="https://www.etsy.com/listing/..." value="${esc(v)}"><button type="button" class="btn btn-sm btn-ghost" data-link-remove aria-label="Remove link">×</button></div>`;
    const startLinks = (ed?.productLinks?.length ? ed.productLinks : String(ed?.etsyUrl || '').split(/\s+/).filter(Boolean));
    linkBox.innerHTML = (startLinks.length ? startLinks : ['']).map(linkRow).join('');
    const syncLinks = () => { const rows = $$('.link-row', linkBox); rows.forEach(r => { r.querySelector('[data-link-remove]').hidden = rows.length < 2; }); $('[data-link-add]', form).hidden = rows.length >= 10; };
    syncLinks();
    form.addEventListener('click', e => {
      if (e.target.closest('[data-link-add]')) { linkBox.insertAdjacentHTML('beforeend', linkRow()); syncLinks(); $$('[data-link]', linkBox).pop().focus(); }
      const rm = e.target.closest('[data-link-remove]'); if (rm) { rm.closest('.link-row').remove(); syncLinks(); }
    });
    const need = (field, message) => {
      if (String(field.value || '').trim()) return true;
      setMsg(message, 'err'); field.focus(); return false;
    };
    function updateSum() {
      const paid = parseFloat(form.sellingPrice.value), qty = parseInt(form.quantity.value, 10) || 1;
      $('[data-sum]').innerHTML = `<div><span>Order</span><b>${esc(form.orderRef.value.trim() || 'Not entered')}</b></div><div><span>Items</span><b>${qty}</b></div><div class="total"><span>Customer paid</span><b>${Number.isFinite(paid) ? esc(form.currency.value) + ' ' + paid.toFixed(2) : '—'}</b></div>`;
    }
    form.addEventListener('input', updateSum);
    form.addEventListener('change', updateSum);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!need(form.orderRef, 'Please enter the Etsy order number.')) return;
      if (!need(form.orderDate, 'Please choose the order date.')) return;
      if (!need(form.sellingPrice, 'Please enter what the customer paid.')) return;
      if (!picks.length && ed?.source !== 'etsy-csv') { setMsg('Please add at least one photo or screenshot of the product.', 'err'); zone.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      const linkInputs = $$('[data-link]', form), links = linkInputs.map(i => i.value.trim()).filter(Boolean);
      if (!links.length) { setMsg('Please add the product link (the Etsy listing).', 'err'); linkInputs[0]?.focus(); return; }
      const badLink = linkInputs.find(i => i.value.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(i.value.trim()));
      if (badLink) { setMsg('Please paste each product link in full, starting with https://', 'err'); badLink.focus(); return; }
      if (!need(form.buyerName, 'Please enter the customer or recipient name.')) return;
      if (!need(form.address1, 'Please enter the delivery address.')) return;
      if (!dest.get()) { setMsg(dest.isOther() ? 'Please type the country name.' : 'Please choose the destination country.', 'err'); (dest.isOther() ? form.otherCountry : form.destination).focus(); return; }
      const body = {
        orderRef: form.orderRef.value, orderDate: form.orderDate.value, sellingPrice: form.sellingPrice.value, currency: form.currency.value,
        sku: form.sku.value, quantity: form.quantity.value, variant: form.variant.value, etsyUrl: links.join('\n'),
        buyerName: form.buyerName.value, buyerPhone: '', address1: form.address1.value, address2: '',
        city: '', region: '', postalCode: '', destination: dest.get(), notes: form.notes.value,
      };
      const btn = $('[data-submit]'); btn.disabled = true; setMsg('');
      const fresh = picks.filter(p => !p.id), photoBody = p => ({ data: p.data, thumb: p.thumb, width: p.width, height: p.height });
      let r;
      try {
        r = ed ? await api('/orders/' + ed.id, { method: 'PUT', body })
          : await api('/orders', { method: 'POST', body: { ...body, photos: fresh.slice(0, 1).map(photoBody) } });
      } catch (ex) { setMsg(ex.message, 'err'); btn.disabled = false; return; }
      // The order is saved. Upload the remaining photos one by one (keeps each request small), then remove the ones taken out.
      const orderId = r.order.id, queue = ed ? fresh : fresh.slice(1);
      let failed = 0;
      for (let i = 0; i < queue.length; i++) {
        setMsg(`Uploading photos… ${i + 1} of ${queue.length}`);
        try { await api(`/orders/${orderId}/photos`, { method: 'POST', body: photoBody(queue[i]) }); } catch (ex) { failed++; }
      }
      for (const id of removed) { try { await api(`/orders/${orderId}/photos/${id}/delete`, { method: 'POST' }); } catch (ex) { failed++; } }
      setMsg('');
      await refresh(true);
      S.filter = 'all'; go('orders');
      if (failed) N.popup({ icon: 'alert', tone: 'red', title: 'Some photos didn’t save', text: `${orderName(r.order)} was saved, but ${failed} photo change${failed > 1 ? 's' : ''} didn’t go through. Open the order and edit it to try again.` }, { duration: 12000 });
      else N.popup({ icon: 'check', tone: 'mint', title: ed ? 'Order updated' : 'Order sent', text: ed ? orderName(r.order) + ' was saved.' : `${orderName(r.order)} is pending. Direct Line will add the fulfilment details next.` }, { duration: 6000 });
      setTimeout(() => openOrder(orderId), 200);
    });
    updateSum();
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
  // ---------- import from an Etsy orders file ----------
  let imp = null; // { orders, chosen:Set, problem, unknown, withTotals, result }
  const paidText = o => `${esc(o.currency)} ${Number(o.sellingPrice || 0).toFixed(2)}`;
  function viewImport() {
    return `<div class="imp">
      <section class="card card-pad">
        <h3 class="form-sec"><i>1</i>Download your orders from Etsy</h3>
        <ol class="imp-steps">
          <li>In Etsy open <b>Shop Manager → Settings → Options → Download Data</b>.</li>
          <li>Under <b data-no-i18n>Orders</b>, set <b>CSV Type</b> to <b>Order Items</b>, choose the month and year, and click <b>Download CSV</b>.</li>
          <li><span class="dim">Optional:</span> download the same month again with CSV Type <b data-no-i18n>Orders</b>. With both files we also fill in what each customer paid exactly.</li>
        </ol>
        <h3 class="form-sec" style="margin-top:18px"><i>2</i>Upload the file here</h3>
        <label class="imp-drop" data-imp-drop><input type="file" accept=".csv,text/csv" multiple hidden data-imp-file>${ic('upload')}<b>Choose the Etsy file(s)</b><small>or drag them here · .csv</small></label>
        <p class="form-msg" data-imp-msg></p>
      </section>
      <div data-imp-preview>${impPreview()}</div>
    </div>`;
  }
  function impPreview() {
    if (!imp) return '';
    if (imp.result) {
      const r = imp.result;
      return `<section class="card card-pad imp-done"><h3>${r.created ? `${ic('check')}${r.created} order${r.created === 1 ? '' : 's'} imported` : 'Nothing new was imported'}</h3>
        ${r.created ? '<p>They’re in your Orders list as <b>Pending</b>. We’ll take it from here.</p>' : ''}
        ${r.skipped.length ? `<p class="dim">${r.skipped.length} skipped (already in your orders).</p>` : ''}
        ${r.failed.length ? `<p class="err-text">${r.failed.length} couldn’t be imported:</p><ul class="imp-fail">${r.failed.map(f => `<li><b>${esc(f.orderRef)}</b> — ${esc(f.reason)}</li>`).join('')}</ul>` : ''}
        <div class="imp-actions"><a class="btn btn-primary" href="#/orders">View orders</a><button type="button" class="btn" data-imp-reset>Import another file</button></div></section>`;
    }
    if (imp.problem === 'orders-only') return `<section class="card card-pad imp-warn"><h3>This is the “Orders” file</h3><p>That file has no product links. Please download the CSV Type <b>Order Items</b> as well (step 1) and upload both together.</p></section>`;
    if (imp.problem === 'not-etsy') return `<section class="card card-pad imp-warn"><h3>That doesn’t look like an Etsy orders file</h3><p>Please use the file from Etsy’s <b>Download Data</b> page with CSV Type <b>Order Items</b> (its name starts with <i>EtsySoldOrderItems</i>).</p></section>`;
    if (!imp.orders.length) return `<section class="card card-pad imp-warn"><h3>No orders in this file</h3><p>Pick another month in Etsy and download again.</p></section>`;
    const ready = imp.orders.filter(o => !o.alreadyImported && !o.missing.length);
    const n = imp.chosen.size;
    return `<section class="card">
      <div class="card-head"><h3>${imp.orders.length} order${imp.orders.length === 1 ? '' : 's'} found</h3><label class="imp-all"><input type="checkbox" data-imp-all ${n && n === ready.length ? 'checked' : ''}> Select all</label></div>
      <p class="note" style="margin:0 20px 10px">${imp.withTotals ? '' : 'Customer paid = item prices + shipping from the file. '}Orders already marked shipped on Etsy aren’t selected — tick them if we should still send them.</p>
      <div class="table-wrap"><table class="tbl stack imp-tbl"><thead><tr><th></th><th>Order</th><th>Recipient</th><th>Products</th><th class="num">Customer paid</th></tr></thead><tbody>
      ${imp.orders.map((o, i) => {
        const blocked = o.alreadyImported || o.missing.length;
        const tag = o.alreadyImported ? '<span class="tag">Already imported</span>' : o.missing.length ? `<span class="tag tag-bad">Missing ${esc(o.missing.join(', '))}</span>` : o.shippedOnEtsy ? '<span class="tag">Shipped on Etsy</span>' : '';
        return `<tr class="${blocked ? 'off' : ''}"><td><input type="checkbox" data-imp-pick="${i}" ${imp.chosen.has(i) ? 'checked' : ''} ${blocked ? 'disabled' : ''} aria-label="Import order ${esc(o.orderRef)}"></td>
          <td data-label="Order"><b>${esc(o.orderRef)}</b><small class="dim">${o.orderDate ? esc(fmtDay(o.orderDate)) : ''}</small>${tag}</td>
          <td data-label="Recipient"><b>${esc(o.buyerName)}</b><small class="dim">${esc(o.countryName || o.destination)}</small></td>
          <td data-label="Products" class="imp-prod">${esc(o.itemTitle || '—')}<small class="dim">${o.quantity} item${o.quantity === 1 ? '' : 's'} · ${o.etsyUrl ? o.etsyUrl.split('\n').length : 0} link${o.etsyUrl.split('\n').filter(Boolean).length === 1 ? '' : 's'}</small></td>
          <td data-label="Customer paid" class="num">${paidText(o)}</td></tr>`;
      }).join('')}
      </tbody></table></div>
      <div class="imp-foot"><p class="dim">Etsy’s file has no phone numbers or photos. You can add them to any order later with <b>Edit</b>.</p>
        <button type="button" class="btn btn-primary" data-imp-go ${n ? '' : 'disabled'}>${ic('upload')}Import ${n} order${n === 1 ? '' : 's'}</button></div>
      <p class="form-msg" data-imp-go-msg style="margin:0 20px 16px"></p>
    </section>`;
  }
  function bindImport() {
    const input = $('[data-imp-file]'), drop = $('[data-imp-drop]'), msg = $('[data-imp-msg]');
    const paint = () => { $('[data-imp-preview]').innerHTML = impPreview(); };
    async function load(fileList) {
      const files = [...fileList].filter(f => /\.csv$/i.test(f.name) || f.type === 'text/csv');
      msg.textContent = ''; msg.className = 'form-msg';
      if (!files.length) { msg.textContent = 'Please choose the .csv file you downloaded from Etsy.'; msg.className = 'form-msg err'; return; }
      if (files.some(f => f.size > 5 * 1024 * 1024)) { msg.textContent = 'That file is too big (over 5 MB). Download one month at a time.'; msg.className = 'form-msg err'; return; }
      const texts = await Promise.all(files.map(async f => ({ name: f.name, text: await f.text() })));
      const r = window.DLEtsyImport.build(texts, { countries: COUNTRIES, existingRefs: S.orders.map(o => o.orderRef) });
      imp = { ...r, chosen: new Set(r.orders.map((o, i) => (!o.alreadyImported && !o.missing.length && !o.shippedOnEtsy ? i : -1)).filter(i => i >= 0)), result: null };
      msg.textContent = files.length > 1 ? `Read ${files.length} files.` : `Read ${files[0].name}.`; msg.className = 'form-msg ok';
      paint();
    }
    input.addEventListener('change', () => { if (input.files.length) load(input.files); input.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) load(e.dataTransfer.files); });
    $('[data-imp-preview]').addEventListener('change', e => {
      if (!imp) return;
      if (e.target.matches('[data-imp-all]')) { imp.chosen = new Set(e.target.checked ? imp.orders.map((o, i) => (!o.alreadyImported && !o.missing.length ? i : -1)).filter(i => i >= 0) : []); paint(); }
      if (e.target.matches('[data-imp-pick]')) { const i = Number(e.target.dataset.impPick); if (e.target.checked) imp.chosen.add(i); else imp.chosen.delete(i); paint(); }
    });
    $('[data-imp-preview]').addEventListener('click', async e => {
      if (e.target.closest('[data-imp-reset]')) { imp = null; paint(); msg.textContent = ''; return; }
      const go = e.target.closest('[data-imp-go]'); if (!go || !imp) return;
      const chosen = [...imp.chosen].sort((a, b) => a - b).map(i => imp.orders[i]);
      const m = $('[data-imp-go-msg]');
      go.disabled = true; m.textContent = `Importing ${chosen.length} order${chosen.length === 1 ? '' : 's'}…`; m.className = 'form-msg';
      const total = { created: 0, skipped: [], failed: [] };
      try {
        for (let i = 0; i < chosen.length; i += 100) {
          const part = chosen.slice(i, i + 100).map(({ shippedOnEtsy, alreadyImported, missing, countryName, ...o }) => o);
          const r = await api('/orders/import', { method: 'POST', body: { orders: part } });
          total.created += r.created; total.skipped.push(...r.skipped); total.failed.push(...r.failed);
        }
        imp.result = total; await refresh(); paint(); window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (ex) { go.disabled = false; m.textContent = ex.message; m.className = 'form-msg err'; if (total.created) { imp.result = total; await refresh().catch(() => {}); paint(); } }
    });
  }

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



  // ---------- events ----------
  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-menu]')) { document.body.classList.toggle('menu-open'); return; }
    if (t.closest('[data-close-menu]')) { document.body.classList.remove('menu-open'); return; }
    if (t.closest('[data-logout]')) { logout(); return; }
    if (t.closest('[data-lang-toggle]')) { window.DLi18n?.setLang(window.DLi18n.lang === 'he' ? 'en' : 'he'); return; }
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
  // Paste a screenshot (Ctrl+V) anywhere on the order form to attach it. Normal text pasting into fields is left alone.
  document.addEventListener('paste', e => {
    const form = $('#order-form'); if (!form?._addFiles) return;
    const items = [...(e.clipboardData?.items || [])];
    const files = items.filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (!files.length) return;
    const typing = e.target.matches?.('input, textarea') && items.some(i => i.type === 'text/plain');
    if (typing) return;
    e.preventDefault(); form._addFiles(files);
  });
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
