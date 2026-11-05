// Check: the client portal is easy to read and tap (UI UX Pro Max review, 5 Nov 2026). On Home, Orders, New order and
// Payments, EN + HE, light + dark: text that carries information is at least 12px; grey text (--dim / --muted) has a
// contrast of at least 4.5:1 on its background; on a phone every button is at least 44px tall; in Hebrew a date like
// "04/11/2026, 19:56" stays one left-to-right run (U+2066 ... U+2069) so it doesn't flip.
//   node checks/check-portal-readability.mjs      (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'portal-readability');
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
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const mk = async (ref, cost, date) => { const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Buyer ' + ref, address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order; ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id; };
const OLD = await mk('OLD-1', 20, day(30)), S1 = await mk('SHIP-1', 10, day(3)), S2 = await mk('SHIP-2', 12, day(3)), P1 = await mk('PAID-1', 15, day(5));
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 17, paidAt: day(2), method: 'Bank transfer', note: 'October', orderIds: [P1] }, admin));
for (const o of [S1, S2]) ok(await call('/orders/' + o, 'PUT', { status: 'shipped' }, admin));
const ORDER = await mk('READ-1', 20, day(3));
const audit = () => {
  const out = { small: [], faint: [], tap: [], dates: [] };
  const skip = 'svg,.chart,.bars,.brand,.badge-new,.count,.eyebrow,.tabs .badge-new,script,style,[hidden]';
  // Any CSS colour (rgb, color-mix results like color(srgb …)) to [r, g, b, a] through a 1x1 canvas.
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = c => { const v = rgb(c).slice(0, 3).map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const st = getComputedStyle(e), c = st.backgroundColor; if (st.backgroundImage !== 'none') return null; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c) && (rgb(c)[3] ?? 1) > 0.9) return c; } return getComputedStyle(document.body).backgroundColor; };
  const probe = v => { const i = document.createElement('i'); i.style.color = `var(${v})`; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
  const greys = [probe('--dim'), probe('--muted')];
  const shown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest(skip); };
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text) || !shown(el)) continue;
    const st = getComputedStyle(el);
    if (parseFloat(st.fontSize) < 11.95) out.small.push(`${el.className || el.tagName} "${text.slice(0, 30)}" ${st.fontSize}`);
    if (greys.includes(st.color) && parseFloat(st.opacity) === 1) { const bg = bgOf(el); if (bg && ratio(st.color, bg) < 4.5) out.faint.push(`"${text.slice(0, 30)}" ${ratio(st.color, bg).toFixed(2)}`); }
    if (/\d\d\/\d\d\/\d{4}/.test(text)) out.dates.push(text);
  }
  if (innerWidth < 600) for (const b of document.querySelectorAll('.icon-btn, .btn, .chip, .pm-paste')) if (shown(b) && b.getBoundingClientRect().height < 43.5) out.tap.push(`${b.className} "${b.textContent.trim().slice(0, 20)}" ${Math.round(b.getBoundingClientRect().height)}px`);
  return out;
};
try {
  for (const lang of ['en', 'he']) for (const [width, theme] of [[1440, 'light'], [390, 'light'], [390, 'dark']]) {
    const tag = `${lang}-${width}-${theme}`, ctx = await session(client, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('[data-nav]');
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    for (const route of ['home', 'orders', 'new', 'payments']) {
      await page.evaluate(r => { location.hash = '#/' + r; }, route); await page.waitForTimeout(600);
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme); await page.waitForTimeout(100);
      const r = await page.evaluate(audit);
      assert.deepEqual(r.small, [], `${tag} ${route}: text under 12px ${JSON.stringify(r.small)}`);
      assert.deepEqual(r.faint, [], `${tag} ${route}: grey text under 4.5:1 ${JSON.stringify(r.faint)}`);
      assert.deepEqual(r.tap, [], `${tag} ${route}: buttons under 44px on a phone ${JSON.stringify(r.tap)}`);
      if (lang === 'he') for (const d of r.dates) assert.ok(d.includes('\u2066'), `${tag} ${route}: Hebrew date kept left to right: ${d}`);
      await page.screenshot({ path: path.join(out, `${tag}-${route}.png`) });
      // PR 2 (5 Nov 2026): the unpaid strip is on Home and Payments, not Orders; on a phone an order card shows no empty
      // lines ("—", "Not yet") and no update tag that repeats its status pill ("Now Delivered" + "Delivered").
      if (route === 'orders') {
        assert.equal(await page.locator('.pay-strip').count(), 0, tag + ': no unpaid strip on Orders');
        const rows = await page.evaluate(() => [...document.querySelectorAll('[data-orders-list] tr[data-open-order]')].map(tr => ({ empty: [...tr.querySelectorAll('td[data-label]')].filter(td => td.offsetParent && /^(—|Not yet|לא עדיין|עדיין לא)$/.test(td.innerText.trim())).map(td => td.dataset.label), pill: tr.querySelector('.pill')?.innerText.trim(), tags: [...tr.querySelectorAll('.upd-tag')].map(t => t.innerText.trim()) })));
        assert.ok(rows.length > 0, tag + ': orders listed');
        for (const r of rows) { if (width < 600) assert.deepEqual(r.empty, [], tag + ': empty lines on a phone card'); assert.ok(!r.tags.some(t => r.pill && t.endsWith(r.pill)), tag + ': status said twice ' + JSON.stringify(r)); }
      }
    }
    // PR 3 (5 Nov 2026): a missing field says what is missing right under it, and the message goes when it is filled in.
    await page.evaluate(() => { location.hash = '#/new'; }); await page.waitForSelector('[data-submit]'); await page.waitForTimeout(300);
    await page.locator('[data-submit]').click(); await page.waitForTimeout(400);
    const errs = await page.evaluate(() => [...document.querySelectorAll('.field.bad[data-f]')].map(f => ({ key: f.dataset.f, msg: f.querySelector('.field-err')?.innerText || '' })));
    assert.ok(errs.length >= 3 && errs.every(e => e.msg.length > 5), tag + ': a message under each missing field ' + JSON.stringify(errs));
    await page.screenshot({ path: path.join(out, `${tag}-new-errors.png`) });
    await page.locator('[name=buyerName]').fill('Sample Buyer'); await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-f="buyerName"] .field-err').count(), 0, tag + ': the message goes when the field is filled in');
    // Stores: the forms open on "Add store" / "Edit store".
    await page.evaluate(() => { location.hash = '#/stores'; }); await page.waitForSelector('[data-store-status]'); await page.waitForTimeout(300);
    assert.equal(await page.locator('.store-add [data-client-store-form]').isVisible(), false, tag + ': add form closed');
    assert.equal(await page.locator('.store-edit [data-client-store-form]').first().isVisible(), false, tag + ': edit form closed');
    await page.locator('.store-add > summary').click(); assert.equal(await page.locator('.store-add [data-client-store-form]').isVisible(), true, tag + ': Add store opens the form');
    await page.screenshot({ path: path.join(out, `${tag}-stores.png`) });
    // The order panel shows the exact times (activity).
    await page.evaluate(id => { location.hash = '#/orders'; }, ORDER); await page.waitForTimeout(500);
    await page.locator(`[data-open-order="${ORDER}"]`).first().click(); await page.waitForTimeout(700);
    const r = await page.evaluate(audit);
    assert.deepEqual(r.small, [], `${tag} order panel: text under 12px ${JSON.stringify(r.small)}`); assert.deepEqual(r.faint, [], `${tag} order panel: grey text under 4.5:1 ${JSON.stringify(r.faint)}`);
    if (lang === 'he') { assert.ok(r.dates.length > 0, tag + ' the panel shows a date'); for (const d of r.dates) assert.ok(d.includes('\u2066'), `${tag} panel: Hebrew date kept left to right: ${d}`); }
    await page.screenshot({ path: path.join(out, `${tag}-order-panel.png`) });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
