// Supplier Work Queue: the first tab of the connected Google Sheet, written by the website, one row per
// active order (matched by the hidden Order ID column, so sorting/filtering by the supplier is safe).
// The supplier fills in four columns; the website reads them every minute (cron) and applies changes:
//   P  Total cost (USD)  — the whole order, product + shipping. Client is billed total + commission.
//   Q  Tracking number   — copied to the order.
//   R  Courier           — e.g. China Post, Yanwen (dropdown from Fees & settings; other names can be typed). Shown to the client.
//   S  Shipping status   — "Shipped" moves the order to Shipped (client is notified).
// The website never writes P, and writes Q/R/S only when an admin changes tracking/courier/status on the website.
// L Tax number (e.g. Etsy's IOSS number) and M Gift message are the customer's, kept apart from the Notes (N).
// O Competitor price: what other shops charge, typed by the client in their portal (order form / Your numbers);
//   the website writes it like A–N. Values typed in the sheet before that were copied to the orders once (layout 4).
// There is no Country column: the country is the last line of the delivery address.
// Sheets made before this layout are switched over once (see ensureLayout).
// sheet_cost / sheet_tracking / sheet_shipped hold the last value seen in (or written to) each cell, so a
// change is applied once, and a supplier's edit is never overwritten by an older website value.
// Nothing here runs until an admin presses "Set up supplier sheet" (portal_settings supplier_sheet = '1').
import { sheetsRequest, googleSheetsConfig, googleSheetsConfigured, syncPortalOrderToGoogleSheet } from './google-sheets.mjs';
import { changeStatus } from './order-status.mjs';
import { sheetPhotoUrl } from './sheet-photos.mjs';
import { splitOldNotes } from './order-notes.mjs';
import { pollQuoteTab } from './quote-sheet.mjs';
import { rememberPrice, backfillSavedPrices } from './saved-prices.mjs';

export const SUPPLIER_SHEET_SCHEMA = [
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS supplier_cost DOUBLE PRECISION',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_cost TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_tracking TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_shipped TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS courier TEXT',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_courier TEXT',
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
export const FIRST_ROW = 6;
export const HEADERS = ['Date', 'Order', 'Shop', 'Status', 'Photo preview', 'Photo 1', 'Product link', 'Qty', 'Product / variation',
  'Customer', 'Delivery address & phone', 'Tax number', 'Gift message', 'Notes', 'Competitor price', 'Total cost (USD)', 'Tracking number', 'Courier', 'Shipping status',
  'Photo 2', 'Photo 3', 'Photo 4', 'Photo 5', 'Photo 6', 'Photo 7', 'Photo 8', 'More product links', 'Order ID', 'Client ID'];
export const SHIPPED = 'Shipped', NOT_SHIPPED = 'Not shipped';
const STATUS = { pending: 'Pending', processing: 'In Progress', shipped: 'Shipped', delivered: 'Delivered', cancellation_requested: 'Cancellation requested', cancelled: 'Cancelled' };
const SETTING = 'supplier_sheet', LAST = 'supplier_sheet_last', LAYOUT = 'supplier_sheet_layout', LAYOUT_NOW = '4';
export const DEFAULT_COURIERS = 'China Post\nYanwen';
export const courierList = v => [...new Set(String(v ?? DEFAULT_COURIERS).split(/[\n,]/).map(x => x.trim()).filter(Boolean))].slice(0, 30);

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
  return 'Total cost filled in from an earlier order (same product, variation, country and quantity). Change it if this one is different.\n';
}
// Website-owned cells: A–O and T–AC (P–S are the supplier's). Column C is the shop the order came from — suppliers don't see who our clients are.
export function websiteCells(env, o, photos, shopName) {
  const urls = photos.map(p => sheetPhotoUrl(env, o.id, p.id));
  const links = String(o.etsy_url || '').split(/\s+/).filter(Boolean);
  const product = [o.item_title, o.variant].map(norm).filter(Boolean).join(' · ');
  const am = [
    txt(o.order_date || new Date(Number(o.created_at) * 1000).toISOString().slice(0, 10)), txt(o.order_ref || '#' + o.id), txt(shopName),
    STATUS[o.status] || o.status, urls[0] ? `=IMAGE("${q(urls[0])}&size=thumb",1)` : '', urls[0] ? `=HYPERLINK("${q(urls[0])}","Photo 1")` : '',
    links[0] ? `=HYPERLINK("${q(links[0])}","Open product")` : '', Number(o.quantity || 1), txt(product), txt(o.buyer_name),
    txt(addressLines(o)), txt(o.tax_number), txt(o.gift_message), txt(savedPriceFlag(o) + (o.notes || '')), txt(o.competitor_price),
  ];
  const qz = [...Array.from({ length: 7 }, (_, i) => urls[i + 1] ? `=HYPERLINK("${q(urls[i + 1])}","Photo ${i + 2}")` : ''),
    txt(links.slice(1).join('\n')), String(o.id), String(o.client_id)];
  return { am, qz };
}

