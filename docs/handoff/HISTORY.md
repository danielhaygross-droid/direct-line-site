# Direct Line: work history (public copy)

Copy of the notes kept on Erwin's computer (`CONTINUE_HERE.md`, newest on top). Because this repo is public, emails, usernames, login/security setup, money amounts ($…) and long order/tracking numbers (…) are removed. The full file stays on Erwin's computer.

## 4 Nov: #170 LIVE - HANDOFF.md + CLAUDE.md in the repo (docs only, site versions unchanged)
- Repo is PUBLIC: this history and the report text with real figures (r1101/gen.py) stay on this computer (Erwin chose). Report layout files are in the repo under tools/report-template/ (playwright-core from the repo, CHROME_PATH override).
- The untracked copies the other session made in continuation/ (docs/handoff/HISTORY.md, tools/report-template/r1101/gen.py) were deleted (Erwin asked); they matched the originals here exactly.

## 4 Nov: #169 LIVE (admin.js 108) - 'without our fee' now adds up
- Overview Not paid yet: Without our fee X · our fee Y, X+Y = owed (after credit). Client panel Outstanding/Balance same rule. Our earnings: collected + not paid yet + not billed yet = total.

## 4 Nov: #168 LIVE - admin sees bills without our fee (admin.js 107, admin.css 31, i18n 103)
- Overview 'Not paid yet': 'Unpaid orders without our fee $X · our fee $Y'; Clients tab column 'Without our fee' (billed - ourShare); client panel under Outstanding, Not paid yet and Balance. Admin only, never in the portal.

## 2-3 Nov: #153-#163 LIVE (other sessions; summary read 4 Nov)
- #153 missing variant photos can be added on any order except cancelled (Pauline's shipped #…). #154 click any table header to sort. #155 card rows line up (subgrid, check-card-alignment).
- #156 update tags per order + 'New updates' filter/sort (admin + client), bell search/filters/history. #157/#158 sheet: per-order write lock, one minute check at a time, doubled rows heal keeping the supplier's copy.
- #159 duplicate warnings (same order number, or customer + link within a day) + sheet flags duplicate order/tracking numbers (red rows, row 4 count, admin bell).
- #160 cost revisions: lower supplier cost (< half drop) auto-approved; supplier types NO: reason to refuse; Competitor price cell orange/purple/green; Read chip in notifications.
- #161 Billing tab: third part (col U) cancelled orders with fee and refund. #162 supplier sheet bilingual EN/中文 headers, help, Guide tab (website reads the English line). #163 orders up to 10,000 pieces.

## 2 Nov: #149-#152 LIVE
- #149: sheet variant picture labels = variant names (5x7 font in photo-collage.mjs), URL &v=2; row 26 (#…) refreshed by hand.
- #150: cost revision tags in client Orders/My Products lists (Revision requested / Cost lowered / Cost kept), 'Cost revisions' chip, 'Cost revision first' sort (Pauline's ask).
- #151: Sort on every list: Messages, Not paid yet, Payment history, My Stores; admin Claims, client panel Saved prices/Payments/Stores (check-list-sorts).
- #152: Shipped tab colour rules had slid to row 44 (every row moved to the top pushes conditional formats down). fixRuleRanges on every sheet check puts Orders + Shipped rules back to row 6 (not Cancelled, Erwin). Verified live after Check sheet now.

## 2 Nov: #147 + #148 LIVE - variant photos only + Paste
- #147: orders with 2+ variant lines hide the general 'Photo or screenshot' box (old general photos stay, removable); paste/drop refused with a note. Why: Pauline put photos in the top box instead of on each variant (Erwin had added the line photos himself).
- #148: Paste button under every Add photo box (form top, each variant, client order panel, admin panel) via navigator.clipboard.read; Ctrl+V fills the box clicked last, else first variant missing a photo (common.js, putFiles into the box's file input). Old portal-only paste handler removed.

## 1 Nov: #146 LIVE - clients add missing variation photos on In Progress orders
- Order panel 'Photo per variation': 'Add photo' on each line without a photo + orange hint, for Pending or In Progress orders with 2+ lines. Only missing lines; rest of the order stays locked (server checks item exists and has no photo).
- Pauline asked (by Erwin) to fill #… and #… today so Ada sees them tomorrow.

