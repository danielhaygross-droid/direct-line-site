import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createSessionCookie, handlePortal } from '../server/portal.mjs';

test('old import bookmarks redirect to Home, including admin preview', () => {
  const js = readFileSync(new URL('../dist/portal/portal.js', import.meta.url), 'utf8');
  const route = js.slice(js.indexOf('  function route()'), js.indexOf('  const go ='));
  for (const hash of ['#/import', '#/import/123']) {
    for (const preview of [false, true]) {
      const location = { hash, replace(next) { this.hash = next; } };
      const ctx = { location, panel:null, S: { me: { preview } } };
      vm.runInNewContext(route + '\nroute();', ctx);
      assert.equal(location.hash, '#/home');
    }
  }
});

test('retired import endpoint rejects clients and admins without writing orders', async () => {
  const env = { APP_SESSION_SECRET: 'local-test-only' };
  const DB = { prepare(sql) {
    assert.match(sql, /SELECT active, archived,|portal_terms_versions|client_terms_acceptances/);
    return { bind() { return this; }, async first() { if (sql.includes('portal_terms_versions')) return { version: 1, english: '', hebrew: '' }; if (sql.includes('client_terms_acceptances')) return { version: 1, accepted_at: 1 }; return { active: true, archived: false }; } };
  } };
  for (const role of ['client-7', 'admin']) {
    const cookie = (await createSessionCookie(role, env.APP_SESSION_SECRET)).split(';')[0];
    const request = new Request('https://local.test/api/portal/orders/import', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ orders: [{ orderRef: 'unused' }] }),
    });
    const response = await handlePortal(request, new URL(request.url), { DB, env });
    assert.equal(response.status, role === 'admin' ? 404 : 403);
  }
});

test('existing imported orders remain readable with their source and photo exemption', async () => {
  const env = { APP_SESSION_SECRET: 'local-test-only' };
  const row = { id: 12, client_id: 7, source: 'etsy-csv', status: 'pending', order_ref: 'E-12', price: 0 };
  const DB = { prepare(sql) {
    return { bind() { return this; }, async first() {
      if (sql.includes('portal_terms_versions')) return { version: 1, english: '', hebrew: '' };
      if (sql.includes('client_terms_acceptances')) return { version: 1, accepted_at: 1 };
      assert.match(sql, /SELECT active, archived,|portal_terms_versions|client_terms_acceptances/);
      return { active: true, archived: false };
    }, async all() {
      if (sql.includes('FROM client_orders')) return { results: [row] };
      assert.match(sql, /FROM (order_photos|order_messages)/);
      return { results: [] };
    } };
  } };
  const cookie = (await createSessionCookie('client-7', env.APP_SESSION_SECRET)).split(';')[0];
  const request = new Request('https://local.test/api/portal/orders', { headers: { cookie } });
  const response = await handlePortal(request, new URL(request.url), { DB, env });
  assert.equal(response.status, 200);
  const { orders } = await response.json();
  assert.equal(orders[0].source, 'etsy-csv');
  assert.equal(orders[0].orderRef, 'E-12');
  assert.deepEqual(orders[0].photos, []);
});
