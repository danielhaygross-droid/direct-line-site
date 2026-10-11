# Direct Line continuation — 12 October 2026

Production is Vercel + Neon at https://direct-line-control.vercel.app/ . PR #17 is merged (`f0b44fb`); its old description saying unmerged is stale.

## PR #18 — today's portal changes, ready for review

https://github.com/danielhaygross-droid/direct-line-site/pull/18
Branch `codex/remove-client-etsy-import` on the `erwins123` fork, based on PR #17. Merged by Erwin and live: main `37dba0d`; Vercel check success (Deployment has completed), public portal JS v23/CSS v12/i18n v7 verified. Signed-in production workflows still need the user's final check.

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

PR #18 is already merged. User can save usage by checking the deployed portal's country error, customer search, edit-window messaging and Account fields. Reset passwords only for an intended/test client.

Five main tasks for today are implemented. Optional #1 Terms and #5 phase 2 transfer-confirmation uploads remain. Larger #10 structured address, #2 status/cancellation, #4 invoices, #12 products, #13 claims and #15 multiple stores remain separate.

Full history: root CONTINUE_HERE.md at C:/Users/erwin/Downloads/Direct Line/direct-line-control/ . Active checkout: continuation/. Older current-site/ branch and its pre-existing documentation edits were preserved.

Completion report: `../output/pdf/Direct-Line-Completion-Report-2026-10-12.pdf` (2 pages, demo screenshots).

## PR #19 merged and live: #1 Terms acceptance

https://github.com/danielhaygross-droid/direct-line-site/pull/19

Branch `codex/client-terms`, based on merged PR #18 (`37dba0d`). Merged and deployed as production `36fd01e`; Vercel success and live portal/admin file matches verified.

- Exact Appendix A English policy is in `content/service-policy-v1.mjs`, alongside the Hebrew text. Backend title is the requested Direct Line service policy title.
- First-login agreement with scrollable text, checkbox and disabled Accept button; direct links and portal API data/actions are blocked until acceptance. Password replacement takes priority when a reset is pending.
- Read-only Terms menu shows current text and acceptance UTC time/version.
- Admin Account shows accepted UTC date/version, or Not accepted yet. Admin Fees & settings publishes editable English/Hebrew text as a higher version.
- Immutable version snapshots and append-only, idempotent acceptance records in `portal_terms_versions` and `client_terms_acceptances`: client ID from session, UTC epoch timestamp, platform IP, version. New versions require re-acceptance; preview stays read-only.
- IP header reference: https://vercel.com/docs/headers/request-headers . Missing headers in local tests are recorded as unavailable; production uses Vercel's headers.
- Versions: portal JS v24/CSS v13, admin JS v27, i18n v8.
- Validation: 41/41 unit tests, build and syntax/diff checks; PGlite/browser EN/HE 1440/390 light/dark tests, admin editor/audit, repeated acceptance immutability, v2 re-acceptance and old snapshot preservation. Previous country/edit/password API checks remain green.
- Local verification: `../verification/check-terms.mjs`; screenshots: `../verification/terms/`. No production acceptance or policy changes were made.

PR #19 is now live. All existing clients need to accept v1 before portal access. Bank-transfer confirmations (#5 phase 2) remain the next optional task.

Production verification: portal JS v24, CSS v13, admin JS v27, i18n v8; Vercel Deployment has completed. Protected Terms endpoint returns 401 without a login. Signed-in production acceptance/admin checks remain for the user.

## Transfer confirmations — ready for review (not yet deployed)

Branch `codex/transfer-confirmations`, based on merged PR #19 (`36fd01e`).
- #5 phase 2: client uploads PDF/JPG/PNG/WebP proof (2 MB), amount and date on Payments. Pending proof does not change the balance. File access requires its own client session or an admin session.
- Admin client Payments shows proof, image preview, pending count and Record this payment. A unique confirmation/payment link prevents duplicate credit from concurrent clicks or retries.
- Payment removal now archives; Restore retains the original record and attached proof. Archived payments are excluded from balance totals.
- Unsaved upload forms survive background refresh. EN/HE, desktop/phone and light/dark supported; admin preview cannot upload or credit.
- Versions: portal JS25/CSS14, admin JS28/CSS9, i18n9. Runtime creates portal_files and adds payment confirmation link/archive fields.
- Validation: 43/43 unit tests; build/syntax/diff checks; private-file ownership, duplicate uploads, eight concurrent recordings, balance/archive/restore tested in PGlite. All eight EN/HE desktop/phone theme browser combinations passed; screenshots inspected. No production mutations.
- Verification: ../verification/check-transfers-api.mjs and check-transfers-ui.mjs; screenshots ../verification/transfers/. Reports must distinguish ready PR from deployed work.
- Remaining PDF work: #10 structured addresses; #2 status/cancellation; #4 invoices; #12 products; #13 claims; #15 stores. Continue under Erwin's explicit request to finish the remainder while usage permits.

## Structured addresses (#10) — ready for review, after PR #20

