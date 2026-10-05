/* Shared helpers for the client portal and admin view. */
(function () {
  // Supplier shipping rates (USD per kg) — from the supplier's rate sheet.
  // Total = rate × chargeable kg + $4 registration (+ $4 EU tax where marked).
  const RATES = {
    US: { name: 'United States', general: 18, battery: 20, cosmetic: 23 },
    UK: { name: 'United Kingdom', general: 10, battery: 12, cosmetic: 15 },
    CA: { name: 'Canada', general: 15, battery: 17, cosmetic: 20 },
    AU: { name: 'Australia', general: 15, battery: 17, cosmetic: 20 },
    DE: { name: 'Germany', general: 10, battery: 12, cosmetic: 15, eu: true },
    IT: { name: 'Italy', general: 10, battery: 12, cosmetic: 15, eu: true },
    FR: { name: 'France', general: 13, battery: 15, cosmetic: 17, eu: true },
    ES: { name: 'Spain', general: 15, battery: 17, cosmetic: 20, eu: true },
    NL: { name: 'Netherlands', general: 15, battery: 17, cosmetic: 20, eu: true },
    IL: { name: 'Israel', general: 18, battery: 20, cosmetic: 22 },
    // Not on the supplier's sheet yet. Estimated from the supplier's own rates:
    // EU countries use the highest EU level (+ EU tax); non-EU Europe uses the UK level.
    AT: { name: 'Austria', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    BE: { name: 'Belgium', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    BG: { name: 'Bulgaria', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    CZ: { name: 'Czechia', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    DK: { name: 'Denmark', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    LV: { name: 'Latvia', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    PL: { name: 'Poland', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    PT: { name: 'Portugal', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    SK: { name: 'Slovakia', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    CH: { name: 'Switzerland', general: 10, battery: 12, cosmetic: 15, est: true },
    NO: { name: 'Norway', general: 10, battery: 12, cosmetic: 15, est: true },
  };
  // Countries clients can pick, in order of how often we ship there. Ones without a
  // supplier rate yet still work: the client enters the price and we confirm shipping.
  const COUNTRIES = [
    ['US', 'United States'], ['DE', 'Germany'], ['CA', 'Canada'], ['AU', 'Australia'], ['UK', 'United Kingdom'],
    ['NL', 'Netherlands'], ['CH', 'Switzerland'], ['IT', 'Italy'], ['NO', 'Norway'], ['AT', 'Austria'],
    ['DK', 'Denmark'], ['ES', 'Spain'], ['FR', 'France'], ['PL', 'Poland'], ['BE', 'Belgium'],
    ['BG', 'Bulgaria'], ['CZ', 'Czechia'], ['LV', 'Latvia'], ['PT', 'Portugal'], ['SK', 'Slovakia'],
    ['IL', 'Israel'],
  ];
  const OTHER = '__other';
  const countryName = code => (COUNTRIES.find(([c]) => c === code) || [])[1] || code;
  const CATEGORIES = {
    general: 'General goods',
    battery: 'Battery / sensitive (electronics, magnets)',
    cosmetic: 'Cosmetics / liquids / food',
  };
  const REGISTRATION_FEE = 4, EU_TAX = 4;
  const round2 = v => Math.round(v * 100) / 100;

  function quote({ country, category, weightKg, lengthCm, widthCm, heightCm, divisor = 6000 }) {
    const rate = RATES[country], perKg = rate && rate[category];
    const actual = Number(weightKg) || 0;
    if (!perKg || !(actual > 0)) return null;
    const dims = [lengthCm, widthCm, heightCm].map(Number);
    const volumetric = dims.every(d => d > 0) ? dims[0] * dims[1] * dims[2] / divisor : 0;
    const chargeable = Math.max(actual, volumetric);
    const freight = round2(perKg * chargeable);
    const eu = rate.eu ? EU_TAX : 0;
    return { total: round2(freight + REGISTRATION_FEE + eu), estimated: !!rate.est, perKg, chargeable: round2(chargeable * 1000) / 1000, volumetric: round2(volumetric * 1000) / 1000, usedVolumetric: volumetric > actual, freight, registration: REGISTRATION_FEE, euTax: eu };
  }

  const money = v => (v === null || v === undefined || v === '' ? '—' : (Number(v) < 0 ? '-$' : '$') + Math.abs(Number(v)).toFixed(2));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = s => (s ? new Date(s * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const trackingUrl = n => 'https://t.17track.net/en#nums=' + encodeURIComponent(n);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api/portal' + path, {
      method, credentials: 'same-origin',
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(window.DL_VIEW_AS ? { 'x-dl-view-as': String(window.DL_VIEW_AS) } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || 'Something went wrong (' + res.status + ')');
      err.status = res.status; throw err;
    }
    return data;
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    location.reload();
  }

  function countryOptions(selected) {
    return '<option value="">Select country…</option>' + COUNTRIES
      .map(([code, name]) => `<option value="${code}"${code === selected ? ' selected' : ''}>${esc(name)} (${code})</option>`).join('')
      + `<option value="${OTHER}">Other (type the country)</option>`;
  }

  // Wires a destination <select> to an "Other" text box. Returns get/set helpers.
  function destinationPicker(select, otherWrap) {
    const input = otherWrap.querySelector('input');
    const sync = () => { otherWrap.hidden = select.value !== OTHER; };
    select.innerHTML = countryOptions('');
    select.addEventListener('change', () => { sync(); if (select.value === OTHER) input.focus(); });
    return {
      get: () => (select.value === OTHER ? input.value.trim() : select.value),
      isOther: () => select.value === OTHER,
      label: () => (select.value === OTHER ? input.value.trim() : select.value ? countryName(select.value) : ''),
      set(value) {
        const v = String(value || '');
        if (!v) { select.value = ''; input.value = ''; }
        else if (COUNTRIES.some(([c]) => c === v.toUpperCase())) { select.value = v.toUpperCase(); input.value = ''; }
        else { select.value = OTHER; input.value = v; }
        sync();
      },
      reset() { select.value = ''; input.value = ''; sync(); },
    };
  }
  const hasRate = code => !!RATES[code];
  function categoryOptions(selected) {
    return Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }

  // Login screen. On success, follows the server's redirect if it points elsewhere.
  function renderLogin(root, { title = 'Sign in', subtitle = '', portal = false } = {}) {
    document.body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'login-wrap';
    const tag = portal ? 'CLIENT PORTAL' : 'CONTROL';
    wrap.innerHTML = `<section class="login-art"><span class="brand"><span>direct<b>↗</b>line.</span><small>${tag}</small></span>
      <div><h2>Your orders, <em>shipped and tracked</em> in one place.</h2>
      <ul class="login-points"><li>Add an order and see the shipping fee right away</li><li>Follow every order from pending to delivered</li><li>Message our team about any order</li></ul></div>
      <p>Direct Line · fulfilment and shipping</p></section>
      <div class="login-card"><span class="brand login-brand"><span>direct<b>↗</b>line.</span><small>${tag}</small></span>
      <div><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p></div>
      <form novalidate>
        <label class="field">Username<input name="username" autocomplete="username" required></label>
        <label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
        <label class="check"><input name="remember" type="checkbox" checked>Remember me for 30 days</label>
        <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        <p class="form-msg err" hidden></p>
      </form></div>`;
    document.body.appendChild(wrap);
    const form = $('form', wrap), err = $('.form-msg', wrap);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('button[type=submit]', form); btn.disabled = true; err.hidden = true;
      try {
        const data = await api('/login', { method: 'POST', body: { username: form.username.value.trim(), password: form.password.value, remember: form.remember.checked } });
        if (data.redirect && !location.pathname.startsWith(data.redirect)) location.href = data.redirect; else location.reload();
      } catch (ex) {
        err.textContent = ex.status === 401 ? 'Wrong username or password.' : ex.message; err.hidden = false;
      } finally { btn.disabled = false; }
    });
    window.DLEnhancePasswords?.(wrap);
    form.username.focus();
  }

  // Shipping calculator panel. onUse(total) is called by the "Use as order price" button.
  function mountCalculator(el, { divisor = 6000, onUse } = {}) {
    el.innerHTML = `<div class="panel-head"><h2>Shipping quote calculator</h2></div>
      <div class="form">
        <label class="field">Destination<select name="country">${COUNTRIES.filter(([c]) => RATES[c]).map(([c, n]) => `<option value="${c}"${c === 'US' ? ' selected' : ''}>${esc(n)} (${c})</option>`).join('')}</select></label>
        <label class="field">Product type<select name="category">${categoryOptions('general')}</select></label>
        <label class="field">Weight (kg)<input name="weight" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 0.25"></label>
        <label class="field">Size L × W × H (cm, optional)<span style="display:flex;gap:6px"><input name="l" type="number" min="0" step="0.1" placeholder="L"><input name="w" type="number" min="0" step="0.1" placeholder="W"><input name="h" type="number" min="0" step="0.1" placeholder="H"></span></label>
      </div>
      <div class="quote" aria-live="polite"><span class="hint">Enter a weight to get a quote.</span></div>
      ${onUse ? '<div style="margin-top:10px"><button class="btn btn-small" type="button" data-use disabled>Use as order price</button></div>' : ''}
      <p class="note-box">Supplier rates: rate per kg × chargeable weight + $4 registration, plus $4 tax for Germany, Italy, France, Spain and the Netherlands. Very large packages can get a $10–$50 surcharge — confirm those with the supplier.</p>`;
    let last = null;
    const out = $('.quote', el), use = $('[data-use]', el);
    const update = () => {
      const q = quote({ country: el.querySelector('[name=country]').value, category: el.querySelector('[name=category]').value, weightKg: el.querySelector('[name=weight]').value, lengthCm: el.querySelector('[name=l]').value, widthCm: el.querySelector('[name=w]').value, heightCm: el.querySelector('[name=h]').value, divisor });
      last = q;
      if (use) use.disabled = !q;
      if (!q) { out.innerHTML = '<span class="hint">Pick a destination and enter a weight to get a quote.</span>'; return; }
      out.innerHTML = `<span class="hint">Estimated shipping cost</span><strong>${money(q.total)}</strong>
        <div class="breakdown">$${q.perKg}/kg × ${q.chargeable} kg${q.usedVolumetric ? ' (size-based weight)' : ''} = ${money(q.freight)} + $${q.registration} registration${q.euTax ? ' + $' + q.euTax + ' EU tax' : ''}${q.estimated ? '<br><b>Estimated rate</b>: the supplier hasn’t confirmed this country yet.' : ''}</div>`;
    };
    $$('input,select', el).forEach(i => i.addEventListener('input', update));
    if (use) use.addEventListener('click', () => last && onUse(last.total));
    update();
    return { setDivisor(d) { divisor = Number(d) || 6000; update(); } };
  }

  // Inside the dashboard the admin view is a tall iframe, so "fixed" means the middle of the
  // whole frame. This returns the part of the frame the user can actually see.
  function visibleArea() {
    try {
      if (window.top === window.self || !window.frameElement) return null;
      const r = window.frameElement.getBoundingClientRect(), vh = window.parent.innerHeight;
      const bar = window.parent.document.querySelector('.topbar'); // the dashboard's sticky top bar
      const barBottom = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      const top = Math.max(0, barBottom - r.top), bottom = Math.min(window.innerHeight, vh - r.top);
      return { top, height: Math.max(240, bottom - top) };
    } catch (e) { return null; }
  }

  // Small toast at the bottom of the page.
  function toast(text) {
    let el = document.querySelector('.dl-toast');
    if (!el) { el = document.createElement('div'); el.className = 'dl-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    const area = visibleArea();
    if (area) { el.style.top = (area.top + area.height - 70) + 'px'; el.style.bottom = 'auto'; }
    el.textContent = text; el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 4000);
  }

  // Follow-up thread for one order (client ↔ Direct Line). role: 'client' | 'admin'.
  function openThread({ orderId, title, subtitle = '', role, onChange }) {
    let dlg = document.querySelector('dialog.dl-thread');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.className = 'dl-thread'; document.body.appendChild(dlg); }
    const quick = role === 'client'
      ? ['Any update on this order?', 'Can you please check this order?', 'The customer is asking where the parcel is.']
      : ['We’re checking this now.', 'Shipped, tracking is updated.', 'Delayed at the supplier, we’ll update you soon.'];
    dlg.innerHTML = `<div class="dl-thread-head"><div><small>${role === 'client' ? 'Follow up with Direct Line' : 'Follow-ups from the client'}</small><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button type="button" class="btn btn-small" data-close aria-label="Close">✕</button></div>
      <div class="dl-thread-list" aria-live="polite"><p class="hint">Loading…</p></div>
      <div class="dl-quick">${quick.map(q => `<button type="button" class="chip" data-quick>${esc(q)}</button>`).join('')}</div>
      <form class="dl-thread-form"><textarea name="body" maxlength="2000" rows="3" placeholder="${role === 'client' ? 'Write your follow-up…' : 'Write a reply…'}" aria-label="Message"></textarea>
      <div class="dl-thread-actions"><button class="btn btn-gold" type="submit">Send</button><p class="msg" data-thread-msg></p></div></form>`;
    const list = dlg.querySelector('.dl-thread-list'), form = dlg.querySelector('form'), msg = dlg.querySelector('[data-thread-msg]');
    const render = msgs => {
      list.innerHTML = msgs.length ? msgs.map(m => `<div class="dl-bubble ${m.author === role ? 'mine' : 'theirs'}"><span>${esc(m.body)}</span><small>${m.author === 'admin' ? 'Direct Line' : 'Client'} · ${new Date(m.createdAt * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('')
        : `<p class="hint">No messages yet. ${role === 'client' ? 'Send a follow-up and we’ll get back to you here.' : ''}</p>`;
      list.scrollTop = list.scrollHeight;
    };
    const load = async () => { try { render((await api(`/orders/${orderId}/messages`)).messages); onChange && onChange(); } catch (e) { list.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; } };
    dlg.querySelector('[data-close]').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-quick]').forEach(b => { b.onclick = () => { form.body.value = b.textContent; form.body.focus(); }; });
    form.onsubmit = async e => {
      e.preventDefault();
      const body = form.body.value.trim(); if (!body) { msg.textContent = 'Please write a message.'; msg.className = 'msg err'; return; }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try { render((await api(`/orders/${orderId}/messages`, { method: 'POST', body: { body } })).messages); form.body.value = ''; msg.textContent = 'Sent.'; msg.className = 'msg okm'; onChange && onChange(); }
      catch (ex) { msg.textContent = ex.message; msg.className = 'msg err'; }
      finally { btn.disabled = false; }
    };
    clearInterval(openThread.timer);
    openThread.timer = setInterval(() => { if (dlg.open && !document.hidden) load(); }, 15000);
    dlg.addEventListener('close', () => clearInterval(openThread.timer), { once: true });
    if (!dlg.open) dlg.showModal();
    // Inside the dashboard: keep the box in the part of the page the user is looking at, even while they scroll.
    const place = () => { const area = visibleArea(); if (area) Object.assign(dlg.style, { top: area.top + 12 + 'px', bottom: 'auto', margin: '0 auto', maxHeight: Math.min(720, area.height - 24) + 'px' }); };
    place();
    if (visibleArea()) {
      const host = window.parent;
      host.addEventListener('scroll', place, { passive: true }); host.addEventListener('resize', place);
      dlg.addEventListener('close', () => { host.removeEventListener('scroll', place); host.removeEventListener('resize', place); }, { once: true });
    }
    load();
  }

  window.DL = { visibleArea, toast, openThread, RATES, COUNTRIES, OTHER, countryName, destinationPicker, hasRate, CATEGORIES, quote, money, esc, date, trackingUrl, api, logout, renderLogin, mountCalculator, countryOptions, categoryOptions, $, $$ };
})();
