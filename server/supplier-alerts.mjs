// Email alerts for the supplier (Erwin, 16 Nov 2026): new orders, cancel requests, quotes / price requests and receipts sent
// back, as one summary email at most every 30 minutes. Email, not browser push: Ada and Ye are in China, where Google's push
// service is usually blocked.
//
// How it works (every 5 minutes, /api/cron/supplier-alerts):
//   1. Everything waiting for the supplier right now is listed as items with a key ("order:12", "cancel:12:<time>", ...).
//      New keys get an increasing id in supplier_alert_items; a key already seen is never announced twice.
//   2. Each supplier login with an alert email and alerts on gets the items newer than its watermark, if its last email was
//      at least 30 minutes ago. On success the watermark moves on.
//   3. The very first run only records what is already waiting (no email about old things).
// Sending: Brevo (BREVO_API_KEY) or Resend (RESEND_API_KEY), from ALERT_FROM_EMAIL. Without a key nothing is sent.
// The email holds order numbers, product names and counts only: never prices, our fee or client contact details.

export const ALERT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS supplier_alert_items (
     id SERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_email TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS alerts_on BOOLEAN NOT NULL DEFAULT TRUE',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_watermark INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_sent_at INTEGER NOT NULL DEFAULT 0',
];
export const EVERY = 30 * 60; // at most one email per 30 minutes per supplier
const STARTED = 'supplier_alerts_started', LAST = 'supplier_alerts_last';
const now = () => Math.floor(Date.now() / 1000);
const norm = v => (v == null ? '' : String(v).trim());
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160;

export function emailConfigured(env) { return !!((env.BREVO_API_KEY || env.RESEND_API_KEY) && validEmail(norm(env.ALERT_FROM_EMAIL))); }

// What is waiting for the supplier right now.
async function waitingItems(DB) {
  const q = async sql => (await DB.prepare(sql).all()).results || [];
  const live = "JOIN users u ON u.id = {t}.client_id AND u.role = 'client' AND NOT u.archived";
  const ref = o => norm(o.order_ref) || '#' + o.id, title = o => [norm(o.item_title), norm(o.variant)].filter(Boolean).join(' · ').slice(0, 80);
  const items = [];
  for (const o of await q(`SELECT o.id, o.order_ref, o.item_title, o.variant FROM client_orders o ${live.replace('{t}', 'o')}
      WHERE NOT o.archived AND o.status IN ('pending','processing') AND o.bought_at IS NULL AND COALESCE(o.tracking_number,'') = ''`))
    items.push({ key: 'order:' + o.id, kind: 'order', label: ref(o) + (title(o) ? ' · ' + title(o) : '') });
  for (const o of await q(`SELECT o.id, o.order_ref, o.status_changed_at, o.created_at FROM client_orders o ${live.replace('{t}', 'o')} WHERE NOT o.archived AND o.status = 'cancellation_requested'`))
    items.push({ key: 'cancel:' + o.id + ':' + (o.status_changed_at || o.created_at), kind: 'cancel', label: ref(o) });
  for (const p of await q(`SELECT p.id, p.name, p.updated_at, p.created_at FROM portal_products p ${live.replace('{t}', 'p')} WHERE p.status = 'awaiting_quote' AND p.revision_status = ''`))
    items.push({ key: 'quote:' + p.id + ':' + (p.updated_at || p.created_at), kind: 'quote', label: 'P-' + p.id + (norm(p.name) ? ' · ' + norm(p.name).slice(0, 80) : '') });
  for (const r of await q(`SELECT r.id, o.order_ref, o.id AS oid, p.id AS pid, p.name FROM cost_revisions r ${live.replace('{t}', 'r')}
      LEFT JOIN client_orders o ON o.id = r.order_id LEFT JOIN portal_products p ON p.id = r.product_id WHERE r.status = 'open'`))
    items.push({ key: 'request:' + r.id, kind: 'request', label: r.oid ? ref({ id: r.oid, order_ref: r.order_ref }) : 'P-' + r.pid + (norm(r.name) ? ' · ' + norm(r.name).slice(0, 80) : '') });
  for (const r of await q("SELECT id, decided_at FROM supplier_receipts WHERE status = 'rejected' AND NOT archived").catch(() => []))
    items.push({ key: 'receipt:' + r.id + ':' + r.decided_at, kind: 'receipt', label: 'R-' + String(r.id).padStart(4, '0') });
  return items;
}

