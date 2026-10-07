import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Direct Line clients is the first sidebar group and the landing page', () => {
  for (const page of ['dist/en/index.html', 'dist/index.html']) {
    const html = read(page);
    const clients = html.indexOf('data-client-tab="overview"'), stores = html.indexOf('data-section="overview"');
    assert.ok(clients > 0 && clients < stores, page + ': client group comes before Daniel’s stores');
    for (const tab of ['overview', 'orders', 'clients', 'settings']) assert.match(html, new RegExp(`data-client-tab="${tab}"`));
    assert.match(html, /\/p\/stores-admin\.js\?v=\d+/);
  }
  const bridge = read('dist/p/clients-section.js');
  assert.match(bridge, /open\('overview'\)/);
  assert.match(bridge, /dl-set-tab/);
  const admin = read('dist/admin/admin.js');
  assert.match(admin, /tab: 'overview'/);
  assert.match(admin, /function renderOverview/);
  assert.match(admin, /Needs your attention/);
});

test('Daniel’s stores can be added and removed (hidden, restorable)', () => {
  const server = read('server/portal.mjs');
  assert.match(server, /CREATE TABLE IF NOT EXISTS dashboard_stores/);
  assert.match(server, /path === '\/admin\/stores' && method === 'POST'/);
  const ui = read('dist/p/stores-admin.js');
  assert.match(ui, /remove: k => setHidden\(k, true\)/);
  assert.match(ui, /restore: k => setHidden\(k, false\)/);
  assert.match(read('dist/p/live-sections.js'), /data-ls="store-remove"|'store-remove'/);
});
