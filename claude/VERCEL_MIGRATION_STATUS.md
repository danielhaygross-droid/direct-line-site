# Direct Line continuation — 12 October 2026

Production is Vercel + Neon, https://direct-line-control.vercel.app/.

## Verified starting point

- PR #16 (hide client cost/shipping breakdown) is merged.
- PR #17 (editable bank details and Copy buttons) is merged; its description and older handoff incorrectly say it is waiting for approval.
- `origin/main` = `f0b44fb`, merge of PR #17.
- Public production portal HTML serves portal.js v21 and portal.css v10.

## Prepared for review: PDF item #7

Branch: `codex/remove-client-etsy-import`, based on `f0b44fb`.

- Removed client upload page, sidebar entry, Home buttons and New order banner.
- Old `#/import` links replace the URL with `#/home`.
- Removed the client CSV parser asset and bulk import API. Requests cannot create orders through the retired endpoint (client 403, admin 404).
- Kept existing imported orders, their `source` values and the existing photo exemption for editing them.
- Daniel's separate dashboard sale-price CSV import stays available.
- Cache versions: portal.js v22, portal.css v11; no new UI wording to translate.

Validation: 37/37 Node tests, build, syntax and diff checks pass. An existing test now normalizes Windows line endings. Local mocked browser checks passed EN/HE, 1440px/390px, light/dark, across Home, Orders, New order, Payments and legacy order editing; no page errors or horizontal overflow. Representative screenshots were inspected. No production orders or payments were created.

This branch has not been merged or deployed to production.

## Remaining work

Next according to the root handoff: #11 required country, #8 customer column/search, #9 store wording, #3 server-enforced edit window, #14 client account/password reset, then #1 terms. Larger features #10/#2/#4/#12/#13/#15 remain. Item #5 phase 2 (transfer-confirmation uploads) also remains.

Authoritative full history: the root `CONTINUE_HERE.md` in `C:/Users/erwin/Downloads/Direct Line/direct-line-control/`. The new checkout is `continuation/`; `current-site/` still holds the older branch and its pre-existing documentation edits.
