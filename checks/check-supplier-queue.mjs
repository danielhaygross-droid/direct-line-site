// Check: supplier portal phase 2, the work queue API (docs/supplier-portal.md).
//   node checks/check-supplier-queue.mjs      (run from the repo root)
// The supplier types their cells in the portal; each save works exactly like the same edit in the sheet (billing, shipped,
// delays, cancellation fees), records who saved it, and never sends our fee, client prices or client contact details.
import assert from 'node:assert/strict';
import { DB, call, seed, env } from './lib.mjs';
import { handlePortal } from '../server/portal.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const { admin, client, id } = await seed();
const FEE = 0.37;
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE }, admin));
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async (ref, extra = {}) => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Brass lamp', variant: 'Gold', buyerName: 'Jane Buyer', buyerPhone: '+1 555 0100', address1: '1 Sample St', city: 'Austin', destination: 'US', etsyUrl: 'https://example.com/' + ref, sellingPrice: 99.99, photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }], ...extra }, client)).order.id;
const A = await mk('Q-A'), B = await mk('Q-B'), C = await mk('Q-C');
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const put = (oid, field, value) => call('/supplier/orders/' + oid, 'PUT', { field, value }, sup);
const list = async () => ok(await call('/supplier/orders', 'GET', null, sup)).orders;
const get = async oid => (await list()).find(o => o.id === oid);
const row = oid => DB.prepare('SELECT * FROM client_orders WHERE id = ?').bind(oid).first();

// The queue: every open order, New tab, with what the supplier needs (product, photos, address) and nothing else.
assert.ok([401, 403, 404].includes((await call('/supplier/orders', 'GET', null, client)).status), 'clients get no queue');
let a = await get(A);
assert.deepEqual([a.tab, a.ref, a.qty, a.product, a.buyer, a.country, a.photos.length], ['new', 'Q-A', 1, 'Brass lamp · Gold', 'Jane Buyer', 'United States', 1]);
assert.match(a.address, /1 Sample St/); assert.match(a.photos[0].url, /^\/api\/portal\/sheet-photos\/\d+\/\d+\?key=/);
assert.deepEqual(ok(await call('/supplier/alerts', 'GET', null, sup)).newOrders, 3, 'alerts: 3 new orders');
ok(await call('/supplier/alerts/seen', 'POST', {}, sup));
assert.equal(ok(await call('/supplier/alerts', 'GET', null, sup)).newOrders, 0);

// Total cost: billed to the client as cost + our fee, exactly like the sheet; who saved it is kept.
assert.equal((await put(A, 'cost', 'abc')).status, 400);
ok(await put(A, 'cost', '20'));
let r = await row(A);
assert.deepEqual([Number(r.supplier_cost), Math.round(Number(r.price) * 100) / 100], [20, 20.37], 'cost 20 -> client billed 20.37');
a = await get(A); assert.equal(a.cells.cost, '20.00'); assert.equal(a.edits.cost.by, 'Ada');
const ev = await DB.prepare("SELECT detail FROM order_events WHERE order_id = ? AND kind = 'supplier_sheet' ORDER BY id DESC").bind(A).first();
assert.equal(JSON.parse(ev.detail).by, 'Ada', 'admin history says the supplier portal, by Ada');
assert.ok(await DB.prepare("SELECT 1 AS x FROM order_events WHERE order_id = ? AND kind = 'billed'").bind(A).first(), 'client told: order billed');

