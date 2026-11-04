# handoff.md — Direct Line

Read this first in every new session, then just continue. No need to ask Erwin to explain again.
**Keep it current:** after every task that ships (or stops halfway), rewrite sections 2, 4, 5 and 6 below.
Lives in the repo root, so local and cloud sessions both see it; update it in the same PR as the work. How to work: `CLAUDE.md` (repo root). Older history: `docs/handoff/HISTORY.md` (cleaned copy of Erwin's notes), `git log`, PR descriptions. Working rules: `docs/handoff/RULES.md`. Agents: `.claude/agents/`.

Last updated: 5 Nov 2026, after the handoff-everything PR.

---

## 1. Goal
- Erwin builds and runs **Direct Line**: a client portal (`/portal/`) and an admin dashboard (`/admin/`) at https://direct-line-control.vercel.app, plus the **supplier Google Sheet** the website writes to and reads from.
- Clients (now mainly **Yehuda's team, Pauline** does the orders) send their Etsy orders. **Ada** (supplier, China) fills costs, tracking and shipping in the sheet. Direct Line bills the client: supplier cost + our fee ($0.50 per order).
- Owners: **Daniel** (GitHub/Vercel) and **Shahar**. Erwin reports to them every evening (end-of-day report: EN + HE PDFs + WhatsApp text, see `anthropic-skills:daily-report`).
- What "done" means: live on the site, checked in English + Hebrew at desktop + phone, tests green, Erwin told in short plain words.
- Hard rules (also in `CLAUDE.md`): no secrets in files/chat; no permanent deletes of real data; never touch Byzroyal; don't invent facts for clients; **never show our fee/commission to clients**; never change sheet columns without a safe one-time switch; do all work in one session (no side sessions); every number shown must add up (Erwin, 4 Nov: "do your facts straight").

## 2. Current state (4 Nov 2026)
- **Live:** `main` = `origin/main`, last PR **#170** (docs only: this file, `CLAUDE.md`, report layout files). Versions: portal.js 102, admin.js 108, admin.css 32, i18n 104.
- **Everything is merged; nothing half-done.** All local checkouts are saved on GitHub. `current-site/` is an old checkout on branch `codex/update-whatsapp-number` (backup only, not the live code).
- **Supplier sheet** (`1L_C87W4jrZGIIrT2Fg_cGowNi3R5fTehdDw8d-vpZag`): tabs Orders, Shipped, Cancelled, Billing (3 parts: paid / not paid / cancelled with refund), Product Quotes, Guide 使用说明. Headers are English + Chinese (website reads the English line). Layout 19: P Total cost, Q Cost per product, R tracking, S courier, T shipping status, U Delayed?, V reason, W Client paid, X–AE photos/links, AF–AG hidden ids, AH domestic tracking, AI cancellation fee.
- **Cost revisions** (client asks for a lower cost): shown in the Competitor price cell (orange = waiting for Ada, purple = waiting for Direct Line, green = done). A lower cost from Ada is applied by itself (unless it drops by more than half); Ada types `NO: reason` to refuse. Clients see a tag in their lists (Revision requested / Cost lowered / Cost kept).
- **Photos per variation:** orders with 2+ variant lines need a photo per line (no general photo box then). Sheet shows one picture with each photo labelled by its variant name. Paste button + Ctrl+V on every photo box.
- **Admin money (latest work):** Overview "Not paid yet" = what clients owe now, with "Without our fee $X · our fee $Y" (X + Y = owed). Our earnings = collected + not paid yet + not billed yet. Clients table has a "Without our fee" column (billed − our earnings). Client panel shows the same under Outstanding / Balance.
- Clients can edit every detail of an order until it ships.

## 3. Active files
- Code: this repo, `danielhaygross-droid/direct-line-site` (on Erwin's computer: `direct-line-control/continuation/`). Always branch from `origin/main`.
- Screens: `src/admin/NN-*.js`, `src/portal/NN-*.js` → `node scripts/build-screens.mjs` builds `dist/admin/admin.js` and `dist/portal/portal.js` (never edit those two by hand).
- Shared browser code: `dist/p/common.js` (photos, paste, sorts `LIST_SORTS`, `bySort`), `dist/p/order-ui.js` (pills, tags like `revTag`), `dist/p/payment-orders.js` (paid / unpaid / unbilled), `dist/p/i18n.js` (Hebrew; anchor `'Needs cost': 'חסרה עלות',`; dynamic text in `const R = [`).
- Admin money cards: `src/admin/02-layout.js`; Clients table `src/admin/08-clients-tab.js`; client panel `src/admin/11-client-panel.js`; Overview tab `src/admin/04-overview-tab.js`.
- Server: `server/portal.mjs` (API, orders, photos), `server/supplier-sheet.mjs` (sheet layout, sync, minute check, Billing tab, `fixRuleRanges`), `server/sheet-photos.mjs` + `server/photo-collage.mjs` (sheet pictures), `server/cost-revisions.mjs`, `server/item-costs.mjs`, `server/claims.mjs`.
- Checks: `checks/check-*.mjs` (PGlite + Playwright, fake Google Sheets inside); screenshots land in `%TEMP%/direct-line-checks/<name>/`.
- Notes (all in the repo): this file, `CLAUDE.md`, `docs/handoff/HISTORY.md` (history, newest on top; emails, usernames, login setup and money amounts removed), `docs/handoff/RULES.md` (rules from Claude's memory), `.claude/agents/` (design-reviewer, report-writer, sheet-checker). Erwin's computer also has the full `../CONTINUE_HERE.md` and the memory folder `~/.claude/projects/C--Users-erwin-Downloads-Direct-Line/memory/`; when a rule is added there, copy it to `RULES.md`, and add new history notes to both.
- Reports: layout files in `tools/report-template/` (shared `head.html`, Hebrew style, the 22 Oct report `body.html` + `make_he.py`, `render*.cjs`) and `tools/report-template/r1101/` (`page_fn.py` layout, `render.cjs` PDF, `shot.cjs` preview). The report text `gen.py` holds real store and billing figures, so it stays on Erwin's computer in `direct-line-control/tools/report-template/r1101/`: copy that folder to a new `rMMDD` and put screenshots in its `img/`. Scripts use the repo's `playwright-core`; set `CHROME_PATH` if Chromium is not at Erwin's path. Finished PDFs: `direct-line-control/reports/`.

## 4. Changes (most recent first)
- 5 Nov: history (cleaned), working rules and the 3 agents added to the repo, so cloud sessions get everything. Report text with real figures (`gen.py`) still stays on Erwin's computer.
- #170 (4 Nov): HANDOFF.md + CLAUDE.md in the repo, report layout files in `tools/report-template/`. The repo is public, so the notes history and report figures stay on Erwin's computer.
- #169 (4 Nov): "without our fee" fixed so it adds up to what clients owe (it used the total before credit). Earnings split adds "not billed yet".
- #168 (4 Nov): admin sees bills without our fee (Overview, Clients table, client panel). Admin only.
- 4 Nov (other session): admin cards reworked (Not paid yet = owed now, earnings count kept fees), thousands separators, card contrast, clients edit until shipped.
- #160–#163 (3 Nov): cost revisions auto-apply + `NO: reason`; Billing tab cancelled part; sheet in English + Chinese with Guide tab; orders up to 10,000 pieces.
- #153–#159 (2–3 Nov): missing variant photos on any order except cancelled; click any table header to sort; card rows line up; update tags + bell search; sheet write lock, one minute check at a time, doubled rows heal; duplicate order/tracking warnings.
- #145–#152 (1–2 Nov): photo per variation, sheet picture with variant names, Paste button, cost revision tags/filter/sort, Sort on every list, Shipped colour rules repair.

## 5. Failed attempts / lessons (don't repeat these)
- **The repo is public** (`gh repo view danielhaygross-droid/direct-line-site --json visibility`). A session almost committed the whole notes history (a supplier's Gmail, admin username, login/database setup, store profits). Never commit personal data, login/security details or money figures.
- **Numbers must add up.** #168 showed "unpaid without our fee" from the total *before* credit, so it was bigger than what was owed. Always check a split against the big number it explains, and add a check that asserts it.
- **Sheet changes need "Check sheet now".** The minute cron didn't visibly run after deploys; ask Erwin to press "Check sheet now" in admin, then verify with the Google Sheets connector.
- **Moving a row to the top of a tab pushes conditional colour rules down** (Shipped had slid to row 44). `fixRuleRanges` repairs Orders + Shipped on every check (not Cancelled, Erwin's choice).
- **Google Sheets caches `=IMAGE()` pictures:** change the URL (e.g. `&v=2`) to make it fetch a new one.
- **Fake sheets in checks** must copy what Google does (column/row moves, duplicating tabs copies colour rules); otherwise a check passes while the live sheet breaks.
- Files use **CRLF**: Python edits keep line endings (`newline=''`); write scripts with the Write tool, not shell heredocs with backslashes. Pushing a partial `replace` with a fallback string once wiped two comment lines — assert each replacement matched once.
- Don't `git pull` / merge into the old local `main` of another checkout (caused conflicts once); on Erwin's computer work only in `continuation/`, branch from `origin/main`.
- `check-my-products` popup wait can flake on GitHub; re-run the failed job once before digging.
- In Bash, `sleep N; cmd` is blocked: use `until <check>; do sleep 10; done` or a background command.
- Stop when Erwin says "don't start yet" and explain the plan first; Pauline doesn't need to know how we operate (keep client messages short).

## 6. Next steps / open items
- Nothing in progress in code. Start new work from `origin/main` on a new `claude/<name>` branch.
- Not code (Erwin's side): Royal Flint ads profile still pending; Pauline adding variant photos on her orders with several variants; Ada told about numbered/named variant photos and the bilingual sheet.
- Ada's #4211752986: her costs per product add up to $81.70 but Total cost is $79.90 (she should make them match).
- When Erwin asks for the end-of-day report: use the daily-report skill, full 22 Oct format with screenshots, only that day's work.

## 7. Installed skills and agents (use them; check the session's skill list for new ones — a cloud session may not have the Erwin-installed ones)
**Direct Line work**
- `graphify` — code map of `continuation/` (`graphify query/explain/path`); refresh after merges: `graphify update . && graphify cluster-only . --no-label` (exe in `~/AppData/Roaming/Python/Python314/Scripts/graphify.exe`).
- `anthropic-skills:daily-report` (+ agent `report-writer`) — end-of-day report: WhatsApp text + EN/HE PDFs; store-ops "done for today" message.
- `anthropic-skills:supplier-coordination` — WhatsApp messages to Ada/Ye (costs, tracking, refunds, sheet changes); stuck orders.
- Agents: `design-reviewer` (EN + HE screenshots at 1440/390, lists visual problems), `sheet-checker` (read-only check of the supplier sheet).
- Design: `ui-ux-pro-max`, `taste-skill` (design-taste-frontend), `design-motion-principles`, `dataviz` (charts), `artifact-design` / `artifact-diagramming` / `artifact-capabilities` (published pages).
- Code quality: `code-review` (`/code-review`), `simplify`, `security-review`, `run` (launch the app), `claude-api`.
- Files: `anthropic-skills:pdf`, `docx`, `xlsx`, `pptx`, `docs`, `google-workspace` (changing Google Docs/Sheets/Slides).

**Erwin's store work (Etsy lighter shops, Cursed Carvings, Z-Royal)**
- `anthropic-skills:etsy-customer-service` (buyer replies, cases, reviews), `etsy-lighter-listing` (listings from a photo), `store-pricing` (prices, margins), `zroyal-email-flows` (Z-Royal emails), `client-pitch` (OnlineJobs.ph applications).
- SEO: `searchfit-seo:*` (seo-audit, seo-check, on-page-seo, technical-seo, schema-markup, keyword-clustering, content-strategy, content-brief, create-content, translate-content, internal-linking, broken-links, ai-visibility, competitor/content/seo agents).
- Support: `customer-support:*` (draft-response, ticket-triage, customer-research, customer-escalation, kb-article).

**Setup and housekeeping**
- `anthropic-skills:consolidate-memory`, `import-memory`, `explain-usage`, `morning`, `setup-claude`, `skill-creator`; `update-config` (settings/hooks), `fewer-permission-prompts`, `keybindings-help`, `loop`, `schedule`, `init`, `plugin-authoring`, `cowork-plugin-management:*`.
