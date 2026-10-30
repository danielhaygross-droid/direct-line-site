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
const calls = [], rules = [];
const WQ_ID = 77, sheetIds = new Map([['Work Queue', WQ_ID]]);
const idOf = t => { if (!sheetIds.has(t)) sheetIds.set(t, 100 + sheetIds.size); return sheetIds.get(t); }, tabOf = id => [...sheetIds].find(([, v]) => v === id)?.[0];
async function fakeFetch(url, opts = {}) {
  const ok = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
  if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 't', expires_in: 3600 });
  const path = decodeURIComponent(url.replace('https://sheets.googleapis.com/v4/spreadsheets/sheet-id', ''));
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push(path.split('?')[0]);
  if (path.startsWith('?fields=sheets(')) return ok({ sheets: [] }); // protection check after the Shipped / Cancelled tabs are made
  if (path.startsWith('?fields=sheets.properties')) return ok({ sheets: [...new Set(['Work Queue', ...tabs.keys()])].map(title => ({ properties: { title, sheetId: idOf(title) } })) });
  if (path.startsWith(':batchUpdate')) {
    // Shipped / Cancelled tabs (layout 14): copies of the supplier tab; rows are deleted and moved by sheet id.
    for (const r of body.requests) {
      if (r.duplicateSheet) { sheetIds.set(r.duplicateSheet.newSheetName, r.duplicateSheet.newSheetId); tabs.set(r.duplicateSheet.newSheetName, JSON.parse(JSON.stringify(grid(tabOf(r.duplicateSheet.sourceSheetId))))); }
      if (r.deleteDimension?.range.dimension === 'ROWS') { const { sheetId, startIndex, endIndex } = r.deleteDimension.range; grid(tabOf(sheetId)).splice(startIndex, endIndex - startIndex); }
      // Columns (layout 19): every row's cells move, like Google does.
      if (r.moveDimension?.source.dimension === 'COLUMNS') { const { sheetId, startIndex: f, endIndex: e } = r.moveDimension.source, d = r.moveDimension.destinationIndex; for (const row of grid(tabOf(sheetId))) if (row) { while (row.length < e) row.push(''); const cut = row.splice(f, e - f); row.splice(d > f ? d - cut.length : d, 0, ...cut); } calls.push('move column ' + f + ' to ' + d); }
      else if (r.moveDimension) { const { sheetId, startIndex, endIndex } = r.moveDimension.source, g = grid(tabOf(sheetId)), d = r.moveDimension.destinationIndex; const items = g.splice(startIndex, endIndex - startIndex); g.splice(d > startIndex ? d - items.length : d, 0, ...items); }
    }
    for (const r of body.requests) if (r.addConditionalFormatRule) rules.push(r.addConditionalFormatRule.rule);
    for (const r of body.requests) if (r.updateDimensionProperties?.properties?.hiddenByUser && r.updateDimensionProperties.range.startIndex === 2) calls.push('hide C-D');
    for (const r of body.requests) if (r.updateDimensionProperties?.properties?.hiddenByUser === false && r.updateDimensionProperties.range.startIndex === 2 && r.updateDimensionProperties.range.endIndex === 3) calls.push('show C');
    for (const r of body.requests) if (r.setDataValidation?.rule?.condition?.values?.some(v => v.userEnteredValue === 'Not shipped')) calls.push('status list ' + r.setDataValidation.rule.condition.values.map(v => v.userEnteredValue).join('/'));
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
// Layout 14 puts the newest order on top: a is the newer one, so the rows keep their places in this check.
await DB.prepare('UPDATE client_orders SET created_at=created_at+10 WHERE id=?').bind(a.id).run();

// An order from before the new fields: the IOSS number and gift message were typed into the notes.
const FR_NOTES = ["Etsy's IOSS number: IM3720000224", ' EUR 72.37', '', 'Gift message:', 'Un petit cadeau retardaire pour accompagner cette belle étape de vie à deux.', '', '-- Jamel, Driss et Clara'].join(String.fromCharCode(10));
await DB.prepare('UPDATE client_orders SET notes=? WHERE id=?').bind(FR_NOTES, a.id).run();
// 1) First poll after the deploy: the sheet is switched once; nothing is applied from the wrong columns.
let p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.ok(p.ok, JSON.stringify(p));
assert.deepEqual(wq[4].slice(0, HEADERS.length), HEADERS, 'header is the new layout');
assert.equal(wq[4].length, 35, "A-AI (AI = Cost per product)");
assert.deepEqual(calls.filter(c => c.startsWith('insert')), ['insert 12', 'insert 16', 'insert 14', 'insert 19', 'insert 19'], 'gift message, courier, competitor price, client paid, then delayed + reason');
assert.equal(wq[6][11], '', 'old country code cleared from Tax number'); assert.equal(wq[6][12], ''); assert.equal(wq[6][13], 'old note');
// the old notes were split: own columns in the sheet, notes cleaned
assert.equal(wq[5][11], "Etsy's IOSS number: IM3720000224 EUR 72.37"); assert.match(wq[5][12], /^Un petit cadeau.*Clara$/s); assert.equal(wq[5][13], '', 'notes no longer repeat them');
const fr = await DB.prepare('SELECT notes, tax_number, gift_message FROM client_orders WHERE id=?').bind(a.id).first();
assert.equal(fr.notes, ''); assert.equal(fr.tax_number, "Etsy's IOSS number: IM3720000224 EUR 72.37");
console.log('PASS old notes split into Tax number / Gift message');
assert.equal(wq[5][15], 55.9, 'cost moved to P'); assert.equal(wq[5][17], 'UL602450763YP', 'tracking moved to Q'); assert.equal(wq[5][14], '', 'competitor price O empty');
assert.equal(wq[5][18], '', 'empty courier'); assert.equal(wq[5][19], 'Not shipped', 'status moved to S');
assert.equal(wq[5][31], String(a.id), 'order id in AE'); assert.equal(wq[5][32], String(id), 'client id in AF');
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '19', 'up to date: layout 19 (Cost per product next to Total cost; layout 18 AI Cost per product; row 4 on every tab, Refunded, filter A-AH, Shipped / Cancelled tabs, Delayed? + Delay reason, red cancelled rows, Domestic Express Tracking Number, cost revision colour)');
assert.ok(rules.some(r => r.booleanRule?.condition?.type === 'TEXT_STARTS_WITH' && r.booleanRule.condition.values[0].userEnteredValue === 'COST REVISION REQUESTED'), 'layout 12: Competitor price turns orange while a cost revision is open');
assert.ok(rules.some(r => r.booleanRule?.condition?.type === 'CUSTOM_FORMULA' && r.booleanRule.condition.values[0].userEnteredValue.startsWith('=LEFT($O6,23)="COST REVISION REQUESTED"')), 'layout 13: rows with an open cost revision turn orange');
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
wq[5][18] = 'Yanwen'; wq[6][17] = 'UL602451830YP'; wq[6][18] = 'China Post';
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
assert.equal(wq[5][18], 'Yanwen', 'courier kept'); assert.equal(wq[5][15], 55.9, 'cost kept');
const mine = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === a.id);
assert.equal(mine.taxNumber, "Etsy's IOSS number: IM3720000224 EUR 72.37"); assert.match(mine.giftMessage, /Jamel/);
console.log('PASS tax number and gift message in their own columns, country at the end of the address');

