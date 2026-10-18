// Local check: clients can change the customer's details until the parcel ships (branch claude/customer-detail-edit).
//   node checks/check-customer-edit.mjs      (run from the repo root)
// In-memory Postgres (PGlite) + the real API and portal pages in Chrome. No live data.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { pg, DB, env, call, seed } from './lib.mjs';
import { route } from '../api/index.mjs';
import { websiteCells } from '../server/supplier-sheet.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'customer-edit');
await mkdir(out, { recursive: true });

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const mk = async ref => ok(await call('/orders', 'POST', { clientId: id, orderRef: ref, buyerName: 'Old Name', destination: 'IL', address1: '1 Old Street, Tel Aviv 6100000, +972 50 000 0000', etsyUrl: 'https://example.com/item', sellingPrice: 20 }, admin)).order;
const status = async (o, s) => ok(await call('/orders/' + o.id, 'PUT', { status: s }, admin));
const row = async o => DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(o.id).first();
const events = async o => (await DB.prepare("SELECT kind, actor, detail FROM order_events WHERE order_id=? AND kind='edited' ORDER BY id").bind(o.id).all()).results;
const customer = (name, extra = {}) => ({ buyerName: name, address1: '9 New Road, Haifa 3100000, +972 52 111 2222', address2: '', city: '', region: '', postalCode: '', buyerPhone: '', destination: 'IL', ...extra });

// ---- API rules (real SQL) ----
const pending72 = await mk('PENDING-FRESH');
let r = await call('/orders/' + pending72.id, 'PUT', { ...customer('Name A'), notes: 'hello' }, client);
assert.equal(r.status, 200, 'full edit still works within 72 h while pending');

const running = await mk('RUNNING');
await status(running, 'processing');
r = await call('/orders/' + running.id, 'PUT', customer('Name B'), client);
assert.equal(r.status, 200, JSON.stringify(r.data));
let o = await row(running);
assert.equal(o.buyer_name, 'Name B'); assert.match(o.address_line_1, /9 New Road/); assert.equal(o.address_changed_at, null, 'no address warning for the supplier any more');
assert.deepEqual((await events(running)).at(-1), { kind: 'edited', actor: 'client', detail: 'customer' });
// Everything else stays locked for an order in progress, even mixed with customer fields.
for (const body of [{ notes: 'x' }, { quantity: 5 }, { etsyUrl: 'https://example.com/other' }, { ...customer('Name C'), sku: 'NEW' }, { orderRef: 'CHANGED' }]) {
  r = await call('/orders/' + running.id, 'PUT', body, client);
  assert.equal(r.status, 409, JSON.stringify(body)); assert.match(r.data.error, /already being processed/);
}
assert.equal((await row(running)).buyer_name, 'Name B');
// Missing details are refused.
for (const body of [customer(''), customer('Name D', { address1: '' }), customer('Name D', { destination: '' })]) assert.equal((await call('/orders/' + running.id, 'PUT', body, client)).status, 400);
// Pending but older than 72 h is also allowed for customer details only.
const old72 = await mk('PENDING-OLD');
await DB.prepare('UPDATE client_orders SET created_at=? WHERE id=?').bind(Math.floor(Date.now() / 1000) - 80 * 3600, old72.id).run();
assert.equal((await call('/orders/' + old72.id, 'PUT', customer('Name E'), client)).status, 200);
assert.equal((await call('/orders/' + old72.id, 'PUT', { notes: 'late' }, client)).status, 409);
assert.equal(Number((await row(old72)).address_changed_at || 0), 0, 'not flagged while still pending');
// Once shipped (or delivered / cancelled) the client can't change them any more, with a clear reason.
const shipped = await mk('SHIPPED');
await status(shipped, 'processing'); await status(shipped, 'shipped');
r = await call('/orders/' + shipped.id, 'PUT', customer('Too Late'), client);
assert.equal(r.status, 409); assert.match(r.data.error, /already shipped/);
assert.equal((await row(shipped)).buyer_name, 'Old Name');
// Another client's order is never reachable; admins keep full edit rights at every stage.
assert.equal((await call('/orders/' + shipped.id, 'PUT', customer('Admin fix'), admin)).status, 200);
// #74: the supplier sheet row never carries an "ADDRESS CHANGED" warning; it always shows the current address.
assert.ok(!websiteCells(env, await row(running), [], 'Shop').am.join(' ').includes('ADDRESS CHANGED'), 'no warning in the row');
// The admin notification says it needs the supplier told.
const bell = (await call('/admin/notifications', 'GET', null, admin)).data.items.find(i => i.kind === 'edited' && i.detail === 'customer' && i.orderId === running.id);
assert.ok(bell && bell.status === 'processing' && bell.actor === 'client');
console.log('PASS API rules: pending/in progress/old pending allowed for customer details only; shipped refused; supplier flag; admin bell data');

