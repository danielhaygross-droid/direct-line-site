// Check: database setup when the site wakes up (16 Nov 2026). Several server copies start at once; they used to run all
// ~160 setup statements side by side and collide, so the first page load showed "Server error" until a reload.
// Now table changes run only when the setup list changed, collisions are retried, and "already exists" counts as done.
//   node checks/check-schema-once.mjs      (run from the repo root)
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createD1 } from '../server/d1-postgres.mjs';
import { SCHEMA } from '../server/portal.mjs';

const pg = new PGlite();
const isTableChange = s => /^\s*(CREATE|ALTER|DROP)\b/i.test(s);
const counter = () => {
  const seen = [];
  const run = async (q, p) => { seen.push(q); return (await pg.query(q, p)).rows; };
  return { seen, run };
};

// First server copy on a new database: the full setup runs, then the fingerprint is saved.
const a = counter();
await createD1(null, a.run, SCHEMA).prepare('SELECT 1 AS x').first();
const ddl = SCHEMA.filter(isTableChange).length;
assert.ok(a.seen.filter(isTableChange).length >= ddl, 'first run: all table changes');
const mark = (await pg.query("SELECT value FROM portal_settings WHERE key = 'schema_fingerprint'")).rows[0]?.value;
assert.ok(mark && mark.length === 32, 'fingerprint saved');

// The next server copy: no table changes, data-repair statements still run.
const b = counter();
assert.deepEqual(await createD1(null, b.run, SCHEMA).prepare('SELECT 2 AS x').first(), { x: 2 });
assert.equal(b.seen.filter(isTableChange).length, 0, 'same setup list: table changes skipped');
assert.ok(b.seen.some(q => /^\s*UPDATE client_orders SET delivered_at/.test(q)), 'data repairs still run');

// A changed setup list (a new deploy) runs the table changes again.
const c = counter();
await createD1(null, c.run, [...SCHEMA, 'CREATE TABLE IF NOT EXISTS schema_once_probe (id INTEGER)']).prepare('SELECT 1').first();
assert.ok(c.seen.filter(isTableChange).length >= ddl, 'changed list: full setup');
assert.ok((await pg.query("SELECT to_regclass('schema_once_probe') AS t")).rows[0].t, 'new table made');

// Collisions with another copy: a passing error is retried, "already exists" counts as done.
await pg.query("DELETE FROM portal_settings WHERE key = 'schema_fingerprint'");
let flaky = 0, dup = 0;
const d = async (q, p) => {
  if (/users_role_check CHECK/.test(q) && !dup++) { const e = new Error('constraint "users_role_check" already exists'); e.code = '42710'; throw e; }
  if (/CREATE TABLE IF NOT EXISTS portal_settings/.test(q) && flaky++ < 2) { const e = new Error('tuple concurrently updated'); e.code = 'XX000'; throw e; }
  return (await pg.query(q, p)).rows;
};
assert.deepEqual(await createD1(null, d, SCHEMA).prepare('SELECT 3 AS x').first(), { x: 3 });
assert.equal(flaky, 3, 'retried after two collisions'); assert.equal(dup, 1, 'already exists: done');

// Two copies starting at the same moment both answer.
await pg.query("DELETE FROM portal_settings WHERE key = 'schema_fingerprint'");
const both = await Promise.all([1, 2].map(n => createD1(null, async (q, p) => (await pg.query(q, p)).rows, SCHEMA).prepare('SELECT ' + n + ' AS x').first()));
assert.deepEqual(both, [{ x: 1 }, { x: 2 }]);
console.log('PASS database setup: once per change, data repairs every start, collisions retried, already-exists is fine');
await pg.close();
