import test from 'node:test';
import assert from 'node:assert/strict';
import {statusChange, parseFee} from '../server/order-status.mjs';
test('clients request cancellation at each allowed stage and cannot cancel or fulfil directly',()=>{
 for(const status of ['pending','processing','shipped'])assert.equal(statusChange({status},'request-cancellation',{reason:' reason '},false).previous,status);
 for(const status of ['delivered','cancelled'])assert.throws(()=>statusChange({status},'request-cancellation',{},false));
 for(const status of ['cancelled','processing','shipped'])assert.throws(()=>statusChange({status:'pending'},'status',{status},false));
 assert.equal(statusChange({status:'shipped'},'mark-delivered',{},false).status,'delivered');
});
test('cancellation rejection restores its prior stage and only admins approve valid fees',()=>{
 const order={status:'cancellation_requested',cancellation_previous_status:'shipped',cancellation_reason:'Reason'};
 assert.equal(statusChange(order,'reject-cancellation',{},true).status,'shipped');
 assert.equal(statusChange(order,'approve-cancellation',{fee:''},true).fee,0);
 assert.equal(statusChange(order,'approve-cancellation',{fee:4},true).fee,4);
 for(const fee of [-1,1.001,'oops'])assert.throws(()=>statusChange(order,'approve-cancellation',{fee},true));
 assert.throws(()=>statusChange(order,'approve-cancellation',{fee:4},false));
 // Clients still can't move an order anywhere but delivered (from shipped) or request cancellation.
 assert.throws(()=>statusChange({status:'shipped'},'status',{status:'pending'},false));
 assert.throws(()=>statusChange({status:'pending'},'status',{status:'delivered'},false));
 assert.throws(()=>statusChange({status:'pending'},'status',{status:'cancelled'},false));
});

test('admins can set any order to any status, cancel with an optional fee and reopen a cancelled order',()=>{
 for(const from of ['pending','processing','shipped','delivered','cancelled','cancellation_requested'])
  for(const to of ['pending','processing','shipped','delivered'])
   if(from!==to) assert.equal(statusChange({status:from},'status',{status:to},true).status,to,from+' -> '+to);
 assert.equal(statusChange({status:'delivered'},'status',{status:'delivered'},true),null,'same status is a no-op');
 for(const from of ['pending','processing','shipped','delivered','cancellation_requested']){
  assert.deepEqual(statusChange({status:from},'status',{status:'cancelled'},true),{status:'cancelled',previous:from,reason:undefined,fee:0});
  assert.equal(statusChange({status:from},'status',{status:'cancelled',fee:'4.00',reason:' Customer changed mind '},true).fee,4);
 }
 assert.equal(statusChange({status:'shipped'},'status',{status:'cancelled',reason:' Customer changed mind '},true).reason,'Customer changed mind');
 for(const fee of [-1,1.001,'oops',1e7])assert.throws(()=>statusChange({status:'shipped'},'status',{status:'cancelled',fee},true),/two decimal/);
 assert.throws(()=>statusChange({status:'shipped'},'status',{status:'cancellation_requested'},true),/Unknown status/);
 assert.throws(()=>statusChange({status:'shipped'},'status',{status:'banana'},true),/Unknown status/);
 assert.equal(parseFee(''),0);assert.equal(parseFee(null),0);assert.equal(parseFee('12.5'),12.5);
});
