import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSessionCookie, handlePortal, actorOf, SCHEMA } from '../server/portal.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// Just enough of the database for the "Log in as client" rules; every write is recorded.
function database() {
  const writes = [];
  return { writes, prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; },
      async first() {
        if (sql.includes("SELECT id FROM users WHERE id = ? AND role = 'client'")) return args[0] === 7 ? { id: 7 } : null;
        if (sql.includes('SELECT active, archived, password_reset_required, session_version FROM users')) return { active: true, archived: false, password_reset_required: true, session_version: 3 };
        if (sql.includes('SELECT archived FROM client_orders')) return { archived: false };
        if (sql.includes('SELECT id, client_id FROM client_orders')) return { id: 5, client_id: 7 };
        throw new Error('Unexpected query: ' + sql);
      },
      async run() { writes.push({ sql, args }); },
      async all() { throw new Error('Unexpected query: ' + sql); } };
  } };
}
async function setup() {
  const DB = database(), env = { APP_SESSION_SECRET: 'test-only' };
  const cookie = (await createSessionCookie('admin', env.APP_SESSION_SECRET)).split(';')[0];
  const call = (path, { act = false, as = 7, body } = {}) => {
    const headers = { cookie, 'content-type': 'application/json', 'x-dl-view-as': String(as), ...(act ? { 'x-dl-act': '1' } : {}) };
    const r = new Request('https://local.test/api/portal' + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return handlePortal(r, new URL(r.url), { DB, env });
  };
  return { DB, call };
}
const logged = DB => DB.writes.filter(w => w.sql.includes('INSERT INTO admin_impersonation_log')).map(w => ({ client: w.args[0], method: w.args[1], path: w.args[2], status: w.args[3] }));

test('view only preview still refuses every change', async () => {
  const { DB, call } = await setup();
  const r = await call('/acting/start', { body: {} });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /Log in as client/);
  assert.deepEqual(logged(DB), []);
});

test('logged in as a client: changes are allowed and every one is logged for that client', async () => {
  const { DB, call } = await setup();
  // The client's own password-reset / terms gates don't stop the admin.
  assert.equal((await call('/acting/start', { act: true, body: {} })).status, 200);
  assert.deepEqual(logged(DB), [{ client: 7, method: 'POST', path: '/acting/start', status: 200 }]);
});

test('logged in as a client: password, terms and chat stay with the client, and are still logged', async () => {
  const { DB, call } = await setup();
  assert.equal((await call('/password', { act: true, body: { password: 'something-new' } })).status, 403);
  assert.equal((await call('/terms/accept', { act: true, body: { version: 1, accepted: true } })).status, 403);
  const msg = await call('/orders/5/messages', { act: true, body: { body: 'Hello' } });
  assert.equal(msg.status, 403);
  assert.match((await msg.json()).error, /admin dashboard/);
  assert.ok(!DB.writes.some(w => /order_messages|order_events/.test(w.sql)), 'no message written');
  assert.deepEqual(logged(DB).map(l => [l.path, l.status]), [['/password', 403], ['/terms/accept', 403], ['/orders/5/messages', 403]]);
  // Notifications aren't marked as seen for the client.
  assert.equal((await call('/notifications/seen', { act: true, body: {} })).status, 200);
  assert.ok(!DB.writes.some(w => /notif_seen_at/.test(w.sql)));
});

test('unknown clients cannot be opened', async () => {
  const { call } = await setup();
  assert.equal((await call('/acting/start', { act: true, as: 99, body: {} })).status, 404);
});

test('admin actions taken as the client are recorded as Direct Line', () => {
  assert.equal(actorOf({ admin: true }), 'admin');
  assert.equal(actorOf({ admin: false, acting: true, clientId: 7 }), 'admin');
  assert.equal(actorOf({ admin: false, clientId: 7 }), 'client');
  const server = read('server/portal.mjs');
  assert.ok(!/insertOrder\([^)]*who\.admin \? 'admin' : 'client'/.test(server));
  assert.equal(server.split('who.admin,actorOf(who));').length - 1, 2);
  assert.ok(SCHEMA.some(s => /CREATE TABLE IF NOT EXISTS admin_impersonation_log/.test(s)));
  assert.ok(SCHEMA.some(s => /last_seen_at INTEGER/.test(s)));
  assert.ok(server.includes(String.raw`/^\/admin\/clients\/(\d+)\/activity$/`));
  assert.match(server, /if \(!who\.preview && !who\.acting\) await DB\.prepare\('UPDATE users SET last_seen_at/);
});

test('admin panel, portal banner and Hebrew are wired up', () => {
  const admin = read('dist/admin/admin.js'), portal = read('dist/portal/portal.js'), common = read('dist/p/common.js'), css = read('dist/portal/portal.css'), i18n = read('dist/p/i18n.js');
  assert.ok(admin.includes('/portal/?as=${c.id}&act=1') && admin.includes("['activity', 'Activity']") && admin.includes("api('/admin/clients/' + id + '/activity')"));
  assert.ok(portal.includes("window.DL_ACT = params.get('act') === '1'") && portal.includes('if (S.me.acting) actingBanner();'));
  assert.ok(portal.includes('readOnly:!!(S.me.preview || S.me.acting)'));
  assert.ok(common.includes("window.DL_VIEW_AS && window.DL_ACT ? { 'x-dl-act': '1' }"));
  assert.match(css, /\.is-acting :is\(\.composer,\.quick,\.ask,\[data-ask-go\]\)\{display:none!important\}/);
  for (const k of ['Log in as client', 'Switch to view only', 'Activity', 'Last sign-in', 'What the client did', 'Changes made by admins logged in as this client'])
    assert.ok(i18n.includes(`'${k}': '`), 'Hebrew for ' + k);
  assert.ok(i18n.includes('[/^Logged in as (.+)\\.$/'));
  for (const f of ['dist/admin/index.html', 'dist/portal/index.html']) assert.match(read(f), /\/p\/common\.js\?v=16/);
  assert.match(read('dist/portal/index.html'), /portal\.js\?v=(4[7-9]|[5-9]\d)/);
  assert.match(read('dist/admin/index.html'), /admin\.js\?v=(5[6-9]|[6-9]\d)/);
});
