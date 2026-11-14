// Check: supplier portal phase 1, the API (docs/supplier-portal.md).
//   node checks/check-supplier-api.mjs      (run from the repo root)
// A supplier login (Ada, Ye) only reaches the supplier routes; its Billing numbers are the supplier sheet's balance
// (without our fee) and add up; no answer ever holds our fee, a client price, a payment's full amount or a profit.
import assert from 'node:assert/strict';
import { DB, call, seed, env } from './lib.mjs';
import { route } from '../api/index.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const { admin, client, id } = await seed();
const FEE = 0.37; // our fee per order: a number that must never reach the supplier
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE }, admin));
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const setCost = (oid, cost) => DB.prepare('UPDATE client_orders SET supplier_cost = ?, product_cost = ?, shipping_fee = NULL, price = ? WHERE id = ?').bind(cost, cost + FEE, cost + FEE, oid).run();
const mk = async (ref, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Sample', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order;
  assert.equal(Number((await DB.prepare('SELECT commission FROM client_orders WHERE id = ?').bind(o.id).first()).commission), FEE);
  await setCost(o.id, cost); return o.id;
};
const A = await mk('SUP-A', 20), B = await mk('SUP-B', 30), C = await mk('SUP-C', 15), D = await mk('SUP-D', 10);
const amount = Math.round((20 + 30 + 10 + 3 * FEE) * 100) / 100; // 61.11, what the client paid: never shown to the supplier
ok(await call('/admin/payments', 'POST', { clientId: id, amount, paidAt: '2026-11-05', orderIds: [A, B, D] }, admin));
await setCost(B, 33); // the supplier raised a paid order's cost afterwards
ok(await call('/orders/' + D, 'PUT', { status: 'cancelled' }, admin));
await DB.prepare("INSERT INTO client_balance_adjustments (client_id, order_id, kind, amount, note, created_at) VALUES (?,?,'cancellation_fee',4,'Cancellation fee',1)").bind(id, D).run();

// Supplier logins: only admins add them; clients can't.
assert.equal((await call('/admin/users', 'POST', { username: 'sup-x', name: 'X', password: 'supplierpass1', role: 'supplier' }, client)).status, 403);
const supId = ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin)).id;
const ov = ok(await call('/admin/overview', 'GET', null, admin));
assert.deepEqual(ov.suppliers.map(s => s.username), ['sup-ada']); assert.ok(!ov.clients.some(c => c.id === supId), 'a supplier is not a client');
const login = await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' });
assert.equal(login.status, 200); assert.equal(login.data.redirect, '/supplier/'); const sup = login.cookie;

// Only the supplier routes.
const me = ok(await call('/me', 'GET', null, sup)); assert.equal(me.role, 'supplier');
for (const [p, m] of [['/orders', 'GET'], ['/payments', 'GET'], ['/admin/overview', 'GET'], ['/admin/orders', 'GET'], ['/products', 'GET'], ['/admin/users', 'POST'], ['/client-stores', 'GET'], ['/terms', 'GET']])
  assert.ok([403, 404].includes((await call(p, m, m === 'POST' ? { username: 'evil', password: 'evilpass123', role: 'admin' } : null, sup)).status), 'supplier blocked: ' + p);
assert.ok([403, 404].includes((await call('/orders/' + A, 'GET', null, sup, { 'x-dl-view-as': String(id) })).status), 'no client preview');
assert.ok([401, 403, 404].includes((await call('/supplier/billing', 'GET', null, client)).status), 'clients get no supplier billing');
const rt = (p, cookie) => route(new Request('http://localhost' + p, { headers: { cookie } }), { db: DB, env });
assert.equal((await (await rt('/api/auth/session', sup)).json()).redirect, '/supplier/');
assert.equal((await rt('/api/stores', sup)).status, 403, 'store dashboard: admins only');

