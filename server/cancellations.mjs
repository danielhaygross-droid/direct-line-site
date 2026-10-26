// Money on cancelled orders, shown the same way to the admin and to the client (Erwin, 27 Oct 2026: "every amount needs
// to be transparent and easy to monitor"). A cancelled order bills $0 plus its cancellation fee, so what the client
// already paid for it is credit on their balance. When Direct Line sends money back, an admin records a refund
// (client_refunds): it raises the balance again (less credit). Refunds are archived, never deleted.
import { withPaid } from './payment-orders.mjs';

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
//   fees       all cancellation fees (also on unpaid orders: those are simply owed on the balance)
//   dueBack    paid minus the fees on those paid orders = what goes back to the client
//   refunded   recorded refunds;  credit = dueBack - refunded (stays on the balance for next orders)
export async function cancelledSummary(DB, clientId) {
  const rows = (await DB.prepare(`SELECT o.id, o.order_ref, o.price, o.updated_at, s.name AS store, COALESCE(a.amount, 0) AS fee
    FROM client_orders o LEFT JOIN client_stores s ON s.id = o.store_id
    LEFT JOIN client_balance_adjustments a ON a.order_id = o.id AND a.kind = 'cancellation_fee'
    WHERE o.client_id = ? AND o.status = 'cancelled' AND NOT o.archived ORDER BY o.updated_at DESC, o.id DESC`).bind(clientId).all()).results || [];
  const orders = (await withPaid(DB, rows.map(r => ({ ...r, id: Number(r.id) })), clientId)).map(o => {
    const price = r2(o.price), fee = r2(o.fee), paid = o.paymentId ? price : 0;
    return { id: o.id, orderRef: o.order_ref || '', store: o.store || '', cancelledAt: Number(o.updated_at || 0), price, paid, fee, back: o.paymentId ? r2(paid - fee) : 0 };
  });
  const refunds = ((await DB.prepare('SELECT * FROM client_refunds WHERE client_id = ? AND NOT archived ORDER BY refunded_at DESC, id DESC').bind(clientId).all()).results || [])
    .map(r => ({ id: Number(r.id), amount: r2(r.amount), refundedAt: Number(r.refunded_at), method: r.method || '', note: r.note || '' }));
  const sum = k => r2(orders.reduce((n, o) => n + o[k], 0));
  const dueBack = sum('back'), refunded = r2(refunds.reduce((n, r) => n + r.amount, 0));
  return { orders, refunds, count: orders.length, paidCount: orders.filter(o => o.paid > 0).length, paid: sum('paid'), fees: sum('fee'), dueBack, refunded, credit: r2(dueBack - refunded) };
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
