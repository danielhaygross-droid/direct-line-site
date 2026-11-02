// Possible duplicate orders (Erwin, 2 Nov 2026): the same Etsy order number, or the same customer + product within a
// day: the client is asked first ("Looks like a duplicate"), sent anyway the admin bell says so. Cancelled orders don't count.
//   node checks/check-duplicates.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'duplicates');
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
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url), fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(fixture)).toString('base64') };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const LINK = 'https://www.etsy.com/listing/4588909425/wooden-wall-hook-rack';
const send = (ref, buyer, extra = {}) => call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: buyer, address1: '1 Sample St, Springfield', destination: 'US', photos: [photo], items: [{ link: LINK, quantity: 1, variant: 'Black' }], confirmDuplicate: false, ...extra }, client);

// API
const first = ok(await send('#4216451841', 'Allen Blanchard')).order;
let r = await send('4216451841', 'Someone Else');
assert.equal(r.status, 409); assert.equal(r.data.duplicate.why, 'ref', 'same order number (with or without #)'); assert.equal(r.data.duplicate.id, first.id);
r = await send('#999', ' allen  BLANCHARD ');
assert.equal(r.status, 409); assert.equal(r.data.duplicate.why, 'customer', 'same customer + same product within a day');
ok(await send('#1000', 'Another Buyer'));  // a different order: no question
const again = ok(await send('#4216451841', 'Allen Blanchard', { confirmDuplicate: true })).order;
const ev = (await DB.prepare("SELECT * FROM order_events WHERE order_id=? AND kind='duplicate'").bind(again.id).all()).results;
assert.equal(ev.length, 1); assert.match(ev[0].detail, /same order number as #4216451841/);
assert.ok(ok(await call('/admin/notifications', 'GET', null, admin)).items.some(x => x.kind === 'duplicate' && x.orderId === again.id), 'the admin bell gets it');
assert.ok(ok(await call('/admin/orders', 'GET', null, admin)).orders.find(o => o.id === again.id).updates.some(u => u.kind === 'duplicate'), 'and the order tag');
// A cancelled order is not a duplicate.
const c = ok(await send('#555', 'Cancel Me')).order;
ok(await call('/orders/' + c.id + '/request-cancellation', 'POST', { reason: 'test' }, client)); ok(await call('/orders/' + c.id + '/approve-cancellation', 'POST', {}, admin));
assert.equal((await send('#555', 'Cancel Me')).status, 200, 'resending a cancelled order is fine');
// Admins get the same question (Save again to send it anyway).
assert.equal((await call('/orders', 'POST', { clientId: id, storeId: store.id, orderRef: '#1000', buyerName: 'X', address1: '1 St', destination: 'US', confirmDuplicate: false }, admin)).status, 409);
console.log('PASS duplicates: same order number or same customer + product today asked first; sent anyway = admin told; cancelled ones and other orders not');

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`, ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/new`); await page.reload(); await page.waitForSelector('#order-form [data-prod]');
    const f = page.locator('#order-form');
    await f.locator('[name=orderRef]').fill('#1000');
    await f.locator('[data-prod] [data-link]').first().fill(LINK);
    await f.locator('[data-var] [data-qty]').first().fill('1');
    await f.locator('[name=buyerName]').fill('Browser Buyer ' + tag); await f.locator('[name=address1]').fill('1 Sample Street, Springfield IL 62701');
    await f.locator('[name=destination]').selectOption('US');
    const line = f.locator('[data-var] [data-line-input]');
    await (await line.count() ? line.first() : f.locator('input[type=file]').first()).setInputFiles(fixturePath); await page.waitForTimeout(600);
    const before = ok(await call('/orders', 'GET', null, client)).orders.length;
    await page.locator('[data-submit]').click(); await page.waitForSelector('[data-dup]:not([hidden])');
    assert.match(await page.locator('[data-dup]').innerText(), lang === 'he' ? /כבר שלחת את מספר ההזמנה הזה/ : /You already sent this order number/, tag);
    assert.equal(ok(await call('/orders', 'GET', null, client)).orders.length, before, tag + ' nothing saved yet');
    await page.locator('[data-dup]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-ask.png`) });
    await page.locator('[data-dup-send]').click(); await page.waitForFunction(() => location.hash.startsWith('#/orders'), null, { timeout: 30000 });
    assert.equal(ok(await call('/orders', 'GET', null, client)).orders.length, before + 1, tag + ' sent anyway');
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
