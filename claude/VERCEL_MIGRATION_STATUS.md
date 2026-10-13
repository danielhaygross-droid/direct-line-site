## Daniel's messaging and Israel-time task — ready for review, 13 October 2026

Branch codex/messages-israel-time. Basic live client sending was verified in a new clearly labeled QA account (client9/order10); message reached admin, then the QA account was archived and disabled. Original TEST credentials now fail; do not assume they still work. Corrected admin login works; credentials must not be written to handoffs.

Changes: conversation metadata refreshes immediately after sending/reading so Messages does not look empty until the next poll; rapid repeat sends are guarded and older in-flight poll results cannot overwrite a newer sent thread. Admin client-preview remains read-only, with an explicit explanation. Actual clients retain reply access.

Order creation/update, messages, status steps, activity entries and notification timestamps now show date plus HH:mm:ss in Asia/Jerusalem, with an Israel-time label. An Order activity section displays recorded creation/edit/status/tracking/photo/claim events. Photo add/remove changes are logged even immediately after creation. Stored timestamps and original store order dates are preserved; existing events use their recorded time, not invented history. Last-login/terms timestamps also use the shared formatter. Versions common12, order-ui4, portal34, admin36, UI CSS6, i18n18, notify2.

Validation: 59 automated tests, build/syntax/diff checks; local DB/browser EN/HE at 1440/390px verify client-to-admin send, admin-to-client reply, immediate Messages visibility, duplicate-send guard, audit timestamps, notification times, preview read-only state, and winter/summer Israel offsets while browser uses Manila time. Screenshots and check script in project-root verification/daniel-task and verification/check-messages-israel-time.mjs. Changes are NOT deployed yet; PR link will be recorded after creation.

Custom domain is pending a confirmed Direct Line-owned domain and DNS access. User explicitly rejects Byzroyal: it is a separate Shopify business. Do not propose, connect or modify Byzroyal for Direct Line. Only a read-only domain inspection occurred; no DNS/domain changes were made.

## Spreadsheet photo feature live — verified 13 October 2026

PR30 merged as 05c36281036e983cbaa2ea219915e97a2858af78. Deployed through authorized Vercel API; deployment dpl_6PGEURa1wyGwZCDH3zgHG6HPxg6z is Ready/Production and aliased to direct-line-control.vercel.app. Earlier blocked deployment and pending-access notes are superseded.

Existing active orders 6 and 7 were resaved without changing order fields to trigger server sync. Their existing photos were uploaded by clients (addedBy=client). They now populate Orders rows 13 and 14: AV photo count=1, AW IMAGE preview, AX Photo 1 hyperlink. Rows enlarged to 100px and new photo columns aligned centrally. Spreadsheet readback confirms IMAGE/HYPERLINK formulas and no cell errors; Google-rendered visual preview was not inspected directly. Signed-out full-size photo fetches return 200 image/jpeg and exactly match the portal originals byte-for-byte; altered keys return 404. No photos were added/replaced and no new orders were created. Comparison of original A:AU cells found only sync/update timestamps changed, no manual business fields overwritten.

Corrected portal admin credentials now work (username erwins123, case-sensitive password supplied by Erwin; do not put passwords in files). Test client TEST remains ID5 with no orders; verified existing orders belong to other active accounts and were used as authorized by Erwin. Earlier portal admin access blockers are resolved. Full other workflow verification is still outstanding; this result covers spreadsheet photos.

New uploads and photo add/delete trigger sync automatically. Photo links grant access only to their image without portal login; anyone receiving a link can view it. Deleted photos and inactive/archived clients are blocked. Historical archived-client rows were not populated. Existing sheet duplicate order-ID row remains unchanged. Evidence: verification/photo-live-verification.json, photo-backfill-result.json and photo-deployment.json. Temporary Vercel env pull contained sensitive placeholders, was not used for credentials and was removed.

## Spreadsheet photos — PR #30 ready; Vercel author permission blocks deployment

PR https://github.com/danielhaygross-droid/direct-line-site/pull/30, commit 0a4e19e on codex/sheet-order-photos. Orders AV:BE headers created (count, preview, Photo 1–8). Existing rows are intentionally not populated yet because the photo endpoint is not live. 59 tests plus local DB/router integration passed. No production orders/photos changed.

