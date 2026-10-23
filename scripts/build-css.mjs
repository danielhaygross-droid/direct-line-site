// Builds the Tailwind file dist/p/tw.css from src/tw.css and the screen files (src/portal/*.js).
//   node scripts/build-css.mjs           write dist/p/tw.css
//   node scripts/build-css.mjs --check   exit 1 if dist/p/tw.css is not what the screens need (line endings ignored)
import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'dist/p/tw.css';
const cli = path.join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs');
const build = file => promisify(execFile)(process.execPath, [cli, '-i', path.join(root, 'src/tw.css'), '-o', file, '--minify'], { cwd: root });
const text = async file => (await readFile(file, 'utf8').catch(() => '')).replace(/\r\n/g, '\n').trim();

if (process.argv.includes('--check')) {
  const dir = await mkdtemp(path.join(tmpdir(), 'dl-tw-'));
  try {
    await build(path.join(dir, 'tw.css'));
    if (await text(path.join(dir, 'tw.css')) !== await text(path.join(root, OUT))) { console.error(`${OUT} is not built from src/: run  node scripts/build-css.mjs`); process.exit(1); }
  } finally { await rm(dir, { recursive: true, force: true }); }
  console.log('Tailwind CSS is built.');
} else {
  await build(path.join(root, OUT));
  console.log('Built ' + OUT);
}
