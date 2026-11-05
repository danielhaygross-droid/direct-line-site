// Check: a client's bank transfer confirmation shows in the admin bell (Erwin, 5 Nov 2026: "I clicked Send confirmation
// on the client portal but it didn't notify the admin"). The Control bell lists "1 transfer confirmation to check" with the
// client's name, in English and Hebrew. A confirmation sent twice can be removed by the admin (archived, not deleted).
//   node checks/check-transfer-bell.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'transfer-bell');
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
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const mk = async (ref, cost, date) => { const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Buyer ' + ref, address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order; ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id; };
const OLD = await mk('OLD-1', 20, day(30)), S1 = await mk('SHIP-1', 10, day(3)), S2 = await mk('SHIP-2', 12, day(3)), P1 = await mk('PAID-1', 15, day(5));
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 17, paidAt: day(2), method: 'Bank transfer', note: 'October', orderIds: [P1] }, admin));
for (const o of [S1, S2]) ok(await call('/orders/' + o, 'PUT', { status: 'shipped' }, admin));
const ORDER = await mk('READ-1', 20, day(3));
// The client sends a bank transfer confirmation for 2 unpaid orders.
ok(await call('/transfers', 'POST', { amount: 30, date: day(0), file: photo, orderIds: [OLD, ORDER] }, client));
try {
  for (const lang of ['en', 'he']) {
    const ctx = await session(admin, 1440), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(base + (lang === 'he' ? '/' : '/en/')); await page.waitForFunction(() => document.body.classList.contains('authenticated')); await page.waitForTimeout(1500);
    await page.locator('.notifications').first().click(); await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.body.innerText);
    assert.match(text, lang === 'en' ? /1 transfer confirmation to check[\s\S]{0,80}Local Client · record the payment in Clients & payments/ : /אישור העברה אחד לבדיקה[\s\S]{0,80}Local Client · לרשום את התשלום בלקוחות ותשלומים/, lang + ': the bell lists the transfer confirmation');
    await page.screenshot({ path: path.join(out, `${lang}-1440-bell.png`) });
    assert.deepEqual(errors.filter(e => !/Shopify|supplier|fetch/i.test(e)), [], lang); await ctx.close(); console.log('PASS', lang);
  }
  // A second confirmation sent by mistake: admin removes it (soft: archived, no payment), the first one stays.
  ok(await call('/transfers', 'POST', { amount: 31, date: day(0), file: { ...photo, filename: 'again.png' }, orderIds: [OLD, ORDER] }, client));
  {
    const ctx = await session(admin, 1440), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(`${base}/test-admin.html?lang=en`); await page.waitForTimeout(500); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click();
    await ui.locator('.gtabs button').nth(2).click(); await page.waitForTimeout(300); await ui.locator('.subtabs [data-ctab=payments]').click();
    await ui.waitForSelector('[data-remove-transfer]'); assert.equal(await ui.locator('[data-remove-transfer]').count(), 2, 'two confirmations to check');
    await page.screenshot({ path: path.join(out, 'en-1440-admin-two.png') });
    await ui.locator('[data-remove-transfer]').first().click(); await page.waitForTimeout(800);
    assert.equal(await ui.locator('[data-remove-transfer]').count(), 1, 'one left after Remove');
    const left = (await DB.prepare("SELECT COUNT(*) AS n FROM portal_files WHERE client_id=? AND kind='confirmation' AND NOT archived").bind(id).first()).n;
    assert.equal(Number(left), 1, 'the removed one is archived, not deleted');
    assert.equal(Number((await DB.prepare("SELECT COUNT(*) AS n FROM portal_files WHERE client_id=? AND kind='confirmation'").bind(id).first()).n), 2, 'nothing deleted');
    assert.deepEqual(errors, []); await ctx.close(); console.log('PASS admin removes a duplicate confirmation');
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
