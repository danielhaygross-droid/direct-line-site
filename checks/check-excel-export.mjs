// Behaviour check: "Export to Excel" — the client portal's Orders page and the admin client panel download an .xlsx with
// the orders on screen, their prices, a Yes / No Paid column and paid / not paid totals. EN/HE, 1440/390.
//   node checks/check-excel-export.mjs      (run from the repo root)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { pg, DB, env, call, seed } from './lib.mjs';
import { route } from '../api/index.mjs';
import { unzip } from '../tests/excel-export.test.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'excel-export');
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, acceptDownloads: true }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };


const { admin, client, id } = await seed();
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
const prices = [44.9, 81.8, 25];
const ids = [];
for (const [i, price] of prices.entries()) {
  const r = await call('/orders', 'POST', { storeId: store.id, orderRef: '#4201' + i, orderDate: '2026-10-1' + i, buyerName: ['Jason Wells', 'Mariann Kosar', 'Lena Pons'][i], itemTitle: 'Walnut key holder', variant: ['XL', '10 hooks', 'Green'][i], quantity: 1 + i, address1: '1 Main St, Springfield', destination: 'US', etsyUrl: 'https://www.etsy.com/listing/1', photos: [{ data: photo.data, thumb: photo.data, width: 1, height: 1 }] }, client);
  assert.equal(r.status, 200, JSON.stringify(r.data)); ids.push(r.data.order.id);
  await DB.prepare('UPDATE client_orders SET price=?, product_cost=? WHERE id=?').bind(price, price, r.data.order.id).run();
}
await call('/orders/' + ids[2], 'PUT', { status: 'cancelled', fee: 0 }, admin);
const docOf = async (download, name) => { const file = path.join(out, name); await download.saveAs(file); return unzip(new Uint8Array(await readFile(file))).get('xl/worksheets/sheet1.xml').text; };
const expect = (doc, tag) => {
  for (const s of ['#42010', '#42011', '<v>44.9</v>', '<v>81.8</v>', '<f>SUM(G5:G7)</f>']) assert.ok(doc.includes(s), tag + ' has ' + s);
  assert.equal((doc.match(/<dataValidation type="list"/g) || []).length, 1, tag + ': Paid is a Yes / No drop-down');
};

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // ---------- client portal ----------
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.reload(); await page.waitForSelector('[data-excel-export]'); await page.waitForTimeout(400);
    await page.locator('[data-excel-export]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-orders.png`) });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-excel-export]').click()]);
    assert.match(dl.suggestedFilename(), /^Direct-Line-orders-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const doc = await docOf(dl, `${tag}-portal.xlsx`); expect(doc, tag + ' portal');
    if (lang === 'he') assert.ok(doc.includes('rightToLeft="1"') && doc.includes('שולם') && doc.includes('"כן,לא"'), 'Hebrew sheet');
    // only what is on screen: the "Cancelled" chip exports just that order
    await page.locator('[data-filter=cancelled]').click(); await page.waitForTimeout(200);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('[data-excel-export]').click()]);
    const doc2 = await docOf(dl2, `${tag}-portal-cancelled.xlsx`);
    assert.ok(doc2.includes('#42012') && !doc2.includes('#42010'), 'exports the filtered list');
    assert.deepEqual(errors, [], tag + ' portal'); await ctx.close();
    // ---------- admin client panel ----------
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.drawer [data-excel-export]'); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${tag}-admin-panel.png`) });
    const [dl3] = await Promise.all([page.waitForEvent('download'), ui.locator('.drawer [data-excel-export]').click()]);
    assert.match(dl3.suggestedFilename(), /^Direct-Line-orders-localclient-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(await docOf(dl3, `${tag}-admin.xlsx`), tag + ' admin');
    assert.deepEqual(errors, [], tag + ' admin'); await ctx.close();
    console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
