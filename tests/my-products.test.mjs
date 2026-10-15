import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = f => readFile(new URL(f, import.meta.url), 'utf8');

test('client My Products: status filter, search, newest change first, marks what changed since the last visit', async () => {
  const js = await read('../dist/portal/portal.js'), css = await read('../dist/portal/portal.css'), he = await read('../dist/p/i18n.js');
  assert.ok(js.includes("const P_FILTERS=[['all','All'],['awaiting_quote','Waiting for price'],['approved','Priced'],['not_available','Not available']];"));
  assert.ok(js.includes("store.set('dl-products-filter',S.productFilter)"), 'filter remembered');
  assert.ok(js.includes('data-pq') && js.includes("[p.name,p.variant,p.link].join(' ')"), 'search by name, variation or link');
  assert.ok(js.includes('.sort((a,b)=>b.updatedAt-a.updatedAt||b.id-a.id)'), 'newest change first');
  assert.ok(js.includes("S.productsSeenBefore = store.get(productsSeenKey(), 0)") && js.includes("'New price':'Updated'"), 'marks changes since the last visit');
  assert.ok(js.includes('<details class="card card-pad add-product" data-add-product'), 'add form folds away');
  assert.ok(css.includes('.mp-row{display:grid'));
  for (const s of ['Priced', 'Send a product for a quote', 'Search products…', 'No products match', 'Our supplier is checking the price.', 'New price']) assert.ok(he.includes(`'${s}':`), s);
});

test('client My Products: a row opens the product details; Order this product pre-picks it', async () => {
  const js = await read('../dist/portal/portal.js'), he = await read('../dist/p/i18n.js');
  assert.ok(js.includes('data-open-product="${p.id}">${p.photoIds[0]') && js.includes('class="mp-name" data-open-product'));
  assert.ok(js.includes('function openProduct(id)') && js.includes("if (openP && !t.closest('a')) { openProduct(openP.dataset.openProduct); return; }"), 'click opens, links still work');
  assert.ok(js.includes('data-order-product') && js.includes("form.productId.value = String(S.orderProduct)"), 'order this product');
  assert.ok(js.includes("p.status==='approved'&&!S.me.preview?"), 'only priced products can be ordered, not in view-only preview');
  for (const s of ['Order this product', 'Sent for quote', 'Expected per month']) assert.ok(he.includes(`'${s}':`), s);
});