// 5) Admin changes the courier on the website: written to the sheet.
r = await call('/orders/' + b.id, 'PUT', { trackingNumber: 'UL602451830YP', courier: 'Yanwen' }, admin); assert.equal(r.status, 200);
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch);
assert.equal(wq[6][18], 'Yanwen');
p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(p.changed.length, 0, 'the website does not re-apply its own write');
// Supplier edits are logged for admins only, old -> new (Erwin, 26 Oct: "did the supplier change the cost while we were offline?").
const sheetEdits = async (oid, cookie) => ((await call('/orders/' + oid + '/messages', 'GET', null, cookie)).data.events || []).filter(e => e.kind === 'supplier_sheet').map(e => JSON.parse(e.detail));
assert.deepEqual(await sheetEdits(b.id, admin), [{ f: 'tracking', from: '', to: 'UL602451830YP' }, { f: 'courier', from: '', to: 'China Post' }], 'tracking + courier typed by the supplier; the admin\'s own courier change is not logged');
assert.deepEqual(await sheetEdits(a.id, admin), [{ f: 'courier', from: '', to: 'Yanwen' }]);
wq[5][15] = 60.5; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.deepEqual((await sheetEdits(a.id, admin)).at(-1), { f: 'cost', from: '55.9', to: '60.5' }, 'cost change logged with the old cost');
assert.deepEqual(await sheetEdits(a.id, client), [], 'clients never see the supplier sheet log');
assert.ok(!((await call('/notifications', 'GET', null, client)).data.items || []).some(e => e.kind === 'supplier_sheet'), 'not in client notifications');
const bell = ((await call('/admin/notifications', 'GET', null, admin)).data.items || []).filter(e => e.kind === 'supplier_sheet').map(e => JSON.parse(e.detail));
assert.deepEqual(bell, [{ f: 'cost', from: '55.9', to: '60.5' }], 'admin bell: only a changed cost (not tracking, not a first cost)');
// AI Cost per product (Erwin, 30 Oct 2026): on an order with 3 products the supplier types one cost each; the client sees
// each product's share of the order price (adding up to it), never the supplier's costs.
await DB.prepare("UPDATE client_orders SET etsy_url=? WHERE id=?").bind(['https://example.com/a', 'https://example.com/b', 'https://example.com/c'].join(String.fromCharCode(10)), a.id).run();
wq[5][16] = '1: 20, 2: 15.50, 3: 25'; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
const mineA = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === a.id), admA = (await call('/admin/orders', 'GET', null, admin)).data.orders.find(o => o.id === a.id);
assert.deepEqual(admA.itemCosts, [20, 15.5, 25], 'admin: cost per product from the supplier');
assert.equal(mineA.itemCosts, undefined, 'the client never gets the supplier costs');
assert.equal(mineA.itemPrices.length, 3); assert.equal(Math.round(mineA.itemPrices.reduce((n, v) => n + v, 0) * 100), Math.round(mineA.price * 100), 'the product prices add up to the order price');
assert.ok(mineA.itemPrices[2] > mineA.itemPrices[1], 'in proportion to the costs');
// The client gets one bell with the prices (not the supplier's costs); the same prices again (typed differently) add none.
const priceBells = async () => ((await call('/notifications', 'GET', null, client)).data.items || []).filter(e => e.kind === 'item_prices');
assert.deepEqual((await priceBells()).map(e => e.detail), [mineA.itemPrices.map(n => '$' + n.toFixed(2)).join(' · ')], 'client bell: price per product added');
wq[5][16] = '20、15.5、25'; await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.equal((await priceBells()).length, 1, 'same prices: no second bell');
wq[5][16] = '20, 15.50'; await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.equal((await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === a.id).itemPrices, null, 'not one cost per product: no split shown');
wq[5][16] = ''; await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
console.log('PASS AI cost per product: read from the sheet, client sees prices that add up to the order price (one bell), admin sees the costs');
console.log('PASS supplier sheet edits logged for admins (old -> new), hidden from clients');
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
// 8) Possibly delayed: the supplier picks it in T and writes a reason in U; the client sees both and is notified.
wq[6][20] = 'Possibly delayed'; wq[6][21] = 'Wrong variant from the factory, being remade';
p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
let late = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === b.id);
assert.ok(late.delayedAt > 0, 'flagged'); assert.equal(late.delayReason, 'Wrong variant from the factory, being remade');
let notes = (await call('/notifications', 'GET', null, client)).data.items.filter(x => x.orderId === b.id && x.kind === 'delayed');
assert.equal(notes.length, 1); assert.equal(notes[0].detail, 'Wrong variant from the factory, being remade');
calls.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(p.changed.length, 0, 'no repeat while nothing changes');
assert.equal(wq[6][20], 'Possibly delayed', 'the website never overwrites the supplier delay cells'); assert.equal(wq[6][21], 'Wrong variant from the factory, being remade');
// A new reason: the client is told again; the "since" time stays.
const since = late.delayedAt; wq[6][21] = 'Remade, arriving at the warehouse Friday';
p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok);
late = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === b.id);
assert.equal(late.delayReason, 'Remade, arriving at the warehouse Friday'); assert.equal(late.delayedAt, since);
// Back on time: flag cleared, client told.
wq[6][20] = 'On time';
p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok);
late = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === b.id);
assert.equal(late.delayedAt, null); assert.equal(late.delayReason, '');
notes = (await call('/notifications', 'GET', null, client)).data.items.filter(x => x.orderId === b.id);
assert.deepEqual(notes.filter(x => /delay/.test(x.kind)).map(x => x.kind), ['delay_cleared', 'delayed', 'delayed']);
// A ticked checkbox or "yes" also counts; a reason alone does not.
wq[5][21] = 'just a note'; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.equal((await DB.prepare('SELECT delayed_at FROM client_orders WHERE id=?').bind(a.id).first()).delayed_at, null);
wq[5][20] = 'yes'; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.ok((await DB.prepare('SELECT delayed_at FROM client_orders WHERE id=?').bind(a.id).first()).delayed_at > 0);
console.log('PASS possibly delayed: set, reason changed, cleared; the client sees it and is notified');
// 9) The live sheet today (layout 5: no delay columns, Client paid in T): switched once, nothing lost or misapplied.
for (const row of wq) if (row) { while (row.length < 35) row.push(''); const [items] = row.splice(16, 1); row.splice(34, 0, items); row.splice(19, 2); } // Cost per product back in AI (layout 18), then no delay columns
await DB.prepare('UPDATE client_orders SET delayed_at=NULL, delay_reason=NULL, sheet_delayed=NULL, sheet_delay_reason=NULL').run(); // as on the live site before this change
const costBefore = wq[5][15], trackBefore = wq[6][16], courierBefore = wq[5][17]; // old places (layout 5)
await DB.prepare("UPDATE portal_settings SET value='5' WHERE key='supplier_sheet_layout'").run();
calls.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.deepEqual(calls.filter(c => c.startsWith('insert')), ['insert 19'], 'only the two delay columns are added');
assert.deepEqual(wq[4].slice(0, HEADERS.length), HEADERS);
assert.equal(wq[5][15], costBefore, 'cost stays in P'); assert.equal(wq[6][17], trackBefore, 'tracking stays in Q');
assert.equal(wq[5][18], courierBefore, 'courier stays in R'); assert.equal(wq[5][20], '', 'new Delayed? cell is empty'); assert.equal(wq[5][31], String(a.id), 'ids moved to AE');
assert.equal(p.changed.length, 0, 'nothing applied by the switch');
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '19');
console.log('PASS live layout 5 -> 8: two columns added after Shipping status, everything else moved with its data');

