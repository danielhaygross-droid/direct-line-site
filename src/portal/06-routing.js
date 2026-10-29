  // ---------- routing ----------
  function route() {
    panel?.close();
    if (S.me?.termsRequired) return;
    const [hashPath,query='']=location.hash.replace(/^#\/?/,'').split('?');
    const [r,id]=hashPath.split('/');
    const selected=new URLSearchParams(query).get('store');if(selected!==null){S.storeId=Number(selected)||0;if(S.storeId&&!S.stores.some(s=>s.id===S.storeId))S.storeId=0;store.set('dl-client-store-'+S.me.id,S.storeId);}
    if (r === 'import') { location.replace('#/home'); return; }
    S.route = ROUTES[r] ? r : 'home'; S.id = id ? Number(id) : null;
    S.payOpen = S.route === 'payments' && new URLSearchParams(query).get('pay') === '1';
    if (S.route === 'edit' && !S.orders.some(o => o.id === S.id && editable(o))) { location.hash = '#/orders'; return; }
    // Admin preview is view only: no forms for adding or editing orders.
    if (S.me?.preview && ['new', 'edit'].includes(S.route)) { location.hash = '#/home'; return; }
    document.body.classList.remove('menu-open');
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === S.route || (S.route === 'edit' && a.dataset.nav === 'orders')));
    $$('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === S.route));
    $('[data-title]').textContent = ROUTES[S.route].title;
    $('[data-sub]').textContent = ROUTES[S.route].sub;
    $('.new-btn').hidden = S.route === 'new' || S.route === 'edit' || S.route === 'home';
    renderView();
    if (S.route === 'messages' && S.id) openOrder(S.id, 'chat');
    scrollTo({ top: 0 });
  }
  const go = path => { location.hash = '#/' + path; };
  function renderView(soft) {
    const view = $('#view');
    if(soft && S.route==='products' && ($('#product-form')?.dataset.dirty || document.activeElement?.matches?.('[data-pq]')))return;
    if (soft && S.route === 'payments' && ($('#transfer-form')?.dataset.dirty || $('#billing-form')?.dataset.dirty)) return;
    if(soft && S.route==='stores' && [...document.querySelectorAll('[data-client-store-form]')].some(f=>f.dataset.dirty))return;
    if (soft && S.route === 'orders' && $('[data-orders-list]')) {const sw=$('[data-store-switcher]');if(sw)sw.outerHTML=storeSwitcher(); renderChips(); renderOrdersList(); return; }
    if (!soft && S.route === 'products' && !S.me.preview) { S.productsSeenBefore = store.get(productsSeenKey(), 0); store.set(productsSeenKey(), Math.floor(Date.now() / 1000)); }
    view.innerHTML = { home: viewHome, orders: viewOrders, new: viewForm, edit: viewForm, messages: viewMessages, payments: viewPayments, products:viewProducts, stores:viewStores, terms: viewTerms }[S.route]();
    if(['home','orders','payments'].includes(S.route))view.insertAdjacentHTML('afterbegin',storeSwitcher());
    if (soft) view.querySelectorAll(':scope > *').forEach(el => { el.style.animation = 'none'; });
    mountClientChart();
    ({ orders: bindOrders, new: bindForm, edit: bindForm, terms: bindTerms, payments: bindPayments, products:bindProducts, stores:bindStores })[S.route]?.();
    if (S.route === 'products' && S.openProductId) { const id = S.openProductId; S.openProductId = null; openProduct(id); }
  }
  const empty = (icon, title, text, extra = '') => `<div class="empty"><span class="empty-ic">${ic(icon)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra}</div>`;

