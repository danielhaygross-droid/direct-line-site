# Direct Line — how to work here (repo copy: works on Erwin's computer AND in cloud sessions)

Erwin builds and runs the **Direct Line** client portal + admin dashboard (owner of the GitHub/Vercel: Daniel; client requests come via Shahar on WhatsApp). Work continuously; don't ask for permission for normal development steps — the user wants things done end to end.

## Start of every session
1. **Read `HANDOFF.md` (repo root) first** — Goal · Current state · Active files · Changes · Failed attempts · Next steps · Skills — and continue from it without asking Erwin to explain again.
2. **Keep it current:** every PR that ships (or work that stops halfway) also updates `HANDOFF.md` sections 2, 4, 5, 6 (and 7 if skills change), in the same PR. The file travels with the code, so the next session (local or cloud) sees it.
3. Older history: `git log`, the PR descriptions on GitHub, and (on Erwin's computer only) `../CONTINUE_HERE.md`. **The repo is public:** never commit notes with personal data (emails, usernames, phone numbers), login/security details or money figures; those stay in `../CONTINUE_HERE.md`.
4. **Admin and portal code is one file per screen**: edit `src/admin/NN-*.js` / `src/portal/NN-*.js`, then run `node scripts/build-screens.mjs` (joins them into `dist/admin/admin.js` / `dist/portal/portal.js`). Never edit those two dist files by hand: `npm test` and GitHub fail if they aren't built from `src/`.

## Where you are
- **Erwin's computer:** the repo is `C:\Users\erwin\Downloads\Direct Line\direct-line-control\continuation` (git worktree). In Bash: `export PATH="$PATH:/c/Program Files/GitHub CLI"`. Code map: `graphify` (exe `/c/Users/erwin/AppData/Roaming/Python/Python314/Scripts/graphify.exe`, output `graphify-out/`, git-ignored): `graphify query "<question>"`, `graphify explain "<fn>"`; refresh after merges with `graphify update . && graphify cluster-only . --no-label`.
- **Cloud session:** you have only this repo. Run `npm ci` first. No `../CONTINUE_HERE.md`, no graphify, no local memory: `HANDOFF.md` + this file are the whole briefing. Some skills/connectors (Google Sheets, PDFs) may be missing; say so and do what the repo allows. Push a `claude/<name>` branch and open the PR as below.

## Shipping a change (do all of it, don't stop halfway)
- Branch from `origin/main` (`git fetch -q && git checkout -q -b claude/<name> origin/main`).
- Bump the `?v=` number in every HTML file that loads a changed JS/CSS file (`dist/admin/index.html`, `dist/portal/index.html`, `dist/index.html`, `dist/en/index.html`).
- New user-visible text → add Hebrew to `dist/p/i18n.js` (anchor line `'Needs cost': 'חסרה עלות',`; dynamic text goes in the regex list `const R = [`).
- Tests: `npm test` (screens built + unit tests) must pass; prefer adding or extending a behaviour check in `checks/` over tests that match code text. `npm run checks` runs all behaviour checks (`npm run checks:api` without a browser; `node scripts/run-checks.mjs <name>` for one).
- **Always review the design**: for any UI change, render it with a `checks/check-*.mjs` script (PGlite + Playwright), take screenshots EN + HE at 1440 and 390 px (they land in the temp folder `direct-line-checks/<check>`), look at them and fix what looks off before shipping.
- **Numbers must add up**: any split shown next to a total (e.g. "without our fee · our fee") must add up to that total; add a check that asserts it.
- GitHub runs `.github/workflows/tests.yml` (unit + checks) on every PR: wait for **unit**, **checks** and the Vercel check to pass before merging.
- Commit with a message file (`git commit -F file`), `git push -u origin <branch>`, then `gh pr create --repo danielhaygross-droid/direct-line-site --base main --head <branch> --title ... --body-file ...`, wait for the checks (`gh pr checks N --repo ...`), merge with `gh pr merge N --repo danielhaygross-droid/direct-line-site --merge`, then confirm the live `?v=` number with curl on https://direct-line-control.vercel.app.
- Use the commit/PR attribution lines the session's system reminder gives. Update `HANDOFF.md` in the same PR.

## Gotchas
- Files use CRLF; Python edit scripts must keep line endings (`newline=''`, detect `\r\n`). Backslashes in shell heredocs get mangled — write scripts with the Write tool, or use `chr(92)`.
- Never inline `<script>` (CSP). Don't touch `claude/VERCEL_MIGRATION_STATUS.md` (another session edits it).
- Supplier Google Sheet id `1L_C87W4jrZGIIrT2Fg_cGowNi3R5fTehdDw8d-vpZag` — read it with the Google Sheets connector to verify live changes. Layout is in `server/supplier-sheet.mjs` / `server/quote-sheet.mjs`; never change columns without a safe one-time switch. Sheet-side changes reach the live sheet after Erwin presses "Check sheet now" in admin.

## Rules
- Never put passwords/secrets in files or chat; never type passwords into the live site.
- No permanent deletes of real data (archive/soft-delete instead). Never touch Byzroyal.
- Don't invent facts for clients (fees, times, promises) — ask or leave them out. Never show our fee/commission to clients.
- Client portal must stay simple; Hebrew and phone layouts matter as much as English desktop.
- Do all work in one session (don't start side sessions).
- Reply to Erwin in short, plain language: what changed, what was checked, what he must do.
