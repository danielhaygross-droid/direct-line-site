// Local check for file storage + backups (branch claude/storage-backups), run from the project root:
//   node checks/check-file-storage.mjs
// Uses an in-memory Postgres (PGlite) and an in-memory stand-in for Vercel Blob. No live data.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { DB, env, call, seed, pg } from './lib.mjs';
import { syncFileStorage, fileStorageStatus } from '../server/file-storage.mjs';
import { runBackup, readBackup } from '../server/backup.mjs';
import { restoreBackup } from '../scripts/restore-backup.mjs';
import { route, cronAuthorized } from '../api/index.mjs';

const blobs = new Map();
let failPut = false;
env.BLOB_STORE = {
  async put(path, bytes) { if (failPut) throw new Error('simulated outage'); blobs.set(path, { bytes: Buffer.from(bytes), at: Date.now() }); },
  async get(path) { return blobs.get(path)?.bytes ?? null; },
  async list(prefix) { return [...blobs].filter(([p]) => p.startsWith(prefix)).map(([path, b]) => ({ path, size: b.bytes.length, uploadedAt: b.at })); },
  async del(paths) { for (const p of paths) blobs.delete(p); },
};
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const png = 'data:image/png;base64,' + PNG;
const bytesOf = async (path, cookie) => {
  const url = new URL('http://localhost/api/portal' + path);
  const { handlePortal } = await import('../server/portal.mjs');
  const r = await handlePortal(new Request(url, { headers: { cookie } }), url, { DB, env, waitUntil: p => p.catch(() => {}) });
  return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) };
};

const { admin, client, id } = await seed();
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
// Files of every kind, created the normal way.
const order = await call('/orders', 'POST', { storeId: store.id, orderRef: 'STORE-1', buyerName: 'Sample', address1: 'Sample address', destination: 'IL', etsyUrl: 'https://example.com/p', photos: [{ data: png, thumb: png, width: 1, height: 1 }] }, client);
assert.equal(order.status, 200, JSON.stringify(order.data));
const oid = order.data.order.id, pid = order.data.order.photos[0].id;
const transfer = await call('/transfers', 'POST', { amount: 12.5, date: '2026-10-14', file: { data: png, filename: 'proof.png' } }, client);
assert.equal(transfer.status, 200, JSON.stringify(transfer.data));
const product = await call('/products', 'POST', { name: 'Mug', link: 'https://example.com/mug', photos: [{ data: png, filename: 'mug.png' }] }, client);
assert.equal(product.status, 200, JSON.stringify(product.data));
const prod = product.data.product;
const invoice = await call('/admin/invoices', 'POST', { clientId: id, orderIds: [oid], date: '2026-10-14', file: { data: png, filename: 'invoice.png' } }, admin);
assert.equal(invoice.status, 200, JSON.stringify(invoice.data));
const urls = [`/orders/${oid}/photos/${pid}`, `/orders/${oid}/photos/${pid}?size=thumb`, `/files/${transfer.data.transfer.id}`, `/products/${prod.id}/photos/${prod.photoIds[0]}`, `/files/${invoice.data.invoice.id}`];
const original = await Promise.all(urls.map(u => bytesOf(u, client)));
for (const r of original) assert.equal(r.status, 200);

// Storage off: nothing changes.
const saved = env.BLOB_STORE; delete env.BLOB_STORE;
assert.deepEqual(await syncFileStorage(DB, env), { ok: false, configured: false });
env.BLOB_STORE = saved;

// A failed upload leaves the database copy alone and is retried later.
failPut = true;
const failed = await syncFileStorage(DB, env);
assert.equal(failed.copied, 0); assert.ok(failed.failed >= 5);
failPut = false;

// Copy without clearing: every file now also exists in Blob; database copies remain.
const copy = await syncFileStorage(DB, env, { clear: false });
assert.equal(copy.copied, 5, JSON.stringify(copy));
let status = await fileStorageStatus(DB, env);
assert.ok(status.kinds.every(k => k.copied === k.total && k.cleared === 0), JSON.stringify(status));
assert.equal((await syncFileStorage(DB, env, { clear: false })).copied, 0, 'copy is idempotent');

// A Blob copy that no longer matches must NOT allow clearing that database copy.
const docPath = (await DB.prepare('SELECT blob_path FROM portal_files WHERE id=?').bind(transfer.data.transfer.id).first()).blob_path;
const good = blobs.get(docPath); blobs.set(docPath, { bytes: Buffer.from('corrupt'), at: 0 });
const guarded = await syncFileStorage(DB, env, { clear: true });
assert.equal(guarded.cleared, 4); assert.equal(guarded.failed, 1);
assert.notEqual((await DB.prepare('SELECT content FROM portal_files WHERE id=?').bind(transfer.data.transfer.id).first()).content, '');
blobs.set(docPath, good);
assert.equal((await syncFileStorage(DB, env, { clear: true })).cleared, 1);
status = await fileStorageStatus(DB, env);
assert.ok(status.kinds.every(k => k.cleared === k.total && k.databaseBytes === 0), JSON.stringify(status));

