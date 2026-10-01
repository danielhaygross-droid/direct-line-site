// Minimal Cloudflare D1-compatible wrapper over Postgres (Neon), so the
// existing Worker code (env.DB.prepare(...).bind(...).first/all/run) runs unchanged.
import { neon } from '@neondatabase/serverless';

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

export function createD1(connectionString, query) {
  const run = query || ((text, params) => neon(connectionString).query(text, params));
  let ready;
  const migrate = () => (ready ||= (async () => { for (const stmt of SCHEMA) await run(stmt, []); })().catch(error => { ready = undefined; throw error; }));
  const exec = async (sql, params) => { await migrate(); return run(toPostgres(sql), params); };
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => (await exec(sql, params))[0] ?? null,
    all: async () => ({ results: await exec(sql, params), success: true }),
    run: async () => { await exec(sql, params); return { success: true }; },
  });
  return { prepare: sql => statement(sql) };
}
