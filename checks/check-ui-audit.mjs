// UI audit (Erwin, 23 Oct 2026: "do a deep test to find more design issues"). Opens every main admin and portal screen
// in English and Hebrew at 1440 and 390 px and measures layout problems instead of relying on eyes: the page scrolling
// sideways, things sticking out of the screen, oversized or cut-off buttons, overlapping controls, tiny tap targets on
// phones, short inputs and English left untranslated in Hebrew. Screenshots of every screen.
//   node checks/check-ui-audit.mjs      (run from the repo root; AUDIT_REPORT=1 lists problems without failing)
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'ui-audit');
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
const fixture = new URL('./fixtures/en-1440-light-agreement.png', import.meta.url);
const fixturePath = decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + (await readFile(fixture)).toString('base64') };
const mk = async (ref, date, cost) => {
  const o = ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, orderDate: date, buyerName: 'Sample Buyer', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [photo] }, client)).order;
  if (cost != null) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin)); return o.id;
};
const A = await mk('SHOP-201', '2026-10-02', 20), B = await mk('SHOP-202', '2026-10-06', 25), C = await mk('SHOP-203', '2026-10-11', 30);
await mk('SHOP-204', '2026-10-13', null);  // no cost yet: not billed, not in the list
await call('/orders/' + A + '/messages', 'POST', { body: 'Hi, any update on this one?' }, client);

