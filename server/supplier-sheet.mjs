// Supplier Work Queue: the first tab of the connected Google Sheet, written by the website, one row per
// active order (matched by the hidden Order ID column, so sorting/filtering by the supplier is safe).
// The supplier fills in four columns; the website reads them every minute (cron) and applies changes:
//   P  Total cost (USD)  — the whole order, product + shipping. Client is billed total + commission.
//   Q  Tracking number   — copied to the order.
//   R  Courier           — e.g. China Post, Yanwen (dropdown from Fees & settings; other names can be typed). Shown to the client.
//   S  Shipping status   — "Shipped" moves the order to Shipped (client is notified).
//   T  Delayed?          — "Possibly delayed" marks the order as possibly delayed (client is notified, with U).
//   U  Delay reason      — short reason shown to the client (e.g. "Wrong variant from the factory, being remade").
// The website never writes P, T or U, and writes Q/R/S only when an admin changes tracking/courier/status on the website.
// L Tax number (e.g. Etsy's IOSS number) and M Gift message are the customer's, kept apart from the Notes (N).
// O Competitor price: what other shops charge, typed by the client in their portal (order form / Your numbers);
//   the website writes it like A–N. Values typed in the sheet before that were copied to the orders once (layout 4).
// There is no Country column: the country is the last line of the delivery address.
// Sheets made before this layout are switched over once (see ensureLayout).
// sheet_cost / sheet_tracking / sheet_shipped hold the last value seen in (or written to) each cell, so a
// change is applied once, and a supplier's edit is never overwritten by an older website value.
// Nothing here runs until an admin presses "Set up supplier sheet" (portal_settings supplier_sheet = '1').
import { paidLabels, PAID, NOT_PAID } from './payment-orders.mjs';
import { sheetsRequest, googleSheetsConfig, googleSheetsConfigured, syncPortalOrderToGoogleSheet } from './google-sheets.mjs';
import { changeStatus, statusAt } from './order-status.mjs';
import { sheetPhotoUrl, sheetCollageUrl } from './sheet-photos.mjs';
import { splitOldNotes } from './order-notes.mjs';
import { pollQuoteTab, QT } from './quote-sheet.mjs';
import { createHash } from 'node:crypto';
import { rememberPrice, backfillSavedPrices } from './saved-prices.mjs';
import { bi, en, GUIDE, GUIDE_TAB } from './sheet-zh.mjs';
import { quoteZh } from './quote-sheet.mjs';
import { competitorCell, offerFromSheet, supplierKeeps, doneText, NO_WORD, noReason, REVISION_FLAG, REVISION_SENT, REVISION_DONE } from './cost-revisions.mjs';
import { itemPrices } from './item-costs.mjs';

export const SUPPLIER_SHEET_SCHEMA = [
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS supplier_cost DOUBLE PRECISION',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_cost TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_tracking TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_shipped TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS courier TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_courier TEXT',
  // Possibly delayed (set by the supplier in T/U): delayed_at is set while the flag is on.
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS delayed_at INTEGER',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS delay_reason TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_delayed TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_delay_reason TEXT',
  // AG Domestic Express Tracking Number, as the supplier typed it (shown in admin; 26 Oct 2026).
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS domestic_tracking TEXT',
  // AH Cancellation fee (USD) the supplier charges for a cancelled order (Erwin, 26 Oct 2026); the admin approves it.
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS supplier_cancel_fee DOUBLE PRECISION',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_cancel_fee TEXT',
  // B (Order) as the website last wrote it: a row whose B no longer matches is out of line (see rowOutOfLine).
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_ref TEXT',
  // AI Cost per product (USD), as the supplier typed it (Erwin, 30 Oct 2026); see itemPrices in portal.mjs.
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS item_costs TEXT',
];

export const WQ = 'Work Queue';
// Tab names (Erwin, 21 Oct 2026): the supplier tab is called "Orders", which suppliers and clients understand. The
// website's own hidden order log was already called "Orders", so it becomes "Order Log" first. ensureTabNames() renames
// them in two steps at least 10 minutes apart and keeps where it is in portal_settings. Every request reads that state:
// a request that still uses an old name writes to a tab that no longer exists (it fails and is retried), never into
// the wrong tab.
export const WQ_NEW = 'Orders', LOG_OLD = 'Orders', LOG_NEW = 'Order Log', TAB_NAMES = 'sheet_tab_names';
const TAB_GAP = 600;
export async function tabNames(DB) {
  const v = String((await DB.prepare('SELECT value FROM portal_settings WHERE key=?').bind(TAB_NAMES).first())?.value || '');
  return { wq: v === 'done' ? WQ_NEW : WQ, log: /^(log:|migrating-2:|done)/.test(v) ? LOG_NEW : LOG_OLD };
}
const BACKUP_TITLE = 'Work Queue (old formulas)';
// Shipped and Cancelled tabs (Erwin, 29 Oct 2026: "what the supplier wants to see first is the new orders and in progress
// orders that are not yet shipped"). The supplier tab keeps the orders still to do, newest on top; an order moves to
// "Shipped" once it is shipped and has a tracking number, and to "Cancelled" when it is cancelled. The three tabs have the
// same columns and the website reads and writes all of them (the supplier can still fix a tracking number or type a
// cancellation fee there). Rows are always found by their order id (AE), never by position.
export const SHIPPED_TAB = 'Shipped', CANCELLED_TAB = 'Cancelled';
export const tabFor = (o, wq) => o.status === 'cancelled' ? CANCELLED_TAB : ['shipped', 'delivered'].includes(o.status) && norm(o.tracking_number) ? SHIPPED_TAB : wq;
const allTabs = wq => [wq, SHIPPED_TAB, CANCELLED_TAB];
export const FIRST_ROW = 6;
// AG (Ye, 25 Oct 2026): the supplier's domestic express tracking in China. Supplier-typed; the website never reads or writes it.
export const DOMESTIC = 'Domestic Express Tracking Number';
// AH (Erwin, 26 Oct 2026): the supplier's cancellation fee for a cancelled / cancel-requested order. Read by the website;
// the admin approves it and the client pays exactly that (no Direct Line fee on cancellations).
export const CANCEL_FEE = 'Cancellation fee (USD)';
// AJ (Erwin, 8 Nov 2026): when the order's status last changed, written by the website, so the sheet can be sorted by it.
export const STATUS_DATE = 'Status changed';
// Cost per product (Erwin, 30 Oct 2026: the client wants each product's cost on an order with several products): the
// supplier types one cost per product, in the order of Product 1, 2, 3 in Product / variation, e.g. "10.90, 9.00, 11.00".
// Copied as typed. Added at the far right (AI, layout 18), moved next to Total cost (Q, layout 19, Erwin 30 Oct 2026).
export const ITEM_COSTS = 'Cost per product (USD)';
const HEAD_A_O = ['Date', 'Order', 'Shop', 'Status', 'Photo preview', 'Photo 1', 'Product link', 'Qty', 'Product / variation',
  'Customer', 'Delivery address & phone', 'Tax number', 'Gift message', 'Notes', 'Competitor price'];
const HEAD_PHOTOS_IDS = ['Photo 2', 'Photo 3', 'Photo 4', 'Photo 5', 'Photo 6', 'Photo 7', 'Photo 8', 'More product links', 'Order ID', 'Client ID'];
// A-O website, P-V supplier, W-AG website (Client paid, photos, links, ids), AH-AI supplier.
export const HEADERS = [...HEAD_A_O, 'Total cost (USD)', ITEM_COSTS, 'Tracking number', 'Courier', 'Shipping status', 'Delayed?', 'Delay reason',
  'Client paid', ...HEAD_PHOTOS_IDS, DOMESTIC, CANCEL_FEE, STATUS_DATE];
// Layout 18 (Cost per product in AI): only used to bring an older sheet up to layout 18 before the layout 19 move.
export const HEADERS_18 = [...HEAD_A_O, 'Total cost (USD)', 'Tracking number', 'Courier', 'Shipping status', 'Delayed?', 'Delay reason',
  'Client paid', ...HEAD_PHOTOS_IDS, DOMESTIC, CANCEL_FEE, ITEM_COSTS];
// CANCELLED_SHIP: written by the website in Shipping status for cancelled orders (Erwin, 26 Oct 2026: the supplier
// filters them to sort out refunds per store). Picking it in the sheet does not cancel anything on the website.
// REFUNDED_SHIP (Erwin, 29 Oct 2026): a cancelled order our client had paid for (Client paid = Paid) says "Refunded".
export const REFUNDED_SHIP = 'Refunded';
export const SHIPPED = 'Shipped', NOT_SHIPPED = 'Not shipped', CANCELLED_SHIP = 'Cancelled', CANCEL_REQ_SHIP = 'Cancel requested', DELAYED = 'Possibly delayed', ON_TIME = 'On time';
const STATUS = { pending: 'Pending', processing: 'In Progress', shipped: 'Shipped', delivered: 'Delivered', cancellation_requested: 'Cancellation requested', cancelled: 'CANCELLED - do not ship' };
const SETTING = 'supplier_sheet', LAST = 'supplier_sheet_last', LAYOUT = 'supplier_sheet_layout', LAYOUT_NOW = '22';
// Set when a payment changes; the next poll rewrites the Client paid column (V) in one write.
const PAID_DIRTY = 'supplier_sheet_paid_dirty';
const markPaidDirtyDb = DB => DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(PAID_DIRTY, String(Date.now())).run();
// Also tells the minute cron (which otherwise only reads the sheet) to do a full check next time.
export const markPaidDirty = async (DB, env) => { await markPaidDirtyDb(DB); if (env && googleSheetsConfigured(env)) await forceFullSupplierCheck(env).catch(e => console.error('Supplier sheet mark not reset', e)); };
export const DEFAULT_COURIERS = 'China Post\nYanwen';
export const courierList = v => [...new Set(String(v ?? DEFAULT_COURIERS).split(/[\n,]/).map(x => x.trim()).filter(Boolean))].slice(0, 30);

const round2 = n => Math.round(Number(n) * 100) / 100;
const norm = v => (v === null || v === undefined ? '' : String(v).trim());
// Cells written with USER_ENTERED: text that looks like a formula, number or date is kept as typed text.
const txt = v => { const s = norm(v); return /^[=+\-@0-9]/.test(s) ? "'" + s : s; };
const q = s => String(s).replace(/"/g, '""');
const isShipped = v => /^shipped$/i.test(norm(v));
// T "Delayed?": the dropdown value, or anything that clearly means yes (a ticked checkbox, "yes", "delayed").
export const isDelayed = v => v === true || /^(possibly delayed|delayed|yes|y|true)$/i.test(norm(v));

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
// Same list as the website's country picker (dist/p/common.js); other countries are saved by name.
const COUNTRY_NAMES = {"US":"United States","DE":"Germany","CA":"Canada","AU":"Australia","UK":"United Kingdom","NL":"Netherlands","CH":"Switzerland","IT":"Italy","NO":"Norway","AT":"Austria","DK":"Denmark","ES":"Spain","FR":"France","PL":"Poland","BE":"Belgium","BG":"Bulgaria","CZ":"Czechia","LV":"Latvia","PT":"Portugal","SK":"Slovakia","IL":"Israel"};
const ALIASES = { US: ['usa', 'us', 'united states of america', 'u s a'], UK: ['uk', 'gb', 'great britain'] };
const nameKey = x => norm(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// There is no Country column: the country goes at the end of the address, unless the client's text already has it.
export function addressLines(o) {
  const lines = [o.address_line_1, o.address_line_2, o.city, o.region, o.postal_code, o.buyer_phone].flatMap(v => norm(v).split(/\r?\n/)).map(norm).filter(Boolean);
  const code = norm(o.destination), name = COUNTRY_NAMES[code] || code;
  const names = [nameKey(name), nameKey(code), ...(ALIASES[code] || [])].filter(Boolean), keys = lines.map(nameKey);
  if (name && !keys.some(k => names.some(n => k === n || k.endsWith(' ' + n)))) lines.push(name);
  return lines.join('\n');
}
// No "ADDRESS CHANGED" warning in the supplier's notes any more (Erwin, 16 Oct 2026): the row always shows the current address.
// The total cost was filled in from an earlier identical order: say so until the supplier changes it or it ships.
export function savedPriceFlag(o) {
  if (o.price_source !== 'saved' || !['pending', 'processing'].includes(o.status)) return '';
  return 'Total cost filled in from an earlier order (same product, variation, country and quantity). Change it if this one is different.\n总成本取自之前的相同订单（同样的商品、款式、国家和数量）。如果这单不同，请修改。\n';
}
// Website-owned cells: A–O and W–AG (P–V are the supplier's; W is Client paid). Column C is the shop the order came from — suppliers don't see who our clients are.
// Photo per order line (Erwin, 1 Nov 2026): on an order with several lines and at least one line photo, the preview
// (E) shows all line photos in one picture numbered 1, 2, 3, the variation text (I) numbers its lines the same way
// ("#2 1 × Golden Bronze"), F opens the big picture and the photo links say which line they show.
const orderLines = o => { try { const a = o.items ? JSON.parse(o.items) : null; return Array.isArray(a) ? a : []; } catch { return []; } };
export function numberedLines(items) {
  const links = [...new Set(items.map(i => i.link).filter(Boolean))];
  const line = i => `#${items.indexOf(i) + 1} ${i.variant ? `${i.quantity} × ${i.variant}` : `${i.quantity} pcs`}`;
  return links.length > 1 ? links.map((l, n) => [`Product ${n + 1}:`, ...items.filter(i => i.link === l).map(line)].join('\n')).join('\n') : items.map(line).join('\n');
}
export function linePhotos(o, photos) {
  const items = orderLines(o);
  if (items.length < 2 || !photos.some(p => p.item_index != null)) return null;
  return items.map((_, i) => [i + 1, photos.find(p => Number(p.item_index) === i + 1)?.id ?? null]);
}
export function websiteCells(env, o, photos, shopName) {
  const urls = photos.map(p => sheetPhotoUrl(env, o.id, p.id)), lines = linePhotos(o, photos);
  const links = String(o.etsy_url || '').split(/\s+/).filter(Boolean);
  const product = [o.item_title, lines ? numberedLines(orderLines(o)) : o.variant].map(norm).filter(Boolean).join(' · ');
  const preview = lines ? `=IMAGE("${q(sheetCollageUrl(env, o.id, lines))}",1)` : urls[0] ? `=IMAGE("${q(urls[0])}&size=thumb",1)` : '';
  const first = lines ? `=HYPERLINK("${q(sheetCollageUrl(env, o.id, lines, true))}","All ${lines.length} photos")` : urls[0] ? `=HYPERLINK("${q(urls[0])}","Photo 1")` : '';
  const label = (p, n) => (p?.item_index != null && lines ? `Photo #${p.item_index}` : `Photo ${n}`);
  const am = [
    txt(o.order_date || new Date(Number(o.created_at) * 1000).toISOString().slice(0, 10)), txt(o.order_ref || '#' + o.id), txt(shopName),
    STATUS[o.status] || o.status, preview, first,
    links[0] ? `=HYPERLINK("${q(links[0])}","${links.length > 1 ? 'Open product 1' : 'Open product'}")` : '', Number(o.quantity || 1), txt(product), txt(o.buyer_name),
    txt(addressLines(o)), txt(o.tax_number), txt(o.gift_message), txt(savedPriceFlag(o) + (o.notes || '')), txt(competitorCell(o.competitor_price, o.revision_status, o.supplier_cost, o.revision_done)),
  ];
  const qz = [o.client_paid || '', ...Array.from({ length: 7 }, (_, i) => urls[i + 1] ? `=HYPERLINK("${q(urls[i + 1])}","${label(photos[i + 1], i + 2)}")` : ''),
    txt(links.slice(1).map((l, i) => `Product ${i + 2}: ${l}`).join('\n')), String(o.id), String(o.client_id)];
  return { am, qz };
}

const sheetIdCache = new Map(), cacheKey = (env, tab) => googleSheetsConfig(env).spreadsheetId + '|' + tab;
async function workQueueSheetId(env, fetchImpl, fresh, wq = WQ) {
  if (!fresh && sheetIdCache.get(cacheKey(env, wq)) != null) return sheetIdCache.get(cacheKey(env, wq));
  const meta = await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl);
  const s = (meta.sheets || []).find(x => x.properties?.title === wq);
  if (s) sheetIdCache.set(cacheKey(env, wq), s.properties.sheetId); else sheetIdCache.delete(cacheKey(env, wq));
  return s ? s.properties.sheetId : null;
}
// Order ids (AF), client ids (AG) and the Order cell (B) of the rows of several tabs, in one read.
async function idRows(env, fetchImpl, tabs) {
  const ranges = tabs.flatMap(t => [`${t}!${L(C.ID)}${FIRST_ROW}:${L(C.CLIENT)}`, `${t}!B${FIRST_ROW}:B`]).map(r => 'ranges=' + encodeURIComponent(r)).join('&');
  const v = ((await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE', {}, fetchImpl)).valueRanges || []).map(x => x.values || []);
  return tabs.flatMap((tab, k) => v[k * 2].map((r, i) => ({ tab, row: FIRST_ROW + i, orderId: Number(r?.[0]), clientId: Number(r?.[1]), ref: v[k * 2 + 1][i]?.[0] ?? '' })));
}
// Split rows (29 Oct 2026): the supplier sorted a tab with a filter that did not cover the hidden id columns, so Google
// moved A-AD but left the order ids (AE) where they were; the website then rewrote its cells by id and read the supplier's
// cost / tracking from other orders. Every row now carries a check: B (Order) must still be what the website last wrote
// for the order in AE. If not, the row is out of line: nothing is read from it or written to it, and the admin is told.
const cellStr = v => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : norm(v));
const refOf = o => norm(o.order_ref || '#' + o.id);
export const rowOutOfLine = (row, o) => !!norm(o?.sheet_ref) && cellStr(row.ref) !== norm(o.sheet_ref);
// The filter (header arrows) covers every column, so sorting in the sheet always moves whole rows.
const fullFilter = (sheetId, c = C) => ({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 4, startColumnIndex: 0, endColumnIndex: c.END } } } });
const batchValues = (env, data, fetchImpl) => sheetsRequest(env, '/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) }, fetchImpl);
const batch = (env, requests, fetchImpl) => sheetsRequest(env, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) }, fetchImpl);
// Column widths (px) for A–AI, sized to their content. AF–AG (ids) are hidden; X–AE (more photos/links) are grouped.
export const WIDTHS = [95, 125, 135, 110, 130, 80, 115, 55, 170, 140, 230, 150, 220, 260, 150, 115, 150, 180, 120, 125, 125, 220, 100, 80, 80, 80, 80, 80, 80, 80, 220, 60, 60, 190, 150, 140];
const WIDTHS_18 = [...WIDTHS.slice(0, 16), ...WIDTHS.slice(17, 35), WIDTHS[16]];
// Where each column is (zero-based) in a layout. Everything that writes formats, rules or ranges takes one (default: now).
const columns = (h, widths) => { const at = n => h.indexOf(n); return { h, widths, COMP: at('Competitor price'), COST: at('Total cost (USD)'), ITEMS: at(ITEM_COSTS),
  TRACK: at('Tracking number'), COURIER: at('Courier'), SHIP: at('Shipping status'), DELAY: at('Delayed?'), REASON: at('Delay reason'), PAIDC: at('Client paid'),
  PHOTO2: at('Photo 2'), MORE: at('More product links'), ID: at('Order ID'), CLIENT: at('Client ID'), DOM: at(DOMESTIC), FEE: at(CANCEL_FEE), CHANGED: at(STATUS_DATE), END: h.length }; };
