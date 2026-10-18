// The flow from lib.mjs: country create/edit, 72 h edit window, locks, admin edits, password reset, sessions, unified login.
import { checks, pg } from './lib.mjs';
try { await checks(); } finally { await pg.close(); }
