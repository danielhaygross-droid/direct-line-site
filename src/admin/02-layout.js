  // ---------- layout ----------
  function shell() {
    $('#app').innerHTML = `
      <section class="adm-head"><div><p class="eyebrow">Direct Line clients</p><h1>Clients <span>&amp;</span> orders</h1><p>Every order your clients send in, what they owe, and what we earn.</p></div>
        <div class="adm-actions"><button type="button" class="btn" data-add-account="client">${ic('users')}Add client</button><button type="button" class="btn btn-primary" data-new-order>${ic('plus')}New order</button></div></section>
      <div class="kpi-bar"><label class="kpi-month"><span>Show</span><select data-kpi-month aria-label="Month"></select></label></div>
      <section class="kpis" data-kpis></section>
      <div class="seg" role="tablist" data-main-tabs>${[['overview', 'Overview'], ['orders', 'Orders'], ['clients', 'Clients'], ['claims','Claims'], ['products','Products'], ['settings', 'Fees & settings']].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}<span data-tab-badge="${k}"></span></button>`).join('')}</div>
      <section data-tab-body style="display:grid;gap:14px"></section>`;
    // Inside the Control page its sidebar is the navigation (Erwin, 23 Oct 2026): no second row of tabs here.
    try { if (window.parent !== window && window.parent.document.querySelector('.nav-item[data-client-tab]')) document.body.classList.add('in-control'); } catch (e) { /* another origin */ }
    $('#app').addEventListener('click', onClick);
    $('#app').addEventListener('input', onInput);
    $('#app').addEventListener('change', onChange);
  }
  // The month picker above the cards: All time, or one calendar month (orders by order date).
  const kpiMonthKey = 'dl-admin-kpi-month';
  function kpiMonth() { try { return localStorage.getItem(kpiMonthKey) || 'all'; } catch (e) { return 'all'; } }
  document.addEventListener('change', e => { if (!e.target.matches?.('[data-kpi-month]')) return; try { localStorage.setItem(kpiMonthKey, e.target.value); } catch (x) { /* private mode */ } renderKpis(); });
  function renderKpis() {
    const t = S.ov.totals, cl = S.ov.clients, M = window.DLClientStoreMath, UIS = window.DLClientStoreUI;
    const months = M.monthsOf(S.orders), month = months.includes(kpiMonth()) ? kpiMonth() : 'all', sel = $('[data-kpi-month]');
    if (sel) sel.innerHTML = `<option value="all">All time</option>` + months.map(k => `<option value="${k}"${k === month ? ' selected' : ''} data-no-i18n>${esc(UIS.monthName(k))}</option>`).join('');
    // Four clickable cards (Erwin, 23 Oct 2026). "Not paid yet" is what clients owe right now (billed orders with no
    // payment linked), not billed + paid totals; it ignores the month because unpaid money is owed whatever month.
    const PO = window.DLPayOrders, cents = n => Math.round(Number(n || 0) * 100), plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const live = S.orders.filter(o => !o.archived), inMonth = month === 'all' ? live : live.filter(o => M.dateKey(o).slice(0, 7) === month), name = month === 'all' ? '' : UIS.monthName(month);
    const os = inMonth.filter(o => o.status !== 'cancelled'), pending = os.filter(o => o.status === 'pending').length, noCost = os.filter(needsCost).length;
    const unpaid = live.filter(o => PO.state(o) === 'unpaid'), owed = unpaid.reduce((n, o) => n + PO.dueCents(o), 0);
    const owing = new Set(unpaid.map(o => o.clientId)).size, oldest = unpaid.map(o => M.dateKey(o)).filter(Boolean).sort()[0];
    // Payments not linked to orders make the account balance differ from the unpaid orders: say so instead of hiding it.
    const gap = cents(t.outstanding) - owed;
    const fees = month === 'all' ? t.ourShare : os.reduce((n, o) => n + cents(o.commission), 0) / 100;
    const clientsN = month === 'all' ? cl.filter(c => c.active).length : new Set(os.map(o => o.clientId)).size;
    const cards = [
      { k: 'Clients', v: clientsN, sub: [month === 'all' ? (owing ? `${plural(owing, 'client')} with unpaid orders` : plural(cl.length, 'account')) : `with orders in ${name}`], icon: 'users', tone: 'var(--blue)' },
      { k: month === 'all' ? 'Orders' : `Orders in ${name}`, v: os.length, sub: pending || noCost ? [pending ? `${pending} waiting to be processed` : '', noCost ? `${noCost} need cost` : ''].filter(Boolean) : ['Nothing waiting'], icon: 'orders', tone: 'var(--orange)', go: `data-go-filter="${pending ? 'pending' : noCost ? 'needscost' : 'all'}"`, hint: pending ? 'Show waiting orders' : noCost ? 'Show orders that need cost' : 'Show orders' },
      { k: 'Not paid yet', v: money(owed / 100), sub: unpaid.length ? [plural(unpaid.length, 'order'), plural(owing, 'client'), oldest ? `oldest ${PO.day(oldest)}` : ''].filter(Boolean) : ['Every billed order is paid'], sub2: Math.abs(gap) >= 1 ? `Account balance ${money(t.outstanding)}: some payments aren’t linked to orders` : '', icon: 'money', tone: owed > 0 ? 'var(--red)' : 'var(--mint)', go: 'data-go-filter="unpaid"', hint: 'Show unpaid orders', owe: owed > 0 },
      { k: month === 'all' ? 'Our earnings' : `Our earnings in ${name}`, v: money(fees), sub: [month === 'all' ? `Fees collected ${money(t.commission)}` : `Fees on ${plural(os.length, 'order')}`], icon: 'check', tone: 'var(--gold)', hero: true },
    ];
    // Only the boxes that open a filtered list are buttons; Clients and Earnings are in the navigation already.
    $('[data-kpis]').innerHTML = cards.map(c => { const inner = `<span class="stat-ic">${ic(c.icon)}</span><small>${esc(c.k)}</small><strong>${c.v}</strong><em>${c.sub.map(x => `<span>${esc(x)}</span>`).join(' · ')}</em>${c.sub2 ? `<em class="stat-note">${esc(c.sub2)}</em>` : ''}`, cls = `stat${c.hero ? ' hero' : ''}${c.owe ? ' owe' : ''}`;
      return c.go ? `<button type="button" class="${cls} stat-go" style="--tone:${c.tone}" ${c.go} title="${esc(c.hint)}" aria-label="${esc(c.k)}: ${esc(c.hint)}">${inner}</button>` : `<div class="${cls} stat-plain" style="--tone:${c.tone}">${inner}</div>`; }).join('');
    const unread = S.orders.filter(o => o.unreadMessages).length;
    const b = $('[data-tab-badge="orders"]'); if (b) b.innerHTML = unread ? `<span class="badge-new">${unread}</span>` : '';
  }
  function renderTab() {
    $$('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === S.tab); b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)); });
    if(S.tab==='claims'){renderClaims();return;}
    if(S.tab==='products'){renderProducts();return;}
    const body = $('[data-tab-body]');
    if (S.tab === 'orders') {
      body.innerHTML = `<div class="bar"><div class="chips" data-chips></div><div class="bar-r">${sortPick('admin-orders', ADMIN_ORDER_SORTS)}<select data-client-filter aria-label="Client"></select><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, tracking, client…" value="${esc(S.q)}" data-q></label></div></div>
        <section class="card" data-list></section>`;
    } else if (S.tab === 'clients') {
      body.innerHTML = `<div class="bar"><label class="search"><span class="sr">Search clients</span>${ic('search')}<input type="search" placeholder="Search clients…" value="${esc(S.cq)}" data-cq></label>${sortPick('admin-clients', CLIENT_SORTS)}<button type="button" class="btn btn-primary" data-add-account="client">${ic('plus')}Add client</button></div>
        <section class="card" data-list></section>`;
    } else if (S.tab === 'overview') body.innerHTML = '<div class="ovw" data-overview></div>';
    else body.innerHTML = settingsHTML();
    renderList();
    if (S.tab === 'settings') bindSettings();
  }
