  // ---------- new / edit order ----------
  function viewForm() {
    const ed = S.route === 'edit' ? S.orders.find(o => o.id === S.id) : null;
    const today = localDay();
    const currencies = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD'];
    const extra = !!(ed && (ed.sellingPrice != null || ed.etsyFee != null || ed.etsyEarned != null || ed.sku || ed.notes || (ed.currency && ed.currency !== 'USD')));
    return `<form class="form-layout" id="order-form" novalidate>
      <div class="form-main">
        <section class="card card-pad"><h3 class="form-sec"><i>1</i>Store order number</h3><div class="form-grid">
          <label class="field full" data-f="storeId"${S.stores.filter(s=>!s.archived).length===1&&(!ed||!S.stores.find(s=>s.id===ed.storeId)?.archived)?' hidden':''}><span>Store</span><select name="storeId" required><option value="">Choose a store</option>${S.stores.filter(s=>!s.archived||s.id===ed?.storeId).map(st=>`<option value="${st.id}"${st.id===(ed?.storeId||(S.stores.some(s=>s.id===S.storeId&&!s.archived)?S.storeId:0)||(S.stores.filter(s=>!s.archived).length===1?S.stores.find(s=>!s.archived).id:0))?' selected':''}>${esc(st.name)}</option>`).join('')}</select></label>
          <label class="field" data-f="orderRef"><span>Order number</span><input name="orderRef" required maxlength="120" inputmode="text" placeholder="e.g. 3412345678" value="${esc(ed?.orderRef)}">
            <em class="help">The order number from your store’s order page.</em></label>
          <label class="field" data-f="orderDate"><span>Order date</span><input name="orderDate" required type="date" value="${esc(ed?.orderDate || today)}"></label>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>2</i>What did the customer buy?</h3><div class="form-grid">
          ${!ed ? `<label class="field full"><span>Choose from My Products</span><select name="productId"><option value="">Free-form order</option>${S.products.filter(p=>p.status==='approved').map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.priceOptions?'from '+money(p.unitPrice):money(p.unitPrice)} / unit</option>`).join('')}</select><small data-product-price></small></label><label class="field full" data-f="productOption" hidden><span>Which option did the customer buy?</span><select name="productOption"></select></label>` : ed.quotedUnitPrice!=null ? `<p class="note full"><span>Fixed unit quote</span> <b>${money(ed.quotedUnitPrice)}</b></p>` : ''}
          <div class="field full" data-f="links"><span>What the customer ordered <small>each product, with its variations</small></span><div class="prod-list" data-prods></div>
            <button type="button" class="btn btn-sm link-add" data-prod-add>+ Add another product</button><em class="help">Same product in different variations (e.g. 3 × Black Walnut, 7 Hooks and 2 × Black Walnut, 6 Hooks)? Add a row per variation inside its box. A different product (another link)? “+ Add another product”.</em></div>
          <div class="field full photo-field" data-f="photos"><span>Photo or screenshot of the product <small data-pick-count></small></span>
            <div class="pm-photos pick-zone" data-picks></div>
            <p class="pick-hint">A screenshot of your store order is perfect. You can add up to ${MAX_PHOTOS}.</p></div>
          <label class="field full"><span>Competitor price <small>optional · what other shops charge</small></span><input name="competitorPrice" dir="auto" maxlength="200" autocomplete="off" placeholder="e.g. $24.90 on Etsy shop X" value="${esc(ed?.competitorPrice)}"></label>
        </div></section>
        <section class="card card-pad"><h3 class="form-sec"><i>3</i>Customer &amp; delivery address</h3><div class="form-grid">
          <label class="field full" data-f="buyerName"><span>Customer name</span><input name="buyerName" required maxlength="160" autocomplete="off" value="${esc(ed?.buyerName)}"></label>
          <label class="field full" data-f="address1"><span>Full address and phone <small>street, city, state, postal code, phone</small></span><textarea name="address1" required maxlength="2000" rows="3" placeholder="Paste the full delivery address and phone number here" autocomplete="off">${esc(UI.addressText(ed))}</textarea></label>
          <label class="field full" data-f="destination"><span>Country <small data-country-auto></small></span><select name="destination" required aria-describedby="country-error" autocomplete="off"></select><small id="country-error" class="err-text" role="alert" hidden>Please choose a country.</small></label>
          <label class="field full" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" placeholder="e.g. Sweden" autocomplete="off"></label>
          <label class="field full" data-f="taxNumber"><span>Tax number <small>optional · e.g. Etsy’s IOSS number on the order</small></span><input name="taxNumber" maxlength="300" autocomplete="off" data-no-i18n value="${esc(ed?.taxNumber)}" placeholder="e.g. IOSS IM3720000224, EUR 72.37"></label><label class="field full" data-f="giftMessage"><span>Gift message <small>optional · the supplier adds it to the parcel</small></span><textarea name="giftMessage" maxlength="1000" rows="3" autocomplete="off" data-no-i18n>${esc(ed?.giftMessage)}</textarea></label>
        </div></section>
        <details class="card card-pad more"${extra ? ' open' : ''}><summary><span class="form-sec"><i>+</i>More details <small>optional</small></span></summary><div class="form-grid">
          <label class="field"><span>Customer paid <small>for your profit numbers</small></span><span class="money"><input name="sellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${ed?.sellingPrice == null ? '' : Number(ed.sellingPrice).toFixed(2)}"></span></label>
          <label class="field"><span>Currency</span><select name="currency">${currencies.map(c => `<option${c === (ed?.currency || 'USD') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Etsy fee <small>for your profit</small></span><input name="etsyFee" type="number" min="0" step="0.01" inputmode="decimal" value="${ed?.etsyFee == null ? '' : Number(ed.etsyFee).toFixed(2)}"></label>
          <label class="field"><span>Or: You earned <small>Etsy › order › Earnings</small></span><input name="etsyEarned" type="number" min="0" step="0.01" inputmode="decimal" value="${ed?.etsyEarned == null ? '' : Number(ed.etsyEarned).toFixed(2)}"></label>
          <label class="field full"><span>SKU or listing ID</span><input name="sku" maxlength="120" placeholder="e.g. LIGHTER-01" value="${esc(ed?.sku)}"></label>
          <label class="field full"><span>Note for Direct Line</span><textarea name="notes" maxlength="2000" placeholder="Deadline, gift wrap, special packaging…">${esc(ed?.notes)}</textarea></label>
        </div></details>
      </div>
      <aside class="form-side">
        <section class="card card-pad order-submit-card"><h3>Check and send</h3>
          <div class="client-order-summary" data-sum></div>
          <div class="next-steps"><b>Then Direct Line will</b><ul><li>Buy and pack the product</li><li>Ship it to your customer</li><li>Add the tracking number here</li></ul></div>
          <button class="btn btn-primary btn-block btn-big" type="submit" data-submit>${ed ? 'Save changes' : 'Send order'}</button>
          <a class="btn btn-ghost btn-block" href="${ed ? '#/orders' : '#/home'}">Cancel</a>
          <p class="form-msg" data-form-msg></p>
        </section>
      </aside></form>`;
  }
  function bindForm() {
    const form = $('#order-form'), ed = S.route === 'edit' ? S.orders.find(o => o.id === S.id) : null;
    const dest = destinationPicker(form.destination, $('[data-other-country]', form));
    dest.set(ed?.destination || '');
    const setMsg = (t, k) => { const m = $('[data-form-msg]'); m.textContent = t; m.className = 'form-msg ' + (k || ''); };
    // ----- product photos: existing ones (edit) + new picks, uploaded after the order is saved -----
    const locked = ed && ['shipped', 'delivered'].includes(ed.status);
    let picks = (ed?.photos || []).map(p => ({ key: 'p' + p.id, id: p.id }));
    const removed = [];
    let selectedProduct=null;
    let pickSeq = 0;
    const zone = $('[data-picks]', form);
    function renderPicks() {
      zone.innerHTML = picks.map(p => `<figure class="pm-photo"><img src="${p.id ? photoUrl(ed.id, p.id, true) : p.thumb}" alt="Product photo">${p.productFrom || p.id && locked ? '' : `<button type="button" class="pm-remove" data-pick-remove="${p.key}" aria-label="Remove photo">×</button>`}</figure>`).join('')
        + (picks.length < MAX_PHOTOS ? `<label class="pm-add${picks.length ? '' : ' big'}"><input type="file" accept="image/*" multiple hidden data-pick-input><span>+</span><small>${picks.length ? 'Add more' : 'Add photo or screenshot'}</small></label>` : '');
      $('[data-pick-count]', form).textContent = picks.length ? `${picks.length} of ${MAX_PHOTOS}` : (ed?.source === 'etsy-csv' ? 'optional' : 'required');
      if (picks.length) form.querySelector('[data-f="photos"]')?.classList.remove('bad');
      updateSum();
    }
    async function addFiles(files) {
      const list = [...files].filter(f => /^image\//.test(f.type || ''));
      if (!list.length) { setMsg('Please choose a photo or screenshot (JPG, PNG or WebP).', 'err'); return; }
      const room = MAX_PHOTOS - picks.length;
      if (room <= 0) { setMsg(`You can add up to ${MAX_PHOTOS} photos.`, 'err'); return; }
      zone.classList.add('busy');
      let failed = '';
      for (const file of list.slice(0, room)) {
        try { picks.push({ key: 'n' + (++pickSeq), ...(await shrinkImage(file)) }); renderPicks(); }
        catch (ex) { failed = ex.message; }
      }
      zone.classList.remove('busy');
      if (list.length > room) setMsg(`Only ${MAX_PHOTOS} photos fit on one order, so ${list.length - room} weren’t added.`, 'err');
      else setMsg(failed, failed ? 'err' : '');
    }
    form._addFiles = addFiles;
    zone.addEventListener('change', e => { if (e.target.matches('[data-pick-input]')) { addFiles(e.target.files); e.target.value = ''; } });
    zone.addEventListener('click', e => {
      const b = e.target.closest('[data-pick-remove]'); if (!b) return;
      const p = picks.find(x => x.key === b.dataset.pickRemove); if (!p) return;
      if (p.id) removed.push(p.id);
      picks = picks.filter(x => x !== p); renderPicks();
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
    renderPicks();
    // ----- what the customer ordered (Pauline, 22 Oct 2026): a box per product (its link), and inside it one row per
    // colour / size with its own quantity. Sent as flat lines {link, quantity, variant}; the server adds them up.
    const prodBox = $('[data-prods]', form);
    const varRow = (v = {}) => `<div class="var-row" data-var>
      <label class="field item-qty"><span>How many?</span><input data-qty type="number" min="1" max="999" step="1" inputmode="numeric" value="${v.quantity ?? 1}"></label>
      <label class="field item-var"><span>Variation <small>as on your store order: colour, size, hooks…</small></span><input data-variant dir="auto" maxlength="500" placeholder="e.g. Black Walnut, 7 Hooks" value="${esc(v.variant || '')}"></label>
      <button type="button" class="btn btn-sm btn-ghost var-remove" data-var-remove aria-label="Remove this variation">×</button></div>`;
    const prodBlock = (p = {}) => `<div class="prod-block" data-prod>
      <div class="prod-head"><b class="prod-no"><span>Product</span> <span data-no-i18n data-prod-n>1</span></b><button type="button" class="btn btn-sm btn-ghost" data-prod-remove>Remove product</button></div>
      <label class="field item-link"><span>Product link <small>copy from your store</small></span><input data-link type="url" inputmode="url" maxlength="2000" placeholder="https://..." value="${esc(p.link || '')}"></label>
      <div class="var-list" data-vars>${(p.vars?.length ? p.vars : [{}]).map(varRow).join('')}</div>
      <button type="button" class="btn btn-sm link-add" data-var-add>+ Add another variation of this product</button></div>`;
    // Lines grouped by link (in order). Editing an older order: its first link with its quantity; other links need their own.
    const groups = list => { const out = []; for (const it of list) { const g = out.find(x => x.link === it.link && it.link); if (g) g.vars.push(it); else out.push({ link: it.link, vars: [it] }); } return out; };
    const oldLinks = ed?.productLinks?.length ? ed.productLinks : String(ed?.etsyUrl || '').split(/\s+/).filter(Boolean);
    const start = ed?.items?.length ? groups(ed.items) : ed ? [{ link: oldLinks[0] || '', vars: [{ quantity: ed.quantity || 1, variant: ed.variant || '' }] }, ...oldLinks.slice(1).map(link => ({ link, vars: [{ quantity: '', variant: '' }] }))] : [{}];
    prodBox.innerHTML = start.map(prodBlock).join('');
    // Function declarations: the photo box updates the summary before the boxes are drawn.
    function prodRows() { return $$('[data-prod]', form); }
    function itemRows() { return $$('[data-var]', form); }
    function items() { return prodRows().flatMap(b => { const link = b.querySelector('[data-link]').value.trim(); return $$('[data-var]', b).map(r => ({ link, quantity: parseInt(r.querySelector('[data-qty]').value, 10), variant: r.querySelector('[data-variant]').value.trim() })); }); }
    function totalQty() { return items().reduce((n, i) => n + (i.quantity > 0 ? i.quantity : 0), 0); }
    const syncItems = () => {
      const blocks = prodRows(), one = !!selectedProduct?.priceOptions;
      prodBox.classList.toggle('many', blocks.length > 1);
      blocks.forEach((b, i) => { b.querySelector('[data-prod-n]').textContent = i + 1; b.querySelector('[data-prod-remove]').hidden = blocks.length < 2; const vars = $$('[data-var]', b); vars.forEach(v => { v.querySelector('[data-var-remove]').hidden = vars.length < 2; }); b.querySelector('[data-var-add]').hidden = one || vars.length >= 10; });
      $('[data-prod-add]', form).hidden = one || blocks.length >= 10;
    };
    syncItems();
    form.addEventListener('click', e => {
      const va = e.target.closest('[data-var-add]');
      if (va) { const list = va.closest('[data-prod]').querySelector('[data-vars]'); list.insertAdjacentHTML('beforeend', varRow()); syncItems(); list.lastElementChild.querySelector('[data-variant]').focus(); updateSum(); return; }
      if (e.target.closest('[data-prod-add]')) { prodBox.insertAdjacentHTML('beforeend', prodBlock()); syncItems(); prodRows().at(-1).querySelector('[data-link]').focus(); updateSum(); return; }
      const vr = e.target.closest('[data-var-remove]'); if (vr) { vr.closest('[data-var]').remove(); syncItems(); updateSum(); return; }
      const pr = e.target.closest('[data-prod-remove]'); if (pr) { pr.closest('[data-prod]').remove(); syncItems(); updateSum(); }
    });
    form.productId?.addEventListener('change',()=>{
      selectedProduct=S.products.find(p=>p.id===Number(form.productId.value))||null;
      prodBox.innerHTML=prodBlock({link:selectedProduct?.link||'',vars:[{variant:selectedProduct?.variant||''}]});syncItems();
      picks=selectedProduct ? selectedProduct.photoIds.map(id=>({key:'product-'+id,productFrom:true,thumb:'/api/portal/products/'+selectedProduct.id+'/photos/'+id})) : [];
      if(selectedProduct?.competitorPrice&&!form.competitorPrice.value)form.competitorPrice.value=selectedProduct.competitorPrice;
      const opts=selectedProduct?.priceOptions||null,optBox=$('[data-f="productOption"]',form);
      optBox.hidden=!opts;form.productOption.innerHTML=opts?`<option value="">Choose an option…</option>`+opts.map(o=>`<option value="${esc(o.label)}">${esc(o.label)} · ${money(o.unitPrice)}</option>`).join(''):'';
      showUnit();renderPicks();updateSum();
    });
    // The fixed price per item: the chosen option's price when the product has several.
    function chosenOption(){return selectedProduct?.priceOptions?.find(o=>o.label===form.productOption.value)||null;}
    function unitPrice(){return selectedProduct ? (selectedProduct.priceOptions ? chosenOption()?.unitPrice ?? null : selectedProduct.unitPrice) : ed?.quotedUnitPrice ?? null;}
    function shippingNow(){return selectedProduct ? selectedProduct.shipping ?? null : ed?.quotedShipping ?? null;}
    function showUnit(){const box=$('[data-product-price]',form);if(!box)return;const u=unitPrice();box.innerHTML=selectedProduct&&u!=null?`<span>Fixed unit quote</span> <b>${money(u)}</b>${shippingNow()!=null?` · <span>Shipping per order</span> <b>${money(shippingNow())}</b>`:''}`:'';}
    form.productOption?.addEventListener('change',()=>{showUnit();updateSum();});
    // ----- check everything at once, mark what's missing -----
    const mark = (key, bad) => { const f = form.querySelector(`[data-f="${key}"]`); if (f) f.classList.toggle('bad', !!bad); };
    form.addEventListener('input', e => { const f = e.target.closest('[data-f]'); if (f) f.classList.remove('bad'); });
    function updateSum() {
      const qty = totalQty() || 1, links = prodRows().filter(b => b.querySelector('[data-link]').value.trim()).length;
      const where = [form.buyerName.value.trim(), dest.label()].filter(Boolean).join(' · ');
      const row = (label, value) => `<div><span>${label}</span><b>${value ? esc(value) : '<em class="miss">not filled in yet</em>'}</b></div>`;
      $('[data-sum]').innerHTML = row('Order number', form.orderRef.value.trim()) + row('Product', links ? `${links} product${links > 1 ? 's' : ''} · ${qty} item${qty > 1 ? 's' : ''}` : '')
        + (unitPrice()!=null ? row('Order total',money(Math.round((unitPrice()*qty+(shippingNow()||0))*100)/100)) : '') + row('Photo', picks.length ? `${picks.length} added` : (ed?.source === 'etsy-csv' ? 'not needed' : '')) + row('Ship to', where && form.address1.value.trim() && dest.get() ? where : '');
    }
    form.addEventListener('input', updateSum);
    form.addEventListener('change', updateSum);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      // A link pasted without https:// (e.g. "www.etsy.com/listing/…") is completed rather than refused.
      $$('[data-link]', form).forEach(i => { i.value = fullLink(i.value); });
      const linkInputs = $$('[data-link]', form), links = linkInputs.map(i => i.value.trim()).filter(Boolean);
      const badLink = linkInputs.find(i => i.value.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(i.value.trim()));
      const missing = [];
      const check = (key, ok, label) => { mark(key, !ok); if (!ok) missing.push([key, label]); };
      check('storeId',form.storeId.value,'store');
      if(selectedProduct?.priceOptions)check('productOption',chosenOption(),'product option');
      check('orderRef', form.orderRef.value.trim(), 'order number');
      check('orderDate', form.orderDate.value, 'order date');
      check('links', links.length && !badLink, badLink ? 'a full product link (starting with https://)' : 'product link');
      check('photos', picks.length || ed?.source === 'etsy-csv', 'photo or screenshot');
      const badQty = itemRows().filter(r => { const q = parseInt(r.querySelector('[data-qty]').value, 10); return !(q >= 1 && q <= 999); });
      itemRows().forEach(r => r.querySelector('.item-qty').classList.toggle('bad', badQty.includes(r)));
      const noLink = prodRows().filter(b => !b.querySelector('[data-link]').value.trim());
      prodRows().forEach(b => { const v = b.querySelector('[data-link]').value.trim(); b.querySelector('.item-link').classList.toggle('bad', !v || !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v)); });
      if (badQty.length) { missing.push(['links', 'how many (each variation)']); }
      if (noLink.length && links.length) { mark('links', true); missing.push(['links', 'a product link for each product']); }
      if (totalQty() > 999) { mark('links', true); missing.push(['links', 'at most 999 items in one order']); }
      check('buyerName', form.buyerName.value.trim(), 'customer name');
      check('address1', form.address1.value.trim(), 'full address');
      check('destination', dest.get(), 'country');
      $('#country-error').hidden = !!dest.get();
      form.classList.toggle('tried', missing.length > 0);
      if (missing.length) {
        setMsg('Please fill in: ' + missing.map(m => m[1]).join(', ') + '.', 'err');
        const first = form.querySelector(`[data-f="${missing[0][0]}"]`);
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => first?.querySelector('input:not([type=file]),textarea,select')?.focus({ preventScroll: true }), 350);
        return;
      }
      const body = {
        storeId:Number(form.storeId.value),orderRef: form.orderRef.value, orderDate: form.orderDate.value, sellingPrice: form.sellingPrice.value, currency: form.currency.value, etsyFee: form.etsyFee.value, etsyEarned: form.etsyEarned.value,
        sku: form.sku.value, items: items(), competitorPrice: form.competitorPrice.value,
        buyerName: form.buyerName.value, ...UI.addressFields(form.address1.value,ed), destination: dest.get(), notes: form.notes.value, taxNumber: form.taxNumber.value, giftMessage: form.giftMessage.value,
      };
      const btn = $('[data-submit]'); btn.disabled = true; setMsg('');
      if(selectedProduct){body.productId=selectedProduct.id;body.quotedUnitPrice=unitPrice();body.quotedShipping=selectedProduct.shipping??null;if(selectedProduct.priceOptions)body.productOption=chosenOption().label;}
      const fresh = picks.filter(p => !p.id && !p.productFrom), photoBody = p => ({ data: p.data, thumb: p.thumb, width: p.width, height: p.height });
      let r;
      try {
        r = ed ? await api('/orders/' + ed.id, { method: 'PUT', body })
          : await api('/orders', { method: 'POST', body: { ...body, photos: fresh.slice(0, 1).map(photoBody) } });
      } catch (ex) { setMsg(ex.message, 'err'); btn.disabled = false; return; }
      // The order is saved. Upload the remaining photos one by one (keeps each request small), then remove the ones taken out.
      const orderId = r.order.id, queue = ed || selectedProduct ? fresh : fresh.slice(1);
      let failed = 0;
      for (let i = 0; i < queue.length; i++) {
        setMsg(`Uploading photos… ${i + 1} of ${queue.length}`);
        try { await api(`/orders/${orderId}/photos`, { method: 'POST', body: photoBody(queue[i]) }); } catch (ex) { failed++; }
      }
      for (const id of removed) { try { await api(`/orders/${orderId}/photos/${id}/delete`, { method: 'POST' }); } catch (ex) { failed++; } }
      setMsg('');
      await refresh(true);
      S.filter = 'all'; go('orders');
      if (failed) N.popup({ icon: 'alert', tone: 'red', title: 'Some photos didn’t save', text: `${orderName(r.order)} was saved, but ${failed} photo change${failed > 1 ? 's' : ''} didn’t go through. Open the order and edit it to try again.` }, { duration: 12000 });
      else N.popup({ icon: 'check', tone: 'mint', title: ed ? 'Order updated' : 'Order sent', text: ed ? orderName(r.order) + ' was saved.' : `${orderName(r.order)} is pending. Direct Line will add the fulfilment details next.` }, { duration: 6000 });
      setTimeout(() => openOrder(orderId), 200);
    });
    updateSum();
    // Came from "Order this product": that product is already chosen.
    if (!ed && S.orderProduct && form.productId && S.products.some(p => p.id === S.orderProduct && p.status === 'approved')) { form.productId.value = String(S.orderProduct); form.productId.dispatchEvent(new Event('change')); }
    S.orderProduct = null;
    if (!ed) form.orderRef.focus({ preventScroll: true });
  }

