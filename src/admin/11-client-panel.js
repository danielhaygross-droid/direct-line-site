  // ---------- side panel: one client ----------
  let payments = [], transferProofs = [], invoiceFiles=[], balanceAdjustments=[], savedPrices = null, clientActivity = null;
  async function openClient(id, tab = 'orders') {
    const c = clientOf(id); if (!c) return;
    const d = UI.getDrawer();
    closeChat(); payments = []; transferProofs = []; invoiceFiles=[];balanceAdjustments=[]; savedPrices = null; clientActivity = null;
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
      : p.startsWith('/transfers') ? 'Uploaded a transfer confirmation' : /\/messages$/.test(p) ? 'Sent a message' : p === '/password' ? 'Changed the password'
      : p === '/terms/accept' ? 'Accepted the terms' : 'Other change';
    const order = m ? S.orders.find(o => o.id === Number(m[1])) : null;
    return { label, ref: order ? orderName(order) : m ? '#' + m[1] : '' };
  }
  const actRow = (label, ref, at, extra = '') => `<li><b>${esc(label)}</b>${ref ? ` <span class="dim" data-no-i18n>${esc(ref)}</span>` : ''}${extra}<time datetime="${new Date(at * 1000).toISOString()}">${esc(fullDate(at))}</time></li>`;
  // Client panel: 4 tabs, each with its own sections (sub-tabs) — Orders · Shop · Money · Account.
  const CLIENT_GROUPS = [['orders', 'Orders', ['orders']], ['shop', 'Shop', ['stores', 'products']], ['money', 'Money', ['payments', 'prices']], ['account', 'Account', ['account', 'activity']]];
  const groupOf = sec => (CLIENT_GROUPS.find(x => x[2].includes(sec)) || CLIENT_GROUPS[0])[0];
  document.addEventListener('change', e => { const sel = e.target.closest?.('[data-client-store]'); if (sel && S.drawer?.kind === 'client') { S.drawer.storeId = Number(sel.value); fillClient(clientOf(S.drawer.id)); } });
  // Long lists: the newest 8, the rest behind "Show all".
  const foldList = rows => `<ol class="order-activity">${rows.slice(0, 8).join('')}</ol>` + (rows.length > 8 ? `<details class="fold-more" data-keep="more${rows.length}"><summary>Show all (${rows.length})</summary><ol class="order-activity">${rows.slice(8).join('')}</ol></details>` : '');
  // Folded sections remember whether they were open (this browser only).
  const foldOpen = k => { try { return localStorage.getItem('dl-fold-' + k) === '1'; } catch (e) { return false; } };
  document.addEventListener('toggle', e => { const k = e.target?.dataset?.fold; if (k) try { localStorage.setItem('dl-fold-' + k, e.target.open ? '1' : '0'); } catch (x) { /* private mode */ } }, true);
  // Client panel → Products: one short row per product; the price form opens on click. Waiting ones first.
  function productsPane(list) {
    if (!list.length) return `<section class="card card-pad"><h3 class="sec-title">My Products</h3><p class="muted">No products yet.</p></section>`;
    const sorted = [...list].sort((a, b) => (a.status === 'awaiting_quote' ? 0 : 1) - (b.status === 'awaiting_quote' ? 0 : 1) || b.createdAt - a.createdAt);
    const price = p => (p.status === 'not_available' ? '<span class="dim">—</span>' : p.unitPrice == null ? '<span class="dim">No price yet</span>' : p.priceOptions ? `<span>from</span> <b>${money(p.unitPrice)}</b>` : `<b>${money(p.unitPrice)}</b>`) + (p.status === 'approved' && p.shipping != null ? `<small class="dim" style="display:block">+ ${money(p.shipping)} <span>shipping</span></small>` : '');
    const status = p => p.status === 'awaiting_quote' ? '<span class="tag tag-gold">Waiting for price</span>' : p.status === 'approved' ? '<span class="tag">Approved</span>' : '<span class="tag">Not available</span>';
    return `<section class="card card-pad"><h3 class="sec-title">My Products</h3>${sorted.map(p => `<details class="prod-row" data-keep="p${p.id}"><summary>${p.photoIds[0] ? `<img src="/api/portal/products/${p.id}/photos/${p.photoIds[0]}" width="44" height="44" alt="">` : '<span class="prod-ph"></span>'}<span class="prod-name"><b data-no-i18n>${esc(p.name)}</b>${p.variant ? `<small class="dim" data-no-i18n>${esc(p.variant)}</small>` : ''}</span>${status(p)}<span class="prod-price">${price(p)}</span></summary>${productQuoteForm(p)}</details>`).join('')}</section>`;
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
    try { const [p,t,f] = await Promise.all([api('/admin/payments?clientId=' + id), api('/admin/transfers?clientId=' + id),api('/admin/invoices?clientId='+id)]); payments=p.payments; transferProofs=t.transfers;invoiceFiles=f.invoices;balanceAdjustments=p.adjustments||[]; } catch (e) { payments = []; transferProofs = []; invoiceFiles=[]; toast('Couldn’t load payments: ' + e.message); }
    if (S.drawer?.kind === 'client' && S.drawer.id === id) fillClient(clientOf(id), true);
  }
  const adminInvoiceLinks=files=>files.length ? files.map(f=>`<p><a href="/api/portal/files/${f.id}" target="_blank" rel="noopener"><span>Download invoice</span> <span data-no-i18n>${esc(f.filename)}</span></a></p>`).join('') : '<span class="muted">Invoice pending</span>';
  function invoiceFields(clientId,orderId){
    return `<label class="field full"><span>Upload invoice <small>PDF or image, maximum 2 MB</small></span><input name="invoiceFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label>${orderId ? '' : `<label class="field full"><span>Linked orders <small>optional, select several</small></span><select name="invoiceOrders" multiple size="4">${S.orders.filter(o=>o.clientId===clientId).map(o=>`<option value="${o.id}">${esc(orderName(o))}</option>`).join('')}</select></label>`}`;
  }
  function invoiceForm(clientId,orderId){
    const today=new Date().toLocaleDateString('en-CA');
    return `<form class="form-grid" data-invoice-form="${clientId}" data-order-id="${orderId||''}">${invoiceFields(clientId,orderId)}<label class="field"><span>Invoice date</span><input name="invoiceDate" type="date" value="${today}" required></label>${orderId ? '' : `<label class="field"><span>Linked payment <small>optional</small></span><select name="invoicePayment"><option value="">No payment link</option>${payments.map(p=>`<option value="${p.id}">${money(p.amount)} · ${esc(fullDate(p.paidAt))}${p.archived?' · Archived':''}</option>`).join('')}</select></label>`}<button type="submit" class="btn btn-primary">Save invoice</button><p class="form-msg" data-invoice-msg></p></form>`;
  }
  async function invoiceFile(f){
    const file=f.invoiceFile.files[0];if(!file)return null;if(file.size>2*1024*1024)throw new Error('The file is too large. Maximum 2 MB.');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});return {filename:file.name,data};
  }
  const selectedInvoiceOrders=f=>f.invoiceOrders?[...f.invoiceOrders.selectedOptions].map(o=>Number(o.value)):[];
  function transferProofHTML() {
    return transferProofs.length ? `<section class="card card-pad"><h3 class="sec-title">Transfer confirmations</h3><p class="note">Check the confirmation and receipt of funds before recording the payment.</p>${transferProofs.map(t=>`<div class="confirmation-row"><div><b>${money(t.amount)}</b> <small data-no-i18n>${esc(t.date)}</small><p><a href="/api/portal/files/${t.id}${t.mime.startsWith('image/') ? '?inline=1" data-photo="1' : ''}" target="_blank" rel="noopener">Open confirmation</a></p>${t.mime.startsWith('image/') ? `<img data-photo src="/api/portal/files/${t.id}?inline=1" style="max-width:160px;max-height:120px;object-fit:contain" alt="Transfer confirmation">` : ''}</div>${t.status==='pending' ? `<button type="button" class="btn btn-primary" data-record-transfer="${t.id}">Record this payment</button>` : t.status==='archived' ? `<button type="button" class="btn" data-restore-payment="${t.paymentId}">Restore payment</button>` : '<span class="tag">Recorded</span>'}</div>`).join('')}</section>` : '';
  }
  function fillClient(c, soft) {
    const d = UI.getDrawer(), tab = S.drawer.tab, allOrders=S.orders.filter(o=>o.clientId===c.id),orders=allOrders.filter(o=>!S.drawer.storeId||o.storeId===S.drawer.storeId),stores=S.stores.filter(s=>s.clientId===c.id),products=S.products.filter(p=>p.clientId===c.id),stats=window.DLClientStoreMath.performance(stores,allOrders,balanceAdjustments,window.DLClientStoreMath.periodRange(S.period,S.from,S.to)||window.DLClientStoreMath.periodRange('month'));
    d.head.innerHTML = `<div class="who"><span class="ava" style="width:44px;height:44px;border-radius:14px;font-size:14px">${esc(initials(c.name))}</span><div><h2 style="font-size:20px">${esc(c.name)}</h2><small>@${esc(c.username)} · ${c.active ? 'active' : 'disabled'}</small></div></div>`;
    if (soft && [...d.body.querySelectorAll('[name=invoiceFile]')].some(f=>f.files.length)) return;
    if (soft && $('[data-reset-result] input', d.body)) return;
    if (soft && d.body.querySelector('[data-payment-edit-form]')) return;
    if (soft && d.body.contains(document.activeElement) && document.activeElement.matches('input,select,textarea')) return;
    const t = new Date(), iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    const pane = tab === 'orders'
      // Orders tab: the order list, with the store performance folded away (one line until opened).
      ? (stores.length > 1 ? `<label class="store-pick"><span>Store</span><select data-client-store>${[`<option value="0">All stores (${stores.length})</option>`, ...stores.map(s => `<option value="${s.id}"${S.drawer.storeId === s.id ? ' selected' : ''} data-no-i18n>${esc(s.name)}</option>`)].join('')}</select></label>` : '')
        + `<details class="card card-pad fold" data-fold="perf"${foldOpen('perf') ? ' open' : ''}><summary><h3 class="sec-title">Performance by store</h3><small class="dim">${S.drawer.storeId ? 'One store shown' : 'All stores'}</small></summary>${window.DLClientStoreUI.periodFields(S.period,S.from,S.to)}${window.DLClientStoreUI.table(stats,'data-admin-select-store')}</details>`
        // One compact row per order (order number, customer and store; total and status on the right).
        + (orders.length ? `<section class="card ord-list">${orders.map(o=>`<button type="button" class="ord-row" data-open-order="${o.id}" data-back="${c.id}"><span class="ord-main"><b>${esc(orderName(o))}</b><small><span data-no-i18n>${esc(o.buyerName) || '—'}</span> · ${window.DLClientStoreUI.label(stores.find(s=>s.id===o.storeId))}</small></span><span class="ord-side"><b>${money(o.price)}</b>${UI.pill(o.status)}</span></button>`).join('')}</section>` : empty('No orders yet', 'Orders this client adds show up here.'))
      : tab === 'stores'
        ? `<section class="card card-pad"><h3 class="sec-title">My Stores</h3>${stores.length ? stores.map(s=>`<details class="fold-row" data-keep="s${s.id}"><summary>${window.DLClientStoreUI.label(s)}</summary>${window.DLClientStoreUI.form(s,c.id)}</details>`).join('') : '<p class="muted">No stores yet.</p>'}<details class="fold-row" data-keep="s-new"><summary><b>+ Add store</b></summary>${window.DLClientStoreUI.form(null,c.id)}</details></section>`
      : tab === 'products' ? productsPane(products)
      : tab === 'payments'
        ? `${transferProofHTML()}<section class="card card-pad"><h3 class="sec-title">Record a payment</h3><form class="form-grid" data-pay-form="${c.id}" novalidate>
            <label class="field"><span>Amount received</span><span class="money"><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal"></span></label>
            <label class="field"><span>Date</span><input name="paidAt" type="date" value="${iso}"></label>
            <label class="field"><span>Method</span><select name="method">${["Bank transfer", "PayPal", "Wise", "Other"].map(m => `<option value="${m}">${m}</option>`).join("")}</select></label>
            <label class="field"><span>Note <small>optional</small></span><input name="note" maxlength="500"></label>
            ${invoiceFields(c.id)}<div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Record payment</button><p class="form-msg" data-pay-msg></p></div></form></section>
          <section class="card card-pad"><h3 class="sec-title">Invoices</h3>${adminInvoiceLinks(invoiceFiles)}${invoiceForm(c.id)}</section><section class="card">${payments.length ? `<table class="tbl"><tbody>${payments.map(p => `<tr><td><b class="pos">${money(p.amount)}</b><br><small class="dim">${esc(fullDate(p.paidAt))} · ${esc(p.method) || '—'}</small></td><td>${esc(p.note) || '<span class="dim">—</span>'}</td><td>${adminInvoiceLinks(invoiceFiles.filter(f=>f.paymentId===p.id))}</td><td class="num"><button type="button" class="btn btn-sm" data-edit-payment="${p.id}">Edit</button> ${p.archived ? `<span class="tag">Archived</span> <button type="button" class="btn btn-sm" data-restore-payment="${p.id}">Restore payment</button>` : `<button type="button" class="btn btn-sm btn-danger" data-del-payment="${p.id}">Archive payment</button>`}</td></tr>`).join('')}</tbody></table>` : empty('No payments yet', 'Payments you record show up here and lower what the client owes.')}</section>`
        : tab === 'prices' ? savedPricesHTML(c)
        : tab === 'activity' ? activityHTML(c)
        : `<section class="card card-pad"><form class="form-grid" data-account-form="${c.id}" novalidate>
            <label class="field full"><span>Name</span><input name="name" maxlength="120" value="${esc(c.name)}"></label>
            <label class="field"><span>Fee per order <small>empty = default</small></span><span class="money"><input name="commissionPerOrder" type="number" min="0" step="0.01" value="${c.commissionPerOrder ?? ''}"></span></label>
            <label class="check-row full"><input type="checkbox" name="applyFeeToOrders"><span>Also change the fee on all of this client’s existing orders <small>(not cancelled ones)</small></span></label>
            <label class="field"><span>Status</span><select name="active"><option value="true"${c.active ? ' selected' : ''}>Active</option><option value="false"${c.active ? '' : ' selected'}>Disabled (can’t sign in)</option></select></label>
            <div class="field full"><span>Username <small>used to sign in, and as the payment reference</small></span><div style="display:flex;gap:8px;align-items:center"><input name="username" maxlength="60" autocomplete="off" data-no-i18n value="${esc(c.username)}" style="flex:1;min-width:0"><button type="button" class="btn btn-sm" data-copy="${esc(c.username)}">Copy</button></div><p><span>Last login:</span> ${c.lastLogin ? esc(fullDate(c.lastLogin)) : 'Never'}</p><p>${c.termsAccepted ? `<span>Terms accepted:</span> <time data-no-i18n>${esc(fullDate(c.termsAccepted.acceptedAt))} · v${c.termsAccepted.version}</time>` : 'Not accepted yet'}</p>${c.termsAccepted && c.termsRequired ? '<p class="note">Current terms not accepted yet.</p>' : ''}<button type="button" class="btn" data-reset-password="${c.id}">Reset password</button><div data-reset-result role="status"></div></div>
            <div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Save account</button><p class="form-msg" data-account-msg></p></div></form>
            <p class="note" style="margin-top:12px">A new fee applies to new orders. To change the orders already in the system, tick the box above before saving; prices that come from the supplier’s cost (cost + fee) follow the new fee.</p></section>
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

