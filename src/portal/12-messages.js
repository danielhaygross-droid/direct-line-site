  // ---------- messages ----------
  function viewMessages() {
    const list = S.orders.filter(o => o.messages > 0).sort((a, b) => (b.unreadMessages > 0) - (a.unreadMessages > 0) || (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    const open = S.orders.filter(o => o.status !== 'cancelled');
    return `<section class="card">
      ${list.length ? `<div class="convos">${list.map(o => `<button type="button" class="convo${o.unreadMessages ? ' unread' : ''}" data-open-order="${o.id}" data-focus="chat">
        <span class="ord-ic t-${o.status}">${ic('chat')}</span>
        <span style="min-width:0"><b>${esc(orderName(o))} ${UI.pill(o.status)}</b><p>${o.lastMessage ? (o.lastMessage.author === 'client' ? 'You: ' : 'Direct Line: ') + esc(o.lastMessage.body) : ''}</p></span>
        <aside><time>${o.lastMessageAt ? esc(ago(o.lastMessageAt)) : ''}</time>${o.unreadMessages ? `<span class="badge-new">${o.unreadMessages}</span>` : ''}</aside></button>`).join('')}</div>`
        : empty('chat', 'No conversations yet', 'Have a question about an order? Pick it below and send us a message.')}
      ${open.length ? `<div class="ask"><span class="muted" style="font-size:14px">Ask about an order:</span><select data-ask aria-label="Choose an order">${open.map(o => `<option value="${o.id}">${esc(orderName(o))} · ${esc(UI.LABEL[o.status])}</option>`).join('')}</select><button type="button" class="btn btn-primary" data-ask-go>${ic('chat')}Message us</button></div>` : ''}
    </section>`;
  }

