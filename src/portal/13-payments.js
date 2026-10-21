  // ---------- payments ----------
  // "How to pay" box: bank details from admin settings, each with a Copy button (item #5).
  function howToPay() {
    const b = S.me.settings || {}, user = S.me.username || '';
    const rows = [['Currency', b.bank_currency], ['Account holder name', b.bank_holder], ['Account number', b.bank_account], ['ACH routing number', b.bank_ach],
      ['Wire routing number', b.bank_wire], ['SWIFT/BIC', b.bank_swift], ['Bank name', b.bank_name], ['Bank address', b.bank_address]].filter(r => r[1]);
    if (!rows.length) return '';
    const line = (label, shown, copy) => `<div class="pay-row"><span>${label}</span><b data-no-i18n>${esc(shown)}</b><button type="button" class="btn btn-sm" data-copy="${esc(copy)}">${ic('copy')}Copy</button></div>`;
    return `<section class="card card-pad how-pay"><h3 class="sec-title">How to pay</h3><p class="muted">Send your balance by bank transfer to this account.</p>
      <div class="pay-rows">${rows.map(([l, v]) => line(l, v, v)).join('')}
        ${user ? `<div class="pay-row"><span>Payment reference</span><b><span data-no-i18n>${esc(user)}</span><small>${esc(b.bank_reference || 'Use your Direct Line username as the reference')}</small></b><button type="button" class="btn btn-sm" data-copy="${esc(user)}">${ic('copy')}Copy</button></div>` : ''}</div></section>`;
  }
  const confirmationCards = () => S.transfers.map(t => `<div class="confirmation-row"><div><b>${money(t.amount)}</b> <span class="muted" data-no-i18n>${esc(t.date)}</span><p><a href="/api/portal/files/${t.id}${/\.(png|jpe?g|webp|gif)$/i.test(t.filename||'') ? '?inline=1" data-photo="1' : ''}" target="_blank" rel="noopener"><span>Open confirmation</span> <small data-no-i18n>${esc(t.filename)}</small></a></p>${t.orderIds?.length ? `<small class="dim"><span>Orders you ticked:</span> ${t.orderIds.length}</small>` : ''}</div><span class="tag">${t.status === 'recorded' ? 'Recorded' : t.status === 'archived' ? 'Payment archived' : 'Pending review'}</span></div>`).join('');
  // Billed orders that are not paid yet (all stores), oldest first.
  const unpaidOrders = () => S.orders.filter(o => window.DLPayOrders.state(o, S.adjustments) === 'unpaid').sort((a, b) => window.DLClientStoreMath.dateKey(a).localeCompare(window.DLClientStoreMath.dateKey(b)) || a.createdAt - b.createdAt || a.id - b.id);
  // "Not paid yet": the orders still to pay, so the client can see what the balance is made of.
  function unpaidCard() {
    const list = unpaidOrders(); if (!list.length) return '';
    const due = list.reduce((n, o) => n + window.DLPayOrders.dueCents(o, S.adjustments), 0) / 100;
    return `<details class="card card-pad unpaid-card" data-unpaid${S.unpaidOpen ? ' open' : ''}><summary><h3 class="sec-title">Not paid yet</h3><span class="muted"><b>${list.length}</b> <span>${list.length === 1 ? 'order' : 'orders'}</span> · <b>${money(due)}</b></span></summary>
      <div class="po-list read">${list.map(o => `<a class="po-row" href="#/orders" data-open-order="${o.id}"><span class="po-main"><b data-no-i18n>${esc(orderName(o))}</b><small><span data-no-i18n>${esc(window.DLPayOrders.day(window.DLClientStoreMath.dateKey(o)))}</span>${o.buyerName ? ` · <span data-no-i18n>${esc(o.buyerName)}</span>` : ''}</small></span><b class="po-amt">${money(window.DLPayOrders.dueCents(o, S.adjustments) / 100)}</b></a>`).join('')}</div>
      <p class="note" style="margin:10px 0 0">An order shows as paid once Direct Line records your payment for it.</p></details>`;
  }
  // Billing details for the receipts of paid bills (Ada needs them for the invoice header).
  function billingCard() {
    const b = S.billing, edit = !S.me.preview && (!b || S.billingEdit), v = k => esc(b?.[k] || '');
    const view = b ? `<div class="bill-view"><p><b data-no-i18n>${v('name')}</b>${b.company ? `<br><span data-no-i18n>${v('company')}</span>` : ''}</p><p data-no-i18n style="white-space:pre-line">${v('address')}</p><p data-no-i18n>${[b.email, b.phone].filter(Boolean).map(esc).join(' · ')}</p></div>` : '<p class="muted">No billing details yet.</p>';
    const form = `<form id="billing-form" class="form-grid" novalidate>
        <label class="field"><span>Full name</span><input name="name" maxlength="120" autocomplete="name" value="${v('name')}"></label>
        <label class="field"><span>Company name <small>optional</small></span><input name="company" maxlength="120" autocomplete="organization" value="${v('company')}"></label>
        <label class="field full"><span>Billing address</span><textarea name="address" rows="3" maxlength="400" autocomplete="street-address">${v('address')}</textarea></label>
        <label class="field"><span>Email</span><input name="email" type="email" maxlength="160" autocomplete="email" value="${v('email')}"></label>
        <label class="field"><span>Phone</span><input name="phone" type="tel" maxlength="60" autocomplete="tel" value="${v('phone')}"></label>
        <p class="note full" style="margin:0">Name, address and an email or a phone number are needed.</p>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save billing details</button>${b ? '<button type="button" class="btn" data-billing-cancel>Cancel</button>' : ''}<p class="form-msg" data-billing-msg style="margin:0"></p></div></form>`;
    return `<section class="card card-pad bill-card" data-billing><div class="bill-head"><h3 class="sec-title">Billing details for your receipts</h3>${b && !edit && !S.me.preview ? '<button type="button" class="btn btn-sm" data-billing-edit>Edit</button>' : ''}</div><p class="note">Direct Line puts these details on the receipts for the bills you pay.</p>${edit ? form : view}</section>`;
  }
  function transferForm() {
    if (S.me.preview) return S.transfers.length ? `<section class="card card-pad"><h3 class="sec-title">Your transfer confirmations</h3>${confirmationCards()}</section>` : '';
    const today=localDay();
    return `<section class="card card-pad"><h3 class="sec-title">Upload transfer confirmation</h3><p class="note">Your balance changes only after the team records receipt.</p><form id="transfer-form" class="form-grid" novalidate><label class="field"><span>Amount (USD)</span><input name="amount" type="number" min="0.01" max="9999999" step="0.01" required></label><label class="field"><span>Transfer date</span><input name="date" type="date" value="${today}" required></label><label class="field full"><span>Confirmation file</span><input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required><small>PDF, JPG, PNG or WebP. Maximum 2 MB.</small></label>${unpaidOrders().length ? `<div class="field full"><span>Which orders is this transfer for? <small>optional</small></span>${window.DLPayOrders.checklist({ orders: unpaidOrders(), adjustments: S.adjustments, orderName, dateOf: o => window.DLPayOrders.day(window.DLClientStoreMath.dateKey(o)), esc, empty: 'No orders waiting for payment.' })}</div>` : ''}<div class="field full"><button type="submit" class="btn btn-primary">Send confirmation</button></div><p class="form-msg full" data-transfer-msg role="status"></p></form>${S.transfers.length ? `<h3 class="sec-title">Your transfer confirmations</h3>${confirmationCards()}` : ''}</section>`;
  }
  function bindPayments() {
    const bc=$('[data-billing]');
    bc?.addEventListener('click',e=>{if(e.target.closest('[data-billing-edit]')){S.billingEdit=true;renderView();}else if(e.target.closest('[data-billing-cancel]')){S.billingEdit=false;renderView();}});
    const bf=$('#billing-form');
    if(bf){bf.addEventListener('input',()=>{bf.dataset.dirty='1';});bf.addEventListener('submit',async e=>{e.preventDefault();const b=$('[type=submit]',bf),m=$('[data-billing-msg]',bf);m.textContent='';m.className='form-msg';b.disabled=true;
      try{const r=await api('/billing',{method:'PUT',body:{name:bf.name.value,company:bf.company.value,address:bf.address.value,email:bf.email.value,phone:bf.phone.value}});S.billing=r.billing;S.billingEdit=false;bf.dataset.dirty='';renderView();N.popup({icon:'check',title:'Billing details saved.'});}
      catch(ex){m.textContent=ex.message;m.className='form-msg err';b.disabled=false;}});}
    $('[data-unpaid]')?.addEventListener('toggle',e=>{S.unpaidOpen=e.target.open;});
    const monthly=$('#invoice-month-form');if(monthly)monthly.addEventListener('submit',async e=>{e.preventDefault();const msg=$('[data-month-msg]',monthly),b=$('[type=submit]',monthly);msg.textContent='';b.disabled=true;try{const r=await fetch('/api/portal/invoices/month?month='+encodeURIComponent(monthly.month.value),{credentials:'same-origin'});if(!r.ok)throw new Error(r.status===404?'No receipts for this month.':'Could not download the receipts.');const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='Direct-Line-receipts-'+monthly.month.value+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(ex){msg.textContent=ex.message;}finally{b.disabled=false;}});

    const f=$('#transfer-form'); if (!f) return;
    f.addEventListener('input',()=>{f.dataset.dirty='1';});
    f.addEventListener('submit',async e=>{
      e.preventDefault();const b=$('[type=submit]',f), m=$('[data-transfer-msg]',f), file=f.file.files[0];
      if (!file || !f.amount.value || !f.date.value) {m.textContent='Fill in the amount, date and confirmation file.';return;} if (file.size>2*1024*1024) {m.textContent='The file is too large. Maximum 2 MB.';return;}
      b.disabled=true;f.dataset.dirty='1';
      try {
        const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read the file.'));r.readAsDataURL(file);});
        const result=await api('/transfers',{method:'POST',body:{amount:Number(f.amount.value),date:f.date.value,file:{data,filename:file.name},orderIds:window.DLPayOrders.picked(f)}});
        f.dataset.dirty='';await refresh();N.popup({icon:'check',title:result.transfer.status==='pending' ? 'Confirmation sent for review.' : 'This confirmation is already on file.'});
      } catch(ex) {m.textContent=ex.message;b.disabled=false;}
    });
  }
  const homeRange=()=>window.DLClientStoreMath.periodRange(S.period,S.from,S.to)||window.DLClientStoreMath.periodRange('month');
  const inRange=(o,r)=>{const d=window.DLClientStoreMath.dateKey(o);return d>=r.from&&d<=r.to;};
  const storeOrders=()=>S.orders.filter(o=>!S.storeId||o.storeId===S.storeId);
  function storeSwitcher(){return `<div data-store-switcher>${S.stores.length>1?`<div class="chips store-switcher"><button class="chip${!S.storeId?' on':''}" type="button" data-select-store="0">All stores</button>${S.stores.map(s=>`<button class="chip${s.id===S.storeId?' on':''}" type="button" data-select-store="${s.id}">${window.DLClientStoreUI.label(s)}</button>`).join('')}<a class="chip" href="#/stores">+ Add store</a></div>`:''}</div>`;}
  function selectStore(id){S.storeId=Number(id)||0;store.set('dl-client-store-'+S.me.id,S.storeId);location.hash='#/'+S.route+(S.id?'/'+S.id:'')+'?store='+S.storeId;}
