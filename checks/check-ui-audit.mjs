// UI audit (Erwin, 23 Oct 2026: "do a deep test to find more design issues"). Opens every main admin and portal screen
// in English and Hebrew at 1440 and 390 px and measures layout problems instead of relying on eyes: the page scrolling
// sideways, things sticking out of the screen, oversized or cut-off buttons, overlapping controls, tiny tap targets on
// phones, short inputs and English left untranslated in Hebrew. Screenshots of every screen.
//   node checks/check-ui-audit.mjs      (run from the repo root; AUDIT_REPORT=1 lists problems without failing)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'ui-audit');
await mkdir(out, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/test-admin.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=${url.searchParams.get('theme') === 'dark' ? 'dark' : 'light'}><body style=margin:0><iframe name=admin src="/admin/?lang=${url.searchParams.get('lang') || 'en'}" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
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
const session = async (cookie, width, theme) => {
  const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
  if (cookie) await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]);
  if (theme) await ctx.addInitScript(t => { try { localStorage.setItem('dl_portal_theme', t); } catch (e) { /* ignore */ } }, theme);
  return ctx;
};

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
await call('/orders/' + A + '/messages', 'POST', { body: 'Hi, any update on this one?' }, client);
await call('/orders/' + A + '/messages', 'POST', { body: 'Yes, it leaves the warehouse tomorrow.' }, admin);  // a notification for the bell
ok(await call('/orders/' + B, 'PUT', { status: 'processing' }, admin));
// Very long customer name, address and product link (they must wrap, not push the page sideways).
const longId = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: 'SHOP-205-LONG-REFERENCE-NUMBER', orderDate: '2026-10-14', buyerName: 'Maximiliana Bartholomew-Featherstonehaugh Worthington-Smythe the Third', address1: 'Apartment 4417, Building C, The Very Long Residential Complex Name, 1234 Extraordinarily Long Boulevard Northwest, Springfield Heights, Massachusetts 01103-2345, +1 555 123 4567', destination: 'US', etsyUrl: 'https://www.etsy.com/listing/1234567890/handmade-personalized-engraved-brass-key-hooks-wall-mounted-set-of-five-with-gift-box?ref=shop_home_active_1&variation0=1234567890', photos: [photo, photo] }, client)).order.id;
ok(await call('/orders/' + longId, 'PUT', { productCost: 1234.56, shippingFee: 12.5 }, admin));
// Delivered orders: one with an open claim (admin Claims), one the client can still report (claim form).
const now = Math.floor(Date.now() / 1000);
const delivered = async ref => { const oid = await mk(ref, '2026-10-01', 18); ok(await call('/orders/' + oid, 'PUT', { status: 'delivered' }, admin)); await DB.prepare('UPDATE client_orders SET delivered_at=? WHERE id=?').bind(now - 2 * 86400, oid).run(); return oid; };
const claimed = await delivered('SHOP-206'), claimable = await delivered('SHOP-207');
ok(await call('/orders/' + claimed + '/claims', 'POST', { problem: 'damaged', description: 'The box arrived crushed and two of the five hooks are bent. The customer sent photos and asked for a refund.', resolution: 'refund', proof: photo, label: photo }, client));
// Products: one waiting for a price, one priced (with a long link).
ok(await call('/products', 'POST', { name: 'Brass key hooks, wall mounted, set of five with a gift box', link: 'https://detail.1688.com/offer/712345678901234567890.html?spm=a26352.13672862.offerlist.12.4b2b1e62abcdefghijklmnop', variant: 'Black', photos: [photo] }, client));
const priced = ok(await call('/products', 'POST', { name: 'Leather keychain', link: 'https://detail.1688.com/offer/2', variant: 'Brown', photos: [photo] }, client)).product;
ok(await call('/admin/products/' + priced.id, 'POST', { status: 'approved', unitPrice: 4.2 }, admin));
// Many payments, most with a receipt.
for (let i = 0; i < 8; i++) {
  const p = ok(await call('/admin/payments', 'POST', { clientId: id, amount: 25 + i * 7.5, paidAt: `2026-10-${String(10 + i).padStart(2, '0')}`, method: i % 2 ? 'PayPal' : 'Bank transfer', ...(i === 0 ? { orderIds: [A] } : {}) }, admin));
  if (i < 6) ok(await call('/admin/invoices', 'POST', { clientId: id, paymentId: p.id, date: `2026-10-${String(10 + i).padStart(2, '0')}`, file: { data: photo.data, filename: `receipt-october-${i + 1}-direct-line.png` } }, admin));
}