const C = columns(HEADERS, WIDTHS), C18 = columns(HEADERS_18, WIDTHS_18);
const L = i => colName(i);
// Row height that fits the wrapped text of a row (about 7 px per character at the default font), at least
// 100 px for the photo preview.
export function rowPx(cells) {
  let lines = 1;
  // A numbered picture of the line photos (two per row) needs a taller row to stay readable.
  const min = String(cells[4] || '').includes('/lines?') ? 150 : 100;
  cells.slice(0, 18).forEach((v, i) => {
    if (typeof v !== 'string' || v.startsWith('=')) return;
    const perLine = Math.max(4, Math.floor((WIDTHS[i] - 12) / 7));
    lines = Math.max(lines, v.replace(/^'/, '').split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(wide(part) / perLine)), 0));
  });
  return Math.min(600, Math.max(min, lines * 17 + 16));
}
// Chinese characters (and full-width punctuation) take about two Latin characters of width.
const wide = s => s.length + (s.match(/[\u2e80-\u9fff\uff00-\uffef]/g) || []).length;
const rowHeight = (sheetId, row, px) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row }, properties: { pixelSize: px }, fields: 'pixelSize' } });

async function deleteRows(env, rows, fetchImpl, wq) {
  if (!rows.length) return;
  const sheetId = await workQueueSheetId(env, fetchImpl, false, wq);
  if (sheetId == null) return;
  await batch(env, deleteRowRequests(sheetId, rows), fetchImpl);
}
// Bottom-up so earlier deletions don't move later rows; rows next to each other go in one request.
function deleteRowRequests(sheetId, rows) {
  const out = [];
  for (const r of [...new Set(rows)].sort((a, b) => b - a)) {
    const last = out.at(-1)?.deleteDimension.range;
    if (last && last.startIndex === r) last.startIndex = r - 1;
    else out.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } });
  }
  return out;
}
const moveRow = (sheetId, from, to) => ({ moveDimension: { source: { sheetId, dimension: 'ROWS', startIndex: from - 1, endIndex: from }, destinationIndex: to - 1 } });
export const removeClientFromWorkQueue = (DB, env, clientId, fetchImpl = fetch) => withOrderLock(DB, ROWS_LOCK, () => removeClientNow(DB, env, clientId, fetchImpl));
async function removeClientNow(DB, env, clientId, fetchImpl) {
  if (!await supplierSheetEnabled(DB)) return;
  if (!await ensureLayout(DB, env, fetchImpl)) throw new Error('The supplier sheet is being updated. Please try again in a minute.');
  const { wq } = await tabNames(DB), rows = (await idRows(env, fetchImpl, allTabs(wq))).filter(r => r.clientId === Number(clientId));
  for (const tab of allTabs(wq)) await deleteRows(env, rows.filter(r => r.tab === tab).map(r => r.row), fetchImpl, tab);
}

// ---------- layout ----------
const getSetting = async (DB, key) => (await DB.prepare('SELECT value FROM portal_settings WHERE key=?').bind(key).first())?.value;
const putSetting = (DB, key, value) => DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run();
// Row 3 (3 Nov 2026): two short lines, English and Chinese; how everything works is in the Guide tab.
const instructions = 'Fill in the YELLOW columns. The website reads them within a minute. How everything works: see the "Guide 使用说明" tab.\n请填写黄色的列，网站一分钟内会读取。完整说明请看「Guide 使用说明」标签页。';
const tabText = {
  [SHIPPED_TAB]: ['Direct Line — Shipped orders 已发货订单', 'Shipped orders with a tracking number, newest on top. You can still correct the Total cost, Tracking number or Courier here. Guide: see the "Guide 使用说明" tab.\n已发货并有运单号的订单，最新的在最上面。这里仍然可以修改总成本、运单号或快递公司。说明请看「Guide 使用说明」标签页。'],
  [CANCELLED_TAB]: ['Direct Line — Cancelled orders 已取消订单', 'Cancelled orders: do not buy or ship them. If you charge a cancellation fee, type it in Cancellation fee (USD), the last yellow column. Shipping status says Refunded when our client had already paid.\n已取消的订单：不要购买或发货。如果收取取消费，请填在最后一个黄色列“取消费（美元）”。如果客户已经付款，发货状态会显示 Refunded（已退款）。'],
};
// Competitor price (O): light blue, open for anyone with the sheet to type in.
const COMP = C.COMP, blue = { red: 0.85, green: 0.92, blue: 1 }, blueHead = { red: 0.62, green: 0.79, blue: 0.97 };
const competitorFormat = sheetId => [
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: COMP, endColumnIndex: COMP + 1 }, cell: { userEnteredFormat: { backgroundColor: blueHead, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
  { repeatCell: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: COMP, endColumnIndex: COMP + 1 }, cell: { userEnteredFormat: { backgroundColor: blue, numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,numberFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: COMP, endColumnIndex: COMP + 1 }, cell: { note: 'What other shops charge for this product (e.g. "$24.90 on Etsy shop X"). Our client enters it in their portal; the website fills it in.\n我们的客户销售这个商品的价格（例如 "$24.90 on Etsy shop X"）。客户在网站上填写，网站自动填到这里。' }, fields: 'note' } },
  { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: COMP, endIndex: COMP + 1 }, properties: { pixelSize: WIDTHS[COMP] }, fields: 'pixelSize' } },
];
// Client paid (W): green Paid / orange Not paid, and totals of the supplier's Total cost in row 4, worked out by the sheet.
const green = { red: 0.85, green: 0.94, blue: 0.87 }, orange = { red: 1, green: 0.9, blue: 0.8 };
const paidFormat = (sheetId, c = C) => { const PAIDCOL = c.PAIDC; return [
  ...[[PAID, green], [NOT_PAID, orange]].map(([v, bg], i) => ({ addConditionalFormatRule: { index: i, rule: { ranges: [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: PAIDCOL, endColumnIndex: PAIDCOL + 1 }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: v }] }, format: { backgroundColor: bg, textFormat: { bold: true } } } } } })),
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: PAIDCOL, endColumnIndex: PAIDCOL + 1 }, cell: { note: 'Paid = our client has paid Direct Line for this order. Not paid = billed, not paid yet. Empty = no bill yet. Filled in by the website.\nPaid = 客户已经付款给 Direct Line。Not paid = 已出账单但还没付款。空白 = 还没有账单。由网站自动填写。' }, fields: 'note' } },
  { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 14, endColumnIndex: PAIDCOL + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, verticalAlignment: 'MIDDLE', wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy)' } },
  { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 14, endColumnIndex: 15 }, cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.horizontalAlignment' } },
  { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 15, endColumnIndex: 16 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
  { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: PAIDCOL, endIndex: PAIDCOL + 1 }, properties: { pixelSize: c.widths[PAIDCOL] }, fields: 'pixelSize' } },
]; };
// Row 4 formulas read the order rows through INDIRECT (29 Oct 2026): a plain P6:P moves when rows are deleted at the top
// (the Cancelled copy read from row 29 after the split), INDIRECT("P6:P") always starts at row 6.
const all = c => `INDIRECT("${c}${FIRST_ROW}:${c}")`;
// O4 label, P4 total, the next cells paid / not paid / cancelled, the delayed count above Delayed?, the not paid count above Client paid.
const totalsRow = (wq, c = C) => {
  const P = L(c.COST), V = L(c.PAIDC), cells = Array(c.PAIDC - c.COMP + 1).fill('');
  // English on the first line, Chinese on the second (3 Nov 2026).
  const zh = t => `&CHAR(10)&"${t}"`;
  [cells[0], cells[1], cells[2], cells[3], cells[4]] = ['Totals (USD):\n合计（美元）：', `=SUM(${all(P)})`, `="Paid by clients: "&TEXT(SUMIF(${all(V)},"${PAID}",${all(P)}),"$#,##0.00")${zh('客户已付款')}`,
    `="Not paid yet: "&TEXT(SUMIF(${all(V)},"${NOT_PAID}",${all(P)}),"$#,##0.00")${zh('未付款')}`, `=COUNTIF(${all('D')},"${STATUS.cancelled}")&" cancelled"${zh('已取消')}`];
  cells[c.DELAY - c.COMP] = `=COUNTIF(${all(L(c.DELAY))},"${DELAYED}")&" delayed"${zh('延迟')}`; cells[c.PAIDC - c.COMP] = `=COUNTIF(${all(V)},"${NOT_PAID}")&" not paid"${zh('未付款')}`;
  return { range: `${wq}!${L(c.COMP)}4:${V}4`, values: [cells] };
};
// Delayed? (U) dropdown + Delay reason (V): yellow supplier columns; a delayed row's U turns orange.
const delayFormat = (sheetId, email, c = C) => { const DELAY = c.DELAY; return [
  { setDataValidation: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: DELAY, endColumnIndex: DELAY + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: ON_TIME }, { userEnteredValue: DELAYED }] }, inputMessage: 'Will this order be late? Pick Possibly delayed and write the reason in the next column. Our client sees both.\n订单会晚发吗？选择 Possibly delayed（可能延迟），并在下一列写原因。客户能看到。', strict: false, showCustomUi: true } } },
  { setDataValidation: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: DELAY + 1, endColumnIndex: DELAY + 2 } } },
  { repeatCell: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: DELAY + 1, endColumnIndex: DELAY + 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(numberFormat,wrapStrategy,horizontalAlignment)' } },
  { addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: DELAY, endColumnIndex: DELAY + 1 }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: DELAYED }] }, format: { backgroundColor: { red: 0.98, green: 0.72, blue: 0.5 }, textFormat: { bold: true } } } } } },
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: DELAY, endColumnIndex: DELAY + 1 }, cell: { note: 'Possibly delayed = this order will be late. Write a short reason in Delay reason; our client sees both in their portal. Set it back to On time (or empty) when it is moving again.\nPossibly delayed（可能延迟）= 这个订单会晚发。请在“延迟原因”写简短原因，客户能看到。恢复正常后改回 On time（准时）或留空。' }, fields: 'note' } },
  ...(email ? [{ addProtectedRange: { protectedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: 5, startColumnIndex: DELAY, endColumnIndex: DELAY + 2 }, description: 'Column headers', editors: { users: [email] } } } }] : []),
  ...[DELAY, DELAY + 1].map(i => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c.widths[i] }, fields: 'pixelSize' } })),
]; };
// Cancelled orders (Erwin, 23 Oct 2026): the whole row turns red and is struck through, and the Status cell (D) is
// bold white on red, so the supplier can't miss them. "Cancellation requested" rows turn orange. Rules on the status
// text in D; they come first (index 0-2), so they win over the paid / delayed colours on those rows.
// Competitor price (O) in orange while the client asks for a cost revision (Erwin, 27 Oct 2026; text starts with REVISION_FLAG).
const revisionFormat = sheetId => ({ addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: COMP, endColumnIndex: COMP + 1 }], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: REVISION_FLAG }] }, format: { backgroundColor: { red: 1, green: 0.62, blue: 0.25 }, textFormat: { bold: true } } } } } });
// Cost revision alerts for the supplier (Erwin, 28 Oct 2026): A4 counts the open requests (big orange text, empty
// when none) and every row with an open request is light orange, so they can't be missed or filtered out of sight.
// Duplicates (Erwin, 2 Nov 2026): the same order number or tracking number on two rows of Orders + Shipped (cancelled
// orders don't count). Whole columns of the other tabs (no row numbers: fixRuleRanges re-points row numbers).
const DUP_TABS = [WQ_NEW, SHIPPED_TAB];
const seenIn = (col, v) => DUP_TABS.map(t => `COUNTIF(INDIRECT("'${t}'!${col}:${col}"),${v})`).join('+');
const dupCount = () => { const b = all('B'), r = all(L(C.TRACK));
  return `SUMPRODUCT(((${b}<>"")*((${seenIn('B', b)})>1)+(${r}<>"")*((${seenIn(L(C.TRACK), r)})>1)>0)*1)`; };
const revisionCounter = wq => { const rev = `COUNTIF(${all('O')},"${REVISION_FLAG}*")`, revText = `IF(${rev}=0,"","⚠ "&${rev}&" COST REVISION REQUEST(S) WAITING: see the orange rows, type the new Total cost or NO + reason  ·  "&${rev}&" 个降价请求等待回复：请看橙色行，填写新的总成本，或写 NO 和原因")`;
  if (wq === CANCELLED_TAB) return { range: `${wq}!A4`, values: [[`=TEXTJOIN(CHAR(10),TRUE,${newCancelText(true)},${revText})`]] };
  const dupText = `IF(${dupCount()}=0,"","⚠ "&${dupCount()}&" ROW(S) WITH A DUPLICATE ORDER OR TRACKING NUMBER: see the red rows  ·  "&${dupCount()}&" 行订单号或运单号重复：请看红色行")`;
  // One line each (3 Nov 2026): row 4 is two lines high.
  return { range: `${wq}!A4`, values: [[`=TEXTJOIN(CHAR(10),TRUE,${newCancelText(false)},${revText},${dupText})`]] }; };
// New cancellations (Erwin, 8 Nov 2026: "more obvious", the supplier must not miss them): orders cancelled today or
// yesterday (AJ Status changed on the Cancelled tab) are bright yellow rows there, and row 4 of Cancelled and Orders
// says how many, in big red text on Cancelled.
const NEW_CANCEL_F = () => `COUNTIF(INDIRECT("'${CANCELLED_TAB}'!${L(C.CHANGED)}${FIRST_ROW}:${L(C.CHANGED)}"),">="&(TODAY()-1))`;
const newCancelText = here => `IF(${NEW_CANCEL_F()}=0,"","🛑 "&${NEW_CANCEL_F()}&" ORDER(S) CANCELLED TODAY OR YESTERDAY: ${here ? 'the YELLOW rows below' : 'see the Cancelled tab'}. Do NOT buy or ship them. If you already bought or shipped one, tell us now  ·  "&${NEW_CANCEL_F()}&" 个订单在今天或昨天被取消：${here ? '请看下面的黄色行' : '请看 Cancelled 标签页'}。不要购买或发货。如果已经购买或发货，请马上告诉我们")`;
const newCancelRule = sheetId => ({ addConditionalFormatRule: { index: 0, rule: {
  ranges: [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: 0, endColumnIndex: C.END }],
  booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=AND(ISNUMBER($${L(C.CHANGED)}${FIRST_ROW}),$${L(C.CHANGED)}${FIRST_ROW}>=TODAY()-1)` }] },
    format: { backgroundColor: { red: 1, green: 0.92, blue: 0.2 }, textFormat: { bold: true, strikethrough: false, foregroundColor: { red: 0.55, green: 0.05, blue: 0.05 } } } } } } });
const NEW_CANCEL_KEY = 'supplier_new_cancel', NEW_CANCEL_NOW = '1';
// Added once (and again after the sheet is rebuilt); the Cancelled tab is checked first, so the rule is never added twice.
export async function ensureNewCancelAlerts(DB, env, fetchImpl = fetch) {
  if (await getSetting(DB, NEW_CANCEL_KEY) === NEW_CANCEL_NOW) return false;
  const { wq } = await tabNames(DB);
  const data = await sheetsRequest(env, '?fields=sheets(properties(sheetId,title),conditionalFormats)', {}, fetchImpl);
  const tabs = (data?.sheets || []).filter(x => allTabs(wq).includes(x.properties?.title)), cancelled = tabs.find(x => x.properties.title === CANCELLED_TAB);
  if (!cancelled) return false;
  const id = cancelled.properties.sheetId, has = (cancelled.conditionalFormats || []).some(r => /TODAY\(\)-1/.test(String(r.booleanRule?.condition?.values?.[0]?.userEnteredValue || '')));
  await batch(env, [...(has ? [] : [newCancelRule(id)]),
    { repeatCell: { range: { sheetId: id, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 0.8, green: 0, blue: 0 } }, wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy,verticalAlignment)' } },
    ...tabs.map(x => rowHeight(x.properties.sheetId, 3, 60))], fetchImpl);
  await batchValues(env, tabs.map(x => revisionCounter(x.properties.title)), fetchImpl);
  await putSetting(DB, NEW_CANCEL_KEY, NEW_CANCEL_NOW);
  return true;
}
// Newest cancellations on top (Erwin, 9 Nov 2026: "a new cancelled order at the very bottom of the Cancelled tab"). A
// row the 8 Nov breakage left at the bottom was rewritten in place by layout 22, so it stayed there. Once, the Cancelled
// tab is sorted by AJ Status changed, newest first (whole rows A-AJ, so the hidden ids move with their row).
const CANCEL_SORT_KEY = 'supplier_cancelled_sorted', CANCEL_SORT_NOW = '1';
export async function sortCancelledOnce(DB, env, fetchImpl = fetch) {
  if (await getSetting(DB, CANCEL_SORT_KEY) === CANCEL_SORT_NOW) return false;
  const id = await workQueueSheetId(env, fetchImpl, false, CANCELLED_TAB);
  if (id == null) return false;
  await withOrderLock(DB, ROWS_LOCK, () => batch(env, [{ sortRange: { range: { sheetId: id, startRowIndex: FIRST_ROW - 1, startColumnIndex: 0, endColumnIndex: C.END },
    sortSpecs: [{ dimensionIndex: C.CHANGED, sortOrder: 'DESCENDING' }] } }], fetchImpl));
  await putSetting(DB, CANCEL_SORT_KEY, CANCEL_SORT_NOW);
  return true;
}
const sortSafely = async (DB, env, fetchImpl) => { try { return await sortCancelledOnce(DB, env, fetchImpl); } catch (e) { console.error('Cancelled tab not sorted', e); return 'error: ' + String(e.message || e).slice(0, 200); } };
// One look for the data rows (row 6 down) of every order tab (Erwin, 9 Nov 2026: "the coloring is all over the place").
// Fills travel with a row when it is inserted or moved (a new row copies the one above it), so a single wrong row spread:
// Shipped rows 6-62 had the header grey / dark yellow / dark blue, the newest Orders and Cancelled rows had no yellow,
// AJ was yellow (it copied AI when the column was added), a few rows had a stray pink, orange or white. Only these columns
// have a fill: O light blue, P-V and AH-AI supplier yellow. Everything else has none (colour rules paint those cells),
// and nothing right of AJ.
const SUPPLIER_YELLOW = { red: 1, green: 0.95, blue: 0.7 };
// cols: the tab's column count. Right of AJ is cleared only on a tab that has columns there (10 Nov 2026: Shipped has
// exactly A-AJ, and a range starting past its last column made Google refuse the whole request, row moves included).
const fillPlan = (c = C, cols) => [[0, c.COMP, null], [c.COMP, c.COMP + 1, blue], [c.COST, c.REASON + 1, SUPPLIER_YELLOW], [c.REASON + 1, c.DOM, null], [c.DOM, c.FEE + 1, SUPPLIER_YELLOW], [c.FEE + 1, c.END, null], ...(cols > c.END ? [[c.END, null, null]] : [])];
// from / to are 0-based row indexes; no `to` = to the end of the tab. A cell without a colour clears the fill.
const rowFillRequests = (sheetId, from, to, c = C, cols) => fillPlan(c, cols).filter(([a, b]) => b == null || b > a).map(([a, b, rgb]) => ({ repeatCell: { range: { sheetId, startRowIndex: from, ...(to == null ? {} : { endRowIndex: to }), startColumnIndex: a, ...(b == null ? {} : { endColumnIndex: b }) },
  cell: rgb ? { userEnteredFormat: { backgroundColor: rgb } } : {}, fields: 'userEnteredFormat.backgroundColor' } }));
// '2' (9 Nov 2026): the columns right of AJ (AK, AL...) also carried a pale yellow on most rows; cleaned too (on the
// tabs that have columns there).
const FILLS_KEY = 'supplier_fills_clean', FILLS_NOW = '2';
export async function cleanFillsOnce(DB, env, fetchImpl = fetch) {
  if (await getSetting(DB, FILLS_KEY) === FILLS_NOW) return false;
  const { wq } = await tabNames(DB), requests = [];
  const props = ((await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl)).sheets || []).map(x => x.properties || {});
  for (const tab of allTabs(wq)) { const p = props.find(x => x.title === tab); if (p?.sheetId != null) requests.push(...rowFillRequests(p.sheetId, FIRST_ROW - 1, null, C, Number(p.gridProperties?.columnCount) || 0)); }
  if (!requests.length) return false;
  await withOrderLock(DB, ROWS_LOCK, () => batch(env, requests, fetchImpl));
  await putSetting(DB, FILLS_KEY, FILLS_NOW);
  return true;
}
const fillsSafely = async (DB, env, fetchImpl) => { try { return await cleanFillsOnce(DB, env, fetchImpl); } catch (e) { console.error('Sheet fills not cleaned', e); return 'error: ' + String(e.message || e).slice(0, 200); } };
const newCancelSafely = async (DB, env, fetchImpl) => { try { return await ensureNewCancelAlerts(DB, env, fetchImpl); } catch (e) { console.error('New cancellation alerts not added', e); return 'error: ' + String(e.message || e).slice(0, 200); } };
// The whole row turns red; typing a tracking number already used shows a warning on the cell (it is still accepted:
// one parcel can be meant for two orders).
const dupRule = sheetId => ({ addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: 0, endColumnIndex: C.END }], booleanRule: {
  condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=OR(AND($B${FIRST_ROW}<>"",${seenIn('B', '$B' + FIRST_ROW)}>1),AND($${L(C.TRACK)}${FIRST_ROW}<>"",${seenIn(L(C.TRACK), '$' + L(C.TRACK) + FIRST_ROW)}>1))` }] },
  format: { backgroundColor: { red: 0.96, green: 0.55, blue: 0.55 }, textFormat: { bold: true } } } } } });
