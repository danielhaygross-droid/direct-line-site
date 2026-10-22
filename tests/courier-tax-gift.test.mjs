import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HEADERS, WIDTHS, websiteCells, addressLines, applySupplierRow, courierList, DEFAULT_COURIERS, SUPPLIER_SHEET_SCHEMA } from '../server/supplier-sheet.mjs';
import { SCHEMA, CUSTOMER_BODY_KEYS } from '../server/portal.mjs';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('sheet layout: Tax number and Gift message instead of Country, Courier between tracking and status', () => {
  assert.equal(HEADERS.length, 32); assert.equal(WIDTHS.length, 32); assert.deepEqual(HEADERS.slice(19, 22), ['Delayed?', 'Delay reason', 'Client paid'], 'T/U: delay, V: Client paid');
  assert.deepEqual(HEADERS.slice(10, 19), ['Delivery address & phone', 'Tax number', 'Gift message', 'Notes', 'Competitor price', 'Total cost (USD)', 'Tracking number', 'Courier', 'Shipping status']);
  assert.deepEqual(HEADERS.slice(-2), ['Order ID', 'Client ID']);
  const o = { id: 3, client_id: 1, order_date: '2026-10-14', status: 'processing', quantity: 1, buyer_name: 'L', address_line_1: '10 Rue\n34170 Castelnau', destination: 'FR', tax_number: 'IOSS IM3720000224', gift_message: '=Hi', notes: 'n', etsy_url: '' };
  const { am } = websiteCells({ APP_SESSION_SECRET: 'x' }, o, [], 'Shop');
  assert.equal(am.length, 15); assert.equal(am[14], '', 'O Competitor price (from the client)'); assert.equal(am[11], 'IOSS IM3720000224'); assert.equal(am[12], "'=Hi", 'a gift message never runs as a formula'); assert.equal(am[13], 'n');
});

test('the country goes at the end of the address unless the client already wrote it', () => {
  assert.equal(addressLines({ address_line_1: '10 Rue\n34170 Castelnau', destination: 'FR' }), '10 Rue\n34170 Castelnau\nFrance');
  assert.equal(addressLines({ address_line_1: '1 Main St\nAustin TX 78701\nUnited States\n(252) 622-0964', destination: 'US' }), '1 Main St\nAustin TX 78701\nUnited States\n(252) 622-0964');
  assert.equal(addressLines({ address_line_1: '1 Main St, Austin TX USA', destination: 'US' }), '1 Main St, Austin TX USA');
  assert.equal(addressLines({ address_line_1: 'Storgatan 1', destination: 'Sweden' }), 'Storgatan 1\nSweden', 'other countries are saved by name');
});

test('courier from the sheet: saved on the order once; cleared when the cell is emptied', async () => {
  const runs = [];
  const DB = { prepare: sql => ({ bind: (...args) => ({ run: async () => { runs.push([sql, args]); return {}; }, first: async () => null }) }) };
  const order = { id: 1, client_id: 2, commission: 2, price: 0, tracking_number: '', status: 'processing', sheet_cost: '', sheet_tracking: '', sheet_courier: '', courier: null, sheet_shipped: 'Not shipped' };
  let r = await applySupplierRow(DB, order, { cost: '', tracking: '', courier: 'Yanwen', shipped: 'Not shipped' }, 100);
  assert.deepEqual(r.done, ['courier']); assert.ok(runs.some(([sql, a]) => /SET courier=\?/.test(sql) && a[0] === 'Yanwen'));
  runs.length = 0;
  r = await applySupplierRow(DB, { ...order, courier: 'Yanwen', sheet_courier: 'Yanwen' }, { cost: '', tracking: '', courier: 'Yanwen', shipped: 'Not shipped' }, 101);
  assert.deepEqual(r.done, []); assert.equal(runs.length, 0);
  r = await applySupplierRow(DB, { ...order, courier: 'Yanwen', sheet_courier: 'Yanwen' }, { cost: '', tracking: '', courier: '', shipped: 'Not shipped' }, 102);
  assert.deepEqual(r.done, ['courier cleared']);
});

test('couriers list: China Post and Yanwen by default, one per line, no duplicates', () => {
  assert.deepEqual(courierList(undefined), ['China Post', 'Yanwen']); assert.equal(DEFAULT_COURIERS, 'China Post\nYanwen');
  assert.deepEqual(courierList('China Post\n Yanwen \n\n4PX\nYanwen'), ['China Post', 'Yanwen', '4PX']);
});

test('columns, editing rights and screens are wired up', async () => {
  for (const c of ['courier TEXT', 'sheet_courier TEXT']) assert.ok(SUPPLIER_SHEET_SCHEMA.some(s => s.includes(c)), c);
  for (const c of ['tax_number TEXT', 'gift_message TEXT']) assert.ok(SCHEMA.some(s => s.includes(c)), c);
  assert.ok(CUSTOMER_BODY_KEYS.includes('taxNumber') && CUSTOMER_BODY_KEYS.includes('giftMessage'), 'clients can change them until the parcel ships');
  const server = await read('server/portal.mjs'), portal = await read('dist/portal/portal.js'), admin = await read('dist/admin/admin.js'), i18n = await read('dist/p/i18n.js'), sheet = await read('server/supplier-sheet.mjs');
  assert.ok(server.includes('if (who.admin && body.courier !== undefined)'), 'only admins set the courier on the website');
  assert.ok(sheet.includes("if (h[12] === 'Notes')") && sheet.includes("if (h[16] === 'Shipping status')"), 'the switch checks the header first, so it is safe to retry');
  assert.ok(portal.includes('class="courier-tag"') && portal.includes('name="taxNumber"') && portal.includes('name="giftMessage"'));
  assert.ok(admin.includes('id="couriers-form"') && admin.includes('list="dl-couriers"') && admin.includes('courier: tf.courier.value'));
  for (const s of ['Courier', 'Couriers', 'Save couriers', 'Tax number', 'Gift message']) assert.ok(i18n.includes(`'${s}':`), s);
});
