import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadedFile, transferInput, documentDate, MAX_FILE_BYTES } from '../server/files.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
const file={filename:'receipt.png',data:'data:image/png;base64,'+png};
test('confirmation files use detected types, safe extensions and reject unsupported content',()=>{
  assert.equal(uploadedFile(file).mime,'image/png');
  const pdf=Buffer.from('%PDF-1.4\nstartxref\n0\n%%EOF');
  const result=uploadedFile({filename:'../../receipt.html',data:'data:text/html;base64,'+pdf.toString('base64')});
  assert.equal(result.filename,'receipt.pdf');assert.equal(result.mime,'application/pdf');
  assert.throws(()=>uploadedFile({data:'data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64')}),/Choose a PDF/);
});
test('confirmation upload size and transfer amount/date are validated before saving',()=>{
  assert.throws(()=>uploadedFile({data:'data:image/png;base64,'+Buffer.alloc(MAX_FILE_BYTES+1).toString('base64')}),/large/);
  assert.throws(()=>transferInput({amount:12.345,date:'2026-10-12',file}),/two decimal/);
  assert.throws(()=>transferInput({amount:0,date:'2026-10-12',file}),/positive/);
  assert.throws(()=>transferInput({amount:12,date:'2026-02-29',file}),/valid transfer date/);
  assert.equal(documentDate('2024-02-29'),'2024-02-29');
  assert.equal(transferInput({amount:12.50,date:'2026-10-12',file}).amount,12.5);
});
