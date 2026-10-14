// Supplier "Product Quotes" tab in the connected Google Sheet: product price checks from clients (My Products).
// The website writes one row per product; the supplier fills in the yellow columns and the website reads them
// every minute (from the supplier-sheet cron):
//   J  Price per item (USD) — product only, no shipping. The client sees it + their fee per order.
//   K  Available?           — "Not available" (with a reason in L) instead of a price.
//   L  Supplier note        — optional, shown to the client.
// The supplier never sees who the client is. Admins can still set or change a quote in admin → Products.
import { sheetsRequest, googleSheetsConfig, googleSheetsConfigured } from './google-sheets.mjs';
import { sheetProductPhotoUrl } from './sheet-photos.mjs';

export const QT = 'Product Quotes';
export const QUOTE_FIRST_ROW = 5;
export const QUOTE_HEADERS = ['Requested', 'Request', 'Photo preview', 'Photo 2', 'Photo 3', 'Product link', 'Product name', 'Variation / notes', 'Expected per month',
  'Price per item (USD)', 'Available?', 'Supplier note', 'Status', 'Product ID'];
export const QUOTE_WIDTHS = [95, 80, 130, 80, 80, 115, 180, 220, 95, 120, 125, 220, 120, 60];
export const AVAILABLE = 'Available', NOT_AVAILABLE = 'Not available';
export const QUOTE_SHEET_SCHEMA = [
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS supplier_price DOUBLE PRECISION',
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS sheet_price TEXT',
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS sheet_status TEXT',
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS sheet_note TEXT',
];
const STATUS = { awaiting_quote: 'Waiting for price', approved: 'Quoted', not_available: 'Not available' };
const TAB = 'quote_tab';

const norm = v => (v === null || v === undefined ? '' : String(v).trim());
const txt = v => { const s = norm(v); return /^[=+\-@0-9]/.test(s) ? "'" + s : s; };
const q = s => String(s).replace(/"/g, '""');
const round2 = n => Math.round(Number(n) * 100) / 100;
const batch = (env, requests, f) => sheetsRequest(env, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) }, f);
const batchValues = (env, data, f) => sheetsRequest(env, '/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) }, f);
const setting = async (DB, key) => (await DB.prepare('SELECT value FROM portal_settings WHERE key=?').bind(key).first())?.value;
const putSetting = (DB, key, value) => DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run();

// "12.5", "$12.50", "12,50" → number; anything else → null.
export function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value < 1e7 ? round2(value) : null;
  let s = norm(value).replace(/[$\s]|USD/gi, '');
  if (!s) return null;
  s = /^\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(s) && Number(s) < 1e7 ? round2(Number(s)) : null;
}

// Website-owned cells of one product row: A–I and M–N.
export function quoteCells(env, p, photoIds) {
  const urls = photoIds.slice(0, 3).map(id => sheetProductPhotoUrl(env, p.id, id));
  const ai = [txt(new Date(Number(p.created_at) * 1000).toISOString().slice(0, 10)), 'P-' + p.id,
    urls[0] ? `=IMAGE("${q(urls[0])}",1)` : '', urls[1] ? `=HYPERLINK("${q(urls[1])}","Photo 2")` : '', urls[2] ? `=HYPERLINK("${q(urls[2])}","Photo 3")` : '',
    p.link ? `=HYPERLINK("${q(p.link)}","Open product")` : '', txt(p.name), txt(p.variant), p.expected_quantity == null ? '' : Number(p.expected_quantity)];
  return { ai, mn: [STATUS[p.status] || p.status, String(p.id)] };
}

async function tabId(env, f) {
  const meta = await sheetsRequest(env, '?fields=sheets.properties', {}, f);
  return (meta.sheets || []).map(s => s.properties).find(p => p.title === QT)?.sheetId ?? null;
}
async function rowsById(env, f) {
  const data = await sheetsRequest(env, '/values/' + encodeURIComponent(`${QT}!N${QUOTE_FIRST_ROW}:N`) + '?majorDimension=ROWS', {}, f);
  return new Map((data.values || []).map((r, i) => [Number(r?.[0]), QUOTE_FIRST_ROW + i]).filter(([id]) => id > 0));
}

