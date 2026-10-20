// Supplier "Product Quotes" tab in the connected Google Sheet: product price checks from clients (My Products).
// The website writes one row per product; the supplier fills in the yellow columns and the website reads them
// every minute (from the supplier-sheet cron):
//   J  Price per item (USD) — product only, no shipping. The client sees it + their fee per order.
//      A product with several prices (sizes, colours…) gets one option per line: "Small: 3.20" / "Large: 4.50".
//   K  Shipping per order (USD) — one parcel; added once to an order made from this product.
//   L  Available?           — "Not available" (with a reason in M) instead of a price.
//   M  Supplier note        — optional, shown to the client.
//   N  Competitor price     — what other shops charge, typed by the client (My Products); written by the website.
//      Values typed in the sheet before that were copied to the products once (layout 4).
//   O  Status, P Product ID (hidden) — website columns.
// Layout 2 (16 Oct 2026) added K, layout 3 (19 Oct 2026) added N; the live tab is switched once by ensureQuoteLayout()
// (a column is inserted, nothing moves by hand).
// The supplier never sees who the client is. Admins can still set or change a quote in admin → Products.
import { sheetsRequest, googleSheetsConfig, googleSheetsConfigured } from './google-sheets.mjs';
import { sheetProductPhotoUrl } from './sheet-photos.mjs';

export const QT = 'Product Quotes';
export const QUOTE_FIRST_ROW = 5;
export const QUOTE_HEADERS = ['Requested', 'Request', 'Photo preview', 'Photo 2', 'Photo 3', 'Product link', 'Product name', 'Variation / notes', 'Expected per month',
  'Price per item (USD)', 'Shipping per order (USD)', 'Available?', 'Supplier note', 'Competitor price', 'Status', 'Product ID'];
export const QUOTE_WIDTHS = [95, 80, 130, 80, 80, 115, 180, 220, 95, 120, 120, 125, 220, 150, 120, 60];
export const AVAILABLE = 'Available', NOT_AVAILABLE = 'Not available';
// What the supplier may type for "not available": the dropdown value, or a short X / No / N/A (in Available? or in the price cell).
const NO_WORDS = /^(not available|unavailable|no|n\/?a|x|✗|✕|×|-|—)$/i;
export const notAvailable = (status, priceText) => NO_WORDS.test(norm(status)) || (/^(x|✗|✕|×|n\/?a)$/i.test(norm(priceText)) && !/^available$/i.test(norm(status)));
export const QUOTE_SHEET_SCHEMA = [
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS supplier_price DOUBLE PRECISION',
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS sheet_price TEXT',
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS sheet_status TEXT',
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS sheet_note TEXT',
  // Several prices for one product: JSON [{ label, supplier, unit }] (unit = supplier + the client's fee). NULL = one price.
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS price_options TEXT',
  // Shipping per order from the supplier (one parcel), shown to the client as is and added once to an order.
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS supplier_shipping DOUBLE PRECISION',
  'ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS sheet_shipping TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS quoted_shipping DOUBLE PRECISION',
];
const STATUS = { awaiting_quote: 'Waiting for price', approved: 'Quoted', not_available: 'Not available' };
const TAB = 'quote_tab', OPTIONS_FORMAT = 'quote_tab_options_v1', LAYOUT = 'quote_tab_layout', LAYOUT_NOW = '4';
// Competitor price (N): light blue, open for anyone with the sheet to type in.
const COMP = 13;
const competitorFormat = sheetId => [
  { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: COMP, endColumnIndex: COMP + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.62, green: 0.79, blue: 0.97 }, textFormat: { bold: true } }, note: 'What other shops charge for this product (e.g. "$24.90 on Etsy shop X"). Our client enters it in their portal; the website fills it in.' }, fields: 'userEnteredFormat(backgroundColor,textFormat),note' } },
  { repeatCell: { range: { sheetId, startRowIndex: QUOTE_FIRST_ROW - 1, startColumnIndex: COMP, endColumnIndex: COMP + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.85, green: 0.92, blue: 1 }, numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,numberFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: COMP, endIndex: COMP + 1 }, properties: { pixelSize: QUOTE_WIDTHS[COMP] }, fields: 'pixelSize' } },
];
export const QUOTE_HELP = 'Supplier: these are price checks from our clients before they sell a product. Fill in the yellow columns — Price per item (USD, product only) and Shipping per order (USD, one parcel), or set Available? to Not available and add a note. Several prices (sizes, colours…)? Put one option per line in the price cell, like:  Small: 3.20  (new line)  Large: 4.50. Competitor price (blue) is what other shops charge, from our client. The website updates within a minute.';
export const PRICE_HELP = 'Price for one item in USD, product only (no shipping). Several prices? One option per line, e.g.\nSmall: 3.20\nLarge: 4.50\n(Ctrl+Enter or Alt+Enter starts a new line in the cell; ; also works.)';
export const PRICE_UNCLEAR = 'Price not clear: write Name: price, one per line';
export const SHIPPING_HELP = 'Shipping for one order (one parcel) in USD. Added once to the order, whatever the quantity.';
export const SHIPPING_UNCLEAR = 'Shipping not clear: write a number in USD';

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

