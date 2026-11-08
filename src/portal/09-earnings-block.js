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
  // 29 Oct 2026 (Erwin: "remove duplicate graphs that shows the same thing even if you go to other sections"): the
  // Orders page has only the orders; the store table, cards and charts live on Home. The old "Profit over selected
  // period" bars are gone too: Money by month shows the profit.
  // Money by month (Erwin, 27 Oct 2026: "upgrade their graphs"): what the client earned on Etsy, our bill, their profit
  // and what they paid us, per order month, for the shop picked at the top (payments are for the whole account, so
  // that line shows only with All stores). Same math as the cards: cancelled orders and other currencies left out.
  function mountClientChart() {
    const el = $('[data-client-chart]'); if (!el) return;
    const M = window.DLClientStoreMath, c = n => Math.round(n) / 100, by = new Map(), at = k => { if (!by.has(k)) by.set(k, { month: k, earned: 0, billed: 0, profit: 0, paid: 0 }); return by.get(k); };
    for (const o of storeOrders()) { if (o.status === 'cancelled') continue; const r = at(M.dateKey(o).slice(0, 7)), e = (o.currency || 'USD') === 'USD' ? M.earnedCents(o) : null; r.billed += Math.round(Number(o.price || 0) * 100); if (e != null) { r.earned += e; r.profit += e - Math.round(Number(o.price || 0) * 100); } }
    // Cancellation fees and other bill changes count against the order's month, as in the cards above.
    const mine = new Map(storeOrders().map(o => [o.id, o]));
    for (const a of S.adjustments) { const o = mine.get(a.orderId); if (!o) continue; const r = at(M.dateKey(o).slice(0, 7)), v = Math.round(Number(a.amount || 0) * 100); r.billed += v; r.profit -= v; }
    if (!S.storeId) for (const p of S.payments) at(new Date(p.paidAt * 1000).toISOString().slice(0, 7)).paid += Math.round(p.amount * 100);
    const months = [...by.values()].map(r => ({ month: r.month, earned: c(r.earned), billed: c(r.billed), profit: c(r.profit), paid: c(r.paid) }));
    window.DLMoneyChart.mount(el, { title: 'Money by month', key: 'dl-client-money-' + S.me.id, months, money, series: [
      { key: 'earned', label: 'Earned on Etsy', tone: 'var(--mc-gold)', note: 'What you earned on your orders after Etsy’s fees' },
      { key: 'billed', label: 'Our bill', tone: 'var(--mc-blue)', note: 'What Direct Line billed you for these orders' },
      { key: 'profit', label: 'Your profit', tone: 'var(--mc-teal)', note: 'Earned minus our bill (orders with Etsy earnings filled in)' },
      ...(S.storeId ? [] : [{ key: 'paid', label: 'You paid us', tone: 'var(--mc-orange)', note: 'Payments we received from you' }])] });
  }

  // Unread notifications per order: the "new" dot, the update tags and the "Updates first" sort (2 Nov 2026).
  let newByOrder = new Map();
  function refreshNew() { newByOrder = new Map(); for (const x of noteItems()) if (x.unread && x.orderId) { if (!newByOrder.has(x.orderId)) newByOrder.set(x.orderId, []); newByOrder.get(x.orderId).push(x); } return newByOrder; }
  const unreadOrderIds = () => new Set(refreshNew().keys());
  const lastNewNote = o => Math.max(0, ...(newByOrder.get(o.id) || []).map(x => x.time));
  // One tag per kind of change, newest first (×2 when it happened more than once).
  function updateTags(o) {
    const seen = new Map();
    // "Now Delivered" next to the Delivered pill says the same thing twice: the pill is enough (the dot still marks the update).
    const same = noteTag({ kind: 'status', detail: o.status })[0];
    for (const x of (newByOrder.get(o.id) || []).slice().sort((a, b) => b.time - a.time)) { const [label, tone] = x.tag; if (label === same) continue; const y = seen.get(label); if (y) y.n++; else seen.set(label, { tone, n: 1 }); }
    return seen.size ? `<span class="upd-tags">${[...seen].map(([label, y]) => `<span class="upd-tag t-${y.tone}">${esc(label)}${y.n > 1 ? `<span data-no-i18n> ×${y.n}</span>` : ''}</span>`).join('')}</span>` : '';
  }
  function ordersTable(list, compact) {
    const fresh = unreadOrderIds(), byChanged = window.DL.sortKey('portal-orders-2', ORDER_SORTS).startsWith('changed'); // date under the status
    return `<table class="tbl stack"><thead><tr><th>Order</th><th>Customer</th><th>Store</th>${compact ? '' : '<th>Destination</th><th>Tracking</th>'}<th class="num" title="What you earned on Etsy after Etsy’s fees">Earned</th><th class="num" title="What you pay Direct Line">Cost</th><th class="num" title="Earned minus cost">Profit</th><th>Status</th><th class="hide-sm"></th></tr></thead><tbody>
      ${list.map(o => `<tr class="click${fresh.has(o.id) ? ' is-new' : ''}" data-open-order="${o.id}" tabindex="0">
        <td class="wide" data-sort-value="${Number(o.createdAt) || 0}"><div class="ord-ref">${o.photos?.length ? `<img class="ord-thumb" src="${photoUrl(o.id, o.photos[0].id, true)}" alt="" loading="lazy">` : `<span class="ord-ic t-${o.status}">${ic('orders')}</span>`}<span class="t-main"><b>${esc(orderName(o))}${fresh.has(o.id) ? '<span class="dot-new" title="Updated"></span>' : ''}</b><small title="${esc(window.DL.displayTime(o.createdAt))}">${esc(fullDate(o.createdAt))}</small>${updateTags(o)}</span></div></td>
        <td data-label="Customer"><span data-no-i18n>${esc(o.buyerName) || '—'}</span></td>
        <td data-label="Store">${window.DLClientStoreUI.label(S.stores.find(s=>s.id===o.storeId))}</td>${compact ? '' : `<td data-label="Destination" class="hide-sm">${esc(place(o.destination))}</td>
        <td data-label="Tracking"${o.trackingNumber ? '' : ' class="empty-sm"'}>${o.trackingNumber ? `<span class="tracking">${esc(o.trackingNumber)}</span>${o.courier ? `<br><small class="dim" data-no-i18n>${esc(o.courier)}</small>` : ''}${UI.notShippedYet(o) ? '<small class="ship-warn">Not shipped yet</small>' : ''}` : '<span class="dim">Not yet</span>'}</td>`}
        <td data-label="Earned" class="num${earnedOf(o) == null ? ' empty-sm' : ''}">${earnedCell(o)}</td>
        <td data-label="Cost" class="num">${o.status === 'cancelled' ? '<span class="dim">—</span>' : !o.priced ? '<span class="dim">Pending</span>' : `<b>${money(o.price)}</b>`}${window.DLPayOrders.tag(o, S.adjustments, true)}</td>
        <td data-label="Profit" class="num ${profitOf(o) > 0 ? 'pos' : profitOf(o) < 0 ? 'neg' : ''}${profitOf(o) == null ? ' empty-sm' : ''}">${profitCell(o)}</td>
        <td data-label="Status" data-sort-value="${STATUSES.indexOf(o.status)} ${o.status}">${UI.pill(o.status)}${byChanged ? `<small class="st-when" data-no-i18n>${window.DL.shortTime(o.statusChangedAt || o.createdAt)}</small>` : ''}${UI.delayTag(o)}${UI.revTag(o)}</td>
        <td class="num hide-sm">${o.messages ? `<span class="msg-count${o.unreadMessages ? ' unread' : ''}" title="Messages">${ic('chat')}${o.unreadMessages || o.messages}</span> ` : ''}${UI.svg(P.chev).replace('<svg', '<svg class="chev"')}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  // Orders page (Erwin, 28 Oct 2026: "he cant even properly sort out the orders"): the list and its filters come first;
  // the earnings (store table, cards, profit chart) are folded below it and closed until the client opens them.
  // No unpaid strip here (5 Nov 2026): it is on Home and Payments; the "Not paid" chip filters the unpaid orders.
  const viewOrders = () => `<div class="toolbar"><div class="chips" data-chips></div><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, product, customer…" value="${esc(S.q)}" data-q></label>${sortPick('portal-orders-2', ORDER_SORTS)}<button type="button" class="btn btn-sm" data-excel-export title="An Excel file with the orders on screen, their prices and a Paid column (Yes / No)">${ic('doc')}Export to Excel</button></div>
      <section class="card" data-orders-list></section>`;
  const isUnpaid = o => window.DLPayOrders.state(o, S.adjustments) === 'unpaid';
  // "Cost revisions": every order the client asked a cost revision on (waiting or answered).
  const hasRevision = o => !!UI.revTag(o);
  const byFilter = (o, f) => f === 'all' || (f === 'updates' ? newByOrder.has(o.id) : f === 'unpaid' ? isUnpaid(o) : f === 'revision' ? hasRevision(o) : o.status === f);
  function renderChips() {
    refreshNew();
    const c = st => storeOrders().filter(o => byFilter(o, st)).length;
    // Shipped is always there, like in admin (29 Oct 2026), even before anything ships.
    $('[data-chips]').innerHTML = ['all', 'updates', 'unpaid', ...STATUSES, 'revision'].filter(st => st === 'all' || st === 'shipped' || c(st) || st === S.filter)
      .map(st => `<button type="button" class="chip${S.filter === st ? ' on' : ''} t-${st}" data-filter="${st}" aria-pressed="${S.filter === st}">${st !== 'all' ? '<i class="dot"></i>' : ''}${st === 'all' ? 'All' : st === 'updates' ? 'New updates' : st === 'unpaid' ? 'Not paid' : st === 'revision' ? 'Cost revisions' : UI.LABEL[st]} <span>${c(st)}</span></button>`).join('');
  }
  // The orders on screen: store, status chip, search and sort (also what "Export to Excel" exports).
  function shownOrders() {
    refreshNew();
    const q = S.q.toLowerCase();
    return sortList(storeOrders().filter(o => byFilter(o, S.filter)
      && (!q || [o.orderRef, o.trackingNumber, o.itemTitle, o.sku, o.buyerName, o.notes, o.destination, place(o.destination),S.stores.find(s=>s.id===o.storeId)?.name].join(' ').toLowerCase().includes(q))), 'portal-orders-2', ORDER_SORTS);
  }
  // "Export to Excel": the orders on screen as an .xlsx with prices, a Yes / No "Paid" column and paid / not paid totals.
  function exportOrdersToExcel() {
    const list = shownOrders(); if (!list.length) { N.popup({ icon: 'alert', title: 'No orders to export' }); return; }
    const he = window.DLi18n?.lang === 'he', t = he ? window.DLi18n.t : s => s;
    const storeName = S.storeId ? S.stores.find(s => s.id === S.storeId)?.name : t('All stores');
    const parts = [storeName, S.filter === 'all' ? t('All statuses') : S.filter === 'unpaid' ? t('Not paid') : t(UI.LABEL[S.filter]), S.q ? `"${S.q}"` : '', [t('Exported'), new Date().toLocaleDateString('en-GB')]].filter(Boolean);
    const blob = window.DLExcelExport.orders({ title: t('Orders') + ' — ' + S.me.name, subtitle: parts.map(p => Array.isArray(p) ? p.join(' ') : p).join(' · '), orders: list, statusLabel: s => t(UI.LABEL[s] || s), t, rtl: he });
    window.DLExcelExport.download(blob, `Direct-Line-orders-${localDay()}.xlsx`);
  }
  // Several parcels arrived (portal review, 28 Oct 2026): on the Shipped filter the client ticks the orders their
  // customers received and marks them delivered at once (the same action as one order's "Mark as delivered").
  function bulkDelivered(list) {
    const shipped = list.filter(o => o.status === 'shipped'); if (S.filter !== 'shipped' || shipped.length < 2 || S.me.preview) return '';
    return `<details class="card card-pad bulk-deliver" data-bulk-deliver><summary><b>Mark several as delivered</b><small class="muted">Tick the orders your customers received.</small></summary>
      <form data-bulk-form><div class="po-list">${shipped.map(o => `<label class="po-row"><input type="checkbox" name="id" value="${o.id}"><span class="po-main"><b data-no-i18n>${esc(orderName(o))}</b><small data-no-i18n>${esc(o.buyerName || '')}${o.trackingNumber ? ' · ' + esc(o.trackingNumber) : ''}</small></span></label>`).join('')}</div>
      <div class="form-actions"><button type="submit" class="btn btn-primary" data-bulk-go disabled>Mark as delivered</button><p class="form-msg" data-bulk-msg role="status"></p></div></form></details>`;
  }
  // Long lists show the first rows, then "Show N more" (Erwin, 7 Nov 2026: shorter screens; 100+ orders made Orders
  // 22,000 px long on a phone). Search, filters, counts and the Excel file still use every order. S.shown keeps how many
  // rows a list shows until its filter, search or store changes.
  const LIST_PAGE = { orders: 30, products: 20 };
  const listShown = (k, sig) => { const sh = S.shown ||= {}; if (sh[k]?.sig !== sig) sh[k] = { sig, n: LIST_PAGE[k] }; return sh[k].n; };
  const listMore = (k, shown, n) => n > shown ? `<div class="list-more" data-list-more-bar="${k}"><button type="button" class="btn btn-sm" data-list-more="${k}"><span>Show ${Math.min(LIST_PAGE[k], n - shown)} more</span></button><small class="dim">${shown} of ${n} shown</small></div>` : '';
  function renderOrdersList() {
    const all = shownOrders(), list = all.slice(0, listShown('orders', [S.filter, S.q, S.storeId].join('|')));
    $('[data-orders-list]').innerHTML = list.length ? `${bulkDelivered(all)}<div class="table-wrap">${ordersTable(list)}</div>${listMore('orders', list.length, all.length)}`
      : S.orders.length ? empty('search', 'No orders match', 'Try another search or status.') : empty('orders', 'No orders yet', 'Add your first order and we’ll take it from there.', '<a class="btn btn-primary" href="#/new">New order</a>');
  }
  function bindOrders() { renderChips(); renderOrdersList(); }

