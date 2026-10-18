  // ---------- side panel: new / edit order ----------
  function openOrderForm(order, clientId) {
    const d = UI.getDrawer();
    closeChat();
    S.drawer = { kind: 'form', id: order?.id || null };
    d.onClose = () => { S.drawer = null; };
    d.open('f' + (order?.id || 'new'));
    const v2 = x => (x != null ? Number(x).toFixed(2) : '');
    const cid = order?.clientId || Number(clientId) || 0;
    d.head.innerHTML = `<h2>${order ? 'Edit order' : 'New order'}</h2><p>${order ? esc(clientName(order.clientId)) + ' · ' + esc(orderName(order)) : 'Add an order on a client’s behalf (e.g. one they sent on WhatsApp)'}</p>`;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: window.DL.displayTimeZone() });
    const currencies = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD'];
    if (order?.currency && !currencies.includes(order.currency)) currencies.push(order.currency);
    d.body.innerHTML = `<form id="order-form" class="af" novalidate>
      <section class="af-sec"><h3 class="form-sec"><i>1</i>Order</h3><div class="form-grid">
      <label class="field full"><span>Client</span><select name="clientId"${order ? ' disabled' : ''}><option value="">Choose a client…</option>${S.ov.clients.filter(c => c.active || c.id === cid).map(c => `<option value="${c.id}"${c.id === cid ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field full"><span>Store</span><select name="storeId" required></select></label>
      <label class="field"><span>Order number</span><input name="orderRef" maxlength="120" value="${esc(order?.orderRef)}" placeholder="e.g. Etsy #3412"></label>
      <label class="field"><span>Order date</span><input name="orderDate" type="date" value="${esc(order ? order.orderDate : today)}"></label>
      <label class="field"><span>Customer paid <small>on Etsy, optional</small></span><span class="money"><input name="sellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(order?.sellingPrice)}"></span></label>
      <label class="field"><span>Currency</span><select name="currency">${currencies.map(c => `<option${c === (order?.currency || 'USD') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>2</i>Item sold</h3><div class="form-grid">
      ${order ? '<p class="note full">Photos: add or remove them in the order panel.</p>' : `<div class="field full photo-field"><span>Product photos / screenshots <small data-pick-count></small></span>
        <div class="pm-photos pick-zone" data-picks></div>
        <p class="pick-hint">Optional. Add the screenshot the client sent, or a photo of the product (up to ${MAX_PICKS}). You can also drag pictures here or paste with Ctrl+V.</p></div>`}
      <div class="field full"><span>Product links <small>one per product</small></span><div class="link-list" data-links></div>
        <button type="button" class="btn btn-sm link-add" data-link-add>+ Add another product link</button></div>
      <label class="field"><span>Quantity</span><input name="quantity" type="number" min="1" max="999" step="1" inputmode="numeric" value="${order?.quantity || 1}"></label>
      <label class="field"><span>SKU or listing ID <small>optional</small></span><input name="sku" maxlength="120" placeholder="e.g. LIGHTER-01" value="${esc(order?.sku)}"></label>
      <label class="field full"><span>Variation / personalization <small>optional</small></span><input name="variant" maxlength="500" placeholder="Color, size, engraving or personalization" value="${esc(order?.variant)}"></label>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>3</i>Customer &amp; delivery address</h3><div class="form-grid">
      <label class="field full"><span>Customer / recipient name</span><input name="buyerName" maxlength="160" value="${esc(order?.buyerName)}"></label>
      <label class="field full"><span>Full address and phone <small>street, city, state, postal code, phone</small></span><textarea name="address1" maxlength="2000" rows="3" placeholder="Paste the full delivery address and phone number here">${esc(UI.addressText(order))}</textarea></label>
      <label class="field"><span>Destination</span><select name="destination"></select></label>
      <label class="field" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" placeholder="e.g. Sweden"></label>
      <label class="field full"><span>Tax number <small>optional · e.g. Etsy’s IOSS number on the order</small></span><input name="taxNumber" maxlength="300" data-no-i18n value="${esc(order?.taxNumber)}"></label><label class="field full"><span>Gift message <small>optional</small></span><textarea name="giftMessage" maxlength="1000" rows="3" data-no-i18n>${esc(order?.giftMessage)}</textarea></label>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>4</i>Shipping &amp; bill <small class="af-opt">can be added later with “Bill this order”</small></h3><div class="form-grid">
      <label class="field"><span>Tracking number</span><input name="trackingNumber" maxlength="120" value="${esc(order?.trackingNumber)}"></label>
      <label class="field"><span>Product type</span><select name="category">${categoryOptions(order?.category || 'general')}</select></label>
      <label class="field"><span>Weight (kg)</span><input name="weightKg" type="number" min="0" step="0.01" value="${order?.weightKg ?? ''}"></label>
      <label class="field"><span>Product cost <small>fee included</small></span><span class="money"><input name="productCost" type="number" min="0" step="0.01" value="${v2(order?.productCost)}"></span></label>
      <label class="field"><span>Shipping fee <small data-quote-hint></small></span><span class="money"><input name="price" type="number" min="0" step="0.01" value="${order ? (order.shippingFee != null ? v2(order.shippingFee) : order.productCost == null && Number(order.price) ? v2(order.price) : '') : ''}"></span></label>
      <div class="full money-rows" data-sum></div>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>5</i>Notes</h3>
      <label class="field"><span>Notes <small>the client sees these</small></span><textarea name="notes" maxlength="2000">${esc(order?.notes)}</textarea></label>
      </section>
      <p class="form-msg" data-form-msg></p></form>`;
    d.foot.innerHTML = `<button type="submit" form="order-form" class="btn btn-primary" data-submit>${order ? 'Save changes' : 'Add order'}</button><button type="button" class="btn btn-ghost" data-close-drawer>Cancel</button>`;
    const f = $('#order-form'), dest = destinationPicker(f.destination, $('[data-other-country]', f));
    dest.set(order?.destination || '');
    const setStores=()=>{const clientId=Number(f.clientId.value),stores=S.stores.filter(s=>s.clientId===clientId&&(!s.archived||s.id===order?.storeId));f.storeId.innerHTML='<option value="">Choose a store</option>'+stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');f.storeId.value=String(order?.storeId||(stores.length===1?stores[0].id:''));};setStores();f.clientId.addEventListener('change',setStores);
    const msg = $('[data-form-msg]', f), err = t => { msg.textContent = t; msg.className = 'form-msg err'; msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    // ----- product links: one box per product -----
    const linkBox = $('[data-links]', f);
    const linkRow = (v = '') => `<div class="link-row"><input data-link type="url" inputmode="url" maxlength="2000" placeholder="https://www.etsy.com/listing/..." value="${esc(v)}"><button type="button" class="btn btn-sm btn-ghost" data-link-remove aria-label="Remove link">×</button></div>`;
    const startLinks = order?.productLinks?.length ? order.productLinks : String(order?.etsyUrl || '').split(/\s+/).filter(Boolean);
    linkBox.innerHTML = (startLinks.length ? startLinks : ['']).map(linkRow).join('');
    const syncLinks = () => { const rows = $$('.link-row', linkBox); rows.forEach(r => { r.querySelector('[data-link-remove]').hidden = rows.length < 2; }); $('[data-link-add]', f).hidden = rows.length >= 10; };
    syncLinks();
    // ----- photos (new order only; existing orders manage photos in the order panel) -----
    let picks = [], pickSeq = 0;
    const zone = $('[data-picks]', f);
    const renderPicks = () => {
      if (!zone) return;
      zone.innerHTML = picks.map(p => `<figure class="pm-photo"><img src="${p.thumb}" alt="Product photo"><button type="button" class="pm-remove" data-pick-remove="${p.key}" aria-label="Remove photo">×</button></figure>`).join('')
        + (picks.length < MAX_PICKS ? `<label class="pm-add${picks.length ? '' : ' big'}"><input type="file" accept="image/*" multiple hidden data-pick-input><span>+</span><small>${picks.length ? 'Add more' : 'Add photo or screenshot'}</small></label>` : '');
      $('[data-pick-count]', f).textContent = picks.length ? `${picks.length} of ${MAX_PICKS}` : 'optional';
    };
    async function addFiles(files) {
      const list = [...files].filter(x => /^image\//.test(x.type || ''));
      if (!list.length) return err('Please choose a photo or screenshot (JPG, PNG or WebP).');
      const room = MAX_PICKS - picks.length; if (room <= 0) return err(`You can add up to ${MAX_PICKS} photos.`);
      zone.classList.add('busy'); let failed = '';
      for (const file of list.slice(0, room)) { try { picks.push({ key: 'n' + (++pickSeq), ...(await shrinkImage(file)) }); renderPicks(); } catch (ex) { failed = ex.message; } }
      zone.classList.remove('busy');
      if (failed) err(failed); else if (list.length > room) err(`Only ${MAX_PICKS} photos fit on one order.`); else { msg.textContent = ''; msg.className = 'form-msg'; }
    }
    if (zone) {
      zone.addEventListener('change', e => { if (e.target.matches('[data-pick-input]')) { addFiles(e.target.files); e.target.value = ''; } });
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
      f.addEventListener('paste', e => { const fl = [...(e.clipboardData?.files || [])]; if (fl.length) { e.preventDefault(); addFiles(fl); } });
      renderPicks();
    }
    let auto = null;
    const upd = () => {
      const q = quote({ country: dest.get(), category: f.category.value, weightKg: f.weightKg.value, divisor: divisor() });
      if (q && (f.price.value === '' || f.price.value === auto)) { f.price.value = q.total.toFixed(2); auto = f.price.value; }
      $('[data-quote-hint]').innerHTML = q ? (f.price.value === q.total.toFixed(2) ? 'from our rates' : `<button type="button" class="back" style="margin:0" data-use-quote="${q.total.toFixed(2)}">use ${money(q.total)}</button>`) : '';
      const pc = parseFloat(f.productCost.value), sh = parseFloat(f.price.value), sp = parseFloat(f.sellingPrice.value), tot = (pc || 0) + (sh || 0), billed = Number.isFinite(pc) || Number.isFinite(sh);
      $('[data-sum]').innerHTML = `<div class="total"><span>Client pays</span><span>${billed ? money(tot) : 'not billed yet'}</span></div>${billed && Number.isFinite(sp) ? `<div><span>Client’s profit</span><span class="${sp - tot >= 0 ? 'pos' : 'neg'}">${money(sp - tot)}</span></div>` : ''}`;
    };
    f.addEventListener('input', e => { if (e.target.name === 'price') auto = null; if (msg.classList.contains('err')) { msg.textContent = ''; msg.className = 'form-msg'; } upd(); });
    f.addEventListener('change', upd);
    f.addEventListener('click', e => {
      const u = e.target.closest('[data-use-quote]'); if (u) { f.price.value = u.dataset.useQuote; auto = f.price.value; upd(); }
      if (e.target.closest('[data-link-add]')) { linkBox.insertAdjacentHTML('beforeend', linkRow()); syncLinks(); $$('[data-link]', linkBox).pop().focus(); }
      const rm = e.target.closest('[data-link-remove]'); if (rm) { rm.closest('.link-row').remove(); syncLinks(); }
      const pr = e.target.closest('[data-pick-remove]'); if (pr) { picks = picks.filter(x => x.key !== pr.dataset.pickRemove); renderPicks(); }
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if(!f.storeId.value)return err('Choose a store.');
      if (!order && !f.clientId.value) return err('Please choose the client.');
      if (!f.buyerName.value.trim() || !f.address1.value.trim()) return err('Please fill in the customer name and full address.');
      if (!dest.get()) return err('Please choose a country.');
      if (dest.isOther() && !dest.get()) return err('Please type the country name.');
      $$('[data-link]', f).forEach(i => { i.value = window.DL.fullLink(i.value); });
      const linkInputs = $$('[data-link]', f), links = linkInputs.map(i => i.value.trim()).filter(Boolean);
      const badLink = linkInputs.find(i => i.value.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(i.value.trim()));
      if (badLink) { badLink.focus(); return err('Please paste each product link in full, starting with https://'); }
      const qty = parseInt(f.quantity.value, 10);
      if (!(qty >= 1 && qty <= 999)) return err('Quantity must be between 1 and 999.');
      const body = { storeId:Number(f.storeId.value),clientId: order ? order.clientId : Number(f.clientId.value), orderRef: f.orderRef.value, orderDate: f.orderDate.value, currency: f.currency.value,
        sellingPrice: f.sellingPrice.value === '' ? null : f.sellingPrice.value,
        etsyUrl: links.join('\n'), quantity: qty, sku: f.sku.value, variant: f.variant.value,
        buyerName: f.buyerName.value, ...UI.addressFields(f.address1.value,order), taxNumber: f.taxNumber.value, giftMessage: f.giftMessage.value,
        trackingNumber: f.trackingNumber.value, destination: dest.get(), category: f.category.value,
        weightKg: f.weightKg.value === '' ? null : f.weightKg.value, productCost: f.productCost.value === '' ? null : f.productCost.value, shippingFee: f.price.value === '' ? null : f.price.value,
        notes: f.notes.value };
      const btn = $('[data-submit]'); btn.disabled = true; msg.textContent = ''; msg.className = 'form-msg';
      const photoBody = p => ({ data: p.data, thumb: p.thumb, width: p.width, height: p.height });
      let r;
      try {
        r = order ? await api('/orders/' + order.id, { method: 'PUT', body }) : await api('/orders', { method: 'POST', body: { ...body, photos: picks.slice(0, 1).map(photoBody) } });
      } catch (ex) { btn.disabled = false; return err(ex.message); }
      // Saved. Upload the other photos one by one (keeps each request small).
      let failed = 0;
      for (const [i, p] of picks.slice(1).entries()) {
        msg.textContent = `Uploading photos… ${i + 1} of ${picks.length - 1}`;
        try { await api(`/orders/${r.order.id}/photos`, { method: 'POST', body: photoBody(p) }); } catch (ex) { failed++; }
      }
      await loadAll(); renderList();
      toast(failed ? `Order saved, but ${failed} photo${failed > 1 ? 's' : ''} didn’t upload. Add them in the order panel.` : order ? 'Order updated.' : 'Order added.');
      openOrder(r.order.id);
    });
    upd();
    if (!order) setTimeout(() => f.clientId.value ? f.orderRef.focus({ preventScroll: true }) : f.clientId.focus({ preventScroll: true }), 60);
  }

