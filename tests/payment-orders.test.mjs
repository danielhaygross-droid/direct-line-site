import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Reads the files of the .xlsx (ZIP, stored) back.
function unzip(buf) {
  const files = new Map(), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = buf.length - 22; while (dv.getUint32(end, true) !== 0x06054b50) end--;
  let p = dv.getUint32(end + 16, true);
  for (let i = 0; i < dv.getUint16(end + 10, true); i++) {
    const size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true), local = dv.getUint32(p + 42, true), start = local + 30 + dv.getUint16(local + 26, true);
    files.set(new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen)), new TextDecoder().decode(buf.subarray(start, start + size)));
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return files;
}

// Loads a dist/p script the way the browser does (no document: no click listeners).
async function load(file) {
  const src = await readFile(new URL('../dist/p/' + file, import.meta.url), 'utf8');
  const window = {}; new Function('window', 'document', src)(window, undefined);
  return window;
}
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('paid state of an order follows the balance rule: price unless cancelled, plus adjustments', async () => {
  const P = (await load('payment-orders.js')).DLPayOrders;
  const adj = [{ orderId: 3, amount: 4 }, { orderId: 5, amount: -10 }];
  const orders = [{ id: 1, status: 'pending', price: 20 }, { id: 2, status: 'pending', price: 0 }, { id: 3, status: 'cancelled', price: 30 }, { id: 4, status: 'shipped', price: 10, paymentId: 7 }, { id: 5, status: 'delivered', price: 10 }, { id: 6, status: 'cancelled', price: 12 }];
  assert.deepEqual(orders.map(o => P.state(o, adj)), ['unpaid', 'unbilled', 'unpaid', 'paid', 'unbilled', null]);
  assert.deepEqual(orders.map(o => P.dueCents(o, adj)), [2000, 0, 400, 1000, 0, 0], 'cancelled = only its fee; a refund takes the bill down');
  assert.equal(P.tag(orders[0], adj), '<span class="pay-tag unpaid">Not paid</span>');
  assert.equal(P.tag(orders[3], adj, true), '<div class="pay-line"><span class="pay-tag paid">Paid</span></div>');
  assert.equal(P.tag(orders[1], adj), '', 'no tag before there is a bill');
});

test('checklist: running total and the comparison with the amount; linked: which orders a payment was for', async () => {
  const P = (await load('payment-orders.js')).DLPayOrders;
  const orders = [{ id: 1, orderRef: 'A-1', status: 'pending', price: 20, buyerName: 'X' }, { id: 2, orderRef: 'B-2', status: 'pending', price: 25 }, { id: 3, orderRef: 'C-3', status: 'pending', price: 30 }];
  const box = opts => P.checklist({ orders, orderName: o => o.orderRef, dateOf: () => '1 Oct 2026', esc, ...opts });
  let html = box({ checked: new Set([1, 2]), amount: 45 });
  assert.match(html, /2 orders ticked · \$45\.00/); assert.match(html, /The amount matches the ticked orders\./);
  assert.equal((html.match(/name="poOrder"/g) || []).length, 3); assert.equal((html.match(/ checked>/g) || []).length, 2);
  assert.match(html, /data-cents="2000"/);
  assert.match(box({ checked: new Set([1]), amount: 45 }), /The amount is \$25\.00 more than the ticked orders\./);
  assert.match(box({ checked: new Set([1, 2, 3]), amount: 45 }), /The amount is \$30\.00 less than the ticked orders\./);
  assert.match(box({ checked: new Set(), amount: 45 }), /No orders ticked/);
  assert.doesNotMatch(box({ compare: false }), /data-po-oldest/, 'no "oldest up to the amount" without an amount');
  assert.match(P.checklist({ orders: [], orderName: String, dateOf: String, esc, empty: 'Nothing to pay.' }), /Nothing to pay\./);
  const linked = (payment, admin) => P.linked({ payment, orders, orderName: o => o.orderRef, esc, admin });
  assert.match(linked({ amount: 45, orderIds: [1, 2] }, true), /For 2 orders · \$45\.00[\s\S]*Matches[\s\S]*A-1[\s\S]*B-2/);
  assert.match(linked({ amount: 50, orderIds: [1] }, true), /For 1 order · \$20\.00[\s\S]*\$30\.00 more than its orders/);
  assert.doesNotMatch(linked({ amount: 50, orderIds: [1] }, false), /more than|Matches/, 'clients see the orders, not the gap');
  assert.match(linked({ amount: 50, orderIds: [] }, true), /Not linked to orders/);
});

test('"Tick oldest up to the amount" ticks in order and stops at the first order the amount does not cover', async () => {
  const P = (await load('payment-orders.js')).DLPayOrders;
  const run = (amount, list) => { const inputs = list.map(c => ({ dataset: { cents: String(c) }, checked: true })); P.tickOldest({ closest: () => ({ querySelector: () => ({ value: String(amount) }) }), querySelectorAll: () => inputs }); return inputs.map(i => i.checked); };
  assert.deepEqual(run(45, [2000, 2500, 3000]), [true, true, false]);
  assert.deepEqual(run(30, [2000, 2500, 500]), [true, false, false], 'never a newer order while an older one is left');
  assert.deepEqual(run(1301, Array(40).fill(3252.5).map(Math.round).map((c, i) => i < 39 ? 3250 : 130100 - 3250 * 39)), Array(40).fill(true), '40 orders that add up to the amount');
});

test('Excel: "Paid" says Yes for orders Direct Line recorded as paid', async () => {
  const X = (await load('excel-export.js')).DLExcelExport;
  const blob = X.orders({ title: 'T', subtitle: '', statusLabel: s => s, orders: [
    { id: 1, orderRef: 'A-1', orderDate: '2026-10-01', status: 'shipped', price: 20, priced: true, paymentId: 9 },
    { id: 2, orderRef: 'B-2', orderDate: '2026-10-02', status: 'pending', price: 25, priced: true, paymentId: null }] });
  const sheet = unzip(new Uint8Array(await blob.arrayBuffer())).get('xl/worksheets/sheet1.xml');
  const cell = ref => (new RegExp(`<c r="${ref}"[^>]*>(.*?)</c>`).exec(sheet) || [])[1] || '';
  assert.match(cell('H5'), /Yes/); assert.match(cell('H6'), /No/);
  assert.ok(sheet.includes('says Yes for the orders Direct Line has recorded as paid'));
});

test('wired up: script on both pages, Hebrew for the new text, payments linked on the server', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  for (const f of ['../dist/portal/index.html', '../dist/admin/index.html']) assert.match(await read(f), /<script src="\/p\/payment-orders\.js\?v=\d+"><\/script>/);
  const he = await read('../dist/p/i18n.js');
  for (const s of ['Orders this payment is for', 'Tick oldest up to the amount', 'Which orders is this transfer for?', 'Billing details for your receipts', 'Save billing details', 'Not paid', 'Orders and payments'])
    assert.ok(he.includes(`'${s}':`), s);
  for (const s of ['orders? ticked · (.+)$/', 'more than the ticked orders', 'For (\\d+) orders? · (.+)$/', 'is already paid by another payment']) assert.ok(he.includes(s), s);
  const portal = await read('../server/portal.mjs');
  assert.ok(portal.includes('SCHEMA.push(...PAYMENT_ORDER_SCHEMA, ...BILLING_SCHEMA);'));
});
