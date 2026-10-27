  // ---------- overview tab: what needs doing for clients today ----------
  function renderOverview() {
    const box = $('[data-overview]'); if (!box) return;
    const os = S.orders, cl = S.ov.clients;
    const pending = os.filter(o => o.status === 'pending'), follow = os.filter(o => o.unreadMessages > 0);
    const noTrack = os.filter(o => o.status === 'processing' && !o.trackingNumber), noCost = os.filter(needsCost), revs = os.filter(o => ['open', 'offered'].includes(o.revision?.status)), revProducts = (S.products || []).filter(p => ['open', 'offered'].includes(p.revision?.status));
    const owing = cl.filter(c => c.outstanding > 0);
    const trialSoon = cl.filter(c => c.subscription?.status === 'trial' && c.subscription.trialDaysLeft !== null && c.subscription.trialDaysLeft >= 0 && c.subscription.trialDaysLeft <= 7);
    const subDue = cl.filter(c => (c.subscription?.status === 'trial' && c.subscription.trialEnded) || c.subscription?.status === 'overdue');
    const todo = [
      [pending.length, `order${pending.length === 1 ? '' : 's'} waiting to be processed`, 'data-go-filter="pending"', 'var(--orange)'],
      [follow.length, `order${follow.length === 1 ? '' : 's'} with unread client messages`, 'data-go-filter="followups"', 'var(--red)'],
      [revs.length, `order${revs.length === 1 ? '' : 's'} with a cost revision request`, 'data-go-filter="revision"', 'var(--orange)'],
      [revProducts.length, `product${revProducts.length === 1 ? '' : 's'} with a cost revision request`, 'data-go-tab="products"', 'var(--orange)'],
      [noCost.length, `order${noCost.length === 1 ? '' : 's'} still need product + shipping cost`, 'data-go-filter="needscost"', 'var(--gold)'],
      [noTrack.length, `order${noTrack.length === 1 ? '' : 's'} in processing without tracking`, 'data-go-filter="processing"', 'var(--blue)'],
      [trialSoon.length, `client${trialSoon.length === 1 ? '' : 's'} with the free month ending in the next 7 days`, 'data-go-tab="clients"', 'var(--gold)'],
      [subDue.length, `client${subDue.length === 1 ? '' : 's'} with the free month over or the subscription overdue`, 'data-go-tab="clients"', 'var(--red)'],
      [owing.length, `client${owing.length === 1 ? '' : 's'} with a balance to collect (${money(owing.reduce((t, c) => t + c.outstanding, 0))})`, 'data-go-tab="clients"', 'var(--red)'],
    ].filter(x => x[0] > 0);
    const monthStart = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000; })();
    const rows = cl.map(c => { const mine = os.filter(o => o.clientId === c.id); return { c, month: mine.filter(o => o.createdAt >= monthStart && o.status !== 'cancelled').length, open: mine.filter(o => ['pending', 'processing'].includes(o.status)).length, last: mine.reduce((m, o) => Math.max(m, o.createdAt), 0) }; })
      .sort((a, b) => b.last - a.last);
    const recent = os.slice(0, 6);
    // All clients together (Erwin, 27 Oct 2026): cancelled-order money, and money per month in a chart.
    const cx = S.ov.cancelled, PO = window.DLPayOrders, M = window.DLClientStoreMath;
    const cxStat = (k, v, note, cls = '') => `<div class="cx-stat ${cls}"><small>${k}</small><b data-no-i18n>${v}</b>${note ? `<em>${note}</em>` : ''}</div>`;
    const cxBox = cx && (cx.count || cx.refunded) ? `<section class="card card-pad cx-box ovw-cx" data-ovw-cancelled><div class="mc-head"><h3 class="sec-title">Cancelled orders, all clients</h3><span class="muted">${cx.clients.length === 1 ? '1 client' : cx.clients.length + ' clients'}</span></div>
      <div class="cx-stats">${cxStat('Cancelled orders', String(cx.count), cx.paidCount ? `${cx.paidCount} already paid` : '')}${cxStat('Paid for them', money(cx.paid))}${cxStat('Cancellation fees', money(cx.fees), '', cx.fees ? 'neg' : '')}${cxStat('Due back to clients', money(cx.dueBack), 'Paid minus fees')}${cxStat('Refunded', money(cx.refunded))}${cxStat('Kept as credit', money(cx.credit), 'Counts toward their next orders', cx.credit > 0 ? 'pos' : '')}</div>
      <div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">Cancelled</th><th class="num">Fees</th><th class="num">Due back</th><th class="num">Refunded</th><th class="num">Credit</th></tr></thead><tbody>${cx.clients.map(c => `<tr class="click" data-open-client="${c.clientId}" data-client-tab="payments" tabindex="0" title="Open this client's payments"><td class="wide"><b>${esc(c.name)}</b></td><td data-label="Cancelled" class="num">${c.count}</td><td data-label="Fees" class="num">${money(c.fees)}</td><td data-label="Due back" class="num">${money(c.dueBack)}</td><td data-label="Refunded" class="num">${money(c.refunded)}</td><td data-label="Credit" class="num ${c.credit > 0 ? 'pos' : ''}">${money(c.credit)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
    box.innerHTML = `<section class="card card-pad"><h3 class="sec-title">Needs your attention</h3>${todo.length ? `<div class="todo-list">${todo.map(([n, text, attr, tone]) => `<button type="button" class="todo" ${attr} style="--tone:${tone}"><b>${n}</b><span>${esc(text)}</span>${UI.svg(P.chev)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0">All caught up. Nothing is waiting on you.</p>'}</section>
      <section class="card card-pad mc" data-money-chart></section>${cxBox}
      <div class="ovw-grid"><section class="card"><div class="card-pad" style="padding-bottom:0"><h3 class="sec-title">Your clients</h3></div>${rows.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">This month</th><th class="num">Open</th><th class="num">Outstanding</th><th class="num">We earned</th><th>Last order</th></tr></thead><tbody>${rows.map(({ c, month, open, last }) => `<tr class="click" data-open-client="${c.id}" tabindex="0"><td class="wide"><div class="who"><span class="ava">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>@${esc(c.username)}</small>${c.pendingTransfers ? `<small>${c.pendingTransfers} transfer confirmation${c.pendingTransfers === 1 ? '' : 's'} waiting</small>` : ''}</div></div></td><td data-label="This month" class="num">${month}</td><td data-label="Open" class="num">${open}</td><td data-label="Outstanding" class="num ${c.outstanding > 0 ? 'neg' : ''}">${money(c.outstanding)}</td><td data-label="We earned" class="num">${money(c.ourShare)}</td><td data-label="Last order">${last ? esc(fullDate(last)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('No clients yet', 'Add your first client to give them portal access.', '<button type="button" class="btn btn-primary" data-add-account="client">Add client</button>')}</section>
      <section class="card"><div class="card-pad" style="padding-bottom:0"><h3 class="sec-title">Latest orders</h3></div>${recent.length ? `<div class="mini-orders" style="padding:0 16px 8px">${recent.map(o => `<button type="button" data-open-order="${o.id}"><span class="ord-cell">${o.photos?.length ? `<img class="ord-thumb" src="${photoUrl(o.id, o.photos[0].id, true)}" alt="" loading="lazy">` : '<span class="ord-thumb none">—</span>'}<span><b>${esc(orderName(o))}</b><small>${esc(clientName(o.clientId))} · ${esc(fullDate(o.createdAt))}</small></span></span>${UI.pill(o.status)}<span></span></button>`).join('')}</div>` : '<p class="muted card-pad" style="margin:0">No client orders yet.</p>'}</section></div>`;
    // Not paid yet per month: billed orders with no payment linked, by order date (as the "Not paid yet" card).
    const unpaid = new Map(); for (const o of os) if (!o.archived && PO.state(o) === 'unpaid') { const m = M.dateKey(o).slice(0, 7); unpaid.set(m, (unpaid.get(m) || 0) + PO.dueCents(o) / 100); }
    const months = (S.ov.months || []).map(r => ({ ...r, unpaid: Math.round((unpaid.get(r.month) || 0) * 100) / 100 }));
    for (const [m, v] of unpaid) if (!months.some(r => r.month === m)) months.push({ month: m, unpaid: v });
    window.DLMoneyChart.mount($('[data-money-chart]'), { title: 'Money by month, all clients', key: 'dl-admin-money', months, money, series: [
      { key: 'billed', label: 'Billed', tone: 'var(--gold)', note: 'What clients were billed for their orders (cancelled orders not counted)' },
      { key: 'paid', label: 'Paid', tone: 'var(--mint)', note: 'Payments received from clients' },
      { key: 'unpaid', label: 'Not paid yet', tone: 'var(--red)', note: 'Billed orders with no payment yet, by order month' },
      { key: 'earned', label: 'Our earnings', tone: 'var(--blue)', note: 'Our share of the fees on those orders' },
      { key: 'fees', label: 'Cancellation fees', tone: 'var(--orange)', note: 'Cancellation fees billed' },
      { key: 'refunds', label: 'Refunds', tone: 'var(--muted)', note: 'Money sent back to clients' }] });
  }

