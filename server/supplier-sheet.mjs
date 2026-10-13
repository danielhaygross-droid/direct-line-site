// Supplier Work Queue: the first tab of the connected Google Sheet, written by the website, one row per
// active order (matched by the hidden Order ID column, so sorting/filtering by the supplier is safe).
// The supplier fills in three columns; the website reads them every minute (cron) and applies changes:
//   N  Total cost (USD)  — the whole order, product + shipping. Client is billed total + commission.
//   O  Tracking number   — copied to the order.
//   P  Shipping status   — "Shipped" moves the order to Shipped (client is notified).
// The website never writes N, and writes O/P only when an admin changes tracking/status on the website.
// sheet_cost / sheet_tracking / sheet_shipped hold the last value seen in (or written to) each cell, so a
// change is applied once, and a supplier's edit is never overwritten by an older website value.
// Nothing here runs until an admin presses "Set up supplier sheet" (portal_settings supplier_sheet = '1').
import { sheetsRequest, googleSheetsConfig, googleSheetsConfigured, syncPortalOrderToGoogleSheet } from './google-sheets.mjs';
import { changeStatus } from './order-status.mjs';
import { sheetPhotoUrl } from './sheet-photos.mjs';

export const SUPPLIER_SHEET_SCHEMA = [
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS supplier_cost DOUBLE PRECISION',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_cost TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_tracking TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_shipped TEXT',
];

export const WQ = 'Work Queue';
const BACKUP_TITLE = 'Work Queue (old formulas)';
export const FIRST_ROW = 6;
export const HEADERS = ['Date', 'Order', 'Shop', 'Status', 'Photo preview', 'Photo 1', 'Product link', 'Qty', 'Product / variation',
  'Customer', 'Delivery address & phone', 'Country', 'Notes', 'Total cost (USD)', 'Tracking number', 'Shipping status',
  'Photo 2', 'Photo 3', 'Photo 4', 'Photo 5', 'Photo 6', 'Photo 7', 'Photo 8', 'More product links', 'Order ID', 'Client ID'];
export const SHIPPED = 'Shipped', NOT_SHIPPED = 'Not shipped';
const STATUS = { pending: 'Pending', processing: 'In Progress', shipped: 'Shipped', delivered: 'Delivered', cancellation_requested: 'Cancellation requested', cancelled: 'Cancelled' };
const SETTING = 'supplier_sheet', LAST = 'supplier_sheet_last';

const round2 = n => Math.round(Number(n) * 100) / 100;
const norm = v => (v === null || v === undefined ? '' : String(v).trim());
// Cells written with USER_ENTERED: text that looks like a formula, number or date is kept as typed text.
const txt = v => { const s = norm(v); return /^[=+\-@0-9]/.test(s) ? "'" + s : s; };
const q = s => String(s).replace(/"/g, '""');
const isShipped = v => /^shipped$/i.test(norm(v));

// "12.5", "$1,234.50", "12,50" → number; anything else (or negative / huge) → null.
export function parseCost(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value < 1e7 ? round2(value) : null;
  let s = norm(value).replace(/[$\s]|USD/gi, '');
  if (!s) return null;
  s = /^\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n < 1e7 ? round2(n) : null;
}

export async function supplierSheetEnabled(DB) {
  const r = await DB.prepare('SELECT value FROM portal_settings WHERE key=?').bind(SETTING).first();
  return r?.value === '1';
}

// ---------- website → sheet ----------
function addressLines(o) {
  return [o.address_line_1, o.address_line_2, o.city, o.region, o.postal_code, o.buyer_phone].map(norm).filter(Boolean).join('\n');
}
// Website-owned cells: A–M and Q–Z. Column C is the shop the order came from — suppliers don't see who our clients are.
export function websiteCells(env, o, photos, shopName) {
  const urls = photos.map(p => sheetPhotoUrl(env, o.id, p.id));
  const links = String(o.etsy_url || '').split(/\s+/).filter(Boolean);
  const product = [o.item_title, o.variant].map(norm).filter(Boolean).join(' · ');
  const am = [
    txt(o.order_date || new Date(Number(o.created_at) * 1000).toISOString().slice(0, 10)), txt(o.order_ref || '#' + o.id), txt(shopName),
    STATUS[o.status] || o.status, urls[0] ? `=IMAGE("${q(urls[0])}&size=thumb",1)` : '', urls[0] ? `=HYPERLINK("${q(urls[0])}","Photo 1")` : '',
    links[0] ? `=HYPERLINK("${q(links[0])}","Open product")` : '', Number(o.quantity || 1), txt(product), txt(o.buyer_name),
    txt(addressLines(o)), txt(o.destination), txt(o.notes),
  ];
  const qz = [...Array.from({ length: 7 }, (_, i) => urls[i + 1] ? `=HYPERLINK("${q(urls[i + 1])}","Photo ${i + 2}")` : ''),
    txt(links.slice(1).join('\n')), String(o.id), String(o.client_id)];
  return { am, qz };
}

let sheetIdCache = { key: '', id: null };
async function workQueueSheetId(env, fetchImpl, fresh) {
  const key = googleSheetsConfig(env).spreadsheetId;
  if (!fresh && sheetIdCache.key === key && sheetIdCache.id != null) return sheetIdCache.id;
  const meta = await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl);
  const s = (meta.sheets || []).find(x => x.properties?.title === WQ);
  sheetIdCache = { key, id: s ? s.properties.sheetId : null };
  return sheetIdCache.id;
}
async function idColumn(env, fetchImpl) {
  const data = await sheetsRequest(env, '/values/' + encodeURIComponent(`${WQ}!Y${FIRST_ROW}:Z`) + '?majorDimension=ROWS', {}, fetchImpl);
  return (data.values || []).map((r, i) => ({ row: FIRST_ROW + i, orderId: Number(r?.[0]), clientId: Number(r?.[1]) }));
}
const batchValues = (env, data, fetchImpl) => sheetsRequest(env, '/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) }, fetchImpl);
const batch = (env, requests, fetchImpl) => sheetsRequest(env, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) }, fetchImpl);
const rowHeight = (sheetId, start, end) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: start - 1, endIndex: end }, properties: { pixelSize: 100 }, fields: 'pixelSize' } });