// Measured in the page: returns [kind, detail] for each problem.
// only: limit the audit to one part of the page (e.g. the login card over the dashboard).
function audit(only) {
  const out = [], vw = innerWidth;
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return !e.closest('details:not([open]) > :not(summary)') && r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const name = e => String(e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.className || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
  const layer = e => e.closest('.drawer,[role=dialog],.modal,.dln-panel') || document.body;
  // A sticky / fixed bar (panel footer, phone tab bar) floats over content that scrolls under it: not an overlap.
  const pinned = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'sticky' || p === 'fixed') return x; } return null; };
  const top = [...document.querySelectorAll('.drawer,[role=dialog],.modal')].filter(vis).pop();
  const scope = e => (!top || top.contains(e)) && (!only || !!e.closest(only));
  // The part of an element left visible by the boxes that clip it (a scrolling panel body, an ellipsis cell).
  const clip = e => { const r = e.getBoundingClientRect(); let l = r.left, t = r.top, rt = r.right, b = r.bottom; for (let x = e.parentElement; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue; const p = x.getBoundingClientRect(); l = Math.max(l, p.left); t = Math.max(t, p.top); rt = Math.min(rt, p.right); b = Math.min(b, p.bottom); } return { left: l, top: t, right: rt, bottom: b }; };
  if (document.documentElement.scrollWidth > vw + 1) out.push(['page-scrolls-sideways', document.documentElement.scrollWidth + 'px > ' + vw + 'px']);
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || !scope(e) || e.closest('svg,.table-wrap,[data-scroll-x]')) continue;
    const r = clip(e), p = e.parentElement?.getBoundingClientRect();
    if ((r.right > vw + 2 || r.left < -2) && getComputedStyle(e).position !== 'fixed' && p && p.right <= vw + 2 && p.left >= -2) out.push(['sticks-out-of-screen', e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + name(e)]);
  }
  for (const b of document.querySelectorAll('button, .btn')) {
    if (!vis(b) || !scope(b) || b.closest('.status-btns,.chips,.seg,.gtabs,.subtabs,nav,.tabs')) continue;
    const r = b.getBoundingClientRect(), txt = (b.innerText || '').trim();
    if (!txt) continue;
    if (vw >= 1000 && r.width > 380 && txt.length < 40 && !b.closest('.ord-row,.ord-list,.todo,.feed,.po-row,.pay-strip,.login-card')) out.push(['oversized-button', Math.round(r.width) + 'px wide: ' + name(b)]);
    if (r.height > 60 && txt.length < 40 && !b.closest('.stat,.ord-row,.todo,.feed,.pay-strip,.kpis,.prod-row,.dl-card')) out.push(['too-tall-button', Math.round(r.height) + 'px tall: ' + name(b)]);
    if (b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible') out.push(['button-text-cut-off', name(b)]);
    if (vw < 500 && r.height < 28 && !b.closest('.pay-row,.po-head')) out.push(['small-tap-target', Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + name(b)]);
  }
  // Scrolled out of its box (e.g. under a panel footer) = not on screen.
  const shown = e => { const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; for (let x = e.parentElement; x && x !== document.documentElement; x = x.parentElement) { if (getComputedStyle(x).overflowY === 'visible') continue; const p = x.getBoundingClientRect(); if (cy < p.top || cy > p.bottom || cx < p.left || cx > p.right) return false; } return cy >= 0 && cy <= innerHeight; };
  const ctl = [...document.querySelectorAll('button, .btn, input:not([type=hidden]), select, textarea')].filter(e => vis(e) && scope(e) && shown(e)).map(e => [e, clip(e)]);
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    const [a, ra] = ctl[i], [b, rb] = ctl[j];
    if (a.contains(b) || b.contains(a) || layer(a) !== layer(b) || pinned(a) !== pinned(b) || (a.closest('label') && a.closest('label') === b.closest('label'))) continue;
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 4 && oy > 4) out.push(['controls-overlap', name(a) + ' / ' + name(b)]);
  }
  // Buttons side by side in one row should line up: same height and same top (Erwin: "misaligned CTAs").
  const rowBtns = new Map();
  for (const b of document.querySelectorAll('.btn')) { if (vis(b) && scope(b) && !b.closest('.chips,.status-btns,.seg,.gtabs,.subtabs')) { const k = b.parentElement; (rowBtns.get(k) || rowBtns.set(k, []).get(k)).push(b); } }
  for (const list of rowBtns.values()) for (let i = 1; i < list.length; i++) {
    const ra = list[i - 1].getBoundingClientRect(), rb = list[i].getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 30) continue; // wrapped onto another line
    if (Math.abs(ra.height - rb.height) > 6 || Math.abs((ra.top + ra.height / 2) - (rb.top + rb.height / 2)) > 4) out.push(['buttons-not-lined-up', name(list[i - 1]) + ' (' + Math.round(ra.height) + 'px) / ' + name(list[i]) + ' (' + Math.round(rb.height) + 'px)']);
  }
  for (const i of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select')) {
    if (!vis(i) || !scope(i)) continue; const h = i.getBoundingClientRect().height;
    if (h < 32 && !i.closest('.po-row,.ord-row')) out.push(['input-too-short', Math.round(h) + 'px: ' + name(i)]);
  }
  if (document.documentElement.dir === 'rtl') {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim(), p = n.parentElement;
      if (!/[A-Za-z]{3,}/.test(t) || /[֐-׿]/.test(t) || !p || !vis(p) || !scope(p)) continue;
      if (p.closest('[data-no-i18n],script,style,code,.brand,[dir=ltr],.ltr,bdi,a[href^=http],time,input,textarea')) continue;
      if (/^(Etsy|Shopify|Amazon|eBay|TikTok Shop|Website|Other|USD|EUR|ILS|Excel|PDF|JPG|PNG|WebP|MB|Direct Line|SKU|IOSS|Local Client|localclient|Sample.*|SHOP-[\w-]+|Maximiliana.*|PayPal|Direct Line: .*|receipt-.*\.png|https?:\/\/.*|etsy\.com.*|Track|WhatsApp|Yanwen|China Post|example\.com.*|@\w+|SWIFT\/BIC|Local)$/i.test(t) || /\d/.test(t) && /\n/.test(t)) continue;
      out.push(['english-in-hebrew', t.slice(0, 60)]);
    }
  }
  if (document.documentElement.dir === 'rtl') for (const e of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
    if (!vis(e) || !scope(e) || e.closest('[data-no-i18n]')) continue;
    for (const at of ['placeholder', 'title', 'aria-label']) { const t = (e.getAttribute(at) || '').trim(); if (/[A-Za-z]{3,}/.test(t) && !/[֐-׿]/.test(t) && !/^(https?:|e\.g\. LX|\d|example\.com|Etsy|SKU|IOSS|receipt-.*.png)/i.test(t)) out.push(['english-in-hebrew', at + ': ' + t.slice(0, 50)]); }
  }
  return [...new Map(out.map(x => [x.join('|'), x])).values()];
}

