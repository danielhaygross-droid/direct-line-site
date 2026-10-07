import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../dist/p/etsy-import.js', import.meta.url), 'utf8'), ctx);
const { build, parseCsv, isoDate } = ctx.DLEtsyImport;
const file = n => ({ name: n, text: readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8') });
const COUNTRIES = [['US', 'United States'], ['UK', 'United Kingdom'], ['FR', 'France'], ['CA', 'Canada']];

test('CSV parser handles quotes, commas, doubled quotes and BOM', () => {
  assert.equal(JSON.stringify(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\n')), JSON.stringify([['a', 'b'], ['x, y', 'say "hi"']]));
  assert.equal(isoDate('10/05/26'), '2026-10-05');
  assert.equal(isoDate('1/9/2026'), '2026-01-09');
  assert.equal(isoDate('13/01/26'), '');
});

test('Order Items file becomes one order per Etsy order, with links, address and quantities', () => {
  const r = build([file('etsy-order-items.csv'), file('etsy-orders.csv')], { countries: COUNTRIES, existingRefs: ['3481100502'] });
  assert.equal(r.problem, null);
  assert.equal(r.orders.length, 5);
  const two = r.orders.find(o => o.orderRef === '3480012298');
  assert.equal(two.etsyUrl, 'https://www.etsy.com/listing/2222222222\nhttps://www.etsy.com/listing/3333333333');
  assert.equal(two.quantity, 3);
  assert.equal(two.destination, 'UK');
  assert.equal(two.sellingPrice, 88.5); // 2×25 + 30 + 8.50 shipping
  assert.equal(two.address1, '22 King Street\nLeeds, LS1 2HL');
  const emma = r.orders.find(o => o.orderRef === '3480012211');
  assert.equal(emma.sellingPrice, 45.99); // Orders file: total 49.19 − tax 3.20
  assert.equal(emma.orderDate, '2026-10-05');
  assert.equal(r.orders.find(o => o.orderRef === '3481100457').shippedOnEtsy, true);
  const noLink = r.orders.find(o => o.orderRef === '3481100502');
  assert.deepEqual([...noLink.missing], ['product link']);
  assert.equal(noLink.alreadyImported, true);
});

test('wrong files are explained instead of imported', () => {
  assert.equal(build([file('etsy-orders.csv')]).problem, 'orders-only');
  assert.equal(build([{ name: 'x.csv', text: 'a,b\n1,2' }]).problem, 'not-etsy');
});
