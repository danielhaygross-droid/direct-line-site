// Check: email alerts to the supplier (Erwin, 16 Nov 2026): new orders, cancel requests, quotes / price requests and receipts
// sent back, as one summary email at most every 30 minutes. A fake email service records what would be sent.
//   node checks/check-supplier-alerts.mjs      (run from the repo root)
import assert from 'node:assert/strict';
import { DB, call, seed, pg, env } from './lib.mjs';
import { route } from '../api/index.mjs';
import { runSupplierAlerts, alertEmail, EVERY } from '../server/supplier-alerts.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const { admin, client, id } = await seed();
const FEE = 0.37;
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE }, admin));
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async ref => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Brass lamp', variant: 'Gold', buyerName: 'Jane Buyer', buyerPhone: '+1 555 0100', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order;
const sent = [];
const fakeFetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body), headers: init.headers }); return new Response('{}', { status: 201 }); };
const mail = { ...env, BREVO_API_KEY: 'test-key', ALERT_FROM_EMAIL: 'alerts@example.com' };
let t = 1_800_000_000;

// Not connected: nothing happens.
assert.deepEqual(await runSupplierAlerts(DB, env, { fetchImpl: fakeFetch, t }), { ok: true, configured: false });

// A supplier login with an email (set by an admin), and one order already waiting before alerts start.
const supId = ok(await call('/admin/users', 'POST', { username: 'sup-al', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin)).id;
assert.equal((await call('/admin/users/' + supId, 'POST', { alertEmail: 'not-an-email' }, admin)).status, 400);
ok(await call('/admin/users/' + supId, 'POST', { alertEmail: 'Ada@Example.com' }, admin));
assert.equal(ok(await call('/admin/overview', 'GET', null, admin)).suppliers.find(s => s.id === supId).alertEmail, 'ada@example.com');
const old = await mk('AL-OLD');

// First run: only records what was already waiting, no email.
let r = await runSupplierAlerts(DB, mail, { fetchImpl: fakeFetch, t });
assert.equal(r.started, true); assert.equal(sent.length, 0, 'no email about old orders');

// New order + a cancel request: one summary email to the supplier, no prices, no client contact details.
const o1 = await mk('AL-1'), o2 = await mk('AL-2');
ok(await call('/orders/' + old.id + '/request-cancellation', 'POST', { reason: 'Changed mind' }, client));
t += 300; r = await runSupplierAlerts(DB, mail, { fetchImpl: fakeFetch, t });
assert.equal(r.sent, 1); assert.equal(sent.length, 1);
const e1 = sent[0];
assert.equal(e1.url, 'https://api.brevo.com/v3/smtp/email'); assert.equal(e1.headers['api-key'], 'test-key');
assert.deepEqual(e1.body.to, [{ email: 'ada@example.com' }]); assert.equal(e1.body.sender.email, 'alerts@example.com');
assert.match(e1.body.subject, /2 new orders, 1 cancel request/); assert.match(e1.body.subject, /2 新订单/);
assert.match(e1.body.textContent, /AL-1 · Brass lamp · Gold/); assert.match(e1.body.textContent, /AL-OLD/);
assert.match(e1.body.htmlContent, /\/supplier\//);
for (const leak of ['0.37', 'Jane Buyer', '555 0100', '1 Sample St', 'localclient']) assert.ok(!JSON.stringify(e1.body).includes(leak), 'email holds ' + leak);

// Nothing new: no email. Something new within 30 minutes: waits, then one email after 30 minutes.
t += 300; r = await runSupplierAlerts(DB, mail, { fetchImpl: fakeFetch, t }); assert.equal(sent.length, 1, 'nothing new');
const o3 = await mk('AL-3');
t += 300; r = await runSupplierAlerts(DB, mail, { fetchImpl: fakeFetch, t }); assert.equal(sent.length, 1, 'within 30 minutes: waits'); assert.equal(r.waiting, 1);
t += EVERY; r = await runSupplierAlerts(DB, mail, { fetchImpl: fakeFetch, t }); assert.equal(sent.length, 2);
assert.match(sent[1].body.subject, /^Direct Line: 1 new order ·/); assert.ok(!sent[1].body.textContent.includes('AL-1'), 'only what is new');

// An order bought before the email goes out is not announced. Alerts off: nothing.
const o4 = await mk('AL-4');
await DB.prepare('UPDATE client_orders SET bought_at = ? WHERE id = ?').bind(t, o4.id).run();
t += EVERY; r = await runSupplierAlerts(DB, mail, { fetchImpl: fakeFetch, t }); assert.equal(sent.length, 2, 'already bought: not news');
const sup = (await call('/login', 'POST', { username: 'sup-al', password: 'supplierpass1' })).cookie;
assert.deepEqual(ok(await call('/supplier/email-alerts', 'GET', null, sup)), { ok: true, email: 'ada@example.com', on: true, connected: false });
ok(await call('/supplier/email-alerts', 'PUT', { email: 'ada@example.com', on: false }, sup));
await mk('AL-5'); t += EVERY; await runSupplierAlerts(DB, mail, { fetchImpl: fakeFetch, t }); assert.equal(sent.length, 2, 'alerts off');
assert.equal((await call('/supplier/email-alerts', 'PUT', { email: 'bad@', on: true }, sup)).status, 400);
assert.equal((await call('/supplier/email-alerts/test', 'POST', {}, sup)).status, 409, 'test: not connected (no key in this env)');
assert.equal((await call('/supplier/email-alerts', 'GET', null, admin)).status, 403, 'admin view: each supplier sets its own');

// Status for the admin; the cron needs its secret.
const st = ok(await call('/admin/supplier-alerts', 'GET', null, admin));
assert.equal(st.configured, false); assert.deepEqual(st.suppliers.map(s => s.email), ['ada@example.com']);
assert.equal((await route(new Request('http://x/api/cron/supplier-alerts'), { db: DB, env })).status, 401);
// Long lists are cut at 30 per kind.
const many = alertEmail(Array.from({ length: 35 }, (_, i) => ({ kind: 'order', label: 'O' + i })), 'https://x/supplier/');
assert.match(many.text, /\+ 5 more/);
console.log('PASS supplier email alerts: first run quiet, one summary per 30 minutes, only what is new and still waiting, no prices or client details, off switch');
await pg.close();
