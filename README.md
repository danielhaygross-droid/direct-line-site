# Direct Line Control

Admin dashboard for Daniel's stores (Shopify + Etsy + supplier sheet). Hebrew at `/`, English at `/en/`.

Moved off ChatGPT hosting (Cloudflare Worker + D1) to **Vercel + Neon Postgres**. The server logic is unchanged.

## Layout

| Path | Role |
| --- | --- |
| `dist/` | Static site served by Vercel (`index.html`, `app.js`, `styles.css`, `en/`) |
| `scripts/build-worker.mjs` | **Source of all API logic.** Generates `server/worker.mjs` |
| `server/worker.mjs` | Generated, don't edit by hand. Run `npm run build` after changing the script |
| `server/d1-postgres.mjs` | Lets the Worker's `env.DB` (D1 API) run on Postgres; creates tables on first use |
| `api/index.mjs` | Vercel function; every `/api/*` request is rewritten here (see `vercel.json`). Routes portal calls, unified login, and blocks clients from store endpoints |
| `server/portal.mjs` | Client portal + admin API: accounts (PBKDF2 passwords), client orders, payments, commission, settings |
| `dist/portal/` | Client portal (`/portal/`): add orders, profit, shipping quote calculator |
| `dist/admin/` | Admin view (`/admin/`): clients, outstanding balances, payments, commission, accounts, settings |
| `dist/p/` | Shared portal CSS/JS, including the supplier shipping-rate table |

## Environment variables (Vercel → Project → Settings → Environment Variables)

`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `APP_SESSION_SECRET` (optional; derived from `DATABASE_URL` if unset), `SHOPIFY_SHOP`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_REDIRECT_URI` (`https://<vercel-domain>/api/etsy/callback`, also registered in the Etsy app), and `DATABASE_URL` (added automatically when a Neon database is connected under Storage).

Never commit values.

## Accounts & roles

- Main admin = `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars. More admins and all clients are created in `/admin/`.
- Clients signing in on `/` or `/portal/` land in the client portal and get 403 on all store-dashboard APIs.
- Commission: default per order in admin Settings (starts at $2), optional per-client override; saved on each order when created. Cancelled orders don't count.
- Outstanding = sum of order prices (non-cancelled) − payments recorded by admins.

## Changing the dashboard

1. Edit files in `dist/` (UI) or `scripts/build-worker.mjs` (API).
2. If `app.js`/`styles.css` changed, bump the `?v=` in the matching `index.html`.
3. `npm run build`, commit, push. Vercel deploys automatically.

See `DIRECT_LINE_DASHBOARD_HANDOFF.md` for open issues and priorities.
