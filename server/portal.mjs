// Client portal + admin monitoring API.
// Shares the dashboard's signed `dl_session` cookie (same HMAC format as the Worker),
// so one login works across the store dashboard, the client portal and the admin view.
//   role "admin"          -> Daniel / Erwin (env admin or admin users in the DB)
//   role "client-<id>"    -> a client account from the users table

import { timingSafeEqual } from 'node:crypto';

const utf8 = new TextEncoder();
const SESSION_SECONDS = 43200; // 12h, same as the Worker
const b64url = bytes => Buffer.from(bytes).toString('base64url');
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('admin','client')),
     display_name TEXT NOT NULL,
     commission_per_order DOUBLE PRECISION,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS client_orders (
     id SERIAL PRIMARY KEY,
     client_id INTEGER NOT NULL REFERENCES users(id),
     order_ref TEXT NOT NULL DEFAULT '',
     tracking_number TEXT NOT NULL DEFAULT '',
     destination TEXT NOT NULL DEFAULT '',
     category TEXT NOT NULL DEFAULT '',
     weight_kg DOUBLE PRECISION,
     price DOUBLE PRECISION NOT NULL DEFAULT 0,
     selling_price DOUBLE PRECISION,
     commission DOUBLE PRECISION NOT NULL DEFAULT 0,
     notes TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS client_orders_client_idx ON client_orders (client_id, created_at)',
  `CREATE TABLE IF NOT EXISTS client_payments (
     id SERIAL PRIMARY KEY,
     client_id INTEGER NOT NULL REFERENCES users(id),
     amount DOUBLE PRECISION NOT NULL,
     method TEXT NOT NULL DEFAULT '',
     note TEXT NOT NULL DEFAULT '',
     paid_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS portal_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  // Follow-ups / nudges on an order, between the client and us.
  `CREATE TABLE IF NOT EXISTS order_messages (
     id SERIAL PRIMARY KEY,
     order_id INTEGER NOT NULL REFERENCES client_orders(id),
     client_id INTEGER NOT NULL REFERENCES users(id),
     author TEXT NOT NULL CHECK (author IN ('client','admin')),
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
     read_by_client BOOLEAN NOT NULL DEFAULT FALSE)`,
  'CREATE INDEX IF NOT EXISTS order_messages_order_idx ON order_messages (order_id, created_at)',
  // Fee split: of the per-order fee ("commission"), this part goes to the supplier; the rest is ours.
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS supplier_share DOUBLE PRECISION NOT NULL DEFAULT 1',
  // What the client sees on each order: product cost (our $2 fee is already inside it) + shipping fee = price.
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS product_cost DOUBLE PRECISION',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS shipping_fee DOUBLE PRECISION',
  // Activity log: what happened to each order and when (powers notifications and the order timeline).
  `CREATE TABLE IF NOT EXISTS order_events (
     id SERIAL PRIMARY KEY,
     order_id INTEGER NOT NULL REFERENCES client_orders(id),
     client_id INTEGER NOT NULL REFERENCES users(id),
     kind TEXT NOT NULL,
     actor TEXT NOT NULL CHECK (actor IN ('client','admin')),
     detail TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS order_events_client_idx ON order_events (client_id, created_at)',
  'CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, created_at)',
  'CREATE INDEX IF NOT EXISTS order_events_actor_idx ON order_events (actor, created_at)',
  // When the client last opened their notifications (everything newer shows as "New").
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_seen_at INTEGER NOT NULL DEFAULT 0',
];

export const DEFAULT_SETTINGS = { commission_per_order: '2', supplier_share_per_order: '1', volumetric_divisor: '6000' };
const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const now = () => Math.floor(Date.now() / 1000);

// ---------- passwords (PBKDF2-SHA256) ----------
export async function hashPassword(password, iterations = 210000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(bits)}`;
}
export async function verifyPassword(password, stored) {
  const [scheme, iter, saltB64, hashB64] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(saltB64, 'base64url'), iterations: Number(iter) }, key, 256);
  const a = Buffer.from(bits), b = Buffer.from(hashB64, 'base64url');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- sessions (compatible with the Worker's dl_session) ----------
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, utf8.encode(value)));
}
export const REMEMBER_SECONDS = 30 * 24 * 3600; // "Remember me": 30 days
export async function createSessionCookie(role, secret, { remember = false } = {}) {
  const seconds = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
  const payload = role + '.' + (now() + seconds);
  const token = payload + '.' + await sign(payload, secret);
  return 'dl_session=' + encodeURIComponent(token) + `; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export async function readSessionRole(request, secret) {
  const match = (request.headers.get('cookie') || '').match(/(?:^|;\s*)dl_session=([^;]+)/);
  if (!match || !secret) return null;
  const parts = decodeURIComponent(match[1]).split('.');
  if (parts.length !== 3 || Number(parts[1]) < now()) return null;
  return (await sign(parts[0] + '.' + parts[1], secret)) === parts[2] ? parts[0] : null;
}
export function parseRole(role) {
  if (role === 'admin') return { admin: true };
  const m = /^client-(\d+)$/.exec(role || '');
  return m ? { admin: false, clientId: Number(m[1]) } : null;
}

// ---------- helpers ----------
const money = v => (v === null || v === undefined || v === '' ? null : Number(v));
const isMoney = v => v === null || (Number.isFinite(v) && v >= 0 && v < 1e7);
const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const round2 = v => Math.round(Number(v || 0) * 100) / 100;

async function getSettings(DB) {
  const rows = (await DB.prepare('SELECT key, value FROM portal_settings').all()).results || [];
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map(r => [r.key, r.value])) };
}
function orderOut(r) {
  const price = Number(r.price || 0), sell = r.selling_price === null ? null : Number(r.selling_price);
  return {
    id: r.id, clientId: r.client_id, orderRef: r.order_ref, trackingNumber: r.tracking_number,
    destination: r.destination, category: r.category, weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
    // price = what the client pays for the order = product cost (incl. our hidden fee) + shipping fee.
    productCost: r.product_cost === null || r.product_cost === undefined ? null : Number(r.product_cost),
    shippingFee: r.shipping_fee === null || r.shipping_fee === undefined ? null : Number(r.shipping_fee),
    price, sellingPrice: sell, profit: sell === null ? null : round2(sell - price),
    commission: Number(r.commission || 0), supplierShare: round2(r.supplier_share),
    ourShare: round2(Math.max(0, Number(r.commission || 0) - Number(r.supplier_share || 0))),
    notes: r.notes, status: r.status,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  };
}
// Adds message counts to orders: messages, unread (for the viewer's side).
async function withMessages(DB, orders, forAdmin) {
  if (!orders.length) return orders;
  const ids = orders.map(o => o.id);
  const rows = (await DB.prepare(`SELECT order_id, COUNT(*) AS total,
      COUNT(*) FILTER (WHERE author = 'client' AND NOT read_by_admin) AS unread_admin,
      COUNT(*) FILTER (WHERE author = 'admin' AND NOT read_by_client) AS unread_client,
      MAX(created_at) AS last_at
    FROM order_messages WHERE order_id IN (${ids.map(() => '?').join(',')}) GROUP BY order_id`).bind(...ids).all()).results || [];
  const by = new Map(rows.map(r => [Number(r.order_id), r]));
  const last = rows.length ? (await DB.prepare(`SELECT DISTINCT ON (order_id) order_id, author, body FROM order_messages
    WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY order_id, created_at DESC, id DESC`).bind(...ids).all()).results || [] : [];
  const lastBy = new Map(last.map(r => [Number(r.order_id), r]));
  return orders.map(o => {
    const r = by.get(o.id), m = lastBy.get(o.id);
    return { ...o, messages: Number(r?.total || 0), unreadMessages: Number((forAdmin ? r?.unread_admin : r?.unread_client) || 0), lastMessageAt: r ? Number(r.last_at) : null,
      lastMessage: m ? { author: m.author, body: String(m.body).slice(0, 160) } : null };
  });
}
const messageOut = m => ({ id: m.id, orderId: m.order_id, author: m.author, body: m.body, createdAt: Number(m.created_at) });
const eventOut = e => ({ id: e.id, orderId: e.order_id, clientId: e.client_id, kind: e.kind, actor: e.actor, detail: e.detail, createdAt: Number(e.created_at),
  ...(e.order_ref !== undefined ? { orderRef: e.order_ref, status: e.status } : {}), ...(e.client_name !== undefined ? { clientName: e.client_name } : {}) });
