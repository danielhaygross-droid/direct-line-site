import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { googleSheetsConfigured, syncClientToGoogleSheet, syncPortalOrderToGoogleSheet } from '../server/google-sheets.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceKey = privateKey.export({ type: 'pkcs8', format: 'pem' });

function fakeDatabase() {
  const state = { status: 'waiting', attempts: 0, error: '', syncedAt: null };
  const order = {
    id: 42, client_id: 7, client_name: 'Test Client', order_ref: 'E-100', tracking_number: '', destination: 'US',
    category: 'decor', weight_kg: 1.25, price: 15, selling_price: 24, product_cost: 10, shipping_fee: 5,
    commission: 2, supplier_share: 1, notes: 'Handle carefully', status: 'pending', created_at: 1791244800,
    updated_at: 1791244800, sheet_sync_attempts: 0,
  };
  return {
    state,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (sql.includes('FROM client_orders o JOIN users')) return order;
          return null;
        },
        async run() {
          if (sql.includes("sheet_sync_status='waiting'")) { state.status = 'waiting'; state.attempts = Number(args[0]); state.error = ''; }
          if (sql.includes("sheet_sync_status='synced'")) { state.status = 'synced'; state.syncedAt = Number(args[0]); state.error = ''; }
          if (sql.includes("sheet_sync_status='error'")) { state.status = 'error'; state.error = String(args[0]); }
          return { success: true };
        },
      };
    },
  };
}

test('reports Google Sheets as unconfigured without service account credentials', () => {
  assert.equal(googleSheetsConfigured({}), false);
});

test('portal order sync appends one idempotent order row and records success', async () => {
  const DB = fakeDatabase();
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
    if (String(url).includes('/values/Orders!A6%3AA5000')) return Response.json({ values: [] });
    if (String(url).includes('/values/Orders!A%3AAI:append')) return Response.json({ updates: { updatedRows: 1 } });
    if (String(url).includes('/values/Sync%20Log!A%3AH:append')) return Response.json({ updates: { updatedRows: 1 } });
    return new Response('unexpected request', { status: 500 });
  };
  const result = await syncPortalOrderToGoogleSheet(DB, {
    GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-id',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sheet-writer@example.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: serviceKey,
  }, 42, fakeFetch);

  assert.deepEqual({ configured: result.configured, synced: result.synced }, { configured: true, synced: true });
  assert.equal(DB.state.status, 'synced');
  assert.equal(DB.state.attempts, 1);
  const append = calls.find(call => call.url.includes('/values/Orders!A%3AAI:append'));
  assert.ok(append);
  const row = JSON.parse(append.options.body).values[0];
  assert.equal(row.length, 35);
  assert.equal(row[0], '42');
  assert.equal(row[2], 'Test Client');
  assert.equal(row[6], 'E-100');
  assert.equal(row[30], 'Synced');
});

test('new client accounts are mirrored to the Clients tab', async () => {
  const DB = {
    prepare() {
      return {
        bind() { return this; },
        async first() { return { id: 7, username: 'client@example.com', display_name: 'Test Client', active: true, archived: false, created_at: 1791244800 }; },
      };
    },
  };
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
    if (String(url).includes('/values/Clients!A6%3AA1000')) return Response.json({ values: [] });
    if (String(url).includes('/values/Clients!A%3AH:append')) return Response.json({ updates: { updatedRows: 1 } });
    return new Response('unexpected request', { status: 500 });
  };
  const result = await syncClientToGoogleSheet(DB, {
    GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-id',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sheet-writer@example.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: serviceKey,
  }, 7, fakeFetch);
  assert.equal(result.synced, true);
  const append = calls.find(call => call.url.includes('/values/Clients!A%3AH:append'));
  const row = JSON.parse(append.options.body).values[0];
  assert.deepEqual(row.slice(0, 7), ['7', 'Test Client', 'client@example.com', 'client@example.com', 'Active', '2026-10-06T00:00:00.000Z', 'USD']);
});
