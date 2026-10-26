// Vercel entry point: every /api/* request is rewritten here (see vercel.json).
// - /api/portal/*      -> client portal + admin monitoring (server/portal.mjs)
// - /api/auth/*        -> unified login for admins (env or DB) and clients
// - /api/cron/*        -> scheduled jobs (vercel.json "crons"), authorised by CRON_SECRET
// - everything else    -> the original Worker (store dashboard), admins only
import { createHash, timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import worker from '../server/worker.mjs';
import { createD1 } from '../server/d1-postgres.mjs';
import { LOCK_MESSAGE } from '../server/login-limit.mjs';
import { SCHEMA as PORTAL_SCHEMA, handlePortal, signIn, createSessionCookie, readSessionRole, parseRole, clientSession } from '../server/portal.mjs';
import { syncFileStorage } from '../server/file-storage.mjs';
import { runBackup } from '../server/backup.mjs';
import { pollSupplierSheet, supplierSheetQuickLook, rememberSupplierSheet } from '../server/supplier-sheet.mjs';
import { retryPendingGoogleSheetOrders } from '../server/google-sheets.mjs';

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DB = databaseUrl ? createD1(databaseUrl, undefined, PORTAL_SCHEMA) : undefined;

// If APP_SESSION_SECRET isn't set, derive a stable server-only one from the
// database URL (itself secret), so login sessions work without extra setup.
const sessionSecret = process.env.APP_SESSION_SECRET || (databaseUrl
  ? createHash('sha256').update('direct-line-session:' + databaseUrl).digest('hex')
  : undefined);

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

// Vercel sends "Authorization: Bearer $CRON_SECRET" on scheduled calls. Without the secret set, jobs are refused.
export function cronAuthorized(request, secret) {
  if (!secret) return false;
  const supplied = Buffer.from(request.headers.get('authorization') || ''), expected = Buffer.from('Bearer ' + secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
const CRON_JOBS = {
  '/api/cron/file-storage': (db, env) => syncFileStorage(db, env),
  '/api/cron/backup': (db, env) => runBackup(db, env),
  // Every minute: read the supplier's columns, then rewrite rows still waiting for the sheet (after a layout change or
  // a failed write). Before 23 Oct 2026 only an open, visible admin dashboard rewrote them.
  // Since 26 Oct 2026 (Neon free plan): a quick look at the Google Sheet first; the database is only woken when the
  // supplier changed something, or at least every 3 hours (see supplierSheetQuickLook).
  '/api/cron/supplier-sheet': async (db, env) => {
    const look = await supplierSheetQuickLook(env).catch(e => ({ unchanged: false, error: e.message }));
    if (look.unchanged) return { ok: true, unchanged: true };
    const result = await pollSupplierSheet(db, env);
    const retry = await retryPendingGoogleSheetOrders(db, env).catch(e => ({ error: e.message }));
    if (result.ok && result.enabled && look.fingerprint) await rememberSupplierSheet(env, look).catch(e => console.error('Supplier sheet mark not saved', e));
    return { ...result, retry, ...(look.error ? { quickLook: look.error } : {}) };
  },
};

export async function route(request, { db = DB, env: baseEnv = process.env } = {}) {
  const url = new URL(request.url);
  const routed = url.searchParams.get('__path');
  if (routed !== null) {
    url.pathname = '/api/' + routed;
    url.searchParams.delete('__path');
  }
  const env = { ...baseEnv, APP_SESSION_SECRET: sessionSecret ?? baseEnv.APP_SESSION_SECRET, DB: db };
  const path = url.pathname;

  try {
    if (CRON_JOBS[path]) {
      if (!cronAuthorized(request, env.CRON_SECRET)) return json({ ok: false, error: 'Unauthorized' }, 401);
      const result = await CRON_JOBS[path](db, env);
      console.log('Cron', path, JSON.stringify(result));
      return json(result, result.ok || result.configured === false ? 200 : 500);
    }
    if (path.startsWith('/api/portal/') || path === '/api/portal') {
      return await handlePortal(request, url, { DB: db, env, waitUntil });
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const signed = await signIn(db, env, request, String(body.username || '').trim().slice(0, 120), String(body.password || ''));
      if (signed.retryAfter) return json({ ok: false, error: LOCK_MESSAGE }, 429, { 'retry-after': String(signed.retryAfter) });
      const role = signed.role;
      if (!role) return json({ ok: false, error: 'Invalid credentials' }, 401);
      const who = parseRole(role);
      return json({ ok: true, role: who.admin ? 'admin' : 'client', ...(who.admin ? {} : { redirect: '/portal/' }) }, 200,
        { 'set-cookie': await createSessionCookie(role, env.APP_SESSION_SECRET, { remember: body.remember === true }) });
    }
    if (path === '/api/auth/session') {
      const who = parseRole(await readSessionRole(request, env.APP_SESSION_SECRET));
      if (!who) return json({ ok: false }, 401);
      if (!who.admin) {
        const user = await clientSession(db, who);
        if (!user) return json({ ok: false }, 401);
        return json({ ok: true, role: 'client', redirect: '/portal/', passwordResetRequired: !!user.password_reset_required });
      }
      return json(who.admin ? { ok: true, role: 'admin' } : { ok: true, role: 'client', redirect: '/portal/' });
    }

    // Store dashboard endpoints: admins only (the Etsy OAuth callback is validated by its own state).
    if (path !== '/api/auth/logout' && path !== '/api/etsy/callback') {
      const who = parseRole(await readSessionRole(request, env.APP_SESSION_SECRET));
      if (who && !who.admin) return json({ ok: false, error: 'Forbidden' }, 403);
    }
  } catch (error) {
    console.error('API error', error);
    return json({ ok: false, error: 'Server error' }, 500);
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const forwarded = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  return worker.fetch(forwarded, env, { waitUntil });
}

const handle = request => route(request);
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
