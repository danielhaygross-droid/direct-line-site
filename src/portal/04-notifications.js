  // ---------- notifications ----------
  const readKey = () => 'dl_portal_read_' + S.me.id, badgeKey = () => 'dl_portal_badge_' + S.me.id;
  let readIds = null;
  const reads = () => (readIds ||= new Set(store.get(readKey(), [])));
  function noteItem(e) {
    const o = S.orders.find(x => x.id === e.orderId), ref = e.orderRef || (o ? orderName(o) : '#' + e.orderId);
    const base = { id: 'n' + e.id, orderId: e.orderId, time: e.createdAt * 1000, action: 'View order' };
    let it;
    if(e.kind==='product')it={...base,product:true,action:'View products',icon:'order',tone:'gold',title:'Product quote updated',text:e.productName};
    else if (e.kind === 'invoice') { const [amt, day] = String(e.detail || '').split('|'); it = {...base, invoice:true, action:'View payments', icon:'wallet',tone:'mint',title:'New receipt',text:day ? `For your ${money(amt)} payment of ${window.DLPayOrders.day(day)}` : e.detail}; }
    else if(e.kind==='claim')it={...base,icon:'alert',tone:'gold',title:'Claim updated',text:ref};
    else if (e.kind === 'status') {
      const words = { processing: 'We’re working on it now.', shipped: 'It’s on its way to your customer.', delivered: 'It was delivered to your customer.', cancelled: 'This order was cancelled.', pending: 'It’s back to pending.' };
      it = { ...base, icon: e.detail === 'cancelled' ? 'alert' : e.detail === 'delivered' ? 'check' : 'status', tone: { processing: 'blue', shipped: 'gold', delivered: 'mint', cancelled: 'red' }[e.detail] || 'orange', title: `${ref} is now ${e.detail}`, text: words[e.detail] || '' };
    } else if (e.kind === 'billed') it = { ...base, icon: 'wallet', tone: 'gold', title: 'Order billed', text: `${ref} · ${money(e.detail)}` };
    else if (e.kind === 'tracking') it = { ...base, icon: 'status', tone: 'mint', title: 'Tracking number added', text: `${ref} · ${e.detail}` };
    else if (e.kind === 'message') it = { ...base, icon: 'message', tone: 'blue', focus: 'chat', action: 'Reply', title: 'Direct Line replied', text: `${ref}: ${e.detail}` };
    else if (e.kind === 'created') it = { ...base, icon: 'order', tone: 'gold', title: 'We added an order for you', text: ref };
    else if (e.kind === 'photo') it = { ...base, icon: 'edit', tone: 'orange', title: e.detail === 'removed' ? 'We removed a product photo' : 'We added a product photo', text: ref };
    else it = { ...base, icon: 'edit', tone: 'orange', title: 'We updated your order', text: ref };
    it.unread = it.time > S.seenAt * 1000 && !reads().has(it.id);
    return it;
  }
  const noteItems = () => S.notes.map(noteItem);
  function markRead(x) { reads().add(x.id); store.set(readKey(), [...reads()].slice(-300)); updateChrome(); }
  let panel;

