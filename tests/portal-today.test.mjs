import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditOrder, clientSession, parseRole, EDIT_WINDOW_SECONDS } from '../server/portal.mjs';

test('the client can edit every detail until the order ships (Erwin, 4 Nov 2026)', () => {
  const created_at = 1000, pending = { created_at, status: 'pending' };
  assert.equal(canEditOrder(pending), true);
  assert.equal(canEditOrder({ ...pending, created_at: created_at - EDIT_WINDOW_SECONDS * 10 }), true, 'no 72-hour limit');
  assert.equal(canEditOrder({ ...pending, status: 'processing', edit_locked: true }), true, 'in progress: still editable');
  for (const status of ['shipped', 'delivered', 'cancelled', 'cancellation_requested']) assert.equal(canEditOrder({ ...pending, status }), false, status);
  assert.equal(canEditOrder({ ...pending, archived: true }), false, 'archived');
});

test('reset session versions revoke old cookies while keeping unchanged client accounts signed in', async () => {
  let version = 0;
  const DB = { prepare() { return { bind() { return this; }, async first() { return { active: true, archived: false, session_version: version }; } }; } };
  assert.ok(await clientSession(DB, parseRole('client-7')));
  version = 1;
  assert.equal(await clientSession(DB, parseRole('client-7')), null);
  assert.ok(await clientSession(DB, parseRole('client-7-v1')));
  assert.equal(await clientSession(DB, parseRole('client-7-v2')), null);
});
