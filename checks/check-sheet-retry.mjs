// Local check for throttled Google Sheets retries (branch claude/sheet-retry-throttle), run from the project root:
//   node checks/check-sheet-retry.mjs
// Real SQL on an in-memory Postgres (PGlite) with a fake Google that enforces a per-minute write quota. No live data.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { pg, DB, env as baseEnv, call, seed } from './lib.mjs';
import { retryPendingGoogleSheetOrders, syncPortalOrderToGoogleSheet, RETRY_GAP, RETRY_BATCH, RATE_LIMIT_PAUSE, RATE_LIMIT_NOTE } from '../server/google-sheets.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { ...baseEnv, GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-id', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'w@example.iam.gserviceaccount.com', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const google = { clock: Math.floor(Date.now() / 1000), minute: -1, writes: 0, rejected: 0, calls: 0, quota: 60 };
google.fetch = async (url, options = {}) => {
  url = String(url);
  if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 't', expires_in: 36000 });
  google.calls++;
  const minute = Math.floor(google.clock / 60); if (minute !== google.minute) { google.minute = minute; google.writes = 0; }
  const write = (options.method || 'GET') !== 'GET';
  if (write && ++google.writes > google.quota) { google.rejected++; return new Response(JSON.stringify({ error: { code: 429, message: "Quota exceeded for quota metric 'Write requests'" } }), { status: 429 }); }
  return Response.json(write ? { updates: { updatedRows: 1 } } : { values: [] });
};
const runRetry = (now, limit) => { google.clock = now; return retryPendingGoogleSheetOrders(DB, env, google.fetch, { now, ...(limit ? { limit } : {}) }); };
const state = async () => (await DB.prepare("SELECT sheet_sync_status AS s, COUNT(*) AS n FROM client_orders GROUP BY 1").all()).results.reduce((a, r) => ({ ...a, [r.s]: Number(r.n) }), {});

const { admin, id } = await seed();
for (let i = 1; i <= 14; i++) {
  const r = await call('/orders', 'POST', { clientId: id, orderRef: 'ORD-' + i, buyerName: 'Sample', destination: 'IL', address1: '1 Sample St', etsyUrl: 'https://example.com/i' }, admin);
  assert.equal(r.status, 200, JSON.stringify(r.data));
}
// Make them all "stuck": status error, due now, with the old kind of raw Google error text.
await DB.prepare("UPDATE client_orders SET sheet_sync_status='error', sheet_sync_error='Google Sheets request failed (429): quota', sheet_next_try=0").run();
const T0 = google.clock;

// 1) Ten admin polls at the same moment: exactly one run, at most 4 orders, on real SQL.
const burst = await Promise.all(Array.from({ length: 10 }, () => runRetry(T0)));
assert.equal(burst.filter(r => !r.paused).length, 1, 'one claimed run');
assert.deepEqual(await state(), { synced: RETRY_BATCH, error: 14 - RETRY_BATCH });
assert.equal((await runRetry(T0 + RETRY_GAP - 1)).paused, true);
console.log('PASS burst of 10 polls -> one run of', RETRY_BATCH, 'orders; calls to Google:', google.calls);

// 2) The rest drain over the next runs with a tight quota and never get a 429.
google.quota = 20; let now = T0 + RETRY_GAP + 1, runs = 1;
while ((await state()).synced < 14 && runs < 12) { await runRetry(now); now += RETRY_GAP + 1; runs++; }
assert.deepEqual(await state(), { synced: 14 }); assert.equal(google.rejected, 0);
const stale = (await DB.prepare("SELECT COUNT(*) AS n FROM client_orders WHERE sheet_sync_error <> ''").first()).n;
assert.equal(Number(stale), 0, 'old error notes cleared on success');
console.log('PASS 14-order backlog drained in', runs, 'runs, 0 rate-limit errors, old error notes cleared');

// 3) Quota exceeded: friendly note, pause, resume.
await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting', sheet_next_try=0 WHERE id <= 3").run();
// From here use the real clock: the 90 s pause is stamped with the real time inside the sync.
await DB.prepare("DELETE FROM portal_settings WHERE key='sheet_retry_until'").run();
google.quota = 0; google.writes = 0; now = Math.floor(Date.now() / 1000);
const limited = await runRetry(now);
assert.equal(limited.rateLimited, true);
const note = await DB.prepare("SELECT sheet_sync_status AS s, sheet_sync_error AS e, sheet_next_try AS n FROM client_orders WHERE sheet_sync_error <> '' ORDER BY id LIMIT 1").first();
assert.equal(note.s, 'waiting'); assert.equal(note.e, RATE_LIMIT_NOTE); assert.ok(Number(note.n) >= Math.floor(Date.now() / 1000) + RATE_LIMIT_PAUSE - 5);
const calls = google.calls;
assert.equal((await runRetry(now + RETRY_GAP + 5)).paused, true); assert.equal(google.calls, calls, 'no Google calls while paused');
// The order panel for the admin shows the friendly note, not Google's JSON.
const adminOrders = (await call('/admin/orders', 'GET', null, admin)).data.orders;
assert.ok(adminOrders.some(o => o.sheetSyncError === RATE_LIMIT_NOTE && o.sheetSyncStatus === 'waiting'));
assert.ok(!adminOrders.some(o => /project_number|RESOURCE_EXHAUSTED|\(429\)/.test(o.sheetSyncError)));
console.log('PASS quota exceeded: friendly note shown to admin, 90 s pause, no extra Google calls');
google.quota = 60; google.writes = 0;
await DB.prepare("UPDATE client_orders SET sheet_next_try=0").run();
now += RATE_LIMIT_PAUSE + 10; const resumed = await runRetry(now);
assert.ok(resumed.synced >= 1); console.log('PASS retries resume after the pause:', resumed.synced, 'synced');
await pg.close();