// Measured in the page: returns [kind, detail] for each problem.
function audit() {
  const out = [], vw = innerWidth;
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return !e.closest('details:not([open]) > :not(summary)') && r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const name = e => String(e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.className || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
  const layer = e => e.closest('.drawer,[role=dialog],.modal,.dln-panel') || document.body;
  // A sticky / fixed bar (panel footer, phone tab bar) floats over content that scrolls under it: not an overlap.
  const pinned = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'sticky' || p === 'fixed') return x; } return null; };
  const top = [...document.querySelectorAll('.drawer,[role=dialog],.modal')].filter(vis).pop();
  const scope = e => !top || top.contains(e);
  if (document.documentElement.scrollWidth > vw + 1) out.push(['page-scrolls-sideways', document.documentElement.scrollWidth + 'px > ' + vw + 'px']);
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || !scope(e) || e.closest('svg,.table-wrap,[data-scroll-x]')) continue;
    const r = e.getBoundingClientRect(), p = e.parentElement?.getBoundingClientRect();
    if ((r.right > vw + 2 || r.left < -2) && getComputedStyle(e).position !== 'fixed' && p && p.right <= vw + 2 && p.left >= -2) out.push(['sticks-out-of-screen', e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + name(e)]);
  }
  for (const b of document.querySelectorAll('button, .btn')) {
    if (!vis(b) || !scope(b) || b.closest('.status-btns,.chips,.seg,.gtabs,.subtabs,nav,.tabs')) continue;
    const r = b.getBoundingClientRect(), txt = (b.innerText || '').trim();
    if (!txt) continue;
    if (vw >= 1000 && r.width > 380 && txt.length < 40 && !b.closest('.ord-row,.ord-list,.todo,.feed,.po-row,.pay-strip')) out.push(['oversized-button', Math.round(r.width) + 'px wide: ' + name(b)]);
    if (r.height > 60 && txt.length < 40 && !b.closest('.stat,.ord-row,.todo,.feed,.pay-strip,.kpis,.prod-row,.dl-card')) out.push(['too-tall-button', Math.round(r.height) + 'px tall: ' + name(b)]);
    if (b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible') out.push(['button-text-cut-off', name(b)]);
    if (vw < 500 && r.height < 28 && !b.closest('.pay-row,.po-head')) out.push(['small-tap-target', Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + name(b)]);
  }
  // Scrolled out of its box (e.g. under a panel footer) = not on screen.
  const shown = e => { const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; for (let x = e.parentElement; x && x !== document.documentElement; x = x.parentElement) { if (getComputedStyle(x).overflowY === 'visible') continue; const p = x.getBoundingClientRect(); if (cy < p.top || cy > p.bottom || cx < p.left || cx > p.right) return false; } return cy >= 0 && cy <= innerHeight; };
  const ctl = [...document.querySelectorAll('button, .btn, input:not([type=hidden]), select, textarea')].filter(e => vis(e) && scope(e) && shown(e)).map(e => [e, e.getBoundingClientRect()]);
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    const [a, ra] = ctl[i], [b, rb] = ctl[j];
    if (a.contains(b) || b.contains(a) || layer(a) !== layer(b) || pinned(a) !== pinned(b) || (a.closest('label') && a.closest('label') === b.closest('label'))) continue;
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 4 && oy > 4) out.push(['controls-overlap', name(a) + ' / ' + name(b)]);
  }
  // Buttons side by side in one row should line up: same height and same top (Erwin: "misaligned CTAs").
  const rowBtns = new Map();
  for (const b of document.querySelectorAll('.btn')) { if (vis(b) && scope(b) && !b.closest('.chips,.status-btns,.seg,.gtabs,.subtabs')) { const k = b.parentElement; (rowBtns.get(k) || rowBtns.set(k, []).get(k)).push(b); } }
  for (const list of rowBtns.values()) for (let i = 1; i < list.length; i++) {
    const ra = list[i - 1].getBoundingClientRect(), rb = list[i].getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 30) continue; // wrapped onto another line
    if (Math.abs(ra.height - rb.height) > 6 || Math.abs((ra.top + ra.height / 2) - (rb.top + rb.height / 2)) > 4) out.push(['buttons-not-lined-up', name(list[i - 1]) + ' (' + Math.round(ra.height) + 'px) / ' + name(list[i]) + ' (' + Math.round(rb.height) + 'px)']);
  }
  for (const i of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select')) {
    if (!vis(i) || !scope(i)) continue; const h = i.getBoundingClientRect().height;
    if (h < 32 && !i.closest('.po-row,.ord-row')) out.push(['input-too-short', Math.round(h) + 'px: ' + name(i)]);
  }
  if (document.documentElement.dir === 'rtl') {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim(), p = n.parentElement;
      if (!/[A-Za-z]{3,}/.test(t) || /[֐-׿]/.test(t) || !p || !vis(p) || !scope(p)) continue;
      if (p.closest('[data-no-i18n],script,style,code,.brand,[dir=ltr],.ltr,bdi,a[href^=http],time,input,textarea')) continue;
      if (/^(Etsy|Shopify|Amazon|eBay|TikTok Shop|Website|Other|USD|EUR|ILS|Excel|PDF|JPG|PNG|WebP|MB|Direct Line|SKU|IOSS|Local Client|localclient|Sample.*|SHOP-\d+|Track|WhatsApp|Yanwen|China Post|example\.com.*|@\w+|SWIFT\/BIC|Local)$/i.test(t) || /\d/.test(t) && /\n/.test(t)) continue;
      out.push(['english-in-hebrew', t.slice(0, 60)]);
    }
  }
  if (document.documentElement.dir === 'rtl') for (const e of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
    if (!vis(e) || !scope(e) || e.closest('[data-no-i18n]')) continue;
    for (const at of ['placeholder', 'title', 'aria-label']) { const t = (e.getAttribute(at) || '').trim(); if (/[A-Za-z]{3,}/.test(t) && !/[֐-׿]/.test(t) && !/^(https?:|e\.g\. LX|\d|example\.com|Etsy|SKU|IOSS)/i.test(t)) out.push(['english-in-hebrew', at + ': ' + t.slice(0, 50)]); }
  }
  return [...new Map(out.map(x => [x.join('|'), x])).values()];
}

