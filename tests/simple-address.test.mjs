import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {addressError} from '../server/portal.mjs';
const ctx={window:{DL:{}}};runInNewContext(readFileSync(new URL('../dist/p/order-ui.js',import.meta.url),'utf8'),ctx);
const {addressText,addressFields}=ctx.window.DLOrderUI;
test('combined address editing preserves structured history until the address is changed',()=>{
 const old={address1:'12 Main St',address2:'Apt 5',city:'Sample City',region:'CA',postalCode:'00123',buyerPhone:'+1 555 0100'};
 const text=addressText(old);assert.equal(text,'12 Main St\nApt 5\nSample City\nCA\n00123\n+1 555 0100');
 assert.deepEqual(JSON.parse(JSON.stringify(addressFields(text,old))),old);
 const changed=addressFields(text+' ext 2',old);assert.equal(changed.address1,text+' ext 2');
 for(const key of ['address2','city','region','postalCode','buyerPhone'])assert.equal(changed[key],'');
 assert.equal(addressText(changed),text+' ext 2');
});
test('simple address requires recipient, address and country without separate city or ZIP',()=>{
 const a={buyerName:'Customer',address1:'12 Main St\nSample City 00123\nPhone 555',destination:'US'};
 assert.equal(addressError(a),null);
 for(const field of ['buyerName','address1','destination'])assert.ok(addressError({...a,[field]:''}));
 assert.ok(addressError({...a,destination:'__other'}));
});
