// Check: receipts made in the supplier portal (Erwin, 16 Nov 2026: "supplier make the invoice -> submit to us admins ->
// admins approved -> will be sent to client concerned"). The portal makes the PDF, one per client payment.
//   node checks/check-supplier-receipts.mjs      (run from the repo root)
// The supplier only ever sees its own part: never the client's amount, our fee or the client's billing details.
import assert from 'node:assert/strict';
import { DB, call, seed, pg, env } from './lib.mjs';
import { route } from '../api/index.mjs';
import { visualRuns } from '../server/supplier-receipts.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const { admin, client, id } = await seed();
const FEE = 0.37;
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE, name: 'יהודה וקנין(Yehuda Vaknin)' }, admin));
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const setCost = (oid, cost) => DB.prepare('UPDATE client_orders SET supplier_cost = ?, product_cost = ?, shipping_fee = NULL, price = ? WHERE id = ?').bind(cost, cost + FEE, cost + FEE, oid).run();
const mk = async (ref, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Brass lamp', variant: 'Gold', buyerName: 'Sample', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order;
  await setCost(o.id, cost); return o.id;
};
const A = await mk('RC-A', 20), B = await mk('RC-B', 30);
const amount = Math.round((20 + 30 + 2 * FEE) * 100) / 100; // 50.74, the client's amount: never shown to the supplier
const pay = ok(await call('/admin/payments', 'POST', { clientId: id, amount, paidAt: '2026-11-05', orderIds: [A, B] }, admin));
const paymentId = pay.payment?.id ?? pay.id;
ok(await call('/admin/users', 'POST', { username: 'sup-rc', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-rc', password: 'supplierpass1' })).cookie;

// 1. Supplier: the payment is listed to make a receipt, with only the supplier's part.
let list = ok(await call('/supplier/receipts', 'GET', null, sup));
const row = list.toMake.find(x => x.paymentId === paymentId);
assert.ok(row, 'payment to make a receipt for ' + JSON.stringify(list));
assert.equal(row.yourPart, 50, 'the supplier part (20 + 30)');
assert.deepEqual(row.orders.map(o => o.ref).sort(), ['RC-A', 'RC-B']);
const leak = t => { for (const n of ['50.74', '20.37', '30.37', '0.37', 'Sample Billing', 'billing@example.com', '+972']) assert.ok(!t.includes(n), 'supplier answer holds ' + n); };
leak(JSON.stringify(list));
assert.ok([401, 403, 404].includes((await call('/admin/receipts', 'GET', null, sup)).status), 'a supplier gets no admin receipts');
assert.ok([401, 403, 404].includes((await call('/supplier/receipts', 'GET', null, client)).status), 'a client gets no supplier receipts');

// 2. Submit; it waits for Direct Line, and can't be sent twice.
list = ok(await call('/supplier/receipts', 'POST', { paymentId, note: 'Paid by bank transfer' }, sup));
assert.equal(list.waiting.length, 1); assert.equal(list.toMake.length, 0); leak(JSON.stringify(list));
assert.equal((await call('/supplier/receipts', 'POST', { paymentId }, sup)).status, 409);

// 3. Admin: sees it with the client's amount, previews the PDF.
let ad = ok(await call('/admin/receipts', 'GET', null, admin)).receipts;
const rec = ad.find(x => x.paymentId === paymentId);
assert.equal(rec.status, 'submitted'); assert.equal(rec.amount, amount); assert.equal(rec.submittedBy, 'Ada'); assert.match(rec.number, /^R-\d{4}-\d{4}$/);
const pdf = await route(new Request('http://localhost/api/portal/admin/receipts/' + rec.id + '/preview.pdf', { headers: { cookie: admin } }), { db: DB, env });
assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');

// 4. Send back with a reason: the supplier sees why, fixes and sends again.
assert.equal((await call('/admin/receipts/' + rec.id + '/reject', 'POST', {}, admin)).status, 400, 'a reason is needed');
ok(await call('/admin/receipts/' + rec.id + '/reject', 'POST', { reason: 'Add the bank reference in the note' }, admin));
list = ok(await call('/supplier/receipts', 'GET', null, sup));
assert.equal(list.toMake[0].status, 'rejected'); assert.equal(list.toMake[0].reason, 'Add the bank reference in the note');
assert.equal(ok(await call('/supplier/alerts', 'GET', null, sup)).receiptsSentBack, 1, 'the bell counts it');
ok(await call('/supplier/receipts', 'POST', { paymentId, note: 'Bank transfer ref 4471' }, sup));

// 5. Approve: needs the client's billing details; then the client gets the PDF (Payments + bell).
assert.equal((await call('/admin/receipts/' + rec.id + '/approve', 'POST', {}, admin)).status, 409, 'no billing details yet');
ok(await call('/billing', 'PUT', { name: 'Sample Billing', company: 'Sample Co', address: '1 Sample St\nTel Aviv', email: 'billing@example.com', phone: '+972 50 000 0000' }, client));
ok(await call('/admin/receipts/' + rec.id + '/approve', 'POST', {}, admin));
assert.equal((await call('/admin/receipts/' + rec.id + '/approve', 'POST', {}, admin)).status, 409, 'approved once');
const pays = ok(await call('/payments', 'GET', null, client));
const file = (pays.invoices || []).find(f => f.paymentId === paymentId);
assert.ok(file, 'the client has the receipt for this payment ' + JSON.stringify(pays.invoices));
assert.deepEqual(file.orderIds.sort((a, b) => a - b), [A, B].sort((a, b) => a - b), 'linked to the orders it paid');
const stored = await DB.prepare('SELECT mime, content FROM portal_files WHERE id = ?').bind(file.id).first();
assert.equal(stored.mime, 'application/pdf');
const bytes = Buffer.from(stored.content, 'base64');
assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); if (process.env.RECEIPT_OUT) (await import('node:fs')).writeFileSync(process.env.RECEIPT_OUT, bytes); assert.ok(bytes.length > 2000 && bytes.length < 400000, 'a real, small PDF: ' + bytes.length);
list = ok(await call('/supplier/receipts', 'GET', null, sup));
assert.equal(list.sent.length, 1); assert.equal(list.waiting.length, 0); leak(JSON.stringify(list));
assert.equal(ok(await call('/supplier/alerts', 'GET', null, sup)).receiptsSentBack, 0);

// 6. A payment that already has a receipt uploaded by an admin is not offered to the supplier.
const C = await mk('RC-C', 12);
const pay2 = ok(await call('/admin/payments', 'POST', { clientId: id, amount: 12.37, paidAt: '2026-11-06', orderIds: [C] }, admin)), p2 = pay2.payment?.id ?? pay2.id;
ok(await call('/admin/invoices', 'POST', { clientId: id, paymentId: p2, date: '2026-11-06', file: { filename: 'r.png', data: 'data:image/png;base64,' + png } }, admin));
assert.ok(!ok(await call('/supplier/receipts', 'GET', null, sup)).toMake.some(x => x.paymentId === p2), 'already has an uploaded receipt');

// 7. Hebrew names are drawn right to left.
assert.deepEqual(visualRuns('יהודה וקנין').map(r => r.text), ['וקנין', ' ', 'יהודה'], 'Hebrew words right to left, letters as typed');
assert.deepEqual(visualRuns('Payment date · תאריך תשלום').map(r => r.text), ['Payment date · ', 'תשלום', ' ', 'תאריך']);
assert.deepEqual(visualRuns('Sample Co').map(r => r.text), ['Sample Co']);
// Issuer name on the receipt: owners set it in Fees & settings.
ok(await call('/admin/receipt-issuer', 'POST', { name: 'Beyond Trading', details: 'Shenzhen' }, admin));
assert.equal(ok(await call('/admin/receipt-issuer', 'GET', null, admin)).name, 'Beyond Trading');
console.log('PASS supplier receipts: supplier submits (own part only), admin previews / sends back / approves, the client gets the PDF linked to the payment');
await pg.close();
