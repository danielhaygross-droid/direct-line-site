// Check: a client whose free month ended gets told in the portal (17 Nov 2026, Erwin: Yehuda's free month ended on 13 Nov
// and he didn't know). One new item in the bell (once), and the banner on Home with "Message us". EN + HE, 1440 + 390.
//   node checks/check-subscription-notice.mjs
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'subscription-notice');
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
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'" });
    res.end(data);
  } catch (e) { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const { client, id } = await seed();

// Free month still running: nothing in the bell about it.
await DB.prepare("UPDATE users SET trial_start = '2099-01-01', trial_end = '2099-02-01', sub_status = 'trial' WHERE id = ?").bind(id).run();
assert.ok(!ok(await call('/notifications', 'GET', null, client)).items.some(x => x.kind === 'subscription'), 'not while the free month runs');
// Ended: one item, newer than what the client last saw, and the same item (same time) on the next look.
await DB.prepare("UPDATE users SET trial_start = '2026-10-13', trial_end = '2026-11-13', sub_status = 'trial', notif_seen_at = ? WHERE id = ?").bind(Math.floor(Date.now() / 1000) - 60, id).run();
const n1 = ok(await call('/notifications', 'GET', null, client)), s1 = n1.items.filter(x => x.kind === 'subscription');
assert.equal(s1.length, 1); assert.ok(s1[0].createdAt > n1.seenAt, 'shows as new'); assert.match(s1[0].detail, /^trial\|2026-11-13\|\d+/);
const s2 = ok(await call('/notifications', 'GET', null, client)).items.filter(x => x.kind === 'subscription');
assert.equal(s2[0].createdAt, s1[0].createdAt, 'same item, not new again on every look');
const errors = [];
try {
  for (const [lang, w] of [['en', 1440], ['he', 390], ['en', 390], ['he', 1440]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addCookies([{ name: client.split('=')[0], value: decodeURIComponent(client.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(lang + w + ': ' + e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('.sub-banner.due');
    const banner = await page.locator('.sub-banner.due').innerText();
    assert.match(banner, lang === 'he' ? /החודש החינמי/ : /Your free month ended on 13 Nov 2026/);
    assert.equal(await page.locator('.sub-banner.due a[href="#/messages"]').count(), 1, 'Message us link');
    await page.screenshot({ path: path.join(out, `${lang}-${w}-home.png`) });
    await page.locator('[data-bell]').click(); await page.waitForTimeout(400);
    const panel = await page.locator('.dln-panel').innerText();
    assert.match(panel, lang === 'he' ? /החודש החינמי שלך הסתיים/ : /Your free month ended/, 'in the bell');
    await page.screenshot({ path: path.join(out, `${lang}-${w}-bell.png`) });
    await ctx.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS subscription notice: free month ended -> one new bell item (once) + Home banner with Message us (EN, HE, 1440, 390). Screens: ' + out);
} finally { if (errors.length) console.log('PAGE ERRORS', errors); await browser.close(); server.close(); }
