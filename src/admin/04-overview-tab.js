  // ---------- overview tab: what needs doing for clients today ----------
  function renderOverview() {
    const box = $('[data-overview]'); if (!box) return;
    const os = S.orders, cl = S.ov.clients;
    const pending = os.filter(o => o.status === 'pending'), follow = os.filter(o => o.unreadMessages > 0);
    const noTrack = os.filter(o => o.status === 'processing' && !o.trackingNumber), noCost = os.filter(needsCost);
    const owing = cl.filter(c => c.outstanding > 0);
    const trialSoon = cl.filter(c => c.subscription?.status === 'trial' && c.subscription.trialDaysLeft !== null && c.subscription.trialDaysLeft >= 0 && c.subscription.trialDaysLeft <= 7);
    const subDue = cl.filter(c => (c.subscription?.status === 'trial' && c.subscription.trialEnded) || c.subscription?.status === 'overdue');
    const todo = [
      [pending.length, `order${pending.length === 1 ? '' : 's'} waiting to be processed`, 'data-go-filter="pending"', 'var(--orange)'],
      [follow.length, `order${follow.length === 1 ? '' : 's'} with unread client messages`, 'data-go-filter="followups"', 'var(--red)'],
      [noCost.length, `order${noCost.length === 1 ? '' : 's'} still need product + shipping cost`, 'data-go-filter="needscost"', 'var(--gold)'],
      [noTrack.length, `order${noTrack.length === 1 ? '' : 's'} in processing without tracking`, 'data-go-filter="processing"', 'var(--blue)'],
      [trialSoon.length, `client${trialSoon.length === 1 ? '' : 's'} with the free month ending in the next 7 days`, 'data-go-tab="clients"', 'var(--gold)'],
      [subDue.length, `client${subDue.length === 1 ? '' : 's'} with the free month over or the subscription overdue`, 'data-go-tab="clients"', 'var(--red)'],
      [owing.length, `client${owing.length === 1 ? '' : 's'} with a balance to collect (${money(owing.reduce((t, c) => t + c.outstanding, 0))})`, 'data-go-tab="clients"', 'var(--red)'],
    ].filter(x => x[0] > 0);
    const monthStart = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000; })();
    const rows = cl.map(c => { const mine = os.filter(o => o.clientId === c.id); return { c, month: mine.filter(o => o.createdAt >= monthStart && o.status !== 'cancelled').length, open: mine.filter(o => ['pending', 'processing'].includes(o.status)).length, last: mine.reduce((m, o) => Math.max(m, o.createdAt), 0) }; })
      .sort((a, b) => b.last - a.last);
    const recent = os.slice(0, 6);
    box.innerHTML = `<section class="card card-pad"><h3 class="sec-title">Needs your attention</h3>${todo.length ? `<div class="todo-list">${todo.map(([n, text, attr, tone]) => `<button type="button" class="todo" ${attr} style="--tone:${tone}"><b>${n}</b><span>${esc(text)}</span>${UI.svg(P.chev)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0">All caught up. Nothing is waiting on you.</p>'}</section>
      <div class="ovw-grid"><section class="card"><div class="card-pad" style="padding-bottom:0"><h3 class="sec-title">Your clients</h3></div>${rows.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th class="num">This month</th><th class="num">Open</th><th class="num">Outstanding</th><th class="num">We earned</th><th>Last order</th></tr></thead><tbody>${rows.map(({ c, month, open, last }) => `<tr class="click" data-open-client="${c.id}" tabindex="0"><td class="wide"><div class="who"><span class="ava">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>@${esc(c.username)}</small>${c.pendingTransfers ? `<small>${c.pendingTransfers} transfer confirmation${c.pendingTransfers === 1 ? '' : 's'} waiting</small>` : ''}</div></div></td><td data-label="This month" class="num">${month}</td><td data-label="Open" class="num">${open}</td><td data-label="Outstanding" class="num ${c.outstanding > 0 ? 'neg' : ''}">${money(c.outstanding)}</td><td data-label="We earned" class="num">${money(c.ourShare)}</td><td data-label="Last order">${last ? esc(fullDate(last)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('No clients yet', 'Add your first client to give them portal access.', '<button type="button" class="btn btn-primary" data-add-account="client">Add client</button>')}</section>
      <section class="card"><div class="card-pad" style="padding-bottom:0"><h3 class="sec-title">Latest orders</h3></div>${recent.length ? `<div class="mini-orders" style="padding:0 16px 8px">${recent.map(o => `<button type="button" data-open-order="${o.id}"><span class="ord-cell">${o.photos?.length ? `<img class="ord-thumb" src="${photoUrl(o.id, o.photos[0].id, true)}" alt="" loading="lazy">` : '<span class="ord-thumb none">—</span>'}<span><b>${esc(orderName(o))}</b><small>${esc(clientName(o.clientId))} · ${esc(fullDate(o.createdAt))}</small></span></span>${UI.pill(o.status)}<span></span></button>`).join('')}</div>` : '<p class="muted card-pad" style="margin:0">No client orders yet.</p>'}</section></div>`;
  }

