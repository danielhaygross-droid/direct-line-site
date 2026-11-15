
  // ---------- phase 3: product quotes and price requests ----------
  Object.assign(ZH, {
    'Quotes': '询价', 'Price requests': '降价请求', 'Product quotes': '商品询价',
    'Clients ask Direct Line what a new product would cost. Answer with your price; Direct Line passes it on.': '客户向 Direct Line 询问新商品的价格。请填写您的价格，Direct Line 会转告客户。',
    'A client asks for a lower cost. Accept with a new cost, or keep the price and say why.': '客户请求降低成本。可以接受并填写新成本，或保持价格并说明原因。',
    'To answer': '待回复', 'Answered': '已回复', 'Waiting for Direct Line': '等待 Direct Line 确认',
    'Price per item (USD)': '单价（美元）', 'product only': '只含商品', 'Shipping per order (USD)': '每单运费（美元）', 'one parcel': '一个包裹',
    'Available?': '有货吗？', 'Yes': '有货', 'No': '没货', 'Note': '备注', 'optional, Direct Line passes it on': '选填，Direct Line 会转告', 'Why not available?': '为什么没货？',
    'Several prices? One per line, e.g. Small: 3.20': '多个价格？每行一个，例如 Small: 3.20', 'Send answer': '提交回复', 'Change answer': '修改回复', 'Sent': '已提交',
    'Expected per month': '每月预计', 'Competitor price': '客户售价', 'Product link': '商品链接', 'Not available': '没货', 'Quoted': '已报价',
    'Nothing to answer.': '没有需要回复的。', 'Nothing here yet.': '这里还没有内容。',
    'Order': '订单', 'Product': '商品', 'Asked': '请求日期', 'Cost now': '现在的成本', 'Price now': '现在的单价',
    'Accept with a new cost': '接受并填写新成本', 'The new cost is billed to the client right away (a higher cost waits for Direct Line).': '新成本会立即向客户收费（更高的成本需要 Direct Line 确认）。',
    'Keep the price': '保持价格', 'Say why. Direct Line sends your reason to the client.': '请说明原因。Direct Line 会把原因转告客户。',
    'New total cost (USD)': '新总成本（美元）', 'New price per item (USD)': '新单价（美元）', 'Reason': '原因', 'e.g. the factory price went up': '例如：工厂涨价了',
    'You offered': '您报的价格', 'Direct Line is checking it.': 'Direct Line 正在确认。', 'New cost': '新成本', 'Cost kept': '成本不变', 'Order cancelled': '订单已取消',
    'Type the price per item (USD).': '请填写单价（美元）。', 'Price not clear: write one price, or Name: price on each line.': '价格不清楚：请写一个价格，或每行写 名称: 价格。',
    'Type the shipping per order in US dollars, e.g. 4.50.': '请填写美元每单运费，例如 4.50。', 'Say why it is not available.': '请说明为什么没货。',
    'Say why the cost can’t be lower.': '请说明为什么成本不能降低。', 'This request is already answered.': '这个请求已经回复了。',
    'Type the new total cost in US dollars, e.g. 17.90.': '请填写美元新总成本，例如 17.90。', 'That is the same price. To keep it, choose Keep the price and say why.': '价格相同。如果要保持价格，请选择「保持价格」并说明原因。',
  });
  const linkOut = l => (l ? `<a class="sp-plink" href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48))}</a> <button type="button" class="btn btn-sm" data-copy="${esc(l)}">${t('Copy link')}</button>` : '');
  const pic = src => (src ? `<img class="sp-rpic" src="${esc(src)}" alt="" loading="lazy">` : '<span class="sp-rpic none"></span>');
  const subTabs = (key, list) => `<div class="sp-chips">${list.map(([k, l, n, red]) => `<button type="button" class="sp-chip" data-${key}="${k}" aria-pressed="${S[key] === k}">${t(l)} <span>${n}</span>${red && n ? `<b class="sp-badge">${n}</b>` : ''}</button>`).join('')}</div>`;
  const formErr = k => (S.formErr[k] ? `<p class="sp-warn">${esc(S.formErr[k])}</p>` : '');

  // Quotes
  function quoteForm(p) {
    const a = p.answer, avail = S.qAvail[p.id] ?? a.available;
    return `<form class="sp-qform" data-quote="${p.id}" novalidate>
      <div class="sp-qgrid ${avail ? '' : 'na'}">
        ${avail ? `<label class="sp-f"><span>${t('Price per item (USD)')} <small>${t('product only')}</small></span><textarea name="price" rows="${a.price.includes('\n') ? 3 : 1}" placeholder="0.00">${esc(a.price)}</textarea><small class="muted">${t('Several prices? One per line, e.g. Small: 3.20')}</small></label>
        <label class="sp-f"><span>${t('Shipping per order (USD)')} <small>${t('one parcel')}</small></span><span class="sp-money"><span>$</span><input name="shipping" inputmode="decimal" value="${esc(a.shipping)}" placeholder="0.00"></span></label>` : ''}
        <div class="sp-f"><span>${t('Available?')}</span><div class="sp-seg" role="group"><button type="button" data-avail="${p.id}:1" aria-pressed="${!!avail}">${t('Yes')}</button><button type="button" data-avail="${p.id}:0" aria-pressed="${!avail}">${t('No')}</button></div></div>
      </div>
      <label class="sp-f"><span>${avail ? t('Note') + ` <small>${t('optional, Direct Line passes it on')}</small>` : t('Why not available?')}</span><input name="note" value="${esc(a.note === 'Not available from the supplier.' ? '' : a.note)}" placeholder="${esc(avail ? 'e.g. ships in 3 days' : '')}"></label>
      ${formErr('q' + p.id)}<div><button type="submit" class="btn btn-primary">✓ ${t('Send answer')}</button></div></form>`;
  }
  function quoteCard(p, answered) {
    const a = p.answer, editing = !answered || S.qEdit.has(p.id);
    return `<article class="card sp-rcard" data-qcard="${p.id}"><div class="sp-rtop">${pic(p.photos[0])}<div class="sp-rinfo">
        <small class="muted">${esc(p.ref)} · ${esc(fmtDay(p.createdAt))} · ${esc(p.client)}</small><h3>${esc(p.name)}</h3>${p.variant ? `<p class="muted">${esc(p.variant)}</p>` : ''}
        <dl class="sp-rkv">${p.expected != null ? `<div><dt>${t('Expected per month')}</dt><dd>${p.expected}</dd></div>` : ''}${p.competitor ? `<div><dt>${t('Competitor price')}</dt><dd>${esc(p.competitor)}</dd></div>` : ''}<div class="wide"><dt>${t('Product link')}</dt><dd>${linkOut(p.link)}</dd></div></dl>
        ${p.photos.length > 1 ? `<div class="sp-rthumbs">${p.photos.slice(1).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt=""></a>`).join('')}</div>` : ''}</div></div>
      ${answered && !editing ? `<div class="sp-rans"><span class="sp-pill ${p.status === 'approved' ? 'shipped' : 'red'}">${t(p.status === 'approved' ? 'Quoted' : 'Not available')}</span>
          ${p.status === 'approved' ? `<span><small>${t('Price per item (USD)')}</small><b class="pre">${esc(a.price)}</b></span>${a.shipping ? `<span><small>${t('Shipping per order (USD)')}</small><b>$${esc(a.shipping)}</b></span>` : ''}` : ''}
          ${a.note ? `<span><small>${t('Note')}</small><b>${esc(a.note)}</b></span>` : ''}<button type="button" class="btn btn-sm" data-qedit="${p.id}">${t('Change answer')}</button></div>` : quoteForm(p)}</article>`;
  }
  function quotesHTML() {
    const Q = S.quotes; if (!Q) return S.error || `<p class="sp-empty">${t('Loading…')}</p>`;
    const list = S.qtab === 'answered' ? Q.answered : Q.toAnswer;
    return `<div class="sp-head"><div><h1>${t('Product quotes')}</h1><p class="sp-intro">${t('Clients ask Direct Line what a new product would cost. Answer with your price; Direct Line passes it on.')}</p></div></div>
      ${subTabs('qtab', [['answer', 'To answer', Q.toAnswer.length, true], ['answered', 'Answered', Q.answered.length]])}
      <div class="sp-rlist">${list.length ? list.map(p => quoteCard(p, S.qtab === 'answered')).join('') : `<p class="sp-empty">${t(S.qtab === 'answered' ? 'Nothing here yet.' : 'Nothing to answer.')}</p>`}</div>`;
  }

  // Price requests
  function reqCard(r) {
    const key = r.kind + r.id, choice = S.rChoice[key] || 'accept', isOrder = r.kind === 'order';
    const now = isOrder ? (r.costNow == null ? '—' : money(r.costNow)) : (r.answer?.price ? (r.answer.price.includes('\n') ? r.answer.price : '$' + r.answer.price) : '—');
    return `<article class="card sp-rcard"><div class="sp-rtop">${pic(isOrder ? r.photo : r.photos?.[0])}<div class="sp-rinfo">
        <small class="muted">${t(isOrder ? 'Order' : 'Product')} <b>${esc(r.ref)}</b> · ${esc(r.client)}${isOrder && r.askedAt ? ' · ' + t('Asked') + ' ' + esc(fmtDay(r.askedAt)) : ''}</small>
        <h3 class="pre">${esc(isOrder ? r.product : r.name)}</h3>${!isOrder && r.variant ? `<p class="muted">${esc(r.variant)}</p>` : ''}
        <dl class="sp-rkv"><div><dt>${t(isOrder ? 'Cost now' : 'Price now')}</dt><dd class="pre"><b>${esc(now)}</b></dd></div><div><dt>${t('Competitor price')}</dt><dd><b>${esc(r.competitor || '—')}</b></dd></div></dl></div></div>
      <form class="sp-reqform" data-req="${r.kind}:${r.id}" novalidate>
        <div class="sp-choices"><label class="sp-choice${choice === 'accept' ? ' on' : ''}"><input type="radio" name="action" value="accept" data-rchoice="${key}"${choice === 'accept' ? ' checked' : ''}><span><b>${t('Accept with a new cost')}</b><small>${t('The new cost is billed to the client right away (a higher cost waits for Direct Line).')}</small></span></label>
          <label class="sp-choice${choice === 'keep' ? ' on' : ''}"><input type="radio" name="action" value="keep" data-rchoice="${key}"${choice === 'keep' ? ' checked' : ''}><span><b>${t('Keep the price')}</b><small>${t('Say why. Direct Line sends your reason to the client.')}</small></span></label></div>
        ${choice === 'accept' ? (isOrder ? `<label class="sp-f sp-narrowf"><span>${t('New total cost (USD)')}</span><span class="sp-money"><span>$</span><input name="cost" inputmode="decimal" placeholder="0.00"></span></label>`
          : `<label class="sp-f sp-narrowf"><span>${t('New price per item (USD)')}</span><textarea name="price" rows="1" placeholder="0.00"></textarea><small class="muted">${t('Several prices? One per line, e.g. Small: 3.20')}</small></label>`)
          : `<label class="sp-f"><span>${t('Reason')}</span><input name="reason" maxlength="300" placeholder="${esc(t('e.g. the factory price went up'))}"></label>`}
        ${formErr('r' + key)}<div><button type="submit" class="btn btn-primary">✓ ${t('Send answer')}</button></div></form></article>`;
  }
  const resultText = a => (a.result === 'closed' ? t('Order cancelled') : a.result === 'kept' ? t('Cost kept') : a.newCost != null ? `${t('New cost')} ${money(a.newCost)}` : t('Answered'));
  function requestsHTML() {
    const R = S.requests; if (!R) return S.error || `<p class="sp-empty">${t('Loading…')}</p>`;
    const body = S.rtab === 'waiting' ? R.waiting.map(r => `<article class="card sp-rcard"><div class="sp-rtop">${pic(r.photo)}<div class="sp-rinfo"><small class="muted">${t('Order')} <b>${esc(r.ref)}</b> · ${esc(r.client)}</small><h3 class="pre">${esc(r.product)}</h3>
          <p class="sp-wait">${t('You offered')} <b>${money(r.offered)}</b>. ${t('Direct Line is checking it.')}</p></div></div></article>`)
      : S.rtab === 'answered' ? [`<section class="card sp-card"><div class="sp-table-wrap"><table class="sp-table"><tbody>${R.answered.map(a => `<tr><td><b>${esc(a.ref)}</b><small>${esc(a.name)}</small></td><td>${esc(resultText(a))}${a.reply ? `<small>${esc(a.reply)}</small>` : ''}</td><td class="num">${esc(fmtDay(a.answeredAt))}</td></tr>`).join('')}</tbody></table></div></section>`]
      : R.toAnswer.map(reqCard);
    const empty = S.rtab === 'answered' ? !R.answered.length : !body.length;
    return `<div class="sp-head"><div><h1>${t('Price requests')}</h1><p class="sp-intro">${t('A client asks for a lower cost. Accept with a new cost, or keep the price and say why.')}</p></div></div>
      ${subTabs('rtab', [['answer', 'To answer', R.toAnswer.length, true], ['waiting', 'Waiting for Direct Line', R.waiting.length], ['answered', 'Answered', R.answered.length]])}
      <div class="sp-rlist">${empty ? `<p class="sp-empty">${t(S.rtab === 'answer' ? 'Nothing to answer.' : 'Nothing here yet.')}</p>` : body.join('')}</div>`;
  }
  async function sendQuote(form) {
    const id = Number(form.dataset.quote), b = $('[type=submit]', form), avail = S.qAvail[id] ?? (S.quotes.toAnswer.concat(S.quotes.answered).find(p => p.id === id)?.answer.available ?? true);
    if (b.disabled) return; b.disabled = true; delete S.formErr['q' + id];
    try {
      await api('/supplier/quotes/' + id, { method: 'PUT', body: { price: form.price?.value || '', shipping: form.shipping?.value || '', available: !!avail, note: form.note.value } });
      S.qEdit.delete(id); delete S.qAvail[id]; S.quotes = await api('/supplier/quotes'); toast(t('Sent')); pollAlerts();
    } catch (e) { S.formErr['q' + id] = e.message; }
    rerenderOrders();
  }
  async function sendRequest(form) {
    const [kind, id] = form.dataset.req.split(':'), key = kind + id, b = $('[type=submit]', form), action = S.rChoice[key] || 'accept';
    if (b.disabled) return; b.disabled = true; delete S.formErr['r' + key];
    try {
      const r = await api(`/supplier/price-requests/${kind}/${id}`, { method: 'POST', body: { action, cost: form.cost?.value || '', price: form.price?.value || '', reason: form.reason?.value || '' } });
      delete S.rChoice[key]; S.requests = await api('/supplier/price-requests'); toast(r.waiting ? t('Waiting for Direct Line') : t('Sent')); pollAlerts();
    } catch (e) { S.formErr['r' + key] = e.message; }
    rerenderOrders();
  }