let sheetIdCache = { key: '', id: null };
async function workQueueSheetId(env, fetchImpl, fresh, wq = WQ) {
  const key = googleSheetsConfig(env).spreadsheetId + '|' + wq;
  if (!fresh && sheetIdCache.key === key && sheetIdCache.id != null) return sheetIdCache.id;
  const meta = await sheetsRequest(env, '?fields=sheets.properties', {}, fetchImpl);
  const s = (meta.sheets || []).find(x => x.properties?.title === wq);
  sheetIdCache = { key, id: s ? s.properties.sheetId : null };
  return sheetIdCache.id;
}
async function idColumn(env, fetchImpl, wq) {
  const data = await sheetsRequest(env, '/values/' + encodeURIComponent(`${wq}!AB${FIRST_ROW}:AC`) + '?majorDimension=ROWS', {}, fetchImpl);
  return (data.values || []).map((r, i) => ({ row: FIRST_ROW + i, orderId: Number(r?.[0]), clientId: Number(r?.[1]) }));
}
const batchValues = (env, data, fetchImpl) => sheetsRequest(env, '/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) }, fetchImpl);
const batch = (env, requests, fetchImpl) => sheetsRequest(env, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) }, fetchImpl);
// Column widths (px) for A–AC, sized to their content. AB–AC (ids) are hidden; T–AA (more photos/links) are grouped.
export const WIDTHS = [95, 125, 135, 110, 130, 80, 115, 55, 170, 140, 230, 150, 220, 260, 150, 115, 180, 120, 125, 80, 80, 80, 80, 80, 80, 80, 220, 60, 60];
// Row height that fits the wrapped text of a row (about 7 px per character at the default font), at least
// 100 px for the photo preview.
export function rowPx(cells) {
  let lines = 1;
  cells.slice(0, 18).forEach((v, i) => {
    if (typeof v !== 'string' || v.startsWith('=')) return;
    const perLine = Math.max(4, Math.floor((WIDTHS[i] - 12) / 7));
    lines = Math.max(lines, v.replace(/^'/, '').split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0));
  });
  return Math.min(600, Math.max(100, lines * 17 + 16));
}
const rowHeight = (sheetId, row, px) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row }, properties: { pixelSize: px }, fields: 'pixelSize' } });

async function deleteRows(env, rows, fetchImpl, wq) {
  if (!rows.length) return;
  const sheetId = await workQueueSheetId(env, fetchImpl, false, wq);
  if (sheetId == null) return;
  // Bottom-up so earlier deletions don't move later rows.
  await batch(env, [...rows].sort((a, b) => b - a).map(r => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } })), fetchImpl);
}
export async function removeClientFromWorkQueue(DB, env, clientId, fetchImpl = fetch) {
  if (!await supplierSheetEnabled(DB)) return;
  if (!await ensureLayout(DB, env, fetchImpl)) throw new Error('The supplier sheet is being updated. Please try again in a minute.');
  const { wq } = await tabNames(DB);
  await deleteRows(env, (await idColumn(env, fetchImpl, wq)).filter(r => r.clientId === Number(clientId)).map(r => r.row), fetchImpl, wq);
}

