import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { QUOTE_HEADERS, QUOTE_WIDTHS, quoteCells, parsePrice, applyQuoteRow, QUOTE_SHEET_SCHEMA } from '../server/quote-sheet.mjs';
import { SCHEMA } from '../server/portal.mjs';

test('Product Quotes tab: website columns, supplier columns, no client name, text never runs as a formula', () => {
  assert.equal(QUOTE_HEADERS.length, 16); assert.equal(QUOTE_WIDTHS.length, 16);
  assert.deepEqual(QUOTE_HEADERS.slice(9, 16), ['Price per item (USD)', 'Shipping per order (USD)', 'Available?', 'Supplier note', 'Competitor price', 'Status', 'Product ID']);
  const { ai, no } = quoteCells({ APP_SESSION_SECRET: 's' }, { id: 7, created_at: 1800000000, name: '=cmd', variant: '+x', link: 'https://e.com/a"b', expected_quantity: 3, status: 'awaiting_quote' }, [4, 5]);
  assert.equal(ai.length, 9); assert.equal(ai[1], 'P-7'); assert.equal(ai[6], "'=cmd"); assert.equal(ai[7], "'+x");
  assert.match(ai[2], /^=IMAGE\("https:\/\/.+\/sheet-product-photos\/7\/4\?key=/); assert.match(ai[5], /a""b/);
  assert.deepEqual(no, ['Waiting for price', '7']);
});

test('supplier price: money formats, then client price = supplier price + client fee; not available needs no price', async () => {
  for (const [v, n] of [[12.4, 12.4], ['$12.40', 12.4], ['12,4', 12.4], ['ask', null], ['-1', null]]) assert.equal(parsePrice(v), n, String(v));
  const runs = [], DB = { prepare: sql => ({ bind: (...a) => ({ run: async () => { runs.push([sql, a]); return {}; } }) }) };
  const p = { id: 1, client_id: 2, status: 'awaiting_quote', unit_price: null, supplier_price: null, note: '', sheet_price: '', sheet_status: '', sheet_note: '', commission_per_order: 0.5 };
  assert.equal(await applyQuoteRow(DB, p, { price: 12.4, status: '', note: '' }, { commission_per_order: '2' }), 'approved');
  assert.ok(runs.some(([s, a]) => /SET status=\?, unit_price=\?, supplier_price=\?/.test(s) && a[0] === 'approved' && a[1] === 12.9 && a[2] === 12.4));
  runs.length = 0;
  assert.equal(await applyQuoteRow(DB, { ...p, commission_per_order: null }, { price: 10, status: '', note: '' }, { commission_per_order: '2' }), 'approved');
  assert.equal(runs.find(([s]) => /SET status=/.test(s))[1][1], 12, 'default fee when the client has none');
  assert.equal(await applyQuoteRow(DB, p, { price: '', status: 'Not available', note: 'Out of stock' }, {}), 'not_available');
  assert.equal(await applyQuoteRow(DB, { ...p, sheet_price: '12.4' }, { price: 12.4, status: '', note: '' }, {}), null, 'same cells twice: nothing');
});

test('wired up: schema, signed photo route, sync on new product and admin quote, cron, screens', async () => {
  for (const s of QUOTE_SHEET_SCHEMA) assert.ok(SCHEMA.indexOf(s) > SCHEMA.findIndex(x => /CREATE TABLE IF NOT EXISTS portal_products\b/.test(x)), s);
  const portal = await readFile(new URL('../server/portal.mjs', import.meta.url), 'utf8'), sheet = await readFile(new URL('../server/supplier-sheet.mjs', import.meta.url), 'utf8');
  assert.ok(portal.includes('serveSheetProductPhoto(DB,env,url') && (portal.match(/syncQuoteRow\(DB,env,product\.id\)/g) || []).length === 2);
  assert.ok(sheet.includes('result.quotes = await pollQuoteTab('));
  const products = await readFile(new URL('../server/products.mjs', import.meta.url), 'utf8');
  assert.ok(products.includes('...(clientId===null?{supplierPrice:'), 'only admins get the supplier price');
  const client = await readFile(new URL('../dist/portal/portal.js', import.meta.url), 'utf8'), admin = await readFile(new URL('../dist/admin/admin.js', import.meta.url), 'utf8');
  assert.ok(client.includes('<small class="dim">per item</small>${shipLine(p)}') && !client.includes('shipping not included'), 'client sees the price per item and the shipping per order');
  assert.ok(admin.includes('Supplier price from the sheet:'));
});

test('shipping per order: read from column K, passed on as is, added once to an order; the live tab switches once', async () => {
  const { applyQuoteRow, SHIPPING_UNCLEAR } = await import('../server/quote-sheet.mjs');
  const runs = [], DB = { prepare: sql => ({ bind: (...a) => ({ run: async () => { runs.push([sql, a]); return {}; } }) }) };
  const p = { id: 1, client_id: 2, status: 'awaiting_quote', unit_price: null, supplier_price: null, supplier_shipping: null, note: '', sheet_price: '', sheet_shipping: '', sheet_status: '', sheet_note: '', commission_per_order: 0.5, price_options: null };
  assert.equal(await applyQuoteRow(DB, p, { price: 5.4, shipping: 3.25, status: '', note: '' }, {}), 'approved');
  const set = runs.find(([q]) => /supplier_shipping=\?/.test(q))[1];
  assert.equal(set[1], 5.9, 'fee on the price per item'); assert.equal(set[5], 3.25, 'shipping passed on as is');
  runs.length = 0;
  assert.equal(await applyQuoteRow(DB, { ...p, status: 'approved', unit_price: 5.9, supplier_price: 5.4, supplier_shipping: 3.25, sheet_price: '5.4', sheet_shipping: '3.25' }, { price: 5.4, shipping: 4, status: '', note: '' }, {}), 'approved', 'a shipping change alone is applied');
  assert.match(await applyQuoteRow(DB, p, { price: 5.4, shipping: 'soon', status: '', note: '' }, {}), /^shipping not clear/);
  assert.match(SHIPPING_UNCLEAR, /Shipping not clear/);
  const sheet = await readFile(new URL('../server/quote-sheet.mjs', import.meta.url), 'utf8'), portal = await readFile(new URL('../server/portal.mjs', import.meta.url), 'utf8');
  assert.ok(sheet.includes("insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }") && sheet.includes("if (k4 !== 'Available?') throw new Error("), 'one inserted column, and only on the old layout');
  assert.ok((sheet.match(/await ensureQuoteLayout\(DB, env, fetchImpl\);/g) || []).length === 2, 'switched before reading or writing rows');
  assert.ok(portal.includes('f.price=round2(f.quoted_unit_price*f.quantity+(ship||0));') && portal.includes('Number(existing.quoted_shipping||0)'), 'shipping added once, also after edits');
});
