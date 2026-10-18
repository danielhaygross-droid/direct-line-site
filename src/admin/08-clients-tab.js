  // ---------- clients tab ----------
  function archivedHTML() {
    const a = S.ov.archived || [];
    if (!a.length) return '';
    return `<details class="archived"><summary>Archived clients (${a.length})</summary><div class="acc-list" style="padding:0 16px 16px">${a.map(c => `<div><span class="ava">${esc(initials(c.name))}</span><span class="who" style="flex:1"><span><b>${esc(c.name)}</b><small>@${esc(c.username)} · ${c.orders} order${c.orders === 1 ? '' : 's'} · hidden from totals</small></span></span><button type="button" class="btn btn-sm" data-restore="${c.id}">Restore</button></div>`).join('')}</div></details>`;
  }
  function renderClients() {
    const q = S.cq.toLowerCase(), def = Number(S.ov.settings.commission_per_order);
    const list = S.ov.clients.filter(c => !q || (c.name + ' ' + c.username).toLowerCase().includes(q));
    $('[data-list]').innerHTML = list.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">Orders</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Outstanding</th><th class="num">Our earnings</th><th class="num">Fee / order</th><th>Subscription</th><th>Status</th></tr></thead><tbody>
      ${list.map(c => `<tr class="click" data-open-client="${c.id}" tabindex="0">
        <td class="wide"><div class="who"><span class="ava">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>@${esc(c.username)}</small>${c.pendingTransfers ? `<small>${c.pendingTransfers} transfer confirmation${c.pendingTransfers === 1 ? '' : 's'} waiting</small>` : ''}</div></div></td>
        <td data-label="Orders" class="num">${c.orders}</td><td data-label="Billed" class="num">${money(c.billed)}</td><td data-label="Paid" class="num">${money(c.paid)}</td>
        <td data-label="Outstanding" class="num ${c.outstanding > 0 ? 'neg' : ''}"><b>${money(c.outstanding)}</b></td><td data-label="Our earnings" class="num pos">${money(c.ourShare)}</td>
        <td data-label="Fee / order" class="num">${money(c.commissionPerOrder ?? def)}${c.commissionPerOrder == null ? ' <span class="dim" style="font-size:12px">default</span>' : ''}</td>
        <td data-label="Subscription" class="sub-cell">${subPill(c.subscription)}</td>
        <td data-label="Status">${c.active ? '<span class="st st-delivered">Active</span>' : '<span class="st st-cancelled">Disabled</span>'}</td></tr>`).join('')}
      </tbody></table></div>${archivedHTML()}` : empty(S.ov.clients.length ? 'No clients match' : 'No clients yet', S.ov.clients.length ? 'Try another search.' : 'Add a client account, then share the username and password with them.', '<button type="button" class="btn btn-primary" data-add-account="client">Add client</button>') + (list.length ? '' : archivedHTML());
  }

