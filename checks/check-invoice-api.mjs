import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pg,DB,env,call,seed} from './lib.mjs';
import {handlePortal} from '../server/portal.mjs';
try {
 const {admin,client,id}=await seed();
 const created=await call('/orders','POST',{clientId:id,orderRef:'INVOICE-DEMO',buyerName:'Demo',address1:'12 Main St',city:'Sample City',postalCode:'00123',destination:'IL'},admin);const oid=created.data.order.id;
 const payment=(await call('/admin/payments','POST',{clientId:id,amount:50,paidAt:'2026-10-12'},admin)).data.id;
 const png=await readFile(new URL('./fixtures/en-1440-light-agreement.png',import.meta.url));const file={filename:'supplier-invoice.png',data:'data:image/png;base64,'+png.toString('base64')};
 const body={clientId:id,paymentId:payment,orderIds:[oid],date:'2026-10-12',file};
 assert.equal((await call('/admin/invoices','POST',body,client)).status,403);
 assert.equal((await call('/admin/invoices','POST',{...body,orderIds:[],paymentId:null},admin)).status,400);
 const another=(await call('/admin/users','POST',{username:'another',name:'Another client',password:'anotherpass123'},admin)).data.id;
 assert.equal((await call('/admin/invoices','POST',{...body,clientId:another},admin)).status,400);
 const saved=await call('/admin/invoices','POST',body,admin);assert.equal(saved.status,200);const invoice=saved.data.invoice;
 assert.deepEqual(invoice.orderIds,[oid]);assert.equal(invoice.paymentId,payment);
 assert.equal((await call('/admin/invoices','POST',body,admin)).data.invoice.id,invoice.id);
 assert.equal((await call('/payments','GET',null,client)).data.invoices.length,1);
 const notes=(await call('/notifications','GET',null,client)).data.items;assert.equal(notes.filter(n=>n.kind==='invoice').length,1);
 await call('/admin/payments/'+payment+'/delete','POST',{},admin);assert.equal((await call('/payments','GET',null,client)).data.invoices.length,1);
 const body2={...body,paymentId:null,date:'2026-10-13'};assert.equal((await call('/admin/invoices','POST',body2,admin)).status,200);
 await call('/admin/invoices','POST',{...body2,date:'2026-11-01'},admin);
 async function raw(path,cookie){const url=new URL('http://localhost/api/portal'+path);return handlePortal(new Request(url,{headers:{cookie}}),url,{DB,env,waitUntil:p=>p.catch(()=>{})});}
 const download=await raw('/files/'+invoice.id,client);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),png);
 const otherLogin=await call('/login','POST',{username:'another',password:'anotherpass123'});const terms=(await call('/terms','GET',null,otherLogin.cookie)).data.policy;await call('/terms/accept','POST',{version:terms.version,accepted:true},otherLogin.cookie);
 assert.equal((await raw('/files/'+invoice.id,otherLogin.cookie)).status,404);
 assert.equal((await raw('/invoices/month?month=2026-13',client)).status,400);assert.equal((await raw('/invoices/month?month=2026-09',client)).status,404);
 const zip=await raw('/invoices/month?month=2026-10',client);assert.equal(zip.status,200);await writeFile(new URL('./invoice-test.zip',import.meta.url),Buffer.from(await zip.arrayBuffer()));
 console.log('PASS invoice link ownership, admin-only upload, idempotence, notification, archive preservation, protected exact download and month selection/stream');
}finally{await pg.close();}
