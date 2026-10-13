import test from 'node:test';
import assert from 'node:assert/strict';
import { afterFailure, loginKeys, clientIp, LIMITS, LOCK_SECONDS, WINDOW_SECONDS, LOCK_MESSAGE, LOGIN_LIMIT_SCHEMA } from '../server/login-limit.mjs';
import { SCHEMA, handlePortal } from '../server/portal.mjs';
import { route } from '../api/index.mjs';

// In-memory login_attempts table; every other query finds nothing (so only the env admin can sign in).
function memoryDB() {
  const attempts = new Map();
  const DB = {
    attempts,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async all() {
          if (/FROM login_attempts WHERE key IN/.test(sql)) return { results: args.filter(k => attempts.has(k)).map(k => ({ key: k, ...attempts.get(k) })) };
          return { results: [] };
        },
        async first() { return null; },
        async run() {
          if (/INSERT INTO login_attempts/.test(sql)) { const [key, failures, first_at, locked_until] = args; attempts.set(key, { failures, first_at, locked_until }); }
          else if (/DELETE FROM login_attempts WHERE key = \?/.test(sql)) attempts.delete(args[0]);
          else if (/DELETE FROM login_attempts WHERE first_at/.test(sql)) for (const [k, r] of attempts) if (r.first_at < args[0] && r.locked_until < args[1]) attempts.delete(k);
          return {};
        },
      };
      return stmt;
    },
  };
  return DB;
}

const env = { ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'right-pass', APP_SESSION_SECRET: 'test-secret' };
const login = (path, username, password, ip = '1.2.3.4') => new Request('https://x' + path, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify({ username, password }),
});
const viaApi = (DB, ...a) => route(login('/api/auth/login', ...a), { db: DB, env });
const viaPortal = (DB, ...a) => { const r = login('/api/portal/login', ...a); return handlePortal(r, new URL(r.url), { DB, env }); };

test('a failure count resets after the window and locks at the limit', () => {
  const t = 1_000_000;
  assert.deepEqual(afterFailure(undefined, 5, t), { failures: 1, first_at: t, locked_until: 0 });
  assert.deepEqual(afterFailure({ failures: 3, first_at: t, locked_until: 0 }, 5, t + 60), { failures: 4, first_at: t, locked_until: 0 });
  assert.deepEqual(afterFailure({ failures: 4, first_at: t, locked_until: 0 }, 5, t + 60), { failures: 5, first_at: t, locked_until: t + 60 + LOCK_SECONDS });
  assert.deepEqual(afterFailure({ failures: 4, first_at: t, locked_until: 0 }, 5, t + WINDOW_SECONDS), { failures: 1, first_at: t + WINDOW_SECONDS, locked_until: 0 }, 'old window starts over');
});

test('keys ignore username case, and the IP comes from Vercel headers', () => {
  assert.deepEqual(loginKeys(' Shahar111 ', '9.9.9.9'), { userIp: 'u:shahar111|ip:9.9.9.9', ip: 'ip:9.9.9.9', user: 'u:shahar111' });
  assert.equal(clientIp(new Request('https://x', { headers: { 'x-forwarded-for': '5.5.5.5, 10.0.0.1' } })), '5.5.5.5');
  assert.equal(clientIp(new Request('https://x', { headers: { 'x-real-ip': '6.6.6.6', 'x-forwarded-for': '5.5.5.5' } })), '6.6.6.6');
  assert.equal(clientIp(new Request('https://x')), 'unknown');
  assert.ok(SCHEMA.includes(LOGIN_LIMIT_SCHEMA[0]), 'table is created with the portal schema');
});

test('five wrong passwords lock that username on that device, even with the right password', async () => {
  const DB = memoryDB();
  for (let i = 0; i < LIMITS.userIp; i++) assert.equal((await viaApi(DB, 'boss', 'wrong')).status, 401);
  const locked = await viaApi(DB, 'boss', 'right-pass');
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).error, LOCK_MESSAGE);
  assert.ok(Number(locked.headers.get('retry-after')) > 0 && Number(locked.headers.get('retry-after')) <= LOCK_SECONDS);
  assert.equal(locked.headers.get('set-cookie'), null, 'no session while locked');
  assert.equal((await viaPortal(DB, 'BOSS', 'right-pass')).status, 429, 'portal login shares the lock; case ignored');
  assert.equal((await viaApi(DB, 'boss', 'right-pass', '7.7.7.7')).status, 200, 'the real user on another device still gets in');
});

test('the lock ends after its time, and a successful sign-in clears the count', async () => {
  const DB = memoryDB();
  for (let i = 0; i < LIMITS.userIp; i++) await viaPortal(DB, 'boss', 'wrong');
  for (const r of DB.attempts.values()) if (r.locked_until) r.locked_until = Math.floor(Date.now() / 1000) - 1;
  const ok = await viaPortal(DB, 'boss', 'right-pass');
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.get('set-cookie'));
  assert.equal(DB.attempts.has('u:boss|ip:1.2.3.4'), false);
  for (let i = 0; i < LIMITS.userIp - 1; i++) assert.equal((await viaApi(DB, 'boss', 'wrong')).status, 401, 'count started again from zero');
});

test('one device guessing many usernames is locked for every username', async () => {
  const DB = memoryDB();
  for (let i = 0; i < LIMITS.ip; i++) await viaApi(DB, 'guess' + i, 'x', '8.8.8.8');
  assert.equal((await viaApi(DB, 'boss', 'right-pass', '8.8.8.8')).status, 429);
  assert.equal((await viaApi(DB, 'boss', 'right-pass', '1.1.1.1')).status, 200);
});

test('many devices guessing one username are slowed down too', async () => {
  const DB = memoryDB();
  for (let i = 0; i < LIMITS.user; i++) await viaApi(DB, 'boss', 'wrong', '10.0.0.' + i);
  assert.equal((await viaApi(DB, 'boss', 'right-pass', '10.9.9.9')).status, 429);
  assert.ok(LIMITS.user > LIMITS.ip && LIMITS.ip > LIMITS.userIp);
});

test('the lock message is translated and shown on every login page', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = p => readFile(new URL('../dist/' + p, import.meta.url), 'utf8');
  assert.ok((await read('p/i18n.js')).includes(`'${LOCK_MESSAGE}':`));
  assert.ok((await read('en/app.js')).includes('response.status===429'));
  assert.ok((await read('app.js')).includes('response.status===429'));
});