const found = [];
const report = (tag, screen, list) => { for (const [k, d] of list) found.push({ tag, screen, kind: k, detail: d }); };
const shot = (page, tag, screen) => page.screenshot({ path: path.join(out, `${tag}-${screen}.png`) });
try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    // ---- admin ----
    let ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-tab=overview]');
    const settle = () => page.waitForTimeout(450);
    for (const tab of ['overview', 'orders', 'clients', 'claims', 'products', 'settings']) {
      await ui.locator(`[data-tab=${tab}]`).click(); await settle(); report(tag, 'admin-' + tab, await ui.evaluate(audit)); await shot(page, tag, 'admin-' + tab);
    }
    await ui.locator('[data-tab=orders]').click(); await ui.locator('[data-filter=all]').click(); await settle();
    await ui.locator('[data-open-order]').first().click(); await ui.waitForSelector('.drawer'); await settle();
    report(tag, 'admin-order-panel', await ui.evaluate(audit)); await shot(page, tag, 'admin-order-panel');
    await page.keyboard.press('Escape'); await settle();
    await ui.locator('[data-tab=clients]').click(); await settle(); await ui.locator(`[data-open-client="${id}"]`).first().click(); await ui.waitForSelector('.gtabs'); await settle();
    for (const [screen, n, s] of [['client-orders', 0], ['client-stores', 1, 'stores'], ['client-products', 1, 'products'], ['client-payments', 2, 'payments'], ['client-prices', 2, 'prices'], ['client-account', 3, 'account'], ['client-activity', 3, 'activity']]) {
      await ui.locator('.gtabs button').nth(n).click(); await settle(); if (s) { await ui.locator(`.subtabs [data-ctab=${s}]`).click(); await page.waitForTimeout(700); }
      report(tag, 'admin-' + screen, await ui.evaluate(audit)); await shot(page, tag, 'admin-' + screen);
    }
    await page.keyboard.press('Escape'); await settle();
    await ui.locator('[data-new-order]').first().click(); await settle(); report(tag, 'admin-new-order', await ui.evaluate(audit)); await shot(page, tag, 'admin-new-order');
    if (errors.length) report(tag, 'admin', errors.map(e => ['script-error', e]));
    await ctx.close();
    // ---- client portal ----
    ctx = await session(client, width); page = await ctx.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.reload(); await page.waitForSelector('#view');
    for (const r of ['home', 'orders', 'new', 'messages', 'payments', 'stores', 'products', 'terms']) {
      await page.goto(`${base}/portal/?lang=${lang}#/${r}`); await page.waitForTimeout(700);
      report(tag, 'portal-' + r, await page.evaluate(audit)); await shot(page, tag, 'portal-' + r);
    }
    await page.goto(`${base}/portal/?lang=${lang}#/orders`); await page.waitForTimeout(500);
    await page.locator('[data-open-order]').first().click(); await page.waitForTimeout(700);
    report(tag, 'portal-order-panel', await page.evaluate(audit)); await shot(page, tag, 'portal-order-panel');
    if (errors.length) report(tag, 'portal', errors.map(e => ['script-error', e]));
    await ctx.close();
    console.log('audited', tag);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }

const { writeFile } = await import('node:fs/promises');
await writeFile(path.join(out, 'findings.json'), JSON.stringify(found, null, 1));
const byKind = {};
for (const f of found) { const m = (byKind[f.kind] ||= new Map()); m.set(f.detail, [...(m.get(f.detail) || []), `${f.tag} ${f.screen}`]); }
for (const [k, m] of Object.entries(byKind)) { console.log(`\n== ${k} (${m.size})`); for (const [d, w] of m) console.log(`  ${d}  <- ${[...new Set(w)].slice(0, 4).join(', ')}${w.length > 4 ? ` +${w.length - 4}` : ''}`); }
if (!process.env.AUDIT_REPORT) assert.equal(found.length, 0, `${found.length} UI problems (see above and ${path.join(out, 'findings.json')})`);
console.log('PASS no UI problems found');
