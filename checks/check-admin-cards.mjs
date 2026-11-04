// Check: the four admin cards (Erwin, 23 Oct + 4 Nov 2026). Shown on Clients overview only, numbers only (no buttons: the
// same links are the Orders chips and the Overview's "Needs your attention"). "Not paid yet" = what clients owe now.
//   node checks/check-admin-cards.mjs      (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real admin screens in Chrome. No live data.
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
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'admin-cards');
await mkdir(out, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/test-admin.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=light><body style=margin:0><iframe name=admin src="/admin/?lang=${url.searchParams.get('lang') || 'en'}" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
    if (url.pathname === '/test-control.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html data-theme=light><body style=margin:0><nav><button class="nav-item" data-client-tab="claims">Claims</button></nav><iframe name=admin src="/admin/?lang=en" style="width:100%;height:100vh;border:0"></iframe></body></html>`); return; }
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
const session = async (cookie, width) => { const ctx = await browser.newContext({ viewport: { width, height: 950 } }); await ctx.addCookies([{ name: 'dl_session', value: decodeURIComponent(cookie.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]); return ctx; };

const { admin, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const mk = async (ref, date, cost) => {
  const o = ok(await call('/orders', 'POST', { clientId: id, orderRef: ref, orderDate: date, buyerName: 'Sample', destination: 'US', address1: '1 Sample St', etsyUrl: 'https://example.com/i' }, admin)).order;
  if (cost) ok(await call('/orders/' + o.id, 'PUT', { productCost: cost, shippingFee: 0 }, admin));
  return o;
};
// Three priced orders (each billed cost + the $2 fee) and one without a cost yet.
const a = await mk('CARD-A', '2026-10-05', 20), b = await mk('CARD-B', '2026-10-09', 30), c = await mk('CARD-C', '2026-10-12', 10);
await mk('CARD-D', '2026-10-14', 0);
const price = async o => Number((await DB.prepare('SELECT price FROM client_orders WHERE id=?').bind(o.id).first()).price);
const [pa, pb, pc] = [await price(a), await price(b), await price(c)];
// A is paid with its payment linked; a second $5 payment is not linked to any order.
ok(await call('/admin/payments', 'POST', { clientId: id, amount: pa, paidAt: '2026-10-20', method: 'Bank transfer', orderIds: [a.id] }, admin));
ok(await call('/admin/payments', 'POST', { clientId: id, amount: 5, paidAt: '2026-10-21', method: 'Bank transfer' }, admin));
const usd = n => '$' + n.toFixed(2);

try {
  for (const lang of ['en', 'he']) for (const width of [1440, 390]) {
    const tag = `${lang}-${width}`;
    const ctx = await session(admin, width), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/test-admin.html?lang=${lang}`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-kpis] .stat');
    assert.equal(await ui.locator('[data-tab="overview"]').getAttribute('aria-selected'), 'true', tag + ': starts on Overview');
    assert.equal(await ui.locator('[data-kpis] .stat-plain').count(), 4, tag + ': four cards');
    assert.equal(await ui.locator('[data-kpis] button, [data-kpis] .stat-go').count(), 0, tag + ': numbers only, no buttons');
    const card = n => ui.locator('[data-kpis] .stat-plain').nth(n), notPaid = card(2);
    // The card shows what the client owes now: B and C, minus the $5 not linked to an order.
    assert.equal(await notPaid.locator('strong').innerText(), usd(pb + pc - 5), tag + ': B + C owed, minus the unlinked $5');
    if (lang === 'en') {
      assert.match(await notPaid.innerText(), /2 orders · 1 client · oldest 9 Oct 2026/, tag);
      assert.match(await notPaid.innerText(), new RegExp(`Unpaid orders \\${usd(pb + pc)} − credit and earlier payments \\$5\\.00`), tag + ': the difference explained');
      const fee = Number((await DB.prepare('SELECT commission FROM client_orders WHERE id=?').bind(a.id).first()).commission), n = 4;
      const earn = await card(3).innerText();
      assert.ok(earn.includes(usd(fee * n)) && earn.includes(`${usd(fee)} collected · ${usd(fee * (n - 1))} not paid yet · 4 orders`), tag + ': earnings split ' + earn);
      assert.match(await card(1).innerText(), /4 waiting to be processed · 1 need cost/, tag);
    } else {
      assert.match(await notPaid.innerText(), /עוד לא שולם/, tag);
      assert.match(await notPaid.innerText(), /2 הזמנות · לקוח אחד · הישנה ביותר/, tag);
      assert.match(await notPaid.innerText(), /זיכוי ותשלומים קודמים/, tag);
      assert.match(await card(3).innerText(), /נגבו \$[\d,.]+ · עוד לא שולמו \$[\d,.]+/, tag + ': earnings split in Hebrew, word then amount');
      // Right to left: each part sits to the left of the one before it, and its amount stays inside the part.
      const parts = await card(3).locator('em > span').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent, right: r.right, top: r.top }; }));
      for (let i = 1; i < parts.length; i++) assert.ok(parts[i].top > parts[i - 1].top + 2 || parts[i].right <= parts[i - 1].right, tag + ': RTL order ' + JSON.stringify(parts));
    }
    assert.ok(await notPaid.evaluate(el => el.classList.contains('owe')), tag + ': red when something is owed');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ': no sideways scroll');
    await page.screenshot({ path: path.join(out, `${tag}-cards.png`) });
    // Every other section: no cards and no month picker.
    for (const tab of ['orders', 'clients', 'claims', 'products', 'settings']) {
      await ui.locator(`[data-tab="${tab}"]`).click(); await ui.waitForFunction(t => document.querySelector(`[data-tab="${t}"]`)?.classList.contains('on'), tab);
      assert.equal(await ui.locator('[data-kpis]').isVisible(), false, `${tag}: no cards on ${tab}`); assert.equal(await ui.locator('.kpi-bar').isVisible(), false, `${tag}: no month picker on ${tab}`);
      if (tab === 'orders') await page.screenshot({ path: path.join(out, `${tag}-orders.png`) });
    }
    await ui.locator('[data-tab="overview"]').click(); await ui.waitForSelector('[data-kpis] .stat', { state: 'visible' });
    assert.deepEqual(errors, [], tag); await ctx.close(); console.log('PASS', tag);
  }
  // Inside the Control page (its sidebar has [data-client-tab]) the sidebar is the navigation: no inner tab bar,
  // and the sidebar can open Claims and Products too. On its own (test-admin.html above) the tabs stay.
  {
    const ctx = await session(admin, 1440), page = await ctx.newPage(); await page.goto(`${base}/test-control.html`);
    const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-kpis] .stat');
    assert.equal(await ui.locator('[data-main-tabs]').isVisible(), false, 'no second row of tabs inside Control');
    assert.equal(await ui.locator('[data-kpis]').isVisible(), true, 'cards on Clients overview');
    for (const tab of ['claims', 'products', 'orders']) { await page.evaluate(t => frames[0].postMessage({ type: 'dl-set-tab', tab: t }, location.origin), tab); await ui.waitForFunction(t => document.querySelector(`[data-tab="${t}"]`)?.classList.contains('on'), tab); assert.equal(await ui.locator('[data-kpis]').isVisible(), false, 'no cards on ' + tab); }
    await ctx.close(); console.log('PASS inside Control: sidebar only, Claims and Products reachable, cards on Clients overview only');
  }
  // Everything paid: the card says so and is no longer red.
  ok(await call('/admin/payments', 'POST', { clientId: id, amount: pb + pc, paidAt: '2026-10-22', method: 'Bank transfer', orderIds: [b.id, c.id] }, admin));
  const ctx = await session(admin, 1440), page = await ctx.newPage();
  await page.goto(`${base}/test-admin.html?lang=en`); const ui = page.frame({ name: 'admin' }); await ui.waitForSelector('[data-kpis] .stat');
  const notPaid = ui.locator('[data-kpis] .stat-plain').nth(2);
  assert.equal(await notPaid.locator('strong').innerText(), '$0.00');
  assert.match(await notPaid.innerText(), /Every billed order is paid/);
  assert.ok(!(await notPaid.evaluate(el => el.classList.contains('owe'))));
  await ctx.close(); console.log('PASS everything paid');
  // UI UX Pro Max (4 Nov 2026): every common width, English + Hebrew, light + dark: no sideways scroll, nothing spills
  // out of a card, amounts on one line, and text contrast at least 4.5:1 (computed from the real colours).
  {
    const contrast = (fg, bg) => { const lum = c => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }; const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
    for (const lang of ['en', 'he']) for (const theme of ['light', 'dark']) for (const width of [320, 375, 414, 768, 1024, 1440]) {
      const tag = `${lang}-${theme}-${width}`, ctx2 = await session(admin, width), pg2 = await ctx2.newPage();
      await pg2.goto(`${base}/test-admin.html?lang=${lang}`); const f = pg2.frame({ name: 'admin' }); await f.waitForSelector('[data-kpis] .stat');
      await f.evaluate(t => { document.documentElement.dataset.theme = t; }, theme); await pg2.waitForTimeout(150);
      const r = await f.evaluate(() => {
        const out = { scroll: document.documentElement.scrollWidth > innerWidth, spill: [], wrapped: [], colors: [] };
        const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; const bi = getComputedStyle(e).backgroundImage; if (bi && bi !== 'none') return null; } return getComputedStyle(document.body).backgroundColor; };
        for (const card of document.querySelectorAll('[data-kpis] .stat')) {
          if (card.scrollWidth > card.clientWidth + 1) out.spill.push(card.querySelector('small')?.textContent);
          const big = card.querySelector('strong'); if (big && big.getClientRects().length > 1 || big.offsetHeight > parseFloat(getComputedStyle(big).lineHeight || 40) * 1.5) out.wrapped.push(big.textContent);
          for (const el of card.querySelectorAll('small, em')) { const bg = card.classList.contains('hero') ? 'rgb(17, 27, 39)' : bgOf(el); if (bg && el.textContent.trim()) out.colors.push([el.textContent.trim().slice(0, 40), getComputedStyle(el).color, bg]); }
        }
        return out;
      });
      assert.equal(r.scroll, false, tag + ': no sideways scroll'); assert.deepEqual(r.spill, [], tag + ': nothing spills out of a card'); assert.deepEqual(r.wrapped, [], tag + ': amounts on one line');
      for (const [t, fg, bg] of r.colors) assert.ok(contrast(fg, bg) >= 4.5, `${tag}: "${t}" contrast ${contrast(fg, bg).toFixed(2)} (${fg} on ${bg})`);
      if ([320, 768].includes(width)) await pg2.screenshot({ path: path.join(out, `${tag}-cards.png`) });
      await ctx2.close();
    }
    console.log('PASS 320-1440 px, EN + HE, light + dark: no scroll, no spill, amounts on one line, contrast 4.5:1');
  }

} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