// 10) Layout 6 -> 7 (the live sheet on 23 Oct): only the red / orange row rules are added, no columns move.
const cancelRules = () => rules.filter(x => /^=\$D6="(CANCELLED - do not ship|Cancellation requested)"$/.test(x.booleanRule?.condition?.values?.[0]?.userEnteredValue || ''));
await DB.prepare("UPDATE portal_settings SET value='6' WHERE key='supplier_sheet_layout'").run();
calls.length = 0; rules.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.deepEqual(calls.filter(c => c.startsWith('insert')), [], 'no columns added');
assert.equal(cancelRules().length, 3, 'status cell + whole red row + orange row for requests');
const redRow = cancelRules().find(x => x.ranges[0].startColumnIndex === 0 && x.booleanRule.format.textFormat.strikethrough);
assert.equal(redRow.ranges[0].endColumnIndex, 31, 'the whole row up to the photos (A-AE)'); assert.equal(redRow.ranges[0].startRowIndex, 5, 'from the first order row');
assert.match(wq[3][18], /COUNTIF\(INDIRECT\("D6:D"\),"CANCELLED - do not ship"\)&" cancelled"/, 'row 4 counts cancelled orders');
assert.match(wq[2][0], /RED rows are cancelled orders: do not buy or ship them/, 'the instructions say so');
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '19');
// Running it again adds nothing.
rules.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(cancelRules().length, 0, 'rules added once');
// Cancelling an order: its Status cell says so, in the text the rules look for.
const rowOf = o => wq.findIndex(row => row && row[31] === String(o.id));
// The order's row in whichever supplier tab it is (Orders / Shipped / Cancelled, layout 14).
const at = o => ['Work Queue', 'Shipped', 'Cancelled'].map(t => grid(t).find(row => row && row[31] === String(o.id))).find(Boolean);
assert.equal((await call('/orders/' + b.id, 'PUT', { status: 'cancelled', fee: 0 }, admin)).status, 200);
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch);
assert.equal(at(b)[3], 'CANCELLED - do not ship'); assert.equal(at(b)[19], 'Cancelled', 'Shipping status says Cancelled (supplier filters refunds)');
assert.ok(grid('Cancelled').some(row => row && row[31] === String(b.id)) && rowOf(b) < 0, 'and moves to the Cancelled tab (layout 14)');
assert.equal((await call('/orders/' + b.id, 'PUT', { status: 'processing' }, admin)).status, 200);
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch);
assert.equal(at(b)[3], 'In Progress', 'reopened: back to normal'); assert.equal(at(b)[19], 'Not shipped', 'reopened: Not shipped again');
console.log('PASS layout 6 -> 8: cancelled rows turn red (whole row), requests orange, counted in row 4');

