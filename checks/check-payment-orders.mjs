// Check: which orders a payment is for (Erwin, 21 Oct 2026) and the client's billing details for receipts (Ada).
//   node checks/check-payment-orders.mjs      (run from the repo root)
// Links never change the balance; an order is paid while it is on a payment that is not archived; nothing is
// saved when a choice is refused; a transfer confirmation keeps the client's ticked orders for the admin.
import assert from 'node:assert/strict';
import { DB, pg, call, seed } from './lib.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
try {
  const { admin, client, id } = await seed();
  const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
  const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
  const mk = async (ref, cost) => {
    const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Sample', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order;
    if (cost != null) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin));
    return o.id;
  };
  const A = await mk('A-1', 20), B = await mk('B-2', 25), C = await mk('C-3', 30), D = await mk('D-4', null), E = await mk('E-5', 10), F = await mk('F-6', 10);
  ok(await call('/orders/' + E, 'PUT', { status: 'cancelled' }, admin)); ok(await call('/orders/' + F, 'PUT', { status: 'cancelled' }, admin));
  await DB.prepare("INSERT INTO client_balance_adjustments (client_id, order_id, kind, amount, note, created_at) VALUES (?,?,'cancellation_fee',4,'Cancellation fee',1)").bind(id, E).run();
  const orders = async () => Object.fromEntries(ok(await call('/orders', 'GET', null, client)).orders.map(o => [o.orderRef, o]));
  const paidBy = async () => Object.fromEntries(Object.entries(await orders()).map(([k, o]) => [k, o.paymentId]));
  const count = async () => Number((await DB.prepare('SELECT COUNT(*) AS n FROM client_payments').first()).n);
  const summary = async () => ok(await call('/me', 'GET', null, client)).summary;
  const o0 = await orders();
  assert.deepEqual([o0['A-1'].price, o0['B-2'].price, o0['C-3'].price, o0['D-4'].price], [20, 25, 30, 0], 'price = the cost the admin entered');
  assert.ok(Object.values(o0).every(o => o.paymentId === null), 'nothing paid yet');
  const billed = (await summary()).billed; assert.equal(billed, 20 + 25 + 30 + 4, 'billed: A + B + C + cancellation fee on E');

  // Record a payment for A and B.
  const p1 = ok(await call('/admin/payments', 'POST', { clientId: id, amount: 49, paidAt: '2026-10-20', method: 'Bank transfer', orderIds: [A, B] }, admin)).id;
  let pb = await paidBy(); assert.equal(pb['A-1'], p1); assert.equal(pb['B-2'], p1); assert.equal(pb['C-3'], null);
  assert.equal((await orders())['A-1'].paidAt, Math.floor(Date.parse('2026-10-20T12:00:00Z') / 1000), 'paid date = payment date');
  let s = await summary(); assert.equal(s.paid, 49); assert.equal(s.outstanding, billed - 49, 'the balance is billed - paid, links do not change it');

  // Refused choices save nothing.
  const n = await count();
  for (const [body, why] of [[{ orderIds: [A] }, 'already paid'], [{ orderIds: [D] }, 'nothing billed yet'], [{ orderIds: [F] }, 'cancelled, no fee'], [{ orderIds: ['x'] }, 'not an id'], [{ orderIds: 'A' }, 'not a list'], [{ orderIds: [999999] }, 'unknown order']]) {
    const r = await call('/admin/payments', 'POST', { clientId: id, amount: 10, ...body }, admin);
    assert.equal(r.status, 400, why); assert.equal(await count(), n, why + ': no payment saved');
  }
  assert.match((await call('/admin/payments', 'POST', { clientId: id, amount: 10, orderIds: [A] }, admin)).data.error, /A-1 is already paid/);
  assert.match((await call('/admin/payments', 'POST', { clientId: id, amount: 10, orderIds: [D] }, admin)).data.error, /D-4 has nothing billed yet/);
  // Another client's order can't be linked.
  ok(await call('/admin/users', 'POST', { username: 'otherclient', password: 'other-pass-123', role: 'client', name: 'Other' }, admin));
  const other = (await call('/login', 'POST', { username: 'otherclient', password: 'other-pass-123' })).cookie; await call('/terms/accept', 'POST', { version: 1, accepted: true }, other);
  const otherId = Number((await DB.prepare("SELECT id FROM users WHERE username='otherclient'").first()).id);
  assert.equal((await call('/admin/payments', 'POST', { clientId: otherId, amount: 5, orderIds: [C] }, admin)).status, 400, 'orders of another client');
  // A cancelled order with a cancellation fee can be paid (it is on the bill).
  const pE = ok(await call('/admin/payments', 'POST', { clientId: id, amount: 4, orderIds: [E] }, admin)).id;
  assert.equal((await paidBy())['E-5'], pE);

  // Edit: take B off p1; the change is kept in payment_edits. An edit without orderIds keeps the links.
  const ed = ok(await call('/admin/payments/' + p1, 'POST', { orderIds: [A] }, admin)); assert.deepEqual(ed.changed, ['orders']);
  pb = await paidBy(); assert.equal(pb['A-1'], p1); assert.equal(pb['B-2'], null);
  const log = await DB.prepare("SELECT old_value, new_value FROM payment_edits WHERE payment_id=? AND field='orders'").bind(p1).first();
  assert.deepEqual([log.old_value, log.new_value], ['A-1, B-2', 'A-1']);
  ok(await call('/admin/payments/' + p1, 'POST', { amount: 50 }, admin)); assert.equal((await paidBy())['A-1'], p1, 'links kept');
  assert.equal((await call('/admin/payments/' + p1, 'POST', { amount: 51, orderIds: [D] }, admin)).status, 400);
  assert.equal(Number((await DB.prepare('SELECT amount FROM client_payments WHERE id=?').bind(p1).first()).amount), 50, 'a refused edit changes nothing');
  let pays = ok(await call('/admin/payments?clientId=' + id, 'GET', null, admin)).payments;
  assert.deepEqual(pays.find(p => p.id === p1).orderIds, [A]);

  // Archive p1: A is not paid any more. A new payment takes A. Restoring p1 takes A off p1 (no double payment).
  ok(await call('/admin/payments/' + p1 + '/delete', 'POST', {}, admin)); assert.equal((await paidBy())['A-1'], null, 'archived payments do not count');
  const p2 = ok(await call('/admin/payments', 'POST', { clientId: id, amount: 20, orderIds: [A] }, admin)).id;
  const rs = ok(await call('/admin/payments/' + p1 + '/restore', 'POST', {}, admin)); assert.equal(rs.dropped, 1);
  assert.equal((await paidBy())['A-1'], p2); assert.deepEqual(ok(await call('/admin/payments?clientId=' + id, 'GET', null, admin)).payments.find(p => p.id === p1).orderIds, []);
  s = await summary(); assert.equal(s.paid, 50 + 4 + 20, 'every active payment counts in full');

  // Transfer confirmations: the client ticks orders; the admin records them (or changes them).
  const file = { filename: 'receipt.png', data: 'data:image/png;base64,' + png };
  assert.equal((await call('/transfers', 'POST', { amount: 59, date: '2026-10-21', file, orderIds: [A] }, client)).status, 400, 'client: already paid');
  assert.equal((await call('/transfers', 'POST', { amount: 59, date: '2026-10-21', file, orderIds: [D] }, client)).status, 400, 'client: nothing billed');
  const t1 = ok(await call('/transfers', 'POST', { amount: 59, date: '2026-10-21', file, orderIds: [B, C] }, client)).transfer;
  assert.deepEqual(t1.orderIds, [B, C]); assert.deepEqual(ok(await call('/admin/transfers?clientId=' + id, 'GET', null, admin)).transfers[0].orderIds, [B, C]);
  assert.equal((await call('/transfers', 'POST', { amount: 1, date: '2026-10-21', file, orderIds: [B] }, other)).status, 400, 'another client cannot tick these orders');
  const r1 = ok(await call('/admin/transfers/' + t1.id + '/record', 'POST', {}, admin)).transfer;
  pb = await paidBy(); assert.equal(pb['B-2'], r1.paymentId); assert.equal(pb['C-3'], r1.paymentId, 'the client’s ticked orders are used');
  // Recording again changes nothing (credited once).
  ok(await call('/admin/transfers/' + t1.id + '/record', 'POST', { orderIds: [] }, admin)); assert.equal((await paidBy())['B-2'], r1.paymentId);
  // The admin corrects the amount (bank fee) and chooses no orders; a refused choice records nothing.
  const t2 = ok(await call('/transfers', 'POST', { amount: 30, date: '2026-10-21', file: { ...file, filename: 'second.png' }, orderIds: [] }, client)).transfer;
  const before = await count();
  assert.equal((await call('/admin/transfers/' + t2.id + '/record', 'POST', { orderIds: [D] }, admin)).status, 400); assert.equal(await count(), before, 'nothing recorded');
  assert.equal((await call('/admin/transfers/' + t2.id + '/record', 'POST', { amount: 0 }, admin)).status, 400);
  const r2 = ok(await call('/admin/transfers/' + t2.id + '/record', 'POST', { amount: 29.5, paidAt: '2026-10-22', orderIds: [] }, admin)).transfer;
  const row2 = await DB.prepare('SELECT amount, paid_at, note FROM client_payments WHERE id=?').bind(r2.paymentId).first();
  assert.equal(Number(row2.amount), 29.5); assert.equal(Number(row2.paid_at), Math.floor(Date.parse('2026-10-22T12:00:00Z') / 1000)); assert.equal(row2.note, 'Transfer confirmation #' + t2.id);
  // Client view: payments say which orders they were for; the other client sees none of it.
  const mine = ok(await call('/payments', 'GET', null, client));
  assert.deepEqual(mine.payments.find(p => p.id === r1.paymentId).orderIds, [B, C]);
  assert.deepEqual(ok(await call('/payments', 'GET', null, other)).payments, []);
  assert.ok(Object.values(Object.fromEntries((ok(await call('/orders', 'GET', null, other)).orders).map(o => [o.id, o]))).length === 0);

  // Billing details for receipts.
  assert.equal(mine.billing, null);
  for (const [body, re] of [[{ address: '1 St', email: 'a@b.co' }, /name/], [{ name: 'Yael', email: 'a@b.co' }, /address/], [{ name: 'Yael', address: '1 St' }, /email or a phone/], [{ name: 'Yael', address: '1 St', email: 'not-an-email' }, /email/], [{ name: 'Yael', address: '1 St', phone: 'call me' }, /phone/]]) {
    const r = await call('/billing', 'PUT', body, client); assert.equal(r.status, 400); assert.match(r.data.error, re);
  }
  const saved = ok(await call('/billing', 'PUT', { name: '  Sample   Person ', company: 'Sample Shop Ltd', address: '1 Sample Street\r\n\r\n  Tel Aviv  \n', email: 'billing@example.com', phone: '+972 50-000-0000' }, client)).billing;
  assert.deepEqual([saved.name, saved.company, saved.address, saved.updatedBy], ['Sample Person', 'Sample Shop Ltd', '1 Sample Street\nTel Aviv', 'client'], 'tidied');
  assert.equal(ok(await call('/admin/payments?clientId=' + id, 'GET', null, admin)).billing.email, 'billing@example.com', 'admin sees it');
  assert.equal(ok(await call('/payments', 'GET', null, other)).billing, null, 'other clients do not');
  assert.notEqual((await call('/billing', 'PUT', { name: 'X', address: 'Y', email: 'x@y.co' }, admin, { 'x-dl-view-as': String(id) })).status, 200, 'admin preview cannot save');
  const byAdmin = ok(await call('/admin/billing/' + id, 'POST', { ...saved, phone: '' }, admin)).billing; assert.equal(byAdmin.updatedBy, 'admin'); assert.equal(byAdmin.phone, '');
  assert.equal((await call('/admin/billing/' + id, 'POST', { name: 'X' }, client)).status, 403, 'clients cannot use the admin route');
  console.log('PASS payment orders: link, refuse without saving, edit + history, archive/restore without double payment, transfer ticks, amount correction, client view; billing details: checks, tidy, admin view and edit, privacy');
} finally { await pg.close(); }
