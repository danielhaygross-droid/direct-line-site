// Vercel entry point: every /api/* request is rewritten here (see vercel.json)
// and handed to the original Worker with the same env/ctx shape Cloudflare provided.
import { createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import worker from '../server/worker.mjs';
import { createD1 } from '../server/d1-postgres.mjs';

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DB = databaseUrl ? createD1(databaseUrl) : undefined;

// If APP_SESSION_SECRET isn't set, derive a stable server-only one from the
// database URL (itself secret), so login sessions work without extra setup.
const sessionSecret = process.env.APP_SESSION_SECRET || (databaseUrl
  ? createHash('sha256').update('direct-line-session:' + databaseUrl).digest('hex')
  : undefined);

async function handle(request) {
  const url = new URL(request.url);
  const routed = url.searchParams.get('__path');
  if (routed !== null) {
    url.pathname = '/api/' + routed;
    url.searchParams.delete('__path');
  }
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const forwarded = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  return worker.fetch(forwarded, { ...process.env, APP_SESSION_SECRET: sessionSecret, DB }, { waitUntil });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
