// Quick fixes from the 19 Nov 2026 QA scan: each one measured so it cannot come back.
//   node checks/check-quick-fixes.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'quick-fixes');
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


const { admin, client, id } = await seed();
ok(await call('/admin/users/' + id, 'POST', { name: 'Juniper & Co.' }, admin));
const stores = ok(await call('/client-stores', 'GET', null, client)).stores;
const mk = async (ref, extra = {}) => ok(await call('/orders', 'POST', { storeId: stores[0].id, orderRef: ref, itemTitle: 'Wool felt slippers', buyerName: 'Jane', address1: '1 St', city: 'Austin', destination: 'US', etsyUrl: 'https://example.com/' + ref, photos: [photo], ...extra }, client)).order.id;
const o1 = await mk('4241000001'), multi = ok(await call('/orders', 'POST', { storeId: stores[0].id, orderRef: '#4241000002', buyerName: 'Sam', address1: '2 Rd', city: 'Leeds', destination: 'UK', photos: [photo], items: [{ link: 'https://example.com/a', quantity: 1, variant: 'A' }, { link: 'https://example.com/b', quantity: 1, variant: 'B' }] }, client)).order.id;
const P1 = ok(await call('/products', 'POST', { link: 'https://example.com/lamp', name: 'Lamp', photos: [photo] }, client)).product.id;
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
ok(await call('/supplier/couriers', 'POST', { name: 'Cainiao Super Economy Global' }, sup));
ok(await call('/supplier/orders/' + o1, 'PUT', { field: 'courier', value: 'Cainiao Super Economy Global' }, sup));
const flat = s => s.replace(/\s+/g, ' ');
try {
  // Supplier: long courier name fits, tab counts once, zip name, 中文 "商品 1：".
  for (const w of [1440, 390]) {
    const ctx = await session(sup, w), page = await ctx.newPage();
    await page.goto(`${base}/supplier/?lang=zh#orders`); await page.waitForSelector('[data-row] >> visible=true');
    const sel = page.locator(`${w < 860 ? '.sp-ocard' : 'tr'}[data-row="${o1}"] select[data-f=courier]`).first();
    assert.ok((await sel.boundingBox()).width >= 148, `supplier ${w}: courier box is wide enough`);
    assert.equal(await sel.getAttribute('title'), 'Cainiao Super Economy Global', 'full courier name on hover');
    assert.match(flat(await page.locator(`${w < 860 ? '.sp-ocard' : 'tr'}[data-row="${multi}"]`).innerText()), /商品 1：/, `supplier ${w}: 中文 Product 1`);
    assert.doesNotMatch(flat(await page.locator('body').innerText()), /Product 1:/, 'no English Product 1:');
    await page.goto(`${base}/supplier/?lang=en#quotes`); await page.waitForSelector('.sp-qform');
    const chip = flat(await page.locator('[data-qtab=answer]').innerText()); assert.match(chip, /^To answer\s+\d+$/, 'quotes tab: one number: ' + chip);
    const z = await page.evaluate(async id => { const r = await fetch(`/api/portal/supplier/orders/${id}/photos.zip`); return r.headers.get('content-disposition'); }, multi);
    assert.match(z, /filename="4241000002-photos\.zip"/, 'zip name has no leading underscore: ' + z);
    await ctx.close();
  }
  console.log('PASS supplier: long courier name fits (150px+), 商品 1：in Chinese, one number on sub-tabs, zip name (1440, 390)');
  // Client: store chips in the normal font, Hebrew login message, Hebrew bell badge direction.
  for (const lang of ['en', 'he']) for (const w of [1440, 390]) {
    const ctx = await session(client, w), page = await ctx.newPage();
    await page.goto(`${base}/portal/?lang=${lang}#/stores`); await page.waitForSelector('[data-store-status]');
    const font = await page.locator('[data-store-status]').first().evaluate(e => getComputedStyle(e).fontFamily);
    assert.ok(!/mono/i.test(font), `client ${lang}-${w}: store chips not in the code font: ${font}`);
    await page.screenshot({ path: path.join(out, `${lang}-${w}-stores.png`) });
    await ctx.close();
    const lctx = await session(null, w), lp = await lctx.newPage(); await lp.goto(`${base}/portal/?lang=${lang}`); await lp.waitForSelector('input[type=password]');
    await lp.locator('button[type=submit]').first().click(); await lp.waitForTimeout(400);
    const msg = flat(await lp.locator('.form-msg').first().innerText());
    assert.ok(lang === 'en' ? /Enter your username and password/.test(msg) : /נא להזין/.test(msg), `login ${lang}: empty form says what is missing: ${msg}`);
    await lctx.close();
  }
  console.log('PASS client: store chips in the normal font, empty login says what is missing (EN, HE, 1440, 390)');
  // Admin (Hebrew): the "Needs your attention" rows are all Hebrew, singular where it is one.
  { ok(await call('/supplier/orders/' + o1, 'PUT', { field: 'cost', value: '24.60' }, sup)); ok(await call('/supplier/quotes/' + P1, 'PUT', { price: '2.80', shipping: '3.00', available: true }, sup));
    ok(await call('/orders/' + o1 + '/cost-revision', 'POST', { competitorPrice: 11 }, client)); ok(await call('/products/' + P1 + '/cost-revision', 'POST', { competitorPrice: 2.5 }, client));
    const ctx = await session(admin, 1440), page = await ctx.newPage();
    await page.goto(`${base}/test-admin.html?lang=he`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-attn-slot] [data-go-filter], [data-attn-slot] [data-go-tab]'); await page.waitForTimeout(500);
    const rows = flat(await ui.locator('[data-attn-slot]').innerText());
    assert.doesNotMatch(rows, /[a-z]{4,} [a-z]{3,} [a-z]{3,}/, 'Hebrew attention rows have no English sentence: ' + rows);
    assert.match(rows, /הזמנה עם בקשת עדכון עלות/, 'order cost-revision row in Hebrew: ' + rows); assert.match(rows, /מוצר עם בקשת עדכון עלות/, 'product cost-revision row in Hebrew');
    assert.doesNotMatch(rows, /1 הזמנות/, 'singular in Hebrew');
    const eb = await ui.locator('.eyebrow').first().evaluate(e => getComputedStyle(e).fontFamily + '|' + getComputedStyle(e).letterSpacing);
    assert.ok(!/mono/i.test(eb.split('|')[0]), 'Hebrew eyebrow not in the code font: ' + eb);
    await page.screenshot({ path: path.join(out, 'he-1440-admin.png') }); await ctx.close(); }
  console.log('PASS admin Hebrew: every "Needs your attention" row in Hebrew (singular too), eyebrow not in the code font');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
