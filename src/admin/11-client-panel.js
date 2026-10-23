  // ---------- side panel: one client ----------
  let payments = [], transferProofs = [], invoiceFiles=[], balanceAdjustments=[], billing = null, savedPrices = null, clientActivity = null;
  async function openClient(id, tab = 'orders') {
    const c = clientOf(id); if (!c) return;
    const d = UI.getDrawer();
    closeChat(); payments = []; transferProofs = []; invoiceFiles=[];balanceAdjustments=[]; billing = null; savedPrices = null; clientActivity = null;
    S.drawer = { kind: 'client', id: c.id, tab };
    d.onClose = () => { S.drawer = null; };
    d.open('c' + c.id);
    fillClient(c);
    await loadPayments(c.id);
  }
  async function loadSavedPrices(id) {
    try { savedPrices = (await api('/admin/saved-prices?clientId=' + id)).prices; } catch (ex) { savedPrices = []; toast(ex.message); }
    if (S.drawer?.kind === 'client' && S.drawer.id === id) fillClient(clientOf(id), true);
  }
  // Prices the supplier gave before, used automatically for the same order again (same store, product, variation, country, quantity).
  function savedPricesHTML(c) {
    const fee = Number(c.commissionPerOrder ?? S.ov.settings.commission_per_order ?? 0);
    const intro = '<p class="note" style="margin:0 0 12px">When the supplier fills in the total cost of an order, it is saved here. The next order with the same store, product, variation, country and quantity gets that price straight away. The supplier can still change it in the sheet, and the newest cost is kept.</p>';
    if (savedPrices === null) return `<section class="card card-pad"><h3 class="sec-title">Saved prices</h3>${intro}<p class="muted">Loading…</p></section>`;
    if (!savedPrices.length) return `<section class="card card-pad"><h3 class="sec-title">Saved prices</h3>${intro}${empty('No saved prices yet', 'They appear after the supplier prices this client’s orders.')}</section>`;
    return `<section class="card card-pad" style="padding-bottom:6px"><h3 class="sec-title">Saved prices</h3>${intro}</section><section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Product</th><th>Country</th><th class="num">Qty</th><th class="num">Supplier cost</th><th class="num">Client pays</th><th>Used</th><th></th></tr></thead><tbody>
      ${savedPrices.map(p => `<tr><td data-label="Product"><b data-no-i18n>${esc(p.label) || '—'}</b>${p.variant ? `<br><small class="dim" data-no-i18n>${esc(p.variant)}</small>` : ''}${p.storeName ? `<br><small class="dim" data-no-i18n>${esc(p.storeName)}</small>` : ''}${p.link ? `<br><a href="${esc(p.link)}" target="_blank" rel="noopener"><small>Product link</small></a>` : ''}</td>
        <td data-label="Country">${esc(place(p.destination))}</td><td data-label="Qty" class="num">${p.quantity}</td>
        <td data-label="Supplier cost" class="num">${money(p.supplierCost)}</td><td data-label="Client pays" class="num"><b>${money(p.supplierCost + fee)}</b></td>
        <td data-label="Used"><small class="dim">${p.uses ? `${p.uses}×` : 'Not yet'}${p.lastUsedAt ? ` · ${esc(fmtDay(new Date(p.lastUsedAt * 1000).toISOString().slice(0, 10)))}` : ''}</small></td>
        <td class="num"><button type="button" class="btn btn-sm" data-forget-price="${p.id}">Forget</button></td></tr>`).join('')}
    </tbody></table></div></section>`;
  }
  // Client activity: last sign-in / last time in the portal, what the client did, and what admins changed logged in as them.
  async function loadActivity(id) {
    try { clientActivity = await api('/admin/clients/' + id + '/activity'); } catch (ex) { clientActivity = { lastLogin: null, lastSeen: null, events: [], adminActions: [] }; toast(ex.message); }
    if (S.drawer?.kind === 'client' && S.drawer.id === id) fillClient(clientOf(id), true);
  }
  const CLIENT_DID = { created: 'Added an order', edited: 'Edited an order', status: 'Changed an order status', cancellation: 'Asked to cancel an order', photo: 'Added a product photo', claim: 'Opened a claim', message: 'Sent a message', product: 'Sent a product for a quote' };
  const clientDid = e => e.kind === 'edited' && e.detail === 'customer' ? 'Changed customer details' : e.kind === 'photo' && e.detail === 'removed' ? 'Removed a product photo' : CLIENT_DID[e.kind] || e.kind;
  function adminDid(a) {
    const p = a.path, m = /^\/orders\/(\d+)/.exec(p);
    const label = p === '/acting/start' ? 'Logged in as this client'
      : p === '/orders' ? 'Added an order' : /\/photos\/\d+\/delete$/.test(p) ? 'Removed a product photo' : /\/photos$/.test(p) ? 'Added a product photo'
      : /\/request-cancellation$/.test(p) ? 'Asked to cancel an order' : /\/mark-delivered$/.test(p) ? 'Marked an order delivered' : /\/claims$/.test(p) ? 'Opened a claim'
      : /^\/orders\/\d+$/.test(p) ? 'Edited an order' : p.startsWith('/products') ? 'Sent a product for a quote' : p.startsWith('/client-stores') ? 'Saved a store'
      : p.startsWith('/transfers') ? 'Uploaded a transfer confirmation' : p === '/billing' ? 'Saved billing details' : /\/messages$/.test(p) ? 'Sent a message' : p === '/password' ? 'Changed the password'
      : p === '/terms/accept' ? 'Accepted the terms' : 'Other change';
    const order = m ? S.orders.find(o => o.id === Number(m[1])) : null;
    return { label, ref: order ? orderName(order) : m ? '#' + m[1] : '' };
  }
  const actRow = (label, ref, at, extra = '') => `<li><b>${esc(label)}</b>${ref ? ` <span class="dim" data-no-i18n>${esc(ref)}</span>` : ''}${extra}<time datetime="${new Date(at * 1000).toISOString()}">${esc(fullDate(at))}</time></li>`;
  // Client panel: 4 tabs, each with its own sections (sub-tabs) — Orders · Shop · Money · Account.
  const CLIENT_GROUPS = [['orders', 'Orders', ['orders']], ['shop', 'Shop', ['stores', 'products']], ['money', 'Money', ['payments', 'prices']], ['account', 'Account', ['account', 'activity']]];
  const groupOf = sec => (CLIENT_GROUPS.find(x => x[2].includes(sec)) || CLIENT_GROUPS[0])[0];
  // "Export to Excel" in the client panel: this client's orders (store filter and sort as on screen) with prices and a Paid column.
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-excel-export]'); if (!b || S.drawer?.kind !== 'client') return;
    const c = clientOf(S.drawer.id); if (!c) return;
    const list = sortList(S.orders.filter(o => o.clientId === c.id && (!S.drawer.storeId || o.storeId === S.drawer.storeId)), 'client-orders', ORDER_SORTS);
    const he = window.DLi18n?.lang === 'he', t = he ? window.DLi18n.t : s => s;
    const storeName = S.drawer.storeId ? S.stores.find(s => s.id === S.drawer.storeId)?.name : t('All stores');
    const blob = window.DLExcelExport.orders({ title: t('Orders') + ' — ' + c.name, subtitle: [storeName, t('Exported') + ' ' + new Date().toLocaleDateString('en-GB')].join(' · '), orders: list, statusLabel: s => t(UI.LABEL[s] || s), t, rtl: he });
    window.DLExcelExport.download(blob, `Direct-Line-orders-${String(c.username || c.id).replace(/[^\w-]+/g, '')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
  // A "Sort" dropdown changed: remember it and redraw that list (client panel, Products tab, or the Orders / Clients list).
  document.addEventListener('change', e => {
    const s = e.target.closest?.('[data-sort]'); if (!s) return;
    setSort(s.dataset.sort, s.value);
    if (s.closest('.drawer') && S.drawer?.kind === 'client') fillClient(clientOf(S.drawer.id)); else if (S.tab === 'products') renderProducts(); else renderList();
  });
  document.addEventListener('change', e => { const sel = e.target.closest?.('[data-client-store]'); if (sel && S.drawer?.kind === 'client') { S.drawer.storeId = Number(sel.value); fillClient(clientOf(S.drawer.id)); } });
  // Long lists: the newest 8, the rest behind "Show all".
  const foldList = rows => `<ol class="order-activity">${rows.slice(0, 8).join('')}</ol>` + (rows.length > 8 ? `<details class="fold-more" data-keep="more${rows.length}"><summary>Show all (${rows.length})</summary><ol class="order-activity">${rows.slice(8).join('')}</ol></details>` : '');
  // Folded sections remember whether they were open (this browser only).
  const foldOpen = k => { try { return localStorage.getItem('dl-fold-' + k) === '1'; } catch (e) { return false; } };
  document.addEventListener('toggle', e => { const k = e.target?.dataset?.fold; if (k) try { localStorage.setItem('dl-fold-' + k, e.target.open ? '1' : '0'); } catch (x) { /* private mode */ } }, true);
  // Client panel → Products: one short row per product; the price form opens on click. Waiting ones first.
  function productsPane(list) {
    if (!list.length) return `<section class="card card-pad"><h3 class="sec-title">My Products</h3><p class="muted">No products yet.</p></section>`;
    const sorted = sortList(list, 'client-products', PRODUCT_SORTS);
    const price = p => (p.status === 'not_available' ? '<span class="dim">—</span>' : p.unitPrice == null ? '<span class="dim">No price yet</span>' : p.priceOptions ? `<span>from</span> <b>${money(p.unitPrice)}</b>` : `<b>${money(p.unitPrice)}</b>`) + (p.status === 'approved' && p.shipping != null ? `<small class="dim" style="display:block">+ ${money(p.shipping)} <span>shipping</span></small>` : '');
    const status = p => p.status === 'awaiting_quote' ? '<span class="tag tag-gold">Waiting for price</span>' : p.status === 'approved' ? '<span class="tag">Approved</span>' : '<span class="tag">Not available</span>';
    return `<section class="card card-pad"><div class="sec-head"><h3 class="sec-title">My Products</h3>${sortPick('client-products', PRODUCT_SORTS)}</div>${sorted.map(p => `<details class="prod-row" data-keep="p${p.id}"><summary>${p.photoIds[0] ? `<img src="/api/portal/products/${p.id}/photos/${p.photoIds[0]}" width="64" height="64" alt="" loading="lazy">` : '<span class="prod-ph"></span>'}<span class="prod-name"><b data-no-i18n>${esc(p.name)}</b>${p.variant ? `<small class="dim" data-no-i18n>${esc(p.variant)}</small>` : ''}</span>${status(p)}<span class="prod-price">${price(p)}</span></summary>${productQuoteForm(p)}</details>`).join('')}</section>`;
  }
  function activityHTML(c) {
    const a = clientActivity;
    if (!a) return `<section class="card card-pad"><p class="muted">Loading…</p></section>`;
    const when = s => s ? `<time datetime="${new Date(s * 1000).toISOString()}">${esc(fullDate(s))}</time>` : '<span class="dim">Never</span>';
    return `<section class="card card-pad"><dl class="kv" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><dt>Last sign-in</dt><dd>${when(a.lastLogin)}</dd></div><div><dt>Last active in the portal</dt><dd>${when(a.lastSeen)}</dd></div></dl></section>
      <section class="card card-pad"><h3 class="sec-title">What the client did</h3>${a.events.length ? foldList(a.events.map(e => actRow(clientDid(e), e.orderRef || e.productName || (e.orderId ? '#' + e.orderId : ''), e.createdAt))) : '<p class="muted">Nothing yet.</p>'}</section>
      <section class="card card-pad"><h3 class="sec-title">Changes made by admins logged in as this client</h3>${a.adminActions.length ? foldList(a.adminActions.map(x => { const d = adminDid(x); return actRow(d.label, d.ref, x.createdAt, x.ok ? '' : ' <span class="neg">Didn’t go through</span>'); })) : '<p class="muted">None yet.</p>'}</section>`;
  }
  async function loadPayments(id) {
    try { const [p,t,f] = await Promise.all([api('/admin/payments?clientId=' + id), api('/admin/transfers?clientId=' + id),api('/admin/invoices?clientId='+id)]); payments=p.payments; transferProofs=t.transfers;invoiceFiles=f.invoices;balanceAdjustments=p.adjustments||[];billing=p.billing||null; } catch (e) { payments = []; transferProofs = []; invoiceFiles=[]; toast('Couldn’t load payments: ' + e.message); }
    if (S.drawer?.kind === 'client' && S.drawer.id === id) fillClient(clientOf(id), true);
  }
  // Receipts (stored as portal_files kind 'invoice'): the file Direct Line sends the client for money already paid.
  const adminInvoiceLinks=files=>files.length ? files.map(f=>`<p><a href="/api/portal/files/${f.id}" target="_blank" rel="noopener"><span>Download receipt</span> <span data-no-i18n>${esc(f.filename)}</span></a></p>`).join('') : '<span class="muted">No receipt yet</span>';
  function invoiceFields(clientId,orderId,withOrders){
    return `<label class="field full"><span>Receipt file <small>PDF or image, maximum 2 MB</small></span><input name="invoiceFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label>${withOrders ? `<div class="field full"><span>Orders on this receipt <small>optional</small></span>${poList(clientId,{all:true,compare:false})}</div>` : ''}`;
  }
  function invoiceForm(clientId,orderId){
    const today=new Date().toLocaleDateString('en-CA');
    return `<form class="form-grid" data-invoice-form="${clientId}" data-order-id="${orderId||''}">${invoiceFields(clientId,orderId,!orderId)}<label class="field"><span>Receipt date</span><input name="invoiceDate" type="date" value="${today}" required></label>${orderId ? '' : `<label class="field"><span>Linked payment <small>optional</small></span><select name="invoicePayment"><option value="">No payment link</option>${payments.map(p=>`<option value="${p.id}">${money(p.amount)} · ${esc(fullDate(p.paidAt))}${p.archived?' · Archived':''}</option>`).join('')}</select></label>`}<button type="submit" class="btn btn-primary">Save receipt</button><p class="form-msg" data-invoice-msg></p></form>`;
  }
  async function invoiceFile(f){
    const file=f.invoiceFile.files[0];if(!file)return null;if(file.size>2*1024*1024)throw new Error('The file is too large. Maximum 2 MB.');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});return {filename:file.name,data};
  }
  // ---------- which orders a payment is for (Erwin, 21 Oct 2026) ----------
  // An order is paid while it is linked to a payment that is not archived; the balance itself is unchanged.
  const PO = window.DLPayOrders;
  const oldestFirst = (a, b) => window.DLClientStoreMath.dateKey(a).localeCompare(window.DLClientStoreMath.dateKey(b)) || a.createdAt - b.createdAt || a.id - b.id;
  const dayOf = o => PO.day(window.DLClientStoreMath.dateKey(o));
  // Orders a payment can be for: billed and not paid yet (plus the ones already on this payment), oldest first.
  const payableOrders = (clientId, paymentId = null) => S.orders.filter(o => o.clientId === clientId && !o.archived && (paymentId && o.paymentId === paymentId || !o.paymentId && PO.dueCents(o, balanceAdjustments) > 0)).sort(oldestFirst);
  function poList(clientId, { paymentId = null, checked = [], amount = 0, compare = true, all = false } = {}) {
    const orders = all ? S.orders.filter(o => o.clientId === clientId && !o.archived && o.status !== 'cancelled').sort(oldestFirst) : payableOrders(clientId, paymentId);
    return PO.checklist({ orders, checked: new Set(checked), adjustments: balanceAdjustments, orderName, dateOf: dayOf, esc, amount, compare, empty: all ? 'No orders yet.' : 'No billed orders are waiting for payment.' });
  }
  const pendingTransfer = () => transferProofs.find(t => t.id === S.drawer?.transferId && t.status === 'pending');
  // Paid / not paid at a glance, and payments that still need their orders ticked.
  function paySummary(c) {
    const mine = S.orders.filter(o => o.clientId === c.id && !o.archived), st = o => PO.state(o, balanceAdjustments);
    const unpaid = mine.filter(o => st(o) === 'unpaid'), due = unpaid.reduce((n, o) => n + PO.dueCents(o, balanceAdjustments), 0) / 100;
    const live = payments.filter(p => !p.archived), loose = live.filter(p => !p.orderIds?.length), noReceipt = live.filter(p => !receiptsOf(p).length);
    const todo = [[loose, 'payment is not linked to orders yet', 'payments are not linked to orders yet', 'Press Edit on it and tick its orders.'],
      [noReceipt, 'payment has no receipt yet', 'payments have no receipt yet', 'Press Attach receipt: the client gets it in their portal.']].filter(([l]) => l.length);
    return `<section class="card card-pad"><h3 class="sec-title">Orders and payments</h3><div class="pay-sum">
        <div><small>Paid orders</small><b class="pos">${mine.filter(o => st(o) === 'paid').length}</b></div>
        <div><small>Not paid yet</small><b class="${unpaid.length ? 'neg' : ''}">${unpaid.length}</b><em>${money(due)}</em></div>
        <div><small>No bill yet</small><b>${mine.filter(o => st(o) === 'unbilled').length}</b><em>No cost yet</em></div>
        <div><small>Balance</small><b class="${c.outstanding > 0 ? 'neg' : ''}">${money(c.outstanding)}</b><em><span>Billed</span> ${money(c.billed)} · <span>Paid</span> ${money(c.paid)}</em></div></div>
      ${todo.length ? `<div class="pay-todo"><b class="pay-todo-title">To do</b>${todo.map(([l, one, many, hint]) => `<p><button type="button" class="link-btn" data-scroll-pay="pay-${l[0].id}"><b>${l.length}</b> <span>${l.length === 1 ? one : many}</span></button> <span class="dim">${hint}</span></p>`).join('')}</div>` : ''}</section>`;
  }
  // Billing details for receipts (the client fills them in on their Payments page; Ada uses them for the invoice header).
  function billingHTML(c) {
    const b = billing, v = k => esc(b?.[k] || ''), copy = b ? [b.name, b.company, b.address, b.email, b.phone].filter(Boolean).join('\n') : '';
    return `<section class="card card-pad"><div class="bill-head"><h3 class="sec-title">Billing details for receipts</h3>${b ? `<button type="button" class="btn btn-sm" data-copy="${esc(copy)}">${ic('copy')}Copy</button>` : ''}</div>
      ${b ? `<div class="bill-view"><p><b data-no-i18n>${v('name')}</b>${b.company ? `<br><span data-no-i18n>${v('company')}</span>` : ''}</p><p data-no-i18n style="white-space:pre-line">${v('address')}</p><p data-no-i18n>${[b.email, b.phone].filter(Boolean).map(esc).join(' · ')}</p><small class="dim"><span>${b.updatedBy === 'admin' ? 'Last saved by Direct Line' : 'Last saved by the client'}</span> · <span data-no-i18n>${esc(PO.day(b.updatedAt))}</span></small></div>` : '<p class="muted">The client hasn’t added billing details yet. They can add them on their Payments page.</p>'}
      <details class="fold-row" data-keep="billing"><summary><b>${b ? 'Edit billing details' : '+ Add billing details'}</b></summary><form class="form-grid" data-admin-billing="${c.id}" novalidate>
        <label class="field"><span>Full name</span><input name="name" maxlength="120" value="${v('name')}"></label>
        <label class="field"><span>Company name <small>optional</small></span><input name="company" maxlength="120" value="${v('company')}"></label>
        <label class="field full"><span>Billing address</span><textarea name="address" rows="3" maxlength="400">${v('address')}</textarea></label>
        <label class="field"><span>Email</span><input name="email" type="email" maxlength="160" value="${v('email')}"></label>
        <label class="field"><span>Phone</span><input name="phone" type="tel" maxlength="60" value="${v('phone')}"></label>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save billing details</button><p class="form-msg" data-billing-msg style="margin:0"></p></div></form></details></section>`;
  }
  function transferProofHTML() {
    const list = transferProofs.filter(t => t.status !== 'recorded');
    return list.length ? `<section class="card card-pad attn-card"><h3 class="sec-title">Transfer confirmations to check</h3><p class="note">The client sent these. Check that the money arrived, then record the payment.</p>${list.map(t=>`<div class="confirmation-row"><div><b>${money(t.amount)}</b> <small data-no-i18n>${esc(PO.day(t.date))}</small><p><a href="/api/portal/files/${t.id}${t.mime.startsWith('image/') ? '?inline=1" data-photo="1' : ''}" target="_blank" rel="noopener">Open confirmation</a></p>${t.orderIds?.length ? `<small class="dim"><span>Orders ticked by the client:</span> ${t.orderIds.length}</small>` : ''}${t.mime.startsWith('image/') ? `<img data-photo src="/api/portal/files/${t.id}?inline=1" style="max-width:160px;max-height:120px;object-fit:contain" alt="Transfer confirmation">` : ''}</div>${t.status==='pending' ? `<button type="button" class="btn btn-primary" data-record-transfer="${t.id}">Record this payment</button>` : `<button type="button" class="btn" data-restore-payment="${t.paymentId}">Restore payment</button>`}</div>`).join('')}</section>` : '';
  }
  // ---------- Money > Payments (Erwin, 21 Oct 2026): one card per payment — the amount, the orders it pays and its
  // receipt. "Attach receipt" sends the receipt to the client (notification + download on their Payments page). ----------
  const receiptsOf = p => invoiceFiles.filter(f => f.paymentId === p.id);
  const dayInput = sec => new Date(Number(sec) * 1000).toISOString().slice(0, 10);
  const methods = m => { const base = ['Bank transfer', 'PayPal', 'Wise', 'Other']; return !m || base.includes(m) ? base : [m, ...base]; };
  const receiptInput = (required = false) => `<label class="field full"><span>Receipt file <small>PDF or image, maximum 2 MB</small></span><input name="invoiceFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"${required ? ' required' : ''}></label>`;
  function recordForm(c, iso) {
    const tr = pendingTransfer();
    return `<form class="form-grid pay-form" data-pay-form="${c.id}"${tr ? ` data-transfer="${tr.id}"` : ''} novalidate>
      ${tr ? `<div class="pay-from full"><span><b>From the client’s transfer confirmation</b> <span data-no-i18n>${money(tr.amount)} · ${esc(PO.day(tr.date))}</span></span></div>` : ''}
      <p class="pay-step full"><b>1</b><span>How much arrived, and when</span></p>
      <label class="field"><span>Amount received</span><span class="money"><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal"${tr ? ` value="${Number(tr.amount).toFixed(2)}"` : ''}></span></label>
      <label class="field"><span>Date</span><input name="paidAt" type="date" value="${tr ? esc(tr.date) : iso}"></label>
      <label class="field"><span>Method</span><select name="method">${methods('').map(m => `<option value="${m}">${m}</option>`).join('')}</select></label>
      <label class="field"><span>Note <small>optional</small></span><input name="note" maxlength="500"${tr ? ` placeholder="Transfer confirmation #${tr.id}"` : ''}></label>
      <p class="pay-step full"><b>2</b><span>Which orders it pays</span></p>
      <div class="full">${poList(c.id, { checked: tr ? tr.orderIds || [] : [], amount: tr ? tr.amount : 0 })}</div>
      <p class="pay-step full"><b>3</b><span>Receipt for the client <small>optional: you can also attach it later</small></span></p>
      ${receiptInput()}
      <div class="full pay-actions"><button class="btn btn-primary" type="submit">Record payment</button><button type="button" class="btn" data-pay-cancel>Cancel</button><p class="form-msg" data-pay-msg></p></div></form>`;
  }
  function attachForm(p) {
    const b = billing, copy = b ? [b.name, b.company, b.address, b.email, b.phone].filter(Boolean).join('\n') : '';
    return `<form class="form-grid pay-inline" data-receipt-form="${p.id}" novalidate>
      <p class="pay-step full"><b>${ic('doc')}</b><span>Send a receipt for this payment</span></p>
      <div class="full bill-to">${b ? `<div><small class="dim">Bill to</small><p><b data-no-i18n>${esc(b.name)}</b>${b.company ? ` · <span data-no-i18n>${esc(b.company)}</span>` : ''}</p><p data-no-i18n style="white-space:pre-line">${esc(b.address)}</p><p data-no-i18n>${[b.email, b.phone].filter(Boolean).map(esc).join(' · ')}</p></div><button type="button" class="btn btn-sm" data-copy="${esc(copy)}">${ic('copy')}Copy</button>` : '<p class="pay-warn" style="margin:0">No billing details yet. The client can add them on their Payments page, or you can add them in Billing details below.</p>'}</div>
      ${receiptInput(true)}
      <label class="field"><span>Receipt date</span><input name="invoiceDate" type="date" value="${dayInput(p.paidAt)}"></label>
      <p class="note full" style="margin:0">The client gets a notification and can download the receipt on their Payments page.</p>
      <div class="full pay-actions"><button class="btn btn-primary" type="submit">Send receipt to the client</button><button type="button" class="btn" data-receipt-cancel>Cancel</button><p class="form-msg" data-receipt-msg></p></div></form>`;
  }
  function editForm(p) {
    return `<form class="form-grid pay-inline" data-payment-edit-form="${p.id}" novalidate>
      <label class="field"><span>Amount received</span><span class="money"><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${Number(p.amount).toFixed(2)}"></span></label>
      <label class="field"><span>Date</span><input name="paidAt" type="date" value="${dayInput(p.paidAt)}"></label>
      <label class="field"><span>Method</span><select name="method">${methods(p.method).map(m => `<option value="${esc(m)}"${m === p.method ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <label class="field"><span>Note <small>optional</small></span><input name="note" maxlength="500" value="${esc(p.note)}"></label>
      <div class="field full"><span>Orders this payment is for <small>tick the orders the money is for</small></span>${poList(p.clientId, { paymentId: p.id, checked: p.orderIds || [], amount: p.amount })}</div>
      <div class="full pay-actions"><button class="btn btn-primary" type="submit">Save payment</button><button type="button" class="btn" data-pay-edit="${p.id}">Cancel</button><p class="form-msg" data-payment-edit-msg></p><span class="pay-spacer"></span><button type="button" class="btn btn-sm btn-danger" data-del-payment="${p.id}">Archive payment</button></div></form>`;
  }
  function paymentCard(c, p) {
    const files = receiptsOf(p), editing = S.drawer.payEdit === p.id, attaching = S.drawer.payAttach === p.id;
    const tr = p.confirmationId ? transferProofs.find(t => t.id === p.confirmationId) : null;
    return `<article class="card pay-card${p.archived ? ' archived' : ''}${editing || attaching ? ' open' : ''}" id="pay-${p.id}">
      <div class="pay-card-head"><div class="pay-main"><b class="pay-amt">${money(p.amount)}</b><small><span data-no-i18n>${esc(PO.day(p.paidAt))}</span> · ${esc(p.method) || '—'}${p.note ? ` · <span data-no-i18n>${esc(p.note)}</span>` : ''}</small></div>
        <div class="pay-tools">${p.archived ? `<span class="tag">Archived</span><button type="button" class="btn btn-sm" data-restore-payment="${p.id}">Restore payment</button>` : `<button type="button" class="btn btn-sm" data-pay-edit="${p.id}">${ic('edit')}${editing ? 'Close' : 'Edit'}</button>`}</div></div>
      <div class="pay-line"><span class="pay-label">Orders</span><div>${PO.linked({ payment: p, orders: S.orders.filter(o => o.clientId === c.id), adjustments: balanceAdjustments, orderName, esc, admin: true })}</div></div>
      <div class="pay-line"><span class="pay-label">Receipt</span><div class="receipt-cell">${files.length ? files.map(f => `<div class="receipt-file">${ic('doc')}<a href="/api/portal/files/${f.id}" target="_blank" rel="noopener" data-no-i18n>${esc(f.filename)}</a><small class="dim"><span>Sent to the client</span> · <span data-no-i18n>${esc(PO.day(f.createdAt))}</span></small><button type="button" class="btn btn-sm btn-ghost" data-receipt-remove="${f.id}">Remove</button></div>`).join('') : '<span class="pay-tag unpaid">Not sent yet</span>'}${p.archived || attaching ? '' : `<button type="button" class="btn btn-sm${files.length ? '' : ' btn-primary'}" data-pay-attach="${p.id}">${ic(files.length ? 'plus' : 'doc')}${files.length ? 'Attach another file' : 'Attach receipt'}</button>`}</div></div>
      ${tr ? `<div class="pay-line"><span class="pay-label">Source</span><div><a href="/api/portal/files/${tr.id}${tr.mime.startsWith('image/') ? '?inline=1" data-photo="1' : ''}" target="_blank" rel="noopener">The client’s transfer confirmation</a></div></div>` : ''}
      ${attaching ? attachForm(p) : ''}${editing ? editForm(p) : ''}
    </article>`;
  }
  function paymentsPane(c, iso) {
    const adding = S.drawer.payNew || pendingTransfer(), other = invoiceFiles.filter(f => !f.paymentId || !payments.some(p => p.id === f.paymentId));
    return `${paySummary(c)}${transferProofHTML()}
      ${adding ? `<section class="card card-pad" data-pay-card><h3 class="sec-title">Record a payment</h3>${recordForm(c, iso)}</section>` : ''}
      <section class="pay-cards"><div class="pay-cards-head"><h3 class="sec-title">Payments <small>${payments.length}</small></h3>${adding ? '' : `<button type="button" class="btn btn-primary btn-sm" data-pay-new>${ic('plus')}Record a payment</button>`}</div>
        ${payments.length ? payments.map(p => paymentCard(c, p)).join('') : `<div class="card">${empty('No payments yet', 'Payments you record show up here and lower what the client owes.')}</div>`}</section>
      ${other.length ? `<section class="card card-pad"><h3 class="sec-title">Other receipts</h3>${adminInvoiceLinks(other)}</section>` : ''}
      ${billingHTML(c)}`;
  }

  // Account form: which existing orders also get the fee when it is saved, with how many orders each choice changes.
  function feeScopes(c) {
    const os = S.orders.filter(o => o.clientId === c.id && o.status !== 'cancelled' && !o.archived), n = st => os.filter(o => st.includes(o.status)).length;
    return [['new', 'New orders only', null], ['pending', 'New + Pending orders', n(['pending'])], ['processing', 'New + In progress orders', n(['processing'])],
      ['open', 'New + Pending + In progress orders', n(['pending', 'processing'])], ['all', 'All orders (also shipped and delivered)', os.length]];
  }
  function fillClient(c, soft) {
    const d = UI.getDrawer(), tab = S.drawer.tab, allOrders=S.orders.filter(o=>o.clientId===c.id),orders=allOrders.filter(o=>!S.drawer.storeId||o.storeId===S.drawer.storeId),stores=S.stores.filter(s=>s.clientId===c.id),products=S.products.filter(p=>p.clientId===c.id),stats=window.DLClientStoreMath.performance(stores,allOrders,balanceAdjustments,window.DLClientStoreMath.periodRange(S.period,S.from,S.to)||window.DLClientStoreMath.periodRange('month'));
    d.head.innerHTML = `<div class="who"><span class="ava" style="width:44px;height:44px;border-radius:14px;font-size:14px">${esc(initials(c.name))}</span><div><h2 style="font-size:20px">${esc(c.name)}</h2><small>@${esc(c.username)} · ${c.active ? 'active' : 'disabled'}</small></div></div>`;
    if (soft && [...d.body.querySelectorAll('[name=invoiceFile]')].some(f=>f.files.length)) return;
    if (soft && $('[data-reset-result] input', d.body)) return;
    if (soft && d.body.querySelector('[data-payment-edit-form]')) return;
    if (soft && d.body.querySelector('form[data-dirty] [data-po], form[data-admin-billing][data-dirty], [data-receipt-form]')) return;
    if (soft && d.body.contains(document.activeElement) && document.activeElement.matches('input,select,textarea')) return;
    const t = new Date(), iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    const pane = tab === 'orders'
      // Orders tab: the order list, with the store performance folded away (one line until opened).
      ? `<div class="list-tools">${stores.length > 1 ? `<label class="store-pick"><span>Store</span><select data-client-store>${[`<option value="0">All stores (${stores.length})</option>`, ...stores.map(s => `<option value="${s.id}"${S.drawer.storeId === s.id ? ' selected' : ''} data-no-i18n>${esc(s.name)}</option>`)].join('')}</select></label>` : ''}${orders.length > 1 ? sortPick('client-orders', ORDER_SORTS) : ''}${orders.length ? `<button type="button" class="btn btn-sm" data-excel-export="${c.id}" title="An Excel file with these orders, their prices and a Paid column (Yes / No)">${ic('doc')}Export to Excel</button>` : ''}</div>`
        + `<details class="card card-pad fold" data-fold="perf"${foldOpen('perf') ? ' open' : ''}><summary><h3 class="sec-title">Performance by store</h3><small class="dim">${S.drawer.storeId ? 'One store shown' : 'All stores'}</small></summary>${window.DLClientStoreUI.periodFields(S.period,S.from,S.to,window.DLClientStoreMath.monthsOf(allOrders))}${window.DLClientStoreUI.table(stats,'data-admin-select-store')}</details>`
        // One compact row per order (order number, customer and store; total and status on the right).
        + (orders.length ? `<section class="card ord-list">${sortList(orders, 'client-orders', ORDER_SORTS).map(o=>`<button type="button" class="ord-row" data-open-order="${o.id}" data-back="${c.id}"><span class="ord-main"><span class="ord-title"><b>${esc(orderName(o))}</b><span class="ord-date" data-no-i18n title="Order date">${esc(dayOf(o))}</span></span><small><span data-no-i18n>${esc(o.buyerName) || '—'}</span> · ${window.DLClientStoreUI.label(stores.find(s=>s.id===o.storeId))}</small></span><span class="ord-side"><b class="ord-amt">${money(o.price)}</b><span class="ord-pay">${PO.tag(o, balanceAdjustments)}</span><span class="ord-st">${UI.pill(o.status)}</span></span></button>`).join('')}</section>` : empty('No orders yet', 'Orders this client adds show up here.'))
      : tab === 'stores'
        ? `<section class="card card-pad"><h3 class="sec-title">My Stores</h3>${stores.length ? stores.map(s=>`<details class="fold-row" data-keep="s${s.id}"><summary>${window.DLClientStoreUI.label(s)}</summary>${window.DLClientStoreUI.form(s,c.id)}</details>`).join('') : '<p class="muted">No stores yet.</p>'}<details class="fold-row" data-keep="s-new"><summary><b>+ Add store</b></summary>${window.DLClientStoreUI.form(null,c.id)}</details></section>`
      : tab === 'products' ? productsPane(products)
      : tab === 'payments' ? paymentsPane(c, iso)
        : tab === 'prices' ? savedPricesHTML(c)
        : tab === 'activity' ? activityHTML(c)
        : `<section class="card card-pad"><form class="form-grid" data-account-form="${c.id}" novalidate>
            <label class="field full"><span>Name</span><input name="name" maxlength="120" value="${esc(c.name)}"></label>
            <label class="field"><span>Fee per order <small>empty = default</small></span><span class="money"><input name="commissionPerOrder" type="number" min="0" step="0.01" value="${c.commissionPerOrder ?? ''}"></span></label>
            <label class="field full"><span>Use this fee for <small>when you save</small></span><select name="applyFeeTo">${feeScopes(c).map(([v, l, n]) => `<option value="${v}">${l}${n == null ? '' : ` (${n})`}</option>`).join('')}</select></label>
            <label class="field"><span>Status</span><select name="active"><option value="true"${c.active ? ' selected' : ''}>Active</option><option value="false"${c.active ? '' : ' selected'}>Disabled (can’t sign in)</option></select></label>
            <div class="field full"><span>Username <small>used to sign in, and as the payment reference</small></span><div style="display:flex;gap:8px;align-items:center"><input name="username" maxlength="60" autocomplete="off" data-no-i18n value="${esc(c.username)}" style="flex:1;min-width:0"><button type="button" class="btn btn-sm" data-copy="${esc(c.username)}">Copy</button></div><p><span>Last login:</span> ${c.lastLogin ? esc(fullDate(c.lastLogin)) : 'Never'}</p><p>${c.termsAccepted ? `<span>Terms accepted:</span> <time data-no-i18n>${esc(fullDate(c.termsAccepted.acceptedAt))} · v${c.termsAccepted.version}</time>` : 'Not accepted yet'}</p>${c.termsAccepted && c.termsRequired ? '<p class="note">Current terms not accepted yet.</p>' : ''}<button type="button" class="btn" data-reset-password="${c.id}">Reset password</button><div data-reset-result role="status"></div></div>
            <div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Save account</button><p class="form-msg" data-account-msg></p></div></form>
            <p class="note" style="margin-top:12px">New orders always get this client’s fee. To change orders already in the system, choose which ones above before saving: prices that come from the supplier’s cost (cost + fee) follow the new fee. Cancelled and archived orders never change.</p></section>
          ${subscriptionHTML(c)}
          <details class="card card-pad fold" data-keep="archive"><summary><h3 class="sec-title">Archive</h3></summary><p class="muted" style="margin:0 0 12px;font-size:14px">For test accounts or clients you no longer work with. It hides this client, their orders and payments from every list and total, and stops them signing in. Nothing is deleted, and you can restore them any time from the Clients tab.</p><button type="button" class="btn btn-danger" data-archive="${c.id}">Archive client</button></details>`;
    const group = groupOf(tab), subs = CLIENT_GROUPS.find(x => x[0] === group)[2], waiting = products.some(p => p.status === 'awaiting_quote');
    const subLabel = Object.fromEntries([['stores', `Stores (${stores.length})`], ['products', `Products (${products.length})`], ['payments', `Payments (${payments.length})`], ['prices', savedPrices ? `Saved prices (${savedPrices.length})` : 'Saved prices'], ['account', 'Details'], ['activity', 'Activity']]);
    // The 20-second refresh redraws the panel: keep open rows open.
    const keep = soft ? [...d.body.querySelectorAll('details[open][data-keep]')].map(x => x.dataset.keep) : [];
    d.body.innerHTML = `
      <div class="kpis">
        <div><span>Orders</span><b>${c.orders}</b></div>
        <div><span>Outstanding</span><b class="${c.outstanding > 0 ? 'neg' : ''}">${money(c.outstanding)}</b><small><span>Billed</span> ${money(c.billed)}</small></div>
        <div><span>Paid</span><b class="pos">${money(c.paid)}</b></div>
        <div><span>Our earnings</span><b>${money(c.ourShare)}</b><small><span>Client’s profit</span> ${money(c.clientProfit)}</small></div></div>
      <div class="gtabs" role="tablist">${CLIENT_GROUPS.map(([g, label, secs]) => `<button type="button" role="tab" aria-selected="${group === g}" class="${group === g ? 'on' : ''}" data-ctab="${S.drawer.last?.[g] || secs[0]}">${label}${g === 'orders' ? ` <small>${orders.length}</small>` : ''}${g === 'shop' && waiting ? '<i class="tab-dot" title="Waiting for a price"></i>' : ''}</button>`).join('')}</div>
      ${subs.length > 1 ? `<div class="subtabs">${subs.map(k => `<button type="button" class="${tab === k ? 'on' : ''}" data-ctab="${k}">${subLabel[k]}${k === 'products' && waiting ? '<i class="tab-dot" title="Waiting for a price"></i>' : ''}</button>`).join('')}</div>` : ''}
      ${pane}`;
    keep.forEach(k => { const x = d.body.querySelector(`details[data-keep="${k}"]`); if (x) x.open = true; });
    window.DLEnhancePasswords?.(d.body);
    d.foot.innerHTML = `<button type="button" class="btn btn-primary" data-new-order="${c.id}">${ic('plus')}Add order for ${esc(c.name)}</button><a class="btn" href="/portal/?as=${c.id}&act=1" target="_blank" rel="noopener" data-login-as="${c.id}">${ic('ext')}Log in as client</a><a class="btn" href="/portal/?as=${c.id}" target="_blank" rel="noopener">See their portal</a>`;
  }

