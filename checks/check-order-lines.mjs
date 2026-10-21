// Check: order lines in the client's order form — each product / colour has its own link, how many and colour (Pauline).
//   node checks/check-order-lines.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'order-lines');
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 } }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url), fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const LINK = 'https://www.etsy.com/listing/4588909425/wooden-wall-hook-rack-walnut-or-beech';
const fillOrder = async (page, ref) => {
  const f = page.locator('#order-form');
  await f.locator('[name=orderRef]').fill(ref);
  const row = n => f.locator('[data-item]').nth(n);
  await row(0).locator('[data-link]').fill(LINK); await row(0).locator('[data-qty]').fill('3'); await row(0).locator('[data-variant]').fill('Black Walnut, 7 Hooks');
  await f.locator('[data-item-add]').click();
  assert.equal(await row(1).locator('[data-link]').inputValue(), LINK, 'the link is copied to the new line');
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-variant]')), true, 'the cursor is in the new colour box');
  await row(1).locator('[data-variant]').fill('Beech, 5 Hooks'); await row(1).locator('[data-qty]').fill('2');
  await f.locator('[name=buyerName]').fill('Sample Buyer'); await f.locator('[name=address1]').fill('1 Sample Street, Springfield IL 62701, +1 555 0100');
  await f.locator('[name=destination]').selectOption('US');
};

try {
  // ---- 1. The flow once (English, desktop) ----
  {
    const ctx = await session(client, 1440), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=en#/new`); await page.reload(); await page.waitForSelector('#order-form [data-item]');
    assert.equal(await page.locator('[data-item]').count(), 1); assert.equal(await page.locator('[data-item-remove]:visible').count(), 0, 'one line: nothing to remove');
    await fillOrder(page, 'PAULINE-1');
    assert.match(await page.locator('[data-sum]').innerText(), /1 link · 5 items/, 'the total is the sum of the lines');
    // A line without "how many" is refused, and marked.
    await page.locator('[data-item]').nth(1).locator('[data-qty]').fill('');
    await page.locator('[data-submit]').click(); await page.waitForTimeout(300);
    assert.match(await page.locator('#order-form').innerText(), /how many \(each line\)/); assert.equal(await page.locator('[data-item] .item-qty.bad').count(), 1);
    await page.locator('[data-item]').nth(1).locator('[data-qty]').fill('2');
    await page.locator('[data-pick-input]').setInputFiles(fixturePath); await page.waitForTimeout(500);
    await page.locator('[data-submit]').click(); await page.waitForFunction(() => location.hash.startsWith('#/orders'), null, { timeout: 15000 });
    const o = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.orderRef === 'PAULINE-1');
    assert.equal(o.quantity, 5); assert.equal(o.variant, '3 × Black Walnut, 7 Hooks\n2 × Beech, 5 Hooks'); assert.equal(o.etsyUrl, LINK);
    assert.deepEqual(o.items, [{ link: LINK, quantity: 3, variant: 'Black Walnut, 7 Hooks' }, { link: LINK, quantity: 2, variant: 'Beech, 5 Hooks' }]);
    // Editing shows the lines again; a line can be removed (one line = as before).
    await page.goto(`${base}/portal/?lang=en#/edit/${o.id}`); await page.reload(); await page.waitForSelector('#order-form [data-item]');
    assert.deepEqual(await page.locator('[data-item] [data-qty]').evaluateAll(i => i.map(x => x.value)), ['3', '2']);
    await page.locator('[data-item-remove]').nth(1).click(); await page.locator('[data-item] [data-qty]').fill('4'); await page.locator('[data-submit]').click();
    await page.waitForFunction(() => location.hash.startsWith('#/orders'), null, { timeout: 15000 });
    const o2 = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === o.id);
    assert.equal(o2.quantity, 4); assert.equal(o2.variant, 'Black Walnut, 7 Hooks'); assert.equal(o2.items.length, 1);
    assert.deepEqual(errors, []); await ctx.close();
  }
  // The order everyone looks at in the screenshots: two colours of one product.
  const png = await readFile(fixture), photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
  const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
  const shown = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: 'PAULINE-2', buyerName: 'Sample Buyer', address1: '1 Sample Street', destination: 'US', photos: [photo],
    items: [{ link: LINK, quantity: 3, variant: 'Black Walnut, 7 Hooks' }, { link: LINK, quantity: 2, variant: 'Beech, 5 Hooks' }] }, client)).order;
  assert.equal(shown.quantity, 5);
  assert.equal((await call('/orders', 'POST', { storeId: store.id, orderRef: 'BAD', buyerName: 'X', address1: '1 St', destination: 'US', photos: [photo], items: [{ link: LINK, quantity: 1 }, { link: '', quantity: 1 }] }, client)).status, 400, 'each line needs a link');
  // An admin edit without lines keeps the text of the lines and drops the lines.
  ok(await call('/orders/' + shown.id, 'PUT', { productCost: 40, shippingFee: 0 }, admin));
  assert.equal(ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === shown.id).items.length, 2, 'a cost change keeps the lines');

  // ---- 2. Screenshots: English + Hebrew, desktop + phone ----
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/new`); await page.reload(); await page.waitForSelector('#order-form [data-item]');
    await fillOrder(page, 'SAMPLE-' + tag);
    await page.locator('[data-items]').scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, `${tag}-form.png`) });
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector(`[data-open-order="${shown.id}"]`); await page.locator(`[data-open-order="${shown.id}"]`).first().click();
    await page.waitForSelector('.drawer.open'); await page.waitForTimeout(400);
    const dd = page.locator('.drawer.open dd', { hasText: 'Beech' }); assert.equal(await dd.count(), 1, tag); await dd.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${tag}-order.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close();
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.locator(`[data-open-order="${shown.id}"]`).first().click(); await ui.waitForSelector('.drawer.open'); await page.waitForTimeout(400);
    const add = ui.locator('.drawer.open dd', { hasText: 'Beech' }); assert.equal(await add.count(), 1, tag); await add.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${tag}-admin-order.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
