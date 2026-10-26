// Local check: client My Products — status filter, search, "New price" marks, fold-away add form — branch claude/my-products-filter.
//   node checks/check-my-products.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'my-products');
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
await DB.prepare("UPDATE users SET commission_per_order='0.5' WHERE id=?").bind(id).run();
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
const names = ['Brass key hooks', 'Wall coat rack', 'Zippo-style lighter', 'Leather wallet', 'Ceramic mug 14 oz', 'Jade teapot'];
const P = [];
for (const [i, name] of names.entries()) P.push((await call('/products', 'POST', { name, link: 'https://detail.1688.com/offer/' + (7000 + i), variant: i % 2 ? 'All variants in this style' : 'Black, 5 hooks', photos: [photo] }, client)).data.product);
const t0 = Math.floor(Date.now() / 1000) - 3 * 86400;
await DB.prepare('UPDATE portal_products SET created_at=?, updated_at=?').bind(t0, t0).run();
const row = async pid => DB.prepare('SELECT p.*, u.commission_per_order FROM portal_products p JOIN users u ON u.id=p.client_id WHERE p.id=?').bind(pid).first();
// Priced before the client's last visit: Leather wallet. Priced since: lighter (options), mug. Not available: teapot.
assert.equal(await applyQuoteRow(DB, await row(P[3].id), { price: 6.9, status: '', note: '' }, {}, t0 + 3600), 'approved');
assert.equal(await applyQuoteRow(DB, await row(P[2].id), { price: 'Silver: 3.20\nGold: 4.50', status: '', note: 'Gold takes 2 extra days' }, {}), 'approved');
assert.equal(await applyQuoteRow(DB, await row(P[4].id), { price: 4.9, status: '', note: '' }, {}), 'approved');
assert.equal(await applyQuoteRow(DB, await row(P[5].id), { price: '', status: 'Not available', note: 'Out of stock until March' }, {}), 'not_available');

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(([k, v]) => { try { const n = Number(sessionStorage.getItem('seeded') || 0); if (n < 2) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', String(n + 1)); } } catch (e) {} }, [`dl-products-seen-${id}`, String(t0 + 7200)]);
    await page.goto(`${base}/portal/?lang=${lang}#/products`); await page.reload(); await page.waitForSelector('[data-plist]'); await page.waitForTimeout(700);
    assert.equal(await page.locator('[data-add-product][open]').count(), 0, 'add form folded when there are products');
    assert.equal(await page.locator('.mp-row').count(), 6);
    assert.equal(await page.locator('.mp-row.is-new').count(), 3, 'priced or turned down since the last visit');
    await page.screenshot({ path: path.join(out, `${tag}-all.png`), fullPage: true });
    assert.ok((await page.locator('.mp-row img').first().boundingBox()).width >= (width < 600 ? 80 : 110), 'product photos are big enough to see');
    await page.locator('[data-pfilter=awaiting_quote]').click(); await page.waitForTimeout(200);
    assert.equal(await page.locator('.mp-row').count(), 2);
    await page.locator('[data-pfilter=approved]').click(); await page.waitForTimeout(200);
    assert.equal(await page.locator('.mp-row').count(), 3);
    await page.screenshot({ path: path.join(out, `${tag}-priced.png`) });
    await page.locator('[data-pq]').fill('lighter'); await page.waitForTimeout(200);
    assert.equal(await page.locator('.mp-row').count(), 1);
    await page.locator('[data-pq]').fill('zzz'); await page.waitForTimeout(200);
    assert.equal(await page.locator('.mp-row').count(), 0);
    await page.locator('[data-pq]').fill('');
    // The filter is remembered; the add form opens on click.
    await page.reload(); await page.waitForSelector('[data-plist]'); await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-pfilter=approved].on').count(), 1);
    assert.equal(await page.locator('.mp-row.is-new').count(), 0, 'seen now');
    await page.locator('[data-add-product] summary').click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('#product-form').isVisible(), true);
    await page.screenshot({ path: path.join(out, `${tag}-add-open.png`) });
    if (lang === 'en') { const t = await page.locator('[data-plist]').innerText(); assert.ok(t.includes('$5.00') && !t.includes('$4.50'), 'client prices only'); }
    // Clicking a product opens its details; "Order this product" opens the new order form with it chosen.
    await page.locator('[data-add-product] summary').click(); await page.waitForTimeout(200);
    await page.locator('.mp-row', { hasText: 'Zippo-style lighter' }).locator('.mp-main small').first().click(); await page.waitForSelector('.drawer.open .mp-photos');
    await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${tag}-details.png`) });
    if (lang === 'en') { const t = await page.locator('.drawer.open').innerText(); assert.ok(t.includes('Silver') && t.includes('$5.00') && t.includes('Gold takes 2 extra days') && t.includes('Sent for quote')); }
    await page.locator('.drawer.open [data-order-product]').click(); await page.waitForSelector('#order-form'); await page.waitForTimeout(500);
    assert.equal(await page.locator('[name=productId]').inputValue(), String(P[2].id));
    assert.ok(await page.locator('[data-f="productOption"]').isVisible(), 'option picker shown');
    await page.screenshot({ path: path.join(out, `${tag}-order-from-product.png`) });
    // A product link inside a row still opens the link, not the panel.
    await page.goto(`${base}/portal/?lang=${lang}#/products`); await page.waitForSelector('[data-plist]'); await page.waitForTimeout(300);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.locator('.mp-row a').first().click()]); await popup.close();
    assert.equal(await page.locator('.drawer.open').count(), 0);
    // A "Product quote updated" notification opens that product's panel, not only the list (Erwin, 26 Oct 2026).
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForTimeout(500); await page.locator('[data-bell]:visible').first().click();
    const note = page.locator('.dln-item[data-dln-id^="nproduct-"]').first(); await note.waitFor();
    const pid = (await DB.prepare('SELECT product_id FROM portal_product_events WHERE id=?').bind(Number((await note.getAttribute('data-dln-id')).replace('nproduct-', ''))).first()).product_id;
    await note.click(); await page.waitForSelector('.drawer.open .mp-photos'); assert.match(page.url(), /#\/products/);
    assert.equal((await page.locator('.drawer.open .drawer-head h2').innerText()).trim(), (await DB.prepare('SELECT name FROM portal_products WHERE id=?').bind(pid).first()).name, 'the notified product is open');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
