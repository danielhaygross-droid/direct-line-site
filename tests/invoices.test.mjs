import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32,zipEntries} from '../server/invoices.mjs';
test('streamed ZIP has correct CRC, file bytes and UTF-8 filename metadata',async()=>{
 assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
 async function* files(){yield{name:'invoice-חשבונית.pdf',data:Buffer.from('invoice bytes')};}
 const chunks=[];for await(const b of zipEntries(files()))chunks.push(b);const zip=Buffer.concat(chunks);
 assert.equal(zip.readUInt32LE(0),0x04034b50);assert.equal(zip.readUInt16LE(6),0x800);assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);assert.equal(zip.readUInt16LE(zip.length-14),1);
 const nameSize=zip.readUInt16LE(26);assert.equal(zip.subarray(30,30+nameSize).toString(),'invoice-חשבונית.pdf');assert.equal(zip.subarray(30+nameSize,30+nameSize+13).toString(),'invoice bytes');
});
