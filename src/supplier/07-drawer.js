
  // ---------- one order: drawer with photos, links, address, notes and the same gold boxes ----------
  const addressText = o => [o.buyer, o.address].filter(Boolean).join('\n');
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (e) { const a = document.createElement('textarea'); a.value = text; document.body.append(a); a.select(); try { document.execCommand('copy'); } catch (x) { /* nothing */ } a.remove(); }
    if (btn) { const was = btn.textContent; btn.textContent = t('Copied'); setTimeout(() => { btn.textContent = was; }, 1400); }
  }
  function drawerHTML(o) {
    const big = o.photos[S.photo || 0] || o.photos[0], f = (label, box) => `<label class="sp-f"><span>${label}</span>${box}</label>`, cx = o.status === 'cancelled';
    const paidL = { paid: 'Paid', not_paid: 'Not paid', no_bill: 'No bill yet' }[o.clientPaid];
    return `<div class="sp-dhead"><div><h2>${esc(o.ref)}</h2><p class="muted">${esc(o.client)}${o.shop ? ' · ' + esc(o.shop) : ''} · ${esc(fmtDay(o.createdAt))} · ${t('Ship to')} ${esc(o.country)}</p></div>
        <button type="button" class="icon-btn" data-close aria-label="${esc(t('Close'))}">✕</button></div>
      <div class="sp-dbody">
        ${o.cancelRequested ? `<p class="sp-alert"><b>${t('Cancel requested')}</b><span>${t('don’t buy or ship them. Wait for Direct Line.')}</span></p>` : ''}
        <section class="card sp-card"><span class="sp-eyebrow">${t('Product')}</span>
          <div class="sp-dprod"><div class="sp-gallery">${big ? `<a href="${esc(big.url)}" target="_blank" rel="noopener"><img class="sp-big" src="${esc(big.url)}" alt=""></a>` : `<div class="sp-big none">${t('No photos')}</div>`}
            ${o.photos.length > 1 ? `<div class="sp-thumbs">${o.photos.map((p, i) => `<button type="button" data-photo="${i}" aria-pressed="${(S.photo || 0) === i}"><img src="${esc(p.thumb)}" alt="">${p.label ? `<span>${esc(p.label)}</span>` : ''}</button>`).join('')}</div>` : ''}
            ${o.photos.length ? `<a class="btn btn-sm" href="/api/portal/supplier/orders/${o.id}/photos.zip">${t('Download all photos (zip)')}</a>` : ''}</div>
            <dl class="sp-kv"><dt>${t('Product')}</dt><dd>${esc(o.product || '—')}</dd><dt>${t('Qty')}</dt><dd>${o.qty}</dd>
              ${o.links.map((l, i) => `<dt>${o.links.length > 1 ? t('Product') + ' ' + (i + 1) : t('Open')}</dt><dd class="sp-link"><span>${esc(l)}</span><button type="button" class="btn btn-sm" data-copy="${esc(l)}">${t('Copy link')}</button><a class="btn btn-sm" href="${esc(l)}" target="_blank" rel="noopener noreferrer">${t('Open')}</a></dd>`).join('')}
              <dt>${t('Client paid')}</dt><dd>${t(paidL)}</dd></dl></div></section>
        <section class="card sp-card"><span class="sp-eyebrow">${t('Ship to')}</span>
          <dl class="sp-kv"><dt>${t('Customer')}</dt><dd>${esc(o.buyer || '—')}</dd><dt>${t('Delivery address & phone')}</dt><dd class="pre">${esc(o.address || '—')}</dd>
            ${o.taxNumber ? `<dt>${t('Tax number')}</dt><dd>${esc(o.taxNumber)}</dd>` : ''}</dl>
          <button type="button" class="btn btn-sm" data-copy-address="${o.id}">${t('Copy address')}</button></section>
        ${o.notes || o.giftMessage ? `<section class="card sp-card">${o.notes ? `<span class="sp-eyebrow">${t('Notes from Direct Line')}</span><p class="sp-note-box">${esc(o.notes)}</p>` : ''}${o.giftMessage ? `<span class="sp-eyebrow">${t('Gift message')}</span><p class="sp-note-box">${esc(o.giftMessage)}</p>` : ''}</section>` : ''}
        <section class="card sp-card"><span class="sp-eyebrow">${t('Your part')}</span>
          <div class="sp-fgrid">${f(t('Total cost (USD)'), cellBox(o, 'cost') + errLine(o))}${cx || o.cancelRequested ? f(t('Cancellation fee (USD)'), cellBox(o, 'cancelFee')) : f(t('Shipping status'), cellBox(o, 'ship'))}
            ${f(t('Cost per product (USD)'), cellBox(o, 'itemCosts'))}${f(t('Tracking number'), cellBox(o, 'tracking') + warnLine(o))}
            ${cx ? '' : f(t('Courier'), cellBox(o, 'courier')) + f(t('Delayed? + reason'), cellBox(o, 'delayed'))}${f(t('Domestic express tracking'), cellBox(o, 'domestic'))}</div></section>
      </div>
      <div class="sp-dfoot">${savedLine(o)}<span class="sp-dbtns"><button type="button" class="btn" data-close>${t('Close')}</button><button type="button" class="btn btn-dark" data-next>${t('Next order')} ${ICON.next}</button></span></div>`;
  }
  function drawerFill() {
    const d = $('#sp-drawer'), o = S.queue?.orders.find(x => x.id === S.drawer); if (!d || !o) return;
    const active = document.activeElement, keep = d.contains(active) && active.dataset?.f ? active.dataset.f : null, val = keep ? active.value : null, y = $('.sp-dbody', d)?.scrollTop || 0;
    d.innerHTML = drawerHTML(o); $('.sp-dbody', d).scrollTop = y;
    if (keep) { const el = d.querySelector(`[data-f="${keep}"]`); if (el) { if (el.value !== val) el.value = val; el.focus(); } }
  }
  function openDrawer(id) {
    S.drawer = id; S.photo = 0;
    let d = $('#sp-drawer');
    if (!d) { document.body.insertAdjacentHTML('beforeend', '<div class="sp-scrim" data-close></div><aside id="sp-drawer" class="sp-drawer" role="dialog" aria-modal="true"></aside>'); d = $('#sp-drawer'); }
    drawerFill(); document.body.classList.add('sp-noscroll'); $('[data-close]', d)?.focus();
  }
  function closeDrawer() { S.drawer = null; $('#sp-drawer')?.remove(); $('.sp-scrim')?.remove(); document.body.classList.remove('sp-noscroll'); }
  function nextOrder() { const list = visibleOrders(), i = list.findIndex(o => o.id === S.drawer); if (list[i + 1]) { S.drawer = list[i + 1].id; S.photo = 0; drawerFill(); } else closeDrawer(); }
