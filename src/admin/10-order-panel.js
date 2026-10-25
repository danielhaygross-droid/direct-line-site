  // ---------- side panel: one order ----------
  let chatCtl = null, events = [];
  function closeChat() { chatCtl?.destroy(); chatCtl = null; }
  function openOrder(id, focus, back) {
    const o = [...S.orders,...S.archivedOrders].find(x => x.id === Number(id)); if (!o) return;
    const d = UI.getDrawer();
    closeChat(); events = [];
    S.drawer = { kind: 'order', id: o.id, back };
    d.onClose = () => { closeChat(); S.drawer = null; };
    d.open('o' + o.id);
    d.body.innerHTML = '<div data-d-info style="display:grid;gap:16px"></div><section><h3 class="sec-title">Messages with the client</h3><div data-d-chat></div></section>';
    invoiceFiles=[];fillOrder(o);
    api('/admin/invoices?clientId='+o.clientId).then(r=>{if(S.drawer?.kind==='order'&&S.drawer.id===o.id){invoiceFiles=r.invoices;fillOrder(o,true);}}).catch(ex=>toast(ex.message));
    chatCtl = UI.chat($('[data-d-chat]', d.body), { orderId: o.id, role: 'admin', readOnly: !!o.archived, onLoad: data => {
      events = data.events || [];
      const cur = [...S.orders,...S.archivedOrders].find(x => x.id === o.id);
      const hadUnread=cur?.unreadMessages,oldCount=cur?.messages;UI.syncConversation(cur,data);
      if (cur && (hadUnread || oldCount!==cur.messages)) { cur.unreadMessages = 0; renderKpis(); renderList(); tell({ type: 'dl-followups', unread: unreadTotal() }); }
      if (cur && S.drawer?.kind === 'order' && S.drawer.id === cur.id) fillOrder(cur, true);
    } });
    if (focus === 'chat') setTimeout(() => { $('[data-d-chat]', d.body)?.scrollIntoView({ block: 'start' }); chatCtl?.focus(); }, 320);
  }
  function fillOrder(o, soft) {
    const d = UI.getDrawer(), back = S.drawer?.back;
    d.head.innerHTML = `${back ? `<button type="button" class="back" data-back>${ic('back')}${esc(clientName(back))}</button>` : ''}<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2>${esc(orderName(o))}</h2>${UI.pill(o.status)}${UI.delayTag(o)}</div><p>${esc(clientName(o.clientId))} · ordered ${esc(o.orderDate || fullDate(o.createdAt))} · to ${esc(place(o.destination))}</p><p><span>Added</span> ${esc(fullDate(o.createdAt))}</p>`;
    const info = $('[data-d-info]', d.body); if (!info) return;
    if (soft && $('[name=invoiceFile]',info)?.files.length) return;
    if (soft && info.contains(document.activeElement) && document.activeElement.matches('input')) return;
    if (o.archived) {
      info.innerHTML = `<section class="card card-pad"><h3 class="sec-title">Archived order</h3><p>This order is hidden from normal order lists. Billing and payment history are preserved.</p><p><span>Archived at</span> ${esc(fullDate(o.archivedAt))}</p>${UI.activity(events)}</section>`;
      d.foot.innerHTML = `<button type="button" class="btn btn-primary" data-restore-order="${o.id}">Restore order</button>`;
      return;
    }
    info.innerHTML = `
      <section class="card card-pad">${UI.delayNote(o)}${UI.tracker(o, events)}</section>${UI.activity(events)}
      <section class="card card-pad" data-d-media><h3 class="sec-title">Product photos &amp; link</h3>${productMedia(o, { removable: true, canAdd: (o.photos || []).length < 8 })}</section>
      <section class="card card-pad"><h3 class="sec-title">Update status</h3>
        ${o.status==='cancelled' ? '<p class="note">This order is cancelled. Choose a status to reopen it; its cancellation fee is then removed.</p>' : ''}
        <div class="status-btns">${ADMIN_STATUSES.map(s => `<button type="button" class="t-${s}${s === o.status ? ' on' : ''}" data-set-status="${s}" data-id="${o.id}">${UI.LABEL[s]}</button>`).join('')}${o.status === 'cancellation_requested' ? '' : `<button type="button" class="t-cancelled${o.status === 'cancelled' ? ' on' : ''}"${o.status === 'cancelled' ? '' : ' data-cancel-open aria-expanded="false"'}>${UI.LABEL.cancelled}</button>`}</div>
        ${['cancelled', 'cancellation_requested'].includes(o.status) ? '' : `<div class="cancel-box" data-cancel-box hidden><p>The client sees it as cancelled. Add a cancellation fee if one applies. You can reopen the order later.</p>
          <div class="cancel-row"><label class="field"><span>Cancellation fee (USD) <small>optional</small></span><input name="directCancelFee" type="number" min="0" step="0.01" placeholder="0.00"></label><button type="button" class="btn" data-cancel-four-direct>$4</button><button type="button" class="btn btn-danger" data-cancel-direct="${o.id}">Cancel this order</button><button type="button" class="btn btn-ghost" data-cancel-close>Keep the order</button></div></div>`}
        <form class="track-form" data-track-form="${o.id}"><div class="track-fields"><label class="field"><span>Tracking number</span><input name="trackingNumber" maxlength="120" value="${esc(o.trackingNumber)}" placeholder="e.g. LX123456789CN"></label><label class="field"><span>Courier</span><input name="courier" maxlength="60" list="dl-couriers" value="${esc(o.courier)}" placeholder="e.g. Yanwen"></label><datalist id="dl-couriers">${String(S.ov.settings.couriers || '').split('\n').filter(Boolean).map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>${o.domesticTracking ? `<p class="dom-track"><span>Domestic tracking in China (from the supplier sheet)</span> <b data-no-i18n>${esc(o.domesticTracking)}</b></p>` : ''}<div class="form-actions"><button class="btn" type="submit">Save tracking</button><button type="button" class="btn" data-tracking-update="${o.id}">Tracking update received</button>${o.trackingNumber ? `<a class="btn btn-ghost" href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${ic('ext')}Track</a>` : ''}</div></form>
      </section>
      <section class="card card-pad"><label class="field"><span>Store</span><select data-move-order="${o.id}">${S.stores.filter(s=>s.clientId===o.clientId&&(!s.archived||s.id===o.storeId)).map(s=>`<option value="${s.id}"${s.id===o.storeId?' selected':''}>${esc(s.name)}</option>`).join('')}</select></label></section>
      ${adminClaimCard(S.claims.find(c=>c.orderId===o.id))}
      ${o.status==='cancellation_requested' ? `<section class="card card-pad"><h3 class="sec-title">Cancellation request</h3><p data-no-i18n>${esc(o.cancellationReason)}</p><div class="cancel-row"><label class="field"><span>Cancellation fee (USD)</span><input name="cancellationFee" type="number" min="0" step="0.01" placeholder="0.00"></label><button type="button" class="btn" data-cancel-four>$4</button><button type="button" class="btn btn-danger" data-cancel-decision="approve" data-id="${o.id}">Approve cancellation</button><button type="button" class="btn" data-cancel-decision="reject" data-id="${o.id}">Reject cancellation</button></div></section>` : ''}
      <section class="card card-pad"><h3 class="sec-title">Receipts</h3>${adminInvoiceLinks(invoiceFiles.filter(f=>f.orderIds.includes(o.id)))}${invoiceForm(o.clientId,o.id)}</section>
      ${o.quotedUnitPrice!=null ? `<section class="card card-pad"><span>Fixed unit quote</span> <b>${money(o.quotedUnitPrice)}</b> × ${o.quantity} = <b>${money(o.price)}</b></section>` : billHTML(o)}
      <section class="card card-pad"><h3 class="sec-title">Details</h3><dl class="kv">
        <div><dt>Client</dt><dd><button type="button" class="back" style="margin:0" data-open-client="${o.clientId}">${esc(clientName(o.clientId))}</button></dd></div><div><dt>Order number</dt><dd>${esc(o.orderRef) || '—'}${o.source === 'etsy-csv' ? ' <span class="st" style="--tone:var(--blue);text-transform:none">From Etsy file</span>' : ''}</dd></div>
        <div><dt>Order date</dt><dd>${esc(o.orderDate) || fullDate(o.createdAt)}</dd></div><div><dt>Customer paid</dt><dd>${customerPaid(o)}</dd></div>
        ${o.itemTitle ? `<div class="full"><dt>Product</dt><dd>${esc(o.itemTitle)}</dd></div>` : ''}<div><dt>Quantity</dt><dd>${esc(o.quantity || 1)}</dd></div><div><dt>SKU / listing ID</dt><dd>${esc(o.sku) || '—'}</dd></div>
        ${o.variant ? `<div class="full"><dt>Variation / personalization</dt><dd style="white-space:pre-line">${esc(o.variant)}</dd></div>` : ''}
        ${o.competitorPrice ? `<div class="full"><dt>Competitor price <small>from the client</small></dt><dd data-no-i18n><bdi>${esc(o.competitorPrice)}</bdi></dd></div>` : ''}
        
        <div class="full"><dt>Recipient</dt><dd>${esc(o.buyerName) || '—'}</dd></div>
        <div class="full"><dt>Delivery address &amp; phone</dt><dd style="white-space:pre-line">${DL.addressLines(o, o.destination ? place(o.destination) : '', false).map(esc).join('\n') || '—'}</dd><button type="button" class="btn btn-sm" data-copy="${esc(DL.addressLines(o, o.destination ? place(o.destination) : '', true).join('\n'))}">Copy full address</button></div><div><dt>Country</dt><dd>${esc(place(o.destination))}</dd></div>
        <div><dt>Product type</dt><dd>${esc(shortCat(o.category))}</dd></div><div><dt>Weight</dt><dd>${o.weightKg != null ? esc(o.weightKg) + ' kg' : 'Not entered yet'}</dd></div><div><dt>Last update</dt><dd>${esc(fullDate(o.updatedAt))}</dd></div>
        <div><dt>Google Sheet</dt><dd>${o.sheetSyncStatus === 'synced' ? 'Synced' : o.sheetSyncStatus === 'error' ? 'Needs retry' : 'Waiting to sync'}</dd></div>
        ${o.sheetSyncError ? `<div class="full"><dt>Sheet sync note</dt><dd>${esc(o.sheetSyncError)}</dd></div>` : ''}
        ${o.taxNumber ? `<div class="full"><dt>Tax number</dt><dd data-no-i18n>${esc(o.taxNumber)}</dd></div>` : ''}${o.giftMessage ? `<div class="full"><dt>Gift message</dt><dd data-no-i18n style="white-space:pre-line">${esc(o.giftMessage)}</dd></div>` : ''}
        ${o.notes ? `<div class="full"><dt>Client’s notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl></section>
      <section class="card card-pad"><h3 class="sec-title">Fee on this order</h3><form class="form-grid" data-fees-form="${o.id}" novalidate>
        <label class="field"><span>Fee <small>kept in the client’s price</small></span><span class="money"><input name="commission" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(o.commission||0).toFixed(2)}"></span></label>
        <p class="note full" style="margin:0">Changes only this order. The default fee in Fees &amp; settings and each client’s own fee apply to new orders.</p>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save fee</button><p class="form-msg" data-fees-msg style="margin:0"></p></div></form></section>
      <section class="card card-pad"><h3 class="sec-title">Money</h3><div class="money-rows">
        ${o.supplierCost != null ? `<div><span>Supplier total <span class="dim">(from supplier sheet)</span></span><span>${money(o.supplierCost)}</span></div>` : ''}
        <div><span>Product cost <span class="dim">(fee included)</span></span><span>${money(o.productCost)}</span></div><div><span>Shipping fee</span><span>${money(o.shippingFee)}</span></div>
        <div class="total"><span>Client pays</span><span>${money(o.price)}</span></div>
        <div><span>Payment</span><span>${o.paymentId ? `<span class="pay-tag paid">Paid</span> <small class="dim" data-no-i18n>${esc(window.DLPayOrders.day(o.paidAt))}</small>` : window.DLPayOrders.state(o) === 'unpaid' ? '<span class="pay-tag unpaid">Not paid</span>' : '<span class="dim">No bill yet</span>'}</span></div>${o.priceSource === 'saved' ? '<p class="note" style="margin:6px 0 0">Priced automatically from an earlier order of this client (same store, product, variation, country and quantity). The supplier can change the total cost in the sheet.</p>' : ''}
        <div><span>Customer paid client</span><span>${customerPaid(o)}</span></div><div><span>Client’s profit</span><span class="${o.profit != null && o.profit > 0 ? 'pos' : o.profit != null && o.profit < 0 ? 'neg' : ''}">${needsCost(o) ? 'Pending costs' : o.profit == null ? ((o.currency || 'USD') !== 'USD' && o.earned != null ? '<span class="dim">Not in USD</span>' : '<span class="dim">Needs the Etsy earnings</span>') : money(o.profit)}</span></div></div>
        <div class="split"><div><small>Fee on this order</small><b>${money(o.commission)}</b></div><div><small>We earn</small><b class="pos">${money(o.ourShare)}</b></div></div></section>`;
    bindBill(o);
    d.foot.innerHTML = `<button type="button" class="btn" data-edit-order="${o.id}">${ic('edit')}Edit order</button><button type="button" class="btn" data-open-client="${o.clientId}">Open client</button><button type="button" class="btn btn-danger" data-archive-order="${o.id}">Archive order</button>`;
  }

  function subscriptionHTML(c) {
    const sub = c.subscription || {}, price = sub.price ?? Number(S.ov.settings.subscription_price ?? 29);
    const opt = (v, l) => `<option value="${v}"${(sub.status || 'trial') === v ? ' selected' : ''}>${l}</option>`;
    return `<section class="card card-pad"><h3 class="sec-title">Subscription</h3>
      <p class="muted" style="margin:0 0 12px;font-size:14px">First month free, then ${esc(shekels(price))} / month. The client sees this in their portal. Nothing is charged or blocked automatically.</p>
      <form class="form-grid" data-sub-form="${c.id}" novalidate>
        <label class="field"><span>Status</span><select name="subStatus">${opt('trial', 'Free month (trial)')}${opt('active', 'Active (paying)')}${opt('overdue', 'Overdue')}${opt('cancelled', 'Cancelled')}</select></label>
        <label class="field"><span>Last payment <small>optional</small></span><input name="subLastPayment" type="date" value="${esc(sub.lastPayment || '')}"></label>
        <label class="field"><span>Trial start</span><input name="trialStart" type="date" value="${esc(sub.trialStart || '')}"></label>
        <label class="field"><span>Trial end <small>1 month after start</small></span><input name="trialEnd" type="date" value="${esc(sub.trialEnd || '')}"></label>
        <div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Save subscription</button><p class="form-msg" data-sub-msg></p></div></form></section>`;
  }
  document.addEventListener('change', e => {
    const el = e.target; if (!el.matches?.('[data-sub-form] [name=trialStart]') || !el.value) return;
    el.form.trialEnd.value = addMonthIso(el.value);
  });
  const addMonthIso = iso => { const [y, m, d] = iso.split('-').map(Number); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10); };

  // Bill an order right from its panel: product type + weight (and size) → shipping fee from our rates,
  // plus product cost (our hidden fee included) = what the client pays. Saves onto the order.
  function billHTML(o) {
    const v2 = x => (x != null ? Number(x).toFixed(2) : '');
    const rated = !!RATES[o.destination];
    return `<section class="card card-pad"><h3 class="sec-title">Bill this order</h3>
      <form class="form-grid bill-form" data-bill-form="${o.id}" novalidate>
        <label class="field"><span>Product type</span><select name="category">${categoryOptions(o.category || 'general')}</select></label>
        <label class="field"><span>Weight (kg)</span><input name="weightKg" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 0.25" value="${o.weightKg ?? ''}"></label>
        <div class="field full"><span>Size L × W × H (cm) <small>optional · big, light boxes are charged by size</small></span><div class="dims"><input name="l" type="number" min="0" placeholder="L" aria-label="Length"><input name="w" type="number" min="0" placeholder="W" aria-label="Width"><input name="h" type="number" min="0" placeholder="H" aria-label="Height"></div></div>
        <label class="field"><span>Product cost <small>fee included</small></span><span class="money"><input name="productCost" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(o.productCost)}"></span></label>
        <label class="field"><span>Shipping fee <small data-bill-hint></small></span><span class="money"><input name="shippingFee" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(o.shippingFee)}"></span></label>
        <div class="full calc-out bill-out" data-bill-out></div>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save bill</button><p class="form-msg" data-bill-msg style="margin:0"></p></div>
        ${rated ? '' : `<p class="note full" style="margin:0">No shipping rate saved for ${esc(place(o.destination))} yet — type the shipping fee.</p>`}
      </form></section>`;
  }
  function bindBill(o) {
    const f = $(`[data-bill-form="${o.id}"]`); if (!f) return;
    let auto = null;
    const upd = () => {
      const q = quote({ country: o.destination, category: f.category.value, weightKg: f.weightKg.value, lengthCm: f.l.value, widthCm: f.w.value, heightCm: f.h.value, divisor: divisor() });
      const qs = q ? q.total.toFixed(2) : null;
      if (q && (f.shippingFee.value === '' || f.shippingFee.value === auto)) { f.shippingFee.value = qs; auto = qs; }
      $('[data-bill-hint]', f).innerHTML = !q ? '' : f.shippingFee.value === qs ? 'from our rates' : `<button type="button" class="back" style="margin:0" data-bill-use="${qs}">use ${money(q.total)}</button>`;
      const pc = parseFloat(f.productCost.value), sh = parseFloat(f.shippingFee.value), have = Number.isFinite(pc) || Number.isFinite(sh);
      $('[data-bill-out]', f).innerHTML = `<small>Client pays</small><strong>${have ? money((pc || 0) + (sh || 0)) : '—'}</strong><div class="bd">${q ? `Shipping: ${q.chargeable} kg${q.usedVolumetric ? ' (by size)' : ''} × ${money(q.perKg)}/kg + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}${q.estimated ? ' · estimated rate' : ''}` : 'Enter the weight to work out shipping from our rates.'}${Number.isFinite(pc) ? ` · Product ${money(pc)}` : ''}</div>`;
    };
    f.addEventListener('input', e => { if (e.target.name === 'shippingFee') auto = null; upd(); });
    f.addEventListener('change', upd);
    f.addEventListener('click', e => { const u = e.target.closest('[data-bill-use]'); if (u) { f.shippingFee.value = u.dataset.billUse; auto = f.shippingFee.value; upd(); } });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-bill-msg]', f);
      if (f.productCost.value === '' && f.shippingFee.value === '') { m.textContent = 'Enter the product cost and shipping fee.'; m.className = 'form-msg err'; return; }
      const body = { category: f.category.value, weightKg: f.weightKg.value === '' ? null : f.weightKg.value,
        productCost: f.productCost.value === '' ? null : f.productCost.value, shippingFee: f.shippingFee.value === '' ? null : f.shippingFee.value };
      const btn = $('[type=submit]', f); if (btn.disabled) return; btn.disabled = true;
      try {
        await api('/orders/' + o.id, { method: 'PUT', body });
        document.activeElement?.blur(); await loadAll(); renderList(); renderKpis();
        const cur = [...S.orders,...S.archivedOrders].find(x => x.id === o.id); if (cur) fillOrder(cur);
        toast('Bill saved. ' + money(cur?.price) + ' added to what ' + (clientName(o.clientId) || 'the client') + ' owes.');
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; btn.disabled = false; }
    });
    upd();
  }

