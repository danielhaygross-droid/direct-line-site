// Orders by week or month (Erwin, 19 Nov 2026: "sort the orders by month and week across all portals").
// One picker on the client Orders, admin Client orders and supplier Orders lists: All time, This week, Last week, This
// month, Last month, one past month, or a custom range. An order belongs to the day it was sent in; weeks start on
// Monday; the chip / tab counts follow the picked period. English + Hebrew (supplier: 中文), 1440 + 390 px.
//   node checks/check-order-period.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'order-period');
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

// --- The rule itself, worked out here on its own: Monday weeks, months, in this computer's time zone. ---
const now = new Date();
const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const weekStart = d => { const x = day0(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const thisMon = weekStart(now), lastMon = new Date(thisMon); lastMon.setDate(lastMon.getDate() - 7);
const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
const sunBefore = at(new Date(thisMon.getTime() - 864e5), 23, 30);      // Sunday 23:30 just before this week: last week
const dates = [new Date(now.getTime() - 30 * 60e3), at(thisMon, 0, 30), sunBefore, at(new Date(lastMon.getTime() + 2 * 864e5), 12),
  new Date(now.getTime() - 20 * 864e5), new Date(now.getTime() - 40 * 864e5), new Date(now.getTime() - 75 * 864e5)].filter(d => d <= now);
const inRange = (d, a, b) => d >= a && d < b;
const monthStart = (y, m) => new Date(y, m, 1);
const expect = {
  all: dates.length,
  this_week: dates.filter(d => d >= thisMon).length,
  last_week: dates.filter(d => inRange(d, lastMon, thisMon)).length,
  this_month: dates.filter(d => inRange(d, monthStart(now.getFullYear(), now.getMonth()), monthStart(now.getFullYear(), now.getMonth() + 1))).length,
  last_month: dates.filter(d => inRange(d, monthStart(now.getFullYear(), now.getMonth() - 1), monthStart(now.getFullYear(), now.getMonth()))).length,
};
assert.ok(dates.includes(sunBefore) && expect.last_week >= 1, 'the Sunday before this week counts as last week');
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const custom = { from: ymd(lastMon), to: ymd(new Date(thisMon.getTime() - 864e5)) }; // last Monday .. last Sunday = last week
// The picker's own logic, outside a browser.
{ const P = (await import('node:vm')).default, ctx = { globalThis: {} }; ctx.window = ctx.globalThis; P.runInNewContext(await readFile(path.join(root, 'p/order-period.js'), 'utf8'), ctx); const D = ctx.window.DLPeriod;
  for (const k of ['all', 'this_week', 'last_week', 'this_month', 'last_month']) assert.equal(dates.filter(d => D.match(d.getTime() / 1000, { k })).length, expect[k], 'rule: ' + k);
  assert.equal(dates.filter(d => D.match(d.getTime() / 1000, { k: 'custom', ...custom })).length, expect.last_week, 'custom range = last week, both ends included');
  assert.equal(D.match(sunBefore.getTime() / 1000, { k: 'this_week' }), false, 'Sunday 23:30 is not in this week');
  console.log('PASS the rule: Monday weeks, months, a custom range with both days included', JSON.stringify(expect)); }

// --- Data: one client, one order per date; the supplier sees them all under New. ---
const { admin, client, id } = await seed();
ok(await call('/admin/users/' + id, 'POST', { name: 'Juniper & Co.' }, admin));
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
for (let i = 0; i < dates.length; i++) {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: String(4231000000 + i), itemTitle: 'Wool felt slippers', buyerName: 'Jane Buyer ' + i, address1: '1 Sample St', city: 'Austin', destination: 'US', etsyUrl: 'https://example.com/' + i, photos: [photo] }, client)).order;
  await DB.prepare('UPDATE client_orders SET created_at = ? WHERE id = ?').bind(Math.floor(dates[i].getTime() / 1000), o.id).run();
}
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;