// After clearing, every file downloads byte-for-byte from Blob, including the supplier-sheet link.
const after = await Promise.all(urls.map(u => bytesOf(u, client)));
after.forEach((r, i) => { assert.equal(r.status, 200, urls[i]); assert.ok(r.bytes.equals(original[i].bytes), urls[i]); });
const { sheetPhotoUrl } = await import('../server/sheet-photos.mjs');
const sheet = new URL(sheetPhotoUrl(env, oid, pid));
const sheetRes = await bytesOf(sheet.pathname.replace('/api/portal', '') + sheet.search, '');
assert.equal(sheetRes.status, 200); assert.ok(sheetRes.bytes.equals(original[0].bytes));
// Another client still can't see them.
assert.equal((await bytesOf(urls[2], '')).status, 401);

// New uploads after clearing keep working, and an order from a saved product reuses its Blob photo.
await call('/admin/products/' + prod.id, 'POST', { status: 'approved', unitPrice: 4 }, admin);
const fromProduct = await call('/orders', 'POST', { storeId: store.id, productId: prod.id, quotedUnitPrice: 4, orderRef: 'STORE-2', buyerName: 'Sample', address1: 'Sample address', destination: 'IL' }, client);
assert.equal(fromProduct.status, 200, JSON.stringify(fromProduct.data));
const fp = fromProduct.data.order;
const fpImg = await bytesOf(`/orders/${fp.id}/photos/${fp.photos[0].id}`, client);
assert.equal(fpImg.status, 200); assert.ok(fpImg.bytes.equals(original[3].bytes));
const fpThumb = await bytesOf(`/orders/${fp.id}/photos/${fp.photos[0].id}?size=thumb`, client);
assert.equal(fpThumb.status, 200); assert.ok(fpThumb.bytes.equals(original[3].bytes));

// Record the transfer so the backup has a payment ↔ confirmation link to restore.
assert.equal((await call(`/admin/transfers/${transfer.data.transfer.id}/record`, 'POST', {}, admin)).status, 200);
// Admin endpoints.
const st = await call('/admin/storage', 'GET', null, admin);
assert.equal(st.status, 200); assert.equal(st.data.storage.configured, true);
assert.equal((await call('/admin/storage', 'GET', null, client)).status, 403);
const backup = await call('/admin/backups/run', 'POST', {}, admin);
assert.equal(backup.status, 200, JSON.stringify(backup.data));
assert.ok(backup.data.tables.client_orders >= 2);
assert.equal((await call('/admin/storage', 'GET', null, admin)).data.backups.length, 1);
const dl = await bytesOf('/admin/backups/' + backup.data.path.replace('backups/', ''), admin);
assert.equal(dl.status, 200);
assert.equal((await bytesOf('/admin/backups/../files', admin)).status, 404);
assert.equal((await bytesOf('/admin/backups/' + backup.data.path.replace('backups/', ''), client)).status, 403);

// Backups older than 30 days are removed; recent ones kept.
blobs.set('backups/database-2026-08-01.json.gz', { bytes: Buffer.from('x'), at: 0 });
blobs.set('backups/database-2026-10-01.json.gz', { bytes: Buffer.from('x'), at: 0 });
const pruned = await runBackup(DB, env, new Date('2026-10-14T01:30:00Z'));
assert.equal(pruned.removed, 1);
assert.ok(!blobs.has('backups/database-2026-08-01.json.gz') && blobs.has('backups/database-2026-10-01.json.gz'));

// Cron: refused without the secret, runs with it.
assert.equal(cronAuthorized(new Request('http://x', { headers: { authorization: 'Bearer s' } }), ''), false);
const cronEnv = { ...env, CRON_SECRET: 'cron-test-secret' };
assert.equal((await route(new Request('http://localhost/api/cron/backup'), { db: DB, env: cronEnv })).status, 401);
assert.equal((await route(new Request('http://localhost/api/cron/backup', { headers: { authorization: 'Bearer wrong-secret-xx' } }), { db: DB, env: cronEnv })).status, 401);
const cron = await route(new Request('http://localhost/api/cron/file-storage', { headers: { authorization: 'Bearer cron-test-secret' } }), { db: DB, env: cronEnv });
assert.equal(cron.status, 200, await cron.clone().text());

// Restore the backup into a second, empty database and check the data and files come back.
const dump = readBackup(dl.bytes);
const pg2 = new PGlite();
const q2 = async (t, p) => (await pg2.query(t, p)).rows;
const restored = await restoreBackup(q2, dump, () => {});
for (const [t, n] of Object.entries(restored.tables)) assert.equal(Number((await q2(`SELECT COUNT(*) AS n FROM "${t}"`, []))[0].n), n);
const p2 = (await q2('SELECT blob_path FROM portal_files WHERE id=$1', [transfer.data.transfer.id]))[0];
assert.ok(blobs.get(p2.blob_path).bytes.equals(original[2].bytes));
const link = (await q2('SELECT confirmation_id FROM client_payments WHERE confirmation_id IS NOT NULL', []));
assert.deepEqual(link, (await pg.query('SELECT confirmation_id FROM client_payments WHERE confirmation_id IS NOT NULL')).rows);
// New rows get fresh ids after the restored ones.
const maxOrder = Number((await q2('SELECT MAX(id) AS m FROM client_orders', []))[0].m);
assert.ok(Number((await q2("SELECT nextval(pg_get_serial_sequence('client_orders','id')) AS n", []))[0].n) > maxOrder);
// It refuses to restore over a database that already has data.
await assert.rejects(restoreBackup(q2, dump, () => {}), /already has Direct Line tables/);

console.log('File storage + backup checks passed:', JSON.stringify({ copied: copy.copied, backupTables: Object.keys(dump.tables).length, backupBytes: backup.data.bytes }));
