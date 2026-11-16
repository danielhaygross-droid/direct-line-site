  // ---------- receipts (16 Nov 2026): the supplier makes the receipt for a payment, Direct Line approves, the client gets it ----------
  // The supplier sees only its own part; the PDF with the client's amounts is made when Direct Line approves it.
  Object.assign(ZH, {
    'Receipts': '收据', 'To make': '待开收据', 'Sent to the client': '已发给客户',
    'Make the receipt for a client payment. Direct Line checks it and sends it to the client.': '为客户的付款开收据。Direct Line 核对后发给客户。',
    'Paid on': '付款日期', 'Paid for your part': '您的部分已付', 'Orders it paid': '这笔付款包含的订单',
    'Note on the receipt': '收据备注', 'optional, e.g. bank reference': '选填，例如银行流水号', 'Send to Direct Line': '提交给 Direct Line',
    'Sent back by Direct Line': 'Direct Line 退回', 'Fix it and send it again.': '请修改后重新提交。', 'Send again': '重新提交',
    'Waiting for Direct Line since': '等待 Direct Line 确认，提交于', 'Sent to the client on': '已于此日期发给客户：', 'Receipt': '收据',
    'Nothing to make.': '没有需要开的收据。', 'Payment towards the balance': '付款计入余额', 'by': '提交人',
  });
  ICON.receipt = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>';
  S.receipts = null; S.rcTab = 'make';
  const rcOrders = r => (r.orders.length ? `<ul class="sp-rclist">${r.orders.map(o => `<li><b>${esc(o.ref)}</b><span>${esc(o.item || '')}${o.cancelled ? ` · ${t('Cancelled')}` : ''}</span><span class="num">${money(o.cost)}</span></li>`).join('')}</ul>`
    : `<p class="muted">${t('Payment towards the balance')}</p>`);
  function receiptCard(r) {
    const head = `<div class="sp-rctop"><div><small class="muted">${esc(r.client)} · ${t('Paid on')} ${esc(fmtDay(r.paidAt))}</small><h3>${t('Paid for your part')} <b>${money(r.yourPart)}</b></h3></div>${r.number ? `<span class="sp-tag">${esc(r.number)}</span>` : ''}</div>
      <p class="sp-rcsub">${t('Orders it paid')} (${r.orders.length})</p>${rcOrders(r)}`;
    if (r.status === 'submitted') return `<article class="card sp-rcard" data-rc="${r.paymentId}">${head}<p class="sp-wait">${t('Waiting for Direct Line since')} ${esc(fmtDay(r.submittedAt))}${r.submittedBy ? ` · ${t('by')} ${esc(r.submittedBy)}` : ''}</p>${r.note ? `<p class="muted">${t('Note')}: ${esc(r.note)}</p>` : ''}</article>`;
    if (r.status === 'approved') return `<article class="card sp-rcard" data-rc="${r.paymentId}">${head}<p class="sp-done">✓ ${t('Sent to the client on')} ${esc(fmtDay(r.decidedAt))}</p></article>`;
    return `<article class="card sp-rcard" data-rc="${r.paymentId}">${head}
      ${r.status === 'rejected' ? `<div class="sp-back"><b>${t('Sent back by Direct Line')}:</b> ${esc(r.reason)}<br><span>${t('Fix it and send it again.')}</span></div>` : ''}
      <form class="sp-rcform" data-receipt="${r.paymentId}" novalidate><label class="sp-f"><span>${t('Note on the receipt')} <small>${t('optional, e.g. bank reference')}</small></span><input name="note" maxlength="500" value="${esc(r.note || '')}"></label>
        ${formErr('rc' + r.paymentId)}<div><button type="submit" class="btn btn-primary">${ICON.receipt} ${t(r.status === 'rejected' ? 'Send again' : 'Send to Direct Line')}</button></div></form></article>`;
  }
  function receiptsHTML() {
    const R = S.receipts; if (!R) return S.error || `<p class="sp-empty">${t('Loading…')}</p>`;
    const list = S.rcTab === 'waiting' ? R.waiting : S.rcTab === 'sent' ? R.sent : R.toMake;
    return `<div class="sp-head"><div><h1>${t('Receipts')}</h1><p class="sp-intro">${t('Make the receipt for a client payment. Direct Line checks it and sends it to the client.')}</p></div></div>
      ${subTabs('rcTab', [['make', 'To make', R.toMake.length, true], ['waiting', 'Waiting for Direct Line', R.waiting.length], ['sent', 'Sent to the client', R.sent.length]])}
      <div class="sp-rlist">${list.length ? list.map(receiptCard).join('') : `<p class="sp-empty">${t(S.rcTab === 'make' ? 'Nothing to make.' : 'Nothing here yet.')}</p>`}</div>`;
  }
  async function sendReceipt(form) {
    const id = Number(form.dataset.receipt), b = $('[type=submit]', form);
    if (b.disabled) return; b.disabled = true; delete S.formErr['rc' + id];
    try { S.receipts = await api('/supplier/receipts', { method: 'POST', body: { paymentId: id, note: form.note.value } }); toast(t('Waiting for Direct Line')); pollAlerts(); }
    catch (e) { S.formErr['rc' + id] = e.message; }
    rerenderOrders();
  }
