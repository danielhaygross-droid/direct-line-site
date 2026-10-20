// Local check: the supplier sheet switch to the new layout (Tax number, Gift message, Courier; no Country column),
// run against a fake Google Sheet that behaves like the real one for the calls we make. Real SQL (PGlite).
//   node checks/check-courier-sheet.mjs      (run from the repo root)
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { pg, DB, call, seed, env as baseEnv } from './lib.mjs';
import { pollSupplierSheet, HEADERS } from '../server/supplier-sheet.mjs';
import { syncPortalOrderToGoogleSheet } from '../server/google-sheets.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { ...baseEnv, GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-id', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'w@example.iam.gserviceaccount.com', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

// ---------- fake Google Sheets ----------
const colIdx = l => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const colName = i => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const tabs = new Map(); // title -> rows (array of arrays, row 1 = index 0)
const grid = t => { if (!tabs.has(t)) tabs.set(t, []); return tabs.get(t); };
function parse(range) {
  const m = /^'?(.+?)'?!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(range); if (!m) throw new Error('range ' + range);
  return { tab: m[1], c1: colIdx(m[2]), r1: Number(m[3] || 1) - 1, c2: m[4] ? colIdx(m[4]) : colIdx(m[2]), r2: m[5] ? Number(m[5]) - 1 : (m[4] ? 999 : Number(m[3]) - 1) };
}
const read = range => { const { tab, c1, r1, c2, r2 } = parse(range), g = grid(tab), out = []; for (let r = r1; r <= Math.min(r2, g.length - 1); r++) out.push((g[r] || []).slice(c1, c2 + 1).map(v => v ?? '')); while (out.length && out.at(-1).every(v => v === '')) out.pop(); return out; };
const write = (range, values) => { const { tab, c1, r1 } = parse(range), g = grid(tab); values.forEach((row, i) => { g[r1 + i] = g[r1 + i] || []; row.forEach((v, j) => { g[r1 + i][c1 + j] = v; }); }); };
const calls = [];
const WQ_ID = 77;
async function fakeFetch(url, opts = {}) {
  const ok = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
  if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 't', expires_in: 3600 });
  const path = decodeURIComponent(url.replace('https://sheets.googleapis.com/v4/spreadsheets/sheet-id', ''));
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push(path.split('?')[0]);
  if (path.startsWith('?fields=sheets.properties')) return ok({ sheets: [...new Set(['Work Queue', ...tabs.keys()])].map((title, i) => ({ properties: { title, sheetId: title === 'Work Queue' ? WQ_ID : 100 + i } })) });
  if (path.startsWith(':batchUpdate')) {
    for (const r of body.requests) if (r.insertDimension) {
      assert.equal(r.insertDimension.range.sheetId, WQ_ID); const { startIndex, endIndex } = r.insertDimension.range;
      for (const row of grid('Work Queue')) if (row) row.splice(startIndex, 0, ...Array(endIndex - startIndex).fill(''));
      calls.push('insert ' + startIndex);
    }
    return ok({ replies: [] });
  }
  if (path.startsWith('/values:batchUpdate')) { for (const d of body.data) write(d.range, d.values); return ok({}); }
  if (path.startsWith('/values:batchGet')) { const ranges = path.split('?')[1].split('&').filter(p => p.startsWith('ranges=')).map(p => p.slice(7)); return ok({ valueRanges: ranges.map(r => ({ values: read(r) })) }); }
  const m = /^\/values\/(.+?)(:append|:clear)?(\?.*)?$/.exec(path);
  if (m && m[2] === ':clear') { const { tab, c1, r1, c2 } = parse(m[1]); grid(tab).forEach((row, r) => { if (r >= r1 && row) for (let c = c1; c <= c2; c++) row[c] = ''; }); return ok({}); }
  if (m && m[2] === ':append') { const { tab } = parse(m[1]), g = grid(tab); const at = Math.max(g.length, 5); body.values.forEach((v, i) => { g[at + i] = [...v]; }); return ok({ updates: { updatedRange: `${tab}!A${at + 1}:AB${at + body.values.length}` } }); }
  if (m && (!opts.method || opts.method === 'GET')) return ok({ values: read(m[1]) });
  if (m && opts.method === 'PUT') { write(m[1], body.values); return ok({}); }
  throw new Error('unexpected call ' + (opts.method || 'GET') + ' ' + path);
}

