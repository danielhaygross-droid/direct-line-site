import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pg,DB,call,seed} from './lib.mjs';
import {clientPerformance,STORE_SCHEMA} from '../server/client-stores.mjs';
try{
 const {admin,client,id}=await seed();let stores=(await call('/client-stores','GET',null,client)).data.stores;assert.equal(stores.length,1);const alpha=stores[0].id;assert.equal(stores[0].name,'My store');
 await call('/client-stores/'+alpha,'POST',{name:'Alpha',platform:'Etsy',color:'#112233'},client);
 const beta=(await call('/client-stores','POST',{name:'Beta',platform:'Shopify',color:'#445566'},client)).data.store.id;
 const gamma=(await call('/client-stores','POST',{name:'Gamma',platform:'Amazon',color:'#778899'},client)).data.store.id;
 assert.equal((await call('/orders','POST',{clientId:id,destination:'IL',buyerName:'Demo',address1:'1 St',city:'City',postalCode:'00123'},admin)).status,400);
 const make=async(storeId,ref,price,sellingPrice)=>{const r=await call('/orders','POST',{clientId:id,storeId,orderRef:ref,orderDate:'2026-10-12',buyerName:'Demo',address1:'12 Main St',city:'Sample City',postalCode:'00123',destination:'IL',productCost:price,sellingPrice,etsyFee:sellingPrice==null?undefined:0},admin);assert.equal(r.status,200);return r.data.order.id;};
 const a=await make(alpha,'A',10,25),a2=await make(alpha,'A2',5,null),b=await make(beta,'B',20,45),g=await make(gamma,'G',30,60);
 await call('/orders/'+b+'/request-cancellation','POST',{},client);await call('/orders/'+b+'/approve-cancellation','POST',{fee:4},admin);
 const bytes=await readFile(new URL('./fixtures/en-1440-light-agreement.png',import.meta.url)),file={filename:'proof.png',data:'data:image/png;base64,'+bytes.toString('base64')};await call('/orders/'+g,'PUT',{status:'delivered'},admin);const claim=(await call('/orders/'+g+'/claims','POST',{problem:'damaged',description:'Broken',resolution:'refund',proof:file,label:file},client)).data.claim;await call('/admin/claims/'+claim.id,'POST',{status:'approved'},admin);
 const perf=await clientPerformance(DB,id);assert.deepEqual(perf.totals,{orders:3,customersPaid:85,earned:85,billed:19,profit:71,missingSalePrice:1,otherCurrency:0,active:2});
 assert.equal(perf.rows.find(s=>s.id===alpha).billed,15);assert.equal(perf.rows.find(s=>s.id===beta).billed,4);assert.equal(perf.rows.find(s=>s.id===gamma).billed,0);
 const summary=(await call('/me','GET',null,client)).data.summary;assert.equal(summary.billed,perf.totals.billed);assert.equal(summary.clientProfit,perf.totals.profit);
 const other=(await call('/admin/users','POST',{username:'store-other',name:'Other client',password:'otherpass123'},admin)).data.id;const otherStore=(await call('/admin/client-stores?clientId='+other,'GET',null,admin)).data.stores[0].id;
 assert.equal((await call('/orders/'+a,'PUT',{storeId:otherStore},admin)).status,400);assert.equal((await call('/client-stores/'+otherStore,'POST',{name:'Hacked'},client)).status,404);
 assert.equal((await call('/orders/'+a,'PUT',{storeId:gamma},admin)).status,200);assert.equal((await call('/orders','GET',null,client)).data.orders.find(o=>o.id===a).storeId,gamma);
 await call('/client-stores/'+beta,'POST',{archived:true},client);assert.equal((await call('/client-stores','GET',null,client)).data.stores.length,3);assert.equal((await call('/orders','GET',null,client)).data.orders.find(o=>o.id===b).storeId,beta);assert.equal((await call('/orders','POST',{clientId:id,storeId:beta,destination:'IL',buyerName:'Demo',address1:'1 St',city:'City',postalCode:'00123'},admin)).status,400);
 await call('/client-stores/'+beta,'POST',{archived:false},client);assert.equal((await call('/client-stores','GET',null,client)).data.stores.find(s=>s.id===beta).archived,false);
 assert.equal((await call('/admin/client-stores','POST',{clientId:id,name:'Admin Store',platform:'eBay'},admin)).status,200);
 assert.equal(Number((await DB.prepare('SELECT COUNT(*) AS n FROM client_orders WHERE store_id IS NULL').first()).n),0);
 console.log('PASS default store, required selection, three-store exact totals including missing sales/fees/refunds, client summary equality, ownership, admin moves, archive/history/restore and admin store creation');
}finally{await pg.close();}