// Picks a period on a page (or frame) and returns the shown rows and the count on the "All" / New chip.
const LABEL = { en: { this_week: 'This week', last_week: 'Last week' }, he: { this_week: 'השבוע', last_week: 'השבוע שעבר' }, zh: { this_week: '本周', last_week: '上周' } };
async function walk(ui, tag, rows, count, lang) {
  const sel = ui.locator('[data-period-pick] >> visible=true').first();
  const opts = await sel.locator('option').allInnerTexts();
  assert.ok(opts.some(o => o.startsWith(LABEL[lang].this_week + ' · ')) && opts.some(o => o.startsWith(LABEL[lang].last_week + ' · ')), `${tag}: week choices in ${lang}: ${opts.join(' | ')}`);
  for (const k of ['all', 'this_week', 'last_week', 'this_month', 'last_month']) {
    await ui.locator('[data-period-pick] >> visible=true').first().selectOption(k); await ui.waitForTimeout(250);
    assert.equal(await rows(), expect[k], `${tag}: rows for ${k}`);
    assert.equal(await count(), expect[k], `${tag}: count for ${k}`);
  }
  await ui.locator('[data-period-pick] >> visible=true').first().selectOption('custom'); await ui.waitForTimeout(250);
  await ui.locator('[data-period-from] >> visible=true').first().fill(custom.from); await ui.locator('[data-period-from] >> visible=true').first().dispatchEvent('change');
  await ui.locator('[data-period-to] >> visible=true').first().fill(custom.to); await ui.locator('[data-period-to] >> visible=true').first().dispatchEvent('change'); await ui.waitForTimeout(300);
  assert.equal(await rows(), expect.last_week, `${tag}: custom range rows`);
  await (typeof ui.page === 'function' ? ui.page() : ui).screenshot({ path: path.join(out, tag.replace(/\W+/g, '-') + '-custom.png') });
  await ui.locator('[data-period-pick] >> visible=true').first().selectOption('last_week'); await ui.waitForTimeout(250);
}
const noSideways = async (page, tag) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + ': no sideways scroll');
try {
  // Client portal.
  for (const lang of ['en', 'he']) for (const w of [1440, 390]) {
    const tag = `client ${lang}-${w}`, ctx = await session(client, w), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('[data-period-pick]');
    const rows = () => page.evaluate(() => { const c = document.querySelector('[data-orders-list] .tbl'); return c ? [...c.querySelectorAll('tbody tr')].filter(r => r.offsetParent).length : 0; });
    const count = () => page.evaluate(() => Number(document.querySelector('[data-filter=all] span')?.textContent || 0));
    await walk(page, tag, rows, count, lang);
    await noSideways(page, tag);
    await page.screenshot({ path: path.join(out, `${lang}-${w}-client.png`) });
    assert.deepEqual(errors, [], tag + ': no page errors'); await ctx.close();
  }
  console.log('PASS client Orders: week, month, custom range, the All chip count follows (EN, HE, 1440, 390)');
  // Admin.
  for (const lang of ['en', 'he']) for (const w of [1440, 390]) {
    const tag = `admin ${lang}-${w}`, ctx = await session(admin, w), page = await ctx.newPage();
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' });
    await ui.waitForSelector('[data-tab=orders]'); await ui.locator('[data-tab=orders] >> visible=true').first().click(); await ui.locator('[data-filter="all"]').click(); await ui.waitForSelector('[data-period-pick]');
    const rows = () => ui.evaluate(() => document.querySelectorAll('[data-list] tr[data-open-order]').length);
    const count = () => ui.evaluate(() => Number(document.querySelector('[data-filter=all] span')?.textContent || 0));
    await walk(ui, tag, rows, count, lang);
    assert.ok(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + ': no sideways scroll');
    await page.screenshot({ path: path.join(out, `${lang}-${w}-admin.png`) });
    await ctx.close();
  }
  console.log('PASS admin Client orders: week, month, custom range, the All chip count follows (EN, HE, 1440, 390)');
  // Supplier.
  for (const lang of ['en', 'zh']) for (const w of [1440, 390]) {
    const tag = `supplier ${lang}-${w}`, ctx = await session(sup, w), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/supplier/?lang=${lang}#orders`); await page.waitForSelector('[data-period-pick]');
    const rows = () => page.evaluate(w => document.querySelectorAll(w < 860 ? '.sp-ocard[data-row]' : 'tr[data-row]').length, w);
    const count = () => page.evaluate(() => Number(document.querySelector('[data-tab=new]').innerText.replace(/\D+/g, ' ').trim().split(' ')[0]));
    await walk(page, tag, rows, count, lang);
    await noSideways(page, tag);
    await page.screenshot({ path: path.join(out, `${lang}-${w}-supplier.png`) });
    // Clear filters also clears the period.
    await page.locator('[data-filters]').click(); await page.locator('[data-clear] >> visible=true').first().click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-period-pick] >> visible=true').first().inputValue(), 'all', tag + ': Clear filters resets the period');
    assert.equal(await rows(), expect.all, tag + ': all orders back');
    assert.deepEqual(errors, [], tag + ': no page errors'); await ctx.close();
  }
  console.log('PASS supplier Orders: week, month, custom range, the New tab count follows, Clear filters resets it (EN, 中文, 1440, 390)');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
