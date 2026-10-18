import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCREENS, joined } from '../scripts/build-screens.mjs';

test('dist/admin/admin.js and dist/portal/portal.js are exactly the join of their screen files (src/admin, src/portal)', async () => {
  for (const [dir, out] of SCREENS) {
    const have = await readFile(new URL('../' + out, import.meta.url));
    assert.ok(have.equals(await joined(dir)), `${out} is not built from ${dir}/: run node scripts/build-screens.mjs`);
  }
});
