// Check: order history entries hidden from the client (Erwin, 13 Nov 2026).
//   node checks/check-hidden-events.mjs      (run from the repo root)
// Restoring costs after a sheet mix-up sent a client five "Product cost updated" notices on cancelled orders, which
// "will cause confusion". An admin can hide one entry from the client: it leaves the client's notifications and order
// timeline, stays in the admin's history, can be shown again, and is never deleted. Clients can't hide anything.
import assert from 'node:assert/strict';
import { DB, call, seed } from './lib.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const { admin, client, id } = await seed();
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const order = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: 'HIDE-1', buyerName: 'Sample', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order;
const t = Math.floor(Date.now() / 1000);
const ev = await DB.prepare("INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,'price_changed','admin','44.40|65.40',?) RETURNING id").bind(order.id, id, t).first();
const eid = Number(ev.id);
const inBell = async () => ok(await call('/notifications', 'GET', null, client)).items.some(n => Number(n.id) === eid);
const inTimeline = async who => ok(await call('/orders/' + order.id + '/messages', 'GET', null, who)).events.some(e => Number(e.id) === eid);
assert.ok(await inBell(), 'the client sees the notice'); assert.ok(await inTimeline(client), 'and it is on the order timeline');

const refused = await call('/admin/order-events/' + eid + '/client-hidden', 'POST', { hidden: true }, client);
assert.notEqual(refused.status, 200, 'a client cannot hide entries'); assert.ok(await inBell(), 'still there');

const hid = ok(await call('/admin/order-events/' + eid + '/client-hidden', 'POST', { hidden: true }, admin));
assert.equal(hid.clientHidden, true);
assert.ok(!await inBell(), 'hidden: not in the client notifications'); assert.ok(!await inTimeline(client), 'not on the client order timeline');
assert.ok(await inTimeline(admin), 'the admin still sees it in the order history');
assert.ok(await DB.prepare('SELECT 1 AS x FROM order_events WHERE id = ?').bind(eid).first(), 'never deleted');

ok(await call('/admin/order-events/' + eid + '/client-hidden', 'POST', { hidden: false }, admin));
assert.ok(await inBell(), 'shown again');
assert.equal((await call('/admin/order-events/999999/client-hidden', 'POST', { hidden: true }, admin)).status, 404, 'unknown entry');
console.log('PASS hide an order history entry from the client: bell and timeline leave it out, the admin keeps it, can be shown again, never deleted, clients cannot hide');
process.exit(0);