Direct production deployment dpl_C88fnyodrqRJJwmuH7meXioMMyqa was BLOCKED: commit author lacks project deployment permission. Do not bypass this by changing author identity. Erwin should merge PR30 as Daniel; then deploy merged main through the authorized Vercel CLI as done for PR29. Current live release remains PR29.

After deployment: use verification/backfill-sheet-photos.mjs with production environment supplied securely (do not commit/log credentials). It derives the same session secret as api/index.mjs and performs SELECT-only database reads; writes only Orders AV:BE through Sheets API, preserving manual columns and handling existing duplicate order-ID rows. Read back image/link formulas, resize only photo-bearing rows for thumbnails, verify signed full-size links work without login and tampered IDs fail, and confirm Google renders previews. No blanket live-complete claim before these steps pass. Photo links are bearer capabilities: anyone with one can see only that photo; deleted photos and inactive/archived clients are blocked. Keep sheet links within supplier team.

## Spreadsheet photo sync — implementation ready, 12 October 2026

User requests photos in the connected spreadsheet so Ada can use Sheets. Added Orders AV:BE: photo count, first-photo IMAGE preview, eight full-size HYPERLINK cells. Photo-only HMAC links work without portal login; anyone possessing a link can view that image. They expose no order/customer data. Deleted images, disabled/archived clients, altered IDs/keys and rotated signing secrets fail closed. Photo add/delete now resync, clear removed cells, and retain retry state if photos change during sync. ID lookup now covers all Orders rows instead of stopping at row 5000.

59 automated tests and local database/router integration pass. Tests cover initial/add/delete sync, exact-photo access, stale cell clearing and revocation. New sheet columns created and header formats verified; population/deployment pending. Existing-row backfill writes only AV:BE, preserving manual order columns. No portal admin login needed for Ada. Server uses APP_SESSION_SECRET (including existing runtime derivation) and production origin, optional PORTAL_PUBLIC_URL override requiring HTTPS.

## PR #29 deployed and live-verified — 12 October 2026

Vercel CLI was authorized by Erwin as Daniel's account. Deployed merged commit afc4a9d1a8145050995aaf4c463f87b063bc72bd to the existing z-royal/direct-line-control project. Deployment dpl_4gNBWL8TNqfcVscAeGwZwk43S2Ch is Ready/Production and aliased to https://direct-line-control.vercel.app/ . Public portal HTML and CSS exactly match the CSS16 fix.

Ran 18 signed-in production layout checks WITHOUT injected CSS: EN/HE, 320/390/1440px, Home/Orders/Payments. All passed, including temporary browser-only 160-character names. No persistent records changed in this deployment check. Evidence: verification/live-2026-10-12/deployed-assets.json and mobile-wrap-deployed.json. Prior deployment-pending notes are superseded. Full admin workflow verification still needs a working admin login; supplied credentials were rejected. Vercel deployment access is now available and separate from portal admin login.

## Live verification update — 12 October 2026

TEST client (ID 5) live login/logout, eight EN/HE customer pages, bank copying, validation, access controls, and store create/edit/reload/draft-preservation/archive/restore passed. QA stores 9 and 10 were created and archived; original stores were untouched. No valid orders/payments/transfers/products/claims were submitted.

Found mobile overflow with long store names and narrow invoice controls. A CSS16 fix on branch `codex/store-mobile-wrap` passed 18 EN/HE 320/390/1440px candidate-browser layout checks, including 160-character names. The fix is not deployed yet. This branch supersedes the earlier local branch reference below.

Full live verification remains incomplete: the supplied admin login was rejected and corrected access was requested. Detailed evidence/remaining workflows: project-root `verification/live-2026-10-12/LIVE_VERIFICATION.md`. Earlier statements of no pending implementation predate this newly found issue. Do not claim all features are live-tested.

# Direct Line — current handoff

Updated 12 October 2026. This is the current session handoff; deployment evidence below was collected earlier in this session, not rechecked while editing this document.

## Current outcome

Requested implementation is complete and deployed, including PR #27's store-saving fix and PR #28's simpler customer address form. The final illustrated report and folder organization are complete. No implementation or merge remains pending from this session. Full signed-in production testing of every workflow is still outstanding; deployment confirmation is not a claim that every live workflow has been tested.

