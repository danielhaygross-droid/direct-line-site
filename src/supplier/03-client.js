
  // ---------- one client: statement, how it adds up, payments, cancelled, not paid, cost changes, share ----------
  function statementHTML(c) {
    const s = c.statement, b = c.balance;
    const head = b > 0.004 ? `<span class="sp-stmt-v owe">${t('Still owes')} ${money(b)}</span>` : b < -0.004 ? `<span class="sp-stmt-v credit">${t('Credit')} ${money(-b)}</span>` : `<span class="sp-stmt-v">${t('All paid')} ${money(0)}</span>`;
    const say = b > 0.004 ? t('still owes this amount.') : b < -0.004 ? t('owes nothing. The credit counts toward their next orders.') : t('is all paid.');
    const live = c.ordersTotal - c.cancelledCount;
    return `<section class="card sp-card"><span class="sp-eyebrow">${t('Account statement')}</span>${head}<p class="sp-sub">${esc(c.name)} ${say}</p>
      <div class="sp-lines"><p class="sp-lh">1 · ${t('Orders and fees')}</p>
        <div><span>${live} ${t(live === 1 ? 'order' : 'orders')}</span><b>${money(s.orders)}</b></div>
        <div><span>${t('Cancellation fees')} <small>(${c.cancelledCount} ${t('cancelled')})</small></span><b>${money(s.cancelFees)}</b></div>
        ${Math.abs(s.other) > 0.004 ? `<div><span>${t('Other changes')}</span><b>${money(s.other)}</b></div>` : ''}
        <div class="tot"><span>${t('Total')}</span><b>${money(s.billed)}</b></div>
        <p class="sp-lh">2 · ${t('What the client paid for your part')}</p>
        <div class="tot"><span>${c.payments.length} ${t(c.payments.length === 1 ? 'payment' : 'payments')}</span><b>${money(s.paid)}</b></div>
        <div class="res ${b > 0.004 ? 'owe' : b < -0.004 ? 'credit' : ''}"><span>3 · ${t('Paid − orders and fees')}</span><b>${b > 0.004 ? t('Still owes') + ' ' + money(b) : b < -0.004 ? t('Credit') + ' ' + money(-b) : money(0)}</b></div></div></section>`;
  }
  function addsHTML(c) {
    const a = c.adds, row = (label, n, v, target) => `<a class="sp-add" href="#${target}"><span><u>${label}</u>${n != null ? `<small>${n} ${t(n === 1 ? 'order' : 'orders')}</small>` : ''}</span><b>${v}</b></a>`;
    return `<section class="card sp-card"><h2>${t('How the balance adds up')}</h2><p class="sp-sub">${t('The same amount, made from the blocks on this page.')}</p>
      <div class="sp-adds">${row(t('Orders not paid yet'), c.notPaid.length, money(a.notPaid), 'sp-notpaid')}
        ${row(t('Cost changed after payment'), c.costChanged.length, signed(a.costChanged), 'sp-changed')}
        ${row(t('Back from cancelled orders'), c.cancelledTotals.count, money(-a.cancelledBack), 'sp-cancelled')}
        ${Math.abs(a.other) > 0.004 ? `<div class="sp-add"><span>${t('Payments not matched to orders, earlier credit')}</span><b>${signed(a.other)}</b></div>` : ''}
        <div class="sp-add tot"><span>= ${c.balance < -0.004 ? t('Credit') : t('Still owes')}</span><b class="${c.balance < -0.004 ? 'mint' : c.balance > 0.004 ? 'red' : ''}">${money(Math.abs(c.balance))}</b></div></div></section>`;
  }
  function paymentsHTML(c) {
    const rows = c.payments.map(p => {
      const open = S.open.has(p.id), cx = p.orders.filter(o => o.cancelled).length;
      return `<tr><td>${esc(fmtDay(p.paidAt))}</td><td class="num"><b>${money(p.yourPart)}</b></td><td class="dl">Direct Line</td>
        <td>${p.orders.length ? `<button type="button" class="btn btn-sm sp-exp" data-pay="${p.id}" aria-expanded="${open}">${ICON.next}${p.orders.length} ${t(p.orders.length === 1 ? 'order' : 'orders')}</button>${cx ? ` <small class="muted">${cx} ${t('cancelled')}</small>` : ''}` : '—'}
        ${open ? `<div class="sp-paid-list">${p.orders.map(o => `<div><span><b>${esc(o.ref)}</b>${o.cancelled ? ` <span class="sp-tag red">${t('Cancelled')}</span>` : ''}${o.item ? `<small>${esc(o.item)}</small>` : ''}</span><b>${money(o.cost)}</b></div>`).join('')}<p class="sp-note">${t('Cost when paid')}</p></div>` : ''}</td></tr>`;
    }).join('');
    const total = c.payments.reduce((n, p) => n + p.yourPart, 0);
    return `<section class="card sp-card"><div class="sp-card-h"><h2>${t('Payments')}</h2><b>${c.payments.length} ${t(c.payments.length === 1 ? 'payment' : 'payments')} · ${money(total - c.sentBack)}</b></div>
      <p class="sp-sub">${t('Payments Direct Line recorded for your part of this client’s orders. Open a payment to see the orders it paid.')}</p>
      ${c.payments.length ? `<div class="sp-table-wrap"><table class="sp-table sp-pay"><thead><tr><th>${t('Paid on')}</th><th class="num">${t('Paid for your part')}</th><th>${t('Recorded by')}</th><th>${t('Orders it paid')}</th></tr></thead><tbody>${rows}</tbody>
        <tfoot>${c.sentBack > 0.004 ? `<tr><td>${t('Sent back to the client')}</td><td class="num">${money(-c.sentBack)}</td><td></td><td></td></tr>` : ''}<tr><td><b>${t('Total')}</b></td><td class="num"><b>${money(total - c.sentBack)}</b></td><td></td><td></td></tr></tfoot></table></div>` : `<p class="sp-empty">${t('No payments yet.')}</p>`}</section>`;
  }
  function cancelledHTML(c) {
    const T = c.cancelledTotals;
    if (!T.count) return `<section class="card sp-card" id="sp-cancelled"><h2>${t('Cancelled orders')}</h2><p class="sp-empty">${t('No cancelled orders.')}</p></section>`;
    const days = c.cancelled.map(d => `<tr class="day"><td><b>${esc(fmtIsoDay(d.day))}</b></td><td>${d.orders.length} · ${d.orders.filter(o => o.paid).length} ${t('paid')}</td><td class="num">${d.paidFor ? money(d.paidFor) : '—'}</td><td class="num">${money(d.cancelFee)}</td><td class="num"><b>${money(d.back)}</b></td></tr>`
      + d.orders.map(o => `<tr class="sub"><td colspan="2">${esc(o.ref)}${o.store ? ' · ' + esc(o.store) : ''}${o.paid ? '' : ` <small class="muted">(${t('not paid')})</small>`}</td><td class="num">${o.paid ? money(o.paidFor) : '—'}</td><td class="num">${money(o.cancelFee)}</td><td class="num">${money(o.back)}${!o.paid && o.cancelFee ? `<small>${t('Fee added to the bill')}</small>` : ''}</td></tr>`).join('')).join('');
    return `<section class="card sp-card" id="sp-cancelled"><div class="sp-card-h"><h2>${t('Cancelled orders')}</h2><b>${t('Back to the client')} · ${money(T.back)}</b></div>
      <p class="sp-sub">${T.count} ${t('cancelled')} · ${T.paidCount} ${t('paid')}</p>
      <div class="sp-calc"><div><span>${t('Paid for the cancelled orders')}</span><b>${money(T.paidFor)}</b></div><div><span>− ${t('Cancellation fees')}</span><b>${money(-T.cancelFees)}</b></div>
        <div class="tot"><span>= ${t('Back to the client')}</span><b class="mint">${money(T.back)}</b></div><p class="sp-note">${t('Kept as credit on the client’s account (no money is sent back).')}</p></div>
      <p class="sp-lh">${t('By cancel date')}</p>
      <div class="sp-table-wrap"><table class="sp-table sp-cx"><thead><tr><th>${t('Cancelled on')}</th><th>${t('Orders')}</th><th class="num">${t('Paid for it')}</th><th class="num">${t('Cancellation fee')}</th><th class="num">${t('Refund')}</th></tr></thead>
        <tbody>${days}</tbody><tfoot><tr><td><b>${t('Total')}</b></td><td>${T.count}</td><td class="num">${money(T.paidFor)}</td><td class="num">${money(T.cancelFees)}</td><td class="num"><b>${money(T.back)}</b></td></tr></tfoot></table></div></section>`;
  }
  function notPaidHTML(c) {
    return `<section class="card sp-card" id="sp-notpaid"><div class="sp-card-h"><h2>${t('Orders not paid yet')}</h2><b>${money(c.notPaidSum)}</b></div><p class="sp-sub">${t('Billed to the client, no payment yet.')}</p>
      ${c.notPaid.length ? `<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>${t('Order')}</th><th>${t('Ordered')}</th><th class="num">${t('Your cost')}</th></tr></thead>
        <tbody>${c.notPaid.map(o => `<tr><td><b>${esc(o.ref)}</b>${o.item ? `<small>${esc(o.item)}</small>` : ''}</td><td>${esc(fmtDay(o.orderedAt))}</td><td class="num">${money(o.cost)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>${c.notPaid.length} ${t(c.notPaid.length === 1 ? 'order' : 'orders')}</b></td><td></td><td class="num"><b>${money(c.notPaidSum)}</b></td></tr></tfoot></table></div>` : `<p class="sp-empty">${t('Nothing open.')}</p>`}</section>`;
  }
  function changedHTML(c) {
    return `<section class="card sp-card" id="sp-changed"><div class="sp-card-h"><h2>${t('Cost changed after payment')}</h2><b>${signed(c.costChangedSum)}</b></div><p class="sp-sub">${t('The client paid the old cost. The difference is on this balance, so nobody has to find it by hand.')}</p>
      ${c.costChanged.length ? `<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>${t('Order')}</th><th class="num">${t('Paid cost')}</th><th class="num">${t('Cost now')}</th><th class="num">${t('Difference')}</th></tr></thead>
        <tbody>${c.costChanged.map(o => `<tr><td><b>${esc(o.ref)}</b>${o.item ? `<small>${esc(o.item)}</small>` : ''}</td><td class="num">${money(o.paidCost)}</td><td class="num">${money(o.costNow)}</td><td class="num"><b class="${o.difference > 0 ? 'red' : 'mint'}">${signed(o.difference)}</b><small>${t(o.difference > 0 ? 'Client owes it' : 'Credit for the client')}</small></td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>${c.costChanged.length} ${t(c.costChanged.length === 1 ? 'order' : 'orders')}</b></td><td></td><td></td><td class="num"><b>${signed(c.costChangedSum)}</b></td></tr></tfoot></table></div>` : `<p class="sp-empty">${t('No cost changes.')}</p>`}</section>`;
  }
  function clientHTML(c) {
    return `<a class="sp-backlink" href="#billing">${ICON.back}${t('All clients')}</a>
      <div class="sp-head"><div><h1>${esc(c.name)}</h1><p class="sp-upd">${countLine(c)} · ${t('Updated')} ${esc(fmtTime(S.clientAt))} ${t('(China time)')}</p></div></div>
      <div class="sp-grid2">${statementHTML(c)}${addsHTML(c)}</div>
      ${paymentsHTML(c)}${cancelledHTML(c)}
      <div class="sp-grid2">${notPaidHTML(c)}${changedHTML(c)}</div>
      <section class="card sp-card"><h2>${t('Your supplier share for this client')}</h2><p class="sp-sub">${t('Only orders the client has paid count (bought orders).')} ${t('Not part of the client’s balance.')} ${t('Shown in Billing for all clients together.')}</p>
        <div class="sp-mini two"><div><small>${t('Orders counted')}</small><b>${c.share.counted}</b></div><div><small>${money(c.share.rate)} × ${t('orders')}</small><b>${money(c.share.amount)}</b></div></div></section>`;
  }
