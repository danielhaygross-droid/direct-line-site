// The admin dashboard and the client portal are written as one file per screen in src/admin and src/portal.
// The browser still loads one file each (dist/admin/admin.js, dist/portal/portal.js): this script joins the
// screen files in name order, byte for byte (no bundler, no rewriting).
//   node scripts/build-screens.mjs           write dist/admin/admin.js and dist/portal/portal.js
//   node scripts/build-screens.mjs --check   exit 1 if a dist file is not the join of its screen files
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCREENS = [['src/admin', 'dist/admin/admin.js'], ['src/portal', 'dist/portal/portal.js']];

export async function joined(dir) {
  const names = (await readdir(path.join(root, dir))).filter(n => /^\d\d-[a-z0-9-]+\.js$/.test(n)).sort();
  return Buffer.concat(await Promise.all(names.map(n => readFile(path.join(root, dir, n)))));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [dir, out] of SCREENS) {
    const want = await joined(dir), file = path.join(root, out);
    if (check) {
      const have = await readFile(file).catch(() => Buffer.alloc(0));
      if (!have.equals(want)) { stale++; console.error(`${out} is not built from ${dir}/: run  node scripts/build-screens.mjs`); }
    } else await writeFile(file, want);
  }
  if (stale) process.exit(1);
  console.log(check ? 'Screens are built.' : 'Built ' + SCREENS.map(s => s[1]).join(', '));
}
