import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8').then(t => t.split('\r\n').join('\n'));

test('saving a client account can put the new fee on all their existing orders', async () => {
  const portal = await read('server/portal.mjs'), admin = await read('dist/admin/admin.js'), i18n = await read('dist/p/i18n.js');
  assert.ok(portal.includes("body.applyFeeToOrders === true"), 'only when asked');
  assert.ok(portal.includes("FROM client_orders WHERE client_id=? AND status<>'cancelled'") && portal.includes('UPDATE client_orders SET commission=?, supplier_share=? WHERE id=?'), 'only this client, not cancelled orders');
  assert.ok(portal.includes('followsSupplierCost(o)') && portal.includes('followsSupplierCost(existing)'), 'a price built from the supplier cost follows the fee, in bulk and per order');
  assert.ok(portal.includes('share = 0') && !admin.includes('Supplier gets') && !admin.includes('supplierSharePerOrder'), 'no supplier part of the fee any more');
  assert.ok(admin.includes('name="applyFeeToOrders"') && admin.includes('applyFeeToOrders: af.applyFeeToOrders.checked'));
  for (const s of ['Also change the fee on all of this client’s existing orders', '(not cancelled ones)']) assert.ok(i18n.includes(`'${s}':`), s);
});
