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
const LINK = 'https://www.etsy.com/listing/4588909425/wooden-wall-hook-rack-walnut-or-beech', LINK2 = 'https://www.etsy.com/listing/1111111111/oak-shelf';
const prod = (page, n) => page.locator('#order-form [data-prod]').nth(n), vrow = (page, n, m) => prod(page, n).locator('[data-var]').nth(m);
const fillVar = async (page, n, m, qty, text) => { await vrow(page, n, m).locator('[data-qty]').fill(String(qty)); await vrow(page, n, m).locator('[data-variant]').fill(text); };
// Pauline's order: one product in two variations; then a second product, also in two variations.
const fillOrder = async (page, ref, second = true) => {
  const f = page.locator('#order-form');
  await f.locator('[name=orderRef]').fill(ref);
  await prod(page, 0).locator('[data-link]').fill(LINK); await fillVar(page, 0, 0, 3, 'Black Walnut, 7 Hooks');
  await prod(page, 0).locator('[data-var-add]').click();
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-variant]')), true, 'the cursor is in the new variation');
  await fillVar(page, 0, 1, 2, 'Black Walnut, 6 Hooks');
  if (second) {
    await f.locator('[data-prod-add]').click();
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-link]')), true, 'a new product starts with its link');
    await prod(page, 1).locator('[data-link]').fill(LINK2); await fillVar(page, 1, 0, 1, 'Oak');
    await prod(page, 1).locator('[data-var-add]').click(); await fillVar(page, 1, 1, 2, 'Walnut');
  }
  await f.locator('[name=buyerName]').fill('Sample Buyer'); await f.locator('[name=address1]').fill('1 Sample Street, Springfield IL 62701, +1 555 0100');
  await f.locator('[name=destination]').selectOption('US');
};
const TEXT1 = '3 × Black Walnut, 7 Hooks\n2 × Black Walnut, 6 Hooks', TEXT2 = 'Product 1:\n' + TEXT1 + '\nProduct 2:\n1 × Oak\n2 × Walnut';

try {
  // ---- 1. The flow once (English, desktop) ----
  {
    const ctx = await session(client, 1440), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=en#/new`); await page.reload(); await page.waitForSelector('#order-form [data-prod]');
    assert.equal(await page.locator('[data-prod]').count(), 1); assert.equal(await page.locator('[data-var]').count(), 1);
    assert.equal(await page.locator('[data-var-remove]:visible, [data-prod-remove]:visible').count(), 0, 'one row: nothing to remove');
    await fillOrder(page, 'PAULINE-1');
    assert.match(await page.locator('[data-sum]').innerText(), /2 products · 8 items/, 'the total is the sum of every variation');
    // A variation without "how many" is refused, and marked.
    await vrow(page, 1, 0).locator('[data-qty]').fill('');
    await page.locator('[data-submit]').click(); await page.waitForTimeout(300);
    assert.match(await page.locator('#order-form').innerText(), /how many \(each variation\)/); assert.equal(await page.locator('[data-var] .item-qty.bad').count(), 1);
    await vrow(page, 1, 0).locator('[data-qty]').fill('1');
    await page.locator('[data-pick-input]').setInputFiles(fixturePath); await page.waitForTimeout(500);
    await page.locator('[data-submit]').click(); await page.waitForFunction(() => location.hash.startsWith('#/orders'), null, { timeout: 15000 });
    const o = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.orderRef === 'PAULINE-1');
    assert.equal(o.quantity, 8); assert.equal(o.variant, TEXT2); assert.equal(o.etsyUrl, LINK + '\n' + LINK2);
    assert.deepEqual(o.items.map(i => [i.link === LINK ? 1 : 2, i.quantity, i.variant]), [[1, 3, 'Black Walnut, 7 Hooks'], [1, 2, 'Black Walnut, 6 Hooks'], [2, 1, 'Oak'], [2, 2, 'Walnut']]);
    // Editing shows the boxes again; removing the second product leaves Pauline's order.
    await page.goto(`${base}/portal/?lang=en#/edit/${o.id}`); await page.reload(); await page.waitForSelector('#order-form [data-prod]');
    assert.equal(await page.locator('[data-prod]').count(), 2); assert.deepEqual(await page.locator('[data-var] [data-qty]').evaluateAll(i => i.map(x => x.value)), ['3', '2', '1', '2']);
    await prod(page, 1).locator('[data-prod-remove]').click(); await page.locator('[data-submit]').click();
    await page.waitForFunction(() => location.hash.startsWith('#/orders'), null, { timeout: 15000 });
    const o2 = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === o.id);
    assert.equal(o2.quantity, 5); assert.equal(o2.variant, TEXT1); assert.equal(o2.items.length, 2);
    assert.deepEqual(errors, []); await ctx.close();
  }
  // The order everyone looks at in the screenshots: two products, each in two variations.
  const png = await readFile(fixture), photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
  const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
  const shown = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: 'PAULINE-2', buyerName: 'Sample Buyer', address1: '1 Sample Street', destination: 'US', photos: [photo],
    items: [{ link: LINK, quantity: 3, variant: 'Black Walnut, 7 Hooks' }, { link: LINK, quantity: 2, variant: 'Black Walnut, 6 Hooks' }, { link: LINK2, quantity: 1, variant: 'Oak' }, { link: LINK2, quantity: 2, variant: 'Walnut' }] }, client)).order;
  assert.equal(shown.quantity, 8); assert.equal(shown.variant, TEXT2);
  assert.equal((await call('/orders', 'POST', { storeId: store.id, orderRef: 'BAD', buyerName: 'X', address1: '1 St', destination: 'US', photos: [photo], items: [{ link: LINK, quantity: 1 }, { link: '', quantity: 1 }] }, client)).status, 400, 'each line needs a link');
  ok(await call('/orders/' + shown.id, 'PUT', { productCost: 40, shippingFee: 0 }, admin));
  assert.equal(ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === shown.id).items.length, 4, 'a cost change keeps the lines');
  // Cost per product from the supplier (AI, 30 Oct 2026): each product line shows its price.
  await DB.prepare('UPDATE client_orders SET item_costs=? WHERE id=?').bind('25, 14.50', shown.id).run();

  // ---- 2. Screenshots: English + Hebrew, desktop + phone ----
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/new`); await page.reload(); await page.waitForSelector('#order-form [data-prod]');
    await fillOrder(page, 'SAMPLE-' + tag);
    await page.locator('[data-prods]').scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, `${tag}-form.png`), fullPage: width === 390 });
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector(`[data-open-order="${shown.id}"]`); await page.locator(`[data-open-order="${shown.id}"]`).first().click();
    await page.waitForSelector('.drawer.open'); await page.waitForTimeout(400);
    const dd = page.locator('.drawer.open dd', { hasText: 'Walnut' }); assert.ok(await dd.count() >= 1, tag); await dd.first().scrollIntoViewIfNeeded();
    const prices = await page.locator('.drawer.open .pm-price').allInnerTexts(); assert.equal(prices.length, 2, tag + ' a price per product');
    await page.locator('.drawer.open .pm-linkrow').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-order-prices.png`) });
    await page.screenshot({ path: path.join(out, `${tag}-order.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close();
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.locator(`[data-open-order="${shown.id}"]`).first().click(); await ui.waitForSelector('.drawer.open'); await page.waitForTimeout(400);
    const add = ui.locator('.drawer.open dd', { hasText: 'Product 2:' }); assert.equal(await add.count(), 1, tag); await add.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${tag}-admin-order.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
