// Check: supplier portal phase 3 (docs/supplier-portal.md): product quotes and price requests in the portal.
//   node checks/check-supplier-requests.mjs      (run from the repo root)
// Answers work exactly like the same answers in the supplier sheet (Product Quotes cells, a new Total cost or NO: reason),
// and no answer ever holds the client's price, our fee or the client price of a price option.
import assert from 'node:assert/strict';
import { DB, call, seed } from './lib.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png };
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const { admin, client, id } = await seed();
const FEE = 0.37;
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE, name: 'Juniper & Co.' }, admin));
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const pRow = pid => DB.prepare('SELECT * FROM portal_products WHERE id = ?').bind(pid).first();
const oRow = oid => DB.prepare('SELECT * FROM client_orders WHERE id = ?').bind(oid).first();
const seen = [];
const sget = async p => { const d = ok(await call(p, 'GET', null, sup)); seen.push(JSON.stringify(d)); return d; };

// ---------- product quotes ----------
const P1 = ok(await call('/products', 'POST', { link: 'https://example.com/lamp', name: 'Ceramic lamp', variant: 'Sand / EU plug', expectedQuantity: 20, photos: [photo] }, client)).product.id;
const P2 = ok(await call('/products', 'POST', { link: 'https://example.com/apron', name: 'Linen apron', photos: [photo] }, client)).product.id;
const P3 = ok(await call('/products', 'POST', { link: 'https://example.com/mug', name: 'Enamel mug', photos: [photo] }, client)).product.id;
assert.ok([401, 403, 404].includes((await call('/supplier/quotes', 'GET', null, client)).status), 'clients get no quotes list');
let q = await sget('/supplier/quotes');
assert.deepEqual(q.toAnswer.map(p => p.id), [P1, P2, P3]);
assert.equal(q.toAnswer[0].name, 'Ceramic lamp'); assert.equal(q.toAnswer[0].photos.length, 1); assert.match(q.toAnswer[0].photos[0], /^\/api\/portal\/sheet-product-photos\//);
const putQ = (pid, body) => call('/supplier/quotes/' + pid, 'PUT', body, sup);
assert.equal((await putQ(P1, { price: 'cheap', shipping: '', available: true })).status, 400, 'price must be clear');
assert.equal((await putQ(P1, { available: false })).status, 400, 'not available needs a reason');
ok(await putQ(P1, { price: '3.20', shipping: '4.50', available: true, note: 'Ships in 3 days' }));
let p = await pRow(P1);
assert.deepEqual([p.status, Number(p.supplier_price), Math.round(Number(p.unit_price) * 100) / 100, Number(p.supplier_shipping)], ['approved', 3.2, 3.57, 4.5], 'quoted: client price = 3.20 + our fee');
ok(await putQ(P2, { price: 'Small: 3.20\nLarge: 4.50', shipping: '', available: true }));
assert.match((await pRow(P2)).price_options, /Large/);
ok(await putQ(P3, { available: false, note: 'Out of production' }));
assert.equal((await pRow(P3)).status, 'not_available');
q = await sget('/supplier/quotes');
assert.deepEqual(q.toAnswer, []); assert.deepEqual(q.answered.map(x => x.id).sort(), [P1, P2, P3].sort());
assert.equal(q.answered.find(x => x.id === P2).answer.price, 'Small: 3.20\nLarge: 4.50', 'options: the supplier’s own prices');
const cp = ok(await call('/products', 'GET', null, client)).products.find(x => x.id === P1);
assert.equal(Math.round(cp.unitPrice * 100) / 100, 3.57, 'the client sees the quote');
console.log('PASS product quotes: answered in the portal like the sheet (one price, options, not available), the client gets the price with our fee');

// ---------- price requests ----------
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async (ref, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Walnut stand', buyerName: 'B', address1: '1 St', destination: 'US', etsyUrl: 'https://example.com/' + ref, photos: [photo] }, client)).order.id;
  await DB.prepare('UPDATE client_orders SET supplier_cost = ?, product_cost = ?, shipping_fee = NULL, price = ? WHERE id = ?').bind(cost, cost + FEE, cost + FEE, o).run();
  ok(await call('/orders/' + o + '/cost-revision', 'POST', { competitorPrice: 18 }, client));
  return o;
};
const A = await mk('PR-A', 20), B = await mk('PR-B', 20), C = await mk('PR-C', 20);
ok(await call('/products/' + P1 + '/cost-revision', 'POST', { competitorPrice: 3 }, client));
let r = await sget('/supplier/price-requests');
assert.deepEqual(r.toAnswer.map(x => x.kind + x.id), ['order' + A, 'order' + B, 'order' + C, 'product' + P1]);
const ra = r.toAnswer[0];
assert.deepEqual([ra.costNow, ra.competitor, ra.ref], [20, '$18.00', 'PR-A']);
const answer = (kind, oid, body) => call(`/supplier/price-requests/${kind}/${oid}`, 'POST', body, sup);
assert.equal((await answer('order', A, { action: 'accept', cost: 'x' })).status, 400);
assert.equal((await answer('order', A, { action: 'keep' })).status, 400, 'keep needs a reason');
assert.deepEqual(ok(await answer('order', A, { action: 'accept', cost: '17' })).done, true, 'lower: approved by itself');
let o = await oRow(A); assert.deepEqual([o.revision_status, Number(o.supplier_cost), Math.round(Number(o.price) * 100) / 100], ['', 17, 17.37]);
assert.ok(await DB.prepare("SELECT 1 AS x FROM order_events WHERE order_id = ? AND kind = 'revision_answered'").bind(A).first(), 'the client is told');
assert.equal(ok(await answer('order', B, { action: 'accept', cost: '25' })).waiting, true, 'higher: waits for Direct Line');
assert.equal((await oRow(B)).revision_status, 'offered');
ok(await answer('order', C, { action: 'keep', reason: 'Factory price went up' }));
o = await oRow(C); assert.deepEqual([o.revision_status, Math.round(Number(o.price) * 100) / 100], ['', 20.37]); assert.match(o.revision_done, /cost kept: Factory price went up/);
assert.equal((await answer('order', C, { action: 'keep', reason: 'again' })).status, 409, 'already answered');
assert.equal((await answer('product', P1, { action: 'accept', price: '3.20' })).status, 400, 'same price: use Keep');
ok(await answer('product', P1, { action: 'accept', price: '2.90' }));
p = await pRow(P1); assert.deepEqual([p.revision_status, Number(p.supplier_price), Math.round(Number(p.unit_price) * 100) / 100], ['', 2.9, 3.27]);
r = await sget('/supplier/price-requests');
assert.deepEqual(r.toAnswer, []); assert.deepEqual(r.waiting.map(x => [x.id, x.offered]), [[B, 25]]);
assert.deepEqual(r.answered.map(x => x.kind + x.id).sort(), ['order' + A, 'order' + C, 'product' + P1].sort());
assert.equal(r.answered.find(x => x.kind === 'order' && x.id === A).newCost, 17);
const al = ok(await call('/supplier/alerts', 'GET', null, sup)); assert.deepEqual([al.quotes, al.requests], [0, 0]);
console.log('PASS price requests: accept (lower = approved, higher = waits), keep with a reason, products re-quoted; the client is told');

// Nothing about our fee or client prices.
const text = seen.join('\n');
for (const n of ['3.57', '3.27', '17.37', '20.37', '0.37', '"unit"']) assert.ok(!text.includes(n), 'answers hold ' + n);
const forbidden = /^(unitPrice|unit_price|unit|oldPrice|old_price|newPrice|new_price|price_options|commission|commission_per_order|clientPrice|note_from_client)$/;
const walk = v => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!forbidden.test(k), 'key ' + k); walk(x); } };
for (const s of seen) walk(JSON.parse(s));
console.log('PASS no client price, fee or option client price in any quote or price request answer');
