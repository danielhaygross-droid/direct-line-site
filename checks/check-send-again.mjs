// Check: "Send this product again" (portal review, 28 Oct 2026). From an order's panel the client starts a new order
// with the same product links, variations, quantities, store and competitor price; the order number, customer and
// photo stay empty. Suspended shops are marked in the store picker. Screenshots EN/HE at 1440 and 390 px.
//   node checks/check-send-again.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real screens in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'send-again');
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
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
// A second shop (Suspended) and an order in it with two variations and a competitor price.
const shop = ok(await call('/client-stores', 'POST', { name: 'Second Shop', platform: 'Etsy', status: 'suspended' }, client)).store;
const made = ok(await call('/orders', 'POST', { storeId: shop.id, orderRef: 'AGAIN-1', buyerName: 'First Buyer', address1: '1 Sample St', destination: 'US', competitorPrice: '$24.90 on Etsy',
  items: [{ link: 'https://example.com/lamp', quantity: 2, variant: 'Black, large' }, { link: 'https://example.com/lamp', quantity: 1, variant: 'White, small' }], photos: [photo] }, client)).order;
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`, ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.reload(); await page.locator(`[data-open-order="${made.id}"]`).first().click(); await page.waitForSelector('[data-reorder]');
    await page.locator('[data-reorder]').click(); await page.waitForSelector('#order-form [data-link]'); await page.waitForTimeout(400);
    const f = page.locator('#order-form');
    assert.equal(await f.locator('[data-link]').first().inputValue(), 'https://example.com/lamp', tag + ' link copied');
    assert.deepEqual(await f.locator('[data-variant]').evaluateAll(xs => xs.map(x => x.value)), ['Black, large', 'White, small'], tag + ' variations copied');
    assert.deepEqual(await f.locator('[data-qty]').evaluateAll(xs => xs.map(x => x.value)), ['2', '1'], tag + ' quantities copied');
    assert.equal(await f.locator('[name=storeId]').inputValue(), String(shop.id), tag + ' same store');
    assert.equal(await f.locator('[name=competitorPrice]').inputValue(), '$24.90 on Etsy', tag + ' competitor price');
    assert.equal(await f.locator('[name=buyerName]').inputValue(), '', tag + ' customer is new'); assert.equal(await f.locator('[name=orderRef]').inputValue(), '', tag + ' order number is new');
    assert.match(await f.locator('[name=storeId] option:checked').innerText(), lang === 'en' ? /Second Shop · Suspended/ : /Second Shop · מושעית/, tag + ' suspended shop marked');
    await page.screenshot({ path: path.join(out, `${tag}-again.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
  // Orders page: the profit chart stays; the monthly chart is on Home only.
  const ctx = await session(client, 1440), page = await ctx.newPage(); await page.goto(`${base}/portal/?lang=en#/orders`); await page.reload(); await page.waitForSelector('[data-orders-list] tr');
  assert.equal(await page.locator('[data-client-chart]').count(), 0, 'no monthly chart on Orders');
  await page.goto(`${base}/portal/?lang=en#/home`); await page.waitForSelector('[data-client-chart] .mc-head'); await ctx.close();
  console.log('PASS Orders page lighter; Money by month on Home');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
