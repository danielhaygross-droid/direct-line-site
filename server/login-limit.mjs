// Failed sign-in limits. Failures are counted per username + IP, per IP and per username (from
// anywhere) inside a 15-minute window. Reaching a limit locks that key for 15 minutes; while any
// key is locked the sign-in is refused before the password is checked. A successful sign-in
// clears the username + IP count. The per-username limit is high so a stranger can't easily
// lock a real client out.
export const WINDOW_SECONDS = 15 * 60;
export const LOCK_SECONDS = 15 * 60;
export const LIMITS = { userIp: 5, ip: 20, user: 50 };
export const LOCK_MESSAGE = 'Too many sign-in attempts. Please wait 15 minutes and try again.';

export const LOGIN_LIMIT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    first_at INTEGER NOT NULL,
    locked_until INTEGER NOT NULL DEFAULT 0
  )`,
];

// Vercel sets x-real-ip / x-forwarded-for itself, so clients can't choose their own IP.
export function clientIp(request) {
  return (request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0]).trim() || 'unknown';
}

export function loginKeys(username, ip) {
  const user = String(username || '').trim().toLowerCase().slice(0, 120);
  return { userIp: `u:${user}|ip:${ip}`, ip: `ip:${ip}`, user: `u:${user}` };
}

// The next stored state for one key after a failed attempt at time `now` (seconds).
export function afterFailure(row, limit, now) {
  const fresh = !row || row.first_at <= now - WINDOW_SECONDS;
  const failures = fresh ? 1 : Number(row.failures) + 1;
  const first_at = fresh ? now : Number(row.first_at);
  const locked_until = failures >= limit ? now + LOCK_SECONDS : Number(row?.locked_until || 0);
  return { failures, first_at, locked_until };
}

async function rows(DB, keys) {
  const list = Object.values(keys);
  const found = (await DB.prepare(`SELECT key, failures, first_at, locked_until FROM login_attempts WHERE key IN (${list.map(() => '?').join(',')})`)
    .bind(...list).all()).results || [];
  return Object.fromEntries(found.map(r => [r.key, r]));
}

// Seconds until the sign-in may be tried again, or 0 when it isn't locked.
export async function lockedFor(DB, keys, now) {
  const found = await rows(DB, keys);
  const until = Math.max(0, ...Object.values(found).map(r => Number(r.locked_until)));
  return until > now ? until - now : 0;
}

export async function recordFailure(DB, keys, now) {
  const found = await rows(DB, keys);
  for (const [kind, key] of Object.entries(keys)) {
    const next = afterFailure(found[key], LIMITS[kind], now);
    await DB.prepare(`INSERT INTO login_attempts (key, failures, first_at, locked_until) VALUES (?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, first_at = excluded.first_at, locked_until = excluded.locked_until`)
      .bind(key, next.failures, next.first_at, next.locked_until).run();
  }
  // Old rows are no longer needed once both their window and any lock have passed.
  await DB.prepare('DELETE FROM login_attempts WHERE first_at < ? AND locked_until < ?').bind(now - 86400, now).run();
}

export async function clearFailures(DB, keys) {
  await DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(keys.userIp).run();
}
