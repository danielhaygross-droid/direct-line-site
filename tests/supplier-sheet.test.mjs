import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCost, websiteCells, applySupplierRow, HEADERS, SUPPLIER_SHEET_SCHEMA, SHIPPED } from '../server/supplier-sheet.mjs';
import { SCHEMA } from '../server/portal.mjs';

test('supplier cost accepts normal money formats and refuses anything else', () => {
  for (const [input, out] of [[12.5, 12.5], ['12.50', 12.5], ['$1,234.5', 1234.5], ['12,50', 12.5], [' 30 USD ', 30], ['0', 0]]) assert.equal(parseCost(input), out, String(input));
  for (const bad of ['abc', '-5', -5, '', '12.5.1', '1e5', 1e7, NaN]) assert.equal(parseCost(bad), null, String(bad));
});

test('Work Queue cells: website columns only, client text can never run as a formula', () => {
  const o = { id: 7, client_id: 3, order_ref: '=IMPORTXML("x")', order_date: '2026-10-11', status: 'processing', quantity: 2, item_title: 'Mug', variant: '+Gold',
    buyer_name: '@me', address_line_1: '1030 Winterton St', buyer_phone: '+1 555', destination: 'US', notes: '-note', etsy_url: 'https://a.com/x"y\nhttps://b.com/z' };
  const { am, qz } = websiteCells({ APP_SESSION_SECRET: 's' }, o, [{ id: 9 }], 'Client "A"');
  assert.equal(am.length + 7 + qz.length + 2, HEADERS.length, 'A–O (O = Competitor price) + 7 supplier columns (P–V) + W–AG (W = Client paid) + AH, AI (supplier only)');
  assert.equal(am[1], "'=IMPORTXML(\"x\")"); assert.equal(am[8], 'Mug · +Gold'); assert.equal(am[9], "'@me"); assert.equal(am[13], "'-note");
  assert.equal(am[0], "'2026-10-11", 'date stays text'); assert.equal(am[3], 'In Progress');
  assert.match(am[6], /^=HYPERLINK\("https:\/\/a\.com\/x""y","Open product 1"\)$/, 'quotes in links are escaped; numbered when there are several');
  assert.match(am[4], /^=IMAGE\("https?:/); assert.equal(qz.at(-2), '7'); assert.equal(qz.at(-1), '3'); assert.equal(qz[8], 'Product 2: https://b.com/z'); assert.equal(qz[0], '', 'Client paid: nothing billed yet');
  assert.equal(websiteCells({ APP_SESSION_SECRET: 's' }, { ...o, client_paid: 'Paid' }, [], '').qz[0], 'Paid');
  assert.deepEqual(HEADERS.slice(11, 20), ['Tax number', 'Gift message', 'Notes', 'Competitor price', 'Total cost (USD)', 'Cost per product (USD)', 'Tracking number', 'Courier', 'Shipping status']);
  assert.ok(!HEADERS.includes('Country'), 'the country is in the address instead');
});

test('supplier columns are added after client_orders is created; the cron runs every minute', async () => {
  for (const sql of SUPPLIER_SHEET_SCHEMA) assert.ok(SCHEMA.indexOf(sql) > SCHEMA.findIndex(s => /CREATE TABLE IF NOT EXISTS client_orders\b/.test(s)));
  const crons = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url))).crons;
  assert.deepEqual(crons.find(c => c.path === '/api/cron/supplier-sheet'), { path: '/api/cron/supplier-sheet', schedule: '* * * * *' });
});