// ---------- layout ----------
const getSetting = async (DB, key) => (await DB.prepare('SELECT value FROM portal_settings WHERE key=?').bind(key).first())?.value;
const putSetting = (DB, key, value) => DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run();
const instructions = 'Supplier: fill in the yellow columns — Total cost (USD, whole order incl. shipping), Tracking number, Courier (pick one or type another), and set Shipping status to Shipped when it leaves. The website updates within a minute. Competitor price (blue) is what other shops charge, from our client. Other columns are filled in by Direct Line.';
// Competitor price (O): light blue, open for anyone with the sheet to type in.
const COMP = 14, blue = { red: 0.85, green: 0.92, blue: 1 }, blueHead = { red: 0.62, green: 0.79, blue: 0.97 };
const competitorFormat = sheetId => [
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: COMP, endColumnIndex: COMP + 1 }, cell: { userEnteredFormat: { backgroundColor: blueHead, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
  { repeatCell: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: COMP, endColumnIndex: COMP + 1 }, cell: { userEnteredFormat: { backgroundColor: blue, numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,numberFormat,wrapStrategy,verticalAlignment,horizontalAlignment)' } },
  { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: COMP, endColumnIndex: COMP + 1 }, cell: { note: 'What other shops charge for this product (e.g. "$24.90 on Etsy shop X"). Our client enters it in their portal; the website fills it in.' }, fields: 'note' } },
  { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: COMP, endIndex: COMP + 1 }, properties: { pixelSize: WIDTHS[COMP] }, fields: 'pixelSize' } },
];
const courierRule = (sheetId, couriers) => ({ setDataValidation: { range: { sheetId, startRowIndex: FIRST_ROW - 1, startColumnIndex: 17, endColumnIndex: 18 }, rule: {
  condition: { type: 'ONE_OF_LIST', values: couriers.map(c => ({ userEnteredValue: c })) }, inputMessage: 'The courier used for this parcel. Pick one, or type another name.', strict: false, showCustomUi: true } } });
// The courier dropdown follows the list in Fees & settings (called when an admin saves it).
export async function updateCourierDropdown(DB, env, fetchImpl = fetch) {
  if (!googleSheetsConfigured(env) || !await supplierSheetEnabled(DB) || await getSetting(DB, LAYOUT) !== LAYOUT_NOW) return false;
  const sheetId = await workQueueSheetId(env, fetchImpl, false, (await tabNames(DB)).wq);
  if (sheetId == null) return false;
  await batch(env, [courierRule(sheetId, courierList(await getSetting(DB, 'couriers')))], fetchImpl);
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
    const header = async () => (await sheetsRequest(env, '/values/' + encodeURIComponent(`${wq}!A5:AC5`), {}, fetchImpl)).values?.[0]?.map(norm) || [];
    let h = await header();
    // 1) Country (L) becomes Tax number, and Gift message is added after it. The column is inserted inside the
    //    website's protected columns (A–M), so it stays protected. Nothing is deleted.
    if (h[12] === 'Notes') { await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, inheritFromBefore: true } }], fetchImpl); h = await header(); }
    // The old country codes in L are cleared; each row's tax number / gift message is written by the normal sync.
    if (h[11] === 'Country') await sheetsRequest(env, '/values/' + encodeURIComponent(`${wq}!L${FIRST_ROW}:M`) + ':clear', { method: 'POST', body: '{}' }, fetchImpl);
    // 2) Courier between Tracking number and Shipping status (yellow, like the other supplier columns).
    if (h[16] === 'Shipping status') { await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 16, endIndex: 17 }, inheritFromBefore: true } }], fetchImpl); h = await header(); }
    // 3) Competitor price right after Notes (Ye, the supplier, asked for it there). It sits just outside the website's
    //    protected columns (A–N), so anyone with the sheet can type in it; the supplier's columns move one to the right.
    if (h[13] === 'Notes' && h[14] === 'Total cost (USD)') await batch(env, [{ insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: COMP, endIndex: COMP + 1 }, inheritFromBefore: true } }], fetchImpl);
    await batchValues(env, [{ range: `${wq}!A5:AC5`, values: [HEADERS] }, { range: `${wq}!A3`, values: [[instructions]] }], fetchImpl);
    // 4) From now on the website writes O from the order: anything typed there before is copied to its order first.
    const ranges = [`${wq}!O${FIRST_ROW}:O`, `${wq}!AB${FIRST_ROW}:AB`].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const [vals, ids] = ((await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS', {}, fetchImpl)).valueRanges || []).map(x => x.values || []);
    for (const [i, r] of (ids || []).entries()) { const v = norm(vals?.[i]?.[0]).slice(0, 200), id = Number(r?.[0]); if (id > 0 && v) await DB.prepare("UPDATE client_orders SET competitor_price=? WHERE id=? AND competitor_price=''").bind(v, id).run(); }
    await batch(env, [courierRule(sheetId, courierList(await getSetting(DB, 'couriers'))), ...competitorFormat(sheetId),
      ...[11, 12, 17].map(i => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: WIDTHS[i] }, fields: 'pixelSize' } }))], fetchImpl);
    // Every active row is written again so the new columns get their values.
    await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE NOT archived AND (tax_number IS NOT NULL OR gift_message IS NOT NULL OR courier IS NOT NULL)").run();
    await putSetting(DB, LAYOUT, LAYOUT_NOW);
    return true;
  } catch (e) {
    await DB.prepare('DELETE FROM portal_settings WHERE key=? AND value=?').bind(LAYOUT, 'migrating:' + t).run();
    throw e;
  }
}

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
      await batchValues(env, [{ range: `${WQ_NEW}!A2`, values: [['Direct Line — Orders']] }], fetchImpl);
    }
    await putSetting(DB, TAB_NAMES, 'done');
    return true;
  } catch (e) {
    await DB.prepare('UPDATE portal_settings SET value=? WHERE key=? AND value=?').bind(back, TAB_NAMES, `migrating-${step}:${t}`).run();
    throw e;
  }
}