// ---------- the old live sheet ----------
const OLD = ['Date', 'Order', 'Shop', 'Status', 'Photo preview', 'Photo 1', 'Product link', 'Qty', 'Product / variation', 'Customer', 'Delivery address & phone', 'Country', 'Notes', 'Total cost (USD)', 'Tracking number', 'Shipping status', 'Photo 2', 'Photo 3', 'Photo 4', 'Photo 5', 'Photo 6', 'Photo 7', 'Photo 8', 'More product links', 'Order ID', 'Client ID'];
const { admin, client, id } = await seed();
const mk = async (ref, extra = {}) => (await call('/orders', 'POST', { clientId: id, orderRef: ref, buyerName: 'Lanquetin', destination: 'FR', address1: '10, Rue d’Aquitaine\n34170 Castelnau-le-Lez\n0698148689', etsyUrl: 'https://example.com/i', ...extra }, admin)).data.order;
const a = await mk('FR-1'), b = await mk('FR-2');
const wq = grid('Work Queue');
wq[4] = [...OLD];
const oldRow = (o, cost, tracking) => { const r = Array(26).fill(''); r[0] = '2026-10-12'; r[1] = o.orderRef; r[10] = 'addr'; r[11] = 'FR'; r[12] = 'old note'; r[13] = cost; r[14] = tracking; r[15] = 'Not shipped'; r[24] = String(o.id); r[25] = String(id); return r; };
wq[5] = oldRow(a, 55.9, 'UL602450763YP'); wq[6] = oldRow(b, '', '');
await DB.prepare("INSERT INTO portal_settings (key, value) VALUES ('supplier_sheet','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
await DB.prepare("UPDATE client_orders SET sheet_cost='55.9', sheet_tracking='UL602450763YP', sheet_shipped='Not shipped', supplier_cost=55.9 WHERE id=?").bind(a.id).run();
await DB.prepare("UPDATE client_orders SET sheet_cost='', sheet_tracking='', sheet_shipped='Not shipped' WHERE id=?").bind(b.id).run();

// An order from before the new fields: the IOSS number and gift message were typed into the notes.
const FR_NOTES = ["Etsy's IOSS number: IM3720000224", ' EUR 72.37', '', 'Gift message:', 'Un petit cadeau retardaire pour accompagner cette belle étape de vie à deux.', '', '-- Jamel, Driss et Clara'].join(String.fromCharCode(10));
await DB.prepare('UPDATE client_orders SET notes=? WHERE id=?').bind(FR_NOTES, a.id).run();
// 1) First poll after the deploy: the sheet is switched once; nothing is applied from the wrong columns.
let p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.ok(p.ok, JSON.stringify(p));
assert.deepEqual(wq[4].slice(0, HEADERS.length), HEADERS, 'header is the new layout');
assert.equal(wq[4].length, 29);
assert.deepEqual(calls.filter(c => c.startsWith('insert')), ['insert 12', 'insert 16', 'insert 14'], 'gift message, courier, then competitor price');
assert.equal(wq[6][11], '', 'old country code cleared from Tax number'); assert.equal(wq[6][12], ''); assert.equal(wq[6][13], 'old note');
// the old notes were split: own columns in the sheet, notes cleaned
assert.equal(wq[5][11], "Etsy's IOSS number: IM3720000224 EUR 72.37"); assert.match(wq[5][12], /^Un petit cadeau.*Clara$/s); assert.equal(wq[5][13], '', 'notes no longer repeat them');
const fr = await DB.prepare('SELECT notes, tax_number, gift_message FROM client_orders WHERE id=?').bind(a.id).first();
assert.equal(fr.notes, ''); assert.equal(fr.tax_number, "Etsy's IOSS number: IM3720000224 EUR 72.37");
console.log('PASS old notes split into Tax number / Gift message');
assert.equal(wq[5][15], 55.9, 'cost moved to P'); assert.equal(wq[5][16], 'UL602450763YP', 'tracking moved to Q'); assert.equal(wq[5][14], '', 'competitor price O empty');
assert.equal(wq[5][17], '', 'empty courier'); assert.equal(wq[5][18], 'Not shipped', 'status moved to S');
assert.equal(wq[5][27], String(a.id), 'order id in AB'); assert.equal(wq[5][28], String(id), 'client id in AC');
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '4');
const o1 = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(a.id).first();
assert.equal(o1.tracking_number, '', 'nothing applied from the wrong columns'); assert.equal(o1.courier, null);
console.log('PASS switch: header, columns moved, old country cleared, ids found, nothing misapplied');

// Layout 3 -> 4: a competitor price typed straight into O is copied to its order once, then the website keeps writing it.
await DB.prepare("UPDATE portal_settings SET value='3' WHERE key='supplier_sheet_layout'").run();
wq[6][14] = '$30 at shop Y';
p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.equal((await DB.prepare('SELECT competitor_price FROM client_orders WHERE id=?').bind(b.id).first()).competitor_price, '$30 at shop Y');
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch); assert.equal(wq[6][14], '$30 at shop Y', 'still shown after the row is rewritten');
console.log('PASS competitor prices typed in the sheet before were copied to the orders');
// 2) Polling again does not switch again.
calls.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok);
assert.equal(calls.filter(c => c.startsWith('insert')).length, 0, 'switch runs once');

