import test from 'node:test';
import assert from 'node:assert/strict';
import {productInput,quoteInput} from '../server/products.mjs';
test('product quotes validate money and unavailable explanations',()=>{
 assert.equal(quoteInput({status:'approved',unitPrice:12.5}).price,12.5);
 assert.equal(quoteInput({status:'approved',unitPrice:0}).price,0);
 for(const unitPrice of ['',null,-1,1.001,'oops'])assert.throws(()=>quoteInput({status:'approved',unitPrice}));
 assert.throws(()=>quoteInput({status:'not_available',note:''}));
 assert.equal(quoteInput({status:'not_available',note:'Supplier unavailable'}).price,null);
});
test('product input rejects unsafe links and missing photos',()=>{
 assert.throws(()=>productInput({link:'javascript:alert(1)'}));
 assert.throws(()=>productInput({link:'https://user:password@example.com'}));
 assert.throws(()=>productInput({link:'https://example.com',photos:[]}));
});
