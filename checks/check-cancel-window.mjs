// Cancel window (Erwin, 8 Nov 2026): before cancellations are approved, a window asks per order for the cancellation fee
// and whether our fee is still charged. Our fee starts ticked only on orders the client already paid.
//   node checks/check-cancel-window.mjs   (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real admin screen in Chrome (EN/HE x 1440/390). No live data.
// Each round: 4 cancellation requests (A, B, D paid; C not paid). In the window: B's fee 2 and our fee off, C's our fee on,
// D left out. Then A, B, C are cancelled, D still waits; the money adds up to the window's total.
// Undo (approved by mistake): A from its panel, B from the bulk bar go back to the request with no fees; an order the
// admin cancelled directly (no request) can't be undone.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DB, env, call, seed } from './lib.mjs';
import { route } from '../api/index.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'cancel-window');
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
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
const row = async oid => DB.prepare('SELECT status, keep_fee FROM client_orders WHERE id=?').bind(oid).first();
const adj = async (oid, kind) => Number((await DB.prepare('SELECT amount FROM client_balance_adjustments WHERE order_id=? AND kind=?').bind(oid, kind).first())?.amount || 0);
const mk = async ref => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: '2026-11-01', buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
  ok(await call('/orders/' + o.id, 'PUT', { productCost: 20, shippingFee: 5 }, admin));
  ok(await call('/orders/' + o.id, 'PUT', { commission: 1 }, admin));
  return o.id;
};
const priceOf = async oid => Number((await DB.prepare('SELECT price FROM client_orders WHERE id=?').bind(oid).first()).price);

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const [A, B, C, D] = [await mk(`CX-A-${tag}`), await mk(`CX-B-${tag}`), await mk(`CX-C-${tag}`), await mk(`CX-D-${tag}`)];
    ok(await call('/admin/payments', 'POST', { clientId: id, amount: (await priceOf(A)) + (await priceOf(B)) + (await priceOf(D)), paidAt: '2026-11-02', method: 'Bank transfer', orderIds: [A, B, D] }, admin));
    for (const o of [A, B, C, D]) ok(await call('/orders/' + o + '/request-cancellation', 'POST', { reason: 'Store suspended' }, client));
    await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=4 WHERE id=?').bind(A).run();
    const feesBefore = ok(await call('/payments', 'GET', null, client)).cancelled?.fees || 0;

    const ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.locator('[data-filter=cancellation_requested]').click();
    for (const o of [A, B, C, D]) await ui.locator(`[data-pick="${o}"]`).check();
    await ui.locator('[data-bulk-status]').selectOption('cancelled'); await ui.locator('[data-bulk="status"]').click();
    const win = ui.locator('dialog[data-cancel-window]'); await win.waitFor();
    assert.equal(await win.locator('[data-cw-row]').count(), 4, tag + ' one row per order');
    assert.deepEqual([(await row(A)).status, (await row(C)).status], ['cancellation_requested', 'cancellation_requested'], tag + ' nothing changes before the main button');
    const r = o => win.locator(`[data-cw-row="${o}"]`);
    // Defaults: the supplier's fee from the sheet; our fee ticked on paid orders only.
    assert.equal(await r(A).locator('[data-cw-fee]').inputValue(), '4.00', tag + ' supplier fee filled in');
    assert.deepEqual(await Promise.all([A, B, C, D].map(o => r(o).locator('[data-cw-keep]').isChecked())), [true, true, false, true], tag + ' our fee ticked on paid orders');
    await page.screenshot({ path: path.join(out, `${tag}-window.png`) });
    // Erwin's choices.
    await r(B).locator('[data-cw-fee]').fill('2'); await r(B).locator('[data-cw-keep]').uncheck(); await r(C).locator('[data-cw-keep]').check(); await r(D).locator('[data-cw-in]').uncheck();
    const sum = (await win.locator('[data-cw-sum]').innerText()).replace(/\s+/g, ' ');
    // A 4 + 1, B 2 + 0, C 0 + 1 = cancellation fees 6 + our fee 2 = 8.
    assert.ok(sum.includes('$6.00') && sum.includes('$2.00') && sum.includes('$8.00'), tag + ' total adds up: ' + sum);
    if (lang === 'en') { assert.match(sum, /3 orders · cancellation fees \$6\.00 \+ our fee \$2\.00 \$8\.00/, tag); assert.equal(await win.locator('[data-cw-go]').innerText(), 'Cancel 3 orders'); }
    await page.screenshot({ path: path.join(out, `${tag}-window-changed.png`) });
    await win.locator('[data-cw-go]').click(); await win.waitFor({ state: 'detached', timeout: 15000 });
    assert.deepEqual(await Promise.all([A, B, C, D].map(async o => (await row(o)).status)), ['cancelled', 'cancelled', 'cancelled', 'cancellation_requested'], tag + ' D left out');
    assert.deepEqual(await Promise.all([A, B, C].map(async o => (await row(o)).keep_fee)), ['auto', 'no', 'yes'], tag + ' our fee choice saved');
    // The client's cancelled box: what the window said (the client sees one fee per order, our fee inside it).
    const cx = ok(await call('/payments', 'GET', null, client)).cancelled;
    assert.equal(Math.round((cx.fees - feesBefore) * 100), 800, tag + ' cancellation costs = the window total');
    assert.deepEqual([await adj(A, 'kept_fee'), await adj(B, 'kept_fee'), await adj(C, 'kept_fee')], [1, 0, 1], tag + ' our fee kept on A and C');
    assert.deepEqual([await adj(A, 'cancellation_fee'), await adj(B, 'cancellation_fee'), await adj(C, 'cancellation_fee')], [4, 2, 0], tag + ' cancellation fees');
    const mine = ok(await call('/payments', 'GET', null, client));
    assert.ok(!JSON.stringify(mine).includes('keepFee') && !JSON.stringify(mine.cancelled).includes('"kept"'), tag + ' the client never sees our fee');
    // One order from its panel: "Approve cancellation…" opens the window with one row; Keep the orders changes nothing.
    await ui.locator('[data-filter=cancellation_requested]').click(); await ui.locator(`[data-open-order="${D}"]`).click();
    await ui.locator('aside.drawer [data-cancel-window]').first().click(); await win.waitFor();
    assert.equal(await win.locator('[data-cw-row]').count(), 1, tag + ' one row from the panel');
    if (lang === 'en') assert.equal(await win.locator('#cxw-h').innerText(), 'Cancel this order');
    await page.screenshot({ path: path.join(out, `${tag}-window-one.png`) });
    await win.locator('.cxw-actions [data-cw-close]').click(); await win.waitFor({ state: 'detached' });
    assert.equal((await row(D)).status, 'cancellation_requested', tag + ' Keep the orders changes nothing');
    // Reopened: our fee goes back to the usual rule and the kept fee to 0.
    ok(await call('/orders/' + C, 'PUT', { status: 'processing' }, admin));
    assert.equal((await row(C)).keep_fee, 'auto', tag + ' reopened: back to the usual rule');
    ok(await call('/payments', 'GET', null, client)); assert.equal(await adj(C, 'kept_fee'), 0, tag + ' reopened: kept fee removed');
    // Undo approval: A from its panel.
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); await ui.locator('[data-filter=cancelled]').click(); await ui.locator(`[data-open-order="${A}"]`).click();
    const undo = ui.locator('aside.drawer [data-undo-cancel]'); await undo.waitFor();
    await undo.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-undo-panel.png`) });
    await undo.click(); await ui.locator('aside.drawer [data-cancel-window]').first().waitFor();
    // B from the bulk bar.
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); await ui.locator('[data-filter=cancelled]').click(); await ui.locator(`[data-pick="${B}"]`).check();
    await ui.locator('[data-bulk-status]').selectOption('undo-cancel'); await ui.locator('[data-bulk="status"]').click();
    await ui.locator(`[data-pick="${B}"]`).waitFor({ state: 'detached' });
    for (const o of [A, B]) {
      const x = await DB.prepare('SELECT status, keep_fee, cancellation_previous_status AS prev, cancellation_reason AS why FROM client_orders WHERE id=?').bind(o).first();
      assert.deepEqual([x.status, x.keep_fee, x.prev, x.why], ['cancellation_requested', 'auto', 'pending', 'Store suspended'], tag + ' undo: back to the request as it was');
    }
    ok(await call('/payments', 'GET', null, client));
    assert.deepEqual([await adj(A, 'cancellation_fee'), await adj(B, 'cancellation_fee'), await adj(A, 'kept_fee'), await adj(B, 'kept_fee')], [0, 0, 0, 0], tag + ' undo: no fees left');
    assert.equal(Math.round(((ok(await call('/payments', 'GET', null, client)).cancelled?.fees || 0) - feesBefore) * 100), 0, tag + ' undo: client charged nothing');
    // Cancelled directly by the admin (no request): nothing to go back to.
    ok(await call('/orders/' + C, 'PUT', { status: 'cancelled', fee: '' }, admin));
    const no = await call('/orders/' + C + '/undo-cancellation', 'POST', {}, admin);
    assert.equal(no.status, 409, tag + ' no request, no undo'); assert.equal((await row(C)).status, 'cancelled', tag);
    assert.equal((await call('/orders/' + A + '/undo-cancellation', 'POST', {}, client)).status, 403, tag + ' clients cannot undo');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    assert.deepEqual(errors, [], tag); await ctx.close();
    console.log('PASS', tag, 'cancel window: fees per order, our fee choice, left-out order, totals add up');
  }
} finally { await browser.close(); server.close(); }
