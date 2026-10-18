// Check: the month picker above the admin cards and in the client portal's period picker; one month = a bar per day.
//   node checks/check-month-view.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'month-view');
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
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
const mk = async (ref, date, cost, extra = {}) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Sample', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo], sellingPrice: 50, etsyFee: 5, ...extra }, client)).order;
  ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o;
};
const today = new Date(), iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const thisMonth = iso(today).slice(0, 7), prev = new Date(today.getFullYear(), today.getMonth() - 1, 15), prevMonth = iso(prev).slice(0, 7);
await mk('SEP-1', prevMonth + '-03', 20); await mk('SEP-2', prevMonth + '-20', 25);      // last month: 2 orders, profit (45-20)+(45-25) = 45
await mk('NOW-1', iso(today), 30);                                                       // this month: 1 order, profit 15
const prevDays = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // Admin: the four cards for one month.
    let ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-kpi-month] option[value="all"]', { state: 'attached' });
    assert.deepEqual(await ui.locator('[data-kpi-month] option').evaluateAll(o => o.map(x => x.value)), ['all', thisMonth, prevMonth]);
    const cards = async () => ui.locator('[data-kpis] .stat strong').allInnerTexts();
    assert.equal((await cards())[1], '3', tag + ' all time: 3 orders');
    await ui.locator('[data-kpi-month]').selectOption(prevMonth); await page.waitForTimeout(200);
    const c = await cards(); assert.equal(c[0], '1'); assert.equal(c[1], '2', tag + ' last month: 2 orders'); assert.equal(c[2], '$45.00', tag + ' billed 20 + 25 (fee included in the bill)'); assert.equal(c[3], '$4.00', tag + ' fees 2 x $2');
    await page.screenshot({ path: path.join(out, `${tag}-admin.png`) });
    await page.reload(); const ui2 = page.frame({ name: 'admin' }); await ui2.waitForSelector('[data-kpi-month] option[value="all"]', { state: 'attached' });
    assert.equal(await ui2.locator('[data-kpi-month]').inputValue(), prevMonth, 'remembered');
    await ui2.locator('[data-kpi-month]').selectOption('all');
    assert.deepEqual(errors, [], tag); await ctx.close();
    // Client portal: pick last month in the Period picker: the cards follow, the chart has a bar per day.
    ctx = await session(client, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.reload(); await page.waitForSelector('[data-period-form] [name=period]');
    await page.locator('[data-period-form] [name=period]').first().selectOption('m:' + prevMonth); await page.waitForTimeout(400);
    assert.equal(await page.locator('.bars.days .bar-col').count(), prevDays, tag + ' a bar per day');
    if (lang === 'en') assert.match(await page.locator('.chart-legend').first().innerText(), /\$45\.00/, tag + ' profit for the month');
    await page.locator('.bars').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
