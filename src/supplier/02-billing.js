
  // ---------- Billing: balance per client + supplier share ----------
  const balCell = b => b > 0.004 ? `<span class="sp-bal owe"><small>${t('Still owes')}</small><b>${money(b)}</b></span>`
    : b < -0.004 ? `<span class="sp-bal credit"><small>${t('Credit')}</small><b>${money(-b)}</b></span>`
    : `<span class="sp-bal zero"><small>${t('All paid')}</small><b>${money(0)}</b></span>`;
  const countLine = c => `${c.ordersTotal} ${t(c.ordersTotal === 1 ? 'order' : 'orders')}${c.cancelledCount ? ` · ${c.cancelledCount} ${t('cancelled')}` : ''}`;
  const shareIntro = rate => lang === 'zh'
    ? `每个已购买的订单您付给 Direct Line ${money(rate)}。已取消的订单不算。您付的款由 Direct Line 记录。`
    : `You pay Direct Line ${money(rate)} for every order you bought. Cancelled orders don’t count. Direct Line records what you paid.`;
  function tileList(rows, tone) {
    return `<ul class="sp-tile-list ${tone}">${rows.map(c => `<li><span>${esc(c.name)}</span><b>${money(Math.abs(c.balance))}</b></li>`).join('')}</ul>`;
  }
  function billingHTML(d) {
    const T = d.totals, owe = d.clients.filter(c => c.balance > 0.004), cred = d.clients.filter(c => c.balance < -0.004), sh = d.share;
    const bar = owe.length > 1 ? `<div class="sp-split" aria-hidden="true">${owe.map(c => `<span style="flex:${Math.max(1, Math.round(c.balance * 100))}"></span>`).join('')}</div>` : '';
    const net = T.net;
    const rows = d.clients.map(c => `<tr data-client="${c.id}" tabindex="0">
        <td><b>${esc(c.name)}</b><small>${countLine(c)}</small></td><td class="num">${money(c.orders)}</td><td class="num">${money(c.cancelFees)}</td><td class="num">${money(c.paidForYourPart)}</td>
        <td class="num">${balCell(c.balance)}</td><td class="go">${ICON.next}</td></tr>`).join('');
    const cards = d.clients.map(c => `<button type="button" class="sp-ccard" data-client="${c.id}"><span class="sp-ccard-h"><span><b>${esc(c.name)}</b><small>${countLine(c)}</small></span>${balCell(c.balance)}</span>
        <span class="sp-ccard-n"><span><small>${t('Orders')}</small>${money(c.orders)}</span><span><small>${t('Cancellation fees')}</small>${money(c.cancelFees)}</span><span><small>${t('Paid for your part')}</small>${money(c.paidForYourPart)}</span></span></button>`).join('');
    const shareRows = d.clients.filter(c => c.share.counted).map(c => `<tr><td><b>${esc(c.name)}</b></td><td class="num">${c.share.counted}</td><td class="num">${money(c.share.amount)}</td></tr>`).join('');
    return `<div class="sp-head"><div><h1>${t('Billing')}</h1><p class="sp-intro">${t('What each client has paid for your part of their orders, and what is still open. Direct Line records the payments.')}</p>
        <p class="sp-upd">${t('Updated')} ${esc(fmtTime(d.updatedAt))} ${t('(China time)')}</p></div></div>
      <section class="sp-tiles">
        <div class="sp-tile dark"><span class="sp-tile-k">${t('Clients still owe')}</span><span class="sp-tile-v">${money(T.stillOwed)}</span>${bar}${owe.length ? tileList(owe, 'gold') : `<p class="sp-tile-n">${t('Nobody owes anything.')}</p>`}</div>
        <div class="sp-tile"><span class="sp-tile-k">${t('Credit for clients')}</span><span class="sp-tile-v mint">${money(T.credit)}</span>${cred.length ? tileList(cred, 'mint') : `<p class="sp-tile-n">${t('No client has credit.')}</p>`}</div>
        <div class="sp-tile"><span class="sp-tile-k">${t('Paid for your part so far')}</span><span class="sp-tile-v">${money(T.paidForYourPart)}</span><p class="sp-tile-n">${t('All payments, recorded by Direct Line')}</p></div>
      </section>
      <p class="sp-rule">${ICON.info}<span><b>${t('Credit = Paid − Orders − Cancellation fees.')}</b> ${t('Above zero, the client paid more than they owe and it counts toward their next orders. Below zero, the client still owes that amount.')}</span></p>
      <section class="card sp-card"><div class="sp-card-h"><h2>${t('Balance per client')}</h2><span class="muted">${t('Open a client to see every payment and order')}</span></div>
        ${d.clients.length ? `<div class="sp-table-wrap"><table class="sp-table sp-click"><thead><tr><th>${t('Client')}</th><th class="num">${t('Orders')}</th><th class="num">${t('Cancellation fees')}</th><th class="num">${t('Paid for your part')}</th><th class="num">${t('Still owes / credit')}</th><th></th></tr></thead>
          <tbody>${rows}</tbody><tfoot><tr><td><b>${t('All clients')}</b></td><td class="num">${money(T.orders)}</td><td class="num">${money(T.cancelFees)}</td><td class="num">${money(T.paidForYourPart)}</td>
          <td class="num">${net >= 0 ? `<span class="sp-bal owe"><small>${t('Net still owed')}</small><b>${money(net)}</b></span>` : `<span class="sp-bal credit"><small>${t('Net credit')}</small><b>${money(-net)}</b></span>`}</td><td></td></tr></tfoot></table></div>
          <div class="sp-cards">${cards}</div>
          <p class="sp-foot">${net >= 0 ? t('Net still owed') : t('Net credit')} ${money(Math.abs(net))} = ${money(T.stillOwed)} ${t('still owed')} − ${money(T.credit)} ${t('credit')}</p>` : `<p class="sp-empty">${t('No clients yet.')}</p>`}
      </section>
      <section class="card sp-card"><div class="sp-card-h"><h2>${t('Your supplier share')}</h2><span class="sp-due">${t('Still to pay Direct Line')} · <b class="${sh.stillToPay > 0.004 ? 'red' : ''}">${money(sh.stillToPay)}</b></span></div>
        <p class="sp-sub">${shareIntro(sh.rate)}</p>
        <div class="sp-mini"><div><small>${t('Orders counted')}</small><b>${sh.counted}</b><span>${t('Only orders the client has paid count (bought orders).')}</span></div>
          <div><small>${money(sh.rate)} × ${t('orders')}</small><b>${money(sh.amount)}</b></div>
          <div><small>${t('Paid to Direct Line')}</small><b>${money(sh.paid)}</b><span>${sh.lastPaidAt ? t('Last payment') + ' ' + esc(fmtDay(sh.lastPaidAt)) : t('No payment yet')}</span></div>
          <div><small>${t('Still to pay Direct Line')}</small><b class="${sh.stillToPay > 0.004 ? 'red' : ''}">${money(sh.stillToPay)}</b></div></div>
        ${shareRows ? `<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>${t('Client')}</th><th class="num">${t('Orders counted')}</th><th class="num">${t('Share')}</th></tr></thead><tbody>${shareRows}</tbody>
          <tfoot><tr><td><b>${t('All clients')}</b></td><td class="num">${sh.counted}</td><td class="num">${money(sh.amount)}</td></tr></tfoot></table></div>` : ''}
      </section>`;
  }
