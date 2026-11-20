// Client Orders table (Erwin, 19 Nov 2026 QA): the Status column must be on screen without scrolling sideways.
// Earned / Profit are left out while the client has entered no Etsy numbers; Customer / Destination step aside on narrower
// screens. Measured at 1440, 1280, 1100, 1024, 800 and the phone, in English and Hebrew, with and without Etsy numbers.
//   node checks/check-orders-status.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'orders-status');
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
const ids = [];
for (let i = 0; i < 6; i++) {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: String(4251000000 + i), itemTitle: 'Wool felt slippers', buyerName: 'Jane Buyer ' + i, address1: '1 St', city: 'Austin', destination: ['US', 'DE', 'UK', 'AU', 'CA', 'IL'][i], etsyUrl: 'https://example.com/' + i, photos: [photo] }, client)).order; ids.push(o.id);
  ok(await call('/orders/' + o.id, 'PUT', { productCost: 20 + i, shippingFee: 0 }, admin));
  if (i === 1) ok(await call('/orders/' + o.id, 'PUT', { trackingNumber: 'UL706844450YP', courier: 'Yanwen' }, admin)); ok(await call('/orders/' + o.id, 'PUT', { status: 'shipped' }, admin));
}
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 22, paidAt: '2026-11-10', orderIds: [ids[1]] }, admin));
const widths = [1440, 1280, 1100, 1024, 800, 390];
async function measureAt(lang, w, tag) {
  const ctx = await session(client, w), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('[data-orders-list] tbody tr');
  const m = await page.evaluate(() => { const wrap = document.querySelector('[data-orders-list] .table-wrap'), t = wrap.querySelector('table'), st = [...t.querySelectorAll('thead th')].find(h => /status|סטטוס/i.test(h.innerText)), r = wrap.getBoundingClientRect(), s = st?.getBoundingClientRect(), stack = getComputedStyle(t.querySelector('thead')).display === 'none';
    const pill = t.querySelector('tbody tr td:nth-last-child(2) > *'); const pr = pill?.getBoundingClientRect();
    return { stack, scrolls: wrap.scrollWidth > wrap.clientWidth + 1, cols: [...t.querySelectorAll('thead th')].filter(h => getComputedStyle(h).display !== 'none').map(h => h.innerText.trim()), statusVisible: stack ? !!pr && pr.right <= innerWidth + 1 && pr.left >= -1 : !!s && s.left >= r.left - 1 && s.right <= r.right + 1, page: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  await page.screenshot({ path: path.join(out, `${tag}-${lang}-${w}.png`) });
  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close(); return m;
}
try {
  for (const phase of ['no-etsy-numbers', 'with-etsy-numbers']) {
    if (phase === 'with-etsy-numbers') for (const oid of ids) ok(await call('/orders/' + oid, 'PUT', { etsyEarned: 30 }, client));
    for (const lang of ['en', 'he']) for (const w of widths) {
      const m = await measureAt(lang, w, phase), tag = `${phase} ${lang} ${w}px`;
      if (process.env.DBG) console.log(tag, JSON.stringify(m));
      assert.ok(m.page, tag + ': page does not scroll sideways');
      assert.ok(m.statusVisible, tag + ': Status is on screen');
      if (!m.stack) assert.ok(!m.scrolls, tag + ': table fits its box without sideways scrolling: ' + m.cols.join(' | '));
      if (phase === 'no-etsy-numbers' && !m.stack) assert.ok(!m.cols.some(c => /^(Earned|Profit|הרווחת|רווח)$/i.test(c)), tag + ': no empty Earned / Profit columns: ' + m.cols.join(' | '));
      if (phase === 'with-etsy-numbers' && w >= 1280) assert.ok(m.cols.some(c => /^(Earned|הרווחת)$/i.test(c)), tag + ': Earned shown once the client has numbers');
    }
    console.log(`PASS ${phase}: Status always on screen, no sideways scrolling (EN, HE; ${widths.join(', ')} px)`);
  }
} finally { await browser.close(); server.close(); }
console.log('Screenshots:', out);
