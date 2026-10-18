// Local check: the supplier's Product Quotes tab (price checks from My Products) against a fake Google Sheet. Real SQL (PGlite).
// The fake sheet is the same as in check-courier-sheet.mjs.
//   node checks/check-quote-sheet.mjs      (run from the repo root)
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { pg, DB, call, seed, env as baseEnv } from './lib.mjs';
import { pollSupplierSheet } from '../server/supplier-sheet.mjs';
import { readFile } from 'node:fs/promises';

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
  if (path.startsWith(':batchUpdate') && body.requests.some(r => r.addSheet)) { const t = body.requests.find(r => r.addSheet).addSheet.properties.title; grid(t); calls.push('addSheet ' + t); return ok({ replies: [{ addSheet: { properties: { title: t, sheetId: 500 } } }] }); }
  if (path.startsWith(':batchUpdate')) {
    for (const r of body.requests) if (r.insertDimension) {
      const { sheetId, startIndex, endIndex } = r.insertDimension.range, title = sheetId === WQ_ID ? 'Work Queue' : [...new Set(['Work Queue', ...tabs.keys()])][sheetId - 100];
      for (const row of grid(title)) if (row) row.splice(startIndex, 0, ...Array(endIndex - startIndex).fill(''));
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
Object.assign(baseEnv, env); globalThis.fetch = fakeFetch; // the website's own calls go to the fake sheet
const settle = () => new Promise(r => setTimeout(r, 400));
await DB.prepare("INSERT INTO portal_settings (key, value) VALUES ('supplier_sheet','1'),('supplier_sheet_layout','2') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
grid('Work Queue')[4] = ['Date'];
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
// first product: the tab is made, with its row
const old = (await call('/products', 'POST', { name: 'Old mug', link: 'https://www.etsy.com/listing/1', variant: 'White', photos: [photo] }, client)).data.product; await settle();
assert.ok(calls.includes('addSheet Product Quotes'), 'the tab is created on the first product');
const qt = grid('Product Quotes');
assert.deepEqual(qt[3].slice(0, 15), ['Requested', 'Request', 'Photo preview', 'Photo 2', 'Photo 3', 'Product link', 'Product name', 'Variation / notes', 'Expected per month', 'Price per item (USD)', 'Shipping per order (USD)', 'Available?', 'Supplier note', 'Status', 'Product ID']);
// a new price check from the client
const r = await call('/products', 'POST', { name: 'Blue Mountain Tray', link: 'https://www.etsy.com/listing/2', variant: 'Blue, 6 cups', expectedQuantity: 20, photos: [photo, photo] }, client); await settle();
assert.equal(r.status, 200, JSON.stringify(r.data)); const p = r.data.product;
const rowOf = pid => qt.findIndex(x => x && x[14] === String(pid));
const i = rowOf(p.id); assert.ok(i >= 4, 'row added'); assert.ok(rowOf(old.id) >= 4, 'first product has its row too');
assert.equal(qt[i][1], 'P-' + p.id); assert.match(qt[i][2], /^=IMAGE\("https:\/\/.+\/api\/portal\/sheet-product-photos\//); assert.match(qt[i][3], /Photo 2/);
assert.equal(qt[i][6], 'Blue Mountain Tray'); assert.equal(qt[i][8], 20); assert.equal(qt[i][13], 'Waiting for price');
assert.ok(!JSON.stringify(qt).includes('Local Client'), 'the supplier never sees who the client is');
// the signed photo link works without signing in; a wrong key does not
const link = /"(https:[^"]+)"/.exec(qt[i][2])[1].replace(/^https:\/\/[^/]+\/api\/portal/, 'http://localhost/api/portal');
const { handlePortal } = await import('../server/portal.mjs');
const get = async u => (await handlePortal(new Request(u), new URL(u), { DB, env, waitUntil: x => x })).status;
assert.equal(await get(link), 200, link); assert.equal(await get(link.replace(/key=.*/, 'key=wrong')), 404);
console.log('PASS client price check lands in the Product Quotes tab (no client name, photos open)');
// supplier types a price -> client sees supplier price + the client's fee per order; supplier price stays admin-only
await call('/admin/users/' + id, 'POST', { commissionPerOrder: '0.5' }, admin);
qt[i][9] = 12.4; let poll = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(poll.ok, JSON.stringify(poll)); assert.equal(poll.quotes.changed, 1);
let mine = (await call('/products', 'GET', null, client)).data.products.find(x => x.id === p.id);
assert.equal(mine.status, 'approved'); assert.equal(mine.unitPrice, 12.9); assert.equal(mine.supplierPrice, undefined, 'client never gets the supplier price');
assert.equal(qt[i][13], 'Quoted', 'status shown to the supplier');
poll = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(poll.quotes.changed, 0, 'applied once');
// not available, with a reason
const j = rowOf(old.id); qt[j][11] = 'Not available'; qt[j][12] = 'Out of stock until March';
poll = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(poll.quotes.changed, 1);
mine = (await call('/products', 'GET', null, client)).data.products.find(x => x.id === old.id);
assert.equal(mine.status, 'not_available'); assert.equal(mine.note, 'Out of stock until March');
// admin can still change a quote on the website: the sheet status follows, the supplier's columns are left alone
const aq = await call('/admin/products/' + p.id, 'POST', { status: 'approved', unitPrice: '15', note: '' }, admin); await settle(); assert.equal(aq.status, 200, JSON.stringify(aq.data));
assert.equal(qt[i][9], 12.4, 'supplier price untouched'); assert.equal((await call('/products', 'GET', null, client)).data.products.find(x => x.id === p.id).unitPrice, 15);
// junk in the price cell is ignored and reported
qt[i][9] = 'ask me'; poll = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(poll.quotes.skipped.length, 1);
console.log('PASS supplier price -> client quote (+ fee), not available with reason, admin override, junk ignored');
await pg.close();
