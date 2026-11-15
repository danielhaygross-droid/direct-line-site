// Supplier portal, phase 3 (docs/supplier-portal.md): price requests (cost revisions) and product quotes.
// Both go through the same code as the supplier sheet: a new total cost or "NO: reason" on an order (saveCell ->
// applySupplierRow), and the Product Quotes cells on a product (applyQuoteRow), then the cells are written back to the
// sheet. Answers are built field by field: never the client's price, our fee or the price options' client prices.

import { saveCell } from './supplier-queue.mjs';
import { applyQuoteRow, writeQuoteCells, syncQuoteRow, AVAILABLE, NOT_AVAILABLE, parsePriceOptions } from './quote-sheet.mjs';
import { productRequoted, keepProduct } from './cost-revisions.mjs';
import { productPhotoSignature } from './sheet-photos.mjs';
import { googleSheetsConfigured } from './google-sheets.mjs';
import { clientLabel } from './supplier-portal.mjs';

const norm = v => (v === null || v === undefined ? '' : String(v).trim());
const r2 = v => Math.round(Number(v || 0) * 100) / 100;
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (status, message) => Object.assign(new Error(message), { status });
const lines = o => { try { const a = o.items ? JSON.parse(o.items) : null; return Array.isArray(a) ? a : []; } catch { return []; } };

// The supplier's own answer on a product: what they typed (or the supplier part of the saved price), never the client's.
function supplierAnswer(p) {
  let price = norm(p.sheet_price);
  if (!price && p.price_options) { try { price = JSON.parse(p.price_options).map(o => `${o.label}: ${Number(o.supplier).toFixed(2)}`).join('\n'); } catch { price = ''; } }
  if (!price && p.supplier_price != null) price = Number(p.supplier_price).toFixed(2);
  const shipping = norm(p.sheet_shipping) || (p.supplier_shipping == null ? '' : Number(p.supplier_shipping).toFixed(2));
  return { price, shipping, available: p.status !== 'not_available', note: norm(p.note) };
}
async function productOut(DB, p) {
  const photos = ((await DB.prepare('SELECT id FROM portal_product_photos WHERE product_id=? ORDER BY id LIMIT 3').bind(p.id).all()).results || [])
    .map(r => `/api/portal/sheet-product-photos/${p.id}/${r.id}?key=${p._sig(r.id)}`);
  return { kind: 'product', id: Number(p.id), ref: 'P-' + p.id, client: clientLabel({ display_name: p.client_name, username: p.client_username }), createdAt: Number(p.created_at), updatedAt: Number(p.updated_at),
    name: norm(p.name), variant: norm(p.variant), link: norm(p.link), expected: p.expected_quantity == null ? null : Number(p.expected_quantity), photos,
    competitor: norm(p.competitor_price), status: p.status, revision: norm(p.revision_status), answer: supplierAnswer(p) };
}
async function products(DB, env, where, binds = []) {
  const rows = (await DB.prepare(`SELECT p.*, u.display_name AS client_name, u.username AS client_username FROM portal_products p JOIN users u ON u.id = p.client_id AND u.role = 'client' AND NOT u.archived ${where}`).bind(...binds).all()).results || [];
  const out = [];
  for (const p of rows) out.push(await productOut(DB, { ...p, _sig: photoId => productPhotoSignature(env, p.id, photoId) }));
  return out;
}

