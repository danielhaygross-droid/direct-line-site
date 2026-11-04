# Working rules learned with Erwin

Copy of the rules kept in Claude's memory on Erwin's computer, so cloud sessions follow them too. Each rule: what to do, then why.

## Work
- **One session only.** Do all work in the main session; don't start, offer or propose side sessions. Subagents inside a turn are fine. *Why:* side sessions scattered the work (Erwin, 30 Oct 2026).
- **Save usage.** Ask the graphify map first for code questions, then a tight Grep, then Read with offset/limit; never read a whole dist bundle. Use cheap subagents (`sheet-checker`, `design-reviewer`, `Explore`) for read-only work. Batch tool calls; wait for CI in one background command; short replies. *Why:* the weekly limit is shared by all Direct Line work.
- **Review designs before shipping.** For any UI change, render it with a `checks/check-*.mjs`, screenshot EN + HE at 1440 and 390 px and look at them. *Why:* Erwin caught an oversized tick box shipped without looking.
- **Numbers must add up.** Any split shown next to a total must add up to it; add a check that asserts it. *Why:* the "without our fee" figure was once higher than the total (#168, fixed in #169).
- **Merging.** `gh pr merge <n> --repo danielhaygross-droid/direct-line-site --merge` is allowed by Erwin's own settings. If it is denied, ask Erwin to click Merge; don't route around the block.
- **Sheet changes need the button.** After merging a supplier-sheet change, ask Erwin to press "Check sheet now" in admin, then verify with the Sheets connector. *Why:* the cron did not visibly pick up changes on its own.
- **Tailwind plan.** Move screens to Tailwind one at a time with the look unchanged; design changes only after everything is migrated (note ideas for later instead).
- **No store auto-import.** Don't propose automatic Etsy/Shopify import; clients own their stores and enter orders in the portal.

## Writing for people
- **Never show our fee to clients.** In anything a client reads, give only the price they pay; no fee, commission or cost split. Supplier messages and internal reports may mention it.
- **Done items stay done.** When Erwin says something is done, never list it as open again. A request for the end-of-day report means he already checked everything.
- **Report context.** Write each report item so Shahar and Daniel understand it without the chat: what happened, whose orders, what a fee/credit/refund is for. Don't explain people they know (Ada, Ye, Yehuda).
- **Full-format reports.** End-of-day PDFs use the full 22 Oct layout (cover, "In short", 4 stat boxes, PR table, one page per feature with screenshots, end-of-day status), built with `tools/report-template/`. The WhatsApp text comes from the daily-report skill.

## Public repo
- This repo is public. Before adding any notes/doc file, scan it for emails, usernames, phone numbers, login/security details and money figures and leave those out. The full history (`CONTINUE_HERE.md`) and report text with real figures (`r1101/gen.py`) stay on Erwin's computer; `docs/handoff/HISTORY.md` is a cleaned copy.
