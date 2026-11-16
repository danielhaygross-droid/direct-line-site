// Email alerts, the screens (16 Nov 2026): the supplier's Email alerts page (English + 中文, 1440 + 390) and the admin's
// status card and Email for alerts field (English + Hebrew). Real SQL on PGlite + the real screens in Chrome.
//   node checks/check-supplier-alerts-ui.mjs
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'supplier-alerts-ui');
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); if (cookie) await ctx.addCookies([{ name: cookie.split('=')[0], value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const FEE = 0.37;
const { admin, client, id } = await seed();
ok(await call('/admin/users', 'POST', { username: 'sup-ada', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin));
const supId = ok(await call('/admin/overview', 'GET', null, admin)).suppliers[0].id;
const sup = (await call('/login', 'POST', { username: 'sup-ada', password: 'supplierpass1' })).cookie;
const errors = [];
try {
  for (const [lang, w] of [['en', 1440], ['zh', 390], ['zh', 1440], ['en', 390]]) {
    const ctx = await session(sup, w), page = await ctx.newPage(); page.on('pageerror', e => errors.push(lang + w + ': ' + e.message));
    await page.goto(`${base}/supplier/?lang=${lang}#alerts`); await page.waitForSelector('#sp-alerts');
    if (lang === 'en' && w === 1440) {
      await page.fill('#sp-alerts [name=email]', 'not-an-email'); await page.click('#sp-alerts [type=submit]'); await page.waitForSelector('.form-msg.err');
      await page.fill('#sp-alerts [name=email]', 'ada@example.com'); await page.click('#sp-alerts [type=submit]'); await page.waitForSelector('.form-msg.ok');
    }
    await page.screenshot({ path: path.join(out, `sup-${lang}-${w}-alerts.png`) });
    if (w === 390) { await page.locator('.sp-me summary').click(); assert.equal(await page.locator('.sp-menu a[href="#alerts"]').count(), 1, 'menu link'); }
    await ctx.close();
  }
  assert.equal(ok(await call('/admin/overview', 'GET', null, admin)).suppliers[0].alertEmail, 'ada@example.com');
  for (const [lang, w] of [['en', 1440], ['he', 1440], ['he', 390]]) {
    const ctx = await session(admin, w), page = await ctx.newPage(); page.on('pageerror', e => errors.push(lang + w + ': ' + e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=settings]');
    await ui.locator('[data-tab=settings]').click(); await ui.waitForSelector('.set-tabs'); await ui.locator('[data-set-tab=supplier]').click();
    await ui.waitForSelector('[data-alerts-status] .al-list'); assert.match(await ui.locator('[data-alerts-status]').innerText(), /ada@example\.com/);
    await ui.locator('[data-alerts-status]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `admin-${lang}-${w}-alerts-card.png`) });
    await ui.locator('[data-set-tab=team]').click(); await ui.locator(`[data-edit-admin="${supId}"]`).click(); await ui.waitForSelector('[data-admin-form] [name=alertEmail]');
    assert.equal(await ui.inputValue('[data-admin-form] [name=alertEmail]'), 'ada@example.com');
    await ui.locator('[data-admin-form]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `admin-${lang}-${w}-edit.png`) });
    await ctx.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS email alerts screens: supplier page (EN, 中文, 1440, 390), admin card and Email for alerts field (EN, HE). Screens: ' + out);
} finally { if (errors.length) console.log('PAGE ERRORS', errors); await browser.close(); server.close(); }
