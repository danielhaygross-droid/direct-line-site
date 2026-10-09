import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Daniel stores and Direct Line clients are separate in both dashboards', () => {
  const en = read('dist/en/index.html');
  const he = read('dist/index.html');
  const bridge = read('dist/p/clients-section.js');

  assert.match(en, /Daniel’s stores/);
  assert.match(en, /Direct Line clients/);
  assert.match(he, /החנויות של דניאל/);
  assert.match(he, /לקוחות Direct Line/);
  assert.doesNotMatch(bridge, /data-dl-clients|loadClients/);
});

test('order and product tables show dates and order numbers in both languages', () => {
  const en = read('dist/en/index.html');
  const he = read('dist/index.html');

  assert.match(en, /<th>Order #<\/th><th>Date<\/th><th>Store<\/th>/);
  assert.match(en, /<th>Last order<\/th>/);
  assert.match(he, /<th>מספר הזמנה<\/th><th>תאריך<\/th><th>חנות<\/th>/);
  assert.match(he, /<th>הזמנה אחרונה<\/th>/);
});

test('live integrations request Shopify line items and Etsy receipts', () => {
  const worker = read('server/worker.mjs');
  const enApp = read('dist/en/app.js');

  assert.match(worker, /lineItems\(first: 5\)/);
  assert.match(worker, /\/receipts\?limit=100&offset=/);
  assert.match(worker, /grant_type:'refresh_token'/);
  assert.match(enApp, /Actual Etsy receipt/);
  assert.match(enApp, /Shopify paid order/);
});

test('client order form captures Etsy sale details and leaves fulfilment to admins', () => {
  const portal = read('dist/portal/portal.js');
  const server = read('server/portal.mjs');
  const form = portal.slice(portal.indexOf('function viewForm()'), portal.indexOf('function bindForm()'));

  assert.match(form, /Order date/);
  assert.match(form, /Customer paid/);
  assert.match(form, /Customer name/);
  assert.match(form, /Color, size or engraving/);
  assert.doesNotMatch(form, /name=\\?"(?:trackingNumber|weightKg|productCost|price)\\?"/);
  assert.match(server, /f\.tracking_number = ''; f\.category = ''; f\.weight_kg = null/);
  assert.match(server, /f\.product_cost = null; f\.shipping_fee = null; f\.price = 0/);
});