Branch codex/structured-addresses builds on codex/transfer-confirmations. Merge PR #20 first; then this PR shows only the address changes.
- Client/admin new and edit forms keep name, street 1/2, city, region, postal code, country and phone separately. Name/street/city/postal code/country required; line 2/region/phone optional. Phone courier hint translated.
- Country comes from the same field; removed address-text auto-selection. Details display recipient, street, city, state, postal code, country, phone. Admin Copy full address copies a clean multi-line block.
- Existing address columns reused, no guessed backfill or destructive splitting. Historical multiline street values remain in a textarea. Partial admin status/billing updates preserve incomplete historical addresses; explicit address edits require completion.
- Versions portal JS26/admin JS29/i18n10. 43/43 tests, build/syntax/diff checks; local DB required-field/optional-field/legacy/partial-update checks; EN/HE desktop/phone theme browser save/reopen and clipboard checks. No production data changed.
- Local scripts ../verification/check-address-api.mjs and check-address-ui.mjs; screenshots ../verification/addresses/. Not yet deployed; no completion-report update.

## Status/cancellation (#2) — ready for review after PR #21

Branch codex/cancellation-status. Merge PR #20, then #21, then this change.
- Clients request cancellation from Pending/In Progress/Shipped, with optional reason and the exact free/$4 explanation. Clients cannot directly cancel or fulfil orders. Admin receives the existing bell/activity event.
- Admin Approve/Reject; rejection restores the previous state. Approval accepts an optional USD fee and $4 shortcut. Fee is a separate balance-adjustment line, excluded from cash payments. Status/audit/fee are one atomic SQL statement; concurrent approvals charge once.
- Pending comes from creation. Admin sets In Progress/Shipped/Delivered, or approves cancellation. Client can Mark as delivered from Shipped. First delivered timestamp retained and historical delivered orders seeded from their last update. Manual marking works; no automatic 17TRACK integration was added (optional in PDF).
- Requests temporarily stop editing; rejecting a pre-processing request preserves the remaining edit window. Processing remains a permanent lock. Stale detail updates cannot overwrite concurrent status changes.
- Versions portal JS27/admin JS30/order-ui2/i18n11; shared dashboard real-ui cache bumped. Migrations add cancellation prior state/reason/delivered timestamp and adjustment ledger.
- Validation: 45/45 automated tests; build/syntax/diff checks; local DB authorization, prior-state restore, concurrency/fee once, balance line, delivered date/idempotence/audit; all eight EN/HE desktop/phone theme browser workflows passed request→admin approval $4→balance→delivery.
- Local ../verification/check-status-api.mjs and check-status-ui.mjs, screenshots ../verification/status/. No production data changed. Deployment/report awaits merge and verification.

## Invoices (#4) — ready for review after PR #22

Branch codex/invoices. Merge #20 → #21 → #22 → this PR.
- Admin Upload invoice (PDF/image, 2 MB) when recording cash or from client Payments or any order. One file links to one payment and/or several orders; all links must belong to the same client.
- Clients Download invoice on payment rows and linked order details; Invoice pending when absent. Payment history has an invoice-month selector and monthly ZIP download. New uploads appear in bell/Home activity; opening them goes to Payments.
- ZIP response streams one private file at a time, preserving Unicode filenames and checking CRC. No public file URLs. Invoice history survives payment archiving; repeat identical uploads keep the same invoice/notification.
- Unsaved admin file selections survive refresh. An invoice failure after recording money tells the admin to retry Save invoice, avoiding another payment. Notification panel closes on navigation.
- Versions portal JS28/admin JS31/i18n12. Runtime adds file→payment link and invoice→orders links. No invoice regeneration or supplier cost/shipping breakdown is shown by the portal.
- Validation: 46/46 automated tests, build/syntax/diff; DB owner/link/date/dedup/notification/archive/download/month checks; Python extracted the ZIP and verified every CRC; all eight EN/HE desktop/phone themes tested actual payment+invoice/order linking, notifications, PNG and ZIP downloads; dedicated existing-order upload passed. Screenshots inspected.
- Local ../verification/check-invoice-api.mjs and check-invoice-ui.mjs; screenshots ../verification/invoices/. No production mutations. Await merge/deployment verification before marking live or updating report.

## My Products (#12) — ready for review after PR #23

Branch codex/saved-products. Merge #20 → #21 → #22 → #23 → this PR.
- Client My Products submits a link, one to three photos, variant notes and optional expected monthly quantity. Photos remain private. Admin cross-client Products list prioritizes awaiting quotes; client page also shows quote forms.
- Admin approves a USD unit price or marks Not available with a required note, and can update a quote later. New submissions/quote changes use bell/activity notifications with links to Products.
- New order approved-product selector fills link, photos, variant and unit quote; total reflects quantity. No new photo upload needed. Free-form orders remain available. Server checks ownership/approved status and rejects a stale displayed quote.
- Orders copy their product photos and snapshot the unit price. Later price changes or admin billing cannot change this snapshot; quantity edits use that original unit price. Client sees unit quote/total only, without cost/shipping breakdown.
- Versions portal JS29/admin JS32/i18n13, dashboard real-ui cache bumped. Runtime adds products/photos/events and order product/unit-price fields.
- Validation: 48/48 automated tests; build/syntax/diff; DB submission/quote authorization, photos, fixed price/quantity edits, stale quote, unavailable note and notifications; all eight EN/HE desktop/phone themes completed submit→admin quote→auto-fill→quoted order with no second upload. Screenshots inspected. No production changes.
- Local ../verification/check-product-api.mjs and check-product-ui.mjs; screenshots ../verification/products/. Remaining: #13 claims and #15 stores; deployment still awaits user merges.