// 11) Layout 7 -> 8 (live sheet on 26 Oct): AG 'Domestic Express Tracking Number' at the far right for the supplier (Ye).
//     No column moves, and what the supplier types there survives the website rewriting the row.
await DB.prepare("UPDATE portal_settings SET value='7' WHERE key='supplier_sheet_layout'").run();
for (const row of wq) if (row) row.length = Math.min(row.length, 32);
calls.length = 0; rules.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.deepEqual(calls.filter(c => c.startsWith('insert')), [], 'no columns inserted');
assert.equal(wq[4][33], 'Domestic Express Tracking Number'); assert.equal(wq[4][31], 'Order ID', 'ids stay in AE/AF');
assert.match(wq[2][0], /Domestic Express Tracking Number \(yellow, far right/);
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '19');
const rA = wq.findIndex(row => row && row[31] === String(a.id)); wq[rA][33] = 'SF1234567890';
await syncPortalOrderToGoogleSheet(DB, env, a.id, fakeFetch);
assert.equal(wq[rA][33], 'SF1234567890', 'the supplier’s domestic tracking is kept when the website rewrites the row');
console.log('PASS layout 7 -> 8: Domestic Express Tracking Number in AG, kept on rewrites');

// 12) Layout 8 -> 9 (26 Oct): Shop (C) + Status (D) hidden once; the supplier's AG value reaches the website (admin).
await DB.prepare("UPDATE portal_settings SET value='8' WHERE key='supplier_sheet_layout'").run();
calls.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.equal(calls.filter(c => c === 'hide C-D').length, 1, 'Shop and Status hidden'); assert.deepEqual(calls.filter(c => c.startsWith('insert')), [], 'nothing inserted or deleted');
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '19');
calls.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(calls.filter(c => c === 'hide C-D').length, 0, 'only once');
assert.equal((await DB.prepare('SELECT domestic_tracking FROM client_orders WHERE id=?').bind(a.id).first()).domestic_tracking, 'SF1234567890', 'AG copied to the order');
const listed = (await call('/admin/orders', 'GET', null, admin)).data.orders.find(o => o.id === a.id); assert.equal(listed.domesticTracking, 'SF1234567890', 'admin sees it');
wq[rA][33] = ''; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.equal((await DB.prepare('SELECT domestic_tracking FROM client_orders WHERE id=?').bind(a.id).first()).domestic_tracking, null, 'cleared in the sheet = cleared on the site');
console.log('PASS layout 8 -> 9: Shop + Status hidden; domestic tracking from AG shown in admin');

