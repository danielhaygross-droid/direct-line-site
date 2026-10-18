// Local check: photos open in a viewer on the same page (client + admin), not a new tab — branch claude/photo-viewer.
//   node checks/check-photo-viewer.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'photo-viewer');
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
const pngs = ['./fixtures/en-1440-light-agreement.png', './fixtures/admin-acceptance.png', './fixtures/he-390-dark-agreement.png'];
const photos = [];
for (const f of pngs) { const b = await readFile(new URL(f, import.meta.url)); photos.push({ filename: 'p.png', data: 'data:image/png;base64,' + b.toString('base64') }); }
const prod = (await call('/products', 'POST', { name: 'Brass key hooks', link: 'https://detail.1688.com/offer/1', variant: 'Black', photos }, client)).data.product;
await DB.prepare("UPDATE portal_products SET status='approved', unit_price=5.4, supplier_price=4.9 WHERE id=?").bind(prod.id).run();
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
const ord = (await call('/orders', 'POST', { storeId: store.id, productId: prod.id, orderRef: 'PV-1', buyerName: 'Sample', address1: '1 Main St', destination: 'US' }, client)).data.order;

const viewerOpen = async (frame, page, tag, name, count) => {
  await frame.waitForSelector('.pv.open img[src]'); await page.waitForTimeout(400);
  assert.equal(await frame.locator('[data-pv-count]').innerText(), count, name + ' count');
  await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
};
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = [], tabs = 0; page.on('pageerror', e => errors.push(e.message)); ctx.on('page', () => tabs++);
    // Client: product details → photo → viewer (3 photos), next, Esc closes only the photo.
    await page.goto(`${base}/portal/?lang=${lang}#/products`); await page.reload(); await page.waitForSelector('[data-plist]'); await page.waitForTimeout(400);
    await page.locator('.mp-name').first().click(); await page.waitForSelector('.drawer.open .mp-photos');
    await page.locator('.drawer.open .mp-photos a').nth(1).click();
    await viewerOpen(page, page, tag, 'client-product', '2 / 3');
    await page.locator('.pv [data-pv-step="1"]').click(); assert.equal(await page.locator('[data-pv-count]').innerText(), '3 / 3');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    assert.equal(await page.locator('.pv.open').count(), 0); assert.equal(await page.locator('.drawer.open').count(), 1, 'panel stays open');
    // Client: order photos.
    await page.goto(`${base}/portal/?lang=${lang}#/messages/${ord.id}`); await page.waitForSelector('.drawer.open .pm-photos a'); await page.waitForTimeout(300);
    await page.locator('.drawer.open .pm-photos a').first().click();
    await viewerOpen(page, page, tag, 'client-order', '1 / 3');
    await page.locator('.pv').click({ position: { x: 5, y: 300 } }); await page.waitForTimeout(200); assert.equal(await page.locator('.pv.open').count(), 0, 'click outside closes');
    assert.equal(tabs, 0, 'no new tab'); assert.deepEqual(errors, [], tag); await ctx.close();
    // Admin: order panel photos and the Products tab.
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; tabs = 0; page.on('pageerror', e => errors.push(e.message)); ctx.on('page', () => tabs++);
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.locator(`[data-open-order="${ord.id}"]`).first().click(); await ui.waitForSelector('.drawer.open .pm-photos a'); await page.waitForTimeout(300);
    await ui.locator('.drawer.open .pm-photos a').nth(2).click();
    await viewerOpen(ui, page, tag, 'admin-order', '3 / 3');
    await ui.locator('.pv [data-pv-close]').click(); await page.waitForTimeout(200);
    await ui.locator('.drawer.open .drawer-head button, .drawer.open [data-d-close], .drawer.open .d-close').first().click().catch(() => page.keyboard.press('Escape'));
    await ui.locator('[data-tab=products]').click(); await ui.waitForSelector(`[data-product-quote="${prod.id}"] img`);
    await ui.locator(`[data-product-quote="${prod.id}"] img`).first().click();
    await viewerOpen(ui, page, tag, 'admin-products', '1 / 3');
    assert.equal(tabs, 0, 'no new tab'); assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
