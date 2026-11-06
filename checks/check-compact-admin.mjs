// Compact admin screens + settled cancelled money (Erwin, 6 Nov 2026: Fees & settings and Client products "took so much
// space and needs to scroll so far down"; "cancellation fees to be cleared and the credits when they are all settled").
//   node checks/check-compact-admin.mjs   (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real client/admin screens in Chrome (EN/HE x 1440/390). No live data.
//  - Fees & settings: a tab bar, one section at a time, the last section kept after a reload, arrow keys move (RTL too).
//  - Client products: one short row per product; rows that need us are open, the rest open on a click; filter chips.
//  - Cancelled orders: credit already taken off a later bill shows as used ("Credit left" + "$X used on … bills",
//    left + used = the credit); fees taken from paid money say "Settled" and are not red. Admin and client agree.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'compact-admin');
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
const r2 = n => Math.round(n * 100) / 100, usd = n => '$' + n.toFixed(2);
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
const mk = async (ref, date, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
  ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id;
};
// Two paid orders get cancelled (the second with a $5 supplier fee): what was paid minus the fees is credit.
const A = await mk('SHOP-301', '2026-10-02', 20), B = await mk('SHOP-302', '2026-10-04', 25);
const priceOf = async oid => Number((await DB.prepare('SELECT price FROM client_orders WHERE id=?').bind(oid).first()).price);
ok(await call('/admin/payments', 'POST', { clientId: id, amount: r2(await priceOf(A) + await priceOf(B)), paidAt: '2026-10-05', method: 'Bank transfer', orderIds: [A, B] }, admin));
await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=5 WHERE id=?').bind(B).run();
for (const o of [A, B]) { ok(await call('/orders/' + o + '/request-cancellation', 'POST', { reason: 'Store suspended' }, client)); ok(await call('/orders/' + o + '/approve-cancellation', 'POST', {}, admin)); }
const cx = ok(await call('/payments', 'GET', null, client)).cancelled;
assert.ok(cx.credit > 0 && cx.fees > 0, 'credit and fees to work with'); assert.equal(cx.feesOwed, 0, 'both fees came from paid money');
// A later order is paid with the credit taken off: the credit is used up, nothing is owed.
const D = await mk('SHOP-303', '2026-10-20', 60);
const owes = ok(await call('/me', 'GET', null, client)).summary.outstanding;
assert.equal(owes, r2(await priceOf(D) - cx.credit), 'the new bill minus the credit');

// Products: one waiting for a price, one approved, one not available.
const P = [];
for (const name of ['Glass tea set', 'Brass key hooks', 'Wall coat rack']) P.push((await call('/products', 'POST', { name, link: 'https://detail.1688.com/offer/7', variant: 'Gold', photos: [photo] }, client)).data.product);
await DB.prepare("UPDATE portal_products SET status='approved', unit_price=5.4, supplier_price=4.9 WHERE id=?").bind(P[1].id).run();
await DB.prepare("UPDATE portal_products SET status='not_available' WHERE id=?").bind(P[2].id).run();

