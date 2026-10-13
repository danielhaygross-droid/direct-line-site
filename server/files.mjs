import { createHash } from 'node:crypto';
import { storedBytes } from './file-storage.mjs';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const FILE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS portal_files (
    id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
    filename TEXT NOT NULL, mime TEXT NOT NULL, content TEXT NOT NULL, bytes INTEGER NOT NULL,
    amount DOUBLE PRECISION, document_date TEXT NOT NULL, fingerprint TEXT NOT NULL,
    created_at INTEGER NOT NULL, archived BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(client_id,kind,fingerprint))`,
  'ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS confirmation_id INTEGER REFERENCES portal_files(id)',
  'ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE',
  'CREATE UNIQUE INDEX IF NOT EXISTS client_payments_confirmation_unique ON client_payments(confirmation_id)',
];
export function documentDate(value) {
  const s=String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T12:00:00Z')) && new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s ? s : null;
}
export function uploadedFile(input, allowVideo=false) {
  if (typeof input?.data !== 'string' || input.data.length > MAX_FILE_BYTES * 1.4 + 100) throw new Error('The file is too large. Maximum 2 MB.');
  const match=/^data:[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/.exec(input.data);
  if (!match) throw new Error('Choose a PDF, JPG, PNG or WebP file.');
  const bytes=Buffer.from(match[1],'base64');
  if (!bytes.length || bytes.length>MAX_FILE_BYTES || bytes.toString('base64')!==match[1]) throw new Error('The file is empty, invalid or too large.');
  let mime, ext;
  if (bytes.length>=33 && bytes.subarray(12,16).toString()==='IHDR' && bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0 && bytes.readUInt32BE(16)<=16000 && bytes.readUInt32BE(20)<=16000 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {mime='image/png';ext='png';}
  else if (bytes.length>=12 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255 && bytes[bytes.length-2]===255 && bytes[bytes.length-1]===217) {mime='image/jpeg';ext='jpg';}
  else if (bytes.subarray(0,4).toString()==='RIFF' && bytes.length>=20 && bytes.readUInt32LE(4)===bytes.length-8 && bytes.subarray(8,12).toString()==='WEBP') {mime='image/webp';ext='webp';}
  else if(allowVideo && bytes.length>=16 && bytes.subarray(4,8).toString()==='ftyp'){mime='video/mp4';ext='mp4';}
  else if(allowVideo && bytes.length>=16 && bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]))){mime='video/webm';ext='webm';}
  else if (bytes.subarray(0,5).toString()==='%PDF-' && bytes.subarray(-1024).toString().includes('%%EOF') && bytes.subarray(-1024).toString().includes('startxref')) {mime='application/pdf';ext='pdf';}
  else throw new Error('Choose a PDF, JPG, PNG or WebP file.');
  const name=String(input.filename || 'transfer-confirmation').split(/[\\/]/).pop().replace(/\.[^.]*$/,'').replace(/[^\p{L}\p{N} ._-]/gu,'_').replace(/^\.+|[. ]+$/g,'').slice(0,100) || 'transfer-confirmation';
  return { mime, filename: name+'.'+ext, content: bytes.toString('base64'), bytes: bytes.length, digest:createHash('sha256').update(bytes).digest('hex') };
}
export function transferInput(body) {
  const amount=Number(body?.amount), date=documentDate(body?.date);
  if (!Number.isFinite(amount) || amount<=0 || amount>=1e7 || Math.abs(amount*100-Math.round(amount*100))>1e-7) throw new Error('Enter a positive amount with up to two decimal places.');
  if (!date) throw new Error('Choose a valid transfer date.');
  return { ...uploadedFile(body?.file), amount:Math.round(amount*100)/100, date };
}
const fileOut = r => ({ id:Number(r.id), clientId:Number(r.client_id), filename:r.filename, mime:r.mime, amount:Number(r.amount), date:r.document_date,
  createdAt:Number(r.created_at), paymentId:r.payment_id==null?null:Number(r.payment_id), status:r.payment_id ? r.payment_archived?'archived':'recorded':'pending' });
export async function transfers(DB, clientId) {
  const rows=(await DB.prepare("SELECT f.id,f.client_id,f.filename,f.mime,f.amount,f.document_date,f.created_at,p.id AS payment_id,p.archived AS payment_archived FROM portal_files f LEFT JOIN client_payments p ON p.confirmation_id=f.id WHERE f.client_id=? AND f.kind='confirmation' AND NOT f.archived ORDER BY f.created_at DESC,f.id DESC").bind(clientId).all()).results || [];
  return rows.map(fileOut);
}
export async function saveTransfer(DB, clientId, body) {
  const f=transferInput(body), fingerprint=createHash('sha256').update(f.digest+'|'+f.amount+'|'+f.date).digest('hex');
  const row=await DB.prepare("INSERT INTO portal_files(client_id,kind,filename,mime,content,bytes,amount,document_date,fingerprint,created_at) VALUES (?,'confirmation',?,?,?,?,?,?,?,?) ON CONFLICT(client_id,kind,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id")
    .bind(clientId,f.filename,f.mime,f.content,f.bytes,f.amount,f.date,fingerprint,Math.floor(Date.now()/1000)).first();
  return (await transfers(DB,clientId)).find(x=>x.id===Number(row.id));
}
export async function recordTransfer(DB, id) {
  const f=await DB.prepare("SELECT * FROM portal_files WHERE id=? AND kind='confirmation' AND NOT archived").bind(id).first();
  if (!f) return null;
  const client=await DB.prepare("SELECT id FROM users WHERE id=? AND role='client' AND NOT archived").bind(f.client_id).first();
  if (!client) return null;
  // The unique confirmation_id constraint makes concurrent requests credit once.
  await DB.prepare("INSERT INTO client_payments(client_id,amount,method,note,paid_at,created_at,confirmation_id) VALUES (?,?,'Bank transfer',?,?,?,?) ON CONFLICT(confirmation_id) DO NOTHING")
    .bind(f.client_id,f.amount,'Transfer confirmation #'+id,Math.floor(Date.parse(f.document_date+'T12:00:00Z')/1000),Math.floor(Date.now()/1000),id).run();
  return (await transfers(DB,f.client_id)).find(x=>x.id===Number(id));
}
export async function downloadFile(DB, id, who, url, env={}) {
  const row=await DB.prepare('SELECT * FROM portal_files WHERE id=? AND NOT archived').bind(id).first();
  if (!row || !who.admin && Number(row.client_id)!==Number(who.clientId)) return new Response('Not found',{status:404});
  const bytes=await storedBytes(env,row.content,row.blob_path);
  if (!bytes) return new Response('Not found',{status:404});
  const inline=url.searchParams.get('inline')==='1' && row.mime.startsWith('image/');
  return new Response(bytes,{headers:{'content-type':row.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; sandbox",'content-disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(row.filename)}`}});
}
