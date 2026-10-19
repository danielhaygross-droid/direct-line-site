// Local check: tidier admin client panel (tabs Orders · Stores · Products · …, folded sections) — branch claude/tidy-client-panel.
//   node checks/check-client-panel.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real admin screens in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'client-panel');
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

// A busy client like Yehuda: 3 stores, 8 products (2 waiting, 1 with several prices), 18 orders.
const { admin, client, id } = await seed();
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
for (const name of ['Mike Modern Decor', 'HikaryStudioClay']) assert.equal((await call('/client-stores', 'POST', { name, platform: 'Etsy' }, client)).status, 200);
const stores = (await call('/client-stores', 'GET', null, client)).data.stores;
const names = ['Brass tray', 'Jade Rustic Green teapot', 'Round Bowl Set', 'Full Tea Collection', 'Blue Mountain Tray', 'Zippo-style lighter', 'Leather wallet', 'Ceramic mug 14 oz'];
const products = [];
for (const [i, name] of names.entries()) products.push((await call('/products', 'POST', { name, link: 'https://detail.1688.com/offer/' + (1000 + i), variant: 'All variants and color', photos: [photo] }, client)).data.product);
for (const p of products.slice(2)) await DB.prepare("UPDATE portal_products SET status='approved', unit_price=?, supplier_price=? WHERE id=?").bind(7.4 + p.id, 6.9 + p.id, p.id).run();
await DB.prepare("UPDATE portal_products SET price_options=?, unit_price=3.7, supplier_price=3.2 WHERE id=?").bind(JSON.stringify([{ label: 'Silver', supplier: 3.2, unit: 3.7 }, { label: 'Gold', supplier: 4.5, unit: 5 }]), products[5].id).run();
for (let i = 0; i < 18; i++) {
  const p = products[2 + (i % 6)];
  const r = await call('/orders', 'POST', { storeId: stores[i % 3].id, productId: p.id, ...(p.id === products[5].id ? { productOption: 'Gold' } : {}), orderRef: '#41988' + String(i).padStart(4, '0'), buyerName: 'Customer ' + i, address1: (10 + i) + ' Main St, Springfield', destination: 'US' }, client);
  assert.equal(r.status, 200, JSON.stringify(r.data));
}

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click();
    await ui.waitForSelector('.gtabs'); await page.waitForTimeout(700);
    const height = async () => ui.evaluate(() => document.querySelector('.drawer .drawer-body')?.scrollHeight || 0);
    const heights = {};
    const group = n => ui.locator('.gtabs button').nth(n), sub = k => ui.locator(`.subtabs [data-ctab=${k}]`);
    // The 4 tabs fit: none is cut off.
    const fits = await ui.evaluate(() => [...document.querySelectorAll('.gtabs button')].every(b => b.scrollWidth <= b.clientWidth + 1));
    assert.ok(fits, 'tab labels fit');
    for (const [name, n, s] of [['orders', 0], ['stores', 1, 'stores'], ['products', 1, 'products'], ['payments', 2, 'payments'], ['prices', 2, 'prices'], ['account', 3, 'account'], ['activity', 3, 'activity']]) {
      await group(n).click(); await page.waitForTimeout(300); if (s) { await sub(s).click(); await page.waitForTimeout(name === 'activity' || name === 'payments' || name === 'prices' ? 700 : 300); }
      heights[name] = await height();
      await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
    }
    // Account: which existing orders get a new fee (new only / pending / in progress / both / all), with counts.
    await group(3).click(); await page.waitForTimeout(200); await sub('account').click(); await page.waitForTimeout(200);
    assert.deepEqual(await ui.locator('[name=applyFeeTo] option').evaluateAll(o => o.map(x => x.value)), ['new', 'pending', 'processing', 'open', 'all']);
    await ui.locator('[name=applyFeeTo]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, tag + '-fee-choice.png') });
    // The Shop tab reopens on the sub-tab used last.
    await group(1).click(); await page.waitForTimeout(200); await sub('products').click(); await group(0).click(); await group(1).click(); await page.waitForTimeout(200);
    assert.equal(await ui.locator('.subtabs .on').getAttribute('data-ctab'), 'products');
    assert.equal(await ui.locator('.prod-row').count(), 8); assert.equal(await ui.locator('.prod-row[open]').count(), 0);
    if (lang === 'en') { assert.match(await ui.locator('.prod-row summary').first().innerText(), /Waiting for price/); assert.match(await ui.locator('.prod-row', { hasText: 'Zippo-style lighter' }).locator('summary').innerText(), /from\s*\$3\.70/); }
    assert.equal(await ui.locator('.gtabs .tab-dot').count(), 1, 'Shop tab shows waiting products');
    await ui.locator('.prod-row summary').nth(3).click(); await page.waitForTimeout(300);
    await ui.evaluate(() => document.querySelector('.prod-row[open]').scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, `${tag}-products-open.png`) });
    // Product photos: bigger row thumbnails, and big photos in the price form that open full size.
    assert.ok((await ui.locator('.prod-row summary img').first().boundingBox()).width >= 56, 'row thumbnail at least 56 px');
    assert.ok((await ui.locator('.prod-row[open] .qf-photo').first().boundingBox()).width >= 100, 'form photo at least 100 px');
    await ui.locator('.prod-row[open] .qf-photo').first().click(); await ui.waitForSelector('.pv'); await page.screenshot({ path: path.join(out, `${tag}-product-photo-full.png`) }); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // Orders: store filter, folded store table, one row per order, back from an order.
    await group(0).click(); await page.waitForTimeout(200);
    assert.equal(await ui.locator('[data-fold=perf][open]').count(), 0);
    assert.equal(await ui.locator('.drawer .ord-row').count(), 18);
    await ui.locator('[data-client-store]').selectOption(String(stores[1].id)); await page.waitForTimeout(300);
    assert.equal(await ui.locator('.drawer .ord-row').count(), 6, 'one store');
    await page.screenshot({ path: path.join(out, `${tag}-orders-one-store.png`) });
    await ui.locator('[data-client-store]').selectOption('0'); await page.waitForTimeout(200);
    await ui.locator('.ord-row').first().click(); await ui.waitForSelector('.drawer [data-back]'); await ui.locator('.drawer [data-back]').first().click(); await ui.waitForSelector('.gtabs');
    console.log('PASS', tag, JSON.stringify(heights));
    assert.deepEqual(errors, [], tag); await ctx.close();
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
