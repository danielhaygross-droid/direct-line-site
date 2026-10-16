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

test('no "ADDRESS CHANGED" warning any more: never set, never in the notes, old ones cleared a few a minute', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const portal = await read('../server/portal.mjs'), sheet = await read('../server/supplier-sheet.mjs'), admin = await read('../dist/admin/admin.js');
  assert.ok(portal.includes('if (sameCustomer(existing, f)) for (const k of CUSTOMER_COLUMNS) f[k] = existing[k];'), 'an unchanged address is kept as stored');
  assert.ok(!portal.includes('SET address_changed_at=? WHERE id=?'), 'the flag is never set');
  assert.ok(!sheet.includes('ADDRESS CHANGED') || sheet.includes('No "ADDRESS CHANGED" warning'), 'no warning text written');
  assert.ok(sheet.includes("txt(savedPriceFlag(o) + (o.notes || ''))"));
  assert.ok(sheet.includes("SELECT id FROM client_orders WHERE address_changed_at IS NOT NULL ORDER BY id LIMIT 5"), 'old warnings cleared, 5 rows per run');
  assert.ok(!admin.includes('data-bulk="addrflag"') && !admin.includes('class="full addr-flag"'), 'no warning box or bulk button in admin');
});
