import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8').then(t => t.split('\r\n').join('\n'));

test('saving a client account can put the new fee on existing orders, chosen by status', async () => {
  const portal = await read('server/portal.mjs'), admin = await read('dist/admin/admin.js'), i18n = await read('dist/p/i18n.js');
  assert.ok(portal.includes("export const FEE_SCOPES = { new: null, pending: ['pending'], processing: ['processing'], open: ['pending', 'processing'], all: [] };"), 'the choices');
  assert.ok(portal.includes("FROM client_orders WHERE client_id=? AND status<>'cancelled' AND NOT archived") && portal.includes('UPDATE client_orders SET commission=?, supplier_share=? WHERE id=?'), 'only this client, never cancelled or archived orders');
  assert.ok(portal.includes('followsSupplierCost(o)') && portal.includes('followsSupplierCost(existing)'), 'a price built from the supplier cost follows the fee, in bulk and per order');
  assert.ok(portal.includes('share = 0') && !admin.includes('Supplier gets') && !admin.includes('supplierSharePerOrder'), 'no supplier part of the fee any more');
  assert.ok(admin.includes('<select name="applyFeeTo">') && admin.includes('applyFeeTo: af.applyFeeTo.value'));
  for (const s of ['Use this fee for', 'New orders only']) assert.ok(i18n.includes(`'${s}':`), s);
});
