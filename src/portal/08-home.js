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
      <section data-home-hello class="tw:flex tw:items-end tw:justify-between tw:gap-5 tw:flex-wrap"><div><h2 class="tw:mt-2 tw:text-[clamp(26px,3vw,36px)] tw:font-semibold tw:tracking-[-.02em]">${hello}, <span class="tw:text-gold">${esc((me.name || '').split(' ')[0] || me.username)}</span></h2><p class="tw:m-0 tw:mt-1 tw:text-muted">${all.length ? `You have ${active} order${active === 1 ? '' : 's'} in progress.` : 'Send us your first order to get started.'}</p></div>
        <div class="hello-actions tw:flex tw:gap-2 tw:flex-wrap tw:max-md:hidden"><a class="btn btn-primary btn-big" href="#/new">${ic('plus')}Send a new order</a></div></section>
      ${window.DLClientStoreUI.periodFields(S.period,S.from,S.to,window.DLClientStoreMath.monthsOf(S.orders))}
      ${!S.storeId&&S.stores.length>1?`<section class="card card-pad"><h3 class="sec-title">Performance by store</h3>${window.DLClientStoreUI.table(stats)}</section>`:''}
      ${subBanner(me.subscription)}
      ${newbie ? `<section class="card card-pad"><h3 class="tw:m-0 tw:mb-3.5 tw:text-17">How it works</h3>
        <ol class="tw:grid tw:grid-cols-3 tw:gap-3.5 tw:m-0 tw:p-0 tw:list-none tw:max-[901px]:grid-cols-1">
          <li class="tw:flex tw:gap-3 tw:items-start tw:p-3.5 tw:border tw:border-solid tw:border-line tw:rounded-2xl tw:bg-surface-2"><b class="tw:flex-none tw:grid tw:place-items-center tw:size-[30px] tw:rounded-full tw:bg-gold tw:text-white tw:text-14">1</b><div><strong class="tw:block tw:mb-[3px] tw:text-[14.5px]">Send us the order</strong><span class="tw:text-muted tw:text-[13.5px] tw:leading-[1.45]">Had a sale in your store? Click “Send a new order” and fill in what your customer bought and where to ship it.</span></div></li>
          <li class="tw:flex tw:gap-3 tw:items-start tw:p-3.5 tw:border tw:border-solid tw:border-line tw:rounded-2xl tw:bg-surface-2"><b class="tw:flex-none tw:grid tw:place-items-center tw:size-[30px] tw:rounded-full tw:bg-gold tw:text-white tw:text-14">2</b><div><strong class="tw:block tw:mb-[3px] tw:text-[14.5px]">We pack and ship it</strong><span class="tw:text-muted tw:text-[13.5px] tw:leading-[1.45]">We buy the product, ship it to your customer and add the tracking number here.</span></div></li>
          <li class="tw:flex tw:gap-3 tw:items-start tw:p-3.5 tw:border tw:border-solid tw:border-line tw:rounded-2xl tw:bg-surface-2"><b class="tw:flex-none tw:grid tw:place-items-center tw:size-[30px] tw:rounded-full tw:bg-gold tw:text-white tw:text-14">3</b><div><strong class="tw:block tw:mb-[3px] tw:text-[14.5px]">Pay your balance</strong><span class="tw:text-muted tw:text-[13.5px] tw:leading-[1.45]">We add the order total to your balance. Payment by bank transfer.</span></div></li>
        </ol>
        <div class="tw:flex tw:flex-wrap tw:gap-2.5 tw:mt-4"><a class="btn btn-primary btn-big tw:max-[901px]:flex-[1_1_100%] tw:max-[901px]:justify-center" href="#/new">${ic('plus')}Send a new order</a></div></section>` : ''}
      ${statCardsHTML()}
      ${payStrip()}
      <div data-home-grid class="tw:grid tw:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] tw:gap-4 tw:max-lg:grid-cols-1">
        <section class="card tw:col-span-full"><div class="card-head"><h3>Your latest orders</h3><a class="link" href="#/orders">See all ${all.length ? '(' + all.length + ')' : ''}</a></div>
          ${all.length ? `<div class="table-wrap">${ordersTable(all.slice(0, 5), true)}</div>` : empty('orders', 'No orders yet', 'When you get a sale in your store, send it to us here. We take care of the rest.', '<a class="btn btn-primary" href="#/new">Send a new order</a>')}
        </section>
        <section class="card"><div class="card-head"><h3>Latest updates</h3><button type="button" class="link" data-open-bell>See all</button></div>
          ${items.length ? `<div data-home-feed class="tw:grid tw:px-2.5 tw:pt-2 tw:pb-3">${items.map(x => `<button type="button" class="tw:grid tw:grid-cols-[36px_1fr] tw:gap-3 tw:items-start tw:px-3 tw:py-2.5 tw:border-0 tw:rounded-xl tw:bg-transparent tw:text-start tw:cursor-pointer tw:hover:bg-surface-2" ${x.product ? 'data-product-note="1"' : x.invoice ? 'data-invoice-note="1"' : `data-open-order="${x.orderId}"`} data-focus="${x.focus || ''}" data-note="${x.id}"><span class="dln-ic t-${x.tone} tw:size-9!">${N.icon(x.icon)}</span><span class="tw:grid tw:min-w-0"><b class="tw:block tw:text-14 tw:font-semibold${x.unread ? ' tw:after:inline-block tw:after:size-[7px] tw:after:ms-[7px] tw:after:rounded-full tw:after:bg-gold tw:after:align-middle' : ''}">${esc(x.title)}</b><span class="tw:block tw:text-muted tw:text-13 tw:truncate">${esc(x.text)}</span><time class="tw:block tw:text-dim tw:text-12">${esc(N.timeAgo(x.time))}</time></span></button>`).join('')}</div>`
            : empty('bell', 'No updates yet', 'When we change an order’s status or reply to you, it shows up here.')}
        </section>
        <section class="card"><div class="card-head"><h3>Profit over selected period</h3><span class="tag">Selected period</span></div>${profitChart()}</section>
      </div>`;
  }

