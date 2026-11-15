/* Direct Line supplier portal (phase 1): Billing for the supplier's part, the supplier share, own password.
   English and Simplified Chinese. The server only ever sends supplier-safe numbers (server/supplier-portal.mjs). */
(function () {
  'use strict';
  const S = { me: null, page: 'orders', clientId: null, billing: null, client: null, open: new Set(),
    queue: null, tab: 'new', q: '', f: {}, limit: 50, pinned: new Set(), pinnedTab: null, saving: {}, pending: {}, warn: {}, err: {}, drawer: null, alerts: null, seenAt: null };
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
    
    'You pay Direct Line': '您付给 Direct Line', 'Orders counted': '计入的订单', 'Paid to Direct Line': '已付给 Direct Line', 'Last payment': '最近付款', 'No payment yet': '还没有付款',
    'Share': '分成', 'orders −': '个订单 −', 'Every order counts, except cancelled ones.': '每个订单都计入，已取消的订单除外。',
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
    box: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>',
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
    return `<header class="sp-top"><a class="sp-home" href="#orders" aria-label="${esc(t('Billing'))}">${brand()}</a>
      <nav class="sp-nav"><a href="#orders" class="sp-tab" aria-current="${S.page === 'orders' ? 'page' : 'false'}">${ICON.box}<span>${t('Orders')}</span>${S.alerts?.newOrders ? `<b class="sp-badge">${S.alerts.newOrders}</b>` : ''}</a><a href="#billing" class="sp-tab" aria-current="${['billing', 'client'].includes(S.page) ? 'page' : 'false'}">${ICON.bill}<span>${t('Billing')}</span></a></nav>
      <div class="sp-right">${langSwitch()}${bellHTML()}
        <details class="sp-me"><summary aria-label="${esc(t('Supplier'))}"><span class="sp-ava">${esc(ini)}</span><span class="sp-who"><b>${esc(name)}</b><small>${t('Supplier')}</small></span></summary>
          <div class="sp-menu"><a href="#password">${t('Change password')}</a><button type="button" data-logout>${t('Log out')}</button></div></details></div></header>
      <main class="sp-main${S.page === 'orders' ? ' wide' : ''}" id="sp-main">${inner}</main>
      <nav class="sp-bottom"><a href="#orders" aria-current="${S.page === 'orders' ? 'page' : 'false'}">${ICON.box}<span>${t('Orders')}</span>${S.alerts?.newOrders ? `<b class="sp-badge">${S.alerts.newOrders}</b>` : ''}</a><a href="#billing" aria-current="${['billing', 'client'].includes(S.page) ? 'page' : 'false'}">${ICON.bill}<span>${t('Billing')}</span></a></nav>`;
  }

  // ---------- Billing: balance per client + supplier share ----------
  const balCell = b => b > 0.004 ? `<span class="sp-bal owe"><small>${t('Still owes')}</small><b>${money(b)}</b></span>`
    : b < -0.004 ? `<span class="sp-bal credit"><small>${t('Credit')}</small><b>${money(-b)}</b></span>`
    : `<span class="sp-bal zero"><small>${t('All paid')}</small><b>${money(0)}</b></span>`;
  const countLine = c => `${c.ordersTotal} ${t(c.ordersTotal === 1 ? 'order' : 'orders')}${c.cancelledCount ? ` · ${c.cancelledCount} ${t('cancelled')}` : ''}`;
  const shareIntro = rate => lang === 'zh'
    ? `每个订单您付给 Direct Line ${money(rate)}，已取消的订单不算。您付的款由 Direct Line 记录。`
    : `You pay Direct Line ${money(rate)} for every order. Cancelled orders don’t count. Direct Line records what you paid.`;
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
        <div class="sp-mini"><div><small>${t('Orders counted')}</small><b>${sh.counted}</b><span>${t('Every order counts, except cancelled ones.')}</span></div>
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
      <section class="card sp-card"><h2>${t('Your supplier share for this client')}</h2><p class="sp-sub">${t('Every order counts, except cancelled ones.')} ${t('Not part of the client’s balance.')} ${t('Shown in Billing for all clients together.')}</p>
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

  // ---------- Orders: the work queue (phase 2) ----------
  Object.assign(ZH, {
    'Orders': '订单', 'Newest first. Type in the gold columns: each change saves by itself.': '最新的在最上面。在金色栏里填写：每次修改都会自动保存。',
    'New': '新订单', 'Bought': '已购买', 'Shipped': '已发货', 'Cancelled': '已取消', 'Not bought': '未购买', 'Cancel requested': '客户申请取消',
    'cancel requests': '个取消申请', 'cancel request': '个取消申请', 'don’t buy or ship them. Wait for Direct Line.': '不要购买或发货。请等 Direct Line 通知。',
    'Show them': '查看', 'Show all': '显示全部', 'Order number, shop, product or tracking': '订单号、店铺、商品或运单号', 'Filters': '筛选', 'Clear filters': '清除筛选',
    'All clients': '所有客户', 'All countries': '所有国家', 'Only orders without a total cost': '只看没有总成本的订单',
    'Order': '订单号', 'Product / variation': '商品 / 款式', 'Qty': '数量', 'Ship to': '寄往', 'Total cost (USD)': '总成本（美元）', 'Cost per product (USD)': '每件商品成本（美元）',
    'Shipping status': '发货状态', 'Tracking number': '运单号', 'Courier': '快递公司', 'Delayed? + reason': '延迟？+ 原因', 'Domestic express tracking': '国内快递单号',
    'Cancellation fee (USD)': '取消费（美元）', 'Pick': '选择', 'On time': '准时', 'Possibly delayed': '可能延迟', 'Reason': '原因', 'If there is one': '如果有的话',
    'Nothing typed yet': '还没有填写', 'Saved': '已保存', 'Not saved': '未保存', 'Saving…': '保存中…', 'just now': '刚刚', 'min ago': '分钟前', 'h ago': '小时前',
    'Also on': '也在', 'Check the number.': '请检查号码。', 'No orders here.': '这里没有订单。', 'No orders match.': '没有符合的订单。',
    'Gold columns are yours to fill in': '金色栏由您填写', 'Red row: cancel requested': '红色行：客户申请取消', 'Enter saves and jumps to the same box in the next order.': '按回车保存并跳到下一个订单的同一格。',
    'Export to Excel': '导出 Excel', 'Money is only your part.': '金额只包含您的部分。', 'Show more': '显示更多',
    'Product': '商品', 'Variation': '款式', 'Open': '打开', 'Copy link': '复制链接', 'Copied': '已复制', 'Download all photos (zip)': '下载全部图片（zip）', 'All photos (zip)': '全部图片（zip）',
    'Customer': '收件人', 'Delivery address & phone': '收货地址和电话', 'Copy address': '复制地址', 'Tax number': '税号', 'Gift message': '礼物留言', 'Notes from Direct Line': 'Direct Line 备注',
    'Your part': '您的部分', 'Close': '关闭', 'Next order': '下一个订单', 'Client paid': '客户付款', 'Paid': '已付款', 'Not paid': '未付款', 'No bill yet': '还没有账单',
    'No photos': '没有图片', 'Client': '客户', 'Shop': '店铺', 'Cost revision requested': '客户请求降价',
    'new orders': '个新订单', 'new order': '个新订单', 'Sound for new orders': '新订单提示音', 'No new orders.': '没有新订单。', 'See new orders': '查看新订单',
    'Type one cost per product, separated by commas, e.g. 10.90, 9.00.': '每件商品一个成本，用逗号分开，例如 10.90, 9.00。',
    'Add the tracking number first.': '请先填写运单号。', 'A shipped order can’t be set back here. Ask Direct Line.': '已发货的订单不能在这里改回。请联系 Direct Line。',
    'The client asked to cancel this order: don’t ship it. Direct Line will tell you.': '客户申请取消这个订单：不要发货。Direct Line 会通知您。',
    'The client asked to cancel this order: don’t buy it. Direct Line will tell you.': '客户申请取消这个订单：不要购买。Direct Line 会通知您。',
    'Type the total cost in US dollars, e.g. 17.90.': '请填写美元总成本，例如 17.90。', 'Type one tracking number, without spaces.': '请填写一个运单号，不要空格。',
    'Pick a courier from the list.': '请从列表中选择快递公司。', 'Type the fee in US dollars, e.g. 4.': '请填写美元费用，例如 4。', 'Mark the order as possibly delayed first.': '请先标记为可能延迟。',
    'This order is cancelled: its cost can’t change.': '这个订单已取消：成本不能修改。', 'This order is cancelled.': '这个订单已取消。',
    'A cancellation fee is only for cancelled orders or cancel requests.': '取消费只用于已取消或申请取消的订单。', 'Only orders that are not shipped yet can be delayed.': '只有还没发货的订单可以标记延迟。',
    'Only orders not shipped yet can be marked bought.': '只有还没发货的订单可以标记为已购买。', 'This order is shipped: its tracking number can’t be cleared.': '这个订单已发货：运单号不能清空。',
  });
  const SHIP_OPTS = [['not_bought', 'Not bought'], ['bought', 'Bought'], ['shipped', 'Shipped']];
  const shipState = o => (o.ship === 'shipped' ? 'shipped' : o.boughtAt ? 'bought' : 'not_bought');
  const ago = sec => { const d = Math.max(0, Math.floor(Date.now() / 1000) - sec); return d < 60 ? t('just now') : d < 3600 ? Math.floor(d / 60) + ' ' + t('min ago') : d < 86400 ? Math.floor(d / 3600) + ' ' + t('h ago') : fmtDay(sec); };
  const lastEdit = o => Object.values(o.edits || {}).sort((a, b) => b.at - a.at)[0];
  const isNew = o => S.seenAt != null && o.createdAt > S.seenAt && o.tab === 'new';
  const searchText = o => [o.ref, o.shop, o.client, o.product, o.buyer, o.cells.tracking, o.cells.domestic, o.country].join(' ').toLowerCase();

  function visibleOrders() {
    const q = (S.q || '').trim().toLowerCase(), f = S.f || {};
    return (S.queue?.orders || []).filter(o => {
      if (S.onlyCancelReq) return o.cancelRequested;
      if (!(o.tab === S.tab || S.pinned.has(o.id) && S.pinnedTab === S.tab)) return false;
      if (q && !searchText(o).includes(q)) return false;
      if (f.client && o.client !== f.client) return false;
      if (f.country && o.country !== f.country) return false;
      if (f.noCost && o.cells.cost !== '') return false;
      return true;
    });
  }
  const tabCount = tab => (S.queue?.orders || []).filter(o => o.tab === tab).length;
  const disabledFor = (o, field) => {
    if (field === 'cancelFee') return !(o.status === 'cancelled' || o.cancelRequested);
    if (o.status === 'cancelled') return true;
    if (o.cancelRequested) return field !== 'domestic';
    if (o.ship === 'shipped') return !['tracking', 'courier', 'domestic', 'itemCosts'].includes(field);
    return false;
  };
  const dis = (o, f) => (disabledFor(o, f) ? ' disabled' : '');
  // The gold boxes. data-f = field, data-o = order id.
  function cellBox(o, field) {
    const c = o.cells, id = o.id;
    if (field === 'cost') return `<span class="sp-money"><span>$</span><input inputmode="decimal" data-o="${id}" data-f="cost" value="${esc(c.cost)}" placeholder="0.00" aria-label="${esc(t('Total cost (USD)'))}"${dis(o, 'cost')}></span>`;
    if (field === 'itemCosts') return `<input data-o="${id}" data-f="itemCosts" value="${esc(c.itemCosts)}" placeholder="—" aria-label="${esc(t('Cost per product (USD)'))}"${dis(o, 'itemCosts')}>`;
    if (field === 'ship') return `<select data-o="${id}" data-f="ship" aria-label="${esc(t('Shipping status'))}"${o.ship === 'shipped' || o.status === 'cancelled' || o.cancelRequested ? ' disabled' : ''}>${SHIP_OPTS.map(([v, l]) => `<option value="${v}"${shipState(o) === v ? ' selected' : ''}>${t(l)}</option>`).join('')}</select>`;
    if (field === 'tracking') return `<input class="mono" data-o="${id}" data-f="tracking" value="${esc(c.tracking)}" placeholder="${esc(t('Tracking number'))}" aria-label="${esc(t('Tracking number'))}"${dis(o, 'tracking')}>`;
    if (field === 'courier') { const list = S.queue.couriers.includes(c.courier) || !c.courier ? S.queue.couriers : [c.courier, ...S.queue.couriers];
      return `<select data-o="${id}" data-f="courier" aria-label="${esc(t('Courier'))}"${dis(o, 'courier')}><option value="">${t('Pick')}</option>${list.map(v => `<option${v === c.courier ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`; }
    if (field === 'delayed') return `<select data-o="${id}" data-f="delayed" aria-label="${esc(t('Delayed? + reason'))}"${dis(o, 'delayed')}><option value="0">${t('On time')}</option><option value="1"${c.delayed ? ' selected' : ''}>${t('Possibly delayed')}</option></select>${c.delayed ? `<input data-o="${id}" data-f="reason" value="${esc(c.reason)}" placeholder="${esc(t('Reason'))}" aria-label="${esc(t('Reason'))}"${dis(o, 'reason')}>` : ''}`;
    if (field === 'domestic') return `<input class="mono" data-o="${id}" data-f="domestic" value="${esc(c.domestic)}" placeholder="${esc(t('If there is one'))}" aria-label="${esc(t('Domestic express tracking'))}"${dis(o, 'domestic')}>`;
    if (field === 'cancelFee') return `<span class="sp-money"><span>$</span><input inputmode="decimal" data-o="${id}" data-f="cancelFee" value="${esc(c.cancelFee)}" placeholder="0" aria-label="${esc(t('Cancellation fee (USD)'))}"${dis(o, 'cancelFee')}></span>`;
    return '';
  }
  const savedLine = o => { const st = S.saving[o.id]; if (st === 'saving') return `<span class="sp-saved">${t('Saving…')}</span>`; if (st === 'err') return `<span class="sp-saved err">⚠ ${t('Not saved')}</span>`;
    const e = lastEdit(o); return e ? `<span class="sp-saved ok">✓ ${t('Saved')} · ${esc(e.by)} · ${esc(ago(e.at))}</span>` : `<span class="sp-saved">${t('Nothing typed yet')}</span>`; };
  const warnLine = o => { const w = S.warn[o.id]; return w?.length ? `<p class="sp-warn">${t('Also on')} ${w.map(esc).join(', ')}. ${t('Check the number.')}</p>` : ''; };
  const errLine = o => (S.err[o.id] ? `<p class="sp-warn">${esc(S.err[o.id])}</p>` : '');
  const thumb = o => (o.photos[0] ? `<img class="sp-thumb" src="${esc(o.photos[0].thumb)}" alt="" loading="lazy">` : '<span class="sp-thumb none"></span>');
  const orderHead = o => `<button type="button" class="sp-ref" data-open="${o.id}">${esc(o.ref)}${ICON.next}</button>${isNew(o) ? ` <span class="sp-tag gold">${t('New')}</span>` : ''}
    <small>${esc(o.client)}${o.shop ? ' · ' + esc(o.shop) : ''}</small><small>${esc(fmtDay(o.createdAt))}</small>${savedLine(o)}`;
  const cancelNote = o => (o.cancelRequested ? `<span class="sp-tag red">${t('Cancel requested')}</span><p class="sp-warn">${t('don’t buy or ship them. Wait for Direct Line.')}</p>` : o.revision ? `<span class="sp-tag orange">${t('Cost revision requested')}</span>` : '');
  function rowHTML(o) {
    const cx = S.tab === 'cancelled';
    return `<tr data-row="${o.id}" class="${o.cancelRequested ? 'cxreq' : ''}${isNew(o) ? ' isnew' : ''}">
      <td class="ord">${orderHead(o)}</td>
      <td class="prod"><div class="sp-prod">${thumb(o)}<span><b>${esc(o.product || '—')}</b>${cancelNote(o)}</span></div></td>
      <td class="num">${o.qty}</td><td>${esc(o.country)}</td>
      <td class="g">${cellBox(o, 'cost')}${errLine(o)}</td><td class="g">${cellBox(o, 'itemCosts')}</td>
      ${cx ? `<td class="g">${cellBox(o, 'cancelFee')}</td><td class="g">${cellBox(o, 'tracking')}</td>` : `<td class="g">${cellBox(o, 'ship')}</td><td class="g">${cellBox(o, 'tracking')}${warnLine(o)}</td><td class="g">${cellBox(o, 'courier')}</td><td class="g dl">${cellBox(o, 'delayed')}</td>`}
      <td class="g">${cellBox(o, 'domestic')}</td></tr>`;
  }
  function cardHTML(o) {
    const cx = S.tab === 'cancelled', st = shipState(o), f = (label, box) => `<label class="sp-f"><span>${label}</span>${box}</label>`;
    return `<article class="sp-ocard${o.cancelRequested ? ' cxreq' : ''}" data-row="${o.id}">
      <div class="sp-ocard-h"><div>${orderHead(o)}</div><span class="sp-pill ${o.status === 'cancelled' ? 'red' : st}">${t(o.status === 'cancelled' ? 'Cancelled' : SHIP_OPTS.find(x => x[0] === st)[1])}</span></div>
      <div class="sp-prod">${thumb(o)}<span><b>${esc(o.product || '—')}</b>${cancelNote(o)}</span></div>
      <div class="sp-fgrid">${f(t('Qty'), `<b>${o.qty}</b>`)}${f(t('Ship to'), `<b>${esc(o.country)}</b>`)}
        ${f(t('Total cost (USD)'), cellBox(o, 'cost') + errLine(o))}${cx ? f(t('Cancellation fee (USD)'), cellBox(o, 'cancelFee')) : f(t('Shipping status'), cellBox(o, 'ship'))}
        ${f(t('Cost per product (USD)'), cellBox(o, 'itemCosts'))}${f(t('Tracking number'), cellBox(o, 'tracking') + warnLine(o))}
        ${cx ? '' : f(t('Courier'), cellBox(o, 'courier')) + f(t('Delayed? + reason'), cellBox(o, 'delayed'))}${f(t('Domestic express tracking'), cellBox(o, 'domestic'))}</div>
      <div class="sp-ocard-a"><button type="button" class="btn btn-sm" data-copy-address="${o.id}">${t('Copy address')}</button>${o.photos.length ? `<a class="btn btn-sm" href="/api/portal/supplier/orders/${o.id}/photos.zip">${t('All photos (zip)')}</a>` : ''}</div></article>`;
  }
  function ordersHTML() {
    const Q = S.queue; if (!Q) return S.error || `<p class="sp-empty">${t('Loading…')}</p>`;
    const req = Q.orders.filter(o => o.cancelRequested), list = visibleOrders(), shown = list.slice(0, S.limit), f = S.f || {};
    const clients = [...new Set(Q.orders.map(o => o.client))].sort(), countries = [...new Set(Q.orders.map(o => o.country).filter(Boolean))].sort();
    const filtered = !!(S.q || f.client || f.country || f.noCost || S.onlyCancelReq);
    const tabs = [['new', 'New'], ['bought', 'Bought'], ['shipped', 'Shipped'], ['cancelled', 'Cancelled']].map(([k, l]) => {
      const n = tabCount(k), extra = k === 'new' ? Q.orders.filter(isNew).length : k === 'cancelled' ? 0 : 0;
      return `<button type="button" class="sp-chip" data-tab="${k}" aria-pressed="${S.tab === k && !S.onlyCancelReq}">${t(l)} <span>${n}</span>${extra ? `<b class="sp-badge">${extra}</b>` : ''}</button>`; }).join('');
    const cx = S.tab === 'cancelled';
    const head = `<tr><th>${t('Order')}</th><th>${t('Product / variation')}</th><th class="num">${t('Qty')}</th><th>${t('Ship to')}</th><th class="g">${t('Total cost (USD)')}</th><th class="g">${t('Cost per product (USD)')}</th>
      ${cx ? `<th class="g">${t('Cancellation fee (USD)')}</th><th class="g">${t('Tracking number')}</th>` : `<th class="g">${t('Shipping status')}</th><th class="g">${t('Tracking number')}</th><th class="g">${t('Courier')}</th><th class="g">${t('Delayed? + reason')}</th>`}<th class="g">${t('Domestic express tracking')}</th></tr>`;
    return `<div class="sp-head"><div><h1>${t('Orders')}</h1><p class="sp-intro">${t('Newest first. Type in the gold columns: each change saves by itself.')}</p></div>
        <button type="button" class="btn" data-export-orders>${t('Export to Excel')}</button></div>
      ${req.length ? `<div class="sp-alert"><b>${req.length} ${t(req.length === 1 ? 'cancel request' : 'cancel requests')}</b><span>${req.slice(0, 4).map(o => esc(o.ref)).join(', ')}${req.length > 4 ? '…' : ''}: ${t('don’t buy or ship them. Wait for Direct Line.')}</span><button type="button" class="btn btn-sm" data-cxreq>${t(S.onlyCancelReq ? 'Show all' : 'Show them')}</button></div>` : ''}
      <div class="sp-bar"><div class="sp-chips">${tabs}</div>
        <div class="sp-tools"><label class="sp-search"><input type="search" data-q value="${esc(S.q || '')}" placeholder="${esc(t('Order number, shop, product or tracking'))}" aria-label="${esc(t('Order number, shop, product or tracking'))}"></label>
          <button type="button" class="btn" data-filters aria-expanded="${!!S.showFilters}">${t('Filters')}${f.client || f.country || f.noCost ? ' •' : ''}</button></div></div>
      ${S.showFilters ? `<div class="sp-filters"><select data-fl="client"><option value="">${t('All clients')}</option>${clients.map(c => `<option${f.client === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select data-fl="country"><option value="">${t('All countries')}</option>${countries.map(c => `<option${f.country === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <label class="sp-check"><input type="checkbox" data-fl="noCost"${f.noCost ? ' checked' : ''}> <span>${t('Only orders without a total cost')}</span></label>
        ${filtered ? `<button type="button" class="btn btn-sm" data-clear>${t('Clear filters')}</button>` : ''}</div>` : ''}
      <section class="card sp-qcard">${list.length ? `<div class="sp-qwrap"><table class="sp-q"><thead>${head}</thead><tbody>${shown.map(rowHTML).join('')}</tbody></table></div>
        <div class="sp-qcards">${shown.map(cardHTML).join('')}</div>${list.length > shown.length ? `<div class="sp-more"><button type="button" class="btn" data-more>${t('Show more')} (${list.length - shown.length})</button></div>` : ''}`
        : `<div class="sp-empty center"><p>${t(filtered ? 'No orders match.' : 'No orders here.')}</p>${filtered ? `<button type="button" class="btn" data-clear>${t('Clear filters')}</button>` : ''}</div>`}
        <p class="sp-legend"><span><i class="g"></i>${t('Gold columns are yours to fill in')}</span><span><i class="r"></i>${t('Red row: cancel requested')}</span><span>${t('Not bought')} → ${t('Bought')} → ${t('Shipped')}</span><span class="end">${t('Enter saves and jumps to the same box in the next order.')}</span></p></section>`;
  }
  // One box saved: the order comes back from the server; only its row (and the open drawer) is redrawn, focus stays.
  async function saveBox(el) {
    const id = Number(el.dataset.o), f = el.dataset.f, o = S.queue.orders.find(x => x.id === id); if (!o) return;
    let field = f, value = el.value.trim();
    if (f === 'ship') { field = value === 'shipped' ? 'shipped' : 'bought'; value = value === 'shipped' ? true : value === 'bought'; if (field === 'bought' && !!o.boughtAt === value) return; }
    else if (f === 'delayed') { value = value === '1'; if (value === o.cells.delayed) return; }
    else if ((o.cells[f] ?? '') === value) return;
    const key = id + ':' + f, sent = JSON.stringify(value); if (S.pending[key] === sent) return; S.pending[key] = sent;
    S.saving[id] = 'saving'; delete S.err[id]; redrawOrder(id);
    try {
      const r = await api('/supplier/orders/' + id, { method: 'PUT', body: { field, value } });
      Object.assign(o, r.order); delete S.saving[id];
      if (field === 'tracking') S.warn[id] = r.warn?.sameTracking || [];
      if (o.tab !== S.tab) { S.pinned.add(id); S.pinnedTab = S.tab; }
    } catch (e) { S.saving[id] = 'err'; S.err[id] = e.message; }
    delete S.pending[key];
    redrawOrder(id);
  }
  function redrawOrder(id) {
    const o = S.queue.orders.find(x => x.id === id), active = document.activeElement, keep = active?.dataset?.o == id && !active.closest('#sp-drawer') ? active.dataset.f : null, sel = keep && active.closest('.sp-ocard') ? '.sp-ocard' : 'tr';
    for (const el of document.querySelectorAll(`[data-row="${id}"]`)) el.outerHTML = el.matches('tr') ? rowHTML(o) : cardHTML(o);
    if (S.drawer === id) drawerFill();
    if (keep) { const el = document.querySelector(`${sel}[data-row="${id}"] [data-f="${keep}"]`); if (el) { if (el.value !== active.value) el.value = active.value; el.focus(); } }
  }
  function exportOrders() {
    const X = window.DLExcelExport; if (!X) return;
    const list = visibleOrders(), stateL = o => t(o.status === 'cancelled' ? 'Cancelled' : o.cancelRequested ? 'Cancel requested' : SHIP_OPTS.find(x => x[0] === shipState(o))[1]);
    const rows = list.map(o => [o.date, o.ref, o.client, o.shop, o.product, o.qty, o.country, stateL(o), o.cells.cost === '' ? '' : Number(o.cells.cost), o.cells.itemCosts, o.cells.tracking, o.cells.courier, o.cells.domestic, o.cells.cancelFee === '' ? '' : Number(o.cells.cancelFee)]);
    const head = ['Date', 'Order', 'Client', 'Shop', 'Product / variation', 'Qty', 'Ship to', 'Shipping status', 'Total cost (USD)', 'Cost per product (USD)', 'Tracking number', 'Courier', 'Domestic express tracking', 'Cancellation fee (USD)'].map(t);
    X.download(X.table({ title: 'Direct Line · ' + t('Orders'), subtitle: t('Money is only your part.') + ' ' + fmtTime(Math.floor(Date.now() / 1000)) + ' ' + t('(China time)'), sheetName: t('Orders'), head, rows, money: [8, 13], widths: [12, 16, 18, 16, 40, 6, 16, 14, 14, 18, 22, 14, 22, 14] }), `direct-line-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

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

  // ---------- new-order alerts: badge on the bell, a short message, an optional sound ----------
  let soundOn = false;
  try { soundOn = localStorage.getItem('dl_supplier_sound') === '1'; } catch (e) { /* private mode */ }
  function beep() {
    if (!soundOn) return;
    try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.4); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.45); } catch (e) { /* no sound */ }
  }
  function toast(text) {
    $('.sp-toast')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="sp-toast" role="status">${esc(text)}</div>`);
    setTimeout(() => $('.sp-toast')?.remove(), 4000);
  }
  const newCountText = n => `${n} ${t(n === 1 ? 'new order' : 'new orders')}`;
  function bellHTML() {
    const n = S.alerts?.newOrders || 0;
    return `<details class="sp-bell"><summary class="icon-btn" aria-label="${esc(newCountText(n))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${n ? `<b class="sp-badge">${n}</b>` : ''}</summary>
      <div class="sp-menu"><p class="sp-menu-h">${n ? esc(newCountText(n)) : t('No new orders.')}</p>${n ? `<button type="button" data-see-new>${t('See new orders')}</button>` : ''}
        <label class="sp-check"><input type="checkbox" data-sound${soundOn ? ' checked' : ''}> <span>${t('Sound for new orders')}</span></label></div></details>`;
  }
  async function pollAlerts(first = false) {
    try {
      const a = await api('/supplier/alerts'), before = S.alerts?.newOrders ?? null;
      S.alerts = a; if (S.seenAt == null) S.seenAt = a.seenAt;
      const bell = $('.sp-bell'); if (bell && !bell.open) bell.outerHTML = bellHTML();
      if (first && a.newOrders) toast(newCountText(a.newOrders));
      if (!first && before != null && a.newOrders > before) {
        toast(newCountText(a.newOrders)); beep();
        if (S.page === 'orders' && !document.activeElement?.dataset?.f) { const d = await api('/supplier/orders'); S.queue = d; render(); }
      }
    } catch (e) { /* try again next minute */ }
  }
  async function seeNew() {
    S.page = 'orders'; S.tab = 'new'; S.onlyCancelReq = false;
    if (location.hash !== '#orders') location.hash = 'orders'; else render();
    try { await api('/supplier/alerts/seen', { method: 'POST' }); S.alerts = { ...(S.alerts || {}), newOrders: 0 }; } catch (e) { /* later */ }
    const bell = $('.sp-bell'); if (bell) bell.outerHTML = bellHTML();
  }
  setInterval(() => { if (S.me) pollAlerts(); }, 60000);

  // ---------- pages, events, boot ----------
  function readHash() {
    const h = location.hash.replace(/^#/, ''), m = /^client\/(\d+)$/.exec(h);
    if (m) { S.page = 'client'; S.clientId = Number(m[1]); } else if (h === 'password') S.page = 'password'; else if (h === 'billing') S.page = 'billing'; else S.page = 'orders';
  }
  const loading = () => `<p class="sp-empty">${t('Loading…')}</p>`;
  const failed = e => `<div class="sp-empty"><p>${esc(e.message)}</p><button type="button" class="btn" data-retry>${t('Try again')}</button></div>`;
  function render() {
    if (!S.me) return loginScreen();
    const body = S.page === 'password' ? passwordHTML()
      : S.page === 'client' ? (S.client && S.client.id === S.clientId ? clientHTML(S.client) : S.error || loading())
      : S.page === 'orders' ? ordersHTML()
      : S.billing ? billingHTML(S.billing) : S.error || loading();
    const y = window.scrollY, drawer = S.drawer;
    document.body.innerHTML = shell(body);
    document.title = (S.page === 'client' && S.client ? S.client.name + ' · ' : '') + 'Direct Line · ' + t(S.page === 'orders' ? 'Orders' : 'Billing');
    if (S.keepScroll) window.scrollTo(0, y);
    S.keepScroll = false;
    bindPassword();
    if (drawer && S.page === 'orders') openDrawer(drawer);
  }
  async function load() {
    S.error = null;
    try {
      if (S.page === 'client') { if (!S.client || S.client.id !== S.clientId) { render(); const d = await api('/supplier/billing/' + S.clientId); S.client = d.client; S.clientAt = d.updatedAt; } }
      else if (S.page === 'billing') { if (!S.billing) render(); const d = await api('/supplier/billing'); S.billing = d; }
      else if (S.page === 'orders') { if (!S.queue) render(); S.queue = await api('/supplier/orders'); S.pinned.clear(); }
    } catch (e) { if (e.status === 401) { S.me = null; return render(); } S.error = failed(e); }
    render();
  }
  const rerenderOrders = () => { S.keepScroll = true; render(); };
  document.addEventListener('click', async e => {
    const l = e.target.closest('[data-lang]'); if (l) { setLang(l.dataset.lang); return; }
    if (e.target.closest('[data-logout]')) { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/'; return; }
    if (e.target.closest('[data-retry]')) { load(); return; }
    if (e.target.closest('[data-see-new]')) { seeNew(); return; }
    const p = e.target.closest('[data-pay]'); if (p) { const id = Number(p.dataset.pay); S.open.has(id) ? S.open.delete(id) : S.open.add(id); S.keepScroll = true; render(); return; }
    const c = e.target.closest('[data-client]'); if (c) { location.hash = 'client/' + c.dataset.client; return; }
    // Orders
    const tb = e.target.closest('[data-tab]'); if (tb) { S.tab = tb.dataset.tab; S.onlyCancelReq = false; S.pinned.clear(); S.limit = 50; rerenderOrders(); return; }
    if (e.target.closest('[data-cxreq]')) { S.onlyCancelReq = !S.onlyCancelReq; rerenderOrders(); return; }
    if (e.target.closest('[data-filters]')) { S.showFilters = !S.showFilters; rerenderOrders(); return; }
    if (e.target.closest('[data-clear]')) { S.q = ''; S.f = {}; S.onlyCancelReq = false; rerenderOrders(); return; }
    if (e.target.closest('[data-more]')) { S.limit += 50; rerenderOrders(); return; }
    if (e.target.closest('[data-export-orders]')) { exportOrders(); return; }
    const op = e.target.closest('[data-open]'); if (op) { openDrawer(Number(op.dataset.open)); return; }
    if (e.target.closest('[data-close]')) { closeDrawer(); return; }
    if (e.target.closest('[data-next]')) { nextOrder(); return; }
    const ph = e.target.closest('[data-photo]'); if (ph) { S.photo = Number(ph.dataset.photo); drawerFill(); return; }
    const ca = e.target.closest('[data-copy-address]'); if (ca) { const o = S.queue?.orders.find(x => x.id === Number(ca.dataset.copyAddress)); if (o) copyText(addressText(o), ca); return; }
    const cp = e.target.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy, cp); return; }
  });
  // Gold boxes save when they change (selects) or when you leave them (text); Enter saves and jumps to the same box in the next order.
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-sound]')) { soundOn = el.checked; try { localStorage.setItem('dl_supplier_sound', soundOn ? '1' : '0'); } catch (x) { /* private mode */ } if (soundOn) beep(); return; }
    if (el.matches('[data-fl]')) { S.f = { ...S.f, [el.dataset.fl]: el.type === 'checkbox' ? el.checked : el.value }; S.limit = 50; rerenderOrders(); return; }
    if (el.matches('[data-o][data-f]')) saveBox(el);
  });
  let qTimer;
  document.addEventListener('input', e => {
    if (e.target.matches('[data-q]')) { clearTimeout(qTimer); const v = e.target.value; qTimer = setTimeout(() => { S.q = v; S.limit = 50; rerenderOrders(); const q = $('[data-q]'); if (q) { q.focus(); q.setSelectionRange(v.length, v.length); } }, 250); }
  });
  document.addEventListener('keydown', e => {
    const c = e.target.closest?.('tr[data-client]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = 'client/' + c.dataset.client; return; }
    if (e.key === 'Escape' && S.drawer) { closeDrawer(); return; }
    const el = e.target; if (e.key !== 'Enter' || !el.matches?.('input[data-o][data-f]')) return;
    e.preventDefault();
    saveBox(el);
    const f = el.dataset.f, scope = el.closest('#sp-drawer') ? null : el.closest('.sp-qcards') ? '.sp-ocard' : 'tr', id = el.dataset.o;
    if (scope) { const boxes = [...document.querySelectorAll(`${scope}[data-row] input[data-f="${f}"]:not([disabled])`)], i = boxes.findIndex(b => b.dataset.o === id); (boxes[i + 1] || el).focus(); boxes[i + 1]?.select(); }
    else el.blur();
  });
  window.addEventListener('hashchange', () => { readHash(); closeDrawer(); window.scrollTo(0, 0); load(); });
  async function boot() {
    readHash();
    try { S.me = await api('/me'); }
    catch (e) { S.me = null; return render(); }
    if (S.me.role !== 'supplier') { location.href = S.me.role === 'admin' ? '/admin/' : '/portal/'; return; }
    S.billing = null; S.client = null; S.queue = null;
    await pollAlerts(true);
    load();
  }

  boot();
})();
