// Supplier portal: Accept new orders and edit prices, tracking and details at any time (Erwin, 25 Nov 2026).
//   node checks/check-supplier-edit-anytime.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'supplier-edit-anytime');
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

const { admin, client } = await seed();
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async (ref) => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Wool felt slippers', variant: 'EU 41', buyerName: 'Jane Buyer', address1: '1 St', city: 'Austin', destination: 'US', etsyUrl: 'https://example.com/' + ref, photos: [photo] }, client)).order.id;
const ids = []; for (let i = 0; i < 8; i++) ids.push(await mk('4263000' + String(i).padStart(3, '0')));
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const put = (id, field, value) => call('/supplier/orders/' + id, 'PUT', { field, value }, sup);
const row = id => DB.prepare('SELECT * FROM client_orders WHERE id = ?').bind(id).first();
const ev = async (id, kind) => ((await DB.prepare('SELECT detail FROM order_events WHERE order_id = ? AND kind = ? ORDER BY id').bind(id, kind).all()).results || []).map(r => r.detail);
const wait = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };

// ---- API ----
const [a, b, c, d] = ids;
assert.equal((await row(a)).status, 'pending');
ok(await put(a, 'accept', true)); assert.equal((await row(a)).status, 'processing', 'Accept -> Processing');
assert.equal((await put(a, 'accept', true)).status, 409, 'accepting twice is refused');
assert.ok((await ev(a, 'supplier_sheet')).some(x => /"f":"accepted"/.test(x)), 'admin is told it was accepted');
// Shipped: the cost can still change (client's bill follows, admin told), and it can be set back.
ok(await put(b, 'cost', '12.50')); ok(await put(b, 'tracking', 'UL706844511YP')); ok(await put(b, 'shipped', true));
assert.equal((await row(b)).status, 'shipped');
ok(await put(b, 'cost', '14.00')); assert.equal(Number((await row(b)).supplier_cost), 14, 'cost changed after shipping');
assert.ok((await ev(b, 'supplier_sheet')).some(x => /"f":"cost"/.test(x) && /14\.00/.test(x)), 'admin sees the cost change');
ok(await put(b, 'tracking', 'UL706844522YP')); assert.equal((await row(b)).tracking_number, 'UL706844522YP', 'tracking fixed after shipping');
ok(await put(b, 'shipped', false)); assert.equal((await row(b)).status, 'processing', 'set back to not shipped');
// Cancelled: cost recorded only (no new bill), tracking and details still editable.
ok(await put(c, 'cost', '10.00')); const priceBefore = Number((await row(c)).price);
ok(await call('/orders/' + c, 'PUT', { status: 'cancelled' }, admin)); assert.equal((await row(c)).status, 'cancelled');
ok(await put(c, 'cost', '11.00')); assert.equal(Number((await row(c)).supplier_cost), 11); assert.equal(Number((await row(c)).price), priceBefore, 'a cancelled order is not billed again');
ok(await put(c, 'tracking', 'UL706844533YP')); ok(await put(c, 'itemCosts', '11.00'));
// Details: product, qty, address; checked, logged for admin and client.
ok(await put(d, 'details', { itemTitle: 'Wool felt slippers (grey)', variant: 'EU 42', qty: 2, buyer: 'Jane Q Buyer', address1: '2 Elm St', address2: 'Apt 3', city: 'Dallas', region: 'TX', zip: '75001' }));
const rd = await row(d); assert.deepEqual([rd.item_title, rd.variant, Number(rd.quantity), rd.buyer_name, rd.address_line_1, rd.city, rd.region, rd.postal_code], ['Wool felt slippers (grey)', 'EU 42', 2, 'Jane Q Buyer', '2 Elm St', 'Dallas', 'TX', '75001']);
assert.ok((await ev(d, 'supplier_sheet')).some(x => /"f":"details"/.test(x)), 'admin sees details edited'); assert.equal((await ev(d, 'edited')).length, 1, 'order history says edited');
assert.equal((await put(d, 'details', { qty: 0 })).status, 400); assert.equal((await put(d, 'details', { city: '' })).status, 400);
assert.notEqual((await call('/supplier/orders/' + d, 'PUT', { field: 'details', value: { city: 'X' } }, client)).status, 200, 'clients cannot use it');
console.log('PASS API: accept, cost/tracking after shipping, set back, cancelled cost recorded only, details (checked + logged)');

// ---- screens ----
try {
  let n = 4;
  for (const lang of ['en', 'zh']) for (const w of [1440, 390]) {
    const tag = `${lang}-${w}`, ctx = await session(sup, w), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', dl => dl.accept());
    await page.goto(`${base}/supplier/?lang=${lang}#orders`); await page.locator('[data-tab=all] >> visible=true').first().click();
    const id = ids[n++]; await page.waitForSelector(`[data-accept="${id}"] >> visible=true`);
    await page.screenshot({ path: path.join(out, `${tag}-accept.png`) });
    await page.locator(`[data-accept="${id}"] >> visible=true`).first().click();
    assert.ok(await wait(async () => (await row(id)).status === 'processing'), tag + ': Accept saved');
    await page.waitForSelector(`[data-accept="${id}"]`, { state: 'detached' });
    // A shipped order: cost box is open now.
    assert.equal(await page.locator(`[data-row="${b}"] [data-f=cost] >> visible=true`).first().isDisabled(), false, tag + ': cost editable on any order');
    // Edit details: from the phone card (More) or the order window.
    if (w === 390) { await page.locator(`.sp-ocard[data-row="${id}"] details.sp-fold > summary`).click(); await page.locator(`.sp-ocard[data-row="${id}"] [data-edit-details]`).click(); }
    else { await page.locator(`[data-row="${id}"] [data-open="${id}"] >> visible=true`).first().click(); await page.locator(`#sp-drawer [data-edit-details="${id}"]`).click(); }
    await page.waitForSelector('dialog.sp-dw[open]');
    assert.ok(await page.evaluate(() => { const r = document.querySelector('dialog.sp-dw').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), tag + ': window fits');
    await page.screenshot({ path: path.join(out, `${tag}-details.png`) });
    await page.locator('dialog.sp-dw [name=city]').fill('Houston ' + tag); await page.locator('dialog.sp-dw [type=submit]').click();
    assert.ok(await wait(async () => (await row(id)).city === 'Houston ' + tag), tag + ': details saved');
    await page.waitForSelector('dialog.sp-dw', { state: 'detached' });
    assert.deepEqual(errors, [], tag + ': no page errors'); await ctx.close();
  }
  console.log('PASS supplier screens: Accept, cost open on shipped orders, Edit details window (EN, 中文, 1440, 390)');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