// Bought -> its own tab; tracking (duplicate warned), courier from the list, shipped.
ok(await put(A, 'bought', true)); assert.equal((await get(A)).tab, 'bought'); assert.equal((await get(A)).boughtBy, 'Ada');
assert.equal((await put(A, 'shipped', true)).status, 409, 'no tracking yet: can’t ship');
assert.equal((await put(A, 'tracking', 'LX 123')).status, 400, 'no spaces');
assert.deepEqual(ok(await put(A, 'tracking', 'LX123CN')).warn.sameTracking, []);
assert.deepEqual(ok(await put(B, 'tracking', 'lx123cn')).warn.sameTracking, ['Q-A'], 'same tracking on another order: warned, still saved');
ok(await put(B, 'tracking', ''));
assert.equal((await put(A, 'courier', 'Pony Express')).status, 400);
ok(await put(A, 'courier', 'China Post'));
ok(await put(A, 'shipped', true));
r = await row(A); assert.deepEqual([r.status, r.tracking_number, r.courier], ['shipped', 'LX123CN', 'China Post']);
assert.equal((await get(A)).tab, 'shipped');
// Since 25 Nov 2026 a shipped order can be set back (a mistake), then shipped again.
ok(await put(A, 'shipped', false)); assert.equal((await row(A)).status, 'processing', 'un-ship');
ok(await put(A, 'shipped', true)); assert.equal((await row(A)).status, 'shipped');

// Delayed + reason: the client is told, as from the sheet.
assert.equal((await put(B, 'reason', 'Remaking')).status, 409, 'reason needs delayed first');
ok(await put(B, 'delayed', true)); ok(await put(B, 'reason', 'Being remade'));
r = await row(B); assert.ok(r.delayed_at); assert.equal(r.delay_reason, 'Being remade');
ok(await put(B, 'delayed', false)); assert.equal((await row(B)).delayed_at, null);
ok(await put(B, 'domestic', 'SF1234')); ok(await put(B, 'itemCosts', '10.90, 9.00'));
r = await row(B); assert.deepEqual([r.domestic_tracking, r.item_costs], ['SF1234', '10.90, 9.00']);

// Cancel request: don't buy or ship; a cancellation fee once cancelled is billed.
ok(await call('/orders/' + C + '/request-cancellation', 'POST', { reason: 'Buyer changed mind' }, client));
let c = await get(C); assert.equal(c.cancelRequested, true);
assert.equal((await put(C, 'bought', true)).status, 409);
assert.equal((await put(B, 'cancelFee', '4')).status, 409, 'fee only on cancelled / cancel requested');
ok(await call('/orders/' + C + '/approve-cancellation', 'POST', {}, admin));
assert.equal((await get(C)).tab, 'cancelled');
ok(await put(C, 'cancelFee', '4'));
const fee = await DB.prepare("SELECT amount FROM client_balance_adjustments WHERE order_id = ? AND kind = 'cancellation_fee'").bind(C).first();
assert.equal(Number(fee.amount), 4, 'the cancellation fee is billed');
{ const before = Number((await row(C)).price); ok(await put(C, 'cost', '5')); assert.equal(Number((await row(C)).supplier_cost), 5); assert.equal(Number((await row(C)).price), before, 'cancelled: cost recorded, not billed again'); }

// Photos zip.
{ const url = new URL('http://localhost/api/portal/supplier/orders/' + B + '/photos.zip');
  const resp = await handlePortal(new Request(url, { headers: { cookie: sup } }), url, { DB, env });
  assert.equal(resp.status, 200); assert.equal(resp.headers.get('content-type'), 'application/zip');
  const bytes = Buffer.from(await resp.arrayBuffer()); assert.equal(bytes.subarray(0, 2).toString(), 'PK'); assert.ok(bytes.includes(Buffer.from('Q-B-photo-1.png'))); }

// Nothing about our fee, client prices, selling prices or client contact details in the queue.
const text = JSON.stringify(ok(await call('/supplier/orders', 'GET', null, sup)));
for (const n of ['20.37', '0.37', '99.99', 'localclient', 'Local Client'.toLowerCase() + '@']) assert.ok(!text.includes(n), 'queue holds ' + n);
const forbidden = /^(price|commission|sellingPrice|selling_price|paidPrice|profit|competitorPrice|competitor_price|email|clientEmail|whatsapp|productCost|shippingFee|supplierShare)$/i;
const walk = v => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!forbidden.test(k), 'key ' + k); walk(x); } };
walk(JSON.parse(text));
console.log('PASS work queue: saves work like the sheet (billing, bought, tracking + duplicate warning, courier, shipped, delays, cancellation fee), who saved it, alerts, photos zip; no fee or client price');

