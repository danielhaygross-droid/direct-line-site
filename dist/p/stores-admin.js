// Daniel's stores: add a store (name, platform, link) or remove one from the dashboard.
// Removing only hides the store (it can be restored); no data is deleted. Saved on the server
// (/api/portal/admin/stores) so every admin sees the same list. Loaded after app.js.
(function () {
  if (typeof stores === 'undefined' || typeof accounts === 'undefined') return;
  const HE = document.documentElement.lang === 'he';
  const L = (en, he) => (HE ? he : en);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BUILTIN = ['zroyal', 'cursed', 'select', 'nerd'];
  const PLATFORMS = ['Etsy', 'Shopify', 'Amazon', 'eBay', 'TikTok Shop', 'Website', 'Other'];
  let rows = [], loaded = false;
  const say = t => { if (typeof toast === 'function') toast(t); };

  async function call(path, body) {
    const r = await fetch('/api/portal' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Error ' + r.status);
    return d;
  }
  function apply() {
    const by = new Map(rows.map(r => [r.key, r]));
    rows.filter(r => !r.builtin).forEach(r => {
      stores[r.key] = Object.assign(stores[r.key] || {}, {
        name: r.name, platformName: r.platform || L('Other', 'אחר'), factor: 1, currency: 'USD', url: r.url, custom: true,
        platform: { Shopify: r.platform === 'Shopify' ? 1 : 0, Etsy: r.platform === 'Etsy' ? 1 : 0 },
        status: L('Added store · no data connected yet', 'חנות שנוספה · עדיין אין נתונים מחוברים'),
      });
    });
    const visible = [...BUILTIN.filter(k => stores[k]), ...rows.filter(r => !r.builtin).map(r => r.key)].filter(k => !by.get(k)?.hidden);
    ['daniel', 'all'].forEach(a => { if (accounts[a]) accounts[a].stores.splice(0, accounts[a].stores.length, ...visible); });
    if (state.store !== 'all' && !visible.includes(state.store)) state.store = 'all';
  }
  async function load() {
    try { rows = (await call('/admin/stores')).stores || []; loaded = true; apply(); renderAll(); }
    catch (e) { /* not signed in yet: try again after sign-in */ }
  }
  // All of Daniel's stores, shown or removed, for the Stores & Team page.
  function list() {
    const by = new Map(rows.map(r => [r.key, r]));
    return [...BUILTIN.filter(k => stores[k]), ...rows.filter(r => !r.builtin).map(r => r.key)]
      .map(k => ({ key: k, name: stores[k]?.name || by.get(k)?.name || k, platform: stores[k]?.platformName || by.get(k)?.platform || '', url: by.get(k)?.url || stores[k]?.url || '', builtin: BUILTIN.includes(k), hidden: !!by.get(k)?.hidden }));
  }
  async function setHidden(key, hidden) {
    const r = (await call('/admin/stores/' + key, { hidden })).store;
    rows = rows.filter(x => x.key !== key).concat(r);
    apply(); renderAll();
    say(hidden ? L(`${stores[key]?.name || 'Store'} removed from the dashboard`, `${stores[key]?.name || 'החנות'} הוסרה מהדשבורד`) : L(`${stores[key]?.name || 'Store'} is back`, `${stores[key]?.name || 'החנות'} חזרה`));
  }
  function openAdd() {
    if (typeof openDetail !== 'function') return;
    openDetail(L('Daniel’s stores', 'החנויות של דניאל'), L('Add a store', 'הוספת חנות'), `<form class="cost-entry-form ls-store-form" data-store-form>
      <label><span>${L('Store name', 'שם החנות')}</span><input name="name" required maxlength="80" placeholder="${L('e.g. Ash & Steel', 'למשל Ash & Steel')}" style="width:100%;min-height:40px;padding:0 11px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text)"></label>
      <label><span>${L('Platform', 'פלטפורמה')}</span><select name="platform" style="width:100%;min-height:40px;padding:0 11px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text)">${PLATFORMS.map(p => `<option>${p}</option>`).join('')}</select></label>
      <label><span>${L('Store link', 'קישור לחנות')} <small>${L('optional', 'לא חובה')}</small></span><input name="url" type="url" maxlength="300" inputmode="url" placeholder="https://www.etsy.com/shop/..." style="width:100%;min-height:40px;padding:0 11px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text)"></label>
      <p class="ls-muted" style="font-size:13px">${L('The store shows up in the store list right away. Its sales appear once its orders come in from the supplier sheet or a store connection.', 'החנות תופיע מיד ברשימת החנויות. המכירות שלה יופיעו כשההזמנות שלה יגיעו מגיליון הספק או מחיבור לחנות.')}</p>
      <p class="ls-msg" data-store-msg></p>
      <button class="primary-button" type="submit">${L('Add store', 'הוספת חנות')}</button></form>`);
    setTimeout(() => document.querySelector('[data-store-form] [name=name]')?.focus(), 50);
  }
  document.addEventListener('submit', async e => {
    if (!e.target.matches?.('[data-store-form]')) return;
    e.preventDefault();
    const f = e.target, m = f.querySelector('[data-store-msg]'), b = f.querySelector('[type=submit]');
    b.disabled = true; m.textContent = '';
    try {
      const r = (await call('/admin/stores', { name: f.name.value, platform: f.platform.value, url: f.url.value.trim() })).store;
      rows.push(r); apply();
      if (typeof detailDialog !== 'undefined' && detailDialog.open) detailDialog.close();
      renderAll(); say(L(`${r.name} added`, `${r.name} נוספה`));
    } catch (err) { b.disabled = false; m.textContent = err.message; }
  });
  // The "+ Connect store" button in the store switcher now adds a store.
  document.addEventListener('click', e => {
    const c = e.target.closest?.('#connect-store'); if (!c) return;
    e.preventDefault(); e.stopImmediatePropagation(); openAdd();
  }, true);
  const relabel = () => { const c = document.getElementById('connect-store'); if (c && !c.dataset.relabeled) { c.dataset.relabeled = '1'; c.textContent = L('+ Add store', '+ הוספת חנות'); } };
  relabel();

  window.DLStores = { list, openAdd, remove: k => setHidden(k, true), restore: k => setHidden(k, false), isLoaded: () => loaded };
  // Load once signed in (the dashboard adds "authenticated" to <body>).
  const tryLoad = () => { if (!loaded && document.body.classList.contains('authenticated')) load(); };
  new MutationObserver(tryLoad).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  tryLoad();
})();
