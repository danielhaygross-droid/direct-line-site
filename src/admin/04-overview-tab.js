  // ---------- overview tab: what needs doing for clients today ----------
  // "Needs your attention": the jobs waiting, most urgent first. key = the job, so a card's button never repeats one
  // (cardActions in 02-card-window.js). Money owed is not a row here: it is the "Not paid yet" card (Erwin, 5 Nov 2026).
  function todoRows() {
    const os = S.orders, cl = S.ov.clients, n = (list, w) => `${w}${list.length === 1 ? '' : 's'}`;
    const pending = os.filter(o => o.status === 'pending'), follow = os.filter(o => o.unreadMessages > 0);
    const noTrack = os.filter(o => o.status === 'processing' && !o.trackingNumber), noCost = os.filter(needsCost), revs = os.filter(o => ['open', 'offered'].includes(o.revision?.status)), revProducts = (S.products || []).filter(p => ['open', 'offered'].includes(p.revision?.status));
    const trialSoon = cl.filter(c => c.subscription?.status === 'trial' && c.subscription.trialDaysLeft !== null && c.subscription.trialDaysLeft >= 0 && c.subscription.trialDaysLeft <= 7);
    const subDue = cl.filter(c => (c.subscription?.status === 'trial' && c.subscription.trialEnded) || c.subscription?.status === 'overdue');
    return [
      [pending, `${n(pending, 'order')} waiting to be processed`, 'data-go-filter="pending"', 'var(--orange)', 'job:pending'],
      [follow, `${n(follow, 'order')} with unread client messages`, 'data-go-filter="followups"', 'var(--red)', 'job:followups'],
      [revs, `${n(revs, 'order')} with a cost revision request`, 'data-go-filter="revision"', 'var(--orange)', 'job:revision'],
      [revProducts, `${n(revProducts, 'product')} with a cost revision request`, 'data-go-tab="products"', 'var(--orange)', 'job:product-revision'],
      [noCost, `${n(noCost, 'order')} still need product + shipping cost`, 'data-go-filter="needscost"', 'var(--gold)', 'job:needscost'],
      [noTrack, `${n(noTrack, 'order')} in processing without tracking`, 'data-go-filter="processing"', 'var(--blue)', 'job:notrack'],
      [trialSoon, `${n(trialSoon, 'client')} with the free month ending in the next 7 days`, 'data-go-tab="clients"', 'var(--gold)', 'job:plans'],
      [subDue, `${n(subDue, 'client')} with the free month over or the subscription overdue`, 'data-go-tab="clients"', 'var(--red)', 'job:plans'],
    ].filter(x => x[0].length > 0).map(([list, text, attrs, tone, key]) => ({ n: list.length, text, attrs, tone, key }));
  }
  // ---------- overview tab: what needs doing for clients today ----------
  // Only what no other section shows (Erwin, 5 Nov 2026): the jobs, money by month, cancelled orders. The client list is
  // Clients & payments (and the Clients card's window); the latest orders are Client orders and the bell.
  function renderOverview() {
    const box = $('[data-overview]'); if (!box) return;
    const todo = todoRows();
    // All clients together (Erwin, 27 Oct 2026): cancelled-order money, and money per month in a chart.
    const cx = S.ov.cancelled;
    const cxStat = (k, v, note, cls = '') => `<div class="cx-stat ${cls}"><small>${k}</small><b data-no-i18n>${v}</b>${note ? `<em>${note}</em>` : ''}</div>`;
    const cxBox = cx && (cx.count || cx.refunded) ? `<section class="card card-pad cx-box ovw-cx" data-ovw-cancelled><div class="mc-head"><h3 class="sec-title">Cancelled orders, all clients</h3><span class="muted">${cx.clients.length === 1 ? '1 client' : cx.clients.length + ' clients'}</span></div>
      <div class="cx-stats">${cxStat('Cancelled orders', String(cx.count), cx.paidCount ? `${cx.paidCount} already paid` : '')}${cxStat('Paid for them', money(cx.paid))}${cxStat('Cancellation fees', money(cx.fees), '', cx.fees ? 'neg' : '')}${cxStat('Due back to clients', money(cx.dueBack), 'Paid minus all fees')}${cxStat('Refunded', money(cx.refunded))}${cxStat('Kept as credit', money(cx.credit), 'Counts toward their next orders', cx.credit > 0 ? 'pos' : '')}</div>
      <div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">Cancelled</th><th class="num">Fees</th><th class="num">Due back</th><th class="num">Refunded</th><th class="num">Credit</th></tr></thead><tbody>${cx.clients.map(c => `<tr class="click" data-open-client="${c.clientId}" data-client-tab="payments" tabindex="0" title="Open this client's payments"><td class="wide"><b>${esc(c.name)}</b></td><td data-label="Cancelled" class="num">${c.count}</td><td data-label="Fees" class="num">${money(c.fees)}</td><td data-label="Due back" class="num">${money(c.dueBack)}</td><td data-label="Refunded" class="num">${money(c.refunded)}</td><td data-label="Credit" class="num ${c.credit > 0 ? 'pos' : ''}">${money(c.credit)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
    box.innerHTML = `<section class="card card-pad"><h3 class="sec-title">Needs your attention</h3>${todo.length ? `<div class="todo-list">${todo.map(({ n, text, attrs, tone }) => `<button type="button" class="todo" ${attrs} style="--tone:${tone}"><b>${n}</b><span>${esc(text)}</span>${UI.svg(P.chev)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0">All caught up. Nothing is waiting on you.</p>'}</section>
      <section class="card card-pad mc" data-money-chart></section>${cxBox}`;
    // No "Unpaid orders" line (Erwin, 5 Nov 2026): unpaid money is the Not paid yet card, explained in its window.
    const months = S.ov.months || [];
    window.DLMoneyChart.mount($('[data-money-chart]'), { title: 'Money by month, all clients', key: 'dl-admin-money', months, money, series: [
      { key: 'billed', label: 'Billed', tone: 'var(--mc-gold)', note: 'What clients were billed for their orders (cancelled orders not counted)' },
      { key: 'paid', label: 'Paid', tone: 'var(--mc-teal)', note: 'Payments received from clients' },
      { key: 'earned', label: 'Our earnings', tone: 'var(--mc-blue)', note: 'Our share of the fees on those orders' },
      { key: 'fees', label: 'Cancellation fees', tone: 'var(--mc-orange)', note: 'Cancellation fees billed' },
      { key: 'refunds', label: 'Refunds', tone: 'var(--mc-violet)', note: 'Money sent back to clients' }] });
  }

