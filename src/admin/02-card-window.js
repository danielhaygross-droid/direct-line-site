  // ---------- Overview cards: a details window + one smart button (Erwin, 5 Nov 2026) ----------
  // A click on a card opens a window under it with the numbers behind the card (every list adds up to the card's number)
  // and one main button, picked by cardActions(). The window sits next to the cards (data-kpi-wrap), not inside them.
  let kpiWin = null; // the card whose window is open: 'clients' | 'orders' | 'unpaid' | 'earnings'
  const kwPlural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // Red only for late money (Erwin, 5 Nov 2026): an unpaid order is late after 14 days, the same rule as the client's own
  // reminder in the portal (src/portal/13-payments.js). Days by order date, counted the same way.
  const LATE_DAYS = 14, unpaidDays = o => Math.floor((Date.now() - Date.parse(window.DLClientStoreMath.dateKey(o) + 'T12:00:00Z')) / 864e5);
  const lateClientIds = () => new Set(S.orders.filter(o => !o.archived && window.DLPayOrders.owes(o) && !(unpaidDays(o) <= LATE_DAYS)).map(o => o.clientId));

  // Every number the four cards show, worked out once for the cards and for their windows.
  function kpiFacts() {
    const cl = S.ov.clients, M = window.DLClientStoreMath, UIS = window.DLClientStoreUI, PO = window.DLPayOrders;
    const cents = n => Math.round(Number(n || 0) * 100), feeC = o => cents(o.commission);
    const months = M.monthsOf(S.orders), month = months.includes(kpiMonth()) ? kpiMonth() : 'all', name = month === 'all' ? '' : UIS.monthName(month);
    const live = S.orders.filter(o => !o.archived), inMonth = month === 'all' ? live : live.filter(o => M.dateKey(o).slice(0, 7) === month);
    const os = inMonth.filter(o => o.status !== 'cancelled');
    // "Not paid yet" is what clients owe right now (billed orders with no payment linked), whatever month is picked.
    const unpaid = live.filter(o => PO.state(o) === 'unpaid'), owed = unpaid.reduce((n, o) => n + PO.dueCents(o), 0);
    const owing = new Set(unpaid.map(o => o.clientId)).size, oldest = unpaid.map(o => M.dateKey(o)).filter(Boolean).sort()[0];
    // Our earnings (Erwin, 4 Nov 2026): our fee on every order of the period, plus the fee we keep on a cancelled order the
    // client had paid; split into collected (paid orders), not paid yet, and not billed yet (no cost yet), which add up.
    // Since 8 Nov 2026 the admin picks it per order in the cancel window (keepFee: auto = only if paid, yes, no); a fee kept
    // on an order that was not paid is owed (in "not paid yet"), not collected (same rule as syncKeptFees on the server).
    const keptOn = inMonth.filter(o => o.status === 'cancelled' && cents(o.commission) > 0 && (o.keepFee === 'yes' || (o.keepFee !== 'no' && o.paymentId)));
    const keptC = keptOn.reduce((n, o) => n + feeC(o), 0), onOrdersC = os.reduce((n, o) => n + feeC(o), 0), feesC = onOrdersC + keptC;
    const keptOwedC = keptOn.filter(o => !o.paymentId).reduce((n, o) => n + feeC(o), 0);
    const collectedC = os.filter(o => PO.state(o) === 'paid').reduce((n, o) => n + feeC(o), 0) + keptC - keptOwedC;
    const noBillC = os.filter(o => PO.state(o) === 'unbilled').reduce((n, o) => n + feeC(o), 0);
    // Successful orders (Erwin/Shahar, 5 Nov 2026): not cancelled and paid by the client. The supplier pays us its own amount
    // for each of them ("two fees on all orders": the client's fee plus $1 from the supplier; Fees & settings sets it).
    const paidOs = os.filter(o => PO.state(o) === 'paid'), cxN = inMonth.length - os.length;
    const supRateC = cents(S.ov.settings?.supplier_bonus_per_order ?? 1), supC = paidOs.length * supRateC, totalC = feesC + supC;
    // What clients owe right now: each client's balance (unpaid orders minus credit and payments not linked to orders), and
    // that amount without our fee (admin only): minus our fee on the unpaid orders (credit lowers the supplier's part).
    const balanceC = cl.reduce((n, c) => n + Math.max(0, cents(c.outstanding)), 0);
    const unpaidFeeC = unpaid.reduce((n, o) => n + feeC(o), 0) + live.filter(o => o.status === 'cancelled' && !o.paymentId && o.keepFee === 'yes').reduce((n, o) => n + feeC(o), 0), feePartC = Math.min(unpaidFeeC, balanceC);
    const clientsN = month === 'all' ? cl.filter(c => c.active).length : new Set(os.map(o => o.clientId)).size;
    const lateIds = lateClientIds(), late = balanceC > 0 && f_late(cl, lateIds, cents);
    return { cl, M, PO, cents, feeC, months, month, name, live, inMonth, os, unpaid, owed, owing, oldest, keptOn, keptC, onOrdersC, feesC, collectedC, noBillC, paidOs, cxN, supRateC, supC, totalC, balanceC, feePartC, clientsN, lateIds, late };
  }

  // Late = a client who still owes money has an unpaid order older than 14 days.
  function f_late(cl, lateIds, cents) { return cl.some(c => lateIds.has(c.id) && cents(c.outstanding) > 0); }
  // A client's plan, when it needs the admin (the same rule as "Needs your attention").
  function planNote(c) {
    const s = c.subscription || {};
    if (s.status === 'overdue') return 'Subscription overdue';
    if (s.status !== 'trial') return '';
    if (s.trialEnded) return 'Free month over';
    const d = s.trialDaysLeft;
    return d === null || d === undefined || d < 0 || d > 7 ? '' : d === 0 ? 'Free month ends today' : d === 1 ? 'Free month ends tomorrow' : `Free month ends in ${d} days`;
  }

  // The one main button of each card (Erwin, 5 Nov 2026): the most urgent job behind that card's number, else the list that
  // explains the number. The first rule that matches wins, but a button never repeats a job of "Needs your attention" (the
  // list under the cards) or another card's button, so each button leads somewhere new. Cards are served most urgent
  // first: money owed, orders, earnings, clients. key = what the button does, used to spot repeats.
  function cardActions(f) {
    const owes = f.cl.filter(c => f.cents(c.outstanding) > 0).sort((a, b) => b.outstanding - a.outstanding);
    const sent = f.cl.filter(c => c.pendingTransfers > 0), nSent = sent.reduce((n, c) => n + c.pendingTransfers, 0);
    const toClient = (c, tab, label) => ({ label, name: c.name, key: 'client:' + c.id, attrs: `data-open-client="${c.id}" data-client-tab="${tab}"` });
    const rules = {
      unpaid: [
        // A client sent a transfer confirmation: check it first (recording it pays their orders).
        [nSent > 0, () => sent.length === 1 ? { ...toClient(sent[0], 'payments', `Check ${kwPlural(nSent, 'transfer confirmation')} from`) } : { label: `Check ${kwPlural(nSent, 'transfer confirmation')}`, key: 'job:transfers', attrs: 'data-go-tab="clients"' }],
        // One client owes: record their payment (opens their Payments with the form).
        [owes.length === 1, () => ({ label: 'Record payment from', name: owes[0].name, key: 'client:' + owes[0].id, attrs: `data-card-pay="${owes[0].id}"` })],
        [f.unpaid.length > 0, () => ({ label: 'Show unpaid orders', key: 'list:unpaid', attrs: 'data-go-filter="unpaid"' })],
      ],
      // The order jobs (waiting, need cost, no tracking, messages, revisions) are all in "Needs your attention".
      orders: [[true, () => ({ label: 'See all orders', key: 'list:orders', attrs: 'data-go-filter="all"' })]],
      earnings: [
        // Fees on orders with no cost can't be billed until the supplier adds the cost.
        [f.noBillC > 0, () => ({ label: 'See orders that need cost', key: 'job:needscost', attrs: 'data-go-filter="needscost"' })],
        [f.feesC - f.collectedC - f.noBillC > 0, () => ({ label: 'Show unpaid orders', key: 'list:unpaid', attrs: 'data-go-filter="unpaid"' })],
        [true, () => ({ label: 'See money by month', key: 'chart', attrs: 'data-card-scroll="chart"' })],
      ],
      clients: [
        [owes.length === 1, () => toClient(owes[0], 'orders', 'Go to')],
        [owes.length > 1, () => ({ label: 'See who owes', key: 'list:clients-owing', attrs: 'data-go-tab="clients"' })],
        [f.cl.some(planNote), () => ({ label: 'See plans that need you', key: 'job:plans', attrs: 'data-go-tab="clients"' })],
        [true, () => ({ label: 'See all clients', key: 'list:clients', attrs: 'data-go-tab="clients"' })],
      ],
    };
    const used = new Set(todoRows().map(r => r.key)), out = {};
    for (const k of ['unpaid', 'orders', 'earnings', 'clients']) {
      out[k] = rules[k].filter(([when]) => when).map(([, make]) => make()).find(a => !used.has(a.key)) || null;
      if (out[k]) used.add(out[k].key);
    }
    return out;
  }

  // Window parts. Labels are translated; amounts and client names are not (data-no-i18n).
  const kwRow = (op, label, value, meta = '', cls = '') => `<div class="kw-row${cls ? ' ' + cls : ''}"><span class="kw-op" aria-hidden="true">${op}</span><span class="kw-l"><span>${esc(label)}</span>${meta ? `<small>${esc(meta)}</small>` : ''}</span><b data-no-i18n>${value}</b></div>`;
  const kwItem = (attrs, name, meta, value, cls = '') => `<button type="button" class="kw-row kw-item" ${attrs}><span class="kw-op" aria-hidden="true"></span><span class="kw-l"><b data-no-i18n>${esc(name)}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span><b data-no-i18n class="${cls}">${value}</b></button>`;
  const kwBlock = (title, rows) => rows ? `<div class="kw-block">${title ? `<h4>${esc(title)}</h4>` : ''}${rows}</div>` : '';
  const kwMoney = c => money(c / 100);
  // Group orders by client: [{ c, list }] biggest first by the value given.
  const kwByClient = (orders, value) => [...new Set(orders.map(o => o.clientId))].map(id => ({ id, c: clientOf(id), list: orders.filter(o => o.clientId === id) }))
    .map(x => ({ ...x, v: value(x.list) })).sort((a, b) => b.v - a.v);

  function cardWindowBody(k, f) {
    if (k === 'unpaid') {
      if (!f.unpaid.length && !f.balanceC) return '<p class="muted kw-empty">Every billed order is paid</p>';
      const diff = f.owed - f.balanceC;
      const sum = kwRow('', 'Unpaid orders', kwMoney(f.owed), kwPlural(f.unpaid.length, 'order'))
        + (Math.abs(diff) >= 1 ? kwRow(diff > 0 ? '−' : '+', diff > 0 ? 'Credit and earlier payments' : 'Other amounts on the balance', kwMoney(Math.abs(diff))) : '')
        + kwRow('=', 'Clients owe now', kwMoney(f.balanceC), '', 'tot');
      const split = f.balanceC > 0 ? kwRow('', 'Without our fee', kwMoney(f.balanceC - f.feePartC)) + kwRow('+', 'Our fee', kwMoney(f.feePartC)) + kwRow('=', 'Total', kwMoney(f.balanceC), '', 'tot') : '';
      const owes = f.cl.filter(c => f.cents(c.outstanding) > 0).sort((a, b) => b.outstanding - a.outstanding);
      const clients = owes.map(c => {
        const mine = f.unpaid.filter(o => o.clientId === c.id), old = mine.map(o => f.M.dateKey(o)).filter(Boolean).sort()[0];
        return kwItem(`data-open-client="${c.id}" data-client-tab="payments"`, c.name, [mine.length ? kwPlural(mine.length, 'order') : '', old ? `oldest ${f.PO.day(old)}` : ''].filter(Boolean).join(' · '), kwMoney(f.cents(c.outstanding)), f.lateIds.has(c.id) ? 'neg' : '');
      }).join('');
      // How long the orders have been unpaid, by order date (before credit, so these add up to "Unpaid orders"); late in red.
      const ages = [['Up to 14 days', a => a <= 14, ''], ['15–30 days', a => a > 14 && a <= 30, 'late'], ['Over 30 days', a => !(a <= 30), 'late']].map(([label, test, cls]) => {
        const list = f.unpaid.filter(o => test(unpaidDays(o)));
        return list.length ? kwRow('', label, kwMoney(list.reduce((n, o) => n + f.PO.dueCents(o), 0)), kwPlural(list.length, 'order'), cls) : '';
      }).join('');
      return kwBlock('', sum) + kwBlock('Without our fee', split) + kwBlock('By client', clients) + kwBlock('How long unpaid (before credit)', ages);
    }
    if (k === 'orders') {
      if (!f.os.length) return '<p class="muted kw-empty">No orders yet</p>';
      const st = ['pending', 'processing', 'cancellation_requested', 'shipped', 'delivered'], n = s => f.os.filter(o => o.status === s).length;
      const other = f.os.filter(o => !st.includes(o.status)).length;
      const status = st.map(s => n(s) ? kwRow('', UI.LABEL[s], String(n(s))) : '').join('') + (other ? kwRow('', 'Other', String(other)) : '') + kwRow('=', 'Total', String(f.os.length), '', 'tot');
      // Successful orders = not cancelled and paid (what the supplier's $1 per order is counted on).
      const payState = kwRow('', 'Paid', String(f.paidOs.length), 'successful orders') + kwRow('+', 'Not paid yet', String(f.os.length - f.paidOs.length)) + kwRow('=', 'Total', String(f.os.length), 'cancelled not counted', 'tot');
      const per = kwByClient(f.os, l => l.length).map(x => kwItem(`data-open-client="${x.id}" data-client-tab="orders"`, x.c?.name || '—', '', String(x.v))).join('');
      const cx = f.inMonth.filter(o => o.status === 'cancelled').length;
      return kwBlock('By status', status) + kwBlock('Paid by the client', payState) + kwBlock('By client', per) + (cx ? `<p class="kw-note"><span>Cancelled orders, not counted above:</span> <b data-no-i18n>${cx}</b></p>` : '');
    }
    if (k === 'earnings') {
      if (!f.totalC) return '<p class="muted kw-empty">No fees yet</p>';
      const notPaid = f.feesC - f.collectedC - f.noBillC;
      const both = f.supC ? kwRow('', 'Client fees', kwMoney(f.feesC), kwPlural(f.os.length + f.keptOn.length, 'order')) + kwRow('+', 'From the supplier', kwMoney(f.supC), `${kwPlural(f.paidOs.length, 'paid order')} × ${kwMoney(f.supRateC)}`) + kwRow('=', 'Total', kwMoney(f.totalC), '', 'tot') : '';
      const sum = kwRow('', 'Collected', kwMoney(f.collectedC)) + kwRow('+', 'Not paid yet', kwMoney(notPaid)) + (f.noBillC ? kwRow('+', 'Not billed yet', kwMoney(f.noBillC), 'No cost yet, so not on a bill') : '') + kwRow('=', 'Total', kwMoney(f.feesC), '', 'tot');
      const from = f.keptC ? kwRow('', 'Our fee on orders', kwMoney(f.onOrdersC), kwPlural(f.os.length, 'order')) + kwRow('+', 'Fees kept on cancelled orders', kwMoney(f.keptC), kwPlural(f.keptOn.length, 'order')) + kwRow('=', 'Total', kwMoney(f.feesC), '', 'tot') : '';
      const per = kwByClient([...f.os, ...f.keptOn], l => l.reduce((t, o) => t + f.feeC(o) + (o.status !== 'cancelled' && f.PO.state(o) === 'paid' ? f.supRateC : 0), 0)).filter(x => x.v).map(x => kwItem(`data-open-client="${x.id}" data-client-tab="payments"`, x.c?.name || '—', kwPlural(x.list.length, 'order'), kwMoney(x.v))).join('');
      const supNote = f.supC ? `<p class="kw-note"><span>From the supplier: for each paid order that isn't cancelled. The supplier pays it, it's not on the client's bill.</span></p>` : '';
      return kwBlock('', both) + kwBlock(f.supC ? 'Client fees' : '', sum) + kwBlock('Where it comes from', from) + supNote + kwBlock('By client', per);
    }
    // Clients: all time = every active client, with what they owe and their plan; a month = clients with orders that month.
    if (f.month !== 'all') {
      const per = kwByClient(f.os, l => l.length).map(x => kwItem(`data-open-client="${x.id}" data-client-tab="orders"`, x.c?.name || '—', kwPlural(x.v, 'order'), '')).join('');
      return per ? kwBlock('', per) + `<p class="kw-note" data-kw-count><span>Clients with orders:</span> <b data-no-i18n>${f.clientsN}</b></p>` : '<p class="muted kw-empty">No orders yet</p>';
    }
    const active = f.cl.filter(c => c.active).sort((a, b) => b.outstanding - a.outstanding || String(a.name).localeCompare(String(b.name)));
    if (!active.length) return '<p class="muted kw-empty">No clients yet</p>';
    const orders = id => f.live.filter(o => o.clientId === id && o.status !== 'cancelled').length;
    const rows = active.map(c => kwItem(`data-open-client="${c.id}" data-client-tab="orders"`, c.name, [kwPlural(orders(c.id), 'order'), planNote(c)].filter(Boolean).join(' · '), f.cents(c.outstanding) > 0 ? kwMoney(f.cents(c.outstanding)) : '', f.lateIds.has(c.id) ? 'neg' : '')).join('');
    const off = f.cl.length - active.length;
    return kwBlock('', rows) + `<p class="kw-note" data-kw-count><span>Active clients:</span> <b data-no-i18n>${active.length}</b></p>` + (off ? `<p class="kw-note"><span>Disabled accounts, not counted:</span> <b data-no-i18n>${off}</b></p>` : '');
  }

  function cardWindowHTML(k, f, act) {
    const title = { clients: 'Clients', orders: f.month === 'all' ? 'Orders' : `Orders in ${f.name}`, unpaid: 'Not paid yet', earnings: f.month === 'all' ? 'Our earnings' : `Our earnings in ${f.name}` }[k];
    // A small link to the whole list, unless the main button already goes there.
    const more = { unpaid: f.unpaid.length ? { label: 'All unpaid orders', key: 'list:unpaid', attrs: 'data-go-filter="unpaid"' } : null, orders: { label: 'All orders', key: 'list:orders', attrs: 'data-go-filter="all"' },
      earnings: { label: 'Money by month', key: 'chart', attrs: 'data-card-scroll="chart"' }, clients: { label: 'All clients', key: 'list:clients', attrs: 'data-go-tab="clients"' } }[k];
    const main = act ? `<button type="button" class="btn btn-primary kw-go" ${act.attrs}><span>${esc(act.label)}</span>${act.name ? `<b data-no-i18n>${esc(act.name)}</b>` : ''}</button>` : '';
    const link = more && (!act || act.key !== more.key) ? `<button type="button" class="kw-more" ${more.attrs}>${esc(more.label)}</button>` : '';
    return `<div class="kw-head"><h3 id="kpi-win-h">${esc(title)}</h3><button type="button" class="kw-x" data-kw-close aria-label="Close">${UI.svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="kw-body">${cardWindowBody(k, f)}</div>${main || link ? `<div class="kw-foot">${main}${link}</div>` : ''}`;
  }

  function showCardWindow(k, focus) {
    const wrap = $('[data-kpi-wrap]'), card = wrap?.querySelector(`[data-kpi-card="${k}"]`); if (!card) return;
    const f = kpiFacts();
    let win = wrap.querySelector('[data-kpi-win]');
    if (!win) { wrap.insertAdjacentHTML('beforeend', '<div class="kpi-win" data-kpi-win id="kpi-win" role="dialog" aria-labelledby="kpi-win-h" tabindex="-1"></div>'); win = wrap.querySelector('[data-kpi-win]'); }
    win.dataset.kpiWin = k; win.innerHTML = cardWindowHTML(k, f, cardActions(f)[k]);
    kpiWin = k;
    for (const b of wrap.querySelectorAll('[data-kpi-card]')) b.setAttribute('aria-expanded', String(b === card));
    placeCardWindow();
    if (focus) win.focus({ preventScroll: true });
  }
  function closeCardWindow(back = true) {
    const wrap = $('[data-kpi-wrap]'), card = kpiWin && wrap?.querySelector(`[data-kpi-card="${kpiWin}"]`);
    kpiWin = null;
    wrap?.querySelector('[data-kpi-win]')?.remove();
    for (const b of wrap ? wrap.querySelectorAll('[data-kpi-card]') : []) b.setAttribute('aria-expanded', 'false');
    if (back && card) card.focus();
  }
  // Under its card, lined up with the card's start edge (right edge in Hebrew), and never wider than the cards. On a phone
  // (cards 2 by 2) it opens under all four cards, so it never covers one; the card that opened it is highlighted.
  function placeCardWindow() {
    const wrap = $('[data-kpi-wrap]'), win = wrap?.querySelector('[data-kpi-win]'), card = win && wrap.querySelector(`[data-kpi-card="${win.dataset.kpiWin}"]`); if (!card) return;
    const W = wrap.clientWidth, w = W < 640 ? W : Math.min(460, W), rtl = getComputedStyle(wrap).direction === 'rtl';
    const x = rtl ? card.offsetLeft + card.offsetWidth - w : card.offsetLeft;
    const grid = wrap.querySelector('[data-kpis]'), top = W < 640 ? grid.offsetTop + grid.offsetHeight : card.offsetTop + card.offsetHeight;
    Object.assign(win.style, { width: w + 'px', left: Math.max(0, Math.min(W - w, x)) + 'px', top: top + 8 + 'px' });
  }
  // Clicks for the card windows. Returns true when the click was only about the window.
  function cardWindowClick(t) {
    const card = t.closest('[data-kpi-card]');
    if (card) { if (kpiWin === card.dataset.kpiCard) closeCardWindow(); else showCardWindow(card.dataset.kpiCard, true); return true; }
    if (!t.closest('[data-kpi-win]')) return false;
    if (t.closest('[data-kw-close]')) { closeCardWindow(); return true; }
    const pay = t.closest('[data-card-pay]');
    if (pay) { closeCardWindow(false); payFrom(Number(pay.dataset.cardPay)); return true; }
    if (t.closest('[data-card-scroll]')) { closeCardWindow(false); $('[data-money-chart]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
    if (t.closest('button')) closeCardWindow(false); // a list or a client: the usual click handler opens it
    return false;
  }
  // "Record payment from …": the client's Payments, with the payment form open.
  async function payFrom(id) {
    await openClient(id, 'payments');
    if (S.drawer?.kind !== 'client' || S.drawer.id !== id) return;
    S.drawer.payNew = true; delete S.drawer.payEdit; delete S.drawer.payAttach;
    fillClient(clientOf(id), false);
    setTimeout(() => $('[data-pay-card]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  // Esc or a click anywhere else closes the window; it follows its card when the page changes width.
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && kpiWin) { e.stopPropagation(); closeCardWindow(); } }, true);
  document.addEventListener('click', e => { if (kpiWin && !e.target.closest?.('[data-kpi-win], [data-kpi-card]')) closeCardWindow(false); }, true);
  addEventListener('resize', () => { if (kpiWin) placeCardWindow(); });
