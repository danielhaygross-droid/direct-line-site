  // ---------- home ----------
  function viewHome() {
    const me = S.me, range=homeRange(), stats=window.DLClientStoreMath.performance(S.stores,S.orders,S.adjustments,range),selected=S.storeId?stats.rows.find(s=>s.id===S.storeId):stats.totals, s={...me.summary,orders:selected?.orders||0,billed:selected?.billed||0,clientProfit:selected?.profit||0};
    const h = new Date().getHours(), hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    // "In progress" and "latest orders" describe the account now, not the selected period: an order sent last
    // month that is still being processed counts, and older orders are never shown as "no orders yet".
    const all = storeOrders(), active = all.filter(inProgress).length;
    const credit = s.outstanding < 0;
    const items = noteItems().filter(x=>(!S.storeId||S.orders.some(o=>o.id===x.orderId&&o.storeId===S.storeId)) && x.time/1000>=Date.parse(range.from+'T00:00:00Z')/1000 && x.time/1000<Date.parse(range.to+'T23:59:59Z')/1000).slice(0,6);
    const newbie = me.summary.orders < 3;
    return `
      <section class="hello"><div><h2>${hello}, <span>${esc((me.name || '').split(' ')[0] || me.username)}</span></h2><p>${all.length ? `You have ${active} order${active === 1 ? '' : 's'} in progress.` : 'Send us your first order to get started.'}</p></div>
        <div class="hello-actions"><a class="btn btn-primary btn-big" href="#/new">${ic('plus')}Send a new order</a></div></section>
      ${window.DLClientStoreUI.periodFields(S.period,S.from,S.to)}
      ${!S.storeId&&S.stores.length>1?`<section class="card card-pad"><h3 class="sec-title">Performance by store</h3>${window.DLClientStoreUI.table(stats)}</section>`:''}
      ${subBanner(me.subscription)}
      ${newbie ? `<section class="card card-pad how"><h3>How it works</h3>
        <ol class="how-steps">
          <li><b>1</b><div><strong>Send us the order</strong><span>Had a sale in your store? Click “Send a new order” and fill in what your customer bought and where to ship it.</span></div></li>
          <li><b>2</b><div><strong>We pack and ship it</strong><span>We buy the product, ship it to your customer and add the tracking number here.</span></div></li>
          <li><b>3</b><div><strong>Pay your balance</strong><span>We add the order total to your balance. Payment by bank transfer.</span></div></li>
        </ol>
        <div class="how-actions"><a class="btn btn-primary btn-big" href="#/new">${ic('plus')}Send a new order</a></div></section>` : ''}
      ${statCardsHTML()}
      <div class="home-grid">
        <section class="card span2"><div class="card-head"><h3>Your latest orders</h3><a class="link" href="#/orders">See all ${all.length ? '(' + all.length + ')' : ''}</a></div>
          ${all.length ? `<div class="table-wrap">${ordersTable(all.slice(0, 5), true)}</div>` : empty('orders', 'No orders yet', 'When you get a sale in your store, send it to us here. We take care of the rest.', '<a class="btn btn-primary" href="#/new">Send a new order</a>')}
        </section>
        <section class="card"><div class="card-head"><h3>Latest updates</h3><button type="button" class="link" data-open-bell>See all</button></div>
          ${items.length ? `<div class="feed">${items.map(x => `<button type="button" class="${x.unread ? 'unread' : ''}" ${x.product ? 'data-product-note="1"' : x.invoice ? 'data-invoice-note="1"' : `data-open-order="${x.orderId}"`} data-focus="${x.focus || ''}" data-note="${x.id}"><span class="dln-ic t-${x.tone}">${N.icon(x.icon)}</span><span style="display:grid;min-width:0"><b>${esc(x.title)}</b><span>${esc(x.text)}</span><time>${esc(N.timeAgo(x.time))}</time></span></button>`).join('')}</div>`
            : empty('bell', 'No updates yet', 'When we change an order’s status or reply to you, it shows up here.')}
        </section>
        <section class="card"><div class="card-head"><h3>Profit over selected period</h3><span class="tag">Selected period</span></div>${profitChart()}</section>
      </div>`;
  }

