// Runs the behaviour checks in checks/ (real database code on an in-memory Postgres, fake Google Sheet, real screens in
// Chrome), each in its own process, and prints a summary. Exit code 1 if one fails.
//   node scripts/run-checks.mjs              all checks
//   node scripts/run-checks.mjs --api        only the ones without a browser
//   node scripts/run-checks.mjs --ui         only the browser ones
//   node scripts/run-checks.mjs my-products  only checks whose name contains "my-products"
//   --group=2/4    only the 2nd of 4 groups, balanced by run time (scripts/check-times.json); GitHub runs 4 groups side by side
//   --parallel=3   run 3 checks at the same time (each has its own database, server and browser)
// Browser checks use Chrome from CHROME_PATH, else playwright-core's own Chromium (npx playwright-core install chromium).
import { readdir, readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dir = path.join(root, 'checks');
const args = process.argv.slice(2), only = args.filter(a => !a.startsWith('--'));
const flag = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const LOCAL_CHROME = 'C:/Users/erwin/AppData/Local/ms-playwright/chromium-1194/chrome-win/chrome.exe';
const env = { ...process.env };
if (!env.CHROME_PATH && await access(LOCAL_CHROME).then(() => true, () => false)) env.CHROME_PATH = LOCAL_CHROME;

const all = (await readdir(dir)).filter(n => /^check-[a-z0-9-]+\.mjs$/.test(n)).sort();
let picked = [];
for (const name of all) {
  const ui = (await readFile(path.join(dir, name), 'utf8')).includes('chromium');
  if (args.includes('--api') && ui) continue;
  if (args.includes('--ui') && !ui) continue;
  if (only.length && !only.some(o => name.includes(o))) continue;
  picked.push(name);
}
// Groups (17 Nov 2026: one PR's checks took ~25 minutes in one line): longest first, each into the group with the least
// time so far, so the groups finish together. A check without a recorded time counts 30 seconds.
const group = flag('group');
if (group) {
  const [g, n] = group.split('/').map(Number);
  const times = JSON.parse(await readFile(path.join(root, 'scripts', 'check-times.json'), 'utf8').catch(() => '{}'));
  const bins = Array.from({ length: n }, () => ({ secs: 0, names: [] }));
  for (const name of [...picked].sort((a, b) => (times[b] ?? 30) - (times[a] ?? 30) || a.localeCompare(b))) {
    const bin = bins.reduce((m, x) => (x.secs < m.secs ? x : m)); bin.secs += times[name] ?? 30; bin.names.push(name);
  }
  picked = bins[g - 1].names.sort();
  console.log(`Group ${g} of ${n}: ${picked.length} checks, about ${Math.round(bins[g - 1].secs / 60)} minutes`);
}
const run = name => new Promise(resolve => {
  const started = Date.now(), child = spawn(process.execPath, [path.join(dir, name)], { cwd: root, env });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const timer = setTimeout(() => { out += '\nTimed out after 6 minutes'; child.kill(); }, 6 * 60 * 1000);
  child.on('close', code => { clearTimeout(timer); resolve({ name, ok: code === 0, out, secs: Math.round((Date.now() - started) / 1000) }); });
});
const failed = [], width = Math.max(1, Number(flag('parallel')) || 1), queue = [...picked];
const report = r => {
  const passes = (r.out.match(/^PASS/gm) || []).length;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} (${passes} PASS lines, ${r.secs}s)`);
  if (!r.ok) { failed.push(r.name); console.log(r.out.split('\n').filter(l => /Error|assert|actual|expected|waiting for|\.mjs:\d+/.test(l)).slice(0, 12).join('\n')); }
};
await Promise.all(Array.from({ length: width }, async () => { while (queue.length) report(await run(queue.shift())); }));
console.log(`\n${picked.length - failed.length} of ${picked.length} checks passed${failed.length ? '; failed: ' + failed.join(', ') : ''}.`);
process.exit(failed.length ? 1 : 0);
