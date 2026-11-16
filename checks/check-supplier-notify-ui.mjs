// Check: notifications on the supplier's computer or phone (16 Nov 2026). Erwin dropped the email alerts ("just send a
// notification on their pc or phone when they use the portal"). The Orders page offers to turn them on; the bell menu has
// the switch; while the portal is open it checks every minute and shows a notification for what is new (not when the
// portal is in front: then the message on the page is enough). Email alerts are gone (routes, admin card, menu link).
//   node checks/check-supplier-notify-ui.mjs
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'supplier-notify-ui');
await mkdir(out, { recursive: true });
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
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'" });
    res.end(data);
  } catch (e) { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const { admin, client } = await seed();
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const mk = async ref => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: 'Brass lamp', variant: 'Gold', buyerName: 'Jane Buyer', buyerPhone: '+1 555 0100', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order;
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
await mk('NT-1');

// Email alerts are gone.
assert.equal((await call('/admin/supplier-alerts', 'GET', null, admin)).status, 404, 'admin email status route removed');
assert.notEqual((await call('/supplier/email-alerts', 'GET', null, sup)).status, 200, 'supplier email route removed');
const vercel = JSON.parse(await readFile(path.join(here, '../vercel.json'), 'utf8'));
assert.ok(!vercel.crons.some(c => /alerts/.test(c.path)), 'no email cron');

// Records every notification instead of showing it; the page counts as "not in front" when __away is set.
const spy = () => {
  window.__notes = [];
  const rec = (title, o) => window.__notes.push({ title, body: o?.body || '', hash: o?.data?.hash || '' });
  if (window.ServiceWorkerRegistration) ServiceWorkerRegistration.prototype.showNotification = function (title, o) { rec(title, o); return Promise.resolve(); };
  const N = window.Notification; window.Notification = function (title, o) { rec(title, o); return { close() {} }; };
  Object.defineProperty(window.Notification, 'permission', { get: () => N.permission }); window.Notification.requestPermission = (...a) => N.requestPermission(...a);
  const hf = Document.prototype.hasFocus; Document.prototype.hasFocus = function () { return window.__away ? false : hf.call(this); };
};
const session = async (width, lang) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await ctx.grantPermissions(['notifications'], { origin: base });
  await ctx.addCookies([{ name: sup.split('=')[0], value: decodeURIComponent(sup.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(spy);
  const page = await ctx.newPage(); return { ctx, page };
};
const errors = [];
try {
  // 1. The offer on Orders (EN 1440 and 中文 390), then Turn on.
  for (const [lang, w] of [['zh', 390], ['en', 1440]]) {
    const { ctx, page } = await session(w, lang); page.on('pageerror', e => errors.push(lang + w + ': ' + e.message));
    await page.clock.install();
    await page.goto(`${base}/supplier/?lang=${lang}#orders`); await page.waitForSelector('.sp-notify');
    await page.screenshot({ path: path.join(out, `${lang}-${w}-offer.png`) });
    if (lang === 'en') {
      assert.match(await page.locator('.sp-notify').innerText(), /notification on this computer or phone/);
      await page.click('[data-notify-on]');
      await page.waitForFunction(() => window.__notes.length === 1 && !document.querySelector('.sp-notify'));
      assert.match(await page.locator('.sp-toast').innerText(), /Notifications are on for this device/);
      // 2. A new order while the portal is not in front: one notification, it opens Orders.
      await page.evaluate(() => { window.__away = true; });
      await mk('NT-2');
      await page.clock.runFor(61_000);
      await page.waitForFunction(() => window.__notes.length === 2);
      const n = await page.evaluate(() => window.__notes[1]);
      assert.equal(n.title, 'Direct Line'); assert.match(n.body, /^1 new order$/); assert.equal(n.hash, 'orders');
      for (const leak of ['Jane Buyer', '555 0100', '0.37']) assert.ok(!n.body.includes(leak), 'notification holds ' + leak);
      // In front: only the message on the page, no notification.
      await page.evaluate(() => { window.__away = false; }); await mk('NT-3'); await page.clock.runFor(61_000);
      await page.waitForFunction(() => /new order/.test(document.querySelector('.sp-toast')?.textContent || ''));
      assert.equal(await page.evaluate(() => window.__notes.length), 2, 'portal in front: no notification');
      // The bell switch is on; the offer doesn't come back.
      await page.reload(); await page.waitForSelector('.sp-bell');
      assert.equal(await page.locator('.sp-notify').count(), 0, 'no offer once on');
      await page.locator('.sp-bell summary').click(); assert.ok(await page.locator('[data-notify]').isChecked(), 'bell switch on');
      await page.screenshot({ path: path.join(out, `${lang}-${w}-bell.png`) });
      await page.locator('[data-notify]').uncheck(); assert.equal(await page.evaluate(() => localStorage.getItem('dl_supplier_notify')), '0');
      // No Email alerts in the menu.
      await page.locator('.sp-me summary').click(); assert.equal(await page.locator('.sp-menu a[href="#alerts"]').count(), 0, 'menu link removed');
    } else {
      // Not now: gone, and stays gone after a reload.
      await page.click('[data-notify-later]'); await page.waitForSelector('.sp-notify', { state: 'detached' });
      await page.reload(); await page.waitForSelector('.sp-bell'); assert.equal(await page.locator('.sp-notify').count(), 0, 'not now remembered');
      await page.locator('.sp-bell summary').click(); await page.screenshot({ path: path.join(out, `${lang}-${w}-bell.png`) });
    }
    await ctx.close();
  }
  // 3. The worker file the phone needs is served.
  const sw = await fetch(base + '/supplier/sw.js'); assert.equal(sw.status, 200); assert.match(await sw.text(), /notificationclick/);
  assert.equal(JSON.parse(await (await fetch(base + '/supplier/manifest.json')).text()).start_url, '/supplier/');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS supplier notifications: offer (EN, 中文, 1440, 390), turn on, one notification for a new order when the portal is not in front, none when it is, bell switch, not now remembered; email alerts removed. Screens: ' + out);
} finally { if (errors.length) console.log('PAGE ERRORS', errors); await browser.close(); server.close(); }
