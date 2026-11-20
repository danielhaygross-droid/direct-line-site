
  // ---------- Orders: the work queue (phase 2) ----------
  Object.assign(ZH, {
    'Orders': '订单', 'Newest first. Type in the gold columns: each change saves by itself.': '最新的在最上面。在金色栏里填写：每次修改都会自动保存。',
    'New': '新订单', 'Bought': '已购买', 'Shipped': '已发货', 'Cancelled': '已取消', 'Not bought': '未购买', 'Cancel requested': '客户申请取消',
    'cancel requests': '个取消申请', 'cancel request': '个取消申请', 'don’t buy or ship them. Wait for Direct Line.': '不要购买或发货。请等 Direct Line 通知。',
    'Show them': '查看', 'Show all': '显示全部', 'All': '全部', 'Period': '时间段', 'All time': '全部时间', 'This week': '本周', 'Last week': '上周', 'This month': '本月', 'Last month': '上个月', 'Custom range': '自定义日期', 'From': '从', 'To': '到', 'Order number, shop, product or tracking': '订单号、店铺、商品或运单号', 'Filters': '筛选', 'Clear filters': '清除筛选',
    'All clients': '所有客户', 'All countries': '所有国家', 'Only orders without a total cost': '只看没有总成本的订单',
    'Order': '订单号', 'Product / variation': '商品 / 款式', 'Qty': '数量', 'Ship to': '寄往', 'Total cost (USD)': '总成本（美元）', 'Cost per product (USD)': '每件商品成本（美元）',
    'Shipping status': '发货状态', 'Tracking number': '运单号', 'Courier': '快递公司', 'Delayed? + reason': '延迟？+ 原因', 'Domestic express tracking': '国内快递单号',
    'Cancellation fee (USD)': '取消费（美元）', 'Pick': '选择', 'On time': '准时', 'Possibly delayed': '可能延迟', 'Reason': '原因', 'If there is one': '如果有的话',
    'Nothing typed yet': '还没有填写', 'Saved': '已保存', 'Not saved': '未保存', 'Saving…': '保存中…', 'just now': '刚刚', 'min ago': '分钟前', 'h ago': '小时前',
    'Also on': '也在', 'Check the number.': '请检查号码。', 'No orders here.': '这里没有订单。', 'No orders match.': '没有符合的订单。',
    'Gold columns are yours to fill in': '金色栏由您填写', 'Red row: cancel requested': '红色行：客户申请取消', 'Enter saves and jumps to the same box in the next order.': '按回车保存并跳到下一个订单的同一格。',
    'Export to Excel': '导出 Excel', 'Money is only your part.': '金额只包含您的部分。', 'Show more': '显示更多',
    'Product': '商品', 'Variation': '款式', 'Open': '打开', 'Copy link': '复制链接', 'Copied': '已复制', 'Download all photos (zip)': '下载全部图片（zip）', 'All photos (zip)': '全部图片（zip）',
    'Customer': '收件人', 'Delivery address & phone': '收货地址和电话', 'Copy address': '复制地址', 'Tax number': '税号', 'Gift message': '礼物留言', 'Notes from Direct Line': 'Direct Line 备注',
    'Your part': '您的部分', 'Close': '关闭', 'Next order': '下一个订单', 'Client paid': '客户付款', 'Paid': '已付款', 'Client paid: all': '客户付款：全部', 'Not paid': '未付款', 'No bill yet': '还没有账单',
    'No photos': '没有图片', 'Client': '客户', 'Shop': '店铺', 'Cost revision requested': '客户请求降价',
    'new orders': '个新订单', 'new order': '个新订单', 'Sound for new orders': '新订单提示音', 'No new orders.': '没有新订单。', 'See new orders': '查看新订单',
    'Type one cost per product, separated by commas, e.g. 10.90, 9.00.': '每件商品一个成本，用逗号分开，例如 10.90, 9.00。',
    'Add the tracking number first.': '请先填写运单号。', 'A shipped order can’t be set back here. Ask Direct Line.': '已发货的订单不能在这里改回。请联系 Direct Line。',
    'The client asked to cancel this order: don’t ship it. Direct Line will tell you.': '客户申请取消这个订单：不要发货。Direct Line 会通知您。',
    'The client asked to cancel this order: don’t buy it. Direct Line will tell you.': '客户申请取消这个订单：不要购买。Direct Line 会通知您。',
    'Type the total cost in US dollars, e.g. 17.90.': '请填写美元总成本，例如 17.90。', 'Type one tracking number, without spaces.': '请填写一个运单号，不要空格。',
    'Pick a courier from the list.': '请从列表中选择快递公司。', '+ Add courier…': '+ 添加快递公司…', 'Name of the new courier': '新快递公司名称', 'Type the courier name (up to 40 characters).': '请填写快递公司名称（最多40个字符）。', 'Type the fee in US dollars, e.g. 4.': '请填写美元费用，例如 4。', 'Mark the order as possibly delayed first.': '请先标记为可能延迟。',
    'This order is cancelled: its cost can’t change.': '这个订单已取消：成本不能修改。', 'This order is cancelled.': '这个订单已取消。',
    'A cancellation fee is only for cancelled orders or cancel requests.': '取消费只用于已取消或申请取消的订单。', 'Only orders that are not shipped yet can be delayed.': '只有还没发货的订单可以标记延迟。',
    'Only orders not shipped yet can be marked bought.': '只有还没发货的订单可以标记为已购买。', 'This order is shipped: its tracking number can’t be cleared.': '这个订单已发货：运单号不能清空。',
  });
  const SHIP_OPTS = [['not_bought', 'Not bought'], ['bought', 'Bought'], ['shipped', 'Shipped']];
  const shipState = o => (o.ship === 'shipped' ? 'shipped' : o.boughtAt || o.tab === 'bought' ? 'bought' : 'not_bought');
  const ago = sec => { const d = Math.max(0, Math.floor(Date.now() / 1000) - sec); return d < 60 ? t('just now') : d < 3600 ? Math.floor(d / 60) + ' ' + t('min ago') : d < 86400 ? Math.floor(d / 3600) + ' ' + t('h ago') : fmtDay(sec); };
  const lastEdit = o => Object.values(o.edits || {}).sort((a, b) => b.at - a.at)[0];
  const isNew = o => S.seenAt != null && o.createdAt > S.seenAt && o.tab === 'new';
  // "Product 1:" / "Product 2:" in an order with several products is built on the server (also for the sheet); in 中文 it
  // reads 商品 1：(QA 19 Nov 2026).
  const prodText = s => (lang === 'zh' ? String(s || '').replace(/Product (\d+):/g, '商品 $1：') : s);
  const searchText = o => [o.ref, o.shop, o.client, o.product, o.buyer, o.cells.tracking, o.cells.domestic, o.country].join(' ').toLowerCase();

  function visibleOrders() {
    const q = (S.q || '').trim().toLowerCase(), f = S.f || {};
    return (S.queue?.orders || []).filter(o => {
      if (S.onlyCancelReq) return o.cancelRequested;
      if (S.tab !== 'all' && !(o.tab === S.tab || S.pinned.has(o.id) && S.pinnedTab === S.tab)) return false;
      if (!window.DLPeriod.match(o.createdAt, S.period)) return false;
      if (q && !searchText(o).includes(q)) return false;
      if (f.client && o.client !== f.client) return false;
      if (f.country && o.country !== f.country) return false;
      if (f.noCost && o.cells.cost !== '') return false;
      if (f.paid && o.clientPaid !== f.paid) return false;
      return true;
    });
  }
  // The courier Ada picked last (UX pass, 18 Nov 2026): shown in empty courier boxes and saved with the tracking number.
  const LAST_COURIER = 'dl_supplier_last_courier';
  const lastCourier = () => { try { const v = localStorage.getItem(LAST_COURIER) || ''; return S.queue?.couriers?.includes(v) ? v : ''; } catch (e) { return ''; } };
  const flashSaved = (id, f) => { for (const el of document.querySelectorAll(`[data-o="${id}"][data-f="${f}"]`)) { el.classList.add('sp-just-saved'); setTimeout(() => el.classList.remove('sp-just-saved'), 1600); } };
  // Tab counts follow the week / month picker (19 Nov 2026).
  const tabCount = tab => (S.queue?.orders || []).filter(o => (tab === 'all' || o.tab === tab) && window.DLPeriod.match(o.createdAt, S.period)).length;
  const disabledFor = (o, field) => {
    if (field === 'cancelFee') return !(o.status === 'cancelled' || o.cancelRequested);
    if (o.status === 'cancelled') return true;
    if (o.cancelRequested) return field !== 'domestic';
    if (o.ship === 'shipped') return !['tracking', 'courier', 'domestic', 'itemCosts'].includes(field);
    return false;
  };
  const dis = (o, f) => (disabledFor(o, f) ? ' disabled' : '');
  // The gold boxes. data-f = field, data-o = order id.
  function cellBox(o, field) {
    const c = o.cells, id = o.id;
    if (field === 'cost') return `<span class="sp-money"><span>$</span><input inputmode="decimal" data-o="${id}" data-f="cost" value="${esc(c.cost)}" placeholder="0.00" aria-label="${esc(t('Total cost (USD)'))}"${dis(o, 'cost')}></span>`;
    if (field === 'itemCosts') return `<input data-o="${id}" data-f="itemCosts" value="${esc(c.itemCosts)}" placeholder="—" aria-label="${esc(t('Cost per product (USD)'))}"${dis(o, 'itemCosts')}>`;
    if (field === 'ship') return `<select data-o="${id}" data-f="ship" aria-label="${esc(t('Shipping status'))}"${o.ship === 'shipped' || o.status === 'cancelled' || o.cancelRequested ? ' disabled' : ''}>${SHIP_OPTS.map(([v, l]) => `<option value="${v}"${shipState(o) === v ? ' selected' : ''}>${t(l)}</option>`).join('')}</select>`;
    if (field === 'tracking') return `<input class="mono" data-o="${id}" data-f="tracking" value="${esc(c.tracking)}" placeholder="${esc(t('Tracking number'))}" aria-label="${esc(t('Tracking number'))}"${dis(o, 'tracking')}>`;
    if (field === 'courier') { const list = S.queue.couriers.includes(c.courier) || !c.courier ? S.queue.couriers : [c.courier, ...S.queue.couriers], sug = !c.courier && !disabledFor(o, 'courier') ? lastCourier() : '', pick = c.courier || sug;
      return `<select data-o="${id}" data-f="courier" aria-label="${esc(t('Courier'))}"${pick ? ` title="${esc(pick)}"` : ''}${sug ? ' class="sp-suggest"' : ''}${dis(o, 'courier')}><option value="">${t('Pick')}</option>${list.map(v => `<option${v === pick ? ' selected' : ''}>${esc(v)}</option>`).join('')}<option value="__add">${t('+ Add courier…')}</option></select>`; }
    if (field === 'delayed') return `<select data-o="${id}" data-f="delayed" aria-label="${esc(t('Delayed? + reason'))}"${dis(o, 'delayed')}><option value="0">${t('On time')}</option><option value="1"${c.delayed ? ' selected' : ''}>${t('Possibly delayed')}</option></select>${c.delayed ? `<input data-o="${id}" data-f="reason" value="${esc(c.reason)}" placeholder="${esc(t('Reason'))}" aria-label="${esc(t('Reason'))}"${dis(o, 'reason')}>` : ''}`;
    if (field === 'domestic') return `<input class="mono" data-o="${id}" data-f="domestic" value="${esc(c.domestic)}" placeholder="${esc(t('If there is one'))}" aria-label="${esc(t('Domestic express tracking'))}"${dis(o, 'domestic')}>`;
    if (field === 'cancelFee') return `<span class="sp-money"><span>$</span><input inputmode="decimal" data-o="${id}" data-f="cancelFee" value="${esc(c.cancelFee)}" placeholder="0" aria-label="${esc(t('Cancellation fee (USD)'))}"${dis(o, 'cancelFee')}></span>`;
    return '';
  }
  const savedLine = o => { const st = S.saving[o.id]; if (st === 'saving') return `<span class="sp-saved">${t('Saving…')}</span>`; if (st === 'err') return `<span class="sp-saved err">⚠ ${t('Not saved')}</span>`;
    const e = lastEdit(o); return e ? `<span class="sp-saved ok">✓ ${t('Saved')} · ${esc(e.by)} · ${esc(ago(e.at))}</span>` : ''; };
  const warnLine = o => { const w = S.warn[o.id]; return w?.length ? `<p class="sp-warn">${t('Also on')} ${w.map(esc).join(', ')}. ${t('Check the number.')}</p>` : ''; };
  const errLine = o => (S.err[o.id] ? `<p class="sp-warn">${esc(S.err[o.id])}</p>` : '');
  const thumb = o => (o.photos[0] ? `<img class="sp-thumb" src="${esc(o.photos[0].thumb)}" alt="" loading="lazy">` : '<span class="sp-thumb none"></span>');
  // Client paid (Erwin, 16 Nov 2026: the supplier confirms which orders are paid already). Cancelled orders don't need it.
  const PAID = { paid: ['Paid', 'mint'], not_paid: ['Not paid', 'red'], no_bill: ['No bill yet', ''] };
  const paidTag = o => (o.status === 'cancelled' || o.clientPaid === 'no_bill' || !PAID[o.clientPaid] ? '' : ` <span class="sp-tag ${PAID[o.clientPaid][1]}" data-paid="${o.clientPaid}">${t(PAID[o.clientPaid][0])}</span>`);
  const orderHead = o => `<button type="button" class="sp-ref" data-open="${o.id}">${esc(o.ref)}${ICON.next}</button>${isNew(o) ? ` <span class="sp-tag gold">${t('New')}</span>` : ''}${paidTag(o)}
    <small>${esc(o.client)}${o.shop ? ' · ' + esc(o.shop) : ''} · <span class="nw">${esc(fmtDay(o.createdAt))}</span></small>${savedLine(o)}`;
  const cancelNote = o => (S.tab === 'all' && o.status === 'cancelled' ? `<span class="sp-tag red">${t('Cancelled')}</span>` : o.cancelRequested ? `<span class="sp-tag red">${t('Cancel requested')}</span><p class="sp-warn">${t('don’t buy or ship them. Wait for Direct Line.')}</p>` : o.revision ? `<span class="sp-tag orange">${t('Cost revision requested')}</span>` : '');
  function rowHTML(o) {
    const cx = S.tab === 'cancelled';
    return `<tr data-row="${o.id}" class="${o.cancelRequested ? 'cxreq' : ''}${isNew(o) ? ' isnew' : ''}">
      <td class="ord">${orderHead(o)}</td>
      <td class="prod"><div class="sp-prod">${thumb(o)}<span><b>${esc(prodText(o.product) || '—')}</b>${cancelNote(o)}</span></div></td>
      <td class="num">${o.qty}</td><td>${esc(o.country)}</td>
      <td class="g">${cellBox(o, 'cost')}${errLine(o)}</td><td class="g">${cellBox(o, 'itemCosts')}</td>
      ${cx ? `<td class="g">${cellBox(o, 'cancelFee')}</td><td class="g">${cellBox(o, 'tracking')}</td>` : `<td class="g">${cellBox(o, 'ship')}</td><td class="g">${cellBox(o, 'tracking')}${warnLine(o)}</td><td class="g">${cellBox(o, 'courier')}</td><td class="g dl">${cellBox(o, 'delayed')}</td>`}
      <td class="g">${cellBox(o, 'domestic')}</td></tr>`;
  }
  function cardHTML(o) {
    const cx = S.tab === 'cancelled' || (S.tab === 'all' && o.status === 'cancelled'), st = shipState(o), f = (label, box) => `<label class="sp-f"><span>${label}</span>${box}</label>`;
    return `<article class="sp-ocard${o.cancelRequested ? ' cxreq' : ''}" data-row="${o.id}">
      <div class="sp-ocard-h"><div>${orderHead(o)}</div><span class="sp-pill ${o.status === 'cancelled' ? 'red' : st}">${t(o.status === 'cancelled' ? 'Cancelled' : SHIP_OPTS.find(x => x[0] === st)[1])}</span></div>
      <div class="sp-prod">${thumb(o)}<span><b>${esc(prodText(o.product) || '—')}</b>${cancelNote(o)}</span></div>
      <div class="sp-fgrid">${f(t('Qty'), `<b>${o.qty}</b>`)}${f(t('Ship to'), `<b>${esc(o.country)}</b>`)}
        ${f(t('Total cost (USD)'), cellBox(o, 'cost') + errLine(o))}${cx ? f(t('Cancellation fee (USD)'), cellBox(o, 'cancelFee')) : f(t('Shipping status'), cellBox(o, 'ship'))}
        ${f(t('Cost per product (USD)'), cellBox(o, 'itemCosts'))}${f(t('Tracking number'), cellBox(o, 'tracking') + warnLine(o))}
        ${cx ? '' : f(t('Courier'), cellBox(o, 'courier')) + f(t('Delayed? + reason'), cellBox(o, 'delayed'))}${f(t('Domestic express tracking'), cellBox(o, 'domestic'))}</div>
      <div class="sp-ocard-a"><button type="button" class="btn btn-sm" data-copy-address="${o.id}">${t('Copy address')}</button>${o.photos.length ? `<a class="btn btn-sm" href="/api/portal/supplier/orders/${o.id}/photos.zip">${t('All photos (zip)')}</a>` : ''}</div></article>`;
  }
  function ordersHTML() {
    const Q = S.queue; if (!Q) return S.error || `<p class="sp-empty">${t('Loading…')}</p>`;
    const req = Q.orders.filter(o => o.cancelRequested), list = visibleOrders(), shown = list.slice(0, S.limit), f = S.f || {};
    const clients = [...new Set(Q.orders.map(o => o.client))].sort(), countries = [...new Set(Q.orders.map(o => o.country).filter(Boolean))].sort();
    const filtered = !!(S.q || f.client || f.country || f.noCost || f.paid || S.onlyCancelReq || S.period.k !== 'all');
    const period = window.DLPeriod.html(S.period, Q.orders.map(o => o.createdAt), { t, locale: lang === 'zh' ? 'zh-CN' : 'en-GB' });
    // "All" (Erwin, 19 Nov 2026: "there is no all in the supplier portal"): every order, newest first; New stays the start tab.
    const tabs = [['all', 'All'], ['new', 'New'], ['bought', 'Bought'], ['shipped', 'Shipped'], ['cancelled', 'Cancelled']].map(([k, l]) => {
      const n = tabCount(k), extra = k === 'new' ? Q.orders.filter(o => isNew(o) && window.DLPeriod.match(o.createdAt, S.period)).length : k === 'cancelled' ? 0 : 0;
      return `<button type="button" class="sp-chip" data-tab="${k}" aria-pressed="${S.tab === k && !S.onlyCancelReq}">${t(l)} ${extra && extra === n ? `<b class="sp-badge">${n}</b>` : `<span>${n}</span>${extra ? `<b class="sp-badge">${extra}</b>` : ''}`}</button>`; }).join('');
    const cx = S.tab === 'cancelled';
    const head = `<tr><th>${t('Order')}</th><th>${t('Product / variation')}</th><th class="num">${t('Qty')}</th><th>${t('Ship to')}</th><th class="g">${t('Total cost (USD)')}</th><th class="g">${t('Cost per product (USD)')}</th>
      ${cx ? `<th class="g">${t('Cancellation fee (USD)')}</th><th class="g">${t('Tracking number')}</th>` : `<th class="g">${t('Shipping status')}</th><th class="g">${t('Tracking number')}</th><th class="g">${t('Courier')}</th><th class="g">${t('Delayed? + reason')}</th>`}<th class="g">${t('Domestic express tracking')}</th></tr>`;
    return `<div class="sp-head"><div><h1>${t('Orders')}</h1><p class="sp-intro">${t('Newest first. Type in the gold columns: each change saves by itself.')}</p></div>
        <button type="button" class="btn" data-export-orders>${t('Export to Excel')}</button></div>
      ${notifyBannerHTML()}
      ${req.length ? `<div class="sp-alert"><b>${req.length} ${t(req.length === 1 ? 'cancel request' : 'cancel requests')}</b><span>${req.slice(0, 4).map(o => esc(o.ref)).join(', ')}${req.length > 4 ? '…' : ''}: ${t('don’t buy or ship them. Wait for Direct Line.')}</span><button type="button" class="btn btn-sm" data-cxreq>${t(S.onlyCancelReq ? 'Show all' : 'Show them')}</button></div>` : ''}
      <div class="sp-bar"><div class="sp-chips">${tabs}</div>
        <div class="sp-tools">${period}<label class="sp-search"><input type="search" data-q value="${esc(S.q || '')}" placeholder="${esc(t('Order number, shop, product or tracking'))}" aria-label="${esc(t('Order number, shop, product or tracking'))}"></label>
          <button type="button" class="btn" data-filters aria-expanded="${!!S.showFilters}">${t('Filters')}${f.client || f.country || f.noCost || f.paid ? ' •' : ''}</button></div></div>
      ${S.showFilters ? `<div class="sp-filters"><select data-fl="client"><option value="">${t('All clients')}</option>${clients.map(c => `<option${f.client === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select data-fl="country"><option value="">${t('All countries')}</option>${countries.map(c => `<option${f.country === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select data-fl="paid"><option value="">${t('Client paid: all')}</option>${['paid', 'not_paid', 'no_bill'].map(k => `<option value="${k}"${f.paid === k ? ' selected' : ''}>${t(PAID[k][0])}</option>`).join('')}</select>
        <label class="sp-check"><input type="checkbox" data-fl="noCost"${f.noCost ? ' checked' : ''}> <span>${t('Only orders without a total cost')}</span></label>
        ${filtered ? `<button type="button" class="btn btn-sm" data-clear>${t('Clear filters')}</button>` : ''}</div>` : ''}
      <section class="card sp-qcard">${list.length ? `<div class="sp-qwrap"><table class="sp-q"><thead>${head}</thead><tbody>${shown.map(rowHTML).join('')}</tbody></table></div>
        <div class="sp-qcards">${shown.map(cardHTML).join('')}</div>${list.length > shown.length ? `<div class="sp-more"><button type="button" class="btn" data-more>${t('Show more')} (${list.length - shown.length})</button></div>` : ''}`
        : `<div class="sp-empty center"><p>${t(filtered ? 'No orders match.' : 'No orders here.')}</p>${filtered ? `<button type="button" class="btn" data-clear>${t('Clear filters')}</button>` : ''}</div>`}
        <p class="sp-legend"><span><i class="g"></i>${t('Gold columns are yours to fill in')}</span><span><i class="r"></i>${t('Red row: cancel requested')}</span><span>${t('Not bought')} → ${t('Bought')} → ${t('Shipped')}</span><span class="end">${t('Enter saves and jumps to the same box in the next order.')}</span></p></section>`;
  }
  // One box saved: the order comes back from the server; only its row (and the open drawer) is redrawn, focus stays.
  async function saveBox(el) {
    const id = Number(el.dataset.o), f = el.dataset.f, o = S.queue.orders.find(x => x.id === id); if (!o) return;
    let field = f, value = el.value.trim();
    // "+ Add courier…" (19 Nov 2026): the new name goes on the courier list, then on this order.
    if (f === 'courier' && value === '__add') {
      const name = (window.prompt(t('Name of the new courier')) || '').trim();
      if (!name) { redrawOrder(id); return; }
      try { const r = await api('/supplier/couriers', { method: 'POST', body: { name } }); S.queue.couriers = r.couriers; value = r.courier;
        for (const sel of document.querySelectorAll('select[data-f="courier"]')) if (![...sel.options].some(op => op.value === value)) sel.querySelector('option[value="__add"]')?.before(new Option(value, value)); }
      catch (e) { S.err[id] = e.message; redrawOrder(id); return; }
    }
    if (f === 'ship') { field = value === 'shipped' ? 'shipped' : 'bought'; value = value === 'shipped' ? true : value === 'bought'; if (field === 'bought' && !!o.boughtAt === value) return; }
    else if (f === 'delayed') { value = value === '1'; if (value === o.cells.delayed) return; }
    else if ((o.cells[f] ?? '') === value) return;
    const key = id + ':' + f, sent = JSON.stringify(value); if (S.pending[key] === sent) return; S.pending[key] = sent;
    S.saving[id] = 'saving'; delete S.err[id]; redrawOrder(id);
    try {
      const r = await api('/supplier/orders/' + id, { method: 'PUT', body: { field, value } });
      Object.assign(o, r.order); delete S.saving[id];
      if (field === 'tracking') S.warn[id] = r.warn?.sameTracking || [];
      if (field === 'courier' && value) try { localStorage.setItem(LAST_COURIER, value); } catch (e) { /* private mode */ }
      // A tracking number saved with no courier yet: the last courier goes with it (Ada can still change it).
      if (field === 'tracking' && value && !o.cells.courier && lastCourier()) {
        try { const r2 = await api('/supplier/orders/' + id, { method: 'PUT', body: { field: 'courier', value: lastCourier() } }); Object.assign(o, r2.order); setTimeout(() => flashSaved(id, 'courier')); } catch (e) { /* she picks it herself */ }
      }
      if (S.tab !== 'all' && o.tab !== S.tab) { S.pinned.add(id); S.pinnedTab = S.tab; }
    } catch (e) { S.saving[id] = 'err'; S.err[id] = e.message; }
    delete S.pending[key];
    redrawOrder(id);
    if (!S.err[id]) flashSaved(id, f);
  }
  function redrawOrder(id) {
    const o = S.queue.orders.find(x => x.id === id), active = document.activeElement, keep = active?.dataset?.o == id && !active.closest('#sp-drawer') ? active.dataset.f : null, sel = keep && active.closest('.sp-ocard') ? '.sp-ocard' : 'tr';
    for (const el of document.querySelectorAll(`[data-row="${id}"]`)) el.outerHTML = el.matches('tr') ? rowHTML(o) : cardHTML(o);
    if (S.drawer === id) drawerFill();
    if (keep) { const el = document.querySelector(`${sel}[data-row="${id}"] [data-f="${keep}"]`); if (el) { if (el.value !== active.value) el.value = active.value; el.focus(); } }
  }
  function exportOrders() {
    const X = window.DLExcelExport; if (!X) return;
    const list = visibleOrders(), stateL = o => t(o.status === 'cancelled' ? 'Cancelled' : o.cancelRequested ? 'Cancel requested' : SHIP_OPTS.find(x => x[0] === shipState(o))[1]);
    const rows = list.map(o => [o.date, o.ref, o.client, o.shop, o.product, o.qty, o.country, stateL(o), o.cells.cost === '' ? '' : Number(o.cells.cost), o.cells.itemCosts, o.cells.tracking, o.cells.courier, o.cells.domestic, o.cells.cancelFee === '' ? '' : Number(o.cells.cancelFee)]);
    const head = ['Date', 'Order', 'Client', 'Shop', 'Product / variation', 'Qty', 'Ship to', 'Shipping status', 'Total cost (USD)', 'Cost per product (USD)', 'Tracking number', 'Courier', 'Domestic express tracking', 'Cancellation fee (USD)'].map(t);
    X.download(X.table({ title: 'Direct Line · ' + t('Orders'), subtitle: t('Money is only your part.') + ' ' + fmtTime(Math.floor(Date.now() / 1000)) + ' ' + t('(China time)'), sheetName: t('Orders'), head, rows, money: [8, 13], widths: [12, 16, 18, 16, 40, 6, 16, 14, 14, 18, 22, 14, 22, 14] }), `direct-line-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
