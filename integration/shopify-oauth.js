import crypto from 'node:crypto';

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function normalizeShopDomain(value) {
  const shop = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!SHOP_DOMAIN.test(shop)) throw new Error('Invalid Shopify store domain');
  return shop;
}

export function createInstallUrl({ shop, clientId, redirectUri, state, scopes }) {
  const domain = normalizeShopDomain(shop);
  const query = new URLSearchParams({ client_id: clientId, scope: scopes.join(','), redirect_uri: redirectUri, state });
  return `https://${domain}/admin/oauth/authorize?${query}`;
}

export function verifyCallbackHmac(params, clientSecret) {
  const values = new URLSearchParams(params);
  const supplied = values.get('hmac') || '';
  values.delete('hmac');
  values.delete('signature');
  const message = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
  const expected = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
  if (!supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function exchangeAuthorizationCode({ shop, clientId, clientSecret, code }) {
  const domain = normalizeShopDomain(shop);
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!response.ok) throw new Error(`Shopify token exchange failed (${response.status})`);
  return response.json();
}

export const readOnlyScopes = ['read_orders', 'read_products', 'read_inventory', 'read_locations', 'read_fulfillments', 'read_returns'];
