  // ---------- earnings block: the same cards and profit chart on Home and on Orders ----------
  function earnedNumbers() {
    const range = homeRange(), stats = window.DLClientStoreMath.performance(S.stores, S.orders, S.adjustments, range);
    const selected = S.storeId ? stats.rows.find(x => x.id === S.storeId) : stats.totals;
    return { range, stats, selected, s: { ...S.me.summary, orders: selected?.orders || 0, billed: selected?.billed || 0, clientProfit: selected?.profit || 0 } };
  }
  function statCardsHTML() {
    const me = S.me, { selected, s } = earnedNumbers(), active = storeOrders().filter(inProgress).length;
    return `<section class="stats stats-3">
        <div class="stat hero"><span class="stat-ic">${ic('wallet')}</span><small>${S.storeId?'Billed for this store':'Billed in selected period'}</small><strong>${money(s.billed)}</strong><em><span>Overall account balance</span>: ${money(me.summary.outstanding)}</em></div>
        <div class="stat" style="--tone:var(--blue)"><span class="stat-ic">${ic('orders')}</span><small>Orders in progress</small><strong>${active}</strong><em>${s.orders} order${s.orders === 1 ? '' : 's'} in total</em></div>
        <div class="stat" style="--tone:var(--gold)"><span class="stat-ic">${ic('chart')}</span><small>Your profit</small><strong class="${s.clientProfit < 0 ? 'neg' : ''}">${money(s.clientProfit)}</strong><em>What you earned after Etsy fees, minus our bill</em>${selected?.missingSalePrice ? `<small><b data-no-i18n>${selected.missingSalePrice}</b> <span>orders missing Etsy earnings</span></small>` : ''}${selected?.otherCurrency ? `<small><b data-no-i18n>${selected.otherCurrency}</b> <span>orders in other currencies not counted</span></small>` : ''}</div>
      </section>`;
  }
  // Orders page: period picker on top, then (refreshed on its own) the per-store table, the cards and the chart.
  const earningsTop = () => `<div data-earnings-top>${window.DLClientStoreUI.periodFields(S.period, S.from, S.to, window.DLClientStoreMath.monthsOf(S.orders))}</div>`;
  function earningsInner() {
    const { stats } = earnedNumbers();
    return `${!S.storeId && S.stores.length > 1 ? `<section class="card card-pad"><h3 class="sec-title">Performance by store</h3>${window.DLClientStoreUI.table(stats)}</section>` : ''}
      ${statCardsHTML()}
      <section class="card card-pad mc" data-client-chart></section>`;
  }
  // Money by month (Erwin, 27 Oct 2026: "upgrade their graphs"): what the client earned on Etsy, our bill, their profit
  // and what they paid us, per order month, for the shop picked at the top (payments are for the whole account, so
  // that line shows only with All stores). Same math as the cards: cancelled orders and other currencies left out.
  function mountClientChart() {
    const el = $('[data-client-chart]'); if (!el) return;
    const M = window.DLClientStoreMath, c = n => Math.round(n) / 100, by = new Map(), at = k => { if (!by.has(k)) by.set(k, { month: k, earned: 0, billed: 0, profit: 0, paid: 0 }); return by.get(k); };
    for (const o of storeOrders()) { if (o.status === 'cancelled') continue; const r = at(M.dateKey(o).slice(0, 7)), e = (o.currency || 'USD') === 'USD' ? M.earnedCents(o) : null; r.billed += Math.round(Number(o.price || 0) * 100); if (e != null) { r.earned += e; r.profit += e - Math.round(Number(o.price || 0) * 100); } }
    if (!S.storeId) for (const p of S.payments) at(new Date(p.paidAt * 1000).toISOString().slice(0, 7)).paid += Math.round(p.amount * 100);
    const months = [...by.values()].map(r => ({ month: r.month, earned: c(r.earned), billed: c(r.billed), profit: c(r.profit), paid: c(r.paid) }));
    window.DLMoneyChart.mount(el, { title: 'Money by month', key: 'dl-client-money-' + S.me.id, months, money, series: [
      { key: 'earned', label: 'Earned on Etsy', tone: 'var(--gold)', note: 'What you earned on your orders after Etsy’s fees' },
      { key: 'billed', label: 'Our bill', tone: 'var(--blue)', note: 'What Direct Line billed you for these orders' },
      { key: 'profit', label: 'Your profit', tone: 'var(--mint)', note: 'Earned minus our bill (orders with Etsy earnings filled in)' },
      ...(S.storeId ? [] : [{ key: 'paid', label: 'You paid us', tone: 'var(--orange)', note: 'Payments we received from you' }])] });
  }

  const unreadOrderIds=()=>new Set(noteItems().filter(x=>x.unread).map(x=>x.orderId));
  function ordersTable(list, compact) {
    const fresh = unreadOrderIds();
    return `<table class="tbl stack"><thead><tr><th>Order</th><th>Customer</th><th>Store</th>${compact ? '' : '<th>Destination</th><th>Tracking</th>'}<th class="num" title="What you earned on Etsy after Etsy’s fees">Earned</th><th class="num" title="What you pay Direct Line">Cost</th><th class="num" title="Earned minus cost">Profit</th><th>Status</th><th class="hide-sm"></th></tr></thead><tbody>
      ${list.map(o => `<tr class="click${fresh.has(o.id) ? ' is-new' : ''}" data-open-order="${o.id}" tabindex="0">
        <td class="wide"><div class="ord-ref">${o.photos?.length ? `<img class="ord-thumb" src="${photoUrl(o.id, o.photos[0].id, true)}" alt="" loading="lazy">` : `<span class="ord-ic t-${o.status}">${ic('orders')}</span>`}<span class="t-main"><b>${esc(orderName(o))}${fresh.has(o.id) ? '<span class="dot-new" title="Updated"></span>' : ''}</b><small>${esc(fullDate(o.createdAt))}</small></span></div></td>
        <td data-label="Customer"><span data-no-i18n>${esc(o.buyerName) || '—'}</span></td>
        <td data-label="Store">${window.DLClientStoreUI.label(S.stores.find(s=>s.id===o.storeId))}</td>${compact ? '' : `<td data-label="Destination">${esc(place(o.destination))}</td>
        <td data-label="Tracking">${o.trackingNumber ? `<span class="tracking">${esc(o.trackingNumber)}</span>${o.courier ? `<br><small class="dim" data-no-i18n>${esc(o.courier)}</small>` : ''}${UI.notShippedYet(o) ? '<small class="ship-warn">Not shipped yet</small>' : ''}` : '<span class="dim">Not yet</span>'}</td>`}
        <td data-label="Earned" class="num">${earnedCell(o)}</td>
        <td data-label="Cost" class="num">${o.status === 'cancelled' ? '<span class="dim">—</span>' : !o.priced ? '<span class="dim">Pending</span>' : `<b>${money(o.price)}</b>`}${window.DLPayOrders.tag(o, S.adjustments, true)}</td>
        <td data-label="Profit" class="num ${profitOf(o) > 0 ? 'pos' : profitOf(o) < 0 ? 'neg' : ''}">${profitCell(o)}</td>
        <td data-label="Status">${UI.pill(o.status)}${UI.delayTag(o)}</td>
        <td class="num hide-sm">${o.messages ? `<span class="msg-count${o.unreadMessages ? ' unread' : ''}" title="Messages">${ic('chat')}${o.unreadMessages || o.messages}</span> ` : ''}${UI.svg(P.chev).replace('<svg', '<svg class="chev"')}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  const viewOrders = () => `${payStrip()}<details class="earn-box" data-earn${store.get('dl-earn-open', true) ? ' open' : ''}><summary><b>Your earnings</b><small>profit, billing and the chart for the selected period</small></summary>${earningsTop()}<div data-earnings style="display:grid;gap:14px">${earningsInner()}</div></details><div class="toolbar"><div class="chips" data-chips></div><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, product, customer…" value="${esc(S.q)}" data-q></label>${sortPick('portal-orders', ORDER_SORTS)}<button type="button" class="btn btn-sm" data-excel-export title="An Excel file with the orders on screen, their prices and a Paid column (Yes / No)">${ic('doc')}Export to Excel</button></div>
      <section class="card" data-orders-list></section>`;
  function renderChips() {
    const c = st => storeOrders().filter(o => st === 'all' || o.status === st).length;
    $('[data-chips]').innerHTML = ['all', ...STATUSES].filter(st => st === 'all' || c(st) || st === S.filter)
      .map(st => `<button type="button" class="chip${S.filter === st ? ' on' : ''} t-${st}" data-filter="${st}">${st !== 'all' ? '<i class="dot"></i>' : ''}${st === 'all' ? 'All' : UI.LABEL[st]} <span>${c(st)}</span></button>`).join('');
  }
  // The orders on screen: store, status chip, search and sort (also what "Export to Excel" exports).
  function shownOrders() {
    const q = S.q.toLowerCase();
    return sortList(storeOrders().filter(o => (S.filter === 'all' || o.status === S.filter)
      && (!q || [o.orderRef, o.trackingNumber, o.itemTitle, o.sku, o.buyerName, o.notes, o.destination, place(o.destination),S.stores.find(s=>s.id===o.storeId)?.name].join(' ').toLowerCase().includes(q))), 'portal-orders', ORDER_SORTS);
  }
  // "Export to Excel": the orders on screen as an .xlsx with prices, a Yes / No "Paid" column and paid / not paid totals.
  function exportOrdersToExcel() {
    const list = shownOrders(); if (!list.length) { N.popup({ icon: 'alert', title: 'No orders to export' }); return; }
    const he = window.DLi18n?.lang === 'he', t = he ? window.DLi18n.t : s => s;
    const storeName = S.storeId ? S.stores.find(s => s.id === S.storeId)?.name : t('All stores');
    const parts = [storeName, S.filter === 'all' ? t('All statuses') : t(UI.LABEL[S.filter]), S.q ? `"${S.q}"` : '', [t('Exported'), new Date().toLocaleDateString('en-GB')]].filter(Boolean);
    const blob = window.DLExcelExport.orders({ title: t('Orders') + ' — ' + S.me.name, subtitle: parts.map(p => Array.isArray(p) ? p.join(' ') : p).join(' · '), orders: list, statusLabel: s => t(UI.LABEL[s] || s), t, rtl: he });
    window.DLExcelExport.download(blob, `Direct-Line-orders-${localDay()}.xlsx`);
  }
  function renderOrdersList() {
    const list = shownOrders();
    $('[data-orders-list]').innerHTML = list.length ? `<div class="table-wrap">${ordersTable(list)}</div>`
      : S.orders.length ? empty('search', 'No orders match', 'Try another search or status.') : empty('orders', 'No orders yet', 'Add your first order and we’ll take it from there.', '<a class="btn btn-primary" href="#/new">New order</a>');
  }
  function bindOrders() { renderChips(); renderOrdersList(); }

