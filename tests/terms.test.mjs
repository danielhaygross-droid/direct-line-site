import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCookie, handlePortal } from '../server/portal.mjs';
import { publishTerms } from '../server/terms.mjs';

function database() {
  const records = new Map();
  let policy = { version: 1, english: 'Original policy', hebrew: 'מדיניות' };
  return { records, prepare(sql) {
    let args=[];
    return { bind(...values) { args=values;return this; }, async first() {
      if (sql.includes('FROM users')) return { active:true, archived:false, session_version:0 };
      if (sql.includes('SELECT * FROM portal_terms_versions')) return policy;
      if (sql.includes('FROM client_terms_acceptances')) return records.get(args.join(':')) || null;
      if (sql.includes('INSERT INTO portal_terms_versions')) { policy={version:args[0],english:args[1],hebrew:args[2]};return {version:args[0]}; }
      throw new Error(sql);
    }, async run() {
      assert.match(sql,/INSERT INTO client_terms_acceptances/);
      const key=args.slice(0,2).join(':');
      if (!records.has(key)) records.set(key,{ version:args[1],accepted_at:args[2],ip:args[3] });
    }, async all() { assert.match(sql,/FROM (client_orders|cost_revisions)/);return {results:[]}; } };
  } };
}
test('portal routes require explicit current-version acceptance and preserve the original audit record', async () => {
  const DB=database(), env={APP_SESSION_SECRET:'test-only'}, cookie=(await createSessionCookie('client-7',env.APP_SESSION_SECRET)).split(';')[0];
  const call=async(path,body,ip='203.0.113.7')=>{
    const r=new Request('https://local.test/api/portal'+path,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json','x-vercel-forwarded-for':ip},...(body?{body:JSON.stringify(body)}:{})});
    return handlePortal(r,new URL(r.url),{DB,env});
  };
  assert.equal((await call('/orders')).status,423);
  assert.equal((await (await call('/me')).json()).termsRequired,true);
  assert.equal((await call('/terms/accept',{version:1,accepted:false})).status,400);
  assert.equal((await call('/terms/accept',{version:0,accepted:true})).status,409);
  assert.equal((await call('/terms/accept',{version:1,accepted:true,clientId:99,ip:'fake'})).status,200);
  const first=DB.records.get('7:1');assert.equal(first.ip,'203.0.113.7');assert.ok(first.accepted_at>0);
  assert.equal(DB.records.has('99:1'),false);
  assert.equal((await call('/orders')).status,200);
  await call('/terms/accept',{version:1,accepted:true},'198.51.100.1');
  assert.deepEqual(DB.records.get('7:1'),first);
  await publishTerms(DB,{version:2,english:'New policy',hebrew:'מדיניות חדשה'});
  assert.equal((await call('/orders')).status,423);
  assert.equal((await call('/terms/accept',{version:1,accepted:true})).status,409);
});
test('publishing terms requires a higher version and both languages', async () => {
  const DB=database();
  await assert.rejects(publishTerms(DB,{version:1,english:'Text',hebrew:'טקסט'}),/higher/);
  await assert.rejects(publishTerms(DB,{version:2,english:'Text',hebrew:''}),/Both policy texts/);
  assert.equal((await publishTerms(DB,{version:2,english:'Text',hebrew:'טקסט'})).version,2);
});