// 13) Layout 9 -> 10 (26 Oct): "Cancelled" in the Shipping status list, Shop (C) shown again; cancelled rows rewritten.
assert.equal((await call('/orders/' + b.id, 'PUT', { status: 'cancelled', fee: 0 }, admin)).status, 200);
await DB.prepare("UPDATE client_orders SET sheet_shipped='Not shipped' WHERE id=?").bind(b.id).run(); at(b)[19] = 'Not shipped'; // as before layout 10
await DB.prepare("UPDATE portal_settings SET value='9' WHERE key='supplier_sheet_layout'").run();
calls.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.equal(calls.filter(c => c === 'show C').length, 1, 'Shop column, once');
assert.deepEqual([...new Set(calls.filter(c => c.startsWith('status list')))], ['status list Not shipped/Shipped/Cancel requested/Cancelled/Refunded'], 'status list (Refunded since layout 16, on every supplier tab)');
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '19');
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch); assert.equal(at(b)[19], 'Cancelled', 'existing cancelled row rewritten');
at(a)[19] = 'Cancelled'; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.notEqual((await DB.prepare('SELECT status FROM client_orders WHERE id=?').bind(a.id).first()).status, 'cancelled', 'the supplier picking Cancelled does not cancel the order');
calls.length = 0; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(calls.filter(c => c === 'show C').length, 0, 'only once');
console.log('PASS layout 9 -> 10: Cancelled in Shipping status, Shop column back; supplier cannot cancel from the sheet');

