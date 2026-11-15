// Supplier portal, phase 2 (docs/supplier-portal.md): the work queue. The supplier (Ada, Ye) sees the orders the sheet's
// Orders / Shipped / Cancelled tabs show, with the same customer and product details, and types their own cells there
// (total cost, cost per product, tracking, courier, shipped, delayed + reason, domestic tracking, cancellation fee) plus
// a Bought step. Like phase 1, every answer is built field by field: no client price, fee, selling price, competitor price
// or client contact detail is ever sent.
// A save goes through applySupplierRow (server/supplier-sheet.mjs), exactly like an edit typed in the sheet (billing,
// cost revisions, shipped, delays, cancellation fees), then the new cells are written into the sheet row.

import { paidOrders } from './payment-orders.mjs';
import { applySupplierRow, writeSupplierCells, withOrderLock, addressLines, savedPriceFlag, numberedLines, SHIPPED, NOT_SHIPPED, DELAYED, ON_TIME, DEFAULT_COURIERS } from './supplier-sheet.mjs';
import { syncPortalOrderToGoogleSheet, googleSheetsConfigured } from './google-sheets.mjs';
import { photoSignature } from './sheet-photos.mjs';
import { photoBytes } from './file-storage.mjs';
import { itemPrices } from './item-costs.mjs';
import { NO_WORD } from './cost-revisions.mjs';
import { clientLabel } from './supplier-portal.mjs';

