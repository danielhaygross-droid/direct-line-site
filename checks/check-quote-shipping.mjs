// Local check: Product Quotes gets a Shipping per order column. The old (live) layout is switched once, values move right, then shipping reaches the client and order totals. Fake Google Sheet + real SQL.
// The fake sheet is the same as in check-courier-sheet.mjs.
//   node checks/check-quote-shipping.mjs      (run from the repo root)
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
Object.assign(baseEnv, env); globalThis.fetch = fakeFetch;
await call('/admin/users/' + id, 'POST', { commissionPerOrder: '0.5' }, admin);
const png = await readFile(new URL('./fixtures/en-1440-light-agreement.png', import.meta.url));
const photo = { filename: 'p.png', data: 'data:image/png;base64,' + png.toString('base64') };
// Products sent while the sheet is off; then the live situation: the tab already exists in the OLD 14-column layout.
const a = (await call('/products', 'POST', { name: 'Brass hooks', link: 'https://detail.1688.com/offer/1', variant: 'Black', photos: [photo] }, client)).data.product;
const b = (await call('/products', 'POST', { name: 'Wall rack', link: 'https://detail.1688.com/offer/2', variant: 'Oak', photos: [photo] }, client)).data.product;
const OLD = ['Requested', 'Request', 'Photo preview', 'Photo 2', 'Photo 3', 'Product link', 'Product name', 'Variation / notes', 'Expected per month', 'Price per item (USD)', 'Available?', 'Supplier note', 'Status', 'Product ID'];
const qt = grid('Product Quotes'); qt[0] = ['Direct Line - Product Quotes']; qt[1] = ['old help']; qt[3] = [...OLD];
qt[4] = ['2026-10-15', 'P-' + a.id, '', '', '', '', 'Brass hooks', 'Black', '', 4.9, '', 'ships in 3 days', 'Quoted', String(a.id)];
qt[5] = ['2026-10-15', 'P-' + b.id, '', '', '', '', 'Wall rack', 'Oak', '', '', 'Not available', 'Out of stock', 'Not available', String(b.id)];
await DB.prepare("UPDATE portal_products SET status='approved', unit_price=5.4, supplier_price=4.9, note='ships in 3 days', sheet_price='4.9', sheet_status='', sheet_note='ships in 3 days' WHERE id=?").bind(a.id).run();
await DB.prepare("UPDATE portal_products SET status='not_available', note='Out of stock', sheet_price='', sheet_status='Not available', sheet_note='Out of stock' WHERE id=?").bind(b.id).run();
await DB.prepare("INSERT INTO portal_settings (key, value) VALUES ('supplier_sheet','1'),('supplier_sheet_layout','2'),('quote_tab','1'),('quote_tab_options_v1','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
grid('Work Queue')[4] = ['Date'];
let poll = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.ok(poll.ok, JSON.stringify(poll));
assert.deepEqual(qt[3].slice(9, 15), ['Price per item (USD)', 'Shipping per order (USD)', 'Available?', 'Supplier note', 'Status', 'Product ID']);
assert.deepEqual(qt[4].slice(9, 15), [4.9, '', '', 'ships in 3 days', 'Quoted', String(a.id)], 'supplier values moved one column right');
assert.deepEqual(qt[5].slice(9, 15), ['', '', 'Not available', 'Out of stock', 'Not available', String(b.id)]);
assert.equal(poll.quotes.changed, 0, 'nothing re-priced by the switch'); assert.match(String(qt[1][0]), /Shipping per order/);
const inserts = calls.filter(c => c.startsWith('insert')).length;
assert.equal(inserts, 1);
poll = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(calls.filter(c => c.startsWith('insert')).length, inserts, 'switched once');
console.log('PASS live layout switched once: column K inserted, values moved right, nothing re-priced');
// Ada types the shipping: the client sees it as is; an order adds it once.
qt[4][10] = 3.25; poll = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(poll.quotes.changed, 1);
const mine = (await call('/products', 'GET', null, client)).data.products.find(x => x.id === a.id);
assert.equal(mine.unitPrice, 5.4); assert.equal(mine.shipping, 3.25);
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
const o = await call('/orders', 'POST', { storeId: store.id, productId: a.id, quotedUnitPrice: 5.4, quotedShipping: 3.25, quantity: 3, orderRef: 'SHIP-1', buyerName: 'Sample', address1: '1 Main St', destination: 'US' }, client);
assert.equal(o.status, 200, JSON.stringify(o.data)); assert.equal(o.data.order.price, 19.45, '3 x 5.40 + 3.25'); assert.equal(o.data.order.quotedShipping, 3.25);
const stale = await call('/orders', 'POST', { storeId: store.id, productId: a.id, quotedUnitPrice: 5.4, quotedShipping: 2, orderRef: 'SHIP-2', buyerName: 'Sample', address1: '1 Main St', destination: 'US' }, client);
assert.equal(stale.status, 409, 'old shipping refused');
const ed = await call(`/orders/${o.data.order.id}`, 'PUT', { quantity: 2 }, client); assert.equal(ed.status, 200, JSON.stringify(ed.data)); assert.equal(ed.data.order.price, 14.05, '2 x 5.40 + 3.25 after an edit');
qt[4][10] = 'ask'; poll = await pollSupplierSheet(DB, env, { fetchImpl: fakeFetch }); assert.equal(poll.quotes.skipped.length, 1); assert.match(String(qt[4][13]), /Shipping not clear/);
console.log('PASS shipping per order: passed on as is, added once to orders (also after edits), stale and unclear values refused');
await pg.close();
