// Local check: saving a client's account with "apply to existing orders" changes the fee on all their orders (real SQL, in-memory Postgres).
//   node checks/check-bulk-client-fee.mjs      (run from the repo root)
import assert from 'node:assert/strict';
import { pg, DB, call, seed } from './lib.mjs';
const { admin, client, id } = await seed();
const mk = async ref => (await call('/orders', 'POST', { clientId: id, orderRef: ref, buyerName: 'S', destination: 'IL', address1: '1 St', etsyUrl: 'https://example.com/i' }, admin)).data.order;
const a = await mk('A'), b = await mk('B'), c = await mk('C');
const other = (await call('/admin/users', 'POST', { username: 'otherclient', name: 'Other', password: 'clientpass123', role: 'client' }, admin)).data.id;
const o2 = (await call('/orders', 'POST', { clientId: other, orderRef: 'X', buyerName: 'S', destination: 'IL', address1: '1 St', etsyUrl: 'https://example.com/i' }, admin)).data.order;
await call('/orders/' + c.id, 'PUT', { status: 'cancelled' }, admin);
const fee = async oid => (await DB.prepare('SELECT commission, supplier_share FROM client_orders WHERE id=?').bind(oid).first());
assert.equal((await fee(a.id)).commission, 2);
// saving the fee alone changes nothing on existing orders
let r = await call('/admin/users/' + id, 'POST', { commissionPerOrder: '0' }, admin); assert.equal(r.status, 200); assert.equal((await fee(a.id)).commission, 2);
// with the tick: all non-cancelled orders of this client only
r = await call('/admin/users/' + id, 'POST', { commissionPerOrder: '0', applyFeeToOrders: true }, admin); assert.equal(r.data.ordersUpdated, 2);
for (const o of [a, b]) { const f = await fee(o.id); assert.equal(Number(f.commission), 0);  }
assert.equal(Number((await fee(c.id)).commission), 2, 'cancelled order untouched'); assert.equal(Number((await fee(o2.id)).commission), 2, 'other client untouched');
// empty fee = default again
r = await call('/admin/users/' + id, 'POST', { commissionPerOrder: null, applyFeeToOrders: true }, admin); assert.equal(Number((await fee(a.id)).commission), 2);
// The supplier gets no part of our fee: a new order has supplier_share 0, so we earn the whole fee
const d = await mk('D'); const fd = await fee(d.id); assert.equal(Number(fd.supplier_share), 0);
r = await call('/admin/users/' + id, 'POST', { commissionPerOrder: '0.5', applyFeeToOrders: true }, admin); assert.equal(r.data.ordersUpdated, 3);
const od = (await call('/orders/' + d.id, 'PUT', { commission: '0.5' }, admin)).data.order; assert.equal(Number(od.ourShare), 0.5, 'we earn the full 0.50'); assert.equal(Number(od.supplierShare), 0);
// Ada's price 27.90 + fee: the client's price follows the fee (was 29.90 with the old $2)
await call('/admin/users/' + id, 'POST', { commissionPerOrder: '2', applyFeeToOrders: true }, admin);
await DB.prepare('UPDATE client_orders SET supplier_cost=27.9, product_cost=29.9, shipping_fee=NULL, price=29.9 WHERE id=?').bind(a.id).run();
await DB.prepare('UPDATE client_orders SET supplier_cost=NULL, product_cost=40, price=40 WHERE id=?').bind(b.id).run();
const price = async oid => (await DB.prepare('SELECT price, product_cost FROM client_orders WHERE id=?').bind(oid).first());
await call('/admin/users/' + id, 'POST', { commissionPerOrder: '0.5', applyFeeToOrders: true }, admin);
assert.equal(Number((await price(a.id)).price), 28.4, 'bulk: 27.90 + 0.50'); assert.equal(Number((await price(a.id)).product_cost), 28.4); assert.equal(Number((await price(b.id)).price), 40, 'typed-in price untouched');
r = await call('/orders/' + a.id, 'PUT', { commission: '1' }, admin); assert.equal(r.status, 200); assert.equal(Number((await price(a.id)).price), 28.9, 'per order fee edit re-prices too');
console.log('PASS bulk client fee'); await pg.close();
