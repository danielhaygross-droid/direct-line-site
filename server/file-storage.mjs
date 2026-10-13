// File storage: order photos, product photos and documents (transfer confirmations, invoices,
// claim evidence) are first saved in Postgres as base64, exactly as before. A background job
// copies each file to private Vercel Blob storage, reads it back to check it, and only then
// records blob_path. Readers use the database copy while it exists and fall back to Blob.
// Database copies are cleared only when FILE_STORAGE_CLEAR_DB=1, after re-checking the Blob copy.
import { createHash } from 'node:crypto';
import { put, get, list, del } from '@vercel/blob';

export const STORAGE_SCHEMA = [
  'ALTER TABLE order_photos ADD COLUMN IF NOT EXISTS blob_path TEXT',
  'ALTER TABLE order_photos ADD COLUMN IF NOT EXISTS thumb_blob_path TEXT',
  'ALTER TABLE portal_product_photos ADD COLUMN IF NOT EXISTS blob_path TEXT',
  'ALTER TABLE portal_files ADD COLUMN IF NOT EXISTS blob_path TEXT',
];

// Every stored file kind: its table, base64 column, Blob path column and Blob name.
export const FILE_KINDS = [
  { table: 'order_photos', data: 'data', mime: 'mime', path: 'blob_path', name: id => `files/order-photos/${id}-full` },
  { table: 'order_photos', data: 'thumb', mime: 'thumb_mime', path: 'thumb_blob_path', name: id => `files/order-photos/${id}-thumb` },
  { table: 'portal_product_photos', data: 'data', mime: 'mime', path: 'blob_path', name: id => `files/product-photos/${id}` },
  { table: 'portal_files', data: 'content', mime: 'mime', path: 'blob_path', name: id => `files/documents/${id}` },
];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/webm': 'webm' };

function vercelBlob(token) {
  return {
    async put(path, bytes, contentType) {
      await put(path, bytes, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true, token });
    },
    async get(path) {
      const r = await get(path, { access: 'private', useCache: false, token });
      return r?.stream ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
    },
    async list(prefix) {
      const out = []; let cursor;
      do {
        const r = await list({ prefix, cursor, token });
        out.push(...r.blobs.map(b => ({ path: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt).getTime() })));
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      return out;
    },
    async del(paths) { if (paths.length) await del(paths, { token }); },
  };
}
let realStore, realToken;
// Tests pass an in-memory store as env.BLOB_STORE.
export function blobStore(env) {
  if (env.BLOB_STORE) return env.BLOB_STORE;
  if (!env.BLOB_READ_WRITE_TOKEN) return null;
  if (realToken !== env.BLOB_READ_WRITE_TOKEN) { realStore = vercelBlob(env.BLOB_READ_WRITE_TOKEN); realToken = env.BLOB_READ_WRITE_TOKEN; }
  return realStore;
}

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// The bytes of a stored file: the database copy if present, otherwise the Blob copy.
export async function storedBytes(env, b64, path) {
  if (b64) return Buffer.from(b64, 'base64');
  const store = path ? blobStore(env) : null;
  return store ? store.get(path) : null;
}
// An order photo row (mime, data, blob_path, thumb_mime, thumb, thumb_blob_path): its full image or
// thumbnail. Photos saved without a separate thumbnail use the full image.
export async function photoBytes(env, row, wantThumb) {
  const thumb = wantThumb && (row.thumb || row.thumb_blob_path);
  return thumb
    ? { mime: row.thumb_mime, bytes: await storedBytes(env, row.thumb, row.thumb_blob_path) }
    : { mime: row.mime, bytes: await storedBytes(env, row.data, row.blob_path) };
}

// Copies files that are only in the database to Blob, verified by reading them back.
// With clear=true, also empties database copies whose Blob copy still matches.
// Stops starting new files after budgetMs so a cron run stays well inside its time limit.
export async function syncFileStorage(DB, env, { batch = 50, budgetMs = 25000, clear = env.FILE_STORAGE_CLEAR_DB === '1' } = {}) {
  const store = blobStore(env);
  if (!store) return { ok: false, configured: false };
  const started = Date.now(), result = { ok: true, configured: true, copied: 0, cleared: 0, failed: 0, more: false };
  const timeLeft = () => Date.now() - started < budgetMs;
  for (const k of FILE_KINDS) {
    const rows = (await DB.prepare(`SELECT id, ${k.mime} AS mime, ${k.data} AS b64 FROM ${k.table} WHERE ${k.path} IS NULL AND ${k.data} <> '' ORDER BY id LIMIT ?`).bind(batch).all()).results || [];
    if (rows.length === batch) result.more = true;
    for (const r of rows) {
      if (!timeLeft()) { result.more = true; return result; }
      try {
        const bytes = Buffer.from(r.b64, 'base64'), path = `${k.name(r.id)}.${EXT[r.mime] || 'bin'}`;
        await store.put(path, bytes, r.mime);
        const back = await store.get(path);
        if (!back || sha(back) !== sha(bytes)) throw new Error('Blob copy did not match');
        await DB.prepare(`UPDATE ${k.table} SET ${k.path} = ? WHERE id = ? AND ${k.path} IS NULL`).bind(path, r.id).run();
        result.copied++;
      } catch (error) { result.failed++; console.error('File copy failed', k.table, r.id, error?.message || error); }
    }
  }
  if (!clear) return result;
  for (const k of FILE_KINDS) {
    const rows = (await DB.prepare(`SELECT id, ${k.data} AS b64, ${k.path} AS path FROM ${k.table} WHERE ${k.path} IS NOT NULL AND ${k.data} <> '' ORDER BY id LIMIT ?`).bind(batch).all()).results || [];
    if (rows.length === batch) result.more = true;
    for (const r of rows) {
      if (!timeLeft()) { result.more = true; return result; }
      try {
        const back = await store.get(r.path);
        if (!back || sha(back) !== sha(Buffer.from(r.b64, 'base64'))) throw new Error('Blob copy missing or different; database copy kept');
        await DB.prepare(`UPDATE ${k.table} SET ${k.data} = '' WHERE id = ? AND ${k.path} = ?`).bind(r.id, r.path).run();
        result.cleared++;
      } catch (error) { result.failed++; console.error('File clear skipped', k.table, r.id, error?.message || error); }
    }
  }
  return result;
}

// Counts per file kind for the admin storage panel.
export async function fileStorageStatus(DB, env) {
  const kinds = [];
  for (const k of FILE_KINDS) {
    const r = await DB.prepare(`SELECT COUNT(*) FILTER (WHERE ${k.data} <> '' OR ${k.path} IS NOT NULL) AS total,
      COUNT(*) FILTER (WHERE ${k.path} IS NOT NULL) AS copied, COUNT(*) FILTER (WHERE ${k.path} IS NOT NULL AND ${k.data} = '') AS cleared,
      COALESCE(SUM(LENGTH(${k.data})), 0) AS db_chars FROM ${k.table}`).first();
    kinds.push({ table: k.table, column: k.data, total: Number(r.total), copied: Number(r.copied), cleared: Number(r.cleared), databaseBytes: Math.round(Number(r.db_chars) * 3 / 4) });
  }
  return { configured: !!blobStore(env), clearing: env.FILE_STORAGE_CLEAR_DB === '1', kinds };
}
