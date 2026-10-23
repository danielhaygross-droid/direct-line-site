// Check: the client's "Pay for orders" (Erwin, 23 Oct 2026). Home and Orders show "N orders not paid yet" with a button
// that opens Payments at "Pay for your orders"; there all unpaid orders start ticked, the total, the Copy amount button
// and the amount follow the ticks, and the confirmation is sent with the ticked orders. With nothing unpaid the strip
// is gone and the section becomes "Pay Direct Line". Screenshots EN/HE at 1440 and 390 px.
//   node checks/check-pay-for-orders.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real client portal in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'pay-for-orders');
await mkdir(out, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
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
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url);
const fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(fixture)).toString('base64') };
const mk = async (ref, date, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
  if (cost != null) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id;
};
const A = await mk('SHOP-201', '2026-10-02', 20), B = await mk('SHOP-202', '2026-10-06', 25), C = await mk('SHOP-203', '2026-10-11', 30);
await mk('SHOP-204', '2026-10-13', null);  // no cost yet: not billed, not in the list
const ticked = loc => loc.locator('[name=poOrder]:checked').evaluateAll(i => i.map(x => Number(x.value)));

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    // Home: the strip, then its button opens Payments at the pay section.
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.reload(); await page.waitForSelector('.pay-strip');
    if (lang === 'en') assert.match(await page.locator('.pay-strip').innerText(), /3 orders not paid yet\s*\$75\.00\s*Pay for orders/, tag);
    else assert.match(await page.locator('.pay-strip').innerText(), /3 הזמנות שעוד לא שולמו[\s\S]*תשלום על הזמנות/, tag);
    await page.locator('.pay-strip').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-home-strip.png`) });
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('.pay-strip');
    await page.screenshot({ path: path.join(out, `${tag}-orders-strip.png`) });
    await page.locator('.pay-strip').click(); await page.waitForSelector('#pay-flow');
    assert.match(page.url(), /#\/payments\?pay=1$/, tag);
    await page.waitForFunction(() => { const r = document.querySelector('#pay-flow').getBoundingClientRect(); return r.top >= -2 && r.top < 200; }, null, { timeout: 4000 });
    const f = page.locator('#transfer-form');
    assert.deepEqual(await ticked(f), [A, B, C], tag + ': every unpaid order ticked, oldest first');
    assert.equal(await f.locator('[name=amount]').inputValue(), '75.00', tag);
    await page.screenshot({ path: path.join(out, `${tag}-pay-flow.png`) });
    // Clear, then tick B only: total, copy and amount follow.
    await f.locator('[data-po-none]').click();
    assert.equal(await f.locator('[name=amount]').inputValue(), '', tag + ': nothing ticked, nothing filled');
    if (lang === 'en') assert.equal(await f.locator('[data-pf-gap]').innerText(), 'No orders ticked: the payment won’t be linked to orders.');
    await f.locator(`[name=poOrder][value="${B}"]`).check();
    assert.equal(await f.locator('[name=amount]').inputValue(), '25.00', tag);
    assert.equal(await f.locator('[data-pf-copy]').getAttribute('data-copy'), '25.00', tag);
    assert.equal(await f.locator('[data-pf-total]').innerText(), '$25.00', tag);
    // An amount the client typed stays when the ticks change.
    await f.locator('[name=amount]').fill('40'); await f.locator(`[name=poOrder][value="${A}"]`).check();
    assert.equal(await f.locator('[name=amount]').inputValue(), '40', tag + ': typed amount kept');
    if (lang === 'en') assert.equal(await f.locator('[data-pf-gap]').innerText(), 'The amount is $5.00 less than the ticked orders.');
    await f.locator('[data-pf-gap]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-pay-step3.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
  // Send it (English desktop): the confirmation carries the ticked orders.
  {
    const ctx = await session(client, 1440), page = await ctx.newPage();
    await page.goto(`${base}/portal/?lang=en#/payments?pay=1`); await page.reload(); await page.waitForSelector('#pay-flow');
    const f = page.locator('#transfer-form');
    await f.locator(`[name=poOrder][value="${C}"]`).uncheck();
    assert.equal(await f.locator('[name=amount]').inputValue(), '45.00');
    await f.locator('[name=file]').setInputFiles(fixturePath); await f.locator('[type=submit]').click();
    await page.waitForSelector('.confirmation-row:has-text("Orders you ticked")');
    const row = await DB.prepare("SELECT id FROM portal_files WHERE client_id=? AND kind='confirmation' ORDER BY id DESC").bind(id).first();
    const linked = (await DB.prepare('SELECT order_id FROM transfer_orders WHERE file_id=? ORDER BY order_id').bind(row.id).all()).results.map(r => Number(r.order_id));
    assert.deepEqual(linked, [A, B]);
    await ctx.close(); console.log('PASS confirmation sent with the ticked orders');
  }
  // Everything paid: no strip, and the section is "Pay Direct Line" with an empty amount.
  ok(await call('/admin/payments', 'POST', { clientId: id, amount: 75, paidAt: '2026-10-22', method: 'Bank transfer', orderIds: [A, B, C] }, admin));
  {
    const ctx = await session(client, 1440), page = await ctx.newPage();
    await page.goto(`${base}/portal/?lang=en#/home`); await page.reload(); await page.waitForSelector('[data-home-hello]');
    assert.equal(await page.locator('.pay-strip').count(), 0);
    await page.goto(`${base}/portal/?lang=en#/payments`); await page.waitForSelector('#pay-flow');
    assert.match(await page.locator('#pay-flow .sec-title').innerText(), /Pay Direct Line/i);
    assert.equal(await page.locator('#pay-flow [name=poOrder]').count(), 0);
    assert.equal(await page.locator('#transfer-form [name=amount]').inputValue(), '');
    await page.locator('#pay-flow').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'en-1440-all-paid.png') });
    await ctx.close(); console.log('PASS everything paid');
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