// ---------- product quotes ----------
export async function quotesList(DB, env) {
  const toAnswer = await products(DB, env, "WHERE p.status = 'awaiting_quote' AND p.revision_status = '' ORDER BY p.created_at, p.id");
  const answered = await products(DB, env, "WHERE p.status IN ('approved','not_available') AND p.revision_status = '' ORDER BY p.updated_at DESC, p.id DESC LIMIT 40");
  return { toAnswer, answered };
}
async function productRow(DB, id) {
  return DB.prepare("SELECT p.*, u.commission_per_order FROM portal_products p JOIN users u ON u.id = p.client_id AND u.role = 'client' AND NOT u.archived WHERE p.id = ?").bind(id).first();
}
async function settings(DB) {
  const r = await DB.prepare("SELECT value FROM portal_settings WHERE key = 'commission_per_order'").first();
  return { commission_per_order: r?.value ?? '2' };
}
async function afterQuote(DB, env, waitUntil, id, requoted) {
  if (requoted) await productRequoted(DB, id);
  if (!googleSheetsConfigured(env)) return;
  const sync = (async () => { await writeQuoteCells(DB, env, id); await syncQuoteRow(DB, env, id); })().catch(e => console.error('Supplier portal quote: sheet write failed', e));
  if (waitUntil) waitUntil(sync); else await sync;
}
// One answer: price per item (one price, or "Name: price" lines), shipping per order, available or not, note.
export async function saveQuote(DB, env, waitUntil, id, body) {
  const p = await productRow(DB, id);
  if (!p) throw fail(404, 'Not found');
  const available = body.available !== false, price = norm(body.price).slice(0, 600), shipping = norm(body.shipping).slice(0, 40), note = norm(body.note).slice(0, 1000);
  if (available) {
    if (!price) throw fail(400, 'Type the price per item (USD).');
    if (!parsePriceOptions(price)) throw fail(400, 'Price not clear: write one price, or Name: price on each line.');
    if (shipping && !/^\$?\s*\d{1,5}([.,]\d{1,2})?$/.test(shipping)) throw fail(400, 'Type the shipping per order in US dollars, e.g. 4.50.');
  } else if (!note) throw fail(400, 'Say why it is not available.');
  const out = await applyQuoteRow(DB, p, { price: available ? price : '', shipping: available ? shipping : '', status: available ? AVAILABLE : NOT_AVAILABLE, note }, await settings(DB), now());
  if (out && !['approved', 'not_available'].includes(out)) throw fail(400, out.startsWith('shipping') ? 'Type the shipping per order in US dollars, e.g. 4.50.' : 'Price not clear: write one price, or Name: price on each line.');
  await afterQuote(DB, env, waitUntil, id, out === 'approved' || out === 'not_available');
  return (await products(DB, env, 'WHERE p.id = ?', [id]))[0];
}

// ---------- price requests ----------
async function orderRequests(DB, status) {
  return (await DB.prepare(`SELECT o.id, o.order_ref, o.item_title, o.variant, o.items, o.supplier_cost, o.competitor_price, o.revision_status, o.status, u.display_name AS client_name, u.username AS client_username,
      (SELECT r.created_at FROM cost_revisions r WHERE r.order_id = o.id ORDER BY r.id DESC LIMIT 1) AS asked_at,
      (SELECT r.offered_cost FROM cost_revisions r WHERE r.order_id = o.id ORDER BY r.id DESC LIMIT 1) AS offered,
      (SELECT ph.id FROM order_photos ph WHERE ph.order_id = o.id ORDER BY ph.id LIMIT 1) AS photo_id
    FROM client_orders o JOIN users u ON u.id = o.client_id AND u.role = 'client' AND NOT u.archived
    WHERE NOT o.archived AND o.revision_status = ? ORDER BY asked_at, o.id`).bind(status).all()).results || [];
}
const orderReq = (env, sig, o) => {
  const its = lines(o), product = [o.item_title, its.length > 1 ? its.map((i, n) => `#${n + 1} ${i.quantity} × ${i.variant || ''}`.trim()).join('\n') : o.variant].map(norm).filter(Boolean).join(its.length > 1 ? '\n' : ' · ');
  return { kind: 'order', id: Number(o.id), ref: norm(o.order_ref) || '#' + o.id, client: clientLabel({ display_name: o.client_name, username: o.client_username }), product,
    photo: o.photo_id ? `/api/portal/sheet-photos/${o.id}/${o.photo_id}?key=${sig(o.id, o.photo_id)}&size=thumb` : '',
    costNow: o.supplier_cost == null ? null : r2(o.supplier_cost), competitor: norm(o.competitor_price), askedAt: Number(o.asked_at || 0), offered: o.revision_status === 'offered' && o.offered != null ? r2(o.offered) : null };
};
export async function requestsList(DB, env) {
  const { photoSignature } = await import('./sheet-photos.mjs'), sig = (o, p) => photoSignature(env, o, p);
  const open = (await orderRequests(DB, 'open')).map(o => orderReq(env, sig, o)), offered = (await orderRequests(DB, 'offered')).map(o => orderReq(env, sig, o));
  const prods = await products(DB, env, "WHERE p.revision_status IN ('open','offered') ORDER BY p.updated_at, p.id");
  const done = (await DB.prepare(`SELECT r.id, r.order_id, r.product_id, r.result, r.offered_cost, r.reply, r.answered_at, o.order_ref, o.item_title, p.name AS product_name, p.supplier_price
    FROM cost_revisions r LEFT JOIN client_orders o ON o.id = r.order_id LEFT JOIN portal_products p ON p.id = r.product_id
    JOIN users u ON u.id = r.client_id AND u.role = 'client' AND NOT u.archived
    WHERE r.status = 'done' ORDER BY r.answered_at DESC NULLS LAST, r.id DESC LIMIT 40`).all()).results || [];
  const answered = done.map(r => ({ kind: r.order_id ? 'order' : 'product', id: Number(r.order_id || r.product_id), ref: r.order_id ? norm(r.order_ref) || '#' + r.order_id : 'P-' + r.product_id,
    name: norm(r.order_id ? r.item_title : r.product_name), result: r.result, newCost: r.order_id ? (r.offered_cost == null ? null : r2(r.offered_cost)) : (['lowered', 'raised'].includes(r.result) && r.supplier_price != null ? r2(r.supplier_price) : null),
    reply: norm(r.reply), answeredAt: r.answered_at == null ? null : Number(r.answered_at) }));
  return { toAnswer: [...open, ...prods.filter(p => p.revision === 'open')], waiting: offered, answered };
}
// Accept with a new cost, or keep the price with a reason.
export async function answerRequest(DB, env, waitUntil, me, kind, id, body) {
  const keep = body.action === 'keep', reason = norm(body.reason).slice(0, 300);
  if (keep && !reason) throw fail(400, 'Say why the cost can’t be lower.');
  if (kind === 'order') {
    const o = await DB.prepare("SELECT revision_status FROM client_orders WHERE id = ? AND NOT archived").bind(id).first();
    if (!o || o.revision_status !== 'open') throw fail(409, 'This request is already answered.');
    const cost = norm(body.cost).replace(/^\$/, '');
    if (!keep && !/^\d{1,5}(\.\d{1,2})?$/.test(cost)) throw fail(400, 'Type the new total cost in US dollars, e.g. 17.90.');
    await saveCell(DB, env, waitUntil, me, id, 'cost', keep ? 'NO: ' + reason : cost);
    const after = await DB.prepare('SELECT revision_status FROM client_orders WHERE id = ?').bind(id).first();
    return { done: !after.revision_status, waiting: after.revision_status === 'offered' };
  }
  const p = await productRow(DB, id);
  if (!p || !p.revision_status) throw fail(409, 'This request is already answered.');
  if (keep) { await keepProduct(DB, id, { reply: reason }); await afterQuote(DB, env, waitUntil, id, false); return { done: true }; }
  const price = norm(body.price);
  if (!parsePriceOptions(price)) throw fail(400, 'Price not clear: write one price, or Name: price on each line.');
  const was = supplierAnswer(p);
  if (price === was.price) throw fail(400, 'That is the same price. To keep it, choose Keep the price and say why.');
  const out = await applyQuoteRow(DB, p, { price, shipping: was.shipping, status: AVAILABLE, note: norm(p.sheet_note ?? p.note) }, await settings(DB), now());
  if (out !== 'approved') throw fail(400, 'Price not clear: write one price, or Name: price on each line.');
  await afterQuote(DB, env, waitUntil, id, true);
  return { done: true };
}

