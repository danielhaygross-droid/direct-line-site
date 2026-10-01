/** Etsy OAuth v3 helpers. Secrets and tokens must only be supplied at runtime. */
const encoder = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function randomVerifier(size = 64) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
export async function createPkce() {
  const verifier = randomVerifier();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return { verifier, challenge: base64url(digest) };
}
export function createState() { return randomVerifier(32); }
export function authorizationUrl({ clientId, redirectUri, state, challenge }) {
  const params = new URLSearchParams({
    response_type: 'code', redirect_uri: redirectUri, scope: 'shops_r transactions_r listings_r',
    client_id: clientId, state, code_challenge: challenge, code_challenge_method: 'S256'
  });
  return `https://www.etsy.com/oauth/connect?${params}`;
}
export async function exchangeCode({ clientId, redirectUri, code, verifier }) {
  const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code, code_verifier: verifier })
  });
  if (!response.ok) throw new Error(`Etsy token exchange failed (${response.status})`);
  return response.json();
}
export async function refreshAccessToken({ clientId, refreshToken }) {
  const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken })
  });
  if (!response.ok) throw new Error(`Etsy token refresh failed (${response.status})`);
  return response.json();
}
