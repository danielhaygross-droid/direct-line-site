// Supplier portal, phase 3 screens (quotes, price requests) (docs/supplier-portal.md): sign in, Billing, one client's billing, change password
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'supplier-requests-ui');
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); if (cookie) await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const FEE = 0.37;
const { admin, client, id } = await seed();
ok(await call('/admin/users/' + id, 'POST', { commissionPerOrder: FEE, name: 'Juniper & Co.' }, admin));
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const P1 = ok(await call('/products', 'POST', { link: 'https://example.com/item/ceramic-lamp', name: 'Ceramic table lamp', variant: 'Sand glaze / EU plug', expectedQuantity: 20, photos: [photo, photo] }, client)).product.id;
const P2 = ok(await call('/products', 'POST', { link: 'https://example.com/item/linen-apron', name: 'Linen apron', variant: 'One size / Olive', expectedQuantity: 10, photos: [photo] }, client)).product.id;
const P3 = ok(await call('/products', 'POST', { link: 'https://example.com/item/mug', name: 'Enamel camping mug', photos: [photo] }, client)).product.id;
ok(await call('/supplier/quotes/' + P3, 'PUT', { price: '2.80', shipping: '3.00', available: true, note: 'Ships in 3 days' }, sup));
ok(await call('/products/' + P3 + '/cost-revision', 'POST', { competitorPrice: 2.5 }, client));
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async (ref, cost, name) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: name, variant: 'Natural', buyerName: 'B', address1: '1 St', destination: 'US', etsyUrl: 'https://example.com/' + ref, photos: [photo] }, client)).order.id;
  await DB.prepare('UPDATE client_orders SET supplier_cost = ?, product_cost = ?, shipping_fee = NULL, price = ? WHERE id = ?').bind(cost, cost + FEE, cost + FEE, o).run();
  ok(await call('/orders/' + o + '/cost-revision', 'POST', { competitorPrice: 21 }, client));
  return o;
};
const A = await mk('4221600001', 24.6, 'Walnut phone stand'), B = await mk('4221600002', 18.9, 'Brass desk lamp');

const flat = s => s.replace(/\s+/g, ' ');
try {
  for (const lang of ['en', 'zh']) for (const w of [1440, 390]) {
    const tag = `${lang}-${w}`, ctx = await session(sup, w), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/supplier/?lang=${lang}#quotes`); await page.waitForSelector('[data-qcard]');
    let text = flat(await page.locator('body').innerText());
    for (const n of ['0.37', '3.17']) assert.ok(!text.includes(n), `${tag} quotes: shows ${n}`);
    assert.match(text, lang === 'en' ? /Product quotes/ : /商品询价/);
    await page.screenshot({ path: path.join(out, `${tag}-quotes.png`), fullPage: true });
    if (lang === 'en' && w === 1440) {
      // Answer a quote: price + shipping; it moves to Answered and the client gets price + our fee.
      const f = page.locator(`form[data-quote="${P1}"]`);
      await f.locator('[name=price]').fill('7.10'); await f.locator('[name=shipping]').fill('4.50'); await f.locator('[type=submit]').click();
      await page.waitForFunction(id => !document.querySelector(`form[data-quote="${id}"]`), P1);
      const p = await DB.prepare('SELECT status, unit_price FROM portal_products WHERE id = ?').bind(P1).first();
      assert.deepEqual([p.status, Math.round(Number(p.unit_price) * 100) / 100], ['approved', 7.47]);
      // Not available needs a reason.
      await page.click(`[data-avail="${P2}:0"]`); await page.waitForSelector(`form[data-quote="${P2}"] [name=note]`);
      assert.equal(await page.locator(`form[data-quote="${P2}"] [name=price]`).count(), 0, 'No: price boxes hidden');
      await page.locator(`form[data-quote="${P2}"] [type=submit]`).click();
      await page.waitForFunction(id => /Say why/.test(document.querySelector(`form[data-quote="${id}"]`)?.innerText || ''), P2);
      await page.click('[data-qtab=answered]'); await page.waitForSelector(`[data-qcard="${P1}"]`);
      await page.screenshot({ path: path.join(out, `${tag}-quotes-answered.png`), fullPage: true });
    }
    await page.goto(`${base}/supplier/?lang=${lang}#requests`); await page.waitForSelector('form[data-req]');
    text = flat(await page.locator('body').innerText());
    for (const n of ['0.37', '24.97', '19.27', '3.17']) assert.ok(!text.includes(n), `${tag} requests: shows ${n}`);
    if (lang === 'en' && w === 1440) { assert.match(text, /\$24\.60/); assert.match(text, /\$21\.00/); }
    await page.screenshot({ path: path.join(out, `${tag}-requests.png`), fullPage: true });
    if (lang === 'en' && w === 1440) {
      // Accept a lower cost: approved; keep with a reason.
      const fa = page.locator(`form[data-req="order:${A}"]`); await fa.locator('[name=cost]').fill('22'); await fa.locator('[type=submit]').click();
      await page.waitForFunction(id => !document.querySelector(`form[data-req="order:${id}"]`), A);
      const oa = await DB.prepare('SELECT revision_status, supplier_cost FROM client_orders WHERE id = ?').bind(A).first();
      assert.deepEqual([oa.revision_status, Number(oa.supplier_cost)], ['', 22]);
      const fb = page.locator(`form[data-req="order:${B}"]`); await fb.locator('input[value=keep]').check(); await page.waitForSelector(`form[data-req="order:${B}"] [name=reason]`);
      await page.locator(`form[data-req="order:${B}"] [name=reason]`).fill('Factory price went up'); await page.locator(`form[data-req="order:${B}"] [type=submit]`).click();
      await page.waitForFunction(id => !document.querySelector(`form[data-req="order:${id}"]`), B);
      assert.match((await DB.prepare('SELECT revision_done FROM client_orders WHERE id = ?').bind(B).first()).revision_done, /Factory price went up/);
      await page.click('[data-rtab=answered]'); await page.waitForSelector('.sp-table');
      assert.match(flat(await page.locator('body').innerText()), /New cost \$22\.00/);
      await page.screenshot({ path: path.join(out, `${tag}-requests-answered.png`), fullPage: true });
    }
    assert.deepEqual(errors, [], tag + ': no page errors');
    await ctx.close();
  }
  console.log('PASS quotes and price requests screens (EN, 中文, 1440, 390): answer a quote, not available needs a reason, accept / keep a price request; no fee or client price on screen');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
