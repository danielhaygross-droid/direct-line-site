// Receipts made in the supplier portal, the screens (16 Nov 2026): supplier Receipts page (English + 中文, 1440 + 390),
// the admin's Receipts from the supplier box in Clients & payments (English + Hebrew) and the client's Payments.
//   node checks/check-supplier-receipts-ui.mjs   (run from the repo root). Real SQL on PGlite + the real screens in Chrome.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'supplier-receipts-ui');
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
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const FEE = 0.37;
const { admin, client, id } = await seed();
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE, name: 'Juniper & Co.' }, admin));
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async (ref, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Wool felt slippers', variant: 'EU 41 / Chestnut', buyerName: 'Jane Buyer', address1: '1 Sample St', city: 'Leeds', destination: 'UK', etsyUrl: 'https://example.com/slippers', photos: [photo] }, client)).order;
  await DB.prepare('UPDATE client_orders SET supplier_cost = ?, product_cost = ?, shipping_fee = NULL, price = ? WHERE id = ?').bind(cost, cost + FEE, cost + FEE, o.id).run(); return o.id;
};
const ids = [await mk('4221600001', 24.6), await mk('4221600002', 17.1), await mk('4221600003', 31.9)];
const p1 = ok(await call('/admin/payments', 'POST', { clientId: id, amount: 42.44, paidAt: '2026-11-12', orderIds: ids.slice(0, 2) }, admin));
const p2 = ok(await call('/admin/payments', 'POST', { clientId: id, amount: 32.27, paidAt: '2026-11-14', orderIds: [ids[2]] }, admin));
const pid1 = p1.payment?.id ?? p1.id, pid2 = p2.payment?.id ?? p2.id;
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const errors = [];
try {
  // Supplier: Receipts page; make one for the first payment.
  for (const [lang, w] of [['en', 1440], ['zh', 390], ['zh', 1440], ['en', 390]]) {
    const ctx = await session(sup, w), page = await ctx.newPage(); page.on('pageerror', e => errors.push(lang + w + ': ' + e.message));
    await page.goto(`${base}/supplier/?lang=${lang}#receipts`); await page.waitForSelector('[data-receipt] >> visible=true');
    const text = await page.locator('#sp-main').innerText();
    for (const n of ['42.44', '32.27', '0.37']) assert.ok(!text.includes(n), 'supplier screen shows ' + n);
    await page.screenshot({ path: path.join(out, `sup-${lang}-${w}-to-make.png`), fullPage: w === 390 });
    if (lang === 'en' && w === 1440) {
      const form = page.locator(`[data-receipt="${pid1}"]`); await form.locator('[name=note]').fill('Bank transfer ref 4471'); await form.locator('[type=submit]').click();
      await page.waitForSelector(`[data-receipt="${pid1}"]`, { state: 'detached' });
      await page.locator('[data-rctab=waiting]').click(); await page.waitForSelector('.sp-wait');
      await page.screenshot({ path: path.join(out, 'sup-en-1440-waiting.png') });
    }
    await ctx.close();
  }
  // Admin: the box in Clients & payments, the job on the Overview; send back, then (after the supplier sends again) approve.
  const rid = ok(await call('/admin/receipts', 'GET', null, admin)).receipts[0].id;
  ok(await call('/billing', 'PUT', { name: 'Juniper & Co. Ltd', address: '12 Market St\nLeeds LS1 4AB', email: 'accounts@example.com' }, client));
  for (const [lang, w] of [['en', 1440], ['he', 1440], ['en', 390], ['he', 390]]) {
    const ctx = await session(admin, w), page = await ctx.newPage(); page.on('pageerror', e => errors.push(lang + w + ': ' + e.message)); page.on('frameattached', f => {}); page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text()); });
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=overview]');
    await ui.waitForSelector('.todo'); assert.match(await ui.locator('[data-overview]').innerText(), lang === 'en' ? /receipts? from the supplier to check and send/ : /קבלות מהספק לבדוק ולשלוח/);
    await ui.locator('[data-tab=clients]').click(); await ui.waitForSelector('[data-receipts-box]');
    assert.match(await ui.locator('[data-receipts-box]').innerText(), /\$42\.44|\$32\.27/, 'the admin sees the client amount');
    await ui.locator('[data-receipts-box]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `admin-${lang}-${w}-box.png`) });
    if (lang === 'en' && w === 1440) {
      await ui.locator(`[data-rc-reject="${rid}"]`).click(); await ui.fill('[data-rc-reject-form] [name=reason]', 'Wrong payment date'); await page.screenshot({ path: path.join(out, 'admin-en-1440-send-back.png') });
      await ui.locator('[data-rc-reject-form] [type=submit]').click(); await ui.waitForSelector('[data-rc-reject-form]', { state: 'detached' });
      assert.equal(ok(await call('/supplier/receipts', 'GET', null, sup)).toMake.find(x => x.paymentId === pid1).reason, 'Wrong payment date');
      ok(await call('/supplier/receipts', 'POST', { paymentId: pid1, note: 'Bank transfer ref 4471' }, sup));
      await page.reload(); const u2 = page.frame({ name: 'admin' }); await u2.waitForSelector('[data-tab=clients]'); await u2.locator('[data-tab=clients]').click(); await u2.waitForSelector(`[data-rc-approve="${rid}"]`);
      await u2.locator(`[data-rc-approve="${rid}"]`).click(); await u2.waitForSelector(`[data-rc-approve="${rid}"]`, { state: 'detached' });
      ok(await call('/supplier/receipts', 'POST', { paymentId: pid2 }, sup)); // one more waiting, for the other screenshots
    }
    await ctx.close();
  }
  // The supplier sees it sent; the client has the receipt in Payments.
  { const ctx = await session(sup, 1440), page = await ctx.newPage(); await page.goto(`${base}/supplier/?lang=zh#receipts`); await page.waitForSelector('[data-rctab=sent]');
    await page.locator('[data-rctab=sent]').click(); await page.waitForSelector('.sp-done'); await page.screenshot({ path: path.join(out, 'sup-zh-1440-sent.png') }); await ctx.close(); }
  const inv = ok(await call('/payments', 'GET', null, client)).invoices.find(f => f.paymentId === pid1);
  assert.ok(inv && /^R-\d{4}-\d{4}\.pdf$/.test(inv.filename), 'the client has the receipt ' + JSON.stringify(inv));
  for (const w of [1440, 390]) {
    const ctx = await session(client, w), page = await ctx.newPage(); await page.goto(`${base}/portal/?lang=en#/payments`); await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, `client-en-${w}-payments.png`), fullPage: true }); await ctx.close();
  }
  // Supplier share paid ahead (16 Nov 2026: Ye paid $80, 70 orders): shown as "Paid ahead", not a negative "still to pay".
  ok(await call('/admin/supplier-share', 'POST', { amount: 80, paidAt: '2026-11-06', note: 'Ye, supplier share' }, admin));
  for (const [lang, w] of [['en', 1440], ['zh', 390]]) {
    const ctx = await session(sup, w), page = await ctx.newPage(); await page.goto(`${base}/supplier/?lang=${lang}#billing`); await page.waitForSelector('.sp-due');
    const due = await page.locator('.sp-due').innerText(); assert.match(due, lang === 'en' ? /Paid ahead · \$77\.00/ : /已预付 · \$77\.00/); assert.ok(!/−|-\$/.test(due), 'no negative amount: ' + due);
    await page.locator('.sp-due').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `sup-${lang}-${w}-share-ahead.png`) }); await ctx.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS receipts screens: supplier makes one (EN, 中文, 1440, 390), admin sends back and sends it to the client (EN, HE), the client has it. Screens: ' + out);
} finally { if (errors.length) console.log('PAGE ERRORS', errors); await browser.close(); server.close(); }
