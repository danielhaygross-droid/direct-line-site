// Check: the four admin cards (Erwin, 23 Oct + 4-5 Nov 2026). Shown on Clients overview only. A click opens a details
// window (every total in it adds up) with one smart button that never repeats another card's or a "Needs your attention" row.
// "Not paid yet" = what clients owe now.
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
    assert.equal(await ui.locator('[data-kpis] button[data-kpi-card][aria-haspopup=dialog]').count(), 4, tag + ': four cards, each opens its window');
    const card = n => ui.locator('[data-kpis] [data-kpi-card]').nth(n), notPaid = card(2);
    // The card shows what the client owes now: B and C, minus the $5 not linked to an order.
    assert.equal(await notPaid.locator('strong').innerText(), usd(pb + pc - 5), tag + ': B + C owed, minus the unlinked $5');
    if (lang === 'en') {
      assert.match(await notPaid.innerText(), /2 orders · 1 client · oldest 9 Oct 2026/, tag);
      assert.match(await notPaid.innerText(), new RegExp(`Unpaid orders \\${usd(pb + pc)} − credit and earlier payments \\$5\\.00`), tag + ': the difference explained');
      const fee = Number((await DB.prepare('SELECT commission FROM client_orders WHERE id=?').bind(a.id).first()).commission), n = 4;
      const earn = await card(3).innerText();
      assert.ok(earn.includes(usd(fee * n)) && earn.includes(`${usd(fee)} collected · ${usd(fee * (n - 2))} not paid yet · ${usd(fee)} not billed yet · 4 orders`), tag + ': earnings split, the parts add up ' + earn);
      // Not paid yet card: what is owed now = without our fee + our fee on the unpaid orders (2 Nov 2026 fix: not the total before credit).
      assert.ok((await notPaid.innerText()).includes(`Without our fee ${usd(pb + pc - 5 - fee * 2)} · our fee ${usd(fee * 2)}`), tag + ': without our fee adds up to what is owed');
      assert.match(await card(1).innerText(), /4 not shipped yet/, tag + ': the jobs are in Needs your attention, not on the card');
    } else {
      assert.match(await notPaid.innerText(), /עוד לא שולם/, tag);
      assert.match(await notPaid.innerText(), /2 הזמנות · לקוח אחד · הישנה ביותר/, tag);
      assert.match(await notPaid.innerText(), /זיכוי ותשלומים קודמים/, tag);
      assert.match(await card(3).innerText(), /נגבו \$[\d,.]+ · עוד לא שולמו \$[\d,.]+/, tag + ': earnings split in Hebrew, word then amount');
      // Right to left: each part sits to the left of the one before it, and its amount stays inside the part.
      const parts = await card(3).locator('em > span').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent, right: r.right, top: r.top }; }));
      for (let i = 1; i < parts.length; i++) assert.ok(parts[i].top > parts[i - 1].top + 2 || parts[i].right <= parts[i - 1].right, tag + ': RTL order ' + JSON.stringify(parts));
    }
    // Red only for late money (5 Nov 2026): an unpaid order older than 14 days (B is from 9 Oct 2026).
    const lateNow = Math.floor((Date.now() - Date.parse('2026-10-09T12:00:00Z')) / 864e5) > 14;
    assert.equal(await notPaid.evaluate(el => el.classList.contains('late')), lateNow, tag + ': red only when late');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tag + ': no sideways scroll');
    await page.screenshot({ path: path.join(out, `${tag}-cards.png`) });
    // Details window + one smart button per card (Erwin, 5 Nov 2026).
    const cardBtn = k => ui.locator(`[data-kpi-card="${k}"]`), win = ui.locator('[data-kpi-win]');
    // Every block with a total adds up: the rows above it, with their + / − signs, make the total.
    const addsUp = () => ui.evaluate(() => {
      const num = t => Number(String(t).replace(/[^0-9.-]/g, '')) || 0, bad = [];
      for (const b of document.querySelectorAll('[data-kpi-win] .kw-block')) {
        const tot = b.querySelector('.kw-row.tot'); if (!tot) continue;
        const rows = [...b.querySelectorAll('.kw-row:not(.tot)')];
        const sum = rows.reduce((n, r) => n + (r.querySelector('.kw-op')?.textContent.trim() === '−' ? -1 : 1) * num(r.querySelector(':scope > b')?.textContent), 0);
        if (Math.abs(sum - num(tot.querySelector(':scope > b').textContent)) > 0.005) bad.push(`${b.querySelector('h4')?.textContent || 'block'}: ${sum} vs ${tot.textContent}`);
      }
      return bad;
    });
    const blockSum = title => ui.evaluate(t => { const b = [...document.querySelectorAll('[data-kpi-win] .kw-block')].find(x => x.querySelector('h4')?.textContent === t); return b ? [...b.querySelectorAll('.kw-row > b')].reduce((n, e) => n + (Number(e.textContent.replace(/[^0-9.-]/g, '')) || 0), 0) : null; }, title);
    const todoAttrs = await ui.locator('.todo').evaluateAll(els => els.map(e => e.getAttribute('data-go-filter') || e.getAttribute('data-go-tab')));
    const mains = {};
    for (const k of ['unpaid', 'orders', 'earnings', 'clients']) {
      await cardBtn(k).click(); await win.waitFor();
      assert.equal(await cardBtn(k).getAttribute('aria-expanded'), 'true', `${tag} ${k}: expanded`);
      assert.deepEqual(await addsUp(), [], `${tag} ${k}: every total adds up`);
      // Clients: one row per client counted on the card.
      if (k === 'clients') assert.equal(String(await win.locator('.kw-item').count()), await cardBtn(k).locator('strong').innerText(), `${tag}: one row per client on the card`);
      const box = await win.boundingBox(), vw = await ui.evaluate(() => innerWidth);
      assert.ok(box.x >= 0 && box.x + box.width <= vw + 1, `${tag} ${k}: window inside the page`);
      // Desktop: lined up with its card's start edge (right edge in Hebrew). Phone: under all four cards, covering none.
      const cb = await cardBtn(k).boundingBox(), grid = await ui.locator('[data-kpis]').boundingBox();
      // (or pushed back inside the cards' edge when it would stick out)
      const near = (x, y) => Math.abs(x - y) < 2, end = v => v.x + v.width;
      if (width >= 640) assert.ok(lang === 'he' ? near(end(box), end(cb)) || near(box.x, grid.x) : near(box.x, cb.x) || near(end(box), end(grid)), `${tag} ${k}: lined up with its card ${JSON.stringify([cb, box])}`);
      else assert.ok(box.y >= grid.y + grid.height, `${tag} ${k}: under all the cards on a phone`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${tag} ${k}: no sideways scroll`);
      const go = win.locator('.kw-go');
      mains[k] = await go.count() ? await go.evaluate(b => ['data-go-filter', 'data-go-tab', 'data-open-client', 'data-card-pay', 'data-card-scroll'].map(a => b.hasAttribute(a) ? a + '=' + b.getAttribute(a) : '').join('')) : null;
      await page.waitForTimeout(250); await page.screenshot({ path: path.join(out, `${tag}-win-${k}.png`) });
      await page.keyboard.press('Escape'); await win.waitFor({ state: 'detached' });
      assert.equal(await ui.evaluate(k => document.activeElement?.dataset.kpiCard, k), k, `${tag} ${k}: Esc closes and gives focus back to the card`);
    }
    // Not paid yet: the client list and the "how long unpaid" list add up to the card and to "Unpaid orders".
    await cardBtn('unpaid').click(); await win.waitFor();
    const owedNow = Number((await notPaid.locator('strong').innerText()).replace(/[^0-9.]/g, ''));
    assert.equal(Math.round(await blockSum(lang === 'en' ? 'By client' : 'לפי לקוח') * 100), Math.round(owedNow * 100), tag + ': clients add up to the card');
    assert.equal(Math.round(await blockSum(lang === 'en' ? 'How long unpaid (before credit)' : 'כמה זמן לא שולם (לפני זיכוי)') * 100), Math.round((pb + pc) * 100), tag + ': ages add up to the unpaid orders');
    // The four main buttons go to four different places, and none repeats a job of "Needs your attention".
    const picked = Object.values(mains).filter(Boolean);
    assert.equal(new Set(picked).size, picked.length, tag + ': four different buttons ' + JSON.stringify(mains));
    for (const m of picked) assert.ok(!todoAttrs.some(a => a && m.endsWith('="' + a + '"') && /data-go-(filter|tab)/.test(m)), `${tag}: ${m} repeats a to-do row ${JSON.stringify(todoAttrs)}`);
    assert.deepEqual(mains, { unpaid: `data-card-pay=${id}`, orders: 'data-go-filter=all', earnings: 'data-go-filter=unpaid', clients: 'data-go-tab=clients' }, tag + ': the rule picks these');
    assert.match(await win.locator('.kw-go').innerText(), lang === 'en' ? /^Record payment from\s*\S/ : /^רישום תשלום מאת\s*\S/, tag);
    // A click outside closes it.
    await ui.locator('.adm-head h1').click(); await win.waitFor({ state: 'detached' });
    // "Record payment from …" opens that client's Payments with the payment form.
    await cardBtn('unpaid').click(); await win.locator('.kw-go').click();
    await ui.waitForSelector('[data-pay-form]', { state: 'visible' });
    assert.equal(await win.count(), 0, tag + ': window closed');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // "See all orders" opens Client orders on All.
    await ui.evaluate(() => document.querySelector('[data-drawer-close], .drawer [data-close]')?.click());
    await ui.locator('[data-tab="overview"]').click(); await ui.waitForSelector('[data-kpis] .stat', { state: 'visible' });
    await cardBtn('orders').click(); await win.locator('.kw-go').click();
    await ui.waitForFunction(() => document.querySelector('[data-tab="orders"]')?.classList.contains('on'));
    assert.equal(await ui.locator('[data-chips] .chip.on').getAttribute('data-filter'), 'all', tag + ': See all orders → All');
    await ui.locator('[data-tab="overview"]').click(); await ui.waitForSelector('[data-kpis] .stat', { state: 'visible' });
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
  const notPaid = ui.locator('[data-kpis] [data-kpi-card]').nth(2);
  assert.equal(await notPaid.locator('strong').innerText(), '$0.00');
  assert.match(await notPaid.innerText(), /Every billed order is paid/);
  assert.ok(!(await notPaid.evaluate(el => el.classList.contains('owe'))));
  await notPaid.click(); await ui.locator('[data-kpi-win]').waitFor();
  assert.match(await ui.locator('[data-kpi-win]').innerText(), /Every billed order is paid/);
  assert.equal(await ui.locator('[data-kpi-win] .kw-go').count(), 0, 'nothing to do: no button');
  // A new unpaid order from today: owed, but not late, so not red; Clients & payments opens sorted by who owes.
  const today = new Date().toISOString().slice(0, 10), e = await mk('CARD-E', today, 15);
  await page.reload(); const ui2 = page.frame({ name: 'admin' }); await ui2.waitForSelector('[data-kpis] .stat');
  const np2 = ui2.locator('[data-kpi-card="unpaid"]');
  assert.ok(await np2.evaluate(el => el.classList.contains('owe') && !el.classList.contains('late')), 'owed but not late');
  await ui2.locator('[data-tab=clients]').click(); await ui2.waitForSelector('[data-list] tbody tr');
  assert.equal(await ui2.locator('[data-list] td[data-label=Outstanding].neg').count(), 0, 'a client with no late order is not red');
  console.log('PASS owed but not late: not red');
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
        const out = { scroll: document.documentElement.scrollWidth > innerWidth, spill: [], wrapped: [], colors: [], wide: [] };
        // Nothing on the page is wider than the header (a wide table scrolls inside its own box), whatever the fonts.
        const edge = document.querySelector('.adm-head').getBoundingClientRect().right + 1;
        for (const el of document.querySelectorAll('[data-tab-body] *')) if (!el.closest('.table-wrap > *') && el.getBoundingClientRect().right > edge) { out.wide.push(el.className || el.tagName); if (out.wide.length > 3) break; }
        const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; const bi = getComputedStyle(e).backgroundImage; if (bi && bi !== 'none') return null; } return getComputedStyle(document.body).backgroundColor; };
        for (const card of document.querySelectorAll('[data-kpis] .stat')) {
          if (card.scrollWidth > card.clientWidth + 1) out.spill.push(card.querySelector('small')?.textContent);
          const big = card.querySelector('strong'); if (big && big.getClientRects().length > 1 || big.offsetHeight > parseFloat(getComputedStyle(big).lineHeight || 40) * 1.5) out.wrapped.push(big.textContent);
          for (const el of card.querySelectorAll('small, em')) { const bg = card.classList.contains('hero') ? 'rgb(17, 27, 39)' : bgOf(el); if (bg && el.textContent.trim()) out.colors.push([el.textContent.trim().slice(0, 40), getComputedStyle(el).color, bg]); }
        }
        return out;
      });
      assert.equal(r.scroll, false, tag + ': no sideways scroll'); assert.deepEqual(r.spill, [], tag + ': nothing spills out of a card'); assert.deepEqual(r.wide, [], tag + ': nothing wider than the page'); assert.deepEqual(r.wrapped, [], tag + ': amounts on one line');
      for (const [t, fg, bg] of r.colors) assert.ok(contrast(fg, bg) >= 4.5, `${tag}: "${t}" contrast ${contrast(fg, bg).toFixed(2)} (${fg} on ${bg})`);
      if ([320, 768].includes(width)) await pg2.screenshot({ path: path.join(out, `${tag}-cards.png`) });
      // The Not paid yet window: inside the page, nothing spills, text contrast at least 4.5:1.
      await f.locator('[data-kpi-card="unpaid"]').click(); await f.locator('[data-kpi-win]').waitFor();
      const w = await f.evaluate(() => { const win = document.querySelector('[data-kpi-win]'), r = win.getBoundingClientRect(), bg = getComputedStyle(win).backgroundColor, colors = [];
        for (const el of win.querySelectorAll('h3, h4, .kw-l span, .kw-l small, .kw-l b, .kw-row > b, .kw-more, .kw-note')) if (el.textContent.trim() && !el.closest('.btn')) colors.push([el.textContent.trim().slice(0, 30), getComputedStyle(el).color, bg]);
        return { inside: r.left >= 0 && r.right <= innerWidth + 1, scroll: document.documentElement.scrollWidth > innerWidth, spill: win.scrollWidth > win.clientWidth + 1, colors }; });
      assert.ok(w.inside, tag + ': window inside the page'); assert.equal(w.scroll, false, tag + ': no sideways scroll with the window'); assert.equal(w.spill, false, tag + ': nothing spills out of the window');
      for (const [t, fg, bg] of w.colors) assert.ok(contrast(fg, bg) >= 4.5, `${tag} window: "${t}" contrast ${contrast(fg, bg).toFixed(2)} (${fg} on ${bg})`);
      if ([375, 1440].includes(width)) { await pg2.waitForTimeout(250); await pg2.screenshot({ path: path.join(out, `${tag}-win.png`) }); }
      await ctx2.close();
    }
    console.log('PASS 320-1440 px, EN + HE, light + dark: no scroll, no spill, amounts on one line, contrast 4.5:1');
  }

} finally { await browser.close(); await new Promise(r => server.close(r)); await pg.close(); }
