import assert from 'node:assert/strict';
import {pg,DB,call,seed} from './lib.mjs';
try {
 const {admin,client,id}=await seed();
 const valid={clientId:id,orderRef:'ADDRESS-1',buyerName:'Jane SAMPLE',address1:'12 Main Street',address2:'Apt 5',city:'Sample City',region:'CA',postalCode:'00123',destination:'US',buyerPhone:'+1 555 0100',etsyUrl:'https://example.com/item'};
 for(const field of ['buyerName','address1','destination']){
  assert.equal((await call('/orders','POST',{...valid,[field]:'   '},admin)).status,400,field);
 }
 const created=await call('/orders','POST',valid,admin);assert.equal(created.status,200);const oid=created.data.order.id;
 for(const key of ['buyerName','address1','address2','city','region','postalCode','destination','buyerPhone'])assert.equal(created.data.order[key],valid[key]);
 for(const field of ['buyerName','address1','destination'])assert.equal((await call('/orders/'+oid,'PUT',{[field]:''},client)).status,400,field);
 assert.equal((await call('/orders/'+oid,'PUT',{city:'Updated City',address2:'',region:'',buyerPhone:''},client)).status,200);
 await DB.prepare("UPDATE client_orders SET address_line_1=?,city='',postal_code='' WHERE id=?").bind('Legacy street\nLegacy city\nPhone',oid).run();
 assert.equal((await call('/orders/'+oid,'PUT',{status:'processing'},admin)).status,200);
 const legacy=(await call('/orders','GET',null,client)).data.orders.find(o=>o.id===oid);assert.equal(legacy.address1,'Legacy street\nLegacy city\nPhone');
 assert.equal((await call('/orders/'+oid,'PUT',{shippingFee:10},admin)).status,200);
 console.log('PASS required address fields, separate values, optional blanks, client edits, legacy preservation and partial admin updates');
} finally {await pg.close();}
