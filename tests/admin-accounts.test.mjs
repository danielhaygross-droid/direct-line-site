import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCHEMA } from '../server/portal.mjs';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('payments can be edited and every change is kept in payment_edits', async () => {
  const server = await read('server/portal.mjs');
  assert.ok(SCHEMA.some(s => /CREATE TABLE IF NOT EXISTS payment_edits/.test(s) && /REFERENCES client_payments\(id\)/.test(s)));
  const create = SCHEMA.findIndex(s => /CREATE TABLE IF NOT EXISTS client_payments/.test(s)), audit = SCHEMA.findIndex(s => /CREATE TABLE IF NOT EXISTS payment_edits/.test(s));
  assert.ok(create >= 0 && audit > create, 'the audit table is created after the payments table it points to');
  assert.ok(server.includes("const payEdit = /^\\/admin\\/payments\\/(\\d+)$/.exec(path);"));
  assert.ok(server.includes("'Amount must be more than 0'") && server.includes("'Date: use a valid date'") && server.includes("'Payment not found'"));
  assert.ok(server.includes('INSERT INTO payment_edits (payment_id, field, old_value, new_value, created_at)'));
});

test('usernames can be changed by admins, with the same rules as when an account is created', async () => {
  const server = await read('server/portal.mjs');
  assert.ok(server.includes("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> ?"), 'duplicates are checked ignoring case, excluding the person themselves');
  assert.ok(server.includes("env.ADMIN_USERNAME && username.toLowerCase() === env.ADMIN_USERNAME.toLowerCase()"));
  assert.ok(server.includes("UPDATE users SET username=? WHERE id=?"));
});

test('admin screens: payment edit, team admin edit and username field are wired in the right click handler', async () => {
  const admin = await read('dist/admin/admin.js');
  assert.ok(admin.includes('data-edit-payment') && admin.includes('data-payment-edit-form') && admin.includes("'/admin/payments/' + pe.dataset.paymentEditForm"));
  assert.ok(admin.includes("if (soft && d.body.querySelector('[data-payment-edit-form]')) return;"), 'a background refresh must not wipe an open payment form');
  // The team list sits outside the side panel, so its clicks must be handled by the page-level handler.
  const page = admin.indexOf('  function onClick(e) {'), panelOnly = admin.indexOf("if (!d.el.contains(t)) return;");
  const handler = admin.indexOf("const ea=t.closest('[data-edit-admin]');");
  assert.ok(page >= 0 && handler > page && !admin.slice(page, handler).includes('if (!d.el.contains(t)) return;'), 'team admin clicks are in onClick(), not behind the side-panel-only guard');
  assert.ok(panelOnly > handler || panelOnly < page, 'the guard is a different handler');
  assert.ok(admin.includes("a && !a.querySelector('[data-admin-form]')"), 'a background refresh must not wipe an open admin form');
  assert.ok(admin.includes("'/admin/users/' + adf.dataset.adminForm") && admin.includes('Disabled (can’t sign in)'));
  assert.ok(admin.includes('<input name="username" maxlength="60" autocomplete="off" data-no-i18n value="${esc(c.username)}"') && admin.includes('username: af.username.value.trim()'));
});

test('Hebrew exists for every new text', async () => {
  const i18n = await read('dist/p/i18n.js');
  for (const s of ['Save payment', 'Payment updated.', 'Payment not found', 'Date: use a valid date', 'Save admin', 'Admin saved.', 'leave empty to keep the current one', 'used to sign in, and as the payment reference',
    'A disabled admin can’t sign in again. If they are signed in right now, they stay signed in until that session ends.']) assert.ok(i18n.includes(`'${s}':`), s);
});
