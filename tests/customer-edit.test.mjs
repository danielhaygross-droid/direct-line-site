import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canEditOrder, canEditCustomer, customerOnlyEdit, CUSTOMER_BODY_KEYS, CUSTOMER_COLUMNS, SCHEMA } from '../server/portal.mjs';
import { addressFlag, websiteCells } from '../server/supplier-sheet.mjs';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const T = 1_800_000_000;

test('customer details stay editable until shipped; the rest keeps the 72 h / Pending rule', () => {
  const fresh = { status: 'pending', created_at: T, edit_locked: false };
  assert.equal(canEditOrder(fresh, T + 3600), true);
  for (const status of ['pending', 'processing']) assert.equal(canEditCustomer({ status }), true, status);
  for (const status of ['shipped', 'delivered', 'cancelled', 'cancellation_requested']) assert.equal(canEditCustomer({ status }), false, status);
  assert.equal(canEditCustomer({ status: 'processing', archived: true }), false);
  // In progress: the full edit is closed but customer details are open.
  const running = { status: 'processing', created_at: T, edit_locked: true };
  assert.equal(canEditOrder(running, T + 60), false); assert.equal(canEditCustomer(running), true);
  // Pending but older than 72 h.
  assert.equal(canEditOrder({ ...fresh }, T + 72 * 3600 + 1), false);
});

test('only requests made of customer fields count as customer edits', () => {
  assert.deepEqual(CUSTOMER_BODY_KEYS, ['buyerName', 'buyerPhone', 'address1', 'address2', 'city', 'region', 'postalCode', 'destination', 'taxNumber', 'giftMessage']);
  assert.deepEqual(CUSTOMER_COLUMNS, ['buyer_name', 'buyer_phone', 'address_line_1', 'address_line_2', 'city', 'region', 'postal_code', 'destination']);
  assert.equal(customerOnlyEdit({ buyerName: 'A', address1: 'x', destination: 'IL' }), true);
  for (const body of [{}, null, { notes: 'x' }, { buyerName: 'A', quantity: 2 }, { buyerName: 'A', etsyUrl: 'https://x.co' }, { buyerName: 'A', sku: 'S' }, { status: 'cancelled' }])
    assert.equal(customerOnlyEdit(body), false, JSON.stringify(body));
});

test('the supplier sheet warns when the address changed while the order was in progress', () => {
  const o = { id: 5, client_id: 1, status: 'processing', created_at: T, address_changed_at: T, order_ref: 'E-1', quantity: 1, buyer_name: 'A', address_line_1: '9 Road', destination: 'DE', notes: 'Gift note', etsy_url: '' };
  assert.match(addressFlag(o), /^⚠ ADDRESS CHANGED 2027-01-15 — use the address in this row\.\n$/);
  assert.equal(addressFlag({ ...o, address_changed_at: null }), '');
  for (const status of ['shipped', 'delivered', 'cancelled']) assert.equal(addressFlag({ ...o, status }), '', status);
  const notes = websiteCells({ APP_SESSION_SECRET: 'x' }, o, [], 'Shop').am[13];
  assert.ok(notes.startsWith('⚠ ADDRESS CHANGED') && notes.endsWith('\nGift note'));
  assert.equal(websiteCells({ APP_SESSION_SECRET: 'x' }, { ...o, address_changed_at: null }, [], 'Shop').am[13], 'Gift note');
  assert.ok(SCHEMA.some(s => /address_changed_at INTEGER/.test(s)));
});

test('portal, activity and admin bell wording are wired up, with Hebrew', async () => {
  const portal = await read('dist/portal/portal.js'), ui = await read('dist/p/order-ui.js'), bell = await read('dist/p/real-ui.js'), i18n = await read('dist/p/i18n.js'), server = await read('server/portal.mjs');
  assert.ok(portal.includes("const canChangeCustomer = o => !S.me?.preview && ['pending', 'processing'].includes(o.status) && !editable(o);"));
  assert.ok(portal.includes('data-change-customer') && portal.includes('function showCustomerForm(o)') && portal.includes('chatCtl?.reload?.()'));
  assert.ok(portal.includes("$('#customer-form')?.dataset.dirty"), 'background refresh must not wipe the open form');
  assert.ok(ui.includes("e.kind==='edited'&&e.detail==='customer' ? 'Customer details changed'"));
  assert.ok(bell.includes("e.kind === 'edited' && e.detail === 'customer'") && bell.includes('already in progress: tell the supplier'));
  for (const s of ['Change customer details', 'Save customer details', 'Customer details updated', 'Customer details changed', 'Direct Line is told about the change straight away.', 'You can change these until the parcel ships.', 'Direct Line has been told about the change.',
    'This order has already shipped, so the customer details can no longer be changed. Need help? Send us a message.']) assert.ok(i18n.includes(`'${s}':`), s);
  assert.ok(server.includes('(? AND status IN (\\\'pending\\\',\\\'processing\\\'))'), 'the UPDATE itself enforces the rule, not only the pre-check');
});
