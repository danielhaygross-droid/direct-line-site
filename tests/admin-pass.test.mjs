import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL('../dist/' + p, import.meta.url), 'utf8');

test('admin: fixed-quote orders are billed, and the needs-cost alert opens those orders', async () => {
  const admin = await read('admin/admin.js');
  assert.ok(admin.includes("const needsCost = o => o.status !== 'cancelled' && o.productCost == null && o.shippingFee == null && o.quotedUnitPrice == null;"));
  assert.ok(admin.includes("noCost = os.filter(needsCost)") && admin.includes('data-go-filter="needscost"'));
  assert.ok(admin.includes("f === 'needscost' ? needsCost(o)") && admin.includes("'all', 'followups', 'needscost'"));
  assert.ok(admin.includes("needsCost(o) ? 'Pending costs'"), 'profit uses the same rule');
});

test('admin: blank customer paid is not 0.00 and is not shown as a loss', async () => {
  const admin = await read('admin/admin.js');
  assert.ok(!/Number\(o\.sellingPrice \|\| 0\)/.test(admin), 'no "|| 0" customer-paid display left');
  assert.ok(admin.includes("o.profit == null ? '<span class=\"dim\">Needs the Etsy earnings</span>'"), 'profit after the Etsy fee, or a hint');
});

test('admin: saves are guarded against double clicks, payments default to bank transfer with fixed values', async () => {
  const admin = await read('admin/admin.js');
  assert.ok(/data-track-form[\s\S]{0,200}if \(b\.disabled\) return; b\.disabled = true;/.test(admin.slice(admin.indexOf("const tf = e.target.closest('[data-track-form]')"))));
  assert.ok(admin.includes('if (dp.disabled) return; dp.disabled = true;'));
  assert.ok(admin.includes('const btn = $(\'[type=submit]\', f); if (btn.disabled) return; btn.disabled = true;'), 'Save bill');
  assert.ok(admin.includes('["Bank transfer", "PayPal", "Wise", "Other"].map(m => `<option value="${m}">${m}</option>`)'), 'option values are not translated');
  assert.ok(!/<option>(Bank transfer|PayPal)<\/option>/.test(admin));
  assert.ok(admin.includes("toast('Couldn’t load payments: ' + e.message)"));
});

test('portal: offline retry, Copy resets, distinct menu icons; Hebrew for every new text', async () => {
  const portal = await read('portal/portal.js'), i18n = await read('p/i18n.js');
  assert.ok(portal.includes('function bootError(ex)') && portal.includes('data-boot-retry') && !portal.includes("$('#boot').textContent = e.message"));
  assert.ok(portal.includes('cp._copyTimer = setTimeout'));
  assert.ok(portal.includes("['stores','My Stores','store'], ['products','My Products','tag'], ['terms', 'Terms of Service', 'doc']"));
  for (const s of ['Needs cost', 'Needs the sale price', 'Try again', 'Couldn’t connect. Check your internet connection and try again.', 'Bank transfer'])
    assert.ok(i18n.includes(`'${s}':`), s);
  assert.ok(i18n.includes('[/^Couldn’t load payments: (.*)$/'));
});
