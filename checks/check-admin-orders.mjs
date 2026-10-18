// Local check: admins can set any order to any status, cancel with a fee, reopen, and set a fee per order
// (branch claude/admin-everything). Run from the project root:  node checks/check-admin-orders.mjs
// Real SQL on in-memory Postgres (PGlite) + the real admin screens in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'admin-orders');
await mkdir(out, { recursive: true });

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const mk = async ref => { const o = ok(await call('/orders', 'POST', { clientId: id, orderRef: ref, buyerName: 'Sample', destination: 'IL', address1: '1 Sample St', etsyUrl: 'https://example.com/i', sellingPrice: 40 }, admin)).order; ok(await call('/orders/' + o.id, 'PUT', { productCost: 14, shippingFee: 6 }, admin)); return o; };
const status = (o, body, who = admin) => call('/orders/' + o.id, 'PUT', typeof body === 'string' ? { status: body } : body, who);
const row = o => DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(o.id).first();
const owes = async () => Number(ok(await call('/me', 'GET', null, client)).summary.outstanding);
const adjustments = async () => ok(await call('/payments', 'GET', null, client)).adjustments;

// ---- API: any status to any status ----
const a = await mk('STATUS-ALL');
assert.equal(await owes(), 20);
for (const s of ['processing', 'shipped', 'delivered', 'shipped', 'pending', 'delivered', 'processing', 'pending']) { const r = ok(await status(a, s)); assert.equal(r.order.status, s, s); }
assert.equal((await row(a)).delivered_at === null, true, 'delivered date cleared once it is no longer delivered');
ok(await status(a, 'delivered')); assert.ok((await row(a)).delivered_at > 0);
ok(await status(a, 'shipped')); assert.equal((await row(a)).delivered_at, null);
// Clients still can't do any of this.
assert.equal((await status(a, 'pending', client)).status, 403);
assert.equal((await status(a, { status: 'cancelled', fee: 0 }, client)).status, 403);

// ---- cancel directly with a fee, reopen, cancel again with another fee ----
const b = await mk('CANCEL-FEE');
assert.equal(await owes(), 40);
let r = await status(b, { status: 'cancelled', fee: '4.00', reason: 'Customer asked' }); ok(r);
assert.equal((await row(b)).status, 'cancelled'); assert.equal((await row(b)).cancellation_reason, 'Customer asked');
assert.equal(await owes(), 20 + 4, 'a cancelled order is not billed, only its fee');
assert.deepEqual((await adjustments()).map(x => x.amount), [4]);
ok(await status(b, 'processing'));
assert.equal(await owes(), 40, 'reopened: billed again, the cancellation fee is gone');
assert.deepEqual(await adjustments(), [], 'a zero fee is not listed to the client');
for (const fee of ['abc', -1, 1.234]) assert.equal((await status(b, { status: 'cancelled', fee })).status, 400, 'bad fee ' + fee);
ok(await status(b, { status: 'cancelled', fee: 6 })); assert.equal(await owes(), 20 + 6); assert.deepEqual((await adjustments()).map(x => x.amount), [6]);
ok(await status(b, 'shipped')); assert.equal(await owes(), 40);
const ev = (await DB.prepare("SELECT detail FROM order_events WHERE order_id=? AND kind='status' ORDER BY id").bind(b.id).all()).results.map(x => x.detail);
assert.deepEqual(ev, ['cancelled', 'processing', 'cancelled', 'shipped'], 'every change is in the order history');
// Orders waiting for a cancellation decision can also be set straight to another status.
const c = await mk('REQUESTED');
ok(await call('/orders/' + c.id + '/request-cancellation', 'POST', { reason: 'x' }, client));
ok(await status(c, 'processing')); assert.equal((await row(c)).status, 'processing');

