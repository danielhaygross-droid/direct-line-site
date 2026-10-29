// Local check: saved prices — an order the supplier priced once is priced automatically the next time. Fake Google Sheet + real SQL.
// The fake sheet is the same as in check-courier-sheet.mjs.
//   node checks/check-saved-prices.mjs      (run from the repo root)
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { pg, DB, call, seed, env as baseEnv } from './lib.mjs';
import { pollSupplierSheet } from '../server/supplier-sheet.mjs';
import { readFile } from 'node:fs/promises';
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
  if (path.startsWith('?fields=sheets(')) return ok({ sheets: [] }); // protection check after the Shipped / Cancelled tabs are made
  if (path.startsWith('?fields=sheets.properties')) return ok({ sheets: [...new Set(['Work Queue', ...tabs.keys()])].map((title, i) => ({ properties: { title, sheetId: title === 'Work Queue' ? WQ_ID : 100 + i } })) });
  if (path.startsWith(':batchUpdate') && body.requests.some(r => r.addSheet)) { const t = body.requests.find(r => r.addSheet).addSheet.properties.title; grid(t); calls.push('addSheet ' + t); return ok({ replies: [{ addSheet: { properties: { title: t, sheetId: 500 } } }] }); }
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


const { admin, client, id } = await seed();
Object.assign(baseEnv, env); globalThis.fetch = fakeFetch;
const settle = () => new Promise(r => setTimeout(r, 400));
await DB.prepare("INSERT INTO portal_settings (key, value) VALUES ('supplier_sheet','1'),('supplier_sheet_layout','2'),('quote_tab','1'),('notes_split_v1','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
const wq = grid('Work Queue'); wq[4] = ['Date'];
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
const other = (await call('/client-stores', 'POST', { name: 'Second shop', platform: 'Etsy', link: 'https://example.com/s2' }, client)).data.store;
const mk = async (ref, extra = {}) => { const r = await call('/orders', 'POST', { clientId: id, storeId: store.id, orderRef: ref, buyerName: 'B', destination: 'US', address1: '1 Main St', etsyUrl: 'https://www.etsy.com/listing/111222333/black-bag?ref=shop_home', variant: 'Black', quantity: 1, ...extra }, admin); assert.equal(r.status, 200, JSON.stringify(r.data)); await settle(); return r.data.order; };
const row = oid => wq.findIndex(x => x && x[30] === String(oid));
const db = oid => DB.prepare('SELECT price, product_cost, supplier_cost, price_source FROM client_orders WHERE id=?').bind(oid).first();
const poll = async () => { const p = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(p.ok, JSON.stringify(p)); await settle(); return p; };

// 0) orders priced before this feature: remembered once (the newest cost wins); cancelled ones are ignored
const old1 = await mk('OLD-1', { destination: 'CA' }), old2 = await mk('OLD-2', { destination: 'CA' }), old3 = await mk('OLD-3', { destination: 'DE' });
await DB.prepare('UPDATE client_orders SET supplier_cost=30, updated_at=100 WHERE id=?').bind(old1.id).run();
await DB.prepare('UPDATE client_orders SET supplier_cost=31, updated_at=200 WHERE id=?').bind(old2.id).run();
await DB.prepare("UPDATE client_orders SET supplier_cost=40, status='cancelled' WHERE id=?").bind(old3.id).run();
let p0 = await poll(); assert.equal(p0.savedPrices, 2, 'two old orders read (same product: one saved price)');
let sp0 = (await call('/admin/saved-prices?clientId=' + id, 'GET', null, admin)).data.prices;
assert.deepEqual(sp0.map(p => [p.destination, p.supplierCost]), [['CA', 31]], 'newest cost; cancelled order not used');
assert.equal((await poll()).savedPrices, 0, 'runs once');
const ca = await mk('CA-NEW', { destination: 'CA' }); assert.equal(Number((await db(ca.id)).price), 33, 'next Canada order priced from the old ones');
console.log('PASS orders priced before the feature are remembered (once, newest cost)');
// 1) first order: the supplier prices it in the sheet (whole order 20) -> billed 22 (fee 2) and remembered
const a = await mk('A'); assert.equal(Number((await db(a.id)).price), 0);
wq[row(a.id)][15] = 20; await poll();
assert.equal(Number((await db(a.id)).price), 22);
let sp = (await call('/admin/saved-prices?clientId=' + id, 'GET', null, admin)).data.prices.filter(p => p.destination === 'US'); assert.equal(sp.length, 1); assert.equal(sp[0].supplierCost, 20); assert.equal(sp[0].destination, 'US');
console.log('PASS the supplier prices an order once: it is saved');

// 2) the same order again (other tracking link, other letter case): priced straight away; the supplier sees the cost and a note
const b = await mk('B', { etsyUrl: 'https://www.etsy.com/il-en/listing/111222333/black-bag?utm_source=x', variant: ' black ' });
let bb = await db(b.id); assert.deepEqual([Number(bb.price), Number(bb.supplier_cost), bb.price_source], [22, 20, 'saved']);
assert.equal(wq[row(b.id)][15], 20, 'Total cost filled in the sheet'); assert.match(wq[row(b.id)][13], /^Total cost filled in from an earlier order/);
const seen = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === b.id); assert.equal(seen.price, 22); assert.equal(seen.priceSource, undefined, 'internal');
console.log('PASS same store + product + variation + country + quantity: priced automatically, shown to the supplier');

// 3) not the same: another country, another quantity, another store, another variation
for (const [ref, extra] of [['C', { destination: 'FR' }], ['D', { quantity: 2 }], ['E', { storeId: other.id }], ['F', { variant: 'Brown' }]]) {
  const o = await mk(ref, extra); assert.equal(Number((await db(o.id)).price), 0, ref + ' is priced by the supplier'); assert.equal(wq[row(o.id)][15], '', ref);
}
console.log('PASS different country / quantity / store / variation: left for the supplier');

// 4) the supplier corrects the auto price: re-billed, note gone, the newer cost is remembered
wq[row(b.id)][15] = 21; await poll();
bb = await db(b.id); assert.deepEqual([Number(bb.price), bb.price_source], [23, null]);
await syncPortalOrderToGoogleSheet(DB, env, b.id, fakeFetch); assert.ok(!String(wq[row(b.id)][13]).startsWith('Total cost filled'), 'note removed');
sp = (await call('/admin/saved-prices?clientId=' + id, 'GET', null, admin)).data.prices.find(p => p.destination === 'US' && p.quantity === 1 && !p.storeName.includes('Second'));
assert.equal(sp.supplierCost, 21); assert.equal(sp.uses, 1);
const g = await mk('G'); assert.equal(Number((await db(g.id)).price), 23, 'next one uses the newer cost');
console.log('PASS the supplier can correct it; the newest cost is used next time');

// 5) a fixed product quote is never overwritten; forget stops it
assert.equal((await call('/admin/saved-prices/' + sp.id + '/forget', 'POST', {}, admin)).status, 200);
const h = await mk('H'); assert.equal(Number((await db(h.id)).price), 0, 'forgotten');
assert.equal((await call('/admin/saved-prices/999999/forget', 'POST', {}, admin)).status, 404);
assert.equal((await call('/admin/saved-prices?clientId=' + id, 'GET', null, client)).status === 200, false, 'clients cannot read saved prices');
console.log('PASS forget, and admin only');
await pg.close();
