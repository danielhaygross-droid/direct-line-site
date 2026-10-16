import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('the client orders tables show Earned (after Etsy fee), Cost and Profit without opening the order', async () => {
  const portal = await read('dist/portal/portal.js');
  assert.ok(portal.includes('<th class="num" title="What you earned on Etsy after Etsy’s fees">Earned</th><th class="num" title="What you pay Direct Line">Cost</th><th class="num" title="Earned minus cost">Profit</th>'));
  assert.ok(!portal.includes('<th class="num">Customer paid</th>'), 'the old single "Customer paid" header is replaced');
  // Every row carries all three, in both the full Orders list and the short Home list.
  for (const label of ['data-label="Earned"', 'data-label="Cost"', 'data-label="Profit"']) assert.ok(portal.includes(label), label);
  assert.ok(portal.includes("${compact ? '' : '<th>Destination</th><th>Tracking</th>'}"), 'the Home list drops Destination and Tracking to make room');
  // What the numbers mean.
  assert.ok(portal.includes("o.status === 'cancelled' ? '<span class=\"dim\">—</span>' : !o.priced ? '<span class=\"dim\">Pending</span>' : `<b>${money(o.price)}</b>`"), 'cost: the bill, "Pending" until billed, "—" when cancelled');
  assert.ok(portal.includes("profitOf(o) == null ? '<span class=\"dim\">—</span>' : `<b>${money(profitOf(o))}</b>`"), 'profit is a dash without the Etsy earnings');
  assert.ok(portal.includes('Customer paid'), 'the order panel and the order form keep "Customer paid"');
});

test('the internal parts of the cost never reach the client', async () => {
  const server = await read('server/portal.mjs');
  assert.ok(server.includes("const CLIENT_HIDDEN = ['addressChangedAt', 'commission', 'supplierShare', 'ourShare', 'sheetSyncStatus', 'sheetSyncedAt', 'sheetSyncError', 'productCost', 'shippingFee', 'supplierCost', 'priceSource'];"));
  assert.ok(server.includes('profit: earnedAfterFee(r) === null ? null : round2(earnedAfterFee(r) - price)'));
});

test('Hebrew exists for the new headers and tooltips', async () => {
  const i18n = await read('dist/p/i18n.js');
  for (const s of ['Earned', 'Cost', 'Profit', 'What you earned on Etsy after Etsy’s fees', 'What you pay Direct Line', 'Earned minus cost']) assert.ok(i18n.includes(`'${s}':`), s);
});