// 3) The supplier picks a courier and types tracking for the second order: the website takes both.
wq[5][17] = 'Yanwen'; wq[6][16] = 'UL602451830YP'; wq[6][17] = 'China Post';
p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
const ca = await DB.prepare('SELECT courier, sheet_courier FROM client_orders WHERE id=?').bind(a.id).first();
assert.equal(ca.courier, 'Yanwen'); assert.equal(ca.sheet_courier, 'Yanwen');
const cb = await DB.prepare('SELECT courier, tracking_number FROM client_orders WHERE id=?').bind(b.id).first();
assert.deepEqual([cb.courier, cb.tracking_number], ['China Post', 'UL602451830YP']);
const seen = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === a.id);
assert.equal(seen.courier, 'Yanwen', 'the client sees the courier');
console.log('PASS courier from the sheet reaches the order and the client');

// 4) Tax number + gift message: saved on the order, written to L/M of that row; notes stay separate.
let r = await call('/orders/' + a.id, 'PUT', { taxNumber: "Etsy's IOSS number: IM3720000224 EUR 72.37", giftMessage: 'Un petit cadeau\n-- Jamel, Driss et Clara' }, client);
assert.equal(r.status, 200, JSON.stringify(r.data));
await syncPortalOrderToGoogleSheet(DB, env, a.id, fakeFetch);
assert.equal(wq[5][11], "Etsy's IOSS number: IM3720000224 EUR 72.37"); assert.equal(wq[5][12], 'Un petit cadeau\n-- Jamel, Driss et Clara');
assert.ok(String(wq[5][10]).endsWith('France'), 'the country is at the end of the address: ' + JSON.stringify(wq[5][10]));
assert.equal(wq[5][17], 'Yanwen', 'courier kept'); assert.equal(wq[5][15], 55.9, 'cost kept');
const mine = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === a.id);
assert.equal(mine.taxNumber, "Etsy's IOSS number: IM3720000224 EUR 72.37"); assert.match(mine.giftMessage, /Jamel/);
console.log('PASS tax number and gift message in their own columns, country at the end of the address');

// 5) Admin changes the courier on the website: written to the sheet.
r = await call('/orders/' + b.id, 'PUT', { trackingNumber: 'UL602451830YP', courier: 'Yanwen' }, admin); assert.equal(r.status, 200);
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch);
assert.equal(wq[6][17], 'Yanwen');
p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(p.changed.length, 0, 'the website does not re-apply its own write');
// a client cannot set the courier
await call('/orders/' + b.id, 'PUT', { courier: 'Fake' }, client);
assert.equal((await DB.prepare('SELECT courier FROM client_orders WHERE id=?').bind(b.id).first()).courier, 'Yanwen');

// 6) Couriers list in settings
r = await call('/admin/settings', 'POST', { couriers: 'China Post\nYanwen\n4PX\nYanwen' }, admin); assert.equal(r.status, 200);
assert.equal(r.data.settings.couriers, 'China Post\nYanwen\n4PX');
assert.equal((await call('/admin/settings', 'POST', { couriers: ' \n ' }, admin)).status, 400);
console.log('PASS admin courier edit, client cannot set it, courier list saved');
// 7) A new order with the IOSS number and gift message pasted into the notes: moved on save; other notes stay.
const n = await call('/orders', 'POST', { clientId: id, orderRef: 'FR-3', buyerName: 'X', destination: 'FR', address1: '1 Rue', etsyUrl: 'https://example.com/i', notes: 'Fragile, please wrap' + String.fromCharCode(10) + FR_NOTES }, admin);
assert.equal(n.status, 200, JSON.stringify(n.data)); const no = n.data.order;
assert.equal(no.notes, 'Fragile, please wrap'); assert.match(no.taxNumber, /IM3720000224 EUR 72.37$/); assert.match(no.giftMessage, /^Un petit cadeau/);
const k = (await call('/orders', 'POST', { clientId: id, orderRef: 'FR-4', buyerName: 'X', destination: 'FR', address1: '1 Rue', etsyUrl: 'https://example.com/i', taxNumber: 'IOSS IM1', notes: FR_NOTES }, admin)).data.order;
assert.equal(k.taxNumber, 'IOSS IM1'); assert.ok(k.notes.includes('IM3720000224'), 'a typed field is never overwritten; the notes keep the text');
console.log('PASS new orders: pasted IOSS/gift message moved to their fields; typed fields win');
await pg.close();
