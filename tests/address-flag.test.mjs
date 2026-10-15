import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sameCustomer } from '../server/portal.mjs';

const row = (extra = {}) => ({ buyer_name: 'Kayson Pittman', buyer_phone: '', address_line_1: '231 Fafnir Dr\nKimberly, ID 83341\nUnited States', address_line_2: '', city: '', region: '', postal_code: '', destination: 'US', ...extra });

test('same address written differently is not a change (no "ADDRESS CHANGED" on the supplier row)', () => {
  assert.ok(sameCustomer(row(), row({ address_line_1: '231 Fafnir Dr\r\nKimberly, ID 83341\r\nUnited States' })), 'CRLF');
  assert.ok(sameCustomer(row(), row({ address_line_1: ' 231 Fafnir Dr \nKimberly,  ID 83341\n\nUnited States ', buyer_name: 'Kayson Pittman ' })), 'spaces and empty lines');
  assert.ok(sameCustomer(row(), row({ destination: 'us' })), 'country code case');
  assert.ok(sameCustomer(row({ address_line_1: '231 Fafnir Dr', city: 'Kimberly, ID 83341', postal_code: 'United States' }), row()), 'in parts vs one box');
});

test('a real change still counts', () => {
  assert.ok(!sameCustomer(row(), row({ address_line_1: '1 New Street\nBoise, ID 83702' })));
  assert.ok(!sameCustomer(row(), row({ buyer_name: 'Someone Else' })));
  assert.ok(!sameCustomer(row(), row({ destination: 'CA' })));
  assert.ok(!sameCustomer(row(), row({ buyer_phone: '(208) 555-0100' })));
  assert.ok(!sameCustomer(row(), row({ address_line_1: '231 fafnir dr\nKimberly, ID 83341\nUnited States' })), 'a spelling fix (letter case) is still saved');
});

test('wired up: kept as stored when the same, admins can clear the warning (one order or in bulk)', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const portal = await read('../server/portal.mjs'), admin = await read('../dist/admin/admin.js'), he = await read('../dist/p/i18n.js');
  assert.ok(portal.includes('if (sameCustomer(existing, f)) for (const k of CUSTOMER_COLUMNS) f[k] = existing[k];'));
  assert.ok(portal.includes("UPDATE client_orders SET address_changed_at=NULL WHERE id=?") && portal.includes("if (!who.admin) return json({ ok: false, error: 'Not found' }, 404);"));
  assert.ok(portal.includes("const CLIENT_HIDDEN = ['addressChangedAt',"), 'clients never see the flag');
  assert.ok(admin.includes('data-clear-addr-flag="${o.id}"') && admin.includes('data-bulk="addrflag"') && admin.includes("body = { clearAddressFlag: true }"));
  for (const s of ['Clear warning', 'Clear address warning', 'Address warning cleared.']) assert.ok(he.includes(`'${s}':`), s);
});
