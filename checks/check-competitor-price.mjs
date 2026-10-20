// Behaviour check: clients enter a competitor price (what other shops charge) in their portal — when sending a product
// for a quote, later in the product panel, in the new order form and in "Your numbers" on an order — and admins see it.
// (The supplier sheet side is covered by check-supplier-sheet / check-quote-sheet.)
//   node checks/check-competitor-price.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'competitor-price');
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
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
const prod = (await call('/products', 'POST', { name: 'Walnut key holder', link: 'https://detail.1688.com/offer/77', variant: '5 hooks', competitorPrice: '$31.90 on Etsy shop WoodCo', photos: [photo] }, client)).data.product;
assert.equal(prod.competitorPrice, '$31.90 on Etsy shop WoodCo', 'saved with the product');
await DB.prepare("UPDATE portal_products SET status='approved', unit_price=9.4, supplier_price=8.9 WHERE id=?").bind(prod.id).run();
const ord = await call('/orders', 'POST', { storeId: store.id, productId: prod.id, orderRef: '#7000', buyerName: 'Sample Customer', address1: '1 Main St, Springfield', destination: 'US', competitorPrice: '$29 on Amazon' }, client);
assert.equal(ord.status, 200, JSON.stringify(ord.data)); assert.equal(ord.data.order.competitorPrice, '$29 on Amazon', 'saved with the order');
const oid = ord.data.order.id;
await call('/orders/' + oid, 'PUT', { status: 'processing' }, admin);
const later = await call('/orders/' + oid, 'PUT', { competitorPrice: '$27.50 on Amazon' }, client);
assert.equal(later.status, 200, 'changeable after the order is in progress'); assert.equal(later.data.order.competitorPrice, '$27.50 on Amazon');
console.log('PASS api');

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // ---------- client portal ----------
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/products`); await page.reload(); await page.waitForSelector('[data-plist]'); await page.waitForTimeout(400);
    await page.locator('[data-add-product] > summary').click(); await page.waitForSelector('#product-form [name=competitorPrice]');
    await page.locator('#product-form [name=competitorPrice]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-product-form.png`) });
    await page.locator('[data-add-product] > summary').click();
    assert.match(await page.locator('.mp-row').first().innerText(), /WoodCo/, 'shown in the list');
    await page.locator('.mp-row .mp-name').first().click(); await page.waitForSelector('#comp-form');
    await page.locator('#comp-form [name=competitorPrice]').fill('$30.50 on Etsy shop WoodCo'); await page.locator('#comp-form [type=submit]').click(); await page.waitForTimeout(700);
    assert.equal((await DB.prepare('SELECT competitor_price FROM portal_products WHERE id=?').bind(prod.id).first()).competitor_price, '$30.50 on Etsy shop WoodCo');
    await page.locator('#comp-form').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-product-panel.png`) });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(`${base}/portal/?lang=${lang}#/new`); await page.waitForSelector('#order-form'); await page.waitForTimeout(300);
    await page.locator('[name=productId]').selectOption(String(prod.id)); await page.waitForTimeout(200);
    assert.equal(await page.locator('#order-form [name=competitorPrice]').inputValue(), '$30.50 on Etsy shop WoodCo', 'filled in from the product');
    await page.locator('#order-form [name=competitorPrice]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-order-form.png`) });
    page.on('dialog', d => d.accept().catch(() => {})); await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.reload(); await page.waitForSelector('[data-orders-list] tr[data-open-order]'); await page.waitForTimeout(300);
    await page.locator(`[data-orders-list] tr[data-open-order="${oid}"]`).click(); await page.waitForSelector('#numbers-form [name=competitorPrice]');
    assert.equal(await page.locator('#numbers-form [name=competitorPrice]').inputValue(), '$27.50 on Amazon');
    await page.locator('#numbers-form [name=competitorPrice]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-your-numbers.png`) });
    assert.deepEqual(errors, [], tag + ' portal'); await ctx.close();
    // ---------- admin ----------
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.locator('[data-filter=all]').click(); await ui.locator(`tr[data-open-order="${oid}"]`).first().click();
    await ui.waitForSelector('.drawer dd'); await page.waitForTimeout(400);
    assert.match(await ui.locator('.drawer').innerText(), /\$27\.50 on Amazon/, 'admin sees it on the order');
    await ui.locator('.drawer dd', { hasText: '$27.50 on Amazon' }).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-order.png`) });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await ui.locator('[data-tab=products]').click(); await ui.waitForSelector(`[data-product-quote="${prod.id}"]`);
    assert.match(await ui.locator(`[data-product-quote="${prod.id}"]`).innerText(), /WoodCo/, 'admin sees it on the product');
    await ui.locator(`[data-product-quote="${prod.id}"]`).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-product.png`) });
    assert.deepEqual(errors, [], tag + ' admin'); await ctx.close();
    console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