// The price cell: one price ("3.20") or several options, one per line / separated by ";" or "|"
// ("Small: 3.20", "Large 4.50", "Blue - $5"). Returns { price } or { options: [{ label, price }] }, or null if unclear.
export function parsePriceOptions(value) {
  if (typeof value === 'number') { const price = parsePrice(value); return price === null ? null : { price }; }
  const parts = norm(value).split(/\r?\n|;|\|/).map(x => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1 && parsePrice(parts[0]) !== null) return { price: parsePrice(parts[0]) };
  if (parts.length > 20) return null;
  const options = [];
  for (const part of parts) {
    const m = /^(.*?)[\s:=\-–—]*((?:\$|USD)?\s*\d[\d,]*(?:\.\d+)?\s*(?:\$|USD)?)$/i.exec(part);
    const price = m ? parsePrice(m[2]) : null;
    if (price === null || (!m[1].trim() && part.trim().startsWith('-'))) return null;
    const label = m[1].replace(/[\s:=\-–—]+$/, '').trim().slice(0, 80) || 'Option ' + (options.length + 1);
    if (options.some(o => o.label.toLowerCase() === label.toLowerCase())) return null;
    options.push({ label, price });
  }
  return options.length === 1 ? { price: options[0].price } : { options };
}

// Website-owned cells of one product row: A–I and M–N.
export function quoteCells(env, p, photoIds) {
  const urls = photoIds.slice(0, 3).map(id => sheetProductPhotoUrl(env, p.id, id));
  const ai = [txt(new Date(Number(p.created_at) * 1000).toISOString().slice(0, 10)), 'P-' + p.id,
    urls[0] ? `=IMAGE("${q(urls[0])}",1)` : '', urls[1] ? `=HYPERLINK("${q(urls[1])}","Photo 2")` : '', urls[2] ? `=HYPERLINK("${q(urls[2])}","Photo 3")` : '',
    p.link ? `=HYPERLINK("${q(p.link)}","Open product")` : '', txt(p.name), txt(p.variant), p.expected_quantity == null ? '' : Number(p.expected_quantity)];
  return { ai, no: [txt(p.competitor_price || ''), STATUS[p.status] || p.status, String(p.id)] };
}

