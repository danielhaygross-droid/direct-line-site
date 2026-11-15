// Supplier portal, phase 1 screens (docs/supplier-portal.md): sign in, Billing, one client's billing, change password
// (English + 中文, 1440 + 390 px) and the admin's Supplier logins / Supplier share payments (English + Hebrew).
//   node checks/check-supplier-portal.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'supplier-portal');
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
  } catch (e) { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); if (cookie) await ctx.addCookies([{ name: cookie.split('=')[0], value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';

// Two clients: one still owes, one has credit after cancelled paid orders. Our fee 0.37 must never show.
const FEE = 0.37;
const { admin, client, id } = await seed();
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE, name: 'Juniper & Co.' }, admin));
const id2 = ok(await call('/admin/users', 'POST', { username: 'northwind', name: 'Northwind Home', password: 'clientpass123', role: 'client', commissionPerOrder: FEE }, admin)).id;
const c2 = (await call('/login', 'POST', { username: 'northwind', password: 'clientpass123' })).cookie;
{ const tm = await call('/terms', 'GET', null, c2); ok(await call('/terms/accept', 'POST', { version: tm.data.policy.version, accepted: true }, c2)); }
const setCost = (oid, cost) => DB.prepare('UPDATE client_orders SET supplier_cost = ?, product_cost = ?, shipping_fee = NULL, price = ? WHERE id = ?').bind(cost, cost + FEE, cost + FEE, oid).run();
const mk = async (cookie, ref, cost, item) => {
  const store = ok(await call('/client-stores', 'GET', null, cookie)).stores[0];
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: item, buyerName: 'Sample', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/' + ref, photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, cookie)).order;
  await setCost(o.id, cost); return o.id;
};
const paid = (cid, ids, costs, day) => call('/admin/payments', 'POST', { clientId: cid, amount: Math.round((costs + ids.length * FEE) * 100) / 100, paidAt: day, orderIds: ids }, admin).then(ok);
const J = [await mk(client, '4219220006', 39.9, 'Brass desk lamp'), await mk(client, '4216120379', 64.9, 'Wool felt slippers'), await mk(client, '4215484739', 25.9, 'Ceramic pour-over set')];
await paid(id, J, 39.9 + 64.9 + 25.9, '2026-11-05');
const J2 = [await mk(client, '4221911202', 29.9, 'Enamel camping mug'), await mk(client, '4221086788', 38.2, 'Linen apron')]; // billed, not paid
await setCost(J[0], 43.9); // cost raised after the payment
const N = [await mk(c2, '4208782037', 32.9, 'Brass desk lamp'), await mk(c2, '4214596234', 43.9, 'Ceramic pour-over set'), await mk(c2, '4211752986', 79.9, 'Wool throw')];
await paid(id2, N, 32.9 + 43.9 + 79.9, '2026-11-02');
for (const [oid, fee] of [[N[1], 8], [N[2], 0]]) {
  ok(await call('/orders/' + oid, 'PUT', { status: 'cancelled' }, admin));
  if (fee) await DB.prepare("INSERT INTO client_balance_adjustments (client_id, order_id, kind, amount, note, created_at) VALUES (?,?,'cancellation_fee',?,'Cancellation fee',1)").bind(id2, oid, fee).run();
}
ok(await call('/admin/supplier-share', 'POST', { amount: 2, paidAt: '2026-11-10' }, admin));
const supId = ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin)).id;
ok(await call('/admin/users/' + supId, 'POST', { position: 'Supplier · Beyond' }, admin));
{ const e = ok(await call('/admin/users', 'POST', { username: 'erwin-dev', name: 'Erwin', password: 'erwinpass12', role: 'admin' }, admin)).id; ok(await call('/admin/users/' + e, 'POST', { position: 'Developer', owner: true }, admin)); globalThis.shaharId = ok(await call('/admin/users', 'POST', { username: 'shahar-x', name: 'Shahar', password: 'shaharpass1', role: 'admin' }, admin)).id; }

