import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, BANK_FIELDS } from '../server/portal.mjs';

const server = readFileSync(new URL('../server/portal.mjs', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../dist/portal/portal.js', import.meta.url), 'utf8');

test('bank details have defaults from Shahar\'s list and are editable settings', () => {
  assert.equal(DEFAULT_SETTINGS.bank_account, '20000013048280');
  assert.equal(DEFAULT_SETTINGS.bank_swift, 'CHASUS33');
  assert.equal(BANK_FIELDS.length, 9);
  assert.ok(server.includes('for (const k of BANK_FIELDS) if (body[k] !== undefined)'), 'admin settings accept bank fields');
  assert.ok(server.includes('...Object.fromEntries(BANK_FIELDS.map'), 'client /me gets bank fields');
});

test('payments page shows the bank details with Copy buttons in "Pay for your orders"; bank values are not translated', () => {
  assert.ok(portal.includes('function bankRows()') && portal.includes('bank = bankRows()') && portal.includes('${payFlow()}'));
  assert.ok(/<b data-no-i18n>\$\{esc\(shown\)\}<\/b><button type="button" class="btn btn-sm" data-copy=/.test(portal));
});
