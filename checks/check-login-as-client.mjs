// Local check: admin "Log in as client" (branch claude/login-as-client).
//   node checks/check-login-as-client.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real admin and portal screens in Chrome. No live data.
// Uses the code in ../login-as-client (the branch worktree); set DL_CODE=continuation to run it against that folder.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
const here = path.dirname(fileURLToPath(import.meta.url));
const code = path.resolve(here, '..', process.env.DL_CODE || '.');
const imp = p => import('file:///' + path.join(code, p).replace(/\\/g, '/'));
const { createD1 } = await imp('server/d1-postgres.mjs');
const { SCHEMA, handlePortal } = await imp('server/portal.mjs');
const { route } = await imp('api/index.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const root = path.join(code, 'dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'login-as-client');
await mkdir(out, { recursive: true });

const pg = new PGlite();
const DB = createD1(null, async (q, p) => (await pg.query(q, p)).rows, SCHEMA);
// Local-only test accounts for this in-memory database.
const env = { ADMIN_USERNAME: 'localboss', ADMIN_PASSWORD: 'local-boss-password', APP_SESSION_SECRET: 'local-tests-only' };
async function call(p, method = 'GET', body, cookie = '', extra = {}) {
  const url = new URL('http://localhost/api/portal' + p);
  const r = await handlePortal(new Request(url, { method, headers: { cookie, 'content-type': 'application/json', ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) }), url, { DB, env, waitUntil: x => x.catch(() => {}) });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ---------- API ----------
const admin = (await call('/login', 'POST', { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD })).cookie;
const created = await call('/admin/users', 'POST', { username: 'localclient', name: 'Maya Levi', password: 'clientpass123', role: 'client' }, admin);
assert.equal(created.status, 200); const id = created.data.id;
const client = (await call('/login', 'POST', { username: 'localclient', password: 'clientpass123' })).cookie;
const terms = await call('/terms', 'GET', null, client);
assert.equal((await call('/terms/accept', 'POST', { version: terms.data.policy.version, accepted: true }, client)).status, 200);
const order = body => ({ orderRef: 'ETSY-' + Math.floor(Math.random() * 1e6), buyerName: 'Dana Cohen', destination: 'US', address1: '1 Main St, Springfield', etsyUrl: 'https://www.etsy.com/listing/111', quantity: 1, photos: [{ data: PNG }], ...body });
// The client does a few things themselves.
assert.equal((await call('/me', 'GET', null, client)).status, 200);
const own = await call('/orders', 'POST', order({}), client); assert.equal(own.status, 200, JSON.stringify(own.data));
const me = (await DB.prepare('SELECT last_login, last_seen_at FROM users WHERE id=?').bind(id).first());
assert.ok(me.last_login > 0 && me.last_seen_at > 0, 'client sign-in and portal use are recorded');

const view = { 'x-dl-view-as': String(id) }, act = { ...view, 'x-dl-act': '1' };
// View only stays view only.
assert.equal((await call('/orders', 'POST', order({}), admin, view)).status, 403);
// Logged in as the client: same rights as the client, recorded as admin, logged.
assert.equal((await call('/acting/start', 'POST', {}, admin, act)).status, 200);
const actMe = await call('/me', 'GET', null, admin, act); assert.equal(actMe.data.acting, true); assert.equal(actMe.data.preview, false);
const byAdmin = await call('/orders', 'POST', order({ buyerName: 'Noa Bar' }), admin, act); assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.data));
assert.equal(byAdmin.data.order.clientId, id);
assert.equal(byAdmin.data.order.price, 0, 'client rights: no price set by the form');
const ev = await DB.prepare("SELECT actor FROM order_events WHERE order_id=? AND kind='created'").bind(byAdmin.data.order.id).first();
assert.equal(ev.actor, 'admin');
assert.equal((await call(`/orders/${byAdmin.data.order.id}/photos`, 'POST', { data: PNG }, admin, act)).status, 200);
assert.equal((await call('/client-stores', 'POST', { name: 'Maya Ceramics', platform: 'Etsy' }, admin, act)).status, 200);
assert.equal((await call(`/orders/${own.data.order.id}/messages`, 'POST', { body: 'hi' }, admin, act)).status, 403);
assert.equal((await call('/password', 'POST', { password: 'another-pass-1' }, admin, act)).status, 403);
const seenBefore = (await DB.prepare('SELECT last_seen_at FROM users WHERE id=?').bind(id).first()).last_seen_at;
await DB.prepare('UPDATE users SET last_seen_at=1 WHERE id=?').bind(id).run();
await call('/me', 'GET', null, admin, act);
assert.equal(Number((await DB.prepare('SELECT last_seen_at FROM users WHERE id=?').bind(id).first()).last_seen_at), 1, 'admin visits do not count as client activity');
await DB.prepare('UPDATE users SET last_seen_at=? WHERE id=?').bind(seenBefore, id).run();
const activity = await call(`/admin/clients/${id}/activity`, 'GET', null, admin);
assert.equal(activity.status, 200);
assert.ok(activity.data.events.some(e => e.kind === 'created'), 'client actions listed');
assert.ok(!activity.data.events.some(e => e.orderId === byAdmin.data.order.id), 'admin actions are not shown as the client’s');
assert.deepEqual(activity.data.adminActions.map(a => [a.path, a.ok]), [['/password', false], [`/orders/${own.data.order.id}/messages`, false], ['/client-stores', true], [`/orders/${byAdmin.data.order.id}/photos`, true], ['/orders', true], ['/acting/start', true]]);
assert.equal((await call(`/admin/clients/${id}/activity`, 'GET', null, client)).status, 403);
console.log('PASS api');

