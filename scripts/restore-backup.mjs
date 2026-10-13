// Restores a Direct Line backup (database-YYYY-MM-DD.json.gz, downloadable from admin
// Settings → Storage & backups) into a NEW, EMPTY Postgres database, e.g. a fresh Neon branch:
//   TARGET_DATABASE_URL=postgres://... node scripts/restore-backup.mjs database-2026-10-14.json.gz
// It refuses to run if the target already has Direct Line tables, so it can't overwrite live data.
// Files already moved to Blob are referenced by blob_path; keep the same Blob store connected.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createD1 } from '../server/d1-postgres.mjs';
import { SCHEMA } from '../server/portal.mjs';
import { readBackup } from '../server/backup.mjs';

const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const value = v => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);

// query(text, params) runs one Postgres statement with $1.. placeholders and returns its rows.
export async function restoreBackup(query, dump, log = console.log) {
  if ((await query("SELECT to_regclass('public.users') AS t", []))[0]?.t) {
    throw new Error('The target database already has Direct Line tables. Restore only into a new, empty database.');
  }
  // 1. The app's own tables (with keys and checks), then any other backed-up table from its column list.
  await createD1(null, query, SCHEMA).prepare('SELECT 1').all();
  const existing = new Set((await query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'", [])).map(r => r.tablename));
  for (const [t, cols] of Object.entries(dump.columns || {})) {
    if (!existing.has(t)) await query(`CREATE TABLE ${q(t)} (${cols.map(c => `${q(c.name)} ${c.type}`).join(', ')})`, []);
  }
  const tables = Object.keys(dump.tables);
  // Creating the schema can add default rows (e.g. the first terms version); the backup replaces them.
  await query(`TRUNCATE ${tables.map(q).join(', ')} RESTART IDENTITY CASCADE`, []);

  // 2. Insert parents before children. Where two tables point at each other (payments and their
  // transfer confirmations), insert one side without that link and fill it in at the end.
  const fks = await query(`SELECT tc.relname AS child, rc.relname AS parent, a.attname AS col FROM pg_constraint k
    JOIN pg_class tc ON tc.oid = k.conrelid JOIN pg_class rc ON rc.oid = k.confrelid JOIN pg_namespace n ON n.oid = tc.relnamespace
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY(k.conkey) WHERE k.contype = 'f' AND n.nspname = 'public'`, []);
  const deps = new Map(tables.map(t => [t, fks.filter(f => f.child === t && f.parent !== t && tables.includes(f.parent))]));
  const done = new Set(), order = [], deferred = [];
  const unmet = t => deps.get(t).filter(f => !done.has(f.parent)).length;
  while (order.length < tables.length) {
    const left = tables.filter(t => !done.has(t));
    let next = left.find(t => unmet(t) === 0);
    if (!next) {
      next = left.sort((a, b) => unmet(a) - unmet(b))[0];
      for (const f of deps.get(next)) if (!done.has(f.parent)) deferred.push({ table: next, col: f.col });
    }
    done.add(next); order.push(next);
  }
  for (const t of order) {
    const rows = dump.tables[t];
    if (!rows.length) continue;
    const target = new Set((await query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['public', t])).map(r => r.column_name));
    const cols = Object.keys(rows[0]).filter(c => target.has(c));
    const later = new Set(deferred.filter(d => d.table === t).map(d => d.col));
    const sorted = 'id' in rows[0] ? [...rows].sort((a, b) => Number(a.id) - Number(b.id)) : rows;
    for (let i = 0; i < sorted.length; i += 100) {
      const chunk = sorted.slice(i, i + 100), params = [];
      const tuples = chunk.map(r => '(' + cols.map(c => { params.push(later.has(c) ? null : value(r[c])); return '$' + params.length; }).join(', ') + ')');
      await query(`INSERT INTO ${q(t)} (${cols.map(q).join(', ')}) VALUES ${tuples.join(', ')}`, params);
    }
    log(`${t}: ${rows.length} rows`);
  }
  for (const d of deferred) {
    for (const r of dump.tables[d.table]) {
      if (r[d.col] != null) await query(`UPDATE ${q(d.table)} SET ${q(d.col)} = $1 WHERE id = $2`, [r[d.col], r.id]);
    }
  }
  // 3. New rows must get ids after the restored ones.
  for (const t of order) {
    const hasId = (await query("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id'", [t])).length;
    const seq = hasId && (await query('SELECT pg_get_serial_sequence($1, $2) AS s', [q(t), 'id']))[0]?.s;
    if (seq) await query(`SELECT setval($1, GREATEST(COALESCE((SELECT MAX(id) FROM ${q(t)}), 0), 1), EXISTS (SELECT 1 FROM ${q(t)}))`, [seq]);
  }
  // 4. Check every table has the backed-up number of rows.
  for (const t of tables) {
    const n = Number((await query(`SELECT COUNT(*) AS n FROM ${q(t)}`, []))[0].n);
    if (n !== dump.tables[t].length) throw new Error(`${t}: restored ${n} rows, backup has ${dump.tables[t].length}`);
  }
  log(`Restore complete: ${tables.length} tables from the backup made ${dump.createdAt}.`);
  return { tables: Object.fromEntries(tables.map(t => [t, dump.tables[t].length])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file] = process.argv.slice(2), url = process.env.TARGET_DATABASE_URL;
  if (!file || !url) {
    console.error('Usage: TARGET_DATABASE_URL=postgres://... node scripts/restore-backup.mjs database-YYYY-MM-DD.json.gz');
    process.exit(1);
  }
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  await restoreBackup((text, params) => sql.query(text, params), readBackup(await readFile(file)));
}
