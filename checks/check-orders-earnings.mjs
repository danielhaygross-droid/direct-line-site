// Local check: the earnings cards and the profit chart are also on the client's ORDERS page (branch claude/orders-earnings).
//   node checks/check-orders-earnings.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real portal in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'orders-earnings');
await mkdir(out, { recursive: true });

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const first = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const second = ok(await call('/client-stores', 'POST', { name: 'Second shop', platform: 'Etsy', link: 'https://example.com/shop2' }, client)).store;
const mk = async (ref, extra = {}) => ok(await call('/orders', 'POST', { clientId: id, storeId: first.id, orderRef: ref, buyerName: 'Sample', destination: 'IL', address1: '1 Sample St', etsyUrl: 'https://example.com/i', ...extra }, admin)).order;
const bill = (o, productCost, shippingFee) => call('/orders/' + o.id, 'PUT', { productCost, shippingFee }, admin).then(ok);
const a = await mk('EARN-A', { sellingPrice: 100, etsyFee: 0 }); await bill(a, 30, 10);                         // profit 60
const b = await mk('EARN-B', { sellingPrice: 50, etsyFee: 0, storeId: second.id }); await bill(b, 20, 10);     // profit 20 (second store)
const old = await mk('EARN-OLD', { sellingPrice: 80, etsyFee: 0 }); await bill(old, 20, 10);                    // profit 50, last year
await DB.prepare("UPDATE client_orders SET created_at=?, order_date='2025-03-10' WHERE id=?").bind(Math.floor(Date.parse('2025-03-10T12:00:00Z') / 1000), old.id).run();

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
const session = async width => { const ctx = await browser.newContext({ viewport: { width, height: 950 } }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(client.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };
const earnings = page => page.evaluate(() => ({
  cards: [...document.querySelectorAll('.stats .stat')].map(s => s.querySelector('small')?.innerText.trim() + ' = ' + s.querySelector('strong')?.innerText.trim()),
  bars: [...document.querySelectorAll('.bars .bar-col')].map(c => c.title), chart: !!document.querySelector('.bars'),
  stores: document.querySelectorAll('.store-performance tbody tr').length,
}));

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang} ${width}px`, ctx = await session(width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('.stats .stat'); const home = await earnings(page);
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('.stats .stat'); await page.waitForSelector('tr[data-open-order]');
    const ord = await earnings(page);
    assert.ok(ord.chart, tag + ' chart on Orders'); assert.equal(ord.cards.length, 3, tag + ' three cards on Orders');
    assert.deepEqual(ord.cards, home.cards, tag + ' same cards as Home'); assert.deepEqual(ord.bars, home.bars, tag + ' same chart as Home');
    assert.ok(ord.stores >= 3, tag + ' per-store table (two shops + total) on Orders, rows: ' + ord.stores);
    // the earnings block is above the list
    const order = await page.evaluate(() => { const y = s => document.querySelector(s)?.getBoundingClientRect().top; return { cards: y('.stats'), chart: y('.bars'), list: y('[data-orders-list]') }; });
    assert.ok(order.cards < order.chart && order.chart < order.list, tag + ' earnings above the orders list');
    assert.match(ord.cards.at(-1), /= \$80\.00$/, tag + ' this month: profit 60 + 20');
    // period change on Orders: This month -> Last month (no orders then). The orders list is NOT filtered by it.
    const rows = await page.locator('tr[data-open-order]').count(); assert.equal(rows, 3, tag + ' all orders listed');
    await page.locator('[data-period-form] select[name=period]').selectOption('last_month'); await page.waitForTimeout(500);
    const all = await earnings(page);
    assert.notDeepEqual(all.cards, ord.cards, tag + ' a longer period changes the numbers'); assert.equal(await page.locator('tr[data-open-order]').count(), 3, tag + ' list unchanged by the period');
    assert.match(all.cards.at(-1), /= \$0\.00$/, tag + ' last month: no profit');
    // The block can be folded away, and the choice is remembered (also after a reload and on the Home page it does not exist).
    await page.locator('.earn-box > summary').click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('.earn-box').evaluate(d => d.open), false, tag + ' folded');
    assert.equal(await page.locator('.stats').isVisible(), false, tag + ' cards hidden when folded');
    assert.ok(await page.locator('[data-orders-list]').isVisible(), tag + ' the list is still there');
    await page.reload(); await page.waitForSelector('tr[data-open-order]');
    assert.equal(await page.locator('.earn-box').evaluate(d => d.open), false, tag + ' stays folded after reload');
    await page.locator('.earn-box > summary').click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('.earn-box').evaluate(d => d.open), true, tag + ' unfolded'); assert.ok(await page.locator('.stats').isVisible());
    // store switch keeps the block in step with the list
    await page.locator('[data-select-store]').nth(1).click(); await page.waitForTimeout(500);
    const oneStore = await earnings(page); assert.equal(oneStore.stores, 0, tag + ' no per-store table when one store is selected');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    if (width === 1440) { await page.locator('[data-select-store="0"]').click(); await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${lang}-orders.png`) }); }
    assert.deepEqual(errors, [], tag); console.log(`PASS ${tag}: cards + chart + per-store table on Orders equal Home, above the list, period and store switch, no sideways scroll`);
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
