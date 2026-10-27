  // ---------- events ----------
  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-menu]')) { document.body.classList.toggle('menu-open'); return; }
    if (t.closest('[data-close-menu]')) { document.body.classList.remove('menu-open'); return; }
    if (t.closest('[data-logout]')) { logout(); return; }
    if (t.closest('[data-lang-toggle]')) { window.DLi18n?.setLang(window.DLi18n.lang === 'he' ? 'en' : 'he'); return; }
    if (t.closest('[data-theme-toggle]')) {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('dl_portal_theme', next); } catch (ex) { /* private mode */ }
      $$('[data-theme-toggle]').forEach(b => { b.innerHTML = ic(next === 'dark' ? 'sun' : 'moon'); });
      return;
    }
    if (t.closest('[data-open-bell]')) { e.stopPropagation(); panel.open(); return; }
    const st=t.closest('[data-select-store]');if(st){selectStore(st.dataset.selectStore);return;}
    const f = t.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; renderChips(); renderOrdersList(); return; }
    const gf = t.closest('[data-go-filter]'); if (gf) { S.filter = gf.dataset.goFilter; S.q = ''; go('orders'); return; }
    if (t.closest('[data-ask-go]')) { openOrder($('[data-ask]').value, 'chat'); return; }
    const productNote=t.closest('[data-product-note]');if(productNote){const note=noteItems().find(x=>x.id===productNote.dataset.note);if(note)markRead(note);showProduct(note?.productId);return;}
    const invoiceNote=t.closest('[data-invoice-note]');if(invoiceNote){const note=noteItems().find(x=>x.id===invoiceNote.dataset.note);if(note)markRead(note);go('payments');return;}
    const oo = t.closest('[data-open-order]');
    if (oo && !t.closest('a')) {
      const note = oo.dataset.note && noteItems().find(x => x.id === oo.dataset.note);
      if (note) markRead(note);
      openOrder(oo.dataset.openOrder, oo.dataset.focus);
    }
  }
  // The earnings block on Orders can be folded away; the choice is remembered on this device.
  document.addEventListener('toggle', e => { if (e.target.matches?.('[data-earn]')) store.set('dl-earn-open', e.target.open); }, true);
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-excel-export]'))exportOrdersToExcel();});
  // A "Sort" dropdown changed: remember it and redraw that list.
  document.addEventListener('change',e=>{const s=e.target.closest?.('[data-sort]');if(!s)return;setSort(s.dataset.sort,s.value);if(s.dataset.sort==='portal-orders')renderOrdersList();else if(s.dataset.sort==='portal-products'){const l=$('[data-plist]');if(l)l.innerHTML=productListHTML();}});
  document.addEventListener('change',e=>{const f=e.target.closest('[data-period-form]');if(!f)return;if(e.target.name==='period'){S.period=f.period.value;renderView();}else {S.from=f.from.value;S.to=f.to.value;if(window.DLClientStoreMath.periodRange('custom',S.from,S.to))renderView();}});
  document.addEventListener('submit',e=>{if(e.target.matches('[data-period-form]'))e.preventDefault();});
  document.addEventListener('input', e => { const f = e.target.closest?.('[data-rev-form]'); if (!f) return; e.target.closest('.field')?.classList.remove('bad'); const m = $('[data-rev-msg]', f); m.textContent = ''; m.className = 'form-msg'; });
  // Cost revision request: the competitor price is required (the server checks it too).
  document.addEventListener('submit', async e => {
    const f = e.target.closest('[data-rev-form]'); if (!f) return; e.preventDefault();
    const [kind, id] = f.dataset.revForm.split(':'), m = $('[data-rev-msg]', f), b = $('[type=submit]', f), v = Number(f.competitorPrice.value);
    if (!(v > 0)) { m.textContent = 'Enter the competitor price in USD (the price your listing is based on).'; m.className = 'form-msg err'; f.competitorPrice.closest('.field').classList.add('bad'); f.competitorPrice.focus(); return; }
    b.disabled = true; m.textContent = '';
    try {
      await api(`/${kind === 'order' ? 'orders' : 'products'}/${id}/cost-revision`, { method: 'POST', body: { competitorPrice: v, note: f.note.value } });
      const d = UI.getDrawer(); d.foot.dataset.confirm = ''; await refresh();
      if (kind === 'product') openProduct(id); else fillDrawer(S.orders.find(x => x.id === Number(id)));
      N.popup({ icon: 'check', title: 'Cost revision requested', text: 'We’ll check it with the supplier and let you know.' }, { duration: 6000 });
    } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; b.disabled = false; }
  });
  function onInput(e) { if (e.target.matches('[data-q]')) { S.q = e.target.value; renderOrdersList(); } }
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('tr[data-open-order]')) openOrder(e.target.dataset.openOrder); });
  // Paste a screenshot (Ctrl+V) anywhere on the order form to attach it. Normal text pasting into fields is left alone.
  document.addEventListener('paste', e => {
    const form = $('#order-form'); if (!form?._addFiles) return;
    const items = [...(e.clipboardData?.items || [])];
    const files = items.filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (!files.length) return;
    const typing = e.target.matches?.('input, textarea') && items.some(i => i.type === 'text/plain');
    if (typing) return;
    e.preventDefault(); form._addFiles(files);
  });
  // Drawer actions (the drawer lives outside #app).
  document.addEventListener('click', async e => {
    const t = e.target;
    const orderProduct = t.closest('[data-order-product]'); if (orderProduct) S.orderProduct = Number(orderProduct.dataset.orderProduct);
    if (t.closest('[data-close-drawer]')) { UI.getDrawer().close(); return; }
    const openP = t.closest('[data-open-product]'); if (openP && !t.closest('a')) { openProduct(openP.dataset.openProduct); return; }
    const cp = t.closest('[data-copy]');
    if (cp) {
      try {
        await navigator.clipboard.writeText(cp.dataset.copy);
        const before = cp.dataset.copyLabel ?? (cp.dataset.copyLabel = cp.innerHTML);
        cp.innerHTML = ic('check') + 'Copied';
        clearTimeout(cp._copyTimer); cp._copyTimer = setTimeout(() => { if (cp.isConnected) cp.innerHTML = before; }, 2000);
      } catch (ex) { /* no clipboard */ }
      return;
    }
    const changeCustomer=t.closest('[data-change-customer]');if(changeCustomer){const o=S.orders.find(o=>o.id===Number(changeCustomer.dataset.changeCustomer));if(o&&canChangeCustomer(o))showCustomerForm(o);return;}
    const cancelCustomer=t.closest('[data-customer-cancel]');if(cancelCustomer){$('#customer-form')?.closest('section')?.remove();refreshDrawer();return;}
    const report=t.closest('[data-report-claim]');if(report){const o=S.orders.find(o=>o.id===Number(report.dataset.reportClaim));if(o)showClaimForm(o);return;}
    // Marking delivered starts the claim window, so it is confirmed first (like a cancellation request).
    const delivered=t.closest('[data-delivered]');
    if(delivered){const foot=UI.getDrawer().foot;foot.dataset.confirm='1';foot.innerHTML=`<span style="font-weight:600">Has your customer received the parcel?</span><p class="muted" style="font-size:12px;margin:0">Only mark it as delivered once it has arrived.</p><span class="spacer"></span><button type="button" class="btn" data-keep>Not yet</button><button type="button" class="btn btn-primary" data-really-delivered="${delivered.dataset.delivered}">Yes, mark as delivered</button>`;return;}
    const reallyDelivered=t.closest('[data-really-delivered]');
    if(reallyDelivered){reallyDelivered.disabled=true;try{await api('/orders/'+reallyDelivered.dataset.reallyDelivered+'/mark-delivered',{method:'POST',body:{}});UI.getDrawer().foot.dataset.confirm='';await refresh();N.popup({icon:'check',title:'Marked as delivered'});}catch(ex){reallyDelivered.disabled=false;N.popup({icon:'alert',title:ex.message});}return;}
    const ar = t.closest('[data-ask-revision]'); if (ar) { const [k, id] = ar.dataset.askRevision.split(':'); revisionForm(k, id); return; }
    const c = t.closest('[data-cancel-order]');
    if (c) {
      const foot = UI.getDrawer().foot; foot.dataset.confirm = '1';
      foot.innerHTML = `<span style="font-weight:600">Request cancellation?</span><label class="field"><span>Reason <small>optional</small></span><input name="cancellationReason" maxlength="1000"></label><span class="spacer"></span><button type="button" class="btn" data-keep>Keep it</button><button type="button" class="btn btn-danger" data-really-cancel="${c.dataset.cancelOrder}">Send cancellation request</button>`;
      return;
    }
    if (t.closest('[data-keep]')) { const d = UI.getDrawer(); d.foot.dataset.confirm = ''; if (String(d.key).startsWith('p')) openProduct(String(d.key).slice(1)); else fillDrawer(S.orders.find(x => x.id === d.key)); return; }
    const rc = t.closest('[data-really-cancel]');
    if (rc) {
      rc.disabled = true;
      try {
        await api('/orders/' + rc.dataset.reallyCancel + '/request-cancellation', { method: 'POST', body: { reason: $('[name=cancellationReason]',UI.getDrawer().foot).value } });
        UI.getDrawer().foot.dataset.confirm = '';
        await refresh();
        N.popup({ icon: 'alert', tone: 'red', title: 'Cancellation requested' }, { duration: 5000 });
      } catch (ex) { rc.disabled = false; N.popup({ icon: 'alert', tone: 'red', title: 'Couldn’t request cancellation', text: ex.message }); }
    }
  });

  boot();
})();
