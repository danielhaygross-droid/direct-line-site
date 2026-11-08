import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('admin order panel: every status, a direct cancel with fee, reopen hint and a fee editor', async () => {
  const admin = await read('dist/admin/admin.js');
  assert.ok(admin.includes("const ADMIN_STATUSES = ['pending','processing','shipped','delivered'];"));
  // Since 8 Nov 2026 cancelling goes through the cancel window (fees per order); checks/check-cancel-window.mjs tests it.
  assert.ok(admin.includes('function openCancelWindow(') && admin.includes("body: { status: 'cancelled', ...body }"), 'cancelling goes through the cancel window');
  assert.ok(admin.includes("o.status==='cancelled' ? '<p class=\"note\">This order is cancelled. Choose a status to reopen it"));
  assert.ok(admin.includes('data-fees-form') && admin.includes("body: { commission: ff.commission.value }"));
  assert.ok(admin.includes("o.status === 'cancelled' ? '' : ` data-cancel-window=\"${o.id}\""), '"Cancelled" in the status row opens the cancel window, not on cancelled orders');
});

test('server: status changes take fee and reason, per-order fee is validated, reopening zeroes the cancellation fee', async () => {
  const portal = await read('server/portal.mjs'), status = await read('server/order-status.mjs');
  assert.ok(portal.includes("['status','fee','reason','keepFee'].includes(k)"));
  assert.ok(portal.includes("'Invalid fee'") && !portal.includes("The supplier's share can't be more"), 'the supplier gets no part of our fee any more');
  assert.ok(status.includes("DO UPDATE SET amount=EXCLUDED.amount") && status.includes("UPDATE client_balance_adjustments SET amount=0 WHERE order_id=? AND kind='cancellation_fee'"));
  assert.ok(status.includes("a.amount<>0"), 'a zero cancellation fee is not listed to the client');
  assert.ok(status.includes("WHEN ? IN ('pending','processing','shipped') THEN NULL"), 'the delivered date is cleared when an order goes back');
});

test('Hebrew exists for every new admin text', async () => {
  const i18n = await read('dist/p/i18n.js');
  for (const s of ['Cancel this order', 'Click again to cancel', 'Order cancelled. The client sees it right away.', 'Save fee', 'Fee saved for this order.', 'Invalid fee', 'Unknown status.',
    'This order is cancelled. Choose a status to reopen it; its cancellation fee is then removed.'])
    assert.ok(i18n.includes(`'${s}':`), s);
});
