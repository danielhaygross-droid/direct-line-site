// Runs the behaviour checks in checks/ (real database code on an in-memory Postgres, fake Google Sheet, real screens in
// Chrome) one by one, each in its own process, and prints a summary. Exit code 1 if one fails.
//   node scripts/run-checks.mjs              all checks
//   node scripts/run-checks.mjs --api        only the ones without a browser
//   node scripts/run-checks.mjs --ui         only the browser ones
//   node scripts/run-checks.mjs my-products  only checks whose name contains "my-products"
// Browser checks use Chrome from CHROME_PATH, else playwright-core's own Chromium (npx playwright-core install chromium).
import { readdir, readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dir = path.join(root, 'checks');
const args = process.argv.slice(2), only = args.filter(a => !a.startsWith('--'));
const LOCAL_CHROME = 'C:/Users/erwin/AppData/Local/ms-playwright/chromium-1194/chrome-win/chrome.exe';
const env = { ...process.env };
if (!env.CHROME_PATH && await access(LOCAL_CHROME).then(() => true, () => false)) env.CHROME_PATH = LOCAL_CHROME;

const all = (await readdir(dir)).filter(n => /^check-[a-z0-9-]+\.mjs$/.test(n)).sort();
const picked = [];
for (const name of all) {
  const ui = (await readFile(path.join(dir, name), 'utf8')).includes('chromium');
  if (args.includes('--api') && ui) continue;
  if (args.includes('--ui') && !ui) continue;
  if (only.length && !only.some(o => name.includes(o))) continue;
  picked.push(name);
}
const run = name => new Promise(resolve => {
  const started = Date.now(), child = spawn(process.execPath, [path.join(dir, name)], { cwd: root, env });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const timer = setTimeout(() => { out += '\nTimed out after 6 minutes'; child.kill(); }, 6 * 60 * 1000);
  child.on('close', code => { clearTimeout(timer); resolve({ name, ok: code === 0, out, secs: Math.round((Date.now() - started) / 1000) }); });
});
const failed = [];
for (const name of picked) {
  const r = await run(name);
  const passes = (r.out.match(/^PASS/gm) || []).length;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name} (${passes} PASS lines, ${r.secs}s)`);
  if (!r.ok) { failed.push(name); console.log(r.out.split('\n').filter(l => /Error|assert|actual|expected|waiting for|\.mjs:\d+/.test(l)).slice(0, 12).join('\n')); }
}
console.log(`\n${picked.length - failed.length} of ${picked.length} checks passed${failed.length ? '; failed: ' + failed.join(', ') : ''}.`);
process.exit(failed.length ? 1 : 0);
