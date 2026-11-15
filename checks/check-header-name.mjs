// Check: the top-right name and "Good morning, …" on the Control page show the team admin who signed in
// (Erwin, 15 Nov 2026: "why is it still showing daniel? even though i logged in using my own account").
// The main admin login (set in Vercel) keeps "Daniel". Runs: node checks/check-header-name.mjs
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'header-name');
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const boss = (await call('/login', 'POST', { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD })).cookie;
const mk = await call('/admin/users', 'POST', { username: 'erwin-test', name: 'Erwin Test', password: 'testpass1234', role: 'admin' }, boss);
await call('/admin/users/' + mk.data.id, 'POST', { position: 'Assistant' }, boss);
const erwin = (await call('/login', 'POST', { username: 'erwin-test', password: 'testpass1234' })).cookie;
const s = await (await route(new Request('http://localhost/api/auth/session', { headers: { cookie: erwin } }), { db: DB, env })).json();
assert.equal(s.name, 'Erwin Test'); assert.equal(s.position, 'Assistant');
const sb = await (await route(new Request('http://localhost/api/auth/session', { headers: { cookie: boss } }), { db: DB, env })).json();
assert.equal(sb.name, undefined, 'main login gets no name (page keeps Daniel)');

const read = page => page.evaluate(() => ({ who: document.querySelector('.profile strong').textContent, role: document.querySelector('.profile small').textContent, ini: document.querySelector('.profile b').textContent }));
for (const [lang, url] of [['en', '/en/'], ['he', '/']]) {
  for (const width of [1440, 390]) {
    const ctx = await session(erwin, width), page = await ctx.newPage();
    await page.goto(base + url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.profile strong')?.textContent === 'Erwin Test', null, { timeout: 15000 });
    const r = await read(page);
    assert.deepEqual(r, { who: 'Erwin Test', role: 'Assistant', ini: 'ET' }, lang + ' ' + width);
    await page.screenshot({ path: path.join(out, `team-${lang}-${width}.png`) });
    await ctx.close();
  }
  const ctx = await session(boss, 1440), page = await ctx.newPage();
  await page.goto(base + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const r = await read(page);
  assert.equal(r.ini, 'DL', 'main login keeps DL'); assert.ok(/Daniel|דניאל/.test(r.who), 'main login keeps Daniel');
  await ctx.close();
}
// 16 Nov 2026: signed in on the sign-in form (no reload): the header must switch to the person who signed in.
for (const [lang, url] of [['en', '/en/'], ['he', '/']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, reducedMotion: 'reduce' }), page = await ctx.newPage();
  await page.goto(base + url, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#login-form');
  await page.fill('#login-form [name=username]', 'erwin-test'); await page.fill('#login-form [name=password]', 'testpass1234');
  await page.locator('#login-form [type=submit]').click();
  await page.waitForFunction(() => document.querySelector('.profile strong')?.textContent === 'Erwin Test', null, { timeout: 15000 });
  assert.deepEqual(await read(page), { who: 'Erwin Test', role: 'Assistant', ini: 'ET' }, 'after signing in on the form: ' + lang);
  await ctx.close();
}
console.log('PASS header-name: team admin sees own name/position (EN+HE, 1440+390); main login keeps Daniel. Screens:', out);
await browser.close(); server.close(); await pg.close();
