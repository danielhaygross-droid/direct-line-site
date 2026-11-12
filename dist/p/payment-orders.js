/* Which orders a payment is for — shared by the admin dashboard and the client portal (Erwin, 21 Oct 2026).
   An order is paid while it is linked to a payment that is not archived (order.paymentId from the server).
   window.DLPayOrders:
     dueCents(order, adjustments) what the order adds to the bill, in cents (same rule as the balance)
     state(order, adjustments)    'paid' | 'unpaid' | 'unbilled' (nothing billed yet) | null (cancelled, nothing billed)
     creditCents(unpaid, balance) money the client already has with us that no order shows (cancelled-order credit, a
                                  payment bigger than its orders): unpaid orders minus the balance, never below 0
     checklist(opts)              tick boxes with a running total, compared with the form's amount field
     picked(form)                 the ticked order ids
     linked(opts)                 "For 40 orders · $1301.00" with the orders listed, for a recorded payment */
(function (root) {
  const cents = n => Math.round(Number(n || 0) * 100);
  const adjOf = (adjustments, id) => (adjustments || []).filter(a => Number(a.orderId) === Number(id)).reduce((n, a) => n + cents(a.amount), 0);
  const dueCents = (o, adjustments) => (o.status === 'cancelled' ? 0 : cents(o.price)) + adjOf(adjustments, o.id);
  // A cancelled order's fee taken from the client's cancellation credit counts as paid (server: paidFromCredit).
  const state = (o, adjustments) => o.paymentId || o.paidFromCredit ? 'paid' : dueCents(o, adjustments) > 0 ? 'unpaid' : o.status === 'cancelled' ? null : 'unbilled';
  const fmt = c => (c < 0 ? '-$' : '$') + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const he = () => root.DLi18n?.lang === 'he';
  // "14 Oct 2026" from 'YYYY-MM-DD' or from seconds, in the page language.
  const day = v => {
    const k = typeof v === 'number' ? new Date(v * 1000).toISOString().slice(0, 10) : String(v || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(k) ? new Date(k + 'T12:00:00').toLocaleDateString(he() ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : k;
  };
  // Small "Paid" / "Not paid" tag for order lists (nothing for orders with no bill yet); line = on its own line (table cells).
  // Refunded (Erwin, 29 Oct 2026): a cancelled order the client had paid for (a linked payment), like the sheet.
  const tag = (o, adjustments, line = false) => { const s = state(o, adjustments), t = o.status === 'cancelled' && o.paymentId ? '<span class="pay-tag refunded">Refunded</span>' : s === 'paid' ? '<span class="pay-tag paid">Paid</span>' : s === 'unpaid' ? (o.coveredByCredit ? '<span class="pay-tag credit">Covered by credit</span>' : '<span class="pay-tag unpaid">Not paid</span>') : ''; return t && line ? `<div class="pay-line">${t}</div>` : t; };
  const orderWord = n => n === 1 ? 'order' : 'orders';

  // Erwin, 5 Nov 2026 (Balance due lower than "Send the total"): what the client already has with us and
  // no order shows is taken off what they still have to send, so the pay box and the balance give the same number.
  const creditCents = (unpaidCents, balance) => Math.max(0, Math.round(unpaidCents) - cents(balance));
  // Compares the amount with the ticked orders (minus the credit): '' when no amount or nothing ticked.
  function gapText(amountCents, sumCents, ticked, credit = 0) {
    if (!ticked || !(amountCents > 0)) return { text: '', tone: '' };
    const target = Math.max(0, sumCents - credit), what = credit > 0 ? 'the ticked orders minus credit' : 'the ticked orders';
    if (amountCents === target) return { text: `The amount matches ${what}.`, tone: 'ok' };
    return amountCents > target
      ? { text: `The amount is ${fmt(amountCents - target)} more than ${what}.`, tone: 'warn' }
      : { text: `The amount is ${fmt(target - amountCents)} less than ${what}.`, tone: 'warn' };
  }
  const sumText = (n, c) => n ? `${n} ${orderWord(n)} ticked · ${fmt(c)}` : 'No orders ticked';

  /* opts: { orders: orders to offer (already filtered, oldest first), checked: Set of ids, adjustments,
             orderName(o), dateOf(o), esc, amount (number, for the first summary), compare (default true),
             empty: text when there is nothing to tick, note: small text under the list } */
  function checklist(opts) {
    const { orders, checked = new Set(), adjustments = [], orderName, dateOf, esc, amount = 0, compare = true, empty = 'No orders waiting for payment.', note = '' } = opts;
    const credit = Math.max(0, Math.round(opts.credit || 0)), cr = credit ? ` data-credit="${credit}"` : '';
    if (!orders.length) return `<div class="po-box" data-po${compare ? ' data-po-compare' : ''}><p class="muted po-empty">${esc(empty)}</p></div>`;
    let n = 0, sum = 0;
    const rows = orders.map(o => {
      const due = dueCents(o, adjustments), on = checked.has(o.id);
      if (on) { n++; sum += due; }
      const tag = o.status === 'cancelled' ? '<span class="po-tag">Cancelled</span>' : '';
      return `<label class="po-row"><input type="checkbox" name="poOrder" value="${o.id}" data-cents="${due}"${on ? ' checked' : ''}><span class="po-main"><b data-no-i18n dir="auto">${esc(orderName(o))}</b><small><span data-no-i18n>${esc(dateOf(o))}</span>${o.buyerName ? ` · <span data-no-i18n>${esc(o.buyerName)}</span>` : ''}</small></span>${tag}<b class="po-amt">${fmt(due)}</b></label>`;
    }).join('');
    const gap = compare ? gapText(cents(amount), sum, n, credit) : { text: '', tone: '' };
    return `<div class="po-box" data-po${compare ? ' data-po-compare' : ''}${cr}>
      <div class="po-head"><b class="po-sum" data-po-sum>${sumText(n, sum)}</b><span class="po-tools">${compare ? '<button type="button" class="btn btn-sm" data-po-oldest title="Ticks the oldest orders first, as many as the amount covers">Tick oldest up to the amount</button>' : ''}<button type="button" class="btn btn-sm" data-po-all>Tick all</button><button type="button" class="btn btn-sm" data-po-none>Clear</button></span></div>
      <div class="po-list">${rows}</div>
      ${credit && compare ? `<p class="po-credit"><span>Credit on the account, taken off:</span> <b data-no-i18n><bdi dir="ltr">-${fmt(credit)}</bdi></b></p>` : ''}<p class="po-gap${gap.tone ? ' ' + gap.tone : ''}" data-po-gap>${gap.text}</p>${note ? `<p class="note po-note">${esc(note)}</p>` : ''}
    </div>`;
  }
  const picked = form => [...form.querySelectorAll('[name=poOrder]:checked')].map(i => Number(i.value));

  // Updates the running total and the comparison with the form's amount field.
  function refresh(box) {
    const on = [...box.querySelectorAll('[name=poOrder]:checked')], sum = on.reduce((n, i) => n + Number(i.dataset.cents || 0), 0);
    const s = box.querySelector('[data-po-sum]'); if (s) s.textContent = sumText(on.length, sum);
    const g = box.querySelector('[data-po-gap]'); if (!g) return;
    const amount = box.closest('form')?.querySelector('[name=amount]'), gap = box.hasAttribute('data-po-compare') ? gapText(cents(amount?.value), sum, on.length, Number(box.dataset.credit || 0)) : { text: '', tone: '' };
    g.textContent = gap.text; g.className = 'po-gap' + (gap.tone ? ' ' + gap.tone : '');
  }
  // Ticks the oldest orders (the list is oldest first) in order, and stops at the first one the amount doesn't cover,
  // so a newer order is never ticked while an older one stays unpaid.
  function tickOldest(box) {
    const amount = cents(box.closest('form')?.querySelector('[name=amount]')?.value);
    if (!(amount > 0)) { box.closest('form')?.querySelector('[name=amount]')?.focus(); return; }
    let left = amount + Number(box.dataset?.credit || 0), full = false;
    for (const i of box.querySelectorAll('[name=poOrder]')) { const c = Number(i.dataset.cents || 0); i.checked = !full && c <= left; if (i.checked) left -= c; else full = true; }
  }

  /* A recorded payment's orders. opts: { payment, orders (all of the client's orders), adjustments, orderName, esc, admin } */
  function linked(opts) {
    const { payment, orders, adjustments = [], orderName, esc, admin = false } = opts;
    const list = (payment.orderIds || []).map(id => orders.find(o => o.id === id)).filter(Boolean);
    if (!list.length) return admin ? '<span class="po-tag warn">Not linked to orders</span>' : '<span class="dim">—</span>';
    const sum = list.reduce((n, o) => n + dueCents(o, adjustments), 0), amount = cents(payment.amount);
    const gap = !admin ? '' : amount === sum ? '<span class="po-tag ok">Matches</span>' : amount > sum ? `<span class="po-tag warn">${fmt(amount - sum)} more than its orders</span>` : `<span class="po-tag warn">${fmt(sum - amount)} less than its orders</span>`;
    return `<details class="po-linked"><summary><span>For ${list.length} ${orderWord(list.length)} · ${fmt(sum)}</span> ${gap}</summary><div class="po-names">${list.map(o => `<span class="po-name"${o.id ? ` data-open-order="${o.id}"` : ''} data-no-i18n>${esc(orderName(o))}</span>`).join('')}</div></details>`;
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', e => {
      const m = e.target.closest?.('[data-cx-more]');
      if (m) { const box = m.closest('[data-cx-fold]') || m.closest('[data-cancelled-box]'), all = !box.classList.contains('cx-all'); box.classList.toggle('cx-all', all); m.textContent = all ? m.dataset.less : m.dataset.more; m.setAttribute('aria-expanded', String(all)); return; }
      const b = e.target.closest?.('[data-po-oldest],[data-po-all],[data-po-none]'); if (!b) return;
      const box = b.closest('[data-po]'); if (!box) return;
      e.preventDefault();
      if (b.hasAttribute('data-po-oldest')) tickOldest(box);
      else for (const i of box.querySelectorAll('[name=poOrder]')) i.checked = b.hasAttribute('data-po-all');
      refresh(box); box.closest('form')?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const onInput = e => {
      const form = e.target.closest?.('form'); if (!form) return;
      const boxes = form.querySelectorAll('[data-po]'); if (boxes.length) form.dataset.dirty = '1';
      for (const box of boxes) refresh(box);
    };
    document.addEventListener('change', onInput);
    document.addEventListener('input', onInput);
  }
  // Money on cancelled orders (Erwin, 27 Oct 2026): the same box for the admin (client panel > Money) and the client
  // (Payments). c = server cancelledSummary. admin: adds "Record refund" and Undo on refunds.
  // Settled money clears (Erwin, 6 Nov 2026: "cancellation fees to be cleared and the credits when they are all settled").
  // creditLeft (cents) = the credit still on the account (creditCents: unpaid orders minus the balance, as in the pay box);
  // what the cancelled orders left as credit beyond that was already taken off later bills ("used on … bills").
  // balance = the client's balance due: fees not taken from paid money are on the bill, so they are settled once it's paid.
  function cxSettle(c, creditLeft, balance) {
    const creditC = Math.max(0, cents(c.credit)), known = Number.isFinite(creditLeft);
    const leftC = known ? Math.min(creditC, Math.max(0, Math.round(creditLeft))) : creditC;
    const feesOpen = cents(c.fees) > 0 && cents(c.feesOwed ?? c.fees) > 0 && !(Number.isFinite(balance) && cents(balance) <= 0);
    return { known, leftC, usedC: creditC - leftC, feesOpen, feesSettled: cents(c.fees) > 0 && !feesOpen };
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const usd = n => fmt(cents(n));
  function cancelledBox(c, { admin = false, creditLeft, balance, unpaidC = 0 } = {}) {
    if (!c || (!c.count && !c.refunds?.length)) return '';
    const st = cxSettle(c, creditLeft, balance), left = st.leftC / 100;
    const FOLD = 5, more = n => he() ? `הצגת כל ${n} ההזמנות שבוטלו` : `Show all ${n} cancelled orders`, less = () => he() ? 'הצגת פחות' : 'Show fewer';
    const rows = c.orders.map((o, i) => `<tr${i >= FOLD ? ' class="cx-more"' : ''}><td><button type="button" class="link-btn" data-open-order="${o.id}"><bdi data-no-i18n>${esc(o.orderRef || '#' + o.id)}</bdi></button>${o.store ? `<small data-no-i18n>${esc(o.store)}</small>` : ''}</td>`
      + `<td class="num" data-no-i18n>${o.paid ? usd(o.paid) : '—'}</td><td class="num" data-no-i18n>${o.fee ? usd(o.fee) : '—'}</td><td class="num" data-no-i18n><b><bdi dir="ltr">${o.paid || o.fromCredit ? usd(o.back) : '—'}</bdi></b>${o.fromCredit ? `<small class="cx-from-credit">${he() ? 'מהזיכוי' : 'From credit'}</small>` : ''}</td></tr>`).join('');
    // Read as one calculation, top to bottom (Erwin, 9 Nov 2026: "I can't understand any of it" about six boxes side by
    // side). Every line is a real number of this box and the lines add up: paid - fees taken from it = due back;
    // due back - refunded - used on later bills = credit left. Fees not taken from paid money stay on the bill.
    const t2 = (en, hb) => (he() ? hb : en), sumC = (list, f) => list.reduce((n, o) => n + cents(f(o)), 0);
    const feesOwedC = Math.max(0, cents(c.feesOwed)), feesTakenC = cents(c.paid) - cents(c.dueBack);
    const bridgeC = st.known ? Math.min(st.leftC, Math.max(0, Math.round(unpaidC))) : 0;
    const calcLine = (label, amountC, note = '', cls = '') => `<div class="cx-line ${cls}"><span>${label}${note ? `<small>${note}</small>` : ''}</span><b><bdi dir="ltr">${fmt(amountC)}</bdi></b></div>`;
    const calc = `<p class="cx-count" data-no-i18n>${t2(`${c.count} cancelled ${c.count === 1 ? 'order' : 'orders'}${c.paidCount ? ` · ${c.paidCount} of them were already paid` : ''}`, `${c.count === 1 ? 'הזמנה אחת בוטלה' : `${c.count} הזמנות בוטלו`}${c.paidCount ? ` · ${c.paidCount} מהן כבר שולמו` : ''}`)}</p>`
      + `<div class="cx-calc" data-no-i18n>`
      + calcLine(t2('Paid for the cancelled orders', 'שולם על ההזמנות שבוטלו'), cents(c.paid))
      + calcLine(t2('− Cancellation fees', '− עמלות ביטול'), -feesTakenC, admin && c.kept ? t2(`includes ${usd(c.kept)} of our fee`, `כולל ${usd(c.kept)} מהעמלה שלנו`) : '')
      + calcLine(admin ? t2('= Due back to the client', '= מגיע ללקוח בחזרה') : t2('= Due back to you', '= מגיע לך בחזרה'), cents(c.dueBack), '', 'cx-total')
      + (cents(c.refunded) ? calcLine(admin ? t2('− Refunded to the client', '− הוחזר ללקוח') : t2('− Refunded to you', '− הוחזר לך'), -cents(c.refunded)) : '')
      + (st.known ? (st.usedC ? calcLine(admin ? t2('− Already used on their later bills', '− כבר נוצל בחשבונות הבאים שלו') : t2('− Already used on your later bills', '− כבר נוצל בחשבונות הבאים שלך'), -st.usedC) : '')
        + calcLine(t2('= Credit left', '= זיכוי שנשאר'), st.leftC, st.leftC > 0 && !bridgeC ? (admin ? t2('counts toward their next orders', 'נספר להזמנות הבאות שלו') : t2('counts toward your next orders', 'נספר להזמנות הבאות שלך')) : '', bridgeC ? 'cx-total' : 'cx-total cx-left')
        // Bridge to the account statement (12 Nov 2026): the credit first covers the orders not paid yet; what stays is the
        // statement's Credit, so the two numbers are visibly the same money.
        + (bridgeC ? calcLine(t2('− Covers the orders not paid yet', '− מכסה את ההזמנות שעוד לא שולמו'), -bridgeC) + calcLine(t2('= Credit on the account', '= זיכוי בחשבון'), st.leftC - bridgeC, admin ? t2('the same as the account statement', 'כמו בדף החשבון') : t2('counts toward your next orders', 'נספר להזמנות הבאות שלך'), 'cx-total cx-left') : '')
        : calcLine(t2('= Kept as credit', '= נשאר כזיכוי'), cents(c.credit), '', 'cx-total cx-left'))
      + (feesOwedC ? calcLine(t2('Fees still to pay (on the bill)', 'עמלות שעוד צריך לשלם (בחשבון)'), feesOwedC, '', 'cx-owed') : '')
      + `</div>`;
    // One short block per cancel date, newest first (Erwin, 9 Nov 2026: "accurately show both"): the day the orders were
    // cancelled (China / Manila time, like the sheet's Status changed). The admin also sees it without our fee, which is
    // what the supplier sheet's Billing tab shows.
    const groups = new Map(); for (const o of c.orders) { const k = o.day || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); }
    const days = [...groups].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
    // One short table row per date, newest 3 shown, older folded (Erwin, 10 Nov 2026: "are you planning to just stack this
    // every time we have canceled orders??"). Same numbers as before.
    const DFOLD = 3, lbl = { on: t2('Cancelled on', 'בוטל בתאריך'), n: t2('Orders', 'הזמנות'), paid: t2('Paid', 'שולם'), fee: t2('Fees (all orders)', 'עמלות (כל ההזמנות)'), back: t2('Back', 'חוזר'), left: t2('Credit left', 'זיכוי שנשאר') };
    // Credit still unused per cancel date (12 Nov 2026: Ada counted only the newest date's refund): refunds, credit used on
    // later bills and fee-only days eat the oldest dates first, so the column adds up to "Credit left".
    const leftByDay = new Map();
    if (st.known) { let eat = cents(c.refunded) + st.usedC + days.reduce((n, [, l]) => n + Math.max(0, -sumC(l, o => o.back)), 0);
      for (const [k, l] of [...days].reverse()) { const b = Math.max(0, sumC(l, o => o.back)), used = Math.min(b, eat); eat -= used; leftByDay.set(k, b - used); } }
    const money = (v, show = v) => (show ? `<bdi dir="ltr">${fmt(v)}</bdi>` : '—');
    const dayRow = ([k, list], i) => {
      // Erwin, 10 Nov 2026: "cancelation fees dont depend on wether the order is paid or not paid": the fees of ALL the
      // day's orders together, and back = paid - those fees (a fee the credit could not cover is on the bill instead).
      const paidL = list.filter(o => o.paid > 0);
      const pPaid = sumC(paidL, o => o.paid), allFee = sumC(list, o => o.fee), back = sumC(list, o => o.back), onBill = Math.max(0, allFee - (pPaid - back));
      const sPaid = sumC(paidL, o => o.supPaid), sFee = sumC(list, o => o.supFee);
      const ours = admin && paidL.length && paidL.every(o => o.supPaid > 0) && (pPaid !== sPaid || allFee !== sFee) ? `${t2('without our fee', 'בלי העמלה שלנו')}: <bdi dir="ltr">${fmt(sPaid)} · ${fmt(sFee)} · ${fmt(sPaid - sFee)}</bdi>` : '';
      const old = i >= DFOLD ? ' cx-old' : '';
      return `<tr class="cx-drow${ours ? ' has-ours' : ''}${old}" data-cx-date="${esc(k)}"><td data-label="${esc(lbl.on)}"><b>${k ? day(k) : '—'}</b></td>`
        + `<td data-label="${esc(lbl.n)}">${list.length}${paidL.length ? ` · ${t2(`${paidL.length} paid`, `${paidL.length} שולמו`)}` : ''}</td>`
        + `<td class="num" data-label="${esc(lbl.paid)}">${money(pPaid)}</td>`
        + `<td class="num cx-dfee" data-label="${esc(lbl.fee)}" data-cents="${allFee}">${money(allFee)}${onBill ? `<small>${t2(`${fmt(onBill)} on the bill`, `${fmt(onBill)} בחשבון`)}</small>` : ''}</td>`
        + `<td class="num" data-label="${esc(lbl.back)}"><b>${money(back, back || pPaid)}</b></td>`
        + (st.known ? `<td class="num cx-dleft" data-label="${esc(lbl.left)}" data-cents="${leftByDay.get(k) || 0}">${leftByDay.get(k) ? `<b class="pos">${money(leftByDay.get(k))}</b>` : `<span class="dim">${t2('used', 'נוצל')}</span>`}</td>` : '') + `</tr>`
        + (ours ? `<tr class="cx-ours-row${old}"><td colspan="${st.known ? 6 : 5}" class="wide"><small class="cx-ours">${ours}</small></td></tr>` : '');
    };
    const dMore = t2(`Show all ${days.length} dates`, `הצגת כל ${days.length} התאריכים`), dLess = t2('Show fewer', 'הצגת פחות');
    const byDate = days.length ? `<h4 class="cx-sub" data-no-i18n>${t2('By cancel date', 'לפי תאריך ביטול')}</h4><div class="cx-dates" data-cx-fold data-no-i18n><div class="table-wrap"><table class="tbl stack cx-dtable"><thead><tr><th>${lbl.on}</th><th>${lbl.n}</th><th class="num">${lbl.paid}</th><th class="num">${lbl.fee}</th><th class="num">${lbl.back}</th>${st.known ? `<th class="num">${lbl.left}</th>` : ''}</tr></thead><tbody>${days.map(dayRow).join('')}</tbody></table></div>`
      + `${days.length > DFOLD ? `<button type="button" class="btn btn-sm cx-more-btn" data-cx-more data-more="${esc(dMore)}" data-less="${esc(dLess)}" aria-expanded="false">${esc(dMore)}</button>` : ''}</div>` : '';
    const refunds = (c.refunds || []).map(r => `<div class="cx-refund"><span data-no-i18n>${day(r.refundedAt)}</span><b data-no-i18n>${usd(r.amount)}</b><span data-no-i18n>${esc([r.method, r.note].filter(Boolean).join(' · '))}</span>${admin ? `<button type="button" class="btn btn-sm btn-ghost" data-refund-undo="${r.id}">Undo</button>` : ''}</div>`).join('');
    return `<section class="card card-pad cx-box" data-cancelled-box><h3 class="sec-title">Cancelled orders</h3>
      ${calc}
      ${byDate}
      ${rows ? `<div class="table-wrap"><table class="tbl cx-table"><thead><tr><th>Order</th><th class="num">Paid</th><th class="num">Fee</th><th class="num">Back</th></tr></thead><tbody>${rows}</tbody></table></div>${c.orders.length > FOLD ? `<button type="button" class="btn btn-sm cx-more-btn" data-cx-more data-more="${esc(more(c.orders.length))}" data-less="${esc(less())}" aria-expanded="false">${esc(more(c.orders.length))}</button>` : ''}` : ''}
      ${refunds ? `<h4 class="cx-sub">Refunds</h4><div class="cx-refunds">${refunds}</div>` : ''}
      ${admin ? `<details class="cx-add"${c.credit > 0 ? '' : ''}><summary class="btn btn-sm">Record refund</summary><form class="form-grid" data-refund-form novalidate>
        <label class="field"><span>Amount (USD)</span><span class="money"><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${left > 0 ? left.toFixed(2) : ''}"></span></label>
        <label class="field"><span>Date</span><input name="date" type="date" value="${new Date().toLocaleDateString('en-CA')}"></label>
        <label class="field"><span>Method <small>optional</small></span><input name="method" maxlength="60" placeholder="e.g. Bank transfer"></label>
        <label class="field"><span>Note <small>optional</small></span><input name="note" maxlength="300"></label>
        <div class="full form-actions"><button class="btn btn-primary" type="submit">Save refund</button><p class="form-msg" data-refund-msg></p></div></form></details>` : ''}
    </section>`;
  }
  // ---------- Account statement (Erwin, 12 Nov 2026: "the money flows are all over the place") ----------
  // One rule everywhere: balance = billed - received. Above 0 the client still has to pay; below 0 it is credit.
  // cover(): unpaid orders the client's credit already pays for, oldest first (whole orders only). Those orders are not
  // owed, so they show "Covered by credit" and stay out of "Not paid". extraOwedC: unpaid fees not in `orders` (admin lists).
  const oldestFirst = (a, b) => { const k = root.DLClientStoreMath?.dateKey || (o => o.orderDate || ''); return String(k(a)).localeCompare(String(k(b))) || (a.createdAt || 0) - (b.createdAt || 0) || a.id - b.id; };
  function cover(orders, adjustments, balance, extraOwedC = 0) {
    const unpaid = (orders || []).filter(o => !o.archived && state(o, adjustments) === 'unpaid').sort(oldestFirst);
    const unpaidC = unpaid.reduce((n, o) => n + dueCents(o, adjustments), 0), owedC = Math.max(0, cents(balance));
    let pool = Math.max(0, unpaidC + Math.max(0, Math.round(extraOwedC || 0)) - owedC), coveredC = 0; const ids = new Set();
    for (const o of unpaid) { const d = dueCents(o, adjustments); if (d > pool) break; pool -= d; coveredC += d; ids.add(o.id); }
    return { ids, unpaid, unpaidC, coveredC, owedC, creditC: Math.max(0, -cents(balance)), toPay: unpaid.filter(o => !ids.has(o.id)) };
  }
  // Sets o.coveredByCredit on every order. balanceOf(clientId) -> the client's balance; adjustmentsOf / extraOwedOf optional.
  function markCovered(orders, balanceOf, adjustmentsOf = () => [], extraOwedOf = () => 0) {
    const groups = new Map(); for (const o of orders || []) { const k = o.clientId ?? 0; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); }
    for (const [k, list] of groups) { const c = cover(list, adjustmentsOf(k), balanceOf(k), extraOwedOf(k)); for (const o of list) o.coveredByCredit = c.ids.has(o.id); }
    return orders;
  }
  // Still owed: not paid and not covered by credit.
  const owes = (o, adjustments) => state(o, adjustments) === 'unpaid' && !o.coveredByCredit;
  // What an order costs without our fee (admin): the supplier's cost, else the price minus our fee.
  const supCents = o => o.supplierCost == null ? cents(o.price) - cents(o.commission) : cents(o.supplierCost);
  // The statement card. opts: { summary (billed, paid, refunded, outstanding, parts, supplier), orders (the client's, not
  // archived), adjustments, cancelled (cancelledSummary), payments (count), admin, extraOwedC }.
  // Clients never get the "without our fee" column (summary.supplier is not sent to them).
  function statement(opts) {
    const { summary: s, orders = [], adjustments = [], cancelled: c, payments = 0, admin = false } = opts;
    if (!s) return '';
    const T = (en, hb) => (he() ? hb : en), sup = admin ? s.supplier : null, parts = s.parts || { orders: s.billed, fees: 0, other: 0 };
    const cov = cover(orders, adjustments, s.outstanding, opts.extraOwedC), bal = cents(s.outstanding), recv = cents(s.paid) - cents(s.refunded);
    const live = orders.filter(o => !o.archived && o.status !== 'cancelled'), paidL = live.filter(o => state(o, adjustments) === 'paid'), noBill = live.filter(o => state(o, adjustments) === 'unbilled');
    const covL = cov.unpaid.filter(o => cov.ids.has(o.id)), billedN = live.length - noBill.length, sumOf = (l, f) => l.reduce((n, o) => n + f(o), 0);
    const m = v => `<bdi dir="ltr">${fmt(v)}</bdi>`, n1 = (k, one, many, hOne, hMany) => T(`${k} ${k === 1 ? one : many}`, k === 1 ? hOne : `${k} ${hMany}`);
    const row = (label, a, b, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="num">${m(a)}</td>${sup ? `<td class="num acct-sup">${b == null ? '' : m(b)}</td>` : ''}</tr>`;
    const head = title => `<tr class="acct-h"><th>${title}</th><th class="num">${sup ? T('With our fee', 'עם העמלה שלנו') : ''}</th>${sup ? `<th class="num acct-sup">${T('Without our fee', 'בלי העמלה שלנו')}</th>` : ''}</tr>`;
    const result = bal > 0 ? { cls: 'neg', word: T('To pay', 'לתשלום'), sub: admin ? T('The client still has to send this.', 'הלקוח עדיין צריך לשלוח את הסכום הזה.') : T('Please send this to Direct Line.', 'נא לשלוח את הסכום הזה ל-Direct Line.') }
      : bal < 0 ? { cls: 'pos', word: T('Credit', 'זיכוי'), sub: admin ? T('The client owes nothing. This counts toward their next orders.', 'הלקוח לא חייב דבר. הסכום נספר להזמנות הבאות שלו.') : T('You owe nothing. This counts toward your next orders.', 'אינכם חייבים דבר. הסכום נספר להזמנות הבאות שלכם.') }
      : { cls: '', word: T('All paid', 'הכול שולם'), sub: admin ? T('Billed and received are equal.', 'החיוב והתשלומים שווים.') : T('You’re all paid up.', 'שילמתם הכול.') };
    const supBal = sup ? cents(sup.balance) : 0;
    const billedRows = row(n1(billedN, 'order', 'orders', 'הזמנה אחת', 'הזמנות'), cents(parts.orders), sup && cents(sup.orders))
      + (cents(parts.fees) || c?.count ? row(T('Cancellation fees', 'עמלות ביטול') + (c?.count ? ` <small>(${n1(c.count, 'cancelled order', 'cancelled orders', 'הזמנה אחת שבוטלה', 'הזמנות שבוטלו')})</small>` : ''), cents(parts.fees), sup && cents(sup.fees)) : '')
      + (cents(parts.other) ? row(T('Other changes to the bill', 'שינויים אחרים בחשבון'), cents(parts.other), sup && cents(sup.other)) : '')
      + row(T('Total billed', 'סה״כ חויב'), cents(s.billed), sup && cents(sup.billed), 'acct-total');
    const recvRows = row(payments ? n1(payments, 'payment', 'payments', 'תשלום אחד', 'תשלומים') : T('Payments', 'תשלומים'), cents(s.paid), sup && cents(sup.received) + cents(s.refunded))
      + (cents(s.refunded) ? row(admin ? T('− Refunds we sent back', '− החזרים ששלחנו') : T('− Refunds sent back to you', '− החזרים שנשלחו אליכם'), -cents(s.refunded), sup && -cents(s.refunded)) : '')
      + row(admin ? T('Total received', 'סה״כ התקבל') : T('Total paid', 'סה״כ שולם'), recv, sup && cents(sup.received), 'acct-total');
    const word = v => (v > 0 ? T('To pay', 'לתשלום') : v < 0 ? T('Credit', 'זיכוי') : T('All paid', 'הכול שולם'));
    const resRow = `<tr class="acct-res ${result.cls}"><td>${admin ? T('3 · Billed − received', '3 · חויב − התקבל') : T('3 · Billed − paid', '3 · חויב − שולם')}</td><td class="num"><b>${word(bal)} ${m(Math.abs(bal))}</b></td>${sup ? `<td class="num acct-sup"><b>${word(supBal)} ${m(Math.abs(supBal))}</b></td>` : ''}</tr>`;
    const tile = (label, n, amount, note = '', cls = '') => `<div class="acct-tile ${cls}"><small>${label}</small><b>${n}</b>${amount == null ? '' : `<em>${m(amount)}</em>`}${note ? `<em class="acct-note">${note}</em>` : ''}</div>`;
    const noFee = v => `${T('without our fee', 'בלי העמלה שלנו')} ${m(v)}`;
    const tiles = tile(T('Paid orders', 'הזמנות ששולמו'), paidL.length, sumOf(paidL, o => cents(o.price)), sup ? noFee(sumOf(paidL, supCents)) : '', 'paid')
      + (covL.length ? tile(T('Covered by credit', 'מכוסות בזיכוי'), covL.length, cov.coveredC, sup ? noFee(sumOf(covL, supCents)) : T('nothing to send', 'אין מה לשלוח'), 'credit') : '')
      + (cov.toPay.length || bal > 0 ? tile(T('Still to pay', 'נותר לתשלום'), cov.toPay.length, Math.max(0, bal), sup ? noFee(Math.max(0, supBal)) : '', 'owed') : '')
      + (noBill.length ? tile(T('No bill yet', 'עוד אין חשבון'), noBill.length, null, T('waiting for the cost', 'ממתינות לעלות')) : '')
      + (c?.count ? tile(T('Cancelled', 'בוטלו'), c.count, null, c.paidCount ? T(`${c.paidCount} were paid`, `${c.paidCount} שולמו`) : '') : '');
    return `<section class="card card-pad acct${sup ? ' has-sup' : ''}" data-statement data-no-i18n>
      <div class="acct-top"><h3 class="sec-title">${T('Account statement', 'דף חשבון')}</h3><p class="acct-big ${result.cls}" data-statement-result>${result.word} ${m(Math.abs(bal))}</p><p class="acct-sub">${result.sub}</p></div>
      <div class="table-wrap"><table class="acct-tbl"><tbody>${head(admin ? T('1 · What we billed', '1 · מה חייבנו') : T('1 · What you were billed', '1 · מה חויבתם'))}${billedRows}${head(admin ? T('2 · What we received', '2 · מה קיבלנו') : T('2 · What you paid', '2 · מה שילמתם'))}${recvRows}${resRow}</tbody></table></div>
      ${sup ? `<p class="acct-hint">${T('“Without our fee” is how the supplier sheet counts. Our fee received so far:', '"בלי העמלה שלנו" הוא החישוב של גיליון הספק. העמלה שלנו שהתקבלה עד כה:')} ${m(cents(sup.ourFee))}</p>` : ''}
      <div class="acct-tiles">${tiles}</div></section>`;
  }
  root.DLPayOrders = { cancelledBox, cxSettle, dueCents, state, tag, day, checklist, picked, linked, refresh, tickOldest, creditCents, cover, markCovered, owes, statement, supCents };
})(typeof window !== 'undefined' ? window : globalThis);
