// Shorter long lists and panels everywhere else (Erwin, 7 Nov 2026: "improve every section", admin and client portal).
//   node checks/check-compact-rest.mjs   (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real admin/client screens in Chrome (EN/HE x 1440/390). No live data.
// 110 orders, 25 clients, 25 products. Prints the height of each screen (MEASURE=1 prints only, no asserts).
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'compact-rest');
await mkdir(out, { recursive: true });
const MEASURE = !!process.env.MEASURE;

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
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };

// 24 more clients (clients will grow; Erwin, 7 Nov 2026), each with one order so the table has numbers.
for (let i = 1; i <= 24; i++) {
  const c = ok(await call('/admin/users', 'POST', { username: 'client' + i, name: 'Sample Client ' + i, password: 'clientpass123', role: 'client' }, admin));
  ok(await call('/orders', 'POST', { clientId: c.id, orderRef: 'C' + i, buyerName: 'Sample', destination: 'US', address1: '1 Sample St', productCost: 10, shippingFee: 2 }, admin));
}
// 110 orders for the main client: one through the API (photo, cost), 109 SQL copies, each newer.
const first = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: 'OLDEST-1', orderDate: '2026-10-01', buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
ok(await call('/orders/' + first.id, 'PUT', { productCost: 20, shippingFee: 4 }, admin));
// Some history on it: the order view shows the newest 3 events, the rest behind Show all.
for (const status of ['processing', 'shipped', 'processing', 'shipped']) ok(await call('/orders/' + first.id, 'PUT', { status }, admin));
const cols = (await DB.prepare("SELECT column_name FROM information_schema.columns WHERE table_name = 'client_orders' AND column_name NOT IN ('id', 'order_ref', 'created_at')").all()).results.map(r => r.column_name);
const t0 = Number((await DB.prepare('SELECT created_at FROM client_orders WHERE id = ?').bind(first.id).first()).created_at);
await DB.prepare(`INSERT INTO client_orders (order_ref, created_at, ${cols.join(', ')}) SELECT 'SHOP-' || (1000 + n), ? + n, ${cols.join(', ')} FROM client_orders, generate_series(1, 109) AS n WHERE id = ?`).bind(t0, first.id).run();
// 8 of those clients cancelled their order: the "Cancelled orders, all clients" box shows 5 rows, then Show all.
await DB.prepare("UPDATE client_orders SET status='cancelled' WHERE order_ref IN ('C1','C2','C3','C4','C5','C6','C7','C8')").run();
// 25 products.
for (let i = 1; i <= 25; i++) ok(await call('/products', 'POST', { name: 'Sample product ' + i, link: 'https://detail.1688.com/offer/' + i, variant: 'Gold', photos: [photo] }, client));