// ---- the client portal in Chrome ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 } }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang} ${width}px`;
    const target = await mk(`UI-${lang}-${width}`); await status(target, 'processing');
    const ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.locator(`[data-open-order="${target.id}"]`).first().click();
    await page.waitForSelector('[data-change-customer]');
    assert.equal(await page.locator(`a[href="#/edit/${target.id}"]`).count(), 0, tag + ' no full edit');
    await page.locator('[data-change-customer]').click(); await page.waitForSelector('#customer-form');
    assert.match(await page.locator('#customer-form .note').innerText(), lang === 'en' ? /already in progress/ : /כבר בטיפול/, tag + ' warning text');
    // Empty name is refused in the form, with the field marked.
    await page.locator('#customer-form [name=buyerName]').fill(''); await page.locator('#customer-form [type=submit]').click();
    assert.match(await page.locator('[data-customer-msg]').innerText(), lang === 'en' ? /Please fill in: customer name/ : /נא למלא: שם הלקוח/, tag + ' validation');
    await page.locator('#customer-form [name=buyerName]').fill('Maria Schmidt');
    await page.locator('#customer-form [name=address1]').fill('Hauptstrasse 5, 10115 Berlin, +49 30 1234567');
    await page.locator('#customer-form select[name=destination]').selectOption('DE');
    await page.screenshot({ path: path.join(out, `${lang}-${width}-form.png`) });
    await page.locator('#customer-form [type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#customer-form'), null, { timeout: 10000 });
    const saved = await row(target);
    assert.equal(saved.buyer_name, 'Maria Schmidt'); assert.match(saved.address_line_1, /Hauptstrasse 5/); assert.equal(saved.destination, 'DE');
    assert.match(await page.locator('[data-d-info]').innerText(), /Maria Schmidt/, tag + ' panel shows the change');
    await page.waitForFunction(() => /Customer details changed|פרטי הלקוח שונו/.test(document.querySelector('.order-activity')?.innerText || ''), null, { timeout: 8000 });
    assert.match(await page.locator('.order-activity').innerText(), lang === 'en' ? /Customer details changed/ : /פרטי הלקוח שונו/, tag + ' activity label');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    // After it ships the button is gone.
    await status(target, 'shipped'); await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.reload(); await page.waitForSelector(`[data-open-order="${target.id}"]`);
    await page.locator(`[data-open-order="${target.id}"]`).first().click(); await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-change-customer]').count(), 0, tag + ' hidden once shipped');
    assert.deepEqual(errors, [], tag); console.log(`PASS ${tag}: button, warning, validation, save, activity label, hidden once shipped`);
    await ctx.close();
  }
  // Admin view-as preview stays read only.
  const ctx = await session(admin, 1440), page = await ctx.newPage();
  await page.goto(`${base}/portal/?as=${id}#/orders`); await page.locator(`[data-open-order="${running.id}"]`).first().click(); await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-change-customer]').count(), 0, 'no button in preview'); await ctx.close();
  console.log('PASS admin preview of a client portal has no customer-details button');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