const dupCheck = sheetId => ({ setDataValidation: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: C.TRACK, endColumnIndex: C.TRACK + 1 }, rule: {
  condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=${seenIn(L(C.TRACK), L(C.TRACK) + FIRST_ROW)}<=1` }] },
  inputMessage: 'This tracking number is already used on another order. Check it is the right parcel.\n这个运单号已经用在另一个订单上，请确认是否正确。', strict: false } } });
// Where each cost revision stands (Erwin, 3 Nov 2026: "in the spreadsheet I can't know which ones they finished"): the
// Competitor price cell turns purple once the supplier sent a new cost that waits for us (and the row light purple), and
// no colour when it is done (the green was taken off on 9 Nov 2026, see removeGreenDoneOnce; the note stays in the cell).
// The open ones stay orange (revisionFormat / revisionAlerts).
const startsWith = (sheetId, word, format) => ({ addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: COMP, endColumnIndex: COMP + 1 }], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: word }] }, format } } } });
const revisionStates = (sheetId, c = C) => [
  startsWith(sheetId, REVISION_SENT, { backgroundColor: { red: 0.76, green: 0.65, blue: 0.96 }, textFormat: { bold: true } }),
  { addConditionalFormatRule: { rule: { ranges: [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: 0, endColumnIndex: c.END }], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=LEFT($O${FIRST_ROW},${REVISION_SENT.length})="${REVISION_SENT}"` }] }, format: { backgroundColor: { red: 0.93, green: 0.89, blue: 1 } } } } } },
];
// Total cost (P): a number, or NO and the reason on a cost revision ("the cost can't be lower": a reason is required).
const costCheck = sheetId => { const p = L(C.COST) + FIRST_ROW; return { setDataValidation: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: C.COST, endColumnIndex: C.COST + 1 }, rule: {
  condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=OR(AND(ISNUMBER(${p}),${p}>=0),REGEXMATCH(LOWER(TRIM(${p}&"")),"^((no|keep|same)\\b|不能|无法)[\\s:：.,，、-]*[^\\s:：.,，、-]"))` }] },
  inputMessage: "Total cost for the whole order in USD, product + shipping. Orange row (cost revision): type the new cost, or NO and the reason if it can't be lower, e.g. NO: factory price went up.\n整单总成本（美元），包括商品和运费。橙色行（降价请求）：填写新成本；不能降价请写 NO 和原因，例如 NO: 工厂涨价了。", strict: true } } }; };
const REV_RULES = 'supplier_revision_colours', REV_RULES_NOW = '1', REV_DATA = 'revision_states_backfill';
// Added once (and again after the sheet is rebuilt): the colours and the Total cost check on Orders and Shipped, row 4
// and the instructions. Once ever: the sheet shows the requests already answered, and the new costs already waiting are
// handled like a new one (approved by themselves when lower, otherwise flagged for an admin).
export async function ensureRevisionStates(DB, env, fetchImpl = fetch, t = Math.floor(Date.now() / 1000)) {
  if (await getSetting(DB, REV_RULES) === REV_RULES_NOW) return false;
  const { wq } = await tabNames(DB); if (wq !== WQ_NEW) return false;
  const data = await sheetsRequest(env, '?fields=sheets(properties(sheetId,title),conditionalFormats)', {}, fetchImpl);
  const tabs = (data?.sheets || []).filter(x => DUP_TABS.includes(x.properties?.title));
  if (tabs.length < DUP_TABS.length) return false;
  const has = x => (x.conditionalFormats || []).some(r => (r.booleanRule?.condition?.values || []).some(v => String(v.userEnteredValue || '').includes(REVISION_SENT)));
  await batch(env, tabs.flatMap(x => [...(has(x) ? [] : revisionStates(x.properties.sheetId)), costCheck(x.properties.sheetId)]), fetchImpl);
  await batchValues(env, [...allTabs(wq).map(tab => revisionCounter(tab)), { range: `${wq}!A3`, values: [[instructions]] }], fetchImpl);
  if (!await getSetting(DB, REV_DATA)) {
    const done = (await DB.prepare(`SELECT DISTINCT ON (r.order_id) r.* FROM cost_revisions r JOIN client_orders o ON o.id = r.order_id
      WHERE r.order_id IS NOT NULL AND o.revision_status = '' AND NOT o.archived AND o.status <> 'cancelled' ORDER BY r.order_id, r.id DESC`).all()).results || [];
    for (const r of done) { const text = doneText(r); if (text) await DB.prepare("UPDATE client_orders SET revision_done=?, sheet_sync_status='waiting' WHERE id=? AND revision_done=''").bind(text, r.order_id).run(); }
    for (const o of (await DB.prepare("SELECT * FROM client_orders WHERE revision_status='offered' AND NOT archived").all()).results || []) await revisionOffered(DB, o, Number(o.supplier_cost), t);
    await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE revision_status='offered' AND NOT archived").run();
    await putSetting(DB, REV_DATA, String(t));
  }
  await putSetting(DB, REV_RULES, REV_RULES_NOW);
  return true;
}
const revSafely = async (DB, env, fetchImpl) => { try { return await ensureRevisionStates(DB, env, fetchImpl); } catch (e) { console.error('Cost revision colours not added', e); return 'error: ' + String(e.message || e).slice(0, 200); } };
// The green "✓ REVISION DONE" fill is taken off (Erwin, 9 Nov 2026: "yes, no colour"): a finished revision kept its green for
// ever, long after it was updated. The note stays in the cell. Once; the Guide is written again so its row about column O
// matches. Rules are deleted from the highest index down, so the indexes of the rest do not shift.
const NO_GREEN_KEY = 'supplier_no_green_done', NO_GREEN_NOW = '1';
export async function removeGreenDoneOnce(DB, env, fetchImpl = fetch) {
  if (await getSetting(DB, NO_GREEN_KEY) === NO_GREEN_NOW) return false;
  const { wq } = await tabNames(DB), tabs = allTabs(wq), requests = [];
  const data = await sheetsRequest(env, '?fields=sheets(properties(sheetId,title),conditionalFormats)', {}, fetchImpl);
  for (const s of data?.sheets || []) {
    if (!tabs.includes(s.properties?.title)) continue;
    (s.conditionalFormats || []).map((rule, index) => ({ rule, index })).filter(({ rule }) => (rule.booleanRule?.condition?.values || []).some(v => String(v.userEnteredValue || '').includes(REVISION_DONE)))
      .reverse().forEach(({ index }) => requests.push({ deleteConditionalFormatRule: { sheetId: s.properties.sheetId, index } }));
  }
  if (requests.length) await batch(env, requests, fetchImpl);
  await DB.prepare('DELETE FROM portal_settings WHERE key=?').bind(ZH_KEY).run();
  await putSetting(DB, NO_GREEN_KEY, NO_GREEN_NOW);
  return requests.length || true;
}
const noGreenSafely = async (DB, env, fetchImpl) => { try { return await removeGreenDoneOnce(DB, env, fetchImpl); } catch (e) { console.error('Green done colour not removed', e); return 'error: ' + String(e.message || e).slice(0, 200); } };
// ---------- English + Chinese (Erwin, 3 Nov 2026) ----------
// Every text the supplier reads is in English and, on the next line, Chinese (sheet-zh.mjs), and the rows holding them
// are tall enough to read without resizing anything: row 3 help (2 lines), row 4 alerts and totals (2 lines), row 5
// headers (up to 3 lines). A Guide tab explains everything, one topic per row. Added once to the live sheet (and again
// after a rebuild); the website never reads any of it.
export const ORDERS_TITLE = 'Direct Line — Orders 订单';
const headRows = sheetId => [rowHeight(sheetId, 3, 60), rowHeight(sheetId, 4, 50), rowHeight(sheetId, 5, 64)];
const billingHeadRows = sheetId => [rowHeight(sheetId, 2, 42), rowHeight(sheetId, 3, 42), rowHeight(sheetId, 4, 64),
  { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: BILLING_WIDTH }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,horizontalAlignment)' } }];
// Height of a Guide row: the longest of its three cells, wrapped at the column width (like rowPx).
const GUIDE_WIDTHS = [210, 470, 420];
const guidePx = row => Math.max(36, ...row.map((v, i) => { const per = Math.floor((GUIDE_WIDTHS[i] - 14) / 7); return String(v).split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(wide(part) / per)), 0) * 17 + 14; }));
async function guideTab(env, props, fetchImpl) {
  let tab = props.find(p => p.title === GUIDE_TAB);
  const reqs = [], last = GUIDE.length + 3;
  if (!tab) {
    const at = props.findIndex(p => p.title === BILLING_TAB) + 1 || props.length;
    const made = await batch(env, [{ addSheet: { properties: { title: GUIDE_TAB, index: at, gridProperties: { rowCount: last + 2, columnCount: 3, frozenRowCount: 3 } } } }], fetchImpl);
    tab = made?.replies?.[0]?.addSheet?.properties;
    if (tab?.sheetId == null) throw new Error('Guide tab was not added');
    const id = tab.sheetId, r = (r1, r2, c1, c2) => ({ sheetId: id, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 });
    reqs.push(
      { repeatCell: { range: r(0, 1, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } },
      { repeatCell: { range: r(2, 3, 0, 3), cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)' } },
      { repeatCell: { range: r(3, last, 0, 3), cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
      { repeatCell: { range: r(3, last, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 1, green: 0.97, blue: 0.85 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
      ...GUIDE_WIDTHS.map((px, i) => ({ updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
      { addProtectedRange: { protectedRange: { range: { sheetId: id }, description: 'Guide: written by the Direct Line website', editors: { users: [googleSheetsConfig(env).email] } } } });
  }
  await batchValues(env, [{ range: `'${GUIDE_TAB}'!A1:C${last}`, values: [['Direct Line — How this sheet works · 表格使用说明', '', ''], ['', '', ''], ['Topic · 主题', 'English', '中文'], ...GUIDE] }], fetchImpl);
  reqs.push(rowHeight(tab.sheetId, 3, 30), ...GUIDE.map((row, i) => rowHeight(tab.sheetId, i + 4, guidePx(row))));
  await batch(env, reqs, fetchImpl);
  return tab.sheetId;
}
const ZH_KEY = 'supplier_sheet_zh', ZH_NOW = '1';
export async function ensureBilingual(DB, env, fetchImpl = fetch) {
  if (await getSetting(DB, ZH_KEY) === ZH_NOW) return false;
  const { wq } = await tabNames(DB); if (wq !== WQ_NEW) return false;
  const props = ((await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl)).sheets || []).map(x => x.properties || {});
  const tabs = allTabs(wq).map(t => [t, props.find(p => p.title === t)?.sheetId]).filter(([, id]) => id != null);
  if (tabs.length < 3) return false;
  const couriers = courierList(await getSetting(DB, 'couriers')), only = list => list.filter(r => r.repeatCell?.cell?.note || r.setDataValidation?.rule);
  // Texts: titles and help (rows 2-3), the alerts and totals (row 4), the headers (row 5).
  await batchValues(env, [{ range: `${wq}!A2:A3`, values: [[ORDERS_TITLE], [instructions]] },
    ...Object.entries(tabText).map(([tab, [title, text]]) => ({ range: `${tab}!A2:A3`, values: [[title], [text]] })),
    ...tabs.map(([t]) => ({ range: `${t}!A5:${L(C.END - 1)}5`, values: [HEADERS.map(bi)] })), ...summaryRows(tabs.map(([t]) => t))], fetchImpl);
  // Row heights, and the help messages and header notes of the supplier's columns.
  await batch(env, tabs.flatMap(([t, id]) => [...headRows(id), courierRule(id, couriers), statusRule(id), ...only(delayFormat(id, null)), ...only(domesticFormat(id)),
    ...only(cancelFeeFormat(id)), ...only(itemCostsFormat(id)), ...only(competitorFormat(id)), ...only(paidFormat(id)), costCheck(id), ...(t === CANCELLED_TAB ? [] : [dupCheck(id)])]), fetchImpl);
  const billing = props.find(p => p.title === BILLING_TAB);
  if (billing) { await batchValues(env, billingCells(wq), fetchImpl); await batch(env, billingHeadRows(billing.sheetId), fetchImpl); }
  await quoteZh(env, fetchImpl);
  await guideTab(env, props, fetchImpl);
  await putSetting(DB, ZH_KEY, ZH_NOW);
  return true;
}
const zhSafely = async (DB, env, fetchImpl) => { try { return await ensureBilingual(DB, env, fetchImpl); } catch (e) { console.error('English + Chinese not added', e); return 'error: ' + String(e.message || e).slice(0, 200); } };
const DUP_ALERTS = 'supplier_dup_alerts', DUP_ALERTS_NOW = '1';
// Added once (and again after the sheet is rebuilt): the red rule and the warning on Orders and Shipped, and row 4.
export async function ensureDuplicateAlerts(DB, env, fetchImpl = fetch) {
  if (await getSetting(DB, DUP_ALERTS) === DUP_ALERTS_NOW) return false;
  const { wq } = await tabNames(DB); if (wq !== WQ_NEW) return false;
  // Each tab is checked first, so a rule is never added twice.
  const data = await sheetsRequest(env, '?fields=sheets(properties(sheetId,title),conditionalFormats)', {}, fetchImpl), mark = `COUNTIF(INDIRECT("'${WQ_NEW}'!B:B")`;
  const tabs = (data?.sheets || []).filter(x => [wq, SHIPPED_TAB].includes(x.properties?.title));
  if (tabs.length < 2) return false;
  const has = x => (x.conditionalFormats || []).some(r => String(r.booleanRule?.condition?.values?.[0]?.userEnteredValue || '').includes(mark));
  await batch(env, tabs.flatMap(x => [...(has(x) ? [] : [dupRule(x.properties.sheetId)]), dupCheck(x.properties.sheetId)]), fetchImpl);
  await batchValues(env, allTabs(wq).map(t => revisionCounter(t)), fetchImpl);
  await putSetting(DB, DUP_ALERTS, DUP_ALERTS_NOW);
  return true;
}
const dupSafely = async (DB, env, fetchImpl) => { try { return await ensureDuplicateAlerts(DB, env, fetchImpl); } catch (e) { console.error('Duplicate alerts not added', e); return 'error: ' + String(e.message || e).slice(0, 200); } };
const summaryRows = (tabs, c = C) => tabs.flatMap(t => [totalsRow(t, c), revisionCounter(t)]);
const revisionAlerts = (sheetId, c = C) => [
  { repeatCell: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 0.8, green: 0.35, blue: 0 } }, wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } },
  { addConditionalFormatRule: { rule: { ranges: [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: 0, endColumnIndex: c.END }], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=LEFT($O${FIRST_ROW},${REVISION_FLAG.length})="${REVISION_FLAG}"` }] }, format: { backgroundColor: { red: 1, green: 0.88, blue: 0.75 } } } } } },
];
const cancelFormat = (sheetId, c = C) => {
  const rows = (c1, c2) => [{ sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: c1, endColumnIndex: c2 }];
  const is = v => ({ type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=$D${FIRST_ROW}="${v}"` }] });
  return [
    { addConditionalFormatRule: { index: 0, rule: { ranges: rows(3, 4), booleanRule: { condition: is(STATUS.cancelled), format: { backgroundColor: { red: 0.8, green: 0.13, blue: 0.13 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } } } } },
    { addConditionalFormatRule: { index: 1, rule: { ranges: rows(0, c.MORE + 1), booleanRule: { condition: is(STATUS.cancelled), format: { backgroundColor: { red: 0.98, green: 0.78, blue: 0.78 }, textFormat: { strikethrough: true, foregroundColor: { red: 0.55, green: 0.1, blue: 0.1 } } } } } } },
    { addConditionalFormatRule: { index: 2, rule: { ranges: rows(0, c.MORE + 1), booleanRule: { condition: is(STATUS.cancellation_requested), format: { backgroundColor: { red: 1, green: 0.87, blue: 0.7 }, textFormat: { bold: true } } } } } },
  ];
};
// AH: yellow and open to the supplier like P-V (outside the website's protected columns), kept as text.
const domesticFormat = (sheetId, c = C) => { const DOM = c.DOM; return [
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: DOM, endColumnIndex: DOM + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: DOM, endColumnIndex: DOM + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.95, blue: 0.7 }, numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,numberFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: DOM, endColumnIndex: DOM + 1 }, cell: { note: 'Supplier: the tracking number of the domestic express in China for this order. Only you fill this in; the website does not change it.\n供应商：这个订单在中国国内快递的单号。只有你填写，网站不会修改。' }, fields: 'note' } },
  { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: DOM, endIndex: DOM + 1 }, properties: { pixelSize: c.widths[DOM] }, fields: 'pixelSize' } },
]; };
// AI: yellow, open to the supplier, dollars.
const cancelFeeFormat = (sheetId, c = C) => { const FEE = c.FEE; return [
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: FEE, endColumnIndex: FEE + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: FEE, endColumnIndex: FEE + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.95, blue: 0.7 }, numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' }, verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,numberFormat,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: FEE, endColumnIndex: FEE + 1 }, cell: { note: 'Supplier: only for orders with Shipping status "Cancel requested" or "Cancelled". Type the cancellation fee in USD if you charge one (e.g. already bought or shipped); leave empty if none. Direct Line checks it before the client is charged.\n供应商：只用于发货状态是 "Cancel requested"（申请取消）或 "Cancelled"（已取消）的订单。如果收取取消费（例如已经购买或发货），请填写美元金额；没有就留空。Direct Line 会先确认，再向客户收费。' }, fields: 'note' } },
  { setDataValidation: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: FEE, endColumnIndex: FEE + 1 }, rule: { condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '0' }] }, inputMessage: 'Cancellation fee in USD (empty = no fee)\n取消费（美元），留空 = 不收费', strict: false } } },
  { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: FEE, endIndex: FEE + 1 }, properties: { pixelSize: c.widths[FEE] }, fields: 'pixelSize' } },
]; };
// AJ Status changed: grey like the website's columns, a date the filter can sort (newest / oldest), note in EN + ZH.
const statusDateFormat = (sheetId, c = C) => { const AJ = c.CHANGED; return [
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: AJ, endColumnIndex: AJ + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }, textFormat: { bold: true }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: AJ, endColumnIndex: AJ + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' }, verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(numberFormat,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: AJ, endColumnIndex: AJ + 1 }, cell: { note: 'When this order\'s status last changed (China time). Filled in by the website. Use the filter arrow to sort newest or oldest first.\n此订单状态最后一次更新的时间（中国时间）。由网站自动填写。可用筛选箭头按最新或最早排序。' }, fields: 'note' } },
  { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: AJ, endIndex: AJ + 1 }, properties: { pixelSize: c.widths[AJ] }, fields: 'pixelSize' } },
]; };
// Q (AI before layout 19): yellow, open to the supplier, kept as text (several numbers in one cell).
const itemCostsFormat = (sheetId, c = C) => { const ITEMS = c.ITEMS; return [
  // No number rule: the cell holds several costs as text. The live AI had the cancellation fee's rule ("number >= 0"),
  // which moved to Q with it and flagged "27.9, 21.9, 31.9" as Invalid (Erwin, 30 Oct 2026).
  { setDataValidation: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: ITEMS, endColumnIndex: ITEMS + 1 } } },
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: ITEMS, endColumnIndex: ITEMS + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: ITEMS, endColumnIndex: ITEMS + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.95, blue: 0.7 }, numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,numberFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: ITEMS, endColumnIndex: ITEMS + 1 }, cell: { note: 'Supplier: only for orders with several products (Product 1, 2, 3 in Product / variation). Type the cost of each product in that order, separated by commas, e.g. 10.90, 9.00, 11.00. Together they should make the Total cost. Our client sees each product\'s price.\n供应商：只用于有多个商品的订单（商品 / 款式列里有 Product 1、2、3）。按这个顺序填写每个商品的成本，用逗号隔开，例如 10.90, 9.00, 11.00。加起来应等于总成本。客户能看到每个商品的价格。' }, fields: 'note' } },
  { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: ITEMS, endIndex: ITEMS + 1 }, properties: { pixelSize: c.widths[ITEMS] }, fields: 'pixelSize' } },
]; };
const hideCD = sheetId => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 4 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });
// Layout 10: Shop (C) shown again, Status (D) stays hidden.
const showShop = sheetId => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } });
const statusRule = (sheetId, c = C) => ({ setDataValidation: { range: { sheetId, startRowIndex: 5, startColumnIndex: c.SHIP, endColumnIndex: c.SHIP + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: [NOT_SHIPPED, SHIPPED, CANCEL_REQ_SHIP, CANCELLED_SHIP, REFUNDED_SHIP].map(userEnteredValue => ({ userEnteredValue })) }, inputMessage: SHIP_HELP, showCustomUi: true, strict: false } } });
const SHIP_HELP = 'Pick Shipped when the parcel leaves. Cancelled, Cancel requested and Refunded are written by the website.\n包裹发出后选择 Shipped（已发货）。Not shipped = 未发货。Cancelled（已取消）、Cancel requested（客户申请取消）、Refunded（已退款）由网站填写。';
// Sheets made with 32 columns (A-AF) get one more column for AG first.
async function ensureColumns(env, sheetId, count, fetchImpl) {
  const props = ((await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl)).sheets || []).map(x => x.properties || {}).find(x => x.sheetId === sheetId);
  const have = Number(props?.gridProperties?.columnCount || 0);
  if (have && have < count) await batch(env, [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: count - have } }], fetchImpl);
}
// Rewrites the Client paid column (W) from the website in one write (after payments change).
export const refreshPaidColumn = (DB, env, fetchImpl = fetch) => withOrderLock(DB, ROWS_LOCK, () => refreshPaidNow(DB, env, fetchImpl));
async function refreshPaidNow(DB, env, fetchImpl) {
  if (!googleSheetsConfigured(env) || !await supplierSheetEnabled(DB) || await getSetting(DB, LAYOUT) !== LAYOUT_NOW) return false;
  const { wq } = await tabNames(DB), rows = await idRows(env, fetchImpl, allTabs(wq));
  if (!rows.length) return true;
  const labels = await paidLabels(DB, rows.map(r => r.orderId).filter(id => id > 0));
  await batchValues(env, allTabs(wq).map(tab => rows.filter(r => r.tab === tab)).filter(x => x.length)
    .map(x => ({ range: `${x[0].tab}!${L(C.PAIDC)}${FIRST_ROW}:${L(C.PAIDC)}${x.at(-1).row}`, values: x.map(r => [labels.get(r.orderId) || '']) })), fetchImpl);
  // Cancelled orders: "Refunded" once paid, "Cancelled" if not (a payment can be added or archived later).
  const cancelled = rows.filter(r => r.tab === CANCELLED_TAB && r.orderId > 0), fix = [];
  for (let i = 0; i < cancelled.length; i += 200) {
    const part = cancelled.slice(i, i + 200), seen = new Map();
    for (const o of (await DB.prepare(`SELECT id, status, sheet_shipped, sheet_ref FROM client_orders WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part.map(r => r.orderId)).all()).results || []) seen.set(Number(o.id), o);
    for (const r of part) { const o = seen.get(r.orderId), want = labels.get(r.orderId) === PAID ? REFUNDED_SHIP : CANCELLED_SHIP; if (o?.status === 'cancelled' && !rowOutOfLine(r, o) && norm(o.sheet_shipped) !== want) fix.push([r, want]); }
  }
  if (fix.length) {
    await batchValues(env, fix.map(([r, want]) => ({ range: `${CANCELLED_TAB}!${L(C.SHIP)}${r.row}`, values: [[want]] })), fetchImpl);
    for (const [r, want] of fix) await DB.prepare('UPDATE client_orders SET sheet_shipped=? WHERE id=?').bind(want, r.orderId).run();
  }
  return true;
}
const courierRule = (sheetId, couriers, c = C) => ({ setDataValidation: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: c.COURIER, endColumnIndex: c.COURIER + 1 }, rule: {
  condition: { type: 'ONE_OF_LIST', values: couriers.map(c => ({ userEnteredValue: c })) }, inputMessage: 'The courier used for this parcel. Pick one, or type another name.\n这个包裹用的快递公司。从列表选择，或输入其他名称。', strict: false, showCustomUi: true } } });
