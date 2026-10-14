import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('admin Orders tab: tick one or many orders and change them together', async () => {
  const admin = await read('dist/admin/admin.js'), css = await read('dist/admin/admin.css'), i18n = await read('dist/p/i18n.js');
  assert.ok(admin.includes('data-pick="${o.id}"') && admin.includes('data-pick-all'), 'a box per row and select all');
  for (const k of ['status', 'courier', 'fee', 'archive', 'restore', 'clear']) assert.ok(admin.includes(`data-bulk="${k}"`), k);
  assert.ok(admin.includes("await api('/orders/' + id, { method: 'PUT', body })"), 'each order goes through the normal order update (same checks, activity and sheet sync)');
  assert.ok(admin.includes("if (kind === 'archive' && !btn.dataset.armed)"), 'archiving needs a second click');
  assert.ok(admin.includes('S.picked = new Set(failedIds)'), 'orders that could not be changed stay selected');
  assert.ok(admin.includes("t.closest('td.pick, th.pick')"), 'ticking a box does not open the order');
  assert.ok(css.includes('.bulk-bar{') && css.includes('.tbl.stack tr.picked{'));
  for (const s of ['Set status', 'Set courier', 'Set fee', 'Clear selection', 'Select all', 'Tick orders to change several at once: status, courier, fee or archive.']) assert.ok(i18n.includes(`'${s}':`), s);
});