async function tabId(env, f) {
  const meta = await sheetsRequest(env, '?fields=sheets.properties', {}, f);
  return (meta.sheets || []).map(s => s.properties).find(p => p.title === QT)?.sheetId ?? null;
}
async function rowsById(env, f) {
  const data = await sheetsRequest(env, '/values/' + encodeURIComponent(`${QT}!P${QUOTE_FIRST_ROW}:P`) + '?majorDimension=ROWS', {}, f);
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
      const made = await batch(env, [{ addSheet: { properties: { title: QT, index: 1, gridProperties: { rowCount: 500, columnCount: 16, frozenRowCount: 4 } } } }], fetchImpl);
      sheetId = made?.replies?.[0]?.addSheet?.properties?.sheetId ?? await tabId(env, fetchImpl);
    }
    const { email } = googleSheetsConfig(env), cols = (a, b) => ({ sheetId, startColumnIndex: a, endColumnIndex: b });
    const yellow = { red: 1, green: 0.95, blue: 0.7 };
    await batchValues(env, [
      { range: `${QT}!A1:A2`, values: [['Direct Line — Product Quotes'], [QUOTE_HELP]] },
      { range: `${QT}!A4:P4`, values: [QUOTE_HEADERS] },
    ], fetchImpl);
    await batch(env, [
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } },
      { repeatCell: { range: { sheetId, startRowIndex: 3, startColumnIndex: 0, endColumnIndex: 16 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,horizontalAlignment)' } },
      { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 16 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
      { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 9, endColumnIndex: 13 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
      { repeatCell: { range: { sheetId, startRowIndex: 4, startColumnIndex: 9, endColumnIndex: 13 }, cell: { userEnteredFormat: { backgroundColor: yellow } }, fields: 'userEnteredFormat.backgroundColor' } },
      { repeatCell: { range: { sheetId, startRowIndex: 4, startColumnIndex: 9, endColumnIndex: 11 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
      ...priceCellFormat(sheetId),
      ...shippingCellFormat(sheetId),
      { setDataValidation: { range: { sheetId, startRowIndex: 4, startColumnIndex: 11, endColumnIndex: 12 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: AVAILABLE }, { userEnteredValue: NOT_AVAILABLE }] }, strict: true, showCustomUi: true } } },
      ...QUOTE_WIDTHS.map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
      ...competitorFormat(sheetId),
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 15, endIndex: 16 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 44 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: QUOTE_FIRST_ROW - 1, endIndex: 500 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
      { addProtectedRange: { protectedRange: { range: cols(0, 9), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
      { addProtectedRange: { protectedRange: { range: cols(14, 16), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
      { addProtectedRange: { protectedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: 4, startColumnIndex: 9, endColumnIndex: 14 }, description: 'Column headers', editors: { users: [email] } } } },
    ], fetchImpl);
    // Every product so far gets its row (oldest first).
    const all = (await DB.prepare('SELECT p.* FROM portal_products p JOIN users u ON u.id=p.client_id WHERE NOT u.archived ORDER BY p.created_at, p.id').all()).results || [];
    const have = await rowsById(env, fetchImpl), rows = [];
    for (const p of all) {
      if (have.has(Number(p.id))) continue;
      const photos = ((await DB.prepare('SELECT id FROM portal_product_photos WHERE product_id=? ORDER BY id LIMIT 3').bind(p.id).all()).results || []).map(r => Number(r.id));
      const { ai, no } = quoteCells(env, p, photos), price = p.supplier_price == null ? '' : Number(p.supplier_price), ship = p.supplier_shipping == null ? '' : Number(p.supplier_shipping), avail = p.status === 'not_available' ? NOT_AVAILABLE : '';
      rows.push([...ai, price, ship, avail, txt(p.status === 'not_available' ? p.note : ''), ...no]);
      await DB.prepare('UPDATE portal_products SET sheet_price=?, sheet_shipping=?, sheet_status=?, sheet_note=? WHERE id=?').bind(norm(price), norm(ship), avail, norm(p.status === 'not_available' ? p.note : ''), p.id).run();
    }
    if (rows.length) await batchValues(env, [{ range: `${QT}!A${QUOTE_FIRST_ROW + have.size}:P${QUOTE_FIRST_ROW + have.size + rows.length - 1}`, values: rows }], fetchImpl);
    await putSetting(DB, TAB, '1');
    await putSetting(DB, OPTIONS_FORMAT, '1');
    await putSetting(DB, LAYOUT, LAYOUT_NOW);
    return true;
  } catch (e) {
    await DB.prepare('DELETE FROM portal_settings WHERE key=? AND value=?').bind(TAB, 'creating:' + t).run();
    throw e;
  }
}

// The price cell takes text too (several options), so it has no strict number rule: a help message instead.
function priceCellFormat(sheetId) {
  return [
    { setDataValidation: { range: { sheetId, startRowIndex: 4, startColumnIndex: 9, endColumnIndex: 10 }, rule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=TRUE' }] }, inputMessage: PRICE_HELP, strict: false, showCustomUi: false } } },
    { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 9, endColumnIndex: 10 }, cell: { note: PRICE_HELP }, fields: 'note' } },
  ];
}
function shippingCellFormat(sheetId) {
  return [
    { setDataValidation: { range: { sheetId, startRowIndex: 4, startColumnIndex: 10, endColumnIndex: 11 }, rule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=TRUE' }] }, inputMessage: SHIPPING_HELP, strict: false, showCustomUi: false } } },
    { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 10, endColumnIndex: 11 }, cell: { note: SHIPPING_HELP }, fields: 'note' } },
  ];
}
// One-time switches for the live tab, by header: layout 2 inserts column K (Shipping per order) right after the price;
// layout 3 inserts column N (Competitor price) right after the supplier note. Google moves everything right of an
// inserted column (supplier values, Status, Product ID, protections) by itself.
// Safe to retry: each step checks the header first. Must run before the tab is read.
export async function ensureQuoteLayout(DB, env, fetchImpl = fetch) {
  const now = await setting(DB, LAYOUT);
  if (now === LAYOUT_NOW) return false;
  const sheetId = await tabId(env, fetchImpl);
  if (sheetId == null) return false;
  if (!['2', '3'].includes(now) && !await quoteLayout2(DB, env, sheetId, fetchImpl)) return false;
  const head = await sheetsRequest(env, '/values/' + encodeURIComponent(`${QT}!M4:O4`) + '?majorDimension=ROWS', {}, fetchImpl);
  const m4 = norm(head.values?.[0]?.[0]), n4 = norm(head.values?.[0]?.[1]), o4 = norm(head.values?.[0]?.[2]);
  // Already inserted (maybe by a run that stopped before writing the header): N is Competitor price, or empty with Status in O.
  const inserted = n4 === QUOTE_HEADERS[COMP] || (n4 === '' && o4 === 'Status');
  if (!inserted) {
    if (m4 !== 'Supplier note' || n4 !== 'Status') throw new Error('Product Quotes: unexpected headers M4/N4 "' + m4 + '" / "' + n4 + '"; layout switch stopped.');
    await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: COMP, endIndex: COMP + 1 }, inheritFromBefore: true } }], fetchImpl);
  }
  await batchValues(env, [{ range: `${QT}!N4`, values: [[QUOTE_HEADERS[COMP]]] }, { range: `${QT}!A2`, values: [[QUOTE_HELP]] }], fetchImpl);
  await batch(env, competitorFormat(sheetId), fetchImpl);
  // Layout 4: from now on the website writes N from the product; anything typed there before is copied to its product first.
  const ranges = [`${QT}!N${QUOTE_FIRST_ROW}:N`, `${QT}!P${QUOTE_FIRST_ROW}:P`].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
  const [vals, ids] = ((await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS', {}, fetchImpl)).valueRanges || []).map(x => x.values || []);
  for (const [i, r] of (ids || []).entries()) { const v = norm(vals?.[i]?.[0]).slice(0, 200), id = Number(r?.[0]); if (id > 0 && v) await DB.prepare("UPDATE portal_products SET competitor_price=? WHERE id=? AND competitor_price=''").bind(v, id).run(); }
  await putSetting(DB, LAYOUT, LAYOUT_NOW);
  return true;
}
async function quoteLayout2(DB, env, sheetId, fetchImpl) {
  const head = await sheetsRequest(env, '/values/' + encodeURIComponent(`${QT}!J4:L4`) + '?majorDimension=ROWS', {}, fetchImpl);
  const j4 = norm(head.values?.[0]?.[0]), k4 = norm(head.values?.[0]?.[1]), l4 = norm(head.values?.[0]?.[2]);
  if (!j4 && !k4 && !l4) return false; // headers not written yet (tab still being made): nothing to switch
  // Already inserted (maybe by a run that stopped before writing the header): K is the shipping column or empty with Available? in L.
  const inserted = k4 === QUOTE_HEADERS[10] || (k4 === '' && l4 === 'Available?');
  if (!inserted) {
    if (k4 !== 'Available?') throw new Error('Product Quotes: unexpected column K header "' + k4 + '"; layout switch stopped.');
    await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, inheritFromBefore: true } }], fetchImpl);
  }
  await batchValues(env, [{ range: `${QT}!K4`, values: [[QUOTE_HEADERS[10]]] }, { range: `${QT}!A2`, values: [[QUOTE_HELP]] }], fetchImpl);
  await batch(env, [...shippingCellFormat(sheetId),
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: QUOTE_WIDTHS[10] }, fields: 'pixelSize' } }], fetchImpl);
  await putSetting(DB, LAYOUT, '2');
  return true;
}
// One-time switch for the tab that was made before price options existed (only the price cell's rule and the help text change;
// no columns move).
export async function ensureQuoteOptionsFormat(DB, env, fetchImpl = fetch) {
  if (await setting(DB, OPTIONS_FORMAT) === '1') return false;
  const sheetId = await tabId(env, fetchImpl);
  if (sheetId == null) return false;
  await batch(env, priceCellFormat(sheetId), fetchImpl);
  await batchValues(env, [{ range: `${QT}!A2`, values: [[QUOTE_HELP]] }], fetchImpl);
  await putSetting(DB, OPTIONS_FORMAT, '1');
  return true;
}

