// Check: client portal extras (portal review, 28 Oct 2026). The unpaid strip turns red and says since when once the
// oldest unpaid order is over 14 days old; "Mark several as delivered" on the Shipped filter; the New order summary
// shows the expected profit for a quoted product; Payments downloads an Excel file. EN/HE at 1440 and 390 px.
//   node checks/check-portal-extras.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'portal-extras');
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
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const mk = async (ref, cost, date) => { const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Buyer ' + ref, address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order; ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id; };
const OLD = await mk('OLD-1', 20, day(30)), S1 = await mk('SHIP-1', 10, day(3)), S2 = await mk('SHIP-2', 12, day(3)), P1 = await mk('PAID-1', 15, day(5));
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 17, paidAt: day(2), method: 'Bank transfer', note: 'October', orderIds: [P1] }, admin));
for (const o of [S1, S2]) ok(await call('/orders/' + o, 'PUT', { status: 'shipped' }, admin));
// A product with a quote, for the profit estimate.
const pr = ok(await call('/products', 'POST', { link: 'https://example.com/lamp', name: 'Lamp', photos: [photo] }, client)).product;
ok(await call('/admin/products/' + pr.id, 'POST', { status: 'approved', unitPrice: 12, shipping: 3, note: '' }, admin));
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`, ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    // 1) Reminder: the oldest unpaid order is 30 days old.
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.reload(); await page.waitForSelector('.pay-strip');
    assert.equal(await page.locator('.pay-strip.late').count(), 1, tag + ' late strip');
    assert.match(await page.locator('.pay-strip small').innerText(), lang === 'en' ? /(29|30) days ago/ : /לפני (29|30) ימים/, tag + ' since when');
    await page.locator('.pay-strip').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-reminder.png`) });
    // 1b) Orders page: the list first, earnings folded below; "Not paid" filter (OLD, SHIP-1, SHIP-2 unpaid; PAID-1 paid).
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('[data-filter="unpaid"]');
    const top = sel => page.locator(sel).first().evaluate(e => e.getBoundingClientRect().top);
    assert.ok(await top('[data-orders-list]') > 0, tag + ' the list'); assert.equal(await page.locator('[data-earn], .stats').count(), 0, tag + ' no earnings repeated on Orders');
    await page.locator('[data-filter="unpaid"]').click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-orders-list] tbody tr').count(), 3, tag + ' Not paid shows the 3 unpaid orders');
    await page.screenshot({ path: path.join(out, `${tag}-orders.png`) });
    await page.locator('[data-filter="all"]').click();
    // 2) Bulk delivered on the Shipped filter.
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('[data-chips], .chips'); await page.locator('[data-filter="shipped"]').first().click(); await page.waitForSelector('[data-bulk-deliver]');
    await page.locator('[data-bulk-deliver] > summary').click(); await page.locator('[data-bulk-form] [name=id]').first().check();
    assert.match(await page.locator('[data-bulk-go]').innerText(), lang === 'en' ? /Mark 1 as delivered/ : /סימון 1 כנמסרו/, tag + ' count on the button');
    await page.screenshot({ path: path.join(out, `${tag}-bulk.png`) });
    // 3) Expected profit in the New order summary.
    await page.goto(`${base}/portal/?lang=${lang}#/new`); await page.waitForSelector('#order-form'); await page.locator('[name=productId]').selectOption(String(pr.id));
    await page.locator('details.more > summary').click(); await page.locator('[name=etsyEarned]').fill('40');
    assert.match(await page.locator('.sum-profit').innerText(), /25\.00/, tag + ' profit = 40 - (12 + 3)');
    await page.locator('.sum-profit').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-profit.png`) });
    // 4) Payments Excel.
    await page.goto(`${base}/portal/?lang=${lang}#/payments`); await page.waitForSelector('[data-pay-excel]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-pay-excel]').click()]);
    const file = await readFile(await dl.path()); assert.equal(file.subarray(0, 2).toString(), 'PK', tag + ' a real .xlsx'); assert.match(dl.suggestedFilename(), /^Direct-Line-payments-\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
  // Bulk delivered really marks the ticked orders.
  const ctx = await session(client, 1440), page = await ctx.newPage(); await page.goto(`${base}/portal/?lang=en#/orders`); await page.reload(); await page.locator('[data-filter="shipped"]').first().click();
  await page.locator('[data-bulk-deliver] > summary').click(); for (const c of await page.locator('[data-bulk-form] [name=id]').all()) await c.check();
  await page.locator('[data-bulk-go]').click(); await page.waitForTimeout(1200);
  const st = ok(await call('/orders', 'GET', null, client)).orders.filter(o => [S1, S2].includes(o.id)).map(o => o.status);
  assert.deepEqual(st, ['delivered', 'delivered']); await ctx.close();
  console.log('PASS bulk delivered marks both orders; reminder, profit estimate and payments Excel on every view');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