// Called from the normal order sync. Adds/updates/removes the order's Work Queue row.
export async function syncWorkQueueRow(DB, env, order, photos, fetchImpl = fetch) {
  if (!await supplierSheetEnabled(DB)) return { enabled: false };
  if (!await ensureLayout(DB, env, fetchImpl)) throw new Error('The supplier sheet is being updated. This will be retried automatically.');
  const { wq } = await tabNames(DB);
  const rows = await idColumn(env, fetchImpl, wq), found = rows.filter(r => r.orderId === Number(order.id));
  if (order.archived || order.client_archived) { await deleteRows(env, found.map(r => r.row), fetchImpl, wq); return { enabled: true, removed: found.length }; }
  const shop = order.store_id == null ? null : await DB.prepare('SELECT name FROM client_stores WHERE id=?').bind(order.store_id).first();
  const { am, qz } = websiteCells(env, order, photos, shop?.name || '');
  if (found.length) {
    const r = found[0].row, data = [{ range: `${wq}!A${r}:O${r}`, values: [am] }, { range: `${wq}!T${r}:AC${r}`, values: [qz] }];
    const sets = [];
    // An admin changed tracking / shipped on the website since the sheet last showed it: show it in the sheet too.
    if (norm(order.tracking_number) && norm(order.tracking_number) !== norm(order.sheet_tracking)) {
      data.push({ range: `${wq}!Q${r}`, values: [[txt(order.tracking_number)]] }); sets.push(['sheet_tracking', norm(order.tracking_number)]);
    }
    if (norm(order.courier) && norm(order.courier) !== norm(order.sheet_courier)) {
      data.push({ range: `${wq}!R${r}`, values: [[txt(order.courier)]] }); sets.push(['sheet_courier', norm(order.courier)]);
    }
    if (['shipped', 'delivered'].includes(order.status) && !isShipped(order.sheet_shipped)) {
      data.push({ range: `${wq}!S${r}`, values: [[SHIPPED]] }); sets.push(['sheet_shipped', SHIPPED]);
    }
    await batchValues(env, data, fetchImpl);
    for (const [col, v] of sets) await DB.prepare(`UPDATE client_orders SET ${col}=? WHERE id=?`).bind(v, order.id).run();
    const sheetId = await workQueueSheetId(env, fetchImpl, false, wq);
    if (sheetId != null) await batch(env, [rowHeight(sheetId, r, rowPx(am))], fetchImpl);
    return { enabled: true, row: r };
  }
  const supplier = [order.supplier_cost == null ? '' : Number(order.supplier_cost), txt(order.tracking_number), txt(order.courier), ['shipped', 'delivered'].includes(order.status) ? SHIPPED : NOT_SHIPPED];
  const res = await sheetsRequest(env, '/values/' + encodeURIComponent(`${wq}!A${FIRST_ROW}:AC`) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
    method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: [[...am, ...supplier, ...qz]] }),
  }, fetchImpl);
  await DB.prepare('UPDATE client_orders SET sheet_cost=?, sheet_tracking=?, sheet_courier=?, sheet_shipped=? WHERE id=?').bind(norm(supplier[0]), norm(order.tracking_number), norm(order.courier), supplier[3], order.id).run();
  const row = Number(/![A-Z]+(\d+)/.exec(res?.updates?.updatedRange || '')?.[1]);
  const sheetId = await workQueueSheetId(env, fetchImpl, false, wq);
  if (row && sheetId != null) await batch(env, [rowHeight(sheetId, row, rowPx(am))], fetchImpl);
  return { enabled: true, row, added: true };
}