export const QUEUE_SCHEMA = [
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS bought_at INTEGER',
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS bought_by TEXT NOT NULL DEFAULT ''",
  // Who saved what in the supplier portal, and when (shown next to each box).
  `CREATE TABLE IF NOT EXISTS supplier_edits (
     id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES client_orders(id), field TEXT NOT NULL,
     user_id INTEGER, by_name TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS supplier_edits_order_idx ON supplier_edits (order_id, created_at)',
];

const now = () => Math.floor(Date.now() / 1000);
const norm = v => (v === null || v === undefined ? '' : String(v).trim());
const r2 = v => Math.round(Number(v || 0) * 100) / 100;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
// Shipped and cancelled orders older than this leave the queue (search still covers everything open).
const KEEP_DONE_DAYS = 120;
const COUNTRY = { US: 'United States', UK: 'United Kingdom', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands', IL: 'Israel' };
const lines = o => { try { const a = o.items ? JSON.parse(o.items) : null; return Array.isArray(a) ? a : []; } catch { return []; } };
const statusAt = o => Number(o.status_changed_at ?? o.created_at) || 0;
export const tabOf = o => (['cancelled'].includes(o.status) ? 'cancelled' : ['shipped', 'delivered'].includes(o.status) ? 'shipped' : o.bought_at || norm(o.tracking_number) ? 'bought' : 'new'); // a tracking number means it was bought
const shipWord = o => (['shipped', 'delivered'].includes(o.status) ? 'shipped' : o.status === 'cancelled' ? 'cancelled' : o.status === 'cancellation_requested' ? 'cancel_requested' : 'not_shipped');

export async function courierList(DB) {
  const row = await DB.prepare("SELECT value FROM portal_settings WHERE key = 'couriers'").first();
  return String(row?.value ?? DEFAULT_COURIERS).split(/\r?\n/).map(norm).filter(Boolean);
}

// One order as the supplier sees it (allow-list).
function queueOrder(env, o, photos, paid, edits) {
  const its = lines(o), product = [o.item_title, its.length > 1 ? numberedLines(its) : o.variant].map(norm).filter(Boolean).join(its.length > 1 ? '\n' : ' · ');
  const label = p => (p.item_index != null && its.length > 1 ? '#' + p.item_index : '');
  const cost = o.supplier_cost != null && (norm(o.sheet_cost) === '' || Number(norm(o.sheet_cost)) === Number(o.supplier_cost)) ? Number(o.supplier_cost).toFixed(2) : norm(o.sheet_cost);
  const fee = o.supplier_cancel_fee != null ? Number(o.supplier_cancel_fee).toFixed(2) : norm(o.sheet_cancel_fee);
  return {
    id: Number(o.id), ref: norm(o.order_ref) || '#' + o.id, date: norm(o.order_date) || new Date(Number(o.created_at) * 1000).toISOString().slice(0, 10), createdAt: Number(o.created_at),
    client: clientLabel({ display_name: o.client_name, username: o.client_username }), shop: norm(o.shop), status: o.status, statusAt: statusAt(o), tab: tabOf(o), ship: shipWord(o),
    cancelRequested: o.status === 'cancellation_requested',
    boughtAt: o.bought_at == null ? null : Number(o.bought_at), boughtBy: norm(o.bought_by),
    qty: Number(o.quantity || 1), product, links: String(o.etsy_url || '').split(/\s+/).filter(Boolean),
    photos: photos.map(p => { const u = `/api/portal/sheet-photos/${o.id}/${p.id}?key=${photoSignature(env, o.id, p.id)}`; return { url: u, thumb: u + '&size=thumb', label: label(p) }; }),
    buyer: norm(o.buyer_name), address: addressLines(o), country: COUNTRY[norm(o.destination).toUpperCase()] || norm(o.destination),
    taxNumber: norm(o.tax_number), giftMessage: norm(o.gift_message), notes: (savedPriceFlag(o) + norm(o.notes)).trim(),
    clientPaid: paid.has(Number(o.id)) ? 'paid' : Number(o.price) > 0 ? 'not_paid' : 'no_bill',
    revision: !!o.revision_status,
    cells: { cost, itemCosts: norm(o.item_costs), tracking: norm(o.tracking_number), courier: norm(o.courier), delayed: !!o.delayed_at, reason: norm(o.delay_reason), domestic: norm(o.domestic_tracking), cancelFee: fee },
    edits: edits || {},
  };
}

async function loadOrders(DB, where = '', binds = []) {
  return (await DB.prepare(`SELECT o.*, u.display_name AS client_name, u.username AS client_username, s.name AS shop FROM client_orders o
    JOIN users u ON u.id = o.client_id AND u.role = 'client' AND NOT u.archived LEFT JOIN client_stores s ON s.id = o.store_id
    WHERE NOT o.archived ${where} ORDER BY o.created_at DESC, o.id DESC`).bind(...binds).all()).results || [];
}
async function withDetails(DB, env, rows) {
  const ids = rows.map(r => Number(r.id)), photos = new Map(), edits = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const part = ids.slice(i, i + 300), q = part.map(() => '?').join(',');
    if (!part.length) continue;
    for (const p of (await DB.prepare(`SELECT id, order_id, item_index FROM order_photos WHERE order_id IN (${q}) ORDER BY id`).bind(...part).all()).results || [])
      photos.set(Number(p.order_id), [...(photos.get(Number(p.order_id)) || []), p].slice(0, 8));
    for (const e of (await DB.prepare(`SELECT order_id, field, by_name, created_at FROM supplier_edits WHERE order_id IN (${q}) ORDER BY created_at, id`).bind(...part).all()).results || [])
      edits.set(Number(e.order_id), { ...(edits.get(Number(e.order_id)) || {}), [e.field]: { by: e.by_name, at: Number(e.created_at) } });
  }
  const paid = await paidOrders(DB);
  return rows.map(o => queueOrder(env, o, photos.get(Number(o.id)) || [], paid, edits.get(Number(o.id))));
}
export async function queueList(DB, env) {
  const since = now() - KEEP_DONE_DAYS * 86400;
  const rows = await loadOrders(DB, `AND (o.status NOT IN ('shipped','delivered','cancelled') OR COALESCE(o.status_changed_at, o.updated_at, o.created_at) >= ?)`, [since]);
  return withDetails(DB, env, rows);
}
async function queueOne(DB, env, id) {
  const rows = await loadOrders(DB, 'AND o.id = ?', [id]);
  return rows.length ? (await withDetails(DB, env, rows))[0] : null;
}
// Other orders (not cancelled) with the same tracking number: a warning while typing, never a block.
async function sameTracking(DB, id, tracking) {
  if (!norm(tracking)) return [];
  const rows = (await DB.prepare("SELECT id, order_ref FROM client_orders WHERE id <> ? AND NOT archived AND status <> 'cancelled' AND LOWER(TRIM(tracking_number)) = LOWER(?) LIMIT 5").bind(id, norm(tracking)).all()).results || [];
  return rows.map(r => norm(r.order_ref) || '#' + r.id);
}

const FIELDS = ['cost', 'itemCosts', 'tracking', 'courier', 'shipped', 'delayed', 'reason', 'domestic', 'cancelFee', 'bought'];
// Saves one box. Returns { order, warn } or throws { status, message }.
export async function saveCell(DB, env, waitUntil, me, id, field, value) {
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  if (!FIELDS.includes(field)) fail(400, 'Unknown field.');
  return withOrderLock(DB, 'supplier-edit:' + id, async () => {
    const o = (await loadOrders(DB, 'AND o.id = ?', [id]))[0];
    if (!o) fail(404, 'Not found');
    const t = now(), by = me.display_name || me.username, open = ['pending', 'processing', 'cancellation_requested'].includes(o.status);
    const cancelled = ['cancelled', 'cancellation_requested'].includes(o.status), shipped = ['shipped', 'delivered'].includes(o.status);
    const v = typeof value === 'boolean' ? value : norm(value);
    // What the website holds now; the saved box replaces one of them.
    const cells = { cost: o.sheet_cost, tracking: o.sheet_tracking, courier: o.sheet_courier, shipped: o.sheet_shipped, delayed: o.sheet_delayed, reason: o.sheet_delay_reason, cancelFee: o.sheet_cancel_fee, by };
    let sheetField = true;
    if (field === 'cost') {
      if (o.status === 'cancelled') fail(409, 'This order is cancelled: its cost can’t change.');
      if (v !== '' && !(/^\d{1,5}(\.\d{1,2})?$/.test(v)) && !(o.revision_status && NO_WORD.test(v))) fail(400, 'Type the total cost in US dollars, e.g. 17.90.');
      cells.cost = v;
    } else if (field === 'tracking') {
      if (o.status === 'cancelled') fail(409, 'This order is cancelled.');
      if (v.length > 120 || /\s/.test(v)) fail(400, 'Type one tracking number, without spaces.');
      if (shipped && !v) fail(409, 'This order is shipped: its tracking number can’t be cleared.');
      cells.tracking = v;
    } else if (field === 'courier') {
      if (v && !(await courierList(DB)).includes(v)) fail(400, 'Pick a courier from the list.');
      cells.courier = v;
    } else if (field === 'shipped') {
      if (value !== true) fail(409, 'A shipped order can’t be set back here. Ask Direct Line.');
      if (o.status === 'cancellation_requested') fail(409, 'The client asked to cancel this order: don’t ship it. Direct Line will tell you.');
      if (!['pending', 'processing'].includes(o.status)) fail(409, 'This order can’t be shipped.');
      if (!norm(o.tracking_number)) fail(409, 'Add the tracking number first.');
      cells.shipped = SHIPPED;
    } else if (field === 'delayed') {
      if (!open) fail(409, 'Only orders that are not shipped yet can be delayed.');
      cells.delayed = value === true ? DELAYED : ON_TIME; cells.reason = value === true ? norm(o.delay_reason) : '';
    } else if (field === 'reason') {
      if (!o.delayed_at) fail(409, 'Mark the order as possibly delayed first.');
      if (v.length > 300) fail(400, 'Keep the reason under 300 characters.');
      cells.delayed = DELAYED; cells.reason = v;
    } else if (field === 'cancelFee') {
      if (!cancelled) fail(409, 'A cancellation fee is only for cancelled orders or cancel requests.');
      if (v !== '' && !/^\d{1,4}(\.\d{1,2})?$/.test(v)) fail(400, 'Type the fee in US dollars, e.g. 4.');
      cells.cancelFee = v;
    } else sheetField = false;

    if (sheetField) {
      const out = await applySupplierRow(DB, o, cells, t);
      if (out.skipped.length) fail(400, out.skipped.join('; '));
    } else if (field === 'domestic') {
      if (v.length > 120) fail(400, 'Type one tracking number.');
      await DB.prepare('UPDATE client_orders SET domestic_tracking=? WHERE id=?').bind(v || null, id).run();
    } else if (field === 'itemCosts') {
      if (v.length > 300 || (v && !/^[\d.,\s$]+$/.test(v))) fail(400, 'Type one cost per product, separated by commas, e.g. 10.90, 9.00.');
      const before = itemPrices(o), after = itemPrices({ ...o, item_costs: v });
      await DB.prepare('UPDATE client_orders SET item_costs=? WHERE id=?').bind(v || null, id).run();
      // The client gets a bell when the prices per product appear or change, as from the sheet.
      if (after && o.status !== 'cancelled' && JSON.stringify(after) !== JSON.stringify(before))
        await DB.prepare("INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,'item_prices','admin',?,?)").bind(id, o.client_id, after.map(n => '$' + n.toFixed(2)).join(' · '), t).run();
    } else if (field === 'bought') {
      if (value === true && o.status === 'cancellation_requested') fail(409, 'The client asked to cancel this order: don’t buy it. Direct Line will tell you.');
      if (!['pending', 'processing'].includes(o.status)) fail(409, 'Only orders not shipped yet can be marked bought.');
      await DB.prepare('UPDATE client_orders SET bought_at=?, bought_by=? WHERE id=?').bind(value === true ? t : null, value === true ? by.slice(0, 60) : '', id).run();
    }
    await DB.prepare('INSERT INTO supplier_edits (order_id, field, user_id, by_name, created_at) VALUES (?,?,?,?,?)').bind(id, field, Number(me.id), by.slice(0, 60), t).run();
    // The sheet keeps up while both exist: the supplier's cells first, then the row (status, tab moves).
    if (googleSheetsConfigured(env) && field !== 'bought') {
      const sync = (async () => { await writeSupplierCells(DB, env, id); await syncPortalOrderToGoogleSheet(DB, env, id); })().catch(e => console.error('Supplier portal edit: sheet write failed', e));
      if (waitUntil) waitUntil(sync); else await sync;
    }
    const order = await queueOne(DB, env, id);
    return { order, warn: field === 'tracking' ? { sameTracking: await sameTracking(DB, id, v) } : null };
  });
}

// New-order alerts: orders created since the supplier last looked, and open cancel requests.
export async function alerts(DB, me) {
  const seen = Number((await DB.prepare('SELECT notif_seen_at FROM users WHERE id = ?').bind(me.id).first())?.notif_seen_at || 0);
  const q = (where, b = []) => DB.prepare(`SELECT COUNT(*) AS n FROM client_orders o JOIN users u ON u.id = o.client_id AND u.role = 'client' AND NOT u.archived WHERE NOT o.archived ${where}`).bind(...b).first();
  const fresh = Number((await q("AND o.created_at > ? AND o.status IN ('pending','processing','cancellation_requested') AND o.bought_at IS NULL AND COALESCE(o.tracking_number, '') = ''", [seen]))?.n || 0);
  const cancelReq = Number((await q("AND o.status = 'cancellation_requested'"))?.n || 0);
  return { newOrders: fresh, cancelRequests: cancelReq, seenAt: seen };
}

// All photos of one order in a zip (files stored, not compressed).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = [], central = []; let offset = 0;
  const u16 = n => [n & 0xff, (n >>> 8) & 0xff], u32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  for (const [name, data] of files) {
    const nameB = Buffer.from(name), crc = crc32(data);
    const local = Buffer.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)]);
    parts.push(local, nameB, data);
    central.push(Buffer.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nameB);
    offset += local.length + nameB.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  return Buffer.concat([...parts, ...central, Buffer.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)])]);
}
export async function photosZip(DB, env, id) {
  const o = (await loadOrders(DB, 'AND o.id = ?', [id]))[0];
  if (!o) return json({ ok: false, error: 'Not found' }, 404);
  const rows = (await DB.prepare('SELECT id, item_index, mime, data, blob_path, thumb_mime, thumb, thumb_blob_path FROM order_photos WHERE order_id = ? ORDER BY id LIMIT 8').bind(id).all()).results || [];
  const safe = (norm(o.order_ref) || 'order-' + id).replace(/[^\w.-]+/g, '_'), files = [];
  for (const [i, r] of rows.entries()) {
    const img = await photoBytes(env, r, false);
    if (!img.bytes) continue;
    const ext = img.mime === 'image/png' ? 'png' : img.mime === 'image/webp' ? 'webp' : 'jpg';
    files.push([`${safe}-${r.item_index != null ? 'product-' + r.item_index : 'photo-' + (i + 1)}.${ext}`, Buffer.from(img.bytes)]);
  }
  if (!files.length) return json({ ok: false, error: 'This order has no photos.' }, 404);
  return new Response(zip(files), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${safe}-photos.zip"`, 'cache-control': 'no-store' } });
}

export async function routeQueue(request, path, ctx, me) {
  const { DB, env, waitUntil } = ctx, method = request.method;
  if (path === '/supplier/orders' && method === 'GET') return json({ ok: true, updatedAt: now(), couriers: await courierList(DB), orders: await queueList(DB, env) });
  const one = /^\/supplier\/orders\/(\d+)$/.exec(path);
  if (one && method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    try { return json({ ok: true, ...(await saveCell(DB, env, waitUntil, me, Number(one[1]), String(body.field || ''), body.value)) }); }
    catch (e) { return json({ ok: false, error: e.message }, e.status || (e.busy ? 409 : 500)); }
  }
  const zipM = /^\/supplier\/orders\/(\d+)\/photos\.zip$/.exec(path);
  if (zipM && method === 'GET') return photosZip(DB, env, Number(zipM[1]));
  if (path === '/supplier/alerts' && method === 'GET') return json({ ok: true, ...(await alerts(DB, me)) });
  if (path === '/supplier/alerts/seen' && method === 'POST') { await DB.prepare('UPDATE users SET notif_seen_at=? WHERE id=?').bind(now(), me.id).run(); return json({ ok: true }); }
  return null;
}
