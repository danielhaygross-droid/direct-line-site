// One-time repair after the supplier-sheet switch of 29 Oct 2026 (Shipped / Cancelled tabs, PR #129).
// The switch left the supplier's columns (Total cost, Tracking number, Courier) next to the wrong orders, and the
// website billed those costs and tracking numbers to Yehuda's orders. The 76 orders the supplier had priced were put
// right through the sheet. These 9 had no cost and no tracking yet (the 29 Oct morning backup shows price 0, no
// supplier cost, no tracking): a cleared sheet cell doesn't clear the website, so they are put back here.
// Each order is only changed while it is still in the mixed-up state: the cost while the sheet's cost cell is empty
// (the supplier hasn't priced it since), the tracking while that order still has no cost in the sheet and the number
// belongs to another order that has one (its real owner). The saved prices
// those wrong costs created are switched off (kept, not deleted). Runs once; an admin starts it.
export const SWITCH_REPAIR = 'repair-2026-10-29-switch';
export const SWITCH_ORDERS = [[92, '#4211768613'], [93, '#4213870012'], [94, '#4212008263'], [98, '#4215375566'], [99, '#4213356163'],
  [100, '4213549625'], [101, '#4215831932'], [102, '#4216046628'], [103, '#4213959597']];
const norm = v => (v === null || v === undefined ? '' : String(v).trim());

export async function repairSwitchOrders(DB, orders = SWITCH_ORDERS, t = Math.floor(Date.now() / 1000)) {
  if (await DB.prepare('SELECT 1 AS x FROM portal_settings WHERE key=?').bind(SWITCH_REPAIR).first()) return { ok: true, already: true };
  const fixed = [], skipped = [];
  for (const [id, ref] of orders) {
    const o = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(id).first();
    if (!o || o.order_ref !== ref || o.archived) { skipped.push(ref + ': not found'); continue; }
    const did = [];
    if (o.supplier_cost != null && !norm(o.sheet_cost) && o.quoted_unit_price == null) {
      await DB.prepare('UPDATE saved_prices SET active=FALSE, updated_at=? WHERE source_order_id=? AND supplier_cost=? AND active').bind(t, id, Number(o.supplier_cost)).run();
      await DB.prepare('UPDATE client_orders SET supplier_cost=NULL, product_cost=NULL, shipping_fee=NULL, price=0, price_source=NULL, updated_at=? WHERE id=?').bind(t, id).run();
      did.push('cost');
    }
    if (norm(o.tracking_number) && !norm(o.sheet_cost) && await DB.prepare("SELECT 1 AS x FROM client_orders WHERE client_id=? AND id<>? AND tracking_number=? AND COALESCE(sheet_cost,'')<>''").bind(o.client_id, id, o.tracking_number).first()) {
      await DB.prepare("UPDATE client_orders SET tracking_number='', courier=NULL, last_tracking_update_at=NULL, updated_at=? WHERE id=?").bind(t, id).run();
      did.push('tracking');
    }
    if (did.length) fixed.push(ref + ': ' + did.join(' + ')); else skipped.push(ref + ': already right');
  }
  await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(SWITCH_REPAIR, String(t)).run();
  return { ok: true, fixed, skipped };
}
