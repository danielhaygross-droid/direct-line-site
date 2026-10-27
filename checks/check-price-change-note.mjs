// Check: the client's bell says "Product cost updated" (old → new) when the supplier changes the cost of an order that
// was already billed, instead of a second "Order billed" (Erwin, 27 Oct 2026). Also for older changes saved as a
// second "billed". Screenshots EN/HE at 1440 and 390 px.
//   node checks/check-price-change-note.mjs      (run from the repo root)
//   node checks/check-pay-for-orders.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real client portal in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'price-change-note');
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
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url);
const fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(fixture)).toString('base64') };
const mk = async ref => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: '2026-10-20', buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order.id;
const A = await mk('SHOP-1001'), B = await mk('SHOP-1002');
const ev = (o, kind, detail, at) => DB.prepare("INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,?,'admin',?,?)").bind(o, id, kind, detail, at).run();
const t = Math.floor(Date.now() / 1000) - 300;
await ev(A, 'billed', '103.90', t); await ev(A, 'price_changed', '103.90|76.40', t + 60);
await ev(B, 'billed', '28.90', t); await ev(B, 'billed', '19.40', t + 60); // saved before the fix
// Saved before the fix too, with the first bill no longer among the latest 50 updates (Yehuda, 27 Oct 2026).
const C = await mk('SHOP-1003'); await ev(C, 'billed', '22.90', t - 600);
for (let i = 0; i < 55; i++) await ev(B, 'tracking', 'UL' + i, t - 500 + i);
await ev(C, 'billed', '18.90', t + 120);
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const ctx = await session(client, width), page = await ctx.newPage();
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.reload(); await page.waitForSelector('[data-bell]');
    await page.locator('[data-bell]').click(); await page.waitForTimeout(500);
    const txt = await page.locator('.dln-panel').innerText();
    if (lang === 'en') {
      assert.equal((txt.match(/Product cost updated/g) || []).length, 3, 'every cost change says "Product cost updated"');
      assert.ok(/\$103\.90 → \$76\.40/.test(txt) && /\$28\.90 → \$19\.40/.test(txt) && /\$22\.90 → \$18\.90/.test(txt), 'old → new price shown');
      assert.equal((txt.match(/Order billed/g) || []).length, 2, 'the first bills still say "Order billed"');
    } else assert.ok(txt.includes('עלות המוצר עודכנה'), 'Hebrew title');
    await page.screenshot({ path: path.join(out, `${lang}-${width}-bell.png`) });
    await ctx.close();
  }
  console.log('PASS bell: "Product cost updated" with old → new (also when the first bill is older than the latest 50), first bill stays "Order billed" (EN/HE, 1440/390)');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
