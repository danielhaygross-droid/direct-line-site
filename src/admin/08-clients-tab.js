  // ---------- clients tab ----------
  function archivedHTML() {
    const a = S.ov.archived || [];
    if (!a.length) return '';
    return `<details class="archived"><summary>Archived clients (${a.length})</summary><div class="acc-list" style="padding:0 16px 16px">${a.map(c => `<div><span class="ava">${esc(initials(c.name))}</span><span class="who" style="flex:1"><span><b>${esc(c.name)}</b><small>@${esc(c.username)} · ${c.orders} order${c.orders === 1 ? '' : 's'} · hidden from totals</small></span></span><button type="button" class="btn btn-sm" data-restore="${c.id}">Restore</button></div>`).join('')}</div></details>`;
  }
  // All clients' cancelled orders (Erwin, 27 Oct 2026): fees, refunds and credit. Under the clients table since 5 Nov 2026
  // (it is billing), not on the Overview.
  function cancelledBoxHTML() {
    const cx = S.ov.cancelled, PO = window.DLPayOrders;
    // Credit already taken off later bills and fees already paid clear (6 Nov 2026), per client as in their panel.
    const rows = (cx?.clients || []).map(r => { const c = clientOf(r.clientId); return { ...r, st: c ? PO.cxSettle(r, creditLeftC(c, r.feesOwed), c.outstanding) : PO.cxSettle(r) }; });
    const leftC = rows.reduce((n, r) => n + r.st.leftC, 0), usedC = rows.reduce((n, r) => n + r.st.usedC, 0), feesOpen = rows.some(r => r.st.feesOpen), settled = cx?.fees > 0 && !feesOpen;
    const cxStat = (k, v, note, cls = '') => `<div class="cx-stat ${cls}"><small>${k}</small><b data-no-i18n>${v}</b>${note ? `<em>${note}</em>` : ''}</div>`;
    const cxBox = cx && (cx.count || cx.refunded) ? `<section class="card card-pad cx-box ovw-cx" data-cancelled-all><div class="mc-head"><h3 class="sec-title">Cancelled orders, all clients</h3><span class="muted">${cx.clients.length === 1 ? '1 client' : cx.clients.length + ' clients'}</span></div>
      <div class="cx-stats">${cxStat('Cancelled orders', String(cx.count), cx.paidCount ? `${cx.paidCount} already paid` : '')}${cxStat('Paid for them', money(cx.paid))}${cxStat('Cancellation fees', money(cx.fees), settled ? 'Settled' : '', feesOpen ? 'neg' : '')}${cxStat('Due back to clients', money(cx.dueBack), 'Paid minus all fees')}${cxStat('Refunded', money(cx.refunded))}${cxStat('Credit left', money(leftC / 100), usedC ? `${money(usedC / 100)} used on their bills` : leftC ? 'Counts toward their next orders' : '', leftC > 0 ? 'pos' : '')}</div>
      <div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">Cancelled</th><th class="num">Fees</th><th class="num">Due back</th><th class="num">Refunded</th><th class="num">Credit left</th></tr></thead><tbody>${rows.map((c, i) => `<tr class="click" data-open-client="${c.clientId}" data-client-tab="payments"${i >= 5 && !S.cxAll ? ' hidden' : ''} tabindex="0" title="Open this client's payments"><td class="wide"><b>${esc(c.name)}</b></td><td data-label="Cancelled" class="num">${c.count}</td><td data-label="Fees" class="num">${money(c.fees)}</td><td data-label="Due back" class="num">${money(c.dueBack)}</td><td data-label="Refunded" class="num">${money(c.refunded)}</td><td data-label="Credit left" class="num ${c.st.leftC > 0 ? 'pos' : ''}">${money(c.st.leftC / 100)}${c.st.usedC ? `<small class="cx-used">${money(c.st.usedC / 100)} used</small>` : ''}</td></tr>`).join('')}</tbody></table></div>${rows.length > 5 && !S.cxAll ? `<div class="panel-more"><button type="button" class="btn btn-sm" data-cx-all><span>Show all (${rows.length})</span></button></div>` : ''}</section>` : '';
    return cxBox;
  }
  function renderClients() {
    const q = S.cq.toLowerCase(), def = Number(S.ov.settings.commission_per_order);
    const lateIds = lateClientIds(); // red only when an unpaid order is over 14 days old (5 Nov 2026)
    const all = sortList(S.ov.clients.filter(c => !q || (c.name + ' ' + c.username).toLowerCase().includes(q)), 'admin-clients', CLIENT_SORTS);
    const list = all.slice(0, listShown('clients', S.cq));
    $('[data-list]').innerHTML = list.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">Orders</th><th class="num">Billed</th><th class="num" title="Billed minus our fee: the supplier's cost">Without our fee</th><th class="num">Paid</th><th class="num">Outstanding</th><th class="num">Our earnings</th><th class="num">Fee / order</th><th>Subscription</th><th>Status</th></tr></thead><tbody>
      ${list.map(c => `<tr class="click" data-open-client="${c.id}" tabindex="0">
        <td class="wide"><div class="who"><span class="ava">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>@${esc(c.username)}</small>${c.pendingTransfers ? `<small>${c.pendingTransfers} transfer confirmation${c.pendingTransfers === 1 ? '' : 's'} waiting</small>` : ''}</div></div></td>
        <td data-label="Orders" class="num">${c.orders}</td><td data-label="Billed" class="num">${money(c.billed)}</td><td data-label="Without our fee" class="num dim hide-sm">${money((c.billed || 0) - (c.ourShare || 0))}</td><td data-label="Paid" class="num">${money(c.paid)}</td>
        <td data-label="Outstanding" class="num ${c.outstanding > 0 && lateIds.has(c.id) ? 'neg' : ''}"><b><bdi>${money(c.outstanding)}</bdi></b></td><td data-label="Our earnings" class="num pos">${money(c.ourShare)}</td>
        <td data-label="Fee / order" class="num hide-sm">${money(c.commissionPerOrder ?? def)}${c.commissionPerOrder == null ? ' <span class="dim" style="font-size:12px">default</span>' : ''}</td>
        <td data-label="Subscription" class="sub-cell">${subPill(c.subscription)}</td>
        <td data-label="Status"${c.active ? ' class="hide-sm"' : ''}>${c.active ? '<span class="st st-delivered">Active</span>' : '<span class="st st-cancelled">Disabled</span>'}</td></tr>`).join('')}
      </tbody></table></div>${listMore('clients', list.length, all.length)}${archivedHTML()}` : empty(S.ov.clients.length ? 'No clients match' : 'No clients yet', S.ov.clients.length ? 'Try another search.' : 'Add a client account, then share the username and password with them.', '<button type="button" class="btn btn-primary" data-add-account="client">Add client</button>') + (list.length ? '' : archivedHTML());
    const slot = $('[data-cancelled-slot]'); if (slot) slot.innerHTML = cancelledBoxHTML();
  }

