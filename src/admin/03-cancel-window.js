  // ---------- cancel window: decide each order's fees before cancelling (Erwin, 8 Nov 2026) ----------
  // "When I press Set status, a pop up asks me all relevant changes before proceeding with approval of cancellations:
  // which orders should I still charge our fee and not." Opens from bulk Set status → Cancelled and from Approve
  // cancellation / Cancelled in an order's panel. One row per order: in or out, the cancellation fee (the supplier's from
  // the sheet, editable) and whether our fee is charged. Our fee starts ticked only on orders the client already paid
  // (the rule since 29 Oct), so nothing changes unless Erwin changes it. Nothing is saved until the main button.
  // keepFee sent to the server: 'auto' when the tick matches that rule, else 'yes' / 'no' (syncKeptFees).
  // Admin only: clients see one "Cancellation fee" per order, our fee inside it.
  let cxWin = null;
  const cwCents = v => Math.round(Number(v || 0) * 100);
  const cwAuto = o => !!o.paymentId && Number(o.commission) > 0;
  function openCancelWindow(ids, onDone) {
    const list = ids.map(id => S.orders.find(o => o.id === Number(id))).filter(o => o && o.status !== 'cancelled');
    if (!list.length) { toast('These orders are already cancelled.'); return; }
    cxWin?.remove();
    const dlg = cxWin = document.createElement('dialog');
    dlg.className = 'cxw'; dlg.setAttribute('aria-labelledby', 'cxw-h'); dlg.dataset.cancelWindow = '';
    const fee = o => o.supplierCancelFee != null ? Number(o.supplierCancelFee).toFixed(2) : '';
    const row = o => `<div class="cxw-row" data-cw-row="${o.id}">
        <label class="cxw-in"><input type="checkbox" data-cw-in checked aria-label="Cancel ${esc(orderName(o))}"></label>
        <div class="cxw-who"><b data-no-i18n>${esc(orderName(o))}</b><small><span data-no-i18n>${esc(clientName(o.clientId))}</span> · ${o.paymentId ? '<span class="pay-tag paid">Paid</span>' : '<span class="pay-tag unpaid">Not paid</span>'} <span data-no-i18n>${money(o.price)}</span></small>${o.status === 'cancellation_requested' ? `<small class="cxw-why"><span>Client asked to cancel</span>${o.cancellationReason ? `: <span data-no-i18n>${esc(o.cancellationReason)}</span>` : ''}</small>` : ''}</div>
        <label class="field cxw-fee"><span>Cancellation fee</span><span class="money"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" data-cw-fee value="${fee(o)}"></span><small class="dim">${o.supplierCancelFee != null ? 'From the supplier sheet' : 'None in the sheet'}</small></label>
        <label class="cxw-keep${Number(o.commission) > 0 ? '' : ' off'}"><input type="checkbox" data-cw-keep${cwAuto(o) ? ' checked' : ''}${Number(o.commission) > 0 ? '' : ' disabled'}><span><span>Charge our fee</span> <b data-no-i18n>${money(o.commission)}</b></span></label>
      </div>`;
    dlg.innerHTML = `<form method="dialog" class="cxw-box" novalidate>
      <div class="kw-head"><h3 id="cxw-h">${list.length === 1 ? 'Cancel this order' : `Cancel ${list.length} orders`}</h3><button type="button" class="kw-x" data-cw-close aria-label="Close">${UI.svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <p class="muted cxw-lead">Check each order before it is cancelled: the cancellation fee and whether our fee is still charged. Our fee is ticked on orders the client already paid.</p>
      ${list.length > 1 ? `<div class="cxw-all"><b>Set for all</b><label class="field cxw-fee"><span>Cancellation fee</span><span class="money"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" data-cw-all-fee></span></label><button type="button" class="btn btn-sm" data-cw-all-apply>Use for all</button>
        <label class="field"><span>Charge our fee</span><select data-cw-all-keep><option value="">Choose…</option><option value="paid">Paid orders only</option><option value="all">All orders</option><option value="none">No orders</option></select></label></div>` : ''}
      <div class="cxw-list">${list.map(row).join('')}</div>
      <div class="cxw-sum" data-cw-sum aria-live="polite"></div>
      <p class="form-msg" data-cw-msg role="alert"></p>
      <div class="cxw-actions"><button type="button" class="btn btn-ghost" data-cw-close>Keep the orders</button><button type="submit" class="btn btn-danger" data-cw-go></button></div>
    </form>`;
    document.body.appendChild(dlg);
    const rows = () => [...dlg.querySelectorAll('[data-cw-row]')].map(r => ({ r, o: list.find(x => x.id === Number(r.dataset.cwRow)), on: r.querySelector('[data-cw-in]').checked, feeIn: r.querySelector('[data-cw-fee]'), keep: r.querySelector('[data-cw-keep]').checked }));
    // What each client is charged: cancellation fees + our fee, per client (the parts add up to the total).
    const sum = () => {
      const picked = rows().filter(x => x.on), by = new Map();
      for (const x of picked) {
        const k = x.o.clientId, s = by.get(k) || { n: 0, feeC: 0, oursC: 0 };
        s.n++; s.feeC += cwCents(x.feeIn.value); s.oursC += x.keep ? cwCents(x.o.commission) : 0; by.set(k, s);
      }
      dlg.querySelector('[data-cw-sum]').innerHTML = picked.length ? [...by].map(([k, s]) => `<div class="kw-row tot"><span class="kw-op"></span><span class="kw-l"><span data-no-i18n>${esc(clientName(k))}</span> <small><span>${s.n === 1 ? '1 order' : s.n + ' orders'}</span> · <span>cancellation fees</span> <span data-no-i18n>${money(s.feeC / 100)}</span> + <span>our fee</span> <span data-no-i18n>${money(s.oursC / 100)}</span></small></span><b data-no-i18n>${money((s.feeC + s.oursC) / 100)}</b></div>`).join('') + '<p class="dim cxw-note">Charged to the client for these cancellations. On a paid order it comes off their credit.</p>' : '<p class="muted">No order picked.</p>';
      const go = dlg.querySelector('[data-cw-go]'), n = picked.length;
      go.textContent = n === 1 ? 'Cancel 1 order' : `Cancel ${n} orders`; go.disabled = !n;
      for (const x of rows()) x.r.classList.toggle('out', !x.on);
    };
    dlg.addEventListener('input', sum); dlg.addEventListener('change', e => {
      const k = e.target.closest('[data-cw-all-keep]');
      if (k && k.value) { for (const x of rows()) { const b = x.r.querySelector('[data-cw-keep]'); if (!b.disabled) b.checked = k.value === 'all' || (k.value === 'paid' && cwAuto(x.o)); } k.value = ''; }
      sum();
    });
    dlg.addEventListener('click', async e => {
      if (e.target.closest('[data-cw-close]') || e.target === dlg) { dlg.close(); return; }
      if (e.target.closest('[data-cw-all-apply]')) { const v = dlg.querySelector('[data-cw-all-fee]').value; for (const x of rows()) x.feeIn.value = v; sum(); }
    });
    dlg.addEventListener('close', () => { dlg.remove(); if (cxWin === dlg) cxWin = null; });
    dlg.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = dlg.querySelector('[data-cw-msg]'), picked = rows().filter(x => x.on);
      const bad = picked.find(x => x.feeIn.value !== '' && !(Number(x.feeIn.value) >= 0));
      if (bad) { msg.textContent = 'Enter each cancellation fee as an amount, or leave it empty for no fee.'; bad.feeIn.focus(); return; }
      dlg.querySelectorAll('button, input, select').forEach(x => { x.disabled = true; });
      const failed = [];
      for (const [i, x] of picked.entries()) {
        msg.className = 'form-msg'; msg.textContent = `Cancelling ${i + 1} of ${picked.length}…`;
        const body = { fee: x.feeIn.value === '' ? 0 : x.feeIn.value, keepFee: x.keep === cwAuto(x.o) ? 'auto' : x.keep ? 'yes' : 'no' };
        try {
          if (x.o.status === 'cancellation_requested') await api('/orders/' + x.o.id + '/approve-cancellation', { method: 'POST', body });
          else await api('/orders/' + x.o.id, { method: 'PUT', body: { status: 'cancelled', ...body } });
        } catch (ex) { failed.push({ id: x.o.id, text: `${orderName(x.o)}: ${ex.message}` }); }
      }
      await loadAll(); renderList(); refreshDrawer();
      onDone?.(failed.map(f => f.id));
      const done = picked.length - failed.length;
      if (!failed.length) { dlg.close(); toast(done === 1 ? 'Order cancelled. The client sees it right away.' : `${done} orders cancelled. The client sees them right away.`); return; }
      msg.className = 'form-msg err'; msg.textContent = failed.map(f => f.text).slice(0, 3).join(' · ');
      for (const x of rows()) if (!failed.some(f => f.id === x.o.id)) x.r.remove();
      dlg.querySelectorAll('button, input, select').forEach(b => { b.disabled = false; }); sum();
    });
    sum(); dlg.showModal();
    dlg.querySelector('[data-cw-fee]')?.focus();
  }
