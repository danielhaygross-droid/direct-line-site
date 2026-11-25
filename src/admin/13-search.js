  // ---------- search from anywhere (QA 19 Nov 2026, item 17) ----------
  // One box on the title line of every tab, also Ctrl+K or "/" from any page. Finds orders, clients, products
  // and payments (payments come from the server, the rest is already loaded). A click (or Enter) opens it.
  const GS = { q: '', i: 0, items: [], pay: [], payQ: '', timer: 0 };
  const gsNorm = s => String(s ?? '').toLowerCase();
  function gsFind(q) {
    const t = gsNorm(q).trim(); if (!t) return [];
    const hit = (...xs) => xs.some(x => gsNorm(x).includes(t));
    const orders = (S.orders || []).filter(o => hit(o.orderRef, '#' + o.id, o.buyerName, o.trackingNumber, o.itemTitle, o.sku, clientName(o.clientId))).slice(0, 6)
      .map(o => ({ kind: 'order', id: o.id, title: orderName(o), sub: [clientName(o.clientId), o.buyerName, o.itemTitle].filter(Boolean).join(' · ') }));
    const clients = (S.ov?.clients || []).filter(c => hit(c.name, c.username, c.email, ...(S.stores || []).filter(s => s.clientId === c.id).map(s => s.name))).slice(0, 4)
      .map(c => ({ kind: 'client', id: c.id, title: c.name, sub: (S.stores || []).filter(s => s.clientId === c.id).map(s => s.name).join(' · ') }));
    const products = (S.products || []).filter(p => hit(p.name, p.variant, p.clientName)).slice(0, 4)
      .map(p => ({ kind: 'product', id: p.id, title: p.name, sub: [p.clientName, p.variant].filter(Boolean).join(' · ') }));
    const pays = GS.payQ === t ? GS.pay.map(p => ({ kind: 'payment', id: p.id, clientId: p.clientId, title: money(p.amount), sub: [clientName(p.clientId), p.method, p.note, new Date(p.paidAt).toLocaleDateString()].filter(Boolean).join(' · ') })) : [];
    return [...orders, ...clients, ...products, ...pays];
  }
  const GS_GROUP = { order: 'Orders', client: 'Clients', product: 'Products', payment: 'Payments' };
  function gsDraw() {
    const box = $('[data-gs-list]'); if (!box) return;
    GS.items = gsFind(GS.q); GS.i = Math.min(GS.i, Math.max(0, GS.items.length - 1));
    if (!GS.q.trim()) { box.hidden = true; box.innerHTML = ''; return; }
    let last = '';
    box.innerHTML = GS.items.map((r, n) => {
      const head = r.kind !== last ? `<li class="gs-group" role="presentation">${GS_GROUP[r.kind]}</li>` : ''; last = r.kind;
      return `${head}<li role="option" id="gs-${n}" class="gs-item${n === GS.i ? ' on' : ''}" aria-selected="${n === GS.i}" data-gs-pick="${n}"><b data-no-i18n>${esc(r.title)}</b>${r.sub ? `<small data-no-i18n>${esc(r.sub)}</small>` : ''}</li>`;
    }).join('') || `<li class="gs-empty" role="presentation">${GS.payQ === gsNorm(GS.q).trim() ? 'Nothing found.' : 'Searching…'}</li>`;
    box.hidden = false;
    $('[data-gs-input]')?.setAttribute('aria-activedescendant', GS.items.length ? 'gs-' + GS.i : '');
  }
  function gsPayments() {
    clearTimeout(GS.timer); const t = gsNorm(GS.q).trim(); if (!t) return;
    GS.timer = setTimeout(async () => {
      try { const r = await api('/admin/search-payments?q=' + encodeURIComponent(t)); if (gsNorm(GS.q).trim() !== t) return; GS.pay = r.payments || []; GS.payQ = t; gsDraw(); }
      catch (e) { GS.pay = []; GS.payQ = t; gsDraw(); }
    }, 250);
  }
  function gsClose() { const box = $('[data-gs-list]'); if (box) { box.hidden = true; box.innerHTML = ''; } }
  function gsOpen(r) {
    const input = $('[data-gs-input]'); if (input) { input.value = ''; input.blur(); } GS.q = ''; gsClose();
    if (r.kind === 'order') openOrder(r.id);
    else if (r.kind === 'client') openClient(r.id);
    else if (r.kind === 'payment') openClient(r.clientId, 'payments');
    else if (r.kind === 'product') {
      S.tab = 'products'; S.pqFilter = 'all'; S.pqOpen[r.id] = true; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab });
      const el = document.querySelector(`[data-pq="${r.id}"]`); if (el) { el.open = true; el.scrollIntoView({ block: 'center' }); el.classList.add('gs-flash'); setTimeout(() => el.classList.remove('gs-flash'), 1600); }
    }
  }
  const gsHTML = () => `<div class="gs" data-gs><label class="gs-field">${ic('search')}<input type="search" data-gs-input placeholder="Search orders, clients, products, payments" aria-label="Search everything" role="combobox" aria-expanded="false" aria-controls="gs-list" autocomplete="off"><kbd aria-hidden="true" dir="ltr" data-no-i18n>Ctrl K</kbd></label><ul class="gs-list" id="gs-list" role="listbox" data-gs-list hidden></ul></div>`;
  document.addEventListener('input', e => { if (!e.target.matches?.('[data-gs-input]')) return; GS.q = e.target.value; GS.i = 0; e.target.setAttribute('aria-expanded', String(!!GS.q.trim())); gsDraw(); gsPayments(); });
  document.addEventListener('mousedown', e => { const li = e.target.closest?.('[data-gs-pick]'); if (li) { e.preventDefault(); const r = GS.items[+li.dataset.gsPick]; if (r) gsOpen(r); } else if (!e.target.closest?.('[data-gs]')) gsClose(); });
  document.addEventListener('focusin', e => { if (e.target.matches?.('[data-gs-input]') && GS.q.trim()) gsDraw(); });
  document.addEventListener('keydown', e => {
    const input = $('[data-gs-input]'), inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !inField)) { if (input) { e.preventDefault(); input.focus(); input.select(); } return; }
    if (e.target !== input) return;
    if (e.key === 'Escape') { if (GS.q) { input.value = ''; GS.q = ''; gsClose(); } else input.blur(); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!GS.items.length) return; e.preventDefault(); GS.i = (GS.i + (e.key === 'ArrowDown' ? 1 : -1) + GS.items.length) % GS.items.length; gsDraw(); document.getElementById('gs-' + GS.i)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { const r = GS.items[GS.i]; if (r) { e.preventDefault(); gsOpen(r); } }
  });

