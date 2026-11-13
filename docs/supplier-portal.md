# Supplier portal: plan (Nov 2026)

Daniel's idea (12 Nov 2026): a portal only for our supplier (Beyond: Ada and Ye), so they stop working in the Google Sheet and stop getting confused. This is the repo copy of the plan, without money figures; Erwin's local copy is `Claude outputs/supplier-portal-plan.md`.

## Why
- The sheet is fragile: rows move (sorting, the website moving cancelled rows; on 8 Nov five orders got another row's cost and tracking) and its formulas show today's values (refunds came out lower than what the client paid, fixed in #207).
- The supplier adds things up by hand and gets a different number than the website.
- A portal reads and writes the database directly: no rows to break, every change saved with who made it.

## Rules (decided by Erwin)
- **The supplier never sees:** our fee per order (inside the product cost the client pays), any extra commission, client prices, Etsy selling prices or earnings, our profit.
- **The supplier may see:** their own costs, cancellation fees, refunds, the money paid for their part, and the supplier share per order they pay us.
- **Separate logins** for Ada and Ye; Erwin creates them in admin and sets the passwords himself.
- **Languages:** English and Simplified Chinese (reuse the sheet's translations in `server/sheet-zh.mjs`).
- Simple: one clear action per screen, numbers that add up, no counting by hand.

## Open decisions (before phase 1 is built)
1. Money flow: do clients pay the supplier directly or pay us? If they pay the supplier, our fee can be kept off every screen but not fully hidden.
2. The supplier share: a running total the supplier owes us, or settled per payment?

## Phases
1. **Billing (read-only) + supplier logins.** New account type `supplier` (next to client and admin); supplier API answers built from an allow-list of fields. Billing: balance per client (same numbers as the sheet's BALANCE PER CLIENT box), per client: payments with their orders, refunds per cancel date, orders not paid yet, cost changed after payment, supplier share line. Admin > Fees & settings > Team accounts: add / remove supplier accounts. The sheet keeps working.
2. **Work queue.** Orders (New · In progress · Shipped · Cancelled) with inline editing of total cost, cost per product, tracking, courier, shipping status, delayed + reason, domestic tracking, cancellation fee; bulk paste of tracking numbers; who/when on every change. The website keeps writing portal edits into the sheet while both exist.
3. **Price requests, quotes, retire the sheet.** Cost revisions (accept with a new cost / keep the price) and product quotes in the portal; then the sheet becomes a read-only backup and the minute sync stops reading it.

## How it's built
- Screens in `src/supplier/NN-*.js` built into `dist/supplier/`, shared CSS `dist/p/ui.css`, a `zh` dictionary; server routes `/api/portal/supplier/*`, role `supplier`, an audit log of supplier changes.
- Each phase: its own PR, behaviour checks (including: no fee, client price or profit in any supplier response), EN + 中文 screenshots at 1440 and 390 px, HANDOFF updated.

## Design
- Made by the `designer` agent (`.claude/agents/designer.md`) from the Direct Line design system (link in the agent file). Mock-ups of phase 1 and 2 (log in, billing, billing per client, orders work queue, order detail, bulk tracking paste, cancelled orders, supplier accounts in admin) in English and Chinese, desktop and phone, in Erwin's `Claude outputs/design/supplier-portal/`.
- Erwin and Daniel approve the design and answer the open decisions before anything is built.
- Design decisions in the mock-ups (13 Nov 2026): top bar instead of a side bar (the 11-column orders table fits at 1440 px), two bottom tabs and card rows on the phone; the supplier's own columns have a gold header (like the sheet's yellow columns); each box saves when you leave it and shows who saved and when; Enter jumps to the same box in the next order; orders don't jump tabs while someone types; cancel requests get a red banner and rows that say don't buy or ship; duplicate tracking is flagged while typing; bulk paste of tracking numbers with a preview; billing per client always adds up to the balance and shows the supplier share in its own box; Chinese reuses the sheet's own words; colour always comes with a word. The sheet's competitor price column is left out. No review page or note shown to the supplier may mention our fee or commission, even to say it is hidden.
- Questions the design raised (answer with the open decisions): count cancelled orders in the supplier share or not; are refunds ever paid back as money or always kept as credit; when a New order moves to In progress (first save, or after some time); should duplicate tracking block saving or only warn; should admins manage the courier list; should the supplier see client names or letters only.

## Status
- 13 Nov 2026: plan written, designer agent added, mock-ups done (8 screens, EN + 中文, 1440 + 390 px; admin screen EN + HE), waiting for Erwin and Daniel. Nothing built yet.
