// Check: which orders a payment is for, in the real screens: the client ticks orders on a transfer confirmation and
// adds billing details; the admin records the payment with the ticked orders, edits it, sees paid / not paid tags.
//   node checks/check-payment-orders-ui.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'payment-orders');
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
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url);
const png = await readFile(fixture), photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
const mk = async (ref, date, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
  if (cost != null) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id;
};
const A = await mk('SHOP-101', '2026-10-01', 20), B = await mk('SHOP-102', '2026-10-05', 25), C = await mk('SHOP-103', '2026-10-10', 30), D = await mk('SHOP-104', '2026-10-12', null);
const paidBy = async () => Object.fromEntries(ok(await call('/orders', 'GET', null, client)).orders.map(o => [o.orderRef, o.paymentId]));
const fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const openPayments = async (ui, page) => {
  await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click();
  await ui.locator('.gtabs button').nth(2).click(); await page.waitForTimeout(300); await ui.locator('.subtabs [data-ctab=payments]').click();
  await ui.waitForSelector('.pay-cards'); await page.waitForTimeout(500);
};

try {
  // ---- 1. The full flow once (English, desktop) ----
  {
    let ctx = await session(client, 1440), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=en#/payments`); await page.reload(); await page.waitForSelector('#transfer-form');
    assert.equal(await page.locator('#transfer-form [data-pf-total]').innerText(), '$75.00', 'pay for orders: A + B + C ticked to start (D has no cost yet)');
    // Billing details: refused without contact, then saved.
    const bf = page.locator('#billing-form');
    await bf.locator('[name=name]').fill('Sample Person'); await bf.locator('[name=company]').fill('Sample Shop Ltd'); await bf.locator('[name=address]').fill('1 Sample Street\nTel Aviv');
    await bf.locator('[type=submit]').click(); await page.waitForSelector('[data-billing-msg]:has-text("email or a phone")');
    await bf.locator('[name=email]').fill('billing@example.com'); await bf.locator('[type=submit]').click();
    await page.waitForSelector('.bill-view:has-text("Sample Shop Ltd")');
    // The client unticks the order they are not paying for: total and amount follow the ticks.
    const tf = page.locator('#transfer-form');
    assert.equal(await tf.locator('[name=amount]').inputValue(), '75.00');
    await tf.locator(`[name=poOrder][value="${C}"]`).uncheck();
    assert.deepEqual(await tf.locator('[name=poOrder]:checked').evaluateAll(i => i.map(x => Number(x.value))), [A, B]);
    assert.equal(await tf.locator('[data-po-sum]').innerText(), '2 orders ticked · $45.00');
    assert.equal(await tf.locator('[data-pf-total]').innerText(), '$45.00'); assert.equal(await tf.locator('[data-pf-copy]').getAttribute('data-copy'), '45.00');
    assert.equal(await tf.locator('[name=amount]').inputValue(), '45.00'); assert.equal(await tf.locator('[data-pf-gap]').innerText(), '');
    await tf.locator('[name=amount]').fill('50'); assert.equal(await tf.locator('[data-pf-gap]').innerText(), 'The amount is $5.00 more than the ticked orders.');
    await tf.locator('[name=amount]').fill('45'); await tf.locator('[name=file]').setInputFiles(fixturePath);
    await tf.locator('[type=submit]').click(); await page.waitForSelector('.confirmation-row:has-text("Orders you ticked")');
    assert.deepEqual(errors, []); await ctx.close();

    ctx = await session(admin, 1440); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=en`); let ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await openPayments(ui, page);
    assert.match(await ui.locator('.pay-sum').innerText(), /Not paid yet\s*3\s*\$75\.00/);
    assert.match(await ui.locator('.bill-view').innerText(), /Sample Person[\s\S]*Sample Shop Ltd[\s\S]*Tel Aviv[\s\S]*billing@example\.com/, 'admin sees the billing details');
    assert.equal(await ui.locator('[data-pay-form]').count(), 0, 'the record form opens on demand');
    await ui.locator('[data-record-transfer]').click(); await ui.waitForSelector('.pay-from');
    const pf = ui.locator('[data-pay-form]');
    assert.equal(await pf.locator('[name=amount]').inputValue(), '45.00');
    assert.deepEqual(await pf.locator('[name=poOrder]:checked').evaluateAll(i => i.map(x => Number(x.value))), [A, B], 'the client\u2019s ticks are ready');
    assert.deepEqual(await pf.locator('[name=poOrder]').evaluateAll(i => i.map(x => Number(x.value))), [A, B, C], 'only billed, unpaid orders (no D)');
    await pf.locator('[type=submit]').click(); await ui.waitForSelector('.pay-card .po-linked:has-text("For 2 orders")');
    let pb = await paidBy(); assert.equal(pb['SHOP-101'], pb['SHOP-102']); assert.ok(pb['SHOP-101']); assert.equal(pb['SHOP-103'], null);
    assert.match(await ui.locator('.pay-card .po-linked').first().innerText(), /Matches/);
    assert.equal(await ui.locator('.attn-card').count(), 0, 'nothing left to check');
    assert.match(await ui.locator('.pay-todo').innerText(), /1\s*payment has no receipt yet/);
    // Edit: take one order off; the gap shows; save; tick it back.
    await ui.locator('[data-pay-edit]').first().click(); const pe = ui.locator('[data-payment-edit-form]');
    assert.deepEqual(await pe.locator('[name=poOrder]').evaluateAll(i => i.map(x => [Number(x.value), x.checked])), [[A, true], [B, true], [C, false]]);
    await pe.locator(`[name=poOrder][value="${B}"]`).uncheck(); assert.equal(await pe.locator('[data-po-gap]').innerText(), 'The amount is $25.00 more than the ticked orders.');
    await pe.locator('[type=submit]').click(); await ui.waitForSelector('.pay-card .po-linked:has-text("For 1 order")');
    assert.match(await ui.locator('.pay-card .po-linked').first().innerText(), /\$25\.00 more than its orders/);
    assert.equal((await paidBy())['SHOP-102'], null);
    await ui.locator('[data-pay-edit]').first().click(); await ui.locator(`[data-payment-edit-form] [name=poOrder][value="${B}"]`).check(); await ui.locator('[data-payment-edit-form] [type=submit]').click();
    await ui.waitForSelector('.pay-card .po-linked:has-text("For 2 orders")');
    // Attach the receipt: the bill-to details are shown; it is sent to the client.
    await ui.locator('[data-pay-attach]').first().click(); const rf = ui.locator('[data-receipt-form]');
    assert.match(await rf.locator('.bill-to').innerText(), /Sample Person[\s\S]*Sample Shop Ltd/);
    await rf.locator('[type=submit]').click(); await ui.waitForSelector('[data-receipt-msg]:has-text("receipt file")');
    await rf.locator('[name=invoiceFile]').setInputFiles(fixturePath); await rf.locator('[type=submit]').click();
    await ui.waitForSelector('.pay-card .receipt-file'); assert.equal(await ui.locator('.pay-todo').count(), 0, 'nothing to do any more');
    // A second file by mistake, then removed (archived): the client no longer sees it.
    await ui.locator('[data-pay-attach]').first().click(); await ui.locator('[data-receipt-form] [name=invoiceFile]').setInputFiles(fixturePath);
    await ui.locator('[data-receipt-form] [name=invoiceDate]').fill('2026-10-25'); await ui.locator('[data-receipt-form] [type=submit]').click();
    await ui.waitForFunction(() => document.querySelectorAll('.pay-card .receipt-file').length === 2);
    await ui.locator('[data-receipt-remove]').nth(1).click(); await ui.locator('[data-receipt-remove]').nth(1).click();
    await ui.waitForFunction(() => document.querySelectorAll('.pay-card .receipt-file').length === 1);
    // Orders tab: the "Not paid" filter and tags.
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); await ui.locator('[data-tab=orders]').click(); await page.waitForTimeout(300);
    assert.match(await ui.locator('[data-filter=unpaid]').innerText(), /Not paid\s*1/, 'only SHOP-103 is billed and not paid');
    assert.equal(await ui.locator('.pay-tag.paid').count(), 2);
    assert.deepEqual(errors, []); await ctx.close();

    // The client: notified, and can download the receipt.
    const notes = ok(await call('/notifications', 'GET', null, client)).items.filter(n => n.kind === 'invoice');
    assert.equal(notes.length, 1, 'one receipt notification (the removed one is gone)'); assert.match(notes[0].detail, /^45\.00\|\d{4}-\d{2}-\d{2}$/);
    ctx = await session(client, 1440); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=en#/payments`); await page.reload(); await page.waitForSelector('.cpay-receipt a');
    assert.equal(await page.locator('.cpay-receipt a').count(), 1); assert.match(await page.locator('.cpay-receipt a').innerText(), /Download receipt/);
    assert.equal(await page.evaluate(async href => (await fetch(href)).status, await page.locator('.cpay-receipt a').getAttribute('href')), 200, 'the file downloads');
    await page.locator('[data-bell]').click(); await page.waitForTimeout(300);
    assert.match(await page.locator('body').innerText(), /New receipt[\s\S]*For your \$45\.00 payment of/);
    assert.deepEqual(errors, []); await ctx.close();
  }
  // A second confirmation waits for review, so every screenshot shows a pending one too.
  ok(await call('/transfers', 'POST', { amount: 30, date: '2026-10-21', file: { ...photo, filename: 'second.png' }, orderIds: [C] }, client));

  // ---- 2. Screenshots: English + Hebrew, desktop + phone ----
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/payments`); await page.reload(); await page.waitForSelector('#transfer-form');
    await page.screenshot({ path: path.join(out, `${tag}-portal-payments.png`) });
    await page.locator('#transfer-form [name=amount]').fill('30'); await page.waitForTimeout(150);
    await page.locator('#transfer-form [data-po]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-transfer.png`) });
    await page.locator('[data-billing]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-billing.png`) });
    assert.equal(await page.locator('.po-linked .po-tag').count(), 0, tag + ' clients see which orders, not the gap');
    await page.locator('.cpay-list').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-history.png`) });
    await page.locator('[data-bell]').click(); await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, `${tag}-portal-notification.png`) }); await page.keyboard.press('Escape');
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('.pay-tag'); await page.waitForTimeout(300);
    assert.equal(await page.locator('.pay-tag.paid').count(), 2, tag); assert.equal(await page.locator('.pay-tag.unpaid').count(), 1, tag);
    await page.locator('.pay-tag').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-portal-orders.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close();

    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await openPayments(ui, page);
    await page.screenshot({ path: path.join(out, `${tag}-admin-payments.png`) });
    await ui.locator('.pay-cards').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-cards.png`) });
    await ui.locator('[data-record-transfer]').click(); await ui.waitForSelector('.pay-from'); await page.waitForTimeout(300);
    assert.deepEqual(await ui.locator('[data-pay-form] [name=poOrder]:checked').evaluateAll(i => i.map(x => Number(x.value))), [C], tag);
    await page.screenshot({ path: path.join(out, `${tag}-admin-record.png`) });
    await ui.locator('[data-pay-cancel]').click(); await page.waitForTimeout(200);
    await ui.locator('[data-pay-edit]').first().click(); await page.waitForTimeout(300);
    await ui.locator('[data-payment-edit-form]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-edit.png`) });
    await ui.locator('[data-pay-attach]').first().click(); await page.waitForTimeout(300);
    await ui.locator('[data-receipt-form]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-attach.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
