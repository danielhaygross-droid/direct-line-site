# Etsy integration readiness

The three shops are registered in the UI and the Etsy Personal App is pending approval.

Runtime-only secrets:
- `ETSY_CLIENT_ID`
- `ETSY_SHARED_SECRET`
- `TOKEN_ENCRYPTION_KEY`

Required server behavior:
1. Generate per-shop `state` and PKCE verifier and persist them server-side with a short expiry.
2. Redirect to Etsy using read-only scopes: `shops_r transactions_r listings_r`.
3. Validate `state` on callback, exchange the code, encrypt tokens at rest, and bind the Etsy shop ID to the Direct Line account.
4. Refresh tokens server-side and never expose credentials or refresh tokens to the browser.
5. Import receipts/transactions, listings and shop metadata, then reconcile totals before switching a shop to connected.

Do not put secrets in this repository or in browser storage.

## Shopify integration readiness

Runtime-only secrets:
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_REDIRECT_URI`

The callback must validate both OAuth state and Shopify's HMAC before exchanging the authorization code. Store the offline access token encrypted and bind it to the exact normalized `*.myshopify.com` domain, client, and store record. Never place the client secret or access token in the static dashboard bundle.