Production: https://direct-line-control.vercel.app/
Repository: https://github.com/danielhaygross-droid/direct-line-site
Active checkout: `C:/Users/erwin/Downloads/Direct Line/direct-line-control/continuation`
Local branch: `codex/simple-customer-address`.

## Deployment evidence and latest fixes

- PRs #20–26 were merged and verified deployed. These cover transfer confirmations, addresses, cancellation/delivery, invoices, products, claims and stores.
- PR #27: https://github.com/danielhaygross-droid/direct-line-site/pull/27 — merged as `e02a9576e48a2b5c5c2d0f22993aa3fb614ad2f5`. Production assets matched the tested fix. Erwin then confirmed that TEST1 could save a store.
- PR #28: https://github.com/danielhaygross-droid/direct-line-site/pull/28 — merged as `cc1e09afdbca980607a102b6e95d5efcd21a7da8`. Automatic deployment of the merge did not appear, so Erwin manually promoted source commit `a4c1ed66880ce5008a9e6ff802e70b9efc6afed0` to Production. An initial GitHub secondary rate limit was followed by a successful Ready/Production deployment.
- Public production portal/admin HTML and JavaScript, shared order UI and translations matched the tested local release. Versions: portal JS33, admin JS35, order-ui3, i18n17; portal CSS15, admin CSS11 and store-ui2 remain.
- Production runs the promoted source commit above; do not incorrectly describe it as a verified deployment of the merge SHA.

## Tasks in Shahar's original order

These statuses describe deployed implementation, subject to the live-testing limitation above.

| Task | Feature | Status |
|---|---|---|
| #1 | Service-policy acceptance | Deployed |
| #2 | Cancellation and delivery | Deployed |
| #3 | 72-hour order editing | Deployed |
| #4 | Invoice uploads and downloads | Deployed |
| #5 | Bank details and transfer confirmations | Deployed |
| #6 | Client-facing pricing | Deployed |
| #7 | Remove client Etsy upload | Deployed |
| #8 | Customer names and search | Deployed |
| #9 | Store-neutral wording | Deployed |
| #10 | Simple customer address (intentional revision requested by Erwin) | Deployed |
| #11 | Country is required | Deployed |
| #12 | My Products and quotations | Deployed |
| #13 | Claims, refunds and replacements | Deployed |
| #14 | Client account management | Deployed |
| #15 | Multiple stores and performance | Deployed; TEST1 save confirmed by Erwin |

## Decisions to preserve

**Task #10:** Erwin explicitly requested returning to customer name, a single full address/phone box and required country because it is easier to paste a customer's address. This deliberately replaces the separate street/city/ZIP inputs; it is not unfinished work. Explain this usability decision to Shahar. Task #11's required country and admin Copy full address remain. Existing structured addresses are combined for display; unchanged edits preserve original components, while changed address blocks clear duplicate components. No historical address deletion or migration was needed.

**My Stores:** The save fix accepts bare domains with server-side HTTPS normalization, provides visible validation/saving/saved feedback, and preserves drafts in other store forms. Unsafe protocols and embedded credentials remain rejected. The user's exact original input was unknown, but reproduced failures were fixed and Erwin confirmed the live save now works.

**Feature limits:** Carrier tracking/delivery updates remain manual. Claims use Monday–Friday UTC business days. Payments and invoices remain one client-wide account, with no invented allocation of payments among stores. Missing sale prices contribute zero revenue and are flagged. Evidence limits remain 2 MB per file and 3 MB combined for claims/products.

## Validation and remaining work

Latest implementation: 56 automated tests passed, along with build, syntax and diff checks. Local English/Hebrew desktop/phone checks covered the simplified address form, required address/country, save/reopen, preservation of historical components, admin editing and clipboard copying. Store regression checks covered creation/editing, validation, draft preservation, archive/restore, ownership and reload persistence. These are prior results; documentation cleanup did not rerun application tests.

Remaining: verify signed-in production workflows with an authorized test account, especially orders, cancellation/delivery, transfer confirmations, invoices, products, claims and store editing/archive/restore. Do not create real charges, payments or customer records merely to test. No production records were changed by the assistant's verification. TEST1 store creation was performed and confirmed by Erwin.

## Final report and supporting files

Project root: `C:/Users/erwin/Downloads/Direct Line/direct-line-control`.

