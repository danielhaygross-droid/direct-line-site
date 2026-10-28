import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The files use Windows line endings on disk; compare with plain \n.
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8').then(t => t.split('\r\n').join('\n'));

test('the earnings cards and profit chart are on the Orders page, built from the same pieces as Home', async () => {
  const portal = await read('dist/portal/portal.js');
  // one source for the cards and the chart: Home and Orders cannot drift apart
  assert.equal(portal.split('function statCardsHTML()').length, 2, 'one definition of the cards');
  assert.ok(portal.includes('${statCardsHTML()}'), 'used by Home');
  assert.ok(portal.includes('function earningsInner()') && portal.includes('${statCardsHTML()}\n      <section class="card"><div class="card-head"><h3>Profit over selected period</h3>'), 'used by Orders, with the chart');
  // 28 Oct 2026: the order list comes first, the earnings block is folded below it.
  assert.ok(portal.includes('const viewOrders = () => `${payStrip()}<div class="toolbar">'), 'Orders starts with the toolbar and the list (after the unpaid-orders strip)');
  assert.ok(portal.includes('<section class="card" data-orders-list></section><details class="earn-box" data-earn'), 'the earnings block is below the list');
});

test('the earnings block follows the period and store, refreshes on its own, and can be folded away', async () => {
  const portal = await read('dist/portal/portal.js'), css = await read('dist/portal/portal.css'), i18n = await read('dist/p/i18n.js');
  assert.ok(portal.includes("const er=$('[data-earnings]'); if(er){er.innerHTML=earningsInner();mountClientChart();}"), 'the periodic refresh keeps the numbers current without redrawing the period picker');
  assert.ok(portal.includes("store.set('dl-earn-open-v2', e.target.open)") && portal.includes("store.get('dl-earn-open-v2', false)"), 'the choice is remembered, closed by default');
  assert.ok(css.includes('.earn-box>summary'));
  for (const s of ['Your earnings', 'profit, billing and the chart for the selected period']) assert.ok(i18n.includes(`'${s}':`), s);
});
