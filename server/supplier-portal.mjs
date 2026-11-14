// Supplier portal, phase 1 (docs/supplier-portal.md): Billing for the supplier (Ada, Ye) and their own password.
// Erwin, 13-14 Nov 2026: the supplier never sees our fee, any extra commission, client prices, Etsy prices or our profit;
// they may see their own costs, cancellation fees, refunds, what was paid for their part and the supplier share per
// order they pay us. So every answer here is built field by field (an allow-list): no order or payment row is ever sent
// as it is, and a payment shows only the supplier's part, never its full amount.
//   role "supplier-<id>-v<n>"  -> a supplier login from the users table (only admins add or remove them)

import { paidOrders, paymentOrderIds } from './payment-orders.mjs';
import { cancelledSummary, KEPT_FEE } from './cancellations.mjs';

export const SUPPLIER_SCHEMA = [
  // What the supplier paid Direct Line for the supplier share ($1 per bought order). Recorded by admins.
  `CREATE TABLE IF NOT EXISTS supplier_share_payments (
     id SERIAL PRIMARY KEY, amount DOUBLE PRECISION NOT NULL, paid_at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '',
     archived BOOLEAN NOT NULL DEFAULT FALSE, created_at INTEGER NOT NULL)`,
];

const r2 = v => Math.round(Number(v || 0) * 100) / 100;
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
// The English name when the name has one in brackets (same rule as the sheet's balance box).
export const clientLabel = u => { const name = u.display_name || u.username, latin = /\(([^()]*[A-Za-z][^()]*)\)/.exec(name)?.[1]?.trim(); return latin || name; };
// The supplier's cost of an order: the cost from the sheet, else the price without our fee (as in clientSummary).
const supOf = r => Math.max(0, r.supplier_cost == null ? Number(r.price) - Number(r.commission || 0) : Number(r.supplier_cost));

export async function supplierSession(DB, who) {
  const u = await DB.prepare("SELECT id, username, display_name, active, archived, session_version FROM users WHERE id = ? AND role = 'supplier'").bind(who.supplierId).first();
  return u && u.active && !u.archived && Number(u.session_version || 0) === Number(who.sessionVersion || 0) ? u : null;
}

async function shareRate(DB) {
  const row = await DB.prepare("SELECT value FROM portal_settings WHERE key = 'supplier_bonus_per_order'").first();
  const v = Number(row?.value ?? 1);
  return Number.isFinite(v) && v >= 0 ? v : 1;
}
export async function sharePayments(DB) {
  const rows = (await DB.prepare('SELECT id, amount, paid_at, note FROM supplier_share_payments WHERE NOT archived ORDER BY paid_at DESC, id DESC').all()).results || [];
  return rows.map(r => ({ id: Number(r.id), amount: r2(r.amount), paidAt: Number(r.paid_at), note: r.note || '' }));
}

