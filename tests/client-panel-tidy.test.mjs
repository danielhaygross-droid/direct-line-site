import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = f => readFile(new URL(f, import.meta.url), 'utf8');

test('admin client panel: own tabs for stores and products, compact rows, folded extras', async () => {
  const admin = await read('../dist/admin/admin.js'), css = await read('../dist/admin/admin.css'), he = await read('../dist/p/i18n.js');
  assert.ok(admin.includes("const CLIENT_GROUPS = [['orders', 'Orders', ['orders']], ['shop', 'Shop', ['stores', 'products']], ['money', 'Money', ['payments', 'prices']], ['account', 'Account', ['account', 'activity']]];"), '4 grouped tabs');
  assert.ok(admin.includes("['stores', `Stores (${stores.length})`], ['products', `Products (${products.length})`]") && admin.includes('class="kpis"') && admin.includes('data-client-store'), 'sub-tabs, summary row, store filter');
  assert.ok(admin.includes(": tab === 'products' ? productsPane(products)"));
  // The Orders tab no longer carries every store form and product price form.
  const ordersPane = admin.slice(admin.indexOf("// Orders tab:"), admin.indexOf(": tab === 'stores'"));
  assert.ok(!ordersPane.includes('productQuoteForm') && !ordersPane.includes('DLClientStoreUI.form'), 'orders tab is only orders');
  assert.ok(ordersPane.includes('data-fold="perf"') && ordersPane.includes('class="ord-row"'));
  // Product rows are closed until clicked; open rows survive the 20-second redraw.
  assert.ok(admin.includes('<details class="prod-row" data-keep="p${p.id}">') && admin.includes("details[open][data-keep]"));
  assert.ok(admin.includes('const foldList = rows =>') && admin.includes('rows.slice(0, 8)'));
  assert.ok(css.includes('.gtabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))'), 'the 4 tabs always fit in one row');
  for (const r of ['Stores \\((\\d+)\\)', 'Products \\((\\d+)\\)', 'Show all \\((\\d+)\\)']) assert.ok(he.includes(r), r);
  for (const s of ['Showing one store:', 'Waiting for price', 'No price yet']) assert.ok(he.includes(`'${s}':`), s);
});
