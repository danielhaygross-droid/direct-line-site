// Check: cost revisions (Erwin, 27 Oct 2026). A client asks for a lower cost on a priced order and on a quoted product;
// the competitor price is required, one open request at a time, and they can ask again after an answer. The
// supplier's new cost from the sheet waits for an admin; the admin approves (bill = cost + our fee, the client sees
// "Product cost updated" and the answer) or keeps the price with a reply. A new product quote answers the product
// request and is used from then on. Screenshots EN/HE at 1440 and 390 px.
//   node checks/check-cost-revision.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'cost-revision');
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
const { offerFromSheet, competitorCell } = await import('../server/cost-revisions.mjs');
const mk = async (ref, cost) => { const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order; if (cost != null) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id; };
const A = await mk('REV-1', 30), U = await mk('REV-2', null);
const ask = (kind, id, body, who = client) => call(`/${kind}/${id}/cost-revision`, 'POST', body, who);
assert.equal((await ask('orders', A, {})).status, 400, 'competitor price required');
assert.equal((await ask('orders', A, { competitorPrice: 'abc' })).status, 400, 'a number');
assert.equal((await ask('orders', U, { competitorPrice: 20 })).status, 400, 'not before the order is priced');
ok(await ask('orders', A, { competitorPrice: '$24.90', note: 'Sold at 24.90 on Etsy' }));
assert.equal((await ask('orders', A, { competitorPrice: 22 })).status, 409, 'one open request');
let o = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === A);
assert.equal(o.revision.status, 'open'); assert.equal(o.revision.competitorPrice, 24.9); assert.equal(o.revision.offeredCost, undefined, 'client never sees the supplier cost');
assert.equal(o.competitorPrice, '$24.90');
const row = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(A).first();
assert.match(competitorCell(row.competitor_price, row.revision_status), /^COST REVISION REQUESTED: \$24\.90$/, 'what the supplier reads in O');
assert.ok(ok(await call('/admin/notifications', 'GET', null, admin)).items.some(e => e.kind === 'revision_requested' && e.orderId === A), 'admin bell');
// The supplier types a new Total cost in the sheet: held for the admin, the bill does not change.
const before = Number(row.price); await offerFromSheet(DB, row, 20);
const ad = ok(await call('/admin/orders', 'GET', null, admin)).orders.find(x => x.id === A);
assert.equal(ad.revision.status, 'offered'); assert.equal(ad.revision.offeredCost, 20); assert.equal(ad.price, before, 'not billed before approval');
console.log('PASS ask: competitor price required, one open request, supplier offer held for the admin');
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=overview]').click(); assert.ok(await ui.locator('[data-go-filter="revision"]').count() >= 1, tag + ' Needs your attention');
    await ui.locator('[data-tab=orders]').click(); await ui.locator('[data-filter=revision]').click(); await ui.locator(`[data-open-order="${A}"]`).first().click(); await ui.waitForSelector('[data-rev-admin]'); await page.waitForTimeout(300);
    await ui.locator('[data-rev-admin]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-order.png`) });
    assert.equal(await ui.locator('[data-rev-answer] [name=cost]').inputValue(), '20', tag + ' supplier cost filled in');
    assert.deepEqual(errors, [], tag); await ctx.close();
    ctx = await session(client, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.reload(); await page.waitForSelector(`[data-open-order="${A}"]`); await page.locator(`[data-open-order="${A}"]`).first().click(); await page.waitForSelector('[data-rev-box]');
    assert.equal(await page.locator('.rev-line.wait').count(), 1, tag + ' client sees it is waiting'); await page.locator('[data-rev-box]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-client-waiting.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag, 'screens');
  }
  // Admin approves: bill = 20 + fee; the client is told (price changed + answer). Then asks again; admin keeps the price.
  ok(await call(`/admin/orders/${A}/cost-revision`, 'POST', { action: 'approve', cost: 20, reply: 'Supplier lowered it' }, admin));
  o = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === A);
  assert.equal(o.price, 20 + Number(row.commission)); assert.equal(o.revision.status, 'done'); assert.equal(o.revision.result, 'lowered'); assert.equal(o.revision.reply, 'Supplier lowered it');
  const notes = ok(await call('/notifications', 'GET', null, client)).items;
  assert.ok(notes.some(e => e.kind === 'price_changed' && e.orderId === A) && notes.some(e => e.kind === 'revision_answered' && e.orderId === A), 'client told');
  ok(await ask('orders', A, { competitorPrice: 19 }));
  ok(await call(`/admin/orders/${A}/cost-revision`, 'POST', { action: 'keep', reply: 'This is the lowest price' }, admin));
  o = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === A);
  assert.equal(o.revision.result, 'kept'); assert.equal(o.price, 20 + Number(row.commission), 'kept');
  assert.equal((await call(`/admin/orders/${A}/cost-revision`, 'POST', { action: 'keep' }, admin)).status, 409, 'nothing open');
  assert.ok([401, 403].includes((await call(`/admin/orders/${A}/cost-revision`, 'POST', { action: 'keep' }, client)).status), 'clients cannot answer');
  console.log('PASS answer: approve bills cost + fee and tells the client; ask again; keep with reply');
  // Products: quoted -> ask -> a lower quote answers it and is used from then on.
  const pr = ok(await call('/products', 'POST', { link: 'https://example.com/lighter', name: 'Lighter', photos: [photo] }, client)).product;
  assert.equal((await ask('products', pr.id, { competitorPrice: 10 })).status, 400, 'not before a price');
  ok(await call('/admin/products/' + pr.id, 'POST', { status: 'approved', unitPrice: 15, shipping: '', note: '' }, admin));
  ok(await ask('products', pr.id, { competitorPrice: 12 }));
  let p = ok(await call('/products', 'GET', null, client)).products.find(x => x.id === pr.id); assert.equal(p.revision.status, 'open');
  const pc = await session(client, 1440), pp = await pc.newPage(); await pp.goto(`${base}/portal/?lang=en#/products`); await pp.reload(); await pp.locator(`[data-open-product="${pr.id}"]`).first().click(); await pp.waitForSelector('[data-rev-box]'); await pp.screenshot({ path: path.join(out, 'en-1440-client-product.png') }); await pc.close();
  ok(await call('/admin/products/' + pr.id, 'POST', { status: 'approved', unitPrice: 12.5, shipping: '', note: '' }, admin));
  p = ok(await call('/products', 'GET', null, client)).products.find(x => x.id === pr.id); assert.equal(p.revision.status, 'done'); assert.equal(p.revision.result, 'lowered'); assert.equal(p.unitPrice, 12.5);
  ok(await ask('products', pr.id, { competitorPrice: 11 }));
  ok(await call('/admin/products/' + pr.id + '/cost-revision', 'POST', { action: 'keep', reply: 'Best price' }, admin));
  p = ok(await call('/products', 'GET', null, client)).products.find(x => x.id === pr.id); assert.equal(p.revision.result, 'kept'); assert.equal(p.revision.reply, 'Best price');
  console.log('PASS products: ask after a price, new quote answers it, keep with reply');
  // From the screen: the form needs the price, then the request is sent.
  const B = await mk('REV-3', 25), c2 = await session(client, 390), pg2 = await c2.newPage();
  await pg2.goto(`${base}/portal/?lang=he#/orders`); await pg2.reload(); await pg2.locator(`[data-open-order="${B}"]`).first().click(); await pg2.locator('.rev-ask').scrollIntoViewIfNeeded(); await pg2.screenshot({ path: path.join(out, 'he-390-client-ask.png') }); await pg2.locator('[data-ask-revision]').click();
  await pg2.locator('[data-rev-form] [type=submit]').click(); assert.equal(await pg2.locator('[data-rev-msg].err').count(), 1, 'required on screen');
  await pg2.locator('[data-rev-form] [name=competitorPrice]').fill('21.5'); await pg2.screenshot({ path: path.join(out, 'he-390-client-form.png') });
  await pg2.locator('[data-rev-form] [type=submit]').click(); await pg2.waitForSelector('.rev-line.wait');
  assert.equal(ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === B).revision.competitorPrice, 21.5); await c2.close();
  console.log('PASS client form: required price, request sent from the order panel');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
