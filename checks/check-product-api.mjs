import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pg,DB,call,seed} from './lib.mjs';
try{
 const {admin,client,id}=await seed();const png=await readFile(new URL('./fixtures/en-1440-light-agreement.png',import.meta.url));const photo={filename:'product.png',data:'data:image/png;base64,'+png.toString('base64')};
 const added=await call('/products','POST',{name:'Sample Product',link:'https://example.com/item',variant:'Gold',photos:[photo],expectedQuantity:20},client);assert.equal(added.status,200);const pid=added.data.product.id;assert.equal(added.data.product.status,'awaiting_quote');assert.equal(added.data.product.photoIds.length,1);
 const body={productId:pid,quotedUnitPrice:12.5,orderRef:'PRODUCT-1',buyerName:'Demo',address1:'12 Main St',city:'Sample City',postalCode:'00123',destination:'IL',quantity:3};
 assert.equal((await call('/orders','POST',body,client)).status,400);
 assert.equal((await call('/admin/products/'+pid,'POST',{status:'approved',unitPrice:12.5},client)).status,403);
 assert.equal((await call('/admin/products/'+pid,'POST',{status:'approved',unitPrice:12.5},admin)).status,200);
 const created=await call('/orders','POST',body,client);assert.equal(created.status,200);const o=created.data.order;assert.equal(o.price,37.5);assert.equal(o.quotedUnitPrice,12.5);assert.equal(o.priced,true);assert.equal(o.photos.length,1);assert.equal(o.etsyUrl,'https://example.com/item');assert.equal(o.productCost,undefined);assert.equal(o.shippingFee,undefined);
 await call('/admin/products/'+pid,'POST',{status:'approved',unitPrice:20},admin);
 assert.equal((await call('/orders','POST',body,client)).status,409);
 assert.equal((await call('/orders/'+o.id,'PUT',{quantity:4},client)).data.order.price,50);
 assert.equal((await call('/orders/'+o.id,'PUT',{productCost:500,shippingFee:500},admin)).data.order.price,50);
 assert.equal((await call('/orders','POST',{...body,quotedUnitPrice:20},client)).data.order.price,60);
 assert.equal((await call('/admin/products/'+pid,'POST',{status:'not_available',note:''},admin)).status,400);
 assert.equal((await call('/admin/products/'+pid,'POST',{status:'not_available',note:'Supplier stopped selling it'},admin)).status,200);
 assert.equal((await call('/orders','POST',{...body,quotedUnitPrice:20},client)).status,400);
 assert.ok((await call('/notifications','GET',null,client)).data.items.some(n=>n.kind==='product'));
 assert.ok((await call('/admin/notifications','GET',null,admin)).data.items.some(n=>n.kind==='product'));
 console.log('PASS product submission/photos, quote permissions, fixed price snapshots, quantity edits, no fee breakdown, stale quote rejection, unavailable rules and notifications');
}finally{await pg.close();}