// ---------- sheet → website ----------
async function event(DB, o, kind, detail, t) {
  await DB.prepare('INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,?,?,?,?)').bind(o.id, o.client_id, kind, 'admin', detail, t).run();
}
// Applies one Work Queue row (cost, tracking, shipped) to its order. Returns what changed.
export async function applySupplierRow(DB, order, cells, t = Math.floor(Date.now() / 1000)) {
  const done = [], skipped = [];
  const cost = typeof cells.cost === 'number' ? String(cells.cost) : norm(cells.cost), tracking = norm(cells.tracking), courier = norm(cells.courier), shipped = norm(cells.shipped);
  if (order.archived) return { done, skipped: ['archived'] };
  if (cost !== norm(order.sheet_cost)) {
    const n = parseCost(cells.cost);
    if (n === null) { if (cost) skipped.push('cost not a number: ' + cost); await DB.prepare('UPDATE client_orders SET sheet_cost=? WHERE id=?').bind(cost, order.id).run(); }
    else if (order.quoted_unit_price != null) {
      // Fixed-quote orders keep the price the client agreed; the supplier's cost is recorded for the team.
      await DB.prepare('UPDATE client_orders SET supplier_cost=?, sheet_cost=?, updated_at=? WHERE id=?').bind(n, cost, t, order.id).run(); done.push('cost recorded (fixed quote)');
    } else {
      const price = round2(n + Number(order.commission || 0));
      await DB.prepare('UPDATE client_orders SET supplier_cost=?, product_cost=?, shipping_fee=NULL, price=?, sheet_cost=?, price_source=NULL, updated_at=? WHERE id=?').bind(n, price, price, cost, t, order.id).run();
      // Remembered for the next identical order (see saved-prices.mjs).
      await rememberPrice(DB, order, n, t);
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
  return { done, skipped };
}

// Cron (every minute): read the supplier columns and apply changes.
export async function pollSupplierSheet(DB, env, { waitUntil, fetchImpl = fetch } = {}) {
  if (!googleSheetsConfigured(env)) return { ok: true, configured: false };
  if (!await supplierSheetEnabled(DB)) return { ok: true, enabled: false };
  const t = Math.floor(Date.now() / 1000), result = { ok: true, enabled: true, checked: 0, changed: [], skipped: [] };
  try {
    await ensureTabNames(DB, env, fetchImpl);
    if (!await ensureLayout(DB, env, fetchImpl)) return { ...result, waiting: 'layout' };
    const { wq } = await tabNames(DB);
    // Old "ADDRESS CHANGED" warnings: take them off, a few rows a minute (Google's write limit), until none are left.
    for (const r of (await DB.prepare('SELECT id FROM client_orders WHERE address_changed_at IS NOT NULL ORDER BY id LIMIT 5').all()).results || []) {
      await DB.prepare('UPDATE client_orders SET address_changed_at=NULL WHERE id=?').bind(r.id).run();
      try { await syncPortalOrderToGoogleSheet(DB, env, r.id, fetchImpl); } catch (e) { console.error('Sheet refresh after clearing the address warning failed', e); }
    }
    // Once: orders whose tax number / gift message were typed into the notes before those fields existed.
    for (const id of await splitOldNotes(DB)) { const sync = syncPortalOrderToGoogleSheet(DB, env, id, fetchImpl).catch(e => console.error('Sheet refresh after notes split failed', e)); if (waitUntil) waitUntil(sync); else await sync; }
    const ranges = [`${wq}!P${FIRST_ROW}:S`, `${wq}!AB${FIRST_ROW}:AB`].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const data = await sheetsRequest(env, '/values:batchGet?' + ranges + '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE', {}, fetchImpl);
    const [inputs, ids] = (data.valueRanges || []).map(v => v.values || []);
    const rows = (ids || []).map((r, i) => ({ orderId: Number(r?.[0]), cost: inputs?.[i]?.[0] ?? '', tracking: inputs?.[i]?.[1] ?? '', courier: inputs?.[i]?.[2] ?? '', shipped: inputs?.[i]?.[3] ?? '' }))
      .filter(r => Number.isSafeInteger(r.orderId) && r.orderId > 0);
    result.checked = rows.length;
    // One query for what the website last saw in each row; only rows that differ are loaded and applied.
    const seen = new Map();
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map(r => r.orderId);
      const found = (await DB.prepare(`SELECT id, sheet_cost, sheet_tracking, sheet_courier, sheet_shipped FROM client_orders WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [];
      for (const f of found) seen.set(Number(f.id), f);
    }
    const cellText = v => (typeof v === 'number' ? String(v) : norm(v));
    for (const r of rows) {
      const s = seen.get(r.orderId);
      if (!s || (cellText(r.cost) === norm(s.sheet_cost) && cellText(r.tracking) === norm(s.sheet_tracking) && cellText(r.courier) === norm(s.sheet_courier) && cellText(r.shipped) === norm(s.sheet_shipped))) continue;
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
  const add = { addSheet: { properties: { title: wq, index: 0, gridProperties: { rowCount: 1000, columnCount: 29, frozenRowCount: 5 }, ...(oldId != null ? { sheetId: oldId } : {}) } } };
  let created;
  try { created = await batch(env, [add], fetchImpl); }
  catch (e) { delete add.addSheet.properties.sheetId; created = await batch(env, [add], fetchImpl); }
  const sheetId = created?.replies?.[0]?.addSheet?.properties?.sheetId ?? await workQueueSheetId(env, fetchImpl, true, wq);
  sheetIdCache = { key: googleSheetsConfig(env).spreadsheetId + '|' + wq, id: sheetId };
  if (tempId != null) await batch(env, [{ deleteSheet: { sheetId: tempId } }], fetchImpl);
  // Suppliers don't need our client list: keep the Clients tab (the website still updates it) but hide it.
  const clientsTab = props.find(p => p.title === 'Clients');
  if (clientsTab && !clientsTab.hidden) await batch(env, [{ updateSheetProperties: { properties: { sheetId: clientsTab.sheetId, hidden: true }, fields: 'hidden' } }], fetchImpl);

  const orders = (await DB.prepare(`SELECT o.*, s.name AS shop_name FROM client_orders o JOIN users u ON u.id=o.client_id
    LEFT JOIN client_stores s ON s.id=o.store_id WHERE NOT o.archived AND NOT u.archived AND u.active ORDER BY o.created_at, o.id`).all()).results || [];
  const rows = [];
  for (const o of orders) {
    const photos = (await DB.prepare('SELECT id FROM order_photos WHERE order_id=? ORDER BY id LIMIT 8').bind(o.id).all()).results || [];
    const { am, qz } = websiteCells(env, o, photos, o.shop_name || '');
    const supplier = [o.supplier_cost == null ? '' : Number(o.supplier_cost), txt(o.tracking_number), txt(o.courier), ['shipped', 'delivered'].includes(o.status) ? SHIPPED : NOT_SHIPPED];
    rows.push([...am, ...supplier, ...qz]);
    await DB.prepare('UPDATE client_orders SET sheet_cost=?, sheet_tracking=?, sheet_courier=?, sheet_shipped=? WHERE id=?').bind(norm(supplier[0]), norm(o.tracking_number), norm(o.courier), supplier[3], o.id).run();
  }
  const last = FIRST_ROW + Math.max(rows.length, 1) - 1;
  await batchValues(env, [
    { range: `${wq}!A2:A3`, values: [['Direct Line — Orders'], [instructions]] },
    { range: `${wq}!A5:AC5`, values: [HEADERS] },
    ...(rows.length ? [{ range: `${wq}!A${FIRST_ROW}:AC${last}`, values: rows }] : []),
  ], fetchImpl);

  const { email } = googleSheetsConfig(env);
  const cols = (a, b) => ({ sheetId, startColumnIndex: a, endColumnIndex: b });
  const yellow = { red: 1, green: 0.95, blue: 0.7 }, header = { red: 0.93, green: 0.93, blue: 0.93 };
  await batch(env, [
    { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: 4, startColumnIndex: 0, endColumnIndex: 29 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,horizontalAlignment)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 29 }, cell: { userEnteredFormat: { backgroundColor: header, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 15, endColumnIndex: 19 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.85, blue: 0.3 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: 15, endColumnIndex: 19 }, cell: { userEnteredFormat: { backgroundColor: yellow } }, fields: 'userEnteredFormat.backgroundColor' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: 15, endColumnIndex: 16 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: 5, startColumnIndex: 16, endColumnIndex: 18 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { setDataValidation: { range: { sheetId, startRowIndex: 5, startColumnIndex: 15, endColumnIndex: 16 }, rule: { condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '0' }] }, inputMessage: 'Total cost for the whole order in USD, product + shipping.', strict: true, showCustomUi: true } } },
    courierRule(sheetId, courierList(await getSetting(DB, 'couriers'))),
    { setDataValidation: { range: { sheetId, startRowIndex: 5, startColumnIndex: 18, endColumnIndex: 19 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: NOT_SHIPPED }, { userEnteredValue: SHIPPED }] }, strict: true, showCustomUi: true } } },
    ...WIDTHS.map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 27, endIndex: 29 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
    rowHeight(sheetId, 5, 44),
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: FIRST_ROW - 1, endIndex: 1000 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
    ...rows.map((row, i) => rowHeight(sheetId, FIRST_ROW + i, rowPx(row))),
    { addDimensionGroup: { range: { sheetId, dimension: 'COLUMNS', startIndex: 19, endIndex: 27 } } },
    { updateDimensionGroup: { dimensionGroup: { range: { sheetId, dimension: 'COLUMNS', startIndex: 19, endIndex: 27 }, depth: 1, collapsed: true }, fields: 'collapsed' } },
    { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 4, startColumnIndex: 0, endColumnIndex: 27 } } } },
    ...competitorFormat(sheetId),
    // Only the supplier columns (and Competitor price) are editable by others; the rest is written by the website.
    { addProtectedRange: { protectedRange: { range: cols(0, 14), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
    { addProtectedRange: { protectedRange: { range: cols(19, 29), description: 'Filled in by the Direct Line website', editors: { users: [email] } } } },
    { addProtectedRange: { protectedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: 5, startColumnIndex: 14, endColumnIndex: 19 }, description: 'Column headers', editors: { users: [email] } } } },
  ], fetchImpl);

  await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(SETTING, '1').run();
  await putSetting(DB, LAYOUT, LAYOUT_NOW);
  return { ok: true, rows: rows.length, sheetId, backup: !!current };
}
