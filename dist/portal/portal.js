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
  // Net profit = what the customer paid - the Etsy fee the client copies from their Etsy order - what the client pays Direct Line.
  // (Same method as our own profit tracker: Buyer Paid - Etsy Fee - Product Cost.) Only for USD orders, and only with a real fee: nothing is estimated.
  const cents = n => Math.round(Number(n) * 100);
  const isUsd = o => (o.currency || 'USD') === 'USD';
  const netProfit = o => o.status === 'cancelled' || !o.priced || o.sellingPrice == null || o.etsyFee == null || !isUsd(o) ? null : (cents(o.sellingPrice) - cents(o.etsyFee) - cents(o.price)) / 100;
  const netCell = o => {
    if (o.status === 'cancelled') return '<span class="dim">—</span>';
    if (!o.priced) return '<span class="dim">Pending</span>';
    const net = netProfit(o);
    if (net != null) return `<b>${money(net)}</b>`;
    return o.sellingPrice != null && o.etsyFee == null && isUsd(o) ? '<span class="dim">Add Etsy fee</span>' : '<span class="dim">—</span>';
  };
  const customerPaid = o => o.sellingPrice == null ? '' : `${o.currency || 'USD'} ${Number(o.sellingPrice).toFixed(2)}`;
  const inProgress = o => !['delivered', 'cancelled'].includes(o.status);

  // ---------- boot ----------
  async function boot() {
    try { S.me = await api('/me'); }
    catch (e) {
      if (e.status === 401 || e.status === 403) return renderLogin(document.body, { title: 'Welcome back', subtitle: 'Sign in to add and track your orders.', portal: true });
      return bootError(e);
    }
    if (S.me.termsRequired) return termsScreen();
    if (S.me.passwordResetRequired) return passwordScreen();
    if (S.me.role === 'admin') {
      // Admins don't get bounced to the dashboard any more: they pick a client and preview their portal (view only).
      // ?act=1: "Log in as client" — the admin uses the portal with the client's rights (changes are real, logged, recorded as Direct Line).
      const params = new URLSearchParams(location.search), as = Number(params.get('as'));
      if (!as) return adminScreen();
      window.DL_VIEW_AS = as; window.DL_ACT = params.get('act') === '1';
      try { S.me = await api('/me'); } catch (e) { return adminScreen(e.message); }
    }
    shell();
    if (S.me.preview) previewBanner();
    if (S.me.acting) actingBanner();
    $('#boot').remove(); $('#app').hidden = false;
    if (await refresh(true) === false) return;
    route();
    addEventListener('hashchange', route);
    setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(() => {}); });
  }

  const acceptedText = a => a ? `<span>Terms accepted:</span> <time data-no-i18n>${esc(fullDate(a.accepted_at))} · v${a.version}</time>` : '<span>Not accepted yet</span>';
  function policyHTML(data) {
    const text = window.DLi18n?.lang === 'he' ? data.policy.hebrew : data.policy.english;
    return `<article class="card card-pad terms-paper"><h2 id="terms-title">${esc(data.policy.title)}</h2><p class="muted"><span>Version</span> <b data-no-i18n>${data.policy.version}</b></p><div class="terms-content" tabindex="0" aria-labelledby="terms-title" data-no-i18n>${esc(text)}</div></article>`;
  }
  async function termsScreen() {
    try {
      const data = await api('/terms');
      document.body.innerHTML = `<main class="terms-page"><div class="terms-top"><span class="brand"><span>direct<b>↗</b>line.</span></span><button type="button" class="btn btn-sm" data-terms-lang>${window.DLi18n?.lang === 'he' ? 'EN' : 'עב'}</button></div><h1>Terms of Service</h1><p>Please read and accept before using the portal.</p>${policyHTML(data)}<form id="terms-agreement"><label class="terms-check"><input type="checkbox" name="accepted"> <span>I have read and agree to the Terms of Service</span></label><div class="terms-actions"><button type="submit" class="btn btn-primary" disabled>Accept &amp; continue</button><button type="button" class="btn" data-terms-logout>Log out</button></div><p class="form-msg err" role="alert"></p></form></main>`;
      const f = $('#terms-agreement'), b = $('[type=submit]', f);
      f.accepted.addEventListener('change', () => { b.disabled = !f.accepted.checked; });
      f.addEventListener('submit', async e => {
        e.preventDefault(); if (!f.accepted.checked) return; b.disabled = true;
        try { await api('/terms/accept', { method: 'POST', body: { version: data.policy.version, accepted: true } }); location.reload(); }
        catch (ex) { $('.form-msg', f).textContent = ex.message; b.disabled = false; }
      });
      $('[data-terms-lang]').addEventListener('click', () => window.DLi18n.setLang(window.DLi18n.lang === 'he' ? 'en' : 'he'));
      $('[data-terms-logout]').addEventListener('click', logout);
    } catch (ex) { bootError(ex); }
  }
  // Loading failed: say what to do and offer a retry (a dropped connection only gives "Failed to fetch").
  function bootError(ex) {
    const msg = ex.status ? ex.message : 'Couldn’t connect. Check your internet connection and try again.', b = $('#boot');
    if (!b) return N.popup({ icon: 'alert', title: msg });
    $('[data-boot-error]', b)?.remove(); b.style.alignContent = 'center'; b.style.gap = '8px';
    b.insertAdjacentHTML('beforeend', `<div data-boot-error style="display:grid;gap:12px;justify-items:center;text-align:center;padding:24px"><p style="margin:0">${esc(msg)}</p><button type="button" class="btn btn-primary" data-boot-retry>Try again</button></div>`);
    $('[data-boot-retry]', b).addEventListener('click', () => location.reload());
  }
  const viewTerms = () => '<section data-terms-view><p>Loading…</p></section>';
  async function bindTerms() {
    const target = $('[data-terms-view]');
    try { const data = await api('/terms'); if (target.isConnected) target.innerHTML = policyHTML(data) + `<p class="note">${acceptedText(data.accepted)}</p>`; }
    catch (ex) { if (target.isConnected) target.textContent = ex.message; }
  }

  function passwordScreen() {
    document.body.innerHTML = `<div class="login-wrap" style="display:grid;grid-template-columns:1fr;place-items:center"><section class="login-card"><h1>Choose a new password</h1><p>Your temporary password must be replaced before you can use the portal.</p><form id="password-form"><label class="field">New password<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label class="field">Confirm new password<input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button type="submit" class="btn btn-primary">Save password</button><p class="form-msg" role="alert"></p></form><button type="button" class="btn" data-password-logout>Log out</button></section></div>`;
    const f = $('#password-form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('.form-msg', f), b = $('[type=submit]', f);
      if (f.password.value !== f.confirmPassword.value) { m.textContent = 'Passwords do not match.'; return; }
      b.disabled = true;
      try { await api('/password', { method: 'POST', body: { password: f.password.value } }); location.reload(); }
      catch (ex) { m.textContent = ex.message; b.disabled = false; }
    });
    $('[data-password-logout]').addEventListener('click', logout);
  }

  // ---------- admin opening the client portal ----------
  async function adminScreen(err) {
    let clients = [];
    try { clients = (await api('/admin/overview')).clients; } catch (e) { /* ignore */ }
    $('#boot')?.remove();
    const app = $('#app'); app.hidden = false; app.className = 'admin-pick';
    app.innerHTML = `<div class="pick-card card">
      <a class="brand" href="/portal/" style="color:var(--text)"><span>direct<b>↗</b>line.</span><small>CLIENT PORTAL</small></a>
      <div><h1>You’re signed in as the Direct Line admin</h1><p class="muted">This page is the client portal, what your clients see. Pick a client to see their portal exactly as they do, or go back to the admin dashboard.</p></div>
      ${err ? `<p class="form-msg err">${esc(err)}</p>` : ''}
      <div class="pick-list">${clients.length ? clients.map(c => `<a class="pick-row" href="/portal/?as=${c.id}"><span class="avatar">${esc((c.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span><b>${esc(c.name)}</b><small>@${esc(c.username)} · ${c.orders} order${c.orders === 1 ? '' : 's'}${c.active ? '' : ' · disabled'}</small></span><em>See their portal →</em></a>`).join('')
        : '<p class="muted">No client accounts yet. Add one in the admin dashboard → Clients & orders.</p>'}</div>
      <div class="pick-actions"><a class="btn btn-primary" href="/en/#client-orders">Go to admin dashboard</a><button type="button" class="btn" data-pick-logout>Sign out (to log in as a client)</button></div>
      <p class="note">Their portal opens view only. To add orders, photos, products or stores for them, press “Log in as client” at the top of their portal.</p>
    </div>`;
    $('[data-pick-logout]').addEventListener('click', logout);
  }
  function previewBanner() {
    const bar = document.createElement('div');
    bar.className = 'preview-bar';
    bar.innerHTML = `<span><b>Preview:</b> you’re seeing ${esc(S.me.name)}’s portal as admin. View only, nothing you click here changes their account.</span><a href="/portal/?as=${S.me.id}&act=1">Log in as client</a><a href="/portal/">Pick another client</a><a href="${window.DLi18n?.lang === 'he' ? '/' : '/en/'}#client-orders">Back to admin dashboard</a>`;
    document.body.prepend(bar);
    document.body.classList.add('is-preview');
  }
  // Logged in as the client: everything works as for the client (except messages, password and terms), so say clearly that changes are real.
  function actingBanner() {
    const bar = document.createElement('div');
    bar.className = 'preview-bar acting-bar';
    bar.innerHTML = `<span><b>Logged in as ${esc(S.me.name)}.</b> Changes you make here are real and saved to their account. They are recorded as Direct Line.</span><a href="/portal/?as=${S.me.id}">Switch to view only</a><a href="${window.DLi18n?.lang === 'he' ? '/' : '/en/'}#client-orders">Back to admin dashboard</a>`;
    document.body.prepend(bar);
    document.body.classList.add('is-acting');
    // One "logged in" line in the client's activity per tab, not one per reload.
    const key = 'dl-acting-' + S.me.id;
    let logged = false; try { logged = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch (e) { /* private mode */ }
    if (!logged) api('/acting/start', { method: 'POST', body: {} }).catch(() => {});
  }

  // ---------- data ----------
  let known = null;
  async function refresh(first) {
    if (S.me?.termsRequired) return false;
    const me = await api('/me');
    if (me.termsRequired) { S.me = { ...S.me, ...me }; await termsScreen(); return false; }
    const [o, p, n, products, claims, stores] = await Promise.all([api('/orders'), api('/payments'), api('/notifications').catch(() => null),api('/products'),api('/claims'),api('/client-stores')]);
    S.me = { ...S.me, ...me }; S.orders = o.orders; S.payments = p.payments; S.transfers = p.transfers || []; S.adjustments = p.adjustments || []; S.invoices=p.invoices || []; S.products=products.products || [];S.claims=claims.claims || [];S.stores=stores.stores || [];if(first)S.storeId=Number(store.get('dl-client-store-'+S.me.id,0));if(S.storeId&&!S.stores.some(s=>s.id===S.storeId))S.storeId=0;
    if (!first && S.route === 'edit' && !S.orders.some(o => o.id === S.id && editable(o))) { go('orders'); N.popup({ icon: 'alert', title: 'This order is already being processed. Need a change? Send us a message.' }); }
    if (n) { S.notes = n.items; S.seenAt = n.seenAt; }
    const fresh = known ? S.notes.filter(x => !known.has(x.id)) : [];
    known = new Set(S.notes.map(x => x.id));
    updateChrome();
    if (!first) {
      if (S.route !== 'new' && S.route !== 'edit') renderView(true);
      refreshDrawer();
      fresh.slice(0, 3).reverse().map(noteItem).filter(x => x.unread)
        .forEach(x => N.popup(x, { onClick: () => { markRead(x); x.product ? go('products') : x.invoice ? go('payments') : openOrder(x.orderId, x.focus); }, duration: 10000 }));
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
    if(e.kind==='product')it={...base,product:true,action:'View products',icon:'order',tone:'gold',title:'Product quote updated',text:e.productName};
    else if (e.kind === 'invoice') it = {...base, invoice:true, action:'View payments', icon:'wallet',tone:'mint',title:'New invoice available',text:e.detail};
    else if(e.kind==='claim')it={...base,icon:'alert',tone:'gold',title:'Claim updated',text:ref};
    else if (e.kind === 'status') {
      const words = { processing: 'We’re working on it now.', shipped: 'It’s on its way to your customer.', delivered: 'It was delivered to your customer.', cancelled: 'This order was cancelled.', pending: 'It’s back to pending.' };
      it = { ...base, icon: e.detail === 'cancelled' ? 'alert' : e.detail === 'delivered' ? 'check' : 'status', tone: { processing: 'blue', shipped: 'gold', delivered: 'mint', cancelled: 'red' }[e.detail] || 'orange', title: `${ref} is now ${e.detail}`, text: words[e.detail] || '' };
    } else if (e.kind === 'billed') it = { ...base, icon: 'wallet', tone: 'gold', title: 'Order billed', text: `${ref} · ${money(e.detail)}` };
    else if (e.kind === 'tracking') it = { ...base, icon: 'status', tone: 'mint', title: 'Tracking number added', text: `${ref} · ${e.detail}` };
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
        <a href="#/new" data-tab="new" class="fab" aria-label="New order"><span>${ic('plus')}</span>New order</a>
        <a href="#/messages" data-tab="messages">${ic('chat')}Messages<em data-tab-badge></em></a>
        <a href="#/payments" data-tab="payments">${ic('wallet')}Payments</a>
      </nav>${S.me.preview || S.me.acting ? '' : `<a class="client-support" data-client-support href="https://wa.me/972553031093" target="_blank" rel="noopener" aria-label="Contact Direct Line on WhatsApp" title="Contact Direct Line on WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.6A8 8 0 0 1 8.1 18.5L4 20l1.4-4A8 8 0 1 1 20 11.6Z"/><path d="M9 8.5c.5 2 2 3.5 4 4l1-1c.4-.4.8-.2 1.1 0l1.5.7c.4.2.5.5.4.9-.4 1.2-1.5 1.9-2.7 1.7-3.6-.5-6.8-3.7-7.3-7.3-.2-1.2.5-2.3 1.7-2.7.4-.1.7 0 .9.4l.7 1.5c.2.3.4.7 0 1.1l-1.3.7Z"/></svg></a>`}`;
    const bell = $('[data-bell]');
    panel = N.panel({
      anchor: bell,
      onItem: x => { markRead(x); x.product ? go('products') : x.invoice ? go('payments') : openOrder(x.orderId, x.focus); },
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
    panel?.close();
    if (S.me?.termsRequired) return;
    const [hashPath,query='']=location.hash.replace(/^#\/?/,'').split('?');
    const [r,id]=hashPath.split('/');
    const selected=new URLSearchParams(query).get('store');if(selected!==null){S.storeId=Number(selected)||0;if(S.storeId&&!S.stores.some(s=>s.id===S.storeId))S.storeId=0;store.set('dl-client-store-'+S.me.id,S.storeId);}
    if (r === 'import') { location.replace('#/home'); return; }
    S.route = ROUTES[r] ? r : 'home'; S.id = id ? Number(id) : null;
    if (S.route === 'edit' && !S.orders.some(o => o.id === S.id && editable(o))) { location.hash = '#/orders'; return; }
    // Admin preview is view only: no forms for adding or editing orders.
    if (S.me?.preview && ['new', 'edit'].includes(S.route)) { location.hash = '#/home'; return; }
    document.body.classList.remove('menu-open');
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === S.route || (S.route === 'edit' && a.dataset.nav === 'orders')));
    $$('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === S.route));
    $('[data-title]').textContent = ROUTES[S.route].title;
    $('[data-sub]').textContent = ROUTES[S.route].sub;
    $('.new-btn').hidden = S.route === 'new' || S.route === 'edit' || S.route === 'home';
    renderView();
    if (S.route === 'messages' && S.id) openOrder(S.id, 'chat');
    scrollTo({ top: 0 });
  }
  const go = path => { location.hash = '#/' + path; };
  function renderView(soft) {
    const view = $('#view');
    if(soft && S.route==='products' && ($('#product-form')?.dataset.dirty || document.activeElement?.matches?.('[data-pq]')))return;
    if (soft && S.route === 'payments' && $('#transfer-form')?.dataset.dirty) return;
    if(soft && S.route==='stores' && [...document.querySelectorAll('[data-client-store-form]')].some(f=>f.dataset.dirty))return;
    if (soft && S.route === 'orders' && $('[data-orders-list]')) {const sw=$('[data-store-switcher]');if(sw)sw.outerHTML=storeSwitcher(); const er=$('[data-earnings]'); if(er)er.innerHTML=earningsInner(); renderChips(); renderOrdersList(); return; }
    if (!soft && S.route === 'products' && !S.me.preview) { S.productsSeenBefore = store.get(productsSeenKey(), 0); store.set(productsSeenKey(), Math.floor(Date.now() / 1000)); }
    view.innerHTML = { home: viewHome, orders: viewOrders, new: viewForm, edit: viewForm, messages: viewMessages, payments: viewPayments, products:viewProducts, stores:viewStores, terms: viewTerms }[S.route]();
    if(['home','orders','payments'].includes(S.route))view.insertAdjacentHTML('afterbegin',storeSwitcher());
    if (soft) view.querySelectorAll(':scope > *').forEach(el => { el.style.animation = 'none'; });
    ({ orders: bindOrders, new: bindForm, edit: bindForm, terms: bindTerms, payments: bindPayments, products:bindProducts, stores:bindStores })[S.route]?.();
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
    const me = S.me, range=homeRange(), stats=window.DLClientStoreMath.performance(S.stores,S.orders,S.adjustments,range),selected=S.storeId?stats.rows.find(s=>s.id===S.storeId):stats.totals, s={...me.summary,orders:selected?.orders||0,billed:selected?.billed||0,clientProfit:selected?.profit||0};
    const h = new Date().getHours(), hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    // "In progress" and "latest orders" describe the account now, not the selected period: an order sent last
    // month that is still being processed counts, and older orders are never shown as "no orders yet".
    const all = storeOrders(), active = all.filter(inProgress).length;
    const credit = s.outstanding < 0;
    const items = noteItems().filter(x=>(!S.storeId||S.orders.some(o=>o.id===x.orderId&&o.storeId===S.storeId)) && x.time/1000>=Date.parse(range.from+'T00:00:00Z')/1000 && x.time/1000<Date.parse(range.to+'T23:59:59Z')/1000).slice(0,6);
    const newbie = me.summary.orders < 3;
    return `
      <section class="hello"><div><h2>${hello}, <span>${esc((me.name || '').split(' ')[0] || me.username)}</span></h2><p>${all.length ? `You have ${active} order${active === 1 ? '' : 's'} in progress.` : 'Send us your first order to get started.'}</p></div>
        <div class="hello-actions"><a class="btn btn-primary btn-big" href="#/new">${ic('plus')}Send a new order</a></div></section>
      ${window.DLClientStoreUI.periodFields(S.period,S.from,S.to)}
      ${!S.storeId&&S.stores.length>1?`<section class="card card-pad"><h3 class="sec-title">Performance by store</h3>${window.DLClientStoreUI.table(stats)}</section>`:''}
      ${subBanner(me.subscription)}
      ${newbie ? `<section class="card card-pad how"><h3>How it works</h3>
        <ol class="how-steps">
          <li><b>1</b><div><strong>Send us the order</strong><span>Had a sale in your store? Click “Send a new order” and fill in what your customer bought and where to ship it.</span></div></li>
          <li><b>2</b><div><strong>We pack and ship it</strong><span>We buy the product, ship it to your customer and add the tracking number here.</span></div></li>
          <li><b>3</b><div><strong>Pay your balance</strong><span>We add the order total to your balance. Payment by bank transfer.</span></div></li>
        </ol>
        <div class="how-actions"><a class="btn btn-primary btn-big" href="#/new">${ic('plus')}Send a new order</a></div></section>` : ''}
      ${statCardsHTML()}
      <div class="home-grid">
        <section class="card span2"><div class="card-head"><h3>Your latest orders</h3><a class="link" href="#/orders">See all ${all.length ? '(' + all.length + ')' : ''}</a></div>
          ${all.length ? `<div class="table-wrap">${ordersTable(all.slice(0, 5), true)}</div>` : empty('orders', 'No orders yet', 'When you get a sale in your store, send it to us here. We take care of the rest.', '<a class="btn btn-primary" href="#/new">Send a new order</a>')}
        </section>
        <section class="card"><div class="card-head"><h3>Latest updates</h3><button type="button" class="link" data-open-bell>See all</button></div>
          ${items.length ? `<div class="feed">${items.map(x => `<button type="button" class="${x.unread ? 'unread' : ''}" ${x.product ? 'data-product-note="1"' : x.invoice ? 'data-invoice-note="1"' : `data-open-order="${x.orderId}"`} data-focus="${x.focus || ''}" data-note="${x.id}"><span class="dln-ic t-${x.tone}">${N.icon(x.icon)}</span><span style="display:grid;min-width:0"><b>${esc(x.title)}</b><span>${esc(x.text)}</span><time>${esc(N.timeAgo(x.time))}</time></span></button>`).join('')}</div>`
            : empty('bell', 'No updates yet', 'When we change an order’s status or reply to you, it shows up here.')}
        </section>
        <section class="card"><div class="card-head"><h3>Profit over selected period</h3><span class="tag">Selected period</span></div>${profitChart()}</section>
      </div>`;
  }

  // ---------- earnings block: the same cards and profit chart on Home and on Orders ----------
  function earnedNumbers() {
    const range = homeRange(), stats = window.DLClientStoreMath.performance(S.stores, S.orders, S.adjustments, range);
    const selected = S.storeId ? stats.rows.find(x => x.id === S.storeId) : stats.totals;
    return { range, stats, selected, s: { ...S.me.summary, orders: selected?.orders || 0, billed: selected?.billed || 0, clientProfit: selected?.profit || 0 } };
  }
  function statCardsHTML() {
    const me = S.me, { selected, s } = earnedNumbers(), active = storeOrders().filter(inProgress).length;
    return `<section class="stats stats-3">
        <div class="stat hero"><span class="stat-ic">${ic('wallet')}</span><small>${S.storeId?'Billed for this store':'Billed in selected period'}</small><strong>${money(s.billed)}</strong><em><span>Overall account balance</span>: ${money(me.summary.outstanding)}</em></div>
        <div class="stat" style="--tone:var(--blue)"><span class="stat-ic">${ic('orders')}</span><small>Orders in progress</small><strong>${active}</strong><em>${s.orders} order${s.orders === 1 ? '' : 's'} in total</em></div>
        <div class="stat" style="--tone:var(--gold)"><span class="stat-ic">${ic('chart')}</span><small>Your profit</small><strong class="${s.clientProfit < 0 ? 'neg' : ''}">${money(s.clientProfit)}</strong><em>What your customers paid, minus our bill</em>${selected?.missingSalePrice ? `<small><b data-no-i18n>${selected.missingSalePrice}</b> <span>orders missing sale price</span></small>` : ''}</div>
      </section>`;
  }
  // Orders page: period picker on top, then (refreshed on its own) the per-store table, the cards and the chart.
  const earningsTop = () => `<div data-earnings-top>${window.DLClientStoreUI.periodFields(S.period, S.from, S.to)}</div>`;
  function earningsInner() {
    const { stats } = earnedNumbers();
    return `${!S.storeId && S.stores.length > 1 ? `<section class="card card-pad"><h3 class="sec-title">Performance by store</h3>${window.DLClientStoreUI.table(stats)}</section>` : ''}
      ${statCardsHTML()}
      <section class="card"><div class="card-head"><h3>Profit over selected period</h3><span class="tag">Selected period</span></div>${profitChart()}</section>`;
  }

  function profitChart(){
    const range=homeRange(),[fy,fm]=range.from.split('-').map(Number),[ty,tm]=range.to.split('-').map(Number),span=(ty-fy)*12+tm-fm+1,buckets=[];
    if(span<=24){for(let n=0;n<span;n++){const date=new Date(fy,fm-1+n,1),y=date.getFullYear(),m=date.getMonth()+1,key=y+'-'+String(m).padStart(2,'0');buckets.push({from:key+'-01',to:key+'-31',label:date.toLocaleDateString(undefined,{month:'short',year:fy!==ty?'2-digit':undefined})});}}
    else {for(const year of [...new Set(storeOrders().filter(o=>inRange(o,range)).map(o=>window.DLClientStoreMath.dateKey(o).slice(0,4)))].sort())buckets.push({from:year+'-01-01',to:year+'-12-31',label:year});}
    for(const b of buckets){const r={from:b.from<range.from?range.from:b.from,to:b.to>range.to?range.to:b.to},tot=window.DLClientStoreMath.performance(S.stores,storeOrders(),S.adjustments,r).totals;b.profit=tot.profit;b.orders=tot.orders;}
    const max=Math.max(1,...buckets.map(b=>Math.abs(b.profit))),tot=window.DLClientStoreMath.performance(S.stores,storeOrders(),S.adjustments,range).totals;
    return `<div class="bars" role="img" aria-label="Profit over selected period">${buckets.map(b=>`<div class="bar-col" title="${money(b.profit)}"><span class="bar-val">${b.orders||b.profit?money(b.profit):''}</span><i class="${b.profit<0?'neg':''}" style="height:${b.orders||b.profit?Math.max(4,Math.abs(b.profit)/max*100):0}%"></i><small data-no-i18n>${esc(b.label)}</small></div>`).join('')}</div><div class="chart-legend"><span>Profit</span><b>${money(tot.profit)}</b></div>`;
  }

  const unreadOrderIds=()=>new Set(noteItems().filter(x=>x.unread).map(x=>x.orderId));
  function ordersTable(list, compact) {
    const fresh = unreadOrderIds();
    return `<table class="tbl stack"><thead><tr><th>Order</th><th>Customer</th><th>Store</th>${compact ? '' : '<th>Destination</th><th>Tracking</th>'}<th class="num" title="What your customer paid">Price</th><th class="num" title="What you pay Direct Line">Cost</th><th class="num" title="Price minus cost">Profit</th>${compact ? '' : '<th class="num" title="Price minus the Etsy fee you entered minus cost">Net profit</th>'}<th>Status</th><th class="hide-sm"></th></tr></thead><tbody>
      ${list.map(o => `<tr class="click${fresh.has(o.id) ? ' is-new' : ''}" data-open-order="${o.id}" tabindex="0">
        <td class="wide"><div class="ord-ref">${o.photos?.length ? `<img class="ord-thumb" src="${photoUrl(o.id, o.photos[0].id, true)}" alt="" loading="lazy">` : `<span class="ord-ic t-${o.status}">${ic('orders')}</span>`}<span class="t-main"><b>${esc(orderName(o))}${fresh.has(o.id) ? '<span class="dot-new" title="Updated"></span>' : ''}</b><small>${esc(fullDate(o.createdAt))}</small></span></div></td>
        <td data-label="Customer"><span data-no-i18n>${esc(o.buyerName) || '—'}</span></td>
        <td data-label="Store">${window.DLClientStoreUI.label(S.stores.find(s=>s.id===o.storeId))}</td>${compact ? '' : `<td data-label="Destination">${esc(place(o.destination))}</td>
        <td data-label="Tracking">${o.trackingNumber ? `<span class="tracking">${esc(o.trackingNumber)}</span>${o.courier ? `<br><small class="dim" data-no-i18n>${esc(o.courier)}</small>` : ''}` : '<span class="dim">Not yet</span>'}</td>`}
        <td data-label="Price" class="num">${o.sellingPrice == null ? '<span class="dim">—</span>' : `<b>${esc(customerPaid(o))}</b>`}</td>
        <td data-label="Cost" class="num">${o.status === 'cancelled' ? '<span class="dim">—</span>' : !o.priced ? '<span class="dim">Pending</span>' : `<b>${money(o.price)}</b>`}</td>
        <td data-label="Profit" class="num ${o.status !== 'cancelled' && o.profit > 0 ? 'pos' : o.status !== 'cancelled' && o.profit < 0 ? 'neg' : ''}">${o.status === 'cancelled' ? '<span class="dim">—</span>' : !o.priced ? '<span class="dim">Pending</span>' : o.profit == null ? '<span class="dim">—</span>' : `<b>${money(o.profit)}</b>`}</td>
        ${compact ? '' : `<td data-label="Net profit" class="num ${netProfit(o) > 0 ? 'pos' : netProfit(o) < 0 ? 'neg' : ''}">${netCell(o)}</td>`}
        <td data-label="Status">${UI.pill(o.status)}</td>
        <td class="num hide-sm">${o.messages ? `<span class="msg-count${o.unreadMessages ? ' unread' : ''}" title="Messages">${ic('chat')}${o.unreadMessages || o.messages}</span> ` : ''}${UI.svg(P.chev).replace('<svg', '<svg class="chev"')}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  const viewOrders = () => `<details class="earn-box" data-earn${store.get('dl-earn-open', true) ? ' open' : ''}><summary><b>Your earnings</b><small>profit, billing and the chart for the selected period</small></summary>${earningsTop()}<div data-earnings style="display:grid;gap:14px">${earningsInner()}</div></details><div class="toolbar"><div class="chips" data-chips></div><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, product, customer…" value="${esc(S.q)}" data-q></label></div>
      <section class="card" data-orders-list></section>`;
  function renderChips() {
    const c = st => storeOrders().filter(o => st === 'all' || o.status === st).length;
    $('[data-chips]').innerHTML = ['all', ...STATUSES].filter(st => st === 'all' || c(st) || st === S.filter)
      .map(st => `<button type="button" class="chip${S.filter === st ? ' on' : ''} t-${st}" data-filter="${st}">${st !== 'all' ? '<i class="dot"></i>' : ''}${st === 'all' ? 'All' : UI.LABEL[st]} <span>${c(st)}</span></button>`).join('');
  }
  function renderOrdersList() {
    const q = S.q.toLowerCase();
    const list = storeOrders().filter(o => (S.filter === 'all' || o.status === S.filter)
      && (!q || [o.orderRef, o.trackingNumber, o.itemTitle, o.sku, o.buyerName, o.notes, o.destination, place(o.destination),S.stores.find(s=>s.id===o.storeId)?.name].join(' ').toLowerCase().includes(q)));
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
    chatCtl = UI.chat($('[data-d-chat]', d.body), { orderId: o.id, role: 'client', readOnly:!!(S.me.preview || S.me.acting), onLoad: data => {
      drawerEvents = data.events || [];
      const cur = S.orders.find(x => x.id === o.id);
      const hadUnread=cur?.unreadMessages,oldCount=cur?.messages;UI.syncConversation(cur,data);
      if (cur && hadUnread) { cur.unreadMessages = 0; updateChrome(); if (S.route !== 'new' && S.route !== 'edit') renderView(true); }
      if(cur && oldCount!==cur.messages){updateChrome();if(S.route==='messages')renderView(true);}
      if (cur && d.isOpen && d.key === cur.id) fillDrawer(cur, true);
    } });
    // Opening an order marks its notifications as read.
    noteItems().filter(x => x.orderId === o.id && x.unread).forEach(x => reads().add(x.id));
    store.set(readKey(), [...reads()].slice(-300)); updateChrome();
    if (S.route === 'home' || S.route === 'orders') renderView(true);
    if (focus === 'chat') setTimeout(() => { $('[data-d-chat]', d.body)?.scrollIntoView({ block: 'start' }); chatCtl?.focus(); }, 320);
  }
  function fillDrawer(o, keepFoot) {
    if(keepFoot && ($('#claim-form')?.dataset.dirty || $('#customer-form')?.dataset.dirty || $('#numbers-form')?.dataset.dirty))return;
    const d = UI.getDrawer();
    d.head.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2>${esc(orderName(o))}</h2>${UI.pill(o.status)}</div><p>Added ${esc(fullDate(o.createdAt))} · to ${esc(place(o.destination))}</p>`;
    $('[data-d-info]', d.body).innerHTML = `
      <section class="card card-pad">${UI.tracker(o, drawerEvents)}</section>${UI.activity(drawerEvents)}
      ${claimCard(S.claims.find(c=>c.orderId===o.id))}
      <section class="card card-pad"><h3 class="sec-title">Invoices</h3>${invoiceLinks(S.invoices.filter(f=>f.orderIds.includes(o.id)))}</section>
      <section class="card card-pad"><h3 class="sec-title">Tracking</h3>${o.trackingNumber
        ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="tracking" style="font-size:16px;font-weight:600">${esc(o.trackingNumber)}</span>${o.courier ? `<span class="courier-tag"><small>Courier</small> <b data-no-i18n>${esc(o.courier)}</b></span>` : ''}<span style="flex:1"></span><button type="button" class="btn btn-sm" data-copy="${esc(o.trackingNumber)}">${ic('copy')}Copy</button><a class="btn btn-sm" href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${ic('ext')}Track parcel</a></div>`
        : '<p class="muted" style="margin:0">No tracking number yet. Direct Line will add it after the parcel ships.</p>'}</section>
      <section class="card card-pad" data-d-media><h3 class="sec-title">Product photos &amp; link</h3>${productMedia(o)}</section>
      <section class="card card-pad"><h3 class="sec-title">Details</h3><dl class="kv">
        <div><dt>Order number</dt><dd>${esc(o.orderRef) || '—'}</dd></div>${o.deliveredAt ? `<div><dt>Delivered date</dt><dd>${esc(fullDate(o.deliveredAt))}</dd></div>` : ''}${o.cancellationReason ? `<div class="full"><dt>Cancellation reason</dt><dd data-no-i18n>${esc(o.cancellationReason)}</dd></div>` : ''}<div><dt>Order date</dt><dd>${esc(o.orderDate) || fullDate(o.createdAt)}</dd></div>
        ${o.itemTitle ? `<div class="full"><dt>Product</dt><dd>${esc(o.itemTitle)}</dd></div>` : ''}<div><dt>Quantity</dt><dd>${esc(o.quantity || 1)}</dd></div><div><dt>SKU / listing ID</dt><dd>${esc(o.sku) || '—'}</dd></div>
        ${o.variant ? `<div class="full"><dt>Variation / personalization</dt><dd>${esc(o.variant)}</dd></div>` : ''}
        <div><dt>Customer</dt><dd>${esc(o.buyerName) || '—'}</dd></div><div><dt>Country</dt><dd>${esc(place(o.destination))}</dd></div>
        <div class="full"><dt>Delivery address &amp; phone</dt><dd style="white-space:pre-line">${DL.addressLines(o, o.destination ? place(o.destination) : '', true).map(esc).join('\n') || '—'}</dd></div>
        ${o.taxNumber ? `<div class="full"><dt>Tax number</dt><dd data-no-i18n>${esc(o.taxNumber)}</dd></div>` : ''}${o.giftMessage ? `<div class="full"><dt>Gift message</dt><dd data-no-i18n style="white-space:pre-line">${esc(o.giftMessage)}</dd></div>` : ''}
        ${o.notes ? `<div class="full"><dt>Notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl></section>
      <section class="card card-pad"><h3 class="sec-title">Sale &amp; cost</h3><div class="money-rows">
        <div class="total"><span>Customer paid</span><span>${o.sellingPrice == null ? '<span class="dim">Not entered</span>' : esc(customerPaid(o))}</span></div>
        <div><span>Etsy fee</span><span>${o.etsyFee == null ? '<span class="dim">Not entered</span>' : `-${esc(o.currency || 'USD')} ${Number(o.etsyFee).toFixed(2)}`}</span></div>
        <div><span>Total you pay</span><span>${!o.priced ? 'Pending Direct Line' : money(o.price)}</span></div>
        ${o.priced ? `<div><span><span>Per item</span> <small class="dim" data-no-i18n>× ${esc(o.quantity || 1)}</small></span><span>${money(Math.round(o.price / (o.quantity || 1) * 100) / 100)}</span></div>` : ''}
        ${!o.priced ? '' : `<div><span>Your estimated profit</span><span class="${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}"><b>${money(o.profit)}</b></span></div>`}
        ${netProfit(o) == null ? '' : `<div><span>Your net profit</span><span class="${netProfit(o) > 0 ? 'pos' : netProfit(o) < 0 ? 'neg' : ''}"><b>${money(netProfit(o))}</b></span></div>`}</div>
        ${o.priced && o.sellingPrice != null && o.etsyFee != null && !isUsd(o) ? '<p class="note" style="margin:10px 0 0">Net profit is shown for orders in USD.</p>' : ''}</section>
      ${S.me.preview || o.status === 'cancelled' ? '' : `<section class="card card-pad"><h3 class="sec-title">Your numbers</h3><p class="note">Copy these from your Etsy order screen. They only change your profit figures, never your bill.</p>
        <form id="numbers-form" class="form-grid" novalidate>
          <label class="field"><span>Customer paid <small>what the buyer paid</small></span><input name="sellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${o.sellingPrice == null ? '' : Number(o.sellingPrice).toFixed(2)}"></label>
          <label class="field"><span>Currency</span><select name="currency">${['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD'].map(c => `<option${c === (o.currency || 'USD') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Etsy fee <small>fees Etsy took from this order</small></span><input name="etsyFee" type="number" min="0" step="0.01" inputmode="decimal" value="${o.etsyFee == null ? '' : Number(o.etsyFee).toFixed(2)}"></label>
          <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="submit" class="btn btn-primary">Save numbers</button><p class="form-msg" data-numbers-msg style="margin:0" role="status"></p></div>
        </form></section>`}`;
    bindNumbers(o);
    if (keepFoot && d.foot.dataset.confirm) return;
    d.foot.innerHTML = `${editable(o) ? `<div><a class="btn" href="#/edit/${o.id}" data-close-drawer>${ic('edit')}Edit order</a><p class="muted" style="font-size:12px">You can edit for ${hoursLeft(o)} more hours.</p></div>` : `<a class="muted" href="#/messages/${o.id}" data-close-drawer>This order is already being processed. Need a change? Send us a message.</a>`}${canChangeCustomer(o) ? `<button type="button" class="btn" data-change-customer="${o.id}">${ic('edit')}Change customer details</button>` : ''}<span class="spacer"></span>${['pending','processing','shipped'].includes(o.status) ? `<div><button type="button" class="btn btn-danger" data-cancel-order="${o.id}">Request cancellation</button><p class="muted" style="font-size:12px">Free before the item reaches our warehouse. $4 after it arrives at the warehouse, or if the parcel is intercepted.</p></div>` : ''}${o.status === 'shipped' ? `<button type="button" class="btn btn-primary" data-delivered="${o.id}">Mark as delivered</button>` : ''}${!S.claims.some(c=>c.orderId===o.id) && (o.claimEligibility?.problem || o.claimEligibility?.lost) ? `<button type="button" class="btn" data-report-claim="${o.id}">${o.claimEligibility.lost ? 'Report lost parcel' : 'Report a problem'}</button>` : ''}`;
  }
  // "Your numbers": the client's own accounting for one order. Allowed at any time (it never changes the bill).
  function bindNumbers(o) {
    const f = $('#numbers-form'); if (!f) return;
    f.addEventListener('input', () => { f.dataset.dirty = '1'; const m = $('[data-numbers-msg]', f); if (m.classList.contains('err')) { m.textContent = ''; m.className = 'form-msg'; } });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const b = $('[type=submit]', f), m = $('[data-numbers-msg]', f); if (b.disabled) return;
      b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      try {
        await api('/orders/' + o.id, { method: 'PUT', body: { sellingPrice: f.sellingPrice.value, currency: f.currency.value, etsyFee: f.etsyFee.value } });
        f.dataset.dirty = ''; await refresh(); N.popup({ icon: 'check', title: 'Numbers saved' }, { duration: 4000 });
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
    });
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
    const today = localDay();
    const currencies = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD'];
    const extra = !!(ed && (ed.sellingPrice != null || ed.etsyFee != null || ed.sku || ed.notes || (ed.currency && ed.currency !== 'USD')));
    return `<form class="form-layout" id="order-form" novalidate>
      <div class="form-main">
        <section class="card card-pad"><h3 class="form-sec"><i>1</i>Store order number</h3><div class="form-grid">
          <label class="field full" data-f="storeId"${S.stores.filter(s=>!s.archived).length===1&&(!ed||!S.stores.find(s=>s.id===ed.storeId)?.archived)?' hidden':''}><span>Store</span><select name="storeId" required><option value="">Choose a store</option>${S.stores.filter(s=>!s.archived||s.id===ed?.storeId).map(st=>`<option value="${st.id}"${st.id===(ed?.storeId||(S.stores.some(s=>s.id===S.storeId&&!s.archived)?S.storeId:0)||(S.stores.filter(s=>!s.archived).length===1?S.stores.find(s=>!s.archived).id:0))?' selected':''}>${esc(st.name)}</option>`).join('')}</select></label>
          <label class="field" data-f="orderRef"><span>Order number</span><input name="orderRef" required maxlength="120" inputmode="text" placeholder="e.g. 3412345678" value="${esc(ed?.orderRef)}">
            <em class="help">The order number from your store’s order page.</em></label>
          <label class="field" data-f="orderDate"><span>Order date</span><input name="orderDate" required type="date" value="${esc(ed?.orderDate || today)}"></label>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>2</i>What did the customer buy?</h3><div class="form-grid">
          ${!ed ? `<label class="field full"><span>Choose from My Products</span><select name="productId"><option value="">Free-form order</option>${S.products.filter(p=>p.status==='approved').map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.priceOptions?'from '+money(p.unitPrice):money(p.unitPrice)} / unit</option>`).join('')}</select><small data-product-price></small></label><label class="field full" data-f="productOption" hidden><span>Which option did the customer buy?</span><select name="productOption"></select></label>` : ed.quotedUnitPrice!=null ? `<p class="note full"><span>Fixed unit quote</span> <b>${money(ed.quotedUnitPrice)}</b></p>` : ''}
          <div class="field full" data-f="links"><span>Product link <small>Copy from your store</small></span><div class="link-list" data-links></div>
            <button type="button" class="btn btn-sm link-add" data-link-add>+ Add another product</button></div>
          <div class="field full photo-field" data-f="photos"><span>Photo or screenshot of the product <small data-pick-count></small></span>
            <div class="pm-photos pick-zone" data-picks></div>
            <p class="pick-hint">A screenshot of your store order is perfect. You can add up to ${MAX_PHOTOS}.</p></div>
          <label class="field" data-f="quantity"><span>How many?</span><input name="quantity" required type="number" min="1" max="999" step="1" inputmode="numeric" value="${ed?.quantity || 1}"></label>
          <label class="field"><span>Color, size or engraving <small>if any</small></span><input name="variant" maxlength="500" placeholder="e.g. Gold, engraved “M + K”" value="${esc(ed?.variant)}"></label>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>3</i>Customer &amp; delivery address</h3><div class="form-grid">
          <label class="field full" data-f="buyerName"><span>Customer name</span><input name="buyerName" required maxlength="160" autocomplete="off" value="${esc(ed?.buyerName)}"></label>
          <label class="field full" data-f="address1"><span>Full address and phone <small>street, city, state, postal code, phone</small></span><textarea name="address1" required maxlength="2000" rows="3" placeholder="Paste the full delivery address and phone number here" autocomplete="off">${esc(UI.addressText(ed))}</textarea></label>
          <label class="field full" data-f="destination"><span>Country <small data-country-auto></small></span><select name="destination" required aria-describedby="country-error" autocomplete="off"></select><small id="country-error" class="err-text" role="alert" hidden>Please choose a country.</small></label>
          <label class="field full" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" placeholder="e.g. Sweden" autocomplete="off"></label>
          <label class="field full" data-f="taxNumber"><span>Tax number <small>optional · e.g. Etsy’s IOSS number on the order</small></span><input name="taxNumber" maxlength="300" autocomplete="off" data-no-i18n value="${esc(ed?.taxNumber)}" placeholder="e.g. IOSS IM3720000224, EUR 72.37"></label><label class="field full" data-f="giftMessage"><span>Gift message <small>optional · the supplier adds it to the parcel</small></span><textarea name="giftMessage" maxlength="1000" rows="3" autocomplete="off" data-no-i18n>${esc(ed?.giftMessage)}</textarea></label>
        </div></section>
        <details class="card card-pad more"${extra ? ' open' : ''}><summary><span class="form-sec"><i>+</i>More details <small>optional</small></span></summary><div class="form-grid">
          <label class="field"><span>Customer paid <small>for your profit numbers</small></span><span class="money"><input name="sellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${ed?.sellingPrice == null ? '' : Number(ed.sellingPrice).toFixed(2)}"></span></label>
          <label class="field"><span>Currency</span><select name="currency">${currencies.map(c => `<option${c === (ed?.currency || 'USD') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Etsy fee <small>for your net profit</small></span><input name="etsyFee" type="number" min="0" step="0.01" inputmode="decimal" value="${ed?.etsyFee == null ? '' : Number(ed.etsyFee).toFixed(2)}"></label>
          <label class="field full"><span>SKU or listing ID</span><input name="sku" maxlength="120" placeholder="e.g. LIGHTER-01" value="${esc(ed?.sku)}"></label>
          <label class="field full"><span>Note for Direct Line</span><textarea name="notes" maxlength="2000" placeholder="Deadline, gift wrap, special packaging…">${esc(ed?.notes)}</textarea></label>
        </div></details>
      </div>
      <aside class="form-side">
        <section class="card card-pad order-submit-card"><h3>Check and send</h3>
          <div class="client-order-summary" data-sum></div>
          <div class="next-steps"><b>Then Direct Line will</b><ul><li>Buy and pack the product</li><li>Ship it to your customer</li><li>Add the tracking number here</li></ul></div>
          <button class="btn btn-primary btn-block btn-big" type="submit" data-submit>${ed ? 'Save changes' : 'Send order'}</button>
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
    let selectedProduct=null;
    let pickSeq = 0;
    const zone = $('[data-picks]', form);
    function renderPicks() {
      zone.innerHTML = picks.map(p => `<figure class="pm-photo"><img src="${p.id ? photoUrl(ed.id, p.id, true) : p.thumb}" alt="Product photo">${p.productFrom || p.id && locked ? '' : `<button type="button" class="pm-remove" data-pick-remove="${p.key}" aria-label="Remove photo">×</button>`}</figure>`).join('')
        + (picks.length < MAX_PHOTOS ? `<label class="pm-add${picks.length ? '' : ' big'}"><input type="file" accept="image/*" multiple hidden data-pick-input><span>+</span><small>${picks.length ? 'Add more' : 'Add photo or screenshot'}</small></label>` : '');
      $('[data-pick-count]', form).textContent = picks.length ? `${picks.length} of ${MAX_PHOTOS}` : (ed?.source === 'etsy-csv' ? 'optional' : 'required');
      if (picks.length) form.querySelector('[data-f="photos"]')?.classList.remove('bad');
      updateSum();
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
    const linkRow = (v = '') => `<div class="link-row"><input data-link type="url" inputmode="url" maxlength="2000" placeholder="https://..." value="${esc(v)}"><button type="button" class="btn btn-sm btn-ghost" data-link-remove aria-label="Remove link">×</button></div>`;
    const startLinks = (ed?.productLinks?.length ? ed.productLinks : String(ed?.etsyUrl || '').split(/\s+/).filter(Boolean));
    linkBox.innerHTML = (startLinks.length ? startLinks : ['']).map(linkRow).join('');
    const syncLinks = () => { const rows = $$('.link-row', linkBox); rows.forEach(r => { r.querySelector('[data-link-remove]').hidden = rows.length < 2; }); $('[data-link-add]', form).hidden = rows.length >= 10; };
    syncLinks();
    form.addEventListener('click', e => {
      if (e.target.closest('[data-link-add]')) { linkBox.insertAdjacentHTML('beforeend', linkRow()); syncLinks(); $$('[data-link]', linkBox).pop().focus(); }
      const rm = e.target.closest('[data-link-remove]'); if (rm) { rm.closest('.link-row').remove(); syncLinks(); }
    });
    form.productId?.addEventListener('change',()=>{
      selectedProduct=S.products.find(p=>p.id===Number(form.productId.value))||null;
      linkBox.innerHTML=linkRow(selectedProduct?.link||'');syncLinks();
      picks=selectedProduct ? selectedProduct.photoIds.map(id=>({key:'product-'+id,productFrom:true,thumb:'/api/portal/products/'+selectedProduct.id+'/photos/'+id})) : [];
      if(selectedProduct)form.variant.value=selectedProduct.variant;
      const opts=selectedProduct?.priceOptions||null,optBox=$('[data-f="productOption"]',form);
      optBox.hidden=!opts;form.productOption.innerHTML=opts?`<option value="">Choose an option…</option>`+opts.map(o=>`<option value="${esc(o.label)}">${esc(o.label)} · ${money(o.unitPrice)}</option>`).join(''):'';
      showUnit();renderPicks();updateSum();
    });
    // The fixed price per item: the chosen option's price when the product has several.
    function chosenOption(){return selectedProduct?.priceOptions?.find(o=>o.label===form.productOption.value)||null;}
    function unitPrice(){return selectedProduct ? (selectedProduct.priceOptions ? chosenOption()?.unitPrice ?? null : selectedProduct.unitPrice) : ed?.quotedUnitPrice ?? null;}
    function showUnit(){const box=$('[data-product-price]',form);if(!box)return;const u=unitPrice();box.innerHTML=selectedProduct&&u!=null?`<span>Fixed unit quote</span> <b>${money(u)}</b>`:'';}
    form.productOption?.addEventListener('change',()=>{showUnit();updateSum();});
    // ----- check everything at once, mark what's missing -----
    const mark = (key, bad) => { const f = form.querySelector(`[data-f="${key}"]`); if (f) f.classList.toggle('bad', !!bad); };
    form.addEventListener('input', e => { const f = e.target.closest('[data-f]'); if (f) f.classList.remove('bad'); });
    function updateSum() {
      const qty = parseInt(form.quantity.value, 10) || 1, links = $$('[data-link]', form).filter(i => i.value.trim()).length;
      const where = [form.buyerName.value.trim(), dest.label()].filter(Boolean).join(' · ');
      const row = (label, value) => `<div><span>${label}</span><b>${value ? esc(value) : '<em class="miss">not filled in yet</em>'}</b></div>`;
      $('[data-sum]').innerHTML = row('Order number', form.orderRef.value.trim()) + row('Product', links ? `${links} link${links > 1 ? 's' : ''} · ${qty} item${qty > 1 ? 's' : ''}` : '')
        + (unitPrice()!=null ? row('Order total',money(unitPrice()*qty)) : '') + row('Photo', picks.length ? `${picks.length} added` : (ed?.source === 'etsy-csv' ? 'not needed' : '')) + row('Ship to', where && form.address1.value.trim() && dest.get() ? where : '');
    }
    form.addEventListener('input', updateSum);
    form.addEventListener('change', updateSum);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      // A link pasted without https:// (e.g. "www.etsy.com/listing/…") is completed rather than refused.
      $$('[data-link]', form).forEach(i => { i.value = fullLink(i.value); });
      const linkInputs = $$('[data-link]', form), links = linkInputs.map(i => i.value.trim()).filter(Boolean);
      const badLink = linkInputs.find(i => i.value.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(i.value.trim()));
      const missing = [];
      const check = (key, ok, label) => { mark(key, !ok); if (!ok) missing.push([key, label]); };
      check('storeId',form.storeId.value,'store');
      if(selectedProduct?.priceOptions)check('productOption',chosenOption(),'product option');
      check('orderRef', form.orderRef.value.trim(), 'order number');
      check('orderDate', form.orderDate.value, 'order date');
      check('links', links.length && !badLink, badLink ? 'a full product link (starting with https://)' : 'product link');
      check('photos', picks.length || ed?.source === 'etsy-csv', 'photo or screenshot');
      const q = parseInt(form.quantity.value, 10); check('quantity', q >= 1 && q <= 999, 'how many');
      check('buyerName', form.buyerName.value.trim(), 'customer name');
      check('address1', form.address1.value.trim(), 'full address');
      check('destination', dest.get(), 'country');
      $('#country-error').hidden = !!dest.get();
      form.classList.toggle('tried', missing.length > 0);
      if (missing.length) {
        setMsg('Please fill in: ' + missing.map(m => m[1]).join(', ') + '.', 'err');
        const first = form.querySelector(`[data-f="${missing[0][0]}"]`);
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => first?.querySelector('input:not([type=file]),textarea,select')?.focus({ preventScroll: true }), 350);
        return;
      }
      const body = {
        storeId:Number(form.storeId.value),orderRef: form.orderRef.value, orderDate: form.orderDate.value, sellingPrice: form.sellingPrice.value, currency: form.currency.value, etsyFee: form.etsyFee.value,
        sku: form.sku.value, quantity: form.quantity.value, variant: form.variant.value, etsyUrl: links.join('\n'),
        buyerName: form.buyerName.value, ...UI.addressFields(form.address1.value,ed), destination: dest.get(), notes: form.notes.value, taxNumber: form.taxNumber.value, giftMessage: form.giftMessage.value,
      };
      const btn = $('[data-submit]'); btn.disabled = true; setMsg('');
      if(selectedProduct){body.productId=selectedProduct.id;body.quotedUnitPrice=unitPrice();if(selectedProduct.priceOptions)body.productOption=chosenOption().label;}
      const fresh = picks.filter(p => !p.id && !p.productFrom), photoBody = p => ({ data: p.data, thumb: p.thumb, width: p.width, height: p.height });
      let r;
      try {
        r = ed ? await api('/orders/' + ed.id, { method: 'PUT', body })
          : await api('/orders', { method: 'POST', body: { ...body, photos: fresh.slice(0, 1).map(photoBody) } });
      } catch (ex) { setMsg(ex.message, 'err'); btn.disabled = false; return; }
      // The order is saved. Upload the remaining photos one by one (keeps each request small), then remove the ones taken out.
      const orderId = r.order.id, queue = ed || selectedProduct ? fresh : fresh.slice(1);
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
    // Came from "Order this product": that product is already chosen.
    if (!ed && S.orderProduct && form.productId && S.products.some(p => p.id === S.orderProduct && p.status === 'approved')) { form.productId.value = String(S.orderProduct); form.productId.dispatchEvent(new Event('change')); }
    S.orderProduct = null;
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
  // "How to pay" box: bank details from admin settings, each with a Copy button (item #5).
  function howToPay() {
    const b = S.me.settings || {}, user = S.me.username || '';
    const rows = [['Currency', b.bank_currency], ['Account holder name', b.bank_holder], ['Account number', b.bank_account], ['ACH routing number', b.bank_ach],
      ['Wire routing number', b.bank_wire], ['SWIFT/BIC', b.bank_swift], ['Bank name', b.bank_name], ['Bank address', b.bank_address]].filter(r => r[1]);
    if (!rows.length) return '';
    const line = (label, shown, copy) => `<div class="pay-row"><span>${label}</span><b data-no-i18n>${esc(shown)}</b><button type="button" class="btn btn-sm" data-copy="${esc(copy)}">${ic('copy')}Copy</button></div>`;
    return `<section class="card card-pad how-pay"><h3 class="sec-title">How to pay</h3><p class="muted">Send your balance by bank transfer to this account.</p>
      <div class="pay-rows">${rows.map(([l, v]) => line(l, v, v)).join('')}
        ${user ? `<div class="pay-row"><span>Payment reference</span><b><span data-no-i18n>${esc(user)}</span><small>${esc(b.bank_reference || 'Use your Direct Line username as the reference')}</small></b><button type="button" class="btn btn-sm" data-copy="${esc(user)}">${ic('copy')}Copy</button></div>` : ''}</div></section>`;
  }
  const confirmationCards = () => S.transfers.map(t => `<div class="confirmation-row"><div><b>${money(t.amount)}</b> <span class="muted" data-no-i18n>${esc(t.date)}</span><p><a href="/api/portal/files/${t.id}" target="_blank" rel="noopener"><span>Open confirmation</span> <small data-no-i18n>${esc(t.filename)}</small></a></p></div><span class="tag">${t.status === 'recorded' ? 'Recorded' : t.status === 'archived' ? 'Payment archived' : 'Pending review'}</span></div>`).join('');
  function transferForm() {
    if (S.me.preview) return S.transfers.length ? `<section class="card card-pad"><h3 class="sec-title">Your transfer confirmations</h3>${confirmationCards()}</section>` : '';
    const today=localDay();
    return `<section class="card card-pad"><h3 class="sec-title">Upload transfer confirmation</h3><p class="note">Your balance changes only after the team records receipt.</p><form id="transfer-form" class="form-grid" novalidate><label class="field"><span>Amount (USD)</span><input name="amount" type="number" min="0.01" max="9999999" step="0.01" required></label><label class="field"><span>Transfer date</span><input name="date" type="date" value="${today}" required></label><label class="field full"><span>Confirmation file</span><input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required><small>PDF, JPG, PNG or WebP. Maximum 2 MB.</small></label><div class="field full"><button type="submit" class="btn btn-primary">Send confirmation</button></div><p class="form-msg full" data-transfer-msg role="status"></p></form>${S.transfers.length ? `<h3 class="sec-title">Your transfer confirmations</h3>${confirmationCards()}` : ''}</section>`;
  }
  function bindPayments() {
    const monthly=$('#invoice-month-form');if(monthly)monthly.addEventListener('submit',async e=>{e.preventDefault();const msg=$('[data-month-msg]',monthly),b=$('[type=submit]',monthly);msg.textContent='';b.disabled=true;try{const r=await fetch('/api/portal/invoices/month?month='+encodeURIComponent(monthly.month.value),{credentials:'same-origin'});if(!r.ok)throw new Error(r.status===404?'No invoices for this month.':'Could not download invoices.');const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='Direct-Line-invoices-'+monthly.month.value+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(ex){msg.textContent=ex.message;}finally{b.disabled=false;}});

    const f=$('#transfer-form'); if (!f) return;
    f.addEventListener('input',()=>{f.dataset.dirty='1';});
    f.addEventListener('submit',async e=>{
      e.preventDefault();const b=$('[type=submit]',f), m=$('[data-transfer-msg]',f), file=f.file.files[0];
      if (!file || !f.amount.value || !f.date.value) {m.textContent='Fill in the amount, date and confirmation file.';return;} if (file.size>2*1024*1024) {m.textContent='The file is too large. Maximum 2 MB.';return;}
      b.disabled=true;f.dataset.dirty='1';
      try {
        const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read the file.'));r.readAsDataURL(file);});
        const result=await api('/transfers',{method:'POST',body:{amount:Number(f.amount.value),date:f.date.value,file:{data,filename:file.name}}});
        f.dataset.dirty='';await refresh();N.popup({icon:'check',title:result.transfer.status==='pending' ? 'Confirmation sent for review.' : 'This confirmation is already on file.'});
      } catch(ex) {m.textContent=ex.message;b.disabled=false;}
    });
  }
  const homeRange=()=>window.DLClientStoreMath.periodRange(S.period,S.from,S.to)||window.DLClientStoreMath.periodRange('month');
  const inRange=(o,r)=>{const d=window.DLClientStoreMath.dateKey(o);return d>=r.from&&d<=r.to;};
  const storeOrders=()=>S.orders.filter(o=>!S.storeId||o.storeId===S.storeId);
  function storeSwitcher(){return `<div data-store-switcher>${S.stores.length>1?`<div class="chips store-switcher"><button class="chip${!S.storeId?' on':''}" type="button" data-select-store="0">All stores</button>${S.stores.map(s=>`<button class="chip${s.id===S.storeId?' on':''}" type="button" data-select-store="${s.id}">${window.DLClientStoreUI.label(s)}</button>`).join('')}<a class="chip" href="#/stores">+ Add store</a></div>`:''}</div>`;}
  function selectStore(id){S.storeId=Number(id)||0;store.set('dl-client-store-'+S.me.id,S.storeId);location.hash='#/'+S.route+(S.id?'/'+S.id:'')+'?store='+S.storeId;}
  function viewStores(){return `${S.me.preview?'':`<section class="card card-pad">${window.DLClientStoreUI.form(null,S.me.id)}</section>`}${S.stores.map(s=>`<section class="card card-pad">${window.DLClientStoreUI.label(s)}${S.me.preview?'':window.DLClientStoreUI.form(s,S.me.id)}</section>`).join('')}`;}
  function bindStores(){
    for(const f of $$('[data-client-store-form]')){
      f.addEventListener('input',e=>{f.dataset.dirty='1';if(e.target.name==='color')f.dataset.colourEdited='1';});
      f.addEventListener('submit',async e=>{
        e.preventDefault();const b=$('[type=submit]',f),m=$('[data-store-msg]',f);
        if(b.disabled)return;
        b.disabled=true;f.dataset.dirty='1';m.textContent='Saving store...';
        try{
          const result=await api('/client-stores'+(f.dataset.clientStoreForm?'/'+f.dataset.clientStoreForm:''),{method:'POST',body:{name:f.storeName.value,platform:f.platform.value,link:f.link.value,color:f.dataset.clientStoreForm||f.dataset.colourEdited?f.color.value:undefined,archived:!!f.archived?.checked}});
          // Save succeeds independently of unrelated background requests. Keep other drafts.
          const drafts=$$('[data-client-store-form]').filter(other=>other!==f&&other.dataset.dirty).map(other=>({id:other.dataset.clientStoreForm,colourEdited:other.dataset.colourEdited,values:[...other.elements].filter(el=>el.name).map(el=>[el.name,el.type==='checkbox'?el.checked:el.value])}));
          S.stores=S.stores.filter(s=>s.id!==result.store.id).concat(result.store).sort((a,b)=>a.id-b.id);
          if(S.route==='stores'){
            renderView();
            for(const draft of drafts){
              const other=$$('[data-client-store-form]').find(el=>el.dataset.clientStoreForm===draft.id);if(!other)continue;
              for(const [name,value] of draft.values){const el=other.elements.namedItem(name);if(el.type==='checkbox')el.checked=value;else el.value=value;}
              other.dataset.dirty='1';if(draft.colourEdited)other.dataset.colourEdited='1';
            }
            const saved=$$('[data-client-store-form]').find(el=>el.dataset.clientStoreForm===String(result.store.id));
            if(saved)$('[data-store-msg]',saved).textContent='Store saved.';
          }
          N.popup({icon:'check',title:'Store saved.'});
        }catch(ex){m.textContent=ex.message;b.disabled=false;}
      });
    }
  }
  const claimStatus=s=>({open:'Open',approved:'Approved',rejected:'Rejected',resolved:'Resolved'}[s]||s);
  function claimCard(c){return c?`<section class="card card-pad"><h3 class="sec-title">Claim</h3><p><span>${claimStatus(c.status)}</span> · <span>${c.resolution==='refund'?'Refund':'Reshipment'}</span></p><p data-no-i18n>${esc(c.description)}</p>${c.reply?`<p><span>Admin reply</span>: <span data-no-i18n>${esc(c.reply)}</span></p>`:''}${c.reshipmentOrderId?`<button class="btn btn-sm" type="button" data-open-order="${c.reshipmentOrderId}">Open reshipment</button>`:''}${c.fileIds.map(id=>`<p><a href="/api/portal/files/${id}" target="_blank" rel="noopener">Open evidence</a></p>`).join('')}</section>`:'';}
  function showClaimForm(o){
    const lost=o.claimEligibility.lost,refund=lost||o.claimEligibility.refund;
    $('#claim-form')?.remove();const info=$('[data-d-info]',UI.getDrawer().body);info.insertAdjacentHTML('beforeend',`<section class="card card-pad"><form id="claim-form" class="form-grid" data-order-id="${o.id}"><h3 class="full">${lost?'Report lost parcel':'Report a problem'}</h3>${lost?'':`<p class="note full">${refund?`<b data-no-i18n>${o.claimEligibility.daysLeft}</b> <span>days left to choose a full refund or a reshipment</span>`:'Refunds are available within 7 days of delivery.'}</p><label class="field full"><span>Problem type</span><select name="problem"><option value="damaged">Damaged</option><option value="defective">Defective</option><option value="missing_parts">Missing parts</option><option value="wrong_item">Wrong item</option></select></label>`}<label class="field full"><span>Description</span><textarea name="description" maxlength="2000"${lost?'':' required'}></textarea></label><label class="field full"><span>Resolution</span><select name="resolution">${refund?'<option value="refund">Refund</option>':''}<option value="reshipment">Reshipment</option></select></label>${lost?'':`<label class="field full"><span>Photo or video of the problem</span><input name="proof" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required><small>Maximum 2 MB per file; 3 MB total.</small></label><label class="field full"><span>Photo of the shipping label</span><input name="label" type="file" accept="image/jpeg,image/png,image/webp" required></label>`}<button type="submit" class="btn btn-primary">Submit claim</button><p class="form-msg full" data-claim-msg></p></form></section>`);
    const f=$('#claim-form');f.dataset.dirty='1';f.scrollIntoView({block:'start',behavior:'smooth'});f.addEventListener('submit',async e=>{e.preventDefault();const b=$('[type=submit]',f),m=$('[data-claim-msg]',f);b.disabled=true;try{const read=async input=>{const file=input.files[0];if(!file)throw new Error('Add the required evidence files.');if(file.size>2*1024*1024)throw new Error('The file is too large. Maximum 2 MB.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});return{filename:file.name,data};};const body={problem:lost?'lost':f.problem.value,description:f.description.value,resolution:f.resolution.value};if(!lost){body.proof=await read(f.proof);body.label=await read(f.label);}await api('/orders/'+o.id+'/claims',{method:'POST',body});f.dataset.dirty='';await refresh();N.popup({icon:'check',title:'Claim submitted.'});}catch(ex){m.textContent=ex.message;b.disabled=false;}});
  }
  // Customer name, address, phone and country: editable by the client until the parcel ships.
  function showCustomerForm(o){
    $('#customer-form')?.closest('section')?.remove();
    const info=$('[data-d-info]',UI.getDrawer().body),running=o.status==='processing';
    info.insertAdjacentHTML('afterbegin',`<section class="card card-pad"><form id="customer-form" class="form-grid" novalidate><h3 class="full">Change customer details</h3>
      <p class="note full"><span>${running?'Your order is already in progress. Direct Line is told about the change and passes it on to the supplier. If the parcel is already packed, we will message you.':'Direct Line is told about the change straight away.'}</span> <span>You can change these until the parcel ships.</span></p>
      <label class="field full" data-f="buyerName"><span>Customer name</span><input name="buyerName" required maxlength="160" autocomplete="off" value="${esc(o.buyerName)}"></label>
      <label class="field full" data-f="address1"><span>Full address and phone <small>street, city, state, postal code, phone</small></span><textarea name="address1" required maxlength="2000" rows="4" autocomplete="off">${esc(UI.addressText(o))}</textarea></label>
      <label class="field full" data-f="destination"><span>Country</span><select name="destination" required autocomplete="off"></select></label>
      <label class="field full" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" autocomplete="off" placeholder="e.g. Sweden"></label>
      <label class="field full" data-f="taxNumber"><span>Tax number <small>optional · e.g. Etsy’s IOSS number on the order</small></span><input name="taxNumber" maxlength="300" autocomplete="off" data-no-i18n value="${esc(o?.taxNumber)}" placeholder="e.g. IOSS IM3720000224, EUR 72.37"></label><label class="field full" data-f="giftMessage"><span>Gift message <small>optional · the supplier adds it to the parcel</small></span><textarea name="giftMessage" maxlength="1000" rows="3" autocomplete="off" data-no-i18n>${esc(o?.giftMessage)}</textarea></label>
      <div class="full" style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn btn-primary">Save customer details</button><button type="button" class="btn" data-customer-cancel>Cancel</button></div>
      <p class="form-msg full" data-customer-msg role="alert"></p></form></section>`);
    const f=$('#customer-form'),dest=window.DL.destinationPicker(f.destination,$('[data-other-country]',f));dest.set(o.destination||'');
    f.dataset.dirty='1';f.scrollIntoView({block:'start',behavior:'smooth'});
    f.addEventListener('input',e=>{e.target.closest('[data-f]')?.classList.remove('bad');const m=$('[data-customer-msg]',f);if(m.classList.contains('err')){m.textContent='';m.className='form-msg full';}});
    f.addEventListener('submit',async e=>{
      e.preventDefault();const b=$('[type=submit]',f),m=$('[data-customer-msg]',f);if(b.disabled)return;
      const name=f.buyerName.value.trim(),address=f.address1.value.trim(),country=dest.get(),missing=[];
      for(const [key,ok,label] of [['buyerName',name,'customer name'],['address1',address,'full address'],['destination',country,'country']]){f.querySelector(`[data-f="${key}"]`)?.classList.toggle('bad',!ok);if(!ok)missing.push(label);}
      if(missing.length){m.textContent='Please fill in: '+missing.join(', ')+'.';m.className='form-msg full err';return;}
      b.disabled=true;m.textContent='';
      try{
        await api('/orders/'+o.id,{method:'PUT',body:{buyerName:name,...UI.addressFields(address,o),destination:country,taxNumber:f.taxNumber.value,giftMessage:f.giftMessage.value}});
        f.dataset.dirty='';await refresh();chatCtl?.reload?.();
        N.popup({icon:'check',title:'Customer details updated',text:running?'Direct Line has been told. If the parcel is already packed, we will message you.':'Direct Line has been told about the change.'},{duration:7000});
      }catch(ex){m.textContent=ex.message;m.className='form-msg full err';b.disabled=false;}
    });
  }
  // My Products: filter by status (remembered), search, newest change first; "Updated" marks prices set since the last visit.
  const P_FILTERS=[['all','All'],['awaiting_quote','Waiting for price'],['approved','Priced'],['not_available','Not available']];
  const P_TONE={awaiting_quote:'t-pending',approved:'t-delivered',not_available:'t-cancelled'};
  const productStatus=s=>({awaiting_quote:'Waiting for price',approved:'Priced',not_available:'Not available'}[s]||s);
  const productsSeenKey=()=>'dl-products-seen-'+S.me.id;
  function productRow(p){
    const fresh=S.productsSeenBefore&&p.status!=='awaiting_quote'&&p.updatedAt>S.productsSeenBefore;
    const price=p.status==='not_available'?'':p.priceOptions?`<ul class="price-options">${p.priceOptions.map(o=>`<li><span data-no-i18n>${esc(o.label)}</span> <b>${money(o.unitPrice)}</b></li>`).join('')}</ul><small class="dim">shipping not included</small>`:p.unitPrice!=null?`<b class="mp-price">${money(p.unitPrice)}</b><small class="dim">per item · shipping not included</small>`:'<small class="dim">Our supplier is checking the price.</small>';
    return `<article class="mp-row${fresh?' is-new':''}" data-open-product="${p.id}">${p.photoIds[0]?`<img src="/api/portal/products/${p.id}/photos/${p.photoIds[0]}" width="64" height="64" alt="Product photo">`:'<span class="mp-ph"></span>'}<div class="mp-main"><button type="button" class="mp-name" data-open-product="${p.id}" data-no-i18n>${esc(p.name)}</button>${p.variant?`<small data-no-i18n>${esc(p.variant)}</small>`:''}<small><a href="${esc(p.link)}" target="_blank" rel="noopener">Product link</a> · <span>Updated</span> <time data-no-i18n datetime="${new Date(p.updatedAt*1000).toISOString()}" title="${esc(fullDate(p.updatedAt))}">${esc(new Date(p.updatedAt*1000).toLocaleDateString('en-GB',{timeZone:window.DL.displayTimeZone()}))}</time></small>${p.note?`<p class="mp-note" data-no-i18n>${esc(p.note)}</p>`:''}</div><div class="mp-side"><span class="chip mp-status ${P_TONE[p.status]||''}"><i class="dot"></i>${productStatus(p.status)}</span>${fresh?`<span class="tag tag-gold">${p.status==='approved'?'New price':'Updated'}</span>`:''}${price}</div></article>`;
  }
  // Product details in the side panel: all photos, price (or each option), supplier note, dates, and "Order this product".
  function openProduct(id){
    const p=S.products.find(x=>x.id===Number(id));if(!p)return;
    const d=UI.getDrawer();chatCtl?.destroy();chatCtl=null;d.foot.dataset.confirm='';d.onClose=null;d.open('p'+p.id);
    d.head.innerHTML=`<h2 data-no-i18n>${esc(p.name)}</h2><p><span class="chip mp-status ${P_TONE[p.status]||''}"><i class="dot"></i>${productStatus(p.status)}</span></p>`;
    const row=(label,value)=>value?`<div><dt>${label}</dt><dd>${value}</dd></div>`:'';
    const price=p.status==='not_available'?'<span class="dim">—</span>':p.priceOptions?`<ul class="price-options">${p.priceOptions.map(o=>`<li><span data-no-i18n>${esc(o.label)}</span> <b>${money(o.unitPrice)}</b></li>`).join('')}</ul>`:p.unitPrice!=null?`<b>${money(p.unitPrice)}</b>`:'<span class="dim">Our supplier is checking the price.</span>';
    d.body.innerHTML=`${p.photoIds.length?`<section class="mp-photos">${p.photoIds.map(ph=>`<a href="/api/portal/products/${p.id}/photos/${ph}" target="_blank" rel="noopener"><img src="/api/portal/products/${p.id}/photos/${ph}" alt="Product photo"></a>`).join('')}</section>`:''}
      <section class="card card-pad"><h3 class="sec-title">Price per item</h3>${price}${p.status!=='not_available'?'<p class="note" style="margin:10px 0 0">Shipping is not included; it is added on each order.</p>':''}${p.note?`<p class="mp-note" data-no-i18n>${esc(p.note)}</p>`:''}</section>
      <section class="card card-pad"><dl class="kv">${row('Variation',p.variant?`<span data-no-i18n>${esc(p.variant)}</span>`:'')}${row('Expected per month',p.expectedQuantity?String(p.expectedQuantity):'')}${row('Sent for quote',`<time data-no-i18n>${esc(fullDate(p.createdAt))}</time>`)}${row('Updated',`<time data-no-i18n>${esc(fullDate(p.updatedAt))}</time>`)}${row('Product link',`<a href="${esc(p.link)}" target="_blank" rel="noopener" data-no-i18n>${esc(p.link)}</a>`)}</dl></section>`;
    d.foot.innerHTML=p.status==='approved'&&!S.me.preview?`<a class="btn btn-primary" href="#/new" data-order-product="${p.id}" data-close-drawer>${ic('plus')}Order this product</a><button type="button" class="btn" data-close-drawer>Close</button>`:`<button type="button" class="btn" data-close-drawer>Close</button>`;
  }
  function productListHTML(){
    const f=S.productFilter,q=(S.productQ||'').trim().toLowerCase();
    const shown=S.products.filter(p=>(f==='all'||p.status===f)&&(!q||[p.name,p.variant,p.link].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.updatedAt-a.updatedAt||b.id-a.id);
    return shown.length?shown.map(productRow).join(''):empty('tag',S.products.length?'No products match':'No products yet',S.products.length?'Try another filter or search.':'Send a product for a quote and its price shows up here.');
  }
  function productChips(){const n=k=>k==='all'?S.products.length:S.products.filter(p=>p.status===k).length;return P_FILTERS.map(([k,l])=>`<button type="button" class="chip${S.productFilter===k?' on':''} ${P_TONE[k]||''}" data-pfilter="${k}" aria-pressed="${S.productFilter===k}">${k!=='all'?'<i class="dot"></i>':''}${l} <span>${n(k)}</span></button>`).join('');}
  function viewProducts(){
    if(!S.productFilter)S.productFilter=store.get('dl-products-filter','all');
    const add=S.me.preview?'':`<details class="card card-pad add-product" data-add-product${S.addProductOpen||!S.products.length?' open':''}><summary><span><b>Send a product for a quote</b><small class="dim">Check product prices before you sell them</small></span><span class="btn btn-primary btn-sm">${ic('plus')}Add product</span></summary><form id="product-form" class="form-grid"><label class="field"><span>Product name <small>optional</small></span><input name="name" maxlength="160"></label><label class="field"><span>Product link</span><input name="link" type="url" maxlength="1000" required></label><label class="field"><span>Variant notes</span><input name="variant" maxlength="500"></label><label class="field"><span>Expected monthly quantity <small>optional</small></span><input name="expectedQuantity" type="number" min="1" step="1"></label><label class="field full"><span>Product photos <small>one to three</small></span><input name="photos" type="file" accept="image/*" multiple required></label><button type="submit" class="btn btn-primary">Send for quote</button><p class="form-msg" data-product-msg></p><p class="note full" style="margin:0">Our supplier checks the product price. You’ll see it here as the price per item; shipping is added on each order.</p></form></details>`;
    return `${add}<section class="card card-pad"><h3 class="sec-title">My Products</h3><div class="toolbar mp-toolbar"><div class="chips" data-pchips>${productChips()}</div><label class="search"><span class="sr">Search products</span>${ic('search')}<input type="search" placeholder="Search products…" value="${esc(S.productQ||'')}" data-pq></label></div><div data-plist>${productListHTML()}</div></section>`;
  }
  function bindProducts(){
    $('[data-pchips]')?.addEventListener('click',e=>{const b=e.target.closest('[data-pfilter]');if(!b)return;S.productFilter=b.dataset.pfilter;store.set('dl-products-filter',S.productFilter);$('[data-pchips]').innerHTML=productChips();$('[data-plist]').innerHTML=productListHTML();});
    $('[data-pq]')?.addEventListener('input',e=>{S.productQ=e.target.value;$('[data-plist]').innerHTML=productListHTML();});
    $('[data-add-product]')?.addEventListener('toggle',e=>{S.addProductOpen=e.target.open;});
    const f=$('#product-form');if(!f)return;f.addEventListener('input',()=>{f.dataset.dirty='1';});f.addEventListener('change',()=>{f.dataset.dirty='1';});f.addEventListener('submit',async e=>{e.preventDefault();const b=$('[type=submit]',f),m=$('[data-product-msg]',f);b.disabled=true;m.textContent='';try{const files=[...f.photos.files];if(!files.length||files.length>3)throw new Error('Add one to three product photos.');const photos=[];for(const file of files){const p=await shrinkImage(file);photos.push({filename:file.name,data:p.data});}await api('/products',{method:'POST',body:{name:f.name.value,link:f.link.value,variant:f.variant.value,expectedQuantity:f.expectedQuantity.value,photos}});f.dataset.dirty='';await refresh();N.popup({icon:'check',title:'Product sent for quote.'});}catch(ex){m.textContent=ex.message;b.disabled=false;}});}
  function invoiceLinks(files) {
    return files.length ? files.map(f=>`<p><a class="btn btn-sm" href="/api/portal/files/${f.id}" target="_blank" rel="noopener"><span>Download invoice</span> <small data-no-i18n>${esc(f.filename)}</small></a></p>`).join('') : '<span class="muted">Invoice pending</span>';
  }
  function viewPayments() {
    const s = S.me.summary, credit = s.outstanding < 0, adjustments=S.adjustments.filter(a=>!S.storeId||S.orders.some(o=>o.id===a.orderId&&o.storeId===S.storeId));
    return `<section class="stats">
        <div class="stat"><small>Total billed</small><strong>${money(s.billed)}</strong><em>${s.orders} order${s.orders === 1 ? '' : 's'}, cancelled ones not counted</em></div>
        <div class="stat"><small>Paid</small><strong class="pos">${money(s.paid)}</strong><em>${S.payments.length} payment${S.payments.length === 1 ? '' : 's'}</em></div>
        <div class="stat hero"><small>${credit ? 'Credit on your account' : 'Balance due'}</small><strong>${money(Math.abs(s.outstanding))}</strong><em>${credit ? 'It counts toward your next orders' : s.outstanding > 0 ? 'Please send this to Direct Line' : 'You’re all paid up'}</em></div>
      </section>
      ${S.storeId ? `<section class="card card-pad"><span>Billed for this store</span>: <b>${money(window.DLClientStoreMath.performance(S.stores,S.orders,S.adjustments).rows.find(s=>s.id===S.storeId)?.billed||0)}</b><p class="muted">Payments cover all stores in this account.</p></section>` : ''}
      ${adjustments.length ? `<section class="card card-pad"><h3 class="sec-title">Balance adjustments</h3>${adjustments.map(a=>`<div class="confirmation-row"><a href="#/orders" data-open-order="${a.orderId}">${esc(a.orderRef || '#'+a.orderId)}</a><span>${esc(a.note)}</span><b>${money(a.amount)}</b></div>`).join('')}</section>` : ''}
      ${howToPay()}
      ${transferForm()}
      <section class="card"><div class="card-head" style="padding-bottom:6px"><h3>Payment history</h3><form id="invoice-month-form"><label class="field"><span>Invoice month</span><input type="month" name="month" value="${localDay().slice(0,7)}" required></label><button class="btn btn-sm" type="submit">Download all invoices for month</button><p data-month-msg class="form-msg"></p></form></div>
        ${S.payments.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Date</th><th>Method</th><th>Note</th><th>Invoice</th><th class="num">Amount</th></tr></thead><tbody>
          ${S.payments.map(p => `<tr><td data-label="Date">${esc(fullDate(p.paidAt))}</td><td data-label="Method">${esc(p.method) || '—'}</td><td data-label="Note" class="wide">${esc(p.note) || '<span class="dim">—</span>'}</td><td data-label="Invoice">${invoiceLinks(S.invoices.filter(f=>f.paymentId===p.id))}</td><td data-label="Amount" class="num"><b class="pos">${money(p.amount)}</b></td></tr>`).join('')}
        </tbody></table></div>` : empty('wallet', 'No payments yet', 'When we receive a payment from you, we record it here.')}
      </section>
      <p class="note">Your bill is the total of each order. The Direct Line team records payments when they arrive.</p>`;
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
    const st=t.closest('[data-select-store]');if(st){selectStore(st.dataset.selectStore);return;}
    const f = t.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; renderChips(); renderOrdersList(); return; }
    const gf = t.closest('[data-go-filter]'); if (gf) { S.filter = gf.dataset.goFilter; S.q = ''; go('orders'); return; }
    if (t.closest('[data-ask-go]')) { openOrder($('[data-ask]').value, 'chat'); return; }
    const productNote=t.closest('[data-product-note]');if(productNote){const note=noteItems().find(x=>x.id===productNote.dataset.note);if(note)markRead(note);go('products');return;}
    const invoiceNote=t.closest('[data-invoice-note]');if(invoiceNote){const note=noteItems().find(x=>x.id===invoiceNote.dataset.note);if(note)markRead(note);go('payments');return;}
    const oo = t.closest('[data-open-order]');
    if (oo && !t.closest('a')) {
      const note = oo.dataset.note && noteItems().find(x => x.id === oo.dataset.note);
      if (note) markRead(note);
      openOrder(oo.dataset.openOrder, oo.dataset.focus);
    }
  }
  // The earnings block on Orders can be folded away; the choice is remembered on this device.
  document.addEventListener('toggle', e => { if (e.target.matches?.('[data-earn]')) store.set('dl-earn-open', e.target.open); }, true);
  document.addEventListener('change',e=>{const f=e.target.closest('[data-period-form]');if(!f)return;if(e.target.name==='period'){S.period=f.period.value;renderView();}else {S.from=f.from.value;S.to=f.to.value;if(window.DLClientStoreMath.periodRange('custom',S.from,S.to))renderView();}});
  document.addEventListener('submit',e=>{if(e.target.matches('[data-period-form]'))e.preventDefault();});
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
    const orderProduct = t.closest('[data-order-product]'); if (orderProduct) S.orderProduct = Number(orderProduct.dataset.orderProduct);
    if (t.closest('[data-close-drawer]')) { UI.getDrawer().close(); return; }
    const openP = t.closest('[data-open-product]'); if (openP && !t.closest('a')) { openProduct(openP.dataset.openProduct); return; }
    const cp = t.closest('[data-copy]');
    if (cp) {
      try {
        await navigator.clipboard.writeText(cp.dataset.copy);
        const before = cp.dataset.copyLabel ?? (cp.dataset.copyLabel = cp.innerHTML);
        cp.innerHTML = ic('check') + 'Copied';
        clearTimeout(cp._copyTimer); cp._copyTimer = setTimeout(() => { if (cp.isConnected) cp.innerHTML = before; }, 2000);
      } catch (ex) { /* no clipboard */ }
      return;
    }
    const changeCustomer=t.closest('[data-change-customer]');if(changeCustomer){const o=S.orders.find(o=>o.id===Number(changeCustomer.dataset.changeCustomer));if(o&&canChangeCustomer(o))showCustomerForm(o);return;}
    const cancelCustomer=t.closest('[data-customer-cancel]');if(cancelCustomer){$('#customer-form')?.closest('section')?.remove();refreshDrawer();return;}
    const report=t.closest('[data-report-claim]');if(report){const o=S.orders.find(o=>o.id===Number(report.dataset.reportClaim));if(o)showClaimForm(o);return;}
    // Marking delivered starts the claim window, so it is confirmed first (like a cancellation request).
    const delivered=t.closest('[data-delivered]');
    if(delivered){const foot=UI.getDrawer().foot;foot.dataset.confirm='1';foot.innerHTML=`<span style="font-weight:600">Has your customer received the parcel?</span><p class="muted" style="font-size:12px;margin:0">Only mark it as delivered once it has arrived.</p><span class="spacer"></span><button type="button" class="btn" data-keep>Not yet</button><button type="button" class="btn btn-primary" data-really-delivered="${delivered.dataset.delivered}">Yes, mark as delivered</button>`;return;}
    const reallyDelivered=t.closest('[data-really-delivered]');
    if(reallyDelivered){reallyDelivered.disabled=true;try{await api('/orders/'+reallyDelivered.dataset.reallyDelivered+'/mark-delivered',{method:'POST',body:{}});UI.getDrawer().foot.dataset.confirm='';await refresh();N.popup({icon:'check',title:'Marked as delivered'});}catch(ex){reallyDelivered.disabled=false;N.popup({icon:'alert',title:ex.message});}return;}
    const c = t.closest('[data-cancel-order]');
    if (c) {
      const foot = UI.getDrawer().foot; foot.dataset.confirm = '1';
      foot.innerHTML = `<span style="font-weight:600">Request cancellation?</span><label class="field"><span>Reason <small>optional</small></span><input name="cancellationReason" maxlength="1000"></label><span class="spacer"></span><button type="button" class="btn" data-keep>Keep it</button><button type="button" class="btn btn-danger" data-really-cancel="${c.dataset.cancelOrder}">Send cancellation request</button>`;
      return;
    }
    if (t.closest('[data-keep]')) { const d = UI.getDrawer(); d.foot.dataset.confirm = ''; fillDrawer(S.orders.find(x => x.id === d.key)); return; }
    const rc = t.closest('[data-really-cancel]');
    if (rc) {
      rc.disabled = true;
      try {
        await api('/orders/' + rc.dataset.reallyCancel + '/request-cancellation', { method: 'POST', body: { reason: $('[name=cancellationReason]',UI.getDrawer().foot).value } });
        UI.getDrawer().foot.dataset.confirm = '';
        await refresh();
        N.popup({ icon: 'alert', tone: 'red', title: 'Cancellation requested' }, { duration: 5000 });
      } catch (ex) { rc.disabled = false; N.popup({ icon: 'alert', tone: 'red', title: 'Couldn’t request cancellation', text: ex.message }); }
    }
  });

  boot();
})();
