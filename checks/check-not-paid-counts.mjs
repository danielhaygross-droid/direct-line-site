// Check: one "not paid" count everywhere (QA 19 Nov 2026, item 3). Home said 11 orders not paid while Payments said 9 to
// pay + 2 covered by credit, the admin "Not paid yet" card said 11 while its "Not paid" chip said 9, and Home's Total
// billed said "24 orders" while the Payments statement said 14. Now: orders the client's credit already pays for are not
// counted as not paid (Home strip, admin card, chip agree), the admin window says "2 orders · 1 covered by credit" so the
// money still adds up, and Home's billed count = the statement's (billed, not cancelled, not archived).
//   node checks/check-not-paid-counts.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'not-paid-counts');
await mkdir(out, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/test-admin.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=light><body style=margin:0><iframe name=admin src="/admin/?lang=${url.searchParams.get('lang') || 'en'}" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url);
const fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(fixture)).toString('base64') };
const mk = async (ref, date, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
  if (cost != null) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id;
};
// Billed A $20, B $25, C $30 (D has no cost: not billed). $55 paid for C: $25 credit pays for A whole, not B.
const A = await mk('SHOP-301', '2026-10-02', 20), B = await mk('SHOP-302', '2026-10-06', 25), C = await mk('SHOP-303', '2026-10-11', 30);
await mk('SHOP-304', '2026-10-13', null);
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 55, paidAt: '2026-10-20', method: 'Bank transfer', orderIds: [C] }, admin));
const flat = t => t.replace(/\s+/g, ' ');
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`, en = lang === 'en';
    const ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('.pay-strip'); await page.waitForTimeout(400);
    const strip = flat(await page.locator('.pay-strip').innerText());
    assert.match(strip, en ? /\b1 order not paid yet/ : /הזמנה אחת שעוד לא שולמה/, tag + ' strip counts only B (A is covered by credit): ' + strip);
    assert.match(strip, /\$20\.00/, tag + ' strip = balance due');
    const billed = flat(await page.locator('[data-money-now] .mn-tile').nth(1).innerText());
    assert.match(billed, en ? /\b3 orders\b/ : /\b3 הזמנות/, tag + ' Total billed = 3 billed orders (D has no bill): ' + billed);
    await page.screenshot({ path: path.join(out, `${tag}-home.png`) });
    await page.goto(`${base}/portal/?lang=${lang}#/payments`); await page.reload(); await page.waitForSelector('[data-statement]'); await page.waitForTimeout(400);
    const st = flat(await page.locator('[data-statement]').innerText());
    assert.match(st, en ? /\b3 orders\b/ : /\b3 הזמנות/, tag + ' statement billed row = Home: ' + st.slice(0, 200));
    await page.locator('[data-statement]').screenshot({ path: path.join(out, `${tag}-statement.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close();

    const actx = await session(admin, width), ap = await actx.newPage(), aerr = []; ap.on('pageerror', e => aerr.push(e.message));
    await ap.goto(`${base}/test-admin.html?lang=${lang}`); const ui = ap.frame({ name: 'admin' }); await ui.waitForSelector('[data-kpis] .stat'); await ap.waitForTimeout(400);
    const card = ui.locator('[data-kpi-card="unpaid"]'), face = flat(await card.innerText());
    assert.match(face, en ? /\b1 order\b/ : /הזמנה אחת/, tag + ' card counts 1 order: ' + face);
    assert.match(face, /\$20\.00/, tag + ' card = what clients owe');
    await card.click(); await ui.locator('[data-kpi-win]').waitFor(); await ap.waitForTimeout(300);
    const win = flat(await ui.locator('[data-kpi-win]').innerText());
    assert.match(win, en ? /2 orders · 1 covered by credit/ : /2 הזמנות · אחת מכוסה בזיכוי/, tag + ' window explains the covered order: ' + win.slice(0, 300));
    await ui.locator('[data-kpi-win]').screenshot({ path: path.join(out, `${tag}-admin-window.png`) });
    await ui.locator('[data-kw-close]').click(); await ui.locator('[data-tab="orders"]').first().click(); await ui.waitForSelector('[data-chips] [data-filter="unpaid"]');
    assert.equal((await ui.locator('[data-chips] [data-filter="unpaid"] span').innerText()).trim(), '1', tag + ' chip = card');
    assert.deepEqual(aerr, [], tag); await actx.close();
    console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
