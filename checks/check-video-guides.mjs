// Client portal video guides (Erwin + Daniel, 26 Nov 2026): a "Video guides" page (#/guides) with the 7 guides in the
// portal's language, and a "Watch the tour" card on Home that the client can close for good.
// Checks: the nav item, 7 videos with the right language files (which exist in dist/p/guides), nothing loads before
// play, no sideways scroll, the Home card and its close button (stays closed after a reload). EN + HE, 1440 + 390.
//   node checks/check-video-guides.mjs   (run from the repo root)
// Real SQL on in-memory Postgres (PGlite) + the real screens in Chrome. No live data.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DB, env, seed } from './lib.mjs';
import { route } from '../api/index.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'video-guides');
await mkdir(out, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.png': 'image/png' };
const served = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const resp = await route(new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) }), { db: DB, env });
      res.writeHead(resp.status, Object.fromEntries(resp.headers)); res.end(Buffer.from(await resp.arrayBuffer())); return;
    }
    const file = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    if (file.startsWith('/p/guides/')) served.push(file);
    const data = await readFile(path.join(root, file));
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'" });
    res.end(data);
  } catch (e) { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });

// Every guide file is in the repo, in both languages, and small enough to stream (720p).
for (const L of ['en', 'he']) for (let n = 0; n < 7; n++) {
  const name = `${L}-0${n}`;
  const mp4 = await stat(path.join(root, 'p/guides', name + '.mp4')), poster = await stat(path.join(root, 'p/guides', name + '.webp'));
  assert.ok(mp4.size > 200e3 && mp4.size < 12e6, `${name}.mp4 size ${mp4.size}`); assert.ok(poster.size > 3e3 && poster.size < 300e3, `${name}.webp size ${poster.size}`);
}

const { client } = await seed();
for (const lang of ['en', 'he']) for (const w of [1440, 390]) {
  served.length = 0;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: client.split('=')[0], value: decodeURIComponent(client.split('=').slice(1).join('=')), url: base, httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  // Home: the tour card, with a link to the guides page.
  await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.waitForSelector('[data-home-hello]');
  const card = page.locator('[data-guide-home]');
  await card.waitFor(); assert.match(await card.innerText(), lang === 'he' ? /חדשים כאן\? צפו בסיור של 2 דקות/ : /New here\? Watch the 2-minute tour/);
  assert.equal(await card.locator('a[href="#/guides"]').count(), 2, 'two links to the guides page');
  await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: path.join(out, `home-card-${lang}-${w}.png`) });
  const cb = await card.locator('[data-guide-home-close]').boundingBox(); assert.ok(cb.width >= (w < 600 ? 44 : 36), 'close button big enough to tap');
  // The menu has the new item; the guides page has 7 videos in this language, none loaded yet.
  if (w < 600) await page.locator('.menu-button, [data-menu], .burger').first().click().catch(() => {});
  assert.equal(await page.locator('[data-nav="guides"]').count(), 1, 'nav item');
  await page.goto(`${base}/portal/?lang=${lang}#/guides`); await page.waitForSelector('[data-guides] [data-guide-play]');
  const v = await page.evaluate(() => ({ n: document.querySelectorAll('[data-guides] [data-guide-play]').length, srcs: [...document.querySelectorAll('[data-guides] [data-guide-play]')].map(x => x.dataset.guidePlay), posters: [...document.querySelectorAll('[data-guides] [data-guide-play] img')].map(x => x.getAttribute('src')), videos: document.querySelectorAll('[data-guides] video').length, sideways: document.documentElement.scrollWidth > innerWidth + 1, h3: [...document.querySelectorAll('[data-guides] h3')].map(h => h.innerText) }));
  assert.equal(v.n, 7); assert.equal(v.videos, 0, 'no video element before play'); assert.ok(!v.sideways, 'no sideways scroll');
  v.srcs.forEach((s, i) => { assert.equal(s, `/p/guides/${lang}-0${i}.mp4`); assert.equal(v.posters[i], `/p/guides/${lang}-0${i}.webp`); });
  if (lang === 'he') assert.equal(v.h3[0], 'סיור בפורטל'); else assert.equal(v.h3[0], 'Portal tour');
  await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `guides-${lang}-${w}.png`), fullPage: w < 600 });
  assert.ok(!served.some(f => f.endsWith('.mp4')), 'no video downloaded before play');
  // Clicking a cover swaps in the player with that guide (the test browser can't decode H.264, so only the swap is checked).
  await page.locator('[data-guide-play]').nth(1).click();
  assert.equal(await page.locator('[data-guide="01"] video').getAttribute('src'), `/p/guides/${lang}-01.mp4`);
  assert.equal(await page.locator('[data-guides] video[controls]').count(), 1, 'one player');
  // Closing the Home card keeps it closed.
  await page.goto(`${base}/portal/?lang=${lang}#/home`); await page.locator('[data-guide-home-close]').click();
  assert.equal(await page.locator('[data-guide-home]').count(), 0, 'card closed');
  await page.reload(); await page.waitForSelector('[data-home-hello]'); await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-guide-home]').count(), 0, 'card stays closed after reload');
  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}
await browser.close(); server.close();
console.log('video guides check passed; screenshots in', out);
