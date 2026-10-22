// Local check: "Possibly delayed" orders and the "not shipped yet" tracking warning (branch claude/delay-flag).
//   node checks/check-delay-ui.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real portal and admin screens in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'delay-ui');
await mkdir(out, { recursive: true });

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const mk = async (ref, extra = {}) => ok(await call('/orders', 'POST', { clientId: id, orderRef: ref, buyerName: 'Dana Cohen', destination: 'US', address1: '1 Main St, Springfield', etsyUrl: 'https://example.com/i', ...extra }, admin)).order;
const status = (o, s) => call('/orders/' + o.id, 'PUT', { status: s }, admin).then(ok);
const t = Math.floor(Date.now() / 1000);
const late = await mk('ETSY-3412345678', { trackingNumber: 'UL602450763YP', courier: 'Yanwen' }); await status(late, 'processing');
const fine = await mk('ETSY-3412345679', { trackingNumber: 'UL602451830YP' }); await status(fine, 'processing');
const gone = await mk('ETSY-3412345680', { trackingNumber: 'UL602452000YP' }); await status(gone, 'processing'); await status(gone, 'shipped');
const REASON = 'The factory sent the wrong colour. It is being remade.';
// What the supplier sheet poll does when Delayed? = Possibly delayed (see checks/check-courier-sheet.mjs for the sheet side).
for (const o of [late, gone]) {
  await DB.prepare('UPDATE client_orders SET delayed_at=?, delay_reason=? WHERE id=?').bind(t, REASON, o.id).run();
  await DB.prepare("INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,'delayed','admin',?,?)").bind(o.id, id, REASON, t).run();
}

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
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 } }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`, errors = [];
    // ---- client portal ----
    let ctx = await session(client, width), page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('tr[data-open-order]'); await page.waitForTimeout(400);
    assert.equal(await page.locator('tr[data-open-order] .delay-tag').count(), 1, tag + ' only the late, not-yet-shipped order has the badge');
    assert.equal(await page.locator(`tr[data-open-order="${late.id}"] .delay-tag`).count(), 1);
    assert.equal(await page.locator('tr[data-open-order] .ship-warn').count(), 2, tag + ' tracking warning only before shipping');
    await page.locator('[data-orders-list]').scrollIntoViewIfNeeded().catch(() => {});
    await page.locator(`tr[data-open-order="${late.id}"]`).scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `${tag}-portal-list.png`) });
    await page.locator(`tr[data-open-order="${late.id}"]`).click(); await page.waitForSelector('.delay-note'); await page.waitForTimeout(500);
    const note = await page.locator('.delay-note').innerText();
    assert.ok(note.includes(REASON), tag + ' the reason is shown');
    await page.screenshot({ path: path.join(out, `${tag}-portal-drawer.png`) });
    await page.locator('.ship-warn-box').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    if (lang === 'en') assert.match(await page.locator('.ship-warn-box').innerText(), /Not shipped yet\. Please don’t add this tracking number to Etsy/);
    await page.screenshot({ path: path.join(out, `${tag}-portal-tracking.png`) });
    // Notification
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const bell = page.locator('[data-bell], .bell, button[aria-label*="otif"]').first();
    if (await bell.count()) { await bell.click(); await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${tag}-portal-bell.png`) }); if (lang === 'en') assert.match(await page.locator('body').innerText(), /Order possibly delayed/); }
    await ctx.close();
    // ---- admin ----
    ctx = await session(admin, width); page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=orders]');
    await ui.locator('[data-tab=orders]').click(); await ui.waitForSelector(`tr[data-open-order="${late.id}"]`); await page.waitForTimeout(300);
    assert.equal(await ui.locator(`tr[data-open-order="${late.id}"] .delay-tag`).count(), 1, tag + ' admin list badge');
    await page.screenshot({ path: path.join(out, `${tag}-admin-list.png`) });
    await ui.locator(`tr[data-open-order="${late.id}"] td.wide`).click(); await ui.waitForSelector('.delay-note'); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `${tag}-admin-order.png`) });
    await ctx.close();
    assert.deepEqual(errors, [], tag); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
