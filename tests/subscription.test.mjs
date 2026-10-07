import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addMonth, isoDate, subscriptionOut, SUB_STATUSES, DEFAULT_SETTINGS } from '../server/portal.mjs';

test('free month ends one calendar month later', () => {
  assert.equal(addMonth('2026-10-08'), '2026-11-08');
  assert.equal(addMonth('2026-01-31'), '2026-02-28');
  assert.equal(addMonth('2026-12-15'), '2027-01-15');
});

test('only real YYYY-MM-DD dates are accepted', () => {
  assert.equal(isoDate('2026-10-08'), '2026-10-08');
  for (const bad of ['2026-02-30', '2026-13-01', '08/10/2026', '', null]) assert.equal(isoDate(bad), null);
});

test('subscription summary: trial days left, ended, price 29 ₪ by default', () => {
  assert.equal(DEFAULT_SETTINGS.subscription_price, '29');
  const s = subscriptionOut({ trial_start: '2026-10-01', trial_end: '2026-11-01', sub_status: 'trial' }, DEFAULT_SETTINGS, '2026-10-25');
  assert.deepEqual([s.status, s.trialDaysLeft, s.trialEnded, s.price, s.currency], ['trial', 7, false, 29, 'ILS']);
  assert.equal(subscriptionOut({ trial_start: '2026-08-01', trial_end: '2026-09-01', sub_status: 'trial' }, DEFAULT_SETTINGS, '2026-10-25').trialEnded, true);
  assert.equal(subscriptionOut({}, DEFAULT_SETTINGS).status, null);
  assert.deepEqual(SUB_STATUSES, ['trial', 'active', 'overdue', 'cancelled']);
});

test('portal shows the banner; admin has the subscription form and the fixed "Add an admin" texts', () => {
  const portal = readFileSync(new URL('../dist/portal/portal.js', import.meta.url), 'utf8');
  assert.match(portal, /First month free/);
  assert.match(portal, /subBanner\(me\.subscription\)/);
  const admin = readFileSync(new URL('../dist/admin/admin.js', import.meta.url), 'utf8');
  assert.match(admin, /data-sub-form/);
  assert.match(admin, /Team member’s name/);
  assert.doesNotMatch(admin, /placeholder="Client or store name"/);
  assert.match(admin, /and get full access to the dashboard/);
});
