import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server/portal.mjs', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../dist/portal/portal.js', import.meta.url), 'utf8');

test('client order responses never include the product/shipping breakdown', () => {
  const hidden = server.match(/const CLIENT_HIDDEN = \[([^\]]+)\]/)[1];
  for (const k of ['productCost', 'shippingFee', 'commission', 'supplierShare', 'ourShare']) assert.ok(hidden.includes(`'${k}'`), k);
  assert.ok(server.includes('rows.map(orderOut).map(clientOrder)'), 'client order list uses clientOrder');
  assert.equal((server.match(/who\.admin \? out : clientOrder\(out\)/g) || []).length, 2, 'create + edit responses use clientOrder');
});

test('client portal shows the total only', () => {
  assert.ok(!/productCost|shippingFee|Shipping fee|Product cost/.test(portal));
  assert.ok(!/shipping cost|shipping fee/i.test(portal.replace(/On Etsy: Orders &amp; Shipping/g, '')));
  assert.ok(portal.includes('Sale &amp; cost'));
});