const KINDS = [
  ['order', 'new order', 'new orders', '新订单'], ['cancel', 'cancel request', 'cancel requests', '取消申请'],
  ['quote', 'quote to answer', 'quotes to answer', '待回复询价'], ['request', 'price request', 'price requests', '降价请求'],
  ['receipt', 'receipt sent back', 'receipts sent back', '被退回的收据'],
];
export function alertEmail(items, portalUrl) {
  const groups = KINDS.map(([k, one, many, zh]) => ({ k, one, many, zh, list: items.filter(i => i.kind === k) })).filter(g => g.list.length);
  const subject = 'Direct Line: ' + groups.map(g => `${g.list.length} ${g.list.length === 1 ? g.one : g.many}`).join(', ') + ' · ' + groups.map(g => `${g.list.length} ${g.zh}`).join('，');
  const lines = g => g.list.slice(0, 30).map(i => i.label).concat(g.list.length > 30 ? [`+ ${g.list.length - 30} more`] : []);
  const text = [...groups.flatMap(g => [`${g.list.length} ${g.list.length === 1 ? g.one : g.many} · ${g.zh}`, ...lines(g).map(l => '  ' + l), '']),
    'Open the supplier portal · 打开供应商平台: ' + portalUrl, '', 'Direct Line'].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1c1f24;max-width:560px">
    ${groups.map(g => `<h3 style="margin:18px 0 6px;font-size:16px">${g.list.length} ${esc(g.list.length === 1 ? g.one : g.many)} · ${esc(g.zh)}</h3>
      <ul style="margin:0;padding-left:20px">${lines(g).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}
    <p style="margin:22px 0"><a href="${esc(portalUrl)}" style="display:inline-block;background:#b98a3e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Open the supplier portal · 打开供应商平台</a></p>
    <p style="color:#777;font-size:12px">Direct Line · You get at most one email every 30 minutes. Turn alerts off in the supplier portal (menu › Email alerts). · 每30分钟最多一封邮件，可在供应商平台菜单 › 邮件提醒 中关闭。</p></div>`;
  return { subject, text, html };
}

export async function sendEmail(env, to, { subject, text, html }, fetchImpl = fetch) {
  const from = norm(env.ALERT_FROM_EMAIL), name = norm(env.ALERT_FROM_NAME) || 'Direct Line';
  let r;
  if (env.BREVO_API_KEY) r = await fetchImpl('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: from, name }, to: [{ email: to }], subject, textContent: text, htmlContent: html }) });
  else if (env.RESEND_API_KEY) r = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `${name} <${from}>`, to: [to], subject, text, html }) });
  else throw new Error('Email is not connected (no BREVO_API_KEY or RESEND_API_KEY).');
  if (!r.ok) throw new Error('Email service answered ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
  return true;
}

