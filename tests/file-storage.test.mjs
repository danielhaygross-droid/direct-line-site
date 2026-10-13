import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storedBytes, photoBytes, blobStore, STORAGE_SCHEMA } from '../server/file-storage.mjs';
import { runBackup, readBackup, backupName, KEEP_DAYS } from '../server/backup.mjs';
import { cronAuthorized } from '../api/index.mjs';
import { SCHEMA } from '../server/portal.mjs';

const memoryStore = () => {
  const m = new Map();
  return { m, async put(p, b) { m.set(p, Buffer.from(b)); }, async get(p) { return m.get(p) ?? null; },
    async list(prefix) { return [...m].filter(([p]) => p.startsWith(prefix)).map(([path, b]) => ({ path, size: b.length, uploadedAt: 0 })); },
    async del(paths) { paths.forEach(p => m.delete(p)); } };
};

test('files are read from the database copy first, then from Blob', async () => {
  const store = memoryStore(); store.m.set('files/a.png', Buffer.from('blob'));
  const env = { BLOB_STORE: store };
  assert.equal((await storedBytes(env, Buffer.from('db').toString('base64'), 'files/a.png')).toString(), 'db');
  assert.equal((await storedBytes(env, '', 'files/a.png')).toString(), 'blob');
  assert.equal(await storedBytes(env, '', null), null);
  assert.equal(await storedBytes({}, '', 'files/a.png'), null, 'no storage configured');
  assert.equal(blobStore({}), null);
});

test('photo thumbnails fall back to the full image when none was saved', async () => {
  const store = memoryStore(); store.m.set('full', Buffer.from('F')); store.m.set('thumb', Buffer.from('T'));
  const env = { BLOB_STORE: store };
  const row = { mime: 'image/png', data: '', blob_path: 'full', thumb_mime: 'image/jpeg', thumb: '', thumb_blob_path: 'thumb' };
  assert.deepEqual(await photoBytes(env, row, true), { mime: 'image/jpeg', bytes: Buffer.from('T') });
  assert.deepEqual(await photoBytes(env, { ...row, thumb_blob_path: null }, true), { mime: 'image/png', bytes: Buffer.from('F') });
  assert.deepEqual(await photoBytes(env, row, false), { mime: 'image/png', bytes: Buffer.from('F') });
});

test('storage columns are added after the tables they extend', () => {
  for (const sql of STORAGE_SCHEMA) {
    const table = /ALTER TABLE (\w+)/.exec(sql)[1];
    const created = SCHEMA.findIndex(s => new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(s));
    assert.ok(created >= 0 && created < SCHEMA.indexOf(sql), table);
  }
});

test('daily backup is checked after saving and keeps 30 days', async () => {
  const store = memoryStore();
  store.m.set('backups/database-2026-09-13.json.gz', Buffer.from('old'));
  store.m.set('backups/database-2026-09-15.json.gz', Buffer.from('recent'));
  const rows = { users: [{ id: 1, username: 'a' }], client_orders: [{ id: 1 }, { id: 2 }] };
  const DB = { prepare: sql => ({ bind: () => DB.prepare(sql), all: async () => ({ results:
    /information_schema\.tables/.test(sql) ? Object.keys(rows).map(table_name => ({ table_name }))
      : /pg_attribute/.test(sql) ? [{ table_name: 'users', column_name: 'id', type: 'integer' }]
        : rows[/FROM "(\w+)"/.exec(sql)[1]] }) }) };
  const now = new Date('2026-10-14T01:30:00Z');
  const r = await runBackup(DB, { BLOB_STORE: store }, now);
  assert.equal(KEEP_DAYS, 30);
  assert.equal(r.path, backupName(now));
  assert.deepEqual(r.tables, { users: 1, client_orders: 2 });
  assert.equal(r.removed, 1);
  assert.ok(!store.m.has('backups/database-2026-09-13.json.gz') && store.m.has('backups/database-2026-09-15.json.gz'));
  const dump = readBackup(store.m.get(r.path));
  assert.deepEqual(dump.tables, rows);
  assert.deepEqual(dump.columns, { users: [{ name: 'id', type: 'integer' }] });
  assert.throws(() => readBackup(Buffer.from('not a backup')));
  assert.deepEqual(await runBackup(DB, {}), { ok: false, configured: false });
});

test('scheduled jobs need the cron secret and are listed in vercel.json', async () => {
  const req = auth => new Request('http://x', { headers: auth ? { authorization: auth } : {} });
  assert.equal(cronAuthorized(req('Bearer s3cret'), 's3cret'), true);
  assert.equal(cronAuthorized(req('Bearer wrong'), 's3cret'), false);
  assert.equal(cronAuthorized(req(''), 's3cret'), false);
  assert.equal(cronAuthorized(req('Bearer '), ''), false, 'no secret set → refused');
  const crons = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url))).crons.map(c => c.path).sort();
  assert.deepEqual(crons, ['/api/cron/backup', '/api/cron/file-storage', '/api/cron/supplier-sheet']);
});
