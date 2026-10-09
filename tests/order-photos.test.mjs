import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('client order form requires product photos and the product link', () => {
  const portal = read('dist/portal/portal.js');
  const form = portal.slice(portal.indexOf('function viewForm()'), portal.indexOf('// ---------- messages'));
  assert.match(form, /Photo or screenshot of the product/);
  assert.match(form, /data-pick-input/);
  assert.match(form, /data-link-add/);
  assert.match(form, /Full address and phone/);
  assert.doesNotMatch(form, /name="itemTitle"/);
  // Everything missing is listed at once ("Please fill in: …"); photo and link are both checked.
  assert.match(form, /check\('photos', picks\.length \|\| ed\?\.source === 'etsy-csv'/);
  assert.match(form, /check\('links', links\.length && !badLink/);
  assert.match(form, /Please fill in: /);
  assert.match(portal, /document\.addEventListener\('paste'/);
});

test('server stores photos per order and enforces photo + link for client orders', () => {
  const server = read('server/portal.mjs');
  assert.match(server, /CREATE TABLE IF NOT EXISTS order_photos/);
  assert.match(server, /if \(!who\.admin && !f\.etsy_url\)/);
  assert.match(server, /if \(!who\.admin && !photos\.length\)/);
  assert.match(server, /function sniffImage/);
  assert.match(server, /An order needs at least one photo/);
  assert.match(server, /'cache-control': 'private, max-age=31536000, immutable'/);
});

test('admin and client order drawers show the product photos and link', () => {
  const common = read('dist/p/common.js');
  assert.match(common, /function shrinkImage/);
  assert.match(common, /function productMedia/);
  assert.match(read('dist/portal/portal.js'), /data-d-media/);
  assert.match(read('dist/admin/admin.js'), /productMedia\(o, \{ removable: true/);
  assert.match(read('dist/admin/admin.js'), /data-photo-add/);
});
