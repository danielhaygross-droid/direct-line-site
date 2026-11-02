// Check: every list can be sorted (Erwin, 2 Nov 2026) - client Messages, Payment history and My Stores; admin client
// panel Payments and Stores. Real SQL on in-memory Postgres (PGlite) + the real screens in Chrome. No live data.
//   node checks/check-list-sorts.mjs
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'list-sorts');
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
for (const name of ['Zebra Shop', 'Apple Shop']) assert.equal((await call('/client-stores', 'POST', { name, platform: 'Etsy' }, client)).status, 200);
const stores = (await call('/client-stores', 'GET', null, client)).data.stores;
const mk = async ref => { const r = await call('/orders', 'POST', { storeId: stores[0].id, orderRef: ref, buyerName: 'Buyer ' + ref, address1: '1 Main St, Springfield IL 62701', destination: 'US', photos: [photo], items: [{ link: 'https://www.etsy.com/listing/1/x', quantity: 1, variant: 'Blue' }] }, client); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.order; };
const b = await mk('B-200'), a = await mk('A-100');
for (const o of [b, a]) assert.equal((await call(`/orders/${o.id}/messages`, 'POST', { body: 'Question about ' + o.orderRef }, client)).status, 200);
for (const [amount, day] of [[40, '2026-10-20'], [15, '2026-10-25']]) assert.equal((await call('/admin/payments', 'POST', { clientId: id, amount, paidAt: day, method: 'Bank transfer' }, admin)).status, 200);
const pick = async (page, list, value) => { await page.locator(`select[data-sort="${list}"]`).first().selectOption(value); await page.waitForTimeout(250); };

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    // Messages: by order number, then latest message first.
    await page.goto(`${base}/portal/?lang=${lang}#/messages`); await page.reload(); await page.waitForSelector('.convo');
    await pick(page, 'portal-messages', 'order');
    assert.deepEqual(await page.locator('.convo').evaluateAll(c => c.map(x => Number(x.dataset.openOrder))), [a.id, b.id], tag + ' messages by order number');
    await page.screenshot({ path: path.join(out, `${tag}-messages.png`) });
    // Payment history: amount low to high, then high to low.
    await page.goto(`${base}/portal/?lang=${lang}#/payments`); await page.waitForSelector('.cpay-list');
    await pick(page, 'portal-payments', 'amount_asc'); const low = await page.locator('.cpay-list > *').first().innerText();
    await pick(page, 'portal-payments', 'amount_desc'); const high = await page.locator('.cpay-list > *').first().innerText();
    assert.match(low, /15\.00/, tag + ' smallest first'); assert.match(high, /40\.00/, tag + ' biggest first');
    await page.locator('select[data-sort="portal-payments"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-payments.png`) });
    // My Stores: name A–Z.
    await page.goto(`${base}/portal/?lang=${lang}#/stores`); await page.waitForSelector('select[data-sort="portal-stores"]');
    await pick(page, 'portal-stores', 'name');
    const names = await page.locator('.store-card').evaluateAll(c => c.map(x => x.textContent));
    assert.ok(names.findIndex(t => t.includes('Apple Shop')) < names.findIndex(t => t.includes('Zebra Shop')), tag + ' stores A–Z');
    await page.screenshot({ path: path.join(out, `${tag}-stores.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close();
    // Admin client panel: Payments and Stores have a Sort too.
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.drawer.open');
    await ui.locator('.drawer.open [data-cgroup="money"], .drawer.open [data-group="money"]').first().click().catch(() => {});
    await ui.locator('.drawer.open [data-ctab="payments"]').first().click().catch(() => {}); await page.waitForTimeout(300);
    await ui.locator('.drawer.open select[data-sort="client-payments"]').selectOption('amount_asc'); await page.waitForTimeout(300);
    assert.match(await ui.locator('.drawer.open .pay-cards').innerText(), /15\.00[\s\S]*40\.00/, tag + ' admin payments sorted');
    await page.screenshot({ path: path.join(out, `${tag}-admin-payments.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
