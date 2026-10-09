import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pull sheetMonthTabs (and what it needs) out of the built server module.
const src = readFileSync(new URL('../server/worker.mjs', import.meta.url), 'utf8');
const body = start => { const i = src.indexOf(start); let d = 0, j = i; for (; j < src.length; j++) { if (src[j] === '{') d++; if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };
const code = src.match(/const SHEET_MONTHS=\{[^}]*\};/)[0] + src.match(/const SUPPLIER_SHEETS=[^;]*;/)[0] + src.match(/const titleCase=[^;]*;/)[0] + body('function sheetMonthTabs');
const sheetMonthTabs = new Function(code + '; return sheetMonthTabs;')();
const tab = (i, gid, name) => `[${i},0,\\"${gid}\\",[{\\"1\\":[[0,0,\\"${name}\\"`;

test('supplier sheet: every month tab is read, in sheet order, other tabs ignored', () => {
  const html = 'x' + tab(0, '1490667559', 'JUNE') + tab(1, '451041393', 'September') + tab(2, '703985735', 'October') + tab(3, '99', 'November') + tab(4, '350346497', 'summary') + 'y';
  assert.equal(JSON.stringify(sheetMonthTabs(html)), JSON.stringify([['June', '1490667559'], ['September', '451041393'], ['October', '703985735'], ['November', '99']]));
  assert.equal(sheetMonthTabs('<html></html>').length, 0); // caller falls back to the known list
});

test('supplier sheet: October is in the fallback list and the cache key was bumped', () => {
  assert.match(src, /\['October','703985735'\]/);
  assert.match(src, /SUPPLIER_CACHE_KEY='supplier-summary-v4'/);
});