async function logEvent(DB, orderId, clientId, kind, actor, detail = '') {
  await DB.prepare('INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,?,?,?,?)')
    .bind(orderId, clientId, kind, actor, String(detail).slice(0, 200), now()).run();
}
const EDIT_FIELDS = ['order_ref', 'destination', 'category', 'weight_kg', 'product_cost', 'shipping_fee', 'selling_price', 'notes'];
async function readBody(request) { return request.json().catch(() => ({})); }

function orderFields(body) {
  const f = {
    order_ref: text(body.orderRef, 120), tracking_number: text(body.trackingNumber, 120),
    destination: (d => (/^[a-z]{2}$/i.test(d) ? d.toUpperCase() : d))(text(body.destination, 60)), category: text(body.category, 20),
    weight_kg: money(body.weightKg), price: money(body.price), selling_price: money(body.sellingPrice),
    product_cost: money(body.productCost), shipping_fee: money(body.shippingFee),
    notes: text(body.notes, 2000),
  };
  if (![f.weight_kg, f.price, f.selling_price, f.product_cost, f.shipping_fee].every(isMoney)) throw new Error('Numbers must be zero or more');
  // When the parts are given, the price is their sum.
  if (f.product_cost !== null || f.shipping_fee !== null) f.price = round2((f.product_cost || 0) + (f.shipping_fee || 0));
  if (f.price === null) f.price = 0;
  return f;
}

