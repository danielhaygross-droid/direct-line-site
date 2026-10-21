  // ---------- order drawer ----------
  let chatCtl = null, drawerEvents = [];
  function openOrder(id, focus) {
    const o = S.orders.find(x => x.id === Number(id));
    if (!o) return;
    const d = UI.getDrawer();
    chatCtl?.destroy(); drawerEvents = [];
    d.foot.dataset.confirm = '';
    d.onClose = () => { chatCtl?.destroy(); chatCtl = null; };
    d.open(o.id);
    d.body.innerHTML = '<div data-d-info style="display:grid;gap:16px"></div><section><h3 class="sec-title">Messages with Direct Line</h3><div data-d-chat></div></section>';
    fillDrawer(o);
    chatCtl = UI.chat($('[data-d-chat]', d.body), { orderId: o.id, role: 'client', readOnly:!!(S.me.preview || S.me.acting), onLoad: data => {
      drawerEvents = data.events || [];
      const cur = S.orders.find(x => x.id === o.id);
      const hadUnread=cur?.unreadMessages,oldCount=cur?.messages;UI.syncConversation(cur,data);
      if (cur && hadUnread) { cur.unreadMessages = 0; updateChrome(); if (S.route !== 'new' && S.route !== 'edit') renderView(true); }
      if(cur && oldCount!==cur.messages){updateChrome();if(S.route==='messages')renderView(true);}
      if (cur && d.isOpen && d.key === cur.id) fillDrawer(cur, true);
    } });
    // Opening an order marks its notifications as read.
    noteItems().filter(x => x.orderId === o.id && x.unread).forEach(x => reads().add(x.id));
    store.set(readKey(), [...reads()].slice(-300)); updateChrome();
    if (S.route === 'home' || S.route === 'orders') renderView(true);
    if (focus === 'chat') setTimeout(() => { $('[data-d-chat]', d.body)?.scrollIntoView({ block: 'start' }); chatCtl?.focus(); }, 320);
  }
  function fillDrawer(o, keepFoot) {
    if(keepFoot && ($('#claim-form')?.dataset.dirty || $('#customer-form')?.dataset.dirty || $('#numbers-form')?.dataset.dirty))return;
    const d = UI.getDrawer();
    d.head.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2>${esc(orderName(o))}</h2>${UI.pill(o.status)}</div><p>Added ${esc(fullDate(o.createdAt))} · to ${esc(place(o.destination))}</p>`;
    $('[data-d-info]', d.body).innerHTML = `
      <section class="card card-pad">${UI.tracker(o, drawerEvents)}</section>${UI.activity(drawerEvents)}
      ${claimCard(S.claims.find(c=>c.orderId===o.id))}
      <section class="card card-pad"><h3 class="sec-title">Invoices</h3>${invoiceLinks(S.invoices.filter(f=>f.orderIds.includes(o.id)))}</section>
      <section class="card card-pad"><h3 class="sec-title">Tracking</h3>${o.trackingNumber
        ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="tracking" style="font-size:16px;font-weight:600">${esc(o.trackingNumber)}</span>${o.courier ? `<span class="courier-tag"><small>Courier</small> <b data-no-i18n>${esc(o.courier)}</b></span>` : ''}<span style="flex:1"></span><button type="button" class="btn btn-sm" data-copy="${esc(o.trackingNumber)}">${ic('copy')}Copy</button><a class="btn btn-sm" href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${ic('ext')}Track parcel</a></div>`
        : '<p class="muted" style="margin:0">No tracking number yet. Direct Line will add it after the parcel ships.</p>'}</section>
      <section class="card card-pad" data-d-media><h3 class="sec-title">Product photos &amp; link</h3>${productMedia(o)}</section>
      <section class="card card-pad"><h3 class="sec-title">Details</h3><dl class="kv">
        <div><dt>Order number</dt><dd>${esc(o.orderRef) || '—'}</dd></div>${o.deliveredAt ? `<div><dt>Delivered date</dt><dd>${esc(fullDate(o.deliveredAt))}</dd></div>` : ''}${o.cancellationReason ? `<div class="full"><dt>Cancellation reason</dt><dd data-no-i18n>${esc(o.cancellationReason)}</dd></div>` : ''}<div><dt>Order date</dt><dd>${esc(o.orderDate) || fullDate(o.createdAt)}</dd></div>
        ${o.itemTitle ? `<div class="full"><dt>Product</dt><dd>${esc(o.itemTitle)}</dd></div>` : ''}<div><dt>Quantity</dt><dd>${esc(o.quantity || 1)}</dd></div><div><dt>SKU / listing ID</dt><dd>${esc(o.sku) || '—'}</dd></div>
        ${o.variant ? `<div class="full"><dt>Variation / personalization</dt><dd>${esc(o.variant)}</dd></div>` : ''}
        <div><dt>Customer</dt><dd>${esc(o.buyerName) || '—'}</dd></div><div><dt>Country</dt><dd>${esc(place(o.destination))}</dd></div>
        <div class="full"><dt>Delivery address &amp; phone</dt><dd style="white-space:pre-line">${DL.addressLines(o, o.destination ? place(o.destination) : '', true).map(esc).join('\n') || '—'}</dd></div>
        ${o.taxNumber ? `<div class="full"><dt>Tax number</dt><dd data-no-i18n>${esc(o.taxNumber)}</dd></div>` : ''}${o.giftMessage ? `<div class="full"><dt>Gift message</dt><dd data-no-i18n style="white-space:pre-line">${esc(o.giftMessage)}</dd></div>` : ''}
        ${o.notes ? `<div class="full"><dt>Notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl></section>
      <section class="card card-pad"><h3 class="sec-title">Sale &amp; cost</h3><div class="money-rows">
        <div class="total"><span>Customer paid</span><span>${o.sellingPrice == null ? '<span class="dim">Not entered</span>' : esc(customerPaid(o))}</span></div>
        <div><span>Etsy fee</span><span>${o.etsyFee == null ? '<span class="dim">Not entered</span>' : `-${esc(o.currency || 'USD')} ${Number(o.etsyFee).toFixed(2)}`}</span></div>
        <div class="total"><span>You earned <small class="dim">after Etsy fees</small></span><span>${earnedOf(o) == null ? '<span class="dim">Not entered</span>' : esc(money2(earnedOf(o), o))}</span></div>
        <div><span>Total you pay</span><span>${!o.priced ? 'Pending Direct Line' : money(o.price)}</span></div>
        ${(st => st ? `<div><span>Payment</span><span>${st === 'paid' ? `<span class="pay-tag paid">Paid</span> <small class="dim" data-no-i18n>${esc(window.DLPayOrders.day(o.paidAt))}</small>` : st === 'unpaid' ? '<span class="pay-tag unpaid">Not paid yet</span>' : '<span class="dim">No bill yet</span>'}</span></div>` : '')(window.DLPayOrders.state(o, S.adjustments))}
        ${o.priced && o.quotedUnitPrice != null ? `<div><span><span>Per item</span> <small class="dim" data-no-i18n>× ${esc(o.quantity || 1)}</small></span><span>${money(o.quotedUnitPrice)}</span></div>${o.quotedShipping != null ? `<div><span>Shipping per order</span><span>${money(o.quotedShipping)}</span></div>` : ''}` : o.priced ? `<div><span><span>Per item</span> <small class="dim" data-no-i18n>× ${esc(o.quantity || 1)}</small></span><span>${money(Math.round(o.price / (o.quantity || 1) * 100) / 100)}</span></div>` : ''}
        ${profitOf(o) == null ? '' : `<div><span>Your profit</span><span class="${profitOf(o) > 0 ? 'pos' : profitOf(o) < 0 ? 'neg' : ''}"><b>${money(profitOf(o))}</b></span></div>`}</div>
        ${o.priced && earnedOf(o) == null && o.status !== 'cancelled' ? '<p class="note" style="margin:10px 0 0">Add the Etsy fee, or what Etsy says you earned, to see your profit.</p>' : o.priced && notUsd(o) && o.status !== 'cancelled' ? '<p class="note" style="margin:10px 0 0">Profit is only worked out for orders in USD, so this order is not in your profit totals.</p>' : ''}</section>
      ${S.me.preview || o.status === 'cancelled' ? '' : `<section class="card card-pad"><h3 class="sec-title">Your numbers</h3><p class="note">Copy these from your Etsy order screen: what the buyer paid and the Etsy fee, or just what Etsy says you earned (Earnings tab). They only change your profit figures, never your bill.</p>
        <form id="numbers-form" class="form-grid" novalidate>
          <label class="field"><span>Customer paid <small>what the buyer paid</small></span><input name="sellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${o.sellingPrice == null ? '' : Number(o.sellingPrice).toFixed(2)}"></label>
          <label class="field"><span>Currency</span><select name="currency">${['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD'].map(c => `<option${c === (o.currency || 'USD') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Etsy fee <small>fees Etsy took from this order</small></span><input name="etsyFee" type="number" min="0" step="0.01" inputmode="decimal" value="${o.etsyFee == null ? '' : Number(o.etsyFee).toFixed(2)}"></label>
          <label class="field"><span>Or: You earned <small>Etsy › order › Earnings</small></span><input name="etsyEarned" type="number" min="0" step="0.01" inputmode="decimal" value="${o.etsyEarned == null ? '' : Number(o.etsyEarned).toFixed(2)}"></label>
          <label class="field full"><span>Competitor price <small>what other shops charge · our supplier sees it</small></span><input name="competitorPrice" dir="auto" maxlength="200" autocomplete="off" data-no-i18n placeholder="e.g. $24.90 on Etsy shop X" value="${esc(o.competitorPrice)}"></label>
          <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="submit" class="btn btn-primary">Save numbers</button><p class="form-msg" data-numbers-msg style="margin:0" role="status"></p></div>
        </form></section>`}`;
    bindNumbers(o);
    if (keepFoot && d.foot.dataset.confirm) return;
    d.foot.innerHTML = `${editable(o) ? `<div><a class="btn" href="#/edit/${o.id}" data-close-drawer>${ic('edit')}Edit order</a><p class="muted" style="font-size:12px">You can edit for ${hoursLeft(o)} more hours.</p></div>` : `<a class="muted" href="#/messages/${o.id}" data-close-drawer>This order is already being processed. Need a change? Send us a message.</a>`}${canChangeCustomer(o) ? `<button type="button" class="btn" data-change-customer="${o.id}">${ic('edit')}Change customer details</button>` : ''}<span class="spacer"></span>${['pending','processing','shipped'].includes(o.status) ? `<div><button type="button" class="btn btn-danger" data-cancel-order="${o.id}">Request cancellation</button><p class="muted" style="font-size:12px">Free before the item reaches our warehouse. $4 after it arrives at the warehouse, or if the parcel is intercepted.</p></div>` : ''}${o.status === 'shipped' ? `<button type="button" class="btn btn-primary" data-delivered="${o.id}">Mark as delivered</button>` : ''}${!S.claims.some(c=>c.orderId===o.id) && (o.claimEligibility?.problem || o.claimEligibility?.lost) ? `<button type="button" class="btn" data-report-claim="${o.id}">${o.claimEligibility.lost ? 'Report lost parcel' : 'Report a problem'}</button>` : ''}`;
  }
  // "Your numbers": the client's own accounting for one order. Allowed at any time (it never changes the bill).
  function bindNumbers(o) {
    const f = $('#numbers-form'); if (!f) return;
    f.addEventListener('input', () => { f.dataset.dirty = '1'; const m = $('[data-numbers-msg]', f); if (m.classList.contains('err')) { m.textContent = ''; m.className = 'form-msg'; } });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const b = $('[type=submit]', f), m = $('[data-numbers-msg]', f); if (b.disabled) return;
      b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      try {
        await api('/orders/' + o.id, { method: 'PUT', body: { sellingPrice: f.sellingPrice.value, currency: f.currency.value, etsyFee: f.etsyFee.value, etsyEarned: f.etsyEarned.value, competitorPrice: f.competitorPrice.value } });
        f.dataset.dirty = ''; await refresh(); N.popup({ icon: 'check', title: 'Numbers saved' }, { duration: 4000 });
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
    });
  }
  function refreshDrawer() {
    const d = UI.getDrawer();
    if (!d.isOpen) return;
    const o = S.orders.find(x => x.id === d.key);
    if (o) fillDrawer(o, true);
  }

