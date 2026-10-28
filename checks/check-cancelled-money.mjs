// Money on cancelled orders, the same for admin and client (Erwin, 27 Oct 2026): what was paid for them, the cancellation
// fees, what goes back, refunds recorded by the admin, and what stays as credit. The balance includes refunds.
//   node checks/check-cancelled-money.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'cancelled-money');
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
await mkdir(out, { recursive: true });
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const mk = async (ref, cost) => { const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order; ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return (await call('/orders', 'GET', null, client)).data.orders.find(x => x.id === o.id); };
const A = await mk('KUMO-1', 20), B = await mk('KUMO-2', 30), C = await mk('KUMO-3', 15), D = await mk('KEEP-4', 10);
// A, B, C paid; A cancelled free, B cancelled with the supplier's $5 fee, C cancelled with no payment... (C unpaid), D stays.
ok(await call('/admin/payments', 'POST', { clientId: id, amount: A.price + B.price, paidAt: '2026-10-20', method: 'Bank transfer', orderIds: [A.id, B.id] }, admin));
await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=5 WHERE id=?').bind(B.id).run();
await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=3 WHERE id=?').bind(C.id).run(); // C never paid: its fee comes from the credit
for (const o of [A, B, C]) { ok(await call('/orders/' + o.id + '/request-cancellation', 'POST', { reason: 'Store suspended' }, client)); ok(await call('/orders/' + o.id + '/approve-cancellation', 'POST', {}, admin)); }
let c = ok(await call('/payments', 'GET', null, client)).cancelled;
assert.equal(c.count, 3); assert.equal(c.paidCount, 2);
assert.equal(c.paid, A.price + B.price, 'paid for cancelled orders');
assert.equal(c.fees, 8, 'the supplier fees were used at cancellation');
assert.equal(c.dueBack, Math.round((A.price + B.price - 8) * 100) / 100, 'paid minus all the fees (the fee of C taken from the credit)');
assert.equal(c.orders.find(o => o.id === C.id).fromCredit, true);
const cl = ok(await call('/orders', 'GET', null, client)).orders.find(o => o.id === C.id); assert.equal(cl.paidFromCredit, true, 'C counts as paid');
assert.equal(ok(await call('/admin/orders', 'GET', null, admin)).orders.find(o => o.id === C.id).paidFromCredit, true, 'admin sees it too');
assert.equal(c.credit, c.dueBack, 'all kept as credit so far');
const owes0 = ok(await call('/me', 'GET', null, client)).summary.outstanding;
assert.equal(owes0, Math.round((D.price - c.dueBack) * 100) / 100, 'balance: D still owed, minus the credit');
// The admin records a refund of $10: less credit, balance up by 10. Clients cannot.
assert.equal((await call('/admin/refunds', 'POST', { clientId: id, amount: 10 }, client)).status, 403);
assert.equal((await call('/admin/refunds', 'POST', { clientId: id, amount: 0 }, admin)).status, 400);
const rf = ok(await call('/admin/refunds', 'POST', { clientId: id, amount: 10, date: '2026-10-27', method: 'Bank transfer', note: 'KumoBags' }, admin));
assert.equal(rf.cancelled.refunded, 10); assert.equal(rf.cancelled.credit, Math.round((c.dueBack - 10) * 100) / 100);
assert.equal(ok(await call('/me', 'GET', null, client)).summary.outstanding, Math.round((owes0 + 10) * 100) / 100, 'refund raises the balance');
const adm = ok(await call('/admin/payments?clientId=' + id, 'GET', null, admin)).cancelled;
assert.deepEqual(adm, ok(await call('/payments', 'GET', null, client)).cancelled, 'admin and client see the same numbers');
console.log('PASS cancelled money: paid, fees, due back, refund, credit; balance includes refunds; admin = client');
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/payments`); await page.reload(); await page.waitForSelector('[data-cancelled-box]'); await page.waitForTimeout(400);
    await page.locator('[data-cancelled-box]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-client.png`) });
    assert.equal(await page.locator('[data-cancelled-box] tbody tr').count(), 3, tag); assert.equal(await page.locator('[data-refund-form]').count(), 0, tag + ' client cannot record refunds');
    // Home starts with the money, cancellation fees and credit included (29 Oct 2026).
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('[data-money-now]'); await page.waitForTimeout(600);
    const tiles = await page.locator('[data-money-now] .mn-tile').allInnerTexts(); assert.equal(tiles.length, 5, tag + ' balance, billed, paid, fees, credit');
    assert.ok(tiles.some(t => t.includes('$8.00')) && tiles.some(t => t.includes('$32.00')), tag + ' fees $8 and credit $32 on Home: ' + tiles.join(' | '));
    await page.screenshot({ path: path.join(out, `${tag}-home.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    assert.deepEqual(errors, [], tag); await ctx.close();
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.gtabs');
    await ui.locator('.gtabs button').nth(2).click(); await ui.locator('.subtabs [data-ctab=payments]').click(); await ui.waitForSelector('[data-cancelled-box]'); await page.waitForTimeout(400);
    await ui.locator('.cx-add > summary').click(); await ui.locator('[data-cancelled-box]').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${tag}-admin.png`) });
    assert.equal(await ui.locator('[data-refund-undo]').count(), 1, tag);
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
