  // ---------- receipts made in the supplier portal (16 Nov 2026) ----------
  // Supplier makes it -> an admin opens the PDF (the client's amounts), then sends it to the client or sends it back with a
  // reason. Shown at the top of Clients & payments, and as a job in "Needs your attention".
  const rcWaiting = () => (S.receipts || []).filter(r => r.status === 'submitted');
  function receiptsBoxHTML() {
    const all = S.receipts || [], wait = rcWaiting(), done = all.filter(r => r.status !== 'submitted').slice(0, 6);
    if (!all.length) return '';
    const row = r => `<div class="rc-row" data-rc-row="${r.id}"><div class="rc-main"><div><b data-no-i18n>${esc(r.number)}</b> · <bdi data-no-i18n>${esc(r.client)}</bdi></div>
        <small><span>Paid</span> <span data-no-i18n>${esc(fullDate(r.paidAt).split(',')[0])}</span> · <b data-no-i18n>${money(r.amount)}</b> · <span data-no-i18n>${r.orders}</span> <span>${r.orders === 1 ? 'order' : 'orders'}</span> · <span>made by</span> <span data-no-i18n>${esc(r.submittedBy || 'supplier')}</span></small>
        ${r.note ? `<small><span>Note</span>: <span data-no-i18n>${esc(r.note)}</span></small>` : ''}
        ${r.status === 'submitted' && !r.billingReady ? '<small class="neg">The client has no billing details for receipts yet: ask them to fill them in on their Payments page.</small>' : ''}
        ${r.status === 'rejected' ? `<small class="neg"><span>Sent back</span>: <span data-no-i18n>${esc(r.reason)}</span></small>` : ''}
        ${r.status === 'approved' ? `<small class="pos"><span>Sent to the client</span> · <span data-no-i18n>${esc(fullDate(r.decidedAt).split(',')[0])}</span></small>` : ''}</div>
      <div class="rc-actions"><a class="btn btn-sm" href="/api/portal/admin/receipts/${r.id}/preview.pdf" target="_blank" rel="noopener">${ic('doc')}Open PDF</a>
        ${r.status === 'submitted' ? `<button type="button" class="btn btn-sm btn-primary" data-rc-approve="${r.id}"${r.billingReady ? '' : ' disabled'}>Send to the client</button><button type="button" class="btn btn-sm" data-rc-reject="${r.id}">Send back</button>` : ''}</div>
      ${S.rcReject === r.id ? `<form class="rc-reject" data-rc-reject-form="${r.id}"><label class="field"><span>Why? The supplier sees this</span><input name="reason" maxlength="500" required placeholder="e.g. wrong payment date"></label><div><button class="btn btn-sm" type="submit">Send back</button> <button class="btn btn-sm" type="button" data-rc-cancel>Cancel</button></div></form>` : ''}</div>`;
    return `<section class="card card-pad rc-box" data-receipts-box><div class="mc-head"><h3 class="sec-title">Receipts from the supplier</h3><span class="muted">${wait.length ? `<span data-no-i18n>${wait.length}</span> <span>waiting for you</span>` : 'Nothing waiting'}</span></div>
      <p class="muted" style="margin:0 0 10px;font-size:14px">Made in the supplier portal for a client payment. Open the PDF (what the client will get), then send it to the client or send it back.</p>
      ${wait.length ? `<div class="rc-list">${wait.map(row).join('')}</div>` : ''}
      ${done.length ? `<details class="rc-done"><summary><span>Recent</span> (<span data-no-i18n>${done.length}</span>)</summary><div class="rc-list">${done.map(row).join('')}</div></details>` : ''}</section>`;
  }
  function renderReceipts() { const slot = $('[data-receipts-slot]'); if (slot) slot.innerHTML = receiptsBoxHTML(); }
  async function loadReceipts() { try { S.receipts = (await api('/admin/receipts')).receipts; } catch (e) { S.receipts = S.receipts || []; } }
  async function receiptAction(path, body, msg) {
    try { S.receipts = (await api(path, { method: 'POST', body: body || {} })).receipts; S.rcReject = null; toast(msg); }
    catch (ex) { toast(ex.message); }
    renderReceipts(); if (S.tab === 'overview') renderOverview();
  }