async function deleteRows(env, rows, fetchImpl) {
  if (!rows.length) return;
  const sheetId = await workQueueSheetId(env, fetchImpl);
  if (sheetId == null) return;
  // Bottom-up so earlier deletions don't move later rows.
  await batch(env, [...rows].sort((a, b) => b - a).map(r => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } })), fetchImpl);
}
export async function removeClientFromWorkQueue(DB, env, clientId, fetchImpl = fetch) {
  if (!await supplierSheetEnabled(DB)) return;
  await deleteRows(env, (await idColumn(env, fetchImpl)).filter(r => r.clientId === Number(clientId)).map(r => r.row), fetchImpl);
}

// Called from the normal order sync. Adds/updates/removes the order's Work Queue row.
export async function syncWorkQueueRow(DB, env, order, photos, fetchImpl = fetch) {
  if (!await supplierSheetEnabled(DB)) return { enabled: false };
  const rows = await idColumn(env, fetchImpl), found = rows.filter(r => r.orderId === Number(order.id));
  if (order.archived || order.client_archived) { await deleteRows(env, found.map(r => r.row), fetchImpl); return { enabled: true, removed: found.length }; }
  const shop = order.store_id == null ? null : await DB.prepare('SELECT name FROM client_stores WHERE id=?').bind(order.store_id).first();
  const { am, qz } = websiteCells(env, order, photos, shop?.name || '');
  if (found.length) {
    const r = found[0].row, data = [{ range: `${WQ}!A${r}:M${r}`, values: [am] }, { range: `${WQ}!Q${r}:Z${r}`, values: [qz] }];
    const sets = [];
    // An admin changed tracking / shipped on the website since the sheet last showed it: show it in the sheet too.
    if (norm(order.tracking_number) && norm(order.tracking_number) !== norm(order.sheet_tracking)) {
      data.push({ range: `${WQ}!O${r}`, values: [[txt(order.tracking_number)]] }); sets.push(['sheet_tracking', norm(order.tracking_number)]);
    }
    if (['shipped', 'delivered'].includes(order.status) && !isShipped(order.sheet_shipped)) {
      data.push({ range: `${WQ}!P${r}`, values: [[SHIPPED]] }); sets.push(['sheet_shipped', SHIPPED]);
    }
    await batchValues(env, data, fetchImpl);
    for (const [col, v] of sets) await DB.prepare(`UPDATE client_orders SET ${col}=? WHERE id=?`).bind(v, order.id).run();
    return { enabled: true, row: r };
  }
  const supplier = [order.supplier_cost == null ? '' : Number(order.supplier_cost), txt(order.tracking_number), ['shipped', 'delivered'].includes(order.status) ? SHIPPED : NOT_SHIPPED];
  const res = await sheetsRequest(env, '/values/' + encodeURIComponent(`${WQ}!A${FIRST_ROW}:Z`) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
    method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: [[...am, ...supplier, ...qz]] }),
  }, fetchImpl);
  await DB.prepare('UPDATE client_orders SET sheet_cost=?, sheet_tracking=?, sheet_shipped=? WHERE id=?').bind(norm(supplier[0]), norm(order.tracking_number), supplier[2], order.id).run();
  const row = Number(/![A-Z]+(\d+)/.exec(res?.updates?.updatedRange || '')?.[1]);
  const sheetId = await workQueueSheetId(env, fetchImpl);
  if (row && sheetId != null) await batch(env, [rowHeight(sheetId, row, row)], fetchImpl);
  return { enabled: true, row, added: true };
}