// Adds or refreshes one product's row (website columns only; the supplier's columns are never overwritten).
export async function syncQuoteRow(DB, env, productId, fetchImpl = fetch) {
  if (!googleSheetsConfigured(env) || await setting(DB, 'supplier_sheet') !== '1') return { enabled: false };
  if (!await ensureQuoteTab(DB, env, fetchImpl)) throw new Error('The Product Quotes tab is being set up. Try again in a minute.');
  await ensureQuoteLayout(DB, env, fetchImpl);
  const p = await DB.prepare('SELECT p.*, u.archived AS client_archived FROM portal_products p JOIN users u ON u.id=p.client_id WHERE p.id=?').bind(productId).first();
  if (!p || p.client_archived) return { enabled: true, skipped: true };
  const photos = ((await DB.prepare('SELECT id FROM portal_product_photos WHERE product_id=? ORDER BY id LIMIT 3').bind(p.id).all()).results || []).map(r => Number(r.id));
  const { ai, no } = quoteCells(env, p, photos), row = (await rowsById(env, fetchImpl)).get(Number(p.id));
  if (row) { await batchValues(env, [{ range: `${QT}!A${row}:I${row}`, values: [ai] }, { range: `${QT}!N${row}:P${row}`, values: [no] }], fetchImpl); return { enabled: true, row }; }
  await sheetsRequest(env, '/values/' + encodeURIComponent(`${QT}!A${QUOTE_FIRST_ROW}:P`) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: [[...ai, '', '', '', '', ...no]] }) }, fetchImpl);
  await DB.prepare("UPDATE portal_products SET sheet_price='', sheet_shipping='', sheet_status='', sheet_note='' WHERE id=?").bind(p.id).run();
  return { enabled: true, added: true };
}

