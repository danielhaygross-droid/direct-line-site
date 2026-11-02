// Cards in a row line up (Erwin, 2 Nov 2026: the Cancelled orders boxes were "a sore in the eye"): on every portal and admin
// page, side-by-side boxes built the same way have their label and their big number at the same height.
//   node checks/check-card-alignment.mjs   (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real screens in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'card-alignment');
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

const { admin, client, id } = await seed();
await mkdir(out, { recursive: true });
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const mk = async (ref, cost) => { const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order; ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return (await call('/orders', 'GET', null, client)).data.orders.find(x => x.id === o.id); };
const A = await mk('KUMO-1', 20), B = await mk('KUMO-2', 30), C = await mk('KUMO-3', 15), D = await mk('KEEP-4', 10);
// A, B, C paid; A cancelled free, B cancelled with the supplier's $5 fee, C cancelled with no payment... (C unpaid), D stays.
ok(await call('/admin/payments', 'POST', { clientId: id, amount: A.price + B.price, paidAt: '2026-10-20', method: 'Bank transfer', orderIds: [A.id, B.id] }, admin));
await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=5 WHERE id=?').bind(B.id).run();
await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=3 WHERE id=?').bind(C.id).run(); // C never paid: its fee comes from the credit
for (const o of [A, B, C]) { ok(await call('/orders/' + o.id + '/request-cancellation', 'POST', { reason: 'Store suspended' }, client)); ok(await call('/orders/' + o.id + '/approve-cancellation', 'POST', {}, admin)); }
ok(await call('/admin/refunds', 'POST', { clientId: id, amount: 10, date: '2026-10-27', method: 'Bank transfer', note: 'KumoBags' }, admin));

// In-page audit: every row of side-by-side boxes (cards, tiles, stats). Inside a row, each box's label and its big
// number must start at the same height. Returns one line per row that is off by more than 2px.
const audit = () => {
  const out = [], seen = new Set();
  const boxy = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return r.width > 70 && r.height > 36 && s.display !== 'contents' && s.visibility !== 'hidden' && (parseFloat(s.borderTopWidth) > 0 || s.backgroundColor !== getComputedStyle(el.parentElement).backgroundColor || parseFloat(s.boxShadow ? 1 : 0)) && (parseFloat(s.borderTopWidth) > 0 || s.backgroundColor !== 'rgba(0, 0, 0, 0)'); };
  const texts = el => [...el.querySelectorAll('*')].filter(x => x.children.length === 0 && x.textContent.trim() && x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
  const name = el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  for (const p of document.querySelectorAll('body *')) {
    if (seen.has(p) || p.closest('table, svg, select')) continue;
    const kids = [...p.children].filter(k => k.getClientRects().length && boxy(k));
    if (kids.length < 2) continue;
    const rows = new Map();
    for (const k of kids) { const t = Math.round(k.getBoundingClientRect().top); const key = [...rows.keys()].find(x => Math.abs(x - t) <= 2) ?? t; rows.set(key, [...(rows.get(key) || []), k]); }
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      const info = row.map(k => { const top = k.getBoundingClientRect().top, ts = texts(k); if (!ts.length) return null;
        const big = ts.reduce((a, b) => parseFloat(getComputedStyle(b).fontSize) > parseFloat(getComputedStyle(a).fontSize) ? b : a);
        return { k, first: Math.round(ts[0].getBoundingClientRect().top - top), big: Math.round(big.getBoundingClientRect().top - top), bigSize: parseFloat(getComputedStyle(big).fontSize), label: ts[0].textContent.trim().slice(0, 24) }; }).filter(Boolean);
      if (info.length < 2) continue;
      // Only boxes built the same way (same class) are compared.
      const same = info.filter(x => x.k.className === info[0].k.className);
      if (same.length < 2) continue;
      const spread = f => Math.max(...same.map(f)) - Math.min(...same.map(f));
      const bigSame = same.filter(x => x.bigSize === Math.max(...same.map(y => y.bigSize)));
      const bad = spread(x => x.first) > 2 || (bigSame.length > 1 && Math.max(...bigSame.map(x => x.big)) - Math.min(...bigSame.map(x => x.big)) > 2);
      if (bad) out.push(`${name(p)} > ${name(same[0].k)}: ` + same.map(x => `${x.label}[${x.first}/${x.big}]`).join(' · '));
    }
  }
  return [...new Set(out)];
};
const found = new Map();
const note = (where, list) => { for (const l of list) { const k = l.replace(/\[[^\]]*\]/g, ''); if (!found.has(k)) found.set(k, `${where}: ${l}`); } };
try {
  for (const width of [1440, 390]) for (const lang of ['en', 'he']) {
    const tag = `${lang}-${width}`;
    let ctx = await session(client, width), page = await ctx.newPage();
    for (const r of ['home', 'orders', 'payments', 'products', 'messages', 'new']) {
      await page.goto(`${base}/portal/?lang=${lang}#/${r}`); await page.waitForTimeout(r === 'home' ? 1200 : 800);
      note(`portal ${r} ${tag}`, await page.evaluate(audit));
      for (const sel of ['.mn-grid', '.cx-stats']) { const el = page.locator(sel + ':visible').first(); if (await el.count()) await el.screenshot({ path: path.join(out, `${tag}-portal-${r}${sel.replace('.', '-')}.png`) }); }
      if (r === 'orders') { const d = page.locator('details > summary').first(); if (await d.count()) { await d.click(); await page.waitForTimeout(500); note(`portal orders (earnings open) ${tag}`, await page.evaluate(audit)); }
        await page.locator('[data-open-order]').first().click(); await page.waitForTimeout(600); note(`portal order drawer ${tag}`, await page.evaluate(audit)); }
    }
    await ctx.close();
    ctx = await session(admin, width); page = await ctx.newPage();
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=clients]'); await page.waitForTimeout(800);
    const tabs = await ui.locator('[data-tab]').evaluateAll(b => [...new Set(b.map(x => x.dataset.tab))]);
    for (const t of tabs) { const b = ui.locator(`[data-tab="${t}"]:visible`).first(); if (!await b.count()) continue; await b.click(); await page.waitForTimeout(700); note(`admin ${t} ${tag}`, await ui.evaluate(audit)); }
    await ui.locator('[data-tab=clients]:visible').first().click(); await page.waitForTimeout(400);
    await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.gtabs'); await page.waitForTimeout(500);
    const g = await ui.locator('.gtabs button').count();
    for (let i = 0; i < g; i++) { await ui.locator('.gtabs button').nth(i).click(); await page.waitForTimeout(500); note(`admin client tab ${i} ${tag}`, await ui.evaluate(audit)); { const el = ui.locator('.cx-stats:visible').first(); if (await el.count()) await el.screenshot({ path: path.join(out, `${tag}-admin-client-${i}-cx-stats.png`) }); }
      const s = await ui.locator('.subtabs button:visible').count();
      for (let j = 0; j < s; j++) { await ui.locator('.subtabs button:visible').nth(j).click(); await page.waitForTimeout(500); note(`admin client tab ${i}.${j} ${tag}`, await ui.evaluate(audit)); } }
    await ctx.close();
  }
  for (const v of found.values()) console.log('MISALIGNED', v);
  assert.equal(found.size, 0, `${found.size} rows of cards are not aligned`);
  console.log('PASS cards: labels and numbers line up on every portal and admin page (en/he, 1440/390)');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
