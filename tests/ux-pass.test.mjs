import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { productLinks, MAX_LINK_CHARS } from '../server/portal.mjs';

const read = p => readFile(new URL('../dist/' + p, import.meta.url), 'utf8');

test('long product links are kept whole and bare links get https://', () => {
  const long = 'https://www.etsy.com/listing/1234567890/personalised-engraved-zippo-lighter?ga_order=most_relevant&ga_search_type=all&ga_view_type=gallery&ga_search_query=engraved+lighter&ref=sr_gallery-1-3&pro=1&sts=1&content_source=' + 'a'.repeat(400);
  assert.ok(long.length > 600 && long.length < MAX_LINK_CHARS);
  const many = Array.from({ length: 8 }, (_, i) => long + i);
  assert.deepEqual(productLinks(many.join('\n')).split('\n'), many, 'nothing is cut off, even past the old 3000 total');
  assert.equal(productLinks('www.etsy.com/listing/1/x  etsy.com/listing/2'), 'https://www.etsy.com/listing/1/x\nhttps://etsy.com/listing/2');
  assert.equal(productLinks('http://shop.example/a'), 'http://shop.example/a', 'existing scheme kept');
  assert.equal(productLinks('javascript:alert(1)'), 'javascript:alert(1)', 'other schemes are not rewritten (and still fail validation)');
  assert.equal(productLinks('hello'), 'hello', 'plain words are left for validation to refuse');
  assert.equal(productLinks(Array.from({ length: 12 }, (_, i) => 'https://a.com/' + i).join(' ')).split('\n').length, 10);
});

test('the browser link helper matches the server rule', async () => {
  const src = await read('p/common.js');
  const ctx = { window: {}, document: { documentElement: {}, addEventListener() {}, querySelector() {}, querySelectorAll() { return []; } }, navigator: {}, localStorage: { getItem() {}, setItem() {} }, Intl, Date, console, setTimeout, URL };
  vm.runInNewContext(src, ctx);
  const { fullLink } = ctx.window.DL;
  for (const v of ['www.etsy.com/listing/1/x', 'etsy.com/listing/2?ref=a', 'https://x.com/a', 'mailto:a@b.co', 'hello', ''])
    assert.equal(fullLink(v), productLinks(v), v);
});

test('order forms accept long links; the client form completes https://', async () => {
  const portal = await read('portal/portal.js'), admin = await read('admin/admin.js');
  assert.ok(portal.includes('data-link type="url" inputmode="url" maxlength="2000"'));
  assert.ok(admin.includes('data-link type="url" inputmode="url" maxlength="2000"'));
  assert.ok(!/data-link[^>]*maxlength="300"/.test(portal + admin), 'no 300-character product link boxes left');
  assert.ok(portal.includes('i.value = fullLink(i.value)') && admin.includes('i.value = window.DL.fullLink(i.value)'));
});

test('client portal: local dates, account-wide home numbers, blank customer paid, delivered confirmation', async () => {
  const portal = await read('portal/portal.js'), i18n = await read('p/i18n.js');
  assert.ok(!/new Date\(\)\.toISOString\(\)\.slice/.test(portal), 'no UTC "today" defaults');
  assert.ok(portal.includes('const today = localDay();') && portal.includes('value="${localDay().slice(0,7)}"'));
  assert.ok(portal.includes('const all = storeOrders(), active = all.filter(inProgress).length;'));
  assert.ok(portal.includes('ordersTable(all.slice(0, 5), true)'));
  assert.ok(portal.includes("o.sellingPrice == null ? '<span class=\"dim\">Not entered</span>'"));
  assert.ok(portal.includes('data-really-delivered=') && !/data-delivered[\s\S]{0,80}mark-delivered/.test(portal.slice(portal.indexOf("const delivered=t.closest"), portal.indexOf('const reallyDelivered'))), 'first click only asks');
  for (const s of ['Has your customer received the parcel?', 'Only mark it as delivered once it has arrived.', 'Yes, mark as delivered', 'Keep it', 'Not entered', 'Not yet'])
    assert.ok(i18n.includes(`'${s}':`), s);
  assert.ok(portal.includes('Click “Send a new order” and fill in') && i18n.includes('Click “Send a new order” and fill in'));
});