// The courier dropdown follows the list in Fees & settings (called when an admin saves it).
export async function updateCourierDropdown(DB, env, fetchImpl = fetch) {
  if (!googleSheetsConfigured(env) || !await supplierSheetEnabled(DB) || await getSetting(DB, LAYOUT) !== LAYOUT_NOW) return false;
  const couriers = courierList(await getSetting(DB, 'couriers')), ids = [];
  for (const tab of allTabs((await tabNames(DB)).wq)) { const id = await workQueueSheetId(env, fetchImpl, false, tab); if (id != null) ids.push(id); }
  if (!ids.length) return false;
  await batch(env, ids.map(id => courierRule(id, couriers)), fetchImpl);
  return true;
}
// Sheets set up before the Courier column: insert it at P once (Google moves everything after it, including the
// protected ranges, dropdowns, filter and the grouped columns). Until that is done nothing reads or writes rows,
// so the new column letters are never used on an old sheet. Safe to retry: it checks the header first.
export async function ensureLayout(DB, env, fetchImpl = fetch) {
  const v = await getSetting(DB, LAYOUT);
  if (v === LAYOUT_NOW) return true;
  const t = Math.floor(Date.now() / 1000);
  if (String(v || '').startsWith('migrating:') && t - Number(v.split(':')[1]) < 300) return false;
  // Claim it so only one request does the switch.
  const claim = v == null
    ? await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO NOTHING RETURNING key').bind(LAYOUT, 'migrating:' + t).first()
    : await DB.prepare('UPDATE portal_settings SET value=? WHERE key=? AND value=? RETURNING key').bind('migrating:' + t, LAYOUT, v).first();
  if (!claim) return false;
  try {
    const { wq } = await tabNames(DB);
    const sheetId = await workQueueSheetId(env, fetchImpl, true, wq);
    if (sheetId == null) throw new Error('Work Queue tab not found');
    // Google refuses to read or write past a tab's last column: every supplier tab gets A-AI before anything below reads it.
    for (const tab of allTabs(wq)) { const id = tab === wq ? sheetId : await workQueueSheetId(env, fetchImpl, true, tab); if (id != null) await ensureColumns(env, id, C.END, fetchImpl); }
    const header = async (tab = wq) => (await sheetsRequest(env, '/values/' + encodeURIComponent(`${tab}!A5:${L(C.END - 1)}5`), {}, fetchImpl)).values?.[0]?.map(v => norm(en(v))) || [];
    let h = await header();
    // Steps 1-18 work on the layout 18 columns (Cost per product in AI); a sheet that already has Cost per product in Q
    // (layout 19) uses today's columns, so those steps find their headers in place and only re-apply rules.
    const c = h[C.ITEMS] === ITEM_COSTS ? C : C18;
    // 1) Country (L) becomes Tax number, and Gift message is added after it. The column is inserted inside the
    //    website's protected columns (A–M), so it stays protected. Nothing is deleted.
    if (h[12] === 'Notes') { await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, inheritFromBefore: true } }], fetchImpl); h = await header(); }
    // The old country codes in L are cleared; each row's tax number / gift message is written by the normal sync.
    if (h[11] === 'Country') await sheetsRequest(env, '/values/' + encodeURIComponent(`${wq}!L${FIRST_ROW}:M`) + ':clear', { method: 'POST', body: '{}' }, fetchImpl);
    // 2) Courier between Tracking number and Shipping status (yellow, like the other supplier columns).
    if (h[16] === 'Shipping status') { await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 16, endIndex: 17 }, inheritFromBefore: true } }], fetchImpl); h = await header(); }
    // 3) Competitor price right after Notes (Ye, the supplier, asked for it there). It sits just outside the website's
    //    protected columns (A–N), so anyone with the sheet can type in it; the supplier's columns move one to the right.
    if (h[13] === 'Notes' && h[14] === 'Total cost (USD)') { await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: COMP, endIndex: COMP + 1 }, inheritFromBefore: true } }], fetchImpl); h = await header(); }
    // 5) Client paid after Shipping status (Erwin, 22 Oct 2026): the supplier sees which orders our client has paid. The
    //    photos, links and ids move one column to the right (U–AD); the column is website-written and protected.
    const addPaid = h[18] === 'Shipping status' && h[19] === 'Photo 2';
    if (addPaid) { await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 19, endIndex: 20 }, inheritFromBefore: false } }], fetchImpl); h = await header(); }
    // 6) Delayed? + Delay reason after Shipping status (Erwin, 22 Oct 2026): the supplier marks orders that will be late.
    //    Inserted next to the supplier's yellow columns (same look, not protected); Client paid, photos and ids move two
    //    columns to the right (V–AF). Google moves the protected ranges, rules, filter and groups with them.
    const addDelay = h[18] === 'Shipping status' && (h[19] === 'Client paid' || addPaid);
    if (addDelay) { await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: C18.DELAY, endIndex: C18.DELAY + 2 }, inheritFromBefore: true } }], fetchImpl); h = await header(); }
    // 7) Cancelled rows in red (Erwin, 23 Oct 2026): every sheet before layout 7 gets the rules once; the status
    //    text changes to "CANCELLED - do not ship", so cancelled rows are written again below.
    const addCancel = String(v || '').startsWith('migrating:') || Number(v || 0) < 7;
    // 8) Domestic Express Tracking Number in AG (Ye, 25 Oct 2026): added once at the far right, so no column the website
    //    reads or writes moves.
    const addDomestic = h[c.DOM] !== DOMESTIC;
    // 9) Shop (C) and Status (D) hidden (Erwin, 26 Oct 2026): the table is narrower; cancelled orders still show as a
    //    red row (the rule reads D). Hidden, not deleted, so no column the website writes moves.
    const hideShopStatus = Number(String(v || '').startsWith('migrating:') ? 0 : v || 0) < 9;
    // 10) "Cancelled" in the Shipping status dropdown + Shop (C) visible again (Erwin, 26 Oct 2026); cancelled rows rewritten below.
    const addCancelStatus = Number(String(v || '').startsWith('migrating:') ? 0 : v || 0) < 11;
    // 11) AH Cancellation fee (USD) for the supplier + "Cancel requested" in Shipping status (Erwin, 26 Oct 2026). Added at
    //     the far right, so no column the website reads or writes moves.
    const addCancelFee = h[c.FEE] !== CANCEL_FEE;
    // 12) Cost revision requests (Erwin, 27 Oct 2026): Competitor price (O) turns orange while one is open. Rule only.
    const addRevision = Number(String(v || '').startsWith('migrating:') ? 0 : v || 0) < 12;
    // 13) Cost revision alerts: the counter in A4 and light orange rows while a request is open. Rule + one cell only.
    const addRevisionAlerts = Number(String(v || '').startsWith('migrating:') ? 0 : v || 0) < 13;
    // 14) Shipped and Cancelled tabs, newest orders on top (Erwin, 29 Oct 2026). New tabs and row moves only, no column moves.
    const addTabs = Number(String(v || '').startsWith('migrating:') ? 0 : v || 0) < 14;
    // 15) The filter covers A-AH on every supplier tab (it was A-AD, so a sort split rows from their hidden ids).
    const widenFilter = Number(String(v || '').startsWith('migrating:') ? 0 : v || 0) < 15;
    // 16) "Refunded" in the Shipping status list (all three tabs); the cancelled rows get it from refreshPaidColumn.
    const addRefunded = Number(String(v || '').startsWith('migrating:') ? 0 : v || 0) < 16;
    // 17) Row 4 (totals + cost revision counter) written again on all three tabs, with formulas that rows can't move.
    const fixTotals = Number(String(v || '').startsWith('migrating:') ? 0 : v || 0) < 17;
    // 18) AI Cost per product (USD) on all three tabs (Erwin, 30 Oct 2026). Added at the far right, so no column moves; the
    //     filter grows to A-AI so a sort still moves whole rows.
    const addItemCosts = h[c.ITEMS] !== ITEM_COSTS;
    // Google refuses a write past the last column: the sheet gets its columns before the header row is written.
    if (addDomestic || addCancelFee || addItemCosts) await ensureColumns(env, sheetId, c.END, fetchImpl);
    await batchValues(env, [revisionCounter(wq), { range: `${wq}!A5:${L(c.END - 1)}5`, values: [c.h.map(bi)] }, { range: `${wq}!A3`, values: [[instructions]] }, totalsRow(wq, c)], fetchImpl);
    // 4) From now on the website writes O from the order: anything typed there before is copied to its order first.
    const idCol = colName(h.indexOf('Order ID') >= 0 ? h.indexOf('Order ID') : 27);
    const ranges = [`${wq}!O${FIRST_ROW}:O`, `${wq}!${idCol}${FIRST_ROW}:${idCol}`].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const [vals, ids] = ((await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS', {}, fetchImpl)).valueRanges || []).map(x => x.values || []);
    for (const [i, r] of (ids || []).entries()) { const v = norm(vals?.[i]?.[0]).slice(0, 200), id = Number(r?.[0]); if (id > 0 && v) await DB.prepare("UPDATE client_orders SET competitor_price=? WHERE id=? AND competitor_price=''").bind(v, id).run(); }
    await batch(env, [courierRule(sheetId, courierList(await getSetting(DB, 'couriers')), c), ...competitorFormat(sheetId),
      ...[11, 12, c.COURIER].map(i => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c.widths[i] }, fields: 'pixelSize' } })),
      ...(addPaid ? [...paidFormat(sheetId, c), { addProtectedRange: { protectedRange: { range: { sheetId, startColumnIndex: c.PAIDC, endColumnIndex: c.PAIDC + 1 }, description: 'Filled in by the Direct Line website', editors: { users: [googleSheetsConfig(env).email] } } } }] : []),
      ...(addDelay || addPaid ? delayFormat(sheetId, googleSheetsConfig(env).email, c) : []), ...(addCancel ? cancelFormat(sheetId, c) : []), ...(addDomestic ? domesticFormat(sheetId, c) : []), ...(hideShopStatus ? [hideCD(sheetId)] : []), ...(addCancelStatus ? [statusRule(sheetId, c), showShop(sheetId)] : []), ...(addRevision ? [revisionFormat(sheetId)] : []), ...(addRevisionAlerts ? revisionAlerts(sheetId, c) : []), ...(addCancelFee ? cancelFeeFormat(sheetId, c) : [])], fetchImpl);
    if (addPaid) await markPaidDirty(DB);
    if (addTabs) await splitSupplierTabs(DB, env, wq, sheetId, fetchImpl, c);
    if (widenFilter) {
      const ids = []; for (const tab of allTabs(wq)) { const id = await workQueueSheetId(env, fetchImpl, true, tab); if (id != null) ids.push(id); }
      await batch(env, ids.map(id => fullFilter(id, c)), fetchImpl);
      // The check starts from what the rows show now (the sheet was put right by hand on 29 Oct): rows whose B matches.
      for (const r of await idRows(env, fetchImpl, allTabs(wq))) {
        if (!(r.orderId > 0)) continue;
        const o = await DB.prepare('SELECT id, order_ref FROM client_orders WHERE id=?').bind(r.orderId).first();
        if (o && cellStr(r.ref) === refOf(o)) await saveRef(DB, o);
      }
    }
    if (fixTotals) await batchValues(env, summaryRows(allTabs(wq), c), fetchImpl);
    if (addItemCosts) {
      const tabs = []; for (const tab of allTabs(wq)) { const id = await workQueueSheetId(env, fetchImpl, true, tab); if (id != null) tabs.push([tab, id]); }
      for (const [, id] of tabs) await ensureColumns(env, id, c.END, fetchImpl);
      await batchValues(env, tabs.map(([tab]) => ({ range: `${tab}!A5:${L(c.END - 1)}5`, values: [c.h.map(bi)] })).concat({ range: `${wq}!A3`, values: [[instructions]] }), fetchImpl);
      await batch(env, tabs.flatMap(([, id]) => [...itemCostsFormat(id, c), fullFilter(id, c)]), fetchImpl);
    }
    if (addRefunded) {
      const ids = []; for (const tab of allTabs(wq)) { const id = await workQueueSheetId(env, fetchImpl, true, tab); if (id != null) ids.push(id); }
      await batch(env, ids.map(id => statusRule(id, c)), fetchImpl); await markPaidDirty(DB);
    }
    // 19) Cost per product next to Total cost (Erwin, 30 Oct 2026): the AI column moves to Q on every supplier tab, in one
    //     batch (all tabs or none). Google moves its cells, colours, rules, protection, hidden columns and groups with
    //     it; Q-AH move one to the right. Then the header, row 4 and the instructions are written for the new places.
    //     Each tab is checked first, so it is safe to run again.
    if (c === C18) {
      const tabs = []; for (const tab of allTabs(wq)) { const id = await workQueueSheetId(env, fetchImpl, true, tab); if (id != null) tabs.push([tab, id]); }
      const move = []; for (const [tab, id] of tabs) if ((await header(tab))[C18.ITEMS] === ITEM_COSTS) move.push({ moveDimension: { source: { sheetId: id, dimension: 'COLUMNS', startIndex: C18.ITEMS, endIndex: C18.ITEMS + 1 }, destinationIndex: C.ITEMS } });
      if (move.length) await batch(env, [...move, ...tabs.flatMap(([, id]) => itemCostsFormat(id))], fetchImpl);
      for (const [tab] of tabs) if ((await header(tab))[C.ITEMS] !== ITEM_COSTS) throw new Error(`Cost per product did not move to ${L(C.ITEMS)} in ${tab}`);
      await batchValues(env, [...tabs.map(([tab]) => ({ range: `${tab}!A5:${L(C.END - 1)}5`, values: [HEADERS.map(bi)] })), { range: `${wq}!A3`, values: [[instructions]] }, ...summaryRows(tabs.map(([tab]) => tab))], fetchImpl);
    }
    // 20) AJ Status changed on all three tabs (Erwin, 8 Nov 2026). Added at the far right, so no column moves; it is
    //     website-written (protected) and the filter grows to A-AJ so a sort still moves whole rows. Every row gets its date.
    const addStatusDate = h[C.CHANGED] !== STATUS_DATE;
    if (addStatusDate) {
      const tabs = []; for (const tab of allTabs(wq)) { const id = await workQueueSheetId(env, fetchImpl, true, tab); if (id != null) tabs.push([tab, id]); }
      for (const [, id] of tabs) await ensureColumns(env, id, C.END, fetchImpl);
      await batchValues(env, tabs.map(([tab]) => ({ range: `${tab}!A5:${L(C.END - 1)}5`, values: [HEADERS.map(bi)] })), fetchImpl);
      const email = googleSheetsConfig(env).email;
      await batch(env, tabs.flatMap(([, id]) => [...statusDateFormat(id), fullFilter(id), { addProtectedRange: { protectedRange: { range: { sheetId: id, startColumnIndex: C.CHANGED, endColumnIndex: C.CHANGED + 1 }, description: 'Filled in by the Direct Line website', editors: { users: [email] } } } }]), fetchImpl);
      await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE NOT archived").run();
    }
    // 21-22) Clean-up after layout 20's first hour (8 Nov 2026): rows Google appended in the wrong columns, and rows left
    //     blank by syncs that ran side by side, have A and B empty. They are deleted (the website has every order) and
    //     every order is written again, so orders whose row was lost come back.
    for (const tab of allTabs(wq)) {
      const id = await workQueueSheetId(env, fetchImpl, true, tab);
      if (id == null) continue;
      const rows = (await sheetsRequest(env, '/values/' + encodeURIComponent(`${tab}!A${FIRST_ROW}:${L(C.END - 1)}`), {}, fetchImpl)).values || [];
      const broken = rows.map((r, i) => (!norm(r?.[0]) && !norm(r?.[1]) ? FIRST_ROW + i : 0)).filter(Boolean);
      if (broken.length) await batch(env, deleteRowRequests(id, broken), fetchImpl);
    }
    if (Number(v) >= 20) await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE NOT archived").run();
    // Every active row is written again so the new columns get their values.
    await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE NOT archived AND (tax_number IS NOT NULL OR gift_message IS NOT NULL OR courier IS NOT NULL OR status IN ('cancelled','cancellation_requested') OR revision_status <> '')").run();
    await putSetting(DB, LAYOUT, LAYOUT_NOW);
    await DB.prepare('DELETE FROM portal_settings WHERE key IN (?, ?, ?, ?, ?, ?)').bind(DUP_ALERTS, REV_RULES, ZH_KEY, NEW_CANCEL_KEY, CANCEL_SORT_KEY, FILLS_KEY).run(); // re-checked next time (tabs may be new)
    return true;
  } catch (e) {
    await DB.prepare('DELETE FROM portal_settings WHERE key=? AND value=?').bind(LAYOUT, 'migrating:' + t).run();
    throw e;
  }
}

