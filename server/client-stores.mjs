import '../dist/p/client-store-math.js';
export const STORE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS client_stores(id SERIAL PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,platform TEXT NOT NULL,link TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '#8b6e37',archived BOOLEAN NOT NULL DEFAULT FALSE,is_default BOOLEAN NOT NULL DEFAULT FALSE,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`,
 'CREATE UNIQUE INDEX IF NOT EXISTS client_stores_default_unique ON client_stores(client_id) WHERE is_default',
 'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES client_stores(id)',
 "INSERT INTO client_stores(client_id,name,platform,is_default,created_at,updated_at) SELECT id,'My store','Other',TRUE,created_at,created_at FROM users u WHERE role='client' AND NOT EXISTS(SELECT 1 FROM client_stores s WHERE s.client_id=u.id) ON CONFLICT DO NOTHING",
 'UPDATE client_orders o SET store_id=s.id FROM client_stores s WHERE o.client_id=s.client_id AND s.is_default AND o.store_id IS NULL',
 'ALTER TABLE client_orders ALTER COLUMN store_id SET NOT NULL',
];
const palette=['#8b6e37','#287d80','#6960aa','#bd7045','#489661','#b05a86'];
const out=r=>({id:Number(r.id),clientId:Number(r.client_id),name:r.name,platform:r.platform,link:r.link,color:r.color,archived:!!r.archived});
export async function ensureStores(DB,clientId){
 await DB.prepare("INSERT INTO client_stores(client_id,name,platform,is_default,created_at,updated_at) SELECT id,'My store','Other',TRUE,?,? FROM users u WHERE id=? AND role='client' AND NOT EXISTS(SELECT 1 FROM client_stores s WHERE s.client_id=u.id) ON CONFLICT DO NOTHING").bind(Math.floor(Date.now()/1000),Math.floor(Date.now()/1000),clientId).run();
}
export async function clientStores(DB,clientId=null){if(clientId!==null)await ensureStores(DB,clientId);const rows=(await DB.prepare(`SELECT s.* FROM client_stores s JOIN users u ON u.id=s.client_id WHERE ${clientId===null?'NOT u.archived':'s.client_id=?'} ORDER BY s.client_id,s.id`).bind(...(clientId===null?[]:[clientId])).all()).results||[];return rows.map(out);}
export function storeInput(body,defaultColor='#8b6e37'){
 const name=String(body.name||'').trim().slice(0,160),platform=body.platform,color=String(body.color||defaultColor);let link=String(body.link||'').trim().slice(0,1000);
 if(!name)throw new Error('Enter a store name.');if(!['Etsy','Shopify','Amazon','eBay','Other'].includes(platform))throw new Error('Choose a store platform.');if(!/^#[a-f\d]{6}$/i.test(color))throw new Error('Choose a valid store colour.');
 if(link){if(/^[^\s/?#:]+(?:\.[^\s/?#:]+)+(?:[/?#][^\s]*)?$/.test(link))link='https://'+link;let u;try{u=new URL(link);}catch{throw new Error('Enter a full store link, starting with https://');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Enter a full store link, starting with https://');}
 return{name,platform,color,link,archived:body.archived===true};
}
export async function saveStore(DB,clientId,id,body){await ensureStores(DB,clientId);const existing=id?await DB.prepare('SELECT * FROM client_stores WHERE id=? AND client_id=?').bind(id,clientId).first():null;if(id&&!existing)return null;
 const count=Number((await DB.prepare('SELECT COUNT(*) AS n FROM client_stores WHERE client_id=?').bind(clientId).first()).n),f=storeInput({...existing&&{name:existing.name,platform:existing.platform,color:existing.color,link:existing.link,archived:existing.archived},...body},palette[count%palette.length]),t=Math.floor(Date.now()/1000);
 const row=id?await DB.prepare('UPDATE client_stores SET name=?,platform=?,link=?,color=?,archived=?,updated_at=? WHERE id=? AND client_id=? RETURNING *').bind(f.name,f.platform,f.link,f.color,f.archived,t,id,clientId).first():await DB.prepare('INSERT INTO client_stores(client_id,name,platform,link,color,archived,created_at,updated_at) SELECT id,?,?,?,?,?,?,? FROM users WHERE id=? AND role=\'client\' AND NOT archived RETURNING *').bind(f.name,f.platform,f.link,f.color,f.archived,t,t,clientId).first();return row?out(row):null;
}
export async function orderStore(DB,clientId,requested,existingId=null,admin=false){
 const stores=await clientStores(DB,clientId),active=stores.filter(s=>!s.archived);const id=requested==null||requested===''?existingId||(active.length===1?active[0].id:null):Number(requested);
 const store=stores.find(s=>s.id===id);if(!store||store.archived&&store.id!==existingId)throw new Error('Choose an active store belonging to this client.');return store.id;
}
export async function clientPerformance(DB,clientId){
 const stores=await clientStores(DB,clientId),orders=(await DB.prepare('SELECT id,store_id,status,price,selling_price,etsy_fee,etsy_earned,order_date,created_at FROM client_orders WHERE client_id=?').bind(clientId).all()).results||[],adjustments=(await DB.prepare('SELECT order_id,amount FROM client_balance_adjustments WHERE client_id=?').bind(clientId).all()).results||[];
 return globalThis.DLClientStoreMath.performance(stores,orders.map(o=>({id:Number(o.id),storeId:Number(o.store_id),status:o.status,price:Number(o.price),sellingPrice:o.selling_price==null?null:Number(o.selling_price),etsyFee:o.etsy_fee==null?null:Number(o.etsy_fee),etsyEarned:o.etsy_earned==null?null:Number(o.etsy_earned),orderDate:o.order_date,createdAt:Number(o.created_at)})),adjustments.map(a=>({orderId:Number(a.order_id),amount:Number(a.amount)})));
}