// One client, supplier side only. summary = clientSummary(...) from portal.mjs (passed in to keep this file free of it).
async function clientBilling(DB, u, summary, { detail = false } = {}) {
  const s = summary.supplier, rate = await shareRate(DB);
  const rows = (await DB.prepare('SELECT id, order_ref, item_title, status, price, commission, supplier_cost, created_at, order_date FROM client_orders WHERE client_id = ? AND NOT archived ORDER BY created_at, id').bind(u.id).all()).results || [];
  const paid = await paidOrders(DB, u.id);
  const live = rows.filter(r => r.status !== 'cancelled'), cancelledN = rows.length - live.length;
  const counted = live.filter(r => paid.has(Number(r.id))).length;
  const out = {
    id: Number(u.id), name: clientLabel(u), ordersTotal: rows.length, cancelledCount: cancelledN,
    orders: r2(s.orders + s.other), cancelFees: r2(s.fees), paidForYourPart: r2(s.received), balance: r2(s.balance),
    share: { counted, rate: r2(rate), amount: r2(counted * rate) },
  };
  if (!detail) return out;

  const ref = r => r.order_ref || '#' + r.id;
  // Payments: the supplier's part of each one = the amount minus our fee on the orders it paid (and our fee kept on a
  // cancelled one). Added up, they come to what the statement says was paid (+ money sent back, its own line).
  const kept = new Map(((await DB.prepare(`SELECT order_id, amount FROM client_balance_adjustments WHERE client_id = ? AND kind = '${KEPT_FEE}'`).bind(u.id).all()).results || []).map(k => [Number(k.order_id), Number(k.amount)]));
  const byId = new Map(rows.map(r => [Number(r.id), r]));
  const links = await paymentOrderIds(DB, u.id);
  const pays = (await DB.prepare('SELECT id, amount, paid_at FROM client_payments WHERE client_id = ? AND NOT archived ORDER BY paid_at DESC, id DESC').bind(u.id).all()).results || [];
  const payments = pays.map(p => {
    let ours = 0; const list = [];
    for (const oid of links.get(Number(p.id)) || []) {
      const r = byId.get(oid), first = paid.get(oid);
      if (!r || !first || first.paymentId !== Number(p.id)) continue; // an order counts on its first payment only
      if (r.status === 'cancelled') ours += kept.get(oid) || 0;
      else if (Number(r.price) > 0) ours += Number(r.price) - supOf(r);
      list.push({ ref: ref(r), item: r.item_title || '', cost: r2(first.paidCost ?? supOf(r)), cancelled: r.status === 'cancelled' });
    }
    return { id: Number(p.id), paidAt: Number(p.paid_at), yourPart: r2(Number(p.amount) - ours), orders: list };
  });
  const refunded = r2(summary.refunded);

  // Cancelled orders, without our fee: what was paid for them, the supplier's cancellation fee, what goes back.
  const cx = await cancelledSummary(DB, u.id), days = new Map();
  for (const o of cx.orders) {
    const back = o.paid ? r2(o.supPaid - o.supFee) : o.supFee > 0 ? r2(-o.supFee) : 0;
    const d = days.get(o.day) || { day: o.day, orders: [] }; days.set(o.day, d);
    d.orders.push({ ref: o.orderRef || '#' + o.id, store: o.store, paid: !!o.paid, paidFor: r2(o.supPaid), cancelFee: r2(o.supFee), back });
  }
  const cancelled = [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).map(d => ({ ...d,
    paidFor: r2(d.orders.reduce((n, o) => n + o.paidFor, 0)), cancelFee: r2(d.orders.reduce((n, o) => n + o.cancelFee, 0)), back: r2(d.orders.reduce((n, o) => n + o.back, 0)) }));
  const cxPaidFor = r2(cancelled.reduce((n, d) => n + d.paidFor, 0)), cxFees = r2(cancelled.reduce((n, d) => n + d.cancelFee, 0)), cxBack = r2(cancelled.reduce((n, d) => n + d.back, 0));

  const notPaid = live.filter(r => Number(r.price) > 0 && !paid.has(Number(r.id))).map(r => ({ ref: ref(r), item: r.item_title || '', orderedAt: Number(r.created_at), cost: r2(supOf(r)) }));
  const changed = live.filter(r => paid.has(Number(r.id)) && paid.get(Number(r.id)).paidCost != null && Math.abs(supOf(r) - paid.get(Number(r.id)).paidCost) >= 0.005)
    .map(r => { const was = r2(paid.get(Number(r.id)).paidCost), nowCost = r2(supOf(r)); return { ref: ref(r), item: r.item_title || '', paidCost: was, costNow: nowCost, difference: r2(nowCost - was) }; });
  const notPaidSum = r2(notPaid.reduce((n, o) => n + o.cost, 0)), changedSum = r2(changed.reduce((n, o) => n + o.difference, 0));
  // How the balance adds up; anything the three blocks don't explain (a payment not linked to orders, credit from
  // earlier, money sent back) is its own line, so the lines always come to the balance.
  const other = r2(out.balance - (notPaidSum + changedSum - cxBack));
  return { ...out, statement: { orders: r2(s.orders), other: r2(s.other), cancelFees: r2(s.fees), billed: r2(s.billed), paid: r2(s.received), balance: r2(s.balance) },
    payments, sentBack: refunded, cancelled, cancelledTotals: { count: cx.count, paidCount: cx.paidCount, paidFor: cxPaidFor, cancelFees: cxFees, back: cxBack },
    notPaid, notPaidSum, costChanged: changed, costChangedSum: changedSum, adds: { notPaid: notPaidSum, costChanged: changedSum, cancelledBack: cxBack, other } };
}

async function clientsFor(DB) {
  return (await DB.prepare("SELECT id, username, display_name FROM users WHERE role = 'client' AND NOT archived ORDER BY id").all()).results || [];
}

