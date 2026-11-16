// Minimal Cloudflare D1-compatible wrapper over Postgres (Neon), so the
// existing Worker code (env.DB.prepare(...).bind(...).first/all/run) runs unchanged.
import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS etsy_oauth_state (state TEXT PRIMARY KEY NOT NULL, target_shop TEXT NOT NULL, code_verifier TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS etsy_oauth_state_expires_idx ON etsy_oauth_state (expires_at)',
  'CREATE TABLE IF NOT EXISTS etsy_connections (target_shop TEXT PRIMARY KEY NOT NULL, etsy_shop_id TEXT NOT NULL, etsy_shop_name TEXT NOT NULL, access_token_enc TEXT NOT NULL, refresh_token_enc TEXT NOT NULL, expires_at INTEGER NOT NULL, connected_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sync_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, synced_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS product_costs (product_key TEXT PRIMARY KEY, product DOUBLE PRECISION NOT NULL, shipping DOUBLE PRECISION NOT NULL, fees DOUBLE PRECISION NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)',
];

// SQLite -> Postgres: "?" placeholders become $1..$n, REAL becomes DOUBLE PRECISION
// (Postgres REAL is 4-byte and would round money values).
export function toPostgres(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => '$' + ++n).replace(/\bREAL\b/g, 'DOUBLE PRECISION');
}

// Database setup runs once per new server copy. When the site wakes up, several copies often start at the same moment, and
// all of them ran the ~160 setup statements side by side. They collided (e.g. two copies adding the same constraint), so the
// first page load showed "Server error" and the header fell back to Daniel until a reload (16 Nov 2026).
// Now: the setup list's fingerprint is stored in portal_settings after a full run. While it matches, table changes
// (CREATE / ALTER / DROP) are skipped and only the data-repair statements run, as before. A statement that collides with
// another copy is retried a few times, and "already exists" counts as done.
const isTableChange = s => /^\s*(CREATE|ALTER|DROP)\b/i.test(s);
const ALREADY = new Set(['42710', '42P07', '42701', '42P06']); // duplicate object / table / column / schema
const MARK = 'schema_fingerprint';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runSafely(run, stmt) {
  for (let attempt = 0; ; attempt++) {
    try { return await run(stmt, []); }
    catch (error) {
      if (ALREADY.has(error?.code)) return;
      if (attempt >= 4) throw error;
      await pause(150 + Math.random() * 350 * (attempt + 1));
    }
  }
}

export function createD1(connectionString, query, extraSchema = []) {
  const run = query || ((text, params) => neon(connectionString).query(text, params));
  const all = [...SCHEMA, ...extraSchema];
  const fingerprint = createHash('sha256').update(all.join('\n;\n')).digest('hex').slice(0, 32);
  let ready;
  const setup = async () => {
    let same = false;
    try { same = (await run('SELECT value FROM portal_settings WHERE key = $1', [MARK]))[0]?.value === fingerprint; } catch { same = false; }
    for (const stmt of all) if (!same || !isTableChange(stmt)) await runSafely(run, stmt);
    if (!same) {
      try { await run('INSERT INTO portal_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [MARK, fingerprint]); }
      catch { /* no portal_settings table (store-only database): run the full setup every time, as before */ }
    }
  };
  const migrate = () => (ready ||= setup().catch(error => { ready = undefined; throw error; }));
  const exec = async (sql, params) => { await migrate(); return run(toPostgres(sql), params); };
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => (await exec(sql, params))[0] ?? null,
    all: async () => ({ results: await exec(sql, params), success: true }),
    run: async () => { await exec(sql, params); return { success: true }; },
  });
  return { prepare: sql => statement(sql) };
}