// Layout 14: the Shipped and Cancelled tabs are copies of the supplier tab (same columns, colours, dropdowns, protection,
// filter); then each tab keeps only its own rows, newest on top. All in one batch: Google applies it all or nothing, so
// no row is lost or left in two tabs. Rows without an order id stay in the supplier tab (below the orders).
async function splitSupplierTabs(DB, env, wq, wqId, fetchImpl, c = C) {
  const props = ((await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl)).sheets || []).map(x => x.properties || {});
  const have = [SHIPPED_TAB, CANCELLED_TAB].filter(t => props.some(p => p.title === t));
  if (have.length === 2) return;
  if (have.length) throw new Error(`A tab called "${have[0]}" is in the way; rename it so the website can add its own.`);
  const grid = (await sheetsRequest(env, '/values/' + encodeURIComponent(`${wq}!A${FIRST_ROW}:${L(c.END - 1)}`) + '?majorDimension=ROWS', {}, fetchImpl)).values || [];
  const rows = grid.map((r, i) => ({ row: FIRST_ROW + i, orderId: Number(r?.[c.ID]) })), info = new Map();
  const ids = rows.map(r => r.orderId).filter(id => Number.isSafeInteger(id) && id > 0);
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    for (const o of (await DB.prepare(`SELECT id, status, tracking_number, created_at FROM client_orders WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results || []) info.set(Number(o.id), o);
  }
  const used = new Set(props.map(p => p.sheetId)), newId = () => { let id; do id = 1 + Math.floor(Math.random() * 2e9); while (used.has(id)); used.add(id); return id; };
  const sid = { [wq]: wqId, [SHIPPED_TAB]: newId(), [CANCELLED_TAB]: newId() }, at = Math.max(0, props.findIndex(p => p.sheetId === wqId));
  const requests = [SHIPPED_TAB, CANCELLED_TAB].map((title, i) => ({ duplicateSheet: { sourceSheetId: wqId, newSheetId: sid[title], newSheetName: title, insertSheetIndex: at + 1 + i } }));
  const newest = (a, b) => Number(b.o.created_at || 0) - Number(a.o.created_at || 0) || b.o.id - a.o.id;
  for (const tab of allTabs(wq)) {
    const mine = rows.filter(r => info.has(r.orderId) && tabFor(info.get(r.orderId), wq) === tab);
    // The supplier tab loses the rows that moved; the copies keep only theirs (empty and id-less rows go too).
    const stay = tab === wq ? rows.filter(r => !info.has(r.orderId) || tabFor(info.get(r.orderId), wq) === wq) : mine;
    requests.push(...deleteRowRequests(sid[tab], rows.filter(r => !stay.includes(r)).map(r => r.row)));
    const want = [...mine.map(r => ({ ...r, o: info.get(r.orderId) })).sort(newest), ...stay.filter(r => !mine.includes(r))];
    const now = stay.map(r => r.row);
    want.forEach((r, p) => { const j = now.indexOf(r.row); if (j !== p) { requests.push(moveRow(sid[tab], FIRST_ROW + j, FIRST_ROW + p)); now.splice(j, 1); now.splice(p, 0, r.row); } });
  }
  await batch(env, requests, fetchImpl);
  for (const [tab, id] of Object.entries(sid)) sheetIdCache.set(cacheKey(env, tab), id);
  await batchValues(env, [...Object.entries(tabText).map(([tab, [title, text]]) => ({ range: `${tab}!A2:A3`, values: [[title], [text]] })), ...summaryRows([SHIPPED_TAB, CANCELLED_TAB], c)], fetchImpl);
  // The copies keep the website's protected columns; if Google did not copy the protection, it is added.
  const prot = (await sheetsRequest(env, '?fields=sheets(properties(sheetId),protectedRanges(protectedRangeId))', {}, fetchImpl)).sheets || [];
  const email = googleSheetsConfig(env).email, bare = [sid[SHIPPED_TAB], sid[CANCELLED_TAB]].filter(id => !prot.find(s => s.properties?.sheetId === id)?.protectedRanges?.length);
  if (bare.length) await batch(env, bare.flatMap(sheetId => websiteProtection(sheetId, email, c)), fetchImpl);
}
const websiteProtection = (sheetId, email, c = C) => [[{ sheetId, startColumnIndex: 0, endColumnIndex: 14 }, 'Filled in by the Direct Line website'],
  [{ sheetId, startColumnIndex: c.PAIDC, endColumnIndex: c.CLIENT + 1 }, 'Filled in by the Direct Line website'], [{ sheetId, startRowIndex: 0, endRowIndex: 5, startColumnIndex: 14, endColumnIndex: c.PAIDC }, 'Column headers']]
  .map(([range, description]) => ({ addProtectedRange: { protectedRange: { range, description, editors: { users: [email] } } } }));

// ---------- Billing tab (Ada, 1 Nov 2026) ----------
// Ada bills per order and needs one list of every order (not split by shipping status), with what our clients have
// paid apart from what they haven't. "Billing" is worked out by the sheet itself (FILTER formulas over Orders and
// Shipped, newest first; cancelled orders are not in it): left PAID by our clients, right NOT PAID yet, a count and
// total on top. The website only writes the formulas (when the tab is missing or its version / the layout changed) and
// never reads the tab, so nothing typed or shown there can change an order or a bill. The whole tab is protected.
// Errors here are logged and never stop the order sync.
export const BILLING_TAB = 'Billing';
const BILLING_KEY = 'supplier_billing_tab', BILLING_V = '4';
const BILL_COLS = ['Date', 'Order', 'Shop', 'Product / variation', 'Qty', 'Total cost (USD)', ITEM_COSTS, 'Shipping status', 'Client paid'];
// Cancelled orders and the supplier's refund (Erwin, 3 Nov 2026: "properly show the whole refund calculation"), far
// right from U: every cancelled order, the ones our client PAID first, with what was paid for it (Total cost: the
// supplier's cost, our fee not included) and the supplier's cancellation fee. Refund = paid - fee on each order (an
// unpaid order only owes its fee); the TOTAL row adds them up and row 3 shows the whole sum.
const REFUND_COLS = ['Date', 'Order', 'Shop', 'Product / variation', 'Client paid', 'Total cost (USD)', 'Paid for it (USD)', 'Cancellation fee (USD)', 'Refund (USD)'];
// Totals per cancel date (Erwin, 9 Nov 2026: "it should accurately show both", the paid amount and the fees of the
// orders cancelled on one day): right of the refund part, one line per day of AJ Status changed (China time), newest
// first. Paid orders: what was paid, their fees and the refund; not paid orders only owe their fee.
const DAY_COLS = ['Cancelled on', 'Cancelled', 'Paid orders', 'Paid for them (USD)', 'Fees on paid (USD)', 'Refund (USD)', 'Not paid', 'Fees not paid (USD)'];
const REFUND_AT = 2 * BILL_COLS.length + 2, REFUND_END = REFUND_AT + REFUND_COLS.length, DAYS_AT = REFUND_END + 1, BILLING_WIDTH = DAYS_AT + DAY_COLS.length;
export const BILLING_HEADERS = [...BILL_COLS, '', ...BILL_COLS, '', ...REFUND_COLS, '', ...DAY_COLS];
const BILLING_HELP = 'All orders from Orders and Shipped, newest first. Left: PAID by our clients. Middle: NOT PAID yet. Right (from column U): CANCELLED orders and the refund (paid minus cancellation fees). Worked out by the sheet: do not type here.\nOrders 和 Shipped 的所有订单，最新的在前。左边：客户已付款。中间：未付款。右边（从 U 列开始）：已取消订单和退款（已付金额减取消费）。由表格自动计算，请不要在这里输入。';
export function billingCells(wq, c = C) {
  const q = t => `'${t.replace(/'/g, "''")}'`, tabs = [wq, SHIPPED_TAB], last = L(c.PAIDC);
  const col = n => `INDIRECT("${q('@')}!${n}${FIRST_ROW}:${n}")`, both = (f, n) => tabs.map(t => f(col(n).replace('@', t)));
  const pick = BILL_COLS.map(h => c.h.indexOf(h) + 1).join(',');
  const rows = `{${tabs.map(t => `INDIRECT("${q(t)}!A${FIRST_ROW}:${last}${''}")`).join(';')}}`;
  const list = (cond, none) => `=IFERROR(SORT(LET(d,${rows},FILTER(CHOOSECOLS(d,${pick}),INDEX(d,,2)<>"",INDEX(d,,${c.PAIDC + 1})${cond})),1,FALSE),"${none}")`;
  const P = L(c.COST), B = 'B', W = L(c.PAIDC);
  const paidN = tabs.map(t => `COUNTIF(${col(W).replace('@', t)},"${PAID}")`).join('+'), paidSum = tabs.map(t => `SUMIF(${col(W).replace('@', t)},"${PAID}",${col(P).replace('@', t)})`).join('+');
  const openN = tabs.map(t => `COUNTIFS(${col(B).replace('@', t)},"<>",${col(W).replace('@', t)},"<>${PAID}")`).join('+');
  const openSum = tabs.map(t => `SUMIFS(${col(P).replace('@', t)},${col(B).replace('@', t)},"<>",${col(W).replace('@', t)},"<>${PAID}")`).join('+');
  // Refunds: the Cancelled tab, A to Cancellation fee.
  const cx = n => `INDIRECT("${q(CANCELLED_TAB)}!${n}${FIRST_ROW}:${n}")`, W1 = c.PAIDC + 1, P1 = c.COST + 1, F1 = c.FEE + 1, U = L(REFUND_AT);
  const got = `SUMIF(${cx(W)},"${PAID}",${cx(P)})`, fees = `SUM(${cx(L(c.FEE))})`;
  const refundTop = `="CANCELLED: REFUND DUE "&TEXT(${got}-${fees},"$#,##0.00")&"  =  paid by our clients "&TEXT(${got},"$#,##0.00")&" ("&COUNTIF(${cx(W)},"${PAID}")&" orders)  −  cancellation fees "&TEXT(${fees},"$#,##0.00")&" ("&COUNTIF(${cx(L(c.FEE))},">0")&" orders)"&CHAR(10)&"已取消：应退款 "&TEXT(${got}-${fees},"$#,##0.00")&" = 客户已付 "&TEXT(${got},"$#,##0.00")&"（"&COUNTIF(${cx(W)},"${PAID}")&" 单）− 取消费 "&TEXT(${fees},"$#,##0.00")&"（"&COUNTIF(${cx(L(c.FEE))},">0")&" 单）"`;
  const refundList = `=ARRAYFORMULA(IFERROR(LET(d,INDIRECT("${q(CANCELLED_TAB)}!A${FIRST_ROW}:${L(c.FEE)}"),f,FILTER(d,INDEX(d,,2)<>""),paid,INDEX(f,,${W1})="${PAID}",`
    + `cost,IF(ISNUMBER(INDEX(f,,${P1})),INDEX(f,,${P1}),0),fee,IF(ISNUMBER(INDEX(f,,${F1})),INDEX(f,,${F1}),0),got,IF(paid,cost,0),`
    + `VSTACK(SORT(HSTACK(CHOOSECOLS(f,1,2,3,${c.h.indexOf('Product / variation') + 1}),INDEX(f,,${W1}),cost,got,fee,got-fee),paid,FALSE,INDEX(f,,1),FALSE),`
    + `HSTACK("","","","TOTAL 合计","",SUM(cost),SUM(got),SUM(fee),SUM(got)-SUM(fee)))),"No cancelled orders · 暂无已取消订单"))`;
  const AJ1 = c.CHANGED + 1, D = L(DAYS_AT), on = 'SUMPRODUCT(--(dy=x)';
  const dayTop = 'BY CANCEL DATE (Status changed, China time): paid orders, their fees and the refund. Not paid orders only owe their fee.\n按取消日期（状态更新时间，中国时间）：已付款订单、取消费和退款。未付款订单只需付取消费。';
  const dayList = `=ARRAYFORMULA(IFERROR(LET(d,INDIRECT("${q(CANCELLED_TAB)}!A${FIRST_ROW}:${L(c.CHANGED)}"),f,FILTER(d,INDEX(d,,2)<>""),`
    + `dy,IF(ISNUMBER(INDEX(f,,${AJ1})),INT(INDEX(f,,${AJ1})),-1),paid,--(INDEX(f,,${W1})="${PAID}"),`
    + `cost,IF(ISNUMBER(INDEX(f,,${P1})),INDEX(f,,${P1}),0),fee,IF(ISNUMBER(INDEX(f,,${F1})),INDEX(f,,${F1}),0),k,SORT(UNIQUE(FILTER(dy,dy>0)),1,FALSE),`
    + `HSTACK(k,MAP(k,LAMBDA(x,${on}))),MAP(k,LAMBDA(x,${on},paid))),MAP(k,LAMBDA(x,${on},paid,cost))),MAP(k,LAMBDA(x,${on},paid,fee))),`
    + `MAP(k,LAMBDA(x,${on},paid,cost-fee))),MAP(k,LAMBDA(x,${on},1-paid))),MAP(k,LAMBDA(x,${on},1-paid,fee))))),"No cancelled orders · 暂无已取消订单"))`;
  return [
    { range: `${BILLING_TAB}!A1:A2`, values: [['Direct Line — Billing'], [BILLING_HELP]] },
    { range: `${BILLING_TAB}!A3:K3`, values: [[`="PAID by our clients: "&(${paidN})&" orders · "&TEXT(${paidSum},"$#,##0.00")&CHAR(10)&"客户已付款："&(${paidN})&" 单 · "&TEXT(${paidSum},"$#,##0.00")`, '', '', '', '', '', '', '', '', '', `="NOT PAID yet: "&(${openN})&" orders · "&TEXT(${openSum},"$#,##0.00")&CHAR(10)&"未付款："&(${openN})&" 单 · "&TEXT(${openSum},"$#,##0.00")`]] },
    { range: `${BILLING_TAB}!A4:${L(BILLING_WIDTH - 1)}4`, values: [BILLING_HEADERS.map(bi)] },
    { range: `${BILLING_TAB}!A5:K5`, values: [[list(`="${PAID}"`, 'No paid orders yet · 暂无已付款订单'), '', '', '', '', '', '', '', '', '', list(`<>"${PAID}"`, 'No unpaid orders · 暂无未付款订单')]] },
    { range: `${BILLING_TAB}!${U}3`, values: [[refundTop]] },
    { range: `${BILLING_TAB}!${U}5`, values: [[refundList]] },
    { range: `${BILLING_TAB}!${D}3`, values: [[dayTop]] },
    { range: `${BILLING_TAB}!${D}5`, values: [[dayList]] },
  ];
}
const billingFormat = (sheetId, email) => {
  const r = (r1, r2, c1, c2) => ({ sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 });
  const fill = (range, rgb, bold) => ({ repeatCell: { range, cell: { userEnteredFormat: { backgroundColor: rgb, textFormat: { bold } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } });
  const widths = [95, 125, 135, 220, 50, 110, 150, 120, 95, 30];
  return [
    { repeatCell: { range: r(0, 1, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } },
    fill(r(2, 4, 0, 9), green, true), fill(r(2, 4, 10, 19), orange, true),
    { repeatCell: { range: r(4, 1000, 0, 19), cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
    ...[5, 15].map(i => ({ repeatCell: { range: r(4, 1000, i, i + 1), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } })),
    ...[...widths.slice(0, 9), widths[9], ...widths.slice(0, 9)].map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    { addProtectedRange: { protectedRange: { range: { sheetId }, description: 'Billing: worked out by the sheet (Direct Line)', editors: { users: [email] } } } },
    ...refundFormat(sheetId), ...dayFormat(sheetId), ...billingHeadRows(sheetId),
  ];
};
// The part per cancel date (AE-AL): light blue header, the date, counts, dollars, widths.
const dayFormat = sheetId => {
  const r = (r1, r2, c1, c2) => ({ sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 }), A = DAYS_AT, Z = BILLING_WIDTH;
  return [
    { repeatCell: { range: r(2, 4, A, Z), cell: { userEnteredFormat: { backgroundColor: { red: 0.85, green: 0.92, blue: 1 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: r(4, 1000, A, Z), cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
    { repeatCell: { range: r(4, 1000, A, A + 1), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'd mmm yyyy' }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(numberFormat,textFormat)' } },
    ...[3, 4, 5, 7].map(i => ({ repeatCell: { range: r(4, 1000, A + i, A + i + 1), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } })),
    // Counts are plain numbers (10 Nov 2026: the new columns copied the dollar format of the column before them).
    ...[1, 2, 6].map(i => ({ repeatCell: { range: r(4, 1000, A + i, A + i + 1), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })),
    ...[30, 110, 80, 80, 120, 120, 110, 75, 120].map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: A - 1 + i, endIndex: A + i }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
  ];
};
// The refund part (U-AC): rose header, dollars, widths, and the TOTAL row in bold.
const rose = { red: 0.98, green: 0.84, blue: 0.84 };
const refundFormat = sheetId => {
  const r = (r1, r2, c1, c2) => ({ sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 }), A = REFUND_AT, Z = REFUND_END;
  return [
    { repeatCell: { range: r(2, 4, A, Z), cell: { userEnteredFormat: { backgroundColor: rose, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: r(4, 1000, A, Z), cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
    { repeatCell: { range: r(4, 1000, A + 5, Z), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
    ...[30, 95, 125, 135, 220, 85, 110, 110, 120, 110].map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: A - 1 + i, endIndex: A + i }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    { addConditionalFormatRule: { rule: { ranges: [r(4, 1000, A, Z)], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=LEFT($${L(A + 3)}5,5)="TOTAL"` }] }, format: { backgroundColor: rose, textFormat: { bold: true } } } } } },
  ];
};
// Adds the Billing tab if it is missing and (re)writes its formulas. Returns what it did.
export async function ensureBillingTab(DB, env, fetchImpl = fetch, { force = false } = {}) {
  const want = BILLING_V + '|' + LAYOUT_NOW, { wq } = await tabNames(DB);
  const props = ((await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl)).sheets || []).map(x => x.properties || {});
  if (!props.some(p => p.title === wq) || !props.some(p => p.title === SHIPPED_TAB)) return 'no supplier tabs yet';
  let tab = props.find(p => p.title === BILLING_TAB);
  if (tab && !force && await getSetting(DB, BILLING_KEY) === want) return 'up to date';
  if (!tab) {
    const at = props.findIndex(p => p.title === CANCELLED_TAB) + 1 || props.length;
    const made = await batch(env, [{ addSheet: { properties: { title: BILLING_TAB, index: at, gridProperties: { rowCount: 1000, columnCount: BILLING_WIDTH, frozenRowCount: 4 } } } }], fetchImpl);
    tab = made?.replies?.[0]?.addSheet?.properties;
    if (tab?.sheetId == null) throw new Error('Billing tab was not added');
    await batch(env, billingFormat(tab.sheetId, googleSheetsConfig(env).email), fetchImpl);
  } else if ((tab.gridProperties?.columnCount || 0) < BILLING_WIDTH) {
    // A Billing tab from before the refund part (3 Nov 2026): its columns and their look are added once.
    // A tab that has the refund part already (9 Nov 2026) only gets the part per cancel date: its TOTAL rule is not added twice.
    const had = tab.gridProperties?.columnCount || 0;
    await batch(env, [{ appendDimension: { sheetId: tab.sheetId, dimension: 'COLUMNS', length: BILLING_WIDTH - had } }, ...(had < REFUND_END ? refundFormat(tab.sheetId) : []), ...dayFormat(tab.sheetId)], fetchImpl);
  } else await batch(env, dayFormat(tab.sheetId), fetchImpl); // a new version: the per-date look again (no rules in it, safe to repeat)
  await batchValues(env, billingCells(wq), fetchImpl);
  await putSetting(DB, BILLING_KEY, want);
  return tab ? 'written' : 'added';
}
// Colour rules that slid down (Erwin, 2 Nov 2026): an order moved to the top of a tab (newest on top) pushes the colour
// rules that start at that row one row down. On the Shipped tab they had slid to row 44, so the orange cost revision
// rows, Paid / Not paid and delay colours were missing on rows 6-43. Every sheet check puts any slid rule of Orders and
// Shipped back to start at the first order row (one read; a write only when a rule slid).
export async function fixRuleRanges(DB, env, fetchImpl = fetch) {
  // Cancelled too (8 Nov 2026): deleting the broken rows on top slid its red "cancelled" rules to row 18, so the
  // newest cancelled orders (rows 6-17) were not red.
  const { wq } = await tabNames(DB), tabs = allTabs(wq), top = FIRST_ROW - 1;
  // The cancelled / cancel-requested row colours must cover A to the last website column in ONE range. The live sheet had
  // two ranges, A-P and R-AE (Google split them when Cost per product moved to Q in layout 19), so Q stayed plain yellow
  // on pink rows (Erwin, 9 Nov 2026). Merged back into one range here.
  const rowRuleGap = rule => {
    const f = String(rule.booleanRule?.condition?.values?.[0]?.userEnteredValue || ''), rs = rule.ranges || [];
    if (rs.length < 2 || !(f.includes(`"${STATUS.cancelled}"`) || f.includes(`"${STATUS.cancellation_requested}"`))) return null;
    const a = Math.min(...rs.map(r => r.startColumnIndex ?? 0)), b = Math.max(...rs.map(r => r.endColumnIndex ?? 0));
    return a === 0 && b === C.MORE + 1 ? [a, b] : null;
  };
  const data = await sheetsRequest(env, '?fields=sheets(properties(sheetId,title),conditionalFormats)', {}, fetchImpl);
  const requests = [];
  for (const s of data?.sheets || []) {
    if (!tabs.includes(s.properties?.title)) continue;
    (s.conditionalFormats || []).forEach((rule, index) => {
      if (!rule.booleanRule) return;
      const start = Math.min(...(rule.ranges || []).map(r => r.startRowIndex ?? 0)), by = Math.max(0, start - top), merge = rowRuleGap(rule);
      if (!(by > 0) && !merge) return;
      let ranges = rule.ranges.map(r => ({ ...r, startRowIndex: (r.startRowIndex ?? 0) - by }));
      if (merge) ranges = [{ ...ranges[0], startColumnIndex: merge[0], endColumnIndex: merge[1] }];
      // Custom formulas point at their first row ($O44): point them back at row 6. Other conditions have no cells.
      const c = rule.booleanRule.condition, values = by > 0 && c.type === 'CUSTOM_FORMULA'
        ? c.values.map(v => ({ ...v, userEnteredValue: String(v.userEnteredValue).replace(/(\$?[A-Z]{1,3})(\d+)/g, (m, col, row) => col + (Number(row) - by)) })) : c.values;
      requests.push({ updateConditionalFormatRule: { index, sheetId: s.properties.sheetId, rule: { ranges, booleanRule: { ...rule.booleanRule, condition: { ...c, ...(values ? { values } : {}) } } } } });
    });
  }
  if (requests.length) await batch(env, requests, fetchImpl);
  return requests.length;
}
const rulesSafely = async (DB, env, fetchImpl) => { try { return await fixRuleRanges(DB, env, fetchImpl); } catch (e) { console.error('Sheet colour rules not checked', e); return 'error: ' + String(e.message || e).slice(0, 200); } };
const billingSafely = async (DB, env, fetchImpl, opts) => { try { return await ensureBillingTab(DB, env, fetchImpl, opts); } catch (e) { console.error('Billing tab not updated', e); return 'error: ' + String(e.message || e).slice(0, 200); } };

// Renames the tabs (see tabNames): 1) the hidden website log "Orders" -> "Order Log"; 2) at least 10 minutes later,
// "Work Queue" -> "Orders" (and its title cell). Each step checks the sheet first, so it is safe to run again.
export async function ensureTabNames(DB, env, fetchImpl = fetch) {
  const v = String(await getSetting(DB, TAB_NAMES) || ''), t = Math.floor(Date.now() / 1000);
  if (v === 'done') return true;
  const busy = /^migrating-(\d):(\d+)$/.exec(v);
  if (busy && t - Number(busy[2]) < 300) return false;
  const step = v.startsWith('log:') || busy?.[1] === '2' ? 2 : 1;
  if (v.startsWith('log:') && t - Number(v.slice(4)) < TAB_GAP) return false;
  // Claim it so only one request does the step.
  const claim = v === '' && !(await DB.prepare('SELECT 1 AS x FROM portal_settings WHERE key=?').bind(TAB_NAMES).first())
    ? await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO NOTHING RETURNING key').bind(TAB_NAMES, `migrating-${step}:${t}`).first()
    : await DB.prepare('UPDATE portal_settings SET value=? WHERE key=? AND value=? RETURNING key').bind(`migrating-${step}:${t}`, TAB_NAMES, v).first();
  if (!claim) return false;
  const back = step === 2 ? (v.startsWith('log:') ? v : 'log:' + (t - TAB_GAP)) : v;
  try {
    const props = ((await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl)).sheets || []).map(x => x.properties || {});
    const tab = title => props.find(p => p.title === title), rename = (p, title) => ({ updateSheetProperties: { properties: { sheetId: p.sheetId, title }, fields: 'title' } });
    if (step === 1) {
      // Only the website's hidden log: while "Work Queue" still exists, "Orders" can't be the supplier tab.
      if (tab(LOG_OLD) && tab(WQ) && !tab(LOG_NEW)) await batch(env, [rename(tab(LOG_OLD), LOG_NEW)], fetchImpl);
      await putSetting(DB, TAB_NAMES, 'log:' + t);
      return false;
    }
    if (tab(WQ) && tab(WQ_NEW)) throw new Error('A tab called "Orders" is in the way; the supplier tab keeps its old name.');
    if (tab(WQ)) {
      await batch(env, [rename(tab(WQ), WQ_NEW)], fetchImpl);
      await batchValues(env, [{ range: `${WQ_NEW}!A2`, values: [[ORDERS_TITLE]] }], fetchImpl);
    }
    await putSetting(DB, TAB_NAMES, 'done');
    return true;
  } catch (e) {
    await DB.prepare('UPDATE portal_settings SET value=? WHERE key=? AND value=?').bind(back, TAB_NAMES, `migrating-${step}:${t}`).run();
    throw e;
  }
}

// Called from the normal order sync. Adds/updates/removes the order's Work Queue row.
// One sheet write per order at a time (2 Nov 2026): two updates of the same order at the same moment (the order and its
// photos, a cancel and the minute check) both found no row and both added one, so the order showed twice (in the
// supplier tabs and in the Order Log). syncPortalOrderToGoogleSheet runs inside this lock; a second update waits for it.
const LOCK_FOR = 120;
export async function withOrderLock(DB, orderId, run) {
  const key = 'sheet_lock:' + orderId;
  for (let i = 0; ; i++) {
    const t = Math.floor(Date.now() / 1000), until = String(t + LOCK_FOR);
    const got = await DB.prepare(`INSERT INTO portal_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(portal_settings.value AS BIGINT) <= ? RETURNING key`).bind(key, until, t).first();
    if (got) { try { return await run(); } finally { await DB.prepare('DELETE FROM portal_settings WHERE key=? AND value=?').bind(key, until).run(); } }
    if (i >= 40) throw Object.assign(new Error('Another update of this order is still writing to the supplier sheet. This will be retried automatically.'), { busy: true });
    await new Promise(r => setTimeout(r, 500));
  }
}
// How much the supplier filled in on a row (cost, cost per product, tracking, courier, delay, domestic tracking, fee):
// when an order has two rows, the fuller one is the one that counts.
const filled = cells => cells.filter(v => v !== '' && v != null && !/^(not shipped)$/i.test(String(v).trim())).length;
// Called under withOrderLock (syncPortalOrderToGoogleSheet).
// One row write in the supplier tabs at a time (8 Nov 2026): rows are found by number, and a new row on top moves every
// row down. Seventeen orders cancelled at once synced side by side, so one wrote into or deleted another order's row
// (rows went missing, blank rows were left on top). A write that waits too long is retried automatically.
const ROWS_LOCK = 'supplier-rows';
export const syncWorkQueueRow = (DB, env, order, photos, fetchImpl = fetch) => withOrderLock(DB, ROWS_LOCK, () => syncRowNow(DB, env, order, photos, fetchImpl));
async function syncRowNow(DB, env, order, photos, fetchImpl) {
  if (!await supplierSheetEnabled(DB)) return { enabled: false };
  if (!await ensureLayout(DB, env, fetchImpl)) throw new Error('The supplier sheet is being updated. This will be retried automatically.');
  const { wq } = await tabNames(DB), tabs = allTabs(wq);
  let found = (await idRows(env, fetchImpl, tabs)).filter(r => r.orderId === Number(order.id));
  // Two rows for one order (see withOrderLock): keep the one the supplier filled in, the other copy is removed below.
  if (found.length > 1) {
    const ranges = found.map(r => 'ranges=' + encodeURIComponent(`${r.tab}!${L(C.COST)}${r.row}:${L(C.END - 1)}${r.row}`)).join('&');
    const v = ((await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS', {}, fetchImpl)).valueRanges || []).map(x => x.values?.[0] || []);
    found = found.map((r, i) => ({ ...r, fill: filled(v[i] || []), i })).sort((a, b) => b.fill - a.fill || a.i - b.i);
  }
  const split = found.find(r => rowOutOfLine(r, order));
  if (split) throw Object.assign(new Error(`Supplier sheet row ${split.tab} ${split.row} is out of line: it has order id ${order.id} but shows "${cellStr(split.ref)}" instead of "${order.sheet_ref}". Rows were probably sorted without the hidden columns. Nothing was written; fix the sheet first.`), { outOfLine: true });
  const drop = async list => { for (const t of tabs) await deleteRows(env, list.filter(r => r.tab === t).map(r => r.row), fetchImpl, t); };
  if (order.archived || order.client_archived) { await drop(found); return { enabled: true, removed: found.length }; }
  const shop = order.store_id == null ? null : await DB.prepare('SELECT name FROM client_stores WHERE id=?').bind(order.store_id).first();
  order.client_paid = (await paidLabels(DB, [Number(order.id)])).get(Number(order.id)) || '';
  const { am, qz } = websiteCells(env, order, photos, shop?.name || '');
  // A copy already in the right tab is rewritten in place, unless the supplier filled in a copy elsewhere more: then that
  // one moves here (with its cells) and the emptier copies go.
  const tab = tabFor(order, wq), changes = websiteSupplierCells(order);
  const inTab = found.find(r => r.tab === tab), here = inTab && !(found[0] !== inTab && (found[0].fill || 0) > (inTab.fill || 0)) ? inTab : null;
  if (here) {
    const r = here.row;
    await batchValues(env, [{ range: `${tab}!A${r}:O${r}`, values: [am] }, { range: `${tab}!${L(C.PAIDC)}${r}:${L(C.CLIENT)}${r}`, values: [qz] }, { range: `${tab}!${L(C.CHANGED)}${r}`, values: [[statusDate(order)]] },
      ...changes.map(([i, v]) => ({ range: `${tab}!${L(C.COST + i)}${r}`, values: [[v]] }))], fetchImpl);
    await saveSheetCells(DB, order, changes); await saveRef(DB, order);
    const sheetId = await workQueueSheetId(env, fetchImpl, false, tab);
    if (sheetId != null) await batch(env, [rowHeight(sheetId, r, rowPx(am))], fetchImpl);
    // A copy left in another tab by a move that stopped halfway.
    await drop(found.filter(f => f !== here));
    return { enabled: true, row: r, tab };
  }
  // A new order, or one that changes tab (shipped with tracking, cancelled, or back): it goes on top of its tab. A moving
  // row takes the supplier's cells (P-V, AH, AI) with it exactly as they are in the sheet.
  const from = found[0];
  let supplier, extra;
  if (from) {
    const v = (await sheetsRequest(env, '/values/' + encodeURIComponent(`${from.tab}!${L(C.COST)}${from.row}:${L(C.END - 1)}${from.row}`) + '?majorDimension=ROWS&valueRenderOption=FORMULA', {}, fetchImpl)).values?.[0] || [];
    const keep = x => (typeof x === 'number' || typeof x === 'boolean' ? x : txt(x));
    supplier = SUP.map((_, i) => keep(v[i] ?? '')); extra = [keep(v[C.DOM - C.COST] ?? ''), keep(v[C.FEE - C.COST] ?? ''), statusDate(order)];
    for (const [i, val] of changes) supplier[i] = val;
  } else { supplier = supplierCells(order); extra = extraCells(order); }
  // A blank row is inserted at row 7 (inside the data rows, so the tab's rules, filter and protection grow with it), filled
  // from A, then moved to row 6. Not values:append (8 Nov 2026): Google guesses where the "table" is, and once AJ was added
  // it put new rows on top with their cells shifted right (from W or AJ on), A-V empty.
  const sheetId = await workQueueSheetId(env, fetchImpl, false, tab);
  if (sheetId == null) throw new Error(`Supplier sheet tab ${tab} not found`);
  await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: FIRST_ROW, endIndex: FIRST_ROW + 1 }, inheritFromBefore: true } }], fetchImpl);
  await batchValues(env, [{ range: `${tab}!A${FIRST_ROW + 1}:${L(C.END - 1)}${FIRST_ROW + 1}`, values: [[...am, ...supplier, ...qz, ...extra]] }], fetchImpl);
  if (from) await saveSheetCells(DB, order, changes); else await rememberSupplierCells(DB, order, supplier);
  await saveRef(DB, order);
  await batch(env, [moveRow(sheetId, FIRST_ROW + 1, FIRST_ROW), rowHeight(sheetId, FIRST_ROW, rowPx(am)), ...rowFillRequests(sheetId, FIRST_ROW - 1, FIRST_ROW)], fetchImpl);
  // The new row pushed every old row of this tab one row down.
  await drop(found.map(r => (r.tab === tab && r.row >= FIRST_ROW ? { ...r, row: r.row + 1 } : r)));
  return { enabled: true, row: FIRST_ROW, tab, ...(from ? { moved: from.tab } : { added: true }) };
}

// Supplier cells the website writes itself: what an admin changed on the website since the sheet last showed it
// (tracking, courier, shipped), and the cancel words in Shipping status: cancelled orders say "Cancelled", requests
// "Cancel requested", reopened / rejected ones go back to "Not shipped"; the supplier's own Shipped / Not shipped is left
// alone. [index in P-V, cell, client_orders column, value saved there]
function websiteSupplierCells(o) {
  const out = [], s = norm(o.sheet_shipped), shippedNow = ['shipped', 'delivered'].includes(o.status);
  // NO in Total cost (the cost can't be lower, see applySupplierRow): the cost goes back into the cell.
  if (NO_WORD.test(norm(o.sheet_cost)) && o.supplier_cost != null) out.push([0, Number(o.supplier_cost), 'sheet_cost', String(Number(o.supplier_cost))]);
  if (norm(o.tracking_number) && norm(o.tracking_number) !== norm(o.sheet_tracking)) out.push([S_TRACK, txt(o.tracking_number), 'sheet_tracking', norm(o.tracking_number)]);
  if (norm(o.courier) && norm(o.courier) !== norm(o.sheet_courier)) out.push([S_COURIER, txt(o.courier), 'sheet_courier', norm(o.courier)]);
  if (shippedNow && !isShipped(s)) out.push([S_SHIP, SHIPPED, 'sheet_shipped', SHIPPED]);
  const want = o.status === 'cancelled' ? cancelledWord(o) : o.status === 'cancellation_requested' ? CANCEL_REQ_SHIP : NOT_SHIPPED, cancelWords = [CANCELLED_SHIP, CANCEL_REQ_SHIP, REFUNDED_SHIP];
  if (!shippedNow && want !== s && (cancelWords.includes(want) || cancelWords.includes(s))) out.push([S_SHIP, want, 'sheet_shipped', want]);
  return out;
}
const saveRef = (DB, o) => DB.prepare('UPDATE client_orders SET sheet_ref=? WHERE id=?').bind(refOf(o), o.id).run();
const cancelledWord = o => (o.client_paid === PAID ? REFUNDED_SHIP : CANCELLED_SHIP);
const saveSheetCells = async (DB, o, changes) => { for (const [, , col, v] of changes) await DB.prepare(`UPDATE client_orders SET ${col}=? WHERE id=?`).bind(v, o.id).run(); };
// AH / AI for a row written from the website (new row, setup): what the sheet last showed, so nothing is cleared.
const extraCells = o => { const fee = norm(o.sheet_cancel_fee); return [txt(o.domestic_tracking), /^\d+(\.\d+)?$/.test(fee) ? Number(fee) : txt(fee), statusDate(o)]; };
// AJ: "2026-11-08 17:12" in Manila / China time (both UTC+8), which the sheet reads as a date it can sort.
export const statusDate = o => { const d = new Date((statusAt(o) + 8 * 3600) * 1000); return d.getTime() > 8 * 3600 * 1000 ? d.toISOString().slice(0, 16).replace('T', ' ') : ''; };

// The supplier's columns P–V (S_* = place in them) for a new row: what the website knows about the order.
const SUP = HEADERS.slice(C.COST, C.REASON + 1), S_TRACK = C.TRACK - C.COST, S_COURIER = C.COURIER - C.COST, S_SHIP = C.SHIP - C.COST, S_DELAY = C.DELAY - C.COST;
const supplierCells = o => [o.supplier_cost == null ? '' : Number(o.supplier_cost), txt(o.item_costs), txt(o.tracking_number), txt(o.courier), ['shipped', 'delivered'].includes(o.status) ? SHIPPED : o.status === 'cancelled' ? cancelledWord(o) : o.status === 'cancellation_requested' ? CANCEL_REQ_SHIP : NOT_SHIPPED,
  o.delayed_at ? DELAYED : '', o.delayed_at ? txt(o.delay_reason) : ''];
// What the website last wrote to P-V, so only the supplier's own later edits are applied.
const rememberSupplierCells = (DB, o, s) => DB.prepare('UPDATE client_orders SET sheet_cost=?, sheet_tracking=?, sheet_courier=?, sheet_shipped=?, sheet_delayed=?, sheet_delay_reason=? WHERE id=?')
  .bind(norm(s[0]), norm(o.tracking_number), norm(o.courier), s[S_SHIP], s[S_DELAY], o.delayed_at ? norm(o.delay_reason) : '', o.id).run();
const colName = i => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

// ---------- sheet → website ----------
async function event(DB, o, kind, detail, t) {
  await DB.prepare('INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,?,?,?,?)').bind(o.id, o.client_id, kind, 'admin', detail, t).run();
}
// The supplier's cancellation fee on a cancelled order is billed straight away, exactly that amount (Erwin, 26 Oct 2026:
// "we cancel any time; the supplier can put the fee in the sheet any time and the client is notified right away").
// Before the order is cancelled it only waits on the order (charged when it is cancelled, see order-status.mjs).
export async function chargeCancelFee(DB, order, fee, t = Math.floor(Date.now() / 1000)) {
  const amount = fee == null ? 0 : Number(fee), old = await DB.prepare("SELECT amount FROM client_balance_adjustments WHERE order_id=? AND kind='cancellation_fee'").bind(order.id).first();
  if (Number(old?.amount || 0) === amount) return false;
  await DB.prepare("INSERT INTO client_balance_adjustments (client_id, order_id, kind, amount, note, created_at) VALUES (?,?,'cancellation_fee',?,'Cancellation fee',?) ON CONFLICT(order_id, kind) DO UPDATE SET amount=EXCLUDED.amount, created_at=EXCLUDED.created_at").bind(order.client_id, order.id, amount, t).run();
  await event(DB, order, 'cancel_fee', amount.toFixed(2), t);
  return true;
}
// Admin-only audit of the supplier's own edits in the sheet (Erwin, 26 Oct 2026: "we need to know if the supplier
// changes the product cost when we are not online"). One event per changed cell, old -> new as the sheet showed them.
// kind 'supplier_sheet' is never sent to clients (see /orders/:id/messages and /notifications in portal.mjs).
export const SUPPLIER_SHEET_EVENT = 'supplier_sheet';
// Duplicates in the sheet (2 Nov 2026): two different orders with the same order number or tracking number. Each
// order involved gets one admin event per value (not repeated every minute); the admin bell shows it.
async function tellDuplicates(DB, rows, t) {
  const groups = new Map(), key = (f, v) => f + '|' + v;
  for (const r of rows) for (const [f, v] of [['dup_order', cellStr(r.ref)], ['dup_tracking', cellStr(r.tracking)]]) {
    if (!v) continue; const k = key(f, v); if (!groups.has(k)) groups.set(k, new Map()); groups.get(k).set(r.orderId, r);
  }
  let told = 0;
  for (const [k, byId] of groups) {
    if (byId.size < 2) continue;
    const [f, v] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
    for (const id of byId.keys()) {
      const o = await DB.prepare('SELECT id, client_id FROM client_orders WHERE id=?').bind(id).first(); if (!o) continue;
      const detail = JSON.stringify({ f, to: v, with: [...byId.values()].filter(r => r.orderId !== id).map(r => cellStr(r.ref)).slice(0, 5) });
      if (await DB.prepare("SELECT 1 AS x FROM order_events WHERE order_id=? AND kind=? AND detail LIKE ?").bind(id, SUPPLIER_SHEET_EVENT, JSON.stringify({ f, to: v }).slice(0, -1) + '%').first()) continue;
      await event(DB, o, SUPPLIER_SHEET_EVENT, detail, t); told++;
    }
  }
  return told;
}
async function logSupplierEdits(DB, order, cells, now, t) {
  const was = { cost: order.sheet_cost, tracking: order.sheet_tracking, courier: order.sheet_courier, shipped: order.sheet_shipped, delayed: order.sheet_delayed, reason: order.sheet_delay_reason, cancel_fee: order.sheet_cancel_fee };
  for (const f of Object.keys(was)) {
    if (now[f] === undefined || now[f] === norm(was[f])) continue;
    await event(DB, order, SUPPLIER_SHEET_EVENT, JSON.stringify({ f, from: norm(was[f]), to: now[f] }), t);
  }
}
// A new cost from the supplier on a cost revision (see offerFromSheet). The admin bell / Client orders get one line:
// approved by itself (rev_auto), or waiting for an admin with the reason (rev_check: higher / same / half).
async function revisionOffered(DB, order, cost, t) {
  const r = await offerFromSheet(DB, order, cost, t);
  const detail = r.auto ? { f: 'rev_auto', from: r.from.toFixed(2), to: r.to.toFixed(2) } : { f: 'rev_check', to: Number(cost).toFixed(2), why: r.why };
  await event(DB, order, SUPPLIER_SHEET_EVENT, JSON.stringify(detail), t);
  return r;
}
// Applies one Work Queue row (cost, tracking, shipped) to its order. Returns what changed.
export async function applySupplierRow(DB, order, cells, t = Math.floor(Date.now() / 1000)) {
  const done = [], skipped = [];
  const cost = typeof cells.cost === 'number' ? String(cells.cost) : norm(cells.cost), tracking = norm(cells.tracking), courier = norm(cells.courier), shipped = norm(cells.shipped);
  if (order.archived) return { done, skipped: ['archived'] };
  const cancelFee = cells.cancelFee === undefined ? undefined : typeof cells.cancelFee === 'number' ? String(cells.cancelFee) : norm(cells.cancelFee);
  await logSupplierEdits(DB, order, cells, { cost, tracking, courier: cells.courier === undefined ? undefined : courier, shipped,
    delayed: cells.delayed === undefined ? undefined : typeof cells.delayed === 'boolean' ? String(cells.delayed) : norm(cells.delayed),
    reason: cells.delayed === undefined ? undefined : norm(cells.reason).slice(0, 300), cancel_fee: cancelFee }, t);
  // AH: the supplier's cancellation fee is saved on the order; the admin approves it (cancel box / bulk Cancelled).
  if (cancelFee !== undefined && cancelFee !== norm(order.sheet_cancel_fee)) {
    const n = cancelFee === '' ? null : parseCost(cells.cancelFee);
    if (cancelFee && n === null) skipped.push('cancellation fee not a number: ' + cancelFee);
    else {
      await DB.prepare('UPDATE client_orders SET supplier_cancel_fee=? WHERE id=?').bind(n, order.id).run(); done.push(n == null ? 'cancellation fee cleared' : 'cancellation fee ' + n.toFixed(2));
      const now = await DB.prepare('SELECT id, client_id, status FROM client_orders WHERE id=?').bind(order.id).first();
      if (now?.status === 'cancelled' && await chargeCancelFee(DB, now, n, t)) done.push('cancellation fee billed');
    }
    await DB.prepare('UPDATE client_orders SET sheet_cancel_fee=? WHERE id=?').bind(cancelFee, order.id).run();
  }
  if (cost !== norm(order.sheet_cost)) {
    const n = parseCost(cells.cost);
    if (n === null && order.revision_status && NO_WORD.test(cost)) {
      // NO + reason on a cost revision: the supplier can't lower the cost. The price is kept, the client gets the
      // reason, and the cost goes back into the cell (websiteSupplierCells).
      const reason = noReason(cost);
      await DB.prepare('UPDATE client_orders SET sheet_cost=?, updated_at=? WHERE id=?').bind(cost.slice(0, 400), t, order.id).run();
      const was = await supplierKeeps(DB, order, reason, t);
      await event(DB, order, SUPPLIER_SHEET_EVENT, JSON.stringify({ f: 'rev_no', to: was == null ? '' : was.toFixed(2), why: reason }), t); done.push('cost revision: supplier kept the cost' + (reason ? ' (' + reason + ')' : ''));
    } else if (n === null) { if (cost) skipped.push('cost not a number: ' + cost); await DB.prepare('UPDATE client_orders SET sheet_cost=? WHERE id=?').bind(cost, order.id).run(); }
    else if (order.revision_status) {
      // The client asked for a cost revision: a lower cost is approved at once, anything else waits for an admin.
      await DB.prepare('UPDATE client_orders SET sheet_cost=?, updated_at=? WHERE id=?').bind(cost, t, order.id).run();
      const r = await revisionOffered(DB, order, n, t); done.push(r.auto ? 'cost revision approved ' + r.from.toFixed(2) + ' -> ' + r.to.toFixed(2) : 'cost revision offered ' + n.toFixed(2));
    } else if (order.quoted_unit_price != null) {
      // Fixed-quote orders keep the price the client agreed; the supplier's cost is recorded for the team.
      await DB.prepare("UPDATE client_orders SET supplier_cost=?, sheet_cost=?, revision_done='', updated_at=? WHERE id=?").bind(n, cost, t, order.id).run(); done.push('cost recorded (fixed quote)');
    } else {
      const price = round2(n + Number(order.commission || 0));
      // A later cost change ends the "revision done" note in the sheet.
      await DB.prepare("UPDATE client_orders SET supplier_cost=?, product_cost=?, shipping_fee=NULL, price=?, sheet_cost=?, price_source=NULL, revision_done='', updated_at=? WHERE id=?").bind(n, price, price, cost, t, order.id).run();
      // Remembered for the next identical order (see saved-prices.mjs).
      await rememberPrice(DB, order, n, t);
      // First bill: 'billed'. A later cost change on an order already billed: 'price_changed' with old|new, so the
      // client sees "Order price changed" instead of another "Order billed" (Erwin, 27 Oct 2026).
      const before = order.product_cost == null ? null : round2(order.price || 0);
      if (before != null && before > 0 && price !== before) { await event(DB, order, 'price_changed', before.toFixed(2) + '|' + price.toFixed(2), t); done.push('price changed ' + before.toFixed(2) + ' -> ' + price.toFixed(2)); }
      else if (price !== round2(order.price || 0) || order.product_cost == null) { await event(DB, order, 'billed', price.toFixed(2), t); done.push('billed ' + price.toFixed(2)); }
    }
  }
  if (tracking !== norm(order.sheet_tracking)) {
    if (tracking && tracking !== norm(order.tracking_number)) {
      await DB.prepare('UPDATE client_orders SET tracking_number=?, last_tracking_update_at=?, updated_at=? WHERE id=?').bind(tracking.slice(0, 120), t, t, order.id).run();
      await event(DB, order, 'tracking', tracking.slice(0, 120), t); done.push('tracking');
    }
    await DB.prepare('UPDATE client_orders SET sheet_tracking=? WHERE id=?').bind(tracking, order.id).run();
  }
  // Courier: shown to the client next to the tracking number. Clearing the cell clears it.
  if (cells.courier !== undefined && courier !== norm(order.sheet_courier)) {
    if (courier !== norm(order.courier)) { await DB.prepare('UPDATE client_orders SET courier=?, updated_at=? WHERE id=?').bind(courier.slice(0, 60) || null, t, order.id).run(); done.push(courier ? 'courier' : 'courier cleared'); }
    await DB.prepare('UPDATE client_orders SET sheet_courier=? WHERE id=?').bind(courier, order.id).run();
  }
  if (shipped !== norm(order.sheet_shipped)) {
    if (isShipped(shipped)) {
      const current = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(order.id).first();
      if (['pending', 'processing'].includes(current.status)) { await changeStatus(DB, current, 'status', { status: 'shipped' }, true); done.push('shipped'); }
      else if (!['shipped', 'delivered'].includes(current.status)) skipped.push('not shipped: order is ' + current.status);
    }
    await DB.prepare('UPDATE client_orders SET sheet_shipped=? WHERE id=?').bind(shipped, order.id).run();
  }
  // Possibly delayed (T) + reason (U): the client is told when it is set, when the reason changes and when it is cleared.
  if (cells.delayed !== undefined) {
    const flag = typeof cells.delayed === 'boolean' ? String(cells.delayed) : norm(cells.delayed), reason = norm(cells.reason).slice(0, 300);
    if (flag !== norm(order.sheet_delayed) || reason !== norm(order.sheet_delay_reason)) {
      if (isDelayed(cells.delayed)) {
        if (!order.delayed_at || reason !== norm(order.delay_reason)) {
          await DB.prepare('UPDATE client_orders SET delayed_at=COALESCE(delayed_at,?), delay_reason=?, updated_at=? WHERE id=?').bind(t, reason || null, t, order.id).run();
          await event(DB, order, 'delayed', reason, t); done.push(order.delayed_at ? 'delay reason' : 'delayed');
        }
      } else if (order.delayed_at) {
        await DB.prepare('UPDATE client_orders SET delayed_at=NULL, delay_reason=NULL, updated_at=? WHERE id=?').bind(t, order.id).run();
        await event(DB, order, 'delay_cleared', '', t); done.push('delay cleared');
      }
      await DB.prepare('UPDATE client_orders SET sheet_delayed=?, sheet_delay_reason=? WHERE id=?').bind(flag, reason, order.id).run();
    }
  }
  return { done, skipped };
}

// ---------- quick look without the database (Neon free plan, 26 Oct 2026) ----------
// The every-minute cron kept the database awake 24/7 and used up Neon's free hours (the site went down). Now the
// cron first reads only the Google Sheet: what the supplier can change (Orders P-V + ids AF + AH-AI, and the
// Product Quotes tab). If it is the same as at the last full check, the database is not touched. A full check still
// runs at least every FULL_EVERY seconds (rows waiting for the sheet are rewritten; an open admin does it at once).
// The last fingerprint is kept on the spreadsheet itself (invisible developer metadata), not in the database.
const SEEN_KEY = 'dl-supplier-sheet-seen', FULL_EVERY = 3 * 3600;
// Part of the fingerprint: changed when an update has one-time work in the sheet (e.g. the cost revision colours,
// 3 Nov 2026), so the first minute after it is live runs a full check instead of waiting up to 3 hours.
const SHEET_WORK = 'row-fix-2'; // layout 22 (blank / broken rows removed, every order rewritten, 8 Nov 2026)
// What the website reads from each supplier tab: P-V, the order id, AH-AI and B (the row check).
const supplierRanges = tab => [`${tab}!${L(C.COST)}${FIRST_ROW}:${L(C.REASON)}`, `${tab}!${L(C.ID)}${FIRST_ROW}:${L(C.ID)}`, `${tab}!${L(C.DOM)}${FIRST_ROW}:${L(C.FEE)}`, `${tab}!B${FIRST_ROW}:B`];
export async function supplierSheetFingerprint(env, fetchImpl = fetch, tabs = [WQ_NEW]) {
  const ranges = [...[].concat(tabs).flatMap(tab => supplierRanges(tab).slice(0, 3)), `${QT}!A1:Z`].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
  const data = await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE', {}, fetchImpl);
  return createHash('sha256').update(SHEET_WORK + JSON.stringify((data.valueRanges || []).map(v => v.values || []))).digest('hex');
}
// The mark, and the supplier's tabs ("Work Queue" until the one-time rename, then "Orders"; see ensureTabNames; plus
// Shipped and Cancelled once they exist).
const seenMark = async (env, fetchImpl) => {
  const d = await sheetsRequest(env, '?fields=developerMetadata(metadataId,metadataKey,metadataValue),sheets.properties.title', {}, fetchImpl);
  const titles = (d.sheets || []).map(x => x.properties?.title);
  return { mark: (d.developerMetadata || []).find(m => m.metadataKey === SEEN_KEY) || null, tabs: allTabs(titles.includes(WQ) ? WQ : WQ_NEW).filter(t => titles.includes(t)) };
};
// { unchanged: true } = nothing to do; otherwise run the full check and then call rememberSupplierSheet.
export async function supplierSheetQuickLook(env, { fetchImpl = fetch, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!googleSheetsConfigured(env)) return { unchanged: false };
  const { mark, tabs } = await seenMark(env, fetchImpl), fingerprint = await supplierSheetFingerprint(env, fetchImpl, tabs);
  const [seen, at] = String(mark?.metadataValue || '').split('|');
  return { unchanged: !!mark && seen === fingerprint && now - Number(at || 0) < FULL_EVERY, fingerprint, tabs, markId: mark?.metadataId ?? null };
}
// Next cron run does the full check (e.g. a payment changed the "Client paid" column the website writes).
export const forceFullSupplierCheck = (env, fetchImpl = fetch) => batch(env, [{ updateDeveloperMetadata: { dataFilters: [{ developerMetadataLookup: { metadataKey: SEEN_KEY } }], developerMetadata: { metadataValue: 'reset|0' }, fields: 'metadataValue' } }], fetchImpl);
export async function rememberSupplierSheet(env, look, { fetchImpl = fetch, now = Math.floor(Date.now() / 1000) } = {}) {
  // Taken again after the full check: the website's own writes during it must not count as a change next minute.
  const value = (await supplierSheetFingerprint(env, fetchImpl, (await seenMark(env, fetchImpl)).tabs)) + '|' + now;
  await batch(env, [look.markId != null
    ? { updateDeveloperMetadata: { dataFilters: [{ developerMetadataLookup: { metadataId: look.markId } }], developerMetadata: { metadataValue: value }, fields: 'metadataValue' } }
    : { createDeveloperMetadata: { developerMetadata: { metadataKey: SEEN_KEY, metadataValue: value, location: { spreadsheet: true }, visibility: 'DOCUMENT' } } }], fetchImpl);
}

// Cron (every minute): read the supplier columns and apply changes.
export async function pollSupplierSheet(DB, env, { waitUntil, fetchImpl = fetch } = {}) {
  if (!googleSheetsConfigured(env)) return { ok: true, configured: false };
  if (!await supplierSheetEnabled(DB)) return { ok: true, enabled: false };
  const t = Math.floor(Date.now() / 1000), result = { ok: true, enabled: true, checked: 0, changed: [], skipped: [] };
  // One check at a time (2 Nov 2026): a slow check (Google slow, many rows to rewrite) could still run when the next
  // minute's started; both then applied the same supplier edit (client notified twice, events twice).
  const until = String(t + 300);
  const mine = await DB.prepare(`INSERT INTO portal_settings (key, value) VALUES ('supplier_poll_until', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(portal_settings.value AS BIGINT) <= ? RETURNING key`).bind(until, t).first();
  if (!mine) return { ...result, busy: true };
  try { return await pollNow(DB, env, { waitUntil, fetchImpl }, t, result); }
  finally { await DB.prepare("DELETE FROM portal_settings WHERE key='supplier_poll_until' AND value=?").bind(until).run(); }
}
async function pollNow(DB, env, { waitUntil, fetchImpl }, t, result) {
  try {
    await ensureTabNames(DB, env, fetchImpl);
    if (!await ensureLayout(DB, env, fetchImpl)) return { ...result, waiting: 'layout' };
    // The Billing tab (formulas only): added if missing, rewritten after a layout change. Never stops the sync.
    result.billing = await billingSafely(DB, env, fetchImpl);
    result.rulesFixed = await rulesSafely(DB, env, fetchImpl);
    result.dupAlerts = await dupSafely(DB, env, fetchImpl);
    result.newCancelAlerts = await newCancelSafely(DB, env, fetchImpl);
    result.cancelledSorted = await sortSafely(DB, env, fetchImpl);
    result.fillsCleaned = await fillsSafely(DB, env, fetchImpl);
    result.revisionColours = await revSafely(DB, env, fetchImpl);
    result.greenDoneRemoved = await noGreenSafely(DB, env, fetchImpl);
    result.bilingual = await zhSafely(DB, env, fetchImpl);
    const { wq } = await tabNames(DB);
    // Old "ADDRESS CHANGED" warnings: take them off, a few rows a minute (Google's write limit), until none are left.
    for (const r of (await DB.prepare('SELECT id FROM client_orders WHERE address_changed_at IS NOT NULL ORDER BY id LIMIT 5').all()).results || []) {
      await DB.prepare('UPDATE client_orders SET address_changed_at=NULL WHERE id=?').bind(r.id).run();
      try { await syncPortalOrderToGoogleSheet(DB, env, r.id, fetchImpl); } catch (e) { console.error('Sheet refresh after clearing the address warning failed', e); }
    }
    // Once: orders whose tax number / gift message were typed into the notes before those fields existed.
    for (const id of await splitOldNotes(DB)) { const sync = syncPortalOrderToGoogleSheet(DB, env, id, fetchImpl).catch(e => console.error('Sheet refresh after notes split failed', e)); if (waitUntil) waitUntil(sync); else await sync; }
    if (await getSetting(DB, PAID_DIRTY)) { const seen = await getSetting(DB, PAID_DIRTY); await refreshPaidColumn(DB, env, fetchImpl); await DB.prepare('DELETE FROM portal_settings WHERE key=? AND value=?').bind(PAID_DIRTY, seen).run(); }
    // All three tabs (Orders, Shipped, Cancelled): the supplier can edit in any of them.
    const tabs = allTabs(wq);
    const ranges = tabs.flatMap(supplierRanges).map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const data = await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE', {}, fetchImpl);
    const got = (data.valueRanges || []).map(v => v.values || []), byOrder = new Map(), twice = new Set(), everyRow = [];
    const rowFill = r => filled([r.cost, r.itemCosts, r.tracking, r.courier, r.shipped, r.delayed, r.reason, r.domestic, r.cancelFee]);
    tabs.forEach((tab, k) => {
      const [inputs, ids, domestic, refs] = got.slice(k * 4, k * 4 + 4);
      (ids || []).forEach((r, i) => {
        const cell = k => inputs?.[i]?.[k - C.COST] ?? '';
        const row = { orderId: Number(r?.[0]), cost: cell(C.COST), itemCosts: cell(C.ITEMS), tracking: cell(C.TRACK), courier: cell(C.COURIER), shipped: cell(C.SHIP), delayed: cell(C.DELAY), reason: cell(C.REASON), domestic: domestic?.[i]?.[0] ?? '', cancelFee: domestic?.[i]?.[1] ?? '', ref: refs?.[i]?.[0] ?? '', tab, sheetRow: FIRST_ROW + i };
        // An order in two rows (a move that stopped halfway, or two updates at once): the row the supplier filled in
        // more is read, and the order is queued so its next sheet write removes the other copy.
        if (!(Number.isSafeInteger(row.orderId) && row.orderId > 0)) return;
        everyRow.push(row);
        const had = byOrder.get(row.orderId);
        if (had) twice.add(row.orderId);
        if (!had || rowFill(row) > rowFill(had)) byOrder.set(row.orderId, row);
      });
    });
    let rows = [...byOrder.values()];
    result.checked = rows.length;
    result.duplicates = await tellDuplicates(DB, everyRow.filter(r => r.tab !== CANCELLED_TAB), t);
    // Rewritten right away (a few per check), so the extra copy goes now, not at the next retry.
    if (twice.size) {
      result.twice = [...twice];
      for (const id of twice) await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE id=? AND NOT archived").bind(id).run();
      for (const id of [...twice].slice(0, 5)) { const sync = syncPortalOrderToGoogleSheet(DB, env, id, fetchImpl).catch(e => console.error('Sheet rewrite of a doubled order failed', e)); if (waitUntil) waitUntil(sync); else await sync; }
    }
    // One query for what the website last saw in each row; only rows that differ are loaded and applied.
    const seen = new Map();
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map(r => r.orderId);
      const found = (await DB.prepare(`SELECT id, order_ref, sheet_ref, sheet_cost, sheet_tracking, sheet_courier, sheet_shipped, sheet_delayed, sheet_delay_reason, sheet_cancel_fee, domestic_tracking, item_costs, client_id FROM client_orders WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [];
      for (const f of found) seen.set(Number(f.id), f);
    }
    // Out-of-line rows: their supplier cells belong to another order, so nothing is applied from them.
    const split = rows.filter(r => rowOutOfLine(r, seen.get(r.orderId)));
    if (split.length) {
      result.outOfLine = split.length; console.error('Supplier sheet rows out of line', split.map(r => `${r.tab}!${r.sheetRow} id ${r.orderId}`).join(', '));
      for (const r of split) result.skipped.push({ orderId: r.orderId, ref: seen.get(r.orderId).order_ref, why: [`row ${r.tab} ${r.sheetRow} is out of line (shows ${cellStr(r.ref)}): not read`] });
      rows = rows.filter(r => !split.includes(r));
    }
    const cellText = v => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : norm(v));
    for (const r of rows) {
      const s = seen.get(r.orderId);
      if (!s || (cellText(r.cost) === norm(s.sheet_cost) && cellText(r.tracking) === norm(s.sheet_tracking) && cellText(r.courier) === norm(s.sheet_courier) && cellText(r.shipped) === norm(s.sheet_shipped)
        && cellText(r.delayed) === norm(s.sheet_delayed) && cellText(r.reason).slice(0, 300) === norm(s.sheet_delay_reason) && cellText(r.cancelFee) === norm(s.sheet_cancel_fee))) continue;
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
    // AG: the supplier's domestic express tracking is copied as typed (no client notice, no sheet rewrite).
    for (const r of rows) {
      const v = norm(r.domestic).slice(0, 120);
      if (seen.has(r.orderId) && norm(seen.get(r.orderId).domestic_tracking) !== v) await DB.prepare('UPDATE client_orders SET domestic_tracking=? WHERE id=?').bind(v || null, r.orderId).run();
    }
    // AI: the supplier's cost per product, copied as typed (the client sees each product's price, see itemPrices).
    for (const r of rows) {
      const v = (typeof r.itemCosts === 'number' ? String(r.itemCosts) : norm(r.itemCosts)).slice(0, 300);
      if (!seen.has(r.orderId) || norm(seen.get(r.orderId).item_costs) === v) continue;
      // The client gets a bell when the prices per product appear or change (Erwin, 30 Oct 2026).
      const o = await DB.prepare('SELECT id, client_id, status, price, etsy_url, item_costs FROM client_orders WHERE id=?').bind(r.orderId).first();
      await DB.prepare('UPDATE client_orders SET item_costs=? WHERE id=?').bind(v || null, r.orderId).run();
      const before = itemPrices(o), after = itemPrices({ ...o, item_costs: v });
      if (after && o.status !== 'cancelled' && JSON.stringify(after) !== JSON.stringify(before)) await event(DB, o, 'item_prices', after.map(n => '$' + n.toFixed(2)).join(' · '), t);
    }
    // Once: remember the prices the supplier already gave (saved prices).
    result.savedPrices = await backfillSavedPrices(DB);
    // Product price checks (Product Quotes tab).
    const fee = await getSetting(DB, 'commission_per_order');
    result.quotes = await pollQuoteTab(DB, env, { commission_per_order: fee ?? '2' }, fetchImpl);
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
  const { wq } = await tabNames(DB);
  const meta = await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl);
  const props = (meta.sheets || []).map(s => s.properties);
  const current = props.find(p => p.title === wq), backup = props.find(p => p.title === BACKUP_TITLE);
  const oldId = current?.sheetId;
  if (current && !backup) {
    await batch(env, [{ duplicateSheet: { sourceSheetId: oldId, newSheetName: BACKUP_TITLE, insertSheetIndex: props.length } }], fetchImpl);
    const again = await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl);
    const copy = (again.sheets || []).map(s => s.properties).find(p => p.title === BACKUP_TITLE);
    if (copy) await batch(env, [{ updateSheetProperties: { properties: { sheetId: copy.sheetId, hidden: true }, fields: 'hidden' } }], fetchImpl);
  }
  // Google needs one visible tab at all times: a temporary tab stands in while the Work Queue is replaced.
  const temp = await batch(env, [{ addSheet: { properties: { title: 'Updating… ' + Date.now() } } }], fetchImpl);
  const tempId = temp?.replies?.[0]?.addSheet?.properties?.sheetId;
  if (current) await batch(env, [{ deleteSheet: { sheetId: oldId } }], fetchImpl);
  // Shipped / Cancelled are rebuilt too (from the new supplier tab, see splitSupplierTabs).
  const split = props.filter(p => [SHIPPED_TAB, CANCELLED_TAB].includes(p.title));
  if (split.length) { await batch(env, split.map(p => ({ deleteSheet: { sheetId: p.sheetId } })), fetchImpl); for (const p of split) sheetIdCache.delete(cacheKey(env, p.title)); }
  const add = { addSheet: { properties: { title: wq, index: 0, gridProperties: { rowCount: 1000, columnCount: C.END, frozenRowCount: 5 }, ...(oldId != null ? { sheetId: oldId } : {}) } } };
  let created;
  try { created = await batch(env, [add], fetchImpl); }
  catch (e) { delete add.addSheet.properties.sheetId; created = await batch(env, [add], fetchImpl); }
  const sheetId = created?.replies?.[0]?.addSheet?.properties?.sheetId ?? await workQueueSheetId(env, fetchImpl, true, wq);
  sheetIdCache.set(cacheKey(env, wq), sheetId);
  if (tempId != null) await batch(env, [{ deleteSheet: { sheetId: tempId } }], fetchImpl);
  // Suppliers don't need our client list: keep the Clients tab (the website still updates it) but hide it.
  const clientsTab = props.find(p => p.title === 'Clients');
  if (clientsTab && !clientsTab.hidden) await batch(env, [{ updateSheetProperties: { properties: { sheetId: clientsTab.sheetId, hidden: true }, fields: 'hidden' } }], fetchImpl);

  const orders = (await DB.prepare(`SELECT o.*, s.name AS shop_name FROM client_orders o JOIN users u ON u.id=o.client_id
    LEFT JOIN client_stores s ON s.id=o.store_id WHERE NOT o.archived AND NOT u.archived AND u.active ORDER BY o.created_at DESC, o.id DESC`).all()).results || [];
  const paid = await paidLabels(DB, orders.map(o => Number(o.id)));
  const rows = [];
  for (const o of orders) {
    const photos = (await DB.prepare('SELECT id, item_index FROM order_photos WHERE order_id=? ORDER BY id LIMIT 8').bind(o.id).all()).results || [];
    o.client_paid = paid.get(Number(o.id)) || '';
    const { am, qz } = websiteCells(env, o, photos, o.shop_name || '');
    const supplier = supplierCells(o);
    rows.push([...am, ...supplier, ...qz, ...extraCells(o)]);
    await rememberSupplierCells(DB, o, supplier); await saveRef(DB, o);
  }
  const last = FIRST_ROW + Math.max(rows.length, 1) - 1;
  await batchValues(env, [
    { range: `${wq}!A2:A3`, values: [[ORDERS_TITLE], [instructions]] },
    { range: `${wq}!A5:${L(C.END - 1)}5`, values: [HEADERS.map(bi)] }, totalsRow(wq), revisionCounter(wq),
    ...(rows.length ? [{ range: `${wq}!A${FIRST_ROW}:${L(C.END - 1)}${last}`, values: rows }] : []),
  ], fetchImpl);

  const { email } = googleSheetsConfig(env);
  const cols = (a, b) => ({ sheetId, startColumnIndex: a, endColumnIndex: b });
  const yellow = { red: 1, green: 0.95, blue: 0.7 }, header = { red: 0.93, green: 0.93, blue: 0.93 };
  await batch(env, [
    { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: 4, startColumnIndex: 0, endColumnIndex: C.CLIENT + 1 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,horizontalAlignment)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: C.CLIENT + 1 }, cell: { userEnteredFormat: { backgroundColor: header, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: C.COST, endColumnIndex: C.REASON + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: C.COST, endColumnIndex: C.REASON + 1 }, cell: { userEnteredFormat: { backgroundColor: yellow } }, fields: 'userEnteredFormat.backgroundColor' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: C.COST, endColumnIndex: C.COST + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: C.ITEMS, endColumnIndex: C.COURIER + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } },
    costCheck(sheetId),
    courierRule(sheetId, courierList(await getSetting(DB, 'couriers'))),
    { setDataValidation: { range: { sheetId, startRowIndex: 5, startColumnIndex: C.SHIP, endColumnIndex: C.SHIP + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: NOT_SHIPPED }, { userEnteredValue: SHIPPED }] }, strict: true, showCustomUi: true } } },
    ...WIDTHS.map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C.ID, endIndex: C.CLIENT + 1 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
    ...headRows(sheetId),
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: FIRST_ROW - 1, endIndex: 1000 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
    ...rows.map((row, i) => rowHeight(sheetId, FIRST_ROW + i, rowPx(row))),
    { addDimensionGroup: { range: { sheetId, dimension: 'COLUMNS', startIndex: C.PHOTO2, endIndex: C.MORE + 1 } } },
    { updateDimensionGroup: { dimensionGroup: { range: { sheetId, dimension: 'COLUMNS', startIndex: C.PHOTO2, endIndex: C.MORE + 1 }, depth: 1, collapsed: true }, fields: 'collapsed' } },
    fullFilter(sheetId),
    ...competitorFormat(sheetId), ...paidFormat(sheetId), ...delayFormat(sheetId, null), ...cancelFormat(sheetId), ...domesticFormat(sheetId), ...itemCostsFormat(sheetId), hideCD(sheetId), statusRule(sheetId), showShop(sheetId), revisionFormat(sheetId), ...revisionAlerts(sheetId), ...revisionStates(sheetId), ...cancelFeeFormat(sheetId),
    // Only the supplier columns (and Competitor price) are editable by others; the rest is written by the website.
    { addProtectedRange: { protectedRange: { range: cols(0, 14), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
    { addProtectedRange: { protectedRange: { range: cols(C.PAIDC, C.CLIENT + 1), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
    ...statusDateFormat(sheetId), { addProtectedRange: { protectedRange: { range: cols(C.CHANGED, C.CHANGED + 1), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
    { addProtectedRange: { protectedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: 5, startColumnIndex: 14, endColumnIndex: C.PAIDC }, description: 'Column headers', editors: { users: [email] } } } },
  ], fetchImpl);

  await splitSupplierTabs(DB, env, wq, sheetId, fetchImpl);
  await DB.prepare('DELETE FROM portal_settings WHERE key=?').bind(BILLING_KEY).run();
  // The rebuilt tabs get the duplicate and cost revision colours and warnings again (next check).
  await DB.prepare('DELETE FROM portal_settings WHERE key IN (?, ?, ?, ?, ?)').bind(DUP_ALERTS, REV_RULES, ZH_KEY, NEW_CANCEL_KEY, CANCEL_SORT_KEY).run();
  await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(SETTING, '1').run();
  await putSetting(DB, LAYOUT, LAYOUT_NOW);
  return { ok: true, rows: rows.length, sheetId, backup: !!current };
}
