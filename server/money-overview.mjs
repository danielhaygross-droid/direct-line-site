// All-clients money for the admin Overview (Erwin, 27 Oct 2026: "the TOTAL in case we will have multiple clients soon,
// and a detailed graph for all the money matters"). Archived clients and archived orders are left out, like the
// rest of the Overview.
import { cancelledSummary } from './cancellations.mjs';

const r2 = n => Math.round(Number(n || 0) * 100) / 100;

// Cancelled orders summed over the clients, plus each client's own line (only clients with cancelled money).
export async function cancelledTotals(DB, clients) {
  const keys = ['count', 'paidCount', 'paid', 'fees', 'dueBack', 'refunded', 'credit'];
  const total = Object.fromEntries(keys.map(k => [k, 0])), byClient = [];
  for (const c of clients) {
    const s = await cancelledSummary(DB, c.id);
    if (!s.count && !s.refunds.length) continue;
    const row = { clientId: c.id, name: c.name };
    for (const k of keys) { row[k] = s[k]; total[k] = r2(total[k] + s[k]); }
    byClient.push(row);
  }
  byClient.sort((a, b) => b.credit - a.credit || b.count - a.count);
  return { ...total, clients: byClient };
}

// Money per calendar month ('YYYY-MM'), oldest first. Orders count by their order date (the same month the cards use);
// payments, fees and refunds by the day they happened.
//   billed   what clients were billed (cancelled orders not counted)   earned   our share of the fees on those orders
//   paid     payments received                                         fees     cancellation fees billed
//   refunds  money sent back                                           orders / cancelled   order counts
export async function moneyMonths(DB) {
  const month = col => `to_char(to_timestamp(${col}), 'YYYY-MM')`;
  const live = 'JOIN users u ON u.id = o.client_id AND NOT u.archived';
  const q = async sql => (await DB.prepare(sql).all()).results || [];
  const orders = await q(`SELECT COALESCE(NULLIF(substr(o.order_date, 1, 7), ''), ${month('o.created_at')}) AS m,
      COALESCE(SUM(o.price) FILTER (WHERE o.status <> 'cancelled'), 0) AS billed,
      COALESCE(SUM(o.commission - LEAST(o.supplier_share, o.commission)) FILTER (WHERE o.status <> 'cancelled'), 0) AS earned,
      COUNT(*) FILTER (WHERE o.status <> 'cancelled') AS orders, COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled
    FROM client_orders o ${live} WHERE NOT o.archived GROUP BY 1`);
  const paid = await q(`SELECT ${month('p.paid_at')} AS m, SUM(p.amount) AS n FROM client_payments p JOIN users u ON u.id = p.client_id AND NOT u.archived WHERE NOT p.archived GROUP BY 1`);
  const fees = await q(`SELECT ${month('a.created_at')} AS m, SUM(a.amount) AS n FROM client_balance_adjustments a JOIN client_orders o ON o.id = a.order_id AND NOT o.archived ${live} WHERE a.kind = 'cancellation_fee' GROUP BY 1`);
  const refunds = await q(`SELECT ${month('r.refunded_at')} AS m, SUM(r.amount) AS n FROM client_refunds r JOIN users u ON u.id = r.client_id AND NOT u.archived WHERE NOT r.archived GROUP BY 1`);
  const map = new Map();
  const at = m => { if (!map.has(m)) map.set(m, { month: m, billed: 0, earned: 0, paid: 0, fees: 0, refunds: 0, orders: 0, cancelled: 0 }); return map.get(m); };
  for (const r of orders) Object.assign(at(r.m), { billed: r2(r.billed), earned: r2(r.earned), orders: Number(r.orders), cancelled: Number(r.cancelled) });
  for (const [rows, k] of [[paid, 'paid'], [fees, 'fees'], [refunds, 'refunds']]) for (const r of rows) at(r.m)[k] = r2(r.n);
  return [...map.values()].filter(x => /^\d{4}-\d{2}$/.test(x.month)).sort((a, b) => a.month.localeCompare(b.month));
}