export async function requestCounts(DB) {
  const n = async sql => Number((await DB.prepare(sql).first())?.n || 0);
  return {
    quotes: await n("SELECT COUNT(*) AS n FROM portal_products p JOIN users u ON u.id = p.client_id AND u.role = 'client' AND NOT u.archived WHERE p.status = 'awaiting_quote' AND p.revision_status = ''"),
    requests: await n("SELECT COUNT(*) AS n FROM client_orders o JOIN users u ON u.id = o.client_id AND u.role = 'client' AND NOT u.archived WHERE NOT o.archived AND o.revision_status = 'open'")
      + await n("SELECT COUNT(*) AS n FROM portal_products p JOIN users u ON u.id = p.client_id AND u.role = 'client' AND NOT u.archived WHERE p.revision_status = 'open'"),
  };
}

export async function routeRequests(request, path, ctx, me) {
  const { DB, env, waitUntil } = ctx, method = request.method;
  const run = async f => { try { return json({ ok: true, ...(await f()) }); } catch (e) { return json({ ok: false, error: e.message }, e.status || (e.busy ? 409 : 500)); } };
  if (path === '/supplier/quotes' && method === 'GET') return run(() => quotesList(DB, env));
  const q = /^\/supplier\/quotes\/(\d+)$/.exec(path);
  if (q && method === 'PUT') return run(async () => ({ product: await saveQuote(DB, env, waitUntil, Number(q[1]), await request.json().catch(() => ({}))) }));
  if (path === '/supplier/price-requests' && method === 'GET') return run(() => requestsList(DB, env));
  const a = /^\/supplier\/price-requests\/(order|product)\/(\d+)$/.exec(path);
  if (a && method === 'POST') return run(async () => answerRequest(DB, env, waitUntil, me, a[1], Number(a[2]), await request.json().catch(() => ({}))));
  return null;
}
