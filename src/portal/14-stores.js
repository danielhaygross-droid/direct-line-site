  function viewStores(){return `${S.me.preview?'':`<section class="card card-pad">${window.DLClientStoreUI.form(null,S.me.id)}</section>`}${S.stores.map(s=>`<section class="card card-pad">${window.DLClientStoreUI.label(s)}${S.me.preview?'':window.DLClientStoreUI.form(s,S.me.id)}</section>`).join('')}`;}
  function bindStores(){
    for(const f of $$('[data-client-store-form]')){
      f.addEventListener('input',e=>{f.dataset.dirty='1';if(e.target.name==='color')f.dataset.colourEdited='1';});
      f.addEventListener('submit',async e=>{
        e.preventDefault();const b=$('[type=submit]',f),m=$('[data-store-msg]',f);
        if(b.disabled)return;
        b.disabled=true;f.dataset.dirty='1';m.textContent='Saving store...';
        try{
          const result=await api('/client-stores'+(f.dataset.clientStoreForm?'/'+f.dataset.clientStoreForm:''),{method:'POST',body:{name:f.storeName.value,platform:f.platform.value,link:f.link.value,color:f.dataset.clientStoreForm||f.dataset.colourEdited?f.color.value:undefined,archived:!!f.archived?.checked}});
          // Save succeeds independently of unrelated background requests. Keep other drafts.
          const drafts=$$('[data-client-store-form]').filter(other=>other!==f&&other.dataset.dirty).map(other=>({id:other.dataset.clientStoreForm,colourEdited:other.dataset.colourEdited,values:[...other.elements].filter(el=>el.name).map(el=>[el.name,el.type==='checkbox'?el.checked:el.value])}));
          S.stores=S.stores.filter(s=>s.id!==result.store.id).concat(result.store).sort((a,b)=>a.id-b.id);
          if(S.route==='stores'){
            renderView();
            for(const draft of drafts){
              const other=$$('[data-client-store-form]').find(el=>el.dataset.clientStoreForm===draft.id);if(!other)continue;
              for(const [name,value] of draft.values){const el=other.elements.namedItem(name);if(el.type==='checkbox')el.checked=value;else el.value=value;}
              other.dataset.dirty='1';if(draft.colourEdited)other.dataset.colourEdited='1';
            }
            const saved=$$('[data-client-store-form]').find(el=>el.dataset.clientStoreForm===String(result.store.id));
            if(saved)$('[data-store-msg]',saved).textContent='Store saved.';
          }
          N.popup({icon:'check',title:'Store saved.'});
        }catch(ex){m.textContent=ex.message;b.disabled=false;}
      });
    }
  }
  const claimStatus=s=>({open:'Open',approved:'Approved',rejected:'Rejected',resolved:'Resolved'}[s]||s);
  function claimCard(c){return c?`<section class="card card-pad"><h3 class="sec-title">Claim</h3><p><span>${claimStatus(c.status)}</span> · <span>${c.resolution==='refund'?'Refund':'Reshipment'}</span></p><p data-no-i18n>${esc(c.description)}</p>${c.reply?`<p><span>Admin reply</span>: <span data-no-i18n>${esc(c.reply)}</span></p>`:''}${c.reshipmentOrderId?`<button class="btn btn-sm" type="button" data-open-order="${c.reshipmentOrderId}">Open reshipment</button>`:''}${c.fileIds.map(id=>`<p><a href="/api/portal/files/${id}" target="_blank" rel="noopener">Open evidence</a></p>`).join('')}</section>`:'';}
  function showClaimForm(o){
    const lost=o.claimEligibility.lost,refund=lost||o.claimEligibility.refund;
    $('#claim-form')?.remove();const info=$('[data-d-info]',UI.getDrawer().body);info.insertAdjacentHTML('beforeend',`<section class="card card-pad"><form id="claim-form" class="form-grid" data-order-id="${o.id}"><h3 class="full">${lost?'Report lost parcel':'Report a problem'}</h3>${lost?'':`<p class="note full">${refund?`<b data-no-i18n>${o.claimEligibility.daysLeft}</b> <span>days left to choose a full refund or a reshipment</span>`:'Refunds are available within 7 days of delivery.'}</p><label class="field full"><span>Problem type</span><select name="problem"><option value="damaged">Damaged</option><option value="defective">Defective</option><option value="missing_parts">Missing parts</option><option value="wrong_item">Wrong item</option></select></label>`}<label class="field full"><span>Description</span><textarea name="description" maxlength="2000"${lost?'':' required'}></textarea></label><label class="field full"><span>Resolution</span><select name="resolution">${refund?'<option value="refund">Refund</option>':''}<option value="reshipment">Reshipment</option></select></label>${lost?'':`<label class="field full"><span>Photo or video of the problem</span><input name="proof" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required><small>Maximum 2 MB per file; 3 MB total.</small></label><label class="field full"><span>Photo of the shipping label</span><input name="label" type="file" accept="image/jpeg,image/png,image/webp" required></label>`}<button type="submit" class="btn btn-primary">Submit claim</button><p class="form-msg full" data-claim-msg></p></form></section>`);
    const f=$('#claim-form');f.dataset.dirty='1';f.scrollIntoView({block:'start',behavior:'smooth'});f.addEventListener('submit',async e=>{e.preventDefault();const b=$('[type=submit]',f),m=$('[data-claim-msg]',f);b.disabled=true;try{const read=async input=>{const file=input.files[0];if(!file)throw new Error('Add the required evidence files.');if(file.size>2*1024*1024)throw new Error('The file is too large. Maximum 2 MB.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});return{filename:file.name,data};};const body={problem:lost?'lost':f.problem.value,description:f.description.value,resolution:f.resolution.value};if(!lost){body.proof=await read(f.proof);body.label=await read(f.label);}await api('/orders/'+o.id+'/claims',{method:'POST',body});f.dataset.dirty='';await refresh();N.popup({icon:'check',title:'Claim submitted.'});}catch(ex){m.textContent=ex.message;b.disabled=false;}});
  }
  // Customer name, address, phone and country: editable by the client until the parcel ships.
  function showCustomerForm(o){
    $('#customer-form')?.closest('section')?.remove();
    const info=$('[data-d-info]',UI.getDrawer().body),running=o.status==='processing';
    info.insertAdjacentHTML('afterbegin',`<section class="card card-pad"><form id="customer-form" class="form-grid" novalidate><h3 class="full">Change customer details</h3>
      <p class="note full"><span>${running?'Your order is already in progress. Direct Line is told about the change and passes it on to the supplier. If the parcel is already packed, we will message you.':'Direct Line is told about the change straight away.'}</span> <span>You can change these until the parcel ships.</span></p>
      <label class="field full" data-f="buyerName"><span>Customer name</span><input name="buyerName" required maxlength="160" autocomplete="off" value="${esc(o.buyerName)}"></label>
      <label class="field full" data-f="address1"><span>Full address and phone <small>street, city, state, postal code, phone</small></span><textarea name="address1" required maxlength="2000" rows="4" autocomplete="off">${esc(UI.addressText(o))}</textarea></label>
      <label class="field full" data-f="destination"><span>Country</span><select name="destination" required autocomplete="off"></select></label>
      <label class="field full" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" autocomplete="off" placeholder="e.g. Sweden"></label>
      <label class="field full" data-f="taxNumber"><span>Tax number <small>optional · e.g. Etsy’s IOSS number on the order</small></span><input name="taxNumber" maxlength="300" autocomplete="off" data-no-i18n value="${esc(o?.taxNumber)}" placeholder="e.g. IOSS IM3720000224, EUR 72.37"></label><label class="field full" data-f="giftMessage"><span>Gift message <small>optional · the supplier adds it to the parcel</small></span><textarea name="giftMessage" maxlength="1000" rows="3" autocomplete="off" data-no-i18n>${esc(o?.giftMessage)}</textarea></label>
      <div class="full" style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn btn-primary">Save customer details</button><button type="button" class="btn" data-customer-cancel>Cancel</button></div>
      <p class="form-msg full" data-customer-msg role="alert"></p></form></section>`);
    const f=$('#customer-form'),dest=window.DL.destinationPicker(f.destination,$('[data-other-country]',f));dest.set(o.destination||'');
    f.dataset.dirty='1';f.scrollIntoView({block:'start',behavior:'smooth'});
    f.addEventListener('input',e=>{e.target.closest('[data-f]')?.classList.remove('bad');const m=$('[data-customer-msg]',f);if(m.classList.contains('err')){m.textContent='';m.className='form-msg full';}});
    f.addEventListener('submit',async e=>{
      e.preventDefault();const b=$('[type=submit]',f),m=$('[data-customer-msg]',f);if(b.disabled)return;
      const name=f.buyerName.value.trim(),address=f.address1.value.trim(),country=dest.get(),missing=[];
      for(const [key,ok,label] of [['buyerName',name,'customer name'],['address1',address,'full address'],['destination',country,'country']]){f.querySelector(`[data-f="${key}"]`)?.classList.toggle('bad',!ok);if(!ok)missing.push(label);}
      if(missing.length){m.textContent='Please fill in: '+missing.join(', ')+'.';m.className='form-msg full err';return;}
      b.disabled=true;m.textContent='';
      try{
        await api('/orders/'+o.id,{method:'PUT',body:{buyerName:name,...UI.addressFields(address,o),destination:country,taxNumber:f.taxNumber.value,giftMessage:f.giftMessage.value}});
        f.dataset.dirty='';await refresh();chatCtl?.reload?.();
        N.popup({icon:'check',title:'Customer details updated',text:running?'Direct Line has been told. If the parcel is already packed, we will message you.':'Direct Line has been told about the change.'},{duration:7000});
      }catch(ex){m.textContent=ex.message;m.className='form-msg full err';b.disabled=false;}
    });
  }
