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
    return { total: round2(freight + REGISTRATION_FEE + eu), perKg, chargeable: round2(chargeable * 1000) / 1000, volumetric: round2(volumetric * 1000) / 1000, usedVolumetric: volumetric > actual, freight, registration: REGISTRATION_FEE, euTax: eu };
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
      headers: body ? { 'content-type': 'application/json' } : {},
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
  function renderLogin(root, { title = 'Sign in', subtitle = '' } = {}) {
    document.body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'login-wrap';
    wrap.innerHTML = `<div class="login-card">
      <span class="brand">direct<b>↗</b>line.<small>CONTROL</small></span>
      <h1>${esc(title)}</h1><p class="sub" style="margin:0">${esc(subtitle)}</p>
      <form novalidate>
        <label class="field">Username<input name="username" autocomplete="username" required></label>
        <label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);cursor:pointer"><input name="remember" type="checkbox" checked style="width:16px;height:16px;margin:0;accent-color:var(--gold)">Remember me (stay signed in for 30 days)</label>
        <button class="btn btn-gold" type="submit">Sign in</button>
        <p class="msg err" hidden></p>
      </form></div>`;
    document.body.appendChild(wrap);
    const form = $('form', wrap), err = $('.msg', wrap);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('button', form); btn.disabled = true; err.hidden = true;
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
        <div class="breakdown">$${q.perKg}/kg × ${q.chargeable} kg${q.usedVolumetric ? ' (size-based weight)' : ''} = ${money(q.freight)} + $${q.registration} registration${q.euTax ? ' + $' + q.euTax + ' EU tax' : ''}</div>`;
    };
    $$('input,select', el).forEach(i => i.addEventListener('input', update));
    if (use) use.addEventListener('click', () => last && onUse(last.total));
    update();
    return { setDivisor(d) { divisor = Number(d) || 6000; update(); } };
  }

  window.DL = { RATES, COUNTRIES, OTHER, countryName, destinationPicker, hasRate, CATEGORIES, quote, money, esc, date, trackingUrl, api, logout, renderLogin, mountCalculator, countryOptions, categoryOptions, $, $$ };
})();
