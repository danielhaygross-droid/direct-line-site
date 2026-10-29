// Money on cancelled orders, shown the same way to the admin and to the client (Erwin, 27 Oct 2026: "every amount needs
// to be transparent and easy to monitor"). A cancelled order bills $0 plus its cancellation fee, so what the client
// already paid for it is credit on their balance. When Direct Line sends money back, an admin records a refund
// (client_refunds): it raises the balance again (less credit). Refunds are archived, never deleted.
import { withPaid, paidOrders } from './payment-orders.mjs';

export const REFUND_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS client_refunds (
     id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id), amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
     refunded_at INTEGER NOT NULL, method TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
     archived BOOLEAN NOT NULL DEFAULT FALSE, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS client_refunds_client_idx ON client_refunds (client_id, refunded_at)',
];
const r2 = n => Math.round(Number(n || 0) * 100) / 100;

// Total of the client's refunds (for the balance).
export async function refundedTotal(DB, clientId) {
  return r2((await DB.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM client_refunds WHERE client_id = ? AND NOT archived').bind(clientId).first())?.n);
}

// Every cancelled order with what was paid for it and its fee; totals; the refunds.
//   paid       what the client paid for cancelled orders (their linked payments)
//   fees       all cancellation fees
//   dueBack    paid minus all the fees = what goes back to the client
//   refunded   recorded refunds;  credit = dueBack - refunded (stays on the balance for next orders)
// Erwin, 28 Oct 2026 ("deduct the 100 … automatically"): the fee of a cancelled order that was never paid is taken from
// that credit (oldest cancellation first, while the credit covers it), so the order counts as paid (fromCredit) and
// the box shows one number. A fee the credit can't cover stays owed as before.
export async function cancelledSummary(DB, clientId) {
  await syncKeptFees(DB, clientId);
  const rows = (await DB.prepare(`SELECT o.id, o.order_ref, o.price, o.updated_at, s.name AS store, COALESCE(a.amount, 0) AS fee, COALESCE(k.amount, 0) AS kept
    FROM client_orders o LEFT JOIN client_stores s ON s.id = o.store_id
    LEFT JOIN client_balance_adjustments a ON a.order_id = o.id AND a.kind = 'cancellation_fee'
    LEFT JOIN client_balance_adjustments k ON k.order_id = o.id AND k.kind = '${KEPT_FEE}'
    WHERE o.client_id = ? AND o.status = 'cancelled' AND NOT o.archived ORDER BY o.updated_at DESC, o.id DESC`).bind(clientId).all()).results || [];
  const orders = (await withPaid(DB, rows.map(r => ({ ...r, id: Number(r.id) })), clientId)).map(o => {
    // fee = everything the cancellation costs the client: the supplier's fee plus our own fee kept on a paid order.
    const price = r2(o.price), kept = r2(o.kept), fee = r2(Number(o.fee) + kept), paid = o.paymentId ? price : 0;
    return { id: o.id, orderRef: o.order_ref || '', store: o.store || '', cancelledAt: Number(o.updated_at || 0), price, paid, fee, kept, back: o.paymentId ? r2(paid - fee) : 0 };
  });
  const refunds = ((await DB.prepare('SELECT * FROM client_refunds WHERE client_id = ? AND NOT archived ORDER BY refunded_at DESC, id DESC').bind(clientId).all()).results || [])
    .map(r => ({ id: Number(r.id), amount: r2(r.amount), refundedAt: Number(r.refunded_at), method: r.method || '', note: r.note || '' }));
  const sum = k => r2(orders.reduce((n, o) => n + o[k], 0)), refunded = r2(refunds.reduce((n, r) => n + r.amount, 0));
  let pool = Math.round((sum('back') - refunded) * 100);
  for (const o of [...orders].filter(o => !o.paid && o.fee > 0).sort((a, b) => a.cancelledAt - b.cancelledAt || a.id - b.id)) {
    const fee = Math.round(o.fee * 100); if (fee > pool) continue;
    pool -= fee; o.fromCredit = true; o.back = r2(-o.fee);
  }
  const dueBack = sum('back');
  return { orders, refunds, count: orders.length, paidCount: orders.filter(o => o.paid > 0).length, paid: sum('paid'), fees: sum('fee'), kept: sum('kept'), dueBack, refunded, credit: r2(dueBack - refunded) };
}

// Our fee on a cancelled order the client had paid stays billed (Erwin, 29 Oct 2026: "once we billed those profit its
// fixed already we are not giving it back"). It is a balance adjustment per order ('kept_fee', the order's commission),
// so the balance, the cards and the payment lists count it like the cancellation fee; clients see it as part of the
// cancellation fee. It goes back to 0 when the order is reopened, archived or no longer paid. Brought up to date before
// any balance is worked out (cancelledSummary, clientSummary).
export const KEPT_FEE = 'kept_fee';
// What a client gets: our kept fee is only ever part of the order's cancellation fee, never its own line or field
// (Erwin, 29 Oct 2026: "we cant let the client [know] we take fees per order").
export function clientCancelled(c) {
  if (!c) return c;
  const { kept, ...rest } = c;
  return { ...rest, orders: c.orders.map(({ kept: _, ...o }) => o) };
}
export function clientAdjustments(list) {
  const out = [], fee = new Map();
  for (const a of list) {
    if (a.kind !== KEPT_FEE && a.kind !== 'cancellation_fee') { out.push(a); continue; }
    const f = fee.get(a.orderId);
    if (!f) { const row = { ...a, kind: 'cancellation_fee', note: 'Cancellation fee' }; fee.set(a.orderId, row); out.push(row); continue; }
    f.amount = r2(f.amount + a.amount);
    if (a.kind === 'cancellation_fee') Object.assign(f, { id: a.id, createdAt: a.createdAt });
  }
  return out;
}
export async function syncKeptFees(DB, clientId, t = Math.floor(Date.now() / 1000)) {
  const rows = (await DB.prepare(`SELECT o.id, o.status, o.archived, o.commission, k.amount AS kept FROM client_orders o
    LEFT JOIN client_balance_adjustments k ON k.order_id = o.id AND k.kind = '${KEPT_FEE}'
    WHERE o.client_id = ? AND (o.status = 'cancelled' OR k.amount <> 0)`).bind(clientId).all()).results || [];
  if (!rows.length) return;
  const paid = await paidOrders(DB, clientId);
  for (const r of rows) {
    const want = r.status === 'cancelled' && !r.archived && paid.has(Number(r.id)) && Number(r.commission) > 0 ? r2(r.commission) : 0;
    if (want === r2(r.kept || 0) && (r.kept != null || !want)) continue;
    await DB.prepare(`INSERT INTO client_balance_adjustments (client_id, order_id, kind, amount, note, created_at) VALUES (?,?,'${KEPT_FEE}',?,'Cancellation fee',?)
      ON CONFLICT (order_id, kind) DO UPDATE SET amount = EXCLUDED.amount`).bind(clientId, r.id, want, t).run();
  }
}

// Adds paidFromCredit (true / false) to order objects: cancelled orders whose fee the cancellation credit paid.
export async function withCreditPaid(DB, orders) {
  const covered = new Set(), clients = [...new Set(orders.filter(o => o.status === 'cancelled' && !o.paymentId).map(o => Number(o.clientId)))];
  for (const id of clients) for (const o of (await cancelledSummary(DB, id)).orders) if (o.fromCredit) covered.add(o.id);
  return orders.map(o => ({ ...o, paidFromCredit: covered.has(Number(o.id)) }));
}

export async function addRefund(DB, body, t = Math.floor(Date.now() / 1000)) {
  const clientId = Number(body.clientId), amount = Number(body.amount);
  if (!(await DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'client'").bind(clientId).first())) throw Object.assign(new Error('Unknown client'), { status: 400 });
  if (!(amount > 0) || amount >= 1e7 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) throw Object.assign(new Error('Enter the refund amount (more than 0, up to two decimals).'), { status: 400 });
  const at = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? Math.floor(new Date(body.date + 'T12:00:00Z').getTime() / 1000) : t;
  const row = await DB.prepare('INSERT INTO client_refunds (client_id, amount, refunded_at, method, note, created_at) VALUES (?,?,?,?,?,?) RETURNING id')
    .bind(clientId, r2(amount), at, String(body.method || '').trim().slice(0, 60), String(body.note || '').trim().slice(0, 300), t).first();
  return Number(row.id);
}
