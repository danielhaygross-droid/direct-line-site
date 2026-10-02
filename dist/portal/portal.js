(function () {
  const { api, money, esc, date, trackingUrl, logout, renderLogin, mountCalculator, quote, countryOptions, categoryOptions, $, $$ } = window.DL;
  const state = { me: null, orders: [], editing: null, search: '' };
  const form = $('#order-form');

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
    mountCalculator($('#calculator'), { divisor: Number(state.me.settings.volumetric_divisor) || 6000, onUse: total => { form.price.value = total.toFixed(2); updateProfit(); form.price.focus(); } });
    renderSummary(state.me.summary);
    await loadOrders();
  }

  function renderSummary(s) {
    $('[data-summary]').innerHTML = [
      ['Orders', s.orders, ''], ['Total billed', money(s.billed), ''], ['Paid', money(s.paid), ''],
      ['Balance due', money(s.outstanding), s.outstanding > 0 ? 'bad' : ''], ['Your profit', money(s.clientProfit), 'accent'],
    ].map(([k, v, cls]) => `<div class="card stat ${cls}"><small>${k}</small><strong>${v}</strong></div>`).join('');
  }

  async function loadOrders() {
    const data = await api('/orders');
    state.orders = data.orders;
    renderOrders();
  }

  function renderOrders() {
    const q = state.search.toLowerCase();
    const rows = state.orders.filter(o => !q || [o.orderRef, o.trackingNumber, o.notes, o.destination].join(' ').toLowerCase().includes(q));
    const body = $('[data-orders]');
    if (!rows.length) { body.innerHTML = `<tr><td colspan="10" class="empty">${state.orders.length ? 'No orders match your search.' : 'No orders yet. Add your first one above.'}</td></tr>`; return; }
    body.innerHTML = rows.map(o => `<tr>
      <td>${date(o.createdAt)}</td><td>${esc(o.orderRef) || '—'}</td>
      <td>${o.trackingNumber ? `<a href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${esc(o.trackingNumber)}</a>` : '—'}</td>
      <td>${esc(o.destination) || '—'}</td>
      <td class="num">${money(o.price)}</td><td class="num">${money(o.sellingPrice)}</td>
      <td class="num ${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}">${money(o.profit)}</td>
      <td><span class="badge ${esc(o.status)}">${esc(o.status)}</span></td>
      <td class="notes">${esc(o.notes)}</td>
      <td>${o.status === 'cancelled' ? '' : `<button class="btn btn-small" type="button" data-edit="${o.id}">Edit</button>`}</td></tr>`).join('');
  }

  function updateProfit() {
    const p = parseFloat(form.price.value), s = parseFloat(form.sellingPrice.value);
    const el = $('[data-profit]');
    if (!Number.isFinite(p) || !Number.isFinite(s)) { el.innerHTML = 'Profit: —'; return; }
    const v = s - p;
    el.innerHTML = `Profit: <b class="${v >= 0 ? 'pos' : 'neg'}">${money(v)}</b>`;
  }

  function setEditing(order) {
    state.editing = order;
    $('[data-form-title]').textContent = order ? 'Edit order' : 'Add an order';
    $('[data-submit]').textContent = order ? 'Save changes' : 'Add order';
    $('[data-cancel-edit]').hidden = !order;
    form.reset();
    form.destination.value = order?.destination || '';
    form.category.value = order?.category || 'general';
    if (order) {
      form.orderRef.value = order.orderRef; form.trackingNumber.value = order.trackingNumber;
      form.weightKg.value = order.weightKg ?? ''; form.price.value = order.price ?? '';
      form.sellingPrice.value = order.sellingPrice ?? ''; form.notes.value = order.notes;
      $('#order-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    updateProfit();
    setMsg('');
  }

  function setMsg(text, kind) { const m = $('[data-form-msg]'); m.textContent = text; m.className = 'msg ' + (kind || ''); }

  form.addEventListener('input', updateProfit);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.price.value === '') { setMsg('Please enter the price.', 'err'); form.price.focus(); return; }
    const body = {
      orderRef: form.orderRef.value, trackingNumber: form.trackingNumber.value, destination: form.destination.value,
      category: form.category.value, weightKg: form.weightKg.value === '' ? null : form.weightKg.value,
      price: form.price.value, sellingPrice: form.sellingPrice.value === '' ? null : form.sellingPrice.value, notes: form.notes.value,
    };
    const btn = $('[data-submit]'); btn.disabled = true;
    try {
      if (state.editing) await api('/orders/' + state.editing.id, { method: 'PUT', body });
      else await api('/orders', { method: 'POST', body });
      const wasEditing = !!state.editing;
      setEditing(null);
      setMsg(wasEditing ? 'Order updated.' : 'Order added.', 'okm');
      const [me] = await Promise.all([api('/me'), loadOrders()]);
      renderSummary(me.summary);
    } catch (ex) { setMsg(ex.message, 'err'); }
    finally { btn.disabled = false; }
  });

  $('[data-fill-quote]').addEventListener('click', () => {
    const q = quote({ country: form.destination.value, category: form.category.value, weightKg: form.weightKg.value, divisor: Number(state.me.settings.volumetric_divisor) || 6000 });
    if (!q) { setMsg('Choose a destination and enter the weight first.', 'err'); return; }
    form.price.value = q.total.toFixed(2); updateProfit(); setMsg('Price filled with the shipping quote (' + money(q.total) + ').', 'okm');
  });
  $('[data-cancel-edit]').addEventListener('click', () => setEditing(null));
  $('[data-orders]').addEventListener('click', e => {
    const id = e.target.closest('[data-edit]')?.dataset.edit;
    if (id) setEditing(state.orders.find(o => String(o.id) === id));
  });
  $('[data-search]').addEventListener('input', e => { state.search = e.target.value; renderOrders(); });
  $('[data-logout]').addEventListener('click', logout);

  boot();
})();
