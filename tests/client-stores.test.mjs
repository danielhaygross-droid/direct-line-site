import test from 'node:test';
import assert from 'node:assert/strict';
import '../dist/p/client-store-math.js';
import {storeInput} from '../server/client-stores.mjs';
const {performance,periodRange}=globalThis.DLClientStoreMath;
test('store sums include missing sales, cancellation fees and refund credits exactly',()=>{
 const stores=[{id:1},{id:2},{id:3}],orders=[{id:1,storeId:1,status:'pending',price:10.1,sellingPrice:25.2,orderDate:'2026-10-12'},{id:2,storeId:1,status:'pending',price:5,sellingPrice:null,orderDate:'2026-10-12'},{id:3,storeId:2,status:'cancelled',price:20,sellingPrice:45,orderDate:'2026-10-12'},{id:4,storeId:3,status:'delivered',price:30,sellingPrice:60,orderDate:'2026-10-12'}];
 const stats=performance(stores,orders,[{orderId:3,amount:4},{orderId:4,amount:-30}]);assert.equal(stats.totals.billed,19.1);assert.equal(stats.totals.customersPaid,85.2);assert.equal(stats.totals.profit,66.1);assert.equal(stats.totals.missingSalePrice,1);assert.equal(stats.totals.orders,3);
 for(const key of ['billed','customersPaid','profit'])assert.equal(Math.round(stats.rows.reduce((n,r)=>n+r[key]*100,0)),Math.round(stats.totals[key]*100));
});
test('periods use calendar ranges including leap years and reject impossible custom dates',()=>{
 const now=new Date(2024,2,15);assert.deepEqual(periodRange('last_month','','',now),{from:'2024-02-01',to:'2024-02-29'});assert.deepEqual(periodRange('30','','',now),{from:'2024-02-15',to:'2024-03-15'});assert.equal(periodRange('custom','2026-02-30','2026-03-02'),null);assert.equal(periodRange('custom','2026-03-02','2026-03-01'),null);
});
test('store names, platform, colour and links are validated',()=>{
 assert.equal(storeInput({name:' Demo ',platform:'Etsy'}).name,'Demo');for(const body of [{name:'',platform:'Etsy'},{name:'Demo',platform:'invalid'},{name:'Demo',platform:'Etsy',color:'red;display:none'},{name:'Demo',platform:'Etsy',link:'javascript:alert(1)'}])assert.throws(()=>storeInput(body));
});

test('store links accept pasted domains while rejecting unsafe schemes and credentials',()=>{
 const input=link=>storeInput({name:'Demo',platform:'Shopify',link}).link;
 assert.equal(input(' www.example.com/shop '),'https://www.example.com/shop');
 assert.equal(input('example.com'),'https://example.com');
 assert.equal(input('https://example.com/path?q=1'),'https://example.com/path?q=1');
 assert.equal(input(''),'');
 for(const link of ['not a link','javascript:alert(1)','https://user:secret@example.com','ftp://example.com'])assert.throws(()=>input(link));
});
