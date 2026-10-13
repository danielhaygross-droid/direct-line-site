import {createHash} from 'node:crypto';
import {uploadedFile,documentDate} from './files.mjs';
import {storedBytes} from './file-storage.mjs';
export const INVOICE_SCHEMA=[
 'ALTER TABLE portal_files ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES client_payments(id)',
 'CREATE TABLE IF NOT EXISTS invoice_orders(file_id INTEGER NOT NULL REFERENCES portal_files(id),order_id INTEGER NOT NULL REFERENCES client_orders(id),PRIMARY KEY(file_id,order_id))',
];
export async function invoices(DB,clientId) {
 const rows=(await DB.prepare("SELECT f.id,f.client_id,f.filename,f.mime,f.document_date,f.created_at,f.payment_id,COALESCE(array_agg(io.order_id) FILTER(WHERE io.order_id IS NOT NULL),ARRAY[]::integer[]) AS order_ids FROM portal_files f LEFT JOIN invoice_orders io ON io.file_id=f.id WHERE f.kind='invoice' AND NOT f.archived AND f.client_id=? GROUP BY f.id ORDER BY f.document_date DESC,f.id DESC").bind(clientId).all()).results||[];
 return rows.map(r=>({id:Number(r.id),clientId:Number(r.client_id),filename:r.filename,mime:r.mime,date:r.document_date,createdAt:Number(r.created_at),paymentId:r.payment_id==null?null:Number(r.payment_id),orderIds:r.order_ids.map(Number)}));
}
export async function saveInvoice(DB,body) {
 const clientId=Number(body.clientId),paymentId=body.paymentId?Number(body.paymentId):null;
 const orderIds=[...new Set(Array.isArray(body.orderIds)?body.orderIds.map(Number):[])].sort((a,b)=>a-b);
 if(!Number.isSafeInteger(clientId)||clientId<=0||paymentId!==null&&(!Number.isSafeInteger(paymentId)||paymentId<=0)||orderIds.length>100||orderIds.some(n=>!Number.isSafeInteger(n)||n<=0))throw new Error('Choose valid payment and order links.');
 if(!paymentId&&!orderIds.length)throw new Error('Link the invoice to a payment or at least one order.');
 const client=await DB.prepare("SELECT id FROM users WHERE id=? AND role='client' AND NOT archived").bind(clientId).first();if(!client)throw new Error('Unknown client');
 if(paymentId&&!await DB.prepare('SELECT id FROM client_payments WHERE id=? AND client_id=?').bind(paymentId,clientId).first())throw new Error('Choose a payment belonging to this client.');
 if(orderIds.length){const rows=(await DB.prepare(`SELECT id FROM client_orders WHERE client_id=? AND id IN (${orderIds.map(()=>'?').join(',')})`).bind(clientId,...orderIds).all()).results||[];if(rows.length!==orderIds.length)throw new Error('Choose orders belonging to this client.');}
 const date=documentDate(body.date);if(!date)throw new Error('Choose a valid invoice date.');
 const f=uploadedFile(body.file),fingerprint=createHash('sha256').update(f.digest+'|'+date+'|'+paymentId+'|'+orderIds.join(',')).digest('hex');
 const links=orderIds.length?`SELECT file.id,v.id FROM file CROSS JOIN (VALUES ${orderIds.map(id=>'('+id+')').join(',')}) v(id)`:'SELECT id,0 FROM file WHERE FALSE';
 const row=await DB.prepare(`WITH file AS (INSERT INTO portal_files(client_id,kind,filename,mime,content,bytes,document_date,fingerprint,created_at,payment_id) VALUES (?,'invoice',?,?,?,?,?,?,?,?) ON CONFLICT(client_id,kind,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id), links AS (INSERT INTO invoice_orders(file_id,order_id) ${links} ON CONFLICT DO NOTHING) SELECT id FROM file`)
 .bind(clientId,f.filename,f.mime,f.content,f.bytes,date,fingerprint,Math.floor(Date.now()/1000),paymentId).first();
 return (await invoices(DB,clientId)).find(x=>x.id===Number(row.id));
}
// ZIP entries are streamed one file at a time; no public URLs or combined base64 payload.
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(b){let n=0xffffffff;for(const x of b)n=crcTable[(n^x)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
export async function* zipEntries(entries) {
 let offset=0;const central=[];
 for await(const entry of entries){const data=entry.data,name=Buffer.from(entry.name,'utf8'),crc=crc32(data),h=Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(0x21,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(Buffer.concat([c,name]));
  yield h;yield name;yield data;offset+=h.length+name.length+data.length;
 }
 const footer=Buffer.alloc(22),size=central.reduce((n,c)=>n+c.length,0);footer.writeUInt32LE(0x06054b50);footer.writeUInt16LE(central.length,8);footer.writeUInt16LE(central.length,10);footer.writeUInt32LE(size,12);footer.writeUInt32LE(offset,16);
 for(const c of central)yield c;yield footer;
}
export async function monthlyInvoices(DB,clientId,month,env={}) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return new Response('Choose a valid month',{status:400});
 const files=(await invoices(DB,clientId)).filter(f=>f.date.startsWith(month));if(!files.length)return new Response('No invoices for this month',{status:404});
 async function* entries(){for(const f of files){const row=await DB.prepare("SELECT content,blob_path FROM portal_files WHERE id=? AND client_id=? AND kind='invoice' AND NOT archived").bind(f.id,clientId).first();const data=row&&await storedBytes(env,row.content,row.blob_path);if(data)yield{name:f.id+'-'+f.filename,data};}}
 const generator=zipEntries(entries());
 return new Response(new ReadableStream({async pull(controller){try{const {value,done}=await generator.next();if(done)controller.close();else controller.enqueue(value);}catch(e){controller.error(e);}},async cancel(){await generator.return();}}),{headers:{'content-type':'application/zip','content-disposition':`attachment; filename="Direct-Line-invoices-${month}.zip"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
