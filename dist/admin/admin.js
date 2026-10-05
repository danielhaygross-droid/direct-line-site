(function () {
  const { api, money, esc, date, trackingUrl, logout, renderLogin, mountCalculator, quote, destinationPicker, hasRate, categoryOptions, toast, openThread, $, $$ } = window.DL;
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
    if (window.top !== window.self) {
      window.addEventListener('message', e => {
        if (e.origin !== location.origin || e.source !== window.parent) return;
        if (e.data?.type === 'dl-open-client' && state.overview.clients.some(c => c.id === e.data.id)) openClient(e.data.id);
        if (e.data?.type === 'dl-add-admin') { $('[data-show-add-user]').click(); const f = $('#user-form'); f.role.value = 'admin'; f.role.dispatchEvent(new Event('change')); f.name.focus(); }
      });
      parent.postMessage({ type: 'dl-admin-ready' }, location.origin);
    }
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
    if (!sf.contains(document.activeElement)) { // don't overwrite what the admin is typing
      sf.commission_per_order.value = settings.commission_per_order;
      sf.supplier_share_per_order.value = settings.supplier_share_per_order;
      updateSplitPreview();
      sf.volumetric_divisor.value = settings.volumetric_divisor;
    }
    calc?.setDivisor(settings.volumetric_divisor);
    $('[data-admins]').innerHTML = admins.length
      ? admins.map(a => `${esc(a.name)} (${esc(a.username)})${a.active ? '' : ' — disabled'}`).join('<br>') + '<br>Plus the main admin login.'
      : 'Only the main admin login so far. Use "+ Add client" and choose "Admin" to add one for Erwin.';
    renderClients();
    loadAllOrders();
    if (state.selected) {
      const fresh = clients.find(c => c.id === state.selected.id);
      if (fresh) { state.selected = fresh; renderDetailCards(); }
    }
  }

  // ----- all client orders in one place -----
  const ao = { list: [], filter: null, q: '', client: '', sig: null, unread: null };
  const sigOf = list => list.map(o => o.id + ':' + o.status).join(',');
  const unreadOf = list => list.reduce((t, o) => t + (o.unreadMessages || 0), 0);
  async function loadAllOrders() {
    try { ao.list = (await api('/admin/orders')).orders; } catch (e) { return; }
    ao.sig = sigOf(ao.list); ao.unread = unreadOf(ao.list);
    if (window.top !== window.self) parent.postMessage({ type: 'dl-followups', unread: ao.unread }, location.origin);
    if (ao.filter === null) ao.filter = ao.list.some(o => o.status === 'pending') ? 'pending' : 'all';
    const sel = $('[data-ao-client]'), cur = sel.value;
    sel.innerHTML = '<option value="">All clients</option>' + state.overview.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = cur;
    renderAllOrders();
  }
  function renderAllOrders() {
    const name = id => state.overview.clients.find(c => c.id === id)?.name || '—';
    const inClient = ao.list.filter(o => !ao.client || String(o.clientId) === ao.client);
    const match = (o, s) => s === 'all' || (s === 'followups' ? o.unreadMessages > 0 : o.status === s);
    const count = s => inClient.filter(o => match(o, s)).length;
    const label = s => s === 'all' ? 'All' : s === 'followups' ? 'New follow-ups' : s[0].toUpperCase() + s.slice(1);
    $('[data-ao-filters]').innerHTML = ['all', 'followups', ...STATUSES].filter(s => s === 'all' || count(s) || s === ao.filter)
      .map(s => `<button type="button" class="chip${ao.filter === s ? ' active' : ''}${s === 'followups' ? ' chip-alert' : ''}" data-ao-filter="${s}">${label(s)} <span>${count(s)}</span></button>`).join('');
    const q = ao.q.toLowerCase();
    const rows = inClient.filter(o => match(o, ao.filter)
      && (!q || [o.orderRef, o.trackingNumber, o.notes, o.destination, name(o.clientId)].join(' ').toLowerCase().includes(q)));
    $('[data-ao-body]').innerHTML = rows.length ? rows.map(o => `<tr${o.unreadMessages ? ' class="updated"' : ''}>
      <td data-label="Date">${date(o.createdAt)}</td>
      <td data-label="Client" class="cell-title"><b>${esc(name(o.clientId))}</b></td>
      <td data-label="Order">${esc(o.orderRef) || '—'}</td>
      <td data-label="Tracking">${o.trackingNumber ? `<a href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${esc(o.trackingNumber)}</a>` : '—'}</td>
      <td data-label="To">${esc(o.destination) || '—'}</td>
      <td data-label="Product" class="num">${money(o.productCost)}</td>
      <td data-label="Shipping" class="num">${money(o.shippingFee)}</td>
      <td data-label="Total" class="num"><b>${money(o.price)}</b></td>
      <td data-label="Status" class="cell-status"><select class="inline-select" data-ao-status="${o.id}" aria-label="Status">${STATUSES.map(s => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
      <td data-label="Notes" class="notes${o.notes ? '' : ' no-notes'}">${esc(o.notes)}</td>
      <td class="cell-actions"><button class="btn btn-small" type="button" data-ao-msg="${o.id}">${o.unreadMessages ? 'Reply' : 'Messages'}${o.unreadMessages ? `<span class="pill-new">${o.unreadMessages} new</span>` : o.messages ? ` <span class="hint">(${o.messages})</span>` : ''}</button> <button class="btn btn-small" type="button" data-ao-open="${o.clientId}">Open client</button></td></tr>`).join('')
      : `<tr class="empty-row"><td colspan="11" class="empty">${ao.list.length ? 'No orders match.' : 'No client orders yet. They show up here as soon as a client adds one in their portal.'}</td></tr>`;
  }
  $('[data-ao-filters]').addEventListener('click', e => { const f = e.target.closest('[data-ao-filter]')?.dataset.aoFilter; if (f) { ao.filter = f; renderAllOrders(); } });
  $('[data-ao-search]').addEventListener('input', e => { ao.q = e.target.value; renderAllOrders(); });
  $('[data-ao-client]').addEventListener('change', e => { ao.client = e.target.value; renderAllOrders(); });
  $('[data-ao-body]').addEventListener('click', e => {
    const id = e.target.closest('[data-ao-open]')?.dataset.aoOpen; if (id) openClient(Number(id));
    const mid = e.target.closest('[data-ao-msg]')?.dataset.aoMsg; if (mid) openOrderThread(Number(mid));
  });
  function openOrderThread(id) {
    const o = ao.list.find(x => x.id === id); if (!o) return;
    const client = state.overview.clients.find(c => c.id === o.clientId)?.name || 'Client';
    openThread({ orderId: o.id, role: 'admin', title: `${client} · ${o.orderRef || 'Order #' + o.id}`,
      subtitle: `Status: ${o.status}${o.trackingNumber ? ' · Tracking ' + o.trackingNumber : ''}`, onChange: () => loadAllOrders() });
  }

  // Keep the list live: new client orders, status changes and follow-ups show up without reloading.
  async function poll() {
    if (document.hidden || !state.overview) return;
    // Don't redraw under the admin while they're picking a status.
    if ($('[data-ao-body]').contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    let list; try { list = (await api('/admin/orders')).orders; } catch (e) { return; }
    const unread = unreadOf(list);
    // Inside the dashboard, the dashboard itself shows these messages (so they're seen on any page).
    const say = window.top === window.self ? toast : () => {};
    if (ao.unread !== null && unread > ao.unread) {
      const o = list.find(x => x.unreadMessages > 0 && !(ao.list.find(y => y.id === x.id)?.unreadMessages >= x.unreadMessages)) || list.find(x => x.unreadMessages > 0);
      const client = state.overview.clients.find(c => c.id === o?.clientId)?.name;
      say(`New follow-up${client ? ' from ' + client : ''}${o?.orderRef ? ' on ' + o.orderRef : ''}.`);
    }
    const added = list.filter(o => !ao.list.some(x => x.id === o.id)).length;
    if (added) say(`${added} new client order${added > 1 ? 's' : ''} came in.`);
    if (sigOf(list) !== ao.sig) await loadOverview(); // totals and balances change too
    else {
      ao.list = list; ao.unread = unread; renderAllOrders();
      if (window.top !== window.self) parent.postMessage({ type: 'dl-followups', unread }, location.origin);
    }
  }
  setInterval(poll, 20000);
  document.addEventListener('visibilitychange', poll);
  $('[data-ao-body]').addEventListener('change', async e => {
    const id = e.target.dataset.aoStatus; if (!id) return;
    e.target.disabled = true;
    try {
      await api('/orders/' + id, { method: 'PUT', body: { status: e.target.value } });
      await loadOverview();
      if (state.selected) await loadClientOrders();
    } catch (ex) { alert(ex.message); e.target.disabled = false; }
  });

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
      <td>${esc(o.destination) || '—'}</td><td class="num">${money(o.productCost)}</td><td class="num">${money(o.shippingFee)}</td><td class="num"><b>${money(o.price)}</b></td><td class="num">${money(o.sellingPrice)}</td>
      <td class="num ${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}">${money(o.profit)}</td><td class="num">${money(o.commission)}</td><td class="num">${money(o.supplierShare)}</td><td class="num pos">${money(o.ourShare)}</td>
      <td><select class="inline-select" data-status="${o.id}">${STATUSES.map(s => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
      <td class="notes">${esc(o.notes)}</td>
      <td><button class="btn btn-small" type="button" data-edit-order="${o.id}">Edit</button></td></tr>`).join('')
      : '<tr><td colspan="14" class="empty">This client has no orders yet. Add one above.</td></tr>';
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
      if (window.top !== window.self) parent.postMessage({ type: 'dl-clients-changed' }, location.origin);
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
      if (window.top !== window.self) parent.postMessage({ type: 'dl-clients-changed' }, location.origin);
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
  function adminTotal() {
    const pc = parseFloat(of.productCost.value), sh = parseFloat(of.price.value);
    if (!Number.isFinite(pc) && !Number.isFinite(sh)) return null;
    return (Number.isFinite(pc) ? pc : 0) + (Number.isFinite(sh) ? sh : 0);
  }
  function updateAdminProfit() {
    const p = adminTotal(), sp = parseFloat(of.sellingPrice.value), el = $('[data-admin-profit]');
    $('[data-admin-total]').innerHTML = p === null ? 'Client pays: —' : `Client pays: <b>${money(p)}</b> <span class="hint">(product + shipping)</span>`;
    if (p === null || !Number.isFinite(sp)) { el.innerHTML = 'Client profit: —'; return; }
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
      of.weightKg.value = order.weightKg ?? ''; of.productCost.value = order.productCost ?? '';
      of.price.value = order.shippingFee ?? (order.productCost == null ? order.price ?? '' : '');
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
    of.price.value = q.total.toFixed(2); updateAdminProfit(); msg('[data-admin-order-msg]', 'Shipping fee filled from the quote (' + money(q.total) + ').', 'okm');
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
    if (of.productCost.value === '' && of.price.value === '') { msg('[data-admin-order-msg]', 'Please enter the product cost and shipping fee.', 'err'); of.productCost.focus(); return; }
    const body = {
      clientId: state.selected.id, orderRef: of.orderRef.value, trackingNumber: of.trackingNumber.value,
      destination: dest.get(), category: of.category.value,
      weightKg: of.weightKg.value === '' ? null : of.weightKg.value, productCost: of.productCost.value === '' ? null : of.productCost.value, shippingFee: of.price.value === '' ? null : of.price.value,
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
