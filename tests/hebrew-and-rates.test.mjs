import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SHIPPING_RATES } from '../server/portal.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('shipping rates are no longer in the public files clients download', () => {
  const common = read('dist/p/common.js'), portal = read('dist/portal/portal.js');
  assert.doesNotMatch(common, /general: 18/);
  assert.match(common, /const RATES = \{\};/);
  assert.doesNotMatch(portal, /viewRates|#\/rates|Shipping rates/);
  assert.equal(SHIPPING_RATES.US.general, 18);
  assert.equal(SHIPPING_RATES.FR.eu, true);
  assert.match(read('server/portal.mjs'), /rates: SHIPPING_RATES/);
});

test('Hebrew: translator handles fixed text, counts, dates and "a · b" combinations', () => {
  const doc = { documentElement: { lang: 'en', dir: 'ltr' }, querySelector: () => null, body: null, addEventListener() {} };
  const ctx = { window: {}, document: doc, location: { search: '?lang=he', pathname: '/portal/' }, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' }, URLSearchParams, MutationObserver: class { observe() {} }, NodeFilter: {}, WeakMap, Map };
  vm.createContext(ctx);
  vm.runInContext(read('dist/p/i18n.js'), ctx);
  const t = ctx.window.DLi18n.t;
  assert.equal(ctx.window.DLi18n.lang, 'he');
  assert.equal(doc.documentElement.dir, 'rtl');
  assert.equal(t('New order'), 'הזמנה חדשה');
  assert.equal(t('Pending'), 'ממתינה');
  assert.equal(t('3 accounts'), '3 חשבונות');
  assert.equal(t('Oct 8, 2026'), '8 באוקטובר 2026');
  assert.equal(t('Billed $71.70 · paid $40.00'), 'חויב $71.70 · שולם $40.00');
  assert.equal(t('Oak & Ember Co · Oct 8, 2026'), 'Oak & Ember Co · 8 באוקטובר 2026');
  assert.equal(t('United States (US)'), 'ארצות הברית (US)');
  assert.equal(t('Import 3 orders'), 'ייבוא 3 הזמנות');
  assert.equal(t('Blue Fern Studio'), 'Blue Fern Studio'); // customer data stays as typed
  assert.equal(t('0.5 kg × $18.00/kg = $9.00 + $4.00 registration + $4.00 EU tax'), '0.5 ק״ג × $18.00/ק״ג = $9.00 + $4.00 רישום + $4.00 מס EU');
});

test('admin + portal load the translator first, portal has the language switch', () => {
  for (const p of ['dist/admin/index.html', 'dist/portal/index.html']) {
    const h = read(p);
    assert.ok(h.indexOf('/p/i18n.js') > 0 && h.indexOf('/p/i18n.js') < h.indexOf('/p/common.js'), p);
  }
  assert.match(read('dist/portal/portal.js'), /data-lang-toggle/);
  assert.match(read('dist/p/common.js'), /data-lang-switch/);
});
