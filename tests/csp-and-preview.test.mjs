import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../dist/' + p, import.meta.url), 'utf8');

test('portal and admin pages have no inline scripts (the security policy blocks them)', () => {
  for (const p of ['portal/index.html', 'admin/index.html']) {
    const inline = [...read(p).matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    assert.equal(inline.length, 0, p + ' has an inline <script>');
  }
  assert.match(read('portal/index.html'), /<script src="\/portal\/boot\.js\?v=\d+"><\/script>/);
  assert.match(read('portal/boot.js'), /dl_portal_theme/);
});

test('admin preview of a client portal hides every add / edit / message control', () => {
  const css = read('portal/portal.css');
  for (const sel of ['.new-btn', '.fab', '[data-nav=new]', '[data-nav=import]', 'a[href^="#/edit/"]', '[data-cancel-order]', '.composer', '.pm-add', '.pm-remove'])
    assert.ok(css.includes(sel), 'preview hides ' + sel);
  assert.match(read('portal/portal.js'), /S\.me\?\.preview && \['new', 'edit', 'import'\]\.includes\(S\.route\)/);
});

test('admin order form has the same order fields as the client form', () => {
  const js = read('admin/admin.js');
  for (const name of ['orderDate', 'currency', 'sellingPrice', 'quantity', 'sku', 'variant', 'buyerName', 'address1', 'destination', 'notes'])
    assert.ok(js.includes(`name="${name}"`), 'admin form has ' + name);
  assert.ok(js.includes('data-link-add') && js.includes('data-pick-input'), 'product links + photos');
});

test('Hebrew also translates the small labels on phone tables', () => {
  assert.match(read('p/i18n.js'), /const ATTRS = \[[^\]]*'data-label'/);
});
