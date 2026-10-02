// Vercel entry point: every /api/* request is rewritten here (see vercel.json).
// - /api/portal/*      -> client portal + admin monitoring (server/portal.mjs)
// - /api/auth/*        -> unified login for admins (env or DB) and clients
// - everything else    -> the original Worker (store dashboard), admins only
import { createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import worker from '../server/worker.mjs';
import { createD1 } from '../server/d1-postgres.mjs';
import { SCHEMA as PORTAL_SCHEMA, handlePortal, authenticate, createSessionCookie, readSessionRole, parseRole } from '../server/portal.mjs';

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
    if (path.startsWith('/api/portal/') || path === '/api/portal') {
      return await handlePortal(request, url, { DB: db, env });
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const role = await authenticate(db, env, String(body.username || '').trim(), String(body.password || ''));
      if (!role) return json({ ok: false, error: 'Invalid credentials' }, 401);
      const who = parseRole(role);
      return json({ ok: true, role: who.admin ? 'admin' : 'client', ...(who.admin ? {} : { redirect: '/portal/' }) }, 200,
        { 'set-cookie': await createSessionCookie(role, env.APP_SESSION_SECRET, { remember: body.remember === true }) });
    }
    if (path === '/api/auth/session') {
      const who = parseRole(await readSessionRole(request, env.APP_SESSION_SECRET));
      if (!who) return json({ ok: false }, 401);
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
