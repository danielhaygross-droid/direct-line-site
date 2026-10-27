// Cost revisions (Erwin, 27 Oct 2026): a client asks for a lower cost on an order or a quoted product when the
// supplier's cost leaves little or no profit at their Etsy price. The competitor price (what their listing is based
// on) is required. Decisions:
//   - the supplier gives the new cost in the sheet (the request shows in the Competitor price column); an admin can
//     also answer from the dashboard;
//   - an order's bill only changes after an admin approves the new cost;
//   - a revised product quote is the product's price from then on (future orders use it; past orders keep their bill);
//   - a client can ask again any time after an answer (one open request per order or product).
// Requests are kept (cost_revisions), never deleted. status: open (waiting for the supplier) -> offered (supplier gave a
// new cost, waiting for an admin; orders only) -> done (result lowered / kept, with an optional reply).
export const REVISION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cost_revisions (
     id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id),
     order_id INTEGER REFERENCES client_orders(id), product_id INTEGER REFERENCES portal_products(id),
     competitor_price DOUBLE PRECISION NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
     old_price DOUBLE PRECISION, offered_cost DOUBLE PRECISION, new_price DOUBLE PRECISION, result TEXT NOT NULL DEFAULT '',
     reply TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, answered_at INTEGER)`,
  'CREATE INDEX IF NOT EXISTS cost_revisions_order_idx ON cost_revisions (order_id, id)',
  'CREATE INDEX IF NOT EXISTS cost_revisions_product_idx ON cost_revisions (product_id, id)',
  // '' or 'open' / 'offered': quick to read when the sheet rows and lists are built.
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS revision_status TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE portal_products ADD COLUMN IF NOT EXISTS revision_status TEXT NOT NULL DEFAULT ''",
];
const r2 = n => Math.round(Number(n || 0) * 100) / 100;
const now = () => Math.floor(Date.now() / 1000);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const usd = n => '$' + Number(n).toFixed(2);
// What the supplier reads in the Competitor price column while a request is open.
export const REVISION_FLAG = 'COST REVISION REQUESTED';
export const competitorCell = (text, status) => status ? `${REVISION_FLAG}: ${text || ''}`.trim() : text || '';

const out = r => r ? { id: Number(r.id), status: r.status, competitorPrice: Number(r.competitor_price), note: r.note || '', oldPrice: r.old_price == null ? null : Number(r.old_price),
  offeredCost: r.offered_cost == null ? null : Number(r.offered_cost), newPrice: r.new_price == null ? null : Number(r.new_price), result: r.result || '', reply: r.reply || '',
  createdAt: Number(r.created_at), answeredAt: r.answered_at == null ? null : Number(r.answered_at) } : null;

function input(body) {
  const raw = String(body?.competitorPrice ?? '').replace(/[$,\s]/g, ''), price = Number(raw);
  if (!raw || !Number.isFinite(price) || price <= 0 || price >= 1e6) throw fail('Enter the competitor price in USD (the price your listing is based on).');
  return { price: r2(price), note: String(body?.note || '').trim().slice(0, 1000) };
}

// Latest request of each order / product (or null): { [id]: revision }.
export async function latestRevisions(DB, kind, clientId = null) {
  const col = kind === 'order' ? 'order_id' : 'product_id';
  const rows = (await DB.prepare(`SELECT DISTINCT ON (${col}) * FROM cost_revisions WHERE ${col} IS NOT NULL ${clientId == null ? '' : 'AND client_id = ?'} ORDER BY ${col}, id DESC`).bind(...(clientId == null ? [] : [clientId])).all()).results || [];
  return new Map(rows.map(r => [Number(r[col]), out(r)]));
}
export async function withRevisions(DB, list, kind, clientId = null) {
  const map = await latestRevisions(DB, kind, clientId);
  return list.map(x => ({ ...x, revision: map.get(Number(x.id)) || null }));
}

// The client asks. Orders: priced, not cancelled or delivered. Products: quoted (approved).
export async function requestRevision(DB, kind, id, clientId, body, t = now()) {
  const f = input(body);
  if (kind === 'order') {
    const o = await DB.prepare('SELECT * FROM client_orders WHERE id = ? AND client_id = ? AND NOT archived').bind(id, clientId).first();
    if (!o) throw fail('Not found', 404);
    if (!(Number(o.price) > 0)) throw fail('This order has no cost yet. You can ask once it’s priced.');
    if (['cancelled', 'cancellation_requested', 'delivered'].includes(o.status)) throw fail('A cost revision isn’t possible for this order any more.');
    if (o.revision_status) throw fail('You already asked for a revision of this order. We’ll let you know.', 409);
    await DB.prepare('INSERT INTO cost_revisions (client_id, order_id, competitor_price, note, old_price, created_at) VALUES (?,?,?,?,?,?)').bind(clientId, id, f.price, f.note, r2(o.price), t).run();
    await DB.prepare("UPDATE client_orders SET revision_status='open', competitor_price=?, sheet_sync_status='waiting', updated_at=? WHERE id=?").bind(usd(f.price), t, id).run();
    await DB.prepare("INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,'revision_requested','client',?,?)").bind(id, clientId, usd(f.price) + (f.note ? ' · ' + f.note : ''), t).run();
    return;
  }
  const p = await DB.prepare('SELECT * FROM portal_products WHERE id = ? AND client_id = ?').bind(id, clientId).first();
  if (!p) throw fail('Not found', 404);
  if (p.status !== 'approved') throw fail('You can ask for a revision once this product has a price.');
  if (p.revision_status) throw fail('You already asked for a revision of this product. We’ll let you know.', 409);
  await DB.prepare('INSERT INTO cost_revisions (client_id, product_id, competitor_price, note, old_price, created_at) VALUES (?,?,?,?,?,?)').bind(clientId, id, f.price, f.note, p.unit_price == null ? null : r2(p.unit_price), t).run();
  await DB.prepare("UPDATE portal_products SET revision_status='open', competitor_price=?, updated_at=? WHERE id=?").bind(usd(f.price), t, id).run();
  await DB.prepare("INSERT INTO portal_product_events (product_id, client_id, actor, detail, created_at) VALUES (?,?,'client',?,?)").bind(id, clientId, 'Cost revision requested · ' + usd(f.price), t).run();
}

// Supplier sheet: a new Total cost on an order with an open request waits for an admin instead of billing.
export async function offerFromSheet(DB, order, cost, t = now()) {
  await DB.prepare("UPDATE cost_revisions SET status='offered', offered_cost=? WHERE id = (SELECT id FROM cost_revisions WHERE order_id=? AND status IN ('open','offered') ORDER BY id DESC LIMIT 1)").bind(r2(cost), order.id).run();
  await DB.prepare("UPDATE client_orders SET revision_status='offered', supplier_cost=? WHERE id=?").bind(r2(cost), order.id).run();
}

// Admin answers an order: approve a new supplier cost (bill = cost + our fee) or keep the price (with a reply).
// Returns { oldPrice, newPrice } when the bill changed.
export async function answerOrder(DB, id, body, t = now()) {
  const o = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(id).first();
  if (!o) throw fail('Not found', 404);
  const rev = await DB.prepare("SELECT * FROM cost_revisions WHERE order_id=? AND status IN ('open','offered') ORDER BY id DESC LIMIT 1").bind(id).first();
  if (!rev) throw fail('There is no open cost revision on this order.', 409);
  const reply = String(body?.reply || '').trim().slice(0, 1000);
  let changed = null;
  if (body?.action === 'approve') {
    const cost = Number(body.cost ?? rev.offered_cost);
    if (!Number.isFinite(cost) || cost < 0 || cost >= 1e7) throw fail('Enter the new supplier cost (USD).');
    const price = r2(cost + Number(o.commission || 0)), before = r2(o.price);
    await DB.prepare('UPDATE client_orders SET supplier_cost=?, product_cost=?, shipping_fee=NULL, price=?, quoted_unit_price=NULL, price_source=NULL, updated_at=? WHERE id=?').bind(r2(cost), price, price, t, id).run();
    if (price !== before) { await DB.prepare("INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,'price_changed','admin',?,?)").bind(id, o.client_id, before.toFixed(2) + '|' + price.toFixed(2), t).run(); changed = { oldPrice: before, newPrice: price }; }
    await DB.prepare("UPDATE cost_revisions SET status='done', result=?, new_price=?, offered_cost=?, reply=?, answered_at=? WHERE id=?").bind(price < before ? 'lowered' : price > before ? 'raised' : 'kept', price, r2(cost), reply, t, rev.id).run();
  } else if (body?.action === 'keep') {
    await DB.prepare("UPDATE cost_revisions SET status='done', result='kept', new_price=?, reply=?, answered_at=? WHERE id=?").bind(r2(o.price), reply, t, rev.id).run();
  } else throw fail('Choose Approve or Keep the price.');
  await DB.prepare("UPDATE client_orders SET revision_status='', competitor_price=?, sheet_sync_status='waiting', updated_at=? WHERE id=?").bind(usd(rev.competitor_price), t, id).run();
  const done = await DB.prepare('SELECT * FROM cost_revisions WHERE id=?').bind(rev.id).first();
  await DB.prepare("INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,'revision_answered','admin',?,?)").bind(id, o.client_id, done.result + (reply ? '|' + reply : ''), t).run();
  return changed;
}

// Products: a new quote (sheet or admin) answers an open request; an admin can also keep the price with a reply.
export async function productRequoted(DB, productId, t = now()) {
  const rev = await DB.prepare("SELECT r.*, p.unit_price, p.status AS pstatus FROM cost_revisions r JOIN portal_products p ON p.id = r.product_id WHERE r.product_id=? AND r.status IN ('open','offered') ORDER BY r.id DESC LIMIT 1").bind(productId).first();
  if (!rev) return false;
  const price = rev.unit_price == null ? null : r2(rev.unit_price), before = rev.old_price == null ? null : Number(rev.old_price);
  const result = rev.pstatus !== 'approved' ? 'kept' : price != null && before != null && price < before ? 'lowered' : price != null && before != null && price > before ? 'raised' : 'kept';
  await DB.prepare("UPDATE cost_revisions SET status='done', result=?, new_price=?, answered_at=? WHERE id=?").bind(result, price, t, rev.id).run();
  await DB.prepare("UPDATE portal_products SET revision_status='' WHERE id=?").bind(productId).run();
  return true;
}
export async function keepProduct(DB, productId, body, t = now()) {
  const rev = await DB.prepare("SELECT r.*, p.unit_price, p.client_id AS pclient FROM cost_revisions r JOIN portal_products p ON p.id = r.product_id WHERE r.product_id=? AND r.status IN ('open','offered') ORDER BY r.id DESC LIMIT 1").bind(productId).first();
  if (!rev) throw fail('There is no open cost revision on this product.', 409);
  const reply = String(body?.reply || '').trim().slice(0, 1000);
  await DB.prepare("UPDATE cost_revisions SET status='done', result='kept', new_price=?, reply=?, answered_at=? WHERE id=?").bind(rev.unit_price == null ? null : r2(rev.unit_price), reply, t, rev.id).run();
  await DB.prepare("UPDATE portal_products SET revision_status='', updated_at=? WHERE id=?").bind(t, productId).run();
  await DB.prepare("INSERT INTO portal_product_events (product_id, client_id, actor, detail, created_at) VALUES (?,?,'admin',?,?)").bind(productId, rev.pclient, 'revision_kept' + (reply ? '|' + reply : ''), t).run();
}
