import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { productKey, variantKey, SAVED_PRICE_SCHEMA } from '../server/saved-prices.mjs';
import { savedPriceFlag } from '../server/supplier-sheet.mjs';
import { SCHEMA } from '../server/portal.mjs';

test('the same Etsy listing is recognised however the link is written', () => {
  const k = 'etsy:111222333';
  for (const l of ['https://www.etsy.com/listing/111222333/black-bag?ref=shop_home', 'https://etsy.com/il-en/listing/111222333', 'https://www.etsy.com/listing/111222333?utm_source=x#reviews']) assert.equal(productKey(l), k, l);
  assert.equal(productKey('https://www.etsy.com/listing/999'), 'etsy:999');
  assert.equal(productKey('https://Shop.Example.com/item/5/?x=1'), 'shop.example.com/item/5');
  assert.equal(productKey('https://www.etsy.com/listing/2 https://www.etsy.com/listing/1'), 'etsy:1|etsy:2', 'several products: order does not matter');
  assert.equal(productKey(''), '');
  assert.equal(variantKey(' Black ', 'x'), 'black'); assert.equal(variantKey('Blue, 6 cups'), 'blue 6 cups'); assert.equal(variantKey('', 'Mug'), 'mug');
});

test('the supplier is told when the cost was filled in from an earlier order', () => {
  assert.match(savedPriceFlag({ price_source: 'saved', status: 'pending' }), /^Total cost filled in from an earlier order/);
  for (const o of [{ price_source: null, status: 'pending' }, { price_source: 'saved', status: 'shipped' }]) assert.equal(savedPriceFlag(o), '');
});

test('wired up: table, new orders priced, supplier cost remembered, admin tab', async () => {
  for (const s of SAVED_PRICE_SCHEMA) assert.ok(SCHEMA.includes(s));
  const portal = await readFile(new URL('../server/portal.mjs', import.meta.url), 'utf8'), sheet = await readFile(new URL('../server/supplier-sheet.mjs', import.meta.url), 'utf8'), admin = await readFile(new URL('../dist/admin/admin.js', import.meta.url), 'utf8');
  assert.ok(portal.includes('const sp = await findSavedPrice(DB, row);') && portal.includes("price_source='saved'"));
  assert.ok(portal.includes("'/admin/saved-prices'"));
  assert.ok(sheet.includes('await rememberPrice(DB, order, n, t);') && sheet.includes('price_source=NULL'));
  assert.ok(admin.includes("['prices', savedPrices ?") && admin.includes('data-forget-price') && admin.includes("o.priceSource === 'saved'"));
});