- Final PDF: `output/pdf/Direct-Line-Final-Illustrated-Report-2026-10-12.pdf` — 16 pages, cover plus tasks #1–15 in order, with a corresponding screenshot for every task. Includes PR27's fix and task #10's intentional revision. Screenshots are labeled local demonstration evidence, not a claim of full live workflow testing.
- Spreadsheet: `output/spreadsheets/Direct Line Client Orders.xlsx`.
- Folder guide: `START_HERE.md`.
- Report generator: `verification/build-illustrated-report.py`, reading `verification/report-items.json` and the existing screenshot folders. Run from the project root; it no longer depends on a superseded PDF.
- Original task PDF remains outside this project at `C:/Users/erwin/Downloads/Direct-Line-Portal-Changes-for-Erwin_1.pdf`.

## Folder cleanup and preservation

Organization is complete. Old site copies are in `archive/earlier-work`; original backups in `archive/original-backups`; superseded PDFs in `archive/superseded-reports`; saved PR metadata in `archive/pr-metadata`; temporary previews/results in `archive/generated-previews`. Automatic approval review blocked bulk deletion, so material was archived instead. No permanent deletion or disk-space saving is claimed.

Preserve `continuation`, `local-tests`, `verification` and their relative paths. Preserve the older `current-site` checkout: it already has an uncommitted deletion of `DIRECT_LINE_DASHBOARD_HANDOFF.md` and a modified `README.md`. Those changes were not made or reverted by cleanup. `spreadsheet-work/node_modules` is a junction to shared runtime dependencies outside the project; leave it and its target untouched. The continuation checkout was clean before this handoff documentation edit.

## Instructions for the next session

Read this current summary before historical notes. Respect Erwin's simpler-address decision, keep reports in original task-number order with screenshots, and minimize usage by avoiding redundant checks. Verify new deployment evidence before claiming new changes are live. Erwin handles GitHub merges through Daniel's account; the local Git identity uses the erwins123 fork. Do not claim browser control unless a working browser tool/session is actually available.

Earlier root handoffs are preserved in `archive/handoff-history/`. Their pending-merge/deployment statements are historical and superseded by this summary. Detailed implementation history remains below the current summary in `continuation/claude/VERCEL_MIGRATION_STATUS.md`.

---

# Historical implementation notes — superseded status

The following notes are retained for technical history. Pending merges, deployment instructions and report paths below may be obsolete; use the current summary above.

## 12 October 2026 - Restore simple customer address at Erwin's request (awaiting merge)

Erwin explicitly chose the earlier customer name + full address/phone + required country form over Shahar item #10's separate street/city/ZIP fields. Restored it in client new/edit and admin order forms. Item #11 required country and admin Copy full address remain. This is an intentional scope decision, not an unfinished implementation. Prior illustrated report item #10 becomes outdated after this merges; update it to show the simpler form and explain the decision once deployment is verified.

Existing structured addresses are combined for display; saving without changing the address preserves all original structured values. Editing the address saves the complete visible block and clears the separate fields to avoid duplication. No migration or historical data deletion. Combined addresses allow 2000 characters. Validation requires recipient, full address and country; no separate city/ZIP input.

56 tests pass, build/diff/syntax checks pass. Local EN/HE desktop/phone checks cover editing, required address, structured preservation, combined save/reopen; admin edit and actual clipboard Copy full address; API creation without city/ZIP. No live records changed. Versions portal33, admin35, order-ui3, i18n17.

## 12 October 2026 - My Stores save fixes (awaiting merge)

User reported Save store did nothing in TEST1. Exact entered values were not supplied. Reproduced two local failures: a bare store domain was blocked by native URL validation before submit; saving one store discarded unsaved edits in another. The shared form now accepts pasted domains and server validation adds https://, with unsafe schemes/credentials still rejected. Required-field messages are visible. Client save renders directly from the successful response, independently of unrelated refresh requests, with persistent success text and preservation of other form drafts.

Validated: 54/54 tests, build and diff checks; local store API totals/ownership/archive/restore; EN/HE desktop/phone regression for blank-name feedback, bare-domain creation, unrelated API failure after load, single creation, editing, preserving another draft, archive/restore, invalid-link feedback and reload persistence. No TEST1 or other production records changed. This fixes reproduced paths, not a confirmed diagnosis of the user's exact input. Versions portal JS32, shared store UI2, i18n16. PR link is in the root continuation handoff after publication.

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
