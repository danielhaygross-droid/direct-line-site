import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8').then(t => t.split('\r\n').join('\n'));
const common = await read('dist/p/common.js');
const src = common.split('// address-lines:start')[1].split('// address-lines:end')[0];
const inner = vm.runInNewContext(src + '; addressLines');
const addressLines = (...a) => [...inner(...a)];

test('the address is not repeated when the client already pasted the name, country or phone into the one box', () => {
  const heather = { buyerName: 'Heather Crawford', address1: '298 Universal Ln\nHendersonville, NC 28792\nUnited States\n(252) 622-0964', destination: 'US' };
  assert.deepEqual(addressLines(heather, 'United States', false), ['298 Universal Ln', 'Hendersonville, NC 28792', 'United States', '(252) 622-0964']);
  assert.deepEqual(addressLines({ ...heather, address1: 'Heather Crawford\n' + heather.address1 }, 'United States', true), ['Heather Crawford', '298 Universal Ln', 'Hendersonville, NC 28792', 'United States', '(252) 622-0964']);
  // USA / US as written by the client count as the country too
  assert.deepEqual(addressLines({ buyerName: 'A B', address1: '1 Main St, Austin TX 78701\nUSA', destination: 'US' }, 'United States', true), ['A B', '1 Main St, Austin TX 78701', 'USA']);
});

test('the name and country are still added when the address text has neither', () => {
  const o = { buyerName: 'Dana Levi', address1: '5 Herzl St\nHaifa 3100000\n+972 50 123 4567', destination: 'IL' };
  assert.deepEqual(addressLines(o, 'Israel', true), ['Dana Levi', '5 Herzl St', 'Haifa 3100000', '+972 50 123 4567', 'Israel']);
  assert.deepEqual(addressLines(o, 'Israel', false), ['5 Herzl St', 'Haifa 3100000', '+972 50 123 4567', 'Israel']);
  assert.deepEqual(addressLines({ ...o, destination: '' }, '', true), ['Dana Levi', '5 Herzl St', 'Haifa 3100000', '+972 50 123 4567']);
});

test('admin and client views use the same address helper', async () => {
  assert.ok((await read('dist/admin/admin.js')).includes("DL.addressLines(o, o.destination ? place(o.destination) : '', false)"), 'admin shows it without the name (Recipient is above)');
  assert.ok((await read('dist/portal/portal.js')).includes("DL.addressLines(o, o.destination ? place(o.destination) : '', true)"));
});
