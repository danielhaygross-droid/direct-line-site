// Local check: Price, Cost, Profit and Net profit in the client's orders tables, and the "Your numbers" form
// (branch claude/net-profit). Run from the project root:  node checks/check-portal-money-columns.mjs
// Real SQL on in-memory Postgres (PGlite) + the real portal in Chrome. No live data.
//
// Accuracy: the three TRACKER rows below are real rows from the team's own profit tracker
// (ALL_Zippo_Stores_PROFIT_Data, OCTOBER): Buyer Paid - Etsy Fee - Product Cost = Profit.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'money-columns');
await mkdir(out, { recursive: true });

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const mk = async (ref, extra = {}) => ok(await call('/orders', 'POST', { clientId: id, orderRef: ref, buyerName: 'Sample', destination: 'IL', address1: '1 Sample St', etsyUrl: 'https://example.com/i', ...extra }, admin)).order;
const bill = (o, productCost, shippingFee) => call('/orders/' + o.id, 'PUT', { productCost, shippingFee }, admin).then(ok);
const setStatus = (o, status) => call('/orders/' + o.id, 'PUT', { status }, admin).then(ok);
const fee = (o, etsyFee) => call('/orders/' + o.id, 'PUT', { etsyFee }, client);
const events = async o => Number((await DB.prepare("SELECT COUNT(*) AS n FROM order_events WHERE order_id=? AND kind='edited' AND actor='client'").bind(o.id).first()).n);

// the team's tracker rows: [Buyer Paid, Etsy Fee, Product Cost, Profit]
const TRACKER = [[61.78, 17.08, 15.90, 28.80], [53.10, 9.31, 14.90, 28.89], [41.11, 13.03, 12.90, 15.18]];
const trackerOrders = [];
for (const [i, [paid, , cost]] of TRACKER.entries()) { const o = await mk('TRACKER-' + (i + 1), { sellingPrice: paid }); await bill(o, +(cost - 5).toFixed(2), 5); trackerOrders.push(o); }
await setStatus(trackerOrders[0], 'processing'); await setStatus(trackerOrders[1], 'processing'); await setStatus(trackerOrders[1], 'shipped'); // the fee must be enterable on locked orders too
for (const [i, [, etsyFee]] of TRACKER.entries()) ok(await fee(trackerOrders[i], String(etsyFee)));

const noFee = await mk('NO-FEE', { sellingPrice: 40 }); await bill(noFee, 14, 6);
const noPrice = await mk('NO-PRICE'); await bill(noPrice, 14, 6); ok(await fee(noPrice, '3.00'));
const euro = await mk('EURO', { sellingPrice: 40, currency: 'EUR' }); await bill(euro, 14, 6); ok(await fee(euro, '5'));
const unbilled = await mk('UNBILLED', { sellingPrice: 30 }); ok(await fee(unbilled, '4'));
const cancelled = await mk('CANCELLED', { sellingPrice: 25 }); await bill(cancelled, 5, 5); ok(await fee(cancelled, '2'));
ok(await call('/orders/' + cancelled.id, 'PUT', { status: 'cancelled', fee: 2 }, admin));

