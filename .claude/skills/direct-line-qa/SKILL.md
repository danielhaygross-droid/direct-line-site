---
name: direct-line-qa
description: Hands-on QA and UX review of the Direct Line portals (client portal, admin dashboard, supplier portal) — clicking every control on every screen, in English, Hebrew and Chinese, desktop and phone, light and dark, and measuring layout instead of only looking at screenshots. Use whenever Erwin asks for QA, a UX/UI scan, "check every nook and cranny", a design pass, or before saying a UI change is done. Also use after any UI change to the screens it touched.
---

# Direct Line hands-on QA

Erwin pays for QA so that **he doesn't have to find the problems himself**. In Nov 2026 a screenshot-only "full scan" missed two things he then found in minutes: the Paid / Not paid pill pushed left with a line above it in the admin orders list (a CSS class name clash), and the supplier courier list having no way to add a new courier. Looking at screenshots is not enough: use every screen like the person who works in it.

## Setup
- Code: `continuation/` (see `HANDOFF.md`, `checks/README.md`). Screens render with real SQL on PGlite + Playwright via the checks (`checks/lib.mjs` `seed()`, `call()`); `node scripts/run-checks.mjs <name>`; screenshots land in the temp folder `direct-line-checks/<check>`.
- `checks/check-ui-audit.mjs` (with `AUDIT_REPORT=1`) renders most admin + portal screens EN/HE 1440/390 + dark and measures overflow, overlap, tap targets and untranslated text. It is the start, not the QA.
- For clicking through flows, write a short Playwright script on top of `checks/lib.mjs` (Node), or use the `webapp-testing` skill (Python Playwright).
- Live data (read-only): admin API from Chrome with header `x-dl-portal: admin` (`/api/portal/admin/orders`, `/api/portal/orders/:id/messages`, `/api/portal/admin/client-stores`, ...). Never change live data during QA.

## Every screen (none may be skipped; say which ones you covered)
- **Client portal** (`src/portal`): login, Home (pay strip, subscription banner, money, period), Orders list (chips, sort, search, Excel), order window (timeline, history, receipt, Send again, Report a problem / claim, Message us), New order form (store, free-form and My Products, lines, variations, photos, errors), Messages, Payments (statement, Pay now, Pay tabs, history, billing details, cancelled credit), My Stores, My Products (add, price request, revision), Terms, bell, sidebar/bottom nav.
- **Admin** (`src/admin`): Overview (Needs your attention, cards + their windows, money chart, month picker), Orders (chips, sort, client filter, search, bulk bar, row status select), order panel (statuses, tracking + courier, fee, cancel window, cost revision, messages, photos), New order form, Clients list, client panel (Orders, Shop, Money: statement, record payment, receipts; Account: plan, subscription, fee), Claims, Products, Fees & settings (Fees, Bank details, Supplier, Terms, Team & tools), events feed, bell.
- **Supplier portal** (`src/supplier`, EN + 中文): Orders (tabs, table and phone cards, every gold box incl. courier list and "+ Add courier…", shipping status, delayed + reason, domestic, cancel fee, filters, Excel, legend), order drawer (photos, zip, address copy), Quotes, Price requests, Receipts, Billing, password, notifications, bell.

## How to check each screen
1. **Use every control**: open every select and list (what's missing? can a new option be added?), type in every box (empty, wrong, very long, Hebrew), press Enter/Tab/Esc, save, undo, reload. Do the user's real daily job end to end (Ada: buy → cost → tracking → courier; admin: status → tracking → payment; client: send order → pay).
2. **Think a month ahead**: new courier, new store platform, a client with 200 orders, a long name, a cancelled + refunded order, an order in another currency.
3. **Measure, don't eyeball**: related things must line up (a pill under its price, labels with their boxes, headers with their columns, in LTR and RTL). Write `getBoundingClientRect` checks for anything that looked off and keep them in a `checks/` file so it can't come back.
4. **Look at every row of every screenshot** in EN + HE (supplier: EN + 中文), 1440 and 390, light and dark. Read the text: duplicates, confusing money words, things repeated on every row.
5. **Look for name clashes**: a class used by two screens (`grep -rn "\.name{" dist/`) — a rule meant for one screen can quietly restyle another.
6. **Cross-check the numbers** between screens (Home vs Payments vs admin client panel vs supplier Billing): same total, same count.

## Report
Most important first: screen + language/width, what the user meets, why it matters, the fix, effort (S/M/L), screenshot path. Say plainly which screens and states you did NOT check. Verify each finding yourself before reporting it (a reviewer's claim is not proof). Rules that limit fixes: client portal stays simple; never show our fee/commission to clients; the supplier may see the $1 supplier share, never our profit; Hebrew and phone matter as much as English desktop.
