import test from 'node:test';
import assert from 'node:assert/strict';
import { orderItems, itemsSummary, itemCostList, itemPrices } from '../server/portal.mjs';
import { websiteCells } from '../server/supplier-sheet.mjs';

test('order lines: each product / colour has its own link, quantity and colour; the order totals them', () => {
  const same = orderItems([{ link: 'www.etsy.com/listing/45/hooks', quantity: 3, variant: ' Black Walnut, 7 Hooks ' }, { link: 'https://www.etsy.com/listing/45/hooks', quantity: '2', variant: 'Beech, 5 Hooks' }]);
  assert.equal(same[0].link, 'https://www.etsy.com/listing/45/hooks', 'a link without https:// is completed');
  assert.deepEqual(itemsSummary(same), { etsyUrl: 'https://www.etsy.com/listing/45/hooks', quantity: 5, variant: '3 × Black Walnut, 7 Hooks\n2 × Beech, 5 Hooks' });
  const two = orderItems([{ link: 'https://a.example/x', quantity: 2, variant: '' }, { link: 'https://b.example/y', quantity: 1, variant: 'Red' }]);
  assert.deepEqual(itemsSummary(two), { etsyUrl: 'https://a.example/x\nhttps://b.example/y', quantity: 3, variant: 'Product 1:\n2 pcs\nProduct 2:\n1 × Red' }, 'two products: grouped, numbered like their links');
  assert.deepEqual(itemsSummary(orderItems([{ link: 'https://a.example/x', quantity: 4, variant: 'Gold' }])), { etsyUrl: 'https://a.example/x', quantity: 4, variant: 'Gold' }, 'one line = as before');
  assert.equal(orderItems(undefined), null, 'no lines sent: the order fields are used as they are');
  for (const bad of [[], Array(11).fill({ link: 'https://a.example', quantity: 1 }), [{ link: 'https://a.example', quantity: 0 }], [{ link: 'https://a.example', quantity: 1.5 }], [{ link: 'https://a.example', quantity: 1000 }]])
    assert.throws(() => orderItems(bad));
  assert.throws(() => orderItems([{ link: 'https://a.example', quantity: 1 }, { link: 'https://a.example', quantity: 'x' }]), /product 2/);
});

test('supplier sheet: Qty is the total, Product / variation lists each line', () => {
  const s = itemsSummary(orderItems([{ link: 'https://www.etsy.com/listing/45/hooks', quantity: 3, variant: 'Black Walnut, 7 Hooks' }, { link: 'https://www.etsy.com/listing/45/hooks', quantity: 2, variant: 'Beech, 5 Hooks' }]));
  const { am } = websiteCells({}, { id: 1, client_id: 2, order_ref: 'E-1', order_date: '2026-10-22', status: 'pending', created_at: 1, etsy_url: s.etsyUrl, quantity: s.quantity, variant: s.variant, item_title: '' }, [], 'Shop');
  assert.equal(am[7], 5);
  // A leading ' keeps text that starts with a number as text in Google Sheets (the cell shows "3 × Black Walnut…").
  assert.equal(am[8], "'3 × Black Walnut, 7 Hooks\n2 × Beech, 5 Hooks");
});
test('cost per product: the supplier may separate the costs with Chinese commas', () => {
  assert.deepEqual(itemCostList('27.9\u300121.9\u300131.9'), [27.9, 21.9, 31.9], 'Ada wrote 27.9、21.9、31.9 on #4211752986');
  assert.deepEqual(itemCostList('10.90\uff0c9\uff1b11'), [10.9, 9, 11]);
  assert.deepEqual(itemCostList('Product 1: 10.90, Product 2: 9.00'), [10.9, 9]);
  assert.deepEqual(itemPrices({ etsy_url: 'https://a.example/1\nhttps://b.example/2\nhttps://c.example/3', item_costs: '27.9\u300121.9\u300131.9', price: 82.4 }), [28.14, 22.09, 32.17]);
});
