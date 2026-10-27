// Check: shop status and the client's Money by month chart (Erwin, 27 Oct 2026). A client tags a shop Active or
// Suspended on My Stores (saved, only a label: orders still work), filters by status, and the admin sees the tag.
// Home shows "Money by month" (earned on Etsy, our bill, profit, paid) that follows the store switcher.
// Screenshots EN/HE at 1440 and 390 px.
//   node checks/check-shop-status.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'shop-status');
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
const second = ok(await call('/client-stores', 'POST', { name: 'Second Shop', platform: 'Etsy' }, client)).store;
assert.equal(second.status, 'active', 'new shops start Active');
assert.equal((await call('/client-stores/' + second.id, 'POST', { status: 'paused' }, client)).status, 400, 'only Active or Suspended');
const sus = ok(await call('/client-stores/' + second.id, 'POST', { status: 'suspended' }, client)).store;
assert.equal(sus.status, 'suspended'); assert.equal(sus.name, 'Second Shop', 'other fields kept');
const o = ok(await call('/orders', 'POST', { storeId: second.id, orderRef: 'SUS-1', orderDate: '2026-10-05', buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
ok(await call('/orders/' + o.id, 'PUT', { productCost: 20, shippingFee: 0, sellingPrice: 45, etsyFee: 5 }, admin));
const o2 = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: 'ACT-1', orderDate: '2026-09-12', buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
ok(await call('/orders/' + o2.id, 'PUT', { productCost: 10, shippingFee: 0, sellingPrice: 30, etsyFee: 3 }, admin));
assert.ok(ok(await call('/admin/client-stores?clientId=' + id, 'GET', null, admin)).stores.some(s => s.id === second.id && s.status === 'suspended'), 'admin sees the status');
console.log('PASS shop status: saved, validated, other fields kept, orders still work, admin sees it');
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/stores`); await page.reload(); await page.waitForSelector('[data-store-status]');
    assert.equal(await page.locator('.store-status.suspended').count(), 1, tag + ' one Suspended tag');
    await page.locator('[data-store-status="suspended"]').click(); assert.equal(await page.locator('.store-card').count(), 1, tag + ' filter');
    await page.screenshot({ path: path.join(out, `${tag}-stores.png`) });
    await page.locator('[data-store-status="all"]').click();
    if (lang === 'en' && width === 1440) { // set it back to Active in the form
      const f = page.locator(`[data-client-store-form="${second.id}"]`); await f.locator('input[value=active]').check({ force: true }); await f.locator('[type=submit]').click(); await page.waitForTimeout(600);
      assert.equal(ok(await call('/client-stores', 'GET', null, client)).stores.find(s => s.id === second.id).status, 'active', 'saved from the form');
      ok(await call('/client-stores/' + second.id, 'POST', { status: 'suspended' }, client));
    }
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('[data-client-chart] .mc-svg'); await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-client-chart] [data-mc-key]').count(), 4, tag + ' 4 lines with All stores');
    await page.locator('[data-client-chart]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-home-chart.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    assert.deepEqual(errors, [], tag); await ctx.close();
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.gtabs');
    await ui.locator('.gtabs button').nth(1).click(); await ui.locator('.subtabs [data-ctab=stores]').click(); await page.waitForTimeout(500);
    assert.ok(await ui.locator('.store-status.suspended').count() >= 1, tag + ' admin sees Suspended');
    await page.screenshot({ path: path.join(out, `${tag}-admin-stores.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
