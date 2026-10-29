// Check: the one-time repair after the 29 Oct 2026 sheet switch (server/repair-2026-10-29.mjs).
//   node checks/check-switch-repair.mjs      (run from the repo root)
// An order the switch billed with another order's cost and tracking goes back to "no cost, no tracking" and its wrong
// saved price is switched off; an order the supplier has priced since, or whose tracking is its own, is left alone;
// it runs once, and only an admin can start it.
import assert from 'node:assert/strict';
import { DB, pg, call, seed } from './lib.mjs';
import { repairSwitchOrders } from '../server/repair-2026-10-29.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kQQAAAAASUVORK5CYII=';
try {
  const { admin, client } = await seed();
  const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
  const store = ok(await call('/client-stores', 'GET', null, client)).stores[0];
  const mk = async ref => ok(await call('/orders', 'POST', { storeId: store.id, orderRef: ref, buyerName: 'Sample', address1: '1 Sample St', destination: 'US', etsyUrl: 'https://example.com/i', photos: [{ filename: 'p.png', data: 'data:image/png;base64,' + png }] }, client)).order.id;
  const set = (id, sql, ...v) => DB.prepare(`UPDATE client_orders SET ${sql} WHERE id=?`).bind(...v, id).run();
  const row = id => DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(id).first();
  const [real, mixed, priced, own] = [await mk('#R1'), await mk('#M1'), await mk('#P1'), await mk('#O1')];
  // #R1 keeps its real cost and tracking; #M1 got them by mistake (empty cost cell in the sheet).
  await set(real, "supplier_cost=20.9, product_cost=21.4, price=21.4, tracking_number='UL1', courier='Yanwen', sheet_cost='20.9'");
  await set(mixed, "supplier_cost=20.9, product_cost=21.4, price=21.4, tracking_number='UL1', courier='Yanwen', sheet_cost=''");
  await DB.prepare("INSERT INTO saved_prices (client_id, store_id, product_key, variant_key, destination, quantity, supplier_cost, label, link, variant, source_order_id, created_at, updated_at) VALUES ((SELECT client_id FROM client_orders WHERE id=?),?,'k','','US',1,20.9,'','','',?,1,1)").bind(mixed, store.id, mixed).run();
  // #P1: the supplier has typed a real cost since; #O1: its tracking is its own.
  await set(priced, "supplier_cost=30.9, product_cost=31.4, price=31.4, tracking_number='UL1', sheet_cost='30.9'");
  await set(own, "supplier_cost=40.9, product_cost=41.4, price=41.4, tracking_number='UL9', sheet_cost=''");

  const list = [[real, '#R1'], [mixed, '#M1'], [priced, '#P1'], [own, '#O1'], [999999, '#X']];
  assert.equal((await call('/admin/repair/2026-10-29', 'POST', {}, client)).status, 403, 'clients cannot start it');
  const r = await repairSwitchOrders(DB, list);
  assert.deepEqual(r.fixed, ['#M1: cost + tracking', '#O1: cost'], JSON.stringify(r));
  const m = await row(mixed);
  assert.deepEqual([m.supplier_cost, m.product_cost, Number(m.price), m.tracking_number, m.courier], [null, null, 0, '', null], 'mixed-up order back to no cost, no tracking');
  assert.equal((await DB.prepare('SELECT active FROM saved_prices WHERE source_order_id=?').bind(mixed).first()).active, false, 'its wrong saved price is off (kept)');
  const rr = await row(real); assert.deepEqual([Number(rr.supplier_cost), rr.tracking_number], [20.9, 'UL1'], 'the real owner keeps its cost and tracking');
  const p = await row(priced); assert.deepEqual([Number(p.supplier_cost), p.tracking_number], [30.9, 'UL1'], 'an order the supplier has priced since is left alone');
  assert.equal((await row(own)).tracking_number, 'UL9', 'its own tracking stays');
  assert.deepEqual(r.skipped, ['#R1: already right', '#P1: already right', '#X: not found']);
  assert.deepEqual(await repairSwitchOrders(DB, list), { ok: true, already: true }, 'runs once');
  console.log('PASS switch repair: mixed-up costs and tracking cleared, real owners and later supplier edits kept, wrong saved price off, runs once, admin only');
} finally { await pg.close(); }