// ---- fee on one order ----
const d = await mk('FEE');
const before = (await row(d)); assert.ok(Number(before.commission) >= 0);
r = ok(await call('/orders/' + d.id, 'PUT', { commission: '3.50' }, admin));
assert.equal(Number(r.order.commission), 3.5); assert.equal(Number(r.order.ourShare), 3.5, 'our earnings = the fee');
assert.equal(Number((await row(d)).price), 20, 'client price does not change');
for (const body of [{ commission: 'abc' }, { commission: '-3' }]) assert.equal((await call('/orders/' + d.id, 'PUT', body, admin)).status, 400, JSON.stringify(body));
assert.equal(Number((await row(d)).commission), 3.5, 'refused changes did not save');
r = await call('/orders/' + d.id, 'PUT', { commission: '9', supplierShare: '0' }, client); // clients can't (the order is locked or the fields are ignored)
assert.equal(Number((await row(d)).commission), 3.5);
console.log('PASS API: any status to any status, cancel with fee, reopen removes the fee, history, per-order fee');

// ---- the admin screens in Chrome ----
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 } }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `admin ${lang} ${width}px`, o = await mk(`UI-${lang}-${width}`);
    const ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' });
    await ui.waitForSelector('[data-tab=orders]'); await ui.locator('[data-tab=orders]').click(); await ui.locator('[data-filter="all"]').click();
    await ui.locator(`tr[data-open-order="${o.id}"]`).click(); await ui.waitForSelector('[data-set-status]');
    assert.deepEqual(await ui.locator('[data-set-status]').evaluateAll(b => b.map(x => x.dataset.setStatus)), ['pending', 'processing', 'shipped', 'delivered'], tag + ' all four statuses');
    await ui.locator('[data-set-status="shipped"]').click(); await page.waitForTimeout(900); assert.equal((await row(o)).status, 'shipped', tag);
    await ui.locator('[data-set-status="pending"]').click(); await page.waitForTimeout(900); assert.equal((await row(o)).status, 'pending', tag + ' back to pending');
    // Fee on this order.
    await ui.locator('[data-fees-form] [name=commission]').fill('5');
    await ui.locator('[data-fees-form] [type=submit]').click(); await page.waitForTimeout(900);
    assert.equal(Number((await row(o)).commission), 5, tag + ' fee on this order');
    // Cancel: the first click only asks.
    await ui.locator('[name=directCancelFee]').fill('4');
    await ui.locator('[data-cancel-direct]').click(); await page.waitForTimeout(300);
    assert.equal((await row(o)).status, 'pending', tag + ' first click does not cancel');
    assert.match(await ui.locator('[data-cancel-direct]').innerText(), lang === 'en' ? /Click again to cancel/ : /לחצו שוב לביטול/);
    if (width === 1440) await page.screenshot({ path: path.join(out, `${lang}-cancel-card.png`) });
    await ui.locator('[data-cancel-direct]').click(); await page.waitForTimeout(1200);
    assert.equal((await row(o)).status, 'cancelled', tag + ' cancelled');
    assert.equal(Number((await DB.prepare("SELECT amount FROM client_balance_adjustments WHERE order_id=? AND kind='cancellation_fee'").bind(o.id).first()).amount), 4);
    assert.match(await ui.locator('[data-d-info]').innerText(), lang === 'en' ? /This order is cancelled\. Choose a status to reopen it/ : /ההזמנה מבוטלת/, tag + ' reopen hint');
    assert.equal(await ui.locator('[data-cancel-direct]').count(), 0, tag + ' no cancel card on a cancelled order');
    await ui.locator('[data-set-status="processing"]').click(); await page.waitForTimeout(1000);
    assert.equal((await row(o)).status, 'processing', tag + ' reopened');
    assert.equal(Number((await DB.prepare("SELECT amount FROM client_balance_adjustments WHERE order_id=? AND kind='cancellation_fee'").bind(o.id).first()).amount), 0, tag + ' fee removed');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    assert.deepEqual(errors, [], tag); console.log(`PASS ${tag}: all statuses, back to pending, fee on order (+ error), two-click cancel with fee, reopen`);
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
