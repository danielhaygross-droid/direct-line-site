  // ---------- bulk edit (Orders tab): select orders, then change them all at once ----------
  function bulkBar(archivedView, allOn) {
    const n = S.picked.size, all = `<label class="bulk-all"><input type="checkbox" data-pick-all${allOn ? ' checked' : ''}><span>Select all</span></label>`;
    if (!n) return `<div class="bulk-bar bulk-hint">${all}<span class="dim">Tick orders to change several at once: status, courier, fee or archive.</span></div>`;
    const couriers = String(S.ov.settings.couriers || '').split('\n').filter(Boolean);
    return `<div class="bulk-bar" data-bulk-bar>${all}<b>${n} selected</b>
      ${archivedView ? '<button type="button" class="btn btn-sm" data-bulk="restore">Restore</button>' : `
      <label class="bulk-f"><span>Status</span><select data-bulk-status><option value="">Choose…</option>${ADMIN_STATUSES.map(s => `<option value="${s}">${UI.LABEL[s]}</option>`).join('')}<option value="cancelled">${UI.LABEL.cancelled}</option></select></label><button type="button" class="btn btn-sm" data-bulk="status">Set status</button>
      <label class="bulk-f"><span>Courier</span><input data-bulk-courier list="dl-bulk-couriers" maxlength="60" placeholder="e.g. Yanwen"><datalist id="dl-bulk-couriers">${couriers.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label><button type="button" class="btn btn-sm" data-bulk="courier">Set courier</button>
      <label class="bulk-f"><span>Fee</span><span class="money"><input data-bulk-fee type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.50"></span></label><button type="button" class="btn btn-sm" data-bulk="fee">Set fee</button>
      <button type="button" class="btn btn-sm btn-danger" data-bulk="archive">Archive</button>`}
      <button type="button" class="btn btn-sm btn-ghost" data-bulk="clear">Clear selection</button>
      <span class="bulk-msg" data-bulk-msg role="status"></span></div>`;
  }
  async function runBulk(kind, btn) {
    const bar = $('[data-bulk-bar]'), msg = $('[data-bulk-msg]', bar), ids = [...S.picked];
    if (kind === 'clear') { S.picked.clear(); renderOrders(); return; }
    let body = null;
    if (kind === 'status') { const v = $('[data-bulk-status]', bar).value; if (!v) { msg.textContent = 'Choose a status first.'; return; } body = { status: v }; }
    // Cancelled (Erwin, 26 Oct 2026): requests are approved, other orders cancelled; each uses the supplier's cancellation
    // fee from the sheet (none = free). Two clicks, like Archive.
    const cancelling = kind === 'status' && body?.status === 'cancelled';
    if (cancelling && !btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = `Click again to cancel ${ids.length} (supplier fees)`; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Set status'; } }, 5000); return; }
    if (kind === 'courier') { const v = $('[data-bulk-courier]', bar).value.trim(); if (!v) { msg.textContent = 'Type or pick a courier first.'; return; } body = { courier: v }; }
    if (kind === 'addrflag') body = { clearAddressFlag: true };
    if (kind === 'fee') { const v = $('[data-bulk-fee]', bar).value; if (v === '' || !(Number(v) >= 0)) { msg.textContent = 'Enter the fee first.'; return; } body = { commission: v }; }
    if (kind === 'archive' && !btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = `Click again to archive ${ids.length}`; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Archive'; } }, 4000); return; }
    $$('button, select, input', bar).forEach(x => { x.disabled = true; });
    const failed = [], failedIds = [];
    for (const [i, id] of ids.entries()) {
      msg.textContent = `Updating ${i + 1} of ${ids.length}…`;
      try {
        const o = S.orders.find(x => x.id === id), fee = o?.supplierCancelFee ?? '';
        if (cancelling && o?.status === 'cancelled') continue;
        if (cancelling && o?.status === 'cancellation_requested') await api('/orders/' + id + '/approve-cancellation', { method: 'POST', body: { fee } });
        else if (cancelling) await api('/orders/' + id, { method: 'PUT', body: { status: 'cancelled', fee } });
        else if (kind === 'archive' || kind === 'restore') await api('/admin/orders/' + id + '/archive', { method: 'POST', body: { archived: kind === 'archive' } });
        else await api('/orders/' + id, { method: 'PUT', body });
      } catch (ex) { failedIds.push(id); failed.push(`${orderName(S.orders.find(o => o.id === id) || S.archivedOrders.find(o => o.id === id) || { id })}: ${ex.message}`); }
    }
    const done = ids.length - failed.length;
    S.picked = new Set(failedIds); // what didn't work stays selected, so it can be tried again
    await loadAll(); renderList(); if (kind === 'archive' || kind === 'restore') tell({ type: 'dl-clients-changed' });
    toast(`Updated ${done} order${done === 1 ? '' : 's'}.` + (failed.length ? ` ${failed.length} not changed — they stay selected.` : ''));
    if (failed.length) { const m = $('[data-bulk-msg]'); if (m) m.textContent = failed.slice(0, 3).join(' · '); }
  }
  function renderList() {
    if(S.tab==='products'||S.tab==='claims')return;
    if (S.tab === 'orders') renderOrders();
    else if (S.tab === 'clients') renderClients();
    else if (S.tab === 'overview') renderOverview();
    else { const a = $('[data-admins]'); if (a && !a.querySelector('[data-admin-form]')) a.innerHTML = adminsHTML(); }
  }

