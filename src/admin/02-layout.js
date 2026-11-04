  // ---------- layout ----------
  function shell() {
    $('#app').innerHTML = `
      <section class="adm-head"><div><p class="eyebrow">Direct Line clients</p><h1>Clients <span>&amp;</span> orders</h1><p>Every order your clients send in, what they owe, and what we earn.</p></div>
        <div class="adm-actions"><button type="button" class="btn" data-add-account="client">${ic('users')}Add client</button><button type="button" class="btn btn-primary" data-new-order>${ic('plus')}New order</button></div></section>
      <div class="kpi-bar"><label class="kpi-month"><span>Show</span><select data-kpi-month aria-label="Month"></select></label></div>
      <div class="kpi-wrap" data-kpi-wrap><section class="kpis" data-kpis></section></div>
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
    // Four cards (Erwin, 23 Oct 2026); a click opens the details window with one smart button (02-card-window.js, 5 Nov).
    const f = kpiFacts(), UIS = window.DLClientStoreUI, plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`, sel = $('[data-kpi-month]');
    if (sel) sel.innerHTML = `<option value="all">All time</option>` + f.months.map(k => `<option value="${k}"${k === f.month ? ' selected' : ''} data-no-i18n>${esc(UIS.monthName(k))}</option>`).join('');
    const { month, name, os, unpaid, owed, owing, oldest, balanceC, feePartC } = f;
    // Orders: how many are shipped (the jobs, like waiting or need cost, are in "Needs your attention" under the cards).
    const shipped = os.filter(o => ['shipped', 'delivered'].includes(o.status)).length, notShipped = os.length - shipped;
    const cards = [
      { key: 'clients', k: 'Clients', v: f.clientsN, sub: [month === 'all' ? (owing ? `${plural(owing, 'client')} with unpaid orders` : plural(f.cl.length, 'account')) : `with orders in ${name}`], icon: 'users', tone: 'var(--blue)' },
      { key: 'orders', k: month === 'all' ? 'Orders' : `Orders in ${name}`, v: os.length, sub: os.length ? [notShipped ? `${notShipped} not shipped yet` : '', shipped ? `${shipped} shipped` : ''].filter(Boolean) : ['No orders yet'], icon: 'orders', tone: 'var(--orange)' },
      { key: 'unpaid', k: 'Not paid yet', v: money(balanceC / 100), sub: unpaid.length ? [plural(unpaid.length, 'order'), plural(owing, 'client'), oldest ? `oldest ${f.PO.day(oldest)}` : ''].filter(Boolean) : ['Every billed order is paid'], sub2: Math.abs(owed - balanceC) >= 1 ? `Unpaid orders ${money(owed / 100)} − credit and earlier payments ${money((owed - balanceC) / 100)}` : '', sub3: balanceC > 0 ? `Without our fee ${money((balanceC - feePartC) / 100)} · our fee ${money(feePartC / 100)}` : '', icon: 'money', tone: owed > 0 ? 'var(--red)' : 'var(--mint)', owe: balanceC > 0 },
      { key: 'earnings', k: month === 'all' ? 'Our earnings' : `Our earnings in ${name}`, v: money(f.feesC / 100), sub: [`${money(f.collectedC / 100)} collected`, `${money((f.feesC - f.collectedC - f.noBillC) / 100)} not paid yet`, ...(f.noBillC ? [`${money(f.noBillC / 100)} not billed yet`] : []), `${plural(os.length + f.keptOn.length, 'order')}`], icon: 'check', tone: 'var(--gold)', hero: true },
    ];
    $('[data-kpis]').innerHTML = cards.map(c => `<button type="button" class="stat stat-go${c.hero ? ' hero' : ''}${c.owe ? ' owe' : ''}" style="--tone:${c.tone}" data-kpi-card="${c.key}" aria-haspopup="dialog" aria-expanded="${kpiWin === c.key}" title="Show details"><span class="stat-ic">${ic(c.icon)}</span><small>${esc(c.k)}</small><strong>${c.v}</strong><em>${c.sub.map(x => `<span>${esc(x)}</span>`).join(' · ')}</em>${c.sub2 ? `<em class="stat-note">${esc(c.sub2)}</em>` : ''}${c.sub3 ? `<em class="stat-fee">${esc(c.sub3)}</em>` : ''}</button>`).join('');
    if (kpiWin) showCardWindow(kpiWin, false);
    const unread = S.orders.filter(o => o.unreadMessages).length;
    const b = $('[data-tab-badge="orders"]'); if (b) b.innerHTML = unread ? `<span class="badge-new">${unread}</span>` : '';
  }
  function renderTab() {
    $$('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === S.tab); b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)); });
    // The summary cards (and their month picker) belong to Clients overview only (Erwin, 4 Nov 2026), not to every section.
    for (const el of $$('.kpi-bar, [data-kpis]')) el.style.display = S.tab === 'overview' ? '' : 'none';
    if (S.tab !== 'overview') closeCardWindow(false);
    if(S.tab==='claims'){renderClaims();return;}
    if(S.tab==='products'){renderProducts();return;}
    const body = $('[data-tab-body]');
    if (S.tab === 'orders') {
      body.innerHTML = `<div class="bar"><div class="chips" data-chips></div><div class="bar-r">${sortPick('admin-orders-2', ADMIN_ORDER_SORTS)}<select data-client-filter aria-label="Client"></select><label class="search"><span class="sr">Search orders</span>${ic('search')}<input type="search" placeholder="Search order, tracking, client…" value="${esc(S.q)}" data-q></label></div></div>
        <section class="card" data-list></section>`;
    } else if (S.tab === 'clients') {
      body.innerHTML = `<div class="bar"><label class="search"><span class="sr">Search clients</span>${ic('search')}<input type="search" placeholder="Search clients…" value="${esc(S.cq)}" data-cq></label>${sortPick('admin-clients', CLIENT_SORTS)}<button type="button" class="btn btn-primary" data-add-account="client">${ic('plus')}Add client</button></div>
        <section class="card" data-list></section>`;
    } else if (S.tab === 'overview') body.innerHTML = '<div class="ovw" data-overview></div>';
    else body.innerHTML = settingsHTML();
    renderList();
    if (S.tab === 'settings') bindSettings();
  }
