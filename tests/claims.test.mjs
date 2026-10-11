import test from 'node:test';
import assert from 'node:assert/strict';
import {claimEligibility,businessDays,REFUND_SECONDS,LOST_SECONDS} from '../server/claims.mjs';
import {uploadedFile} from '../server/files.mjs';
test('claims use the delivered seven-day boundary and last tracking twenty-day boundary',()=>{
 const at=10000000;assert.equal(claimEligibility({status:'delivered',delivered_at:at-REFUND_SECONDS+1},at).refund,true);assert.equal(claimEligibility({status:'delivered',delivered_at:at-REFUND_SECONDS},at).refund,false);
 assert.equal(claimEligibility({status:'shipped',last_tracking_update_at:at-LOST_SECONDS},at).lost,true);assert.equal(claimEligibility({status:'shipped',last_tracking_update_at:at-LOST_SECONDS+1},at).lost,false);
 assert.equal(claimEligibility({status:'pending'},at).problem,false);
});
test('claim age skips Saturday and Sunday and evidence video is opt-in',()=>{
 const sec=s=>Date.parse(s+'T12:00:00Z')/1000;assert.equal(businessDays(sec('2026-10-09'),sec('2026-10-14')),3);assert.equal(businessDays(sec('2026-10-09'),sec('2026-10-15')),4);
 const mp4=Buffer.alloc(24);mp4.write('ftyp',4);const input={filename:'proof.mp4',data:'data:video/mp4;base64,'+mp4.toString('base64')};assert.throws(()=>uploadedFile(input));assert.equal(uploadedFile(input,true).mime,'video/mp4');
});
