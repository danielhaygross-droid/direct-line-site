// Check: team logins (Erwin, 15 Nov 2026). The supplier's Ye had been made an ADMIN login by mistake, and a disabled
// admin used to stay signed in until the session ran out (up to 30 days).
//   node checks/check-team-roles.mjs      (run from the repo root)
// Now: admin sessions end at once when the login is disabled, its type or password changes; an admin login can be
// turned into a supplier login (and back); a bare "admin" cookie from before no longer works anywhere; each team login
// has a position shown next to its name.
import assert from 'node:assert/strict';
import { DB, call, env } from './lib.mjs';
import { route } from '../api/index.mjs';
import { createSessionCookie } from '../server/portal.mjs';
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const rt = (p, cookie) => route(new Request('http://localhost' + p, { headers: { cookie } }), { db: DB, env });

const boss = (await call('/login', 'POST', { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD })).cookie;
ok(await call('/admin/overview', 'GET', null, boss));
// An old bare "admin" cookie (signed with the right secret) is refused by the portal API and the store dashboard API.
const old = (await createSessionCookie('admin', env.APP_SESSION_SECRET)).split(';')[0];
assert.equal((await call('/admin/overview', 'GET', null, old)).status, 401, 'old admin cookie: portal');
assert.equal((await rt('/api/stores', old)).status, 401, 'old admin cookie: store dashboard');
assert.equal((await rt('/api/auth/session', old)).status, 401, 'old admin cookie: session');

// A DB admin: signed in until disabled, then out at once.
const yeId = ok(await call('/admin/users', 'POST', { username: 'admin02', name: 'Ye', password: 'yepassword1', role: 'admin' }, boss)).id;
const ye = (await call('/login', 'POST', { username: 'admin02', password: 'yepassword1' })).cookie;
ok(await call('/admin/overview', 'GET', null, ye));
assert.equal((await rt('/api/auth/session', ye)).status, 200);
ok(await call('/admin/users/' + yeId, 'POST', { active: false }, boss));
assert.equal((await call('/admin/overview', 'GET', null, ye)).status, 401, 'disabled admin: signed out at once');
assert.equal((await rt('/api/stores', ye)).status, 401, 'disabled admin: store dashboard too');
ok(await call('/admin/users/' + yeId, 'POST', { active: true }, boss));
assert.equal((await call('/admin/overview', 'GET', null, ye)).status, 401, 'enabling again does not bring the old session back');

// Turn the admin login into a supplier login: the admin session ends; the next sign-in opens the supplier portal only.
const ye2 = (await call('/login', 'POST', { username: 'admin02', password: 'yepassword1' })).cookie;
ok(await call('/admin/overview', 'GET', null, ye2));
ok(await call('/admin/users/' + yeId, 'POST', { role: 'supplier', position: 'Supplier · Beyond' }, boss));
assert.equal((await call('/admin/overview', 'GET', null, ye2)).status, 401, 'type changed: admin session ends');
const sup = await call('/login', 'POST', { username: 'admin02', password: 'yepassword1' });
assert.equal(sup.data.redirect, '/supplier/');
assert.ok([403, 404].includes((await call('/admin/overview', 'GET', null, sup.cookie)).status), 'now a supplier: no admin');
ok(await call('/supplier/billing', 'GET', null, sup.cookie));
const ov = ok(await call('/admin/overview', 'GET', null, boss));
assert.ok(!ov.admins.some(a => a.id === yeId), 'no longer in Team accounts');
assert.deepEqual(ov.suppliers.filter(s => s.id === yeId).map(s => [s.role, s.position]), [['supplier', 'Supplier · Beyond']], 'listed under Supplier logins with its position');

// Positions on admins; clients can't change type; only admins can change anyone.
const eId = ok(await call('/admin/users', 'POST', { username: 'erwin-x', name: 'Erwin', password: 'erwinpass12', role: 'admin' }, boss)).id;
ok(await call('/admin/users/' + eId, 'POST', { position: 'Developer' }, boss));
assert.equal(ok(await call('/admin/overview', 'GET', null, boss)).admins.find(a => a.id === eId).position, 'Developer');
const cId = ok(await call('/admin/users', 'POST', { username: 'client-x', name: 'C', password: 'clientpass12', role: 'client' }, boss)).id;
assert.equal((await call('/admin/users/' + cId, 'POST', { role: 'admin' }, boss)).status, 400, 'a client can’t be made an admin');
assert.ok([403, 404].includes((await call('/admin/users/' + eId, 'POST', { role: 'admin' }, sup.cookie)).status), 'a supplier can’t change logins');
console.log('PASS admin sessions end at once (disabled, type changed); old bare admin cookies refused; admin -> supplier login; positions shown');

// Owners (Erwin, 15 Nov 2026: "me, Shahar and Daniel are the only ones" who remove co-admins). The main login is one.
assert.equal(ok(await call('/admin/overview', 'GET', null, boss)).me.owner, true, 'main login = owner');
const erwin = (await call('/login', 'POST', { username: 'erwin-x', password: 'erwinpass12' })).cookie;
assert.equal(ok(await call('/admin/overview', 'GET', null, erwin)).me.owner, false);
assert.equal((await call('/admin/users', 'POST', { username: 'co-1', name: 'Co', password: 'copassword1', role: 'admin' }, erwin)).status, 403, 'not an owner: can’t add admins');
assert.equal((await call('/admin/users', 'POST', { username: 'sup-2', name: 'S', password: 'suppass1234', role: 'supplier' }, erwin)).status, 403, 'not an owner: can’t add suppliers');
assert.equal((await call('/admin/users/' + yeId, 'POST', { password: 'takeover123' }, erwin)).status, 403, 'not an owner: can’t change a team login');
ok(await call('/admin/users', 'POST', { username: 'client-y', name: 'Client Y', password: 'clientpass12', role: 'client' }, erwin)); // clients: any admin
ok(await call('/admin/users/' + eId, 'POST', { owner: true }, boss));
const coId = ok(await call('/admin/users', 'POST', { username: 'co-1', name: 'Co', password: 'copassword1', role: 'admin' }, erwin)).id;
const co = (await call('/login', 'POST', { username: 'co-1', password: 'copassword1' })).cookie;
ok(await call('/admin/overview', 'GET', null, co));
assert.equal((await call('/admin/users/' + eId, 'POST', { archived: true }, erwin)).status, 400, 'nobody removes their own login');
assert.equal((await call('/admin/users/' + eId, 'POST', { owner: false }, erwin)).status, 400, 'nobody un-owns themselves');
assert.equal((await call('/admin/users/' + eId, 'POST', { archived: true }, co)).status, 403, 'a co-admin can’t remove an owner');
ok(await call('/admin/users/' + coId, 'POST', { archived: true }, erwin));
assert.equal((await call('/admin/overview', 'GET', null, co)).status, 401, 'removed: signed out at once');
assert.equal((await call('/login', 'POST', { username: 'co-1', password: 'copassword1' })).status, 401, 'removed: can’t sign in');
const after = ok(await call('/admin/overview', 'GET', null, boss));
assert.ok(!after.admins.some(a => a.id === coId), 'removed admin is not listed');
assert.ok(await DB.prepare('SELECT id FROM users WHERE id = ?').bind(coId).first(), 'kept in the database (archived, not deleted)');
assert.equal(after.admins.find(a => a.id === eId).owner, true);
console.log('PASS only owners add, change or remove team logins; remove = archived + signed out; nobody removes or un-owns themselves');
