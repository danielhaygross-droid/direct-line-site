/* Admin "Clients & orders": all client orders, clients, payments, fee settings.
   Runs inside the store dashboard (iframe). Order and client details open in a side panel. */
(function () {
  const MAX_PICKS = 8;
  const { api, money, esc, trackingUrl, renderLogin, quote, destinationPicker, categoryOptions, countryName, toast, shrinkImage, photoUrl, productMedia, RATES, COUNTRIES, $, $$ } = window.DL;
  const UI = window.DLOrderUI;
  const STATUSES = ['pending','processing','shipped','delivered','cancellation_requested','cancelled'];
  const ADMIN_STATUSES = ['processing','shipped','delivered'];
  const S = { ov: null, orders: [], archivedOrders: [], tab: 'overview', filter: null, q: '', client: '', cq: '', drawer: null, products:[], claims:[], claimFilter:'all', stores:[], period:'month', from:'', to:'' };
  const embedded = window.top !== window.self;
  const tell = m => { if (embedded) parent.postMessage(m, location.origin); };
  const P = {
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    orders: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5v11"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };
  const ic = n => UI.svg(P[n]);
  const place = d => (d ? countryName(d) : '—');
  const fullDate = sec => window.DL.displayTime(sec);
  const orderName = o => o.orderRef || 'Order #' + o.id;
  const clientOf = id => S.ov?.clients.find(c => c.id === Number(id));
  const clientName = id => clientOf(id)?.name || 'Client';
  const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const shortCat = c => ({ general: 'General goods', battery: 'Battery / sensitive', cosmetic: 'Cosmetics / liquids' }[c] || c || '—');
  const empty = (title, text, extra = '') => `<div class="empty"><span class="empty-ic">${ic('orders')}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra}</div>`;
  const divisor = () => Number(S.ov?.settings?.volumetric_divisor) || 6000;
  const unreadTotal = () => S.orders.reduce((t, x) => t + (x.unreadMessages || 0), 0);

  // ---------- boot ----------
  async function boot() {
    let me;
    try { me = await api('/me'); }
    catch (e) {
      if (e.status === 401 || e.status === 403) return renderLogin(document.body, { title: 'Admin sign in', subtitle: 'Direct Line team access.' });
      $('#boot').textContent = e.message; return;
    }
    if (me.role !== 'admin') { location.href = '/portal/'; return; }
    shell();
    await loadAll();
    $('#boot').remove(); $('#app').hidden = false;
    renderTab();
    addEventListener('message', onParentMessage);
    window.DLAdminReady = true;
    tell({ type: 'dl-admin-ready' });
    setInterval(poll, 20000);
    document.addEventListener('visibilitychange', poll);
  }

  async function loadAll() {
    const [ov, o, p, c, stores, archived] = await Promise.all([api('/admin/overview'), api('/admin/orders'),api('/admin/products'),api('/admin/claims'),api('/admin/client-stores'),api('/admin/orders?archived=1')]);
    S.ov = ov; S.orders = o.orders; S.archivedOrders = archived.orders; S.products=p.products; S.claims=c.claims;S.stores=stores.stores; window.DL.setRates(ov.rates);
    if (S.filter === null) S.filter = S.orders.some(x => x.status === 'cancellation_requested') ? 'cancellation_requested' : S.orders.some(x => x.unreadMessages) ? 'followups' : S.orders.some(x => x.status === 'pending') ? 'pending' : 'all';
    renderKpis();
    tell({ type: 'dl-followups', unread: unreadTotal() });
  }
  // Refresh lists without wiping what the admin is doing.
  async function poll() {
    if (document.hidden || !S.ov) return;
    const a = document.activeElement;
    const busy = a && a.matches('select, input, textarea') && !a.matches('[data-q],[data-cq]');
    try { await loadAll(); } catch (e) { return; }
    if (!busy) { renderList(); if (S.drawer?.kind==='client' && S.drawer.tab==='payments') await loadPayments(S.drawer.id); else refreshDrawer(); }
  }

  // ---------- layout ----------
  function shell() {
    $('#app').innerHTML = `
      <section class="adm-head"><div><p class="eyebrow">Direct Line clients</p><h1>Clients <span>&amp;</span> orders</h1><p>Every order your clients send in, what they owe, and what we earn.</p></div>
        <div class="adm-actions"><button type="button" class="btn" data-add-account="client">${ic('users')}Add client</button><button type="button" class="btn btn-primary" data-new-order>${ic('plus')}New order</button></div></section>
      <section class="kpis" data-kpis></section>
      <div class="seg" role="tablist">${[['overview', 'Overview'], ['orders', 'Orders'], ['clients', 'Clients'], ['claims','Claims'], ['products','Products'], ['settings', 'Fees & settings']].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}<span data-tab-badge="${k}"></span></button>`).join('')}</div>
      <section data-tab-body style="display:grid;gap:14px"></section>`;
    $('#app').addEventListener('click', onClick);
    $('#app').addEventListener('input', onInput);
    $('#app').addEventListener('change', onChange);
  }
  function renderKpis() {
    const t = S.ov.totals, cl = S.ov.clients;
    $('[data-kpis]').innerHTML = [
      ['Active clients', cl.filter(c => c.active).length, `${cl.length} account${cl.length === 1 ? '' : 's'}`, 'users', 'var(--blue)'],
      ['Client orders', S.orders.filter(o=>o.status!=='cancelled').length, `${S.orders.filter(o => o.status === 'pending').length} waiting to be processed`, 'orders', 'var(--orange)'],
      ['Outstanding', money(t.outstanding), `Billed ${money(t.billed)} · paid ${money(t.paid)}`, 'money', t.outstanding > 0 ? 'var(--red)' : 'var(--mint)'],
      ['Our earnings', money(t.ourShare), `Fees ${money(t.commission)} · supplier ${money(t.supplierShare)}`, 'check', 'var(--gold)'],
    ].map(([k, v, sub, icon, tone], i) => `<div class="stat${i === 3 ? ' hero' : ''}" style="--tone:${tone}"><span class="stat-ic">${ic(icon)}</span><small>${k}</small><strong>${v}</strong><em>${esc(sub)}</em></div>`).join('');
    const unread = S.orders.filter(o => o.unreadMessages).length;
    const b = $('[data-tab-badge="orders"]'); if (b) b.innerHTML = unread ? `<span class="badge-new">${unread}</span>` : '';
  }
  function renderTab() {
    $$('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === S.tab); b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)); });
    if(S.tab==='claims'){renderClaims();return;}
    if(S.tab==='products'){renderProducts();return;}
    const body = $('[data-tab-body]');
    if (S.tab === 'orders') {
      body.innerHTML = `<div class="bar"><div class="chips" data-chips></div><div class="bar-r"><select data-client-filter aria-label="Client"></select><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, tracking, client…" value="${esc(S.q)}" data-q></label></div></div>
        <section class="card" data-list></section>`;
    } else if (S.tab === 'clients') {
      body.innerHTML = `<div class="bar"><label class="search"><span class="sr">Search clients</span>${ic('search')}<input type="search" placeholder="Search clients…" value="${esc(S.cq)}" data-cq></label><button type="button" class="btn btn-primary" data-add-account="client">${ic('plus')}Add client</button></div>
        <section class="card" data-list></section>`;
    } else if (S.tab === 'overview') body.innerHTML = '<div class="ovw" data-overview></div>';
    else body.innerHTML = settingsHTML();
    renderList();
    if (S.tab === 'settings') bindSettings();
  }
  function renderList() {
    if(S.tab==='products'||S.tab==='claims')return;
    if (S.tab === 'orders') renderOrders();
    else if (S.tab === 'clients') renderClients();
    else if (S.tab === 'overview') renderOverview();
    else { const a = $('[data-admins]'); if (a) a.innerHTML = adminsHTML(); }
  }

  // ---------- overview tab: what needs doing for clients today ----------
  function renderOverview() {
    const box = $('[data-overview]'); if (!box) return;
    const os = S.orders, cl = S.ov.clients;
    const pending = os.filter(o => o.status === 'pending'), follow = os.filter(o => o.unreadMessages > 0);
    const noTrack = os.filter(o => o.status === 'processing' && !o.trackingNumber), noCost = os.filter(o => !['cancelled'].includes(o.status) && o.productCost == null && o.shippingFee == null);
    const owing = cl.filter(c => c.outstanding > 0);
    const trialSoon = cl.filter(c => c.subscription?.status === 'trial' && c.subscription.trialDaysLeft !== null && c.subscription.trialDaysLeft >= 0 && c.subscription.trialDaysLeft <= 7);
    const subDue = cl.filter(c => (c.subscription?.status === 'trial' && c.subscription.trialEnded) || c.subscription?.status === 'overdue');
    const todo = [
      [pending.length, `order${pending.length === 1 ? '' : 's'} waiting to be processed`, 'data-go-filter="pending"', 'var(--orange)'],
      [follow.length, `order${follow.length === 1 ? '' : 's'} with unread client messages`, 'data-go-filter="followups"', 'var(--red)'],
      [noCost.length, `order${noCost.length === 1 ? '' : 's'} still need product + shipping cost`, 'data-go-filter="all"', 'var(--gold)'],
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

  // ---------- orders tab ----------
  const matches = (o, f) => f === 'archived' ? o.archived : !o.archived && (f === 'all' || (f === 'followups' ? o.unreadMessages > 0 : o.status === f));
  function renderOrders() {
    const all = [...S.orders,...S.archivedOrders];
    const inClient = all.filter(o => !S.client || String(o.clientId) === S.client);
    const count = f => inClient.filter(o => matches(o, f)).length;
    const label = f => (f === 'archived' ? 'Archived orders' : f === 'all' ? 'All' : f === 'followups' ? 'New follow-ups' : UI.LABEL[f]);
    $('[data-chips]').innerHTML = ['all', 'followups', ...STATUSES, 'archived'].filter(f => f === 'archived' || f === 'all' || count(f) || f === S.filter)
      .map(f => `<button type="button" class="chip t-${f}${f === 'followups' ? ' alert' : ''}${S.filter === f ? ' on' : ''}" data-filter="${f}">${f !== 'all' && f !== 'followups' ? '<i class="dot"></i>' : ''}${label(f)} <span>${count(f)}</span></button>`).join('');
    const sel = $('[data-client-filter]');
    sel.innerHTML = '<option value="">All clients</option>' + S.ov.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = S.client;
    const q = S.q.toLowerCase();
    const rows = inClient.filter(o => matches(o, S.filter) && (!q || [o.orderRef, o.trackingNumber, o.notes, o.destination, place(o.destination), clientName(o.clientId), o.itemTitle, o.sku, o.buyerName].join(' ').toLowerCase().includes(q)));
    $('[data-list]').innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th>Order</th><th>Destination</th><th class="num">Total</th><th>Status</th><th>Messages</th><th class="hide-sm"></th></tr></thead><tbody>
      ${rows.map(o => `<tr class="click${o.unreadMessages ? ' is-new' : ''}" data-open-order="${o.id}" tabindex="0">
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

  // ---------- subscription (first month free, then monthly) ----------
  const fmtDay = iso => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
  const shekels = n => (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n))) + ' ₪';
  function subPill(sub) {
    if (!sub || !sub.status) return '<span class="dim" style="font-size:13px">Not set</span>';
    if (sub.status === 'trial') {
      if (sub.trialEnded) return `<span class="st st-cancelled">Trial ended</span><small class="dim sub-when">${esc(fmtDay(sub.trialEnd))}</small>`;
      return `<span class="st st-pending">Free month</span><small class="dim sub-when">until ${esc(fmtDay(sub.trialEnd))}</small>`;
    }
    if (sub.status === 'active') return `<span class="st st-delivered">Paying</span>${sub.lastPayment ? `<small class="dim sub-when">paid ${esc(fmtDay(sub.lastPayment))}</small>` : ''}`;
    if (sub.status === 'overdue') return '<span class="st st-cancelled">Overdue</span>';
    return '<span class="st" style="--tone:var(--dim)">Cancelled</span>';
  }

  function adminClaimCard(c){return c?`<section class="card card-pad${c.overdue?' claim-overdue':''}"><h3 data-no-i18n>${esc(c.orderRef||'#'+c.orderId)} · ${esc(c.clientName)}</h3><p><span>${c.status==='open'?'Open':c.status==='approved'?'Approved':c.status==='rejected'?'Rejected':'Resolved'}</span> · <span>${c.resolution==='refund'?'Refund':'Reshipment'}</span></p><p><b data-no-i18n>${c.businessDays}</b> <span>business days (Mon–Fri)</span></p>${c.overdue?'<p class="err-text">Overdue: more than 3 business days</p>':''}<p data-no-i18n>${esc(c.problem)}: ${esc(c.description)}</p>${c.fileIds.map(id=>`<a class="btn btn-sm" href="/api/portal/files/${id}" target="_blank" rel="noopener">Open evidence</a>`).join('')}${c.reshipmentOrderId?`<button class="btn btn-sm" type="button" data-open-order="${c.reshipmentOrderId}">Open reshipment</button>`:''}${['open','approved'].includes(c.status)?`<form class="form-grid" data-claim-decision="${c.id}"><label class="field full"><span>Admin reply</span><textarea name="reply" maxlength="2000">${esc(c.reply)}</textarea></label><label class="field"><span>Decision</span><select name="status">${c.status==='open'?'<option value="approved">Approved</option><option value="rejected">Rejected</option>':'<option value="resolved">Resolved</option>'}</select></label><button class="btn btn-primary" type="submit">Save claim decision</button><p class="form-msg" data-claim-msg></p></form>`:`<p data-no-i18n>${esc(c.reply)}</p>`}</section>`:'';}
  function renderClaims(){$('[data-tab-body]').innerHTML=`<div class="chips">${['all','open','approved','rejected','resolved'].map(s=>`<button class="chip${S.claimFilter===s?' on':''}" type="button" data-claim-filter="${s}">${s==='all'?'All':s==='open'?'Open':s==='approved'?'Approved':s==='rejected'?'Rejected':'Resolved'}</button>`).join('')}</div>${S.claims.filter(c=>S.claimFilter==='all'||c.status===S.claimFilter).map(adminClaimCard).join('')||'<p>No claims yet.</p>'}`;}
  function productQuoteForm(p){return `<form class="form-grid" data-product-quote="${p.id}"><h3 class="full" data-no-i18n>${esc(p.name)} · ${esc(p.clientName)}</h3><div class="full">${p.photoIds.map(id=>`<img src="/api/portal/products/${p.id}/photos/${id}" width="80" height="80" style="object-fit:contain" alt="Product photo">`).join('')}<p><a href="${esc(p.link)}" target="_blank" rel="noopener">Product link</a></p><p data-no-i18n>${esc(p.variant)}${p.expectedQuantity?' · '+p.expectedQuantity:''}</p></div><label class="field"><span>Status</span><select name="status"><option value="approved"${p.status==='approved'?' selected':''}>Approved</option><option value="not_available"${p.status==='not_available'?' selected':''}>Not available</option></select></label><label class="field"><span>Price per unit (USD)</span><input name="unitPrice" type="number" min="0" step="0.01" value="${p.unitPrice??''}"></label><label class="field full"><span>Note</span><textarea name="note" maxlength="1000">${esc(p.note)}</textarea></label><button type="submit" class="btn btn-primary">Save quote</button><p class="form-msg" data-quote-msg></p></form>`;}
  function renderProducts(){const products=[...S.products].sort((a,b)=>(a.status==='awaiting_quote'?0:1)-(b.status==='awaiting_quote'?0:1)||a.createdAt-b.createdAt);$('[data-tab-body]').innerHTML=`<section class="card card-pad"><h3 class="sec-title">Products awaiting quote</h3><p>${products.filter(p=>p.status==='awaiting_quote').length}</p></section>${products.map(p=>`<section class="card card-pad"><span>${p.status==='awaiting_quote'?'Awaiting quote':p.status==='approved'?'Approved':'Not available'}</span>${productQuoteForm(p)}</section>`).join('')}`;}
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

  // ---------- settings tab ----------
  function adminsHTML() {
    return S.ov.admins.map(x => `<div><span class="ava">${esc(initials(x.name))}</span><span class="who"><span><b>${esc(x.name)}</b><small>@${esc(x.username)}${x.active ? '' : ' · disabled'}</small></span></span></div>`).join('')
      + '<div><span class="ava">DL</span><span class="who"><span><b>Main admin login</b><small>set in Vercel</small></span></span></div>';
  }
  const BANK_UI = [['bank_currency', 'Currency'], ['bank_holder', 'Account holder name'], ['bank_account', 'Account number'], ['bank_ach', 'ACH routing number'],
    ['bank_wire', 'Wire routing number'], ['bank_swift', 'SWIFT/BIC'], ['bank_name', 'Bank name'], ['bank_address', 'Bank address'], ['bank_reference', 'Payment reference note']];
  function settingsHTML() {
    const s = S.ov.settings, rated = COUNTRIES.filter(([c]) => RATES[c]);
    return `<div class="settings-grid">
      <section class="card card-pad"><h3 class="form-sec">Fee per order</h3>
        <form class="form-grid" id="settings-form" novalidate>
          <label class="field"><span>Fee per order (USD)</span><span class="money"><input name="commission_per_order" type="number" min="0" step="0.01" value="${esc(s.commission_per_order)}"></span></label>
          <label class="field"><span>Supplier’s share (USD)</span><span class="money"><input name="supplier_share_per_order" type="number" min="0" step="0.01" value="${esc(s.supplier_share_per_order)}"></span></label>
          <div class="full split" data-split></div>
          <label class="field"><span>Client subscription <small>₪ / month, after the free month</small></span><input name="subscription_price" type="number" min="0" step="0.01" value="${esc(s.subscription_price ?? 29)}"></label>
          <label class="field"><span>Size-to-weight divisor <small>cm³ per kg</small></span><input name="volumetric_divisor" type="number" min="1000" max="10000" step="1" value="${esc(s.volumetric_divisor)}"></label>
          <div class="field" style="align-content:end"><button class="btn btn-primary" type="submit">Save settings</button></div>
          <p class="form-msg full" data-settings-msg></p>
        </form>
        <p class="note" style="margin-top:6px">The fee is already inside the product cost the client pays, so clients don’t see it. Changes apply to new orders only. Size-based weight = L × W × H ÷ divisor (6000 until the supplier confirms).</p>
      </section>
      <section class="card card-pad"><h3 class="form-sec">How clients pay (bank details)</h3>
        <form class="form-grid" id="bank-form" novalidate>
          ${BANK_UI.map(([k, label]) => `<label class="field${k === 'bank_address' || k === 'bank_reference' ? ' full' : ''}"><span>${label}</span><input name="${k}" type="text" maxlength="200" value="${esc(s[k] ?? '')}"></label>`).join('')}
          <div class="field" style="align-content:end"><button class="btn btn-primary" type="submit">Save bank details</button></div>
          <p class="form-msg full" data-bank-msg></p>
        </form>
        <p class="note" style="margin-top:6px">Clients see these on their Payments page under “How to pay”, each with a Copy button. Leave a field empty to hide it.</p>
      </section>
      <section class="card card-pad"><h3 class="form-sec">Terms of Service</h3><p class="note">Publishing a new version requires every client to accept again. Previous versions and acceptance records are preserved.</p>
        <form id="terms-publish" class="form-grid"><label class="field full"><span>New version number</span><input name="version" type="number" min="${S.ov.termsPolicy.version + 1}" value="${S.ov.termsPolicy.version + 1}" required></label>
          <label class="field full"><span>English policy text</span><textarea name="english" rows="10" maxlength="18000" required>${esc(S.ov.termsPolicy.english)}</textarea></label>
          <label class="field full"><span>Hebrew policy text</span><textarea name="hebrew" rows="10" maxlength="18000" dir="rtl" required>${esc(S.ov.termsPolicy.hebrew)}</textarea></label>
          <div class="field full"><button type="submit" class="btn btn-primary">Publish new terms version</button></div><p class="form-msg full" data-terms-msg role="status"></p></form></section>
      <section class="card card-pad"><h3 class="form-sec">Shipping calculator</h3>
        <form class="form-grid" data-calc onsubmit="return false">
          <label class="field"><span>Destination</span><select name="country">${rated.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}</select></label>
          <label class="field"><span>Product type</span><select name="category">${categoryOptions('general')}</select></label>
          <label class="field"><span>Weight (kg)</span><input name="weight" type="number" min="0" step="0.01" placeholder="e.g. 0.25"></label>
          <div class="field"><span>Size L × W × H (cm)</span><div class="dims"><input name="l" type="number" min="0" placeholder="L" aria-label="Length"><input name="w" type="number" min="0" placeholder="W" aria-label="Width"><input name="h" type="number" min="0" placeholder="H" aria-label="Height"></div></div>
        </form>
        <div class="calc-out" data-calc-out><small>Shipping fee</small><strong>—</strong><div class="bd">Enter a weight.</div></div>
      </section>
      <section class="card card-pad"><h3 class="form-sec">Team accounts</h3><div class="acc-list" data-admins>${adminsHTML()}</div>
        <button type="button" class="btn" style="margin-top:12px" data-add-account="admin">${ic('plus')}Add admin</button></section>
      <section class="card card-pad"><h3 class="form-sec">Storage &amp; backups</h3><div data-storage><p class="muted" style="margin:0">Loading…</p></div>
        <div class="row-actions" data-storage-actions hidden style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-backup-now>Back up now</button><button type="button" class="btn btn-sm" data-copy-files>Copy files now</button></div>
        <p class="form-msg" data-storage-msg role="status"></p></section>
      <section class="card card-pad"><h3 class="form-sec">Client portal link</h3><p class="muted" style="margin:0 0 10px;font-size:14px">Clients sign in here with the username and password you give them.</p>
        <div class="copy-line"><span style="flex:1">${esc(location.origin)}/portal/</span><button type="button" class="btn btn-sm" data-copy="${esc(location.origin)}/portal/">${ic('copy')}Copy</button></div></section>
    </div>`;
  }
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function storageHTML(d) {
    const s = d.storage;
    if (!s.configured) return '<p class="note" style="margin:0">File storage isn’t connected yet. Photos and documents stay in the database as before. Connect a private Blob store in Vercel to turn on file storage and daily backups.</p>';
    const total = s.kinds.reduce((n, k) => n + k.total, 0), copied = s.kinds.reduce((n, k) => n + k.copied, 0), cleared = s.kinds.reduce((n, k) => n + k.cleared, 0);
    const dbBytes = s.kinds.reduce((n, k) => n + k.databaseBytes, 0);
    const files = `<p style="margin:0 0 6px"><b>${copied} of ${total} files copied to file storage.</b></p>
      <p class="note" style="margin:0"><span>${s.clearing ? `${cleared} database copies removed after checking.` : 'Database copies are kept for safety.'}</span> <span>Files still in the database: ${kb(dbBytes)}</span></p>`;
    const list = d.backups.length ? `<div class="acc-list">${d.backups.slice(0, 7).map(b => `<div><span class="who"><span><b>${esc(fmtDay(b.date))}</b><small>${kb(b.bytes)}</small></span></span><a class="btn btn-sm" style="margin-inline-start:auto" href="/api/portal/admin/backups/${encodeURIComponent(b.name)}" target="_blank" rel="noopener" data-backup-link>Download</a></div>`).join('')}</div>`
      : `<p class="note" style="margin:0">${d.backupError ? esc(d.backupError) : 'No backups yet. The first one runs automatically within a day, or press Back up now.'}</p>`;
    return files + '<p style="margin:12px 0 6px"><b>Daily backups</b> <small class="muted">kept for 30 days</small></p>' + list;
  }
  async function loadStorage() {
    const box = $('[data-storage]'); if (!box) return;
    try { const d = await api('/admin/storage'); box.innerHTML = storageHTML(d); $('[data-storage-actions]').hidden = !d.storage.configured; }
    catch (ex) { box.innerHTML = `<p class="note" style="margin:0">${esc(ex.message)}</p>`; }
  }
  function bindStorage() {
    loadStorage();
    const m = $('[data-storage-msg]');
    const run = (sel, path, done) => { const b = $(sel); if (b) b.addEventListener('click', async () => {
      b.disabled = true; m.textContent = 'Working…'; m.className = 'form-msg';
      try { const r = await api(path, { method: 'POST' }); m.textContent = done(r); m.className = 'form-msg ok'; await loadStorage(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      b.disabled = false;
    }); };
    run('[data-backup-now]', '/admin/backups/run', r => r.configured === false ? 'File storage isn’t connected yet.' : 'Backup saved.');
    run('[data-copy-files]', '/admin/storage/sync', r => r.configured === false ? 'File storage isn’t connected yet.' : `${r.copied} files copied.${r.failed ? ` ${r.failed} will be retried.` : ''}${r.more ? ' More remain; they continue automatically every hour.' : ''}`);
  }
  function bindSettings() {
    bindStorage();
    const tf = $('#terms-publish');
    if (tf) tf.addEventListener('submit', async e => {
      e.preventDefault(); const b = $('[type=submit]', tf), m = $('[data-terms-msg]'); b.disabled = true;
      try { await api('/admin/terms', { method: 'POST', body: { version: Number(tf.version.value), english: tf.english.value, hebrew: tf.hebrew.value } }); m.textContent = 'Published. Clients must accept the new version.'; m.className = 'form-msg full ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; b.disabled = false; }
    });
    const bf = $('#bank-form');
    if (bf) bf.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-bank-msg]');
      try { await api('/admin/settings', { method: 'POST', body: Object.fromEntries(BANK_UI.map(([k]) => [k, bf[k].value])) }); m.textContent = 'Saved. Clients see the new details right away.'; m.className = 'form-msg full ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; }
    });
    const f = $('#settings-form');
    const split = () => {
      const fee = parseFloat(f.commission_per_order.value), sup = parseFloat(f.supplier_share_per_order.value), ok = Number.isFinite(fee) && Number.isFinite(sup);
      $('[data-split]').innerHTML = `<div><small>Client pays (inside product cost)</small><b>${Number.isFinite(fee) ? money(fee) : '—'}</b></div><div><small>Supplier gets</small><b>${Number.isFinite(sup) ? money(sup) : '—'}</b></div><div><small>We earn</small><b class="${ok && fee - sup < 0 ? 'neg' : 'pos'}">${ok ? money(fee - sup) : '—'}</b></div>`;
    };
    f.addEventListener('input', split); split();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-settings-msg]');
      try { await api('/admin/settings', { method: 'POST', body: { commission_per_order: f.commission_per_order.value, supplier_share_per_order: f.supplier_share_per_order.value, volumetric_divisor: f.volumetric_divisor.value, subscription_price: f.subscription_price.value } }); m.textContent = 'Saved. New orders use the new fee.'; m.className = 'form-msg full ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; }
    });
    const c = $('[data-calc]'), out = $('[data-calc-out]');
    const upd = () => {
      const q = quote({ country: c.country.value, category: c.category.value, weightKg: c.weight.value, lengthCm: c.l.value, widthCm: c.w.value, heightCm: c.h.value, divisor: divisor() });
      out.innerHTML = q ? `<small>Shipping fee to ${esc(countryName(c.country.value))}</small><strong>${money(q.total)}</strong><div class="bd">${q.chargeable} kg${q.usedVolumetric ? ' (size-based)' : ''} × ${money(q.perKg)}/kg = ${money(q.freight)} + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}${q.estimated ? '<br>Estimated rate (not confirmed by the supplier yet).' : ''}</div>` : '<small>Shipping fee</small><strong>—</strong><div class="bd">Enter a weight.</div>';
    };
    c.addEventListener('input', upd); c.addEventListener('change', upd);
  }

  // ---------- side panel: one order ----------
  let chatCtl = null, events = [];
  function closeChat() { chatCtl?.destroy(); chatCtl = null; }
  function openOrder(id, focus, back) {
    const o = [...S.orders,...S.archivedOrders].find(x => x.id === Number(id)); if (!o) return;
    const d = UI.getDrawer();
    closeChat(); events = [];
    S.drawer = { kind: 'order', id: o.id, back };
    d.onClose = () => { closeChat(); S.drawer = null; };
    d.open('o' + o.id);
    d.body.innerHTML = '<div data-d-info style="display:grid;gap:16px"></div><section><h3 class="sec-title">Messages with the client</h3><div data-d-chat></div></section>';
    invoiceFiles=[];fillOrder(o);
    api('/admin/invoices?clientId='+o.clientId).then(r=>{if(S.drawer?.kind==='order'&&S.drawer.id===o.id){invoiceFiles=r.invoices;fillOrder(o,true);}}).catch(ex=>toast(ex.message));
    chatCtl = UI.chat($('[data-d-chat]', d.body), { orderId: o.id, role: 'admin', readOnly: !!o.archived, onLoad: data => {
      events = data.events || [];
      const cur = [...S.orders,...S.archivedOrders].find(x => x.id === o.id);
      const hadUnread=cur?.unreadMessages,oldCount=cur?.messages;UI.syncConversation(cur,data);
      if (cur && (hadUnread || oldCount!==cur.messages)) { cur.unreadMessages = 0; renderKpis(); renderList(); tell({ type: 'dl-followups', unread: unreadTotal() }); }
      if (cur && S.drawer?.kind === 'order' && S.drawer.id === cur.id) fillOrder(cur, true);
    } });
    if (focus === 'chat') setTimeout(() => { $('[data-d-chat]', d.body)?.scrollIntoView({ block: 'start' }); chatCtl?.focus(); }, 320);
  }
  function fillOrder(o, soft) {
    const d = UI.getDrawer(), back = S.drawer?.back;
    d.head.innerHTML = `${back ? `<button type="button" class="back" data-back>${ic('back')}${esc(clientName(back))}</button>` : ''}<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2>${esc(orderName(o))}</h2>${UI.pill(o.status)}</div><p>${esc(clientName(o.clientId))} · ordered ${esc(o.orderDate || fullDate(o.createdAt))} · to ${esc(place(o.destination))}</p><p><span>Added</span> ${esc(fullDate(o.createdAt))}</p>`;
    const info = $('[data-d-info]', d.body); if (!info) return;
    if (soft && $('[name=invoiceFile]',info)?.files.length) return;
    if (soft && info.contains(document.activeElement) && document.activeElement.matches('input')) return;
    if (o.archived) {
      info.innerHTML = `<section class="card card-pad"><h3 class="sec-title">Archived order</h3><p>This order is hidden from normal order lists. Billing and payment history are preserved.</p><p><span>Archived at</span> ${esc(fullDate(o.archivedAt))}</p>${UI.activity(events)}</section>`;
      d.foot.innerHTML = `<button type="button" class="btn btn-primary" data-restore-order="${o.id}">Restore order</button>`;
      return;
    }
    info.innerHTML = `
      <section class="card card-pad">${UI.tracker(o, events)}</section>${UI.activity(events)}
      <section class="card card-pad" data-d-media><h3 class="sec-title">Product photos &amp; link</h3>${productMedia(o, { removable: true, canAdd: (o.photos || []).length < 8 })}</section>
      <section class="card card-pad"><h3 class="sec-title">Update status</h3>
        <div class="status-btns">${ADMIN_STATUSES.map(s => `<button type="button" class="t-${s}${s === o.status ? ' on' : ''}" data-set-status="${s}" data-id="${o.id}">${UI.LABEL[s]}</button>`).join('')}</div>
        <form class="inline-form" data-track-form="${o.id}" style="margin-top:14px"><label class="field"><span>Tracking number</span><input name="trackingNumber" maxlength="120" value="${esc(o.trackingNumber)}" placeholder="e.g. LX123456789CN"></label><button class="btn" type="submit">Save tracking</button><button type="button" class="btn btn-sm" data-tracking-update="${o.id}">Tracking update received</button>${o.trackingNumber ? `<a class="btn btn-ghost" href="${trackingUrl(o.trackingNumber)}" target="_blank" rel="noopener">${ic('ext')}Track</a>` : ''}</form>
      </section>
      <section class="card card-pad"><label class="field"><span>Store</span><select data-move-order="${o.id}">${S.stores.filter(s=>s.clientId===o.clientId&&(!s.archived||s.id===o.storeId)).map(s=>`<option value="${s.id}"${s.id===o.storeId?' selected':''}>${esc(s.name)}</option>`).join('')}</select></label></section>
      ${adminClaimCard(S.claims.find(c=>c.orderId===o.id))}
      ${o.status==='cancellation_requested' ? `<section class="card card-pad"><h3 class="sec-title">Cancellation request</h3><p data-no-i18n>${esc(o.cancellationReason)}</p><label class="field"><span>Cancellation fee (USD)</span><input name="cancellationFee" type="number" min="0" step="0.01" placeholder="0.00"></label><button type="button" class="btn btn-sm" data-cancel-four>$4</button><div class="status-btns"><button type="button" class="btn btn-danger" data-cancel-decision="approve" data-id="${o.id}">Approve cancellation</button><button type="button" class="btn" data-cancel-decision="reject" data-id="${o.id}">Reject cancellation</button></div></section>` : ''}
      <section class="card card-pad"><h3 class="sec-title">Invoices</h3>${adminInvoiceLinks(invoiceFiles.filter(f=>f.orderIds.includes(o.id)))}${invoiceForm(o.clientId,o.id)}</section>
      ${o.quotedUnitPrice!=null ? `<section class="card card-pad"><span>Fixed unit quote</span> <b>${money(o.quotedUnitPrice)}</b> × ${o.quantity} = <b>${money(o.price)}</b></section>` : billHTML(o)}
      <section class="card card-pad"><h3 class="sec-title">Details</h3><dl class="kv">
        <div><dt>Client</dt><dd><button type="button" class="back" style="margin:0" data-open-client="${o.clientId}">${esc(clientName(o.clientId))}</button></dd></div><div><dt>Order number</dt><dd>${esc(o.orderRef) || '—'}${o.source === 'etsy-csv' ? ' <span class="st" style="--tone:var(--blue);text-transform:none">From Etsy file</span>' : ''}</dd></div>
        <div><dt>Order date</dt><dd>${esc(o.orderDate) || fullDate(o.createdAt)}</dd></div><div><dt>Customer paid</dt><dd>${esc(o.currency || 'USD')} ${Number(o.sellingPrice || 0).toFixed(2)}</dd></div>
        ${o.itemTitle ? `<div class="full"><dt>Product</dt><dd>${esc(o.itemTitle)}</dd></div>` : ''}<div><dt>Quantity</dt><dd>${esc(o.quantity || 1)}</dd></div><div><dt>SKU / listing ID</dt><dd>${esc(o.sku) || '—'}</dd></div>
        ${o.variant ? `<div class="full"><dt>Variation / personalization</dt><dd>${esc(o.variant)}</dd></div>` : ''}
        <div class="full"><dt>Recipient</dt><dd>${esc(o.buyerName) || '—'}</dd></div>
        <div class="full"><dt>Delivery address &amp; phone</dt><dd style="white-space:pre-line">${[o.buyerName, o.address1, o.address2, o.city, o.region, o.postalCode, o.destination ? place(o.destination) : '', o.buyerPhone].filter(Boolean).map(esc).join('\n') || '—'}</dd><button type="button" class="btn btn-sm" data-copy="${esc([o.buyerName, o.address1, o.address2, o.city, o.region, o.postalCode, o.destination ? place(o.destination) : '', o.buyerPhone].map(x => String(x || '').trim()).filter(Boolean).join('\n'))}">Copy full address</button></div><div><dt>Country</dt><dd>${esc(place(o.destination))}</dd></div>
        <div><dt>Product type</dt><dd>${esc(shortCat(o.category))}</dd></div><div><dt>Weight</dt><dd>${o.weightKg != null ? esc(o.weightKg) + ' kg' : 'Not entered yet'}</dd></div><div><dt>Last update</dt><dd>${esc(fullDate(o.updatedAt))}</dd></div>
        <div><dt>Google Sheet</dt><dd>${o.sheetSyncStatus === 'synced' ? 'Synced' : o.sheetSyncStatus === 'error' ? 'Needs retry' : 'Waiting to sync'}</dd></div>
        ${o.sheetSyncError ? `<div class="full"><dt>Sheet sync note</dt><dd>${esc(o.sheetSyncError)}</dd></div>` : ''}
        ${o.notes ? `<div class="full"><dt>Client’s notes</dt><dd>${esc(o.notes)}</dd></div>` : ''}</dl></section>
      <section class="card card-pad"><h3 class="sec-title">Money</h3><div class="money-rows">
        <div><span>Product cost <span class="dim">(fee included)</span></span><span>${money(o.productCost)}</span></div><div><span>Shipping fee</span><span>${money(o.shippingFee)}</span></div>
        <div class="total"><span>Client pays</span><span>${money(o.price)}</span></div>
        <div><span>Customer paid client</span><span>${esc(o.currency || 'USD')} ${Number(o.sellingPrice || 0).toFixed(2)}</span></div><div><span>Client’s profit</span><span class="${o.profit > 0 ? 'pos' : o.profit < 0 ? 'neg' : ''}">${o.productCost == null && o.shippingFee == null ? 'Pending costs' : money(o.profit)}</span></div></div>
        <div class="split"><div><small>Fee on this order</small><b>${money(o.commission)}</b></div><div><small>Supplier gets</small><b>${money(o.supplierShare)}</b></div><div><small>We earn</small><b class="pos">${money(o.ourShare)}</b></div></div></section>`;
    bindBill(o);
    d.foot.innerHTML = `<button type="button" class="btn" data-edit-order="${o.id}">${ic('edit')}Edit order</button><button type="button" class="btn btn-ghost" data-open-client="${o.clientId}">Open client</button><button type="button" class="btn btn-danger" data-archive-order="${o.id}">Archive order</button>`;
  }

  function subscriptionHTML(c) {
    const sub = c.subscription || {}, price = sub.price ?? Number(S.ov.settings.subscription_price ?? 29);
    const opt = (v, l) => `<option value="${v}"${(sub.status || 'trial') === v ? ' selected' : ''}>${l}</option>`;
    return `<section class="card card-pad"><h3 class="sec-title">Subscription</h3>
      <p class="muted" style="margin:0 0 12px;font-size:14px">First month free, then ${esc(shekels(price))} / month. The client sees this in their portal. Nothing is charged or blocked automatically.</p>
      <form class="form-grid" data-sub-form="${c.id}" novalidate>
        <label class="field"><span>Status</span><select name="subStatus">${opt('trial', 'Free month (trial)')}${opt('active', 'Active (paying)')}${opt('overdue', 'Overdue')}${opt('cancelled', 'Cancelled')}</select></label>
        <label class="field"><span>Last payment <small>optional</small></span><input name="subLastPayment" type="date" value="${esc(sub.lastPayment || '')}"></label>
        <label class="field"><span>Trial start</span><input name="trialStart" type="date" value="${esc(sub.trialStart || '')}"></label>
        <label class="field"><span>Trial end <small>1 month after start</small></span><input name="trialEnd" type="date" value="${esc(sub.trialEnd || '')}"></label>
        <div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Save subscription</button><p class="form-msg" data-sub-msg></p></div></form></section>`;
  }
  document.addEventListener('change', e => {
    const el = e.target; if (!el.matches?.('[data-sub-form] [name=trialStart]') || !el.value) return;
    el.form.trialEnd.value = addMonthIso(el.value);
  });
  const addMonthIso = iso => { const [y, m, d] = iso.split('-').map(Number); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10); };

  // Bill an order right from its panel: product type + weight (and size) → shipping fee from our rates,
  // plus product cost (our hidden fee included) = what the client pays. Saves onto the order.
  function billHTML(o) {
    const v2 = x => (x != null ? Number(x).toFixed(2) : '');
    const rated = !!RATES[o.destination];
    return `<section class="card card-pad"><h3 class="sec-title">Bill this order</h3>
      <form class="form-grid bill-form" data-bill-form="${o.id}" novalidate>
        <label class="field"><span>Product type</span><select name="category">${categoryOptions(o.category || 'general')}</select></label>
        <label class="field"><span>Weight (kg)</span><input name="weightKg" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 0.25" value="${o.weightKg ?? ''}"></label>
        <div class="field full"><span>Size L × W × H (cm) <small>optional · big, light boxes are charged by size</small></span><div class="dims"><input name="l" type="number" min="0" placeholder="L" aria-label="Length"><input name="w" type="number" min="0" placeholder="W" aria-label="Width"><input name="h" type="number" min="0" placeholder="H" aria-label="Height"></div></div>
        <label class="field"><span>Product cost <small>fee included</small></span><span class="money"><input name="productCost" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(o.productCost)}"></span></label>
        <label class="field"><span>Shipping fee <small data-bill-hint></small></span><span class="money"><input name="shippingFee" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(o.shippingFee)}"></span></label>
        <div class="full calc-out bill-out" data-bill-out></div>
        <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save bill</button><p class="form-msg" data-bill-msg style="margin:0"></p></div>
        ${rated ? '' : `<p class="note full" style="margin:0">No shipping rate saved for ${esc(place(o.destination))} yet — type the shipping fee.</p>`}
      </form></section>`;
  }
  function bindBill(o) {
    const f = $(`[data-bill-form="${o.id}"]`); if (!f) return;
    let auto = null;
    const upd = () => {
      const q = quote({ country: o.destination, category: f.category.value, weightKg: f.weightKg.value, lengthCm: f.l.value, widthCm: f.w.value, heightCm: f.h.value, divisor: divisor() });
      const qs = q ? q.total.toFixed(2) : null;
      if (q && (f.shippingFee.value === '' || f.shippingFee.value === auto)) { f.shippingFee.value = qs; auto = qs; }
      $('[data-bill-hint]', f).innerHTML = !q ? '' : f.shippingFee.value === qs ? 'from our rates' : `<button type="button" class="back" style="margin:0" data-bill-use="${qs}">use ${money(q.total)}</button>`;
      const pc = parseFloat(f.productCost.value), sh = parseFloat(f.shippingFee.value), have = Number.isFinite(pc) || Number.isFinite(sh);
      $('[data-bill-out]', f).innerHTML = `<small>Client pays</small><strong>${have ? money((pc || 0) + (sh || 0)) : '—'}</strong><div class="bd">${q ? `Shipping: ${q.chargeable} kg${q.usedVolumetric ? ' (by size)' : ''} × ${money(q.perKg)}/kg + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}${q.estimated ? ' · estimated rate' : ''}` : 'Enter the weight to work out shipping from our rates.'}${Number.isFinite(pc) ? ` · Product ${money(pc)}` : ''}</div>`;
    };
    f.addEventListener('input', e => { if (e.target.name === 'shippingFee') auto = null; upd(); });
    f.addEventListener('change', upd);
    f.addEventListener('click', e => { const u = e.target.closest('[data-bill-use]'); if (u) { f.shippingFee.value = u.dataset.billUse; auto = f.shippingFee.value; upd(); } });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-bill-msg]', f);
      if (f.productCost.value === '' && f.shippingFee.value === '') { m.textContent = 'Enter the product cost and shipping fee.'; m.className = 'form-msg err'; return; }
      const body = { category: f.category.value, weightKg: f.weightKg.value === '' ? null : f.weightKg.value,
        productCost: f.productCost.value === '' ? null : f.productCost.value, shippingFee: f.shippingFee.value === '' ? null : f.shippingFee.value };
      try {
        await api('/orders/' + o.id, { method: 'PUT', body });
        document.activeElement?.blur(); await loadAll(); renderList(); renderKpis();
        const cur = [...S.orders,...S.archivedOrders].find(x => x.id === o.id); if (cur) fillOrder(cur);
        toast('Bill saved. ' + money(cur?.price) + ' added to what ' + (clientName(o.clientId) || 'the client') + ' owes.');
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
    });
    upd();
  }

  // ---------- side panel: one client ----------
  let payments = [], transferProofs = [], invoiceFiles=[], balanceAdjustments=[];
  async function openClient(id, tab = 'orders') {
    const c = clientOf(id); if (!c) return;
    const d = UI.getDrawer();
    closeChat(); payments = []; transferProofs = []; invoiceFiles=[];balanceAdjustments=[];
    S.drawer = { kind: 'client', id: c.id, tab };
    d.onClose = () => { S.drawer = null; };
    d.open('c' + c.id);
    fillClient(c);
    await loadPayments(c.id);
  }
  async function loadPayments(id) {
    try { const [p,t,f] = await Promise.all([api('/admin/payments?clientId=' + id), api('/admin/transfers?clientId=' + id),api('/admin/invoices?clientId='+id)]); payments=p.payments; transferProofs=t.transfers;invoiceFiles=f.invoices;balanceAdjustments=p.adjustments||[]; } catch (e) { payments = []; transferProofs = []; invoiceFiles=[]; }
    if (S.drawer?.kind === 'client' && S.drawer.id === id) fillClient(clientOf(id), true);
  }
  const adminInvoiceLinks=files=>files.length ? files.map(f=>`<p><a href="/api/portal/files/${f.id}" target="_blank" rel="noopener"><span>Download invoice</span> <span data-no-i18n>${esc(f.filename)}</span></a></p>`).join('') : '<span class="muted">Invoice pending</span>';
  function invoiceFields(clientId,orderId){
    return `<label class="field full"><span>Upload invoice <small>PDF or image, maximum 2 MB</small></span><input name="invoiceFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label>${orderId ? '' : `<label class="field full"><span>Linked orders <small>optional, select several</small></span><select name="invoiceOrders" multiple size="4">${S.orders.filter(o=>o.clientId===clientId).map(o=>`<option value="${o.id}">${esc(orderName(o))}</option>`).join('')}</select></label>`}`;
  }
  function invoiceForm(clientId,orderId){
    const today=new Date().toLocaleDateString('en-CA');
    return `<form class="form-grid" data-invoice-form="${clientId}" data-order-id="${orderId||''}">${invoiceFields(clientId,orderId)}<label class="field"><span>Invoice date</span><input name="invoiceDate" type="date" value="${today}" required></label>${orderId ? '' : `<label class="field"><span>Linked payment <small>optional</small></span><select name="invoicePayment"><option value="">No payment link</option>${payments.map(p=>`<option value="${p.id}">${money(p.amount)} · ${esc(fullDate(p.paidAt))}${p.archived?' · Archived':''}</option>`).join('')}</select></label>`}<button type="submit" class="btn btn-primary">Save invoice</button><p class="form-msg" data-invoice-msg></p></form>`;
  }
  async function invoiceFile(f){
    const file=f.invoiceFile.files[0];if(!file)return null;if(file.size>2*1024*1024)throw new Error('The file is too large. Maximum 2 MB.');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});return {filename:file.name,data};
  }
  const selectedInvoiceOrders=f=>f.invoiceOrders?[...f.invoiceOrders.selectedOptions].map(o=>Number(o.value)):[];
  function transferProofHTML() {
    return transferProofs.length ? `<section class="card card-pad"><h3 class="sec-title">Transfer confirmations</h3><p class="note">Check the confirmation and receipt of funds before recording the payment.</p>${transferProofs.map(t=>`<div class="confirmation-row"><div><b>${money(t.amount)}</b> <small data-no-i18n>${esc(t.date)}</small><p><a href="/api/portal/files/${t.id}" target="_blank" rel="noopener">Open confirmation</a></p>${t.mime.startsWith('image/') ? `<img src="/api/portal/files/${t.id}?inline=1" style="max-width:160px;max-height:120px;object-fit:contain" alt="Transfer confirmation">` : ''}</div>${t.status==='pending' ? `<button type="button" class="btn btn-primary" data-record-transfer="${t.id}">Record this payment</button>` : t.status==='archived' ? `<button type="button" class="btn" data-restore-payment="${t.paymentId}">Restore payment</button>` : '<span class="tag">Recorded</span>'}</div>`).join('')}</section>` : '';
  }
  function fillClient(c, soft) {
    const d = UI.getDrawer(), tab = S.drawer.tab, allOrders=S.orders.filter(o=>o.clientId===c.id),orders=allOrders.filter(o=>!S.drawer.storeId||o.storeId===S.drawer.storeId),stores=S.stores.filter(s=>s.clientId===c.id),stats=window.DLClientStoreMath.performance(stores,allOrders,balanceAdjustments,window.DLClientStoreMath.periodRange(S.period,S.from,S.to)||window.DLClientStoreMath.periodRange('month'));
    d.head.innerHTML = `<div class="who"><span class="ava" style="width:44px;height:44px;border-radius:14px;font-size:14px">${esc(initials(c.name))}</span><div><h2 style="font-size:20px">${esc(c.name)}</h2><small>@${esc(c.username)} · ${c.active ? 'active' : 'disabled'}</small></div></div>`;
    if (soft && [...d.body.querySelectorAll('[name=invoiceFile]')].some(f=>f.files.length)) return;
    if (soft && $('[data-reset-result] input', d.body)) return;
    if (soft && d.body.contains(document.activeElement) && document.activeElement.matches('input,select,textarea')) return;
    const t = new Date(), iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    const pane = tab === 'orders'
      ? `<section class="card card-pad"><h3 class="sec-title">Performance by store</h3>${window.DLClientStoreUI.periodFields(S.period,S.from,S.to)}${window.DLClientStoreUI.table(stats,'data-admin-select-store')}<button class="btn btn-sm" type="button" data-admin-select-store="0">All stores</button></section><section class="card card-pad"><h3 class="sec-title">My Stores</h3>${stores.map(s=>`<details><summary>${window.DLClientStoreUI.label(s)}</summary>${window.DLClientStoreUI.form(s,c.id)}</details>`).join('')}<details><summary>Add store</summary>${window.DLClientStoreUI.form(null,c.id)}</details></section><section class="card card-pad"><h3 class="sec-title">My Products</h3>${S.products.filter(p=>p.clientId===c.id).map(productQuoteForm).join('')}</section>` + (orders.length ? `<section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Order</th><th>Customer</th><th>Store</th><th>Total</th><th>Status</th></tr></thead><tbody>${orders.map(o=>`<tr class="click" data-open-order="${o.id}" data-back="${c.id}" tabindex="0"><td><b>${esc(orderName(o))}</b></td><td data-label="Customer" data-no-i18n>${esc(o.buyerName)}</td><td data-label="Store">${window.DLClientStoreUI.label(stores.find(s=>s.id===o.storeId))}</td><td data-label="Total">${money(o.price)}</td><td data-label="Status">${UI.pill(o.status)}</td></tr>`).join('')}</tbody></table></div></section>` : empty('No orders yet', 'Orders this client adds show up here.'))
      : tab === 'payments'
        ? `${transferProofHTML()}<section class="card card-pad"><h3 class="sec-title">Record a payment</h3><form class="form-grid" data-pay-form="${c.id}" novalidate>
            <label class="field"><span>Amount received</span><span class="money"><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal"></span></label>
            <label class="field"><span>Date</span><input name="paidAt" type="date" value="${iso}"></label>
            <label class="field"><span>Method</span><select name="method"><option>PayPal</option><option>Wise</option><option>Bank transfer</option><option>Other</option></select></label>
            <label class="field"><span>Note <small>optional</small></span><input name="note" maxlength="500"></label>
            ${invoiceFields(c.id)}<div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Record payment</button><p class="form-msg" data-pay-msg></p></div></form></section>
          <section class="card card-pad"><h3 class="sec-title">Invoices</h3>${adminInvoiceLinks(invoiceFiles)}${invoiceForm(c.id)}</section><section class="card">${payments.length ? `<table class="tbl"><tbody>${payments.map(p => `<tr><td><b class="pos">${money(p.amount)}</b><br><small class="dim">${esc(fullDate(p.paidAt))} · ${esc(p.method) || '—'}</small></td><td>${esc(p.note) || '<span class="dim">—</span>'}</td><td>${adminInvoiceLinks(invoiceFiles.filter(f=>f.paymentId===p.id))}</td><td class="num">${p.archived ? `<span class="tag">Archived</span> <button type="button" class="btn btn-sm" data-restore-payment="${p.id}">Restore payment</button>` : `<button type="button" class="btn btn-sm btn-danger" data-del-payment="${p.id}">Archive payment</button>`}</td></tr>`).join('')}</tbody></table>` : empty('No payments yet', 'Payments you record show up here and lower what the client owes.')}</section>`
        : `<section class="card card-pad"><form class="form-grid" data-account-form="${c.id}" novalidate>
            <label class="field full"><span>Name</span><input name="name" maxlength="120" value="${esc(c.name)}"></label>
            <label class="field"><span>Fee per order <small>empty = default</small></span><span class="money"><input name="commissionPerOrder" type="number" min="0" step="0.01" value="${c.commissionPerOrder ?? ''}"></span></label>
            <label class="field"><span>Status</span><select name="active"><option value="true"${c.active ? ' selected' : ''}>Active</option><option value="false"${c.active ? '' : ' selected'}>Disabled (can’t sign in)</option></select></label>
            <div class="field full"><span>Username</span><div class="copy-line"><b data-no-i18n>${esc(c.username)}</b><button type="button" class="btn btn-sm" data-copy="${esc(c.username)}">Copy</button></div><p><span>Last login:</span> ${c.lastLogin ? esc(fullDate(c.lastLogin)) : 'Never'}</p><p>${c.termsAccepted ? `<span>Terms accepted:</span> <time data-no-i18n>${esc(fullDate(c.termsAccepted.acceptedAt))} · v${c.termsAccepted.version}</time>` : 'Not accepted yet'}</p>${c.termsAccepted && c.termsRequired ? '<p class="note">Current terms not accepted yet.</p>' : ''}<button type="button" class="btn" data-reset-password="${c.id}">Reset password</button><div data-reset-result role="status"></div></div>
            <div class="full" style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit">Save account</button><p class="form-msg" data-account-msg></p></div></form>
            <p class="note" style="margin-top:12px">A new fee only applies to new orders. Existing orders keep the fee they were created with.</p></section>
          ${subscriptionHTML(c)}
          <section class="card card-pad"><h3 class="sec-title">Archive</h3><p class="muted" style="margin:0 0 12px;font-size:14px">For test accounts or clients you no longer work with. It hides this client, their orders and payments from every list and total, and stops them signing in. Nothing is deleted, and you can restore them any time from the Clients tab.</p><button type="button" class="btn btn-danger" data-archive="${c.id}">Archive client</button></section>`;
    d.body.innerHTML = `
      <section class="card card-pad"><dl class="kv" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div><dt>Orders</dt><dd><b>${c.orders}</b></dd></div><div><dt>Billed</dt><dd><b>${money(c.billed)}</b></dd></div><div><dt>Paid</dt><dd><b class="pos">${money(c.paid)}</b></dd></div>
        <div><dt>Outstanding</dt><dd><b class="${c.outstanding > 0 ? 'neg' : ''}">${money(c.outstanding)}</b></dd></div><div><dt>Our earnings</dt><dd><b>${money(c.ourShare)}</b></dd></div><div><dt>Client’s profit</dt><dd><b>${money(c.clientProfit)}</b></dd></div></dl></section>
      <div class="dtabs">${[['orders', `Orders (${orders.length})`], ['payments', `Payments (${payments.length})`], ['account', 'Account']].map(([k, l]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-ctab="${k}">${l}</button>`).join('')}</div>
      ${pane}`;
    window.DLEnhancePasswords?.(d.body);
    d.foot.innerHTML = `<button type="button" class="btn btn-primary" data-new-order="${c.id}">${ic('plus')}Add order for ${esc(c.name)}</button><a class="btn" href="/portal/?as=${c.id}" target="_blank" rel="noopener">${ic('ext')}See their portal</a>`;
  }

  // ---------- side panel: new / edit order ----------
  function openOrderForm(order, clientId) {
    const d = UI.getDrawer();
    closeChat();
    S.drawer = { kind: 'form', id: order?.id || null };
    d.onClose = () => { S.drawer = null; };
    d.open('f' + (order?.id || 'new'));
    const v2 = x => (x != null ? Number(x).toFixed(2) : '');
    const cid = order?.clientId || Number(clientId) || 0;
    d.head.innerHTML = `<h2>${order ? 'Edit order' : 'New order'}</h2><p>${order ? esc(clientName(order.clientId)) + ' · ' + esc(orderName(order)) : 'Add an order on a client’s behalf (e.g. one they sent on WhatsApp)'}</p>`;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: window.DL.displayTimeZone() });
    const currencies = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD'];
    if (order?.currency && !currencies.includes(order.currency)) currencies.push(order.currency);
    d.body.innerHTML = `<form id="order-form" class="af" novalidate>
      <section class="af-sec"><h3 class="form-sec"><i>1</i>Order</h3><div class="form-grid">
      <label class="field full"><span>Client</span><select name="clientId"${order ? ' disabled' : ''}><option value="">Choose a client…</option>${S.ov.clients.filter(c => c.active || c.id === cid).map(c => `<option value="${c.id}"${c.id === cid ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field full"><span>Store</span><select name="storeId" required></select></label>
      <label class="field"><span>Order number</span><input name="orderRef" maxlength="120" value="${esc(order?.orderRef)}" placeholder="e.g. Etsy #3412"></label>
      <label class="field"><span>Order date</span><input name="orderDate" type="date" value="${esc(order ? order.orderDate : today)}"></label>
      <label class="field"><span>Customer paid <small>on Etsy, optional</small></span><span class="money"><input name="sellingPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${v2(order?.sellingPrice)}"></span></label>
      <label class="field"><span>Currency</span><select name="currency">${currencies.map(c => `<option${c === (order?.currency || 'USD') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>2</i>Item sold</h3><div class="form-grid">
      ${order ? '<p class="note full">Photos: add or remove them in the order panel.</p>' : `<div class="field full photo-field"><span>Product photos / screenshots <small data-pick-count></small></span>
        <div class="pm-photos pick-zone" data-picks></div>
        <p class="pick-hint">Optional. Add the screenshot the client sent, or a photo of the product (up to ${MAX_PICKS}). You can also drag pictures here or paste with Ctrl+V.</p></div>`}
      <div class="field full"><span>Product links <small>one per product</small></span><div class="link-list" data-links></div>
        <button type="button" class="btn btn-sm link-add" data-link-add>+ Add another product link</button></div>
      <label class="field"><span>Quantity</span><input name="quantity" type="number" min="1" max="999" step="1" inputmode="numeric" value="${order?.quantity || 1}"></label>
      <label class="field"><span>SKU or listing ID <small>optional</small></span><input name="sku" maxlength="120" placeholder="e.g. LIGHTER-01" value="${esc(order?.sku)}"></label>
      <label class="field full"><span>Variation / personalization <small>optional</small></span><input name="variant" maxlength="500" placeholder="Color, size, engraving or personalization" value="${esc(order?.variant)}"></label>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>3</i>Customer &amp; delivery address</h3><div class="form-grid">
      <label class="field full"><span>Customer / recipient name</span><input name="buyerName" maxlength="160" value="${esc(order?.buyerName)}"></label>
      <label class="field full"><span>Full address and phone <small>street, city, state, postal code, phone</small></span><textarea name="address1" maxlength="2000" rows="3" placeholder="Paste the full delivery address and phone number here">${esc(UI.addressText(order))}</textarea></label>
      <label class="field"><span>Destination</span><select name="destination"></select></label>
      <label class="field" data-other-country hidden><span>Country name</span><input name="otherCountry" maxlength="60" placeholder="e.g. Sweden"></label>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>4</i>Shipping &amp; bill <small class="af-opt">can be added later with “Bill this order”</small></h3><div class="form-grid">
      <label class="field"><span>Tracking number</span><input name="trackingNumber" maxlength="120" value="${esc(order?.trackingNumber)}"></label>
      <label class="field"><span>Product type</span><select name="category">${categoryOptions(order?.category || 'general')}</select></label>
      <label class="field"><span>Weight (kg)</span><input name="weightKg" type="number" min="0" step="0.01" value="${order?.weightKg ?? ''}"></label>
      <label class="field"><span>Product cost <small>fee included</small></span><span class="money"><input name="productCost" type="number" min="0" step="0.01" value="${v2(order?.productCost)}"></span></label>
      <label class="field"><span>Shipping fee <small data-quote-hint></small></span><span class="money"><input name="price" type="number" min="0" step="0.01" value="${order ? (order.shippingFee != null ? v2(order.shippingFee) : order.productCost == null && Number(order.price) ? v2(order.price) : '') : ''}"></span></label>
      <div class="full money-rows" data-sum></div>
      </div></section>
      <section class="af-sec"><h3 class="form-sec"><i>5</i>Notes</h3>
      <label class="field"><span>Notes <small>the client sees these</small></span><textarea name="notes" maxlength="2000">${esc(order?.notes)}</textarea></label>
      </section>
      <p class="form-msg" data-form-msg></p></form>`;
    d.foot.innerHTML = `<button type="submit" form="order-form" class="btn btn-primary" data-submit>${order ? 'Save changes' : 'Add order'}</button><button type="button" class="btn btn-ghost" data-close-drawer>Cancel</button>`;
    const f = $('#order-form'), dest = destinationPicker(f.destination, $('[data-other-country]', f));
    dest.set(order?.destination || '');
    const setStores=()=>{const clientId=Number(f.clientId.value),stores=S.stores.filter(s=>s.clientId===clientId&&(!s.archived||s.id===order?.storeId));f.storeId.innerHTML='<option value="">Choose a store</option>'+stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');f.storeId.value=String(order?.storeId||(stores.length===1?stores[0].id:''));};setStores();f.clientId.addEventListener('change',setStores);
    const msg = $('[data-form-msg]', f), err = t => { msg.textContent = t; msg.className = 'form-msg err'; msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    // ----- product links: one box per product -----
    const linkBox = $('[data-links]', f);
    const linkRow = (v = '') => `<div class="link-row"><input data-link type="url" inputmode="url" maxlength="2000" placeholder="https://www.etsy.com/listing/..." value="${esc(v)}"><button type="button" class="btn btn-sm btn-ghost" data-link-remove aria-label="Remove link">×</button></div>`;
    const startLinks = order?.productLinks?.length ? order.productLinks : String(order?.etsyUrl || '').split(/\s+/).filter(Boolean);
    linkBox.innerHTML = (startLinks.length ? startLinks : ['']).map(linkRow).join('');
    const syncLinks = () => { const rows = $$('.link-row', linkBox); rows.forEach(r => { r.querySelector('[data-link-remove]').hidden = rows.length < 2; }); $('[data-link-add]', f).hidden = rows.length >= 10; };
    syncLinks();
    // ----- photos (new order only; existing orders manage photos in the order panel) -----
    let picks = [], pickSeq = 0;
    const zone = $('[data-picks]', f);
    const renderPicks = () => {
      if (!zone) return;
      zone.innerHTML = picks.map(p => `<figure class="pm-photo"><img src="${p.thumb}" alt="Product photo"><button type="button" class="pm-remove" data-pick-remove="${p.key}" aria-label="Remove photo">×</button></figure>`).join('')
        + (picks.length < MAX_PICKS ? `<label class="pm-add${picks.length ? '' : ' big'}"><input type="file" accept="image/*" multiple hidden data-pick-input><span>+</span><small>${picks.length ? 'Add more' : 'Add photo or screenshot'}</small></label>` : '');
      $('[data-pick-count]', f).textContent = picks.length ? `${picks.length} of ${MAX_PICKS}` : 'optional';
    };
    async function addFiles(files) {
      const list = [...files].filter(x => /^image\//.test(x.type || ''));
      if (!list.length) return err('Please choose a photo or screenshot (JPG, PNG or WebP).');
      const room = MAX_PICKS - picks.length; if (room <= 0) return err(`You can add up to ${MAX_PICKS} photos.`);
      zone.classList.add('busy'); let failed = '';
      for (const file of list.slice(0, room)) { try { picks.push({ key: 'n' + (++pickSeq), ...(await shrinkImage(file)) }); renderPicks(); } catch (ex) { failed = ex.message; } }
      zone.classList.remove('busy');
      if (failed) err(failed); else if (list.length > room) err(`Only ${MAX_PICKS} photos fit on one order.`); else { msg.textContent = ''; msg.className = 'form-msg'; }
    }
    if (zone) {
      zone.addEventListener('change', e => { if (e.target.matches('[data-pick-input]')) { addFiles(e.target.files); e.target.value = ''; } });
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
      f.addEventListener('paste', e => { const fl = [...(e.clipboardData?.files || [])]; if (fl.length) { e.preventDefault(); addFiles(fl); } });
      renderPicks();
    }
    let auto = null;
    const upd = () => {
      const q = quote({ country: dest.get(), category: f.category.value, weightKg: f.weightKg.value, divisor: divisor() });
      if (q && (f.price.value === '' || f.price.value === auto)) { f.price.value = q.total.toFixed(2); auto = f.price.value; }
      $('[data-quote-hint]').innerHTML = q ? (f.price.value === q.total.toFixed(2) ? 'from our rates' : `<button type="button" class="back" style="margin:0" data-use-quote="${q.total.toFixed(2)}">use ${money(q.total)}</button>`) : '';
      const pc = parseFloat(f.productCost.value), sh = parseFloat(f.price.value), sp = parseFloat(f.sellingPrice.value), tot = (pc || 0) + (sh || 0), billed = Number.isFinite(pc) || Number.isFinite(sh);
      $('[data-sum]').innerHTML = `<div class="total"><span>Client pays</span><span>${billed ? money(tot) : 'not billed yet'}</span></div>${billed && Number.isFinite(sp) ? `<div><span>Client’s profit</span><span class="${sp - tot >= 0 ? 'pos' : 'neg'}">${money(sp - tot)}</span></div>` : ''}`;
    };
    f.addEventListener('input', e => { if (e.target.name === 'price') auto = null; if (msg.classList.contains('err')) { msg.textContent = ''; msg.className = 'form-msg'; } upd(); });
    f.addEventListener('change', upd);
    f.addEventListener('click', e => {
      const u = e.target.closest('[data-use-quote]'); if (u) { f.price.value = u.dataset.useQuote; auto = f.price.value; upd(); }
      if (e.target.closest('[data-link-add]')) { linkBox.insertAdjacentHTML('beforeend', linkRow()); syncLinks(); $$('[data-link]', linkBox).pop().focus(); }
      const rm = e.target.closest('[data-link-remove]'); if (rm) { rm.closest('.link-row').remove(); syncLinks(); }
      const pr = e.target.closest('[data-pick-remove]'); if (pr) { picks = picks.filter(x => x.key !== pr.dataset.pickRemove); renderPicks(); }
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if(!f.storeId.value)return err('Choose a store.');
      if (!order && !f.clientId.value) return err('Please choose the client.');
      if (!f.buyerName.value.trim() || !f.address1.value.trim()) return err('Please fill in the customer name and full address.');
      if (!dest.get()) return err('Please choose a country.');
      if (dest.isOther() && !dest.get()) return err('Please type the country name.');
      $$('[data-link]', f).forEach(i => { i.value = window.DL.fullLink(i.value); });
      const linkInputs = $$('[data-link]', f), links = linkInputs.map(i => i.value.trim()).filter(Boolean);
      const badLink = linkInputs.find(i => i.value.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(i.value.trim()));
      if (badLink) { badLink.focus(); return err('Please paste each product link in full, starting with https://'); }
      const qty = parseInt(f.quantity.value, 10);
      if (!(qty >= 1 && qty <= 999)) return err('Quantity must be between 1 and 999.');
      const body = { storeId:Number(f.storeId.value),clientId: order ? order.clientId : Number(f.clientId.value), orderRef: f.orderRef.value, orderDate: f.orderDate.value, currency: f.currency.value,
        sellingPrice: f.sellingPrice.value === '' ? null : f.sellingPrice.value,
        etsyUrl: links.join('\n'), quantity: qty, sku: f.sku.value, variant: f.variant.value,
        buyerName: f.buyerName.value, ...UI.addressFields(f.address1.value,order),
        trackingNumber: f.trackingNumber.value, destination: dest.get(), category: f.category.value,
        weightKg: f.weightKg.value === '' ? null : f.weightKg.value, productCost: f.productCost.value === '' ? null : f.productCost.value, shippingFee: f.price.value === '' ? null : f.price.value,
        notes: f.notes.value };
      const btn = $('[data-submit]'); btn.disabled = true; msg.textContent = ''; msg.className = 'form-msg';
      const photoBody = p => ({ data: p.data, thumb: p.thumb, width: p.width, height: p.height });
      let r;
      try {
        r = order ? await api('/orders/' + order.id, { method: 'PUT', body }) : await api('/orders', { method: 'POST', body: { ...body, photos: picks.slice(0, 1).map(photoBody) } });
      } catch (ex) { btn.disabled = false; return err(ex.message); }
      // Saved. Upload the other photos one by one (keeps each request small).
      let failed = 0;
      for (const [i, p] of picks.slice(1).entries()) {
        msg.textContent = `Uploading photos… ${i + 1} of ${picks.length - 1}`;
        try { await api(`/orders/${r.order.id}/photos`, { method: 'POST', body: photoBody(p) }); } catch (ex) { failed++; }
      }
      await loadAll(); renderList();
      toast(failed ? `Order saved, but ${failed} photo${failed > 1 ? 's' : ''} didn’t upload. Add them in the order panel.` : order ? 'Order updated.' : 'Order added.');
      openOrder(r.order.id);
    });
    upd();
    if (!order) setTimeout(() => f.clientId.value ? f.orderRef.focus({ preventScroll: true }) : f.clientId.focus({ preventScroll: true }), 60);
  }

  // ---------- side panel: add account ----------
  function openAddAccount(role = 'client') {
    const d = UI.getDrawer();
    closeChat();
    S.drawer = { kind: 'account' };
    d.onClose = () => { S.drawer = null; };
    d.open('a');
    d.head.innerHTML = `<h2 data-acc-title>${role === 'admin' ? 'Add an admin' : 'Add a client'}</h2><p>Share the username and password with them privately.</p>`;
    d.body.innerHTML = `<form class="form-grid" id="user-form" novalidate>
      <label class="field full"><span>Account type</span><select name="role"><option value="client"${role === 'client' ? ' selected' : ''}>Client (their own portal)</option><option value="admin"${role === 'admin' ? ' selected' : ''}>Admin (full access)</option></select></label>
      <label class="field full"><span>Name</span><input name="name" maxlength="120"></label>
      <label class="field"><span>Username</span><input name="username" maxlength="60" autocomplete="off" placeholder="letters, numbers, . _ - @"></label>
      <label class="field"><span>Password <small>8+ characters</small></span><input name="password" type="password" autocomplete="new-password"></label>
      <label class="field full" data-cpo><span>Fee per order <small>empty = default (${money(S.ov.settings.commission_per_order)})</small></span><span class="money"><input name="commissionPerOrder" type="number" min="0" step="0.01"></span></label>
      <p class="form-msg full" data-user-msg></p></form>
      <p class="note" data-signin-note></p>`;
    window.DLEnhancePasswords?.(d.body);
    d.foot.innerHTML = '<button type="submit" form="user-form" class="btn btn-primary">Create account</button><button type="button" class="btn btn-ghost" data-close-drawer>Cancel</button>';
    const f = $('#user-form');
    const sync = () => {
      const admin = f.role.value === 'admin';
      $('[data-cpo]').hidden = admin;
      $('[data-acc-title]').textContent = admin ? 'Add an admin' : 'Add a client';
      f.name.placeholder = admin ? 'Team member’s name' : 'Client or store name';
      // Admins sign in on the main dashboard; clients on their portal. (The admin app runs inside the dashboard.)
      $('[data-signin-note]').innerHTML = admin
        ? `They sign in at <b>${esc(location.origin)}/</b> and get full access to the dashboard.`
        : `They sign in at <b>${esc(location.origin)}/portal/</b>. Their free month starts today (${esc(fmtDay(new Date().toLocaleDateString('en-CA', { timeZone: window.DL.displayTimeZone() })))}).`;
    };
    f.role.addEventListener('change', sync); sync();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-user-msg]');
      try {
        await api('/admin/users', { method: 'POST', body: { role: f.role.value, name: f.name.value, username: f.username.value.trim(), password: f.password.value, commissionPerOrder: f.commissionPerOrder.value === '' ? null : f.commissionPerOrder.value } });
        m.textContent = `Account “${f.username.value.trim()}” created.`; m.className = 'form-msg full ok';
        tell({ type: 'dl-clients-changed' });
        f.reset(); sync();
        await loadAll(); renderList();
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; }
    });
    setTimeout(() => f.name.focus({ preventScroll: true }), 60);
  }

  function refreshDrawer() {
    const s = S.drawer; if (!s) return;
    if (s.kind === 'order') { const o = [...S.orders,...S.archivedOrders].find(x => x.id === s.id); if (o) fillOrder(o, true); }
    if (s.kind === 'client') { const c = clientOf(s.id); if (c) fillClient(c, true); }
  }

  document.addEventListener('input',e=>{if(e.target.name==='color'){const f=e.target.closest('[data-client-store-form]');if(f)f.dataset.colourEdited='1';}});
  document.addEventListener('change',async e=>{
    if(e.target.matches('[data-move-order]')){const f=e.target;f.disabled=true;try{await api('/orders/'+f.dataset.moveOrder,{method:'PUT',body:{storeId:Number(f.value)}});await loadAll();renderList();refreshDrawer();toast('Order moved to store.');}catch(ex){toast(ex.message);f.disabled=false;}}
    const p=e.target.closest('[data-period-form]');if(p&&S.drawer?.kind==='client'){S.period=p.period.value;if(p.from)S.from=p.from.value;if(p.to)S.to=p.to.value;if(e.target.name==='period'||window.DLClientStoreMath.periodRange('custom',S.from,S.to)){document.activeElement?.blur();fillClient(clientOf(S.drawer.id));}}
  });
  document.addEventListener('submit',e=>{if(e.target.matches('[data-period-form]'))e.preventDefault();});
  // ---------- events ----------
  async function setStatus(id, status, el) {
    if (el) el.disabled = true;
    try { await api('/orders/' + id, { method: 'PUT', body: { status } }); await loadAll(); renderList(); refreshDrawer(); toast(`Status set to ${UI.LABEL[status]}. The client sees it right away.`); }
    catch (ex) { toast(ex.message); if (el) el.disabled = false; }
  }
  function onClick(e) {
    const t = e.target;
    const st=t.closest('[data-admin-select-store]');if(st&&S.drawer?.kind==='client'){S.drawer.storeId=Number(st.dataset.adminSelectStore);fillClient(clientOf(S.drawer.id));return;}
    const cf=t.closest('[data-claim-filter]');if(cf){S.claimFilter=cf.dataset.claimFilter;renderClaims();return;}
    const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const gt = t.closest('[data-go-tab]'); if (gt) { S.tab = gt.dataset.goTab; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const gf = t.closest('[data-go-filter]'); if (gf) { S.filter = gf.dataset.goFilter; S.tab = 'orders'; renderTab(); tell({ type: 'dl-tab-changed', tab: S.tab }); return; }
    const f = t.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; renderOrders(); return; }
    const acc = t.closest('[data-add-account]'); if (acc) { openAddAccount(acc.dataset.addAccount); return; }
    const no = t.closest('[data-new-order]'); if (no) { openOrderForm(null, no.dataset.newOrder); return; }
    const rs = t.closest('[data-restore]');
    if (rs) { setArchived(Number(rs.dataset.restore), false, rs); return; }
    if (t.closest('select')) return;
    const oc = t.closest('[data-open-client]'); if (oc) { openClient(oc.dataset.openClient); return; }
    const oo = t.closest('[data-open-order]'); if (oo) openOrder(oo.dataset.openOrder);
  }
  async function setArchived(id, archived, el) {
    if (el) el.disabled = true;
    try {
      await api('/admin/users/' + id, { method: 'POST', body: { archived } });
      tell({ type: 'dl-clients-changed' });
      if (archived) UI.getDrawer().close();
      await loadAll(); renderList();
      toast(archived ? 'Client archived. Their orders and payments no longer count in the totals.' : 'Client restored.');
    } catch (ex) { toast(ex.message); if (el) el.disabled = false; }
  }
  function onInput(e) {
    if (e.target.matches('[data-q]')) { S.q = e.target.value; renderOrders(); }
    if (e.target.matches('[data-cq]')) { S.cq = e.target.value; renderClients(); }
  }
  function onChange(e) {
    if (e.target.matches('[data-client-filter]')) { S.client = e.target.value; renderOrders(); }
    if (e.target.matches('[data-status]')) setStatus(e.target.dataset.status, e.target.value, e.target);
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const row = e.target.closest?.('tr[data-open-order], tr[data-open-client]');
    if (row) { if (row.dataset.openOrder) openOrder(row.dataset.openOrder); else openClient(row.dataset.openClient); }
  });
  // Admins can add product photos to an order (e.g. when a client sends them on WhatsApp).
  document.addEventListener('change', async e => {
    const inp = e.target.closest?.('[data-photo-add]'); if (!inp) return;
    const id = Number(inp.dataset.photoAdd), files = [...inp.files]; inp.value = '';
    if (!files.length) return;
    const box = inp.closest('.pm-add'); box?.classList.add('busy');
    let added = 0, err = '';
    for (const f of files) {
      try { await api(`/orders/${id}/photos`, { method: 'POST', body: await shrinkImage(f) }); added++; }
      catch (ex) { err = ex.message; }
    }
    await loadAll(); renderList(); refreshDrawer();
    toast(added ? `${added} photo${added > 1 ? 's' : ''} added.` + (err ? ' ' + err : '') : err || 'No photo added.');
  });
  // Clicks inside the side panel (it lives outside #app), plus copy buttons anywhere.
  document.addEventListener('click', async e => {
    const t = e.target, d = UI.getDrawer();
    const reset = t.closest('[data-reset-password]');
    if (reset) {
      reset.disabled = true;
      const result = $('[data-reset-result]'); result.textContent = '';
      api('/admin/users/' + reset.dataset.resetPassword + '/reset-password', { method: 'POST' }).then(r => {
        result.innerHTML = `<p>Temporary password — shown only here. Copy and share it privately.</p><div class="copy-line"><input type="text" readonly data-no-i18n value="${esc(r.temporaryPassword)}" aria-label="Temporary password"><button type="button" class="btn btn-sm" data-copy="${esc(r.temporaryPassword)}">Copy</button></div><p>The client must choose a new password at next login.</p>`;
      }).catch(ex => { result.textContent = ex.message; reset.disabled = false; });
      return;
    }

    const cp = t.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Copied.'); } catch (ex) { /* no clipboard */ } return; }
    if (!d.el.contains(t)) return;
    if (t.closest('[data-close-drawer]')) { d.close(); return; }
    if (t.closest('[data-back]') && S.drawer?.back) { openClient(S.drawer.back); return; }
    const pr = t.closest('[data-photo-remove]');
    if (pr) {
      if (!pr.dataset.armed) { pr.dataset.armed = '1'; pr.classList.add('confirm'); pr.textContent = 'Remove?'; setTimeout(() => { if (pr.isConnected) { delete pr.dataset.armed; pr.classList.remove('confirm'); pr.textContent = '×'; } }, 4000); return; }
      pr.disabled = true;
      try { await api(`/orders/${pr.dataset.order}/photos/${pr.dataset.photoRemove}/delete`, { method: 'POST' }); await loadAll(); renderList(); refreshDrawer(); toast('Photo removed.'); }
      catch (ex) { pr.disabled = false; toast(ex.message); }
      return;
    }
    if(t.closest('[data-cancel-four]')){$('[name=cancellationFee]').value='4';return;}
    const decision=t.closest('[data-cancel-decision]');
    if(decision){decision.disabled=true;try{await api('/orders/'+decision.dataset.id+'/'+decision.dataset.cancelDecision+'-cancellation',{method:'POST',body:{fee:$('[name=cancellationFee]').value}});await loadAll();renderList();refreshDrawer();toast('Cancellation request updated.');}catch(ex){decision.disabled=false;toast(ex.message);}return;}
    const tracking=t.closest('[data-tracking-update]');if(tracking){tracking.disabled=true;try{await api('/admin/orders/'+tracking.dataset.trackingUpdate+'/tracking-update',{method:'POST',body:{}});await loadAll();refreshDrawer();toast('Tracking update recorded.');}catch(ex){tracking.disabled=false;toast(ex.message);}return;}
    const ss = t.closest('[data-set-status]'); if (ss) { if (!ss.classList.contains('on')) setStatus(ss.dataset.id, ss.dataset.setStatus, ss); return; }
    const eo = t.closest('[data-edit-order]'); if (eo) { openOrderForm(S.orders.find(o => o.id === Number(eo.dataset.editOrder))); return; }
    const no = t.closest('[data-new-order]'); if (no) { openOrderForm(null, no.dataset.newOrder); return; }
    const oc = t.closest('[data-open-client]'); if (oc) { openClient(oc.dataset.openClient); return; }
    const oo = t.closest('[data-open-order]'); if (oo) { openOrder(oo.dataset.openOrder, null, oo.dataset.back ? Number(oo.dataset.back) : null); return; }
    const ct = t.closest('[data-ctab]'); if (ct) { S.drawer.tab = ct.dataset.ctab; fillClient(clientOf(S.drawer.id)); if (ct.dataset.ctab==='payments') await loadPayments(S.drawer.id); return; }
    const ao = t.closest('[data-archive-order],[data-restore-order]');
    if (ao) {
      const archived = !!ao.dataset.archiveOrder, id = Number(ao.dataset.archiveOrder || ao.dataset.restoreOrder);
      if (archived && !ao.dataset.armed) { ao.dataset.armed='1';ao.textContent='Click again to archive';setTimeout(()=>{if(ao.isConnected){delete ao.dataset.armed;ao.textContent='Archive order';}},4000);return; }
      ao.disabled=true;
      try { await api('/admin/orders/'+id+'/archive',{method:'POST',body:{archived}});UI.getDrawer().close();await loadAll();renderList();tell({type:'dl-clients-changed'});toast(archived ? 'Order archived. Billing history is preserved.' : 'Order restored.'); }
      catch(ex){toast(ex.message);ao.disabled=false;}
      return;
    }
    const ar = t.closest('[data-archive]');
    if (ar) {
      if (!ar.dataset.armed) { ar.dataset.armed = '1'; ar.textContent = 'Click again to archive'; setTimeout(() => { if (ar.isConnected) { delete ar.dataset.armed; ar.textContent = 'Archive client'; } }, 4000); return; }
      setArchived(Number(ar.dataset.archive), true, ar); return;
    }
    const record=t.closest('[data-record-transfer]'), restore=t.closest('[data-restore-payment]');
    if (record || restore) {
      const b=record || restore;b.disabled=true;
      try { await api(record ? '/admin/transfers/'+record.dataset.recordTransfer+'/record' : '/admin/payments/'+restore.dataset.restorePayment+'/restore',{method:'POST'}); await loadAll();renderList();await loadPayments(S.drawer.id);toast(record ? 'Payment recorded.' : 'Payment restored.'); }
      catch(ex) {toast(ex.message);b.disabled=false;} return;
    }
    const dp = t.closest('[data-del-payment]');
    if (dp) {
      if (!dp.dataset.armed) { dp.dataset.armed = '1'; dp.textContent = 'Click again to archive'; setTimeout(() => { if (dp.isConnected) { delete dp.dataset.armed; dp.textContent = 'Archive payment'; } }, 4000); return; }
      try { await api('/admin/payments/' + dp.dataset.delPayment + '/delete', { method: 'POST' }); await loadAll(); renderList(); await loadPayments(S.drawer.id); toast('Payment archived.'); }
      catch (ex) { toast(ex.message); }
    }
  });
  document.addEventListener('submit', async e => {
    const tf = e.target.closest('[data-track-form]');
    if (tf) {
      e.preventDefault();
      try { await api('/orders/' + tf.dataset.trackForm, { method: 'PUT', body: { trackingNumber: tf.trackingNumber.value } }); document.activeElement?.blur(); await loadAll(); renderList(); refreshDrawer(); toast('Tracking number saved. The client can see it now.'); }
      catch (ex) { toast(ex.message); }
      return;
    }
    const storeForm=e.target.closest('[data-client-store-form]');if(storeForm){e.preventDefault();const sf=storeForm,b=$('[type=submit]',sf),m=$('[data-store-msg]',sf);b.disabled=true;try{await api('/admin/client-stores'+(sf.dataset.clientStoreForm?'/'+sf.dataset.clientStoreForm:''),{method:'POST',body:{clientId:Number(sf.dataset.clientId),name:sf.storeName.value,platform:sf.platform.value,link:sf.link.value,color:sf.dataset.clientStoreForm||sf.dataset.colourEdited?sf.color.value:undefined,archived:!!sf.archived?.checked}});document.activeElement?.blur();await loadAll();refreshDrawer();toast('Store saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const cd=e.target.closest('[data-claim-decision]');if(cd){e.preventDefault();const b=$('[type=submit]',cd),m=$('[data-claim-msg]',cd);b.disabled=true;try{await api('/admin/claims/'+cd.dataset.claimDecision,{method:'POST',body:{status:cd.status.value,reply:cd.reply.value}});document.activeElement?.blur();await loadAll();if(S.tab==='claims')renderClaims();else refreshDrawer();toast('Claim decision saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const pq=e.target.closest('[data-product-quote]');if(pq){e.preventDefault();const b=$('[type=submit]',pq),m=$('[data-quote-msg]',pq);b.disabled=true;try{await api('/admin/products/'+pq.dataset.productQuote,{method:'POST',body:{status:pq.status.value,unitPrice:pq.unitPrice.value,note:pq.note.value}});document.activeElement?.blur();await loadAll();if(S.tab==='products')renderProducts();else refreshDrawer();toast('Quote saved.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const inf=e.target.closest('[data-invoice-form]');
    if(inf){e.preventDefault();const b=$('[type=submit]',inf),m=$('[data-invoice-msg]',inf);b.disabled=true;try{const file=await invoiceFile(inf);if(!file)throw new Error('Choose an invoice file.');await api('/admin/invoices',{method:'POST',body:{clientId:Number(inf.dataset.invoiceForm),orderIds:inf.dataset.orderId?[Number(inf.dataset.orderId)]:selectedInvoiceOrders(inf),paymentId:inf.invoicePayment?.value||null,date:inf.invoiceDate.value,file}});document.activeElement?.blur();inf.reset();invoiceFiles=(await api('/admin/invoices?clientId='+inf.dataset.invoiceForm)).invoices;refreshDrawer();toast('Invoice uploaded.');}catch(ex){m.textContent=ex.message;b.disabled=false;}return;}
    const pf = e.target.closest('[data-pay-form]');
    if (pf) {
      e.preventDefault();
      const m = $('[data-pay-msg]');
      try {
        const b=$('[type=submit]',pf);if(b.disabled)return;b.disabled=true;
        const file=await invoiceFile(pf);
        let invoiceError='';
        const payment=await api('/admin/payments', { method: 'POST', body: { clientId: Number(pf.dataset.payForm), amount: pf.amount.value, method: pf.method.value, note: pf.note.value, paidAt: pf.paidAt.value } });
        if(file){try{await api('/admin/invoices',{method:'POST',body:{clientId:Number(pf.dataset.payForm),paymentId:payment.id,orderIds:selectedInvoiceOrders(pf),date:pf.paidAt.value,file}});}catch(ex){invoiceError='Payment recorded; invoice upload failed. Use Save invoice to retry. '+ex.message;}}
        document.activeElement?.blur();pf.reset(); await loadAll(); renderList(); await loadPayments(Number(pf.dataset.payForm)); toast(invoiceError||'Payment recorded.');
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg err';$('[type=submit]',pf).disabled=false; }
      return;
    }
    const sf = e.target.closest('[data-sub-form]');
    if (sf) {
      e.preventDefault();
      const m = $('[data-sub-msg]');
      const body = { subStatus: sf.subStatus.value, trialStart: sf.trialStart.value, trialEnd: sf.trialEnd.value, subLastPayment: sf.subLastPayment.value };
      try { await api('/admin/users/' + sf.dataset.subForm, { method: 'POST', body }); document.activeElement?.blur(); await loadAll(); renderList(); fillClient(clientOf(sf.dataset.subForm)); toast('Subscription saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      return;
    }
    const af = e.target.closest('[data-account-form]');
    if (af) {
      e.preventDefault();
      const m = $('[data-account-msg]'), body = { name: af.name.value, active: af.active.value === 'true', commissionPerOrder: af.commissionPerOrder.value === '' ? null : af.commissionPerOrder.value };

      try { await api('/admin/users/' + af.dataset.accountForm, { method: 'POST', body }); document.activeElement?.blur(); tell({ type: 'dl-clients-changed' }); await loadAll(); renderList(); fillClient(clientOf(af.dataset.accountForm)); toast('Account saved.'); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
    }
  });
  function onParentMessage(e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const m = e.data || {};
    if (m.type === 'dl-open-client' && clientOf(m.id)) openClient(m.id);
    if (m.type === 'dl-add-admin') openAddAccount('admin');
    if (m.type === 'dl-set-tab' && ['overview', 'orders', 'clients', 'settings'].includes(m.tab) && m.tab !== S.tab) { S.tab = m.tab; if (S.ov) renderTab(); }
    if(m.type==='dl-open-products'){S.tab='products';loadAll().then(renderTab);return;}
    if (m.type === 'dl-open-order') {
      const go = () => { if (S.orders.some(o => o.id === m.id)) openOrder(m.id, m.focus); };
      if (S.orders.some(o => o.id === m.id)) go(); else loadAll().then(() => { renderList(); go(); });
    }
  }

  boot();
})();
