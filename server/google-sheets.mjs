import { createSign } from 'node:crypto';

const DEFAULT_SPREADSHEET_ID = '1L_C87W4jrZGIIrT2Fg_cGowNi3R5fTehdDw8d-vpZag';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
let tokenCache = { key: '', value: '', expiresAt: 0 };

const b64url = value => Buffer.from(value).toString('base64url');
const timestamp = seconds => seconds ? new Date(Number(seconds) * 1000).toISOString() : '';

function credentials(env) {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return { email: parsed.client_email, privateKey: parsed.private_key };
    } catch (error) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }
  return {
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
}

export function googleSheetsConfig(env) {
  const account = credentials(env);
  return {
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID,
    email: account.email,
    privateKey: account.privateKey && String(account.privateKey).replace(/\\n/g, '\n'),
  };
}

export function googleSheetsConfigured(env) {
  const c = googleSheetsConfig(env);
  return Boolean(c.spreadsheetId && c.email && c.privateKey);
}

async function accessToken(env, fetchImpl = fetch) {
  const c = googleSheetsConfig(env);
  if (!c.email || !c.privateKey) throw new Error('Google Sheets service account is not configured');
  const cacheKey = c.email + ':' + c.privateKey.slice(-32);
  const current = Math.floor(Date.now() / 1000);
  if (tokenCache.key === cacheKey && tokenCache.value && tokenCache.expiresAt > current + 60) return tokenCache.value;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: c.email,
    scope: SHEETS_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: current,
    exp: current + 3600,
  }));
  const unsigned = header + '.' + claims;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + '.' + signer.sign(c.privateKey).toString('base64url');
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error('Google authentication failed (' + response.status + ')');
  const data = await response.json();
  if (!data.access_token) throw new Error('Google authentication did not return an access token');
  tokenCache = { key: cacheKey, value: data.access_token, expiresAt: current + Number(data.expires_in || 3600) };
  return tokenCache.value;
}

async function sheetsRequest(env, path, options = {}, fetchImpl = fetch) {
  const { spreadsheetId } = googleSheetsConfig(env);
  const response = await fetchImpl('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + path, {
    ...options,
    headers: {
      authorization: 'Bearer ' + await accessToken(env, fetchImpl),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Google Sheets request failed (' + response.status + ')' + (detail ? ': ' + detail.slice(0, 240) : ''));
  }
  return response.status === 204 ? {} : response.json();
}

async function findOrderRow(env, orderId, fetchImpl) {
  const range = encodeURIComponent('Orders!A6:A5000');
  const data = await sheetsRequest(env, '/values/' + range + '?majorDimension=ROWS', {}, fetchImpl);
  const rows = data.values || [];
  const index = rows.findIndex(row => String(row?.[0] ?? '') === String(orderId));
  return index < 0 ? null : index + 6;
}

async function findClientRow(env, clientId, fetchImpl) {
  const range = encodeURIComponent('Clients!A6:A1000');
  const data = await sheetsRequest(env, '/values/' + range + '?majorDimension=ROWS', {}, fetchImpl);
  const rows = data.values || [];
  const index = rows.findIndex(row => String(row?.[0] ?? '') === String(clientId));
  return index < 0 ? null : index + 6;
}

function orderValues(order, syncedAt) {
  return [
    String(order.id), String(order.client_id), order.client_name || '', '', '', '', order.order_ref || '',
    order.order_date || timestamp(order.created_at), '', order.currency || 'USD', order.selling_price == null ? '' : Number(order.selling_price), '', '', '', '', order.selling_price == null ? '' : Number(order.selling_price), order.category || '',
    order.weight_kg == null ? '' : Number(order.weight_kg),
    order.product_cost == null ? '' : Number(order.product_cost),
    order.shipping_fee == null ? '' : Number(order.shipping_fee),
    Number(order.price || 0),
    order.selling_price == null ? '' : Number(order.selling_price),
    Number(order.commission || 0), Number(order.supplier_share || 0),
    String(order.status || 'pending').replace(/^./, c => c.toUpperCase()),
    order.status === 'shipped' ? 'Shipped' : order.status === 'delivered' ? 'Delivered' : order.status === 'cancelled' ? 'Cancelled' : 'Unfulfilled',
    order.destination || '', order.tracking_number || '', '', 'Portal', 'Synced',
    timestamp(order.created_at), timestamp(syncedAt), timestamp(order.updated_at), order.notes || '',
    order.buyer_name || '', order.buyer_phone || '', order.address_line_1 || '', order.address_line_2 || '',
    order.city || '', order.region || '', order.postal_code || '', order.item_title || '', order.sku || '',
    order.variant || '', Number(order.quantity || 1), order.etsy_url || '',
  ];
}

async function appendSyncLog(env, order, result, attempt, error, fetchImpl) {
  const values = [[
    new Date().toISOString(), 'Portal order', String(order.id), String(order.client_id), 'Portal', result,
    Number(attempt || 1), error ? String(error).slice(0, 500) : '',
  ]];
  await sheetsRequest(env, '/values/' + encodeURIComponent('Sync Log!A:H') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
    method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values }),
  }, fetchImpl);
}

