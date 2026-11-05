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
  // Only what no other section shows (Erwin, 5 Nov 2026): the cards, the jobs and money by month. The client list and the
  // cancelled orders are in Clients & payments (and the cards' windows); the latest orders are Client orders and the bell.
  function renderOverview() {
    const box = $('[data-overview]'); if (!box) return;
    const todo = todoRows();
    box.innerHTML = `<section class="card card-pad"><h3 class="sec-title">Needs your attention</h3>${todo.length ? `<div class="todo-list">${todo.map(({ n, text, attrs, tone }) => `<button type="button" class="todo" ${attrs} style="--tone:${tone}"><b>${n}</b><span>${esc(text)}</span>${UI.svg(P.chev)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0">All caught up. Nothing is waiting on you.</p>'}</section>
      <section class="card card-pad mc" data-money-chart></section>`;
    // Three lines (Erwin, 5 Nov 2026): no "Unpaid orders" (the Not paid yet card explains it), no cancellation fees or refunds
    // (they are in Cancelled orders, all clients, in Clients & payments).
    // Our earnings = client fees + the supplier's own amount per paid, not cancelled order (Shahar, 5-6 Nov 2026), the same
    // rule as the Our earnings card (kpiFacts); per month by order date.
    const M = window.DLClientStoreMath, PO = window.DLPayOrders, rateC = Math.round(Number(S.ov.settings?.supplier_bonus_per_order ?? 1) * 100), sup = {};
    for (const o of S.orders) if (!o.archived && o.status !== 'cancelled' && PO.state(o) === 'paid') { const k = M.dateKey(o).slice(0, 7); sup[k] = (sup[k] || 0) + rateC; }
    const months = (S.ov.months || []).map(m => ({ ...m, earned: Math.round(Number(m.earned || 0) * 100 + (sup[m.month] || 0)) / 100 }));
    window.DLMoneyChart.mount($('[data-money-chart]'), { title: 'Money by month, all clients', key: 'dl-admin-money', months, money, series: [
      { key: 'billed', label: 'Billed', tone: 'var(--mc-gold)', note: 'What clients were billed for their orders (cancelled orders not counted)' },
      { key: 'paid', label: 'Paid', tone: 'var(--mc-teal)', note: 'Payments received from clients' },
      { key: 'earned', label: 'Our earnings', tone: 'var(--mc-blue)', note: 'Client fees on those orders, plus what the supplier pays us per paid order' }] });
  }

