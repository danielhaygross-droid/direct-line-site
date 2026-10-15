import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePriceOptions, applyQuoteRow, PRICE_UNCLEAR } from '../server/quote-sheet.mjs';
import { priceOptions } from '../server/products.mjs';

test('price cell: one price, or several options one per line / ; / |', () => {
  assert.deepEqual(parsePriceOptions(3.2), { price: 3.2 });
  assert.deepEqual(parsePriceOptions('$12'), { price: 12 });
  assert.deepEqual(parsePriceOptions('Small: 3.20\nLarge: 4.50'), { options: [{ label: 'Small', price: 3.2 }, { label: 'Large', price: 4.5 }] });
  assert.deepEqual(parsePriceOptions('Red 3.2; Blue - $4,50'), { options: [{ label: 'Red', price: 3.2 }, { label: 'Blue', price: 4.5 }] });
  assert.deepEqual(parsePriceOptions('S/M = 5 | L/XL = 6.5'), { options: [{ label: 'S/M', price: 5 }, { label: 'L/XL', price: 6.5 }] });
  assert.deepEqual(parsePriceOptions('Size 2: 4'), { price: 4 }, 'one option is just one price');
  assert.deepEqual(parsePriceOptions('3\n4').options.map(o => o.label), ['Option 1', 'Option 2']);
  for (const bad of ['ask', 'Small: 3\nsmall: 4', 'Small: 3\nLarge: soon', '-1']) assert.equal(parsePriceOptions(bad), null, bad);
});

test('options from the sheet: each option + the client fee; product price = the cheapest ("from")', async () => {
  const runs = [], DB = { prepare: sql => ({ bind: (...a) => ({ run: async () => { runs.push([sql, a]); return {}; } }) }) };
  const p = { id: 1, client_id: 2, status: 'awaiting_quote', unit_price: null, supplier_price: null, note: '', sheet_price: '', sheet_status: '', sheet_note: '', commission_per_order: 0.5, price_options: null };
  assert.equal(await applyQuoteRow(DB, p, { price: 'Small: 3.20\nLarge: 4.50', status: '', note: '' }, {}), 'approved');
  const set = runs.find(([s]) => /price_options=\?/.test(s))[1];
  assert.equal(set[1], 3.7); assert.equal(set[2], 3.2);
  assert.deepEqual(JSON.parse(set[4]), [{ label: 'Small', supplier: 3.2, unit: 3.7 }, { label: 'Large', supplier: 4.5, unit: 5 }]);
  // Back to one price clears the options.
  runs.length = 0;
  assert.equal(await applyQuoteRow(DB, { ...p, status: 'approved', unit_price: 3.7, supplier_price: 3.2, price_options: set[4], sheet_price: 'x' }, { price: 4, status: '', note: '' }, {}), 'approved');
  assert.equal(runs.find(([s]) => /price_options=\?/.test(s))[1][4], null);
  // Unclear text: nothing priced, the reason comes back (the cron writes it in the Status column).
  assert.match(await applyQuoteRow(DB, p, { price: 'Small: soon', status: '', note: '' }, {}), /^price not clear/);
  assert.match(PRICE_UNCLEAR, /one per line/);
});

test('clients get option prices, never supplier prices', () => {
  const raw = JSON.stringify([{ label: 'Small', supplier: 3.2, unit: 3.7 }]);
  assert.deepEqual(priceOptions(raw), [{ label: 'Small', unitPrice: 3.7 }]);
  assert.deepEqual(priceOptions(raw, true), [{ label: 'Small', unitPrice: 3.7, supplierPrice: 3.2 }]);
  assert.equal(priceOptions(null), null); assert.equal(priceOptions('bad'), null);
});

test('wired up: order needs an option, sheet switch runs once, screens show options', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const portal = await read('../server/portal.mjs'), sheet = await read('../server/quote-sheet.mjs'), products = await read('../server/products.mjs');
  assert.ok(portal.includes("Choose which option of this product the customer bought.") && portal.includes('f.quoted_unit_price=unit;'));
  assert.ok(sheet.includes('await ensureQuoteOptionsFormat(DB, env, fetchImpl);') && !sheet.includes("type: 'NUMBER_GREATER_THAN_EQ'"), 'price cell accepts text');
  assert.ok(products.includes('price_options=NULL'), 'an admin price replaces the options');
  const client = await read('../dist/portal/portal.js'), admin = await read('../dist/admin/admin.js'), he = await read('../dist/p/i18n.js');
  assert.ok(client.includes('name="productOption"') && client.includes('class="price-options"') && admin.includes('Several prices from the sheet'));
  for (const s of ['Which option did the customer buy?', 'Choose an option…', 'Saving a price here replaces the options with one price.']) assert.ok(he.includes(`'${s}':`), s);
});
