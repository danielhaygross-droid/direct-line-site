  // ---------- events ----------
  async function setStatus(id, status, el) {
    if (el) el.disabled = true;
    try { await api('/orders/' + id, { method: 'PUT', body: { status } }); await loadAll(); renderList(); refreshDrawer(); toast(`Status set to ${UI.LABEL[status]}. The client sees it right away.`); }
    catch (ex) { toast(ex.message); if (el) el.disabled = false; }
  }
  function onClick(e) {
    const t = e.target;
    const st=t.closest('[data-admin-select-store]');if(st&&S.drawer?.kind==='client'){S.drawer.storeId=Number(st.dataset.adminSelectStore);fillClient(clientOf(S.drawer.id));return;}
    const cf=t.closest('[data-claim-filter]');if(cf){S.claimFilter=cf.dataset.claimFilter;renderClaims();return;}
    const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const gt = t.closest('[data-go-tab]'); if (gt) { S.tab = gt.dataset.goTab; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const gf = t.closest('[data-go-filter]'); if (gf) { S.filter = gf.dataset.goFilter; S.tab = 'orders'; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const f = t.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; renderOrders(); return; }
    const ea=t.closest('[data-edit-admin]');
    if(ea){
      const x=S.ov.admins.find(a=>a.id===Number(ea.dataset.editAdmin)),row=ea.parentElement;if(!x)return;
      if(row.nextElementSibling?.matches('[data-admin-form]')){row.nextElementSibling.remove();return;}
      row.insertAdjacentHTML('afterend',`<form class="form-grid" data-admin-form="${x.id}" novalidate style="padding:12px;border:1px solid var(--line);border-radius:12px">
        <label class="field"><span>Name</span><input name="name" maxlength="120" value="${esc(x.name)}"></label>
        <label class="field"><span>Username</span><input name="username" maxlength="60" autocomplete="off" data-no-i18n value="${esc(x.username)}"></label>
        <label class="field"><span>Status</span><select name="active"><option value="true"${x.active?' selected':''}>Active</option><option value="false"${x.active?'':' selected'}>Disabled (can’t sign in)</option></select></label>
        <label class="field"><span>New password <small>leave empty to keep the current one</small></span><input name="password" type="password" maxlength="128" autocomplete="new-password"></label>
        <p class="note full" style="margin:0">A disabled admin can’t sign in again. If they are signed in right now, they stay signed in until that session ends.</p>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save admin</button><button type="button" class="btn" data-admin-cancel>Cancel</button><p class="form-msg" data-admin-msg style="margin:0"></p></div></form>`);
      row.nextElementSibling.querySelector('[name=name]').focus();return;
    }
    if(t.closest('[data-admin-cancel]')){t.closest('[data-admin-form]').remove();return;}
    const acc = t.closest('[data-add-account]'); if (acc) { openAddAccount(acc.dataset.addAccount); return; }
    const no = t.closest('[data-new-order]'); if (no) { openOrderForm(null, no.dataset.newOrder); return; }
    const rs = t.closest('[data-restore]');
    if (rs) { setArchived(Number(rs.dataset.restore), false, rs); return; }
    const bk = t.closest('[data-bulk]'); if (bk) { runBulk(bk.dataset.bulk, bk); return; }
    if (t.closest('select') || t.closest('[data-bulk-bar]') || t.closest('td.pick, th.pick')) return;
    const oc = t.closest('[data-open-client]'); if (oc) { openClient(oc.dataset.openClient); return; }
    const oo = t.closest('[data-open-order]'); if (oo) openOrder(oo.dataset.openOrder);
  }
  async function setArchived(id, archived, el) {
    if (el) el.disabled = true;
    try {
      await api('/admin/users/' + id, { method: 'POST', body: { archived } });
      tell({ type: 'dl-clients-changed' });
      if (archived) UI.getDrawer().close();
      await loadAll(); renderList();
      toast(archived ? 'Client archived. Their orders and payments no longer count in the totals.' : 'Client restored.');
    } catch (ex) { toast(ex.message); if (el) el.disabled = false; }
  }
  function onInput(e) {
    if (e.target.matches('[data-q]')) { S.q = e.target.value; renderOrders(); }
    if (e.target.matches('[data-cq]')) { S.cq = e.target.value; renderClients(); }
  }
  function onChange(e) {
    if (e.target.matches('[data-client-filter]')) { S.client = e.target.value; renderOrders(); }
    if (e.target.matches('[data-status]')) setStatus(e.target.dataset.status, e.target.value, e.target);
    if (e.target.matches('[data-pick]')) { const id = Number(e.target.dataset.pick); if (e.target.checked) S.picked.add(id); else S.picked.delete(id); renderOrders(); }
    if (e.target.matches('[data-pick-all]')) { $$('[data-pick]').forEach(c => { const id = Number(c.dataset.pick); if (e.target.checked) S.picked.add(id); else S.picked.delete(id); }); renderOrders(); }
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const row = e.target.closest?.('tr[data-open-order], tr[data-open-client]');
    if (row) { if (row.dataset.openOrder) openOrder(row.dataset.openOrder); else openClient(row.dataset.openClient); }
  });
  // Admins can add product photos to an order (e.g. when a client sends them on WhatsApp).
  document.addEventListener('change', async e => {
    const inp = e.target.closest?.('[data-photo-add]'); if (!inp) return;
    const id = Number(inp.dataset.photoAdd), files = [...inp.files]; inp.value = '';
    if (!files.length) return;
    const box = inp.closest('.pm-add'); box?.classList.add('busy');
    let added = 0, err = '';
    for (const f of files) {
      try { await api(`/orders/${id}/photos`, { method: 'POST', body: await shrinkImage(f) }); added++; }
      catch (ex) { err = ex.message; }
    }
    await loadAll(); renderList(); refreshDrawer();
    toast(added ? `${added} photo${added > 1 ? 's' : ''} added.` + (err ? ' ' + err : '') : err || 'No photo added.');
  });
  // Clicks inside the side panel (it lives outside #app), plus copy buttons anywhere.
  document.addEventListener('click', async e => {
    const t = e.target, d = UI.getDrawer();
    const reset = t.closest('[data-reset-password]');
    if (reset) {
      reset.disabled = true;
      const result = $('[data-reset-result]'); result.textContent = '';
      api('/admin/users/' + reset.dataset.resetPassword + '/reset-password', { method: 'POST' }).then(r => {
        result.innerHTML = `<p>Temporary password — shown only here. Copy and share it privately.</p><div class="copy-line"><input type="text" readonly data-no-i18n value="${esc(r.temporaryPassword)}" aria-label="Temporary password"><button type="button" class="btn btn-sm" data-copy="${esc(r.temporaryPassword)}">Copy</button></div><p>The client must choose a new password at next login.</p>`;
      }).catch(ex => { result.textContent = ex.message; reset.disabled = false; });
      return;
    }

    const cp = t.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Copied.'); } catch (ex) { /* no clipboard */ } return; }
    if (!d.el.contains(t)) return;
    if (t.closest('[data-close-drawer]')) { d.close(); return; }
    if (t.closest('[data-back]') && S.drawer?.back) { openClient(S.drawer.back); return; }
    const pr = t.closest('[data-photo-remove]');
    if (pr) {
      if (!pr.dataset.armed) { pr.dataset.armed = '1'; pr.classList.add('confirm'); pr.textContent = 'Remove?'; setTimeout(() => { if (pr.isConnected) { delete pr.dataset.armed; pr.classList.remove('confirm'); pr.textContent = '×'; } }, 4000); return; }
      pr.disabled = true;
      try { await api(`/orders/${pr.dataset.order}/photos/${pr.dataset.photoRemove}/delete`, { method: 'POST' }); await loadAll(); renderList(); refreshDrawer(); toast('Photo removed.'); }
      catch (ex) { pr.disabled = false; toast(ex.message); }
      return;
    }
    if(t.closest('[data-cancel-four]')){$('[name=cancellationFee]').value='4';return;}
    const ep=t.closest('[data-edit-payment]');
    if(ep){
      const p=payments.find(x=>x.id===Number(ep.dataset.editPayment)),row=ep.closest('tr');if(!p)return;
      if(row.nextElementSibling?.matches('[data-payment-edit-row]')){row.nextElementSibling.remove();return;}
      const base=['Bank transfer','PayPal','Wise','Other'],list=!p.method||base.includes(p.method)?base:[p.method,...base];
      row.insertAdjacentHTML('afterend',`<tr data-payment-edit-row="${p.id}"><td colspan="5"><form class="form-grid" data-payment-edit-form="${p.id}" novalidate>
        <label class="field"><span>Amount received</span><span class="money"><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${Number(p.amount).toFixed(2)}"></span></label>
        <label class="field"><span>Date</span><input name="paidAt" type="date" value="${new Date(p.paidAt*1000).toISOString().slice(0,10)}"></label>
        <label class="field"><span>Method</span><select name="method">${list.map(m=>`<option value="${esc(m)}"${m===p.method?' selected':''}>${esc(m)}</option>`).join('')}</select></label>
        <label class="field"><span>Note <small>optional</small></span><input name="note" maxlength="500" value="${esc(p.note)}"></label>
        <div class="field full"><span>Orders this payment is for <small>tick the orders the money is for</small></span>${poList(p.clientId, { paymentId: p.id, checked: p.orderIds || [], amount: p.amount })}</div>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save payment</button><button type="button" class="btn" data-payment-edit-cancel>Cancel</button><p class="form-msg" data-payment-edit-msg style="margin:0"></p></div></form></td></tr>`);
      row.nextElementSibling.querySelector('[name=amount]').focus();return;
    }
    if(t.closest('[data-payment-edit-cancel]')){t.closest('tr').remove();return;}
    if(t.closest('[data-cancel-four-direct]')){$('[name=directCancelFee]').value='4';return;}
    const direct=t.closest('[data-cancel-direct]');
    if(direct){
      if(!direct.dataset.armed){direct.dataset.armed='1';direct.textContent='Click again to cancel';setTimeout(()=>{if(direct.isConnected){delete direct.dataset.armed;direct.textContent='Cancel this order';}},4000);return;}
      if(direct.disabled)return;direct.disabled=true;
      try{await api('/orders/'+direct.dataset.cancelDirect,{method:'PUT',body:{status:'cancelled',fee:$('[name=directCancelFee]').value}});await loadAll();renderList();refreshDrawer();toast('Order cancelled. The client sees it right away.');}
      catch(ex){toast(ex.message);direct.disabled=false;}
      return;
    }
    const decision=t.closest('[data-cancel-decision]');
    if(decision){decision.disabled=true;try{await api('/orders/'+decision.dataset.id+'/'+decision.dataset.cancelDecision+'-cancellation',{method:'POST',body:{fee:$('[name=cancellationFee]').value}});await loadAll();renderList();refreshDrawer();toast('Cancellation request updated.');}catch(ex){decision.disabled=false;toast(ex.message);}return;}
    const tracking=t.closest('[data-tracking-update]');if(tracking){tracking.disabled=true;try{await api('/admin/orders/'+tracking.dataset.trackingUpdate+'/tracking-update',{method:'POST',body:{}});await loadAll();refreshDrawer();toast('Tracking update recorded.');}catch(ex){tracking.disabled=false;toast(ex.message);}return;}
    const ss = t.closest('[data-set-status]'); if (ss) { if (!ss.classList.contains('on')) setStatus(ss.dataset.id, ss.dataset.setStatus, ss); return; }
    const eo = t.closest('[data-edit-order]'); if (eo) { openOrderForm(S.orders.find(o => o.id === Number(eo.dataset.editOrder))); return; }
    const no = t.closest('[data-new-order]'); if (no) { openOrderForm(null, no.dataset.newOrder); return; }
    const oc = t.closest('[data-open-client]'); if (oc) { openClient(oc.dataset.openClient); return; }
    const oo = t.closest('[data-open-order]'); if (oo) { openOrder(oo.dataset.openOrder, null, oo.dataset.back ? Number(oo.dataset.back) : null); return; }
    const ct = t.closest('[data-ctab]'); if (ct) { S.drawer.tab = ct.dataset.ctab; S.drawer.last = { ...S.drawer.last, [groupOf(ct.dataset.ctab)]: ct.dataset.ctab }; fillClient(clientOf(S.drawer.id)); if (ct.dataset.ctab==='payments') await loadPayments(S.drawer.id); if (ct.dataset.ctab==='prices') await loadSavedPrices(S.drawer.id); if (ct.dataset.ctab==='activity') await loadActivity(S.drawer.id); return; }
    const fp = t.closest('[data-forget-price]');
    if (fp) {
      if (!fp.dataset.armed) { fp.dataset.armed = '1'; fp.textContent = 'Click again to forget'; setTimeout(() => { if (fp.isConnected) { delete fp.dataset.armed; fp.textContent = 'Forget'; } }, 4000); return; }
      fp.disabled = true;
      try { await api('/admin/saved-prices/' + fp.dataset.forgetPrice + '/forget', { method: 'POST', body: {} }); toast('Saved price forgotten. The next order like this is priced by the supplier again.'); await loadSavedPrices(S.drawer.id); }
      catch (ex) { toast(ex.message); fp.disabled = false; }
      return;
    }
    const ao = t.closest('[data-archive-order],[data-restore-order]');
    if (ao) {
      const archived = !!ao.dataset.archiveOrder, id = Number(ao.dataset.archiveOrder || ao.dataset.restoreOrder);
      if (archived && !ao.dataset.armed) { ao.dataset.armed='1';ao.textContent='Click again to archive';setTimeout(()=>{if(ao.isConnected){delete ao.dataset.armed;ao.textContent='Archive order';}},4000);return; }
      ao.disabled=true;
      try { await api('/admin/orders/'+id+'/archive',{method:'POST',body:{archived}});UI.getDrawer().close();await loadAll();renderList();tell({type:'dl-clients-changed'});toast(archived ? 'Order archived. Billing history is preserved.' : 'Order restored.'); }
      catch(ex){toast(ex.message);ao.disabled=false;}
      return;
    }
    const caf = t.closest('[data-clear-addr-flag]');
    if (caf) {
      caf.disabled = true;
      try { await api('/orders/' + caf.dataset.clearAddrFlag, { method: 'PUT', body: { clearAddressFlag: true } }); await loadAll(); refreshDrawer(); toast('Address warning cleared.'); }
      catch (ex) { toast(ex.message); caf.disabled = false; }
      return;
    }
    const ar = t.closest('[data-archive]');
    if (ar) {
      if (!ar.dataset.armed) { ar.dataset.armed = '1'; ar.textContent = 'Click again to archive'; setTimeout(() => { if (ar.isConnected) { delete ar.dataset.armed; ar.textContent = 'Archive client'; } }, 4000); return; }
      setArchived(Number(ar.dataset.archive), true, ar); return;
    }
    const record=t.closest('[data-record-transfer]'), restore=t.closest('[data-restore-payment]');
    if (record) { S.drawer.transferId=Number(record.dataset.recordTransfer); fillClient(clientOf(S.drawer.id), false); setTimeout(()=>$('[data-pay-card]')?.scrollIntoView({behavior:'smooth',block:'start'}),50); return; }
    if (t.closest('[data-transfer-cancel]')) { delete S.drawer.transferId; fillClient(clientOf(S.drawer.id), false); return; }
    if (restore) {
      const b=restore;b.disabled=true;
      try { const r=await api('/admin/payments/'+restore.dataset.restorePayment+'/restore',{method:'POST'}); await loadAll();renderList();await loadPayments(S.drawer.id);toast(r.dropped ? `Payment restored. ${r.dropped} of its orders were already paid by another payment and were taken off it.` : 'Payment restored.'); }
      catch(ex) {toast(ex.message);b.disabled=false;} return;
    }
    const dp = t.closest('[data-del-payment]');
    if (dp) {
      if (!dp.dataset.armed) { dp.dataset.armed = '1'; dp.textContent = 'Click again to archive'; setTimeout(() => { if (dp.isConnected) { delete dp.dataset.armed; dp.textContent = 'Archive payment'; } }, 4000); return; }
      if (dp.disabled) return; dp.disabled = true;
      try { await api('/admin/payments/' + dp.dataset.delPayment + '/delete', { method: 'POST' }); await loadAll(); renderList(); await loadPayments(S.drawer.id); toast('Payment archived.'); }
      catch (ex) { toast(ex.message); dp.disabled = false; }
    }
  });
  document.addEventListener('submit', async e => {
    const pe = e.target.closest('[data-payment-edit-form]');
    if (pe) {
      e.preventDefault();
      const b = $('[type=submit]', pe), m = $('[data-payment-edit-msg]', pe); if (b.disabled) return; b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      const p = payments.find(x => x.id === Number(pe.dataset.paymentEditForm)), listed = new Set([...pe.querySelectorAll('[name=poOrder]')].map(i => Number(i.value)));
      const orderIds = [...PO.picked(pe), ...(p?.orderIds || []).filter(id => !listed.has(id))];
      try { await api('/admin/payments/' + pe.dataset.paymentEditForm, { method: 'POST', body: { amount: pe.amount.value, paidAt: pe.paidAt.value, method: pe.method.value, note: pe.note.value, orderIds } }); pe.closest('tr').remove(); document.activeElement?.blur(); await loadAll(); renderList(); await loadPayments(S.drawer.id); toast('Payment updated.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const adf = e.target.closest('[data-admin-form]');
    if (adf) {
      e.preventDefault();
      const b = $('[type=submit]', adf), m = $('[data-admin-msg]', adf); if (b.disabled) return; m.textContent = ''; m.className = 'form-msg';
      if (adf.password.value && adf.password.value.length < 8) { m.textContent = 'Password must be at least 8 characters'; m.className = 'form-msg err'; return; }
      b.disabled = true;
      try { await api('/admin/users/' + adf.dataset.adminForm, { method: 'POST', body: { name: adf.name.value, username: adf.username.value.trim(), active: adf.active.value === 'true', ...(adf.password.value ? { password: adf.password.value } : {}) } }); adf.remove(); document.activeElement?.blur(); await loadAll(); renderList(); toast('Admin saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const ff = e.target.closest('[data-fees-form]');
    if (ff) {
      e.preventDefault();
      const b = $('[type=submit]', ff), m = $('[data-fees-msg]', ff); if (b.disabled) return; b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      try { await api('/orders/' + ff.dataset.feesForm, { method: 'PUT', body: { commission: ff.commission.value } }); document.activeElement?.blur(); await loadAll(); renderKpis(); renderList(); refreshDrawer(); toast('Fee saved for this order.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const tf = e.target.closest('[data-track-form]');
    if (tf) {
      e.preventDefault();
      const b = $('[type=submit]', tf); if (b.disabled) return; b.disabled = true;
      try { await api('/orders/' + tf.dataset.trackForm, { method: 'PUT', body: { trackingNumber: tf.trackingNumber.value, courier: tf.courier.value } }); document.activeElement?.blur(); await loadAll(); renderList(); refreshDrawer(); toast('Tracking saved. The client can see it now.'); }
      catch (ex) { toast(ex.message); }
      finally { b.disabled = false; }
      return;
    }
    const storeForm=e.target.closest('[data-client-store-form]');if(storeForm){e.preventDefault();const sf=storeForm,b=$('[type=submit]',sf),m=$('[data-store-msg]',sf);b.disabled=true;try{await api('/admin/client-stores'+(sf.dataset.clientStoreForm?'/'+sf.dataset.clientStoreForm:''),{method:'POST',body:{clientId:Number(sf.dataset.clientId),name:sf.storeName.value,platform:sf.platform.value,link:sf.link.value,color:sf.dataset.clientStoreForm||sf.dataset.colourEdited?sf.color.value:undefined,archived:!!sf.archived?.checked}});document.activeElement?.blur();await loadAll();refreshDrawer();toast('Store saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const cd=e.target.closest('[data-claim-decision]');if(cd){e.preventDefault();const b=$('[type=submit]',cd),m=$('[data-claim-msg]',cd);b.disabled=true;try{await api('/admin/claims/'+cd.dataset.claimDecision,{method:'POST',body:{status:cd.status.value,reply:cd.reply.value}});document.activeElement?.blur();await loadAll();if(S.tab==='claims')renderClaims();else refreshDrawer();toast('Claim decision saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const pq=e.target.closest('[data-product-quote]');if(pq){e.preventDefault();const b=$('[type=submit]',pq),m=$('[data-quote-msg]',pq);b.disabled=true;try{await api('/admin/products/'+pq.dataset.productQuote,{method:'POST',body:{status:pq.status.value,unitPrice:pq.unitPrice.value,shipping:pq.shipping.value,note:pq.note.value}});document.activeElement?.blur();await loadAll();if(S.tab==='products')renderProducts();else refreshDrawer();toast('Quote saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const inf=e.target.closest('[data-invoice-form]');
    if(inf){e.preventDefault();const b=$('[type=submit]',inf),m=$('[data-invoice-msg]',inf);b.disabled=true;try{const file=await invoiceFile(inf);if(!file)throw new Error('Choose an invoice file.');await api('/admin/invoices',{method:'POST',body:{clientId:Number(inf.dataset.invoiceForm),orderIds:inf.dataset.orderId?[Number(inf.dataset.orderId)]:PO.picked(inf),paymentId:inf.invoicePayment?.value||null,date:inf.invoiceDate.value,file}});document.activeElement?.blur();inf.reset();invoiceFiles=(await api('/admin/invoices?clientId='+inf.dataset.invoiceForm)).invoices;refreshDrawer();toast('Invoice uploaded.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const abf = e.target.closest('[data-admin-billing]');
    if (abf) {
      e.preventDefault();
      const b = $('[type=submit]', abf), m = $('[data-billing-msg]', abf); if (b.disabled) return; b.disabled = true; m.textContent = ''; m.className = 'form-msg';
      try { const r = await api('/admin/billing/' + abf.dataset.adminBilling, { method: 'POST', body: { name: abf.name.value, company: abf.company.value, address: abf.address.value, email: abf.email.value, phone: abf.phone.value } }); billing = r.billing; delete abf.dataset.dirty; document.activeElement?.blur(); fillClient(clientOf(Number(abf.dataset.adminBilling)), false); toast('Billing details saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
      return;
    }
    const pf = e.target.closest('[data-pay-form]');
    if (pf) {
      e.preventDefault();
      const m = $('[data-pay-msg]');
      try {
        const b=$('[type=submit]',pf);if(b.disabled)return;b.disabled=true;
        const file=await invoiceFile(pf);
        let invoiceError='';
        // The ticked orders go with the payment; a transfer confirmation is recorded through its own route (credited once).
        const orderIds=PO.picked(pf), body={ amount: pf.amount.value, method: pf.method.value, note: pf.note.value, paidAt: pf.paidAt.value, orderIds };
        const paymentId=pf.dataset.transfer ? (await api('/admin/transfers/'+pf.dataset.transfer+'/record',{method:'POST',body})).transfer?.paymentId : (await api('/admin/payments', { method: 'POST', body: { clientId: Number(pf.dataset.payForm), ...body } })).id;
        if(file){try{await api('/admin/invoices',{method:'POST',body:{clientId:Number(pf.dataset.payForm),paymentId,orderIds,date:pf.paidAt.value,file}});}catch(ex){invoiceError='Payment recorded; invoice upload failed. Use Save invoice to retry. '+ex.message;}}
        delete S.drawer.transferId; delete pf.dataset.dirty; document.activeElement?.blur();pf.reset(); await loadAll(); renderList(); await loadPayments(Number(pf.dataset.payForm)); refreshDrawer(); toast(invoiceError||(orderIds.length ? `Payment recorded for ${orderIds.length} order${orderIds.length === 1 ? '' : 's'}.` : 'Payment recorded.'));
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err';$('[type=submit]',pf).disabled=false; }
      return;
    }
    const sf = e.target.closest('[data-sub-form]');
    if (sf) {
      e.preventDefault();
      const m = $('[data-sub-msg]');
      const body = { subStatus: sf.subStatus.value, trialStart: sf.trialStart.value, trialEnd: sf.trialEnd.value, subLastPayment: sf.subLastPayment.value };
      try { await api('/admin/users/' + sf.dataset.subForm, { method: 'POST', body }); document.activeElement?.blur(); await loadAll(); renderList(); fillClient(clientOf(sf.dataset.subForm)); toast('Subscription saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      return;
    }
    const af = e.target.closest('[data-account-form]');
    if (af) {
      e.preventDefault();
      const m = $('[data-account-msg]'), body = { name: af.name.value, username: af.username.value.trim(), active: af.active.value === 'true', commissionPerOrder: af.commissionPerOrder.value === '' ? null : af.commissionPerOrder.value, applyFeeTo: af.applyFeeTo.value };

      try { const r = await api('/admin/users/' + af.dataset.accountForm, { method: 'POST', body }); document.activeElement?.blur(); tell({ type: 'dl-clients-changed' }); await loadAll(); renderList(); fillClient(clientOf(af.dataset.accountForm)); toast(body.applyFeeTo !== 'new' ? `Account saved. Fee updated on ${r.ordersUpdated ?? 0} existing orders.` : 'Account saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
    }
  });
  function onParentMessage(e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const m = e.data || {};
    if (m.type === 'dl-open-client' && clientOf(m.id)) openClient(m.id);
    if (m.type === 'dl-add-admin') openAddAccount('admin');
    if (m.type === 'dl-set-tab' && ['overview', 'orders', 'clients', 'settings'].includes(m.tab) && m.tab !== S.tab) { S.tab = m.tab; if (S.ov) renderTab(); }
    if(m.type==='dl-open-products'){S.tab='products';loadAll().then(renderTab);return;}
    if (m.type === 'dl-open-order') {
      const go = () => { if (S.orders.some(o => o.id === m.id)) openOrder(m.id, m.focus); };
      if (S.orders.some(o => o.id === m.id)) go(); else loadAll().then(() => { renderList(); go(); });
    }
  }

  boot();
})();
