import {uploadedFile} from './files.mjs';
export const CLAIM_SCHEMA=[
 'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS last_tracking_update_at INTEGER',
 'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS reshipment_of INTEGER REFERENCES client_orders(id)',
 'CREATE UNIQUE INDEX IF NOT EXISTS client_orders_reshipment_unique ON client_orders(reshipment_of)',
 "UPDATE client_orders o SET last_tracking_update_at=COALESCE((SELECT MAX(created_at) FROM order_events e WHERE e.order_id=o.id AND (e.kind='tracking' OR e.kind='status' AND e.detail='shipped')),o.updated_at) WHERE o.status='shipped' AND o.last_tracking_update_at IS NULL",
 `CREATE TABLE IF NOT EXISTS portal_claims(id SERIAL PRIMARY KEY,order_id INTEGER NOT NULL UNIQUE REFERENCES client_orders(id),client_id INTEGER NOT NULL REFERENCES users(id),problem TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',resolution TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',refund_amount DOUBLE PRECISION NOT NULL,reply TEXT NOT NULL DEFAULT '',reshipment_order_id INTEGER REFERENCES client_orders(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`,
 'ALTER TABLE portal_files ADD COLUMN IF NOT EXISTS claim_id INTEGER REFERENCES portal_claims(id)',
];
export const REFUND_SECONDS=7*86400,LOST_SECONDS=20*86400;
export function claimEligibility(order,at=Math.floor(Date.now()/1000)){
 const delivered=Number(order.delivered_at||0),tracking=Number(order.last_tracking_update_at||order.updated_at||0);
 return {problem:order.status==='delivered'&&delivered>0,refund:order.status==='delivered'&&delivered>0&&at<delivered+REFUND_SECONDS,daysLeft:Math.max(0,Math.ceil((delivered+REFUND_SECONDS-at)/86400)),lost:order.status==='shipped'&&tracking>0&&at>=tracking+LOST_SECONDS};
}
export function businessDays(created,at=Math.floor(Date.now()/1000)){
 const start=new Date(created*1000),end=new Date(at*1000);let n=0,d=Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate())+86400000,last=Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate());
 for(;d<=last;d+=86400000){const day=new Date(d).getUTCDay();if(day!==0&&day!==6)n++;}return n;
}
export async function claims(DB,clientId=null){const rows=(await DB.prepare(`SELECT c.*,o.order_ref,u.display_name AS client_name,COALESCE(array_agg(f.id) FILTER(WHERE f.id IS NOT NULL),ARRAY[]::integer[]) AS file_ids FROM portal_claims c JOIN client_orders o ON o.id=c.order_id JOIN users u ON u.id=c.client_id LEFT JOIN portal_files f ON f.claim_id=c.id AND NOT f.archived WHERE ${clientId===null?'NOT u.archived':'c.client_id=?'} GROUP BY c.id,o.order_ref,u.display_name ORDER BY c.created_at,c.id`).bind(...(clientId===null?[]:[clientId])).all()).results||[];
 return rows.map(r=>({id:Number(r.id),clientId:Number(r.client_id),clientName:r.client_name,orderId:Number(r.order_id),orderRef:r.order_ref,problem:r.problem,description:r.description,resolution:r.resolution,status:r.status,refundAmount:Number(r.refund_amount),reply:r.reply,fileIds:r.file_ids.map(Number),reshipmentOrderId:r.reshipment_order_id==null?null:Number(r.reshipment_order_id),createdAt:Number(r.created_at),updatedAt:Number(r.updated_at),businessDays:businessDays(Number(r.created_at)),overdue:r.status==='open'&&businessDays(Number(r.created_at))>3}));}