// ---- API ----
const mine = ok(await call('/orders', 'GET', null, client)).orders, by = ref => mine.find(o => o.orderRef === ref);
for (const [i, [paid, etsyFee, cost, profit]] of TRACKER.entries()) {
  const o = by('TRACKER-' + (i + 1));
  assert.deepEqual([o.sellingPrice, o.etsyFee, o.price], [paid, etsyFee, cost]);
  assert.equal(Math.round(o.sellingPrice * 100) - Math.round(o.etsyFee * 100) - Math.round(o.price * 100), Math.round(profit * 100), 'tracker row ' + (i + 1));
}
assert.equal(await events(trackerOrders[0]), 0, 'entering the fee on an order in progress is not an "edited" event for the admin');
assert.equal(await events(trackerOrders[1]), 0);
// What the client can and cannot change on a locked order.
assert.equal((await call('/orders/' + trackerOrders[1].id, 'PUT', { etsyFee: '9.31', notes: 'x' }, client)).status, 409, 'other fields stay locked, even mixed with the fee');
assert.equal((await call('/orders/' + trackerOrders[1].id, 'PUT', { quantity: 3 }, client)).status, 409);
for (const bad of ['-1', 'abc', '1e9']) assert.equal((await fee(trackerOrders[1], bad)).status, 400, 'fee ' + bad);
ok(await call('/orders/' + trackerOrders[1].id, 'PUT', { sellingPrice: '53.10', currency: 'USD', etsyFee: '9.31' }, client));
ok(await fee(noPrice, '')); assert.equal((await DB.prepare('SELECT etsy_fee FROM client_orders WHERE id=?').bind(noPrice.id).first()).etsy_fee, null, 'an empty fee clears it');
ok(await fee(noPrice, '3.00'));
for (const o of ok(await call('/orders', 'GET', null, client)).orders) for (const k of ['productCost', 'shippingFee', 'supplierCost', 'commission']) assert.ok(!(k in o), `client must not receive ${k}`);
assert.equal((await call('/orders/' + trackerOrders[0].id, 'PUT', { etsyFee: '1' }, admin)).status, 200, 'admins still edit everything');
ok(await fee(trackerOrders[0], '17.08'));
console.log('PASS API: the fee is saved on locked orders without notifying, other fields stay locked, bad fees refused, internal costs hidden');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
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
const session = async width => { const ctx = await browser.newContext({ viewport: { width, height: 950 } }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(client.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const HE = { earned: 'הרווחת', cost: 'עלות', profit: 'רווח' };
const cells = async (page, ref) => { const row = page.locator('tr[data-open-order]').filter({ hasText: ref }); const n = i => row.locator('td.num').nth(i).innerText().then(t => t.trim()); const pay = row.locator('td.num').nth(1).locator('.pay-tag'); return { earned: await n(0), cost: (await n(1)).split(String.fromCharCode(10))[0], pay: await pay.count() ? (await pay.getAttribute('class')).replace('pay-tag ', '') : '', profit: await n(2), net: await n(2), netClass: await row.locator('td.num').nth(2).getAttribute('class') }; };
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang} ${width}px`, ctx = await session(width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('tr[data-open-order]');
    if (width === 1440) {
      const heads = (await page.locator('.tbl thead th').allInnerTexts()).filter(Boolean);
      if (lang === 'en') assert.deepEqual(heads.map(h => h.toLowerCase()), ['order', 'customer', 'store', 'destination', 'tracking', 'earned', 'cost', 'profit', 'status'], tag + ' headers');
      else for (const h of Object.values(HE)) assert.ok(heads.includes(h), tag + ' header ' + h);
      assert.equal(await page.locator('.tbl thead th[title]').count(), 3, tag + ' tooltips');
    } else {
      const labels = await page.locator('tr[data-open-order]').first().locator('td.num:not(.hide-sm)').evaluateAll(t => t.map(x => x.getAttribute('data-label')));
      assert.deepEqual(labels, lang === 'en' ? ['Earned', 'Cost', 'Profit'] : Object.values(HE), tag + ' phone labels');
    }
    // the tracker rows: the net profit equals the tracker's Profit to the cent
    for (const [i, [paid, , cost, profit]] of TRACKER.entries()) {
      const c = await cells(page, 'TRACKER-' + (i + 1));
      assert.equal(c.earned, `$${(Math.round(paid * 100 - TRACKER[i][1] * 100) / 100).toFixed(2)}`, tag + ' tracker earned'); assert.equal(c.cost, `$${cost.toFixed(2)}`, tag + ' tracker cost'); assert.equal(c.pay, 'unpaid', tag + ' billed, no payment yet: Not paid'); assert.equal(c.net, `$${profit.toFixed(2)}`, tag + ' tracker net profit ' + (i + 1)); assert.match(c.netClass, /pos/);
    }
    const nf = await cells(page, 'NO-FEE'), np = await cells(page, 'NO-PRICE'), eu = await cells(page, 'EURO'), ub = await cells(page, 'UNBILLED'), ca = await cells(page, 'CANCELLED');
    const addFee = lang === 'en' ? 'Add Etsy fee' : 'להוסיף עמלת Etsy', pending = lang === 'en' ? 'Pending' : 'ממתינה';
    assert.equal(nf.earned, addFee, tag + ' fee not entered: asks for it, shows no guess'); assert.equal(nf.profit, '—');
    assert.equal(np.earned, '—', tag + ' no customer price'); assert.equal(np.net, '—'); assert.equal(eu.earned, 'EUR 35.00', tag + ' earned shown in its currency'); assert.equal(eu.profit, lang === 'en' ? 'Not in USD' : 'לא בדולר', tag + ' no profit in another currency'); assert.equal(ub.net, pending, tag + ' not billed'); assert.equal(ca.net, '—', tag + ' cancelled');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' no sideways scroll');
    if (width === 1440) await page.screenshot({ path: path.join(out, `${lang}-orders.png`) });
    // The order panel: the fee and the net profit line, and "Your numbers"
    await page.locator('tr[data-open-order]').filter({ hasText: 'TRACKER-1' }).click(); await page.waitForSelector('#numbers-form');
    const panel = await page.locator('.money-rows').first().innerText();
    assert.match(panel, /17\.08/, tag + ' fee line'); assert.match(panel, /44\.70/, tag + ' you earned line'); assert.match(panel, /28\.80/, tag + ' profit line'); assert.match(panel, lang === 'en' ? /Your profit/ : /הרווח שלך/);
    assert.equal(await page.locator('#numbers-form [name=etsyFee]').inputValue(), '17.08');
    if (width === 1440) await page.screenshot({ path: path.join(out, `${lang}-panel.png`) });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // Enter the fee for an order that lacks it: the table then shows the net profit
    await page.locator('tr[data-open-order]').filter({ hasText: 'NO-FEE' }).click(); await page.waitForSelector('#numbers-form');
    await page.locator('#numbers-form [name=etsyFee]').fill('5.5'); await page.locator('#numbers-form [type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#numbers-form')?.dataset.dirty, null, { timeout: 8000 });
    await page.waitForTimeout(600); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert.equal((await cells(page, 'NO-FEE')).net, '$14.50', tag + ' 40.00 - 5.50 - 20.00'); assert.equal(Number((await DB.prepare('SELECT etsy_fee FROM client_orders WHERE id=?').bind(noFee.id).first()).etsy_fee), 5.5);
    await DB.prepare('UPDATE client_orders SET etsy_fee=NULL WHERE id=?').bind(noFee.id).run(); // reset for the next round
    // Home: the short list keeps the three columns (no Net profit there)
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('[data-home-grid] tr[data-open-order]');
    assert.equal(await page.locator('[data-home-grid] tr[data-open-order]').first().locator('td.num:not(.hide-sm)').count(), 3, tag + ' home money cells');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ' home: no sideways scroll');
    assert.deepEqual(errors, [], tag); console.log(`PASS ${tag}: headers, tracker rows equal to the cent, missing fee/price/USD/unbilled/cancelled, panel lines, entering the fee`);
    await ctx.close();
  }
  // admin preview of a client's portal: read only, no numbers form
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await adminCtx.addCookies([{ name: 'dl_session', value: decodeURIComponent(admin.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]);
  const ap = await adminCtx.newPage(); await ap.goto(`${base}/portal/?as=${id}#/orders`); await ap.locator('tr[data-open-order]').first().click(); await ap.waitForTimeout(700);
  assert.equal(await ap.locator('#numbers-form').count(), 0, 'no numbers form in the admin preview'); await adminCtx.close();
  console.log('PASS admin preview has no numbers form');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
