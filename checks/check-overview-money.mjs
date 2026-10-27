// Check: the admin Overview shows all clients' cancelled-order money and a "Money by month" chart (Erwin, 27 Oct 2026).
// Two clients with orders, payments, a cancellation with a fee and a refund; the API totals add up over the clients,
// the chart has the right month values, its range and line switches work, and a client row opens that client's
// Payments. Screenshots EN/HE at 1440 and 390 px.
//   node checks/check-overview-money.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real screens in Chrome. No live data.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { pg, DB, env, call, seed } from './lib.mjs';
import { route } from '../api/index.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'overview-money');
await mkdir(out, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/test-admin.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=light><body style=margin:0><iframe name=admin src="/admin/?lang=${url.searchParams.get('lang') || 'en'}" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
  if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const resp = await route(new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) }), { db: DB, env });
      res.writeHead(resp.status, Object.fromEntries(resp.headers)); res.end(Buffer.from(await resp.arrayBuffer())); return;
    }
    const file = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const data = await readFile(path.join(root, file));
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'" });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const mk = async (who, st, ref, cost, date) => { const o = ok(await call('/orders', 'POST', { storeId: st.id, orderRef: ref, orderDate: date, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, who)).order; ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return (await call('/orders', 'GET', null, who)).data.orders.find(x => x.id === o.id); };
const A = await mk(client, store, 'ONE-1', 20, '2026-09-10'), B = await mk(client, store, 'ONE-2', 30, '2026-10-05'), C = await mk(client, store, 'ONE-3', 15, '2026-10-06');
ok(await call('/admin/payments', 'POST', { clientId: id, amount: A.price + B.price, paidAt: '2026-10-20', method: 'Bank transfer', orderIds: [A.id, B.id] }, admin));
await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=5 WHERE id=?').bind(B.id).run();
ok(await call('/orders/' + B.id + '/request-cancellation', 'POST', { reason: 'Store suspended' }, client)); ok(await call('/orders/' + B.id + '/approve-cancellation', 'POST', {}, admin));
ok(await call('/admin/refunds', 'POST', { clientId: id, amount: 10, date: '2026-10-27', method: 'Bank transfer' }, admin));
// A second client with one cancelled paid order.
const made = ok(await call('/admin/users', 'POST', { username: 'secondclient', name: 'Second Client', password: 'clientpass123', role: 'client' }, admin));
const two = { id: made.id, client: (await call('/login', 'POST', { username: 'secondclient', password: 'clientpass123' })).cookie };
{ const t = ok(await call('/terms', 'GET', null, two.client)); ok(await call('/terms/accept', 'POST', { version: t.policy.version, accepted: true }, two.client)); }
const store2 = ok(await call('/client-stores', 'GET', null, two.client)).stores[0];
const E = await mk(two.client, store2, 'TWO-1', 40, '2026-10-08');
ok(await call('/admin/payments', 'POST', { clientId: two.id, amount: E.price, paidAt: '2026-10-21', method: 'Bank transfer', orderIds: [E.id] }, admin));
ok(await call('/orders/' + E.id + '/request-cancellation', 'POST', { reason: 'Changed mind' }, two.client)); ok(await call('/orders/' + E.id + '/approve-cancellation', 'POST', {}, admin));

const ov = ok(await call('/admin/overview', 'GET', null, admin)), cx = ov.cancelled;
const one = ok(await call('/admin/payments?clientId=' + id, 'GET', null, admin)).cancelled, other = ok(await call('/admin/payments?clientId=' + two.id, 'GET', null, admin)).cancelled;
for (const k of ['count', 'paid', 'fees', 'dueBack', 'refunded', 'credit']) assert.equal(cx[k], Math.round((one[k] + other[k]) * 100) / 100, 'total ' + k + ' = sum of the clients');
assert.equal(cx.count, 2); assert.equal(cx.clients.length, 2);
const m = k => ov.months.find(r => r.month === k) || {};
assert.equal(m('2026-09').billed, A.price); assert.equal(m('2026-10').billed, C.price, 'October billed: cancelled B and E not counted');
assert.equal(m('2026-10').paid, Math.round((A.price + B.price + E.price) * 100) / 100); assert.equal(m('2026-10').fees, 5); assert.equal(m('2026-10').refunds, 10);
assert.equal(m('2026-10').cancelled, 2); assert.ok(m('2026-09').earned > 0, 'our earnings');
console.log('PASS overview API: cancelled totals = sum of clients; months: billed, paid, fees, refunds, earned');
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=overview]');
    await ui.locator('[data-tab=overview]').click(); await ui.waitForSelector('[data-money-chart] .mc-svg'); await page.waitForTimeout(400);
    await ui.locator('[data-money-chart]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-chart.png`) });
    assert.equal(await ui.locator('[data-mc-key]').count(), 6, tag);
    await ui.locator('[data-mc-key="billed"]').click(); assert.equal(await ui.locator('[data-mc-key="billed"].off').count(), 1, tag + ' line off');
    await ui.locator('[data-mc-key="billed"]').click(); await ui.locator('[data-mc-range="6"]').click(); assert.equal(await ui.locator('[data-mc-range="6"].on').count(), 1, tag + ' range');
    await ui.locator('[data-ovw-cancelled]').scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, `${tag}-cancelled.png`) });
    assert.equal(await ui.locator('[data-ovw-cancelled] tbody tr').count(), 2, tag);
    assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    await ui.locator(`[data-ovw-cancelled] [data-open-client="${id}"]`).click(); await ui.waitForSelector('[data-cancelled-box]');
    assert.equal(await ui.locator('.subtabs [data-ctab=payments].on').count(), 1, tag + ' opens the client on Payments');
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
