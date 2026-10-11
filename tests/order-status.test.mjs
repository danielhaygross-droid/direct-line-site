import test from 'node:test';
import assert from 'node:assert/strict';
import {statusChange} from '../server/order-status.mjs';
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
 assert.throws(()=>statusChange({status:'shipped'},'status',{status:'pending'},true));
});