const flat = s => s.replace(/\s+/g, ' ');
try {
  // Sign in from the supplier page (no cookie yet).
  for (const [lang, w] of [['en', 1440], ['zh', 390]]) {
    const ctx = await session(null, w), page = await ctx.newPage();
    await page.goto(`${base}/supplier/?lang=${lang}`); await page.waitForSelector('#sp-login');
    await page.screenshot({ path: path.join(out, `${lang}-${w}-login.png`) });
    await page.fill('[name=username]', 'sup-ada'); await page.fill('[name=password]', 'wrong-password'); await page.click('#sp-login [type=submit]');
    await page.waitForSelector('#sp-login .form-msg.err'); assert.match(await page.locator('#sp-login .form-msg').innerText(), lang === 'zh' ? /不正确/ : /Wrong/);
    await page.fill('[name=password]', 'supplierpass1'); await page.click('#sp-login [type=submit]');
    await page.waitForSelector('.sp-chips'); await ctx.close();
  }
  console.log('PASS sign in (EN, 中文): wrong password says so, the right one opens Orders');

  const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
  const all = ok(await call('/supplier/billing', 'GET', null, sup));
  for (const lang of ['en', 'zh']) for (const w of [1440, 390]) {
    const tag = `${lang}-${w}`, ctx = await session(sup, w), page = await ctx.newPage();
    await page.goto(`${base}/supplier/?lang=${lang}#billing`); await page.waitForSelector('.sp-tiles');
    const text = flat(await page.locator('body').innerText());
    for (const n of ['0.37', '61.11', '40.27', '65.27', '26.27']) assert.ok(!text.includes(n), `${tag}: shows ${n}`);
    assert.ok(text.includes('$' + all.totals.paidForYourPart.toLocaleString('en-US', { minimumFractionDigits: 2 })), tag + ': paid for your part');
    if (lang === 'en') { assert.match(text, /Juniper & Co\./); assert.match(text, /Northwind Home/); assert.match(text, /Your supplier share/); }
    else { assert.match(text, /每个客户的余额/); assert.match(text, /供应商分成/); }
    await page.screenshot({ path: path.join(out, `${tag}-billing.png`), fullPage: true });
    // Open a client.
    await page.locator(`${w < 700 ? '.sp-ccard' : 'tr[data-client]'}[data-client="${id2}"]`).click(); await page.waitForSelector('.sp-adds');
    const pay = page.locator('[data-pay]').first(); await pay.click(); await page.waitForSelector('.sp-paid-list');
    const ct = flat(await page.locator('body').innerText());
    for (const n of ['0.37', '157.81', '33.27', '44.27', '80.27']) assert.ok(!ct.includes(n), `${tag} client: shows ${n}`);
    await page.screenshot({ path: path.join(out, `${tag}-client.png`), fullPage: true });
    await page.goto(`${base}/supplier/?lang=${lang}#password`); await page.waitForSelector('#sp-password');
    await page.screenshot({ path: path.join(out, `${tag}-password.png`) });
    await ctx.close();
  }
  // The numbers on one client's page add up to its balance (also asserted by check-supplier-api).
  const one = ok(await call('/supplier/billing/' + id2, 'GET', null, sup)).client;
  assert.equal(Math.round((one.adds.notPaid + one.adds.costChanged - one.adds.cancelledBack + one.adds.other) * 100) / 100, one.balance);
  console.log('PASS Billing and one client (EN, 中文, 1440 and 390): no fee or client price on screen; the balance adds up');

  // Admin: Supplier logins + Supplier share payments (English + Hebrew).
  for (const [lang, w] of [['en', 1440], ['he', 1440], ['en', 390], ['he', 390]]) {
    const ctx = await session(admin, w), page = await ctx.newPage();
    await page.goto(`${base}/test-admin.html?lang=${lang}`); let ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=settings]');
    await ui.locator('[data-tab=settings]').click(); await ui.waitForSelector('.set-tabs'); await ui.locator('[data-set-tab=team]').click();
    await ui.waitForSelector('[data-suppliers]'); await ui.waitForSelector('[data-share] .acc-list');
    assert.match(await ui.locator('[data-suppliers]').innerText(), /@sup-ada/);
    assert.match(await ui.locator('[data-admins]').innerText(), /Developer/);
    await ui.locator('[data-suppliers]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `admin-${lang}-${w}-team.png`) });
    // Phase 3b switch (Fees & settings > Supplier): shown to owners when the sheet is on (the sheet answer is stubbed here).
    await page.route('**/api/portal/admin/supplier-sheet', r => r.fulfill({ json: { ok: true, configured: true, enabled: true, portalOnly: false, last: null } }));
    await ui.locator('[data-tab=overview]').click(); await ui.locator('[data-tab=settings]').click(); await ui.waitForSelector('.set-tabs'); await ui.locator('[data-set-tab=supplier]').click();
    await ui.waitForSelector('[data-portal-only]:not([hidden])'); assert.match(await ui.locator('[data-portal-only-btn]').innerText(), lang === 'en' ? /Switch to portal only/ : /פורטל בלבד/);
    await ui.locator('[data-portal-only]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `admin-${lang}-${w}-portal-only.png`) });
    await page.unroute('**/api/portal/admin/supplier-sheet'); await ui.locator('[data-set-tab=team]').click();
    // "Open supplier portal": the admin sees the supplier's Billing with a read-only banner.
    assert.equal(await ui.locator('a[href="/supplier/"]').count(), 1, 'Open supplier portal button');
    await ui.locator('a[href="/supplier/"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `admin-${lang}-${w}-open-supplier.png`) });
    const sv = await ctx.newPage(); await sv.goto(`${base}/supplier/?lang=en#billing`); await sv.waitForSelector('.sp-tiles'); await sv.waitForSelector('.sp-view');
    assert.equal(await sv.locator('a[href="#password"]').count(), 0, 'admin view: no Change password');
    await sv.screenshot({ path: path.join(out, `admin-view-${w}-billing.png`) });
    await sv.goto(`${base}/supplier/?lang=zh#orders`); await sv.waitForSelector('.sp-view'); await sv.waitForTimeout(600);
    await sv.screenshot({ path: path.join(out, `admin-view-zh-${w}-orders.png`) });
    // One sign-in per portal (16 Nov 2026): from the admin view, sign in as the supplier in the same browser; the admin stays signed in.
    if (lang === 'en' && w === 1440) { // before the supplier login is disabled below
      await sv.goto(`${base}/supplier/?lang=en#billing`); await sv.waitForSelector('.sp-view');
      await sv.locator('.sp-me summary').click(); await sv.locator('[data-supplier-login]').click(); await sv.waitForSelector('#sp-login');
      await sv.fill('[name=username]', 'sup-ada'); await sv.fill('[name=password]', 'supplierpass1'); await sv.click('#sp-login [type=submit]');
      await sv.waitForSelector('.sp-tiles, .sp-table, .sp-ocard'); assert.equal(await sv.locator('.sp-view').count(), 0, 'signed in as the supplier: no admin banner');
      assert.match(await sv.locator('.sp-who b').innerText(), /Ada/);
      const names = (await ctx.cookies()).map(c => c.name).sort(); assert.ok(names.includes('dl_session') && names.includes('dl_supplier'), 'both sign-ins kept: ' + names);
      await page.reload(); const ui2 = page.frame({ name: 'admin' }); await ui2.waitForSelector('[data-tab=settings]');
      assert.equal((await ui2.evaluate(() => fetch('/api/portal/me', { headers: { 'x-dl-portal': 'admin' } }).then(r => r.json()))).role, 'admin', 'the admin is still signed in');
      await sv.locator('.sp-me summary').click(); await sv.locator('[data-logout]').click(); await sv.waitForSelector('.sp-view'); // back to the admin view: the admin is still signed in
      assert.ok(!(await ctx.cookies()).some(c => c.name === 'dl_supplier'), 'supplier log out ends only the supplier sign-in');
      assert.equal((await ui2.evaluate(() => fetch('/api/portal/me', { headers: { 'x-dl-portal': 'admin' } }).then(r => r.json()))).role, 'admin', 'admin still signed in after the supplier logs out');
      await sv.goto(`${base}/portal/?lang=en`); await sv.waitForSelector('[data-pick-login]'); await sv.screenshot({ path: path.join(out, `admin-${w}-client-picker.png`) });
      await ui2.locator('[data-tab=settings]').click(); await ui2.waitForSelector('.set-tabs'); await ui2.locator('[data-set-tab=team]').click(); await ui2.waitForSelector('[data-suppliers]');
      ui = ui2;
    }
    await sv.close();
    await ui.locator(`[data-edit-admin="${globalThis.shaharId}"]`).click(); await ui.waitForSelector('[data-admin-remove]');
    await ui.locator('[data-admin-form]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `admin-${lang}-${w}-team-edit.png`) });
    await ui.locator('[data-admin-cancel]').click();
    if (lang === 'en' && w === 1440) {
      await ui.locator(`[data-edit-admin="${supId}"]`).click(); await ui.waitForSelector('[data-admin-form]');
      await ui.selectOption('[data-admin-form] [name=active]', 'false'); await ui.locator('[data-admin-form] [type=submit]').click();
      await ui.waitForFunction(() => /disabled/.test(document.querySelector('[data-suppliers]')?.innerText || ''));
      assert.equal((await call('/me', 'GET', null, sup)).status, 401, 'disabled from admin: the supplier is signed out');
    }
    await ctx.close();
  }
  console.log('PASS admin Supplier logins (EN, HE): listed, disabled from Edit (supplier signed out at once)');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