## 1 Nov: #145 LIVE - Photo per variation (supplier sheet)
- Ada picks the product by the sheet photo, so orders with 2+ variation lines (no saved product) now need a photo per line in the portal form (order_photos.item_index = line 1..10). Edits keep each photo with its line; removed lines drop their photo.
- Sheet: preview cell = one numbered picture of all line photos (server-made JPEG, signed /api/portal/sheet-photos/:id/lines), link 'All N photos' opens the big one, variation text numbered #1, #2. Grey tile = line without photo.
- Older orders (e.g. #…): admin order panel > 'Photo per variation' > Add photo per line; the sheet updates on the next sync.
- CI: check-my-products popup wait flaked once on GitHub, passed on rerun.

## 1 Nov: #144 LIVE - Billing tab for Ada (supplier sheet)
- Ada can't invoice: shipped orders leave Orders, Shipped mixes paid/unpaid. New protected 'Billing' tab = FILTER formulas over Orders + Shipped (not Cancelled), newest first: left PAID by our clients, right NOT PAID yet, count + total in row 3. Website only writes the formulas (missing tab, or BILLING_V/LAYOUT changed; setting supplier_billing_tab) and never reads it; errors logged, sync goes on (billingSafely). Verified live after Check sheet now: 26 paid $… / 45 not paid $….
- Also: check-overview-money expected cancellation fees in Oct; they are dated on approval (today), so it failed from 1 Nov. Fixed in #144.

## FOR THE END-OF-DAY REPORT 31 Oct 2026 (Erwin asked to include these)
- Etsy stores (all shops together): 2 new orders today.
- Pending: receiving the Royal Flint ads profile (not received yet).

## 30 Oct (late night): #143 LIVE - no number rule on Cost per product (Q)
- Ada saw "Invalid: must be >= 0" on Q: the old AI had the cancellation fee number rule, which moved with the column. Cleared on the live sheet (3 tabs) via the Sheets API; AI keeps its fee rule. Code now clears it too (itemCostsFormat, after the layout 19 move).

## 30 Oct (night): #141 + #142 LIVE (bell + per-product revision; sheet layout 19: Cost per product in Q)
- #141 (portal.js 89, admin.js 96, ui.css 26, order-ui.js 19, i18n bumped): client bell "Price per product added" (order_events kind item_prices, from the sheet poll; once per new set of prices, not on cancelled). Orders with several product links: the cost revision form has one competitor price per product (fill only the expensive ones); cost_revisions.items text e.g. "Product 2: $… · Product 3: $…" is what the supplier reads in Competitor price (orange) and what the admin box + WhatsApp text show. itemCostList/itemPrices now in server/item-costs.mjs.
- #142: supplier-sheet.mjs uses a column map (columns(HEADERS)); layout 19 moves AI -> Q on all 3 tabs (moveDimension, one batch), then rewrites header/row 4/instructions. New letters: P cost, Q cost per product, R tracking, S courier, T shipping status, U delayed, V reason, W client paid, X-AE photos/links, AF-AG ids (hidden), AH domestic, AI cancellation fee. Steps 1-18 use the layout 18 map (C18). Check: check-supplier-sheet 18 -> 19 part. Verified live after the switch: all 3 tabs have the new header, row 4 totals unchanged (Orders $… / paid $… / 33 not paid; Cancelled $…, 25 cancelled, $… fees in AI), #… row aligned (P $…, Q 27.9, 21.9, 31.9, AF id 83). Tell Ada the column moved.

## 30 Oct (late): #140 LIVE - cost per product accepts Chinese commas
- Ada typed AI as "27.9、21.9、31.9" on #…; itemCostList only split on , ; newline -> one cost for 3 links -> no prices. Now also splits on 、 ， ； (server only, no ?v= bump). Erwin also retyped the cell with normal commas.
- Erwin asked next (not done): (1) bell to the client when per-product costs arrive (none today); (2) cost revision per product on multi-product orders; (3) move "Cost per product" (AI) next to Total cost (P) - needs a one-time sheet layout switch (shifts Q-AI, every column ref in supplier-sheet.mjs).

## 30 Oct: #137/#138/#139 LIVE - Cost per product (sheet layout 18)
- Sheet column AI "Cost per product (USD)" (yellow) on Orders/Shipped/Cancelled; Ada types one cost per product in Product 1,2,3 order ("10.90, 9.00, 11.00"). Copied to client_orders.item_costs. Client + admin order drawer show each product's share of the order price next to its link (scaled to add up to the price; our fee never separate). Admin-only itemCosts.
- Rollout bug: the switch read/wrote A5:AI5 on a 34-column tab (Google refuses past the last column) so sheet checks failed until #139 (columns added first). The failure also deleted the layout setting, so all old one-time steps re-ran once (some duplicate colour rules possible, harmless). Verified live: 35 columns + filter A-AI on all 3 tabs, totals fine, check ok (87 orders, 0 changed).
- Lesson: the fake sheets in checks don't enforce grid limits; add that if columns are added again.
- #136 LIVE: clients see one cancellation fee per order ($… on paid ones), no kept field.

## DONE 30 Oct (see #137): per-product cost on multi-product orders
- Yehuda asks the cost of each product in #… (3 products in one order). The supplier sheet only has one Total cost (P) per order, so the client only sees the order total ($… = $… + $…). Needs a way for Ada to give a cost per product line (and the client to see it). Design first; don't change sheet columns without a safe one-time switch.
- Also done tonight: cleared the "Client paid = Paid" filter on Orders + Cancelled (it hid unpaid orders from Ada too).

## 29 Oct (night): #133 + #135 LIVE
- #133: our fee (commission, $…) on a cancelled order the client had PAID stays billed (kept_fee adjustment, synced before balances; clients see it inside the cancellation fee, admin box says "Includes $X of our fees kept"). Yehuda live: cancelled credit $… (= $… paid - $… supplier fees - $… kept), fees $… balance due $…. Ada refund to us: $… (she excludes #…, not paid to her) or $… if she agrees.
- #135: Shipped filter chip always shown (admin Client orders + portal Orders), admin.js v95, portal.js v88.
- Sheet: Cancelled tab totals row fixed (formulas pointed at row 29); #134 (other session) makes the website write row-4 totals on all tabs. #130 Refunded live: paid cancelled rows say Refunded.
- Open: 9 orders still have no supplier cost (Ada to price): #…, #…, #…, #…, #…, …, #…, #…, #…. Erwin's "Client paid = Paid" filter is on the Cancelled tab (shared view).

## 29 Oct (night): #134 LIVE: row 4 totals on every supplier tab (layout 17, INDIRECT formulas)
- After the split, the Cancelled tab's totals read from row 29 (top rows deleted moved P6:P). Now INDIRECT("P6:P") etc., written on all 3 tabs. Verified 22:23 after Check sheet now: Cancelled $… / 25 cancelled; layout 16 ran too: 14 paid cancelled rows say Refunded.

## 29 Oct (late): #132 + #130 LIVE: sheet row guard (layout 15) + Refunded (layout 16; portal.js 87, ui.css 24, payment-orders.js 5)
- Incident: after #129 (newest on top) the tabs were sorted with the filter arrows; the filter covered A-AD only, so P-U moved but the hidden ids AE-AH stayed -> the website rewrote A-O/V-AF by id and billed other orders' cost/tracking (Yehuda). Data restored by the Continue session (+ #131 repair).
- #132: filter A-AH on all 3 tabs (verified live), client_orders.sheet_ref = B last written; poll skips + reports out-of-line rows, sync refuses to write them. check-supplier-sheet models a filter sort.
- #130: cancelled + client paid (linked payment) = "Refunded": Shipping status in the Cancelled tab (dropdown option), blue Refunded tag in admin lists + client order drawer. Layout 16 runs on the next full poll; verify S = Refunded on paid cancelled rows.

## 29 Oct (evening): INCIDENT fixed - Yehuda's costs/tracking mixed up after the sheet sort; #131 LIVE (repair), #132 = cause fix
- Cause (found by the other session): the tabs were sorted by Date with the filter arrows, which only covered A-AD, so P-U moved away from the hidden order id (AE); the website re-aligned A-O/V-AF by AE and billed P-U from other orders (74 of 85 orders, negative profits; Yehuda/Pauline complained).
- Fixed: correct P-R written back per AE from the pre-switch sheet read (76 priced orders verified: cost, price, tracking); #131 one-time POST /admin/repair/2026-10-29 reset the 9 unpriced orders (92-94, 98-103) to no cost/price 0/no tracking (checked vs 29 Oct morning backup) and switched off 8 wrong saved prices; their pushed tracking cleared in the sheet. Verified live: no negative profits, no duplicate tracking, billed $…, balance $…, cancelled credit $….
- #132 (other session): filter A-AH on all tabs (layout 15) + B/AE guard (sheet_ref) so a split row is never read or billed. #130 (Refunded) waits for #132, then rebases to layout 16.
- Yehuda got many "price changed"/"tracking" bells from the mix-up and the fix. Interim message sent by Erwin; send the "back to normal" message once #132 is live.

## 29 Oct: #129 LIVE supplier sheet layout 14: Shipped + Cancelled tabs, newest on top
- Erwin (for Ada): Orders tab = only orders still to do, newest on top. Shipped + tracking -> "Shipped" tab; cancelled -> "Cancelled" tab (reopened -> back). Moved rows keep supplier cells (P-U, AG, AH). Website reads/writes all 3 tabs (fees typed in Cancelled are billed). Setup/rebuild now writes AG/AH too (used to clear fees).
- Switch ran live 29 Oct after Erwin clicked Check sheet now: Orders 59 (all Not shipped), Cancelled 25, Shipped 0 (no shipped order with tracking yet). Row 8 was repaired before. #… position in Cancelled: the parent session fixes it (don't move it).
- Open: "Work Queue (old formulas)" tab is visible again; Erwin asked to delete it, suggested Hide instead (not done yet). Check: check-supplier-sheet (tabs section + layout 13 -> 14 switch).

## 29 Oct: #126 LIVE money chart v2 (money-chart.js 4, ui.css 23, portal.js 85, admin.js 93, i18n 84); #127 card beside bars (money-chart.js 5)
- Erwin: "change the design of the graph ... very slow to show the details both in admin and client". Cause: SVG <title> tooltip (~1s, none on tap). money-chart.js v2: own month card (.mc-tip) on hover / tap (pinned) / arrow keys, month band + others fade, bars grow once (.enter, reduced motion none). Colours --mc-gold/teal/red/blue/orange/violet in ui.css, validated with the dataviz validate_palette.js (light surface #fffdf9, dark #0b231b). Total tiles compact (UI audit: buttons <= 60px). Portal profit bars: data-tip + global quick tip (.mc-quick) instead of title.
- Checks: overview-money (card on hover/tap, 6 rows, not covering bars), shop-status (client card, profit bar tip). Live checked on Yehuda's Home and admin Overview.
- 28 Oct evening report: reports/Direct-Line-work-report-28-Oct-2026-evening-EN/HE.pdf (tools/report-template/r1029).

## 28 Oct: #125 LIVE (portal.js 84, admin.js 92, payment-orders.js 4, i18n 83): cancel fees come out of the credit
- Erwin: "deduct the 100 ... automatically". cancelledSummary: fees of never-paid cancelled orders are taken from the cancellation credit (oldest first, while it covers them): o.fromCredit, back = -fee; dueBack = paid - all fees. Orders get paidFromCredit (withCreditPaid in cancellations.mjs, on /orders and /admin/orders); DLPayOrders.state treats it as paid. Balance math unchanged.
- Live check Yehuda: paid $…, fees $… due back / credit $…, 11 orders paid from credit. #124 (chip font) also live (portal.css 37).

## 28 Oct: #122 + #123 LIVE (portal.js 83, portal.css 36; #124 chip font, portal.css 37)
- #122: cancelling an order closes its open cost revision (closeRevisionOnCancel).
- #123 (Erwin: Yehuda "cant sort out the orders"): Orders page = filters + list first, "Your earnings" folded below, closed by default (key dl-earn-open-v2); new "Not paid" chip (filter 'unpaid', DLPayOrders.state); Money by month adds adjustments (cancel fees) so profit matches the card; shop chip names normal font. Checks updated: portal-extras, orders-earnings, earned-profit, send-again.
- Sheet 28 Oct: $… cancellation fee typed in AH on the 25 KumoBags cancelled orders (Ada/Ye: $… per return; #… Mike Modern Decor excluded). Website billed them: Yehuda cancelled box = paid $…, fees $… due back $… (credit). Supplier refund to us: $… - $… = $… (13 paid orders; #… paid but not in Ada's total - ask).

## 28 Oct 2026 (evening): supplier alerts + guides + report (PR #121 LIVE, admin.js?v=91, portal.js?v=81)
- #121: Orders tab layout 13 = A4 counter formula "⚠ N COST REVISION REQUEST(S) WAITING" + orange row rule (=LEFT($O6,23)="COST REVISION REQUESTED"); Product Quotes one-time quote_tab_revision_alerts_v1 = A3 counter + orange rows. Verified on the live sheet after "Check sheet now" (the switch only runs on a full poll; the cron skips unchanged sheets). Admin revision box: "Tell the supplier on WhatsApp" (wa.me prefilled, Erwin's own WhatsApp). Hebrew fixes: old->new prices LTR (bdi / U+2066).
- Known edge: the orange revision row rule sits before the red cancelled rule; if an order with an open revision is cancelled, close the revision (todo: changeStatus to cancelled should clear revision_status).
- Guides (reports/): Client-guide-cost-revision-EN/HE.pdf, Supplier-guide-cost-revision.pdf (+ messages given to Erwin). Report: Direct-Line-work-report-27-28-Oct-2026-EN/HE.pdf.

## 28 Oct 2026 (later): portal review + bell fix (PRs #119-#120)
- #119 LIVE (portal.js?v=79): Send this product again; Money by month on Home only; profit estimate in New order summary; unpaid strip red after 14 days ("oldest from ... (N days ago)"); Mark several as delivered (Shipped filter); Payments Excel (excel-export.js payments + shared book()). Erwin said NO to repeat-customer details.
- #120 LIVE (portal.js?v=80, ui.css?v=21): bell "Product cost updated · $old -> $new" for every cost change (server sends prevBill, fixes Yehuda's old double-billed events); cost revision button is now a gold box "Is our cost too high for your Etsy price?".
- TODO when all tasks are done: write client instructions for the cost revision feature (Erwin, 28 Oct).

## 28 Oct 2026: Overview money, shop status, portal chart, cost revisions (PRs #116-#118)
- #116 LIVE: admin Overview "Money by month, all clients" (dist/p/money-chart.js: 6/12/All, lines on/off, table) + "Cancelled orders, all clients" (server/money-overview.mjs; /admin/overview returns `cancelled` + `months`). Check: check-overview-money.
- #117 LIVE (portal.js?v=76): client_stores.status active/suspended (only a label; red Suspended tag, All/Active/Suspended filter on My Stores, admin sees it). Portal Home/Orders: "Money by month" (earned on Etsy, our bill, profit, you paid us) added NEXT TO "Profit over selected period" (kept: month view = day bars). Check: check-shop-status.
- #118 LIVE (portal.js?v=77, admin.js?v=90) (cost revision): server/cost-revisions.mjs, table cost_revisions, client_orders/portal_products.revision_status. Client asks (competitor price required) on priced orders / quoted products; sheet O shows "COST REVISION REQUESTED: $x" orange (supplier layout 12, rule only); supplier's new Total cost is held (offered) until admin Approve (bill = cost + fee, price_changed event) or Keep (+reply). Products: new quote answers it (used for next orders) or admin Keep. Erwin's decisions 28 Oct: supplier gives cost, admin approves orders, product quote = future price, can ask again. Check: check-cost-revision.
- Open: portal-wide function review + ideas list (task D2, not started). Scheduled task sessions for 28 Oct 00:00 (overview-money-totals-graph, product-cost-revision) are still waiting for Erwin: answer Not now there (work done here).
- Phone notifications need Erwin to turn on Settings > Claude Code > Connect new sessions to Remote Control (blocked for Claude).

## 27 Oct 2026: client bell "Order price changed" (PR #115, live portal.js?v=75)
- A supplier cost change on an order already billed is now event `price_changed` (detail `old|new`), not a second `billed`. Client bell: "Order price changed · $old -> $new"; older double-`billed` events show the same way. Order activity label added; Hebrew added. Check: `checks/check-price-change-note.mjs`.
- Scheduled task `overview-money-totals-graph` runs once Wed 28 Oct 00:00 (asks Erwin before starting): admin Overview cancelled totals + money graph, client shop Active/Suspended, portal graphs/functions upgrade.
- New design skills installed (~/.claude/skills): taste-skill, design-motion-principles (plus ui-ux-pro-max). Sub-agents in ~/.claude/agents: sheet-checker, design-reviewer, report-writer.

## 26-27 Oct: KumoBags store suspended -> cancellations. PRs #110-#114 LIVE
- #110 sheet layout 10: Shipping status list + "Cancelled" (website writes it for cancelled orders; supplier picking it cancels nothing); Shop (C) visible again.
- #111 portal: "Product quote updated" notification opens that product's panel (S.openProductId after route render).
- #112 layout 11: "Cancel requested" in S; AH "Cancellation fee (USD)" (supplier). client_orders.supplier_cancel_fee/sheet_cancel_fee. Erwin: admins cancel any time; a supplier fee on a cancelled order is billed at once, exact amount (no Direct Line fee on cancellations), client notified (order_events kind cancel_fee); a fee given earlier is used when cancelled with no fee typed (feeOrSupplier in order-status.mjs). Admin: fee pre-filled + bell "Supplier set a cancellation fee"; bulk Status "Cancelled" (two clicks). Bug fixed: fees with cents failed (?>0 read as integer -> CAST AS NUMERIC).
- #113 sheet cron keeps full checks while any order is sheet_sync_status='waiting' (else rows waited up to 3 h after #109).
- #114 "Cancelled orders" money box on admin (client > Money) and client (Payments): paid for them, fees, due back, refunded, kept as credit, per order. Credit by default; admin "Record refund" (client_refunds table, server/cancellations.mjs; raises the balance; Undo = archive). Check: check-cancelled-money.
- Live sheet checked 27 Oct: AH header there, Shop visible, 27 rows "Cancelled" (26 KumoBags + 1 Mike Modern Decor). Erwin cancelled all KumoBags requests in admin.

## 26 Oct: SITE DOWN then fixed. Neon free hours used up (HTTP 402 on every request, ~18:50-19:14 PHT). PR #109 LIVE: use the database much less
- Cause: the every-minute supplier-sheet cron (plus hourly file-storage cron and open tabs polling every 15-30 s) kept the Neon database awake 24/7.
- PR #109: cron /api/cron/supplier-sheet first reads only the Google Sheet (Orders P-U, AE, AG + Product Quotes) and compares a fingerprint kept as spreadsheet developer metadata (key dl-supplier-sheet-seen, value hash|time); DB only when changed or every 3 h; markPaidDirty(DB, env) resets the mark. file-storage cron daily 01:15. DL.idle(): admin/portal/chat/Control bell stop polling after 10 min without input. Check: check-supplier-sheet.
- Verified after upgrade: no errors in Vercel logs since 19:14; admin and client portal (preview) load normally.

## 26 Oct: PR #107 LIVE (order-ui.js 13, ui.css 16, i18n.js 70): supplier sheet changes in the admin order activity
- Erwin: admins want to know if the supplier changes cost/tracking in the sheet while nobody is online. applySupplierRow (server/supplier-sheet.mjs) logs the supplier's own edits (cost, tracking, courier, shipped, delayed, reason; compared with the sheet_* values the website last saw) as order_events kind 'supplier_sheet', detail JSON {f,from,to}. Website's own writes are not logged. Logging starts at deploy (nothing before).
- Admin order panel shows "Supplier sheet change" old -> new (cost orange, others blue; arrow flips in Hebrew). Hidden from clients: /orders/:id/messages (also preview / login-as-client) and client /notifications. Check: check-courier-sheet.
- PR #108 LIVE (real-ui.js 9): admin bell + pop-up "Supplier changed a cost in the sheet" (order · client · old -> new, opens the order). /admin/notifications adds supplier_sheet events whose cost was already filled in (first cost / tracking not alerted). Check: check-courier-sheet.

## Tailwind plan (Erwin, 24 Oct): phase 1 = move EVERY screen (portal, admin, Control) with the look unchanged (pixel-compare, only clear bugs); phase 2 = redesign after everything is moved
- Design ideas for phase 2 (collect here, don't mix into phase 1): text that came out greyer than meant (like the Home feed titles) — look for more; Erwin liked the crisper dark titles.

## 23 Oct: PR #104 LIVE (merge d124843; portal.js 70, portal.css 34, tw.css 1): Tailwind step 1 = set-up + client Home
- Erwin asked for Tailwind instead of plain CSS; agreed: one screen at a time. @tailwindcss/cli 4.3.3 (dev). src/tw.css -> dist/p/tw.css via `node scripts/build-css.mjs` (in npm run build; npm test runs build-css --check, works on GitHub Linux too).
- Home moved: greeting, How it works, page grid, Latest updates (src/portal/08-home.js); old CSS removed. Shared parts (card, btn, stat boxes, orders table, pay strip, period picker) stay until their screens move. Checks use data-home-hello / data-home-grid / data-home-feed.
- Verified by pixel compare old vs new (EN/HE, 1440/1000/860/390, light/dark, busy + new client): identical except 2 old bugs fixed (grey update titles; Home 88px too wide at 1000px). Tool: direct-line-control/tools/tailwind-compare (README). Note: the audit only checks 1440/390; 1000px overflow was missed there.
- Next screens (client portal): Orders, Messages, Payments, My Stores, My Products, New order, then the shared parts; then admin. Worktrees feed-icons, tailwind-home can be removed.

## 23 Oct: PR #103 LIVE (merge adf56f5; portal.css 33): Latest updates icons centred
- Erwin: client Home "Latest updates" icons sat in the corner of their circles. `.feed span{display:block;color:muted}` also matched span.dln-ic (lost centring + tone colour); now `.feed span:not(.dln-ic)`. Sidebar `.me button` icons were 3px high (inline svg): now grid-centred.
- Audit rule `icon-off-centre` (icon alone in a box <=64px, >3px off centre). Caught both on the old CSS. Note: the audit's screenshots are 950px tall, so things lower on a page (like the Home feed) are measured but not photographed: take close-ups when reviewing.
- Next (Erwin agreed 23 Oct): move to Tailwind one screen at a time, starting with the client portal Home. Also proposed: run the checks job in parallel (13 min now).

## 26 Oct: PR #105 + #106 LIVE (admin.js 84, admin.css 27, i18n.js 69): Domestic Express Tracking Number; Shop + Status hidden
- Ye (supplier) asked for a "Domestic Express Tracking Number" column + edit access for [email removed]. #105: sheet layout 8 adds it as AG at the far right (yellow, supplier-typed, never written by the website; old 32-col sheets get a column appended; rebuilt tabs 33 cols). #106: poll reads AG -> client_orders.domestic_tracking (only on change; cleared = cleared), admin order panel shows it under the tracking boxes (.dom-track; clients don't see it). Layout 9 hides Shop (C) + Status (D) once (Erwin wanted them gone; hidden not deleted so no website column moves; red cancelled rows still read D). Live checked: AG header present, C/D hiddenByUser.
- Sharing the sheet with [email removed] NOT done (Erwin's call; website columns are protected, so an editor can only type in yellow/blue columns). Erwin was given a message for Ye.
- Also fixed check-payment-orders-ui: the 2nd test receipt used 2026-10-25 = the 1st receipt's default date on 25 Oct UTC, so the site deduped it (main CI was failing since 25 Oct). Now 2026-01-15.
- Worktrees domestic-tracking, domestic-on-site can be removed.

## 23 Oct: PR #102 LIVE (merge 347f719; admin.js 83, admin.css 26, portal.js 69, portal.css 32, ui.css 15, i18n.js 68, order-ui.js 12, common.js 19, payment-orders.js 2, styles.css 44): UI audit 2
- checks/check-ui-audit.mjs now also opens: admin Add client / Record a payment / Attach receipt (each + empty-form error), bulk edit bar, New order empty (error) + filled, very long name/address/link order, photo viewer (admin + client), open claim (admin Claims, client claim form + error, claim card), products waiting + priced, 8 payments with receipts, client bell, client New order errors, product details, dark mode subset (admin + client), Control page (sidebar shell + admin iframe) and its login (+ empty sign-in). audit(only) limits to a selector (login card); clipped content is measured by its visible part. Runs ~5 min; strict mode passes.
- Fixed: claim problem shown as a word (also in order activity; server claims() returns fileKinds, files ordered by id); "Problem photo" / "Shipping label" instead of 2x "Open evidence"; claim Decision select no longer full width (.claim-decide); delivered/shipped orders no longer say "already being processed"; admin New order error now in the panel footer (.foot-msg); phones: WhatsApp button moved into the top bar (.wa-top; floating .client-support hidden <=860px) because it covered Pay for orders / amounts; My Products name not a 790px button, phone price row; to-do links tap size; Hebrew: photo viewer labels + 1 / 2 order, "Direct Line replied", payment method, box aria-labels, "Select <order>", competitor placeholder, Control "Switch language"; long order numbers in payment rows cut at the end; Control: no blank band under the top bar on phones, sidebar Log out tidied, empty "Quick demo access" hidden, EN login tagline in English (was reversed Hebrew).
- For Erwin to decide (not changed): admin claim Decision defaults to "Approved" (could start at "Choose..." to avoid a wrong click); "N business days (Mon-Fri)" on claims also counts for closed claims; Control login text "The live system will use encrypted authentication..." is old wording; file pickers show the browser's own English "Choose File" (Hebrew in a Hebrew browser).
- Worktree ui-audit-2 can be removed.

## PR #95 LIVE: "Possibly delayed" orders + "not shipped yet" tracking warning (admin.js 78, portal.js 65, order-ui.js 11, ui.css 12, i18n.js 63)
- Why: Pauline put tracking on Etsy before the parcel left (we assign tracking at step 2, long before shipping). Erwin chose: the supplier marks delays in the sheet; clients see a badge + reason + notification; tracking stays visible, with a warning.
- Supplier sheet layout 6 (server/supplier-sheet.mjs): T "Delayed?" (dropdown On time / Possibly delayed, orange when delayed) + U "Delay reason", yellow supplier columns after Shipping status. Client paid moved to V, photos/links W-AD, ids AE-AF (hidden). The live sheet switched by itself on 22 Oct 2026 ~09:18 UTC (checked with the Sheets connector: 49 rows, costs/tracking/courier/status unchanged, ids in AE/AF, row 4 now also shows "0 delayed").
- Cron reads T/U: setting it / new reason / clearing it -> client_orders.delayed_at + delay_reason, event 'delayed' / 'delay_cleared' (actor admin) -> client notification. A ticked box or "yes" also counts; a reason alone does not. The website never writes T/U (except when a row is re-added).
- Portal + admin: orange "Possibly delayed" badge in the lists and order panels, with the reason, until the order ships. Portal: "Not shipped yet" under tracking on unshipped orders + a box in the order panel saying not to add the tracking to Etsy until the status says Shipped.
- Checks: checks/check-courier-sheet.mjs (old->6 and live 5->6 switches, delay set/change/clear), checks/check-delay-ui.mjs (screenshots EN/HE x 1440/390). Branch worktree: direct-line-control/delay-flag.

## START HERE (new session, 21 Oct 2026): state at the end of 20 Oct
- Everything below is live and done; nothing open from 19-20 Oct (Erwin confirmed). Last live (22 Oct, PR #94): admin.js 77, admin.css 21, i18n.js 62, portal.js 64, portal.css 29, ui.css 11, excel-export.js 2, payment-orders.js 1.
- Daily reports: direct-line-control/reports/Direct-Line-work-report-YYYY-MM-DD(.pdf | -he.pdf). Template + scripts in direct-line-control/tools/report-template/ (head.html = styles; body.html = last day's content; make_he.py translates; render*.cjs print the PDF with the playwright in C:/Users/erwin/.cache/codex-runtimes/...; preview*.cjs = one PNG per section, A4 page ≈ 1020 px).
- Client messages / WhatsApp images: direct-line-control/reports/client-messages/ (made-up "Sample Shop" data only — never real customer names).
- Office checks: tools/open-xlsx-in-excel.ps1 and tools/open-docx-in-word.ps1 (run with powershell -STA -File ... -Dir <folder with sample-*.xlsx/.docx>) open files in Excel/Word, report problems and save a PNG.
- 22 Oct: the 15 merged worktrees were removed (branches kept); 23 Oct: orders-limit, admin-cards, pay-orders, cancel-ui, cron-retry removed too. Left: continuation, current-site, login-as-client, delay-flag (#95, merged, from another session). To remove one later: first unlink its node_modules junction only ([System.IO.Directory]::Delete(path, $false) in PowerShell), then git worktree remove ../<name>. Work in a fresh worktree per task: git worktree add -b claude/<name> ../<name> origin/main, then a node_modules junction to ../continuation/node_modules.

## 23 Oct: PR #101 LIVE (merge dcfaeb5; admin.js 82, admin.css 25, portal.js 68, ui.css 14, i18n.js 67): UI audit check
- checks/check-ui-audit.mjs: 32 admin + portal screens x EN/HE x 1440/390; measures page sideways scroll, off-screen elements, oversized / too-tall / cut-off buttons, buttons in a row not lined up, overlapping controls (ignores content scrolled under a panel footer and closed <details>), tap targets < 28px and inputs < 32px on phones, English left in Hebrew (text + placeholder/title/aria-label). Fails on any finding; AUDIT_REPORT=1 only lists them (findings.json in the check's screenshot folder).
- Fixed what it found: Copy full address 670px wide (.full>.btn fit-content); tracking row = .track-form (fields row + .form-actions; Tracking update received no longer btn-sm); Open client footer framed; phone .pm-remove 32px, .drawer .back 36px; Hebrew 'Added', 'No products yet', empty-payments text, 2 placeholders.
- NOT covered yet (Erwin left the next steps to Claude): dialogs (add client, record payment, attach receipt, bulk edit), notifications panel, photo viewer, claims with data, products waiting for a price, long names/addresses, error states, dark mode, Control page + login. Plan: extend the audit to these, review every screenshot, fix in one PR; then small no-decision UX improvements; list bigger feature ideas for Erwin to pick. Worktrees ui-audit, design-qa can be removed.

## 23 Oct: PR #100 LIVE (merge 75eee1a): design QA (admin.js 81, admin.css 24, portal.js 67, portal.css 31, ui.css 13, client-store-ui.js 6, clients-section.js 7)
- Erwin: sidebar / tab bar / box links did the same thing; misaligned rows; huge buttons; file + colour pickers; Terms page.
- Control sidebar (dist/index.html + dist/en/index.html) got Claims + Products ([data-client-tab]; clients-section.js TABS; admin onParentMessage accepts them). Admin adds body.in-control when the parent page has .nav-item[data-client-tab] -> [data-main-tabs] hidden. Test frames (test-admin.html) keep the tabs.
- Boxes: only Orders + Not paid yet are buttons (.stat-go); Clients + Earnings are .stat-plain; no .stat-more lines.
- Client panel rows: .ord-side grid (.ord-amt / .ord-pay / .ord-st). ui.css: .field>.btn and .form-grid>.btn keep their width; styled input[type=file]; small input[type=color]; .form-actions row. Store form Save in .form-actions. Terms: [data-terms-view] 860px centred, termsText() bolds "N. " titles and joins lowercase-continued lines.
- Checks: check-admin-cards (2 clickable boxes; test-control.html hides tabs, Claims/Products via dl-set-tab). Worktree design-qa can be removed.

## 23 Oct: PR #99 LIVE (merge 075975d, server only): the minute cron also rewrites rows waiting for the sheet
- Found after #98: rows marked sheet_sync_status='waiting' were only rewritten by retryPendingGoogleSheetOrders on /admin/overview, and the admin dashboard stops polling while its tab is hidden. /api/cron/supplier-sheet (api/index.mjs) now runs it after pollSupplierSheet (still 4 rows per 30 s; returns { ...poll, retry }).
- Verified live 23 Oct ~06:55 UTC: Order Log AG (synced at) moved 4 rows a minute; row 50 (#…) now "CANCELLED - do not ship", S4 "1 cancelled". Check: check-supplier-sheet (waiting row rewritten by the cron alone). Worktree cron-retry can be removed.

## 23 Oct: PR #98 LIVE (merge 25a343b; admin.js 80, admin.css 23, i18n.js 66): cancel in the status row + cancelled rows red in the supplier sheet
- Erwin: Cancel button sat oddly (it was inside .status-btns, so it got chip styling). Now "Cancelled" is the last chip in Update status ([data-cancel-open]); it opens [data-cancel-box] under the row: fee, $… Cancel this order (two clicks), Keep the order. Separate cancel card removed; request card buttons in .cancel-row.
- Sheet layout 7 (supplier-sheet.mjs cancelFormat, rules only): D = "CANCELLED - do not ship" (STATUS.cancelled); conditional rules on =$D6=...: D bold white on red, row A-AD light red + strikethrough; "Cancellation requested" rows orange; S4 = "N cancelled"; instructions mention it. Migration marks cancelled / requested orders waiting.
- Live checked 23 Oct: layout switched (S4 "0 cancelled", new instructions in A3). Row 50 (#…, cancelled) still said "Cancelled": waiting rows are only rewritten by retryPendingGoogleSheetOrders when an admin opens the dashboard (/admin/overview). Opening admin once fixes it.
- Checks: check-courier-sheet (6 -> 7), check-admin-orders (cancel box). Worktrees cancel-ui, admin-cards, pay-orders, orders-limit can be removed. graphify refreshed after #98.

## 22 Oct end of day (23 Oct 02:30 PHT): day report made for 21 + 22 Oct (PRs #88-#97 + Etsy stores checked, discounts renewed)
- reports/Direct-Line-work-report-2026-10-22(.pdf | -he.pdf). Built from scratchpad copy of tools/report-template with a gen.py (EN + HE from one content file) and cropped check screenshots.

## 23 Oct: PR #97 LIVE (merge fb82be1, live versions confirmed): admin cards = what is owed now + client "Pay for orders" (admin.js 79, admin.css 22, portal.js 66, portal.css 30, i18n.js 65)
- Erwin: the Billed card mixed paid and unpaid; show only what is not paid, make the cards clickable. Admin cards (02-layout.js renderKpis) are buttons: Clients -> Clients tab; Orders -> filter pending / needscost; 'Not paid yet' = sum of DLPayOrders.dueCents of orders with state 'unpaid' (ignores the month picker), red (.owe) while > 0, note when t.outstanding differs from it by a cent or more (a payment not linked to orders); Our earnings -> Clients tab.
- Client: payStrip() on Home + Orders ('N orders not paid yet · $X [Pay for orders]' -> #/payments?pay=1, route sets S.payOpen, scrolls to #pay-flow). Payments: payFlow() replaces unpaidCard/howToPay/transferForm (unpaidCard stays for admin preview): 1 checklist (all unpaid ticked, compare:false), 2 'Send the total $X' + Copy amount + bankRows(), 3 amount (follows ticks until typed: f.dataset.amountTyped), date, file. syncPayFlow() keeps total/copy/amount/gap. Same POST /transfers {orderIds}.
- Checks: check-admin-cards, check-pay-for-orders (new); check-month-view, check-payment-orders-ui updated. Worktrees admin-cards, pay-orders, orders-limit can be removed after merge.

## 22 Oct: PR #96 LIVE (merge ab07f13, production deploy success): order lists no longer cut at 500 orders (server only, no ?v= change)
- GET /admin/orders had LIMIT 500: past 500, older orders would vanish from the Orders tab, client panel, Excel export and payment tick list. Limit removed; withMessages/withPhotos look up ids in parts of 300 (byIdParts in server/portal.mjs).
- Check: checks/check-order-list-size.mjs (700 orders; fails on the old code). Worktree orders-limit can be removed after merge.

## 22 Oct: PR #94 LIVE: order form = a box per product, a row per variation (portal.js 64, portal.css 29, i18n.js 62)
- Erwin: Pauline's Etsy order (listing …, options Color + Hook) = one product, 3 × Black Walnut 7 Hooks + 2 × Black Walnut 6 Hooks; also several products each with variations. Form: [data-prod] box (link) with [data-var] rows (How many + 'Variation as on your store order'); '+ Add another variation of this product' / '+ Add another product'. Same flat items JSON; edit groups by link.
- Variation text: one product = a line per variation; several = 'Product 1:' + lines, 'Product 2:' … Sheet: G 'Open product 1' when several links, AB 'Product 2: <link>'.
- Pauline's order #… (id 63, pending, client 8) converted to 2 lines via admin PUT /orders/63 {items}: qty 5, sheet row 50 shows the two variations. Worktree order-products can be removed.

## 22 Oct: PR #93 LIVE: supplier sheet 'Client paid' column + totals (no front-end change)
- Erwin: the supplier only has the sheet; show paid / not paid per order and a way to work out what is billed. Orders tab col T 'Client paid' (Paid / Not paid / empty = no bill yet), green/orange, protected; photos/links/ids moved to U-AD (ids AC-AD). Row 4 totals (sheet formulas on P): 'Totals (USD):' sum, 'Paid by clients: $X', 'Not paid yet: $Y', 'N not paid'.
- supplier_sheet_layout '5' (ensureLayout inserts T once if S5='Shipping status' and T5='Photo 2'). paidLabels() in payment-orders.mjs; payment changes call markPaidDirty() -> next poll refreshPaidColumn() writes T in one write; row syncs write T too.
- Verified live 22 Oct: row 4 = $… / paid $… / not paid $… / 4 not paid; ids in AC/AD; poll ok (46 rows).

## 22 Oct: PR #92 LIVE: order lines in the client order form (portal.js 63, portal.css 28, admin.js 77, i18n.js 61, excel-export.js 3)
- Pauline (Yehuda's team): one order with 3 pcs Black Walnut 7 hooks + 2 pcs another colour; the form had one qty/variant, so she used the note. Now 'What the customer ordered': lines of link + How many + Color/size; '+ Add another product or colour' copies the link. client_orders.items (JSON); etsy_url / quantity (sum) / variant ('3 × X' per line, 'Product N · ' when links differ) derived (orderItems / itemsSummary in portal.mjs). Admin edit without items drops items (text kept); admin variant is a textarea.
- Checks: tests/order-lines.test.mjs, checks/check-order-lines.mjs. Worktrees order-lines, sheet-paid, receipts, tab-names, payment-orders, order-dates can be removed.

## 21 Oct: PR #91 LIVE: receipts for payments + clearer admin Payments tab (admin.js 76, admin.css 21, portal.js 62, portal.css 27, i18n.js 60)
- Erwin: no clear way to attach the receipt for a paid bill and send it to the client; Payments tab hard to use. "Not invoice, receipt": all UI wording is now receipt (storage stays portal_files kind 'invoice', /admin/invoices routes).
- Admin Money > Payments: summary + To do (no receipt / not linked; click jumps to card #pay-<id>), 'Transfer confirmations to check' (pending/archived only), one .pay-card per payment (Orders, Receipt, Source), Attach receipt form (Bill to from billing details + Copy, file, date) -> POST /admin/invoices {paymentId, orderIds of the payment}; Remove = POST /admin/invoices/:id/archive (soft). '+ Record a payment' opens a 3-step form; Edit opens inside the card (Archive payment inside). Open state on S.drawer: payNew / payEdit / payAttach / transferId.
- Client: notification 'New receipt' (detail 'amount|YYYY-MM-DD' of its payment), Payment history rows (.cpay-row) with 'Download receipt', 'Receipts for a month' zip, order panel 'Receipts'.
- Checks: check-payment-orders-ui (full flow + screenshots), check-payment-orders (receipt API + remove rights). Worktree receipts can be removed after merge.

## 21 Oct: PR #90 LIVE: supplier sheet tab "Work Queue" is now "Orders" (admin.js 75, i18n.js 59)
- Erwin: "Orders" is easier for suppliers and clients. The sheet already had a hidden tab "Orders" (the website's legacy order log, google-sheets.mjs), so: step 1 hidden "Orders" -> "Order Log"; step 2 (>=10 min later) "Work Queue" -> "Orders" (same gid …) + A2 "Direct Line — Orders". Done by ensureTabNames() in the supplier-sheet poll; state in portal_settings sheet_tab_names ('' -> log:<t> -> done).
- Code reads names via tabNames(DB) (supplier-sheet.mjs): wq = 'Orders' when done, else 'Work Queue'; log = 'Order Log' after step 1. A write with a just-changed name fails (no such tab) and is retried; never lands in the wrong tab. Setup/rebuild uses the current name. Backup tab 'Work Queue (old formulas)' keeps its name. Code constants WQ (old) / WQ_NEW / LOG_NEW.
- Check: check-supplier-sheet runs both steps (fake sheet now renames tabs).

## 21 Oct: PR #89 LIVE (admin.js 74, admin.css 20) + Yehuda's $… linked
- Erwin asked: link Yehuda's $… payment (id 2, client 8) to his first 40 priced orders, not the 4 new $… ones. Done from his admin session in Chrome (POST /admin/payments/2 {orderIds}): 40 orders paid, sum $… (9-19 Oct); the 4 $… orders (20-21 Oct, no cost yet) stay 'No bill yet'. Balance unchanged (billed 1301, paid 1301). Logged in payment_edits.
- #89: client panel Orders rows show the order date next to the order number (.ord-date). check-client-panel asserts it. Worktrees order-dates and payment-orders can be removed.

## PR #88 LIVE (21 Oct): payments linked to orders + billing details for receipts (admin.js 73, portal.js 61, payment-orders.js 1, excel-export.js 2, ui.css 11, i18n.js 58)
- Erwin (21 Oct): Yehuda paid $… for his first 40 orders; payments had no order link and the 'Linked orders' box (invoice file links) listed every order incl. unpriced ones, no tick boxes. Decisions: gap allowed and shown; client may tick orders on a transfer (optional); Erwin links Yehuda's $… himself (Edit > 'Tick oldest up to the amount').
- server/payment-orders.mjs: table payment_orders(payment_id, order_id). Order paid = linked to a non-archived payment (orders get paymentId/paidAt). Balance unchanged (billed - paid). checkOrders(): own client, billed (price unless cancelled + adjustments > 0), not archived, not paid by another payment; refused = nothing saved. Edit logs field 'orders' in payment_edits. Restore drops orders paid meanwhile. transfer_orders = client's ticks; /admin/transfers/:id/record takes {orderIds, amount, paidAt, method, note}.
- dist/p/payment-orders.js (DLPayOrders): state/dueCents/tag/checklist/linked/tickOldest (ticks oldest in order, stops at the first that doesn't fit). Admin Money > Payments: summary, billing card, transfer 'Record this payment' fills the form, tick list, edit with tick list, payments table Orders column; Orders tab 'Not paid' filter + tags; order panel Payment row. Portal: Cost cell tag, order panel Payment row, Payments page 'Not paid yet', transfer tick list, history Orders column (no gap shown to clients). Excel Paid = Yes when paid.
- Billing details (Ada: name, address, company, contact for the invoice header): server/billing.mjs table client_billing; client PUT /billing (Payments page card, required name + address + email or phone); admin sees + Copy + edit (POST /admin/billing/:id).
- Checks: checks/check-payment-orders.mjs (server rules), checks/check-payment-orders-ui.mjs (flow + EN/HE 1440/390 screenshots), tests/payment-orders.test.mjs; check-portal-money-columns reads the tag separately.
- (The 500-order limit on admin order lists was removed in PR #96.) Worktree direct-line-control/payment-orders can be removed after merge.

## PR #87 LIVE: Export orders to Excel (replaces the Word export of #86) (admin.js 72, portal.js 60, excel-export.js 1, i18n.js 57)
- Erwin: Excel instead of Word. dist/p/excel-export.js (word-export.js removed): .xlsx built in the browser. Columns A-H: order, date (Excel date), customer, product, qty, status, total ($ number), Paid (Yes/No drop-down, green when Yes). Under the table: Total =SUM, Paid =SUMIF(H,"Yes"), Not paid yet. Not-priced / cancelled orders show text, not counted. Autofilter, frozen header, landscape. Hebrew: rightToLeft sheet, כן/לא.
- Buttons "Export to Excel": portal Orders (orders on screen) and admin client panel Orders.
- Checks: tests/excel-export.test.mjs, checks/check-excel-export.mjs. Opened in Excel via COM (scratchpad xlsx/render.ps1): opens fine, totals follow Paid. Worktrees word-export / excel-export can be removed.

## PR #86 LIVE: Export orders to Word (.docx) (Shahar) (admin.js 71, portal.js 59, word-export.js 1, i18n.js 56)
- dist/p/word-export.js builds the .docx in the browser (own small ZIP writer). Table: order, date, customer, product, qty, status, total, Paid (Word check box, w14:checkbox). Total row (non-cancelled). Hebrew = RTL table; only Hebrew runs get w:rtl.
- Portal Orders: "Export to Word" = orders on screen (store, status chip, search, sort). Admin client panel Orders: same for that client.
- Checks: tests/word-export.test.mjs, checks/check-word-export.mjs. Files opened in Word via COM (scratchpad render.ps1): open fine, 1 page, check boxes count. Worktree direct-line-control/word-export can be removed.

## PR #85 LIVE: Competitor price comes from the client portal (admin.js 70, portal.js 58, portal.css 26, i18n.js 55)
- Erwin: clients enter it, not Ye. portal_products.competitor_price / client_orders.competitor_price (free text, 200 chars).
- Portal: "Send a product for a quote" field; product panel (Save any time, PUT /products/:id {competitorPrice}); new order form (prefilled from the product); order "Your numbers" (accounting-only key, allowed any time). Shown in My Products list.
- Sheet: website now writes Work Queue O and Product Quotes N. supplier_sheet_layout / quote_tab_layout '4' = one-time copy of values typed in those cells into the DB before the website overwrites them.
- Admin: order panel row and product price form. Hebrew uses <bdi>/dir=auto for the free text.
- Check: checks/check-competitor-price.mjs; sheet checks updated. Worktree direct-line-control/client-competitor can be removed.

## PR #84 LIVE: bigger product photos in the client portal (portal.js 57, portal.css 25)
- My Products rows: thumbnails 112 px (84 on phones). Product panel photos at least 200 px (.mp-photos), click opens full size.
- Check: checks/check-my-products.mjs (thumbnail size). Worktree direct-line-control/portal-photos can be removed.

## PR #83 LIVE: bigger product photos in admin (admin.js 69, admin.css 19)
- Client panel Products rows: thumbnails 64 px (56 on phones). Price form (client panel + Products tab): photos 160 px (.qf-photo, two per row on phones), click opens the full-size viewer.
- Check: checks/check-client-panel.mjs (sizes + viewer). Worktree direct-line-control/bigger-photos can be removed.

## PR #82 LIVE: Sort dropdowns on the long lists (admin.js 68, portal.js 56, common.js 18, ui.css 10, i18n.js 54)
- dist/p/common.js DL.sortPick / sortList / setSort / bySort; choice remembered per list in localStorage (dl-sort-<list>).
- Admin: Orders tab, Clients tab, Products tab, client panel Orders + Products (default there: waiting for price first). Portal: Orders, My Products. Sort maps in src/admin/00-start.js and src/portal/00-start.js.
- Short lists (stores, claims, payments) left as they are. Check: checks/check-sorting.mjs. Worktree direct-line-control/sorting can be removed.

## PR #81 LIVE: Competitor price column in the supplier sheet (Ye's request; Erwin: both tabs)
- Work Queue: O "Competitor price" after Notes (light blue, unprotected). Supplier columns now P Total cost, Q Tracking, R Courier, S Shipping status; more photos/links T-AA; ids AB-AC. supplier_sheet_layout '3' (ensureLayout inserts one column after checking N5/O5).
- Product Quotes: N "Competitor price" after Supplier note; Status O, Product ID P. quote_tab_layout '3' (ensureQuoteLayout checks M4/N4).
- The website never reads or writes the column; a Work Queue rebuild (setup again) keeps typed values. Free text, e.g. "$… on Etsy shop X".
- Checks updated: check-supplier-sheet, check-courier-sheet, check-saved-prices, check-quote-sheet, check-quote-shipping. Worktree direct-line-control/competitor-price can be removed.

## 18 Oct end of day: Erwin says everything is done
- Done (per Erwin): Yehuda's $… fee applied to his orders, month picker tried live, Preact step 4 talked over with Daniel, Daniel's payment logic + unpaid free month, Shahar's "her need 24". Nothing open from 18 Oct. Older notes below that list these as open are out of date.

## 18 Oct: day report made
- PDF of 18 Oct work (PRs #75-#80, morning check-in, screenshots): reports/Direct-Line-work-report-2026-10-18.pdf (7 pages). Source in session scratchpad only.

## 18 Oct: PR #79 + #80 LIVE (admin.js 67, portal.js 55, i18n 53, client-store-math 4, client-store-ui 5)
- #79 fee choice: client Account form 'Use this fee for' = New orders only / New + Pending / New + In progress / New + Pending + In progress / All (shipped too). Server FEE_SCOPES; cancelled + archived never change. Old applyFeeToOrders:true still = all.
- Yehuda: all 32 orders still have $… (made before the fee went back to $…). Erwin must pick a choice + Save to fix them — not done by Claude.
- #80 month view: admin 'Show' picker above the 4 cards (All time or one month, by order date, remembered in localStorage; card 3 = Billed that month + outstanding overall). Portal + admin client panel Period picker lists months ('m:YYYY-MM'); one month = profit chart with a bar per day. Check: checks/check-month-view.mjs.

## 18 Oct: code clean-up steps 1-3 LIVE (PR #77, #78) — no site change
- #77: admin.js / portal.js are written as one file per screen in src/admin (15) and src/portal (17); scripts/build-screens.mjs joins them byte for byte into dist (Vercel build runs it; npm test checks it). Live files verified identical to before (sha1). EDIT src/, then node scripts/build-screens.mjs.
- #78: GitHub Actions .github/workflows/tests.yml on every PR/push: "unit" (npm test) + "checks" (30 behaviour checks in checks/: 19 API + 11 Chrome; PGlite + playwright-core devDependencies; screenshots as artifact). First run: all pass (~5.5 min). Retired 4 code-text unit tests now covered by browser checks.
- Commands: npm test · npm run checks · npm run checks:api · node scripts/run-checks.mjs <name>. CLAUDE.md updated.
- Step 4 (Preact, one screen at a time) not started: discuss with Daniel first.

## PR #76 LIVE: client profit only for USD orders (portal.js 54, admin.js 65, client-store-math 3, client-store-ui 4)
- Erwin: "do it" (the currency open item). No exchange rate guessed: non-USD orders show earnings in their currency, profit "Not in USD", left out of totals; cards/store table say "N orders in other currencies not counted" (totals.otherCurrency). Server orderOut profit null for non-USD.
- The old open item "profit ignores currency" is closed.

## PR #75 LIVE: Product Quotes "X / No / N/A" = not available
- Ada marked P-8 with X in price + Available? and note "The product has been removed."; only "Not available" was understood. notAvailable() now accepts X / No / N/A; one-time re-read of waiting products (quote_reread_v1).
- 18 Oct status: Pauline entered earnings on all 29 of Yehuda's orders (21 via "You earned"); total profit $…, no losses. Ada: shipping on 17/18 products; #8 = not available.
- Note: a direct admin write to the live site from Chrome was blocked by the permission check; fixes go through the code instead.

## PR #74 LIVE: no "ADDRESS CHANGED" warnings in the supplier notes (admin.js 64)
- Erwin: clear them and never put warnings in the notes again. websiteCells no longer adds it; portal never sets address_changed_at; admin warning box + bulk button removed. The cron cleared the 16 old ones (5 rows/run); verified live 16 Oct: Work Queue Notes column clean.
- Also: Product Quotes layout switch skips a tab without headers (fake-sheet case) instead of failing the poll.

## 16 Oct: local check scripts brought up to date
- 22 outdated verification/check-*.mjs fixed to the current rules (simple address, no supplier share, admins any status, customer details until shipped, viewer time zone, profit after Etsy fee, folded add form / store table, 4-tab client panel, no address flag, Work Queue layout 2, legacy Orders row 58 cells, Product Quotes tab visible). check-address-ui.mjs retired (covered by check-simple-address.mjs). check-address-flag.mjs now points at continuation/ (it used the old addr-fix worktree).
- PDF report updated with #72-#74: reports/Direct-Line-work-report-2026-10-15.pdf (12 pages).
- I could not close the WhatsApp Web tab I opened in Chrome (session lost its tab group): Erwin closes it.

## PR #73 LIVE: Product Quotes separate "Shipping per order" column (portal.js 53, portal.css 23, admin.js 63, i18n 50)
- Yehuda: My Products prices are without shipping. Erwin: Ada gets her own shipping column; shipping is per order (one parcel).
- Sheet layout 2 (15 cols): J Price per item, K Shipping per order (NEW, yellow), L Available?, M Supplier note, N Status, O Product ID (hidden). Live tab switched once by ensureQuoteLayout() (portal_settings quote_tab_layout=2): insertDimension at K, only if K4 was "Available?".
- portal_products.supplier_shipping (passed on as is, no fee); client_orders.quoted_shipping; order from product = unit x qty + shipping (kept on edits; stale refused). Unclear shipping -> Status "Shipping not clear".
- Client: My Products, details, new order form, order panel show "Shipping per order" / "Shipping not added yet". Admin Products: shipping field.
- Checks: verification/check-quote-shipping.mjs (fake sheet: old layout switch), check-quote-sheet.mjs, check-quote-shipping-ui.mjs.
- Tell Ada: new column K, shipping per order in USD; existing 18 products show "Shipping not added yet" until she fills it.

## PR #72 LIVE: client profit after the Etsy fee; "You earned" field (portal.js 52, admin.js 62, client-store-math 2, client-store-ui 3, i18n 49)
- From the WhatsApp group "Direct Line - Yehuda Vaknin" (16 Oct): Yehuda said Orders prices aren't earnings, reduce the Etsy fee; Shahar: enter profit after Etsy fees (Etsy "You earned").
- Orders list: Earned / Cost / Profit (Net profit column removed). earned = client_orders.etsy_earned (new, Etsy's "You earned") else selling_price - etsy_fee; profit = earned - price; no fee -> "Add Etsy fee", no figure. server earnedAfterFee(), shared DLClientStoreMath.earnedCents(); totals count only orders with earnings (+ adjustments).
- Same rule in order panel, cards, chart, store table (Earned column), admin client's profit.
- Still open from that chat: My Products prices are without shipping (Yehuda; Shahar said it will be handled) -> needs a shipping decision. Pauline was asked to add earnings for all orders.
- Check: verification/check-earned-profit.mjs.

## 2026-10-16: day report made
- PDF report of 15 Oct work (incl. morning 16 Oct, PRs #61-#71, with screenshots): reports/Direct-Line-work-report-2026-10-15.pdf. Built from HTML + Playwright print (source kept in the session scratchpad only).

## PR #71 LIVE: photos open in a viewer on the same page (common.js 17, ui.css 9, portal.js 51, admin.js 61)
- Shared viewer in dist/p/common.js (DL.openPhoto): order photos, product photos, sheet photos, image transfer confirmations ([data-photo]) open on top of the page (.pv); arrows/keys step, counter, Esc/X/outside closes; Esc doesn't close the side panel. Clicks inside rows that open an order/product are left alone.
- Gotcha: tests load common.js in a fake window: listeners are guarded with typeof checks.
- Check: verification/check-photo-viewer.mjs (asserts no new tab).

## PR #70 LIVE: client My Products — click a product for details (portal.js 50, portal.css 22, i18n.js 48)
- Rows ([data-open-product]) open openProduct() in the side panel: all photos, price/options, shipping note, supplier note, variation, expected/month, sent/updated, link. Priced products: "Order this product" (S.orderProduct -> bindForm pre-picks it). Links in rows still open the link.
- Check: verification/check-my-products.mjs (details + order-from-product screenshots).

## PR #69 LIVE: client My Products — filter, search, "New price" marks (portal.js 49, portal.css 21, i18n.js 47)
- Erwin: clients couldn't tell which quoted products were priced. Now: chips All / Waiting for price / Priced / Not available with counts (localStorage dl-products-filter), search (name/variation/link), newest change first, compact rows (.mp-row) with status, price/options, supplier note, date updated.
- "New price"/"Updated" mark = changed since the client's previous visit to the page (localStorage dl-products-seen-<clientId>; not in admin preview). Add form folds away (details[data-add-product]; open when no products).
- Check: verification/check-my-products.mjs (screens in verification/my-products/).

## PR #68 LIVE: "ADDRESS CHANGED" only for real changes; admins can clear it (admin.js 60, admin.css 17, i18n.js 46)
- Cause (reproduced, verification/repro-addr-flag.mjs): any save of an In-Progress order (client details form e.g. only a tax number, client Etsy numbers, admin fee edit) rewrote the customer columns and set address_changed_at when the stored text differed only in spaces / CRLF / "us" vs "US" / one box vs parts.
- Fix: server/portal.mjs sameCustomer(); when same, the stored address is kept as is (no rewrite, no flag). Real changes still flag (incl. spelling/case fixes).
- Admin: order panel shows the warning with "Clear warning"; bulk bar "Clear address warning" (PUT {clearAddressFlag:true}, admin-only, alone). Clients never see the flag (CLIENT_HIDDEN addressChangedAt).
- The 16 existing flags (all Yehuda's In-Progress orders, 2026-10-14) were NOT cleared: old addresses aren't stored, so real vs false can't be told. Erwin checks them with Ada and clears them himself in admin (decided 2026-10-19); not a Claude task.
- Check: verification/check-address-flag.mjs (screens in verification/address-flag/). Worktree direct-line-control/addr-fix (branch claude/address-flag-fix) can be removed.

## PR #67 LIVE: admin client panel = 4 grouped tabs (design option A) (admin.js 59, admin.css 16, i18n.js 45)
- Summary row .kpis (4 tiles; 2x2 on phone). Tabs .gtabs: Orders · Shop (Stores/Products) · Money (Payments/Saved prices) · Account (Details/Activity) via CLIENT_GROUPS in admin.js; sub-tabs .subtabs; each group remembers its last sub-tab (S.drawer.last). Orders: Store dropdown [data-client-store]. Hebrew "Shop" = 'חנויות' (longer text overflowed on phones).
- Check: verification/check-client-panel.mjs asserts no tab label is cut off.

## 2026-10-16: Erwin confirmed his live checks are done
- Still open: ADDRESS CHANGED flags (check one order's activity), shipping on product-quote orders (decision), Shahar's "her need 24", profit ignores currency, Daniel: payment logic + unpaid free month, 9 stale local checks, storage health check. PR #35 (time zones) is MERGED (checked 2026-10-16), not open.

## PR #66 LIVE: tidy admin client panel (Erwin's video: "so messy, doomscroll") (admin.js 58, admin.css 15, i18n.js 44)
- Client panel tabs: Orders · Stores · Products · Payments · Saved prices · Activity · Account (scroll sideways on phones; gold dot on Products when one waits for a price).
- Orders tab = folded "Performance by store" (localStorage dl-fold-perf) + compact one-line order rows (.ord-row buttons). Products tab = short rows (details.prod-row), price form opens on click, waiting first. Stores tab = list + Add store. Activity: big login card removed (footer has the buttons), lists show 8 + "Show all". Account: Archive folded.
- Open rows survive the 20 s soft redraw (details[data-keep]). Gotcha: .dtabs with overflow-x needs min-height (grid item shrank to 0 and hid the tabs).
- Check: verification/check-client-panel.mjs (screens in verification/client-panel/). Phone orders tab 3,600 px -> 1,700 px for 18 orders.

## PR #65 LIVE: several prices for one product in Product Quotes (Ada) (admin.js 57, portal.js 48, i18n.js 43, ui.css 8)
- Ada asked how to enter products with several price points. Price cell (Product Quotes J) now takes one option per line (or ; or |): "Silver: 3.20" / "Gold: 4.50". One number works as before. server/quote-sheet.mjs parsePriceOptions(); stored in portal_products.price_options JSON [{label, supplier, unit}] (unit = option + client fee); unit_price/supplier_price = cheapest option.
- Unclear text: nothing priced, Status column M says "Price not clear: write Name: price, one per line".
- Live sheet switched once (portal_settings quote_tab_options_v1): strict number rule on J removed (non-strict rule with help message), note on J4, new help text in A2. Verified by reading the sheet 2026-10-15. No columns moved.
- Client: My Products lists each option; new order from that product requires "Which option did the customer buy?"; fixed price per item = that option; option label goes in front of the variation ("Gold · Engraved") so the supplier sees it in the Work Queue. Admin > Products shows supplier -> client per option; saving a price there replaces the options with one price.
- Checks: tests/quote-price-options.test.mjs, verification/check-quote-options.mjs (screens in verification/quote-options/).

- Every non-GET request made as a client goes into admin_impersonation_log (client_id, method, path, status). users.last_seen_at = last client portal use (max every 5 min; admin visits don't count). GET /admin/clients/:id/activity feeds the Activity tab (last sign-in, last active, what the client did, admin changes as them).
- Products / claims / stores added in this mode are still recorded as the client in their own tables (the impersonation log shows that an admin did it).
- Checks: tests/login-as-client.test.mjs; verification/check-login-as-client.mjs (screenshots in verification/login-as-client/). Branch worktree: direct-line-control/login-as-client. Erwin confirmed it works on the live site (2026-10-22). DONE.

## PR #62 LIVE: saved prices for repeat orders (Shahar) (admin.js 55)
- server/saved-prices.mjs. When the supplier fills Total cost (Work Queue O) the cost is saved for client + store + product key (Etsy listing id; other links host+path) + variation + country + quantity. A new identical order (insertOrder) gets supplier_cost + its fee at once, price_source='saved'; Work Queue row shows the cost + a note in Notes; supplier changing the cost re-bills, clears the note, saves the newer cost.
- Admin: client panel tab "Saved prices" (Forget = active=false, 2 clicks); order panel note. Clients never see it.
- Decisions made by Claude (Erwin did not answer): quantity must match; the note in the sheet. PR #63: one-time backfill from orders already priced by the supplier (portal_settings saved_prices_backfill_v1, newest cost wins, cancelled/archived/fixed-quote skipped). Guides: guides/ (price-check PDF EN/HE).
- Checks: verification/check-saved-prices.mjs (fake sheet), check-saved-prices-ui.mjs.

## PR #61 LIVE: Product Quotes tab for the supplier (portal.js 46, admin.js 54)
- Client My Products -> "Send for quote" -> row in supplier sheet tab "Product Quotes" (server/quote-sheet.mjs): A-I website (date, P-id, photo preview + 2 more photo links via signed /api/portal/sheet-product-photos URLs, product link, name, variation, expected/month), J Price per item (USD, product only) / K Available? / L Supplier note = yellow supplier columns, M Status, N Product ID (hidden). No client name.
- Read by the supplier-sheet cron every minute: client price per item = supplier price + client's fee per order (users.commission_per_order or default). Supplier price stored in portal_products.supplier_price, shown only to admins. Admin can still override in admin > Products; sheet Status follows.
- Tab created live 2026-10-15 (verified, empty: no products yet). Checks: verification/check-quote-sheet.mjs, check-quote-ui.mjs.
- Open from Shahar (parked by Erwin): auto-remember prices per client+store+product+country for repeat orders. Also unclear: Shahar's "her need 24" on the Our earnings card.
- Note: orders created from an approved product keep a fixed total = price per item x qty (no shipping). With product-only quotes that misses shipping: needs a decision.

## PR #60 LIVE: tax number / gift message moved out of Notes
- server/order-notes.mjs splitNotes(): Etsy IOSS/VAT/EORI/tax-number line (+ amount line) and "Gift message:"/"Gift note:" block go to their fields on save (never overwrites a filled field). Existing orders were moved once by the supplier cron (portal_settings notes_split_v1='1'). Verified live: Lanquetin row now has L/M filled and Notes clean.

## PR #59 LIVE: bulk edit in admin Orders (admin.js 53, admin.css 14)
- Checkbox per row + "Select all" in the bar above the list. Bar: Set status (Pending/In Progress/Shipped/Delivered), Set courier, Set fee (re-prices supplier-cost orders), Archive (2 clicks), Restore (Archived orders view), Clear selection.
- Runs the normal PUT /orders/:id (or archive endpoint) per order, one after another; failures stay selected. Cancel is NOT in bulk (each cancellation needs its own fee decision).
- Check: verification/check-bulk-orders.mjs (screenshots in verification/bulk-orders/).

## PR #57-#58 LIVE: courier, tax number, gift message; address shown once (admin.js 52, portal.js 45)
- Supplier Work Queue layout is now (28 cols): A-K as before, L Tax number, M Gift message, N Notes, O Total cost, P Tracking, Q Courier, R Shipping status, S-Z more photos/links, AA Order ID, AB Client ID. No Country column: server addressLines() appends the country to the address when the client did not write it.
- Live sheet switched automatically on 2026-10-14 by ensureLayout() (portal_settings supplier_sheet_layout='2'); verified by reading the sheet: values moved correctly. Old tax/gift text typed into Notes earlier stays in Notes.
- Courier: supplier picks in Q (dropdown from Fees & settings > Couriers, default China Post + Yanwen, other names allowed); admin can set it next to tracking; client sees it next to the tracking number. Clients cannot set it.
- Tax number / gift message: client new-order form, Change customer details (until shipped), admin order form; shown in order panels.
- Checks: verification/check-courier-sheet.mjs (fake Google Sheet, switch from old layout), check-courier-ui.mjs (screenshots in verification/courier-ui/), check-address-dup.mjs.
- OPEN: many In-Progress rows show "ADDRESS CHANGED 2026-10-14"; not reproduced with fee/bill/tracking/Etsy-fee edits. Likely real customer-detail saves today (client "Change customer details" or admin "Edit order"). Check the order activity on one of them.

## PRs #52-#56 LIVE: fee changes for one client (Yehuda), no supplier share (admin.js 50)
- Shahar: Yehuda's fee is $…, not $…; Ada's price is the final client price. Client price = supplier cost (from the sheet) + the fee on that order.
- Client account form (admin): tick "Also change the fee on all of this client's existing orders" + Save = fee changes on all non-cancelled orders of that client, AND prices built from the supplier cost follow it (27.90 + 0.50 = 28.40). Per-order "Fee on this order" edit re-prices the same way. Typed-in prices and fixed quotes are never touched.
- Supplier share removed from the UI and the maths (Erwin decision): our earnings = fee. DB column supplier_share and settings key supplier_share_per_order still exist but are ignored. users.supplier_share_per_order column exists, unused.
- NOT verified live (no admin login for Claude): Erwin must tick the box on Yehuda's account and spot-check the 27.90 order. Checks: verification/check-bulk-client-fee.mjs and check-fee-tick.mjs (screenshots in verification/admin-accounts/).
- Lesson: always look at a rendered screenshot of any UI change before shipping (a giant tick box shipped once).

## NEWEST — PR #51 LIVE: earnings cards + profit chart also on the client's ORDERS page; live QA on the test client (14 October 2026, Manila)

- Request (Erwin, relayed from a client): the earnings monitoring (3 cards + "Profit over selected period" chart) was only on Home; clients had to leave Orders to see their graphs. **PR #51** (`2efca5e`; portal.js 43, portal.css 18, i18n.js 34): the Orders page now starts with a **Your earnings** block — period picker, per-store table (several shops), the 3 cards and the chart — above the search and list. Same helpers as Home (`statCardsHTML()`, `earningsInner()`, `profitChart()`), follows period + store, refreshes with the 20 s update without redrawing the picker, foldable (`<details class="earn-box">`, choice kept in localStorage `dl-earn-open`). The order list is NOT filtered by the period. Tests 117/117; local check `verification/check-orders-earnings.mjs` (EN/HE × 1440/390, two shops).
- Side effects left on the test data (harmless, account will be deleted): Etsy fees on orders #4 (20) and TEST #3 (12.5); TEST #3 now has name "QA Test Customer" and a Copenhagen test address (it was empty) and an address_changed flag; a "Customer details changed" admin notification exists for it.

## PR #50 LIVE: client portal Net profit, from the real Etsy fee (14 October 2026, Manila)

- Shahar's request is now complete: Price, Cost, Profit (#49) and **Net profit** (#50, merged `e943186`). Live: portal.js 42, i18n.js 33. Client portal only; no admin screen changed.
- **Method = the team's own profit tracker** (Google Sheet `ALL_Zippo_Stores_PROFIT_Data`, tabs per month; "How to Use" tab): Buyer Paid and **Etsy Fee are typed in per order from the Etsy order screen**, You've Earned = Buyer Paid − Etsy Fee, Profit = You've Earned − Product Cost. The sheet itself says fees can differ (offsite ads…); the three October rows show fees of 27.6 %, 17.5 %, 31.7 % — so **never estimate Etsy fees from a percentage** (Erwin stopped an earlier attempt that did; it was never pushed).
- Portal: **Net profit = Customer paid − Etsy fee (entered by the client) − Cost**, whole cents, only with a real fee, a customer price, a billed order and USD; else "Add Etsy fee" / "Pending" / "—". New column `client_orders.etsy_fee`; the client enters it in the order form (More details) or any time in the order panel's new **Your numbers** card (customer paid, currency, Etsy fee) — editable after the 72 h window, In Progress and Shipped, without notifying admins; everything else on a locked order stays locked (`ACCOUNTING_BODY_KEYS`, `accountingOnlyEdit()` in `server/portal.mjs`). Net profit column is in the Orders list only (not the short Home list).
- Verified against three real tracker rows (28.80 / 28.89 / 15.18) to the cent in `tests/net-profit.test.mjs` and `verification/check-portal-money-columns.mjs`; live check (read-only, signed-in client session): headers `… PRICE COST PROFIT NET PROFIT STATUS`, order panel shows Etsy fee line and the Your numbers form. Tests 115/115.
- Known issue still open: profit (not net profit) ignores the order currency.

## PRs #46–#49 LIVE: customer-detail editing, admin rights, portal money columns (14 October 2026, Manila)

All opened with `gh` from branches in Daniel's repo (no fork), Vercel preview built by itself, merged by Claude with `gh pr merge`. Tests 111/111. Live versions: portal.js 41, admin.js 45, order-ui.js 10, real-ui.js 8, i18n.js 32.

- **#46 `7db83bf` — clients can change the customer's details until the parcel ships.** Name, address, phone, country editable by the client while the order is Pending (also past 72 h) or In Progress; product, links, quantity, notes and prices keep the 72 h / Pending rule. Portal: "Change customer details" button + form in the order panel. Server: `customerOnlyEdit()` / `canEditCustomer()` in `server/portal.mjs`, also enforced inside the UPDATE. Shipped orders get a clear refusal. Admin bell: "<client> changed the customer's details" (red + "already in progress: tell the supplier" when In Progress). Supplier Work Queue notes cell starts with `⚠ ADDRESS CHANGED <date>` until shipped (`address_changed_at`, `addressFlag()` in `server/supplier-sheet.mjs`).
- **#47 `9faf8aa` — admins can set any order to any status.** Back to Pending, out of Cancelled (reopen zeroes the cancellation fee, row kept, hidden from the client), direct "Cancel this order" with optional fee (two-click), delivered date cleared when going back, per-order "Fee on this order" editor (fee + supplier share, supplier ≤ fee). `statusChange()` in `server/order-status.mjs`; clients keep their narrow rights.
- **#49 `7d0a361` — client orders tables show Price, Cost and Profit** (Orders list + Home latest orders). Price = what the client's customer paid; Cost = what the client pays Direct Line (`Pending` until billed, `—` when cancelled); Profit = Price − Cost. Requested via Shahar. **"Net profit" NOT built yet** — Erwin chose to wait until Shahar says what the client means (profit after Etsy fees? a total row?).
- **Not done / ideas:** admins still can't move an order to another client, replace/delete invoices, reject a transfer confirmation or edit messages (no permanent deletes — archive instead, by rule). Known bug to decide on: profit = customer paid − bill ignores the order **currency** (an order paid in ILS/EUR is treated as USD).
- New local checks (run from the project root): `check-customer-edit`, `check-admin-orders`, `check-admin-accounts`, `check-portal-money-columns`, `check-ux-pass`, `check-admin-pass`, `check-login-limit`, `check-sheet-retry`.
- Note: `/api/portal/admin/*` UI quirk learned — the admin page's side-panel click handler ignores clicks outside the panel; page-level buttons must be handled in `onClick()`.

## Google Sheets 429 "Needs retry" fixed: PR #45 LIVE (14 October 2026, Manila)

- Symptom (Erwin's screenshot, order #…): admin order panel showed "Google Sheet: Needs retry" with a raw Google 429 "Quota exceeded … Write requests per minute per user". Cause: every admin poll (20 s per open admin screen) retried up to 20 unsynced orders in a row (~4 writes + ~3 reads each) against Google's ~60 writes + ~60 reads per minute; failures also wrote Sync Log rows (more writes) and stayed queued, so it kept hitting the limit.
- PR #45 https://github.com/danielhaygross-droid/direct-line-site/pull/45 merged by Claude via `gh pr merge` as `c18e828` (live: i18n.js 28). Retry runs: max one per 30 s (atomic claim in `portal_settings.sheet_retry_until`), 4 orders per run, a 429 pauses all retries 90 s and shows the friendly note "Google was busy. This will be retried automatically." (status stays "waiting", no Sync Log write), real errors back off per order via new column `client_orders.sheet_next_try` (2 min … 30 min). Code: `server/google-sheets.mjs` (`RETRY_GAP`, `RETRY_BATCH`, `RATE_LIMIT_PAUSE`).
- Tests 96/96 (`tests/sheet-retry-limits.test.mjs`); real-Postgres check `verification/check-sheet-retry.mjs` passes. Live check after deploy: all 16 orders `synced`, none stuck.
- If it ever returns: look for many orders in `waiting`/`error` at once in Admin → Client orders; the supplier-sheet cron (every minute) and order edits also use the same Google quota.

## Admin bug/UX pass LIVE: PR #44 (14 October 2026, Manila)

- PR #44 https://github.com/danielhaygross-droid/direct-line-site/pull/44 (`claude/admin-pass`, `ccc0078`) — opened with `gh`, Vercel preview built automatically, **merged by Claude with `gh pr merge`** (Erwin's allow rule works in new sessions) as `5d8ea75`. Live: admin.js 43, portal.js 39, i18n.js 27.
- Admin: "still need product + shipping cost" no longer counts fixed-quote orders, and opens a new **Needs cost** filter; payment method options have fixed English values (Hebrew dashboard used to save "העברה בנקאית" — payments recorded that way before 14 Oct may still show a Hebrew method); Bank transfer default; blank Customer paid → "Not entered", no fake loss in Client's profit ("Needs the sale price"); Save tracking / Save bill / Archive payment ignore double clicks; failed payments load is reported.
- Portal: offline load → message + Try again under the logo; Copy buttons reset; own icons for My Stores / My Products / Terms.
- Tests 90/90; new `verification/check-admin-pass.mjs` passes EN/HE × 1440/390; related UI checks (ux-pass, status, today, transfers, invoice, claim, order-archive, storage) pass.
- **Still open:** fix the 9 stale local checks (listed in the PR #38 section); storage health check, then `FILE_STORAGE_CLEAR_DB=1` after a few healthy days; signed-in live QA of cancellation/transfers/invoices/products/claims/stores with a labelled QA account (archive after). Waiting on Daniel: payment logic, unpaid free month. Domain paused. Shopify/Etsy auto-import need outside accounts.
- The checkout also holds another session's uncommitted `claude/VERCEL_MIGRATION_STATUS.md` edits — left untouched.

## Remaining live time-zone checks and backup download COMPLETE (14 October 2026, Manila)

User objected to leaving the report's item13 pending and explicitly asked to finish it. The time-zone feature was already LIVE; only additional live New York browser verification had remained. That gap is now closed. Genuine QA client/admin browser checks in America/New_York passed English and Hebrew at1440/390 for actual order lists, drawers, two-way message timestamps, activity/history and notification panel timestamps. English showed America/New_York, Hebrew showed Israel time; exact seconds retained. Earlier Manila live checks and local winter/summer/date-rollover tests remain passed. No implementation change or new deployment needed.

Downloaded the earliest available private backup through the authenticated admin download endpoint to output/backups/database-2026-10-13.json.gz (filename uses server UTC date; downloaded on14October Manila). Verified gzip decompresses, format direct-line-backup and users/client_orders tables exist. Did NOT restore or modify the database. Backup contains sensitive production data; do not put it in Git, paste its contents or send it to third parties without user authorization.

Used one clearly labelled QA account/order for the live message/status tests, then archived the order and disabled/archived the account. No real customer's messages, costs or status were changed. Evidence: verification/viewer-timezone/live-final/results.json, client and notification screenshots; script verification/finish-live-time-checks.mjs. The final report should REMOVE the prior remaining-follow-up item13 and say the backup is downloaded and extended live time checks have passed. Domain remains unselected/unpurchased and paused, as recorded separately. Supplier-sharing preference remains that the user shares the link themselves, with no access permissions changed by Codex.

---

## NEWEST — Empty supplier rows100px; PR43 live (14 October 2026, Manila)

User wants blank cells/rows the same size as ordinary order rows. Applied a dimensions-only live Sheet update: blank rows22–999 are100px high. No values, formulas, validation or supplier entries were changed. Native XLSX readback verified blank rows22/23/30/100/999 at100px, header44px and longest populated note row15 at186px, so taller content rows are preserved.

PR43 https://github.com/danielhaygross-droid/direct-line-site/pull/43 adds a100px baseline for all setup data rows6–1000 BEFORE individual populated-row height overrides. Thus future rebuilds keep empty rows consistent and continue making populated rows taller as needed. Supplier-sheet tests6/6, build and diff checks pass; no mirrored test added for this one-line layout change. PR43 merged via Daniel's authenticated GitHub CLI as0258c4852176f5937a4338d58dd63c20eda71a26; automatic production deployment dpl_33EinzFQXWh39PPdbv6kK1CsRjrJ is READY and serves direct-line-control.vercel.app. No extra rebuild or manual redeployment required. Verification snapshot: verification/sheet-spacing/live/blank-rows.xlsx. Current local checkout codex/blank-sheet-rows; handoff edits in this checkout are documentation, not new pending behavior. Prior PR42 rollout and live supplier QA remain completed.

---

## NEWEST — PR42 spacing applied to live sheet; live supplier QA passed (14 October 2026, Manila)

User asked Codex to continue Claude's unfinished PR42 rollout. Confirmed PR42 is merged as cd76c5819c824a5b2397073ebfde5d3f01ff41e1. Production was still PR41 (510505f), with only a PR42 preview READY. Created a git-based production deployment of the actual merged PR42 commit; deployment dpl_HSUXMphsVESxXjDQBVf2jAXr3Unj is READY and aliases https://direct-line-control.vercel.app. Do not confuse preview readiness with a production rollout.

Created and verified a current native workbook backup BEFORE rebuild: https://docs.google.com/spreadsheets/d/1MKTm5rbT_823Zy8PSKCN3pEaEp8sNjreKQ6YRj2zGWw/edit. Rebuild supplier sheet was applied successfully through authenticated admin /api/portal/admin/supplier-sheet/setup:16 orders, same Work Queue gid…, existing old-formulas backup retained. Immediately checked sync:16 checked,0 changed,0 skipped/errors. Native cell readback confirms row5/header and all sampled data cells wrap and centre horizontally and vertically. Compared order IDs and all supplier N:P values before and after rebuild AND after QA cleanup: all16 real rows/values preserved (cost/tracking blank, Not shipped). No real order was billed, shipped or otherwise changed by the QA test.

Exported rebuilt native Sheet only for local read-only visual verification. Actual data row heights are100/101/118/186px; header44px. Six-line addresses118px, French gift-note row15 at186px; maximum height rule remains600px. Country header fits. Rendered address and longest-note ranges show readable centred text without cropping. The local export renderer does not faithfully display native IMAGE previews / HYPERLINK friendly labels, so those exported URL-like cells are NOT evidence of a Google Sheet defect; native formatting and hyperlink/formula structure were checked separately. Actual Google-rendered thumbnail display was not visually inspected. Protected ranges, yellow supplier columns and dropdown validation remain. All86 automated tests and full local supplier-sheet PGlite/fake-Sheets integration passed before rollout; no implementation code changed during this continuation.

Completed live end-to-end supplier verification on clearly labelled QA client18/order33 only. Wrote cost12.50, trackingQA-DO-NOT-SHIP and Shipped in the exact QA sheet row. Actual portal showed supplierCost12.50, client bill14.50 (fee2), per item7.25 for quantity2, tracking and Shipped. Client API did not expose supplier/internal product costs. Repeating supplier check made no duplicate bill/event. Changed supplier cost to15.75: actual bill17.75, per item8.88, exactly2 billed audit events total. Genuine client browser showed Per item and expected amount. Archived order33 and disabled/archived client18 afterward; final native readback contains exactly the original16 real orders and unchanged supplier values, with no QA rows. A first worker run hit stdin EOF before any edits; its QA client17/order32 was immediately archived too. Both synthetic accounts are archived, not permanently deleted, and create no active balance/Work Queue pollution.

Evidence in project-root verification/sheet-spacing/live/: setup.json, supplier-e2e.json, dimensions.json, rebuilt-sheet.xlsx (verification snapshot only), header-and-addresses.png, longest-note.png and QA screenshots. Scripts verification/apply-live-sheet-spacing.mjs, check-live-supplier-flow.mjs; spreadsheet-work/render-sheet-spacing.mjs. Final production deployment metadata recorded alongside these files. Live source remains https://docs.google.com/spreadsheets/d/1L_C87W4jrZGIIrT2Fg_cGowNi3R5fTehdDw8d-vpZag/edit.

Supplier access: user declined providing an email and said they will share the link themselves. No new Google sharing permissions or external messages were sent. Do not keep asking for an email or claim we granted supplier access. Formatting rollout, preservation checks and live supplier QA are COMPLETE; earlier notes saying PR42 not applied / live QA pending are superseded.

---

# Claude continuation handoff — 14 October 2026 (Asia/Manila)

## NEWEST — Supplier sheet shows Shop, not Client (14 October 2026, ~03:45 Manila)

- Erwin: suppliers must not see our clients. PR #40 (`659f510`): Work Queue column C = **Shop** (`client_stores.name`); setup hides the **Clients** tab (website still updates it); setup button becomes **Rebuild supplier sheet** once on (admin.js 42, i18n.js 26).
- First live rebuild failed safely (Google: "can't remove all the visible sheets" — Clients had just been hidden). PR #41 (`510505f`): a temporary tab stands in during the swap. Fake Sheets in `verification/check-supplier-sheet.mjs` now enforces that rule + live tab layout.
- Rebuild pressed on live: "set up with 16 orders". Sheet checked: column C shows shops (e.g. IchyCraftsDesign, KumoBags); only Work Queue visible. Cron after rebuild: ok, 16 checked, no errors.
- PRs #39–#41 were merged by Claude with `gh pr merge` (Erwin's allow rule).

## Supplier sheet ON (14 October 2026, ~03:25 Manila)

- Setup pressed in live admin (Chrome "Browser 2" = Daniel's profile; "Browser 1" is a different profile, not signed in): "Supplier sheet is set up with 16 orders". Sheet checked visually: title + supplier note, headers, photos, links, addresses, yellow Total cost / Tracking number / Shipping status (dropdown, all "Not shipped"); only Work Queue + Clients visible (backup "Work Queue (old formulas)" hidden).
- Cron confirmed live: last check …:23:21 UTC, ok, 16 checked, 0 changed, no errors.
- Not done: no live end-to-end test (would bill a real client — needs a QA client/order and Erwin's OK). Supplier not yet given Editor access. Cosmetic: very long addresses are cut at the 100px row height.

## Supplier sheet (PR #39) LIVE (14 October 2026)

- **What Erwin asked for (confirmed):** suppliers fill in the connected Google Sheet's Work Queue: **Total cost** (whole order incl. shipping, USD), **Tracking number**, **Shipping status** (Not shipped / Shipped). Website bills the client **total + the order's commission** (balance + "Order billed" notification, no email), adds tracking, and moves the order to **Shipped** automatically. Cost is **always editable** (re-bills, logged). Clients also see **Per item** (total ÷ qty). Admins can still change everything on the website.
- Code: `server/supplier-sheet.mjs`. New columns `supplier_cost`, `sheet_cost`, `sheet_tracking`, `sheet_shipped` (last value seen in the sheet → each change applies once; website never overwrites a newer supplier value). Bill: `product_cost = price = supplier_cost + commission`, `shipping_fee = NULL`. Fixed-quote orders keep their price. Invalid values → Settings → Supplier sheet → "Needs a look".
- **Not done yet:** pressing **Admin → Fees & settings → Supplier sheet → Set up supplier sheet** on the live site. It keeps the current Work Queue as hidden tab "Work Queue (old formulas)", rebuilds Work Queue (same gid …) as a website-written table + 3 yellow supplier columns, protects website columns, adds validation. Until pressed, nothing on the sheet changes.
- After setup: share the sheet with the supplier as **Editor**; check the Work Queue visually; test one order end to end with a QA order (archive after).
- Tests 85/85; `verification/check-supplier-sheet.mjs` (PGlite + fake Sheets API) passes all scenarios; browser checks pass.
- Also live earlier today: PR #38 client portal UX fixes (`0545315`).

## NEWEST — Client portal bug/UX pass LIVE: PR #38 (14 October 2026)

- PR #38 https://github.com/danielhaygross-droid/direct-line-site/pull/38 from branch `claude/ux-pass` in **Daniel's repo** (no fork): Vercel built the preview automatically, no "authorize it". Erwin merged it as `0545315`; live serves portal.js 37, admin.js 40, common.js 14, order-ui.js 9, i18n.js 24.
- `gh` is logged in as danielhaygross-droid (saved in `%APPDATA%\GitHub CLI`, re-done in Erwin's own terminal on 14 Oct). Claude opens PRs with `gh pr create`.
- Merging: Claude Code still blocked `gh pr merge` in this session ("Merge Without Review", then "Auto-Mode Bypass") after Erwin added `"Bash(gh pr merge:*)"` to `C:\Users\erwin\.claude\settings.json`. A NEW session should load that rule — try `gh pr merge <n> --merge` once there; if blocked, Erwin merges.
- Fixes: product links cut at 300 chars (portal + admin; server cut all links at 3000) → kept whole up to 2000 each, bare `www.` links completed with https:// (`DL.fullLink`, `productLinks()`); Home "in progress"/greeting/latest orders were limited to the selected month → whole account; order date / transfer date / invoice month used UTC date → device local date; blank Customer paid showed "USD 0.00" → "—"/"Not entered"; "Mark as delivered" now asks to confirm; order activity showed raw status codes → names, translated; "Keep it" Hebrew added; How-it-works button name.
- Versions: portal.js 37, admin.js 40, common.js 14, order-ui.js 9, i18n.js 24. Tests 80/80. New browser check `verification/check-ux-pass.mjs` passes (EN/HE × 1440/390). `verification/check-status-ui.mjs` updated for the delivered confirmation and passes.
- **Stale local checks (not app bugs):** `check-address-api/ui`, `check-product-ui`, `check-product-store-smoke`, `check-store-ui`, `check-store-phone` (wait for the removed `city` field, PR #28); `check-messages-israel-time`, `check-terms` (expect "Israel time"/"UTC" in English, changed by PR #31/#35); `check-sheet-photos` (old sheet column index). The other 22 local checks pass.
- After merge: verify live versions above.

## Git workflow changed: push to Daniel's repo, no fork (14 October 2026, ~03:30 Manila)

- GitHub CLI installed (`C:\Program Files\GitHub CLI\gh.exe`, v2.102.0) and logged in as **danielhaygross-droid** (keyring); it also handles git's GitHub login. Restart VS Code once so `gh` is on PATH.
- In `continuation/`: `remote.pushDefault=origin`, `push.default=current`, `gh repo set-default danielhaygross-droid/direct-line-site`. Dry-run push to origin succeeded.
- **New flow:** `git switch -c claude/<name> origin/main` → commit → `git push` (goes to Daniel's repo, not the fork) → `gh pr create` → `gh pr merge <n> --merge` (if Claude Code blocks the merge, Erwin clicks Merge) → verify live `?v=`. Branches in Daniel's repo deploy previews without "authorize it". Ignore the old fork instructions below.
- Current branch `claude/next` = origin/main `08ed709`. Local `main` is an OLD diverged copy (`ecfe48a`) — never use or reset it without checking.

## PR #37 login limits LIVE (14 October 2026, ~03:00 Manila)

- Erwin merged PR #37 as `08ed709`. Live: EN app.js?v=61, HE app.js?v=56, i18n.js?v=23.
- Live check with a made-up username (no real account): 5 × 401, 6th → 429 "Too many sign-in attempts. Please wait 15 minutes and try again.", Retry-After 899.
- Claude Code's auto-mode check blocks Claude from clicking GitHub Merge ("Merge Without Review") even with Bypass permissions shown; Erwin clicks Merge. Batch fixes into fewer PRs.
- Next: bug/UX pass (started: no console errors on EN admin dashboard), remaining PR35 checks (New York zone, drawer/messages/notifications), download first backup, later `FILE_STORAGE_CLEAR_DB=1`.

## PR #37 login limits ready, awaiting merge; PR35 partly verified live (14 October 2026, ~02:30 Manila)

- **PR35 live check (read-only, 14 Oct):** admin Clients & orders, browser zone Asia/Manila — English shows `Asia/Manila` labels and 23:41:43 for the latest order; Hebrew shows the same order at 18:41:43 with "שעון ישראל" and no Manila times (correct 5 h offset, Israel UTC+3). Not yet checked live: a New York browser zone, order drawer/history/messages and notifications.

## PR #36 storage + backups is LIVE (14 October 2026, ~02:00 Manila)

- Live admin → Fees & settings → Storage & backups: Copy files now → **47 of 47 files copied** (DB copies kept, 2.4 MB). Back up now → backup `database-2026-10-13` (UTC date), 2.4 MB, "Backup saved".
- Still to do: Erwin to download the first backup to keep. Do NOT set `FILE_STORAGE_CLEAR_DB=1` until after a few days of hourly runs look healthy. Next tasks: limit failed login attempts, bug/UX pass, live PR35 timestamp check.
- Note: Claude Code auto mode blocks Claude from clicking Merge on GitHub ("merge without review"); Erwin clicks Merge, or switches the session to an ask-each-time permission mode.

## Earlier — storage + backups branch pushed, NOT merged (14 October 2026, later)

- **PR #35 (time zones) is merged and deployed:** production serves common13 / portal36 / admin38 / order-ui8 / notify3. Live timestamp check still not done.
- **Erwin's authorization (14 Oct):** Erwin is logged in to Daniel's GitHub and Vercel in Chrome. Daniel gave permission for Claude to do everything, including merging and Vercel settings. Payments stay as they are (bank details + client screenshot proof). Focus: development, bugs, UX, proper storage, backups. **Live client orders exist — never delete or overwrite live data.**
- **Branch `claude/storage-backups`** is pushed to the fork (commit `2af1405`, on top of the PR35 merge). Not merged yet.
  - DB copies are cleared only if `FILE_STORAGE_CLEAR_DB=1` (leave unset until every file shows as copied).
  - Daily gzipped JSON backup of all tables to Blob at 01:30 UTC, read back and verified, kept 30 days. `scripts/restore-backup.mjs` restores into a NEW empty database only.
  - Admin → Fees & settings → **Storage & backups** panel (EN/HE): progress, backup downloads, Back up now, Copy files now.
  - Tests 69/69. Local checks: `verification/check-file-storage.mjs`, `verification/check-storage-ui.mjs` (screenshots in `verification/storage-ui/`).
- **Remaining steps (do in Chrome, Daniel's profile):**
  4. Live admin → Fees & settings → Storage & backups: press Copy files now (repeat until all are copied), then Back up now. Download the first backup for Erwin to keep.
  5. Later, after checking: set `FILE_STORAGE_CLEAR_DB=1` and redeploy to shrink the database.
- **Next tasks after that:** limit failed login attempts (none today), a bug/UX pass, the live PR35 timestamp check, then update this file.

This is the current authoritative status. Older entries below are historical and may say awaiting merge even for changes already live. User is moving work to Claude; this turn updates documentation only.

## Start in the correct checkout


## Live vs pending — checked again on 14 October

Production: https://direct-line-control.vercel.app. Vercel team z-royal, project direct-line-control, project ID prj_L87KzQS0ekdXau4taXJfRhlpkgMw. Current production deployment dpl_J5vFY6cBcxVd8LGq59A7QLrc3a9c is READY at main merge60b7dfcc70e6f226d63864ad504ab024da89fc47 (PR34). Local origin/main matches this SHA.

PR35 is STILL OPEN and UNMERGED: https://github.com/danielhaygross-droid/direct-line-site/pull/35. Its requested time-zone behavior is implemented/tested, but NOT LIVE. English follows the viewer's device IANA zone (Manila/New York/London, etc.); Hebrew uses Asia/Jerusalem. Exact seconds and appropriate labels remain. Applies to order/client lists, messages, trackers/activity, login/terms/archive times and notifications, including dashboard fallback. Common helper displayTime/displayTimeZone/timeZoneNote replaces israelTime. UI cache versions common13, order-ui8, notify3, admin38, portal36. UTC storage, server deadlines and persisted business dates are unchanged. 64 automated tests passed on this branch; main before PR35 has60. Six local admin/client browser language+zone combinations passed, with winter/summer DST and date-rollover unit coverage. Evidence: verification/viewer-timezone/, verification/check-viewer-timezone.mjs, tests/display-time.test.mjs.

NEXT STEP: after the user merges PR35 using Daniel's GitHub account, verify the production commit/READY state and public assets, then check live English in at least Manila and New York and Hebrew in both browser zones. Check order lists, drawer/history/messages and notifications. Update these documents with actual evidence before calling the change live. No live timestamp verification for PR35 has been done yet. Avoid redeploying when automatic production deployment already matches. Vercel previously blocked direct deployments authored by Erwin; do not spoof commit authors or bypass that restriction.

## Completed and live

PR31: client/admin conversation visibility, immediate send/reply display and exact timestamp history. PR32: wider/resizable order and client drawers (desktop default760px, pointer/keyboard resize and saved width, full-width phone). PR33: support CTA exists only for authenticated clients, absent from admins, admin-preview and signed-out views; compact icon clears phone tabs and hides over open drawers/menus. PR34: admin Archive order with confirmation, Archived orders filter and Restore; archived orders are read-only and excluded from normal client/admin lists, notifications, claims and supplier Work Queue. Stored status, amounts, payments, refund/cancellation adjustments and edit locks remain; billing history is retained. Sheet-photo bearer links are revoked while the order/client is archived. Local restore behavior passed; live checks verified archived lists/read-only/Restore control without restoring the user-requested archived orders. Earlier live evidence is in verification/daniel-task/live, panel-support/live, client-only-support/live and order-archive/live.

Three user-confirmed training orders are archived: DB6/ref45858595, DB7/ref…, DB8/ref…. Preserve the Shahar111, hadsash and YehudaVaknin client accounts. User explicitly said KEEP hadsash. TEST/Test1/QA accounts are archived and excluded from active lists, not permanently deleted. At the last live cleanup check on13 October, eight NEW customer orders16–23 were preserved; this is a historical count, so re-read current data before any further cleanup. Do not archive additional orders just because a client previously used the site for training. Cleanup evidence: verification/confirmed-test-order-removal.json and test-cleanup-live.json.

## Connected supplier spreadsheet

LIVE source: https://docs.google.com/spreadsheets/d/1L_C87W4jrZGIIrT2Fg_cGowNi3R5fTehdDw8d-vpZag/edit. Backup before cleanup: https://docs.google.com/spreadsheets/d/1bdGsSBIRD1FaRZDVVk14_AStYzdjqrjLDpsIeUOwtNk/edit. Edit the existing native sheet, not a local XLSX snapshot.

Work Queue (gid…) is first; only Work Queue and Clients are visible. Fourteen daily columns show date, order, client, status, photo preview/link, product link, quantity, product/variation, customer, combined delivery address/phone, country, notes and tracking. Expandable O–X holds costs and photos2–8. Hidden Y contains source row indexes. Original technical tabs remain hidden with original names and schema because sync depends on them. Orders sheet ID… keeps existing57 columns; BF is the58th column, Boolean Archived. Archived training orders stay only in that hidden ledger with BF=TRUE and are absent from Work Queue. Account archival clears matching sheet rows including duplicate sync rows; restore queues repopulation.

First cleanup removed11 old/test client rows,14 test order rows (including duplicates) and30 test log rows. Confirmed training cleanup subsequently removed3 source rows and46 old log rows; archive sync retains their hidden ledger records. Last readback:8 visible real orders, zero formula errors, working photo/product hyperlinks and a photo HTTP200 image/jpeg. Formatting/layout inspected through native metadata plus an exported render using Google-calculated values. Native IMAGE thumbnail appearance itself was not visually inspected. FILTER/FORMULATEXT do not recalculate in the local renderer; its initial #NAME preview was an export/render compatibility issue, not a live formula error. Work Queue currently has995 data rows of formulas; extend grid/formulas before exceeding this. Website remains the source of truth; editing Sheet cells does not update portal orders.

## User constraints and artifacts

Keep communications concise and minimize usage. Do not ask again for previously authorized reversible work. Never touch Byzroyal: it is a separate Shopify business and expressly excluded. Custom-domain shopping/setup is PAUSED by the user; do not buy, rename or configure a domain. The simple delivery form is intentionally customer name + combined address/phone + required country, overriding Shahar's separate-field suggestion at Erwin's request.


---

PR35 ready for merge: https://github.com/danielhaygross-droid/direct-line-site/pull/35 — timestamp language/zone change tested, not live yet.

## Language-based timestamp display ready — 13 October 2026

User requested Israel time only in Hebrew; English must follow each viewer's device time zone. Branch codex/viewer-timezone changes the shared display formatter, order/client lists, order activity/trackers, message times, login/terms/archive times and notification timestamps. English shows the device's IANA zone label (for example Asia/Manila); Hebrew always uses Asia/Jerusalem with the Hebrew Israel-time label. Order activity note follows the selected view. Notification fallback on the main dashboards uses the same rules, including older relative-date labels. Invoice form's default date and new-account today display follow the view. Stored UTC timestamps and server-side edit deadlines/business dates remain unchanged; no API/database change and no live customer data edited.

Versions common13, shared order-ui8, notify3, admin38, portal36. 64 automated tests passed (four new timestamp tests cover Manila/New York/London, winter/summer DST, date rollover, invalid timestamps and dashboard fallback). Local PGlite/browser checks passed both languages in all three device zones for real admin/client lists and client drawer/activity. Build/syntax/diff pass. Evidence: verification/viewer-timezone and check-viewer-timezone.mjs. Awaiting PR/merge/deployment; do not describe this timestamp change as live until verified after merge.

---

## PR34 production verified; three confirmed training orders archived — 13 October 2026

User directly authorized removing Shahar and Daniel's three training orders after sharing confirmation. Exact identities: database6/ref45858595 (Shahar111), database7/ref… (hadsash), database8/ref… (YehudaVaknin). Keep all client accounts, including hadsash, and new customer orders16–23. Three source-sheet rows and46 associated old Sync Log rows were removed. After native archive sync, the three test orders appear only in the hidden raw Orders ledger with BF Archived=TRUE. They are absent from the visible Work Queue; eight new customer orders remain. This is reversible archival, not permanent deletion of database history.

User merged PR34. Production deployment dpl_J5vFY6cBcxVd8LGq59A7QLrc3a9c is READY at merge60b7dfcc70e6f226d63864ad504ab024da89fc47; five public admin/shared/portal assets exactly match origin/main. The archive endpoint was used successfully on exactly those three orders. Normal admin/client lists exclude them, Archived orders contains them, and billing totals/status/amounts/edit locks are unchanged. No client account was archived or changed during this three-order cleanup. TEST/Test1/QA cleanup from the earlier section remains complete.

Live browser checks passed EN/HE at1440/390: normal list clean, new customer orders retained, Archived orders filter, read-only archived drawer, Restore button visible, and Yehuda's client preview excludes training order8 while keeping new orders. Restoration was already exercised locally and was not performed live on the user-requested archived records. Native Sheet readback confirms eight Work Queue entries, no confirmed test references and no formula errors. Evidence: verification/confirmed-test-order-removal.json, verification/order-archive/live/results.json, screenshots/deployment.json; scripts archive-confirmed-test-orders.mjs and check-live-order-archive.mjs. All Archive/Restore code and ongoing cleanup sync behavior from PR34 are now live. Custom domain remains paused at user's request.

---

PR34 ready for merge: https://github.com/danielhaygross-droid/direct-line-site/pull/34 — head549c1fc. Spreadsheet cleanup/live test-account removal done; new order archive button awaiting merge and production verification.

## Spreadsheet cleanup live; order archive ready for merge — 13 October 2026

User paused custom-domain shopping and requested a simpler supplier spreadsheet, removal of test clients/orders and an admin order Archive button. Explicitly keep hadsash and all its orders. Preserved Shahar111 and YehudaVaknin. Live TEST/Test1 and QA accounts are archived (restorable), not permanently deleted. TEST1 was the remaining active test account; no active TEST/QA account remains. Historical Erwin client1 was already archived and its known test rows were removed from the sheet. No administrator account or real client order was edited.

Connected spreadsheet edited IN PLACE: https://docs.google.com/spreadsheets/d/1L_C87W4jrZGIIrT2Fg_cGowNi3R5fTehdDw8d-vpZag/edit. Backup verified: https://docs.google.com/spreadsheets/d/1bdGsSBIRD1FaRZDVVk14_AStYzdjqrjLDpsIeUOwtNk/edit. Deleted11 old/test Clients rows,14 test Orders rows (including2 duplicate rows),30 test Sync Log rows. New Work Queue gid… is first; only Work Queue and Clients remain visible. Technical tabs stay hidden with original names/columns so existing sync works. Work Queue shows14 daily-use columns (date, order, client, status, preview/full photo link, product link, quantity, product/variation, customer, combined address/phone, country, notes, tracking); expandable O–X contains costs and photos2–8. Hidden Y holds source row indexes. Formula view updates automatically from Orders; edit business data on the website. Native readback showed10 retained orders after a new real order arrived during cleanup, no formula errors, correct hyperlinks; actual photo link returned200 image/jpeg. Formatting/layout checked with native metadata and a local export rendering of Google-calculated values. Google FILTER/FORMULATEXT don't recalculate in the local renderer, so its first #NAME preview was a renderer incompatibility, not a native-sheet error. Google thumbnail display itself was not visually inspected. View currently supports995 rows; extend formulas/grid if active orders exceed this. Source Orders has appended BF Archived header, earlier57 column positions unchanged.

Branch codex/order-archive-sheet-cleanup: admin Archive order action with second-click confirmation, Archived orders filter, Restore order, EN/HE, archive audit events/time. Archived orders disappear from normal admin/client lists, notifications, claims and supplier Work Queue. API requires admin, validates Boolean, logs only real state changes, blocks editing/messages/photos/tracking and claim decisions while archived. Signed sheet-photo links return404 while order is archived. Status, bill amounts, payments, cancellation/refund adjustments and edit lock remain intact; account billing totals retain archived historical orders. Restoring returns orders to normal lists. Client archival continues to remove that client's totals using existing behavior.

Sheet sync writes58 columns (BF Boolean archived). Archiving a client clears all matching Clients/Orders rows, including duplicates, and prevents retry from re-creating test rows. Restoring a client queues its orders to repopulate. UI versions admin37, shared order-ui7, i18n21. Validation60 automated tests, build/syntax/diff checks; local PGlite integration confirms permissions, invalid payload, hide/restore, blocked archived claim decision/client claims, immutable billing and duplicate-event prevention; EN/HE desktop1440/phone390 browser archive/restore flows passed. Evidence project-root verification/order-archive, check-order-archive.mjs, test-cleanup-live.json. Website archive feature is NOT LIVE until this branch is merged and deployed. Spreadsheet simplification and active test-account cleanup ARE LIVE. After user merges, verify exact production commit/assets and archive/restore using a test record (archive its account after cleanup so sync keeps sheet clean).

---

## PR33 live and verified — 13 October 2026

PR33 merged as d1e0dbb4ebf8d3ad32e1a99799f3434e8d78d4d8. Vercel deployment dpl_3CmKs5WNVhorGCkPaSz8cRVNcu9M is READY in production at https://direct-line-control.vercel.app. Seven public assets match the tested source; no extra deployment required.

Live browser checks passed English/Hebrew at desktop1440 and phone390: support dock absent from admin dashboard, support absent from admin client-preview and signed-out portal, compact 50px WhatsApp link visible for genuine authenticated clients with original destination. No page horizontal overflow. Temporary QA clients15/16 were archived and disabled after checks; no orders or messages were created. Initial check reused an admin/signed-out context and timed out; fresh isolated client contexts passed all four combinations. Evidence: project-root verification/client-only-support/live/results.json and screenshots; script verification/check-live-client-only-support.mjs. Local drawer hiding/restoration and prior PR32 production resizing checks remain passed.

This supersedes earlier PR33 awaiting-merge and PR32 admin support visibility notes below: admins now have NO support CTA. Resizable client/order panels remain. Custom domain still pending a specified Direct Line-owned domain and DNS access; Byzroyal is explicitly excluded. This check covers the support-role change, not a new full verification of every portal workflow.

---

PR #33 ready: https://github.com/danielhaygross-droid/direct-line-site/pull/33 — af19d01, awaiting merge/deployment.

## Support CTA client-only — ready, 13 October 2026

User clarifies admins are the responders and should not see Chat us/Need an answer support CTA. Removed the WhatsApp dock markup from both admin dashboard languages. Added a compact 50px support link only in the authenticated client shell, excluding admin client-preview mode and signed-out screens. Original WhatsApp target retained. Client icon sits above phone navigation and hides during drawers, menus, notifications and native dialogs. Shared drawer toggles its own body state to suppress the client icon; resizable panels from PR32 remain unchanged.

Branch codex/client-only-support. Versions portalJS35, portalCSS17, order-ui6, i18n20. Local seeded DB/browser checks passed EN/HE x1440/390 for client visibility, exact href, phone tab clearance, drawer hide/restore, admin-preview exclusion and signed-out exclusion. Both admin HTML sources contain no support dock. 59 automated tests/build/syntax/diff checks pass. No live data changed. Awaiting PR/merge/deployment. Evidence: verification/client-only-support and verification/check-client-only-support.mjs.

## PR32 live and verified — 13 October 2026

Merged PR32 commit b871d939bc5b5e10e89bb10390a07f8cd253d248 automatically deployed to Production. Deployment dpl_EeunYabikpfHg25UtMFV2Dnjz5D5 is READY; eight public dashboard/admin/shared assets match tested source. No additional deployment needed.

Read-only live admin UI checks passed EN/HE x1440/390: 50px support icon with promo text hidden, support dock hides while client panel is open and restores on close, 760px desktop default, pointer drag, keyboard resize/reset, saved width across reopen, full-width phone panel with handle hidden, and bounded page layout. Used existing TEST account view; no customer order/message fields were changed. Login audit/background retry behavior may run normally. Evidence: verification/panel-support/live/results.json, deployment.json and screenshots; script verification/check-live-panel-support.mjs. An initial drag test double-added iframe coordinates; fixed the test to use Playwright's top-level bounding box coordinates, then all four checks passed with production code and no injected styles.

User instructions: refresh the website; on desktop drag the panel's inner edge to change width. Double-click the handle resets to 760px. Shared panels include client account and order details. The compact WhatsApp link keeps its original destination, but never covers panel actions. Domain task remains separate/pending; Byzroyal excluded.

PR #32 ready: https://github.com/danielhaygross-droid/direct-line-site/pull/32 — 3ede22a, awaiting merge and live verification.

## Compact support control and resizable panels — ready, 13 October 2026

User reports the Need an answer WhatsApp CTA overlaps buttons and client/order panels are too narrow. Branch codex/compact-support-resizable-panel. Support dock is a 50px icon with existing accessible label/href; large promotional text is hidden. It hides while the embedded admin drawer or a native dialog is open, restoring afterward. Iframe state messages are handled inside the existing origin/source-validated parent listener. No contact number change.

Shared client/order drawer defaults to 760px on desktop, resizable from 560px to a viewport-bounded maximum1100px. Logical-edge handle supports pointer drag, arrow keys, Home reset, End maximum, double-click reset and localStorage width persistence. Phones/tablets fit the screen and hide the handle. Header wrapping and contained grid/table layouts keep controls within bounds; admin phone navigation wraps instead of widening the page. Versions dashboard styles43, clients-section6, shared order-ui5/UI CSS7, adminCSS12, i18n19.

Local seeded DB/browser checks passed EN/HE x1440/390: compact support size/text, iframe hide/restore, wider panel, pointer resizing, keyboard controls, saved width, phone full width and no horizontal overflow. Screenshots: project-root verification/panel-support; script verification/check-panel-support.mjs. 59 automated tests/build/syntax/diff checks pass. No live customer records changed. Not deployed yet; create PR then user merges, verify production and live UI afterward. Custom domain unrelated and remains pending; Byzroyal excluded.

## PR31 production verified — 13 October 2026

PR31 merged as 088330854a…fa020d54bbaea1fbd9a6. Vercel production deployment dpl_UamGc2PYZCGA5hPjtqPCXbu9ztE1 is READY and serves the public domain. Seven public portal/admin/shared assets matched the tested source. Automatic production deployment succeeded; no extra deployment was required.

Definitive live test (no injected CSS/JS) passed EN/HE x desktop1440/phone390: client send, admin reply through the actual dashboard iframe, immediate Messages visibility, duplicate-send guard, order edit activity and exact Israel timestamps including winter/summer while browser timezone is Manila. Last QA account14/order15 was cancelled with zero fee, archived and disabled. Earlier QA accounts10-13 were also archived/disabled; early failed runs left orders11/12 pending within archived QA accounts, hidden from the working queue and labeled DO NOT SHIP. No real customer orders/messages/prices changed. Evidence: verification/daniel-task/live/results.json, deployment.json, screenshots and verification/check-live-daniel-task.mjs.

A Hebrew phone automation failure was resolved by waiting for the drawer animation to settle. Canonical production CSS passed; an experimental header CSS adjustment was discarded and no extra PR was created. Local tests: 59 pass plus bidirectional browser/database checks. Stored timestamps remain unchanged, original order dates remain, and displayed operational timestamps use Asia/Jerusalem with seconds.

Daniel task status: messaging improvements and Israel-time history DONE/LIVE. Custom domain remains incomplete pending a confirmed Direct Line-owned domain and DNS access. Byzroyal is a separate Shopify business and explicitly excluded. No domain/DNS settings were changed. Do not claim all three Daniel tasks complete or all other unrelated workflows tested.

PR #31 ready: https://github.com/danielhaygross-droid/direct-line-site/pull/31 — commit 623c0bc, awaiting merge/deployment.

## Daniel's messaging and Israel-time task — ready for review, 13 October 2026


Changes: conversation metadata refreshes immediately after sending/reading so Messages does not look empty until the next poll; rapid repeat sends are guarded and older in-flight poll results cannot overwrite a newer sent thread. Admin client-preview remains read-only, with an explicit explanation. Actual clients retain reply access.

Order creation/update, messages, status steps, activity entries and notification timestamps now show date plus HH:mm:ss in Asia/Jerusalem, with an Israel-time label. An Order activity section displays recorded creation/edit/status/tracking/photo/claim events. Photo add/remove changes are logged even immediately after creation. Stored timestamps and original store order dates are preserved; existing events use their recorded time, not invented history. Last-login/terms timestamps also use the shared formatter. Versions common12, order-ui4, portal34, admin36, UI CSS6, i18n18, notify2.

Validation: 59 automated tests, build/syntax/diff checks; local DB/browser EN/HE at 1440/390px verify client-to-admin send, admin-to-client reply, immediate Messages visibility, duplicate-send guard, audit timestamps, notification times, preview read-only state, and winter/summer Israel offsets while browser uses Manila time. Screenshots and check script in project-root verification/daniel-task and verification/check-messages-israel-time.mjs. Changes are NOT deployed yet; PR link will be recorded after creation.

Custom domain is pending a confirmed Direct Line-owned domain and DNS access. User explicitly rejects Byzroyal: it is a separate Shopify business. Do not propose, connect or modify Byzroyal for Direct Line. Only a read-only domain inspection occurred; no DNS/domain changes were made.

## Client guides separated — 13 October 2026

User requested separate language PDFs. Current guides: output/pdf/Direct-Line-Client-Portal-Guide-English.pdf (4 pages) and output/pdf/Direct-Line-Client-Portal-Guide-Hebrew.pdf (4 pages). Each starts at page 1 and has its own language introduction. Combined bilingual PDF is superseded. Daily report has a clear clickable spreadsheet link on page 1. Source: verification/build-separate-client-guides.py.

## Report and bilingual client guide completed — 13 October 2026


## Spreadsheet photo feature live — verified 13 October 2026

PR30 merged as 05c36281036e983cbaa2ea219915e97a2858af78. Deployed through authorized Vercel API; deployment dpl_6PGEURa1wyGwZCDH3zgHG6HPxg6z is Ready/Production and aliased to direct-line-control.vercel.app. Earlier blocked deployment and pending-access notes are superseded.

Existing active orders 6 and 7 were resaved without changing order fields to trigger server sync. Their existing photos were uploaded by clients (addedBy=client). They now populate Orders rows 13 and 14: AV photo count=1, AW IMAGE preview, AX Photo 1 hyperlink. Rows enlarged to 100px and new photo columns aligned centrally. Spreadsheet readback confirms IMAGE/HYPERLINK formulas and no cell errors; Google-rendered visual preview was not inspected directly. Signed-out full-size photo fetches return 200 image/jpeg and exactly match the portal originals byte-for-byte; altered keys return 404. No photos were added/replaced and no new orders were created. Comparison of original A:AU cells found only sync/update timestamps changed, no manual business fields overwritten.



## Spreadsheet photos — PR #30 ready; Vercel author permission blocks deployment

PR https://github.com/danielhaygross-droid/direct-line-site/pull/30, commit 0a4e19e on codex/sheet-order-photos. Orders AV:BE headers created (count, preview, Photo 1–8). Existing rows are intentionally not populated yet because the photo endpoint is not live. 59 tests plus local DB/router integration passed. No production orders/photos changed.

Direct production deployment dpl_C88fnyodrqRJJwmuH7meXioMMyqa was BLOCKED: commit author lacks project deployment permission. Do not bypass this by changing author identity. Erwin should merge PR30 as Daniel; then deploy merged main through the authorized Vercel CLI as done for PR29. Current live release remains PR29.


## PR #29 deployed and live-verified — 12 October 2026

Vercel CLI was authorized by Erwin as Daniel's account. Deployed merged commit afc4a9d1a…aaf4c463f87b063bc72bd to the existing z-royal/direct-line-control project. Deployment dpl_4gNBWL8TNqfcVscAeGwZwk43S2Ch is Ready/Production and aliased to https://direct-line-control.vercel.app/ . Public portal HTML and CSS exactly match the CSS16 fix.


## PR #29 merged; deployment pending — 12 October 2026


Mobile layout fix PR #29: https://github.com/danielhaygross-droid/direct-line-site/pull/29 — awaiting merge/deployment.

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


Earlier root handoffs are preserved in `archive/handoff-history/`. Their pending-merge/deployment statements are historical and superseded by this summary. Detailed implementation history remains below the current summary in `continuation/claude/VERCEL_MIGRATION_STATUS.md`.
