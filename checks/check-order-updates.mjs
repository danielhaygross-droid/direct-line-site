// What changed on an order (Erwin, 2 Nov 2026): admin Client orders puts orders with unseen client updates first with a
// tag per change (New order, New message…), opening one clears it (here and in the bell's read state); the client's
// Orders do the same for our updates (Now In Progress, Tracking added…). The bell's history pages and searches.
//   node checks/check-order-updates.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'order-updates');
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
const mk = async ref => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Buyer ' + ref, address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
const A = await mk('UPD-1'), B = await mk('UPD-2'), C = await mk('UPD-3');
// Spread the "created" events in time, then the client writes on B (B is the latest update).
await DB.prepare("UPDATE order_events SET created_at = created_at - 300 WHERE kind = 'created'").run();
ok(await call('/orders/' + B.id + '/messages', 'POST', { body: 'Can you check the size?' }, client));
// We move A on and add tracking: the client sees it.
ok(await call('/orders/' + A.id, 'PUT', { productCost: 10, shippingFee: 2 }, admin)); ok(await call('/orders/' + A.id, 'PUT', { status: 'processing' }, admin));
ok(await call('/orders/' + A.id, 'PUT', { trackingNumber: 'UL123456789YP', courier: 'Yanwen' }, admin));

// Bell history: pages (?before=) and search (?q=) reach old notifications.
const page1 = ok(await call('/admin/notifications?limit=2', 'GET', null, admin));
assert.equal(page1.items.length, 2); assert.equal(page1.hasMore, true, 'more pages');
const last = page1.items[page1.items.length - 1];
const page2 = ok(await call(`/admin/notifications?limit=10&before=${last.createdAt}&beforeId=${last.id}`, 'GET', null, admin));
const all = ok(await call('/admin/notifications?limit=50', 'GET', null, admin)).items;
assert.deepEqual([...page1.items, ...page2.items].map(x => x.id), all.map(x => x.id), 'pages join up with nothing skipped or repeated (same-second events too)');
const hit = ok(await call('/admin/notifications?q=UPD-3', 'GET', null, admin));
assert.ok(hit.items.length >= 1 && hit.items.every(x => x.orderRef === 'UPD-3'), 'search by order number');
assert.ok(ok(await call('/admin/notifications?q=size', 'GET', null, admin)).items.some(x => x.kind === 'message'), 'search by text');
const ords = ok(await call('/admin/orders', 'GET', null, admin)).orders;
assert.deepEqual(ords.find(o => o.id === B.id).updates.map(u => u.kind), ['message', 'created'], 'B: message then created');
console.log('PASS notification history: pages, search; each admin order carries its updates');

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // Admin: nothing read yet in this browser.
    let ctx = await session(admin, width); await ctx.addInitScript(() => { if (!sessionStorage.getItem('dl_t')) { sessionStorage.setItem('dl_t', '1'); localStorage.setItem('dl_notif_read_at', '1'); localStorage.removeItem('dl_notif_read_ids'); } });
    let page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.waitForSelector('[data-sort=admin-orders-2]'); await page.waitForTimeout(500);
    assert.equal(await ui.locator('[data-sort=admin-orders-2]').inputValue(), 'updates', tag + ' new updates first by default');
    assert.equal(await ui.locator('[data-filter=updates] span').innerText(), '3', tag + ' 3 orders with updates');
    const refs = await ui.locator('tbody tr[data-open-order]').evaluateAll(rs => rs.map(r => r.dataset.openOrder));
    assert.equal(Number(refs[0]), B.id, tag + ' B (latest update) first');
    const tagsB = await ui.locator(`tr[data-open-order="${B.id}"] .upd-tag`).allInnerTexts();
    assert.deepEqual(tagsB, lang === 'he' ? ['הודעה חדשה', 'הזמנה חדשה'] : ['New message', 'New order'], tag + ' B tags');
    await page.screenshot({ path: path.join(out, `${tag}-admin.png`) });
    await ui.locator(`tr[data-open-order="${B.id}"] td.wide`).click(); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    assert.equal(await ui.locator(`tr[data-open-order="${B.id}"] .upd-tag`).count(), 0, tag + ' opening B clears its tags');
    assert.equal(await ui.locator('[data-filter=updates] span').innerText(), '2', tag + ' 2 left');
    assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem('dl_notif_read_ids')))).length >= 2, tag + ' shared with the bell');
    assert.deepEqual(errors, [], tag); await ctx.close();
    // Client: our updates on A.
    ctx = await session(client, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.reload(); await page.waitForSelector('[data-sort=portal-orders-2]'); await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-sort=portal-orders-2]').inputValue(), 'updates', tag + ' client: updates first');
    const first = await page.locator('[data-orders-list] tbody tr[data-open-order]').first().getAttribute('data-open-order');
    assert.equal(Number(first), A.id, tag + ' client: A first');
    const tagsA = await page.locator(`[data-orders-list] tr[data-open-order="${A.id}"] .upd-tag`).allInnerTexts();
    // 5 Nov 2026: no "Now In Progress" tag next to the In Progress pill (the status is said once); other updates stay.
    assert.ok(tagsA.includes(lang === 'he' ? 'נוסף מספר מעקב' : 'Tracking added') && !tagsA.includes(lang === 'he' ? 'עכשיו בטיפול' : 'Now In Progress'), tag + ' client tags: ' + tagsA.join(', '));
    await page.screenshot({ path: path.join(out, `${tag}-portal.png`) });
    await page.locator(`[data-orders-list] tr[data-open-order="${A.id}"]`).click(); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('[data-orders-list] tbody tr'); await page.waitForTimeout(500);
    assert.equal(await page.locator(`[data-orders-list] tr[data-open-order="${A.id}"] .upd-tag`).count(), 0, tag + ' client: opening A clears it');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
