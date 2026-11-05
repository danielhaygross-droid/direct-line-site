// Check: Payments in sections (Erwin, 5 Nov 2026: "hard to scroll very long every time I need to find some details").
// The money tiles stay on top, then Pay / Payment history / Cancelled orders / Billing details: only one section is on
// the page; it opens on Pay while orders are unpaid; ?tab= links and reloads keep the section; the arrow keys move between
// sections; the cancelled orders table shows 5 rows and "Show all N cancelled orders"; tabs are 44px on a phone; no
// sideways scroll. EN + HE, 1440 + 390.
//   node checks/check-payments-sections.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'payments-sections');
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
const ORDER = await mk('READ-1', 20, day(3));
// 7 more orders, paid, then cancelled: the Cancelled orders box has 7 rows (5 shown + "Show all").
const CX = []; for (let i = 1; i <= 7; i++) CX.push(await mk('CX-' + i, 10, day(20 - i)));
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 70, paidAt: day(1), method: 'Bank transfer', note: 'cx', orderIds: CX }, admin));
for (const o of CX) { ok(await call('/orders/' + o + '/request-cancellation', 'POST', { reason: 'Store suspended' }, client)); ok(await call('/orders/' + o + '/approve-cancellation', 'POST', {}, admin)); }
const visible = (page, sel) => page.locator(sel).evaluateAll(els => els.filter(e => e.offsetParent).length);
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`, ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/payments`); await page.waitForSelector('.pay-tabs');
    // Four sections; with orders to pay it opens on Pay, and only that part is on the page.
    assert.deepEqual(await page.locator('[data-pay-tab]').evaluateAll(b => b.map(x => x.dataset.payTab)), ['pay', 'history', 'cancelled', 'billing'], tag);
    assert.equal(await page.locator('[data-pay-tab].on').getAttribute('data-pay-tab'), 'pay', tag + ' opens on Pay');
    assert.equal(await page.locator('[data-pay-tab=pay]').getAttribute('aria-selected'), 'true', tag);
    assert.equal(await page.locator('#pay-flow').count(), 1, tag); assert.equal(await page.locator('.cpay-list, [data-cancelled-box], [data-billing]').count(), 0, tag + ' other sections not on the page');
    if (lang === 'he') assert.match(await page.locator('.pay-tabs').innerText(), /תשלום[\s\S]*היסטוריית תשלומים[\s\S]*הזמנות שבוטלו[\s\S]*פרטי חיוב/, tag);
    assert.equal(await page.locator('[data-pay-tab=billing] .pay-tab-dot').count(), 1, tag + ' billing details missing: dot');
    if (width < 600) for (const h of await page.locator('[data-pay-tab]').evaluateAll(b => b.map(x => x.getBoundingClientRect().height))) assert.ok(h >= 43.5, tag + ' tab 44px');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + ' no sideways scroll');
    await page.screenshot({ path: path.join(out, `${tag}-pay.png`) });
    // Payment history: the link keeps the section (reload stays on it).
    await page.locator('[data-pay-tab=history]').click(); await page.waitForSelector('.cpay-list');
    assert.match(page.url(), /#\/payments\?tab=history$/, tag); assert.equal(await page.locator('#pay-flow').count(), 0, tag);
    await page.reload(); await page.waitForSelector('.cpay-list'); assert.equal(await page.locator('[data-pay-tab].on').getAttribute('data-pay-tab'), 'history', tag + ' deep link');
    await page.screenshot({ path: path.join(out, `${tag}-history.png`) });
    // Cancelled orders: 5 rows, then Show all 7 / Show fewer.
    await page.locator('[data-pay-tab=cancelled]').click(); await page.waitForSelector('[data-cancelled-box]');
    assert.equal(await visible(page, '.cx-table tbody tr'), 5, tag + ' 5 rows to start');
    const more = page.locator('[data-cx-more]');
    assert.equal(await more.innerText(), lang === 'en' ? 'Show all 7 cancelled orders' : 'הצגת כל 7 ההזמנות שבוטלו', tag);
    await page.screenshot({ path: path.join(out, `${tag}-cancelled.png`) });
    await more.click(); assert.equal(await visible(page, '.cx-table tbody tr'), 7, tag + ' all rows'); assert.equal(await more.getAttribute('aria-expanded'), 'true', tag);
    assert.equal(await more.innerText(), lang === 'en' ? 'Show fewer' : 'הצגת פחות', tag);
    await more.click(); assert.equal(await visible(page, '.cx-table tbody tr'), 5, tag + ' fewer again');
    // Billing details; the arrow keys move between sections (right = next in English, left = next in Hebrew).
    await page.locator('[data-pay-tab=billing]').click(); await page.waitForSelector('#billing-form');
    await page.screenshot({ path: path.join(out, `${tag}-billing.png`) });
    await page.locator('[data-pay-tab=billing]').focus(); await page.keyboard.press(lang === 'en' ? 'ArrowLeft' : 'ArrowRight');
    assert.equal(await page.locator('[data-pay-tab].on').getAttribute('data-pay-tab'), 'cancelled', tag + ' arrow key goes back one section');
    // The Home strip's "Pay for orders" opens Pay.
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('.pay-strip'); await page.locator('.pay-strip').click(); await page.waitForSelector('#pay-flow');
    assert.equal(await page.locator('[data-pay-tab].on').getAttribute('data-pay-tab'), 'pay', tag);
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
