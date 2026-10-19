// Behaviour check: "Sort" dropdowns on the long lists — admin Orders / Clients / Products tabs, the client panel
// (Orders, Products) and the client portal (Orders, My Products). The choice is remembered after a reload.
//   node checks/check-sorting.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real screens in Chrome (EN/HE, 1440/390). No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'sorting');
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

// One client with 6 products (2 waiting, prices 5…20) and 8 orders of different totals; a second client without orders.
const { admin, client, id } = await seed();
assert.equal((await call('/admin/users', 'POST', { username: 'zz-second', name: 'Aaron Second', password: 'clientpass123', role: 'client' }, admin)).status, 200);
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
const names = ['Teapot', 'Brass tray', 'Wall rack', 'Mug', 'Coaster', 'Bowl'], prices = [null, null, 20, 5, 12, 8];
const products = [];
for (const [i, name] of names.entries()) {
  const p = (await call('/products', 'POST', { name, link: 'https://detail.1688.com/offer/' + (1000 + i), variant: 'All variants', photos: [photo] }, client)).data.product;
  if (prices[i] != null) await DB.prepare("UPDATE portal_products SET status='approved', unit_price=?, supplier_price=? WHERE id=?").bind(prices[i], prices[i] - 0.5, p.id).run();
  products.push(p);
}
const approved = products.filter((p, i) => prices[i] != null);
for (let i = 0; i < 8; i++) {
  const p = approved[i % approved.length];
  const r = await call('/orders', 'POST', { storeId: store.id, productId: p.id, quantity: 1 + (i % 3), orderRef: '#5000' + i, buyerName: 'Customer ' + i, address1: (10 + i) + ' Main St, Springfield', destination: 'US' }, client);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await DB.prepare('UPDATE client_orders SET created_at=created_at+? WHERE id=?').bind(i * 60, r.data.order.id).run();
}
const money = s => Number(String(s).replace(/[^\d.]/g, ''));
const desc = a => a.every((v, i) => i === 0 || a[i - 1] >= v), asc = a => a.every((v, i) => i === 0 || a[i - 1] <= v);

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // ---------- admin ----------
    let ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); let ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    // Orders tab: total high → low.
    await ui.locator('[data-tab=orders]').click(); await ui.waitForSelector('[data-sort=admin-orders]');
    await ui.locator('[data-filter=all]').click(); await page.waitForTimeout(200);
    await ui.locator('[data-sort=admin-orders]').selectOption('total_desc'); await page.waitForTimeout(300);
    const totals = (await ui.locator('[data-list] tr[data-open-order] td:nth-child(5)').allInnerTexts()).map(money);
    assert.equal(totals.length, 8); assert.ok(desc(totals), 'orders by total, high to low: ' + totals);
    await page.screenshot({ path: path.join(out, `${tag}-admin-orders.png`) });
    // Clients tab: most orders first, then name A–Z puts "Aaron Second" first.
    await ui.locator('[data-tab=clients]').click(); await ui.waitForSelector('[data-sort=admin-clients]');
    await ui.locator('[data-sort=admin-clients]').selectOption('orders'); await page.waitForTimeout(300);
    assert.equal(await ui.locator('[data-list] tr[data-open-client]').first().getAttribute('data-open-client'), String(id), 'most orders first');
    await ui.locator('[data-sort=admin-clients]').selectOption('name'); await page.waitForTimeout(300);
    assert.match(await ui.locator('[data-list] tr[data-open-client]').first().innerText(), /Aaron Second/);
    await page.screenshot({ path: path.join(out, `${tag}-admin-clients.png`) });
    // Products tab: price low → high (no price yet goes last).
    await ui.locator('[data-tab=products]').click(); await ui.waitForSelector('[data-sort=admin-products]');
    await ui.locator('[data-sort=admin-products]').selectOption('price_asc'); await page.waitForTimeout(300);
    const tabPrices = await ui.locator('[data-product-quote] [name=unitPrice]').evaluateAll(xs => xs.map(x => x.value));
    assert.deepEqual(tabPrices, ['5', '8', '12', '20', '', ''], 'products tab by price');
    await page.screenshot({ path: path.join(out, `${tag}-admin-products.png`) });
    // Client panel: Products by price high → low; Orders oldest first.
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.gtabs');
    await ui.locator('.gtabs button').nth(1).click(); await page.waitForTimeout(200); await ui.locator('.subtabs [data-ctab=products]').click(); await page.waitForTimeout(300);
    assert.match(await ui.locator('.prod-row summary').first().innerText(), /Waiting for price|ממתין למחיר/, 'default: waiting first');
    await ui.locator('[data-sort=client-products]').selectOption('price_desc'); await page.waitForTimeout(300);
    const panelPrices = (await ui.locator('.prod-row .prod-price').allInnerTexts()).map(t => t.includes('$') ? money(t.split('\n')[0]) : null);
    assert.deepEqual(panelPrices, [20, 12, 8, 5, null, null], 'client products by price, high to low');
    await page.screenshot({ path: path.join(out, `${tag}-panel-products.png`) });
    await ui.locator('.gtabs button').nth(0).click(); await page.waitForTimeout(300);
    await ui.locator('[data-sort=client-orders]').selectOption('oldest'); await page.waitForTimeout(300);
    assert.match(await ui.locator('.drawer .ord-row').first().innerText(), /#50000/, 'oldest first');
    await page.screenshot({ path: path.join(out, `${tag}-panel-orders.png`) });
    // Remembered after a reload.
    await page.reload(); ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.waitForSelector('[data-sort=admin-orders]');
    assert.equal(await ui.locator('[data-sort=admin-orders]').inputValue(), 'total_desc', 'sort remembered');
    assert.deepEqual(errors, [], tag + ' admin'); await ctx.close();

    // ---------- client portal ----------
    ctx = await session(client, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.reload(); await page.waitForSelector('[data-sort=portal-orders]'); await page.waitForTimeout(500);
    await page.locator('[data-sort=portal-orders]').selectOption('total_asc'); await page.waitForTimeout(300);
    const ptotals = await page.locator('[data-orders-list] tr[data-open-order]').evaluateAll(rows => rows.map(r => r.querySelector('td[data-label="Total"], td.num')?.innerText || ''));
    assert.ok(asc(ptotals.map(money)), 'portal orders by total, low to high: ' + ptotals);
    await page.locator('[data-sort=portal-orders]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-orders.png`) });
    await page.goto(`${base}/portal/?lang=${lang}#/products`); await page.waitForSelector('[data-sort=portal-products]'); await page.waitForTimeout(400);
    await page.locator('[data-sort=portal-products]').selectOption('name'); await page.waitForTimeout(300);
    const pnames = await page.locator('[data-plist]').innerText();
    const at = n => pnames.indexOf(n);
    assert.ok(at('Bowl') < at('Brass tray') && at('Brass tray') < at('Coaster') && at('Mug') < at('Teapot') && at('Teapot') < at('Wall rack'), 'portal products by name A–Z');
    await page.locator('[data-sort=portal-products]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-products.png`) });
    assert.deepEqual(errors, [], tag + ' portal'); await ctx.close();
    console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
