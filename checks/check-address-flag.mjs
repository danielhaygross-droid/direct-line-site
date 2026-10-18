// Local check: an unchanged address is kept exactly as stored, and (since #74) no "ADDRESS CHANGED" flag is ever set.
//   node checks/check-address-flag.mjs [codeDir]    (codeDir default ../addr-fix; branch claude/address-flag-fix)
// Real SQL on in-memory Postgres (PGlite) + the real admin screens in Chrome. No live data.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const code = path.resolve(here, process.argv[2] || '..'), root = path.join(code, 'dist'), out = path.join(process.env.CHECKS_OUT || (await import('node:os')).tmpdir(), 'direct-line-checks', 'address-flag');
await mkdir(out, { recursive: true });
const { createD1 } = await import(pathToFileURL(path.join(code, 'server/d1-postgres.mjs')));
const { SCHEMA, handlePortal } = await import(pathToFileURL(path.join(code, 'server/portal.mjs')));
const { route } = await import(pathToFileURL(path.join(code, 'api/index.mjs')));
const pg = new PGlite(), DB = createD1(null, async (q, p) => (await pg.query(q, p)).rows, SCHEMA);
const env = { ADMIN_USERNAME: 'localboss', ADMIN_PASSWORD: 'local-boss-password', APP_SESSION_SECRET: 'local-tests-only' };
async function call(p, method = 'GET', body, cookie = '') {
  const url = new URL('http://localhost/api/portal' + p);
  const r = await handlePortal(new Request(url, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), url, { DB, env, waitUntil: x => x.catch(() => {}) });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const admin = (await call('/login', 'POST', { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD })).cookie;
const id = (await call('/admin/users', 'POST', { username: 'yehuda', name: 'Yehuda Vaknin', password: 'clientpass123', role: 'client' }, admin)).data.id;
const client = (await call('/login', 'POST', { username: 'yehuda', password: 'clientpass123' })).cookie;
const terms = await call('/terms', 'GET', null, client); await call('/terms/accept', 'POST', { version: terms.data.policy.version, accepted: true }, client);
const store = (await call('/client-stores', 'GET', null, client)).data.stores[0];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const flag = async oid => (await DB.prepare('SELECT address_changed_at FROM client_orders WHERE id=?').bind(oid).first()).address_changed_at;
const ids = [];
for (const [i, name] of ['Kayson Pittman', 'Jason Wells', 'Lena Pons'].entries()) {
  const o = (await call('/orders', 'POST', { storeId: store.id, orderRef: '#41982850' + i, orderDate: '2026-10-12', buyerName: name, address1: '231 Fafnir Dr\nKimberly, ID 83341\nUnited States', destination: 'US', etsyUrl: 'https://www.etsy.com/listing/1', photos: [{ data: png, thumb: png, width: 1, height: 1 }] }, client)).data.order;
  await DB.prepare("UPDATE client_orders SET address_line_1=? WHERE id=?").bind('231 Fafnir Dr \r\nKimberly, ID 83341\r\nUnited States', o.id).run();
  await call('/orders/' + o.id, 'PUT', { status: 'processing' }, admin); ids.push(o.id);
}
// Same address re-saved (fee edit, client numbers, client details form) → no flag; a real change → flag; client can't clear.
assert.equal((await call('/orders/' + ids[0], 'PUT', { commission: '0.5' }, admin)).status, 200); assert.equal(await flag(ids[0]), null);
assert.equal((await call('/orders/' + ids[0], 'PUT', { sellingPrice: '40', currency: 'USD', etsyFee: '5' }, client)).status, 200); assert.equal(await flag(ids[0]), null);
assert.equal((await call('/orders/' + ids[0], 'PUT', { buyerName: 'Kayson Pittman', address1: '231 Fafnir Dr\nKimberly, ID 83341\nUnited States', address2: '', city: '', region: '', postalCode: '', buyerPhone: '', destination: 'US', taxNumber: 'IOSS IM1', giftMessage: '' }, client)).status, 200);
assert.equal(await flag(ids[0]), null);
assert.equal((await DB.prepare('SELECT address_line_1 FROM client_orders WHERE id=?').bind(ids[0]).first()).address_line_1, '231 Fafnir Dr \r\nKimberly, ID 83341\r\nUnited States', 'kept as stored');
for (const oid of ids) assert.equal((await call('/orders/' + oid, 'PUT', { buyerName: 'New Name', address1: '1 New Street\nBoise, ID 83702', destination: 'US' }, client)).status, 200);
for (const oid of ids) assert.equal(await flag(oid), null, 'a real change is saved but not flagged any more');

assert.equal((await call('/orders/' + ids[0], 'GET', null, client)).data.order?.addressChangedAt, undefined, 'clients never see it');
console.log('PASS api: unchanged addresses kept as stored, nothing flagged');
await pg.close();