// Creates the tab once (with every existing product), when the supplier sheet is in use. Safe to retry.
export async function ensureQuoteTab(DB, env, fetchImpl = fetch) {
  if (await setting(DB, TAB) === '1') return true;
  const t = Math.floor(Date.now() / 1000), v = await setting(DB, TAB);
  if (String(v || '').startsWith('creating:') && t - Number(v.split(':')[1]) < 300) return false;
  const claim = v == null
    ? await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO NOTHING RETURNING key').bind(TAB, 'creating:' + t).first()
    : await DB.prepare('UPDATE portal_settings SET value=? WHERE key=? AND value=? RETURNING key').bind('creating:' + t, TAB, v).first();
  if (!claim) return false;
  try {
    let sheetId = await tabId(env, fetchImpl);
    if (sheetId == null) {
      const made = await batch(env, [{ addSheet: { properties: { title: QT, index: 1, gridProperties: { rowCount: 500, columnCount: 14, frozenRowCount: 4 } } } }], fetchImpl);
      sheetId = made?.replies?.[0]?.addSheet?.properties?.sheetId ?? await tabId(env, fetchImpl);
    }
    const { email } = googleSheetsConfig(env), cols = (a, b) => ({ sheetId, startColumnIndex: a, endColumnIndex: b });
    const yellow = { red: 1, green: 0.95, blue: 0.7 };
    await batchValues(env, [
      { range: `${QT}!A1:A2`, values: [['Direct Line — Product Quotes'], ['Supplier: these are price checks from our clients before they sell a product. Fill in the yellow columns — Price per item (USD, product only, no shipping), or set Available? to Not available and add a note. The website updates within a minute.']] },
      { range: `${QT}!A4:N4`, values: [QUOTE_HEADERS] },
    ], fetchImpl);
    await batch(env, [
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } },
      { repeatCell: { range: { sheetId, startRowIndex: 3, startColumnIndex: 0, endColumnIndex: 14 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,horizontalAlignment)' } },
      { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 14 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
      { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 9, endColumnIndex: 12 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
      { repeatCell: { range: { sheetId, startRowIndex: 4, startColumnIndex: 9, endColumnIndex: 12 }, cell: { userEnteredFormat: { backgroundColor: yellow } }, fields: 'userEnteredFormat.backgroundColor' } },
      { repeatCell: { range: { sheetId, startRowIndex: 4, startColumnIndex: 9, endColumnIndex: 10 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
      { setDataValidation: { range: { sheetId, startRowIndex: 4, startColumnIndex: 9, endColumnIndex: 10 }, rule: { condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '0' }] }, inputMessage: 'Price for one item in USD, product only (no shipping).', strict: true, showCustomUi: true } } },
      { setDataValidation: { range: { sheetId, startRowIndex: 4, startColumnIndex: 10, endColumnIndex: 11 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: AVAILABLE }, { userEnteredValue: NOT_AVAILABLE }] }, strict: true, showCustomUi: true } } },
      ...QUOTE_WIDTHS.map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 44 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: QUOTE_FIRST_ROW - 1, endIndex: 500 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
      { addProtectedRange: { protectedRange: { range: cols(0, 9), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
      { addProtectedRange: { protectedRange: { range: cols(12, 14), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
      { addProtectedRange: { protectedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: 4, startColumnIndex: 9, endColumnIndex: 12 }, description: 'Column headers', editors: { users: [email] } } } },
    ], fetchImpl);
    // Every product so far gets its row (oldest first).
    const all = (await DB.prepare('SELECT p.* FROM portal_products p JOIN users u ON u.id=p.client_id WHERE NOT u.archived ORDER BY p.created_at, p.id').all()).results || [];
    const have = await rowsById(env, fetchImpl), rows = [];
    for (const p of all) {
      if (have.has(Number(p.id))) continue;
      const photos = ((await DB.prepare('SELECT id FROM portal_product_photos WHERE product_id=? ORDER BY id LIMIT 3').bind(p.id).all()).results || []).map(r => Number(r.id));
      const { ai, mn } = quoteCells(env, p, photos), price = p.supplier_price == null ? '' : Number(p.supplier_price), avail = p.status === 'not_available' ? NOT_AVAILABLE : '';
      rows.push([...ai, price, avail, txt(p.status === 'not_available' ? p.note : ''), ...mn]);
      await DB.prepare('UPDATE portal_products SET sheet_price=?, sheet_status=?, sheet_note=? WHERE id=?').bind(norm(price), avail, norm(p.status === 'not_available' ? p.note : ''), p.id).run();
    }
    if (rows.length) await batchValues(env, [{ range: `${QT}!A${QUOTE_FIRST_ROW + have.size}:N${QUOTE_FIRST_ROW + have.size + rows.length - 1}`, values: rows }], fetchImpl);
    await putSetting(DB, TAB, '1');
    return true;
  } catch (e) {
    await DB.prepare('DELETE FROM portal_settings WHERE key=? AND value=?').bind(TAB, 'creating:' + t).run();
    throw e;
  }
}

// Adds or refreshes one product's row (website columns only; the supplier's columns are never overwritten).
export async function syncQuoteRow(DB, env, productId, fetchImpl = fetch) {
  if (!googleSheetsConfigured(env) || await setting(DB, 'supplier_sheet') !== '1') return { enabled: false };
  if (!await ensureQuoteTab(DB, env, fetchImpl)) throw new Error('The Product Quotes tab is being set up. Try again in a minute.');
  const p = await DB.prepare('SELECT p.*, u.archived AS client_archived FROM portal_products p JOIN users u ON u.id=p.client_id WHERE p.id=?').bind(productId).first();
  if (!p || p.client_archived) return { enabled: true, skipped: true };
  const photos = ((await DB.prepare('SELECT id FROM portal_product_photos WHERE product_id=? ORDER BY id LIMIT 3').bind(p.id).all()).results || []).map(r => Number(r.id));
  const { ai, mn } = quoteCells(env, p, photos), row = (await rowsById(env, fetchImpl)).get(Number(p.id));
  if (row) { await batchValues(env, [{ range: `${QT}!A${row}:I${row}`, values: [ai] }, { range: `${QT}!M${row}:N${row}`, values: [mn] }], fetchImpl); return { enabled: true, row }; }
  await sheetsRequest(env, '/values/' + encodeURIComponent(`${QT}!A${QUOTE_FIRST_ROW}:N`) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: [[...ai, '', '', '', ...mn]] }) }, fetchImpl);
  await DB.prepare("UPDATE portal_products SET sheet_price='', sheet_status='', sheet_note='' WHERE id=?").bind(p.id).run();
  return { enabled: true, added: true };
}

