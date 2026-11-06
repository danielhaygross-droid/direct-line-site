  // ---------- claims ----------
  const CL_ST = { open: ['Open', 'pending'], approved: ['Approved', 'processing'], rejected: ['Rejected', 'na'], resolved: ['Resolved', 'delivered'] };
  const CL_TODO = c => ['open', 'approved'].includes(c.status);
  // What the claim is about, its files and the reply / decision form (the order panel card and the Claims rows share it).
  function claimBody(c) {
    return `<p><b>${esc(UI.CLAIM_LABEL[c.problem] || c.problem)}</b>${c.description ? `: <span data-no-i18n>${esc(c.description)}</span>` : ''}</p>${c.fileIds.length || c.reshipmentOrderId ? `<div class="claim-files">${UI.claimFiles(c).map(f => `<a class="btn btn-sm" href="/api/portal/files/${f.id}" target="_blank" rel="noopener">${f.label}</a>`).join('')}${c.reshipmentOrderId ? `<button class="btn btn-sm" type="button" data-open-order="${c.reshipmentOrderId}">Open reshipment</button>` : ''}</div>` : ''}${CL_TODO(c) ? `<form class="form-grid" data-claim-decision="${c.id}"><label class="field full"><span>Admin reply</span><textarea name="reply" rows="2" maxlength="2000">${esc(c.reply)}</textarea></label><div class="full claim-decide"><label class="field"><span>Decision</span><select name="status">${c.status === 'open' ? '<option value="approved">Approved</option><option value="rejected">Rejected</option>' : '<option value="resolved">Resolved</option>'}</select></label><button class="btn btn-primary" type="submit">Save claim decision</button></div><p class="form-msg full" data-claim-msg></p></form>` : c.reply ? `<p class="cl-reply"><span>Admin reply</span> <span data-no-i18n>${esc(c.reply)}</span></p>` : ''}`;
  }
  function adminClaimCard(c){return c?`<section class="card card-pad${c.overdue?' claim-overdue':''}"><h3 data-no-i18n>${esc(c.orderRef||'#'+c.orderId)} · ${esc(c.clientName)}</h3><p><span>${c.status==='open'?'Open':c.status==='approved'?'Approved':c.status==='rejected'?'Rejected':'Resolved'}</span> · <span>${c.resolution==='refund'?'Refund':'Reshipment'}</span></p><p><b data-no-i18n>${c.businessDays}</b> <span>business days (Mon–Fri)</span></p>${c.overdue?'<p class="err-text">Overdue: more than 3 business days</p>':''}${claimBody(c)}</section>`:'';}
  // Admin Claims (Erwin, 6 Nov 2026: make the admin screens shorter, like Client products): one short row per claim
  // (order, client, problem, refund or reshipment, days, status); a row opens to the claim. Claims waiting for a decision
  // (open / approved) open by themselves; what the admin opens or closes is kept until that claim is saved (S.clOpen).
  function claimRow(c) {
    const [label, tone] = CL_ST[c.status] || [c.status, 'na'], open = S.clOpen[c.id] ?? CL_TODO(c);
    return `<details class="card pq cl-row${CL_TODO(c) ? ' pq-todo' : ''}${c.overdue ? ' cl-late' : ''}" data-cl="${c.id}"${open ? ' open' : ''}><summary class="pq-sum">
      <span class="pq-name"><b data-no-i18n>${esc(c.orderRef || '#' + c.orderId)} · ${esc(c.clientName)}</b><small><span>${esc(UI.CLAIM_LABEL[c.problem] || c.problem)}</span> · <span>${c.resolution === 'refund' ? 'Refund' : 'Reshipment'}</span></small></span>
      <span class="pq-meta">${c.overdue ? '<span class="cl-overdue" title="More than 3 business days">Overdue</span>' : ''}<span class="cl-days"><b data-no-i18n>${c.businessDays}</b> <small>business days</small></span><span class="st st-${tone}">${label}</span></span>
      <span class="pq-chev" aria-hidden="true">${UI.svg('<path d="m6 9 6 6 6-6"/>')}</span></summary>
      <div class="pq-body cl-body">${c.overdue ? '<p class="err-text">Overdue: more than 3 business days</p>' : ''}${claimBody(c)}</div></details>`;
  }
  function renderClaims() {
    const list = sortList(S.claims.filter(c => S.claimFilter === 'all' || c.status === S.claimFilter), 'admin-claims', CLAIM_SORTS);
    $('[data-tab-body]').innerHTML = `<div class="pq-bar"><div class="chips" role="group" aria-label="Show claims">${['all', 'open', 'approved', 'rejected', 'resolved'].map(s => `<button class="chip${S.claimFilter === s ? ' on' : ''}" type="button" data-claim-filter="${s}" aria-pressed="${S.claimFilter === s}">${s === 'all' ? 'All' : CL_ST[s][0]} <span data-no-i18n>${S.claims.filter(c => s === 'all' || c.status === s).length}</span></button>`).join('')}</div>${S.claims.length > 1 ? sortPick('admin-claims', CLAIM_SORTS) : ''}</div>
      ${list.map(claimRow).join('') || `<p class="muted">${S.claims.length ? 'No claims here.' : 'No claims yet.'}</p>`}`;
  }
  // ---------- client products ----------
  // Erwin, 6 Nov 2026: Client products "took so much space, needs to scroll so far down". One short row per product
  // (photo, name, client, status, price); a row opens to its quote form. Products that need us (no price yet, or a cost
  // revision waiting) open by themselves; a row the admin opens or closes stays that way until its quote is saved (S.pqOpen).
  const PQ_TODO = p => p.status === 'awaiting_quote' || !!(p.revision && ['open', 'offered'].includes(p.revision.status));
  const PQ_ST = { awaiting_quote: ['Awaiting quote', 'pending'], approved: ['Approved', 'delivered'], not_available: ['Not available', 'na'] };
  const PQ_FILTERS = [['all', 'All', () => true], ['todo', 'Needs you', PQ_TODO], ['approved', 'Approved', p => p.status === 'approved'], ['not_available', 'Not available', p => p.status === 'not_available']];
  function productQuoteForm(p) {
    const rev = p.revision && ['open', 'offered'].includes(p.revision.status) ? `<div class="rev-admin-p" data-rev-product><p><b>Cost revision requested</b> · <span>Client’s competitor price</span>: <b data-no-i18n>${money(p.revision.competitorPrice)}</b>${p.revision.note ? ` · <span data-no-i18n>${esc(p.revision.note)}</span>` : ''}</p><p class="note">Save a lower price below (or the supplier changes it in the sheet): it’s used for this product’s next orders. Or keep the price:</p><div class="rev-keep-row"><input name="revReply" maxlength="1000" aria-label="Reply to the client" placeholder="Reply to the client (optional)"><a class="btn" href="https://wa.me/?text=${encodeURIComponent(`Hi Ye, our client asks for a lower price on the product "${p.name}" (orange row in the Product Quotes sheet). They sell it at $${Number(p.revision.competitorPrice).toFixed(2)} (competitor price); our price now is $${Number(p.supplierPrice ?? p.unitPrice ?? 0).toFixed(2)} per item. Can you check if you can lower it? If yes, please type the new Price per item in the sheet. Thank you!`)}" target="_blank" rel="noopener">${ic('chat')}Tell the supplier on WhatsApp</a><button type="button" class="btn" data-rev-keep-product="${p.id}">Keep the price</button></div></div>` : '';
    const side = `<div class="pq-side">${p.photoIds.length ? `<div class="qf-photos">${p.photoIds.map(id => `<img class="qf-photo" src="/api/portal/products/${p.id}/photos/${id}" width="112" height="112" alt="Product photo" loading="lazy" title="Open full size">`).join('')}</div>` : ''}<p><a href="${esc(p.link)}" target="_blank" rel="noopener">Product link</a></p>${p.variant || p.expectedQuantity ? `<p data-no-i18n>${esc(p.variant)}${p.expectedQuantity ? ' · ' + p.expectedQuantity : ''}</p>` : ''}${p.competitorPrice ? `<p><span>Competitor price (from the client):</span> <b data-no-i18n><bdi>${esc(p.competitorPrice)}</bdi></b></p>` : ''}</div>`;
    const from = p.priceOptions ? `<div class="note full" style="margin:0"><p style="margin:0"><span>Several prices from the sheet (supplier → client):</span></p><ul class="price-options">${p.priceOptions.map(o => `<li><span data-no-i18n>${esc(o.label)}</span> <b data-no-i18n dir="ltr">${money(o.supplierPrice)} → ${money(o.unitPrice)}</b></li>`).join('')}</ul><p style="margin:0"><span>Saving a price here replaces the options with one price.</span></p></div>`
      : p.supplierPrice != null ? `<p class="note full" style="margin:0"><span>Supplier price from the sheet:</span> <b data-no-i18n>${money(p.supplierPrice)}</b> <span>(the client price adds the client’s fee per order)</span></p>` : '';
    return `<form class="pq-form" data-product-quote="${p.id}">${rev}${side}<div class="form-grid pq-fields">
      <label class="field"><span>Status</span><select name="status"><option value="approved"${p.status === 'approved' ? ' selected' : ''}>Approved</option><option value="not_available"${p.status === 'not_available' ? ' selected' : ''}>Not available</option></select></label>
      <label class="field"><span>Client price per item (USD) <small>product only</small></span><input name="unitPrice" type="number" min="0" step="0.01" value="${p.unitPrice ?? ''}"></label>
      <label class="field"><span>Shipping per order (USD) <small>one parcel, optional</small></span><input name="shipping" type="number" min="0" step="0.01" value="${p.shipping ?? ''}"></label>
      ${from}<label class="field full"><span>Note</span><textarea name="note" rows="2" maxlength="1000">${esc(p.note)}</textarea></label>
      <div class="full pq-actions"><button type="submit" class="btn btn-primary">Save quote</button><p class="form-msg" data-quote-msg></p></div></div></form>`;
  }
  function productRow(p) {
    const [label, tone] = PQ_ST[p.status] || [p.status, 'na'], open = S.pqOpen[p.id] ?? PQ_TODO(p), ph = p.photoIds[0];
    const price = p.priceOptions ? '<span class="pq-price">Several prices</span>' : p.unitPrice != null ? `<span class="pq-price"><b data-no-i18n>${money(p.unitPrice)}</b> <small>per item</small></span>` : '';
    return `<details class="card pq${PQ_TODO(p) ? ' pq-todo' : ''}" data-pq="${p.id}"${open ? ' open' : ''}><summary class="pq-sum">
      <span class="pq-thumb">${ph ? `<img src="/api/portal/products/${p.id}/photos/${ph}" width="48" height="48" alt="" loading="lazy">` : ic('doc')}</span>
      <span class="pq-name"><b data-no-i18n>${esc(p.name)}</b><small data-no-i18n>${esc(p.clientName)}${p.variant ? ' · ' + esc(p.variant) : ''}</small></span>
      <span class="pq-meta">${UI.revTag(p)}<span class="st st-${tone}">${label}</span>${price}</span>
      <span class="pq-chev" aria-hidden="true">${UI.svg('<path d="m6 9 6 6 6-6"/>')}</span></summary>
      <div class="pq-body">${productQuoteForm(p)}</div></details>`;
  }
  function renderProducts() {
    const f = PQ_FILTERS.find(x => x[0] === S.pqFilter) || PQ_FILTERS[0];
    const products = sortList(S.products.filter(f[2]), 'admin-products', ADMIN_PRODUCT_SORTS);
    $('[data-tab-body]').innerHTML = `<div class="pq-bar"><div class="chips" role="group" aria-label="Show products">${PQ_FILTERS.map(([k, l, t]) => `<button class="chip${f[0] === k ? ' on' : ''}" type="button" data-pq-filter="${k}" aria-pressed="${f[0] === k}">${l} <span data-no-i18n>${S.products.filter(t).length}</span></button>`).join('')}</div>${S.products.length > 1 ? sortPick('admin-products', ADMIN_PRODUCT_SORTS) : ''}</div>
      ${products.map(productRow).join('') || `<p class="muted">${S.products.length ? 'No products here.' : 'No products yet.'}</p>`}`;
  }
