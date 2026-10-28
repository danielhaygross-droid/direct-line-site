// Local check: client Orders show Earned (after Etsy fee) / Cost / Profit; "You earned" can be typed instead — branch claude/profit-after-etsy-fee.
//   node checks/check-earned-profit.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'earned-profit');
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
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
const mk = async (ref, extra) => { const r = await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Customer ' + ref, address1: '1 Main St', destination: 'US', etsyUrl: 'https://www.etsy.com/listing/1', photos: [photo], ...extra }, client); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.order; };
const a = await mk('#4202869874', { sellingPrice: 67.55, etsyFee: 11.35 });   // Yehuda's example: earned 56.20, cost 35.40 -> profit 20.80
const b = await mk('#4202828286', { sellingPrice: 44.55 });                    // no fee yet -> "Add Etsy fee"
const c = await mk('#4203359682', {});                                         // nothing entered
for (const [o, cost] of [[a, 35.4], [b, 21.4], [c, 27.4]]) await DB.prepare('UPDATE client_orders SET price=?, product_cost=? WHERE id=?').bind(cost, cost, o.id).run();
// API: earned + profit after the fee; "You earned" wins over paid - fee.
let mine = (await call('/orders', 'GET', null, client)).data.orders;
const A = mine.find(o => o.id === a.id); assert.equal(A.earned, 56.2); assert.equal(A.profit, 20.8);
assert.equal(mine.find(o => o.id === b.id).profit, null);
assert.equal((await call(`/orders/${c.id}`, 'PUT', { etsyEarned: '104' }, client)).status, 200);
mine = (await call('/orders', 'GET', null, client)).data.orders; const C = mine.find(o => o.id === c.id); assert.equal(C.earned, 104); assert.equal(C.profit, 76.6);
assert.equal((await call(`/orders/${c.id}`, 'PUT', { etsyEarned: '-1' }, client)).status, 400);
console.log('PASS api');
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.reload(); await page.waitForSelector('[data-orders-list] tr, [data-orders-list] .tbl'); await page.waitForTimeout(700);
    await page.locator('[data-orders-list]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-orders.png`) });
    if (lang === 'en' && width === 1440) { await page.locator('.earn-box > summary').click(); await page.waitForSelector('.stats .stat'); const t = await page.locator('[data-orders-list]').innerText(); assert.ok(/earned/i.test(t) && !/net profit/i.test(t)); assert.match(await page.locator('.stat', { hasText: /profit/i }).first().innerText(), /\$97\.40/); assert.ok(t.includes('$56.20') && t.includes('$20.80') && t.includes('$104.00') && t.includes('$76.60') && t.includes('Add Etsy fee'), t.slice(0, 400)); }
    // Order panel: sale & cost + "Your numbers" with "Or: You earned".
    await page.locator(`[data-open-order="${b.id}"]`).first().click(); await page.waitForSelector('#numbers-form');
    await page.locator('#numbers-form [name=etsyEarned]').fill('38.10'); await page.locator('#numbers-form [type=submit]').click(); await page.waitForTimeout(800);
    await page.locator('.drawer.open .money-rows').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${tag}-panel.png`) });
    if (lang === 'en') { const t = await page.locator('.drawer.open .money-rows').innerText(); assert.ok(t.includes('$38.10') && t.includes('$16.70'), t); }
    await call(`/orders/${b.id}`, 'PUT', { etsyEarned: '' }, client);
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
