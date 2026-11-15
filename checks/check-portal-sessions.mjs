// Check: one sign-in per portal in the same browser (Erwin, 16 Nov 2026: "its a hassle that i need to logged out again and
// again on my admin portal just to see the client portal or supplier portal").
// Admin, client and supplier logins get their own cookie; each portal reads its own; logging out of one keeps the others.
//   node checks/check-portal-sessions.mjs      (API only, in-memory Postgres)
import assert from 'node:assert/strict';
import { pg, DB, env, call, seed } from './lib.mjs';
import { route, } from '../api/index.mjs';
const { admin, client, id } = await seed();
assert.equal((await call('/admin/users', 'POST', { username: 'sup-s', name: 'Ada', password: 'supplierpass1', role: 'supplier' }, admin)).status, 200);
const sup = (await call('/login', 'POST', { username: 'sup-s', password: 'supplierpass1' })).cookie;
assert.match(admin, /^dl_session=/); assert.match(client, /^dl_client=/); assert.match(sup, /^dl_supplier=/);

// One browser holding all three sign-ins.
const all = [admin, client, sup].join('; ');
const me = async (headers, cookie = all) => (await call('/me', 'GET', null, cookie, headers));
assert.equal((await me({ 'x-dl-portal': 'admin' })).data.role, 'admin');
assert.equal((await me({ 'x-dl-portal': 'client' })).data.role, 'client');
assert.equal((await me({ 'x-dl-portal': 'supplier' })).data.role, 'supplier');
// Without the header the page's address decides (image and download links send no header).
assert.equal((await me({ referer: 'https://x.test/portal/' })).data.role, 'client');
assert.equal((await me({ referer: 'https://x.test/supplier/#orders' })).data.role, 'supplier');
assert.equal((await me({ referer: 'https://x.test/admin/' })).data.role, 'admin');
assert.equal((await me({ referer: 'https://x.test/portal/?as=' + id })).data.role, 'admin', 'the admin preview of a client stays the admin');
assert.equal((await call('/orders', 'GET', null, all, { 'x-dl-portal': 'client', 'x-dl-view-as': String(id) })).status, 200, 'preview header: read as the admin');
const rt = (p, cookie, headers = {}, method = 'GET') => route(new Request('http://localhost' + p, { method, headers: { cookie, ...headers } }), { db: DB, env });
// The main page and the store dashboard only ever use the admin sign-in.
assert.equal((await (await rt('/api/auth/session', all)).json()).role, 'admin');
assert.equal((await rt('/api/auth/session', [client, sup].join('; '))).status, 401, 'no admin sign-in: the main page shows its login, whoever else is signed in');
assert.notEqual((await rt('/api/stores', all)).status, 403); assert.notEqual((await rt('/api/stores', all)).status, 401);

// An admin with no supplier / client sign-in still opens those portals as the admin (admin view, client picker).
assert.equal((await me({ 'x-dl-portal': 'supplier' }, admin)).data.role, 'admin');
assert.equal((await me({ 'x-dl-portal': 'client' }, admin)).data.role, 'admin');
// A supplier or client sign-in never opens the admin.
assert.equal((await me({ 'x-dl-portal': 'admin' }, [client, sup].join('; '))).status, 401);
assert.equal((await me({ 'x-dl-portal': 'client' }, sup)).status, 401, 'a supplier sign-in is not used by the client portal');
assert.equal((await me({ 'x-dl-portal': 'supplier' }, client)).status, 401, 'a client sign-in is not used by the supplier portal');

// Older sign-ins (a client or supplier still in dl_session) keep working in their own portal.
const legacy = 'dl_session=' + client.split('=').slice(1).join('=');
assert.equal((await me({ 'x-dl-portal': 'client' }, legacy)).data.role, 'client');
assert.equal((await me({}, legacy)).data.role, 'client');

// Log out ends one sign-in only.
const out = async portal => (await rt('/api/auth/logout', all, { 'x-dl-portal': portal }, 'POST')).headers.get('set-cookie');
assert.match(await out('supplier'), /^dl_supplier=; .*Max-Age=0/);
assert.match(await out('client'), /^dl_client=; .*Max-Age=0/);
assert.match(await out('admin'), /^dl_session=; .*Max-Age=0/);
assert.match((await rt('/api/auth/logout', all, {}, 'POST')).headers.get('set-cookie'), /^dl_session=;/, 'the main page logs the admin out');
// Signing in sets only the cookie of that kind of login.
const again = await rt('/api/auth/login', all, { 'content-type': 'application/json' }, 'POST');
assert.equal(again.status, 401);
console.log('PASS one sign-in per portal: admin, client and supplier side by side; each portal reads its own; log out ends one');
await pg.close();
