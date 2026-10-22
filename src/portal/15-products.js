  // My Products: filter by status (remembered), search, newest change first; "Updated" marks prices set since the last visit.
  const P_FILTERS=[['all','All'],['awaiting_quote','Waiting for price'],['approved','Priced'],['not_available','Not available']];
  const P_TONE={awaiting_quote:'t-pending',approved:'t-delivered',not_available:'t-cancelled'};
  const productStatus=s=>({awaiting_quote:'Waiting for price',approved:'Priced',not_available:'Not available'}[s]||s);
  const productsSeenKey=()=>'dl-products-seen-'+S.me.id;
  // Shipping per order (one parcel) from the supplier, added once to an order of this product.
  const shipLine=p=>p.shipping!=null?`<small class="mp-ship"><span>Shipping per order</span> <b>${money(p.shipping)}</b></small>`:'<small class="dim">Shipping not added yet</small>';
  function productRow(p){
    const fresh=S.productsSeenBefore&&p.status!=='awaiting_quote'&&p.updatedAt>S.productsSeenBefore;
    const price=p.status==='not_available'?'':p.priceOptions?`<ul class="price-options">${p.priceOptions.map(o=>`<li><span data-no-i18n>${esc(o.label)}</span> <b>${money(o.unitPrice)}</b></li>`).join('')}</ul>${shipLine(p)}`:p.unitPrice!=null?`<b class="mp-price">${money(p.unitPrice)}</b><small class="dim">per item</small>${shipLine(p)}`:'<small class="dim">Our supplier is checking the price.</small>';
    return `<article class="mp-row${fresh?' is-new':''}" data-open-product="${p.id}">${p.photoIds[0]?`<img src="/api/portal/products/${p.id}/photos/${p.photoIds[0]}" width="112" height="112" alt="Product photo" loading="lazy">`:'<span class="mp-ph"></span>'}<div class="mp-main"><button type="button" class="mp-name" data-open-product="${p.id}" data-no-i18n>${esc(p.name)}</button>${p.variant?`<small data-no-i18n>${esc(p.variant)}</small>`:''}${p.competitorPrice?`<small class="mp-comp"><span>Competitor price</span>: <b data-no-i18n><bdi>${esc(p.competitorPrice)}</bdi></b></small>`:''}<small><a href="${esc(p.link)}" target="_blank" rel="noopener">Product link</a> · <span>Updated</span> <time data-no-i18n datetime="${new Date(p.updatedAt*1000).toISOString()}" title="${esc(fullDate(p.updatedAt))}">${esc(new Date(p.updatedAt*1000).toLocaleDateString('en-GB',{timeZone:window.DL.displayTimeZone()}))}</time></small>${p.note?`<p class="mp-note" data-no-i18n>${esc(p.note)}</p>`:''}</div><div class="mp-side"><span class="chip mp-status ${P_TONE[p.status]||''}"><i class="dot"></i>${productStatus(p.status)}</span>${fresh?`<span class="tag tag-gold">${p.status==='approved'?'New price':'Updated'}</span>`:''}${price}</div></article>`;
  }
  // Product details in the side panel: all photos, price (or each option), supplier note, dates, and "Order this product".
  function openProduct(id){
    const p=S.products.find(x=>x.id===Number(id));if(!p)return;
    const d=UI.getDrawer();chatCtl?.destroy();chatCtl=null;d.foot.dataset.confirm='';d.onClose=null;d.open('p'+p.id);
    d.head.innerHTML=`<h2 data-no-i18n>${esc(p.name)}</h2><p><span class="chip mp-status ${P_TONE[p.status]||''}"><i class="dot"></i>${productStatus(p.status)}</span></p>`;
    const row=(label,value)=>value?`<div><dt>${label}</dt><dd>${value}</dd></div>`:'';
    const price=p.status==='not_available'?'<span class="dim">—</span>':p.priceOptions?`<ul class="price-options">${p.priceOptions.map(o=>`<li><span data-no-i18n>${esc(o.label)}</span> <b>${money(o.unitPrice)}</b></li>`).join('')}</ul>`:p.unitPrice!=null?`<b>${money(p.unitPrice)}</b>`:'<span class="dim">Our supplier is checking the price.</span>';
    d.body.innerHTML=`${p.photoIds.length?`<section class="mp-photos">${p.photoIds.map(ph=>`<a href="/api/portal/products/${p.id}/photos/${ph}" title="Open full size"><img src="/api/portal/products/${p.id}/photos/${ph}" alt="Product photo"></a>`).join('')}</section>`:''}
      <section class="card card-pad"><h3 class="sec-title">Price per item</h3>${price}${p.status==='approved'?`<div class="money-rows" style="margin-top:10px"><div><span>Shipping per order</span><span>${p.shipping!=null?`<b>${money(p.shipping)}</b>`:'<span class="dim">Not added yet</span>'}</span></div></div><p class="note" style="margin:10px 0 0">Shipping is added once to each order, whatever the quantity.</p>`:''}${p.note?`<p class="mp-note" data-no-i18n>${esc(p.note)}</p>`:''}</section>
      <section class="card card-pad"><h3 class="sec-title">Competitor price</h3>${S.me.preview?(p.competitorPrice?`<p data-no-i18n><bdi>${esc(p.competitorPrice)}</bdi></p>`:'<p class="dim">Not added</p>'):`<form id="comp-form" class="comp-form"><input name="competitorPrice" dir="auto" maxlength="200" autocomplete="off" data-no-i18n aria-label="Competitor price" placeholder="e.g. $24.90 on Etsy shop X" value="${esc(p.competitorPrice)}"><button type="submit" class="btn">Save</button></form><p class="form-msg" data-comp-msg></p>`}<p class="note" style="margin:6px 0 0">What other shops charge for this product. Our supplier sees it next to your product.</p></section>
      <section class="card card-pad"><dl class="kv">${row('Variation',p.variant?`<span data-no-i18n>${esc(p.variant)}</span>`:'')}${row('Expected per month',p.expectedQuantity?String(p.expectedQuantity):'')}${row('Sent for quote',`<time data-no-i18n>${esc(fullDate(p.createdAt))}</time>`)}${row('Updated',`<time data-no-i18n>${esc(fullDate(p.updatedAt))}</time>`)}${row('Product link',`<a href="${esc(p.link)}" target="_blank" rel="noopener" data-no-i18n>${esc(p.link)}</a>`)}</dl></section>`;
    const cf=$('#comp-form',d.body);if(cf)cf.addEventListener('submit',async e=>{e.preventDefault();const b=$('[type=submit]',cf),m=$('[data-comp-msg]',d.body);b.disabled=true;m.textContent='';m.className='form-msg';try{await api('/products/'+p.id,{method:'PUT',body:{competitorPrice:cf.competitorPrice.value}});await refresh();N.popup({icon:'check',title:'Competitor price saved'},{duration:4000});}catch(ex){m.textContent=ex.message;m.className='form-msg err';}b.disabled=false;});
    d.foot.innerHTML=p.status==='approved'&&!S.me.preview?`<a class="btn btn-primary" href="#/new" data-order-product="${p.id}" data-close-drawer>${ic('plus')}Order this product</a><button type="button" class="btn" data-close-drawer>Close</button>`:`<button type="button" class="btn" data-close-drawer>Close</button>`;
  }
  function productListHTML(){
    const f=S.productFilter,q=(S.productQ||'').trim().toLowerCase();
    const shown=S.products.filter(p=>(f==='all'||p.status===f)&&(!q||[p.name,p.variant,p.link].join(' ').toLowerCase().includes(q)));
    const sorted=sortList(shown,'portal-products',PRODUCT_SORTS);
    return sorted.length?sorted.map(productRow).join(''):empty('tag',S.products.length?'No products match':'No products yet',S.products.length?'Try another filter or search.':'Send a product for a quote and its price shows up here.');
  }
  function productChips(){const n=k=>k==='all'?S.products.length:S.products.filter(p=>p.status===k).length;return P_FILTERS.map(([k,l])=>`<button type="button" class="chip${S.productFilter===k?' on':''} ${P_TONE[k]||''}" data-pfilter="${k}" aria-pressed="${S.productFilter===k}">${k!=='all'?'<i class="dot"></i>':''}${l} <span>${n(k)}</span></button>`).join('');}
  function viewProducts(){
    if(!S.productFilter)S.productFilter=store.get('dl-products-filter','all');
    const add=S.me.preview?'':`<details class="card card-pad add-product" data-add-product${S.addProductOpen||!S.products.length?' open':''}><summary><span><b>Send a product for a quote</b><small class="dim">Check product prices before you sell them</small></span><span class="btn btn-primary btn-sm">${ic('plus')}Add product</span></summary><form id="product-form" class="form-grid"><label class="field"><span>Product name <small>optional</small></span><input name="name" maxlength="160"></label><label class="field"><span>Product link</span><input name="link" type="url" maxlength="1000" required></label><label class="field"><span>Variant notes</span><input name="variant" maxlength="500"></label><label class="field"><span>Expected monthly quantity <small>optional</small></span><input name="expectedQuantity" type="number" min="1" step="1"></label><label class="field full"><span>Competitor price <small>optional · what other shops charge</small></span><input name="competitorPrice" dir="auto" maxlength="200" autocomplete="off" data-no-i18n placeholder="e.g. $24.90 on Etsy shop X"></label><label class="field full"><span>Product photos <small>one to three</small></span><input name="photos" type="file" accept="image/*" multiple required></label><button type="submit" class="btn btn-primary">Send for quote</button><p class="form-msg" data-product-msg></p><p class="note full" style="margin:0">Our supplier checks the product price. You’ll see it here as the price per item; shipping is added on each order.</p></form></details>`;
    return `${add}<section class="card card-pad"><h3 class="sec-title">My Products</h3><div class="toolbar mp-toolbar"><div class="chips" data-pchips>${productChips()}</div><label class="search"><span class="sr">Search products</span>${ic('search')}<input type="search" placeholder="Search products…" value="${esc(S.productQ||'')}" data-pq></label>${sortPick('portal-products',PRODUCT_SORTS)}</div><div data-plist>${productListHTML()}</div></section>`;
  }
  function bindProducts(){
    $('[data-pchips]')?.addEventListener('click',e=>{const b=e.target.closest('[data-pfilter]');if(!b)return;S.productFilter=b.dataset.pfilter;store.set('dl-products-filter',S.productFilter);$('[data-pchips]').innerHTML=productChips();$('[data-plist]').innerHTML=productListHTML();});
    $('[data-pq]')?.addEventListener('input',e=>{S.productQ=e.target.value;$('[data-plist]').innerHTML=productListHTML();});
    $('[data-add-product]')?.addEventListener('toggle',e=>{S.addProductOpen=e.target.open;});
    const f=$('#product-form');if(!f)return;f.addEventListener('input',()=>{f.dataset.dirty='1';});f.addEventListener('change',()=>{f.dataset.dirty='1';});f.addEventListener('submit',async e=>{e.preventDefault();const b=$('[type=submit]',f),m=$('[data-product-msg]',f);b.disabled=true;m.textContent='';try{const files=[...f.photos.files];if(!files.length||files.length>3)throw new Error('Add one to three product photos.');const photos=[];for(const file of files){const p=await shrinkImage(file);photos.push({filename:file.name,data:p.data});}await api('/products',{method:'POST',body:{name:f.name.value,link:f.link.value,variant:f.variant.value,expectedQuantity:f.expectedQuantity.value,competitorPrice:f.competitorPrice.value,photos}});f.dataset.dirty='';await refresh();N.popup({icon:'check',title:'Product sent for quote.'});}catch(ex){m.textContent=ex.message;b.disabled=false;}});}
  // Receipts Direct Line sent for money already paid (stored as kind 'invoice').
  function invoiceLinks(files) {
    return files.length ? files.map(f=>`<p><a class="btn btn-sm" href="/api/portal/files/${f.id}" target="_blank" rel="noopener">${ic('doc')}<span>Download receipt</span> <small data-no-i18n>${esc(f.filename)}</small></a></p>`).join('') : '<span class="muted">Receipt not ready yet</span>';
  }
  // Payment history: one row per payment — amount and date, the orders it paid, and its receipt to download.
  function paymentRow(p) {
    const files = S.invoices.filter(f => f.paymentId === p.id);
    return `<div class="cpay-row"><div class="cpay-main"><b class="pos">${money(p.amount)}</b><small><span data-no-i18n>${esc(window.DLPayOrders.day(p.paidAt))}</span> · ${esc(p.method) || '—'}${p.note ? ` · <span data-no-i18n>${esc(p.note)}</span>` : ''}</small></div>
      <div class="cpay-orders">${window.DLPayOrders.linked({ payment: p, orders: S.orders, adjustments: S.adjustments, orderName, esc })}</div>
      <div class="cpay-receipt">${files.length ? files.map(f => `<a class="btn btn-sm btn-primary" href="/api/portal/files/${f.id}" target="_blank" rel="noopener" title="${esc(f.filename)}">${ic('doc')}<span>Download receipt</span></a>`).join('') : '<span class="muted">Receipt not ready yet</span>'}</div></div>`;
  }
  function viewPayments() {
    const s = S.me.summary, credit = s.outstanding < 0, adjustments=S.adjustments.filter(a=>!S.storeId||S.orders.some(o=>o.id===a.orderId&&o.storeId===S.storeId));
    return `<section class="stats">
        <div class="stat"><small>Total billed</small><strong>${money(s.billed)}</strong><em>${s.orders} order${s.orders === 1 ? '' : 's'}, cancelled ones not counted</em></div>
        <div class="stat"><small>Paid</small><strong class="pos">${money(s.paid)}</strong><em>${S.payments.length} payment${S.payments.length === 1 ? '' : 's'}</em></div>
        <div class="stat hero"><small>${credit ? 'Credit on your account' : 'Balance due'}</small><strong>${money(Math.abs(s.outstanding))}</strong><em>${credit ? 'It counts toward your next orders' : s.outstanding > 0 ? 'Please send this to Direct Line' : 'You’re all paid up'}</em></div>
      </section>
      ${S.storeId ? `<section class="card card-pad"><span>Billed for this store</span>: <b>${money(window.DLClientStoreMath.performance(S.stores,S.orders,S.adjustments).rows.find(s=>s.id===S.storeId)?.billed||0)}</b><p class="muted">Payments cover all stores in this account.</p></section>` : ''}
      ${adjustments.length ? `<section class="card card-pad"><h3 class="sec-title">Balance adjustments</h3>${adjustments.map(a=>`<div class="confirmation-row"><a href="#/orders" data-open-order="${a.orderId}">${esc(a.orderRef || '#'+a.orderId)}</a><span>${esc(a.note)}</span><b>${money(a.amount)}</b></div>`).join('')}</section>` : ''}
      ${payFlow()}
      ${S.billing ? '' : billingCard()}
      <section class="card"><div class="card-head" style="padding-bottom:6px"><h3>Payment history</h3><form id="invoice-month-form" class="month-receipts"><label class="field"><span>Receipts for a month</span><input type="month" name="month" value="${localDay().slice(0,7)}" required></label><button class="btn btn-sm" type="submit">Download all</button><p data-month-msg class="form-msg"></p></form></div>
        ${S.payments.length ? `<div class="cpay-list">${S.payments.map(paymentRow).join('')}</div>` : empty('wallet', 'No payments yet', 'When we receive a payment from you, we record it here.')}
      </section>
      ${S.billing ? billingCard() : ''}
      <p class="note">Your bill is the total of each order. The Direct Line team records payments when they arrive.</p>`;
  }



