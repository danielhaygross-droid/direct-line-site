import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createD1 } from '../server/d1-postgres.mjs';
import { SCHEMA, handlePortal, hashPassword, verifyPassword, canEditOrder, authenticate } from '../server/portal.mjs';
import { route } from '../api/index.mjs';
export const pg = new PGlite();
export const DB = createD1(null, async (q,p) => (await pg.query(q,p)).rows, SCHEMA);
export const env = { ADMIN_USERNAME: 'localboss', ADMIN_PASSWORD: 'local-boss-password', APP_SESSION_SECRET: 'local-tests-only' };
export async function call(path, method='GET', body, cookie='', extraHeaders={}) {
  const url = new URL('http://localhost/api/portal'+path);
  const request = new Request(url, { method, headers: { cookie, 'content-type': 'application/json', ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await handlePortal(request, url, { DB, env, waitUntil: p => p.catch(() => {}) });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
export async function seed({accept=true}={}) {
  const admin = await call('/login','POST',{ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });
  const cookie=admin.cookie;
  const created=await call('/admin/users','POST',{ username: 'localclient', name: 'Local Client', password:'clientpass123', role:'client' },cookie);
  assert.equal(created.status,200); const id=created.data.id;
  const login=await call('/login','POST',{ username:'localclient', password:'clientpass123' });
  if (accept) { const terms=await call('/terms','GET',null,login.cookie); assert.equal((await call('/terms/accept','POST',{version:terms.data.policy.version,accepted:true},login.cookie)).status,200); }
  return { admin: cookie, client: login.cookie, id };
}
export async function checks() {
  const {admin,client,id}=await seed();
  assert.equal(await authenticate(DB,env,'localclient','wrong'),null);
  const row=await DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
  assert.ok(row.last_login>0);
  assert.equal(canEditOrder({ status:'pending',created_at:1000 },1000+72*3600-1),true);
  assert.equal(canEditOrder({ status:'pending',created_at:1000 },1000+72*3600),false);
  assert.equal(canEditOrder({ status:'processing',created_at:1000 },1001),false);
  const orderBody={clientId:id,orderRef:'LOCAL-1',buyerName:'Jane Sample',destination:'IL',address1:'1 Test Street',city:'Test City',postalCode:'10001',etsyUrl:'https://example.com/product'};
  assert.equal((await call('/orders','POST',{...orderBody,destination:''},admin)).status,400);
  assert.equal((await call('/orders','POST',{...orderBody,destination:'__other'},client)).status,400);
  const created=await call('/orders','POST',orderBody,admin);
  assert.equal(created.status,200); const oid=created.data.order.id;
  assert.equal((await call('/orders/'+oid,'PUT',{buyerName:'Jane Updated'},client)).status,200);
  assert.equal((await call('/orders/'+oid,'PUT',{destination:''},client)).status,400);
  assert.equal((await call('/orders/'+oid,'PUT',{destination:'Singapore'},client)).status,200);
  assert.equal((await call('/orders/'+oid,'PUT',{status:'processing'},admin)).status,200);
  assert.equal((await call('/orders/'+oid,'PUT',{buyerName:'Still allowed'},client)).status,200,'customer details until shipped');
  assert.equal((await call('/orders/'+oid,'PUT',{quantity:5},client)).status,409,'other fields are locked');
  assert.equal((await call('/orders/'+oid+'/photos','POST',{},client)).status,409);
  assert.equal((await call('/orders/'+oid,'PUT',{buyerName:'Admin Changed'},admin)).status,200);
  assert.equal((await call('/orders/'+oid,'PUT',{status:'pending'},admin)).status,200,'admins can move an order back');assert.equal((await call('/orders/'+oid,'PUT',{status:'processing'},admin)).status,200);
  await DB.prepare("UPDATE client_orders SET status='pending' WHERE id=?").bind(oid).run();
  assert.equal((await call('/orders/'+oid,'PUT',{buyerName:'Still allowed 2'},client)).status,200);
  assert.equal((await call('/orders/'+oid,'PUT',{quantity:5},client)).status,409,'locked after processing');
  await DB.prepare("UPDATE client_orders SET status='pending',created_at=? WHERE id=?").bind(Math.floor(Date.now()/1000)-72*3600,oid).run();
  assert.equal((await call('/orders/'+oid,'PUT',{buyerName:'Allowed after 72h'},client)).status,200);
  assert.equal((await call('/orders/'+oid+'/photos/1/delete','POST',{},client)).status,409);
  assert.equal((await call('/admin/users/'+id+'/reset-password','POST',{},client)).status,403);
  const reset=await call('/admin/users/'+id+'/reset-password','POST',{},admin);
  assert.equal(reset.status,200);const temporary=reset.data.temporaryPassword;
  assert.equal((await call('/admin/users/'+id,'POST',{name:'Updated Name'},admin)).status,200);
  const stored=await DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
  assert.notEqual(stored.password_hash,temporary);assert.equal(await verifyPassword(temporary,stored.password_hash),true);
  assert.equal((await call('/orders','GET',null,client)).status,401);
  assert.equal((await call('/login','POST',{username:'localclient',password:'clientpass123'})).status,401);
  const tempLogin=await call('/login','POST',{username:'localclient',password:temporary});
  assert.equal(tempLogin.status,200);
  assert.equal((await call('/me','GET',null,tempLogin.cookie)).data.passwordResetRequired,true);
  assert.equal((await call('/orders','GET',null,tempLogin.cookie)).status,423);
  assert.equal((await call('/password','POST',{password:'short'},tempLogin.cookie)).status,400);
  assert.equal((await call('/password','POST',{password:temporary},tempLogin.cookie)).status,400);
  const changed=await call('/password','POST',{password:'new-client-password'},tempLogin.cookie);
  assert.equal(changed.status,200);
  assert.equal((await call('/orders','GET',null,changed.cookie)).status,200);
  assert.equal((await call('/orders','GET',null,tempLogin.cookie)).status,401);
  assert.equal((await call('/login','POST',{username:'localclient',password:temporary})).status,401);
  const request=new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'localclient',password:'new-client-password'})});
  const unified=await route(request,{db:DB,env});assert.equal(unified.status,200);
  const session=await route(new Request('http://localhost/api/auth/session',{headers:{cookie:unified.headers.get('set-cookie').split(';')[0]}}),{db:DB,env});
  assert.equal(session.status,200);
  const overview=await call('/admin/overview','GET',null,admin);
  assert.ok(overview.data.clients[0].lastLogin>0);
  assert.ok(!JSON.stringify(overview.data).includes(temporary));
  console.log('PASS: country create/edit; 72h boundary; processing/photo lock; admin edits; reset hashes; session revocation; mandatory password change; unified login; last login.');
}
if (process.argv[1]?.endsWith('lib.mjs')) {
  try { await checks(); } finally { await pg.close(); }
}