// 14) Layout 11 (26 Oct, KumoBags suspended): "Cancel requested" in S, the supplier's Cancellation fee (USD) in AH.
assert.equal(wq[4][34], 'Cancellation fee (USD)', 'AH header');
assert.equal((await call('/orders/' + b.id, 'PUT', { status: 'processing' }, admin)).status, 200);
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch); assert.equal(at(b)[19], 'Not shipped', 'reopened');
assert.equal((await call('/orders/' + b.id + '/request-cancellation', 'POST', { reason: 'Store suspended' }, client)).status, 200);
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch); assert.equal(at(b)[19], 'Cancel requested', 'S says Cancel requested');
at(b)[34] = 6.5; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.equal((await DB.prepare('SELECT supplier_cancel_fee FROM client_orders WHERE id=?').bind(b.id).first()).supplier_cancel_fee, 6.5, 'fee saved on the order');
const adminOrder = (await call('/admin/orders', 'GET', null, admin)).data.orders.find(o => o.id === b.id); assert.equal(adminOrder.supplierCancelFee, 6.5, 'admin sees it');
const clientOrder = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === b.id); assert.equal(clientOrder.supplierCancelFee, undefined, 'client does not (until approved)');
assert.ok(((await call('/admin/notifications', 'GET', null, admin)).data.items || []).some(e => e.kind === 'supplier_sheet' && JSON.parse(e.detail).f === 'cancel_fee'), 'admin bell: supplier set a cancellation fee');
assert.equal((await DB.prepare('SELECT status FROM client_orders WHERE id=?').bind(b.id).first()).status, 'cancellation_requested', 'nothing approved by the supplier');
{ const r = await call('/orders/' + b.id + '/approve-cancellation', 'POST', { fee: adminOrder.supplierCancelFee }, admin); assert.equal(r.status, 200, JSON.stringify(r.data)); }
assert.equal((await DB.prepare("SELECT amount FROM client_balance_adjustments WHERE order_id=? AND kind='cancellation_fee'").bind(b.id).first()).amount, 6.5, 'client billed exactly the supplier fee');
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch); assert.equal(at(b)[19], 'Cancelled');
at(b)[34] = 'abc'; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
assert.equal((await DB.prepare('SELECT supplier_cancel_fee FROM client_orders WHERE id=?').bind(b.id).first()).supplier_cancel_fee, 6.5, 'not a number: ignored');
// Cancelled first, fee later: the supplier's fee is billed straight away and the client is notified (Erwin, 26 Oct 2026).
at(b)[34] = ''; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch });
const feeNow = async () => Number((await DB.prepare("SELECT amount FROM client_balance_adjustments WHERE order_id=? AND kind='cancellation_fee'").bind(b.id).first()).amount);
assert.equal(await feeNow(), 0, 'fee cleared in the sheet = no fee');
at(b)[34] = 3.25; p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p));
assert.equal(await feeNow(), 3.25, 'fee typed after the cancellation is billed at once');
const feeNotes = ((await call('/notifications', 'GET', null, client)).data.items || []).filter(e => e.kind === 'cancel_fee');
assert.equal(feeNotes[0]?.detail, '3.25', 'the client is notified');
console.log('PASS cancelled first, fee later: billed at once, client notified; cleared = removed');
console.log('PASS layout 11: Cancel requested in S, supplier cancellation fee read from AH, admin approves, client pays exactly that');
await pg.close();
