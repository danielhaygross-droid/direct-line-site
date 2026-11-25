// QA batch 3 (19 Nov 2026 list, items 14, 5, 15):
//  14 admin: choosing Shipped on an order with no tracking asks for the tracking number + courier in one save.
//   5 supplier phone card: cost, shipping status, tracking, courier first; the rest under "More".
//  15 client order window: tracking and money first, the history after the details, the Etsy numbers form folded.
//   node checks/check-qa-batch3.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'qa-batch3');
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

const { admin, client, id } = await seed();
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async (ref, extra = {}) => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Wool felt slippers', variant: 'EU 41', buyerName: 'Jane Buyer', address1: '1 St', city: 'Austin', destination: 'US', etsyUrl: 'https://example.com/' + ref, photos: [photo], ...extra }, client)).order.id;
const ids = []; for (let i = 0; i < 14; i++) ids.push(await mk('4261000' + String(i).padStart(3, '0')));
for (const oid of ids) ok(await call('/orders/' + oid, 'PUT', { status: 'processing' }, admin));
ok(await call('/orders/' + ids[13], 'PUT', { productCost: 20, shippingFee: 0 }, admin));
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const row = oid => DB.prepare('SELECT status, tracking_number, courier FROM client_orders WHERE id = ?').bind(oid).first();
const flat = s => s.replace(/\s+/g, ' ');
const wait = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
try {
  // ---- 14: admin Shipped asks for tracking ----
  let n = 0;
  for (const lang of ['en', 'he']) for (const w of [1440, 390]) {
    const tag = `admin ${lang}-${w}`, ctx = await session(admin, w), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' });
    await ui.waitForSelector('[data-tab=orders]'); await ui.locator('[data-tab=orders] >> visible=true').first().click(); await ui.locator('[data-filter="all"]').click();
    const pick = async oid => { await ui.locator(`[data-status="${oid}"] >> visible=true`).first().selectOption('shipped'); await ui.waitForSelector('dialog.shipw[open]'); };
    // Cancel: nothing changes, the select goes back.
    const a = ids[n++]; await pick(a);
    await page.screenshot({ path: path.join(out, `${lang}-${w}-admin-ship-window.png`) });
    assert.ok(await ui.evaluate(() => { const r = document.querySelector('dialog.shipw .cxw-box').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), tag + ': window fits the screen');
    await ui.locator('dialog.shipw .form-actions [data-sw-close]').click(); await ui.waitForTimeout(300);
    assert.equal((await row(a)).status, 'processing', tag + ': Cancel keeps the status');
    assert.equal(await ui.locator(`[data-status="${a}"] >> visible=true`).first().inputValue(), 'processing', tag + ': the select goes back');
    // Save with no tracking: a message, the window stays.
    const b = ids[n++]; await pick(b);
    await ui.locator('dialog.shipw [type=submit]').click(); await ui.waitForTimeout(200);
    assert.match(flat(await ui.locator('dialog.shipw [data-sw-msg]').innerText()), lang === 'en' ? /Type the tracking number/ : /הקלידו את מספר המעקב/, tag + ': asks for the tracking number');
    // Tracking typed, courier left empty: one save = tracking + courier (from the number) + Shipped.
    await ui.locator('dialog.shipw [name=trackingNumber]').fill('UL7068445' + String(10 + n) + 'YP'); await ui.locator('dialog.shipw [type=submit]').click();
    assert.ok(await wait(async () => (await row(b)).status === 'shipped'), tag + ': marked shipped');
    const rb = await row(b); assert.match(rb.tracking_number, /^UL\d+YP$/, tag + ': tracking saved'); assert.equal(rb.courier, 'Yanwen', tag + ': courier filled in from the tracking number');
    // Ship without tracking: the old way still works.
    const c = ids[n++]; await pick(c); await ui.locator('dialog.shipw [data-sw-skip]').click();
    assert.ok(await wait(async () => (await row(c)).status === 'shipped'), tag + ': shipped without tracking'); assert.equal((await row(c)).tracking_number || '', '', tag + ': no tracking');
    assert.deepEqual(errors, [], tag + ': no page errors'); await ctx.close();
  }
  console.log('PASS admin: Shipped with no tracking asks for it (Cancel, empty save, save = tracking + courier + Shipped, ship without tracking) EN, HE, 1440, 390');

  // ---- 5: supplier phone card ----
  for (const lang of ['en', 'zh']) {
    const ctx = await session(sup, 390), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/supplier/?lang=${lang}#orders`); await page.locator('[data-tab=all] >> visible=true').first().click(); await page.waitForSelector('.sp-ocard[data-row] >> visible=true');
    const card = page.locator('.sp-ocard[data-row] >> visible=true').first(), cid = await card.getAttribute('data-row');
    const m = await card.evaluate(c => { const vis = f => { const e = c.querySelector(`[data-f="${f}"]`); return !!e && e.checkVisibility(); }; return { h: Math.round(c.getBoundingClientRect().height), cost: vis('cost'), ship: vis('ship'), tracking: vis('tracking'), courier: vis('courier'), item: vis('itemCosts'), dom: vis('domestic'), more: !!c.querySelector('details.sp-fold:not([open])') }; });
    assert.ok(m.cost && m.ship && m.tracking && m.courier, lang + ': cost, status, tracking, courier shown first ' + JSON.stringify(m));
    assert.ok(!m.item && !m.dom && m.more, lang + ': the rest folded under More ' + JSON.stringify(m));
    assert.ok(m.h < 440, lang + ': card is shorter (was ~600px): ' + m.h);
    assert.match(await card.locator('details.sp-fold > summary').innerText(), lang === 'en' ? /More/ : /更多/);
    await page.screenshot({ path: path.join(out, `${lang}-390-supplier-card.png`) });
    // Open More, fill a box there: it saves and More stays open after the card is drawn again; a dot shows.
    await card.locator('details.sp-fold > summary').click();
    const dom = page.locator(`.sp-ocard[data-row="${cid}"] [data-f=domestic]`); await dom.fill('SF12345678901' + lang.length); await dom.press('Tab');
    assert.ok(await wait(async () => /SF1234567890/.test((await DB.prepare('SELECT domestic_tracking FROM client_orders WHERE id = ?').bind(cid).first()).domestic_tracking || '')), lang + ': saved from inside More');
    assert.ok(await wait(() => page.evaluate(id => { const d = document.querySelector(`.sp-ocard[data-row="${id}"] details.sp-fold`); return !!d && d.open && !!d.querySelector('.sp-dot'); }, cid), 10000), lang + ': More stays open after saving, with a dot for what is filled in');
    await page.screenshot({ path: path.join(out, `${lang}-390-supplier-card-more.png`) });
    assert.deepEqual(errors, [], lang + ': no page errors'); await ctx.close();
  }
  console.log('PASS supplier phone card: cost, status, tracking, courier first; the rest under More (stays open, dot when filled) EN, 中文');

  // ---- 15: client order window ----
  const oid = ids[13];
  for (const lang of ['en', 'he']) for (const w of [1440, 390]) {
    const tag = `client ${lang}-${w}`, ctx = await session(client, w), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.locator(`[data-open-order="${oid}"] >> visible=true`).first().click(); await page.waitForSelector('.drawer [data-d-info] .sec-title');
    await page.waitForTimeout(400);
    const order = await page.evaluate(() => [...document.querySelectorAll('.drawer [data-d-info] > *')].map(e => (e.querySelector(':scope > .sec-title, :scope > summary .form-sec, :scope > h3, :scope > summary') || e).textContent.trim().replace(/\s+/g, ' ').slice(0, 30)));
    const idx = re => order.findIndex(x => re.test(x));
    const tr = idx(/^(Tracking|מעקב)/), money = idx(/^(Sale|מכירה)/), det = idx(/^(Details|פרטים)/), nums = idx(/(Your numbers|המספרים)/);
    assert.ok(tr > -1 && money > -1 && det > -1 && nums > -1, tag + ': sections found ' + order.join(' | '));
    assert.ok(tr < det && money < det && tr <= 2, tag + ': tracking and money right after the timeline, before the details ' + order.join(' | '));
    assert.equal(nums, order.length - 1, tag + ': the Etsy numbers form is last ' + order.join(' | '));
    assert.equal(await page.locator('.drawer [data-numbers-fold]').evaluate(d => d.open), false, tag + ': the numbers form is folded');
    await page.screenshot({ path: path.join(out, `${lang}-${w}-client-order.png`) });
    if (w === 1440) {
      await page.locator('.drawer [data-open-numbers]').click(); await page.waitForTimeout(400);
      assert.equal(await page.locator('.drawer [data-numbers-fold]').evaluate(d => d.open), true, tag + ': "Add your numbers" opens the form');
    }
    assert.deepEqual(errors, [], tag + ': no page errors'); await ctx.close();
  }
  console.log('PASS client order window: tracking + money first, details, then history; Etsy numbers folded, "Add your numbers" opens it (EN, HE, 1440, 390)');
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