const found = [];
const report = (tag, screen, list) => { for (const [k, d] of list) found.push({ tag, screen, kind: k, detail: d }); };
const shot = (page, tag, screen) => page.screenshot({ path: path.join(out, `${tag}-${screen}.png`) });
const run = async (frame, page, tag, screen) => { report(tag, screen, await frame.evaluate(audit)); await shot(page, tag, screen); };
const openAdmin = async (page, lang) => { await page.goto(`${base}/test-admin.html?lang=${lang}`); await page.frame({ name: 'admin' }).waitForSelector('[data-tab=overview]'); await page.waitForTimeout(450); return page.frame({ name: 'admin' }); };
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // ---- admin ----
    let ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(`${base}/test-admin.html?lang=${lang}`); let ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=overview]');
    const settle = () => page.waitForTimeout(450);
    for (const tab of ['overview', 'orders', 'clients', 'claims', 'products', 'settings']) {
      await ui.locator(`[data-tab=${tab}]`).click(); await settle(); report(tag, 'admin-' + tab, await ui.evaluate(audit)); await shot(page, tag, 'admin-' + tab);
    }
    await ui.locator('[data-tab=orders]').click(); await ui.locator('[data-filter=all]').click(); await settle();
    await ui.locator('[data-open-order]').first().click(); await ui.waitForSelector('.drawer'); await settle();
    report(tag, 'admin-order-panel', await ui.evaluate(audit)); await shot(page, tag, 'admin-order-panel');
    await page.keyboard.press('Escape'); await settle();
    await ui.locator('[data-tab=clients]').click(); await settle(); await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.gtabs'); await settle();
    for (const [screen, n, s] of [['client-orders', 0], ['client-stores', 1, 'stores'], ['client-products', 1, 'products'], ['client-payments', 2, 'payments'], ['client-prices', 2, 'prices'], ['client-account', 3, 'account'], ['client-activity', 3, 'activity']]) {
      await ui.locator('.gtabs button').nth(n).click(); await settle(); if (s) { await ui.locator(`.subtabs [data-ctab=${s}]`).click(); await page.waitForTimeout(700); }
      report(tag, 'admin-' + screen, await ui.evaluate(audit)); await shot(page, tag, 'admin-' + screen);
    }
    // Money > Payments: record a payment (empty = error), attach a receipt (no file = error).
    await ui.locator('.gtabs button').nth(2).click(); await settle(); await ui.locator('.subtabs [data-ctab=payments]').click(); await page.waitForTimeout(700);
    await ui.locator('[data-pay-new]').first().click(); await settle(); await run(ui, page, tag, 'admin-record-payment');
    await ui.locator('[data-pay-form] [type=submit]').click(); await settle(); await run(ui, page, tag, 'admin-record-payment-error');
    await ui.locator('[data-pay-cancel]').click(); await settle();
    await ui.locator('[data-pay-attach]').first().click(); await settle(); await run(ui, page, tag, 'admin-attach-receipt');
    await ui.locator('[data-receipt-form] [type=submit]').click(); await settle(); await run(ui, page, tag, 'admin-attach-receipt-error');
    await ui.locator('[data-receipt-cancel]').click(); await settle();
    await page.keyboard.press('Escape'); await settle();
    await ui.locator('[data-new-order]').first().click(); await settle(); report(tag, 'admin-new-order', await ui.evaluate(audit)); await shot(page, tag, 'admin-new-order');
    await ui.locator('.drawer [data-submit]').click(); await settle(); await run(ui, page, tag, 'admin-new-order-error');
    // Filled in: client, store, customer, address, country, link.
    const f = ui.locator('#order-form');
    await f.locator('[name=clientId]').selectOption({ index: 1 }).catch(() => {}); await settle();
    await f.locator('[name=storeId]').selectOption({ index: 1 }).catch(() => {});
    await f.locator('[name=orderRef]').fill('SHOP-300');
    await f.locator('[name=buyerName]').fill('Maximiliana Bartholomew-Featherstonehaugh Worthington-Smythe');
    await f.locator('[name=address1]').fill('Apartment 4417, Building C, 1234 Extraordinarily Long Boulevard Northwest, Springfield, MA 01103, +1 555 123 4567');
    await f.locator('[name=destination]').selectOption('US').catch(() => {});
    await f.locator('[data-link]').first().fill('https://www.etsy.com/listing/1234567890/handmade-personalized-engraved-brass-key-hooks-wall-mounted').catch(() => {});
    await f.locator('[name=productCost]').fill('12.5').catch(() => {}); await settle();
    await run(ui, page, tag, 'admin-new-order-filled');
    // Add client: the form, then Create with nothing filled in (error message).
    ui = await openAdmin(page, lang); await ui.locator('.adm-actions [data-add-account=client]').click(); await settle(); await run(ui, page, tag, 'admin-add-client');
    await ui.locator('.drawer [type=submit]').click(); await settle(); await run(ui, page, tag, 'admin-add-client-error');
    // Orders ticked: the bulk edit bar.
    ui = await openAdmin(page, lang); await ui.locator('[data-tab=orders]').click(); await ui.locator('[data-filter=all]').click(); await settle();
    await ui.locator('[data-pick]').nth(0).check(); await ui.locator('[data-pick]').nth(1).check(); await settle(); await run(ui, page, tag, 'admin-bulk-bar');
    await ui.locator('[data-bulk="clear"]').click(); await settle();
    // Long names / address / link in the order panel, then its photo viewer.
    await ui.locator(`[data-open-order="${longId}"]`).first().click(); await ui.waitForSelector('.drawer.open'); await page.waitForTimeout(700); await run(ui, page, tag, 'admin-order-long');
    await ui.locator('.drawer.open .pm-photos a').first().click(); await ui.waitForSelector('.pv.open img[src]'); await settle(); await run(ui, page, tag, 'admin-photo-viewer');
    await page.keyboard.press('Escape'); await settle(); await page.keyboard.press('Escape'); await settle();
    // The open claim, opened from the Claims tab.
    await ui.locator('[data-tab=claims]').click(); await settle(); await ui.locator('[data-claim-decision]').first().scrollIntoViewIfNeeded().catch(() => {}); await run(ui, page, tag, 'admin-claim-open');
    if (errors.length) report(tag, 'admin', errors.map(e => ['script-error', e]));
    await ctx.close();
    // ---- client portal ----
    ctx = await session(client, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.reload(); await page.waitForSelector('#view');
    for (const r of ['home', 'orders', 'new', 'messages', 'payments', 'stores', 'products', 'terms']) {
      await page.goto(`${base}/portal/?lang=${lang}#/${r}`); await page.waitForTimeout(700);
      report(tag, 'portal-' + r, await page.evaluate(audit)); await shot(page, tag, 'portal-' + r);
    }
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForTimeout(500);
    await page.locator('[data-open-order]').first().click(); await page.waitForTimeout(700);
    report(tag, 'portal-order-panel', await page.evaluate(audit)); await shot(page, tag, 'portal-order-panel');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // Bell: the notifications panel.
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForTimeout(600);
    await page.locator('[data-bell]:visible').first().click(); await page.waitForSelector('.dln-panel.open, .dln.open, [class*=dln].open'); await page.waitForTimeout(400); await run(page, page, tag, 'portal-bell');
    await page.keyboard.press('Escape');
    // Long names / address / link, then the photo viewer.
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForTimeout(500);
    await page.locator(`[data-open-order="${longId}"]`).first().click(); await page.waitForTimeout(700); await run(page, page, tag, 'portal-order-long');
    await page.locator('.drawer.open .pm-photos a').first().click(); await page.waitForSelector('.pv.open img[src]'); await page.waitForTimeout(400); await run(page, page, tag, 'portal-photo-viewer');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // Claim form on a delivered order, then Send with nothing filled in.
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForTimeout(500);
    await page.locator(`[data-open-order="${claimable}"]`).first().click(); await page.waitForTimeout(700);
    await page.locator('[data-report-claim]').first().click(); await page.waitForSelector('#claim-form'); await page.waitForTimeout(700); await run(page, page, tag, 'portal-claim-form');
    await page.locator('#claim-form [type=submit]').click(); await page.waitForTimeout(500); await run(page, page, tag, 'portal-claim-error');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // The order with a claim: its claim card.
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForTimeout(500);
    await page.locator(`[data-open-order="${claimed}"]`).first().click(); await page.waitForTimeout(700); await run(page, page, tag, 'portal-claim-card');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // New order: Send with nothing filled in (errors shown).
    await page.goto(`${base}/portal/?lang=${lang}#/new`); await page.waitForTimeout(700);
    await page.locator('[data-submit]').click(); await page.waitForTimeout(400); await run(page, page, tag, 'portal-new-error');
    // A product's details.
    await page.goto(`${base}/portal/?lang=${lang}#/products`); await page.waitForTimeout(700);
    await page.locator('.mp-name').first().click(); await page.waitForSelector('.drawer.open'); await page.waitForTimeout(500); await run(page, page, tag, 'portal-product-detail');
    if (errors.length) report(tag, 'portal', errors.map(e => ['script-error', e]));
    await ctx.close();
    // ---- dark mode (a subset) ----
    ctx = await session(admin, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(`${base}/test-admin.html?lang=${lang}&theme=dark`); const dk = page.frame({ name: 'admin' }); await dk.waitForSelector('[data-tab=overview]'); await settle();
    for (const tab of ['overview', 'orders', 'claims']) { await dk.locator(`[data-tab=${tab}]`).click(); await settle(); await run(dk, page, tag, 'dark-admin-' + tab); }
    await dk.locator('[data-tab=orders]').click(); await dk.locator('[data-filter=all]').click(); await settle();
    await dk.locator(`[data-open-order="${longId}"]`).first().click(); await page.waitForTimeout(700); await run(dk, page, tag, 'dark-admin-order-panel');
    await page.keyboard.press('Escape'); await settle();
    await dk.locator('[data-tab=clients]').click(); await settle(); await dk.locator(`[data-open-client="${id}"]`).first().click(); await dk.waitForSelector('.gtabs'); await settle();
    await dk.locator('.gtabs button').nth(2).click(); await settle(); await dk.locator('.subtabs [data-ctab=payments]').click(); await page.waitForTimeout(700); await run(dk, page, tag, 'dark-admin-client-payments');
    if (errors.length) report(tag, 'dark-admin', errors.map(e => ['script-error', e]));
    await ctx.close();
    ctx = await session(client, width, 'dark'); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    for (const r of ['home', 'orders', 'payments', 'products', 'new']) { await page.goto(`${base}/portal/?lang=${lang}#/${r}`); await page.waitForTimeout(700); await run(page, page, tag, 'dark-portal-' + r); }
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForTimeout(500);
    await page.locator(`[data-open-order="${claimed}"]`).first().click(); await page.waitForTimeout(700); await run(page, page, tag, 'dark-portal-order-panel'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.locator('[data-bell]:visible').first().click(); await page.waitForTimeout(500); await run(page, page, tag, 'dark-portal-bell');
    if (errors.length) report(tag, 'dark-portal', errors.map(e => ['script-error', e]));
    await ctx.close();
    // ---- Control page (sidebar shell + the admin inside it) and the login page ----
    const control = lang === 'he' ? '/' : '/en/';
    ctx = await session(null, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(base + control); await page.waitForSelector('#login-screen'); await page.waitForTimeout(500); report(tag, 'control-login', await page.evaluate(audit, '#login-screen')); await shot(page, tag, 'control-login');
    await page.locator('#login-form [type=submit]').click(); await page.waitForTimeout(400); report(tag, 'control-login-error', await page.evaluate(audit, '#login-screen')); await shot(page, tag, 'control-login-error');
    await ctx.close();
    ctx = await session(admin, width); page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(base + control); await page.waitForFunction(() => document.body.classList.contains('authenticated')); await page.waitForTimeout(800); await run(page, page, tag, 'control-home');
    await page.evaluate(() => document.querySelector('.nav-item[data-client-tab="orders"]').click()); await page.waitForTimeout(1500); await run(page, page, tag, 'control-client-orders');
    const inner = page.frames().find(fr => fr.url().includes('/admin/'));
    if (inner) { await inner.waitForSelector('[data-tab=orders]', { state: 'attached' }); await page.waitForTimeout(800); report(tag, 'control-admin-frame', await inner.evaluate(audit)); }
    else report(tag, 'control-client-orders', [['admin-frame-missing', 'no /admin/ iframe']]);
    if (errors.length) report(tag, 'control', errors.map(e => ['script-error', e]));
    await ctx.close();
    console.log('audited', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }

const { writeFile } = await import('node:fs/promises');
await writeFile(path.join(out, 'findings.json'), JSON.stringify(found, null, 1));
const byKind = {};
for (const f of found) { const m = (byKind[f.kind] ||= new Map()); m.set(f.detail, [...(m.get(f.detail) || []), `${f.tag} ${f.screen}`]); }
for (const [k, m] of Object.entries(byKind)) { console.log(`\n== ${k} (${m.size})`); for (const [d, w] of m) console.log(`  ${d}  <- ${[...new Set(w)].slice(0, 4).join(', ')}${w.length > 4 ? ` +${w.length - 4}` : ''}`); }
if (!process.env.AUDIT_REPORT) assert.equal(found.length, 0, `${found.length} UI problems (see above and ${path.join(out, 'findings.json')})`);
console.log('PASS no UI problems found');
