import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { retryPendingGoogleSheetOrders, syncPortalOrderToGoogleSheet, RETRY_GAP, RETRY_BATCH, RATE_LIMIT_PAUSE, RATE_LIMIT_NOTE } from '../server/google-sheets.mjs';
import { SCHEMA } from '../server/portal.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  APP_SESSION_SECRET: 'unit-test-secret', GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-id',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sheet-writer@example.iam.gserviceaccount.com',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const T0 = Math.floor(Date.now() / 1000);

// In-memory stand-in for the tables the sync touches. `retryUntil` is the portal_settings throttle row.
function fakeDB(count) {
  const orders = new Map(Array.from({ length: count }, (_, i) => [i + 1, {
    id: i + 1, client_id: 7, client_name: 'Test Client', order_ref: 'E-' + (i + 1), status: 'pending', price: 15, quantity: 1,
    created_at: T0 - 100, updated_at: T0 - 100, sheet_sync_attempts: 0, sheet_sync_status: 'waiting', sheet_sync_error: '', sheet_next_try: 0,
  }]));
  const db = { orders, retryUntil: null,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() {
          if (sql.includes('FROM client_orders o JOIN users')) return orders.get(Number(args[0])) || null;
          if (sql.includes('RETURNING key')) { // claim a retry run
            const [until, now] = [Number(args[0]), Number(args[1])];
            if (db.retryUntil !== null && db.retryUntil > now) return null;
            db.retryUntil = until; return { key: 'sheet_retry_until' };
          }
          return null; // supplier sheet switch: off
        },
        async all() {
          if (sql.includes('FROM order_photos')) return { results: [] };
          if (sql.includes("sheet_sync_status <> 'synced'")) {
            const [now, limit] = [Number(args[0]), Number(args[1])];
            return { results: [...orders.values()].filter(o => o.sheet_sync_status !== 'synced' && o.sheet_next_try <= now)
              .sort((a, b) => a.sheet_next_try - b.sheet_next_try || a.id - b.id).slice(0, limit).map(o => ({ id: o.id })) };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO portal_settings (key, value) VALUES ('sheet_retry_until'")) { db.retryUntil = Number(args[0]); return { success: true }; }
          const o = orders.get(Number(args.at(-1)));
          if (!o) return { success: true };
          if (sql.includes("sheet_sync_status='waiting', sheet_sync_attempts=?")) { o.sheet_sync_status = 'waiting'; o.sheet_sync_attempts = Number(args[0]); o.sheet_sync_error = ''; }
          else if (sql.includes("sheet_sync_status='synced'")) { o.sheet_sync_status = 'synced'; o.sheet_sync_error = ''; o.sheet_next_try = 0; }
          else if (sql.includes("sheet_sync_status='waiting', sheet_sync_error=?, sheet_next_try=?")) { o.sheet_sync_status = 'waiting'; o.sheet_sync_error = String(args[0]); o.sheet_next_try = Number(args[1]); }
          else if (sql.includes("sheet_sync_status='error', sheet_sync_error=?, sheet_next_try=?")) { o.sheet_sync_status = 'error'; o.sheet_sync_error = String(args[0]); o.sheet_next_try = Number(args[1]); }
          return { success: true };
        },
      };
      return st;
    } };
  return db;
}

// Google stand-in with a per-minute quota like the real one: 60 writes and 60 reads, then 429.
function fakeGoogle({ writeQuota = 60, readQuota = 60, failWith = null } = {}) {
  const g = { clock: T0, minute: -1, writes: 0, reads: 0, rejected: 0, logAppends: 0, calls: 0,
    async fetch(url, options = {}) {
      url = String(url);
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'token', expires_in: 36000 });
      g.calls++;
      const minute = Math.floor(g.clock / 60);
      if (minute !== g.minute) { g.minute = minute; g.writes = 0; g.reads = 0; }
      const write = (options.method || 'GET') !== 'GET';
      if (failWith) return new Response('boom', { status: failWith });
      if (write ? ++g.writes > writeQuota : ++g.reads > readQuota) {
        g.rejected++;
        return new Response(JSON.stringify({ error: { code: 429, message: "Quota exceeded for quota metric 'Write requests' and limit 'Write requests per minute per user'", status: 'RESOURCE_EXHAUSTED' } }), { status: 429 });
      }
      if (url.includes('Sync%20Log')) g.logAppends++;
      return Response.json(write ? { updates: { updatedRows: 1 } } : { values: [] });
    } };
  return g;
}
const retry = (db, g, now) => { g.clock = now; return retryPendingGoogleSheetOrders(db, env, g.fetch, { now }); };

