# Direct Line Control — handoff for the next AI

## Purpose

Continue development and support of the Direct Line Control dashboard:

- Live site: `https://direct-line-control.danielhaygross.chatgpt.site/`
- English route: `https://direct-line-control.danielhaygross.chatgpt.site/en/`
- Project folder: `direct-line-login-fix`
- Most recent known commit: `bbe0b8a` — **Expand English live dashboard translations**

The user speaks Hebrew. Keep explanations practical and concise. Do not expose passwords, API secrets, tokens, or spreadsheet data in chat or commits.

## Current product state

The dashboard is a static UI embedded into a Cloudflare Worker. The Worker serves the UI and provides API endpoints for authentication, Shopify, supplier-sheet data, product costs, and Etsy OAuth.

The important user goals are:

1. Accurate live financial and order data.
2. Fast loading with sensible refresh intervals.
3. A fully English `/en/` experience and a fully Hebrew `/` experience.
4. Etsy stores connected through OAuth and showing actual paid order prices.
5. Stable date filtering, including a custom date range.

## Known issues that still need work

### 1. English dashboard is incomplete

The user repeatedly saw Hebrew strings on `/en/`, including KPI labels, hero content, and dynamic UI. A partial translation map exists in `dist/en/app.js`, but it is a workaround and does not cover all dynamically rendered content.

**Required fix:** implement translations at the source/render-function level, rather than relying on a DOM `MutationObserver` text replacement map. Verify with a hard refresh / private window after publishing. Ensure the language toggle never produces `/en/en/`.

### 2. Etsy is OAuth-connected but sales ingestion is not implemented

The Worker has an Etsy Authorization Code + PKCE flow. The configured scope contains:

```text
shops_r transactions_r listings_r
```

It stores encrypted tokens in the D1 table `etsy_connections`. However, current pricing uses public listing endpoints in `listingPrice()`, which returns a current listing price and is **not** the price the customer actually paid.

**Required fix:** call Etsy shop receipt/transaction endpoints using the saved OAuth access token, persist or cache receipts, and calculate order revenue from paid transaction totals. Handle token refreshes. Reconcile currency, refunds/cancellations, shipping, discounts, and date filters.

### 3. Login support

The login endpoint is `POST /api/auth/login`. It compares an entered username/password exactly with the Worker environment variables:

```text
ADMIN_USERNAME
ADMIN_PASSWORD
APP_SESSION_SECRET
```

The known configured username is `Danielshahar`. The configured password must never be revealed. If the user cannot log in, ask them to choose a new password and update `ADMIN_PASSWORD` through the project environment settings. The browser login code should display the response error; verify it rather than assuming a login failure is a UI problem.

### 4. Date filtering needs end-to-end verification

Custom date range was added. `inSelectedRange()` is used for order, customer, and metric calculations. Product rendering does not fully respect the selected range yet. Test all areas for each range: Today, 7 days, 30 days, 4 months, and Custom.

### 5. Data-source clarity

Supplier cost data currently comes from the Google Sheet named:

```text
NEW-SUPPLIER-ORDER-DATABASE-Daniel&Shahar
```

The Google Sheet ID is hard-coded in the Worker. The user asked which copy is in use; this is the current source. Do not claim data is live if an endpoint is returning cached or placeholder data.

## Performance design already implemented

- Shopify summary cache: D1 table `sync_cache`, TTL **1 hour**.
- Supplier sheet cache: same table, TTL **24 hours**.
- When stale data is requested, a background refresh is triggered when supported by Worker `ctx.waitUntil()`.
- Manual refresh forces Shopify refresh through `/api/shopify/sync?force=1`.
- JS/CSS assets are sent with immutable caching. Whenever `dist/app.js` or `dist/en/app.js` changes, update its `?v=` query value in the relevant HTML and rebuild the Worker. Otherwise browsers can continue serving the old dashboard.

## Integrations and environment variables

Do not put values in source control. These names are configured in the hosting environment:

```text
ADMIN_USERNAME
ADMIN_PASSWORD
APP_SESSION_SECRET
SHOPIFY_SHOP
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
ETSY_KEYSTRING
ETSY_SHARED_SECRET
ETSY_REDIRECT_URI
```

`ETSY_REDIRECT_URI` should be:

```text
https://direct-line-control.danielhaygross.chatgpt.site/api/etsy/callback
```

The deployment has a D1 binding named `DB`.

## Etsy connection flow for the user

The user must sign in to Etsy and authorize each shop personally. Never ask them to send an Etsy password.

After they are signed into the dashboard, these routes start the official Etsy authorization flow:

```text
/api/etsy/connect?shop=CursedCarvingsDesign
/api/etsy/connect?shop=SelectSpark
/api/etsy/connect?shop=NerdSparkArt
```

The endpoint requires a valid dashboard session. It redirects to `https://www.etsy.com/oauth/connect`, then Etsy returns to `/api/etsy/callback`. Connection status is available at `/api/etsy/status`.

## Relevant files

| File | Role |
| --- | --- |
| `dist/app.js` | Hebrew dashboard UI and API calls |
| `dist/en/app.js` | English dashboard UI; incomplete translation work remains |
| `dist/index.html` | Hebrew entry point |
| `dist/en/index.html` | English entry point |
| `dist/styles.css` | Shared styling |
| `dist/server/index.js` | Generated Cloudflare Worker: APIs and embedded static assets |
| `scripts/build-worker.mjs` | Rebuilds the Worker after changing `dist` assets |
| `drizzle/0000_etsy_connections.sql` | D1 schema for Etsy connections |
| `.openai/hosting.json` | Hosting project configuration and D1 binding |
| `integration/etsy-oauth.js` | Earlier Etsy OAuth integration reference |

## Build and publish checklist

1. Edit the source assets in `dist/`.
2. If JS/CSS was changed, bump the version query string in the relevant HTML.
3. Run:

   ```bash
   node scripts/build-worker.mjs
   ```

4. Confirm `dist/server/index.js` contains the newly embedded asset.
5. Publish the Worker/site using the project’s configured hosting deployment process.
6. Test the live Hebrew `/` and English `/en/` routes in a private window. Test login, range selection, manual refresh, Shopify data, and Etsy connection status.

## Safe working rules

- Never include credentials in Markdown, git history, screenshots, logs, or messages.
- Do not enter the user’s credentials into a website form yourself.
- Test English after clearing/bypassing cache because static asset caching is aggressive.
- Be direct when a dashboard number is cached, unavailable, or inferred; never call it “real-time” unless it was actually refreshed.
- Before modifying OAuth, preserve the existing redirect URI and verify Etsy requirements from the official Etsy documentation.

## Recommended priority order

1. Fix login recovery path if the user cannot enter the dashboard.
2. Make `/en/` entirely English through proper translation-driven rendering.
3. Build Etsy receipt/transaction syncing, then use it for actual sales revenue and profit.
4. Finish date filtering in all views, including products/costs.
5. Add clear “last updated”, data-source, and cache-age labels so users can trust the numbers.