// Billing: the sheet's balance without our fee, and it adds up.
const all = ok(await call('/supplier/billing', 'GET', null, sup));
const c = all.clients.find(x => x.id === id);
assert.deepEqual([c.orders, c.cancelFees, c.paidForYourPart, c.balance], [68, 4, 60, 12], 'orders 20+33+15, fee 4, paid for your part 60, still owes 12');
assert.deepEqual([c.ordersTotal, c.cancelledCount], [4, 1]);
assert.equal(Math.round((c.orders + c.cancelFees - c.paidForYourPart) * 100) / 100, c.balance, 'orders + fees - paid = balance');
assert.deepEqual([c.share.counted, c.share.amount], [2, 2], 'share: paid orders not cancelled (A, B) x $1');
assert.equal(all.totals.stillOwed - all.totals.credit, all.totals.net);
const one = ok(await call('/supplier/billing/' + id, 'GET', null, sup)).client;
assert.deepEqual(one.payments.map(p => p.yourPart), [60], 'the payment shows only the supplier part');
assert.deepEqual(one.payments[0].orders.map(o => [o.ref, o.cost]).sort(), [['SUP-A', 20], ['SUP-B', 30], ['SUP-D', 10]], 'orders it paid at the cost when paid');
assert.deepEqual(one.notPaid.map(o => [o.ref, o.cost]), [['SUP-C', 15]]);
assert.deepEqual(one.costChanged.map(o => [o.ref, o.paidCost, o.costNow, o.difference]), [['SUP-B', 30, 33, 3]]);
assert.deepEqual([one.cancelledTotals.paidFor, one.cancelledTotals.cancelFees, one.cancelledTotals.back], [10, 4, 6]);
const a = one.adds; assert.equal(Math.round((a.notPaid + a.costChanged - a.cancelledBack + a.other) * 100) / 100, one.balance, 'how the balance adds up');
assert.equal(a.other, 0);
assert.equal(one.statement.billed - one.statement.paid, one.balance);

// Supplier share payments: recorded by admins, the supplier sees what is still to pay.
assert.equal((await call('/admin/supplier-share', 'POST', { amount: 1, paidAt: '2026-11-10' }, sup)).status, 404);
ok(await call('/admin/supplier-share', 'POST', { amount: 1, paidAt: '2026-11-10', note: 'WeChat' }, admin));
const share = ok(await call('/supplier/billing', 'GET', null, sup)).share;
assert.deepEqual([share.counted, share.amount, share.paid, share.stillToPay], [2, 2, 1, 1]);

// Nothing about our fee, client prices or full payment amounts in any supplier answer.
const forbiddenKeys = /^(commission|price|sellingPrice|paidPrice|profit|ourFee|ourShare|fee|fees|keptFees|kept|supplierShare|amountReceived|clientProfit|etsy.*|buyer.*|email|phone)$/i;
const walk = (v, where) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!forbiddenKeys.test(k), `${where}: key "${k}"`); walk(x, where); } };
for (const p of ['/me', '/supplier/billing', '/supplier/billing/' + id]) {
  const body = ok(await call(p, 'GET', null, sup)), text = JSON.stringify(body);
  walk(body, p);
  for (const n of ['0.37', '20.37', '33.37', '15.37', '10.37', '61.11', '4.37', '0.74', '1.11']) assert.ok(!text.includes(n), `${p} holds ${n}`);
}
console.log('PASS supplier logins reach only supplier routes; Billing = balance without our fee and adds up; share tracker; no fee, price or payment total leaks');

// Password, and removing a login.
assert.equal((await call('/supplier/password', 'POST', { currentPassword: 'wrong', password: 'newsupplierpass' }, sup)).status, 400);
const pw = await call('/supplier/password', 'POST', { currentPassword: 'supplierpass1', password: 'newsupplierpass' }, sup);
assert.equal(pw.status, 200); assert.equal((await call('/me', 'GET', null, sup)).status, 401, 'old session ends');
assert.equal((await call('/me', 'GET', null, pw.cookie)).status, 200);
ok(await call('/admin/users/' + supId, 'POST', { active: false }, admin));
assert.equal((await call('/me', 'GET', null, pw.cookie)).status, 401, 'a disabled supplier is signed out');
assert.equal((await call('/login', 'POST', { username: 'sup-ada', password: 'newsupplierpass' })).status, 401);
console.log('PASS supplier password change ends old sessions; a disabled login can no longer sign in');
