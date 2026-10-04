(function () {
  const { api, money, esc, date, trackingUrl, logout, renderLogin, mountCalculator, quote, destinationPicker, hasRate, categoryOptions, $, $$ } = window.DL;
  const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const state = { overview: null, selected: null, orders: [], payments: [], search: '', editing: null };
  const of = $('#admin-order-form');
  const dest = destinationPicker(of.destination, $('[data-other-country]', of));
  let calc;

  async function boot() {
    let me;
    try { me = await api('/me'); }
    catch (e) {
      if (e.status === 401 || e.status === 403) return renderLogin(document.body, { title: 'Admin sign in', subtitle: 'Direct Line team access.' });
      $('#boot').textContent = e.message; return;
    }
    if (me.role !== 'admin') { location.href = '/portal/'; return; }
    $('#boot').hidden = true; $('#app').hidden = false;
    $('[data-portal-url]').textContent = location.origin + '/portal/';
    calc = mountCalculator($('#calculator'), { divisor: Number(me.settings.volumetric_divisor) || 6000 });
    state.divisor = Number(me.settings.volumetric_divisor) || 6000;
    of.category.innerHTML = categoryOptions('general');
    await loadOverview();
  }

  async function loadOverview() {
    state.overview = await api('/admin/overview');
    const { totals, settings, clients, admins } = state.overview;
    $('[data-totals]').innerHTML = [
      ['Active clients', clients.filter(c => c.active).length, ''], ['Orders', totals.orders, ''], ['Billed', money(totals.billed), ''],
      ['Paid', money(totals.paid), ''], ['Outstanding', money(totals.outstanding), totals.outstanding > 0 ? 'bad' : ''],
      ['Fees collected', money(totals.commission), ''], ["Supplier's share", money(totals.supplierShare), ''],
      ['Our earnings', money(totals.ourShare), 'accent'],
    ].map(([k, v, cls]) => `<div class="card stat ${cls}"><small>${k}</small><strong>${v}</strong></div>`).join('');
    const sf = $('#settings-form');
    sf.commission_per_order.value = settings.commission_per_order;
    sf.supplier_share_per_order.value = settings.supplier_share_per_order;
    updateSplitPreview();
    sf.volumetric_divisor.value = settings.volumetric_divisor;
    calc?.setDivisor(settings.volumetric_divisor);
    $('[data-admins]').innerHTML = admins.length
      ? admins.map(a => `${esc(a.name)} (${esc(a.username)})${a.active ? '' : ' — disabled'}`).join('<br>') + '<br>Plus the main admin login.'
      : 'Only the main admin login so far. Use "+ Add client" and choose "Admin" to add one for Erwin.';
    renderClients();
    if (state.selected) {
      const fresh = clients.find(c => c.id === state.selected.id);
      if (fresh) { state.selected = fresh; renderDetailCards(); }
    }
  }

  function renderClients() {
    const q = state.search.toLowerCase();
    const list = state.overview.clients.filter(c => !q || (c.name + ' ' + c.username).toLowerCase().includes(q));
    const def = Number(state.overview.settings.commission_per_order);
    $('[data-clients]').innerHTML = list.length ? list.map(c => `<tr class="clickable${state.selected?.id === c.id ? ' selected' : ''}" data-client="${c.id}">
      <td><strong>${esc(c.name)}</strong></td><td>${esc(c.username)}</td><td class="num">${c.orders}</td>
      <td class="num">${money(c.billed)}</td><td class="num">${money(c.paid)}</td>
      <td class="num ${c.outstanding > 0 ? 'neg' : ''}">${money(c.outstanding)}</td>
      <td class="num">${money(c.supplierShare)}</td><td class="num pos"><b>${money(c.ourShare)}</b></td><td class="num">${money(c.commissionPerOrder ?? def)}${c.commissionPerOrder == null ? ' <span class="hint">default</span>' : ''}</td>
      <td>${c.active ? '<span class="badge delivered">active</span>' : '<span class="badge off">disabled</span>'}</td></tr>`).join('')
      : `<tr><td colspan="10" class="empty">${state.overview.clients.length ? 'No clients match.' : 'No clients yet. Click "+ Add client" to create the first account.'}</td></tr>`;
  }

  async function openClient(id) {
    state.selected = state.overview.clients.find(c => c.id === id);
    renderClients();
    const panel = $('[data-client-detail]'); panel.hidden = false;
    $('[data-detail-title]').textContent = state.selected.name;
    renderDetailCards();
    const af = $('#account-form');
    af.name.value = state.selected.name; af.commissionPerOrder.value = state.selected.commissionPerOrder ?? '';
    af.password.value = ''; af.active.value = String(state.selected.active);
    const d = new Date(); $('#payment-form').paidAt.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    setOrderEditing(null);
    setTab('orders');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await Promise.all([loadClientOrders(), loadPayments()]);
  }

  function renderDetailCards() {
    const c = state.selected;
    $('[data-detail-cards]').innerHTML = [
      ['Orders', c.orders, ''], ['Billed', money(c.billed), ''], ['Paid', money(c.paid), ''],
      ['Outstanding', money(c.outstanding), c.outstanding > 0 ? 'bad' : ''], ["Supplier's share", money(c.supplierShare), ''], ['Our earnings', money(c.ourShare), 'accent'], ['Client profit', money(c.clientProfit), ''],
    ].map(([k, v, cls]) => `<div class="card stat ${cls}"><small>${k}</small><strong>${v}</strong></div>`).join('');
  }

  async function loadClientOrders() {
    state.orders = (await api('/admin/orders?clientId=' + state.selected.id)).orders;
    $('[data-detail-orders]').innerHTML = state.orders.length ? state.orders.map(o => `<tr>
      <td>${date(o.createdAt)}</td><td>${esc(o.orderRef) || '—'}</td>
      <td>${o.trackingNumber ? `<a href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${esc(o.trackingNumber)}</a>` : '—'}</td>
      <td>${esc(o.destination) || '—'}</td><td class="num">${money(o.price)}</td><td class="num">${money(o.sellingPrice)}</td>
      <td class="num ${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}">${money(o.profit)}</td><td class="num">${money(o.commission)}</td><td class="num">${money(o.supplierShare)}</td><td class="num pos">${money(o.ourShare)}</td>
      <td><select class="inline-select" data-status="${o.id}">${STATUSES.map(s => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
      <td class="notes">${esc(o.notes)}</td>
      <td><button class="btn btn-small" type="button" data-edit-order="${o.id}">Edit</button></td></tr>`).join('')
      : '<tr><td colspan="13" class="empty">This client has no orders yet. Add one above.</td></tr>';
  }

  async function loadPayments() {
    state.payments = (await api('/admin/payments?clientId=' + state.selected.id)).payments;
    $('[data-detail-payments]').innerHTML = state.payments.length ? state.payments.map(p => `<tr>
      <td>${date(p.paidAt)}</td><td class="num">${money(p.amount)}</td><td>${esc(p.method)}</td><td class="notes">${esc(p.note)}</td>
      <td><button class="btn btn-small" type="button" data-del-payment="${p.id}">Remove</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">No payments recorded yet.</td></tr>';
  }

  function setTab(name) {
    $$('[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== name; });
  }
  const msg = (sel, text, kind) => { const m = $(sel); m.textContent = text; m.className = 'msg ' + (kind || ''); };

  // ----- events -----
  $('[data-clients]').addEventListener('click', e => { const row = e.target.closest('[data-client]'); if (row) openClient(Number(row.dataset.client)); });
  $('[data-client-search]').addEventListener('input', e => { state.search = e.target.value; renderClients(); });
  $('[data-close-detail]').addEventListener('click', () => { state.selected = null; $('[data-client-detail]').hidden = true; renderClients(); });
  $$('[data-tab]').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('[data-show-add-user]').addEventListener('click', () => { const p = $('[data-add-user-panel]'); p.hidden = false; p.scrollIntoView({ behavior: 'smooth' }); $('#user-form').name.focus(); });
  $('[data-hide-add-user]').addEventListener('click', () => { $('[data-add-user-panel]').hidden = true; });
  $('#user-form').role.addEventListener('change', e => { $('[data-cpo-field]').hidden = e.target.value === 'admin'; });

  $('#user-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    try {
      await api('/admin/users', { method: 'POST', body: { role: f.role.value, name: f.name.value, username: f.username.value.trim(), password: f.password.value, commissionPerOrder: f.commissionPerOrder.value === '' ? null : f.commissionPerOrder.value } });
      msg('[data-user-msg]', `Account "${f.username.value.trim()}" created.`, 'okm');
      f.reset(); $('[data-cpo-field]').hidden = false;
      await loadOverview();
    } catch (ex) { msg('[data-user-msg]', ex.message, 'err'); }
  });

  $('[data-detail-orders]').addEventListener('change', async e => {
    const id = e.target.dataset.status; if (!id) return;
    e.target.disabled = true;
    try { await api('/orders/' + id, { method: 'PUT', body: { status: e.target.value } }); await loadOverview(); }
    catch (ex) { alert(ex.message); }
    finally { e.target.disabled = false; }
  });

  $('#payment-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    try {
      await api('/admin/payments', { method: 'POST', body: { clientId: state.selected.id, amount: f.amount.value, method: f.method.value, note: f.note.value, paidAt: f.paidAt.value } });
      msg('[data-pay-msg]', 'Payment recorded.', 'okm'); f.amount.value = ''; f.note.value = '';
      await Promise.all([loadOverview(), loadPayments()]);
    } catch (ex) { msg('[data-pay-msg]', ex.message, 'err'); }
  });
  $('[data-detail-payments]').addEventListener('click', async e => {
    const id = e.target.dataset.delPayment; if (!id) return;
    if (!confirm('Remove this payment?')) return;
    await api('/admin/payments/' + id + '/delete', { method: 'POST' });
    await Promise.all([loadOverview(), loadPayments()]);
  });

  $('#account-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    const body = { name: f.name.value, active: f.active.value === 'true', commissionPerOrder: f.commissionPerOrder.value === '' ? null : f.commissionPerOrder.value };
    if (f.password.value) body.password = f.password.value;
    try {
      await api('/admin/users/' + state.selected.id, { method: 'POST', body });
      msg('[data-account-msg]', 'Saved.', 'okm'); f.password.value = '';
      await loadOverview(); $('[data-detail-title]').textContent = state.selected.name;
    } catch (ex) { msg('[data-account-msg]', ex.message, 'err'); }
  });

  $('#settings-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    try {
      await api('/admin/settings', { method: 'POST', body: { commission_per_order: f.commission_per_order.value, supplier_share_per_order: f.supplier_share_per_order.value, volumetric_divisor: f.volumetric_divisor.value } });
      msg('[data-settings-msg]', 'Settings saved. New orders use the new fee split.', 'okm');
      await loadOverview();
    } catch (ex) { msg('[data-settings-msg]', ex.message, 'err'); }
  });
  function updateSplitPreview() {
    const f = $('#settings-form'), fee = parseFloat(f.commission_per_order.value), sup = parseFloat(f.supplier_share_per_order.value);
    const el = $('[data-split-preview]');
    if (!Number.isFinite(fee) || !Number.isFinite(sup)) { el.textContent = 'Our earnings per order: —'; return; }
    const v = fee - sup;
    el.innerHTML = `Our earnings per order: <b class="${v >= 0 ? 'pos' : 'neg'}">${money(v)}</b>`;
  }
  $('#settings-form').addEventListener('input', updateSplitPreview);
  // ----- admin adds / edits orders on a client's behalf -----
  function updateAdminProfit() {
    const p = parseFloat(of.price.value), sp = parseFloat(of.sellingPrice.value), el = $('[data-admin-profit]');
    if (!Number.isFinite(p) || !Number.isFinite(sp)) { el.innerHTML = 'Client profit: —'; return; }
    const v = sp - p; el.innerHTML = `Client profit: <b class="${v >= 0 ? 'pos' : 'neg'}">${money(v)}</b>`;
  }
  function setOrderEditing(order) {
    state.editing = order;
    $('[data-admin-order-title]').textContent = order ? 'Edit order' : 'Add order for this client';
    $('[data-admin-order-submit]').textContent = order ? 'Save changes' : 'Add order';
    $('[data-admin-cancel-edit]').hidden = !order;
    of.reset();
    dest.set(order?.destination || '');
    of.category.value = order?.category || 'general';
    if (order) {
      of.orderRef.value = order.orderRef; of.trackingNumber.value = order.trackingNumber;
      of.weightKg.value = order.weightKg ?? ''; of.price.value = order.price ?? '';
      of.sellingPrice.value = order.sellingPrice ?? ''; of.notes.value = order.notes;
    }
    updateAdminProfit(); msg('[data-admin-order-msg]', '');
  }
  of.addEventListener('input', updateAdminProfit);
  $('[data-admin-cancel-edit]').addEventListener('click', () => setOrderEditing(null));
  $('[data-admin-fill-quote]').addEventListener('click', () => {
    if (dest.get() && !hasRate(dest.get())) { msg('[data-admin-order-msg]', 'No supplier rate for ' + dest.label() + ' yet — enter the price by hand.', 'err'); return; }
    const q = quote({ country: dest.get(), category: of.category.value, weightKg: of.weightKg.value, divisor: state.divisor });
    if (!q) { msg('[data-admin-order-msg]', 'Choose a destination and enter the weight first.', 'err'); return; }
    of.price.value = q.total.toFixed(2); updateAdminProfit(); msg('[data-admin-order-msg]', 'Price filled with the shipping quote (' + money(q.total) + ').', 'okm');
  });
  $('[data-detail-orders]').addEventListener('click', e => {
    const id = e.target.closest('[data-edit-order]')?.dataset.editOrder;
    if (!id) return;
    setOrderEditing(state.orders.find(o => String(o.id) === id));
    of.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  of.addEventListener('submit', async e => {
    e.preventDefault();
    if (dest.isOther() && !dest.get()) { msg('[data-admin-order-msg]', 'Please type the country name.', 'err'); of.otherCountry.focus(); return; }
    if (of.price.value === '') { msg('[data-admin-order-msg]', 'Please enter the price.', 'err'); of.price.focus(); return; }
    const body = {
      clientId: state.selected.id, orderRef: of.orderRef.value, trackingNumber: of.trackingNumber.value,
      destination: dest.get(), category: of.category.value,
      weightKg: of.weightKg.value === '' ? null : of.weightKg.value, price: of.price.value,
      sellingPrice: of.sellingPrice.value === '' ? null : of.sellingPrice.value, notes: of.notes.value,
    };
    const btn = $('[data-admin-order-submit]'); btn.disabled = true;
    try {
      const wasEditing = !!state.editing;
      if (wasEditing) await api('/orders/' + state.editing.id, { method: 'PUT', body });
      else await api('/orders', { method: 'POST', body });
      setOrderEditing(null);
      msg('[data-admin-order-msg]', wasEditing ? 'Order updated.' : 'Order added.', 'okm');
      await Promise.all([loadOverview(), loadClientOrders()]);
    } catch (ex) { msg('[data-admin-order-msg]', ex.message, 'err'); }
    finally { btn.disabled = false; }
  });

  $('[data-logout]').addEventListener('click', logout);

  boot();
})();