// Applies what the supplier typed. The client's price per item = supplier price + the client's fee per order.
export async function applyQuoteRow(DB, p, cells, settings, t = Math.floor(Date.now() / 1000)) {
  const priceText = typeof cells.price === 'number' ? String(cells.price) : norm(cells.price), status = norm(cells.status), note = norm(cells.note).slice(0, 1000);
  const shipText = typeof cells.shipping === 'number' ? String(cells.shipping) : norm(cells.shipping);
  if (priceText === norm(p.sheet_price) && shipText === norm(p.sheet_shipping) && status === norm(p.sheet_status) && note === norm(p.sheet_note)) return null;
  await DB.prepare('UPDATE portal_products SET sheet_price=?, sheet_shipping=?, sheet_status=?, sheet_note=? WHERE id=?').bind(priceText, shipText, status, note, p.id).run();
  let next = null;
  // Shipping per order: a number, or empty (not given yet). It is passed on as is (the fee is in the price per item).
  const shipping = shipText ? parsePrice(cells.shipping) : null;
  const isNo = notAvailable(status, priceText);
  if (shipText && shipping === null && !isNo) return 'shipping not clear: ' + shipText;
  if (isNo) next = { status: 'not_available', unit: null, supplier: null, note: note || 'Not available from the supplier.' };
  else {
    const parsed = priceText ? parsePriceOptions(cells.price) : null;
    if (!parsed) return priceText ? 'price not clear: ' + priceText : null;
    const fee = Number(p.commission_per_order ?? settings.commission_per_order ?? 0);
    // With options the product's own price is the cheapest one ("from"); each option keeps its own price.
    const options = parsed.options ? parsed.options.map(o => ({ label: o.label, supplier: o.price, unit: round2(o.price + fee) })) : null;
    const supplier = options ? Math.min(...options.map(o => o.supplier)) : parsed.price;
    next = { status: 'approved', unit: round2(supplier + fee), supplier, note, options: options ? JSON.stringify(options) : null };
  }
  next.options = next.options ?? null; next.shipping = next.status === 'approved' ? shipping : null;
  const sameShip = (next.shipping ?? null) === (p.supplier_shipping == null ? null : Number(p.supplier_shipping));
  if (next.status === p.status && Number(next.unit) === Number(p.unit_price) && next.note === norm(p.note) && Number(next.supplier) === Number(p.supplier_price) && next.options === (p.price_options ?? null) && sameShip) return null;
  await DB.prepare('UPDATE portal_products SET status=?, unit_price=?, supplier_price=?, note=?, price_options=?, supplier_shipping=?, updated_at=? WHERE id=?').bind(next.status, next.unit, next.supplier, next.note, next.options, next.shipping, t, p.id).run();
  await DB.prepare("INSERT INTO portal_product_events(product_id, client_id, actor, detail, created_at) VALUES (?,?,'admin',?,?)").bind(p.id, p.client_id, next.status, t).run();
  return next.status;
}

