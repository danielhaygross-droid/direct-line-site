/* Direct Line supplier portal (phase 1): Billing for the supplier's part, the supplier share, own password.
   English and Simplified Chinese. The server only ever sends supplier-safe numbers (server/supplier-portal.mjs). */
(function () {
  'use strict';
  const S = { me: null, page: 'billing', clientId: null, billing: null, client: null, open: new Set() };
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = v => { const n = Number(v || 0); return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const signed = v => (Number(v) > 0 ? '+' : '') + money(v);

  // ---------- language: English / 简体中文 (words from the supplier sheet where it has them) ----------
  let lang = 'en';
  try { lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('dl_supplier_lang') || 'en'; } catch (e) { /* private mode */ }
  if (lang !== 'zh') lang = 'en';
  const ZH = {
    'SUPPLIER PORTAL': '供应商平台', 'Billing': '账单', 'Sign in': '登录', 'Username': '用户名', 'Password': '密码', 'Keep me signed in': '保持登录',
    'Sign in to see your billing.': '登录查看您的账单。', 'Wrong username or password.': '用户名或密码不正确。', 'Too many tries. Please wait 15 minutes.': '尝试次数过多，请等待 15 分钟。',
    'Could not connect. Please try again.': '无法连接，请重试。', 'Log out': '退出登录', 'Change password': '修改密码', 'Supplier': '供应商',
    'What each client has paid for your part of their orders, and what is still open. Direct Line records the payments.': '每个客户为订单中您的部分已付多少，还剩多少未付。付款由 Direct Line 记录。',
    'Updated': '更新于', '(China time)': '（中国时间）', 'Clients still owe': '客户还需付', 'Credit for clients': '客户余额', 'Paid for your part so far': '您的部分已付合计',
    'Nobody owes anything.': '没有人欠款。', 'No client has credit.': '没有客户有余额。', 'All payments, recorded by Direct Line': '所有付款，由 Direct Line 记录',
    'Credit = Paid − Orders − Cancellation fees.': '余额 = 已付 − 订单 − 取消费。',
    'Above zero, the client paid more than they owe and it counts toward their next orders. Below zero, the client still owes that amount.': '大于零：客户多付了，会用于下次订单。小于零：客户还需付这个金额。',
    'Balance per client': '每个客户的余额', 'Open a client to see every payment and order': '点开客户查看每笔付款和订单',
    'Client': '客户', 'Orders': '订单', 'Cancellation fees': '取消费', 'Paid for your part': '您的部分已付', 'Still owes / credit': '还需付 / 余额',
    'Still owes': '还需付', 'order': '个订单', 'Credit': '余额', 'All paid': '已付清', 'orders': '个订单', 'cancelled': '已取消', 'All clients': '所有客户', 'Net still owed': '净欠款', 'Net credit': '净余额',
    'still owed': '还需付', 'credit': '余额', 'Your supplier share': '您的供应商分成', 'Still to pay Direct Line': '还需付给 Direct Line',
    'for every order you bought. Cancelled orders don’t count. Direct Line records what you paid.': '每个已购买的订单。已取消的订单不算。您付的款由 Direct Line 记录。',
    'You pay Direct Line': '您付给 Direct Line', 'Orders counted': '计入的订单', 'Paid to Direct Line': '已付给 Direct Line', 'Last payment': '最近付款', 'No payment yet': '还没有付款',
    'Share': '分成', 'orders −': '个订单 −', 'Only orders the client has paid count (bought orders).': '只计入客户已付款的订单（已购买的订单）。',
    'All clients ': '所有客户', 'Loading…': '加载中…', 'No clients yet.': '还没有客户。', 'Something went wrong.': '出错了。', 'Try again': '重试',
    // one client
    'All clients': '所有客户', 'Account statement': '对账单', 'Orders and fees': '订单和费用', 'Other changes': '其他调整', 'Total': '合计', 'What the client paid for your part': '客户为您的部分已付',
    'payments': '笔付款', 'payment': '笔付款', 'Paid − orders and fees': '已付 − 订单和费用', 'owes nothing. The credit counts toward their next orders.': '没有欠款。余额会用于下次订单。',
    'still owes this amount.': '还需付这个金额。', 'is all paid.': '已付清。',
    'How the balance adds up': '余额是怎么算的', 'The same amount, made from the blocks on this page.': '同一个金额，由本页的各部分组成。',
    'Orders not paid yet': '未付款的订单', 'Cost changed after payment': '付款后成本有变动', 'Back from cancelled orders': '已取消订单退回',
    'Payments not matched to orders, earlier credit': '未对应订单的付款、之前的余额',
    'Below zero means the client paid more.': '小于零表示客户多付了。',
    'Payments': '付款', 'Payments Direct Line recorded for your part of this client’s orders. Open a payment to see the orders it paid.': 'Direct Line 为该客户订单中您的部分记录的付款。点开付款查看它支付了哪些订单。',
    'Paid on': '付款日期', 'Recorded by': '记录人', 'Orders it paid': '支付的订单', 'Cost when paid': '付款时的成本', 'Sent back to the client': '退还给客户',
    'No payments yet.': '还没有付款。', 'Cancelled': '已取消',
    'Cancelled orders': '已取消的订单', 'Back to the client': '退回给客户', 'Paid for the cancelled orders': '已取消订单的已付金额', 'Kept as credit on the client’s account (no money is sent back).': '作为客户的余额保留（不退钱）。',
    'By cancel date': '按取消日期', 'Cancelled on': '取消日期', 'Paid for it': '已付金额', 'Cancellation fee': '取消费', 'Refund': '退款', 'paid': '已付款', 'not paid': '未付款',
    'No cancelled orders.': '没有已取消的订单。', 'Fee added to the bill': '费用加到账单上',
    'Billed to the client, no payment yet.': '已向客户出账单，还没付款。', 'Order': '订单号', 'Ordered': '下单日期', 'Your cost': '您的成本', 'Nothing open.': '没有未付款的订单。',
    'The client paid the old cost. The difference is on this balance, so nobody has to find it by hand.': '客户按旧成本付款。差额已计入余额，不需要手动查找。',
    'Paid cost': '已付成本', 'Cost now': '现在的成本', 'Difference': '差额', 'Client owes it': '客户需补', 'Credit for the client': '客户的余额', 'No cost changes.': '没有成本变动。',
    'Your supplier share for this client': '该客户的供应商分成', 'Not part of the client’s balance.': '不计入客户的余额。',
    'Shown in Billing for all clients together.': '总数显示在账单页（所有客户）。',
    // password
    'Current password': '当前密码', 'New password': '新密码', 'Confirm new password': '确认新密码', 'Save password': '保存密码', '8 characters or more': '至少 8 个字符',
    'The new passwords don’t match.': '两次输入的新密码不一样。', 'Password changed.': '密码已修改。', 'Back to Billing': '返回账单',
    'Only Direct Line can add or remove supplier logins.': '只有 Direct Line 可以添加或删除供应商账号。',
    'Wrong current password.': '当前密码不正确。', 'Use 8 to 128 characters for your password.': '密码请使用 8 到 128 个字符。', 'Choose a different password.': '请选择一个不同的密码。',
    'Please sign in again.': '请重新登录。',
  };
  const t = s => (lang === 'zh' && ZH[s]) || s;
  const setLang = l => { lang = l; try { localStorage.setItem('dl_supplier_lang', l); } catch (e) { /* private mode */ } document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'; render(); };
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  const fmtDay = sec => { if (!sec) return ''; return new Date(sec * 1000).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: 'Asia/Shanghai', day: 'numeric', month: 'short', ...(new Date(sec * 1000).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };
  const fmtIsoDay = iso => (iso ? fmtDay(Math.floor(Date.parse(iso + 'T12:00:00Z') / 1000)) : '');
  const fmtTime = sec => new Date(sec * 1000).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: 'Asia/Shanghai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function api(path, { method = 'GET', body } = {}) {
    const r = await fetch('/api/portal' + path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) { const e = new Error(t(data.error || 'Something went wrong.')); e.status = r.status; throw e; }
    return data;
  }
  const ICON = {
    bill: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  };

  // ---------- sign in, top bar ----------
  function brand() { return `<span class="brand"><span>direct<b>↗</b>line.</span><small>${t('SUPPLIER PORTAL')}</small></span>`; }
  function langSwitch() {
    return `<div class="sp-lang" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="${lang === 'en'}">EN</button><button type="button" data-lang="zh" aria-pressed="${lang === 'zh'}">中文</button></div>`;
  }
  function loginScreen() {
    document.body.innerHTML = `<main class="sp-login"><div class="sp-login-top">${brand()}${langSwitch()}</div>
      <section class="sp-login-card card card-pad"><h1>${t('Sign in')}</h1><p class="muted">${t('Sign in to see your billing.')}</p>
        <form id="sp-login" novalidate><label class="field"><span>${t('Username')}</span><input name="username" autocomplete="username" required></label>
          <label class="field"><span>${t('Password')}</span><input name="password" type="password" autocomplete="current-password" required></label>
          <label class="sp-check"><input type="checkbox" name="remember"> <span>${t('Keep me signed in')}</span></label>
          <button type="submit" class="btn btn-primary btn-block">${t('Sign in')}</button><p class="form-msg" role="alert"></p></form></section></main>`;
    const f = $('#sp-login');
    f.username.focus();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const b = $('[type=submit]', f), m = $('.form-msg', f); if (b.disabled) return; b.disabled = true; m.textContent = '';
      try {
        const r = await fetch('/api/portal/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: f.username.value.trim(), password: f.password.value, remember: f.remember.checked }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok) { if (d.role !== 'supplier') { location.href = d.redirect || '/'; return; } return boot(); }
        m.textContent = t(r.status === 401 ? 'Wrong username or password.' : r.status === 429 ? 'Too many tries. Please wait 15 minutes.' : 'Could not connect. Please try again.'); m.className = 'form-msg err';
      } catch (ex) { m.textContent = t('Could not connect. Please try again.'); m.className = 'form-msg err'; }
      b.disabled = false;
    });
  }
  function shell(inner) {
    const name = S.me?.name || '', ini = name.trim().slice(0, 1).toUpperCase() || 'S';
    return `<header class="sp-top"><a class="sp-home" href="#billing" aria-label="${esc(t('Billing'))}">${brand()}</a>
      <nav class="sp-nav"><a href="#billing" class="sp-tab" aria-current="${S.page !== 'password' ? 'page' : 'false'}">${ICON.bill}<span>${t('Billing')}</span></a></nav>
      <div class="sp-right">${langSwitch()}
        <details class="sp-me"><summary aria-label="${esc(t('Supplier'))}"><span class="sp-ava">${esc(ini)}</span><span class="sp-who"><b>${esc(name)}</b><small>${t('Supplier')}</small></span></summary>
          <div class="sp-menu"><a href="#password">${t('Change password')}</a><button type="button" data-logout>${t('Log out')}</button></div></details></div></header>
      <main class="sp-main" id="sp-main">${inner}</main>`;
  }

  // ---------- Billing: balance per client + supplier share ----------
  const balCell = b => b > 0.004 ? `<span class="sp-bal owe"><small>${t('Still owes')}</small><b>${money(b)}</b></span>`
    : b < -0.004 ? `<span class="sp-bal credit"><small>${t('Credit')}</small><b>${money(-b)}</b></span>`
    : `<span class="sp-bal zero"><small>${t('All paid')}</small><b>${money(0)}</b></span>`;
  const countLine = c => `${c.ordersTotal} ${t(c.ordersTotal === 1 ? 'order' : 'orders')}${c.cancelledCount ? ` · ${c.cancelledCount} ${t('cancelled')}` : ''}`;
  const shareIntro = rate => lang === 'zh'
    ? `每个已购买的订单您付给 Direct Line ${money(rate)}。已取消的订单不算。您付的款由 Direct Line 记录。`
    : `You pay Direct Line ${money(rate)} for every order you bought. Cancelled orders don’t count. Direct Line records what you paid.`;
  function tileList(rows, tone) {
    return `<ul class="sp-tile-list ${tone}">${rows.map(c => `<li><span>${esc(c.name)}</span><b>${money(Math.abs(c.balance))}</b></li>`).join('')}</ul>`;
  }
  function billingHTML(d) {
    const T = d.totals, owe = d.clients.filter(c => c.balance > 0.004), cred = d.clients.filter(c => c.balance < -0.004), sh = d.share;
    const bar = owe.length > 1 ? `<div class="sp-split" aria-hidden="true">${owe.map(c => `<span style="flex:${Math.max(1, Math.round(c.balance * 100))}"></span>`).join('')}</div>` : '';
    const net = T.net;
    const rows = d.clients.map(c => `<tr data-client="${c.id}" tabindex="0">
        <td><b>${esc(c.name)}</b><small>${countLine(c)}</small></td><td class="num">${money(c.orders)}</td><td class="num">${money(c.cancelFees)}</td><td class="num">${money(c.paidForYourPart)}</td>
        <td class="num">${balCell(c.balance)}</td><td class="go">${ICON.next}</td></tr>`).join('');
    const cards = d.clients.map(c => `<button type="button" class="sp-ccard" data-client="${c.id}"><span class="sp-ccard-h"><span><b>${esc(c.name)}</b><small>${countLine(c)}</small></span>${balCell(c.balance)}</span>
        <span class="sp-ccard-n"><span><small>${t('Orders')}</small>${money(c.orders)}</span><span><small>${t('Cancellation fees')}</small>${money(c.cancelFees)}</span><span><small>${t('Paid for your part')}</small>${money(c.paidForYourPart)}</span></span></button>`).join('');
    const shareRows = d.clients.filter(c => c.share.counted).map(c => `<tr><td><b>${esc(c.name)}</b></td><td class="num">${c.share.counted}</td><td class="num">${money(c.share.amount)}</td></tr>`).join('');
    return `<div class="sp-head"><div><h1>${t('Billing')}</h1><p class="sp-intro">${t('What each client has paid for your part of their orders, and what is still open. Direct Line records the payments.')}</p>
        <p class="sp-upd">${t('Updated')} ${esc(fmtTime(d.updatedAt))} ${t('(China time)')}</p></div></div>
      <section class="sp-tiles">
        <div class="sp-tile dark"><span class="sp-tile-k">${t('Clients still owe')}</span><span class="sp-tile-v">${money(T.stillOwed)}</span>${bar}${owe.length ? tileList(owe, 'gold') : `<p class="sp-tile-n">${t('Nobody owes anything.')}</p>`}</div>
        <div class="sp-tile"><span class="sp-tile-k">${t('Credit for clients')}</span><span class="sp-tile-v mint">${money(T.credit)}</span>${cred.length ? tileList(cred, 'mint') : `<p class="sp-tile-n">${t('No client has credit.')}</p>`}</div>
        <div class="sp-tile"><span class="sp-tile-k">${t('Paid for your part so far')}</span><span class="sp-tile-v">${money(T.paidForYourPart)}</span><p class="sp-tile-n">${t('All payments, recorded by Direct Line')}</p></div>
      </section>
      <p class="sp-rule">${ICON.info}<span><b>${t('Credit = Paid − Orders − Cancellation fees.')}</b> ${t('Above zero, the client paid more than they owe and it counts toward their next orders. Below zero, the client still owes that amount.')}</span></p>
      <section class="card sp-card"><div class="sp-card-h"><h2>${t('Balance per client')}</h2><span class="muted">${t('Open a client to see every payment and order')}</span></div>
        ${d.clients.length ? `<div class="sp-table-wrap"><table class="sp-table sp-click"><thead><tr><th>${t('Client')}</th><th class="num">${t('Orders')}</th><th class="num">${t('Cancellation fees')}</th><th class="num">${t('Paid for your part')}</th><th class="num">${t('Still owes / credit')}</th><th></th></tr></thead>
          <tbody>${rows}</tbody><tfoot><tr><td><b>${t('All clients')}</b></td><td class="num">${money(T.orders)}</td><td class="num">${money(T.cancelFees)}</td><td class="num">${money(T.paidForYourPart)}</td>
          <td class="num">${net >= 0 ? `<span class="sp-bal owe"><small>${t('Net still owed')}</small><b>${money(net)}</b></span>` : `<span class="sp-bal credit"><small>${t('Net credit')}</small><b>${money(-net)}</b></span>`}</td><td></td></tr></tfoot></table></div>
          <div class="sp-cards">${cards}</div>
          <p class="sp-foot">${net >= 0 ? t('Net still owed') : t('Net credit')} ${money(Math.abs(net))} = ${money(T.stillOwed)} ${t('still owed')} − ${money(T.credit)} ${t('credit')}</p>` : `<p class="sp-empty">${t('No clients yet.')}</p>`}
      </section>
      <section class="card sp-card"><div class="sp-card-h"><h2>${t('Your supplier share')}</h2><span class="sp-due">${t('Still to pay Direct Line')} · <b class="${sh.stillToPay > 0.004 ? 'red' : ''}">${money(sh.stillToPay)}</b></span></div>
        <p class="sp-sub">${shareIntro(sh.rate)}</p>
        <div class="sp-mini"><div><small>${t('Orders counted')}</small><b>${sh.counted}</b><span>${t('Only orders the client has paid count (bought orders).')}</span></div>
          <div><small>${money(sh.rate)} × ${t('orders')}</small><b>${money(sh.amount)}</b></div>
          <div><small>${t('Paid to Direct Line')}</small><b>${money(sh.paid)}</b><span>${sh.lastPaidAt ? t('Last payment') + ' ' + esc(fmtDay(sh.lastPaidAt)) : t('No payment yet')}</span></div>
          <div><small>${t('Still to pay Direct Line')}</small><b class="${sh.stillToPay > 0.004 ? 'red' : ''}">${money(sh.stillToPay)}</b></div></div>
        ${shareRows ? `<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>${t('Client')}</th><th class="num">${t('Orders counted')}</th><th class="num">${t('Share')}</th></tr></thead><tbody>${shareRows}</tbody>
          <tfoot><tr><td><b>${t('All clients')}</b></td><td class="num">${sh.counted}</td><td class="num">${money(sh.amount)}</td></tr></tfoot></table></div>` : ''}
      </section>`;
  }

  // ---------- one client: statement, how it adds up, payments, cancelled, not paid, cost changes, share ----------
  function statementHTML(c) {
    const s = c.statement, b = c.balance;
    const head = b > 0.004 ? `<span class="sp-stmt-v owe">${t('Still owes')} ${money(b)}</span>` : b < -0.004 ? `<span class="sp-stmt-v credit">${t('Credit')} ${money(-b)}</span>` : `<span class="sp-stmt-v">${t('All paid')} ${money(0)}</span>`;
    const say = b > 0.004 ? t('still owes this amount.') : b < -0.004 ? t('owes nothing. The credit counts toward their next orders.') : t('is all paid.');
    const live = c.ordersTotal - c.cancelledCount;
    return `<section class="card sp-card"><span class="sp-eyebrow">${t('Account statement')}</span>${head}<p class="sp-sub">${esc(c.name)} ${say}</p>
      <div class="sp-lines"><p class="sp-lh">1 · ${t('Orders and fees')}</p>
        <div><span>${live} ${t(live === 1 ? 'order' : 'orders')}</span><b>${money(s.orders)}</b></div>
        <div><span>${t('Cancellation fees')} <small>(${c.cancelledCount} ${t('cancelled')})</small></span><b>${money(s.cancelFees)}</b></div>
        ${Math.abs(s.other) > 0.004 ? `<div><span>${t('Other changes')}</span><b>${money(s.other)}</b></div>` : ''}
        <div class="tot"><span>${t('Total')}</span><b>${money(s.billed)}</b></div>
        <p class="sp-lh">2 · ${t('What the client paid for your part')}</p>
        <div class="tot"><span>${c.payments.length} ${t(c.payments.length === 1 ? 'payment' : 'payments')}</span><b>${money(s.paid)}</b></div>
        <div class="res ${b > 0.004 ? 'owe' : b < -0.004 ? 'credit' : ''}"><span>3 · ${t('Paid − orders and fees')}</span><b>${b > 0.004 ? t('Still owes') + ' ' + money(b) : b < -0.004 ? t('Credit') + ' ' + money(-b) : money(0)}</b></div></div></section>`;
  }
  function addsHTML(c) {
    const a = c.adds, row = (label, n, v, target) => `<a class="sp-add" href="#${target}"><span><u>${label}</u>${n != null ? `<small>${n} ${t(n === 1 ? 'order' : 'orders')}</small>` : ''}</span><b>${v}</b></a>`;
    return `<section class="card sp-card"><h2>${t('How the balance adds up')}</h2><p class="sp-sub">${t('The same amount, made from the blocks on this page.')}</p>
      <div class="sp-adds">${row(t('Orders not paid yet'), c.notPaid.length, money(a.notPaid), 'sp-notpaid')}
        ${row(t('Cost changed after payment'), c.costChanged.length, signed(a.costChanged), 'sp-changed')}
        ${row(t('Back from cancelled orders'), c.cancelledTotals.count, money(-a.cancelledBack), 'sp-cancelled')}
        ${Math.abs(a.other) > 0.004 ? `<div class="sp-add"><span>${t('Payments not matched to orders, earlier credit')}</span><b>${signed(a.other)}</b></div>` : ''}
        <div class="sp-add tot"><span>= ${c.balance < -0.004 ? t('Credit') : t('Still owes')}</span><b class="${c.balance < -0.004 ? 'mint' : c.balance > 0.004 ? 'red' : ''}">${money(Math.abs(c.balance))}</b></div></div></section>`;
  }
  function paymentsHTML(c) {
    const rows = c.payments.map(p => {
      const open = S.open.has(p.id), cx = p.orders.filter(o => o.cancelled).length;
      return `<tr><td>${esc(fmtDay(p.paidAt))}</td><td class="num"><b>${money(p.yourPart)}</b></td><td class="dl">Direct Line</td>
        <td>${p.orders.length ? `<button type="button" class="btn btn-sm sp-exp" data-pay="${p.id}" aria-expanded="${open}">${ICON.next}${p.orders.length} ${t(p.orders.length === 1 ? 'order' : 'orders')}</button>${cx ? ` <small class="muted">${cx} ${t('cancelled')}</small>` : ''}` : '—'}
        ${open ? `<div class="sp-paid-list">${p.orders.map(o => `<div><span><b>${esc(o.ref)}</b>${o.cancelled ? ` <span class="sp-tag red">${t('Cancelled')}</span>` : ''}${o.item ? `<small>${esc(o.item)}</small>` : ''}</span><b>${money(o.cost)}</b></div>`).join('')}<p class="sp-note">${t('Cost when paid')}</p></div>` : ''}</td></tr>`;
    }).join('');
    const total = c.payments.reduce((n, p) => n + p.yourPart, 0);
    return `<section class="card sp-card"><div class="sp-card-h"><h2>${t('Payments')}</h2><b>${c.payments.length} ${t(c.payments.length === 1 ? 'payment' : 'payments')} · ${money(total - c.sentBack)}</b></div>
      <p class="sp-sub">${t('Payments Direct Line recorded for your part of this client’s orders. Open a payment to see the orders it paid.')}</p>
      ${c.payments.length ? `<div class="sp-table-wrap"><table class="sp-table sp-pay"><thead><tr><th>${t('Paid on')}</th><th class="num">${t('Paid for your part')}</th><th>${t('Recorded by')}</th><th>${t('Orders it paid')}</th></tr></thead><tbody>${rows}</tbody>
        <tfoot>${c.sentBack > 0.004 ? `<tr><td>${t('Sent back to the client')}</td><td class="num">${money(-c.sentBack)}</td><td></td><td></td></tr>` : ''}<tr><td><b>${t('Total')}</b></td><td class="num"><b>${money(total - c.sentBack)}</b></td><td></td><td></td></tr></tfoot></table></div>` : `<p class="sp-empty">${t('No payments yet.')}</p>`}</section>`;
  }
  function cancelledHTML(c) {
    const T = c.cancelledTotals;
    if (!T.count) return `<section class="card sp-card" id="sp-cancelled"><h2>${t('Cancelled orders')}</h2><p class="sp-empty">${t('No cancelled orders.')}</p></section>`;
    const days = c.cancelled.map(d => `<tr class="day"><td><b>${esc(fmtIsoDay(d.day))}</b></td><td>${d.orders.length} · ${d.orders.filter(o => o.paid).length} ${t('paid')}</td><td class="num">${d.paidFor ? money(d.paidFor) : '—'}</td><td class="num">${money(d.cancelFee)}</td><td class="num"><b>${money(d.back)}</b></td></tr>`
      + d.orders.map(o => `<tr class="sub"><td colspan="2">${esc(o.ref)}${o.store ? ' · ' + esc(o.store) : ''}${o.paid ? '' : ` <small class="muted">(${t('not paid')})</small>`}</td><td class="num">${o.paid ? money(o.paidFor) : '—'}</td><td class="num">${money(o.cancelFee)}</td><td class="num">${money(o.back)}${!o.paid && o.cancelFee ? `<small>${t('Fee added to the bill')}</small>` : ''}</td></tr>`).join('')).join('');
    return `<section class="card sp-card" id="sp-cancelled"><div class="sp-card-h"><h2>${t('Cancelled orders')}</h2><b>${t('Back to the client')} · ${money(T.back)}</b></div>
      <p class="sp-sub">${T.count} ${t('cancelled')} · ${T.paidCount} ${t('paid')}</p>
      <div class="sp-calc"><div><span>${t('Paid for the cancelled orders')}</span><b>${money(T.paidFor)}</b></div><div><span>− ${t('Cancellation fees')}</span><b>${money(-T.cancelFees)}</b></div>
        <div class="tot"><span>= ${t('Back to the client')}</span><b class="mint">${money(T.back)}</b></div><p class="sp-note">${t('Kept as credit on the client’s account (no money is sent back).')}</p></div>
      <p class="sp-lh">${t('By cancel date')}</p>
      <div class="sp-table-wrap"><table class="sp-table sp-cx"><thead><tr><th>${t('Cancelled on')}</th><th>${t('Orders')}</th><th class="num">${t('Paid for it')}</th><th class="num">${t('Cancellation fee')}</th><th class="num">${t('Refund')}</th></tr></thead>
        <tbody>${days}</tbody><tfoot><tr><td><b>${t('Total')}</b></td><td>${T.count}</td><td class="num">${money(T.paidFor)}</td><td class="num">${money(T.cancelFees)}</td><td class="num"><b>${money(T.back)}</b></td></tr></tfoot></table></div></section>`;
  }
  function notPaidHTML(c) {
    return `<section class="card sp-card" id="sp-notpaid"><div class="sp-card-h"><h2>${t('Orders not paid yet')}</h2><b>${money(c.notPaidSum)}</b></div><p class="sp-sub">${t('Billed to the client, no payment yet.')}</p>
      ${c.notPaid.length ? `<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>${t('Order')}</th><th>${t('Ordered')}</th><th class="num">${t('Your cost')}</th></tr></thead>
        <tbody>${c.notPaid.map(o => `<tr><td><b>${esc(o.ref)}</b>${o.item ? `<small>${esc(o.item)}</small>` : ''}</td><td>${esc(fmtDay(o.orderedAt))}</td><td class="num">${money(o.cost)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>${c.notPaid.length} ${t(c.notPaid.length === 1 ? 'order' : 'orders')}</b></td><td></td><td class="num"><b>${money(c.notPaidSum)}</b></td></tr></tfoot></table></div>` : `<p class="sp-empty">${t('Nothing open.')}</p>`}</section>`;
  }
  function changedHTML(c) {
    return `<section class="card sp-card" id="sp-changed"><div class="sp-card-h"><h2>${t('Cost changed after payment')}</h2><b>${signed(c.costChangedSum)}</b></div><p class="sp-sub">${t('The client paid the old cost. The difference is on this balance, so nobody has to find it by hand.')}</p>
      ${c.costChanged.length ? `<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>${t('Order')}</th><th class="num">${t('Paid cost')}</th><th class="num">${t('Cost now')}</th><th class="num">${t('Difference')}</th></tr></thead>
        <tbody>${c.costChanged.map(o => `<tr><td><b>${esc(o.ref)}</b>${o.item ? `<small>${esc(o.item)}</small>` : ''}</td><td class="num">${money(o.paidCost)}</td><td class="num">${money(o.costNow)}</td><td class="num"><b class="${o.difference > 0 ? 'red' : 'mint'}">${signed(o.difference)}</b><small>${t(o.difference > 0 ? 'Client owes it' : 'Credit for the client')}</small></td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>${c.costChanged.length} ${t(c.costChanged.length === 1 ? 'order' : 'orders')}</b></td><td></td><td></td><td class="num"><b>${signed(c.costChangedSum)}</b></td></tr></tfoot></table></div>` : `<p class="sp-empty">${t('No cost changes.')}</p>`}</section>`;
  }
  function clientHTML(c) {
    return `<a class="sp-backlink" href="#billing">${ICON.back}${t('All clients')}</a>
      <div class="sp-head"><div><h1>${esc(c.name)}</h1><p class="sp-upd">${countLine(c)} · ${t('Updated')} ${esc(fmtTime(S.clientAt))} ${t('(China time)')}</p></div></div>
      <div class="sp-grid2">${statementHTML(c)}${addsHTML(c)}</div>
      ${paymentsHTML(c)}${cancelledHTML(c)}
      <div class="sp-grid2">${notPaidHTML(c)}${changedHTML(c)}</div>
      <section class="card sp-card"><h2>${t('Your supplier share for this client')}</h2><p class="sp-sub">${t('Only orders the client has paid count (bought orders).')} ${t('Not part of the client’s balance.')} ${t('Shown in Billing for all clients together.')}</p>
        <div class="sp-mini two"><div><small>${t('Orders counted')}</small><b>${c.share.counted}</b></div><div><small>${money(c.share.rate)} × ${t('orders')}</small><b>${money(c.share.amount)}</b></div></div></section>`;
  }

  // ---------- change password ----------
  function passwordHTML() {
    return `<a class="sp-backlink" href="#billing">${ICON.back}${t('Back to Billing')}</a>
      <div class="sp-head"><div><h1>${t('Change password')}</h1><p class="sp-intro">${t('Only Direct Line can add or remove supplier logins.')}</p></div></div>
      <section class="card sp-card sp-narrow"><form id="sp-password" novalidate>
        <label class="field"><span>${t('Current password')}</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>
        <label class="field"><span>${t('New password')} <small>${t('8 characters or more')}</small></span><input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>
        <label class="field"><span>${t('Confirm new password')}</span><input name="confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>
        <button type="submit" class="btn btn-primary">${t('Save password')}</button><p class="form-msg" role="status"></p></form></section>`;
  }
  function bindPassword() {
    const f = $('#sp-password'); if (!f) return;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const b = $('[type=submit]', f), m = $('.form-msg', f); if (b.disabled) return; m.className = 'form-msg';
      if (f.password.value !== f.confirm.value) { m.textContent = t('The new passwords don’t match.'); m.className = 'form-msg err'; return; }
      b.disabled = true;
      try { await api('/supplier/password', { method: 'POST', body: { currentPassword: f.currentPassword.value, password: f.password.value } }); f.reset(); m.textContent = t('Password changed.'); m.className = 'form-msg ok'; }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      b.disabled = false;
    });
  }

  // ---------- pages, events, boot ----------
  function readHash() {
    const h = location.hash.replace(/^#/, ''), m = /^client\/(\d+)$/.exec(h);
    if (m) { S.page = 'client'; S.clientId = Number(m[1]); } else if (h === 'password') S.page = 'password'; else S.page = 'billing';
  }
  const loading = () => `<p class="sp-empty">${t('Loading…')}</p>`;
  const failed = e => `<div class="sp-empty"><p>${esc(e.message)}</p><button type="button" class="btn" data-retry>${t('Try again')}</button></div>`;
  function render() {
    if (!S.me) return loginScreen();
    const body = S.page === 'password' ? passwordHTML()
      : S.page === 'client' ? (S.client && S.client.id === S.clientId ? clientHTML(S.client) : S.error || loading())
      : S.billing ? billingHTML(S.billing) : S.error || loading();
    const y = window.scrollY;
    document.body.innerHTML = shell(body);
    document.title = (S.page === 'client' && S.client ? S.client.name + ' · ' : '') + 'Direct Line · ' + t('Billing');
    if (S.keepScroll) window.scrollTo(0, y);
    S.keepScroll = false;
    bindPassword();
  }
  async function load() {
    S.error = null;
    try {
      if (S.page === 'client') { if (!S.client || S.client.id !== S.clientId) { render(); const d = await api('/supplier/billing/' + S.clientId); S.client = d.client; S.clientAt = d.updatedAt; } }
      else if (S.page === 'billing') { if (!S.billing) render(); const d = await api('/supplier/billing'); S.billing = d; }
    } catch (e) { if (e.status === 401) { S.me = null; return render(); } S.error = failed(e); }
    render();
  }
  document.addEventListener('click', async e => {
    const l = e.target.closest('[data-lang]'); if (l) { setLang(l.dataset.lang); return; }
    if (e.target.closest('[data-logout]')) { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/'; return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const p = e.target.closest('[data-pay]'); if (p) { const id = Number(p.dataset.pay); S.open.has(id) ? S.open.delete(id) : S.open.add(id); S.keepScroll = true; render(); return; }
    const c = e.target.closest('[data-client]'); if (c) { location.hash = 'client/' + c.dataset.client; return; }
  });
  document.addEventListener('keydown', e => { const c = e.target.closest?.('tr[data-client]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = 'client/' + c.dataset.client; } });
  window.addEventListener('hashchange', () => { readHash(); window.scrollTo(0, 0); load(); });
  async function boot() {
    readHash();
    try { S.me = await api('/me'); }
    catch (e) { S.me = null; return render(); }
    if (S.me.role !== 'supplier') { location.href = S.me.role === 'admin' ? '/admin/' : '/portal/'; return; }
    S.billing = null; S.client = null;
    load();
  }

  boot();
})();