// All supplier routes. Nothing else in the portal API is reachable with a supplier login (routePortal hands every
// supplier request to this function and returns its answer).
export async function routeSupplier(request, path, ctx, who, deps) {
  const { DB, env } = ctx, method = request.method;
  const { clientSummary, getSettings, hashPassword, verifyPassword, createSessionCookie } = deps;
  const me = await supplierSession(DB, who);
  if (!me) return json({ ok: false, error: 'Please sign in again.' }, 401);
  if (path === '/me' && method === 'GET') return json({ ok: true, role: 'supplier', redirect: '/supplier/', id: Number(me.id), username: me.username, name: me.display_name });
  if (path === '/supplier/billing' && method === 'GET') {
    const settings = await getSettings(DB), clients = [];
    for (const u of await clientsFor(DB)) {
      const b = await clientBilling(DB, u, await clientSummary(DB, u.id, settings));
      if (!b.ordersTotal && !b.paidForYourPart && !b.balance) continue;
      clients.push(b);
    }
    const sum = k => r2(clients.reduce((n, c) => n + c[k], 0));
    const owe = r2(clients.reduce((n, c) => n + Math.max(0, c.balance), 0)), credit = r2(clients.reduce((n, c) => n + Math.max(0, -c.balance), 0));
    const counted = clients.reduce((n, c) => n + c.share.counted, 0), shareAmount = r2(clients.reduce((n, c) => n + c.share.amount, 0));
    const pays = await sharePayments(DB), sharePaid = r2(pays.reduce((n, p) => n + p.amount, 0));
    return json({ ok: true, updatedAt: now(), clients,
      totals: { orders: sum('orders'), cancelFees: sum('cancelFees'), paidForYourPart: sum('paidForYourPart'), stillOwed: owe, credit, net: r2(owe - credit),
        ordersTotal: clients.reduce((n, c) => n + c.ordersTotal, 0), cancelledCount: clients.reduce((n, c) => n + c.cancelledCount, 0) },
      share: { counted, rate: r2(await shareRate(DB)), amount: shareAmount, paid: sharePaid, stillToPay: r2(shareAmount - sharePaid), lastPaidAt: pays[0]?.paidAt ?? null,
        payments: pays.map(p => ({ amount: p.amount, paidAt: p.paidAt, note: p.note })) } });
  }
  const one = /^\/supplier\/billing\/(\d+)$/.exec(path);
  if (one && method === 'GET') {
    const u = await DB.prepare("SELECT id, username, display_name FROM users WHERE id = ? AND role = 'client' AND NOT archived").bind(Number(one[1])).first();
    if (!u) return json({ ok: false, error: 'Not found' }, 404);
    const settings = await getSettings(DB);
    return json({ ok: true, updatedAt: now(), client: await clientBilling(DB, u, await clientSummary(DB, u.id, settings), { detail: true }) });
  }
  if (path === '/supplier/password' && method === 'POST') {
    const body = await request.json().catch(() => ({})), password = String(body.password || '');
    const u = await DB.prepare('SELECT password_hash, session_version FROM users WHERE id = ?').bind(me.id).first();
    if (password.length < 8 || password.length > 128) return json({ ok: false, error: 'Use 8 to 128 characters for your password.' }, 400);
    if (!await verifyPassword(String(body.currentPassword || ''), u.password_hash)) return json({ ok: false, error: 'Wrong current password.' }, 400);
    if (await verifyPassword(password, u.password_hash)) return json({ ok: false, error: 'Choose a different password.' }, 400);
    const changed = await DB.prepare("UPDATE users SET password_hash=?, session_version=session_version+1 WHERE id=? AND role='supplier' AND session_version=? RETURNING session_version").bind(await hashPassword(password), me.id, Number(u.session_version || 0)).first();
    if (!changed) return json({ ok: false, error: 'Please sign in again.' }, 401);
    return json({ ok: true }, 200, { 'set-cookie': await createSessionCookie('supplier-' + me.id + '-v' + changed.session_version, env.APP_SESSION_SECRET) });
  }
  return json({ ok: false, error: 'Not found' }, 404);
}

// Admin side: supplier logins (Fees & settings > Team accounts) and the supplier share payments.
export async function routeSupplierAdmin(request, path, ctx, deps) {
  const { DB } = ctx, method = request.method;
  if (path === '/admin/supplier-share' && method === 'GET') {
    const pays = await sharePayments(DB);
    return json({ ok: true, payments: pays, paid: r2(pays.reduce((n, p) => n + p.amount, 0)) });
  }
  if (path === '/admin/supplier-share' && method === 'POST') {
    const body = await request.json().catch(() => ({})), amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e6) return json({ ok: false, error: 'Enter the amount the supplier paid.' }, 400);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(body.paidAt || '')) ? Math.floor(Date.parse(body.paidAt + 'T12:00:00Z') / 1000) : now();
    if (!Number.isFinite(d)) return json({ ok: false, error: 'Use a valid date.' }, 400);
    const row = await DB.prepare('INSERT INTO supplier_share_payments (amount, paid_at, note, created_at) VALUES (?,?,?,?) RETURNING id').bind(r2(amount), d, String(body.note || '').trim().slice(0, 300), now()).first();
    return json({ ok: true, id: Number(row.id) });
  }
  const del = /^\/admin\/supplier-share\/(\d+)\/archive$/.exec(path);
  if (del && method === 'POST') {
    const row = await DB.prepare('UPDATE supplier_share_payments SET archived = TRUE WHERE id = ? RETURNING id').bind(Number(del[1])).first();
    return row ? json({ ok: true }) : json({ ok: false, error: 'Not found' }, 404);
  }
  return null;
}