test('applying a row: bill = supplier total + fee; same values twice change nothing; fixed quotes keep their price', async () => {
  const runs = [];
  const DB = { prepare: sql => ({ bind: (...args) => ({ run: async () => { runs.push([sql, args]); return {}; }, first: async () => null }) }) };
  const order = { id: 1, client_id: 2, commission: 2, price: 0, product_cost: null, quoted_unit_price: null, tracking_number: '', status: 'pending', sheet_cost: '', sheet_tracking: '', sheet_shipped: 'Not shipped' };
  let r = await applySupplierRow(DB, order, { cost: 12.5, tracking: '', shipped: 'Not shipped' }, 100);
  assert.deepEqual(r.done, ['billed 14.50']);
  assert.ok(runs.some(([sql, a]) => /SET supplier_cost=\?, product_cost=\?, shipping_fee=NULL, price=\?/.test(sql) && a[0] === 12.5 && a[2] === 14.5));
  assert.ok(runs.some(([sql, a]) => /INSERT INTO order_events/.test(sql) && a[2] === 'billed' && a[3] === 'admin' && a[4] === '14.50'));
  runs.length = 0;
  r = await applySupplierRow(DB, { ...order, sheet_cost: '12.5', price: 14.5, product_cost: 14.5 }, { cost: 12.5, tracking: '', shipped: 'Not shipped' }, 101);
  assert.deepEqual(r, { done: [], skipped: [] }); assert.equal(runs.length, 0, 'nothing written when nothing changed');
  r = await applySupplierRow(DB, { ...order, quoted_unit_price: 9 }, { cost: 30, tracking: '', shipped: 'Not shipped' }, 102);
  assert.deepEqual(r.done, ['cost recorded (fixed quote)']);
  assert.ok(!runs.some(([sql]) => /price=\?/.test(sql)), 'fixed-quote price untouched');
  r = await applySupplierRow(DB, { ...order, archived: true }, { cost: 1, tracking: 'X', shipped: SHIPPED }, 103);
  assert.deepEqual(r, { done: [], skipped: ['archived'] });
});

test('clients never receive the supplier cost; admin order panel and client notices show it the right way', async () => {
  const portal = await readFile(new URL('../server/portal.mjs', import.meta.url), 'utf8');
  assert.match(portal, /const CLIENT_HIDDEN = \[[^\]]*'supplierCost'/);
  const client = await readFile(new URL('../dist/portal/portal.js', import.meta.url), 'utf8'), i18n = await readFile(new URL('../dist/p/i18n.js', import.meta.url), 'utf8');
  assert.ok(client.includes("e.kind === 'billed'") && client.includes('<span>Per item</span>'));
  for (const s of ['Order billed', 'Per item', 'Supplier sheet', 'Set up supplier sheet']) assert.ok(i18n.includes(`'${s}':`), s);
  const admin = await readFile(new URL('../dist/admin/admin.js', import.meta.url), 'utf8');
  assert.ok(admin.includes("'/admin/supplier-sheet/setup'") && admin.includes('Supplier total'));
});

test('rows grow to fit wrapped text (min 100 px for the photo); widths cover every column', async () => {
  const { rowPx, WIDTHS } = await import('../server/supplier-sheet.mjs');
  assert.equal(WIDTHS.length, HEADERS.length);
  const base = ["'2026-10-12", '#1', 'Shop', 'Pending', '=IMAGE("x")', '=HYPERLINK("x")', '=HYPERLINK("y")', 1, 'Black', 'Jo', 'Jo\n1 St\nCity', 'US', ''];
  assert.equal(rowPx(base), 100);
  const tall = [...base]; tall[10] = 'Name\n560 W North St\n6302509070\nITASCA, IL 60143\nUnited States\n(630) 460-2007';
  assert.ok(rowPx(tall) > 100, 'six-line address gets a taller row');
  const notes = [...base]; notes[12] = 'x'.repeat(2000);
  assert.equal(rowPx(notes), 600, 'capped');
  const src = await readFile(new URL('../server/supplier-sheet.mjs', import.meta.url), 'utf8');
  assert.match(src, /startRowIndex: 4, startColumnIndex: 0, endColumnIndex: C.CLIENT \+ 1 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'CENTER' }/, 'row 5 down: wrapped and centred');
});
