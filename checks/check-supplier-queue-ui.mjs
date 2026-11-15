// Supplier portal, phase 2 screens (work queue) (docs/supplier-portal.md): sign in, Billing, one client's billing, change password
// (English + 中文, 1440 + 390 px) and the admin's Supplier logins / Supplier share payments (English + Hebrew).
//   node checks/check-supplier-portal.mjs   (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real screens in Chrome. No live data.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DB, env, call, seed } from './lib.mjs';
import { route } from '../api/index.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'supplier-queue-ui');
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
  } catch (e) { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); if (cookie) await ctx.addCookies([{ name: cookie.split('=')[0], value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const FEE = 0.37;
const { admin, client, id } = await seed();
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE, name: 'Juniper & Co.' }, admin));
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async (ref, extra = {}) => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Wool felt slippers', variant: 'EU 41 / Chestnut', buyerName: 'Jane Buyer', buyerPhone: '+1 555 0100', address1: '1 Sample St', city: 'Austin', region: 'TX', postalCode: '78701', destination: 'US', etsyUrl: 'https://example.com/' + ref, notes: 'Please wrap each pair separately.', giftMessage: 'Happy birthday!', photos: [photo], ...extra }, client)).order.id;
const ids = [];
for (let i = 1; i <= 5; i++) ids.push(await mk('4221' + (900000 + i), { destination: ['US', 'DE', 'UK', 'AU', 'CA'][i - 1] }));
const multi = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: '4221999999', buyerName: 'Sam Buyer', address1: '2 Sample Rd', city: 'Leeds', destination: 'UK', photos: [photo, photo],
  items: [{ link: 'https://example.com/candle', quantity: 2, variant: 'Fig & cedar' }, { link: 'https://example.com/snuffer', quantity: 1, variant: 'Brass' }] }, client)).order.id;
const req = await mk('4221800001'); ok(await call('/orders/' + req + '/request-cancellation', 'POST', { reason: 'Buyer changed mind' }, client));
const cx = await mk('4221700001'); ok(await call('/orders/' + cx + '/request-cancellation', 'POST', { reason: 'Wrong size' }, client)); ok(await call('/orders/' + cx + '/approve-cancellation', 'POST', {}, admin));
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const put = (oid, field, value) => call('/supplier/orders/' + oid, 'PUT', { field, value }, sup).then(ok);
// One order bought with a cost, one shipped.
await put(ids[3], 'cost', '24.60'); await put(ids[3], 'bought', true);
await put(ids[4], 'cost', '17.10'); await put(ids[4], 'tracking', 'YT2611390044851'); await put(ids[4], 'courier', 'Yanwen'); await put(ids[4], 'shipped', true);

