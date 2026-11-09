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
  const tag = (o, adjustments, line = false) => { const s = state(o, adjustments), t = o.status === 'cancelled' && o.paymentId ? '<span class="pay-tag refunded">Refunded</span>' : s === 'paid' ? '<span class="pay-tag paid">Paid</span>' : s === 'unpaid' ? '<span class="pay-tag unpaid">Not paid</span>' : ''; return t && line ? `<div class="pay-line">${t}</div>` : t; };
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
      if (m) { const box = m.closest('[data-cancelled-box]'), all = !box.classList.contains('cx-all'); box.classList.toggle('cx-all', all); m.textContent = all ? m.dataset.less : m.dataset.more; m.setAttribute('aria-expanded', String(all)); return; }
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
  function cancelledBox(c, { admin = false, creditLeft, balance } = {}) {
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
    const calcLine = (label, amountC, note = '', cls = '') => `<div class="cx-line ${cls}"><span>${label}${note ? `<small>${note}</small>` : ''}</span><b><bdi dir="ltr">${fmt(amountC)}</bdi></b></div>`;
    const calc = `<p class="cx-count" data-no-i18n>${t2(`${c.count} cancelled ${c.count === 1 ? 'order' : 'orders'}${c.paidCount ? ` · ${c.paidCount} of them were already paid` : ''}`, `${c.count === 1 ? 'הזמנה אחת בוטלה' : `${c.count} הזמנות בוטלו`}${c.paidCount ? ` · ${c.paidCount} מהן כבר שולמו` : ''}`)}</p>`
      + `<div class="cx-calc" data-no-i18n>`
      + calcLine(t2('Paid for the cancelled orders', 'שולם על ההזמנות שבוטלו'), cents(c.paid))
      + calcLine(t2('− Cancellation fees', '− עמלות ביטול'), -feesTakenC, admin && c.kept ? t2(`includes ${usd(c.kept)} of our fee`, `כולל ${usd(c.kept)} מהעמלה שלנו`) : '')
      + calcLine(admin ? t2('= Due back to the client', '= מגיע ללקוח בחזרה') : t2('= Due back to you', '= מגיע לך בחזרה'), cents(c.dueBack), '', 'cx-total')
      + (cents(c.refunded) ? calcLine(admin ? t2('− Refunded to the client', '− הוחזר ללקוח') : t2('− Refunded to you', '− הוחזר לך'), -cents(c.refunded)) : '')
      + (st.known ? (st.usedC ? calcLine(admin ? t2('− Already used on their later bills', '− כבר נוצל בחשבונות הבאים שלו') : t2('− Already used on your later bills', '− כבר נוצל בחשבונות הבאים שלך'), -st.usedC) : '')
        + calcLine(t2('= Credit left', '= זיכוי שנשאר'), st.leftC, st.leftC > 0 ? (admin ? t2('counts toward their next orders', 'נספר להזמנות הבאות שלו') : t2('counts toward your next orders', 'נספר להזמנות הבאות שלך')) : '', 'cx-total cx-left')
        : calcLine(t2('= Kept as credit', '= נשאר כזיכוי'), cents(c.credit), '', 'cx-total cx-left'))
      + (feesOwedC ? calcLine(t2('Fees still to pay (on the bill)', 'עמלות שעוד צריך לשלם (בחשבון)'), feesOwedC, '', 'cx-owed') : '')
      + `</div>`;
    // One short block per cancel date, newest first (Erwin, 9 Nov 2026: "accurately show both"): the day the orders were
    // cancelled (China / Manila time, like the sheet's Status changed). The admin also sees it without our fee, which is
    // what the supplier sheet's Billing tab shows.
    const groups = new Map(); for (const o of c.orders) { const k = o.day || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); }
    const days = [...groups].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
    const dayCard = ([k, list]) => {
      const paidL = list.filter(o => o.paid > 0), openL = list.filter(o => !(o.paid > 0) && o.fee > 0);
      const pPaid = sumC(paidL, o => o.paid), pFee = sumC(paidL, o => o.fee), sPaid = sumC(paidL, o => o.supPaid), sFee = sumC(paidL, o => o.supFee), openFee = sumC(openL, o => o.fee), fromCr = sumC(openL.filter(o => o.fromCredit), o => o.fee);
      const head = t2(`${list.length} cancelled${paidL.length ? `, ${paidL.length} were paid` : ''}`, `${list.length} בוטלו${paidL.length ? `, ${paidL.length} שולמו` : ''}`);
      const ours = admin && paidL.length && paidL.every(o => o.supPaid > 0) && (pPaid !== sPaid || pFee !== sFee) ? t2(`Without our fee (as in the supplier sheet): paid ${fmt(sPaid)} · fees ${fmt(sFee)} · refund ${fmt(sPaid - sFee)}`, `בלי העמלה שלנו (כמו בגיליון הספק): שולם ${fmt(sPaid)} · עמלות ${fmt(sFee)} · החזר ${fmt(sPaid - sFee)}`) : '';
      const lines = [
        paidL.length ? t2(`Paid ${fmt(pPaid)} · fees ${fmt(pFee)} · back ${fmt(pPaid - pFee)}`, `שולם ${fmt(pPaid)} · עמלות ${fmt(pFee)} · חוזר ${fmt(pPaid - pFee)}`) : '',
        openL.length ? t2(`${openL.length} not paid: fees ${fmt(openFee)}${fromCr === openFee ? ' (taken from credit)' : fromCr ? ` (${fmt(fromCr)} taken from credit)` : ' (on the bill)'}`, `${openL.length} לא שולמו: עמלות ${fmt(openFee)}${fromCr === openFee ? ' (נלקח מהזיכוי)' : fromCr ? ` (${fmt(fromCr)} נלקח מהזיכוי)` : ' (בחשבון)'}`) : '',
      ].filter(Boolean);
      return `<div class="cx-date" data-cx-date="${esc(k)}" data-no-i18n><b>${k ? day(k) : '—'}</b><span class="cx-date-head">${head}</span>${lines.map(l => `<small>${esc(l)}</small>`).join('')}${ours ? `<small class="cx-ours">${esc(ours)}</small>` : ''}</div>`;
    };
    const byDate = days.length ? `<h4 class="cx-sub" data-no-i18n>${t2('By cancel date', 'לפי תאריך ביטול')}</h4><div class="cx-dates">${days.map(dayCard).join('')}</div>` : '';
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
  root.DLPayOrders = { cancelledBox, cxSettle, dueCents, state, tag, day, checklist, picked, linked, refresh, tickOldest, creditCents };
})(typeof window !== 'undefined' ? window : globalThis);
