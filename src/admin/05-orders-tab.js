  // ---------- orders tab ----------
  // What the client's customer paid; left blank by many clients (it's optional), so never shown as 0.00.
  const customerPaid = o => o.sellingPrice == null ? '<span class="dim">Not entered</span>' : `${esc(o.currency || 'USD')} ${Number(o.sellingPrice).toFixed(2)}`;
  // Not billed yet: no product cost or shipping fee, and no fixed unit quote (quoted orders are billed from the quote).
  const needsCost = o => o.status !== 'cancelled' && o.productCost == null && o.shippingFee == null && o.quotedUnitPrice == null;
  const matches = (o, f) => f === 'archived' ? o.archived : !o.archived && (f === 'all' || (f === 'followups' ? o.unreadMessages > 0 : f === 'needscost' ? needsCost(o) : o.status === f));
  function renderOrders() {
    const all = [...S.orders,...S.archivedOrders];
    const inClient = all.filter(o => !S.client || String(o.clientId) === S.client);
    const count = f => inClient.filter(o => matches(o, f)).length;
    const label = f => (f === 'archived' ? 'Archived orders' : f === 'all' ? 'All' : f === 'followups' ? 'New follow-ups' : f === 'needscost' ? 'Needs cost' : UI.LABEL[f]);
    $('[data-chips]').innerHTML = ['all', 'followups', 'needscost', ...STATUSES, 'archived'].filter(f => f === 'archived' || f === 'all' || count(f) || f === S.filter)
      .map(f => `<button type="button" class="chip t-${f}${f === 'followups' ? ' alert' : ''}${S.filter === f ? ' on' : ''}" data-filter="${f}">${f !== 'all' && f !== 'followups' ? '<i class="dot"></i>' : ''}${label(f)} <span>${count(f)}</span></button>`).join('');
    const sel = $('[data-client-filter]');
    sel.innerHTML = '<option value="">All clients</option>' + S.ov.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = S.client;
    const q = S.q.toLowerCase();
    const rows = inClient.filter(o => matches(o, S.filter) && (!q || [o.orderRef, o.trackingNumber, o.notes, o.destination, place(o.destination), clientName(o.clientId), o.itemTitle, o.sku, o.buyerName].join(' ').toLowerCase().includes(q)));
    // Bulk edit: only rows that are on screen can stay selected.
    const shown = new Set(rows.map(o => o.id)); for (const id of [...S.picked]) if (!shown.has(id)) S.picked.delete(id);
    const archivedView = S.filter === 'archived', allOn = rows.length > 0 && rows.every(o => S.picked.has(o.id));
    $('[data-list]').innerHTML = rows.length ? `${bulkBar(archivedView, allOn)}<div class="table-wrap"><table class="tbl stack"><thead><tr><th class="pick"></th><th>Client</th><th>Order</th><th>Destination</th><th class="num">Total</th><th>Status</th><th>Messages</th><th class="hide-sm"></th></tr></thead><tbody>
      ${rows.map(o => `<tr class="click${o.unreadMessages ? ' is-new' : ''}${S.picked.has(o.id) ? ' picked' : ''}" data-open-order="${o.id}" tabindex="0">
        <td class="pick"><input type="checkbox" data-pick="${o.id}" aria-label="Select ${esc(orderName(o))}"${S.picked.has(o.id) ? ' checked' : ''}></td>
        <td class="wide"><div class="who"><span class="ava">${esc(initials(clientName(o.clientId)))}</span><div><b>${esc(clientName(o.clientId))}</b><small>${esc(fullDate(o.createdAt))}</small></div></div></td>
        <td data-label="Order"><div class="ord-cell">${o.photos?.length ? `<img class="ord-thumb" src="${photoUrl(o.id, o.photos[0].id, true)}" alt="" loading="lazy">` : '<span class="ord-thumb none" title="No photo">—</span>'}<span class="t-main"><b>${esc(orderName(o))}</b>${o.itemTitle ? `<small>${esc(o.itemTitle)}</small>` : ''}<small class="mono">${esc(o.trackingNumber) || 'No tracking yet'}</small></span></div></td>
        <td data-label="Destination">${esc(place(o.destination))}</td>
        <td data-label="Total" class="num"><b>${money(o.price)}</b></td>
        <td data-label="Status"><select data-status="${o.id}" aria-label="Status of ${esc(orderName(o))}">${[o.status,...ADMIN_STATUSES.filter(s=>s!==o.status)].map(s => `<option value="${s}"${s === o.status ? ' selected' : ''}>${UI.LABEL[s]}</option>`).join('')}</select></td>
        <td data-label="Messages">${o.unreadMessages ? `<span class="unread-pill">${ic('chat')}${o.unreadMessages} new</span>` : o.messages ? `<span class="msgs">${ic('chat')}${o.messages}</span>` : '<span class="dim">—</span>'}</td>
        <td class="num hide-sm">${UI.svg(P.chev).replace('<svg', '<svg style="width:18px;height:18px;fill:none;stroke:var(--dim);stroke-width:2"')}</td></tr>`).join('')}
      </tbody></table></div>`
      : S.orders.length ? empty('No orders here', S.filter === 'followups' ? 'No unread follow-ups. You’re all caught up.' : S.filter === 'archived' ? 'No archived orders match this search.' : 'Try another filter or search.')
        : empty('No client orders yet', 'They show up here as soon as a client adds one in their portal. You can also add one for a client.', '<button type="button" class="btn btn-primary" data-new-order>New order</button>');
  }

