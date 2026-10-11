# Direct Line continuation — 12 October 2026

## Current review queue — remaining PDF changes

Production last verified: PR #19 (`36fd01e`). Merge these in ascending order; all are ready for review, not yet verified live:

| PR | Feature | Branch |
|---|---|---|
| [#20](https://github.com/danielhaygross-droid/direct-line-site/pull/20) | Transfer confirmations (#5 phase 2) | codex/transfer-confirmations |
| [#21](https://github.com/danielhaygross-droid/direct-line-site/pull/21) | Structured addresses (#10) | codex/structured-addresses |
| [#22](https://github.com/danielhaygross-droid/direct-line-site/pull/22) | Cancellation/delivery (#2) | codex/cancellation-status |
| [#23](https://github.com/danielhaygross-droid/direct-line-site/pull/23) | Invoices (#4) | codex/invoices |
| [#24](https://github.com/danielhaygross-droid/direct-line-site/pull/24) | My Products (#12) | codex/saved-products |
| [#25](https://github.com/danielhaygross-droid/direct-line-site/pull/25) | Claims (#13) | codex/claims |
| [#26](https://github.com/danielhaygross-droid/direct-line-site/pull/26) | My Stores (#15) | codex/client-stores |

53/53 tests and local database/browser workflows pass. All remaining PDF implementation is now reviewable; Erwin handles merges and final live checks. No production mutations were performed. Do not update the completion PDF until deployment is confirmed.


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

## Claims (#13) — ready for review after PR #24

Branch codex/claims. Merge #20 → #21 → #22 → #23 → #24 → this PR.
- Delivered orders: Report a problem with type, description, required problem photo/video and label photo. Countdown uses the first delivered timestamp; refund is available strictly before seven elapsed days, afterwards only reshipment. PNG/JPG/WebP and MP4/WebM evidence: 2 MB/file, 3 MB combined.
- Shipped orders: Report lost parcel after 20 days without a tracking update, no photos required. Shipment/status/tracking changes start/reset the clock; admin Tracking update received records a manual carrier update. No automatic carrier integration was added.
- One claim per order, private evidence, visible Open/Approved/Rejected/Resolved and admin reply. Admin Claims list filters statuses, oldest first, highlights open claims older than 3 business days. Business days use Mon–Fri UTC (explicit in UI).
- Refund approval creates a negative balance adjustment for the original order total; concurrent approval credits once. Reshipment approval atomically creates a linked $0 pending order with copied address/product photos and immutable zero unit quote, no commission; retries do not duplicate it. Admin can mark approved claims Resolved.
- Admin/client bell/activity notifications reuse the order audit. Selected claim evidence/drafts survive refresh. Versions portal JS30/admin JS33/CSS10/i18n14, dashboard real-ui bumped.
- Validation: 50/50 tests, build/syntax/diff; DB evidence, seven-day boundary, permissions, 8 concurrent refund approvals, credit, reshipment linkage/photos/zero pricing, lost eligibility/tracking reset and overdue flag. All eight EN/HE desktop/phone themes completed day-three proof/label → admin approval → refund line; Hebrew phone late form offers reshipment only. Previous password/order/product checks still pass. Screenshots inspected.
- Local ../verification/check-claim-api.mjs and check-claim-ui.mjs; screenshots ../verification/claims/. No production data changed. Remaining PDF implementation: #15 multiple stores. Deployment and report updates await user merges.

## Multiple stores (#15) — ready for review after PR #25

Branch codex/client-stores. Merge #20 → #21 → #22 → #23 → #24 → #25 → this PR.
- Every order has a non-null store FK. Migration assigns historical orders to My store without modifying address/order content. New clients receive a default store. Client/admin add/rename/link/colour/archive/restore stores; archived history remains available and new orders cannot use archived stores. Same-client ownership enforced on order creation/moves and store edits.
- My Stores menu; coloured switcher on Home/Orders/Payments when 2+ stores, remembered per client and via ?store=<id> hash query. Approved products remain shared. New order preselects current active store; a single active store is auto-selected/hidden (archived selection safely falls back).
- Home period selector: This month, Last month, Last 30/90 days, This year, Custom. Cards, recent orders, activity and chart use the selected store/period. All stores shows performance rows + exact sum row: order count, customers paid, billed total, profit, share and missing-sale-price count.
- One shared exact-cent calculation runs in server/client/admin. Missing sale prices count as zero revenue until filled and are labelled; all non-cancelled order costs count. Cancellation fees/refund credits follow the linked order's store/period. Account profit now follows customers paid minus all billed totals; an incomplete sale price cannot inflate profit.
- Payments retain the one overall account balance/cash history and explicitly show Billed for this store, with selected-store adjustment lines. Cash transfers/payments/invoices remain account-wide because they are not allocated to stores. Home shows period/store billing and labels the overall balance separately rather than inventing a per-store payment allocation.
- Admin client page has the same period/performance table, Store column and collapsible store forms. Order detail can move an order only to the same client's active store. Reshipments inherit the original store.
- Versions portal JS31/CSS15, admin JS34/CSS11, i18n15; new shared client-store math/UI v1. Daniel's dashboard stores API/schema remains separate.
- Validation: 53/53 tests, build/syntax/diff; DB default/required/ownership/move/archive/restore and exact three-store totals including missing sales/fees/refunds; legacy migration + replay + NOT NULL and address preservation. Eight EN/HE desktop/phone theme workflows verified period totals, selection across pages, store search, preselected ordering and reload persistence; admin rename/move, archived history and Hebrew phone custom range passed. Saved-product Hebrew phone with extra photo/total passed after store integration. Previous payment/invoice/product/claim/status/password API checks still pass.
- Local ../verification/check-store-api.mjs, check-store-migration.mjs, check-store-ui.mjs and check-store-phone.mjs; screenshots ../verification/stores/. No production changes. All PDF implementation is now reviewable in PRs #20–#26, but not deployed. No new completion PDF until deployment is verified.
