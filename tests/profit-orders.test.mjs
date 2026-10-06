import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Profitability lists every order with date, order number, product and profit', () => {
  const live = read('dist/p/live-sections.js');
  assert.match(live, /function orderListHTML/);
  assert.ok(live.includes("<th>${L('Date', 'תאריך')}</th><th>${L('Order #', 'מספר הזמנה')}</th>"));
  assert.match(live, /\+ orderListHTML\(groups\)/);
  assert.match(live, /data-ls="price"/);
  assert.match(live, /function readEtsyCsv/);
});

test('the date range applies to marketing, inventory, reports and value', () => {
  const live = read('dist/p/live-sections.js');
  assert.match(live, /rangeStoreOrders\(\)\.forEach\(o => \{ const k = \(o\.store/);
  assert.match(live, /if \(inRange\(o\.date\)\) c\.period \+= q/);
  assert.match(live, /rangeStoreOrders\(\)\.forEach\(o => \{\n      const d = dateOf\(o\.date\)/);
  assert.match(live, /portalOrders\.filter\(o => o\.status !== 'cancelled' && inRange/);
});

test('store API: product names from listing links, saved sale prices never override receipts', () => {
  const worker = read('server/worker.mjs');
  assert.match(worker, /function listingInfo/);
  assert.match(worker, /title:transaction\?\.title\|\|publicPrice\?\.title\|\|listing\?\.title\|\|'Etsy product'/);
  assert.match(worker, /\/api\/sale-prices/);
  assert.match(worker, /row\.priceSource==='receipt'\)return/);
  assert.match(worker, /SUPPLIER_CACHE_KEY='supplier-summary-v2'/);
});

test('Shopify order queries stay under the 1000-point query cost limit', () => {
  const worker = read('server/worker.mjs');
  assert.doesNotMatch(worker, /lineItems\(first: 50\)/);
  assert.match(worker, /query DirectLineOrderLines \{ orders\(first: 100[^']*lineItems\(first: 5\)/);
});
