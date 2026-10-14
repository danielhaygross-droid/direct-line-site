// Saved prices (Shahar): once the supplier has priced an order, the same order again is priced automatically.
// "The same order" = same client, store, product link(s), variation, delivery country and quantity — the supplier's
// total includes shipping, so a different country or quantity is priced by the supplier again (and then remembered).
// The supplier can still change the cost in the sheet; the newest cost is what is remembered.
export const SAVED_PRICE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS saved_prices (id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id), store_id INTEGER NOT NULL DEFAULT 0,
    product_key TEXT NOT NULL, variant_key TEXT NOT NULL DEFAULT '', destination TEXT NOT NULL, quantity INTEGER NOT NULL,
    supplier_cost DOUBLE PRECISION NOT NULL, label TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', variant TEXT NOT NULL DEFAULT '',
    source_order_id INTEGER, uses INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_used_at INTEGER)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS saved_prices_key ON saved_prices (client_id, store_id, product_key, variant_key, destination, quantity)',
  // 'saved' while the order's price came from a saved price and the supplier hasn't touched the cost yet.
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS price_source TEXT',
];

const clean = v => String(v ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// Etsy links point at the same listing in many ways (shop paths, tracking query): keep only the listing number.
export function productKey(links) {
  const keys = String(links || '').split(/\s+/).filter(Boolean).map(l => {
    let u; try { u = new URL(l); } catch { return clean(l); }
    const etsy = /(^|\.)etsy\.com$/i.test(u.hostname) && /\/listing\/(\d+)/.exec(u.pathname);
    if (etsy) return 'etsy:' + etsy[1];
    return (u.hostname.replace(/^www\./i, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
  }).filter(Boolean);
  return keys.length ? [...new Set(keys)].sort().join('|') : '';
}
export const variantKey = (variant, title) => clean(variant) || clean(title);
const keyOf = o => ({
  client: Number(o.client_id), store: Number(o.store_id || 0), product: productKey(o.etsy_url), variant: variantKey(o.variant, o.item_title),
  dest: String(o.destination || '').trim().toUpperCase(), qty: Number(o.quantity || 1),
});

// After the supplier priced an order (Total cost in the Work Queue). Orders with a fixed product quote are skipped.
export async function rememberPrice(DB, o, cost, t = Math.floor(Date.now() / 1000)) {
  const k = keyOf(o);
  if (!k.product || !k.dest || o.quoted_unit_price != null || !(cost > 0)) return false;
  await DB.prepare(`INSERT INTO saved_prices (client_id, store_id, product_key, variant_key, destination, quantity, supplier_cost, label, link, variant, source_order_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (client_id, store_id, product_key, variant_key, destination, quantity) DO UPDATE SET supplier_cost=EXCLUDED.supplier_cost, label=EXCLUDED.label,
      link=EXCLUDED.link, variant=EXCLUDED.variant, source_order_id=EXCLUDED.source_order_id, active=TRUE, updated_at=EXCLUDED.updated_at`)
    .bind(k.client, k.store, k.product, k.variant, k.dest, k.qty, cost, String(o.item_title || o.order_ref || '').slice(0, 200),
      String(o.etsy_url || '').split(/\s+/)[0].slice(0, 1000), String(o.variant || '').slice(0, 300), o.id, t, t).run();
  return true;
}

// For a new order: the saved supplier cost for exactly this order, or null.
export async function findSavedPrice(DB, o) {
  const k = keyOf(o);
  if (!k.product || !k.dest) return null;
  return DB.prepare('SELECT * FROM saved_prices WHERE active AND client_id=? AND store_id=? AND product_key=? AND variant_key=? AND destination=? AND quantity=?')
    .bind(k.client, k.store, k.product, k.variant, k.dest, k.qty).first();
}
export const markUsed = (DB, id, t) => DB.prepare('UPDATE saved_prices SET uses=uses+1, last_used_at=? WHERE id=?').bind(t, id).run();

export async function savedPricesFor(DB, clientId) {
  const rows = (await DB.prepare(`SELECT p.*, s.name AS store_name FROM saved_prices p LEFT JOIN client_stores s ON s.id=p.store_id
    WHERE p.active AND p.client_id=? ORDER BY COALESCE(p.last_used_at, p.updated_at) DESC, p.id DESC`).bind(clientId).all()).results || [];
  return rows.map(r => ({ id: Number(r.id), storeId: Number(r.store_id) || null, storeName: r.store_name || '', label: r.label, link: r.link, variant: r.variant,
    destination: r.destination, quantity: Number(r.quantity), supplierCost: Number(r.supplier_cost), uses: Number(r.uses),
    updatedAt: Number(r.updated_at), lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at) }));
}
// "Forget": no longer used for new orders (kept for the record; pricing it again brings it back).
export const forgetSavedPrice = (DB, id) => DB.prepare('UPDATE saved_prices SET active=FALSE, updated_at=? WHERE id=? RETURNING id').bind(Math.floor(Date.now() / 1000), id).first();