async function clientSummary(DB, clientId, settings) {
  const o = await DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(price),0) AS billed, COALESCE(SUM(commission),0) AS commission, COALESCE(SUM(LEAST(supplier_share, commission)),0) AS supplier, COALESCE(SUM(selling_price - price) FILTER (WHERE selling_price IS NOT NULL),0) AS profit FROM client_orders WHERE client_id = ? AND status <> 'cancelled'").bind(clientId).first();
  const p = await DB.prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM client_payments WHERE client_id = ?').bind(clientId).first();
  const billed = round2(o.billed), paid = round2(p.paid);
  const commission = round2(o.commission), supplierShare = round2(o.supplier);
  return { orders: Number(o.n), billed, paid, outstanding: round2(billed - paid), commission, supplierShare, ourShare: round2(commission - supplierShare), clientProfit: round2(o.profit) };
}

// ---------- request handler ----------
// Returns a Response for /api/portal/* routes, or null if the path isn't ours.
export async function handlePortal(request, url, ctx) {
  const { DB, env } = ctx;
  const path = url.pathname.replace(/^\/api\/portal/, '') || '/';
  const method = request.method;
  if (!DB) return json({ ok: false, error: 'Database is not configured' }, 503);

  // Public: login
  if (path === '/login' && method === 'POST') {
    const body = await readBody(request);
    const role = await authenticate(DB, env, text(body.username, 120), String(body.password || ''));
    if (!role) return json({ ok: false, error: 'Invalid credentials' }, 401);
    const info = parseRole(role);
    return json({ ok: true, role: info.admin ? 'admin' : 'client', redirect: info.admin ? '/admin/' : '/portal/' }, 200,
      { 'set-cookie': await createSessionCookie(role, env.APP_SESSION_SECRET, { remember: body.remember === true }) });
  }

  const role = await readSessionRole(request, env.APP_SESSION_SECRET);
  const who = parseRole(role);
  if (!who) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!who.admin) {
    const me = await DB.prepare("SELECT active FROM users WHERE id = ? AND role = 'client'").bind(who.clientId).first();
    if (!me || !me.active) return json({ ok: false, error: 'Account disabled' }, 403);
  }

  if (path === '/me' && method === 'GET') {
    const settings = await getSettings(DB);
    if (who.admin) return json({ ok: true, role: 'admin', name: 'Admin', settings });
    const u = await DB.prepare('SELECT id, username, display_name, active FROM users WHERE id = ?').bind(who.clientId).first();
    if (!u || !u.active) return json({ ok: false, error: 'Account disabled' }, 403);
    return json({ ok: true, role: 'client', id: u.id, username: u.username, name: u.display_name, settings: { volumetric_divisor: settings.volumetric_divisor }, summary: (({ commission, supplierShare, ourShare, ...rest }) => rest)(await clientSummary(DB, u.id, settings)) });
  }

  // ----- client routes -----
  if (path === '/orders' && method === 'GET' && !who.admin) {
    const rows = (await DB.prepare('SELECT * FROM client_orders WHERE client_id = ? ORDER BY created_at DESC, id DESC').bind(who.clientId).all()).results || [];
    return json({ ok: true, orders: await withMessages(DB, rows.map(orderOut).map(({ commission, supplierShare, ourShare, ...o }) => o), false) });
  }
  if (path === '/payments' && method === 'GET' && !who.admin) {
    const rows = (await DB.prepare('SELECT * FROM client_payments WHERE client_id = ? ORDER BY paid_at DESC, id DESC').bind(who.clientId).all()).results || [];
    return json({ ok: true, payments: rows.map(r => ({ id: r.id, amount: Number(r.amount), method: r.method, note: r.note, paidAt: Number(r.paid_at) })) });
  }
  if (path === '/orders' && method === 'POST') {
    const body = await readBody(request);
    const clientId = who.admin ? Number(body.clientId) : who.clientId;
    const client = await DB.prepare("SELECT id, commission_per_order, active FROM users WHERE id = ? AND role = 'client'").bind(clientId).first();
    if (!client || !client.active) return json({ ok: false, error: 'Unknown client' }, 400);
    let f; try { f = orderFields(body); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    const settings = await getSettings(DB);
    const commission = client.commission_per_order ?? Number(settings.commission_per_order);
    const supplierShare = Math.min(commission, Number(settings.supplier_share_per_order) || 0);
    const t = now();
    const row = await DB.prepare('INSERT INTO client_orders (client_id, order_ref, tracking_number, destination, category, weight_kg, price, selling_price, product_cost, shipping_fee, commission, supplier_share, notes, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
      .bind(clientId, f.order_ref, f.tracking_number, f.destination, f.category, f.weight_kg, f.price, f.selling_price, f.product_cost, f.shipping_fee, commission, supplierShare, f.notes, 'pending', t, t).first();
    await logEvent(DB, row.id, clientId, 'created', who.admin ? 'admin' : 'client');
    const out = orderOut(row);
    if (!who.admin) { delete out.commission; delete out.supplierShare; delete out.ourShare; }
    return json({ ok: true, order: out });
  }
  // ----- notifications: what the other side did, newest first -----
  if (path === '/notifications' && method === 'GET' && !who.admin) {
    const rows = (await DB.prepare("SELECT e.*, o.order_ref, o.status FROM order_events e JOIN client_orders o ON o.id = e.order_id WHERE e.client_id = ? AND e.actor = 'admin' ORDER BY e.created_at DESC, e.id DESC LIMIT 50").bind(who.clientId).all()).results || [];
    const u = await DB.prepare('SELECT notif_seen_at FROM users WHERE id = ?').bind(who.clientId).first();
    return json({ ok: true, items: rows.map(eventOut), seenAt: Number(u?.notif_seen_at || 0), now: now() });
  }
  if (path === '/notifications/seen' && method === 'POST' && !who.admin) {
    await DB.prepare('UPDATE users SET notif_seen_at = ? WHERE id = ?').bind(now(), who.clientId).run();
    return json({ ok: true, seenAt: now() });
  }
  // ----- follow-up messages on an order (client ↔ us) -----
  const msgMatch = /^\/orders\/(\d+)\/messages$/.exec(path);
  if (msgMatch) {
    const id = Number(msgMatch[1]);
    const order = await DB.prepare('SELECT id, client_id FROM client_orders WHERE id = ?').bind(id).first();
    if (!order || (!who.admin && order.client_id !== who.clientId)) return json({ ok: false, error: 'Not found' }, 404);
    if (method === 'POST') {
      const body = await readBody(request);
      const msg = text(body.body, 2000);
      if (!msg) return json({ ok: false, error: 'Please write a message' }, 400);
      await DB.prepare('INSERT INTO order_messages (order_id, client_id, author, body, created_at, read_by_admin, read_by_client) VALUES (?,?,?,?,?,?,?)')
        .bind(id, order.client_id, who.admin ? 'admin' : 'client', msg, now(), who.admin, !who.admin).run();
      await logEvent(DB, id, order.client_id, 'message', who.admin ? 'admin' : 'client', msg);
    } else if (method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
    // Reading the thread marks the other side's messages as read.
    await DB.prepare(who.admin ? "UPDATE order_messages SET read_by_admin = TRUE WHERE order_id = ? AND author = 'client'"
      : "UPDATE order_messages SET read_by_client = TRUE WHERE order_id = ? AND author = 'admin'").bind(id).run();
    const rows = (await DB.prepare('SELECT * FROM order_messages WHERE order_id = ? ORDER BY created_at, id').bind(id).all()).results || [];
    const events = (await DB.prepare("SELECT * FROM order_events WHERE order_id = ? AND kind <> 'message' ORDER BY created_at, id").bind(id).all()).results || [];
    return json({ ok: true, messages: rows.map(messageOut), events: events.map(eventOut) });
  }
  const orderMatch = /^\/orders\/(\d+)$/.exec(path);
  if (orderMatch && (method === 'PUT' || method === 'POST')) {
    const id = Number(orderMatch[1]);
    const existing = await DB.prepare('SELECT * FROM client_orders WHERE id = ?').bind(id).first();
    if (!existing || (!who.admin && existing.client_id !== who.clientId)) return json({ ok: false, error: 'Not found' }, 404);
    const body = await readBody(request);
    let f; try { f = orderFields({ ...orderOut(existing), ...body }); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    // Clients can edit their own order details and cancel a pending order; only admins change other statuses/fees.
    if (!who.admin && existing.status === 'cancelled') return json({ ok: false, error: 'This order was cancelled.' }, 409);
    if (!who.admin && body.status === 'cancelled' && existing.status !== 'pending') return json({ ok: false, error: 'This order is already being handled, so it can’t be cancelled here. Message us instead.' }, 409);
    const status = who.admin
      ? (ORDER_STATUSES.includes(body.status) ? body.status : existing.status)
      : (body.status === 'cancelled' ? 'cancelled' : existing.status);
    const commission = who.admin && body.commission != null && body.commission !== '' && isMoney(money(body.commission)) ? money(body.commission) : existing.commission;
    const supplierShare = who.admin && body.supplierShare != null && body.supplierShare !== '' && isMoney(money(body.supplierShare)) ? money(body.supplierShare) : existing.supplier_share;
    const row = await DB.prepare('UPDATE client_orders SET order_ref=?, tracking_number=?, destination=?, category=?, weight_kg=?, price=?, selling_price=?, product_cost=?, shipping_fee=?, notes=?, status=?, commission=?, supplier_share=?, updated_at=? WHERE id = ? RETURNING *')
      .bind(f.order_ref, f.tracking_number, f.destination, f.category, f.weight_kg, f.price, f.selling_price, f.product_cost, f.shipping_fee, f.notes, status, commission, supplierShare, now(), id).first();
    const actor = who.admin ? 'admin' : 'client';
    if (row.status !== existing.status) await logEvent(DB, id, existing.client_id, 'status', actor, row.status);
    if (row.tracking_number !== existing.tracking_number && row.tracking_number) await logEvent(DB, id, existing.client_id, 'tracking', actor, row.tracking_number);
    if (EDIT_FIELDS.some(k => String(row[k] ?? '') !== String(existing[k] ?? ''))) await logEvent(DB, id, existing.client_id, 'edited', actor);
    const out = orderOut(row);
    if (!who.admin) { delete out.commission; delete out.supplierShare; delete out.ourShare; }
    return json({ ok: true, order: out });
  }

  // ----- admin-only routes -----
  if (!who.admin) return json({ ok: false, error: 'Forbidden' }, 403);

  if (path === '/admin/overview' && method === 'GET') {
    const settings = await getSettings(DB);
    const users = (await DB.prepare('SELECT id, username, role, display_name, commission_per_order, active, created_at FROM users ORDER BY role, display_name').all()).results || [];
    const clients = [];
    for (const u of users.filter(u => u.role === 'client')) clients.push({ id: u.id, username: u.username, name: u.display_name, active: u.active, commissionPerOrder: u.commission_per_order, ...(await clientSummary(DB, u.id, settings)) });
    const keys = ['billed', 'paid', 'outstanding', 'commission', 'supplierShare', 'ourShare'];
    const totals = clients.reduce((t, c) => { t.orders += c.orders; for (const k of keys) t[k] = round2(t[k] + c[k]); return t; },
      { orders: 0, ...Object.fromEntries(keys.map(k => [k, 0])) });
    const admins = users.filter(u => u.role === 'admin').map(u => ({ id: u.id, username: u.username, name: u.display_name, active: u.active }));
    return json({ ok: true, settings, totals, clients, admins });
  }
  if (path === '/admin/notifications' && method === 'GET') {
    const rows = (await DB.prepare("SELECT e.*, o.order_ref, o.status, u.display_name AS client_name FROM order_events e JOIN client_orders o ON o.id = e.order_id JOIN users u ON u.id = e.client_id WHERE e.actor = 'client' ORDER BY e.created_at DESC, e.id DESC LIMIT 60").all()).results || [];
    return json({ ok: true, items: rows.map(eventOut), now: now() });
  }
  if (path === '/admin/orders' && method === 'GET') {
    const clientId = Number(url.searchParams.get('clientId') || 0);
    const rows = clientId
      ? (await DB.prepare('SELECT * FROM client_orders WHERE client_id = ? ORDER BY created_at DESC, id DESC').bind(clientId).all()).results
      : (await DB.prepare('SELECT * FROM client_orders ORDER BY created_at DESC, id DESC LIMIT 500').all()).results;
    return json({ ok: true, orders: await withMessages(DB, (rows || []).map(orderOut), true) });
  }
  if (path === '/admin/payments' && method === 'GET') {
    const clientId = Number(url.searchParams.get('clientId') || 0);
    const rows = (await DB.prepare('SELECT * FROM client_payments WHERE client_id = ? ORDER BY paid_at DESC, id DESC').bind(clientId).all()).results || [];
    return json({ ok: true, payments: rows.map(r => ({ id: r.id, clientId: r.client_id, amount: Number(r.amount), method: r.method, note: r.note, paidAt: Number(r.paid_at) })) });
  }
  if (path === '/admin/payments' && method === 'POST') {
    const body = await readBody(request);
    const clientId = Number(body.clientId), amount = money(body.amount);
    const client = await DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'client'").bind(clientId).first();
    if (!client) return json({ ok: false, error: 'Unknown client' }, 400);
    if (!(amount > 0) || !isMoney(amount)) return json({ ok: false, error: 'Amount must be more than 0' }, 400);
    const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(String(body.paidAt || '')) ? Math.floor(new Date(body.paidAt + 'T12:00:00Z').getTime() / 1000) : now();
    const row = await DB.prepare('INSERT INTO client_payments (client_id, amount, method, note, paid_at, created_at) VALUES (?,?,?,?,?,?) RETURNING id').bind(clientId, amount, text(body.method, 60), text(body.note, 500), Number.isFinite(paidAt) ? paidAt : now(), now()).first();
    return json({ ok: true, id: row.id });
  }
  const payDel = /^\/admin\/payments\/(\d+)\/delete$/.exec(path);
  if (payDel && method === 'POST') {
    await DB.prepare('DELETE FROM client_payments WHERE id = ?').bind(Number(payDel[1])).run();
    return json({ ok: true });
  }
  if (path === '/admin/users' && method === 'POST') {
    const body = await readBody(request);
    const username = text(body.username, 60), password = String(body.password || ''), userRole = body.role === 'admin' ? 'admin' : 'client';
    if (!/^[A-Za-z0-9._@-]{3,60}$/.test(username)) return json({ ok: false, error: 'Username: 3-60 letters, numbers, . _ - @' }, 400);
    if (password.length < 8) return json({ ok: false, error: 'Password must be at least 8 characters' }, 400);
    if (env.ADMIN_USERNAME && username.toLowerCase() === env.ADMIN_USERNAME.toLowerCase()) return json({ ok: false, error: 'Username already taken' }, 409);
    const exists = await DB.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
    if (exists) return json({ ok: false, error: 'Username already taken' }, 409);
    const cpo = money(body.commissionPerOrder);
    if (!isMoney(cpo)) return json({ ok: false, error: 'Invalid commission' }, 400);
    const row = await DB.prepare('INSERT INTO users (username, password_hash, role, display_name, commission_per_order, active, created_at) VALUES (?,?,?,?,?,TRUE,?) RETURNING id')
      .bind(username, await hashPassword(password), userRole, text(body.name, 120) || username, userRole === 'client' ? cpo : null, now()).first();
    return json({ ok: true, id: row.id });
  }
  const userUpd = /^\/admin\/users\/(\d+)$/.exec(path);
  if (userUpd && method === 'POST') {
    const id = Number(userUpd[1]);
    const u = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!u) return json({ ok: false, error: 'Not found' }, 404);
    const body = await readBody(request);
    const name = body.name !== undefined ? text(body.name, 120) || u.display_name : u.display_name;
    const active = body.active !== undefined ? Boolean(body.active) : u.active;
    let cpo = u.commission_per_order;
    if (body.commissionPerOrder !== undefined) { cpo = money(body.commissionPerOrder); if (!isMoney(cpo)) return json({ ok: false, error: 'Invalid commission' }, 400); }
    let hash = u.password_hash;
    if (body.password) { if (String(body.password).length < 8) return json({ ok: false, error: 'Password must be at least 8 characters' }, 400); hash = await hashPassword(String(body.password)); }
    await DB.prepare('UPDATE users SET display_name=?, active=?, commission_per_order=?, password_hash=? WHERE id = ?').bind(name, active, cpo, hash, id).run();
    return json({ ok: true });
  }
  if (path === '/admin/settings' && method === 'POST') {
    const body = await readBody(request);
    const updates = {};
    if (body.commission_per_order !== undefined) { const v = money(body.commission_per_order); if (v === null || !isMoney(v)) return json({ ok: false, error: 'Invalid commission' }, 400); updates.commission_per_order = String(v); }
    if (body.supplier_share_per_order !== undefined) { const v = money(body.supplier_share_per_order); if (v === null || !isMoney(v)) return json({ ok: false, error: "Invalid supplier's share" }, 400); updates.supplier_share_per_order = String(v); }
    const fee = Number(updates.commission_per_order ?? (await getSettings(DB)).commission_per_order);
    const sup = Number(updates.supplier_share_per_order ?? (await getSettings(DB)).supplier_share_per_order);
    if (sup > fee) return json({ ok: false, error: "The supplier's share can't be more than the fee per order" }, 400);
    if (body.monthly_order_goal !== undefined) { const v = Number(body.monthly_order_goal); if (!(Number.isInteger(v) && v >= 0 && v <= 1e6)) return json({ ok: false, error: 'Goal must be a whole number' }, 400); updates.monthly_order_goal = String(v); }
    if (body.volumetric_divisor !== undefined) { const v = Number(body.volumetric_divisor); if (!(v >= 1000 && v <= 10000)) return json({ ok: false, error: 'Divisor must be 1000-10000' }, 400); updates.volumetric_divisor = String(v); }
    for (const [k, v] of Object.entries(updates)) await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, v).run();
    return json({ ok: true, settings: await getSettings(DB) });
  }

  return json({ ok: false, error: 'Not found' }, 404);
}

// Returns the session role string for valid credentials, or null.
export async function authenticate(DB, env, username, password) {
  if (!username || !password) return null;
  if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD && username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) return 'admin';
  if (!DB) return null;
  const u = await DB.prepare('SELECT id, role, password_hash, active FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
  if (!u || !u.active || !(await verifyPassword(password, u.password_hash))) return null;
  return u.role === 'admin' ? 'admin' : 'client-' + u.id;
}
