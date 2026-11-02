// Check: order lines in the client's order form — each product / colour has its own link, how many and colour (Pauline).
//   node checks/check-order-lines.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'order-lines');
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
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url), fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const LINK = 'https://www.etsy.com/listing/4588909425/wooden-wall-hook-rack-walnut-or-beech', LINK2 = 'https://www.etsy.com/listing/1111111111/oak-shelf';
const prod = (page, n) => page.locator('#order-form [data-prod]').nth(n), vrow = (page, n, m) => prod(page, n).locator('[data-var]').nth(m);
const fillVar = async (page, n, m, qty, text) => { await vrow(page, n, m).locator('[data-qty]').fill(String(qty)); await vrow(page, n, m).locator('[data-variant]').fill(text); };
// Pauline's order: one product in two variations; then a second product, also in two variations.
const fillOrder = async (page, ref, second = true) => {
  const f = page.locator('#order-form');
  await f.locator('[name=orderRef]').fill(ref);
  await prod(page, 0).locator('[data-link]').fill(LINK); await fillVar(page, 0, 0, 3, 'Black Walnut, 7 Hooks');
  await prod(page, 0).locator('[data-var-add]').click();
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-variant]')), true, 'the cursor is in the new variation');
  await fillVar(page, 0, 1, 2, 'Black Walnut, 6 Hooks');
  if (second) {
    await f.locator('[data-prod-add]').click();
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-link]')), true, 'a new product starts with its link');
    await prod(page, 1).locator('[data-link]').fill(LINK2); await fillVar(page, 1, 0, 1, 'Oak');
    await prod(page, 1).locator('[data-var-add]').click(); await fillVar(page, 1, 1, 2, 'Walnut');
  }
  await f.locator('[name=buyerName]').fill('Sample Buyer'); await f.locator('[name=address1]').fill('1 Sample Street, Springfield IL 62701, +1 555 0100');
  await f.locator('[name=destination]').selectOption('US');
};
// Photo per variation (Erwin, 1 Nov 2026): with several lines, every line needs its own photo.
const addLinePhotos = async page => { const n = await page.locator('#order-form [data-var]').count(); for (let i = 0; i < n; i++) { const row = page.locator('#order-form [data-var]').nth(i); if (await row.locator('.var-photo img').count()) continue; await row.locator('[data-line-input]').setInputFiles(fixturePath); await row.locator('.var-photo img').waitFor(); } };
const TEXT1 = '3 × Black Walnut, 7 Hooks\n2 × Black Walnut, 6 Hooks', TEXT2 = 'Product 1:\n' + TEXT1 + '\nProduct 2:\n1 × Oak\n2 × Walnut';

