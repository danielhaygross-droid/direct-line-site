// Daily database backup: every table is saved as gzipped JSON in private Blob storage
// (backups/database-YYYY-MM-DD.json.gz), read back to check it, and kept for KEEP_DAYS days.
// Files already copied to Blob keep their blob_path in the backup; files still only in the
// database are included as base64. scripts/restore-backup.mjs loads a backup into an empty database.
import { gzipSync, gunzipSync } from 'node:zlib';
import { blobStore } from './file-storage.mjs';

export const KEEP_DAYS = 30;
const PREFIX = 'backups/';
export const backupName = date => `${PREFIX}database-${date.toISOString().slice(0, 10)}.json.gz`;
const backupDate = path => /database-(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(path)?.[1] || null;

export async function backupTables(DB) {
  const rows = (await DB.prepare("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name").all()).results || [];
  return rows.map(r => r.table_name);
}
export async function databaseSnapshot(DB, now = new Date()) {
  const dump = { format: 'direct-line-backup', version: 1, createdAt: now.toISOString(), columns: {}, tables: {} };
  // Column types let a restore recreate a table the app schema doesn't create (e.g. store caches).
  const cols = (await DB.prepare(`SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum`).all()).results || [];
  for (const c of cols) (dump.columns[c.table_name] ||= []).push({ name: c.column_name, type: c.type });
  for (const t of await backupTables(DB)) {
    dump.tables[t] = (await DB.prepare(`SELECT * FROM "${t.replace(/"/g, '""')}"`).all()).results || [];
  }
  return dump;
}
export function readBackup(gz) {
  const dump = JSON.parse(gunzipSync(gz).toString('utf8'));
  if (dump?.format !== 'direct-line-backup' || !dump.tables) throw new Error('Not a Direct Line backup file');
  return dump;
}

export async function runBackup(DB, env, now = new Date()) {
  const store = blobStore(env);
  if (!store) return { ok: false, configured: false };
  const dump = await databaseSnapshot(DB, now);
  const gz = gzipSync(JSON.stringify(dump)), path = backupName(now);
  await store.put(path, gz, 'application/gzip');
  // Check the stored copy opens and holds the same row counts before trusting it.
  const back = await store.get(path);
  if (!back) throw new Error('Backup was not stored');
  const check = readBackup(back);
  for (const [t, rows] of Object.entries(dump.tables)) {
    if ((check.tables[t] || []).length !== rows.length) throw new Error(`Backup check failed for ${t}`);
  }
  // Remove backups older than KEEP_DAYS, never today's.
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const old = (await store.list(PREFIX)).filter(b => { const d = backupDate(b.path); return d && d < cutoff; }).map(b => b.path);
  await store.del(old);
  const counts = Object.fromEntries(Object.entries(dump.tables).map(([t, rows]) => [t, rows.length]));
  return { ok: true, configured: true, path, bytes: gz.length, tables: counts, removed: old.length };
}

export async function listBackups(env) {
  const store = blobStore(env);
  if (!store) return [];
  return (await store.list(PREFIX)).filter(b => backupDate(b.path))
    .map(b => ({ name: b.path.slice(PREFIX.length), date: backupDate(b.path), bytes: b.size, uploadedAt: b.uploadedAt }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
export async function downloadBackup(env, name) {
  const store = blobStore(env);
  if (!store || !/^database-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name || '')) return new Response('Not found', { status: 404 });
  const bytes = await store.get(PREFIX + name);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(bytes, { headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