// Admins have full access to the supplier portal: an admin's edit saves like the supplier's and is recorded under the admin's name.
{ const N = await mk('Q-ADMIN');
  ok(await call('/supplier/orders/' + N, 'PUT', { field: 'domestic', value: 'SF-ADMIN-1' }, admin));
  const o = (await list()).find(x => x.id === N), e = await DB.prepare('SELECT by_name FROM supplier_edits WHERE order_id = ? ORDER BY id DESC').bind(N).first();
  assert.ok(JSON.stringify(o).includes('SF-ADMIN-1'), 'the supplier sees the admin edit'); assert.match(e.by_name, /\(admin\)$/);
  console.log('PASS admin edits in the supplier portal save and are recorded as (admin)'); }

// QA 15 Nov: an order that already has a tracking number counts as Bought (live orders had tracking but showed "Not bought" under New).
{ const T = await mk('Q-TRACKED');
  assert.equal((await get(T)).tab, 'new');
  ok(await put(T, 'tracking', 'UL123456789YP'));
  assert.equal((await get(T)).tab, 'bought', 'tracking typed: the order is in Bought');
  console.log('PASS an order with a tracking number is in Bought, not New'); }
// The courier from the tracking number (Erwin, 19 Nov 2026) and adding a courier from the supplier portal.
{ const Y = await mk('Q-YANWEN'), C = await mk('Q-CHINAPOST'), K = await mk('Q-KEEP');
  ok(await put(Y, 'tracking', 'UL706844450YP')); assert.equal((await get(Y)).cells.courier, 'Yanwen', 'UL…YP is Yanwen');
  ok(await put(C, 'tracking', 'ZS35381739099')); assert.equal((await get(C)).cells.courier, 'China Post', 'ZS + 11 digits is China Post');
  ok(await put(K, 'courier', 'China Post')); ok(await put(K, 'tracking', 'UL706844451YP'));
  assert.equal((await get(K)).cells.courier, 'China Post', 'a courier already picked is never changed');
  // A new courier: added from the courier box, then learned from its tracking format once two orders agree.
  assert.equal((await call('/supplier/couriers', 'POST', { name: '' }, sup)).status, 400, 'a name is needed');
  const added = ok(await call('/supplier/couriers', 'POST', { name: 'Cainiao' }, sup));
  assert.ok(added.couriers.includes('Cainiao') && added.couriers.includes('Yanwen'), 'added to the list, the others kept');
  assert.deepEqual(ok(await call('/supplier/couriers', 'POST', { name: 'cainiao' }, sup)).couriers, added.couriers, 'no duplicate');
  const L1 = await mk('Q-LEARN-1'), L2 = await mk('Q-LEARN-2'), L3 = await mk('Q-LEARN-3'), L4 = await mk('Q-LEARN-4');
  ok(await put(L1, 'courier', 'Cainiao')); ok(await put(L1, 'tracking', 'LP00123456789'));
  ok(await put(L2, 'tracking', 'LP00123456790')); assert.equal((await get(L2)).cells.courier, '', 'one example is not enough');
  ok(await put(L2, 'courier', 'Cainiao'));
  ok(await put(L3, 'tracking', 'LP00123456791')); assert.equal((await get(L3)).cells.courier, 'Cainiao', 'learned after two orders');
  ok(await put(L4, 'tracking', 'XX1')); assert.equal((await get(L4)).cells.courier, '', 'unknown format: left for the supplier');
  const A = await mk('Q-ADMIN'); ok(await call('/orders/' + A, 'PUT', { trackingNumber: 'UL706844452YP' }, admin));
  assert.equal(ok(await call('/admin/orders', 'GET', null, admin)).orders.find(o => o.id === A).courier, 'Yanwen', 'admin: the courier from the tracking number too');
  console.log('PASS courier from the tracking number (Yanwen, China Post, learned), never overwritten; supplier adds a courier; admin too'); }
