// Check: windows and menus close with a click outside or Esc, in every portal (17 Nov 2026, Erwin's video: the supplier
// bell menu stayed open after clicking outside). Typing that isn't saved asks "Discard your changes?" first. Also: the
// supplier bell lists what is new (each order / cancel request / quote / price request / receipt sent back), a click opens it.
//   node checks/check-close-outside.mjs
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'close-outside');
await mkdir(out, { recursive: true });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const resp = await route(new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) }), { db: DB, env });
      res.writeHead(resp.status, Object.fromEntries(resp.headers)); res.end(Buffer.from(await resp.arrayBuffer())); return;
    }
    if (url.pathname === '/test-admin.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=light><body style=margin:0><iframe name=admin src="/admin/?lang=${url.searchParams.get('lang') || 'en'}" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
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
const mk = async (ref, title) => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, itemTitle: title, variant: 'Gold', buyerName: 'Jane Buyer', buyerPhone: '+1 555 0100', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order;
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const o1 = await mk('CO-1', 'Brass lamp'), o2 = await mk('CO-2', 'Walnut hooks');
// A store order often has no item title, only a variant: the bell still names the product (17 Nov 2026).
const o3 = await mk('CO-3', 'Tray'); await DB.prepare("UPDATE client_orders SET item_title = '', variant = 'Gold, one size' WHERE id = ?").bind(o3.id).run();
ok(await call('/orders/' + o2.id + '/request-cancellation', 'POST', { reason: 'Changed mind' }, client));
const cookieOf = c => ({ name: c.split('=')[0], value: decodeURIComponent(c.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' });
const session = async (cookie, width) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }); await ctx.addCookies([cookieOf(cookie)]); const page = await ctx.newPage();
  // Every browser question is answered from page.answers (default: no) and recorded in page.asked.
  page.answers = []; page.asked = []; page.on('dialog', d => { page.asked.push(d.message()); (page.answers.shift() ? d.accept() : d.dismiss()).catch(() => {}); });
  return { ctx, page };
};
const errors = [];
const watch = (page, tag) => page.on('pageerror', e => errors.push(tag + ': ' + e.message));
// A pop-up window with a form, opened the way the pages open theirs (showModal), to test the shared rule on each page.
const testDialog = page => page.evaluate(() => {
  const d = document.createElement('dialog'); d.id = 'tdlg'; d.innerHTML = '<form method="dialog"><label>Note <input name="n"></label><button>Save</button></form>';
  d.style.cssText = 'width:300px;height:160px'; document.body.append(d); d.showModal();
});
try {
  // 1. Supplier bell: lists what is new; click outside, Esc, other menu, and a click on a line opens the order.
  for (const [lang, w] of [['en', 1440], ['zh', 390]]) {
    const { ctx, page } = await session(sup, w); watch(page, 'sup-' + lang + w);
    await page.goto(`${base}/supplier/?lang=${lang}#orders`); await page.waitForSelector('.sp-bell');
    await page.waitForFunction(() => document.querySelector('.sp-bell .sp-badge')?.textContent === '4'); // 3 new orders + 1 cancel request
    await page.locator('.sp-bell summary').click(); await page.waitForSelector('.sp-bell[open] .sp-bitem');
    const lines = await page.locator('.sp-bitem').allInnerTexts();
    assert.equal(lines.length, 4, 'three new orders and one cancel request: ' + lines.join(' | '));
    assert.ok(lines.some(l => /CO-1 · Brass lamp · Gold/.test(l)) && lines.some(l => /CO-2 · Walnut hooks/.test(l)) && lines.some(l => /CO-3 · Gold, one size$/.test(l)), 'order numbers and products');
    for (const leak of ['Jane Buyer', '555 0100', '1 Sample St']) assert.ok(!lines.join(' ').includes(leak), 'bell holds ' + leak);
    await page.screenshot({ path: path.join(out, `sup-${lang}-${w}-bell.png`) });
    await page.mouse.click(w / 2, 700); assert.equal(await page.locator('.sp-bell[open]').count(), 0, 'click outside closes the bell');
    await page.locator('.sp-bell summary').click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('.sp-bell[open]').count(), 0, 'Esc closes the bell');
    await page.locator('.sp-me summary').click(); await page.locator('.sp-bell summary').click();
    assert.equal(await page.locator('.sp-me[open]').count(), 0, 'opening the bell closes the profile menu');
    await page.locator('.sp-bitem', { hasText: 'CO-1' }).first().click(); await page.waitForSelector('#sp-drawer');
    assert.match(await page.locator('#sp-drawer').innerText(), /CO-1/, 'a line opens that order');
    await page.keyboard.press('Escape'); await page.waitForSelector('#sp-drawer', { state: 'detached' });
    // Pop-up window on the supplier page: click outside closes; typing asks first.
    await testDialog(page); await page.mouse.click(10, 10); assert.equal(await page.evaluate(() => document.getElementById('tdlg').open), false, 'supplier: click outside closes the window');
    await ctx.close();
  }
  // 2. Admin (inside the dashboard frame, as it runs), the dashboard itself and the client portal: pop-up window, typing
  //    guard (EN + HE), phone menu Esc.
  for (const [who, cookie, url, lang, w] of [['admin', admin, '/test-admin.html?lang=en', 'en', 1440], ['admin', admin, '/test-admin.html?lang=he', 'he', 390], ['dashboard', admin, '/', 'he', 1440], ['client', client, '/portal/', 'en', 390], ['client', client, '/portal/?lang=he', 'he', 1440]]) {
    const { ctx, page } = await session(cookie, w); watch(page, who + lang + w);
    await page.goto(base + url);
    const ui = who === 'admin' ? await (async () => { await page.waitForFunction(() => window.frames.admin); return page.frame({ name: 'admin' }); })() : page;
    await ui.waitForFunction(() => window.DLDismiss && document.body.innerText.length > 50); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    const isOpen = () => ui.evaluate(() => document.getElementById('tdlg').open);
    await testDialog(ui); await page.mouse.click(5, 5);
    assert.equal(await isOpen(), false, `${who}: click outside closes the window`);
    await ui.evaluate(() => document.getElementById('tdlg').showModal());
    await ui.fill('#tdlg input', 'half typed');
    page.asked = []; page.answers = [false];
    await page.mouse.click(5, 5); await page.waitForTimeout(200);
    const asked = page.asked.join(' | '); assert.equal(page.asked.length, 1, 'asked once: ' + asked);
    assert.match(asked, lang === 'he' ? /לבטל את השינויים/ : /Discard your changes/, `${who} ${lang}: asks before losing typing`);
    assert.equal(await isOpen(), true, 'kept open when the answer is no');
    page.answers = [true]; await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    assert.equal(await isOpen(), false, 'Esc + yes closes it');
    await ui.evaluate(() => document.getElementById('tdlg').showModal());
    await ui.locator('#tdlg button').click(); // saving (submit) clears the guard
    await ui.evaluate(() => { const d = document.getElementById('tdlg'); d.open || d.showModal(); });
    page.asked = [];
    await page.mouse.click(5, 5); await page.waitForTimeout(200); assert.equal(page.asked.length, 0, 'no question after saving');
    if (who === 'client' && w === 390) {
      await page.locator('[data-menu]').click(); assert.ok(await page.evaluate(() => document.body.classList.contains('menu-open')));
      await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.body.classList.contains('menu-open')), false, 'Esc closes the phone menu');
    }
    if (who === 'admin' && lang === 'en') {
      // 3. The order side panel: typing in a form inside it asks before the dark area or Esc closes it.
      await ui.evaluate(() => { const d = window.DLOrderUI.getDrawer(); d.open('t'); d.head.textContent = 'Test'; d.body.innerHTML = '<form data-test><input name="x"></form>'; });
      await ui.fill('.drawer form[data-test] input', 'typed');
      page.asked = []; page.answers = [false];
      await ui.locator('.drawer-scrim').click({ position: { x: 20, y: 20 } }); await page.waitForTimeout(200);
      assert.equal(page.asked.length, 1, 'side panel asks'); assert.equal(await ui.locator('.drawer.open').count(), 1, 'kept open');
      page.answers = [true]; await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      assert.equal(await ui.locator('.drawer.open').count(), 0, 'closed after yes');
    }
    await ctx.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS close on click outside / Esc: supplier bell lists what is new and closes (EN, 中文, 1440, 390), pop-up windows close and ask before losing typing (admin + client, EN + HE), phone menu Esc. Screens: ' + out);
} finally { if (errors.length) console.log('PAGE ERRORS', errors); await browser.close(); server.close(); }