// Cron: read the supplier's columns and apply changes.
export async function pollQuoteTab(DB, env, settings, fetchImpl = fetch) {
  if (!await ensureQuoteTab(DB, env, fetchImpl)) return { waiting: true, changed: 0 };
  await ensureQuoteOptionsFormat(DB, env, fetchImpl);
  await ensureQuoteLayout(DB, env, fetchImpl);
  if (await setting(DB, 'quote_reread_v1') !== '1') {
    await DB.prepare("UPDATE portal_products SET sheet_status=NULL WHERE status='awaiting_quote'").run();
    await putSetting(DB, 'quote_reread_v1', '1');
  }
  const ranges = [`${QT}!J${QUOTE_FIRST_ROW}:M`, `${QT}!P${QUOTE_FIRST_ROW}:P`].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
  const data = await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE', {}, fetchImpl);
  const [inputs, ids] = (data.valueRanges || []).map(v => v.values || []);
  let changed = 0; const skipped = [];
  for (const [i, r] of (ids || []).entries()) {
    const id = Number(r?.[0]); if (!(id > 0)) continue;
    const p = await DB.prepare('SELECT p.*, u.commission_per_order FROM portal_products p JOIN users u ON u.id=p.client_id WHERE p.id=? AND NOT u.archived').bind(id).first();
    if (!p) continue;
    const out = await applyQuoteRow(DB, p, { price: inputs?.[i]?.[0] ?? '', shipping: inputs?.[i]?.[1] ?? '', status: inputs?.[i]?.[2] ?? '', note: inputs?.[i]?.[3] ?? '' }, settings);
    if (out === 'approved' || out === 'not_available') { changed++; await syncQuoteRow(DB, env, id, fetchImpl); }
    else if (out) {
      skipped.push({ productId: id, why: out });
      // Tell the supplier in the Status column (the website's own column) that the price wasn't understood.
      const row = QUOTE_FIRST_ROW + i;
      await batchValues(env, [{ range: `${QT}!O${row}`, values: [[out.startsWith('shipping') ? SHIPPING_UNCLEAR : PRICE_UNCLEAR]] }], fetchImpl);
    }
  }
  return { changed, skipped };
}
