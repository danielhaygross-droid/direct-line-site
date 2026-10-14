import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { SCHEMA, accountingOnlyEdit, ACCOUNTING_BODY_KEYS, customerOnlyEdit } from '../server/portal.mjs';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

// Real rows from the team's own profit tracker (ALL_Zippo_Stores_PROFIT_Data, OCTOBER):
// Buyer Paid - Etsy Fee (typed in from the Etsy order) - Product Cost = Profit.
const TRACKER = [[61.78, 17.08, 15.90, 28.80], [53.10, 9.31, 14.90, 28.89], [41.11, 13.03, 12.90, 15.18]];

// Run the portal's own netProfit() on those rows (no copy of the formula in the test).
async function portalMath() {
  const src = await read('dist/portal/portal.js');
  const start = src.indexOf('  const cents = n =>'), end = src.indexOf('  const customerPaid = o =>');
  assert.ok(start > 0 && end > start, 'helpers found');
  const ctx = { money: v => '$' + Number(v).toFixed(2) };
  vm.runInNewContext(src.slice(start, end) + '\nthis.netProfit = netProfit; this.netCell = netCell;', ctx);
  return ctx;
}
const order = (paid, fee, cost, extra = {}) => ({ status: 'processing', priced: true, sellingPrice: paid, etsyFee: fee, price: cost, currency: 'USD', ...extra });

test('net profit equals the tracker profit to the cent, using the fee the client enters', async () => {
  const { netProfit } = await portalMath();
  for (const [paid, fee, cost, profit] of TRACKER) assert.equal(netProfit(order(paid, fee, cost)), profit, `${paid} - ${fee} - ${cost}`);
});

test('nothing is guessed: no fee, no price, not billed, cancelled or non-USD give no number', async () => {
  const { netProfit, netCell } = await portalMath();
  assert.equal(netProfit(order(40, null, 20)), null);
  assert.equal(netProfit(order(null, 5, 20)), null);
  assert.equal(netProfit(order(40, 5, 20, { priced: false })), null);
  assert.equal(netProfit(order(40, 5, 20, { status: 'cancelled' })), null);
  assert.equal(netProfit(order(40, 5, 20, { currency: 'EUR' })), null);
  assert.equal(netProfit(order(40, 0, 20)), 20, 'a fee of 0 is a real fee');
  assert.equal(netProfit(order(15, 1.675, 20)), -6.68, 'whole-cent arithmetic (15.00 - 1.68 - 20.00)');
  assert.match(netCell(order(40, null, 20)), /Add Etsy fee/);
  assert.match(netCell(order(40, 5, 20, { priced: false })), /Pending/);
  assert.match(netCell(order(40, 5, 20, { status: 'cancelled' })), /—/);
});

test('the Etsy fee is stored, sent with the order and editable at any time, while other fields stay locked', async () => {
  assert.ok(SCHEMA.some(s => /ADD COLUMN IF NOT EXISTS etsy_fee DOUBLE PRECISION/.test(s)));
  assert.deepEqual(ACCOUNTING_BODY_KEYS, ['sellingPrice', 'currency', 'etsyFee']);
  assert.equal(accountingOnlyEdit({ etsyFee: '3' }), true); assert.equal(accountingOnlyEdit({ sellingPrice: 1, currency: 'USD', etsyFee: 2 }), true);
  for (const body of [{}, null, { etsyFee: 1, notes: 'x' }, { quantity: 2 }, { etsyFee: 1, buyerName: 'A' }]) assert.equal(accountingOnlyEdit(body), false, JSON.stringify(body));
  assert.equal(customerOnlyEdit({ etsyFee: 1 }), false);
  const server = await read('server/portal.mjs');
  assert.ok(server.includes('etsyFee: r.etsy_fee == null ? null : Number(r.etsy_fee)'));
  assert.ok(server.includes('AND (? OR ? OR (? AND status IN') && server.includes('id, existing.status, who.admin, accountingOnly, customerOnly,'), 'the UPDATE itself allows accounting edits in any state');
  assert.ok(server.includes('if (changed.length && !accountingOnly) await logEvent('), 'a fee change does not notify the admin');
  assert.ok(server.includes("'The Etsy fee must be zero or more'") && server.includes('if (!accountingOnly && (!who.admin'), 'address rules are not applied to accounting edits');
});

test('portal: Net profit column, panel lines, "Your numbers" form, order-form field and Hebrew', async () => {
  const portal = await read('dist/portal/portal.js'), i18n = await read('dist/p/i18n.js');
  assert.ok(portal.includes('title="Price minus the Etsy fee you entered minus cost">Net profit</th>'));
  assert.ok(portal.includes('data-label="Net profit"') && portal.includes('id="numbers-form"') && portal.includes('data-numbers-msg'));
  assert.ok(portal.includes("$('#numbers-form')?.dataset.dirty"), 'the open form is not redrawn');
  assert.ok(portal.includes('S.me.preview || o.status === \'cancelled\' ? \'\' : `<section class="card card-pad"><h3 class="sec-title">Your numbers</h3>'), 'no form in the admin preview or on cancelled orders');
  assert.ok(portal.includes('etsyFee: form.etsyFee.value'), 'the order form sends the fee');
  assert.ok(!/etsy_fee_percent|feeRates|etsyFeePercent|6\.5%|9\.5%|3%/.test(portal), 'no invented fee rates anywhere');
  for (const s of ['Net profit', 'Add Etsy fee', 'Etsy fee', 'Your net profit', 'Your numbers', 'Save numbers', 'Numbers saved', 'Net profit is shown for orders in USD.', 'The Etsy fee must be zero or more']) assert.ok(i18n.includes(`'${s}':`), s);
});
