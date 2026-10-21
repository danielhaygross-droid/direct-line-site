// Which orders a payment is for (Erwin, 21 Oct 2026).
// A payment can be linked to the client's billed orders. An order counts as paid while it is linked to a payment
// that is not archived. The balance itself does not change (billed - paid - adjustments); this only says which
// orders the money was for. A gap between the amount and the linked orders is allowed and shown, not refused.
// A client can tick the orders a transfer confirmation is for; the admin sees them ticked when recording it.
export const PAYMENT_ORDER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS payment_orders (
    payment_id INTEGER NOT NULL REFERENCES client_payments(id), order_id INTEGER NOT NULL REFERENCES client_orders(id),
    created_at INTEGER NOT NULL, PRIMARY KEY (payment_id, order_id))`,
  'CREATE INDEX IF NOT EXISTS payment_orders_order_idx ON payment_orders (order_id)',
  `CREATE TABLE IF NOT EXISTS transfer_orders (
    file_id INTEGER NOT NULL REFERENCES portal_files(id), order_id INTEGER NOT NULL REFERENCES client_orders(id),
    PRIMARY KEY (file_id, order_id))`,
];
const MAX_ORDERS = 500;
const now = () => Math.floor(Date.now() / 1000);
const nameOf = r => r.order_ref || '#' + r.id;
const marks = n => Array.from({ length: n }, () => '?').join(',');

// Order ids from a request body. undefined / null = "not sent" (leave the links as they are).
export function orderIdList(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new Error('Choose valid orders.');
  const ids = [...new Set(value.map(Number))];
  if (ids.length > MAX_ORDERS || ids.some(n => !Number.isSafeInteger(n) || n <= 0)) throw new Error('Choose valid orders.');
  return ids.sort((a, b) => a - b);
}

// What an order adds to the bill, in cents: its price (not for cancelled orders) plus its balance adjustments
// (cancellation fee, claim refund). The same rule as DLClientStoreMath.performance().
export const dueCents = r => (r.status === 'cancelled' ? 0 : Math.round(Number(r.price || 0) * 100)) + Math.round(Number(r.adj || 0) * 100);

async function orderRows(DB, clientId, ids) {
  if (!ids.length) return [];
  return (await DB.prepare(`SELECT o.id, o.order_ref, o.status, o.price, o.archived,
      COALESCE((SELECT SUM(a.amount) FROM client_balance_adjustments a WHERE a.order_id = o.id), 0) AS adj
    FROM client_orders o WHERE o.client_id = ? AND o.id IN (${marks(ids.length)})`).bind(clientId, ...ids).all()).results || [];
}

// Active links: orderId -> { paymentId, paidAt }. Archived payments don't count.
export async function paidOrders(DB, clientId = null) {
  const rows = (await DB.prepare(`SELECT po.order_id, p.id AS payment_id, p.paid_at FROM payment_orders po JOIN client_payments p ON p.id = po.payment_id
    WHERE NOT p.archived${clientId ? ' AND p.client_id = ?' : ''} ORDER BY p.paid_at, p.id`).bind(...(clientId ? [clientId] : [])).all()).results || [];
  const map = new Map();
  for (const r of rows) if (!map.has(Number(r.order_id))) map.set(Number(r.order_id), { paymentId: Number(r.payment_id), paidAt: Number(r.paid_at) });
  return map;
}
// Adds paymentId / paidAt (null when not paid) to order objects from orderOut().
export async function withPaid(DB, orders, clientId = null) {
  if (!orders.length) return orders;
  const paid = await paidOrders(DB, clientId);
  return orders.map(o => ({ ...o, paymentId: paid.get(Number(o.id))?.paymentId ?? null, paidAt: paid.get(Number(o.id))?.paidAt ?? null }));
}
// paymentId -> [orderIds] for one client's payments (archived ones too).
export async function paymentOrderIds(DB, clientId) {
  const rows = (await DB.prepare('SELECT po.payment_id, po.order_id FROM payment_orders po JOIN client_payments p ON p.id = po.payment_id WHERE p.client_id = ? ORDER BY po.order_id').bind(clientId).all()).results || [];
  const map = new Map();
  for (const r of rows) map.set(Number(r.payment_id), [...(map.get(Number(r.payment_id)) || []), Number(r.order_id)]);
  return map;
}
// fileId -> [orderIds] the client ticked on their transfer confirmations.
export async function transferOrderIds(DB, clientId) {
  const rows = (await DB.prepare("SELECT t.file_id, t.order_id FROM transfer_orders t JOIN portal_files f ON f.id = t.file_id WHERE f.client_id = ? ORDER BY t.order_id").bind(clientId).all()).results || [];
  const map = new Map();
  for (const r of rows) map.set(Number(r.file_id), [...(map.get(Number(r.file_id)) || []), Number(r.order_id)]);
  return map;
}

// Checks orders before linking them to a payment (or a transfer confirmation): they belong to the client, have
// something billed, are not archived and are not already paid by another payment. Orders already linked to this
// payment (keep) may stay even if they no longer qualify (e.g. cancelled later), so an edit never fails on them.
export async function checkOrders(DB, clientId, ids, { paymentId = null, keep = [] } = {}) {
  if (!ids.length) return;
  const rows = await orderRows(DB, clientId, ids);
  if (rows.length !== ids.length) throw new Error('Choose orders belonging to this client.');
  const paid = await paidOrders(DB, clientId), kept = new Set(keep);
  for (const r of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
    const id = Number(r.id), by = paid.get(id);
    if (by && by.paymentId !== paymentId) throw new Error(`Order ${nameOf(r)} is already paid by another payment.`);
    if (kept.has(id)) continue;
    if (r.archived) throw new Error(`Order ${nameOf(r)} is archived.`);
    if (dueCents(r) <= 0) throw new Error(`Order ${nameOf(r)} has nothing billed yet.`);
  }
}

// Sets the orders of a payment. Changes are kept in payment_edits (field "orders").
export async function setPaymentOrders(DB, paymentId, clientId, ids, { log = true } = {}) {
  const before = (await paymentOrderIds(DB, clientId)).get(paymentId) || [];
  const want = new Set(ids), had = new Set(before);
  const removed = before.filter(id => !want.has(id)), added = ids.filter(id => !had.has(id));
  if (removed.length) await DB.prepare(`DELETE FROM payment_orders WHERE payment_id = ? AND order_id IN (${marks(removed.length)})`).bind(paymentId, ...removed).run();
  for (const id of added) await DB.prepare('INSERT INTO payment_orders (payment_id, order_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(paymentId, id, now()).run();
  if (log && (removed.length || added.length)) {
    const names = async list => (await orderRows(DB, clientId, list)).sort((a, b) => Number(a.id) - Number(b.id)).map(nameOf).join(', ');
    await DB.prepare('INSERT INTO payment_edits (payment_id, field, old_value, new_value, created_at) VALUES (?,?,?,?,?)').bind(paymentId, 'orders', await names(before), await names(ids), now()).run();
  }
  return { added: added.length, removed: removed.length };
}

// The orders a client ticked on a transfer confirmation (replaced while it waits for review).
export async function setTransferOrders(DB, fileId, clientId, ids) {
  await DB.prepare('DELETE FROM transfer_orders WHERE file_id = ?').bind(fileId).run();
  for (const id of ids) await DB.prepare('INSERT INTO transfer_orders (file_id, order_id) VALUES (?,?) ON CONFLICT DO NOTHING').bind(fileId, id).run();
}

// The client's choice, keeping only orders that can still be linked (billed, not archived, not paid meanwhile).
export async function stillOpen(DB, clientId, ids) {
  if (!ids.length) return [];
  const paid = await paidOrders(DB, clientId);
  return (await orderRows(DB, clientId, ids)).filter(r => !r.archived && dueCents(r) > 0 && !paid.has(Number(r.id))).map(r => Number(r.id)).sort((a, b) => a - b);
}

// Restoring an archived payment: orders paid by another payment meanwhile are taken off this one.
// Call it while the payment is still archived (then every active link belongs to another payment).
export async function dropTakenOrders(DB, paymentId, clientId) {
  const mine = (await paymentOrderIds(DB, clientId)).get(paymentId) || [], paid = await paidOrders(DB, clientId);
  const taken = mine.filter(id => paid.has(id) && paid.get(id).paymentId !== paymentId);
  if (taken.length) await setPaymentOrders(DB, paymentId, clientId, mine.filter(id => !taken.includes(id)));
  return taken.length;
}
