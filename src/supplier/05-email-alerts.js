  // ---------- email alerts (16 Nov 2026): the supplier's own email for the 30-minute summary ----------
  Object.assign(ZH, {
    'Email alerts': '邮件提醒', 'Get an email when there is something new: new orders, cancel requests, quotes, price requests, receipts sent back. At most one email every 30 minutes.': '有新内容时收到邮件：新订单、取消申请、询价、降价请求、被退回的收据。每30分钟最多一封。',
    'Your email': '您的邮箱', 'Send me email alerts': '给我发送邮件提醒', 'Save': '保存', 'Saved.': '已保存。', 'Send a test email': '发送测试邮件', 'Test email sent. Check your inbox (and spam).': '测试邮件已发送，请查看收件箱（和垃圾邮件）。',
    'Email is not connected yet. Direct Line will tell you when it is.': '邮件功能还未开通，Direct Line 开通后会通知您。',
    'Each supplier login sets its own email. Change it in Fees & settings > Team & tools > Supplier logins > Edit.': '每个供应商账号设置自己的邮箱。管理员可在 Fees & settings > Team & tools > Supplier logins > Edit 中修改。',
  });
  S.alertsCfg = null; S.alertsMsg = null;
  function emailAlertsHTML() {
    const c = S.alertsCfg;
    if (S.view) return `<div class="sp-head"><div><h1>${t('Email alerts')}</h1><p class="sp-intro">${t('Each supplier login sets its own email. Change it in Fees & settings > Team & tools > Supplier logins > Edit.')}</p></div></div>`;
    if (!c) return S.error || `<p class="sp-empty">${t('Loading…')}</p>`;
    const msg = S.alertsMsg ? `<p class="form-msg ${S.alertsMsg.ok ? 'ok' : 'err'}">${esc(S.alertsMsg.text)}</p>` : '';
    return `<div class="sp-head"><div><h1>${t('Email alerts')}</h1><p class="sp-intro">${t('Get an email when there is something new: new orders, cancel requests, quotes, price requests, receipts sent back. At most one email every 30 minutes.')}</p></div></div>
      <section class="card sp-card sp-narrow"><form id="sp-alerts" class="sp-rcform" novalidate>
        <label class="field"><span>${t('Your email')}</span><input name="email" type="email" maxlength="160" value="${esc(c.email)}" placeholder="name@example.com" autocomplete="email"></label>
        <label class="sp-check"><input type="checkbox" name="on"${c.on ? ' checked' : ''}> <span>${t('Send me email alerts')}</span></label>
        ${c.connected ? '' : `<p class="sp-wait">${t('Email is not connected yet. Direct Line will tell you when it is.')}</p>`}
        ${msg}<div class="sp-btnrow"><button type="submit" class="btn btn-primary">${t('Save')}</button>${c.connected && c.email ? `<button type="button" class="btn" data-alert-test>${t('Send a test email')}</button>` : ''}</div>
      </form></section>`;
  }
  async function saveAlerts(form) {
    const b = $('[type=submit]', form); if (b.disabled) return; b.disabled = true;
    try { S.alertsCfg = await api('/supplier/email-alerts', { method: 'PUT', body: { email: form.email.value.trim(), on: form.on.checked } }); S.alertsMsg = { ok: true, text: t('Saved.') }; }
    catch (e) { S.alertsMsg = { ok: false, text: e.message }; }
    rerenderOrders();
  }
  async function testAlert(btn) {
    btn.disabled = true;
    try { await api('/supplier/email-alerts/test', { method: 'POST' }); S.alertsMsg = { ok: true, text: t('Test email sent. Check your inbox (and spam).') }; }
    catch (e) { S.alertsMsg = { ok: false, text: e.message }; }
    rerenderOrders();
  }
