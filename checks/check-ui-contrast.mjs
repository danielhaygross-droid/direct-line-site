// Readable and tappable (UI/UX review, Erwin 9 Nov 2026): status pills, the gold button text, the focus ring and
// the form-field borders meet WCAG contrast in light and dark; on phones fields use 16px text (no iPhone zoom)
// and buttons, chips and icon buttons are at least 44px tall.
//   node checks/check-ui-contrast.mjs   (run from the repo root)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'ui-contrast');
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
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const { admin, client } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url))).toString('base64') };
const mk = async ref => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
await mk('PEND-1');
const c = await mk('CANC-2');
ok(await call('/orders/' + c.id + '/request-cancellation', 'POST', { reason: 'Store suspended' }, client));
ok(await call('/orders/' + c.id + '/approve-cancellation', 'POST', {}, admin));
for (const [ref, status] of [['PROC-3', 'processing'], ['SHIP-4', 'shipped'], ['DELV-5', 'delivered']]) {
  const o = await mk(ref); await DB.prepare('UPDATE client_orders SET status=? WHERE id=?').bind(status, o.id).run();
}

// In the page: contrast of the things this check is about. Colours come from getComputedStyle, so any
// rgb()/rgba()/color(srgb …) value is read and see-through colours are laid over what is behind them.
const measure = () => {
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const bgOf = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    return layers.reverse().reduce((b, f) => over(f, b), [255, 255, 255, 1]); };
  const lum = c => { const v = c.slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return +((Math.max(x, y) + .05) / (Math.min(x, y) + .05)).toFixed(2); };
  const r = {};
  r.pills = [...document.querySelectorAll('.st')].filter(e => e.getClientRects().length).map(e => { const b = bgOf(e); return [e.className, ratio(over(rgba(getComputedStyle(e).color), b), b)]; });
  const css = getComputedStyle(document.documentElement), page = rgba(getComputedStyle(document.body).backgroundColor);
  const surf = rgba(css.getPropertyValue('--surface'));
  r.focus = Math.min(ratio(rgba(css.getPropertyValue('--focus')), page), ratio(rgba(css.getPropertyValue('--focus')), surf));
  r.field = ratio(over(rgba(css.getPropertyValue('--line-field')), surf), surf);
  const gold = rgba(css.getPropertyValue('--gold'));
  const t = document.createElement('button'); t.className = 'btn btn-primary'; t.textContent = 'x'; document.body.append(t);
  r.primary = ratio(rgba(getComputedStyle(t).color), gold); t.remove();
  r.badges = [...document.querySelectorAll('.badge-new, .icon-btn .count')].filter(e => e.getClientRects().length).map(e => [e.className, ratio(rgba(getComputedStyle(e).color), bgOf(e))]);
  // Every visible piece of text is 12px or more (the wordmark sub-line and chart labels are left out on purpose).
  r.tiny = [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('.brand, svg, .bars, .chart'))
    .map(e => [e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' "' + e.textContent.trim().slice(0, 16) + '"', parseFloat(getComputedStyle(e).fontSize)]).filter(x => x[1] < 12);
  for (const e of document.querySelectorAll('.tbl.stack td[data-label]')) { const f = parseFloat(getComputedStyle(e, '::before').fontSize); if (e.getClientRects().length && getComputedStyle(e, '::before').content !== 'none' && f < 12) r.tiny.push(['stacked label', f]); }
  return r;
};
const sizes = () => {
  const vis = s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length);
  return { fields: vis('.field input, .field select, .field textarea, .search input').map(e => parseFloat(getComputedStyle(e).fontSize)),
    targets: vis('.btn, .chip, .icon-btn').map(e => [e.className.split(' ')[0] + ':' + (e.textContent.trim().slice(0, 14) || e.getAttribute('aria-label')), Math.round(e.getBoundingClientRect().height)]) };
};

const problems = [];
try {
  for (const width of [1440, 390]) for (const lang of ['en', 'he']) for (const theme of ['light', 'dark']) {
    const tag = `${lang}-${width}-${theme}`;
    const ctx = await session(client, width), page = await ctx.newPage();
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('.st'); await page.waitForTimeout(600);
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme); await page.waitForTimeout(300);
    const m = await page.evaluate(measure);
    assert.ok(m.pills.length >= 5, 'status pills shown: ' + m.pills.length);
    for (const [k, v] of m.pills) if (v < 4.5) problems.push(`${tag} pill ${k} ${v}:1`);
    if (m.focus < 3) problems.push(`${tag} focus ring ${m.focus}:1`);
    if (m.field < 3) problems.push(`${tag} field border ${m.field}:1`);
    if (m.primary < 4.5) problems.push(`${tag} gold button text ${m.primary}:1`);
    assert.ok(m.badges.length >= 1, 'unread badge shown');
    for (const [k, v] of m.badges) if (v < 4.5) problems.push(`${tag} badge ${k} ${v}:1`);
    for (const [k, v] of m.tiny) problems.push(`${tag} text under 12px: ${k} ${v}px`);
    await page.screenshot({ path: path.join(out, `${tag}-orders.png`) });
    await page.locator('[data-open-order]').first().click(); await page.waitForTimeout(700);
    const d = await page.evaluate(measure); assert.ok(d.pills.length >= 1, 'order panel open');
    for (const [k, v] of d.tiny) problems.push(`${tag} order panel text under 12px: ${k} ${v}px`);
    await page.screenshot({ path: path.join(out, `${tag}-order-panel.png`) });
    if (theme === 'light') {
      await page.goto(`${base}/portal/?lang=${lang}#/new`); await page.waitForSelector('.field input'); await page.waitForTimeout(600);
      await page.locator('.field input:visible').first().focus();
      await page.screenshot({ path: path.join(out, `${tag}-new-order.png`) });
      if (width === 390) for (const r of ['new', 'orders']) {
        if (r === 'orders') { await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForSelector('.st'); await page.waitForTimeout(500); }
        const s = await page.evaluate(sizes);
        for (const f of s.fields) if (f < 16) problems.push(`${tag} ${r} field text ${f}px`);
        for (const [k, h] of s.targets) if (h < 44) problems.push(`${tag} ${r} tap target ${k} ${h}px`);
      }
    }
    await ctx.close();
  }
  for (const p of problems) console.log('FAIL', p);
  assert.equal(problems.length, 0, problems.length + ' readability / tap-size problems');
  console.log('PASS pills, badges, gold button, focus ring and field borders meet contrast (light + dark); no text under 12px; phone fields 16px and taps 44px (en/he, 1440/390)');
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
