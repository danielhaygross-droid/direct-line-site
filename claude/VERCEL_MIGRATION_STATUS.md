# Direct Line continuation — 12 October 2026

Production is Vercel + Neon at https://direct-line-control.vercel.app/ . PR #17 is merged (`f0b44fb`); its old description saying unmerged is stale.

## PR #18 — today's portal changes, ready for review

https://github.com/danielhaygross-droid/direct-line-site/pull/18
Branch `codex/remove-client-etsy-import` on the `erwins123` fork, based on PR #17. Not merged or live at this handoff.

Completed together at Erwin's request:
- #7: removed client Etsy upload navigation/page/banner/parser/API; old import URLs redirect Home. Historical orders/source/photo exemptions and Daniel's separate sale-price CSV flow are preserved.
- #11: country required on new orders and client edits, server-side too; inline portal error; Israel and Other remain available.
- #8: Customer column on Orders and Home, including mobile; partial case-insensitive customer search retained. Customer names are excluded from translation.
- #9: Store order number, store-neutral helper text, generic product link placeholder, store-neutral Home/photo/address wording; Hebrew pairs included. Multiple-store dropdown remains part of later #15.
- #3: client detail/photo edits require Pending and less than 72 hours; hours remaining and an order-specific Messages link; admins retain editing. Processing permanently locks client editing, even if an admin later returns an order to Pending. SQL also checks edit eligibility when writing.
- #14: admin Account has username Copy, last login and Reset password. Generated temporary password is shown once, stored only as a hash, and must be replaced after login. Old sessions are revoked, and portal API data/actions remain blocked until replacement. Both login routes record last login. Ordinary account saves preserve concurrent password resets.

Versions: portal.js v23, portal.css v12, admin.js v26, i18n.js v7. Normal build/runtime migration adds user reset flag/session version/last login and order edit lock; existing processing activity is backfilled. No manual production data deletion.

Validation: 39/39 Node tests; build, syntax, diff checks. Local PGlite checks passed country creation/editing, 72-hour boundary, permanent processing/photo lock, admin edits, reset hashes/session revocation/forced replacement, account saving, both login routes and last login. Browser client checks passed EN/HE, 1440px/390px, light/dark. Admin reset shown once and actual Hebrew phone forced-password-change flow passed. Screenshots inspected; no production orders/payments/reset actions performed.

Local verification: `../verification/check-today-api.mjs` and `check-today-ui.mjs`; local dependency @electric-sql/pglite 0.5.8 in that folder. Screenshots: `../verification/today/`. Test-only data is in memory and discarded.

## Next

User can save usage by merging PR #18 in the Daniel GitHub profile, then checking the deployed portal's country error, customer search, edit-window messaging and Account fields. Reset passwords only for an intended/test client.

Five main tasks for today are implemented. Optional #1 Terms and #5 phase 2 transfer-confirmation uploads remain. Larger #10 structured address, #2 status/cancellation, #4 invoices, #12 products, #13 claims and #15 multiple stores remain separate.

Full history: root CONTINUE_HERE.md at C:/Users/erwin/Downloads/Direct Line/direct-line-control/ . Active checkout: continuation/. Older current-site/ branch and its pre-existing documentation edits were preserved.
