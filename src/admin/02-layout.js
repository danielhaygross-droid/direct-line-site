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
      ['Our earnings', money(t.ourShare), `Fees collected ${money(t.commission)}`, 'check', 'var(--gold)'],
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