export async function syncPortalOrderToGoogleSheet(DB, env, orderId, fetchImpl = fetch) {
  if (!googleSheetsConfigured(env)) return { configured: false, synced: false };
  const order = await DB.prepare(`SELECT o.*, u.display_name AS client_name
    FROM client_orders o JOIN users u ON u.id = o.client_id WHERE o.id = ?`).bind(orderId).first();
  if (!order) throw new Error('Order not found for Google Sheets sync');

  const attempt = Number(order.sheet_sync_attempts || 0) + 1;
  await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting', sheet_sync_attempts=?, sheet_sync_error='' WHERE id=?")
    .bind(attempt, orderId).run();
  try {
    const rowNumber = await findOrderRow(env, orderId, fetchImpl);
    const syncedAt = Math.floor(Date.now() / 1000);
    const values = [orderValues(order, syncedAt)];
    if (rowNumber) {
      await sheetsRequest(env, '/values/' + encodeURIComponent(`Orders!A${rowNumber}:AU${rowNumber}`) + '?valueInputOption=USER_ENTERED', {
        method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values }),
      }, fetchImpl);
    } else {
      await sheetsRequest(env, '/values/' + encodeURIComponent('Orders!A:AU') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
        method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values }),
      }, fetchImpl);
    }
    await DB.prepare("UPDATE client_orders SET sheet_sync_status='synced', sheet_synced_at=?, sheet_sync_error='' WHERE id=?")
      .bind(syncedAt, orderId).run();
    try { await appendSyncLog(env, order, 'Synced', attempt, '', fetchImpl); } catch (error) { console.error('Google Sheets sync log failed', error); }
    return { configured: true, synced: true, rowNumber };
  } catch (error) {
    await DB.prepare("UPDATE client_orders SET sheet_sync_status='error', sheet_sync_error=? WHERE id=?")
      .bind(String(error.message || error).slice(0, 500), orderId).run();
    try { await appendSyncLog(env, order, 'Error', attempt, error.message || error, fetchImpl); } catch (logError) { console.error('Google Sheets error log failed', logError); }
    throw error;
  }
}

export async function syncClientToGoogleSheet(DB, env, clientId, fetchImpl = fetch) {
  if (!googleSheetsConfigured(env)) return { configured: false, synced: false };
  const client = await DB.prepare("SELECT id, username, display_name, active, archived, created_at FROM users WHERE id = ? AND role = 'client'")
    .bind(clientId).first();
  if (!client) return { configured: true, synced: false };
  const rowNumber = await findClientRow(env, clientId, fetchImpl);
  const values = [[
    String(client.id), client.display_name || '', client.username || '', String(client.username || '').includes('@') ? client.username : '',
    client.archived ? 'Archived' : client.active ? 'Active' : 'Paused', timestamp(client.created_at), 'USD', '',
  ]];
  if (rowNumber) {
    await sheetsRequest(env, '/values/' + encodeURIComponent(`Clients!A${rowNumber}:H${rowNumber}`) + '?valueInputOption=USER_ENTERED', {
      method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values }),
    }, fetchImpl);
  } else {
    await sheetsRequest(env, '/values/' + encodeURIComponent('Clients!A:H') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
      method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values }),
    }, fetchImpl);
  }
  return { configured: true, synced: true, rowNumber };
}

export async function retryPendingGoogleSheetOrders(DB, env, fetchImpl = fetch) {
  if (!googleSheetsConfigured(env)) return { configured: false, attempted: 0 };
  const rows = (await DB.prepare("SELECT id FROM client_orders WHERE sheet_sync_status <> 'synced' ORDER BY updated_at LIMIT 20").all()).results || [];
  let synced = 0;
  for (const row of rows) {
    try { await syncPortalOrderToGoogleSheet(DB, env, row.id, fetchImpl); synced++; }
    catch (error) { console.error('Google Sheets retry failed for order', row.id, error); }
  }
  return { configured: true, attempted: rows.length, synced };
}
