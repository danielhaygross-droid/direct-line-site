import assert from 'node:assert/strict';
import {pg,DB,call,seed} from './lib.mjs';
try {
 const {admin,client,id}=await seed();
 const make=async()=>{const r=await call('/orders','POST',{clientId:id,orderRef:'STATUS-DEMO',buyerName:'Demo',address1:'1 Sample St',city:'Sample City',postalCode:'00123',destination:'IL'},admin);assert.equal(r.status,200);return r.data.order.id;};
 const oid=await make(),url='/orders/'+oid;
 assert.equal((await call(url,'PUT',{status:'cancelled'},client)).status,403);
 assert.equal((await call(url,'PUT',{status:'processing'},client)).status,403);
 assert.equal((await call(url,'PUT',{status:'pending'},admin)).status,200); // same state is an idempotent no-op
 assert.equal((await call(url+'/mark-delivered','POST',{},client)).status,403);
 let r=await call(url+'/request-cancellation','POST',{reason:'Customer changed their mind'},client);assert.equal(r.status,200);assert.equal(r.data.order.status,'cancellation_requested');assert.equal(r.data.order.editLocked,false);
 assert.equal((await call(url+'/approve-cancellation','POST',{fee:4},client)).status,403);
 assert.equal((await call(url+'/reject-cancellation','POST',{},admin)).status,200);
 assert.equal((await call(url,'PUT',{city:'New City'},client)).status,200);
 assert.equal((await call(url,'PUT',{status:'processing'},admin)).status,200);
 assert.equal((await call(url,'PUT',{status:'pending'},admin)).status,200,'admins can move an order back');assert.equal((await call(url,'PUT',{status:'processing'},admin)).status,200);
 assert.equal((await call(url+'/request-cancellation','POST',{reason:'Please cancel'},client)).status,200);
 assert.equal((await call('/admin/notifications','GET',null,admin)).status,200);
 assert.equal((await call(url+'/reject-cancellation','POST',{},admin)).data.order.status,'processing');
 assert.equal((await call(url,'PUT',{status:'shipped'},admin)).status,200);
 assert.equal((await call(url+'/request-cancellation','POST',{},client)).status,200);
 assert.ok([400,409].includes((await call(url+'/approve-cancellation','POST',{fee:-4},admin)).status),'a negative fee is refused');
 const results=await Promise.all(Array.from({length:8},()=>call(url+'/approve-cancellation','POST',{fee:4},admin)));
 assert.ok(results.some(r=>r.status===200));assert.ok(results.every(r=>[200,409].includes(r.status)));
 assert.equal(Number((await DB.prepare("SELECT COUNT(*) AS n FROM client_balance_adjustments WHERE order_id=?").bind(oid).first()).n),1);
 const me=await call('/me','GET',null,client);assert.equal(me.data.summary.outstanding,4);
 assert.equal((await call('/payments','GET',null,client)).data.adjustments[0].amount,4);
 assert.equal((await call(url,'PUT',{status:'shipped'},admin)).status,200,'admins can reopen a cancelled order');
 const oid2=await make();await call('/orders/'+oid2,'PUT',{status:'shipped'},admin);
 const delivered=await call('/orders/'+oid2+'/mark-delivered','POST',{},client);assert.equal(delivered.status,200);assert.ok(delivered.data.order.deliveredAt);
 assert.equal((await call('/orders/'+oid2+'/mark-delivered','POST',{},client)).data.order.deliveredAt,delivered.data.order.deliveredAt);
 assert.equal((await call('/orders/'+oid2+'/request-cancellation','POST',{},client)).status,409);
 const events=(await call(url+'/messages','GET',null,client)).data.events;assert.ok(events.some(e=>e.kind==='status'&&e.detail==='cancelled'&&e.actor==='admin'));assert.ok(events.some(e=>e.kind==='status'&&e.detail==='cancellation_requested'&&e.actor==='client'));
 console.log('PASS permissions, all cancellation stages, prior-status rejection, edit lock, concurrent approval fee once, separate balance line, delivered date/idempotence and audit');
}finally{await pg.close();}
