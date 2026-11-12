// Account statement (Erwin, 12 Nov 2026: "the money flows are all over the place"; Ada's sums did not match the admin).
// One rule on every screen: billed - received = to pay / credit. The admin client panel and the client's Payments page
// show the same statement (the admin also without our fee, the supplier sheet's way of counting); orders the credit
// already covers say "Covered by credit" instead of "Not paid"; the Cancelled orders box ends on the statement's credit
// and shows the credit left per cancel date.
//   node checks/check-account-statement.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'account-statement');
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const get = async oid => (await call('/orders', 'GET', null, client)).data.orders.find(x => x.id === oid);
// Different products so no order is priced from an earlier one.
const mk = async (ref, cost) => { const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Buyer ' + ref, address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/' + ref, photos: [photo] }, client)).order; if (cost != null) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return get(o.id); };
const pay = async (orders, amount, day) => ok(await call('/admin/payments', 'POST', { clientId: id, amount, paidAt: day, method: 'Bank transfer', orderIds: orders.map(o => o.id) }, admin));
const sum = l => Math.round(l.reduce((n, o) => n + o.price, 0) * 100) / 100;
const cancel = async (o, fee) => { if (fee) await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=? WHERE id=?').bind(fee, o.id).run(); ok(await call('/orders/' + o.id + '/request-cancellation', 'POST', { reason: 'Customer cancelled' }, client)); ok(await call('/orders/' + o.id + '/approve-cancellation', 'POST', {}, admin)); };

// A client shaped like a real one: 6 orders paid ($120); 3 orders paid ($90) then cancelled with fees; 2 unpaid orders
// cancelled (one fee from the credit); 2 later orders ($50) paid with a $20 transfer (credit used: $30); 2 orders
// billed and not paid ($24); 1 order with no cost yet. Our fee is $2 an order.
const L = []; for (let i = 1; i <= 6; i++) L.push(await mk('LIVE-' + i, 20)); await pay(L, sum(L), '2026-10-10');
const C = []; for (let i = 1; i <= 3; i++) C.push(await mk('CANC-PAID-' + i, 30)); await pay(C, sum(C), '2026-10-12');
await cancel(C[0], 0); await cancel(C[1], 5); await cancel(C[2], 8);
const U1 = await mk('CANC-UNPAID-FEE', 15), U2 = await mk('CANC-UNPAID-FREE', 15); await cancel(U1, 3); await cancel(U2, 0);
const N = [await mk('LATER-1', 25), await mk('LATER-2', 25)]; await pay(N, sum(N) - 30, '2026-10-20');
const W = [await mk('WAIT-1', 12), await mk('WAIT-2', 12)]; await mk('NO-COST', null);

// ---- the numbers (server) ----
const me = ok(await call('/me', 'GET', null, client)).summary, ac = ok(await call('/admin/overview', 'GET', null, admin)).clients.find(x => x.id === id);
assert.deepEqual([me.billed, me.paid, me.refunded, me.outstanding], [216, 230, 0, -14], 'billed 216 - received 230 = credit 14');
assert.deepEqual(me.parts, { orders: 194, fees: 22, other: 0 }, 'the bill: 10 orders + cancellation fees');
assert.equal(Math.round((me.parts.orders + me.parts.fees + me.parts.other) * 100), Math.round(me.billed * 100), 'the parts add up to Total billed');
assert.ok(!('supplier' in me) && !JSON.stringify(me).includes('ourFee'), 'the client never gets the column without our fee');
assert.deepEqual(ac.supplier, { orders: 174, fees: 16, other: 0, billed: 190, received: 208, ourFee: 22, balance: -18 }, 'without our fee: 190 billed - 208 received = credit 18');
assert.equal(Math.round((ac.supplier.received + ac.supplier.ourFee) * 100), Math.round((ac.paid - ac.refunded) * 100), 'received without our fee + our fee = received');
console.log('PASS numbers: billed 216 = 194 orders + 22 fees; received 230; credit 14; without our fee 190 - 208 = credit 18');

const openPayments = async (ui, page) => { await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.gtabs'); await ui.locator('.gtabs button').nth(2).click(); await ui.locator('.subtabs [data-ctab=payments]').click(); await ui.waitForSelector('[data-statement]'); await page.waitForTimeout(400); };
const flat = t => t.replace(/\s+/g, ' ');
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // ---- client portal: Payments ----
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/payments`); await page.reload(); await page.waitForSelector('[data-statement]'); await page.waitForTimeout(500);
    const st = flat(await page.locator('[data-statement]').innerText());
    if (lang === 'en') {
      assert.match(st, /Credit \$14\.00 You owe nothing/, tag + ' the result in words: ' + st);
      assert.match(st, /10 orders \$194\.00 Cancellation fees \(5 cancelled orders\) \$22\.00 Total billed \$216\.00/, tag + ' what was billed');
      assert.match(st, /3 payments \$230\.00 Total paid \$230\.00 3 · Billed − paid Credit \$14\.00/, tag + ' what was paid and the result');
      assert.match(st, /Paid orders 8 \$170\.00 Covered by credit 2 \$24\.00 nothing to send No bill yet 1 waiting for the cost Cancelled 5 3 were paid/, tag + ' the orders behind it');
      assert.ok(!/our fee/i.test(st), tag + ' the client never sees our fee');
    } else assert.match(st, /דף חשבון זיכוי \$14\.00[\s\S]*סה״כ חויב \$216\.00[\s\S]*סה״כ שולם \$230\.00[\s\S]*מכוסות בזיכוי 2 \$24\.00/, tag + ' Hebrew statement: ' + st);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll (Payments)');
    await page.screenshot({ path: path.join(out, `${tag}-portal-statement.png`) });
    // The cancelled box ends on the same credit as the statement, and shows the credit left per cancel date.
    await page.goto(`${base}/portal/?lang=${lang}#/payments?tab=cancelled`); await page.reload(); await page.waitForSelector('[data-cancelled-box]'); await page.waitForTimeout(400);
    const cx = flat(await page.locator('[data-cancelled-box] .cx-calc').innerText());
    if (lang === 'en') assert.match(cx, /= Credit left \$38\.00 − Covers the orders not paid yet -\$24\.00 = Credit on the account[\s\S]*\$14\.00/, tag + ' credit left 38 - unpaid 24 = the statement credit 14: ' + cx);
    assert.equal(await page.locator('[data-cancelled-box] .cx-dleft').first().getAttribute('data-cents'), '3800', tag + ' credit left for the cancel date');
    await page.locator('[data-cancelled-box]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-cancelled.png`) });
    // Orders: the two unpaid orders are covered by credit, so "Not paid" lists nothing.
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.reload(); await page.waitForSelector('[data-orders-list]'); await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-orders-list] .pay-tag.credit').count(), 2, tag + ' two orders say Covered by credit');
    assert.equal(await page.locator('[data-orders-list] .pay-tag.unpaid').count(), 0, tag + ' none says Not paid');
    assert.equal(await page.locator('[data-filter=unpaid]').count(), 0, tag + ' no Not paid filter when nothing is owed');
    // Home: one result, no second credit.
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('[data-money-now]'); await page.waitForTimeout(400);
    const home = flat(await page.locator('[data-money-now]').innerText());
    if (lang === 'en') assert.ok(/Credit on your account \$14\.00/.test(home) && !/Credit left|\$38\.00/.test(home), tag + ' Home shows the one credit: ' + home);
    assert.equal(await page.locator('.pay-strip').count(), 0, tag + ' nothing to pay: no pay strip');
    assert.deepEqual(errors, [], tag + ' portal: no page errors'); await ctx.close();

    // ---- admin: client panel ----
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await openPayments(ui, page);
    const as = flat(await ui.locator('[data-statement]').innerText());
    if (lang === 'en') {
      assert.match(as, /Credit \$14\.00 The client owes nothing/, tag + ' admin result: ' + as);
      assert.match(as, /10 orders \$194\.00 \$174\.00 Cancellation fees \(5 cancelled orders\) \$22\.00 \$16\.00 Total billed \$216\.00 \$190\.00/, tag + ' billed, with and without our fee');
      assert.match(as, /3 payments \$230\.00 \$208\.00 Total received \$230\.00 \$208\.00 3 · Billed − received Credit \$14\.00 Credit \$18\.00/, tag + ' received and the two results');
      assert.match(as, /Our fee received so far: \$22\.00/, tag + ' our fee');
      assert.match(as, /Paid orders 8 \$170\.00 without our fee \$154\.00 Covered by credit 2 \$24\.00 without our fee \$20\.00/, tag + ' tiles with the supplier amounts');
      assert.match(flat(await ui.locator('.drawer.open .kpis').innerText()), /Credit \$14\.00 Billed \$216\.00 Without our fee \$18\.00/, tag + ' panel header says Credit, never a bare minus');
    }
    assert.equal(await ui.locator('.drawer.open .pay-sum').count(), 0, tag + ' the four old tiles are gone');
    await ui.locator('[data-statement]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-statement.png`) });
    if (!(await ui.locator('.cx-fold').evaluate(d => d.open))) await ui.locator('.cx-fold > summary').click(); await page.waitForTimeout(300);
    if (lang === 'en') assert.match(flat(await ui.locator('[data-cancelled-box] .cx-calc').innerText()), /= Credit on the account the same as the account statement \$14\.00/, tag + ' admin cancelled box ends on the statement credit');
    await ui.locator('[data-cancelled-box] .cx-dates').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-cancelled.png`) });
    assert.deepEqual(errors, [], tag + ' admin: no page errors'); await ctx.close();
  }
  console.log('PASS screens: the statement, Covered by credit and the cancelled box agree (EN/HE, 1440/390)');

  // ---- the client now owes money: a $50 order arrives. Credit 14 goes toward it: billed 266 - 230 = 36 to pay. ----
  await mk('BIG-1', 50);
  const me2 = ok(await call('/me', 'GET', null, client)).summary; assert.equal(me2.outstanding, 36, 'to pay 36');
  let ctx = await session(client, 1440), page = await ctx.newPage();
  await page.goto(`${base}/portal/?lang=en#/payments`); await page.reload(); await page.waitForSelector('[data-statement]'); await page.waitForTimeout(500);
  const st2 = flat(await page.locator('[data-statement]').innerText());
  assert.match(st2, /To pay \$36\.00 Please send this to Direct Line/, 'the result says To pay: ' + st2);
  assert.match(st2, /Covered by credit 2 \$24\.00 nothing to send Still to pay 1 \$36\.00/, 'the oldest two stay covered; the new order is still to pay');
  assert.equal(await page.locator('[data-pay-tab=pay] .pay-tab-n').innerText(), '1', 'the Pay tab counts the one order still to pay');
  await page.screenshot({ path: path.join(out, 'en-1440-portal-to-pay.png') });
  await page.goto(`${base}/portal/?lang=en#/orders`); await page.reload(); await page.waitForSelector('[data-orders-list]'); await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-orders-list] .pay-tag.unpaid').count(), 1, 'one order says Not paid');
  assert.equal(await page.locator('[data-orders-list] .pay-tag.credit').count(), 2, 'two still say Covered by credit');
  await ctx.close();
  ctx = await session(admin, 1440); page = await ctx.newPage(); await page.goto(`${base}/test-admin.html?lang=en`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
  await openPayments(ui, page);
  assert.match(flat(await ui.locator('[data-statement]').innerText()), /To pay \$36\.00[\s\S]*Still to pay 1 \$36\.00 without our fee \$30\.00/, 'admin: to pay 36, of which 30 without our fee');
  assert.match(flat(await ui.locator('[data-list] td[data-label=Balance]').first().innerText()), /To pay \$36\.00/, 'Clients table: To pay $36.00');
  await page.screenshot({ path: path.join(out, 'en-1440-admin-to-pay.png') }); await ctx.close();
  console.log('PASS to pay: credit goes to the oldest orders first; one order still to pay, $36.00');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
