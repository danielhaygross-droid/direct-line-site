// QA item 17 (19 Nov 2026 list): admin search from anywhere. One box on every tab's title line, Ctrl+K and "/" focus it;
// it finds orders, clients, products and payments, arrow keys + Enter or a click open the result.
//   node checks/check-admin-search.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'admin-search');
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
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; worker-src 'self'" });
    res.end(data);
  } catch (e) { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); if (cookie) await ctx.addCookies([{ name: cookie.split('=')[0], value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };

const { admin, client, id } = await seed();
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const o1 = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: '4262555001', itemTitle: 'Wool felt slippers', variant: 'EU 41', buyerName: 'Marlow Quinby', address1: '1 St', city: 'Austin', destination: 'US', etsyUrl: 'https://example.com/a', photos: [photo] }, client)).order.id;
ok(await call('/orders/' + o1, 'PUT', { trackingNumber: 'UL706844599YP' }, admin));
const prod = ok(await call('/products', 'POST', { name: 'Brass zodiac lighter', link: 'https://detail.1688.com/offer/7', variant: 'Gold', photos: [photo] }, client)).product.id;
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 123.45, paidAt: '2026-11-20', method: 'Bank transfer', note: 'Wise November' }, admin));
// API: admin only, finds by amount and by note, nothing for an empty query.
assert.notEqual((await call('/admin/search-payments?q=wise', 'GET', null, client)).status, 200, 'clients cannot search payments');
assert.equal(ok(await call('/admin/search-payments?q=wise', 'GET', null, admin)).payments.length, 1, 'by note');
assert.equal(ok(await call('/admin/search-payments?q=%24123.45', 'GET', null, admin)).payments.length, 1, 'by amount');
assert.equal(ok(await call('/admin/search-payments?q=zzz', 'GET', null, admin)).payments.length, 0);
assert.equal(ok(await call('/admin/search-payments?q=%25', 'GET', null, admin)).payments.length, 0, '% is not a wildcard');
console.log('PASS API: payment search (admin only, by note or amount)');
try {
  for (const lang of ['en', 'he']) for (const w of [1440, 390]) {
    const tag = `${lang}-${w}`, ctx = await session(admin, w), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' });
    await ui.waitForSelector('[data-gs-input]');
    const input = ui.locator('[data-gs-input]');
    assert.ok(await ui.evaluate(() => { const r = document.querySelector('[data-gs]').getBoundingClientRect(); return r.width > 200 && r.right <= innerWidth + 1 && r.left >= -1; }), tag + ': box fits');
    // Ctrl+K from anywhere focuses it; an order by buyer name; Enter opens the order.
    await ui.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('Control+k');
    assert.equal(await ui.evaluate(() => document.activeElement?.matches('[data-gs-input]')), true, tag + ': Ctrl+K focuses the search');
    await input.fill('quinby'); await ui.waitForSelector('[data-gs-pick]');
    assert.match(await ui.locator('[data-gs-list]').innerText(), /4262555001/, tag + ': finds the order by buyer');
    await page.screenshot({ path: path.join(out, `${tag}-results.png`) });
    await page.keyboard.press('Enter'); await ui.waitForSelector('.drawer, [data-drawer]', { state: 'visible' });
    assert.match(await ui.locator('.drawer, [data-drawer]').first().innerText(), /4262555001/, tag + ': Enter opens the order');
    await page.keyboard.press('Escape'); await ui.waitForTimeout(300);
    // Tracking number, product (click opens the Products tab on it), payment (opens the client's payments).
    await input.fill('UL7068445'); await ui.waitForSelector('[data-gs-pick]'); assert.match(await ui.locator('[data-gs-list]').innerText(), /4262555001/, tag + ': by tracking');
    await input.fill('zodiac'); await ui.waitForSelector('[data-gs-pick]'); await ui.locator('[data-gs-pick]').first().click();
    await ui.waitForSelector(`[data-pq="${prod}"][open]`); assert.ok(await ui.locator(`[data-pq="${prod}"]`).isVisible(), tag + ': product opened');
    await input.fill('wise nov'); assert.ok(await ui.waitForSelector('.gs-group:has-text("' + (lang === 'en' ? 'Payments' : 'תשלומים') + '")').catch(() => null), tag + ': payment group');
    assert.match(await ui.locator('[data-gs-list]').innerText(), /123\.45/, tag + ': payment found by note');
    await input.fill('nothing-like-this'); await ui.waitForTimeout(500);
    assert.match(await ui.locator('[data-gs-list]').innerText(), lang === 'en' ? /Nothing found/ : /לא נמצא/, tag + ': empty message');
    await page.keyboard.press('Escape'); assert.equal(await ui.locator('[data-gs-list]').isHidden(), true, tag + ': Escape closes');
    assert.deepEqual(errors, [], tag + ': no page errors'); await ctx.close();
  }
  console.log('PASS admin search: Ctrl+K, orders (buyer, tracking), products, payments, empty, Escape (EN, HE, 1440, 390)');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
