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

