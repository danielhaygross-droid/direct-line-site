import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../dist/p/client-store-math.js';
import { SCHEMA, accountingOnlyEdit, ACCOUNTING_BODY_KEYS, customerOnlyEdit, earnedAfterFee } from '../server/portal.mjs';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const { earnedCents, performance } = globalThis.DLClientStoreMath;

// Real rows from the team's own profit tracker (ALL_Zippo_Stores_PROFIT_Data, OCTOBER):
// Buyer Paid - Etsy Fee (typed in from the Etsy order) - Product Cost = Profit.
const TRACKER = [[61.78, 17.08, 15.90, 28.80], [53.10, 9.31, 14.90, 28.89], [41.11, 13.03, 12.90, 15.18]];

test('profit is after the Etsy fee and equals the tracker profit to the cent (server and shared math)', () => {
  for (const [paid, fee, cost, profit] of TRACKER) {
    const earned = earnedAfterFee({ selling_price: paid, etsy_fee: fee });
    assert.equal(Math.round((earned - cost) * 100) / 100, profit, `${paid} - ${fee} - ${cost}`);
    assert.equal((earnedCents({ sellingPrice: paid, etsyFee: fee }) - Math.round(cost * 100)) / 100, profit);
  }
  const stats = performance([{ id: 1 }], TRACKER.map(([paid, fee, cost], i) => ({ id: i + 1, storeId: 1, status: 'processing', price: cost, sellingPrice: paid, etsyFee: fee, orderDate: '2026-10-10' })));
  assert.equal(stats.totals.profit, 72.87);
});

test('"You earned" from Etsy can be typed instead, and wins; nothing is guessed', () => {
  assert.equal(earnedAfterFee({ etsy_earned: 104, selling_price: 120, etsy_fee: 30 }), 104, 'Etsy own number wins');
  assert.equal(earnedAfterFee({ etsy_earned: 56.2, selling_price: null, etsy_fee: null }), 56.2);
  assert.equal(earnedAfterFee({ selling_price: 40, etsy_fee: null }), null, 'no fee, no profit');
  assert.equal(earnedAfterFee({ selling_price: null, etsy_fee: 5 }), null);
  assert.equal(earnedAfterFee({ selling_price: 40, etsy_fee: 0 }), 40, 'a fee of 0 is a real fee');
  assert.equal(earnedCents({ sellingPrice: 40 }), null);
  assert.equal(earnedCents({ etsyEarned: 0 }), 0);
});

test('the Etsy fee and "You earned" are stored and editable at any time, while other fields stay locked', async () => {
  assert.ok(SCHEMA.some(s => /ADD COLUMN IF NOT EXISTS etsy_fee DOUBLE PRECISION/.test(s)) && SCHEMA.some(s => /ADD COLUMN IF NOT EXISTS etsy_earned DOUBLE PRECISION/.test(s)));
  assert.deepEqual(ACCOUNTING_BODY_KEYS, ['sellingPrice', 'currency', 'etsyFee', 'etsyEarned']);
  assert.equal(accountingOnlyEdit({ etsyEarned: '3' }), true); assert.equal(accountingOnlyEdit({ sellingPrice: 1, currency: 'USD', etsyFee: 2, etsyEarned: 1 }), true);
  for (const body of [{}, null, { etsyFee: 1, notes: 'x' }, { quantity: 2 }, { etsyEarned: 1, buyerName: 'A' }]) assert.equal(accountingOnlyEdit(body), false, JSON.stringify(body));
  assert.equal(customerOnlyEdit({ etsyFee: 1 }), false);
  const server = await read('server/portal.mjs');
  assert.ok(server.includes("earned: earnedAfterFee(r), profit: earnedAfterFee(r) === null || (r.currency || 'USD') !== 'USD' ? null : round2(earnedAfterFee(r) - price)"));
  assert.ok(server.includes('AND (? OR ? OR (? AND status IN') && server.includes('id, existing.status, who.admin, accountingOnly, customerOnly,'), 'the UPDATE itself allows accounting edits in any state');
  assert.ok(server.includes('if (changed.length && !accountingOnly) await logEvent('), 'a numbers change does not notify the admin');
  assert.ok(server.includes("'The Etsy fee must be zero or more'") && server.includes("'What you earned must be zero or more'"));
  assert.equal((server.match(/await saveEtsyEarned\(DB, /g) || []).length, 2, 'saved on new orders and on edits');
});

test('portal: Earned / Cost / Profit, panel lines, "Your numbers" form with "You earned", order-form field and Hebrew', async () => {
  const portal = await read('dist/portal/portal.js'), i18n = await read('dist/p/i18n.js');
  assert.ok(!portal.includes('Net profit') && !portal.includes('netProfit'), 'no separate Net profit any more');
  assert.ok(portal.includes('id="numbers-form"') && portal.includes('name="etsyEarned"') && portal.includes('etsyEarned: f.etsyEarned.value') && portal.includes('etsyEarned: form.etsyEarned.value'));
  assert.ok(portal.includes("$('#numbers-form')?.dataset.dirty"), 'the open form is not redrawn');
  assert.ok(portal.includes('S.me.preview || o.status === \'cancelled\' ? \'\' : `<section class="card card-pad"><h3 class="sec-title">Your numbers</h3>'), 'no form in the admin preview or on cancelled orders');
  assert.ok(!/etsy_fee_percent|feeRates|etsyFeePercent|6\.5%|9\.5%|3%/.test(portal), 'no invented fee rates anywhere');
  for (const s of ['Earned', 'You earned', 'Or: You earned', 'Add Etsy fee', 'Etsy fee', 'Your profit', 'Your numbers', 'Save numbers', 'Numbers saved', 'The Etsy fee must be zero or more', 'What you earned must be zero or more', 'orders missing Etsy earnings']) assert.ok(i18n.includes(`'${s}':`), s);
});

test('profit only for USD orders: other currencies are not mixed into the USD totals, and are counted', () => {
  const stats = performance([{ id: 1 }], [
    { id: 1, storeId: 1, status: 'processing', price: 20, sellingPrice: 50, etsyFee: 5, currency: 'USD', orderDate: '2026-10-10' },
    { id: 2, storeId: 1, status: 'processing', price: 20, sellingPrice: 40, etsyFee: 5, currency: 'EUR', orderDate: '2026-10-10' },
  ]);
  assert.equal(stats.totals.profit, 25, 'only the USD order (50 - 5 - 20)');
  assert.equal(stats.totals.earned, 45); assert.equal(stats.totals.otherCurrency, 1); assert.equal(stats.totals.missingSalePrice, 0);
});