try {
  // ---- 1. The flow once (English, desktop) ----
  {
    const ctx = await session(client, 1440), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=en#/new`); await page.reload(); await page.waitForSelector('#order-form [data-prod]');
    assert.equal(await page.locator('[data-prod]').count(), 1); assert.equal(await page.locator('[data-var]').count(), 1);
    assert.equal(await page.locator('[data-var-remove]:visible, [data-prod-remove]:visible').count(), 0, 'one row: nothing to remove');
    assert.ok(await page.locator('[data-f="photos"] [data-pick-input]').count(), 'one variation: the photo box at the bottom');
    await fillOrder(page, 'PAULINE-1');
    assert.match(await page.locator('[data-sum]').innerText(), /2 products · 8 items/, 'the total is the sum of every variation');
    // A variation without "how many" is refused, and marked.
    await vrow(page, 1, 0).locator('[data-qty]').fill('');
    await page.locator('[data-submit]').click(); await page.waitForTimeout(300);
    assert.match(await page.locator('#order-form').innerText(), /how many \(each variation\)/); assert.equal(await page.locator('[data-var] .item-qty.bad').count(), 1);
    await vrow(page, 1, 0).locator('[data-qty]').fill('1');
    // Several variations (Erwin, 2 Nov 2026): no photo box at the bottom, photos only next to each variation.
    assert.equal(await page.locator('[data-f="photos"]').isVisible(), false, 'no general photo box'); assert.equal(await page.locator('[data-pick-input]').count(), 0);
    assert.ok(await page.locator('[data-pick-lines]').count(), 'the hint says where photos go');
    assert.equal(await page.locator('[data-var] .var-photo:visible').count(), 4, 'a photo box per line');
    await page.locator('[data-submit]').click(); await page.waitForTimeout(300);
    assert.match(await page.locator('#order-form').innerText(), /a photo of each variation/); assert.equal(await page.locator('[data-var].photo-bad').count(), 4);
    await addLinePhotos(page); assert.equal(await page.locator('[data-var].photo-bad').count(), 0, 'marks go once each line has its photo');
    await page.locator('[data-submit]').click(); await page.waitForFunction(() => location.hash.startsWith('#/orders'), null, { timeout: 30000 });
    const o = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.orderRef === 'PAULINE-1');
    assert.deepEqual(o.photos.map(x => x.itemIndex).sort(), [1, 2, 3, 4], 'each line photo is saved with its line');
    assert.equal(o.quantity, 8); assert.equal(o.variant, TEXT2); assert.equal(o.etsyUrl, LINK + '\n' + LINK2);
    assert.deepEqual(o.items.map(i => [i.link === LINK ? 1 : 2, i.quantity, i.variant]), [[1, 3, 'Black Walnut, 7 Hooks'], [1, 2, 'Black Walnut, 6 Hooks'], [2, 1, 'Oak'], [2, 2, 'Walnut']]);
    // Editing shows the boxes again; removing the second product leaves Pauline's order.
    await page.goto(`${base}/portal/?lang=en#/edit/${o.id}`); await page.reload(); await page.waitForSelector('#order-form [data-prod]');
    assert.equal(await page.locator('[data-prod]').count(), 2); assert.deepEqual(await page.locator('[data-var] [data-qty]').evaluateAll(i => i.map(x => x.value)), ['3', '2', '1', '2']);
    assert.equal(await page.locator('[data-var] .var-photo img').count(), 4, 'editing: each line shows its saved photo');
    // Remove line 1 and the second product: line 2's photo becomes line 1's.
    const keep = o.photos.find(x => x.itemIndex === 2).id;
    await vrow(page, 0, 0).locator('[data-var-remove]').click(); await prod(page, 1).locator('[data-prod-remove]').click();
    await vrow(page, 0, 0).locator('[data-qty]').fill('2'); await prod(page, 0).locator('[data-var-add]').click(); await fillVar(page, 0, 1, 3, 'Beech, 5 Hooks');
    await page.locator('[data-submit]').click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-var].photo-bad').count(), 1, 'the new line needs its photo'); await addLinePhotos(page);
    await page.locator('[data-submit]').click();
    await page.waitForFunction(() => location.hash.startsWith('#/orders'), null, { timeout: 30000 });
    const o2 = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === o.id);
    assert.equal(o2.quantity, 5); assert.equal(o2.items.length, 2);
    assert.equal(o2.photos.find(x => x.id === keep)?.itemIndex, 1, 'the kept photo follows its line'); assert.deepEqual(o2.photos.map(x => x.itemIndex).sort(), [1, 2], 'photos of removed lines are gone');
    assert.deepEqual(errors, []); await ctx.close();
  }
  // The order everyone looks at in the screenshots: two products, each in two variations.
  const png = await readFile(fixture), photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
  const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
  const shown = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: 'PAULINE-2', buyerName: 'Sample Buyer', address1: '1 Sample Street', destination: 'US', photos: [photo],
    items: [{ link: LINK, quantity: 3, variant: 'Black Walnut, 7 Hooks' }, { link: LINK, quantity: 2, variant: 'Black Walnut, 6 Hooks' }, { link: LINK2, quantity: 1, variant: 'Oak' }, { link: LINK2, quantity: 2, variant: 'Walnut' }] }, client)).order;
  assert.equal(shown.quantity, 8); assert.equal(shown.variant, TEXT2);
  assert.equal((await call('/orders', 'POST', { storeId: store.id, orderRef: 'BAD', buyerName: 'X', address1: '1 St', destination: 'US', photos: [photo], items: [{ link: LINK, quantity: 1 }, { link: '', quantity: 1 }] }, client)).status, 400, 'each line needs a link');
  ok(await call('/orders/' + shown.id, 'PUT', { productCost: 40, shippingFee: 0 }, admin));
  assert.equal(ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === shown.id).items.length, 4, 'a cost change keeps the lines');
  // Photo per line on the order everyone looks at (lines 1, 2 and 4; line 3 still missing).
  const jpegs = await (async () => { const jpeg = (await import('jpeg-js')).default; return [[200, 80, 60], [60, 120, 200], [90, 160, 90]].map(([r, g, b]) => { const d = new Uint8Array(120 * 90 * 4); for (let i = 0; i < 120 * 90; i++) d.set([r, g, b, 255], i * 4); return 'data:image/jpeg;base64,' + Buffer.from(jpeg.encode({ data: d, width: 120, height: 90 }, 80).data).toString('base64'); }); })();
  for (const [k, item] of [[0, 1], [1, 2], [2, 4]]) ok(await call('/orders/' + shown.id + '/photos', 'POST', { data: jpegs[k], item }, admin));
  // The supplier sheet: one numbered picture of the line photos in the preview cell, numbered variation lines, labelled links.
  const { websiteCells } = await import('../server/supplier-sheet.mjs');
  const sheetRow = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(shown.id).first(), sheetPhotos = (await DB.prepare('SELECT id, item_index FROM order_photos WHERE order_id=? ORDER BY id').bind(shown.id).all()).results;
  const cells = websiteCells(env, sheetRow, sheetPhotos, 'Shop');
  assert.match(cells.am[4], /^=IMAGE\("https:\/\/[^"]+\/api\/portal\/sheet-photos\/\d+\/lines\?p=1-\d+\.2-\d+\.3-0\.4-\d+&key=/, 'preview: all lines, line 3 without a photo');
  assert.match(cells.am[5], /All 4 photos/); assert.match(cells.am[8], /#1 3 × Black Walnut, 7 Hooks[\s\S]*#3 1 × Oak/);
  const collage = cells.am[4].match(/"(https:[^"]+)"/)[1].replace(/^https:\/\/[^/]+/, base);
  const got = await fetch(collage), img = Buffer.from(await got.arrayBuffer());
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/jpeg'); assert.ok((await import('jpeg-js')).default.decode(img).width > 300, 'a real picture');
  assert.equal((await fetch(collage.replace(/key=[^&]+/, 'key=wrong'))).status, 404, 'a changed key is refused');
  assert.equal((await fetch(collage.replace(/sheet-photos\/\d+/, 'sheet-photos/999'))).status, 404, 'another order with the same key is refused');
  console.log('PASS sheet: numbered picture of the line photos, numbered lines, signed link');
  // Cost per product from the supplier (AI, 30 Oct 2026): each product line shows its price.
  await DB.prepare('UPDATE client_orders SET item_costs=? WHERE id=?').bind('25\u300114.50', shown.id).run();

  // In Progress (Erwin, 1 Nov 2026): the order is locked, but the client may still add a MISSING variation photo.
  await DB.prepare("UPDATE client_orders SET status='processing', edit_locked=TRUE WHERE id=?").bind(shown.id).run();
  const refused = async (body, what) => { const r = await call('/orders/' + shown.id + '/photos', 'POST', body, client); assert.equal(r.status, 409, what); };
  await refused({ data: jpegs[0] }, 'no whole-order photos once locked');
  await refused({ data: jpegs[0], item: 1 }, 'a line that has its photo stays as it is');
  await refused({ data: jpegs[0], item: 5 }, 'no line 5 on a 4-line order');
  const single = (await DB.prepare("SELECT id FROM client_orders WHERE client_id=? AND id<>? AND (items IS NULL OR items NOT LIKE '%},{%') LIMIT 1").bind(shown.client_id ?? (await DB.prepare('SELECT client_id FROM client_orders WHERE id=?').bind(shown.id).first()).client_id, shown.id).first());
  if (single) { await DB.prepare("UPDATE client_orders SET status='processing', edit_locked=TRUE WHERE id=?").bind(single.id).run(); assert.equal((await call('/orders/' + single.id + '/photos', 'POST', { data: jpegs[0], item: 1 }, client)).status, 409, 'one-line orders stay locked'); }
  console.log('PASS in progress: only missing variation photos can be added');

  // ---- 2. Screenshots: English + Hebrew, desktop + phone ----
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/new`); await page.reload(); await page.waitForSelector('#order-form [data-prod]');
    await fillOrder(page, 'SAMPLE-' + tag);
    await page.locator('[data-prods]').scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, `${tag}-form.png`), fullPage: width === 390 });
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector(`[data-open-order="${shown.id}"]`); await page.locator(`[data-open-order="${shown.id}"]`).first().click();
    await page.waitForSelector('.drawer.open'); await page.waitForTimeout(400);
    const dd = page.locator('.drawer.open dd', { hasText: 'Walnut' }); assert.ok(await dd.count() >= 1, tag); await dd.first().scrollIntoViewIfNeeded();
    const prices = await page.locator('.drawer.open .pm-price').allInnerTexts(); assert.equal(prices.length, 2, tag + ' a price per product');
    assert.equal(await page.locator('.drawer.open .pm-line').count(), 4, tag + ' a photo row per line'); assert.equal(await page.locator('.drawer.open .pm-line.missing').count(), 1, tag + ' line 3 has no photo yet');
    await page.locator('.drawer.open [data-pm-lines]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-line-photos.png`) });
    await page.locator('.drawer.open .pm-linkrow').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-order-prices.png`) });
    await page.screenshot({ path: path.join(out, `${tag}-order.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close();
    // The admin's Orders tab opens on Pending: show the order there, In Progress again for the client.
    await DB.prepare("UPDATE client_orders SET status='pending' WHERE id=?").bind(shown.id).run();
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.locator(`[data-open-order="${shown.id}"]`).first().click(); await ui.waitForSelector('.drawer.open'); await page.waitForTimeout(400);
    const add = ui.locator('.drawer.open dd', { hasText: 'Product 2:' }); assert.equal(await add.count(), 1, tag); await add.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${tag}-admin-order.png`) });
    // The admin adds the missing photo of line 3 (e.g. sent on WhatsApp) from its own row.
    await ui.locator('.drawer.open [data-pm-lines]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${tag}-admin-line-photos.png`) });
    if (tag === 'he-390') {
      await ui.locator('.drawer.open input[data-photo-item="3"]').setInputFiles(fixturePath);
      await page.waitForFunction(id => true, shown.id); await page.waitForTimeout(1500);
      const ph = ok(await call('/admin/orders', 'GET', null, admin)).orders.find(x => x.id === shown.id).photos;
      assert.ok(ph.some(x => x.itemIndex === 3), 'the admin added the photo of line 3');
    }
    if (tag === 'en-390') {
      // The client adds line 3's photo from the order panel of the In Progress order; then it's the admin's turn (he-390).
      await DB.prepare("UPDATE client_orders SET status='processing' WHERE id=?").bind(shown.id).run();
      const cctx = await session(client, width), cp = await cctx.newPage(); cp.on('pageerror', e => errors.push(e.message));
      await cp.goto(`${base}/portal/?lang=${lang}#/orders`); await cp.reload(); await cp.waitForSelector(`[data-open-order="${shown.id}"]`); await cp.locator(`[data-open-order="${shown.id}"]:visible`).first().click(); await cp.waitForSelector('.drawer.open [data-pm-lines]');
      assert.match(await cp.locator('.drawer.open [data-pm-lines]').innerText(), /Add a photo of each variation/);
      await cp.locator('.drawer.open input[data-photo-item="3"]').setInputFiles(fixturePath); await cp.waitForSelector('.drawer.open .pm-line:nth-of-type(4):not(.missing)', { timeout: 15000 }).catch(() => {});
      await cp.waitForTimeout(800);
      const mine = ok(await call('/orders', 'GET', null, client)).orders.find(x => x.id === shown.id).photos.find(x => x.itemIndex === 3);
      assert.ok(mine, 'the client added the photo of line 3 on an In Progress order');
      assert.equal(await cp.locator('.drawer.open .pm-line.missing').count(), 0); assert.equal(await cp.locator('.drawer.open .pm-lines-hint').count(), 0, 'the hint goes once all lines have photos');
      await cp.locator('.drawer.open [data-pm-lines]').scrollIntoViewIfNeeded(); await cp.screenshot({ path: path.join(out, `${tag}-client-added.png`) });
      await cctx.close(); await DB.prepare('DELETE FROM order_photos WHERE id=?').bind(mine.id).run();
    }
    await DB.prepare("UPDATE client_orders SET status='processing' WHERE id=?").bind(shown.id).run();
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