// ---------- sheet → website ----------
async function event(DB, o, kind, detail, t) {
  await DB.prepare('INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,?,?,?,?)').bind(o.id, o.client_id, kind, 'admin', detail, t).run();
}
// Applies one Work Queue row (cost, tracking, shipped) to its order. Returns what changed.
export async function applySupplierRow(DB, order, cells, t = Math.floor(Date.now() / 1000)) {
  const done = [], skipped = [];
  const cost = typeof cells.cost === 'number' ? String(cells.cost) : norm(cells.cost), tracking = norm(cells.tracking), shipped = norm(cells.shipped);
  if (order.archived) return { done, skipped: ['archived'] };
  if (cost !== norm(order.sheet_cost)) {
    const n = parseCost(cells.cost);
    if (n === null) { if (cost) skipped.push('cost not a number: ' + cost); await DB.prepare('UPDATE client_orders SET sheet_cost=? WHERE id=?').bind(cost, order.id).run(); }
    else if (order.quoted_unit_price != null) {
      // Fixed-quote orders keep the price the client agreed; the supplier's cost is recorded for the team.
      await DB.prepare('UPDATE client_orders SET supplier_cost=?, sheet_cost=?, updated_at=? WHERE id=?').bind(n, cost, t, order.id).run(); done.push('cost recorded (fixed quote)');
    } else {
      const price = round2(n + Number(order.commission || 0));
      await DB.prepare('UPDATE client_orders SET supplier_cost=?, product_cost=?, shipping_fee=NULL, price=?, sheet_cost=?, updated_at=? WHERE id=?').bind(n, price, price, cost, t, order.id).run();
      if (price !== round2(order.price || 0) || order.product_cost == null) { await event(DB, order, 'billed', price.toFixed(2), t); done.push('billed ' + price.toFixed(2)); }
    }
  }
  if (tracking !== norm(order.sheet_tracking)) {
    if (tracking && tracking !== norm(order.tracking_number)) {
      await DB.prepare('UPDATE client_orders SET tracking_number=?, last_tracking_update_at=?, updated_at=? WHERE id=?').bind(tracking.slice(0, 120), t, t, order.id).run();
      await event(DB, order, 'tracking', tracking.slice(0, 120), t); done.push('tracking');
    }
    await DB.prepare('UPDATE client_orders SET sheet_tracking=? WHERE id=?').bind(tracking, order.id).run();
  }
  if (shipped !== norm(order.sheet_shipped)) {
    if (isShipped(shipped)) {
      const current = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(order.id).first();
      if (['pending', 'processing'].includes(current.status)) { await changeStatus(DB, current, 'status', { status: 'shipped' }, true); done.push('shipped'); }
      else if (!['shipped', 'delivered'].includes(current.status)) skipped.push('not shipped: order is ' + current.status);
    }
    await DB.prepare('UPDATE client_orders SET sheet_shipped=? WHERE id=?').bind(shipped, order.id).run();
  }
  return { done, skipped };
}

