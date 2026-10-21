  // ---------- data ----------
  let known = null;
  async function refresh(first) {
    if (S.me?.termsRequired) return false;
    const me = await api('/me');
    if (me.termsRequired) { S.me = { ...S.me, ...me }; await termsScreen(); return false; }
    const [o, p, n, products, claims, stores] = await Promise.all([api('/orders'), api('/payments'), api('/notifications').catch(() => null),api('/products'),api('/claims'),api('/client-stores')]);
    S.me = { ...S.me, ...me }; S.orders = o.orders; S.payments = p.payments; S.transfers = p.transfers || []; S.adjustments = p.adjustments || []; S.invoices=p.invoices || []; S.billing=p.billing || null; S.products=products.products || [];S.claims=claims.claims || [];S.stores=stores.stores || [];if(first)S.storeId=Number(store.get('dl-client-store-'+S.me.id,0));if(S.storeId&&!S.stores.some(s=>s.id===S.storeId))S.storeId=0;
    if (!first && S.route === 'edit' && !S.orders.some(o => o.id === S.id && editable(o))) { go('orders'); N.popup({ icon: 'alert', title: 'This order is already being processed. Need a change? Send us a message.' }); }
    if (n) { S.notes = n.items; S.seenAt = n.seenAt; }
    const fresh = known ? S.notes.filter(x => !known.has(x.id)) : [];
    known = new Set(S.notes.map(x => x.id));
    updateChrome();
    if (!first) {
      if (S.route !== 'new' && S.route !== 'edit') renderView(true);
      refreshDrawer();
      fresh.slice(0, 3).reverse().map(noteItem).filter(x => x.unread)
        .forEach(x => N.popup(x, { onClick: () => { markRead(x); x.product ? go('products') : x.invoice ? go('payments') : openOrder(x.orderId, x.focus); }, duration: 10000 }));
    }
  }