// Applies what the supplier typed. The client's price per item = supplier price + the client's fee per order.
export async function applyQuoteRow(DB, p, cells, settings, t = Math.floor(Date.now() / 1000)) {
  const priceText = typeof cells.price === 'number' ? String(cells.price) : norm(cells.price), status = norm(cells.status), note = norm(cells.note).slice(0, 1000);
  if (priceText === norm(p.sheet_price) && status === norm(p.sheet_status) && note === norm(p.sheet_note)) return null;
  await DB.prepare('UPDATE portal_products SET sheet_price=?, sheet_status=?, sheet_note=? WHERE id=?').bind(priceText, status, note, p.id).run();
  let next = null;
  if (/^not available$/i.test(status)) next = { status: 'not_available', unit: null, supplier: null, note: note || 'Not available from the supplier.' };
  else {
    const price = parsePrice(cells.price);
    if (price === null) return priceText ? 'price not a number: ' + priceText : null;
    const fee = Number(p.commission_per_order ?? settings.commission_per_order ?? 0);
    next = { status: 'approved', unit: round2(price + fee), supplier: price, note };
  }
  if (next.status === p.status && Number(next.unit) === Number(p.unit_price) && next.note === norm(p.note) && Number(next.supplier) === Number(p.supplier_price)) return null;
  await DB.prepare('UPDATE portal_products SET status=?, unit_price=?, supplier_price=?, note=?, updated_at=? WHERE id=?').bind(next.status, next.unit, next.supplier, next.note, t, p.id).run();
  await DB.prepare("INSERT INTO portal_product_events(product_id, client_id, actor, detail, created_at) VALUES (?,?,'admin',?,?)").bind(p.id, p.client_id, next.status, t).run();
  return next.status;
}

// Cron: read the supplier's columns and apply changes.
export async function pollQuoteTab(DB, env, settings, fetchImpl = fetch) {
  if (!await ensureQuoteTab(DB, env, fetchImpl)) return { waiting: true, changed: 0 };
  const ranges = [`${QT}!J${QUOTE_FIRST_ROW}:L`, `${QT}!N${QUOTE_FIRST_ROW}:N`].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
  const data = await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE', {}, fetchImpl);
  const [inputs, ids] = (data.valueRanges || []).map(v => v.values || []);
  let changed = 0; const skipped = [];
  for (const [i, r] of (ids || []).entries()) {
    const id = Number(r?.[0]); if (!(id > 0)) continue;
    const p = await DB.prepare('SELECT p.*, u.commission_per_order FROM portal_products p JOIN users u ON u.id=p.client_id WHERE p.id=? AND NOT u.archived').bind(id).first();
    if (!p) continue;
    const out = await applyQuoteRow(DB, p, { price: inputs?.[i]?.[0] ?? '', status: inputs?.[i]?.[1] ?? '', note: inputs?.[i]?.[2] ?? '' }, settings);
    if (out === 'approved' || out === 'not_available') { changed++; await syncQuoteRow(DB, env, id, fetchImpl); }
    else if (out) skipped.push({ productId: id, why: out });
  }
  return { changed, skipped };
}
