// Local check: shipping per order on client My Products, product details, new order total and admin Products (EN/HE x 1440/390).
//   node checks/check-quote-shipping-ui.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real client/admin screens in Chrome. No live data.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { pg, DB, env, call, seed } from './lib.mjs';
import { route } from '../api/index.mjs';
import { applyQuoteRow } from '../server/quote-sheet.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'quote-shipping');
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
const P = [];
for (const name of ['Brass key hooks', 'Wall coat rack', 'Leather wallet']) P.push((await call('/products', 'POST', { name, link: 'https://detail.1688.com/offer/7', variant: 'Black', photos: [photo] }, client)).data.product);
await DB.prepare("UPDATE portal_products SET status='approved', unit_price=5.4, supplier_price=4.9, supplier_shipping=3.25 WHERE id=?").bind(P[0].id).run();
await DB.prepare("UPDATE portal_products SET status='approved', unit_price=7.4, supplier_price=6.9, supplier_shipping=NULL WHERE id=?").bind(P[1].id).run();
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/products`); await page.reload(); await page.waitForSelector('[data-plist]'); await page.waitForTimeout(500);
    await page.locator('[data-plist]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-products.png`) });
    if (lang === 'en') { const t = await page.locator('[data-plist]').innerText(); assert.ok(t.includes('$3.25') && t.includes('Shipping not added yet') && !t.includes('shipping not included'), t); }
    await page.locator('.mp-name', { hasText: 'Brass key hooks' }).click(); await page.waitForSelector('.drawer.open .money-rows'); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${tag}-details.png`) });
    await page.locator('.drawer.open [data-order-product]').click(); await page.waitForSelector('#order-form'); await page.waitForTimeout(400);
    await page.locator('[data-qty]').first().fill('3'); await page.locator('[data-qty]').first().dispatchEvent('input'); await page.waitForTimeout(200);
    await page.locator('[name=productId]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-new-order.png`) });
    if (lang === 'en') { assert.match(await page.locator('[data-product-price]').innerText(), /\$5\.40[\s\S]*\$3\.25/); assert.match(await page.locator('[data-sum]').innerText(), /\$19\.45/); }
    assert.deepEqual(errors, [], tag); await ctx.close();
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=products]');
    await ui.locator('[data-tab=products]').click(); await ui.waitForSelector(`[data-product-quote="${P[0].id}"] [name=shipping]`);
    assert.equal(await ui.locator(`[data-product-quote="${P[0].id}"] [name=shipping]`).inputValue(), '3.25');
    await ui.locator(`[data-product-quote="${P[0].id}"] [name=shipping]`).scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `${tag}-admin.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
