// The subscription on the bill (Erwin, 18 Nov 2026: "we just include yehuda subscription to his future bill"; he chose
// dollars on the bill and a calm banner). Status "On the bill": one charge a month from the day the free month ended, at
// the $ amount in Settings. It is on the client's bill and ours: not in the supplier's statement, and what was paid of it
// is passed on to us like our fee. Client Payments + Home + bell, admin statement. EN + HE, 1440 + 390.
//   node checks/check-subscription-bill.mjs
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'subscription-bill');
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
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const flat = t => t.replace(/\s+/g, ' ');
const { todayIso } = await import('../server/portal.mjs');
const { admin, client, id } = await seed();
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const photo = { filename: 'p.png', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=' };
const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: 'SUB-1', buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
ok(await call('/orders/' + o.id, 'PUT', { productCost: 20, shippingFee: 0 }, admin)); // $20, our $2 fee inside
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 40, paidAt: '2026-11-01', method: 'Bank transfer', orderIds: [o.id] }, admin));

// Settings: the $ amount (empty = nothing added); a wrong amount is refused.
assert.equal((await call('/admin/settings', 'POST', { subscription_usd: 'abc' }, admin)).status, 400);
ok(await call('/admin/settings', 'POST', { subscription_usd: '8' }, admin));
// The free month ended yesterday: one month on the bill (on its last day nothing is added yet).
const today = todayIso(), day = n => new Date(Date.parse(today + 'T12:00:00Z') - n * 86400000).toISOString().slice(0, 10);
ok(await call('/admin/users/' + id, 'POST', { subStatus: 'bill', trialStart: day(30), trialEnd: today }, admin));
assert.equal(ok(await call('/me', 'GET', null, client)).summary.parts.subscription, 0, 'the last free day: nothing yet');
ok(await call('/admin/users/' + id, 'POST', { trialStart: day(31), trialEnd: day(1) }, admin));
const me = ok(await call('/me', 'GET', null, client)), s = me.summary;
assert.equal(me.subscription.status, 'bill'); assert.equal(me.subscription.billUsd, 8);
assert.deepEqual([s.parts.subscription, s.parts.subscriptionMonths, s.billed, s.paid, s.outstanding], [8, 1, 28, 40, -12], 'bill = $20 order + $8 subscription; paid 40 -> credit 12');
assert.equal(s.supplier, undefined, 'the client never gets the supplier side');
assert.equal(ok(await call('/me', 'GET', null, client)).summary.parts.subscriptionMonths, 1, 'looking again adds nothing');
// Admin: our earnings include it; the supplier's statement doesn't.
const ov = ok(await call('/admin/overview', 'GET', null, admin)), c = ov.clients.find(x => x.id === id);
assert.equal(c.subscription, 8); assert.equal(c.supplier.billed, 18, 'not on the supplier statement');
assert.deepEqual([c.supplier.subscriptionPaid, c.supplier.received, c.supplier.ourFee, c.supplier.balance], [8, 30, 10, -12], 'paid from the credit: ours, like our fee');
assert.equal(ov.months.find(m => m.month === today.slice(0, 7)).subs, 8, 'in the money of this month');
// Supplier portal: the same numbers, and the payment shows only the supplier part.
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const sc = ok(await call('/supplier/billing/' + id, 'GET', null, sup)).client;
assert.deepEqual([sc.orders, sc.paidForYourPart, sc.balance], [18, 30, -12]);
assert.equal(sc.payments.reduce((n, p) => n + p.yourPart, 0), 30, 'the payments add up to what was paid for the supplier part');
// The bell: one item.
const bell = ok(await call('/notifications', 'GET', null, client)).items.filter(x => x.kind === 'subscription');
assert.equal(bell.length, 1); assert.match(bell[0].detail, /^bill\|/);
console.log('PASS api: one month on the bill, paid from the credit, ours and not the supplier part; bell item');

let errors = [];
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(tag + ': ' + e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/payments`); await page.reload(); await page.waitForSelector('[data-statement]'); await page.waitForTimeout(500);
    const st = flat(await page.locator('[data-statement]').innerText());
    assert.match(st, lang === 'he' ? /מנוי Direct Line \(חודש אחד × ₪29\) \$8\.00/ : /Direct Line subscription \(1 month × ₪29\) \$8\.00 Total billed \$28\.00/, tag + ' statement line: ' + st);
    await page.locator('[data-statement]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-statement.png`) });
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('.sub-banner.ok'); await page.waitForTimeout(400);
    assert.equal(await page.locator('.sub-banner.due').count(), 0, tag + ' no red banner');
    assert.match(flat(await page.locator('.sub-banner.ok').innerText()), lang === 'he' ? /נוסף לחשבון שלך בכל חודש/ : /The subscription \(29 ₪ \/ month\) is added to your bill every month\./, tag + ' banner');
    await page.screenshot({ path: path.join(out, `${tag}-portal-home.png`) });
    await page.locator('[data-bell]').click(); await page.waitForTimeout(400);
    assert.match(await page.locator('.dln-panel').innerText(), lang === 'he' ? /המנוי נוסף לחשבון שלך/ : /Subscription added to your bill/, tag + ' bell');
    await page.screenshot({ path: path.join(out, `${tag}-portal-bell.png`) });
    assert.deepEqual(errors, [], tag + ' portal: no page errors'); await ctx.close();

    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(tag + ': ' + e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await page.waitForTimeout(300);
    if (lang === 'en') assert.match(flat(await ui.locator(`[data-earn="${id}"]`).first().innerText()), /\$8\.00 subscription/, tag + ' our earnings include the subscription');
    await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.gtabs'); await ui.locator('.gtabs button').nth(2).click(); await ui.locator('.subtabs [data-ctab=payments]').click(); await ui.waitForSelector('[data-statement]'); await page.waitForTimeout(400);
    const as = flat(await ui.locator('[data-statement]').innerText());
    if (lang === 'en') assert.match(as, /Direct Line subscription \(1 month × ₪29\) \$8\.00 Total billed \$28\.00 \$18\.00/, tag + ' admin statement: ' + as);
    await ui.locator('[data-statement]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-statement.png`) });
    assert.deepEqual(errors, [], tag + ' admin: no page errors'); await ctx.close();
  }
  console.log('PASS subscription on the bill: statement line, calm banner, bell, admin statement (EN, HE, 1440, 390). Screens: ' + out);
} finally { if (errors.length) console.log('PAGE ERRORS', errors); await browser.close(); server.close(); }