const visiblePanels = ui => ui.locator('[data-set-panel]:not([hidden])').evaluateAll(xs => xs.map(x => x.dataset.setPanel));
const cxText = async loc => (await loc.innerText()).replace(/\s+/g, ' ');
let paidD = false;
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // ---- client: Cancelled orders box, before and after the credit was used
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    if (!paidD) {
      await page.goto(`${base}/portal/?lang=en#/payments?tab=cancelled`); await page.reload(); await page.waitForSelector('[data-cancelled-box]');
      const t = await cxText(page.locator('[data-cancelled-box]'));
      assert.ok(t.includes('Credit left ' + usd(cx.credit)) && !t.includes('used on'), 'before: all the credit is still there ' + t);
      ok(await call('/admin/payments', 'POST', { clientId: id, amount: owes, paidAt: '2026-10-21', method: 'Bank transfer', orderIds: [D] }, admin)); paidD = true;
      assert.equal(ok(await call('/me', 'GET', null, client)).summary.outstanding, 0, 'nothing owed');
    }
    await page.goto(`${base}/portal/?lang=${lang}#/payments?tab=cancelled`); await page.reload(); await page.waitForSelector('[data-cancelled-box]'); await page.waitForTimeout(300);
    const box = page.locator('[data-cancelled-box]'), t = await cxText(box);
    if (lang === 'en') {
      assert.ok(t.includes('Credit left $0.00') && t.includes(`${usd(cx.credit)} used on your bills`), tag + ' credit used: ' + t);
      assert.ok(/Cancellation fees \$[\d.]+ Settled/.test(t), tag + ' fees settled: ' + t);
    } else assert.ok(t.includes('זיכוי שנשאר') && t.includes(`${usd(cx.credit)} נוצלו בחשבונות שלך`) && t.includes('סולק'), tag + ' Hebrew: ' + t);
    assert.equal(await box.locator('.cx-stat.neg').count(), 0, tag + ' settled fees are not red');
    await box.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-client-cancelled.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close();

    // ---- admin
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=settings]');
    // Fees & settings: one section at a time
    await ui.evaluate(() => { try { localStorage.removeItem('dl-admin-settings-tab'); } catch {} });
    await ui.locator('[data-tab=settings]').click(); await ui.waitForSelector('.set-tabs');
    assert.deepEqual(await visiblePanels(ui), ['fees'], tag + ' opens on Fees');
    assert.equal(await ui.locator('#settings-form').isVisible(), true); assert.equal(await ui.locator('#bank-form').isVisible(), false);
    await page.screenshot({ path: path.join(out, `${tag}-settings-fees.png`) });
    for (const k of ['bank', 'supplier', 'terms', 'team']) {
      await ui.locator(`[data-set-tab=${k}]`).click(); assert.deepEqual(await visiblePanels(ui), [k], tag + ' ' + k);
      assert.equal(await ui.locator(`[data-set-tab=${k}]`).getAttribute('aria-selected'), 'true');
      await page.screenshot({ path: path.join(out, `${tag}-settings-${k}.png`) });
    }
    await ui.locator('[data-set-tab=bank]').click();
    await ui.locator('[data-set-tab=bank]').press(lang === 'he' ? 'ArrowLeft' : 'ArrowRight');
    assert.deepEqual(await visiblePanels(ui), ['supplier'], tag + ' arrow key moves to the next section');
    await ui.evaluate(() => location.reload()); await ui.waitForSelector('[data-tab=settings]'); await ui.locator('[data-tab=settings]').click(); await ui.waitForSelector('.set-tabs');
    assert.deepEqual(await visiblePanels(ui), ['supplier'], tag + ' remembered after a reload');
    const h = await ui.evaluate(() => document.documentElement.scrollHeight);
    // Client products: short rows, the one waiting for a price is open
    await ui.locator('[data-tab=products]').click(); await ui.waitForSelector(`[data-pq="${P[0].id}"]`);
    assert.equal(await ui.locator(`[data-pq="${P[0].id}"]`).evaluate(d => d.open), true, tag + ' waiting for a price: open');
    assert.equal(await ui.locator(`[data-pq="${P[1].id}"]`).evaluate(d => d.open), false, tag + ' approved: closed');
    assert.equal(await ui.locator(`[data-product-quote="${P[0].id}"] [name=unitPrice]`).isVisible(), true);
    if (lang === 'en') assert.match(await ui.locator(`[data-pq="${P[1].id}"] summary`).innerText(), /Brass key hooks[\s\S]*Approved[\s\S]*\$5\.40/, tag);
    await page.screenshot({ path: path.join(out, `${tag}-products.png`) });
    await ui.locator(`[data-pq="${P[1].id}"] summary`).click();
    assert.equal(await ui.locator(`[data-product-quote="${P[1].id}"] [name=unitPrice]`).inputValue(), '5.4');
    await ui.locator(`[data-pq="${P[1].id}"]`).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-products-open.png`) });
    await ui.locator('[data-pq-filter=todo]').click();
    assert.deepEqual(await ui.locator('[data-pq]').evaluateAll(xs => xs.map(x => Number(x.dataset.pq))), [P[0].id], tag + ' Needs you = the one waiting');
    await ui.locator('[data-pq-filter=all]').click(); assert.equal(await ui.locator('[data-pq]').count(), 3);
    // All clients: Cancelled orders box agrees with the client's
    await ui.locator('[data-tab=clients]').click(); await ui.waitForSelector('[data-cancelled-all]');
    const all = await cxText(ui.locator('[data-cancelled-all]'));
    if (lang === 'en') assert.ok(all.includes('Credit left $0.00') && all.includes(`${usd(cx.credit)} used on their bills`) && /Cancellation fees \$[\d.]+ Settled/.test(all), tag + ' all clients: ' + all);
    assert.equal(await ui.locator('[data-cancelled-all] .cx-stat.neg').count(), 0, tag + ' all clients: fees not red');
    await ui.locator('[data-cancelled-all]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-cancelled.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag, 'settings height', h);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
