// Local check for failed sign-in limits (branch claude/login-limit), run from the project root:
//   node checks/check-login-limit.mjs
// Uses an in-memory Postgres (PGlite) with a real client account. No live data.
import assert from 'node:assert/strict';
import { DB, env, seed } from './lib.mjs';
import { handlePortal } from '../server/portal.mjs';
import { route } from '../api/index.mjs';
import { LIMITS, LOCK_MESSAGE } from '../server/login-limit.mjs';

const req = (path, username, password, ip) => new Request('http://localhost' + path, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify({ username, password }),
});
const portal = async (u, p, ip) => { const r = req('/api/portal/login', u, p, ip); return handlePortal(r, new URL(r.url), { DB, env, waitUntil: x => x.catch(() => {}) }); };
const api = (u, p, ip) => route(req('/api/auth/login', u, p, ip), { db: DB, env });

await seed(); // creates client "localclient" / "clientpass123"

// A client: 5 wrong passwords from one device lock that device, on both login routes.
for (let i = 0; i < LIMITS.userIp; i++) assert.equal((await portal('localclient', 'wrong', '1.1.1.1')).status, 401);
const locked = await api('LocalClient', 'clientpass123', '1.1.1.1');
assert.equal(locked.status, 429);
assert.equal((await locked.json()).error, LOCK_MESSAGE);
assert.ok(Number(locked.headers.get('retry-after')) > 800);
assert.equal((await portal('localclient', 'clientpass123', '2.2.2.2')).status, 200, 'same client on another device');

const rows = (await DB.prepare("SELECT key, failures, locked_until FROM login_attempts ORDER BY key").all()).results;
assert.ok(rows.find(r => r.key === 'u:localclient|ip:1.1.1.1' && Number(r.locked_until) > 0), JSON.stringify(rows));

// After the lock passes, the right password works and clears the device count.
await DB.prepare('UPDATE login_attempts SET locked_until = ? WHERE locked_until > 0').bind(Math.floor(Date.now() / 1000) - 1).run();
assert.equal((await api('localclient', 'clientpass123', '1.1.1.1')).status, 200);
assert.equal(await DB.prepare("SELECT key FROM login_attempts WHERE key = 'u:localclient|ip:1.1.1.1'").first(), null);

// The env admin is covered too.
for (let i = 0; i < LIMITS.userIp; i++) await api(env.ADMIN_USERNAME, 'nope', '3.3.3.3');
assert.equal((await api(env.ADMIN_USERNAME, env.ADMIN_PASSWORD, '3.3.3.3')).status, 429);
assert.equal((await api(env.ADMIN_USERNAME, env.ADMIN_PASSWORD, '4.4.4.4')).status, 200);

console.log('Login limit check passed on PGlite:', rows.length, 'attempt rows after the client lock.');
