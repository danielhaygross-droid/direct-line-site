// Check: what an order cost when it was paid (Erwin, 13 Nov 2026).
//   node checks/check-cost-at-payment.mjs      (run from the repo root)
// a client's refund in the supplier sheet came out too low: four paid orders had their cost lowered in the sheet after the payment,
// and the refund used today's cost. A payment link now keeps the order's price and cost from when it was linked; the
// refund (admin and client) uses them; clients never get the supplier's cost; links made before got them once from
// the order's cost history (FILL_PAID_AT).
import assert from 'node:assert/strict';
import { DB, call, seed } from './lib.mjs';
import { FILL_PAID_AT } from '../server/payment-orders.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const { admin, client, id } = await seed();
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
// An order with a supplier cost, priced like the sheet does it (price = cost + our fee).
const setCost = async (oid, cost) => {
  const o = await DB.prepare('SELECT commission FROM client_orders WHERE id = ?').bind(oid).first(), fee = Number(o.commission || 0);
  await DB.prepare('UPDATE client_orders SET supplier_cost = ?, product_cost = ?, shipping_fee = NULL, price = ? WHERE id = ?').bind(cost, cost + fee, cost + fee, oid).run();
  return fee;
};
const mk = async (ref, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Sample', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order;
  if (cost != null) await setCost(o.id, cost);
  return o.id;
};
const link = oid => DB.prepare('SELECT paid_price, paid_cost, created_at FROM payment_orders WHERE order_id = ?').bind(oid).first();
const n2 = v => (v == null ? null : Math.round(Number(v) * 100) / 100);

// 1) A new link keeps what the order cost right then; a later cost change does not change the refund.
const A = await mk('PAID-A', 20), fee = Number((await DB.prepare('SELECT commission FROM client_orders WHERE id = ?').bind(A).first()).commission || 0);
const pay = ok(await call('/admin/payments', 'POST', { clientId: id, amount: 20 + fee, paidAt: '2026-11-05', orderIds: [A] }, admin)).id;
assert.deepEqual([n2((await link(A)).paid_cost), n2((await link(A)).paid_price)], [20, n2(20 + fee)], 'saved on the link: cost 20, price 20 + our fee');
await setCost(A, 12); // the supplier lowers the cost after the payment
ok(await call('/orders/' + A, 'PUT', { status: 'cancelled' }, admin));
await DB.prepare("INSERT INTO client_balance_adjustments (client_id, order_id, kind, amount, note, created_at) VALUES (?,?,'cancellation_fee',4,'Cancellation fee',1)").bind(id, A).run();
const cxA = ok(await call('/admin/payments?clientId=' + id, 'GET', null, admin)).cancelled.orders.find(o => o.id === A);
assert.equal(n2(cxA.paid), n2(20 + fee), 'admin: paid = what the client paid, not today’s price (' + (12 + fee) + ')');
assert.equal(n2(cxA.supPaid), 20, 'admin, without our fee: 20, as in the sheet’s Paid for it');
assert.equal(n2(cxA.back), n2(cxA.paid - cxA.fee), 'refund = paid - cancellation fee');
const mine = ok(await call('/payments', 'GET', null, client)).cancelled.orders.find(o => o.id === A);
assert.equal(n2(mine.paid), n2(20 + fee), 'client: the same refund');
assert.ok(!('supPaid' in mine), 'client: no supplier numbers');
const co = ok(await call('/orders', 'GET', null, client)).orders.find(o => o.id === A);
assert.equal(n2(co.paidPrice), n2(20 + fee), 'client order: what they paid for it'); assert.ok(!('paidCost' in co), 'client order: never the supplier’s cost');
const ao = ok(await call('/admin/orders', 'GET', null, admin)).orders.find(o => o.id === A);
assert.equal(n2(ao.paidCost), 20, 'admin order: the supplier’s cost when it was paid');
console.log('PASS a payment keeps what each order cost; a cost lowered afterwards does not shrink the refund (admin and client); clients never get the cost');

// 2) Links from before: filled once from the cost history (the last cost typed before the payment).
const paidAt = Math.floor(Date.parse('2026-11-05T12:00:00Z') / 1000);
const B = await mk('OLD-B', 18.5), C = await mk('OLD-C', 35), D = await mk('OLD-D', 50), E = await mk('OLD-E', null), F = await mk('OLD-F', 49.9);
await DB.prepare('UPDATE client_orders SET price = 9 WHERE id = ?').bind(E).run(); // priced by an admin, no supplier cost
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 100, paidAt: '2026-11-05', orderIds: [B, C, D, E, F] }, admin));
const ev = (oid, at, detail) => DB.prepare("INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,'supplier_sheet','admin',?,?)").bind(oid, id, detail, at).run();
const cost = (from, to) => JSON.stringify({ f: 'cost', from, to });
// B: 25 before the payment; after it "NO: ..." (a revision answer) and "$18.50" (lowered). Recorded a day later.
await ev(B, paidAt - 3600, cost('', '25')); await ev(B, paidAt + 3600, cost('25', 'NO: This is already the lowest price')); await ev(B, paidAt + 7200, cost('25', '$18.50'));
await ev(B, paidAt - 60, JSON.stringify({ f: 'cancel_fee', from: '', to: '4' })); // not a cost
// C: costed only after the payment date (40, then 35): the first cost counts.
await ev(C, paidAt + 100, cost('', '40')); await ev(C, paidAt + 200, cost('40', '35'));
// F: its cost was entered on the website (no event); raised in the sheet after the payment: it was paid at the old cost.
await ev(F, paidAt + 300, cost('30.9', '49.9'));
await DB.prepare('UPDATE payment_orders SET paid_price = NULL, paid_cost = NULL, created_at = ? WHERE order_id IN (?,?,?,?,?)').bind(paidAt + 86400, B, C, D, E, F).run();
await DB.prepare(FILL_PAID_AT).run();
const got = async oid => { const l = await link(oid); return [n2(l.paid_cost), n2(l.paid_price)]; };
assert.deepEqual(await got(B), [25, n2(25 + fee)], 'B: the cost before the payment, not the later $18.50 or the NO answer');
assert.deepEqual(await got(C), [40, n2(40 + fee)], 'C: nothing before it, the first cost after');
assert.deepEqual(await got(D), [50, n2(50 + fee)], 'D: no history, today’s cost');
assert.deepEqual(await got(F), [30.9, n2(30.9 + fee)], 'F: what the first later change changed it from');
assert.deepEqual(await got(E), [null, null], 'E: no supplier cost, left empty (today’s price is used)');
await DB.prepare(FILL_PAID_AT).run();
assert.deepEqual(await got(B), [25, n2(25 + fee)], 'running it again changes nothing');
const ao2 = Object.fromEntries(ok(await call('/admin/orders', 'GET', null, admin)).orders.map(o => [o.orderRef, o]));
assert.equal(n2(ao2['OLD-E'].paidPrice), null, 'E: no saved price'); assert.equal(n2(ao2['OLD-B'].paidCost), 25);
console.log('PASS links made before: filled once from the cost history (before the payment, else what the first later change changed it from, else the first cost after, else today), safe to run again');
process.exit(0);