const portalUrl = env => (norm(env.PUBLIC_URL) || 'https://direct-line-control.vercel.app').replace(/\/$/, '') + '/supplier/';
async function saveLast(DB, value) {
  await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(LAST, JSON.stringify(value)).run();
}
export async function runSupplierAlerts(DB, env, { fetchImpl = fetch, t = now() } = {}) {
  if (!emailConfigured(env)) return { ok: true, configured: false };
  // 1. Record what is waiting; new keys get new ids.
  for (const i of await waitingItems(DB)) await DB.prepare('INSERT INTO supplier_alert_items (key, kind, label, created_at) VALUES (?,?,?,?) ON CONFLICT (key) DO NOTHING').bind(i.key, i.kind, i.label.slice(0, 200), t).run();
  const top = Number((await DB.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM supplier_alert_items').first()).n);
  // 3. First run: what was already waiting is not news.
  const started = await DB.prepare('SELECT value FROM portal_settings WHERE key = ?').bind(STARTED).first();
  if (!started) {
    await DB.prepare("UPDATE users SET alert_watermark = ? WHERE role = 'supplier'").bind(top).run();
    await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(STARTED, String(t)).run();
    await saveLast(DB, { at: t, ok: true, sent: 0, note: 'started' });
    return { ok: true, started: true, sent: 0 };
  }
  // 2. One summary per supplier, at most every 30 minutes.
  const sups = (await DB.prepare("SELECT id, display_name, alert_email, alert_watermark, alert_sent_at FROM users WHERE role = 'supplier' AND active AND NOT archived AND alerts_on AND COALESCE(alert_email, '') <> ''").all()).results || [];
  const out = { ok: true, sent: 0, waiting: 0, errors: [] };
  // Items still waiting now (a cancelled or answered one isn't announced any more).
  const keys = new Set((await waitingItems(DB)).map(i => i.key));
  for (const s of sups) {
    const fresh = ((await DB.prepare('SELECT id, key, kind, label FROM supplier_alert_items WHERE id > ? ORDER BY id').bind(Number(s.alert_watermark)).all()).results || []).filter(i => keys.has(i.key));
    if (!fresh.length) { if (top > Number(s.alert_watermark)) await DB.prepare('UPDATE users SET alert_watermark = ? WHERE id = ?').bind(top, s.id).run(); continue; }
    if (t - Number(s.alert_sent_at) < EVERY) { out.waiting++; continue; }
    try {
      await sendEmail(env, s.alert_email, alertEmail(fresh, portalUrl(env)), fetchImpl);
      await DB.prepare('UPDATE users SET alert_watermark = ?, alert_sent_at = ? WHERE id = ?').bind(top, t, s.id).run();
      out.sent++;
    } catch (e) { out.ok = false; out.errors.push(String(e.message || e).slice(0, 200)); }
  }
  await saveLast(DB, { at: t, ok: out.ok, sent: out.sent, error: out.errors[0] || '' });
  return out;
}
export async function alertStatus(DB, env) {
  const last = await DB.prepare('SELECT value FROM portal_settings WHERE key = ?').bind(LAST).first();
  let parsed = null; try { parsed = last ? JSON.parse(last.value) : null; } catch { parsed = null; }
  const people = (await DB.prepare("SELECT display_name, alert_email, alerts_on FROM users WHERE role = 'supplier' AND NOT archived ORDER BY id").all()).results || [];
  return { configured: emailConfigured(env), last: parsed, suppliers: people.map(p => ({ name: p.display_name, email: p.alert_email || '', on: !!p.alerts_on })) };
}

// ---------- the supplier's own setting (supplier portal > menu > Email alerts) ----------
export async function routeAlerts(request, path, ctx, me, viewer) {
  const { DB, env } = ctx, method = request.method;
  if (path !== '/supplier/email-alerts' && path !== '/supplier/email-alerts/test') return null;
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  if (viewer) return json({ ok: false, error: 'Each supplier login sets its own email. Change it in Fees & settings > Team & tools > Supplier logins > Edit.' }, 403);
  const u = await DB.prepare('SELECT alert_email, alerts_on, alert_sent_at FROM users WHERE id = ?').bind(me.id).first();
  if (path === '/supplier/email-alerts' && method === 'GET') return json({ ok: true, email: u.alert_email || '', on: !!u.alerts_on, connected: emailConfigured(env) });
  if (path === '/supplier/email-alerts' && method === 'PUT') {
    const b = await request.json().catch(() => ({})), email = norm(b.email).toLowerCase();
    if (email && !validEmail(email)) return json({ ok: false, error: 'Check the email address.' }, 400);
    await DB.prepare('UPDATE users SET alert_email = ?, alerts_on = ? WHERE id = ?').bind(email || null, b.on !== false, me.id).run();
    return json({ ok: true, email, on: b.on !== false, connected: emailConfigured(env) });
  }
  if (path === '/supplier/email-alerts/test' && method === 'POST') {
    if (!emailConfigured(env)) return json({ ok: false, error: 'Email is not connected yet. Direct Line will tell you when it is.' }, 409);
    if (!u.alert_email) return json({ ok: false, error: 'Save your email first.' }, 400);
    const last = await DB.prepare('SELECT value FROM portal_settings WHERE key = ?').bind('alert_test_' + me.id).first();
    if (last && now() - Number(last.value) < 60) return json({ ok: false, error: 'Wait a minute before sending another test.' }, 429);
    await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('alert_test_' + me.id, String(now())).run();
    try { await sendEmail(env, u.alert_email, alertEmail([{ kind: 'order', label: 'TEST · this is how alerts look · 测试邮件' }], portalUrl(env))); return json({ ok: true }); }
    catch (e) { return json({ ok: false, error: e.message }, 502); }
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
