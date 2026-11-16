
  // ---------- sign in, top bar ----------
  function brand() { return `<span class="brand"><span>direct<b>↗</b>line.</span><small>${t('SUPPLIER PORTAL')}</small></span>`; }
  function langSwitch() {
    return `<div class="sp-lang" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="${lang === 'en'}">EN</button><button type="button" data-lang="zh" aria-pressed="${lang === 'zh'}">中文</button></div>`;
  }
  function loginScreen() {
    document.body.innerHTML = `<main class="sp-login"><div class="sp-login-top">${brand()}${langSwitch()}</div>
      <section class="sp-login-card card card-pad"><h1>${t('Sign in')}</h1><p class="muted">${t('Sign in to see your billing.')}</p>
        <form id="sp-login" novalidate><label class="field"><span>${t('Username')}</span><input name="username" autocomplete="username" required></label>
          <label class="field"><span>${t('Password')}</span><input name="password" type="password" autocomplete="current-password" required></label>
          <label class="sp-check"><input type="checkbox" name="remember"> <span>${t('Keep me signed in')}</span></label>
          <button type="submit" class="btn btn-primary btn-block">${t('Sign in')}</button><p class="form-msg" role="alert"></p></form></section></main>`;
    const f = $('#sp-login');
    f.username.focus();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const b = $('[type=submit]', f), m = $('.form-msg', f); if (b.disabled) return; b.disabled = true; m.textContent = '';
      try {
        const r = await fetch('/api/portal/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: f.username.value.trim(), password: f.password.value, remember: f.remember.checked }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok) { if (d.role !== 'supplier') { location.href = d.redirect || '/'; return; } return boot(); }
        m.textContent = t(r.status === 401 ? 'Wrong username or password.' : r.status === 429 ? 'Too many tries. Please wait 15 minutes.' : 'Could not connect. Please try again.'); m.className = 'form-msg err';
      } catch (ex) { m.textContent = t('Could not connect. Please try again.'); m.className = 'form-msg err'; }
      b.disabled = false;
    });
  }
  // Orders · Quotes · Price requests · Billing, each with what waits for the supplier.
  function navItems(cls) {
    const A = S.alerts || {}, items = [['orders', 'Orders', ICON.box, A.newOrders, ['orders']], ['quotes', 'Quotes', ICON.tag, A.quotes, ['quotes']], ['requests', 'Price requests', ICON.swap, A.requests, ['requests']], ['receipts', 'Receipts', ICON.receipt, A.receiptsSentBack, ['receipts']], ['billing', 'Billing', ICON.bill, 0, ['billing', 'client']]];
    return items.map(([h, l, ic, n, pages]) => `<a href="#${h}"${cls ? ` class="${cls}"` : ''} aria-current="${pages.includes(S.page) ? 'page' : 'false'}">${ic}<span>${t(l)}</span>${n ? `<b class="sp-badge">${n}</b>` : ''}</a>`).join('');
  }
  function shell(inner) {
    const name = S.me?.name || '', ini = name.trim().slice(0, 1).toUpperCase() || 'S';
    return `<header class="sp-top"><a class="sp-home" href="#orders" aria-label="${esc(t('Billing'))}">${brand()}</a>
      <nav class="sp-nav">${navItems('sp-tab')}</nav>
      <div class="sp-right">${langSwitch()}${bellHTML()}
        <details class="sp-me"><summary aria-label="${esc(t('Supplier'))}"><span class="sp-ava">${esc(ini)}</span><span class="sp-who"><b>${esc(name)}</b><small>${t('Supplier')}</small></span></summary>
          <div class="sp-menu">${S.view ? `<a href="/admin/">${t('Back to admin')}</a><button type="button" data-supplier-login>${t('Sign in with a supplier login')}</button>` : `<a href="#password">${t('Change password')}</a>`}<button type="button" data-logout>${t('Log out')}</button></div></details></div></header>
      ${S.view ? `<div class="sp-view" role="status"><span>${t('Admin view: this is the supplier portal. Your changes are saved, like the supplier’s.')}</span><a href="/admin/">${t('Back to admin')}</a></div>` : ''}
      <main class="sp-main${S.page === 'orders' ? ' wide' : ''}" id="sp-main">${inner}</main>
      <nav class="sp-bottom">${navItems('')}</nav>`;
  }
