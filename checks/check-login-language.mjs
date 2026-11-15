// Check: the sign-in page has a language switch (Erwin, 16 Nov 2026: "put change language at the login page").
// Hebrew page -> "English" opens /en/; English page -> "עברית" opens /. Runs: node checks/check-login-language.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'login-language');
await mkdir(out, { recursive: true });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
    const file = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const data = await readFile(path.join(root, file));
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }), page = await ctx.newPage();
  await page.goto(base + '/'); await page.waitForSelector('.login-lang');
  assert.equal((await page.locator('.login-lang').innerText()).trim(), 'English');
  await page.screenshot({ path: path.join(out, `he-${width}.png`) });
  await page.locator('.login-lang').click(); await page.waitForURL(base + '/en/');
  assert.equal((await page.locator('.login-lang').innerText()).trim(), 'עברית');
  assert.match(await page.locator('#login-title').innerText(), /Your entire operation/);
  await page.screenshot({ path: path.join(out, `en-${width}.png`) });
  await page.locator('.login-lang').click(); await page.waitForURL(base + '/');
  // The switch does not cover the card's own text.
  const a = await page.locator('.login-lang').boundingBox(), b = await page.locator('.login-copy span').first().boundingBox();
  assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'no overlap at ' + width);
  await ctx.close();
}
console.log('PASS sign-in page: language switch in Hebrew and English, 1440 and 390. Screens:', out);
await browser.close(); server.close();
