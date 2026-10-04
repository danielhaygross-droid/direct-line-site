(function () {
  const { api, money, esc, date, trackingUrl, logout, renderLogin, quote, countryOptions, categoryOptions, $, $$ } = window.DL;
  const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const state = { me: null, orders: [], payments: [], editing: null, search: '', filter: 'all', autoPrice: null };
  const form = $('#order-form');
  const divisor = () => Number(state.me?.settings?.volumetric_divisor) || 6000;

  async function boot() {
    try {
      state.me = await api('/me');
    } catch (e) {
      if (e.status === 401 || e.status === 403) return renderLogin(document.body, { title: 'Client portal', subtitle: 'Sign in to add and track your orders.' });
      $('#boot').textContent = e.message; return;
    }
    if (state.me.role === 'admin') { location.href = '/admin/'; return; }
    $('#boot').hidden = true; $('#app').hidden = false;
    $('[data-name]').textContent = state.me.name;
    $('[data-username]').textContent = state.me.username;
    form.destination.innerHTML = countryOptions('');
    form.category.innerHTML = categoryOptions('general');
    renderSummary(state.me.summary);
    await Promise.all([loadOrders(), loadPayments()]);
  }

  function renderSummary(s) {
    $('[data-summary]').innerHTML = [
      ['Orders', s.orders, ''], ['Total billed', money(s.billed), ''], ['Paid', money(s.paid), ''],
      ['Balance due', money(s.outstanding), s.outstanding > 0 ? 'bad' : ''], ['Your profit', money(s.clientProfit), 'accent'],
    ].map(([k, v, cls]) => `<div class="card stat ${cls}"><small>${k}</small><strong>${v}</strong></div>`).join('');
  }

  async function refresh() {
    const [me] = await Promise.all([api('/me'), loadOrders(), loadPayments()]);
    renderSummary(me.summary);
  }

  // ----- orders list -----
  async function loadOrders() {
    state.orders = (await api('/orders')).orders;
    renderFilters(); renderOrders();
  }

  function renderFilters() {
    const count = s => state.orders.filter(o => s === 'all' || o.status === s).length;
    $('[data-filters]').innerHTML = ['all', ...STATUSES].filter(s => s === 'all' || count(s) > 0 || s === state.filter)
      .map(s => `<button type="button" class="chip${state.filter === s ? ' active' : ''}" data-filter="${s}">${s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)} <span>${count(s)}</span></button>`).join('');
  }

  function renderOrders() {
    const q = state.search.toLowerCase();
    const rows = state.orders.filter(o => (state.filter === 'all' || o.status === state.filter)
      && (!q || [o.orderRef, o.trackingNumber, o.notes, o.destination].join(' ').toLowerCase().includes(q)));
    const body = $('[data-orders]');
    if (!rows.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="10" class="empty">${state.orders.length ? 'No orders match.' : 'No orders yet. Add your first one above.'}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(o => `<tr${state.editing?.id === o.id ? ' class="selected"' : ''}>
      <td data-label="Date">${date(o.createdAt)}</td>
      <td data-label="Order" class="cell-title">${esc(o.orderRef) || '—'}</td>
      <td data-label="Tracking">${o.trackingNumber ? `<a href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener" title="Track this parcel">${esc(o.trackingNumber)}</a>` : '—'}</td>
      <td data-label="To">${esc(o.destination) || '—'}</td>
      <td data-label="Price" class="num">${money(o.price)}</td>
      <td data-label="Sold for" class="num">${money(o.sellingPrice)}</td>
      <td data-label="Profit" class="num ${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}">${money(o.profit)}</td>
      <td data-label="Status" class="cell-status"><span class="badge ${esc(o.status)}">${esc(o.status)}</span></td>
      <td data-label="Notes" class="notes${o.notes ? '' : ' no-notes'}">${esc(o.notes)}</td>
      <td class="cell-actions">${o.status === 'cancelled' ? '' : `<button class="btn btn-small" type="button" data-edit="${o.id}">Edit</button>`}${o.status === 'pending' ? ` <button class="btn btn-small btn-danger" type="button" data-cancel="${o.id}">Cancel</button>` : ''}</td></tr>`).join('');
  }

  // ----- payments list -----
  async function loadPayments() {
    state.payments = (await api('/payments')).payments;
    const total = state.payments.reduce((t, p) => t + p.amount, 0);
    $('[data-pay-hint]').textContent = state.payments.length ? `${state.payments.length} payment${state.payments.length > 1 ? 's' : ''}, ${money(total)} in total` : '';
    $('[data-payments]').innerHTML = state.payments.length ? state.payments.map(p => `<tr>
      <td data-label="Date">${date(p.paidAt)}</td><td data-label="Amount" class="num">${money(p.amount)}</td>
      <td data-label="Method">${esc(p.method) || '—'}</td><td data-label="Note" class="notes${p.note ? '' : ' no-notes'}">${esc(p.note)}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="4" class="empty">No payments recorded yet. Once we receive a payment from you, it shows up here.</td></tr>';
  }

  // ----- order form -----
  function currentQuote() {
    return quote({ country: form.destination.value, category: form.category.value, weightKg: form.weightKg.value,
      lengthCm: form.lengthCm.value, widthCm: form.widthCm.value, heightCm: form.heightCm.value, divisor: divisor() });
  }

  function updateQuote() {
    const q = currentQuote(), box = $('[data-quote]');
    if (!q) {
      box.innerHTML = 'Pick a destination and enter the weight to see the shipping price.';
      if (state.autoPrice !== null && form.price.value === state.autoPrice) form.price.value = '';
      state.autoPrice = null; return;
    }
    const kg = q.usedVolumetric ? `${q.chargeable} kg (size-based weight)` : `${q.chargeable} kg`;
    box.innerHTML = `<span class="quote-label">Shipping price</span><strong>${money(q.total)}</strong>
      <div class="breakdown">${kg} × ${money(q.perKg)}/kg = ${money(q.freight)} + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}</div>
      <button class="btn btn-small" type="button" data-use-quote>Use this price</button>`;
    // Keep the price in sync with the quote unless the client typed their own.
    if (form.price.value === '' || form.price.value === state.autoPrice) {
      form.price.value = q.total.toFixed(2); state.autoPrice = form.price.value;
    }
  }

  function updateProfit() {
    const p = parseFloat(form.price.value), s = parseFloat(form.sellingPrice.value);
    const el = $('[data-profit]');
    if (!Number.isFinite(p) || !Number.isFinite(s)) { el.innerHTML = 'Your profit: —'; return; }
    const v = s - p;
    el.innerHTML = `Your profit: <b class="${v >= 0 ? 'pos' : 'neg'}">${money(v)}</b>`;
  }

  function setEditing(order) {
    state.editing = order;
    $('[data-form-title]').textContent = order ? 'Edit order' : 'Add an order';
    $('[data-submit]').textContent = order ? 'Save changes' : 'Add order';
    $('[data-cancel-edit]').hidden = !order;
    form.reset();
    state.autoPrice = null;
    form.destination.value = order?.destination || '';
    form.category.value = order?.category || 'general';
    if (order) {
      form.orderRef.value = order.orderRef; form.trackingNumber.value = order.trackingNumber;
      form.weightKg.value = order.weightKg ?? ''; form.price.value = order.price == null ? '' : Number(order.price).toFixed(2);
      form.sellingPrice.value = order.sellingPrice == null ? '' : Number(order.sellingPrice).toFixed(2); form.notes.value = order.notes;
      $('#order-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    updateQuote(); updateProfit(); setMsg('');
    renderOrders();
  }

  function setMsg(text, kind) { const m = $('[data-form-msg]'); m.textContent = text; m.className = 'msg ' + (kind || ''); }

  form.addEventListener('input', e => {
    if (e.target.name === 'price') state.autoPrice = null; // the client typed their own price
    if (['destination', 'category', 'weightKg', 'lengthCm', 'widthCm', 'heightCm'].includes(e.target.name)) updateQuote();
    updateProfit();
  });
  form.addEventListener('change', e => { if (['destination', 'category'].includes(e.target.name)) { updateQuote(); updateProfit(); } });
  form.addEventListener('click', e => {
    if (!e.target.closest('[data-use-quote]')) return;
    const q = currentQuote(); if (!q) return;
    form.price.value = q.total.toFixed(2); state.autoPrice = form.price.value; updateProfit();
    setMsg('Price set to the shipping price (' + money(q.total) + ').', 'okm');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.price.value === '') { setMsg('Please enter the price, or pick a destination and weight to fill it in.', 'err'); form.price.focus(); return; }
    const body = {
      orderRef: form.orderRef.value, trackingNumber: form.trackingNumber.value, destination: form.destination.value,
      category: form.category.value, weightKg: form.weightKg.value === '' ? null : form.weightKg.value,
      price: form.price.value, sellingPrice: form.sellingPrice.value === '' ? null : form.sellingPrice.value, notes: form.notes.value,
    };
    const btn = $('[data-submit]'); btn.disabled = true;
    try {
      const wasEditing = !!state.editing;
      if (wasEditing) await api('/orders/' + state.editing.id, { method: 'PUT', body });
      else await api('/orders', { method: 'POST', body });
      setEditing(null);
      setMsg(wasEditing ? 'Order updated.' : 'Order added.', 'okm');
      await refresh();
    } catch (ex) { setMsg(ex.message, 'err'); }
    finally { btn.disabled = false; }
  });

  $('[data-cancel-edit]').addEventListener('click', () => setEditing(null));
  $('[data-orders]').addEventListener('click', async e => {
    const editId = e.target.closest('[data-edit]')?.dataset.edit;
    if (editId) { setEditing(state.orders.find(o => String(o.id) === editId)); return; }
    const btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    const order = state.orders.find(o => String(o.id) === btn.dataset.cancel);
    if (!confirm(`Cancel order ${order?.orderRef || ''}? This can't be undone here.`.replace('  ', ' '))) return;
    btn.disabled = true;
    try {
      await api('/orders/' + btn.dataset.cancel, { method: 'PUT', body: { status: 'cancelled' } });
      if (state.editing?.id === order?.id) setEditing(null);
      await refresh();
    } catch (ex) { alert(ex.message); btn.disabled = false; }
  });
  $('[data-filters]').addEventListener('click', e => {
    const f = e.target.closest('[data-filter]')?.dataset.filter;
    if (!f) return;
    state.filter = f; renderFilters(); renderOrders();
  });
  $('[data-search]').addEventListener('input', e => { state.search = e.target.value; renderOrders(); });
  $('[data-logout]').addEventListener('click', logout);

  boot();
})();
