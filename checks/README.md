# Behaviour checks

These checks test what the site **does**, not how the code is written: real database code on an in-memory Postgres
(PGlite), a fake Google Sheet for the supplier tabs, and the real admin dashboard and client portal in Chrome
(English and Hebrew, desktop 1440 px and phone 390 px). GitHub runs them on every pull request
(`.github/workflows/tests.yml`); screenshots are kept as the run's `check-screenshots` artifact.

```bash
npm run checks          # all of them
npm run checks:api      # only the ones without a browser
node scripts/run-checks.mjs my-products   # one check (by name)
```

- Browser checks use Chrome from `CHROME_PATH`, else playwright-core's own Chromium
  (`npx playwright-core install chromium`).
- Screenshots go to `CHECKS_OUT` (default: the system temp folder, `direct-line-checks/<check>`).
- `lib.mjs` holds the shared database, request helper and test accounts; `fixtures/` the sample photos.
- Unit tests stay in `tests/` (`npm test`).