const H = {};
const note = (k, v) => { H[k] = v; };
const docH = f => f.evaluate(() => document.documentElement.scrollHeight);
const drawerH = f => f.evaluate(() => { const d = document.querySelector('aside.drawer'); return d ? Math.max(...[d, ...d.querySelectorAll('*')].map(x => x.scrollHeight)) : 0; });
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // ---- admin
    let ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.evaluate(() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('dl-fold-')) localStorage.removeItem(k); } catch {} });
    for (const t of ['overview', 'orders', 'clients']) {
      await ui.locator(`[data-tab=${t}]`).click(); await ui.waitForTimeout(400);
      note(`${tag} admin ${t}`, await docH(ui));
      await page.screenshot({ path: path.join(out, `${tag}-admin-${t}.png`) });
      if (MEASURE) continue;
      if (t === 'overview') {
        // The month picker is on the title line (one row less) and still lists the months.
        assert.equal(await ui.locator('[data-adm-head] [data-kpi-month]').isVisible(), true, tag + ' month picker in the head');
        assert.ok(await ui.locator('[data-kpi-month] option').count() >= 2, tag + ' months listed');
      }
      if (t === 'orders') {
        // All orders, newest first: 50 rows, then Show 50 more; the counts still count all 110.
        await ui.locator('[data-filter=all]').click();
        assert.equal(await ui.locator('[data-open-order]').count(), 50, tag + ' 50 orders shown');
        assert.match(await ui.locator('[data-filter=all] span').innerText(), /^1\d\d$/, tag + ' the All chip counts every order');
        if (lang === 'en') assert.match(await ui.locator('[data-list-more-bar=orders]').innerText(), /Show 50 more[\s\S]*50 of 134 shown/, tag);
        await ui.locator('[data-list-more=orders]').click();
        assert.equal(await ui.locator('[data-open-order]').count(), 100, tag + ' Show 50 more adds 50');
        await ui.locator('[data-list-more=orders]').click();
        assert.equal(await ui.locator('[data-open-order]').count(), 134, tag + ' then the rest');
        assert.equal(await ui.locator('[data-list-more=orders]').count(), 0, tag + ' no button when all are shown');
        // A search finds an old order that was not on the first page, and starts again at 50.
        await ui.locator('[data-q]').fill('OLDEST-1'); await ui.waitForTimeout(200);
        assert.equal(await ui.locator('[data-open-order]').count(), 1, tag + ' search finds the oldest order');
        await ui.locator('[data-q]').fill(''); await ui.waitForTimeout(200);
        assert.equal(await ui.locator('[data-open-order]').count(), 50, tag + ' a new search starts again at 50');
        // Select all = the rows on screen.
        await ui.locator('[data-pick-all]').check();
        assert.equal(await ui.locator('[data-pick]:checked').count(), 50, tag + ' select all picks the 50 shown');
        await ui.locator('[data-pick-all]').uncheck();
      }
      if (t === 'clients') {
        assert.equal(await ui.locator('[data-list] [data-open-client]').count(), 20, tag + ' 20 clients shown');
        await ui.locator('[data-list-more=clients]').click();
        assert.equal(await ui.locator('[data-list] [data-open-client]').count(), 25, tag + ' then the other 5');
        await ui.locator('[data-cq]').fill('Client 24'); await ui.waitForTimeout(200);
        assert.equal(await ui.locator('[data-list] [data-open-client]').count(), 1, tag + ' search looks through every client');
        await ui.locator('[data-cq]').fill(''); await ui.waitForTimeout(200);
        const cx = ui.locator('[data-cancelled-all]');
        assert.equal(await cx.locator('tbody tr:visible').count(), 5, tag + ' cancelled box: 5 clients');
        await cx.locator('[data-cx-all]').click();
        assert.equal(await ui.locator('[data-cancelled-all] tbody tr:visible').count(), 8, tag + ' Show all: the 8 clients');
        await ui.locator('[data-cancelled-all]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-cancelled-box.png`) });
      }
    }
    // Order panel: Details, Receipts, Fee and photos fold to one line; Status and Money stay open.
    await ui.locator('[data-tab=orders]').click(); await ui.locator('[data-q]').fill('OLDEST-1'); await ui.waitForTimeout(200);
    await ui.locator(`[data-open-order="${first.id}"]`).click(); await ui.waitForSelector('aside.drawer [data-d-info] section'); await ui.waitForTimeout(400);
    note(`${tag} admin order panel`, await drawerH(ui));
    await page.screenshot({ path: path.join(out, `${tag}-admin-order-panel.png`) });
    if (!MEASURE) {
      for (const k of ['op-media', 'op-receipts', 'op-details', 'op-fee']) assert.equal(await ui.locator(`[data-fold="${k}"]`).evaluate(d => d.open), false, tag + ' folded: ' + k);
      if (lang === 'en') {
        assert.match(await ui.locator('[data-fold="op-media"] summary').innerText(), /1 photo · link/, tag);
        assert.match(await ui.locator('[data-fold="op-details"] summary').innerText(), /Sample Buyer · United States/, tag);
        assert.match(await ui.locator('[data-fold="op-fee"] summary').innerText(), /\$\d+\.\d\d/, tag);
      }
      assert.equal(await ui.locator('aside.drawer [data-track-form]').isVisible(), true, tag + ' tracking form open');
      // Order activity: the newest 3, then Show all.
      assert.equal(await ui.locator('aside.drawer .order-activity li:visible').count(), 3, tag + ' 3 events shown');
      await ui.locator('aside.drawer .act-more summary').click();
      assert.ok(await ui.locator('aside.drawer .order-activity li:visible').count() > 3, tag + ' Show all opens the rest');
      await ui.locator('[data-fold="op-details"] summary').click();
      assert.equal(await ui.locator('aside.drawer [data-copy]').isVisible(), true, tag + ' Details open on a click');
      await ui.locator('[data-fold="op-details"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-order-details-open.png`) });
      await ui.locator('[data-fold="op-details"] summary').click();
    }
    await ui.locator('aside.drawer [data-d-close]').click(); await ui.waitForTimeout(300);
    await ui.locator('[data-adm-head] [data-new-order]').click(); await ui.waitForTimeout(500);
    note(`${tag} admin new order`, await drawerH(ui));
    await page.screenshot({ path: path.join(out, `${tag}-admin-new-order.png`) });
    if (!MEASURE) {
      // The optional parts (shipping & bill, notes) are folded; one click opens them.
      assert.deepEqual(await ui.locator('[data-af-fold]').evaluateAll(xs => xs.map(x => x.open)), [false, false], tag + ' optional parts folded');
      await ui.locator('[data-af-fold=bill] summary').click();
      assert.equal(await ui.locator('#order-form [name=productCost]').isVisible(), true, tag + ' Shipping & bill opens');
      await ui.locator('[data-af-fold=bill]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-new-order-bill.png`) });
    }
    assert.deepEqual(errors, [], tag + ' admin'); await ctx.close();

    // ---- client
    ctx = await session(client, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const r of ['orders', 'new', 'products']) {
      await page.goto(`${base}/portal/?lang=${lang}#/${r}`); await page.reload(); await page.waitForSelector('#view form, #view .card, #view table', { state: 'attached' }); await page.waitForTimeout(500);
      note(`${tag} client ${r}`, await docH(page));
      await page.screenshot({ path: path.join(out, `${tag}-client-${r}.png`) });
      if (MEASURE) continue;
      if (r === 'orders') {
        // 30 orders, then Show 30 more; the search still finds the oldest one.
        const rows = () => page.locator('[data-orders-list] tbody tr').count();
        await page.locator('[data-filter=all]').click().catch(() => {}); await page.waitForTimeout(200);
        assert.equal(await rows(), 30, tag + ' client: 30 orders shown');
        if (lang === 'en') assert.match(await page.locator('[data-list-more-bar=orders]').innerText(), /Show 30 more[\s\S]*30 of 110 shown/, tag);
        await page.locator('[data-list-more=orders]').click();
        assert.equal(await rows(), 60, tag + ' client: Show 30 more adds 30');
        await page.locator('[data-q]').fill('OLDEST-1'); await page.waitForTimeout(200);
        assert.equal(await rows(), 1, tag + ' client: search finds the oldest order');
        // The order view: the newest 3 events, the rest behind Show all.
        await page.locator(`[data-orders-list] [data-open-order="${first.id}"]`).first().click(); await page.waitForSelector('aside.drawer .order-activity');
        await page.waitForTimeout(300);
        assert.equal(await page.locator('aside.drawer .order-activity li:visible').count(), 3, tag + ' client order view: 3 events');
        await page.locator('aside.drawer .act-more').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-client-order-view.png`) });
        await page.locator('aside.drawer .act-more summary').click();
        assert.ok(await page.locator('aside.drawer .order-activity li:visible').count() > 3, tag + ' client: Show all opens the rest');
      }
      if (r === 'products') {
        if (lang === 'en') assert.match(await page.locator('[data-list-more-bar=products]').innerText(), /Show 5 more[\s\S]*20 of 25 shown/, tag);
        await page.locator('[data-list-more=products]').click();
        assert.equal(await page.locator('[data-list-more=products]').count(), 0, tag + ' client: all 25 products shown');
      }
    }
    assert.deepEqual(errors, [], tag + ' client'); await ctx.close();
  }
} finally { console.table(H); await browser.close(); server.close(); }
console.log('PASS compact-rest');
