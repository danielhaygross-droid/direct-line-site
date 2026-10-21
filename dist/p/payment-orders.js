/* Which orders a payment is for — shared by the admin dashboard and the client portal (Erwin, 21 Oct 2026).
   An order is paid while it is linked to a payment that is not archived (order.paymentId from the server).
   window.DLPayOrders:
     dueCents(order, adjustments) what the order adds to the bill, in cents (same rule as the balance)
     state(order, adjustments)    'paid' | 'unpaid' | 'unbilled' (nothing billed yet) | null (cancelled, nothing billed)
     checklist(opts)              tick boxes with a running total, compared with the form's amount field
     picked(form)                 the ticked order ids
     linked(opts)                 "For 40 orders · $1301.00" with the orders listed, for a recorded payment */
(function (root) {
  const cents = n => Math.round(Number(n || 0) * 100);
  const adjOf = (adjustments, id) => (adjustments || []).filter(a => Number(a.orderId) === Number(id)).reduce((n, a) => n + cents(a.amount), 0);
  const dueCents = (o, adjustments) => (o.status === 'cancelled' ? 0 : cents(o.price)) + adjOf(adjustments, o.id);
  const state = (o, adjustments) => o.paymentId ? 'paid' : dueCents(o, adjustments) > 0 ? 'unpaid' : o.status === 'cancelled' ? null : 'unbilled';
  const fmt = c => (c < 0 ? '-$' : '$') + (Math.abs(c) / 100).toFixed(2);
  const he = () => root.DLi18n?.lang === 'he';
  // "14 Oct 2026" from 'YYYY-MM-DD' or from seconds, in the page language.
  const day = v => {
    const k = typeof v === 'number' ? new Date(v * 1000).toISOString().slice(0, 10) : String(v || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(k) ? new Date(k + 'T12:00:00').toLocaleDateString(he() ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : k;
  };
  // Small "Paid" / "Not paid" tag for order lists (nothing for orders with no bill yet); line = on its own line (table cells).
  const tag = (o, adjustments, line = false) => { const s = state(o, adjustments), t = s === 'paid' ? '<span class="pay-tag paid">Paid</span>' : s === 'unpaid' ? '<span class="pay-tag unpaid">Not paid</span>' : ''; return t && line ? `<div class="pay-line">${t}</div>` : t; };
  const orderWord = n => n === 1 ? 'order' : 'orders';

  // Compares the amount with the ticked orders: '' when no amount or nothing ticked.
  function gapText(amountCents, sumCents, ticked) {
    if (!ticked || !(amountCents > 0)) return { text: '', tone: '' };
    if (amountCents === sumCents) return { text: 'The amount matches the ticked orders.', tone: 'ok' };
    return amountCents > sumCents
      ? { text: `The amount is ${fmt(amountCents - sumCents)} more than the ticked orders.`, tone: 'warn' }
      : { text: `The amount is ${fmt(sumCents - amountCents)} less than the ticked orders.`, tone: 'warn' };
  }
  const sumText = (n, c) => n ? `${n} ${orderWord(n)} ticked · ${fmt(c)}` : 'No orders ticked';

  /* opts: { orders: orders to offer (already filtered, oldest first), checked: Set of ids, adjustments,
             orderName(o), dateOf(o), esc, amount (number, for the first summary), compare (default true),
             empty: text when there is nothing to tick, note: small text under the list } */
  function checklist(opts) {
    const { orders, checked = new Set(), adjustments = [], orderName, dateOf, esc, amount = 0, compare = true, empty = 'No orders waiting for payment.', note = '' } = opts;
    if (!orders.length) return `<div class="po-box" data-po${compare ? ' data-po-compare' : ''}><p class="muted po-empty">${esc(empty)}</p></div>`;
    let n = 0, sum = 0;
    const rows = orders.map(o => {
      const due = dueCents(o, adjustments), on = checked.has(o.id);
      if (on) { n++; sum += due; }
      const tag = o.status === 'cancelled' ? '<span class="po-tag">Cancelled</span>' : '';
      return `<label class="po-row"><input type="checkbox" name="poOrder" value="${o.id}" data-cents="${due}"${on ? ' checked' : ''}><span class="po-main"><b data-no-i18n>${esc(orderName(o))}</b><small><span data-no-i18n>${esc(dateOf(o))}</span>${o.buyerName ? ` · <span data-no-i18n>${esc(o.buyerName)}</span>` : ''}</small></span>${tag}<b class="po-amt">${fmt(due)}</b></label>`;
    }).join('');
    const gap = compare ? gapText(cents(amount), sum, n) : { text: '', tone: '' };
    return `<div class="po-box" data-po${compare ? ' data-po-compare' : ''}>
      <div class="po-head"><b class="po-sum" data-po-sum>${sumText(n, sum)}</b><span class="po-tools">${compare ? '<button type="button" class="btn btn-sm" data-po-oldest title="Ticks the oldest orders first, as many as the amount covers">Tick oldest up to the amount</button>' : ''}<button type="button" class="btn btn-sm" data-po-all>Tick all</button><button type="button" class="btn btn-sm" data-po-none>Clear</button></span></div>
      <div class="po-list">${rows}</div>
      <p class="po-gap${gap.tone ? ' ' + gap.tone : ''}" data-po-gap>${gap.text}</p>${note ? `<p class="note po-note">${esc(note)}</p>` : ''}
    </div>`;
  }
  const picked = form => [...form.querySelectorAll('[name=poOrder]:checked')].map(i => Number(i.value));

  // Updates the running total and the comparison with the form's amount field.
  function refresh(box) {
    const on = [...box.querySelectorAll('[name=poOrder]:checked')], sum = on.reduce((n, i) => n + Number(i.dataset.cents || 0), 0);
    const s = box.querySelector('[data-po-sum]'); if (s) s.textContent = sumText(on.length, sum);
    const g = box.querySelector('[data-po-gap]'); if (!g) return;
    const amount = box.closest('form')?.querySelector('[name=amount]'), gap = box.hasAttribute('data-po-compare') ? gapText(cents(amount?.value), sum, on.length) : { text: '', tone: '' };
    g.textContent = gap.text; g.className = 'po-gap' + (gap.tone ? ' ' + gap.tone : '');
  }
  // Ticks the oldest orders (the list is oldest first) in order, and stops at the first one the amount doesn't cover,
  // so a newer order is never ticked while an older one stays unpaid.
  function tickOldest(box) {
    const amount = cents(box.closest('form')?.querySelector('[name=amount]')?.value);
    if (!(amount > 0)) { box.closest('form')?.querySelector('[name=amount]')?.focus(); return; }
    let left = amount, full = false;
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
  root.DLPayOrders = { dueCents, state, tag, day, checklist, picked, linked, refresh, tickOldest };
})(typeof window !== 'undefined' ? window : globalThis);
