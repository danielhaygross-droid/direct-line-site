// Check: the pay box asks for the same amount as Balance due (Erwin, 5 Nov 2026: Balance due lower than "Send the
// total"). Money the client already has with us that no order shows (here a $40 payment for a $30 order: $10)
// comes off what they send: Home strip, "Send the total", Copy amount and the amount field all say Balance due, the box
// shows "Ticked orders $45.00 minus the credit on your account -$10.00", and unticking or typing compares against
// the ticked orders minus the credit. The admin's "Record payment" list takes the same credit off.
//   node checks/check-pay-credit.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'pay-credit');
await mkdir(out, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/test-admin.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=light><body style=margin:0><iframe name=admin src="/admin/?lang=${url.searchParams.get('lang') || 'en'}" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url);
const fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(fixture)).toString('base64') };
const mk = async (ref, date, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
  if (cost != null) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id;
};
const A = await mk('SHOP-201', '2026-10-02', 20), B = await mk('SHOP-202', '2026-10-06', 25), C = await mk('SHOP-203', '2026-10-11', 30);
await mk('SHOP-204', '2026-10-13', null);  // no cost yet: not billed, not in the list
const ticked = loc => loc.locator('[name=poOrder]:checked').evaluateAll(i => i.map(x => Number(x.value)));
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 40, paidAt: '2026-10-20', method: 'Bank transfer', orderIds: [C] }, admin));
const moneyOf = t => t.replace(/[^\d.]/g, '');
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('.pay-strip');
    // Balance due = $75 billed - $40 paid = $35; the strip says the same, not the $45 of the two unpaid orders.
    assert.match(await page.locator('.pay-strip').innerText(), /\$35\.00/, tag + ' strip = balance due');
    await page.screenshot({ path: path.join(out, `${tag}-home.png`) });
    await page.goto(`${base}/portal/?lang=${lang}#/payments?pay=1`); await page.reload(); await page.waitForSelector('#pay-flow [name=poOrder]');
    const f = page.locator('#transfer-form');
    assert.deepEqual(await ticked(f), [A, B], tag);
    assert.equal(await f.locator('[data-pf-total]').innerText(), '$35.00', tag + ' send the total = balance due');
    assert.equal(await f.locator('[name=amount]').inputValue(), '35.00', tag);
    assert.equal(await f.locator('[data-pf-copy]').getAttribute('data-copy'), '35.00', tag);
    assert.equal(await f.locator('[data-pf-sum]').innerText(), '$45.00', tag + ' ticked orders before the credit');
    assert.match(await f.locator('[data-pf-credit]').innerText(), lang === 'en' ? /Ticked orders \$45\.00 minus the credit on your account -\$10\.00/ : /הזמנות שסומנו[\s\S]*פחות הזיכוי בחשבון שלך[\s\S]*-\$10\.00/, tag);
    assert.equal(moneyOf(await page.locator('[data-statement-result]').innerText()), '35.00', tag + ' "To pay" on the account statement');
    await f.locator('[data-pf-credit]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-pay-credit.png`) });
    // Untick B ($25): $20 - $10 credit = $10 to send.
    await f.locator(`[name=poOrder][value="${B}"]`).uncheck();
    assert.equal(await f.locator('[data-pf-total]').innerText(), '$10.00', tag);
    assert.equal(await f.locator('[data-pf-sum]').innerText(), '$20.00', tag);
    assert.equal(await f.locator('[name=amount]').inputValue(), '10.00', tag);
    await f.locator('[name=amount]').fill('15');
    if (lang === 'en') assert.equal(await f.locator('[data-pf-gap]').innerText(), 'The amount is $5.00 more than the ticked orders minus your credit.');
    else assert.match(await f.locator('[data-pf-gap]').innerText(), /הסכום גבוה ב-\$5\.00 מההזמנות שסומנו פחות הזיכוי\./);
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
  // Admin, Record payment for this client: the list carries the same $10 credit; $35 for both orders matches.
  {
    const ctx = await session(admin, 1440), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=en`); await page.waitForTimeout(500); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click();
    await ui.locator('.gtabs button').nth(2).click(); await page.waitForTimeout(300); await ui.locator('.subtabs [data-ctab=payments]').click();
    await ui.waitForSelector('.pay-cards'); await page.waitForTimeout(400);
    await ui.locator('[data-pay-new]').first().click(); await ui.waitForSelector('[data-pay-form] [data-po]');
    const pf = ui.locator('[data-pay-form]');
    assert.equal(await pf.locator('[data-po]').getAttribute('data-credit'), '1000', 'admin list: $10 credit');
    for (const o of [A, B]) await pf.locator(`[name=poOrder][value="${o}"]`).check();
    await pf.locator('[name=amount]').fill('35');
    assert.equal(await pf.locator('[data-po-gap]').innerText(), 'The amount matches the ticked orders minus credit.');
    await pf.locator('[data-po]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'en-1440-admin-record.png') });
    assert.deepEqual(errors, []); await ctx.close(); console.log('PASS admin list takes the credit off');
  }
  // A paid order's cost goes down afterwards (Erwin, 5 Nov 2026: the client paid, then asked for a cost revision and the
  // supplier lowered it): the difference is credit too, so it comes off the next payment. C was $30, paid; now $24.
  ok(await call('/orders/' + C, 'PUT', { productCost: 24, shippingFee: 0 }, admin));
  {
    const ctx = await session(client, 1440), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=en#/payments?pay=1`); await page.reload(); await page.waitForSelector('#pay-flow [name=poOrder]');
    const f = page.locator('#transfer-form');
    // Billed $69 - paid $40 = $29; unpaid A + B = $45; credit $16 = $10 extra paid + $6 lowered cost.
    assert.match(await page.locator('[data-statement-result]').innerText(), /\$29\.00/, 'balance due after the lower cost');
    assert.equal(await f.locator('[data-pf-total]').innerText(), '$29.00', 'send the total = balance due');
    assert.match(await f.locator('[data-pf-credit]').innerText(), /Ticked orders \$45\.00 minus the credit on your account -\$16\.00/);
    await f.locator('[data-pf-credit]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'en-1440-lowered-after-paid.png') });
    assert.deepEqual(errors, []); await ctx.close(); console.log('PASS a lower cost on a paid order comes off the next payment');
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
