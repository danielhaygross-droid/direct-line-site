# Screen files

The admin dashboard and the client portal are each written as **one file per screen**:

- `src/admin/` → joined into `dist/admin/admin.js`
- `src/portal/` → joined into `dist/portal/portal.js`

The files are joined in name order, byte for byte, by `scripts/build-screens.mjs`. They are parts of one script: the
first file opens it (shared helpers and state) and the last file (`…-events.js`) closes it. A part on its own is not a
complete script.

**Editing:** change the screen file, then run `node scripts/build-screens.mjs` and commit both the screen file and the
rebuilt `dist/` file. Never edit `dist/admin/admin.js` or `dist/portal/portal.js` by hand: `npm test` and the GitHub
check fail when a dist file is not the join of its screen files. Vercel also rebuilds them (`npm run build`).

**Adding a screen:** add a file with the next number (`15-something.js`) or a number in between (rename the
following files). Keep the `NN-name.js` pattern.
