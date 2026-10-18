import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA} from '../server/portal.mjs';
import {STORE_SCHEMA} from '../server/client-stores.mjs';
const pg=new PGlite();
try{
 for(const sql of SCHEMA.filter(s=>!STORE_SCHEMA.includes(s)))await pg.query(sql);
 const u=(await pg.query("INSERT INTO users(username,password_hash,role,display_name,created_at) VALUES ('legacy','local-only','client','Legacy',1) RETURNING id")).rows[0].id;
 const o=(await pg.query("INSERT INTO client_orders(client_id,order_ref,created_at,updated_at,address_line_1) VALUES (?,'LEGACY',1,1,?) RETURNING id".replace('?', '$1').replace('?', '$2'),[u,'Historic street\nHistoric city\nPhone'])).rows[0].id;
 for(const sql of STORE_SCHEMA)await pg.query(sql);
 const row=(await pg.query('SELECT o.*,s.name FROM client_orders o JOIN client_stores s ON s.id=o.store_id WHERE o.id=$1',[o])).rows[0];assert.equal(row.name,'My store');assert.equal(row.address_line_1,'Historic street\nHistoric city\nPhone');
 for(const sql of STORE_SCHEMA)await pg.query(sql);assert.equal(Number((await pg.query('SELECT COUNT(*) AS n FROM client_stores WHERE client_id=$1',[u])).rows[0].n),1);
 assert.equal((await pg.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='client_orders' AND column_name='store_id'")).rows[0].is_nullable,'NO');
 console.log('PASS legacy store migration/backfill, historical address preservation, migration replay and NOT NULL order store');
}finally{await pg.close();}