test('the retry queue column exists and the limits are conservative', () => {
  assert.ok(SCHEMA.some(s => /sheet_next_try INTEGER NOT NULL DEFAULT 0/.test(s)));
  assert.ok(RETRY_GAP >= 30 && RETRY_BATCH <= 5 && RATE_LIMIT_PAUSE >= 60);
});

test('many admin screens polling at once start ONE retry run of at most 4 orders', async () => {
  const db = fakeDB(12), g = fakeGoogle();
  const results = await Promise.all(Array.from({ length: 10 }, () => retry(db, g, T0)));
  const ran = results.filter(r => !r.paused);
  assert.equal(ran.length, 1, 'exactly one run got through');
  assert.equal(ran[0].attempted, RETRY_BATCH);
  assert.equal([...db.orders.values()].filter(o => o.sheet_sync_status === 'synced').length, RETRY_BATCH);
  assert.ok(g.calls <= RETRY_BATCH * 4, 'about 3 Google calls per order, not 10 polls x 20 orders');
  assert.equal((await retry(db, g, T0 + RETRY_GAP - 1)).paused, true, 'still inside the gap');
});

test('a backlog drains quickly without ever hitting the Google quota', async () => {
  const db = fakeDB(25), g = fakeGoogle({ writeQuota: 20, readQuota: 20 }); // a much tighter quota than Google\'s 60
  let now = T0, runs = 0;
  while ([...db.orders.values()].some(o => o.sheet_sync_status !== 'synced') && runs < 20) { await retry(db, g, now); now += RETRY_GAP + 1; runs++; }
  assert.equal([...db.orders.values()].every(o => o.sheet_sync_status === 'synced'), true);
  assert.equal(g.rejected, 0, 'never rate limited');
  assert.ok(runs <= Math.ceil(25 / RETRY_BATCH) + 1, `drained in ${runs} runs`);
});

test('quota exceeded: friendly note, no extra writes, everything pauses, then resumes', async () => {
  const db = fakeDB(6), g = fakeGoogle({ writeQuota: 2 }); // the first order's two writes work, then Google refuses
  const first = await retry(db, g, T0);
  assert.equal(first.rateLimited, true);
  const limited = [...db.orders.values()].find(o => o.sheet_sync_error);
  assert.equal(limited.sheet_sync_status, 'waiting', 'queued, not an error');
  assert.equal(limited.sheet_sync_error, RATE_LIMIT_NOTE);
  assert.ok(!/429|Quota|project_number/.test(limited.sheet_sync_error), 'no raw Google JSON for the admin to see');
  assert.equal(g.logAppends, 1, 'only the first order\'s success log; none for the rate-limited one');
  const callsAfter = g.calls;
  assert.equal((await retry(db, g, T0 + RETRY_GAP + 5)).paused, true, 'paused for 90 s even though the 30 s gap passed');
  assert.equal(g.calls, callsAfter, 'and made no Google calls while paused');
  g.writes = 0; g.clock = T0 + RATE_LIMIT_PAUSE + 5;
  const later = await retry(db, g, T0 + RATE_LIMIT_PAUSE + 5);
  assert.equal(later.paused, undefined); assert.ok(later.synced >= 1, 'resumes after the pause');
});

test('a real error backs the order off and does not starve the others', async () => {
  const db = fakeDB(3), g = fakeGoogle();
  const good = g.fetch; let bad = 0;
  g.fetch = async (url, options) => { if (String(url).includes('Orders!A6') && !bad++) return new Response('server error', { status: 500 }); return good(url, options); };
  await retry(db, g, T0);
  const failed = db.orders.get(1);
  assert.equal(failed.sheet_sync_status, 'error');
  assert.ok(failed.sheet_next_try >= T0 + 119, 'backs off at least ~2 minutes');
  assert.equal(db.orders.get(2).sheet_sync_status, 'synced'); assert.equal(db.orders.get(3).sheet_sync_status, 'synced');
  g.fetch = good;
  assert.equal((await retry(db, g, T0 + 31)).attempted, 0, 'the failed order is not retried before its time');
  const again = await retry(db, g, T0 + 200);
  assert.equal(again.synced, 1); assert.equal(db.orders.get(1).sheet_sync_status, 'synced');
});

test('an order saved while Google is rate limiting stays queued with the friendly note', async () => {
  const db = fakeDB(1), g = fakeGoogle({ writeQuota: 0 });
  await assert.rejects(syncPortalOrderToGoogleSheet(db, env, 1, g.fetch), e => e.rateLimited === true);
  assert.equal(db.orders.get(1).sheet_sync_status, 'waiting');
  assert.equal(db.orders.get(1).sheet_sync_error, RATE_LIMIT_NOTE);
  assert.ok(db.retryUntil > T0, 'also pauses the background retries');
});