// Cron (every minute): read the supplier columns and apply changes.
export async function pollSupplierSheet(DB, env, { waitUntil, fetchImpl = fetch } = {}) {
  if (!googleSheetsConfigured(env)) return { ok: true, configured: false };
  if (!await supplierSheetEnabled(DB)) return { ok: true, enabled: false };
  const t = Math.floor(Date.now() / 1000), result = { ok: true, enabled: true, checked: 0, changed: [], skipped: [] };
  try {
    const ranges = [`${WQ}!N${FIRST_ROW}:P`, `${WQ}!Y${FIRST_ROW}:Y`].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const data = await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE', {}, fetchImpl);
    const [inputs, ids] = (data.valueRanges || []).map(v => v.values || []);
    const rows = (ids || []).map((r, i) => ({ orderId: Number(r?.[0]), cost: inputs?.[i]?.[0] ?? '', tracking: inputs?.[i]?.[1] ?? '', shipped: inputs?.[i]?.[2] ?? '' }))
      .filter(r => Number.isSafeInteger(r.orderId) && r.orderId > 0);
    result.checked = rows.length;
    // One query for what the website last saw in each row; only rows that differ are loaded and applied.
    const seen = new Map();
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map(r => r.orderId);
      const found = (await DB.prepare(`SELECT id, sheet_cost, sheet_tracking, sheet_shipped FROM client_orders WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [];
      for (const f of found) seen.set(Number(f.id), f);
    }
    const cellText = v => (typeof v === 'number' ? String(v) : norm(v));
    for (const r of rows) {
      const s = seen.get(r.orderId);
      if (!s || (cellText(r.cost) === norm(s.sheet_cost) && cellText(r.tracking) === norm(s.sheet_tracking) && cellText(r.shipped) === norm(s.sheet_shipped))) continue;
      const order = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(r.orderId).first();
      if (!order) continue;
      const out = await applySupplierRow(DB, order, r, t);
      if (out.skipped.length) result.skipped.push({ orderId: r.orderId, ref: order.order_ref, why: out.skipped });
      if (out.done.length) {
        result.changed.push({ orderId: r.orderId, ref: order.order_ref, what: out.done });
        const sync = syncPortalOrderToGoogleSheet(DB, env, r.orderId, fetchImpl).catch(e => console.error('Sheet refresh after supplier update failed', e));
        if (waitUntil) waitUntil(sync); else await sync;
      }
    }
  } catch (e) { result.ok = false; result.error = String(e.message || e).slice(0, 300); }
  await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(LAST, JSON.stringify({ at: t, ok: result.ok, checked: result.checked, changed: result.changed.length, skipped: result.skipped.slice(0, 20), error: result.error || '' })).run();
  return result;
}

export async function supplierSheetStatus(DB, env) {
  const last = await DB.prepare('SELECT value FROM portal_settings WHERE key=?').bind(LAST).first();
  let parsed = null; try { parsed = last ? JSON.parse(last.value) : null; } catch (e) { parsed = null; }
  return { configured: googleSheetsConfigured(env), enabled: await supplierSheetEnabled(DB), last: parsed };
}

// ---------- one-time setup ----------
// Keeps the current Work Queue as a hidden backup tab, rebuilds the Work Queue as a website-written
// table (same tab id, so existing links still open it), adds the supplier columns, and switches syncing on.
export async function setupSupplierWorkQueue(DB, env, fetchImpl = fetch) {
  if (!googleSheetsConfigured(env)) throw new Error('Google Sheets is not connected.');
  // Running setup again: first take in anything the supplier typed, so the rebuilt table keeps it.
  if (await supplierSheetEnabled(DB)) { const p = await pollSupplierSheet(DB, env, { fetchImpl }); if (!p.ok) throw new Error('Could not read the supplier columns first: ' + p.error); }
  const meta = await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl);
  const props = (meta.sheets || []).map(s => s.properties);
  const current = props.find(p => p.title === WQ), backup = props.find(p => p.title === BACKUP_TITLE);
  const oldId = current?.sheetId;
  if (current && !backup) {
    await batch(env, [{ duplicateSheet: { sourceSheetId: oldId, newSheetName: BACKUP_TITLE, insertSheetIndex: props.length } }], fetchImpl);
    const again = await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl);
    const copy = (again.sheets || []).map(s => s.properties).find(p => p.title === BACKUP_TITLE);
    if (copy) await batch(env, [{ updateSheetProperties: { properties: { sheetId: copy.sheetId, hidden: true }, fields: 'hidden' } }], fetchImpl);
  }
  // Suppliers don't need our client list: keep the Clients tab (the website still updates it) but hide it.
  const clientsTab = props.find(p => p.title === 'Clients');
  if (clientsTab && !clientsTab.hidden) await batch(env, [{ updateSheetProperties: { properties: { sheetId: clientsTab.sheetId, hidden: true }, fields: 'hidden' } }], fetchImpl);
  if (current) await batch(env, [{ deleteSheet: { sheetId: oldId } }], fetchImpl);
  const add = { addSheet: { properties: { title: WQ, index: 0, gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 5 }, ...(oldId != null ? { sheetId: oldId } : {}) } } };
  let created;
  try { created = await batch(env, [add], fetchImpl); }
  catch (e) { delete add.addSheet.properties.sheetId; created = await batch(env, [add], fetchImpl); }
  const sheetId = created?.replies?.[0]?.addSheet?.properties?.sheetId ?? await workQueueSheetId(env, fetchImpl, true);
  sheetIdCache = { key: googleSheetsConfig(env).spreadsheetId, id: sheetId };

  const orders = (await DB.prepare(`SELECT o.*, s.name AS shop_name FROM client_orders o JOIN users u ON u.id=o.client_id
    LEFT JOIN client_stores s ON s.id=o.store_id WHERE NOT o.archived AND NOT u.archived AND u.active ORDER BY o.created_at, o.id`).all()).results || [];
  const rows = [];
  for (const o of orders) {
    const photos = (await DB.prepare('SELECT id FROM order_photos WHERE order_id=? ORDER BY id LIMIT 8').bind(o.id).all()).results || [];
    const { am, qz } = websiteCells(env, o, photos, o.shop_name || '');
    const supplier = [o.supplier_cost == null ? '' : Number(o.supplier_cost), txt(o.tracking_number), ['shipped', 'delivered'].includes(o.status) ? SHIPPED : NOT_SHIPPED];
    rows.push([...am, ...supplier, ...qz]);
    await DB.prepare('UPDATE client_orders SET sheet_cost=?, sheet_tracking=?, sheet_shipped=? WHERE id=?').bind(norm(supplier[0]), norm(o.tracking_number), supplier[2], o.id).run();
  }
  const last = FIRST_ROW + Math.max(rows.length, 1) - 1;
  await batchValues(env, [
    { range: `${WQ}!A2:A3`, values: [['Direct Line — Work Queue'], ['Supplier: fill in the yellow columns — Total cost (USD, whole order incl. shipping), Tracking number, and set Shipping status to Shipped when it leaves. The website updates within a minute. Other columns are filled in by Direct Line.']] },
    { range: `${WQ}!A5:Z5`, values: [HEADERS] },
    ...(rows.length ? [{ range: `${WQ}!A${FIRST_ROW}:Z${last}`, values: rows }] : []),
  ], fetchImpl);

  const { email } = googleSheetsConfig(env);
  const cols = (a, b) => ({ sheetId, startColumnIndex: a, endColumnIndex: b });
  const yellow = { red: 1, green: 0.95, blue: 0.7 }, header = { red: 0.93, green: 0.93, blue: 0.93 };
  const widths = [100, 120, 130, 110, 120, 80, 110, 50, 180, 140, 220, 70, 220, 120, 170, 130];
  await batch(env, [
    { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 26 }, cell: { userEnteredFormat: { backgroundColor: header, textFormat: { bold: true }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 13, endColumnIndex: 16 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: 0, endColumnIndex: 26 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,horizontalAlignment)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: 13, endColumnIndex: 16 }, cell: { userEnteredFormat: { backgroundColor: yellow } }, fields: 'userEnteredFormat.backgroundColor' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: 13, endColumnIndex: 14 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: 14, endColumnIndex: 15 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { setDataValidation: { range: { sheetId, startRowIndex: 5, startColumnIndex: 13, endColumnIndex: 14 }, rule: { condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '0' }] }, inputMessage: 'Total cost for the whole order in USD, product + shipping.', strict: true, showCustomUi: true } } },
    { setDataValidation: { range: { sheetId, startRowIndex: 5, startColumnIndex: 15, endColumnIndex: 16 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: NOT_SHIPPED }, { userEnteredValue: SHIPPED }] }, strict: true, showCustomUi: true } } },
    ...widths.map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 24, endIndex: 26 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
    ...(rows.length ? [rowHeight(sheetId, FIRST_ROW, last)] : []),
    { addDimensionGroup: { range: { sheetId, dimension: 'COLUMNS', startIndex: 16, endIndex: 24 } } },
    { updateDimensionGroup: { dimensionGroup: { range: { sheetId, dimension: 'COLUMNS', startIndex: 16, endIndex: 24 }, depth: 1, collapsed: true }, fields: 'collapsed' } },
    { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 4, startColumnIndex: 0, endColumnIndex: 24 } } } },
    // Only the supplier columns are editable by suppliers; the rest is written by the website.
    { addProtectedRange: { protectedRange: { range: cols(0, 13), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
    { addProtectedRange: { protectedRange: { range: cols(16, 26), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
    { addProtectedRange: { protectedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: 5, startColumnIndex: 13, endColumnIndex: 16 }, description: 'Column headers', editors: { users: [email] } } } },
  ], fetchImpl);

  await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(SETTING, '1').run();
  return { ok: true, rows: rows.length, sheetId, backup: !!current };
}
