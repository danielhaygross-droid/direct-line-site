import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditOrder, clientSession, parseRole, EDIT_WINDOW_SECONDS } from '../server/portal.mjs';

test('client edit permission ends exactly at 72 hours and never reopens after processing', () => {
  const created_at = 1000, pending = { created_at, status: 'pending' };
  assert.equal(canEditOrder(pending, created_at + EDIT_WINDOW_SECONDS - 1), true);
  assert.equal(canEditOrder(pending, created_at + EDIT_WINDOW_SECONDS), false);
  for (const status of ['processing', 'shipped', 'delivered', 'cancelled']) assert.equal(canEditOrder({ ...pending, status }, created_at + 1), false);
  assert.equal(canEditOrder({ ...pending, edit_locked: true }, created_at + 1), false);
  assert.equal(canEditOrder({ status: 'pending' }, created_at), false);
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