export async function submitClaim(DB,order,body){
 const e=claimEligibility(order),lost=body.problem==='lost';
 if(lost?!e.lost:!e.problem)throw new Error(lost?'Lost parcels can be reported after 20 days without a tracking update.':'Problem reports are available after delivery.');
 if(!['refund','reshipment'].includes(body.resolution))throw new Error('Choose Refund or Reshipment.');
 if(body.resolution==='refund'&&!lost&&!e.refund)throw new Error('Refunds are available within 7 days of delivery.');
 if(!lost&&!['damaged','defective','missing_parts','wrong_item'].includes(body.problem))throw new Error('Choose a problem type.');
 const description=String(body.description||'').trim().slice(0,2000);if(!lost&&!description)throw new Error('Describe the problem.');
 let files=[];
 if(!lost){const proof=uploadedFile(body.proof,true),label=uploadedFile(body.label);if(!proof.mime.startsWith('image/')&&!proof.mime.startsWith('video/'))throw new Error('Add a photo or video of the problem.');if(!label.mime.startsWith('image/'))throw new Error('Add a photo of the shipping label.');files=[{...proof,fingerprint:'problem'},{...label,fingerprint:'label'}];if(files.reduce((n,f)=>n+f.bytes,0)>3*1024*1024)throw new Error('Claim files must total 3 MB or less.');}
 const t=Math.floor(Date.now()/1000);
 const r=await DB.prepare(`WITH claim AS (INSERT INTO portal_claims(order_id,client_id,problem,description,resolution,refund_amount,created_at,updated_at) SELECT id,client_id,?,?,?,price,?,? FROM client_orders WHERE id=? AND status=? AND (? OR COALESCE(delivered_at,0)=?) AND (NOT ? OR COALESCE(last_tracking_update_at,updated_at)<=?) ON CONFLICT(order_id) DO NOTHING RETURNING *),files AS (INSERT INTO portal_files(client_id,kind,filename,mime,content,bytes,document_date,fingerprint,created_at,claim_id) SELECT claim.client_id,'claim',f.filename,f.mime,f.content,f.bytes,?,'claim-'||claim.id||'-'||f.fingerprint,?,claim.id FROM claim CROSS JOIN jsonb_to_recordset(?::jsonb) f(filename text,mime text,content text,bytes integer,fingerprint text)),event AS (INSERT INTO order_events(order_id,client_id,kind,actor,detail,created_at) SELECT order_id,client_id,'claim','client',problem,? FROM claim) SELECT id FROM claim`).bind(body.problem,description,body.resolution,t,t,order.id,order.status,lost,Number(order.delivered_at||0),lost,t-LOST_SECONDS,new Date(t*1000).toISOString().slice(0,10),t,JSON.stringify(files),t).first();
 // Each evidence file has its own distinct fingerprint. A single claim is permitted per order.
 if(!r)throw new Error('This order already has a claim, or its status changed.');return(await claims(DB,order.client_id)).find(c=>c.id===Number(r.id));
}
export async function decideClaim(DB,id,body){
 const action=body.status;if(!['approved','rejected','resolved'].includes(action))throw new Error('Choose Approved, Rejected or Resolved.');
 const t=Math.floor(Date.now()/1000),reply=String(body.reply||'').trim().slice(0,2000),required=action==='resolved'?'approved':'open';
 const row=await DB.prepare(`WITH eligible AS (SELECT * FROM portal_claims WHERE id=? AND status=? FOR UPDATE),
 reship AS (INSERT INTO client_orders(client_id,order_ref,destination,category,weight_kg,price,commission,supplier_share,notes,status,created_at,updated_at,order_date,currency,buyer_name,buyer_phone,address_line_1,address_line_2,city,region,postal_code,item_title,sku,variant,quantity,etsy_url,source,quoted_unit_price,reshipment_of,product_id)
 SELECT o.client_id,o.order_ref||' / reshipment',o.destination,o.category,o.weight_kg,0,0,0,'Reshipment for order #'||o.id,'pending',?,?,?,o.currency,o.buyer_name,o.buyer_phone,o.address_line_1,o.address_line_2,o.city,o.region,o.postal_code,o.item_title,o.sku,o.variant,o.quantity,o.etsy_url,'reshipment',0,o.id,o.product_id FROM eligible c JOIN client_orders o ON o.id=c.order_id WHERE ?='approved' AND c.resolution='reshipment' ON CONFLICT(reshipment_of) DO NOTHING RETURNING id,reshipment_of),
 changed AS (UPDATE portal_claims c SET status=?,reply=?,updated_at=?,reshipment_order_id=COALESCE((SELECT id FROM reship),c.reshipment_order_id) FROM eligible e WHERE c.id=e.id RETURNING c.*),
 credit AS (INSERT INTO client_balance_adjustments(client_id,order_id,kind,amount,note,created_at) SELECT client_id,order_id,'claim_refund',-refund_amount,'Claim refund',? FROM changed WHERE status='approved' AND resolution='refund' ON CONFLICT(order_id,kind) DO NOTHING),
 photos AS (INSERT INTO order_photos(order_id,client_id,mime,data,thumb_mime,thumb,width,height,bytes,added_by,created_at) SELECT r.id,p.client_id,p.mime,p.data,p.thumb_mime,p.thumb,p.width,p.height,p.bytes,'admin',? FROM reship r JOIN order_photos p ON p.order_id=r.reshipment_of),
 event AS (INSERT INTO order_events(order_id,client_id,kind,actor,detail,created_at) SELECT order_id,client_id,'claim','admin',?,? FROM changed),
 reship_event AS (INSERT INTO order_events(order_id,client_id,kind,actor,detail,created_at) SELECT r.id,c.client_id,'created','admin','Reshipment',? FROM reship r JOIN changed c ON c.order_id=r.reshipment_of)
 SELECT * FROM changed`).bind(id,required,t,t,new Date(t*1000).toISOString().slice(0,10),action,action,reply,t,t,t,action,t,t).first();
 if(!row)throw new Error('The claim was already decided or its status changed.');return(await claims(DB,row.client_id)).find(c=>c.id===Number(id));
}
