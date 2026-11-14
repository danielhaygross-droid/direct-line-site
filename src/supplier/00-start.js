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
