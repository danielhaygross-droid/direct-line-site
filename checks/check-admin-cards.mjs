// Check: the four admin cards above the tabs (Erwin, 23 Oct 2026). "Not paid yet" = billed orders with no payment
// linked (paid orders drop out), a note when a payment isn't linked to orders, and every card opens its list.
//   node checks/check-admin-cards.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'admin-cards');
await mkdir(out, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/test-admin.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=light><body style=margin:0><iframe name=admin src="/admin/?lang=${url.searchParams.get('lang') || 'en'}" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
    if (url.pathname === '/test-control.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=light><body style=margin:0><nav><button class="nav-item" data-client-tab="claims">Claims</button></nav><iframe name=admin src="/admin/?lang=en" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
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

const { admin, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const mk = async (ref, date, cost) => {
  const o = ok(await call('/orders', 'POST', { clientId: id, orderRef: ref, orderDate: date, buyerName: 'Sample', destination: 'US', address1: '1 Sample St', etsyUrl: 'https://example.com/i' }, admin)).order;
  if (cost) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin));
  return o;
};
// Three priced orders (each billed cost + the $2 fee) and one without a cost yet.
const a = await mk('CARD-A', '2026-10-05', 20), b = await mk('CARD-B', '2026-10-09', 30), c = await mk('CARD-C', '2026-10-12', 10);
await mk('CARD-D', '2026-10-14', 0);
const price = async o => Number((await DB.prepare('SELECT price FROM client_orders WHERE id=?').bind(o.id).first()).price);
const [pa, pb, pc] = [await price(a), await price(b), await price(c)];
// A is paid with its payment linked; a second $5 payment is not linked to any order.
ok(await call('/admin/payments', 'POST', { clientId: id, amount: pa, paidAt: '2026-10-20', method: 'Bank transfer', orderIds: [a.id] }, admin));
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 5, paidAt: '2026-10-21', method: 'Bank transfer' }, admin));
const usd = n => '$' + n.toFixed(2);

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-kpis] .stat-go');
    const cards = ui.locator('[data-kpis] .stat-go');
    assert.equal(await cards.count(), 2, tag + ': only Orders and Not paid yet open a list');
    assert.equal(await ui.locator('[data-kpis] .stat-plain').count(), 2, tag + ': Clients and Our earnings are plain');
    assert.equal(await ui.locator('[data-kpis] .stat-more').count(), 0, tag + ': no extra link lines');
    const notPaid = cards.nth(1);
    assert.equal(await notPaid.locator('strong').innerText(), usd(pb + pc), tag + ': only B and C are owed (A is paid)');
    if (lang === 'en') {
      assert.match(await notPaid.innerText(), /2 orders · 1 client · oldest 9 Oct 2026/, tag);
      assert.match(await notPaid.innerText(), new RegExp(`Account balance \\${usd(pb + pc - 5)}: some payments aren’t linked to orders`), tag + ': unlinked payment explained');
      assert.doesNotMatch(await ui.locator('[data-kpis]').innerText(), /Billed|paid \$/, tag + ': no billed / paid totals');
      assert.match(await cards.nth(0).innerText(), /4 waiting to be processed · 1 need cost/, tag);
    } else {
      assert.match(await notPaid.innerText(), /עוד לא שולם/, tag);
      assert.match(await notPaid.innerText(), /2 הזמנות · לקוח אחד · הישנה ביותר/, tag);
      assert.match(await notPaid.innerText(), /חלק מהתשלומים לא מקושרים להזמנות/, tag);
    }
    assert.ok(await notPaid.evaluate(el => el.classList.contains('owe')), tag + ': red when something is owed');
    await page.screenshot({ path: path.join(out, `${tag}-cards.png`) });
    // Each card opens its list.
    await notPaid.click();
    await ui.waitForSelector('.chip.t-unpaid.on');
    assert.equal(await ui.locator('[data-tab="orders"]').getAttribute('aria-selected'), 'true', tag);
    const rows = await ui.locator('[data-list]').innerText();
    assert.ok(rows.includes('CARD-B') && rows.includes('CARD-C') && !rows.includes('CARD-A'), tag + ': the unpaid orders');
    await page.screenshot({ path: path.join(out, `${tag}-unpaid-list.png`) });
    await cards.nth(0).click(); await ui.waitForSelector('.chip.t-pending.on');
    // Hover shows the card is clickable.
    if (width === 1440) { await notPaid.hover(); await page.waitForTimeout(250); await page.screenshot({ path: path.join(out, `${tag}-hover.png`), clip: { x: 0, y: 150, width: 1440, height: 330 } }); }
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
  // Inside the Control page (its sidebar has [data-client-tab]) the sidebar is the navigation: no inner tab bar,
  // and the sidebar can open Claims and Products too. On its own (test-admin.html above) the tabs stay.
  {
    const ctx = await session(admin, 1440), page = await ctx.newPage(); await page.goto(`${base}/test-control.html`);
    const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-kpis] .stat');
    assert.equal(await ui.locator('[data-main-tabs]').isVisible(), false, 'no second row of tabs inside Control');
    for (const tab of ['claims', 'products', 'orders']) { await page.evaluate(t => frames[0].postMessage({ type: 'dl-set-tab', tab: t }, location.origin), tab); await ui.waitForFunction(t => document.querySelector(`[data-tab="${t}"]`)?.classList.contains('on'), tab); }
    await ctx.close(); console.log('PASS inside Control: sidebar only, Claims and Products reachable');
  }
  // Everything paid: the card says so and is no longer red.
  ok(await call('/admin/payments', 'POST', { clientId: id, amount: pb + pc, paidAt: '2026-10-22', method: 'Bank transfer', orderIds: [b.id, c.id] }, admin));
  const ctx = await session(admin, 1440), page = await ctx.newPage();
  await page.goto(`${base}/test-admin.html?lang=en`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-kpis] .stat-go');
  const notPaid = ui.locator('[data-kpis] .stat-go').nth(1);
  assert.equal(await notPaid.locator('strong').innerText(), '$0.00');
  assert.match(await notPaid.innerText(), /Every billed order is paid/);
  assert.ok(!(await notPaid.evaluate(el => el.classList.contains('owe'))));
  await ctx.close(); console.log('PASS everything paid');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
