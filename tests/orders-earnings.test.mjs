import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The files use Windows line endings on disk; compare with plain \n.
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8').then(t => t.split('\r\n').join('\n'));

// 29 Oct 2026 (Erwin: "all money matters should be clearly seen first even at home" and "remove duplicate graphs that
// shows the same thing even if you go to other sections"): the money comes first on Home, the earnings cards and
// charts are only on Home, and the Orders page only lists orders.
test('Home starts with the money, and the earnings live only on Home', async () => {
  const portal = await read('dist/portal/portal.js'), i18n = await read('dist/p/i18n.js');
  assert.equal(portal.split('function statCardsHTML()').length, 2, 'one definition of the cards');
  assert.ok(portal.includes('${moneyNow()}\n      ${payStrip()}\n      ${window.DLClientStoreUI.periodFields('), 'Your money and the unpaid strip right under the greeting');
  assert.ok(portal.includes("'Cancellation fees', money(c.fees)") && portal.includes("'Credit from cancelled orders', money(c.credit)"), 'cancellation fees and credit on Home');
  assert.ok(!portal.includes('profitChart') && !portal.includes('Profit over selected period'), 'the old profit bars are gone (Money by month shows the profit)');
  assert.ok(!portal.includes('earningsInner') && !portal.includes('data-earn'), 'no earnings block on the Orders page');
  assert.ok(portal.includes('const viewOrders = () => `${payStrip()}<div class="toolbar">'), 'Orders starts with the toolbar and the list');
  for (const s of ['Your money', 'Payments details', 'Credit from cancelled orders', 'Already counted in your balance']) assert.ok(i18n.includes(`'${s}':`), s);
});