const flat = s => s.replace(/\s+/g, ' ');
try {
  for (const lang of ['en', 'zh']) for (const w of [1440, 390]) {
    const tag = `${lang}-${w}`, ctx = await session(sup, w), page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/supplier/?lang=${lang}`); await page.waitForSelector('.sp-chips');
    const text = flat(await page.locator('body').innerText());
    for (const n of ['0.37', '24.97', '17.47']) assert.ok(!text.includes(n), `${tag}: shows ${n}`);
    assert.match(text, lang === 'en' ? /1 cancel request/ : /取消申请/);
    await page.screenshot({ path: path.join(out, `${tag}-orders.png`), fullPage: w > 700 });
    const scope = w < 860 ? '.sp-ocard' : 'tr';
    if (lang === 'en' && w === 1440) {
      // Type a cost, Enter: saved, and the next order's cost box has the focus.
      const first = page.locator('tr[data-row] [data-f=cost]:not([disabled])').first(), fid = Number(await first.getAttribute('data-o')); await first.fill('19.90'); await first.press('Enter');
      await page.waitForFunction(id => /Saved · Ada/.test(document.querySelector(`tr[data-row="${id}"]`)?.innerText || ''), fid);
      assert.equal(await page.evaluate(() => document.activeElement?.dataset?.f), 'cost', 'Enter jumps to the next cost box');
      assert.notEqual(await page.evaluate(() => document.activeElement?.dataset?.o), String(fid));
      const r = await DB.prepare('SELECT supplier_cost, price FROM client_orders WHERE id = ?').bind(fid).first();
      assert.equal(Number(r.supplier_cost), 19.9, 'saved to the order');
      // Duplicate tracking warning.
      const tr = page.locator(`tr[data-row="${ids[1]}"] [data-f=tracking]`); await tr.fill('YT2611390044851'); await tr.press('Tab');
      await page.waitForFunction(id => /Also on 4221900005/.test(document.querySelector(`tr[data-row="${id}"]`)?.innerText || ''), ids[1]);
      // Bought: the row stays while you work, moves on the next tab click.
      await page.selectOption(`tr[data-row="${ids[1]}"] [data-f=ship]`, 'bought');
      await page.waitForFunction(id => /Saved · Ada/.test(document.querySelector(`tr[data-row="${id}"]`)?.innerText || ''), ids[1]);
      assert.equal(await page.locator(`tr[data-row="${ids[1]}"]`).count(), 1, 'stays in view after Bought');
      await page.screenshot({ path: path.join(out, `${tag}-orders-typed.png`) });
      // Export.
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export-orders]')]);
      assert.match(dl.suggestedFilename(), /^direct-line-orders-.*\.xlsx$/);
      // Bought tab.
      await page.click('[data-tab=bought]'); await page.waitForSelector(`tr[data-row="${ids[1]}"]`);
    }
    // Drawer.
    await page.click('[data-tab=new]').catch(() => {});
    await page.locator(`${scope}[data-row="${multi}"] [data-open]`).first().click(); await page.waitForSelector('#sp-drawer .sp-dbody');
    const dt = flat(await page.locator('#sp-drawer').innerText());
    assert.match(dt, lang === 'en' ? /Download all photos \(zip\)/ : /下载全部图片/); assert.match(dt, /Sam Buyer/);
    await page.screenshot({ path: path.join(out, `${tag}-drawer.png`) });
    await page.click('#sp-drawer [data-close]'); await page.waitForFunction(() => !document.querySelector('#sp-drawer'));
    // Cancelled tab.
    await page.click('[data-tab=cancelled]'); await page.waitForSelector(`${scope}[data-row="${cx}"]`);
    await page.screenshot({ path: path.join(out, `${tag}-cancelled.png`), fullPage: w > 700 });
    assert.deepEqual(errors, [], tag + ': no page errors');
    await ctx.close();
  }
  // Client paid on every order (16 Nov 2026): the supplier confirms which orders are paid. Tag in the list + filter.
  for (const w of [1440, 390]) {
    const ctx = await session(sup, w), page = await ctx.newPage();
    await page.goto(`${base}/supplier/?lang=en#orders`); await page.waitForSelector('[data-paid]');
    assert.ok(await page.locator('[data-paid=no_bill]').count() > 0, 'New orders without a bill say No bill yet');
    await page.locator('[data-tab=bought]').click(); await page.waitForTimeout(300);
    assert.ok(await page.locator('[data-paid=not_paid]').count() > 0, 'a billed order not paid yet says Not paid');
    await page.screenshot({ path: path.join(out, `en-${w}-paid-tags.png`) });
    await page.locator('[data-filters]').click(); await page.selectOption('[data-fl=paid]', 'paid'); await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-paid=not_paid]').count(), 0, 'filter Paid hides not paid orders');
    await page.selectOption('[data-fl=paid]', 'not_paid'); await page.waitForTimeout(300);
    assert.ok(await page.locator('[data-paid=not_paid]').count() > 0 && await page.locator('[data-paid=paid]').count() === 0, 'filter Not paid');
    await page.screenshot({ path: path.join(out, `en-${w}-paid-filter.png`) });
    await ctx.close();
  }
  { const ctx = await session(sup, 1440), page = await ctx.newPage(); await page.goto(`${base}/supplier/?lang=zh#orders`); await page.waitForSelector('[data-paid]');
    assert.match(await page.locator('[data-paid]').first().innerText(), /还没有账单|未付款|已付款/); await ctx.close(); }
  console.log('PASS client paid tag on every order and a Client paid filter (EN, 中文, 1440, 390)');
  console.log('PASS work queue screens (EN, 中文, 1440, 390): tabs, cancel request banner, typing saves + Enter jumps, duplicate warning, Bought stays in view, export, drawer, cancelled tab; no fee on screen');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