// ---------- screens ----------
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
    const tag = `${lang}-${width}`;
    const ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    // Admin: client panel → Activity tab.
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]');
    await ui.locator('[data-tab=clients]').click(); await ui.locator(`[data-open-client="${id}"]`).first().click();
    await ui.locator('.gtabs button').nth(3).click(); await ui.locator('.subtabs [data-ctab=activity]').click(); await ui.waitForSelector('.order-activity'); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `${tag}-admin-activity.png`) });
    await ui.locator('.order-activity').last().scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `${tag}-admin-activity-2.png`) });
    assert.equal(await ui.locator(`a[href="/portal/?as=${id}&act=1"]`).count(), 1, 'Log in as client in the footer (the big card in Activity was removed in #66)');
    // Portal, logged in as the client.
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push(e.message));
    await p2.goto(`${base}/portal/?as=${id}&act=1&lang=${lang}`); await p2.waitForSelector('.acting-bar'); await p2.waitForTimeout(600);
    await p2.screenshot({ path: path.join(out, `${tag}-portal-acting.png`) });
    await p2.goto(`${base}/portal/?as=${id}&act=1&lang=${lang}#/new`); await p2.waitForSelector('.acting-bar'); await p2.waitForTimeout(800);
    assert.ok(await p2.locator('form').count() > 0, 'new order form is open while logged in as the client');
    await p2.screenshot({ path: path.join(out, `${tag}-portal-acting-new.png`) });
    // View only preview offers the switch.
    await p2.goto(`${base}/portal/?as=${id}&lang=${lang}`); await p2.waitForSelector('.preview-bar'); await p2.waitForTimeout(500);
    assert.equal(await p2.locator(`.preview-bar a[href="/portal/?as=${id}&act=1"]`).count(), 1);
    await p2.screenshot({ path: path.join(out, `${tag}-portal-preview.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
  const startLogs = Number((await DB.prepare("SELECT COUNT(*) AS n FROM admin_impersonation_log WHERE path='/acting/start'").first()).n);
  assert.ok(startLogs >= 2 && startLogs <= 6, 'one "logged in" line per tab, not per reload: ' + startLogs);
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
