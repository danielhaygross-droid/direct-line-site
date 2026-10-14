// Client portal + admin monitoring API.
// Shares the dashboard's signed `dl_session` cookie (same HMAC format as the Worker),
// so one login works across the store dashboard, the client portal and the admin view.
//   role "admin"          -> Daniel / Erwin (env admin or admin users in the DB)
//   role "client-<id>"    -> a client account from the users table

import { timingSafeEqual, randomBytes } from 'node:crypto';
import { serveSheetPhoto } from './sheet-photos.mjs';
import { googleSheetsConfigured, retryPendingGoogleSheetOrders, syncClientToGoogleSheet, syncPortalOrderToGoogleSheet } from './google-sheets.mjs';

import { TERMS_SCHEMA, currentTerms, termsAcceptance, acceptTerms, publishTerms } from './terms.mjs';

import { FILE_SCHEMA, transfers, saveTransfer, recordTransfer, downloadFile } from './files.mjs';

import { STATUS_SCHEMA, changeStatus, balanceAdjustments } from './order-status.mjs';

import { INVOICE_SCHEMA, invoices, saveInvoice, monthlyInvoices } from './invoices.mjs';

import { PRODUCT_SCHEMA, products, addProduct, quoteProduct, productPhoto, productEvents } from './products.mjs';

import { CLAIM_SCHEMA, claims, submitClaim, decideClaim, claimEligibility } from './claims.mjs';

import { STORE_SCHEMA, ensureStores, clientStores, saveStore, orderStore, clientPerformance } from './client-stores.mjs';

import { STORAGE_SCHEMA, photoBytes, syncFileStorage, fileStorageStatus } from './file-storage.mjs';
import { SUPPLIER_SHEET_SCHEMA, setupSupplierWorkQueue, pollSupplierSheet, supplierSheetStatus } from './supplier-sheet.mjs';
import { runBackup, listBackups, downloadBackup } from './backup.mjs';
import { LOGIN_LIMIT_SCHEMA, LOCK_MESSAGE, clientIp, loginKeys, lockedFor, recordFailure, clearFailures } from './login-limit.mjs';

const utf8 = new TextEncoder();
const SESSION_SECONDS = 43200; // 12h, same as the Worker
const b64url = bytes => Buffer.from(bytes).toString('base64url');
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

export const SCHEMA = [

  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('admin','client')),
     display_name TEXT NOT NULL,
     commission_per_order DOUBLE PRECISION,
     supplier_share_per_order DOUBLE PRECISION,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS client_orders (
     id SERIAL PRIMARY KEY,
     client_id INTEGER NOT NULL REFERENCES users(id),
     order_ref TEXT NOT NULL DEFAULT '',
     tracking_number TEXT NOT NULL DEFAULT '',
     destination TEXT NOT NULL DEFAULT '',
     category TEXT NOT NULL DEFAULT '',
     weight_kg DOUBLE PRECISION,
     price DOUBLE PRECISION NOT NULL DEFAULT 0,
     selling_price DOUBLE PRECISION,
     commission DOUBLE PRECISION NOT NULL DEFAULT 0,
     notes TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS client_orders_client_idx ON client_orders (client_id, created_at)',
  `CREATE TABLE IF NOT EXISTS client_payments (
     id SERIAL PRIMARY KEY,
     client_id INTEGER NOT NULL REFERENCES users(id),
     amount DOUBLE PRECISION NOT NULL,
     method TEXT NOT NULL DEFAULT '',
     note TEXT NOT NULL DEFAULT '',
     paid_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS portal_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  // Follow-ups / nudges on an order, between the client and us.
  `CREATE TABLE IF NOT EXISTS order_messages (
     id SERIAL PRIMARY KEY,
     order_id INTEGER NOT NULL REFERENCES client_orders(id),
     client_id INTEGER NOT NULL REFERENCES users(id),
     author TEXT NOT NULL CHECK (author IN ('client','admin')),
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
     read_by_client BOOLEAN NOT NULL DEFAULT FALSE)`,
  'CREATE INDEX IF NOT EXISTS order_messages_order_idx ON order_messages (order_id, created_at)',
  // Fee split: of the per-order fee ("commission"), this part goes to the supplier; the rest is ours.
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS supplier_share DOUBLE PRECISION NOT NULL DEFAULT 1',
  // A client can have their own supplier share (e.g. 0 when the supplier's quoted price is already the final price). Empty = the default in Fees & settings.
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS supplier_share_per_order DOUBLE PRECISION',
  // What the client sees on each order: product cost (our $2 fee is already inside it) + shipping fee = price.
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS product_cost DOUBLE PRECISION',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS shipping_fee DOUBLE PRECISION',
  // Client-provided Etsy sale details. Fulfilment values above are completed by the Direct Line team.
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS order_date TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD'",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS buyer_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS buyer_phone TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS address_line_1 TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS address_line_2 TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS postal_code TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS item_title TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sku TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1',
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS etsy_url TEXT NOT NULL DEFAULT ''",
  // Google Sheets is an operations mirror. The database remains authoritative if the external sync is unavailable.
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_sync_status TEXT NOT NULL DEFAULT 'waiting'",
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_synced_at INTEGER',
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_sync_error TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_sync_attempts INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS sheet_next_try INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS address_changed_at INTEGER',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS etsy_fee DOUBLE PRECISION',
  // Activity log: what happened to each order and when (powers notifications and the order timeline).
  `CREATE TABLE IF NOT EXISTS order_events (
     id SERIAL PRIMARY KEY,
     order_id INTEGER NOT NULL REFERENCES client_orders(id),
     client_id INTEGER NOT NULL REFERENCES users(id),
     kind TEXT NOT NULL,
     actor TEXT NOT NULL CHECK (actor IN ('client','admin')),
     detail TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS order_events_client_idx ON order_events (client_id, created_at)',
  'CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, created_at)',
  'CREATE INDEX IF NOT EXISTS order_events_actor_idx ON order_events (actor, created_at)',
  // When the client last opened their notifications (everything newer shows as "New").
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_seen_at INTEGER NOT NULL DEFAULT 0',
  // Archived clients (e.g. test accounts) are hidden from lists, totals and notifications and can't sign in.
  // Nothing is deleted: an admin can restore them.
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS archived_at INTEGER',
  // Client subscription (first month free, then a monthly price). Dates are YYYY-MM-DD.
  // Tracked by hand for now: nothing is charged or blocked automatically.
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login INTEGER',
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS edit_locked BOOLEAN NOT NULL DEFAULT FALSE',
  "UPDATE client_orders SET edit_locked=TRUE WHERE NOT edit_locked AND (status <> 'pending' OR EXISTS (SELECT 1 FROM order_events e WHERE e.order_id=client_orders.id AND e.kind='status' AND e.detail IN ('processing','shipped','delivered')))",
  // Where an order came from: '' = typed in the portal, 'etsy-csv' = imported from an Etsy orders file.
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_status TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_last_payment TEXT',
  // Screenshots / photos of the product that was ordered. The client attaches them with the order;
  // admins can add more. Stored as base64 (the browser shrinks them first), with a small thumbnail.
  `CREATE TABLE IF NOT EXISTS order_photos (
     id SERIAL PRIMARY KEY,
     order_id INTEGER NOT NULL REFERENCES client_orders(id),
     client_id INTEGER NOT NULL REFERENCES users(id),
     mime TEXT NOT NULL,
     data TEXT NOT NULL,
     thumb_mime TEXT NOT NULL DEFAULT '',
     thumb TEXT NOT NULL DEFAULT '',
     width INTEGER,
     height INTEGER,
     bytes INTEGER NOT NULL DEFAULT 0,
     added_by TEXT NOT NULL CHECK (added_by IN ('client','admin')),
     created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS order_photos_order_idx ON order_photos (order_id, id)',
  // Daniel's own stores shown in the dashboard: stores added by an admin, and removed (hidden) ones.
  // Built-in stores (zroyal, cursed, select, nerd) only get a row here when they are hidden/renamed.
  `CREATE TABLE IF NOT EXISTS dashboard_stores (
     key TEXT PRIMARY KEY,
     name TEXT NOT NULL DEFAULT '',
     platform TEXT NOT NULL DEFAULT '',
     url TEXT NOT NULL DEFAULT '',
     builtin BOOLEAN NOT NULL DEFAULT FALSE,
     hidden BOOLEAN NOT NULL DEFAULT FALSE,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL)`,
];

// Supplier shipping rates (USD per kg) — from the supplier's rate sheet. Admin-only: sent with
// /admin/overview so the admin pages can work out shipping. Clients never receive them.
// Total = rate × chargeable kg + $4 registration (+ $4 EU tax where marked).
SCHEMA.push(...TERMS_SCHEMA, ...FILE_SCHEMA, ...STATUS_SCHEMA, ...INVOICE_SCHEMA, ...PRODUCT_SCHEMA, ...CLAIM_SCHEMA, ...STORE_SCHEMA, ...STORAGE_SCHEMA, ...LOGIN_LIMIT_SCHEMA, ...SUPPLIER_SHEET_SCHEMA);
// Every change to a recorded payment is kept: what it was, what it became, and when.
SCHEMA.push(`CREATE TABLE IF NOT EXISTS payment_edits (
  id SERIAL PRIMARY KEY, payment_id INTEGER NOT NULL REFERENCES client_payments(id), field TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '', new_value TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`);

export const SHIPPING_RATES = {
    US: { name: 'United States', general: 18, battery: 20, cosmetic: 23 },
    UK: { name: 'United Kingdom', general: 10, battery: 12, cosmetic: 15 },
    CA: { name: 'Canada', general: 15, battery: 17, cosmetic: 20 },
    AU: { name: 'Australia', general: 15, battery: 17, cosmetic: 20 },
    DE: { name: 'Germany', general: 10, battery: 12, cosmetic: 15, eu: true },
    IT: { name: 'Italy', general: 10, battery: 12, cosmetic: 15, eu: true },
    FR: { name: 'France', general: 13, battery: 15, cosmetic: 17, eu: true },
    ES: { name: 'Spain', general: 15, battery: 17, cosmetic: 20, eu: true },
    NL: { name: 'Netherlands', general: 15, battery: 17, cosmetic: 20, eu: true },
    IL: { name: 'Israel', general: 18, battery: 20, cosmetic: 22 },
    // Not on the supplier's sheet yet. Estimated from the supplier's own rates:
    // EU countries use the highest EU level (+ EU tax); non-EU Europe uses the UK level.
    AT: { name: 'Austria', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    BE: { name: 'Belgium', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    BG: { name: 'Bulgaria', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    CZ: { name: 'Czechia', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    DK: { name: 'Denmark', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    LV: { name: 'Latvia', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    PL: { name: 'Poland', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    PT: { name: 'Portugal', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    SK: { name: 'Slovakia', general: 15, battery: 17, cosmetic: 20, eu: true, est: true },
    CH: { name: 'Switzerland', general: 10, battery: 12, cosmetic: 15, est: true },
    NO: { name: 'Norway', general: 10, battery: 12, cosmetic: 15, est: true },
  };
// Bank details clients see on Payments → "How to pay" (item #5). Editable in admin Fees & settings.
export function addressError(body) {
  if (!String(body.destination || '').trim() || body.destination === '__other') return 'Please choose a country.';
  if (['buyerName','address1'].some(k => !String(body[k] || '').trim())) return 'Please fill in the customer name and full address.';
  return null;
}
export const BANK_FIELDS = ['bank_currency', 'bank_holder', 'bank_account', 'bank_ach', 'bank_wire', 'bank_swift', 'bank_name', 'bank_address', 'bank_reference'];
const BANK_DEFAULTS = {
  bank_currency: 'USD', bank_holder: 'Guangzhou Huadu Beyond E-Commerce Firm', bank_account: '20000013048280',
  bank_ach: '028000024', bank_wire: '021000021', bank_swift: 'CHASUS33', bank_name: 'JP MORGAN CHASE BANK, N.A.',
  bank_address: '383 MADISON AVENUE, NEW YORK, NY 10179', bank_reference: 'Use your Direct Line username as the reference',
};
export const DEFAULT_SETTINGS = { commission_per_order: '2', supplier_share_per_order: '1', volumetric_divisor: '6000', subscription_price: '29', ...BANK_DEFAULTS };
// ---------- subscription (first month free, then monthly) ----------
export const SUB_STATUSES = ['trial', 'active', 'overdue', 'cancelled'];
export const isoDate = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v ? v : null);
// Today in Israel (the business runs on Israeli dates).
export const todayIso = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
// Same day next month (Jan 31 -> Feb 28/29).
export function addMonth(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}
export function subscriptionOut(u, settings, today = todayIso()) {
  const price = Number(settings.subscription_price ?? DEFAULT_SETTINGS.subscription_price);
  if (!u.trial_start && !u.sub_status) return { status: null, trialStart: null, trialEnd: null, lastPayment: u.sub_last_payment || null, price, currency: 'ILS' };
  const trialEnd = u.trial_end || null;
  const daysLeft = trialEnd ? Math.round((Date.parse(trialEnd + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : null;
  return { status: u.sub_status || 'trial', trialStart: u.trial_start || null, trialEnd, lastPayment: u.sub_last_payment || null, price, currency: 'ILS',
    trialDaysLeft: daysLeft, trialEnded: daysLeft !== null && daysLeft < 0 };
}
const now = () => Math.floor(Date.now() / 1000);

export const EDIT_WINDOW_SECONDS = 72 * 3600;
export function canEditOrder(order, at = now()) {
  const created = Number(order.created_at ?? order.createdAt);
  return order.status === 'pending' && !order.edit_locked && !order.editLocked && created > 0 && at < created + EDIT_WINDOW_SECONDS;
}
// Customer details (name, address, phone, country) stay editable by the client until the parcel ships, even after the
// 72-hour / Pending window closed. Everything else about the order keeps canEditOrder().
export const CUSTOMER_BODY_KEYS = ['buyerName', 'buyerPhone', 'address1', 'address2', 'city', 'region', 'postalCode', 'destination'];
export const CUSTOMER_COLUMNS = ['buyer_name', 'buyer_phone', 'address_line_1', 'address_line_2', 'city', 'region', 'postal_code', 'destination'];
// The client's own accounting (what their customer paid, in which currency, and the Etsy fee) never affects the bill,
// so it can be entered or corrected at any time, also on shipped orders.
export const ACCOUNTING_BODY_KEYS = ['sellingPrice', 'currency', 'etsyFee'];
export const accountingOnlyEdit = body => { const keys = Object.keys(body || {}); return keys.length > 0 && keys.every(k => ACCOUNTING_BODY_KEYS.includes(k)); };
// The Etsy fee is stored on its own (the long order INSERT/UPDATE stay as they are). Empty clears it.
async function saveEtsyFee(DB, id, body) {
  if (body.etsyFee === undefined) return undefined;
  const fee = money(body.etsyFee);
  await DB.prepare('UPDATE client_orders SET etsy_fee=? WHERE id=?').bind(fee, id).run();
  return fee;
}
const etsyFeeProblem = body => (body.etsyFee !== undefined && !isMoney(money(body.etsyFee)) ? 'The Etsy fee must be zero or more' : '');
export function canEditCustomer(order) { return ['pending', 'processing'].includes(order.status) && !order.archived; }
export const customerOnlyEdit = body => { const keys = Object.keys(body || {}); return keys.length > 0 && keys.every(k => CUSTOMER_BODY_KEYS.includes(k)); };
export async function clientSession(DB, who) {
  const u = await DB.prepare("SELECT active, archived, password_reset_required, session_version FROM users WHERE id = ? AND role = 'client'").bind(who.clientId).first();
  return u && u.active && !u.archived && (who.preview || Number(u.session_version || 0) === Number(who.sessionVersion || 0)) ? u : null;
}

// ---------- passwords (PBKDF2-SHA256) ----------
export async function hashPassword(password, iterations = 210000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(bits)}`;
}
export async function verifyPassword(password, stored) {
  const [scheme, iter, saltB64, hashB64] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(saltB64, 'base64url'), iterations: Number(iter) }, key, 256);
  const a = Buffer.from(bits), b = Buffer.from(hashB64, 'base64url');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- sessions (compatible with the Worker's dl_session) ----------
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, utf8.encode(value)));
}
export const REMEMBER_SECONDS = 30 * 24 * 3600; // "Remember me": 30 days
export async function createSessionCookie(role, secret, { remember = false } = {}) {
  const seconds = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
  const payload = role + '.' + (now() + seconds);
  const token = payload + '.' + await sign(payload, secret);
  return 'dl_session=' + encodeURIComponent(token) + `; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export async function readSessionRole(request, secret) {
  const match = (request.headers.get('cookie') || '').match(/(?:^|;\s*)dl_session=([^;]+)/);
  if (!match || !secret) return null;
  const parts = decodeURIComponent(match[1]).split('.');
  if (parts.length !== 3 || Number(parts[1]) < now()) return null;
  return (await sign(parts[0] + '.' + parts[1], secret)) === parts[2] ? parts[0] : null;
}
export function parseRole(role) {
  if (role === 'admin') return { admin: true };
  const m = /^client-(\d+)(?:-v(\d+))?$/.exec(role || '');
  return m ? { admin: false, clientId: Number(m[1]), sessionVersion: Number(m[2] || 0) } : null;
}

// ---------- helpers ----------
const money = v => (v === null || v === undefined || v === '' ? null : Number(v));
const isMoney = v => v === null || (Number.isFinite(v) && v >= 0 && v < 1e7);
const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const round2 = v => Math.round(Number(v || 0) * 100) / 100;

async function getSettings(DB) {
  const rows = (await DB.prepare('SELECT key, value FROM portal_settings').all()).results || [];
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map(r => [r.key, r.value])) };
}
function orderOut(r) {
  const price = Number(r.price || 0), sell = r.selling_price === null ? null : Number(r.selling_price);
  return {
    id: r.id, archived: !!r.archived, archivedAt: r.archived_at == null ? null : Number(r.archived_at), clientId: r.client_id, storeId:r.store_id==null?null:Number(r.store_id),productId:r.product_id==null?null:Number(r.product_id), quotedUnitPrice:r.quoted_unit_price==null?null:Number(r.quoted_unit_price), orderRef: r.order_ref, trackingNumber: r.tracking_number,
    destination: r.destination, category: r.category, weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
    // price = what the client pays for the order = product cost (incl. our hidden fee) + shipping fee.
    productCost: r.product_cost === null || r.product_cost === undefined ? null : Number(r.product_cost),
    shippingFee: r.shipping_fee === null || r.shipping_fee === undefined ? null : Number(r.shipping_fee),
    price, sellingPrice: sell, etsyFee: r.etsy_fee == null ? null : Number(r.etsy_fee), profit: sell === null ? null : round2(sell - price),
    orderDate: r.order_date || '', currency: r.currency || 'USD', buyerName: r.buyer_name || '', buyerPhone: r.buyer_phone || '',
    address1: r.address_line_1 || '', address2: r.address_line_2 || '', city: r.city || '', region: r.region || '', postalCode: r.postal_code || '',
    itemTitle: r.item_title || '', sku: r.sku || '', variant: r.variant || '', quantity: Number(r.quantity || 1), etsyUrl: r.etsy_url || '', productLinks: String(r.etsy_url || '').split(/\s+/).filter(Boolean),
    commission: Number(r.commission || 0), supplierShare: round2(r.supplier_share),
    ourShare: round2(Math.max(0, Number(r.commission || 0) - Number(r.supplier_share || 0))),
    reshipmentOf:r.reshipment_of==null?null:Number(r.reshipment_of),lastTrackingUpdateAt:r.last_tracking_update_at==null?null:Number(r.last_tracking_update_at),claimEligibility:claimEligibility(r),notes: r.notes, status: r.status, deliveredAt: r.delivered_at == null ? null : Number(r.delivered_at), cancellationReason: r.cancellation_reason || '', cancellationPreviousStatus: r.cancellation_previous_status || '', editLocked: !!r.edit_locked, source: r.source || '',
    sheetSyncStatus: r.sheet_sync_status || 'waiting',
    sheetSyncedAt: r.sheet_synced_at == null ? null : Number(r.sheet_synced_at),
    sheetSyncError: r.sheet_sync_error || '',
    // Supplier's total for the whole order (product + shipping), from the supplier Work Queue. Admin only.
    supplierCost: r.supplier_cost == null ? null : Number(r.supplier_cost),
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  };
}
// What a client may see of an order: total only, never the product vs shipping breakdown (item #6).
const CLIENT_HIDDEN = ['commission', 'supplierShare', 'ourShare', 'sheetSyncStatus', 'sheetSyncedAt', 'sheetSyncError', 'productCost', 'shippingFee', 'supplierCost'];
function clientOrder(o) {
  const out = { ...o, priced: o.productCost != null || o.shippingFee != null || o.quotedUnitPrice != null };
  for (const k of CLIENT_HIDDEN) delete out[k];
  return out;
}
// Adds message counts to orders: messages, unread (for the viewer's side).
async function withMessages(DB, orders, forAdmin) {
  if (!orders.length) return orders;
  const ids = orders.map(o => o.id);
  const rows = (await DB.prepare(`SELECT order_id, COUNT(*) AS total,
      COUNT(*) FILTER (WHERE author = 'client' AND NOT read_by_admin) AS unread_admin,
      COUNT(*) FILTER (WHERE author = 'admin' AND NOT read_by_client) AS unread_client,
      MAX(created_at) AS last_at
    FROM order_messages WHERE order_id IN (${ids.map(() => '?').join(',')}) GROUP BY order_id`).bind(...ids).all()).results || [];
  const by = new Map(rows.map(r => [Number(r.order_id), r]));
  const last = rows.length ? (await DB.prepare(`SELECT DISTINCT ON (order_id) order_id, author, body FROM order_messages
    WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY order_id, created_at DESC, id DESC`).bind(...ids).all()).results || [] : [];
  const lastBy = new Map(last.map(r => [Number(r.order_id), r]));
  return orders.map(o => {
    const r = by.get(o.id), m = lastBy.get(o.id);
    return { ...o, messages: Number(r?.total || 0), unreadMessages: Number((forAdmin ? r?.unread_admin : r?.unread_client) || 0), lastMessageAt: r ? Number(r.last_at) : null,
      lastMessage: m ? { author: m.author, body: String(m.body).slice(0, 160) } : null };
  });
}
const messageOut = m => ({ id: m.id, orderId: m.order_id, author: m.author, body: m.body, createdAt: Number(m.created_at) });
const eventOut = e => ({ id: e.id, orderId: e.order_id, clientId: e.client_id, kind: e.kind, actor: e.actor, detail: e.detail, createdAt: Number(e.created_at),
  ...(e.order_ref !== undefined ? { orderRef: e.order_ref, status: e.status } : {}), ...(e.client_name !== undefined ? { clientName: e.client_name } : {}) });
async function logEvent(DB, orderId, clientId, kind, actor, detail = '') {
  await DB.prepare('INSERT INTO order_events (order_id, client_id, kind, actor, detail, created_at) VALUES (?,?,?,?,?,?)')
    .bind(orderId, clientId, kind, actor, String(detail).slice(0, 200), now()).run();
}
const EDIT_FIELDS = ['store_id','order_ref', 'destination', 'category', 'weight_kg', 'product_cost', 'shipping_fee', 'selling_price', 'notes', 'order_date', 'currency', 'buyer_name', 'buyer_phone', 'address_line_1', 'address_line_2', 'city', 'region', 'postal_code', 'item_title', 'sku', 'variant', 'quantity', 'etsy_url'];
async function readBody(request) { return request.json().catch(() => ({})); }

// ---------- product photos ----------
export const MAX_PHOTOS_PER_ORDER = 8;
const PHOTO_MAX_BYTES = 1_500_000, THUMB_MAX_BYTES = 200_000;
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function decodeImage(dataUrl, maxBytes) {
  const m = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Photos must be JPG, PNG or WebP images');
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length) throw new Error('That photo is empty');
  if (buf.length > maxBytes) throw new Error('That photo is too large. Please use a smaller screenshot.');
  const mime = sniffImage(buf);
  if (!mime) throw new Error('That file isn’t a valid image');
  return { mime, b64: buf.toString('base64'), bytes: buf.length };
}
// Accepts { data, thumb?, width?, height? } (data URLs) and returns a row ready to insert.
function photoInput(p) {
  const full = decodeImage(p?.data, PHOTO_MAX_BYTES);
  const thumb = p?.thumb ? decodeImage(p.thumb, THUMB_MAX_BYTES) : full;
  const dim = v => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 20000 ? Number(v) : null);
  return { ...full, thumbMime: thumb.mime, thumbB64: thumb.b64, width: dim(p?.width), height: dim(p?.height) };
}
async function insertPhoto(DB, orderId, clientId, photo, by) {
  const row = await DB.prepare('INSERT INTO order_photos (order_id, client_id, mime, data, thumb_mime, thumb, width, height, bytes, added_by, created_at, blob_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id, order_id, width, height, added_by, created_at')
    .bind(orderId, clientId, photo.mime, photo.b64, photo.thumbMime, photo.thumbB64, photo.width, photo.height, photo.bytes, by, now(), photo.blobPath || null).first();
  return photoOut(row);
}
const photoOut = r => ({ id: Number(r.id), orderId: Number(r.order_id), width: r.width == null ? null : Number(r.width), height: r.height == null ? null : Number(r.height), addedBy: r.added_by, createdAt: Number(r.created_at) });
async function withPhotos(DB, orders) {
  if (!orders.length) return orders;
  const ids = orders.map(o => o.id);
  const rows = (await DB.prepare(`SELECT id, order_id, width, height, added_by, created_at FROM order_photos WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY order_id, id`).bind(...ids).all()).results || [];
  const by = new Map();
  for (const r of rows) { const k = Number(r.order_id); if (!by.has(k)) by.set(k, []); by.get(k).push(photoOut(r)); }
  return orders.map(o => ({ ...o, photos: by.get(o.id) || [] }));
}
// ---------- Daniel's dashboard stores ----------
const BUILTIN_STORES = ['zroyal', 'cursed', 'select', 'nerd'];
const STORE_PLATFORMS = ['Etsy', 'Shopify', 'Amazon', 'eBay', 'TikTok Shop', 'Website', 'Other'];
const storeOut = r => ({ key: r.key, name: r.name, platform: r.platform, url: r.url, builtin: !!r.builtin, hidden: !!r.hidden, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) });
function storeFields(body, needName) {
  const f = { name: text(body.name, 80), platform: text(body.platform, 30), url: text(body.url, 300) };
  if (needName && !f.name) throw new Error('Please enter the store name');
  if (f.platform && !STORE_PLATFORMS.includes(f.platform)) throw new Error('Unknown platform');
  if (f.url && !validLink(f.url)) throw new Error('Store link must start with https://');
  return f;
}
// The product link must be a real web address (usually the Etsy listing).
export const MAX_LINK_CHARS = 2000;
function validLink(value) {
  const v = String(value || '').trim();
  if (!/^https?:\/\//i.test(v) || v.length > MAX_LINK_CHARS) return false;
  try { const u = new URL(v); return /\./.test(u.hostname); } catch (e) { return false; }
}

// Up to 10 links, one per line. Links are kept whole (a cut-off link would still look valid), and a
// link pasted without https:// ("www.etsy.com/listing/…") is completed.
export function productLinks(value) {
  return String(value ?? '').split(/\s+/).map(v => v.trim()).filter(Boolean).slice(0, 10)
    .map(v => !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]|$)/i.test(v) ? 'https://' + v : v).join('\n');
}

function orderFields(body) {
  const f = {
    order_ref: text(body.orderRef, 120), tracking_number: text(body.trackingNumber, 120),
    destination: (d => (/^[a-z]{2}$/i.test(d) ? d.toUpperCase() : d))(text(body.destination, 60)), category: text(body.category, 20),
    weight_kg: money(body.weightKg), price: money(body.price), selling_price: money(body.sellingPrice),
    product_cost: money(body.productCost), shipping_fee: money(body.shippingFee),
    order_date: text(body.orderDate, 10), currency: text(body.currency || 'USD', 3).toUpperCase(),
    buyer_name: text(body.buyerName, 160), buyer_phone: text(body.buyerPhone, 80),
    address_line_1: text(body.address1, 2000), address_line_2: text(body.address2, 200), city: text(body.city, 100), region: text(body.region, 100), postal_code: text(body.postalCode, 40),
    item_title: text(body.itemTitle, 300), sku: text(body.sku, 120), variant: text(body.variant, 500), quantity: Number(body.quantity ?? 1), etsy_url: productLinks(body.etsyUrl),
    notes: text(body.notes, 2000),
  };
  if (![f.weight_kg, f.price, f.selling_price, f.product_cost, f.shipping_fee].every(isMoney)) throw new Error('Numbers must be zero or more');
  if (f.order_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.order_date)) throw new Error('Order date must be a valid date');
  if (!/^[A-Z]{3}$/.test(f.currency)) throw new Error('Currency must use a three-letter code');
  if (!Number.isInteger(f.quantity) || f.quantity < 1 || f.quantity > 999) throw new Error('Quantity must be between 1 and 999');
  // When the parts are given, the price is their sum.
  if (f.product_cost !== null || f.shipping_fee !== null) f.price = round2((f.product_cost || 0) + (f.shipping_fee || 0));
  if (f.price === null) f.price = 0;
  return f;
}

// Saves one new order (+ photos), logs it and syncs it to the Google Sheet.
async function insertOrder(DB, env, waitUntil, client, f, photos, actor, source, settings) {
  const clientId = client.id;
  const commission = client.commission_per_order ?? Number(settings.commission_per_order);
  const supplierShare = Math.min(commission, client.supplier_share_per_order ?? (Number(settings.supplier_share_per_order) || 0));
  const t = now();
  const row = await DB.prepare('INSERT INTO client_orders (client_id, order_ref, tracking_number, destination, category, weight_kg, price, selling_price, product_cost, shipping_fee, commission, supplier_share, notes, status, created_at, updated_at, order_date, currency, buyer_name, buyer_phone, address_line_1, address_line_2, city, region, postal_code, item_title, sku, variant, quantity, etsy_url, source, product_id, quoted_unit_price,store_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
    .bind(clientId, f.order_ref, f.tracking_number, f.destination, f.category, f.weight_kg, f.price, f.selling_price, f.product_cost, f.shipping_fee, commission, supplierShare, f.notes, 'pending', t, t, f.order_date, f.currency, f.buyer_name, f.buyer_phone, f.address_line_1, f.address_line_2, f.city, f.region, f.postal_code, f.item_title, f.sku, f.variant, f.quantity, f.etsy_url, source,f.product_id||null,f.quoted_unit_price??null,f.store_id).first();
  const saved = [];
  for (const p of photos) saved.push(await insertPhoto(DB, row.id, clientId, p, actor));
  await logEvent(DB, row.id, clientId, 'created', actor);
  const sheetSync = syncPortalOrderToGoogleSheet(DB, env, row.id).catch(error => console.error('Google Sheets order sync failed', error));
  if (waitUntil) waitUntil(sheetSync); else await sheetSync;
  return { row, saved };
}

async function clientSummary(DB, clientId, settings) {
  const o = await DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(price),0) AS billed, COALESCE(SUM(commission),0) AS commission, COALESCE(SUM(LEAST(supplier_share, commission)),0) AS supplier, COALESCE(SUM(selling_price - price) FILTER (WHERE selling_price IS NOT NULL),0) AS profit FROM client_orders WHERE client_id = ? AND status <> 'cancelled'").bind(clientId).first();
  const p = await DB.prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM client_payments WHERE client_id = ? AND NOT archived').bind(clientId).first();
  const performance=await clientPerformance(DB,clientId);
  const billed = performance.totals.billed, paid = round2(p.paid);
  const commission = round2(o.commission), supplierShare = round2(o.supplier);
  return { orders: Number(o.n), billed, paid, outstanding: round2(billed - paid), commission, supplierShare, ourShare: round2(commission - supplierShare), clientProfit: performance.totals.profit };
}

// ---------- request handler ----------
// Returns a Response for /api/portal/* routes, or null if the path isn't ours.
export async function handlePortal(request, url, ctx) {
  const { DB, env, waitUntil } = ctx;
  const path = url.pathname.replace(/^\/api\/portal/, '') || '/';
  const method = request.method;
  if (!DB) return json({ ok: false, error: 'Database is not configured' }, 503);

  const sheetPhoto = /^\/sheet-photos\/([1-9]\d*)\/([1-9]\d*)$/.exec(path);
  if (sheetPhoto && method === 'GET') return serveSheetPhoto(DB,env,url,Number(sheetPhoto[1]),Number(sheetPhoto[2]));

  // Public: login
  if (path === '/login' && method === 'POST') {
    const body = await readBody(request);
    const signed = await signIn(DB, env, request, text(body.username, 120), String(body.password || ''));
    if (signed.retryAfter) return json({ ok: false, error: LOCK_MESSAGE }, 429, { 'retry-after': String(signed.retryAfter) });
    const role = signed.role;
    if (!role) return json({ ok: false, error: 'Invalid credentials' }, 401);
    const info = parseRole(role);
    return json({ ok: true, role: info.admin ? 'admin' : 'client', redirect: info.admin ? '/admin/' : '/portal/' }, 200,
      { 'set-cookie': await createSessionCookie(role, env.APP_SESSION_SECRET, { remember: body.remember === true }) });
  }

  const role = await readSessionRole(request, env.APP_SESSION_SECRET);
  let who = parseRole(role);
  if (!who) return json({ ok: false, error: 'Unauthorized' }, 401);
  // Admin preview of a client's portal ("see what the client sees"): read-only.
  const viewAs = request.headers.get('x-dl-view-as');
  if (who.admin && viewAs) {
    if (method !== 'GET') return json({ ok: false, error: 'Preview is view only. Sign in as the client to make changes.' }, 403);
    const vid = Number(viewAs);
    const c = Number.isInteger(vid) && vid > 0 ? await DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'client'").bind(vid).first() : null;
    if (!c) return json({ ok: false, error: 'Unknown client' }, 404);
    who = { admin: false, clientId: c.id, preview: true };
  }
  if (!who.admin) {
    const me = await clientSession(DB, who);
    if (!me) return json({ ok: false, error: 'Please sign in again.' }, 401);
    if (!who.preview && me.password_reset_required) {
      if (path === '/me' && method === 'GET') return json({ ok: true, role: 'client', passwordResetRequired: true });
      if (path !== '/password') return json({ ok: false, error: 'Choose a new password to continue.' }, 423);
    }
    if (!who.preview) {
      const policy = await currentTerms(DB), accepted = await termsAcceptance(DB,who.clientId,policy.version);
      if (!accepted) {
        if (path === '/me' && method === 'GET') return json({ ok: true, role: 'client', termsRequired: true });
        if (!['/terms', '/terms/accept', '/password'].includes(path)) return json({ ok: false, error: 'Please accept the Terms of Service to continue.' }, 423);
      }
    }
  }
  if (path === '/terms' && method === 'GET') {
    const policy = await currentTerms(DB), accepted = who.admin ? null : await termsAcceptance(DB,who.clientId,policy.version);
    return json({ ok: true, policy, accepted });
  }
  if (path === '/terms/accept' && method === 'POST' && !who.admin && !who.preview) {
    const policy = await currentTerms(DB), body = (await readBody(request)) || {};
    if (body.accepted !== true) return json({ ok: false, error: 'Please tick the agreement checkbox.' }, 400);
    if (body.version !== policy.version) return json({ ok: false, error: 'The terms have changed. Please reload and read the current version.' }, 409);
    return json({ ok: true, accepted: await acceptTerms(DB,who.clientId,policy.version,request) });
  }
  const fileMatch=/^\/files\/(\d+)$/.exec(path);
  if (fileMatch && method === 'GET') return downloadFile(DB,Number(fileMatch[1]),who,url,env);
  if (path === '/transfers' && method === 'GET' && !who.admin) return json({ ok:true, transfers:await transfers(DB,who.clientId) });
  if (path === '/transfers' && method === 'POST' && !who.admin && !who.preview) {
    try { return json({ ok:true, transfer:await saveTransfer(DB,who.clientId,await readBody(request)) }); }
    catch(e) { return json({ ok:false,error:e.message },400); }
  }
  if (path === '/password' && method === 'POST' && !who.admin && !who.preview) {
    const u = await DB.prepare('SELECT password_hash, password_reset_required, session_version FROM users WHERE id = ?').bind(who.clientId).first();
    const body = await readBody(request), password = String(body.password || '');
    if (password.length < 8 || password.length > 128) return json({ ok: false, error: 'Use 8 to 128 characters for your password.' }, 400);
    if (!u.password_reset_required && !await verifyPassword(String(body.currentPassword || ''), u.password_hash)) return json({ ok: false, error: 'Wrong current password.' }, 400);
    if (await verifyPassword(password, u.password_hash)) return json({ ok: false, error: 'Choose a different password.' }, 400);
    const changed = await DB.prepare('UPDATE users SET password_hash=?, password_reset_required=FALSE, session_version=session_version+1 WHERE id=? AND session_version=? RETURNING session_version').bind(await hashPassword(password), who.clientId, Number(u.session_version || 0)).first();
    if (!changed) return json({ ok: false, error: 'Please sign in again.' }, 401);
    return json({ ok: true }, 200, { 'set-cookie': await createSessionCookie('client-' + who.clientId + '-v' + changed.session_version, env.APP_SESSION_SECRET) });
  }

  if (path === '/me' && method === 'GET') {
    const settings = await getSettings(DB);
    if (who.admin) return json({ ok: true, role: 'admin', name: 'Admin', settings });
    const u = await DB.prepare('SELECT id, username, display_name, active, trial_start, trial_end, sub_status, sub_last_payment FROM users WHERE id = ?').bind(who.clientId).first();
    if (!u || !u.active) return json({ ok: false, error: 'Account disabled' }, 403);
    return json({ ok: true, role: 'client', preview: !!who.preview, id: u.id, username: u.username, name: u.display_name, settings: { volumetric_divisor: settings.volumetric_divisor, ...Object.fromEntries(BANK_FIELDS.map(k => [k, settings[k] || ''])) }, subscription: subscriptionOut(u, settings), summary: (({ commission, supplierShare, ourShare, ...rest }) => rest)(await clientSummary(DB, u.id, settings)) });
  }

  // Archived orders are read-only for admins and unavailable to clients.
  const scopedOrder = /^\/orders\/(\d+)(?:\/|$)/.exec(path);
  if (scopedOrder) {
    const order = await DB.prepare('SELECT archived FROM client_orders WHERE id=?').bind(Number(scopedOrder[1])).first();
    if (order?.archived && (!who.admin || method !== 'GET')) return json({ok:false,error:who.admin ? 'Restore this order before making changes.' : 'Not found'},who.admin ? 409 : 404);
  }
  // ----- client routes -----
  if (path === '/orders' && method === 'GET' && !who.admin) {
    const rows = (await DB.prepare('SELECT * FROM client_orders WHERE client_id = ? AND NOT archived ORDER BY created_at DESC, id DESC').bind(who.clientId).all()).results || [];
    return json({ ok: true, orders: await withPhotos(DB, await withMessages(DB, rows.map(orderOut).map(clientOrder), false)) });
  }
  if (path === '/payments' && method === 'GET' && !who.admin) {
    const rows = (await DB.prepare('SELECT * FROM client_payments WHERE client_id = ? AND NOT archived ORDER BY paid_at DESC, id DESC').bind(who.clientId).all()).results || [];
    return json({ ok: true, payments: rows.map(r => ({ id: r.id, amount: Number(r.amount), method: r.method, note: r.note, paidAt: Number(r.paid_at) })), invoices: await invoices(DB,who.clientId), adjustments: await balanceAdjustments(DB,who.clientId), transfers: await transfers(DB,who.clientId) });
  }
  if (path==='/invoices/month' && method==='GET' && !who.admin) return monthlyInvoices(DB,who.clientId,url.searchParams.get('month'),env);
  if(path==='/client-stores'&&!who.admin){if(method==='GET')return json({ok:true,stores:await clientStores(DB,who.clientId)});if(method==='POST'){try{const store=await saveStore(DB,who.clientId,null,await readBody(request));return store?json({ok:true,store}):json({ok:false,error:'Not found'},404);}catch(e){return json({ok:false,error:e.message},400);}}}
  const storeEdit=/^\/client-stores\/(\d+)$/.exec(path);if(storeEdit&&method==='POST'&&!who.admin){try{const store=await saveStore(DB,who.clientId,Number(storeEdit[1]),await readBody(request));return store?json({ok:true,store}):json({ok:false,error:'Not found'},404);}catch(e){return json({ok:false,error:e.message},400);}}
  if(path==='/products' && !who.admin){if(method==='GET')return json({ok:true,products:await products(DB,who.clientId)});if(method==='POST'){try{return json({ok:true,product:await addProduct(DB,who.clientId,await readBody(request))});}catch(e){return json({ok:false,error:e.message},400);}}}
  const productImage=/^\/products\/(\d+)\/photos\/(\d+)$/.exec(path);if(productImage&&method==='GET')return productPhoto(DB,Number(productImage[1]),Number(productImage[2]),who,env);
  if (path === '/orders' && method === 'POST') {
    const body = await readBody(request);
    const clientId = who.admin ? Number(body.clientId) : who.clientId;
    const client = await DB.prepare("SELECT id, commission_per_order, supplier_share_per_order, active FROM users WHERE id = ? AND role = 'client'").bind(clientId).first();
    if (!client || !client.active) return json({ ok: false, error: 'Unknown client' }, 400);
    if (!text(body.destination, 60) || text(body.destination, 60) === '__other') return json({ ok: false, error: 'Please choose a country.' }, 400);
    const addressProblem = addressError(body);
    if (addressProblem) return json({ ok: false, error: addressProblem }, 400);
    let f; try { f = orderFields(body); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    if (!who.admin) {
      f.tracking_number = ''; f.category = ''; f.weight_kg = null;
      f.product_cost = null; f.shipping_fee = null; f.price = 0;
    }
    try{f.store_id=await orderStore(DB,clientId,body.storeId);}catch(e){return json({ok:false,error:e.message},400);}
    let savedProduct=null,productPhotos=[];
    if(body.productId){
      savedProduct=await DB.prepare("SELECT * FROM portal_products WHERE id=? AND client_id=? AND status='approved'").bind(Number(body.productId),clientId).first();
      if(!savedProduct)return json({ok:false,error:'Choose an approved product belonging to your account.'},400);
      if(body.quotedUnitPrice!==undefined && Number(body.quotedUnitPrice)!==Number(savedProduct.unit_price))return json({ok:false,error:'The product quote changed. Refresh and review the price before sending.'},409);
      f.product_id=savedProduct.id;f.quoted_unit_price=Number(savedProduct.unit_price);f.price=round2(f.quoted_unit_price*f.quantity);if(f.price>=1e7)return json({ok:false,error:'Order total is too large.'},400);f.product_cost=null;f.shipping_fee=null;f.etsy_url=savedProduct.link;f.item_title=savedProduct.name;
      productPhotos=(await DB.prepare('SELECT * FROM portal_product_photos WHERE product_id=? ORDER BY id').bind(savedProduct.id).all()).results||[];
    }
    // Clients must show us what was ordered: the product link plus at least one photo / screenshot.
    if (f.etsy_url && !f.etsy_url.split('\n').every(validLink)) return json({ ok: false, error: 'Please paste each product link in full, starting with https://' }, 400);
    if (!who.admin && !f.etsy_url) return json({ ok: false, error: 'Please add the product link from your store.' }, 400);
    const photoBodies = savedProduct ? [] : Array.isArray(body.photos) ? body.photos : [];
    if (photoBodies.length > MAX_PHOTOS_PER_ORDER) return json({ ok: false, error: `Up to ${MAX_PHOTOS_PER_ORDER} photos per order` }, 400);
    let photos; try { photos = savedProduct ? productPhotos.map(p=>({mime:p.mime,b64:p.data,blobPath:p.blob_path,bytes:p.bytes,thumbMime:'',thumbB64:'',width:null,height:null})) : photoBodies.map(photoInput); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    if (!who.admin && !photos.length) return json({ ok: false, error: 'Please add at least one photo or screenshot of the product.' }, 400);
    if (etsyFeeProblem(body)) return json({ ok: false, error: etsyFeeProblem(body) }, 400);
    const settings = await getSettings(DB);
    const { row, saved } = await insertOrder(DB, env, waitUntil, client, f, photos, who.admin ? 'admin' : 'client', '', settings);
    const newFee = await saveEtsyFee(DB, row.id, body); if (newFee !== undefined) row.etsy_fee = newFee;
    const out = { ...orderOut(row), photos: saved };
    return json({ ok: true, order: who.admin ? out : clientOrder(out) });
  }
  // ----- notifications: what the other side did, newest first -----
  if (path === '/notifications' && method === 'GET' && !who.admin) {
    const rows = (await DB.prepare("SELECT e.*, o.order_ref, o.status FROM order_events e JOIN client_orders o ON o.id = e.order_id WHERE e.client_id = ? AND NOT o.archived AND e.actor = 'admin' ORDER BY e.created_at DESC, e.id DESC LIMIT 50").bind(who.clientId).all()).results || [];
    for(const f of await invoices(DB,who.clientId)) rows.push({id:'invoice-'+f.id,order_id:f.orderIds[0]||null,client_id:who.clientId,kind:'invoice',actor:'admin',detail:f.filename,created_at:f.createdAt});
    rows.sort((a,b)=>Number(b.created_at)-Number(a.created_at));
    const u = await DB.prepare('SELECT notif_seen_at FROM users WHERE id = ?').bind(who.clientId).first();
    return json({ ok: true, items: [...rows.map(eventOut),...await productEvents(DB,who.clientId)].sort((a,b)=>b.createdAt-a.createdAt).slice(0,50), seenAt: Number(u?.notif_seen_at || 0), now: now() });
  }
  if (path === '/notifications/seen' && method === 'POST' && !who.admin) {
    await DB.prepare('UPDATE users SET notif_seen_at = ? WHERE id = ?').bind(now(), who.clientId).run();
    return json({ ok: true, seenAt: now() });
  }
  // ----- follow-up messages on an order (client ↔ us) -----
  const msgMatch = /^\/orders\/(\d+)\/messages$/.exec(path);
  if (msgMatch) {
    const id = Number(msgMatch[1]);
    const order = await DB.prepare('SELECT id, client_id FROM client_orders WHERE id = ?').bind(id).first();
    if (!order || (!who.admin && order.client_id !== who.clientId)) return json({ ok: false, error: 'Not found' }, 404);
    if (method === 'POST') {
      const body = await readBody(request);
      const msg = text(body.body, 2000);
      if (!msg) return json({ ok: false, error: 'Please write a message' }, 400);
      await DB.prepare('INSERT INTO order_messages (order_id, client_id, author, body, created_at, read_by_admin, read_by_client) VALUES (?,?,?,?,?,?,?)')
        .bind(id, order.client_id, who.admin ? 'admin' : 'client', msg, now(), who.admin, !who.admin).run();
      await logEvent(DB, id, order.client_id, 'message', who.admin ? 'admin' : 'client', msg);
    } else if (method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
    // Reading the thread marks the other side's messages as read (not in admin preview).
    if (!who.preview) await DB.prepare(who.admin ? "UPDATE order_messages SET read_by_admin = TRUE WHERE order_id = ? AND author = 'client'"
      : "UPDATE order_messages SET read_by_client = TRUE WHERE order_id = ? AND author = 'admin'").bind(id).run();
    const rows = (await DB.prepare('SELECT * FROM order_messages WHERE order_id = ? ORDER BY created_at, id').bind(id).all()).results || [];
    const events = (await DB.prepare("SELECT * FROM order_events WHERE order_id = ? AND kind <> 'message' ORDER BY created_at, id").bind(id).all()).results || [];
    return json({ ok: true, messages: rows.map(messageOut), events: events.map(eventOut) });
  }
  if(path==='/claims'&&method==='GET'&&!who.admin)return json({ok:true,claims:await claims(DB,who.clientId)});
  const newClaim=/^\/orders\/(\d+)\/claims$/.exec(path);if(newClaim&&method==='POST'&&!who.admin){const order=await DB.prepare('SELECT * FROM client_orders WHERE id=? AND client_id=?').bind(Number(newClaim[1]),who.clientId).first();if(!order)return json({ok:false,error:'Not found'},404);try{return json({ok:true,claim:await submitClaim(DB,order,await readBody(request))});}catch(e){return json({ok:false,error:e.message},409);}}
  const statusAction = /^\/orders\/(\d+)\/(request-cancellation|approve-cancellation|reject-cancellation|mark-delivered)$/.exec(path);
  if (statusAction && method === 'POST') {
    const existing = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(Number(statusAction[1])).first();
    if (!existing || !who.admin && Number(existing.client_id)!==Number(who.clientId)) return json({ok:false,error:'Not found'},404);
    try {
      const row = await changeStatus(DB,existing,statusAction[2],await readBody(request),who.admin);
      const sync = syncPortalOrderToGoogleSheet(DB,env,row.id).catch(()=>{});if(waitUntil)waitUntil(sync);
      const out=orderOut(row);return json({ok:true,order:who.admin?out:clientOrder(out)});
    } catch(e) {return json({ok:false,error:e.message},e.status||409);}
  }
  const orderMatch = /^\/orders\/(\d+)$/.exec(path);
  if (orderMatch && (method === 'PUT' || method === 'POST')) {
    const id = Number(orderMatch[1]);
    let existing = await DB.prepare('SELECT * FROM client_orders WHERE id = ?').bind(id).first();
    if (!existing || (!who.admin && existing.client_id !== who.clientId)) return json({ ok: false, error: 'Not found' }, 404);
    const body = await readBody(request);
    if (body.status !== undefined) {
      if (Object.keys(body).some(k=>!['status','fee','reason'].includes(k))) return json({ok:false,error:'Change status separately from order details.'},400);
      try { const row=await changeStatus(DB,existing,'status',body,who.admin);const out=orderOut(row);const sync=syncPortalOrderToGoogleSheet(DB,env,row.id).catch(()=>{});if(waitUntil)waitUntil(sync);return json({ok:true,order:who.admin?out:clientOrder(out)}); }
      catch(e){return json({ok:false,error:e.message},e.status||409);}
    }
    const locked = !who.admin && !canEditOrder(existing);
    const accountingOnly = locked && accountingOnlyEdit(body);
    const customerOnly = locked && !accountingOnly && customerOnlyEdit(body) && canEditCustomer(existing);
    if (locked && !accountingOnly && !customerOnly) {
      return json({ ok: false, error: customerOnlyEdit(body) ? 'This order has already shipped, so the customer details can no longer be changed. Need help? Send us a message.' : 'This order is already being processed. Need a change? Send us a message.' }, 409);
    }
    if (etsyFeeProblem(body)) return json({ ok: false, error: etsyFeeProblem(body) }, 400);
    if (!accountingOnly && (!who.admin || body.destination !== undefined) && (!text(body.destination ?? existing.destination, 60) || text(body.destination ?? existing.destination, 60) === '__other')) return json({ ok: false, error: 'Please choose a country.' }, 400);
    // Partial status/billing updates leave historical addresses untouched. Detail edits need complete shipping fields.
    if (!accountingOnly && (!who.admin || ['buyerName','address1','address2','city','region','postalCode','buyerPhone','destination'].some(k => body[k] !== undefined))) {
      const addressProblem = addressError({ ...orderOut(existing), ...body });
      if (addressProblem) return json({ ok: false, error: addressProblem }, 400);
    }
    let f; try { f = orderFields({ ...orderOut(existing), ...body }); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    const status = existing.status;
    let commission = existing.commission, supplierShare = existing.supplier_share;
    if (who.admin) {
      // The fee on this order and what the supplier gets can be set per order; the rest of the fee is ours.
      for (const [key, label] of [['commission', 'fee'], ['supplierShare', 'supplier share']]) if (body[key] != null && body[key] !== '' && !isMoney(money(body[key]))) return json({ ok: false, error: `Invalid ${label}` }, 400);
      if (body.commission != null && body.commission !== '') commission = money(body.commission);
      if (body.supplierShare != null && body.supplierShare !== '') supplierShare = money(body.supplierShare);
      if (Number(supplierShare) > Number(commission)) return json({ ok: false, error: "The supplier's share can't be more than the fee on this order" }, 400);
    }
    if (!who.admin) {
      f.tracking_number = existing.tracking_number; f.category = existing.category; f.weight_kg = existing.weight_kg;
      f.product_cost = existing.product_cost; f.shipping_fee = existing.shipping_fee; f.price = existing.price;
    }
    try{f.store_id=await orderStore(DB,existing.client_id,body.storeId,Number(existing.store_id),who.admin);}catch(e){return json({ok:false,error:e.message},400);}
    if(existing.quoted_unit_price!=null){f.price=round2(Number(existing.quoted_unit_price)*f.quantity);if(f.price>=1e7)return json({ok:false,error:'Order total is too large.'},400);f.product_cost=existing.product_cost;f.shipping_fee=existing.shipping_fee;f.etsy_url=existing.etsy_url;f.item_title=existing.item_title;}
    if (body.etsyUrl !== undefined) {
      if (f.etsy_url && !f.etsy_url.split('\n').every(validLink)) return json({ ok: false, error: 'Please paste each product link in full, starting with https://' }, 400);
      if (!who.admin && !f.etsy_url) return json({ ok: false, error: 'Please add the product link from your store.' }, 400);
    }
    const row = await DB.prepare('UPDATE client_orders SET order_ref=?, tracking_number=?, destination=?, category=?, weight_kg=?, price=?, selling_price=?, product_cost=?, shipping_fee=?, notes=?, status=?, commission=?, supplier_share=?, updated_at=?, order_date=?, currency=?, buyer_name=?, buyer_phone=?, address_line_1=?, address_line_2=?, city=?, region=?, postal_code=?, item_title=?, sku=?, variant=?, quantity=?, etsy_url=?, store_id=?,edit_locked=edit_locked OR ?,last_tracking_update_at=CASE WHEN tracking_number<>? THEN ? ELSE last_tracking_update_at END WHERE id = ? AND status=? AND (? OR ? OR (? AND status IN (\'pending\',\'processing\')) OR (status=\'pending\' AND NOT edit_locked AND created_at > ?)) RETURNING *')
      .bind(f.order_ref, f.tracking_number, f.destination, f.category, f.weight_kg, f.price, f.selling_price, f.product_cost, f.shipping_fee, f.notes, status, commission, supplierShare, now(), f.order_date, f.currency, f.buyer_name, f.buyer_phone, f.address_line_1, f.address_line_2, f.city, f.region, f.postal_code, f.item_title, f.sku, f.variant, f.quantity, f.etsy_url, f.store_id,['processing','shipped','delivered','cancelled'].includes(status),f.tracking_number,now(), id, existing.status, who.admin, accountingOnly, customerOnly, now() - EDIT_WINDOW_SECONDS).first();
    if (!row) return json({ ok: false, error: customerOnlyEdit(body) && !who.admin ? 'This order has already shipped, so the customer details can no longer be changed. Need help? Send us a message.' : 'This order is already being processed. Need a change? Send us a message.' }, 409);
    const actor = who.admin ? 'admin' : 'client';
    if (row.status !== existing.status) await logEvent(DB, id, existing.client_id, 'status', actor, row.status);
    if (row.tracking_number !== existing.tracking_number && row.tracking_number) await logEvent(DB, id, existing.client_id, 'tracking', actor, row.tracking_number);
    const fee = await saveEtsyFee(DB, id, body); if (fee !== undefined) row.etsy_fee = fee;
    const changed = EDIT_FIELDS.filter(k => String(row[k] ?? '') !== String(existing[k] ?? ''));
    if (changed.length && !accountingOnly) await logEvent(DB, id, existing.client_id, 'edited', actor, changed.every(k => CUSTOMER_COLUMNS.includes(k)) ? 'customer' : '');
    // The supplier may already be working on it: flag the Work Queue row until the parcel ships (see websiteCells).
    if (row.status === 'processing' && changed.some(k => CUSTOMER_COLUMNS.includes(k))) {
      await DB.prepare('UPDATE client_orders SET address_changed_at=? WHERE id=?').bind(now(), id).run();
      row.address_changed_at = now();
    }
    const sheetSync = syncPortalOrderToGoogleSheet(DB, env, id).catch(error => console.error('Google Sheets order update failed', error));
    if (waitUntil) waitUntil(sheetSync); else await sheetSync;
    const [out] = await withPhotos(DB, [orderOut(row)]);
    return json({ ok: true, order: who.admin ? out : clientOrder(out) });
  }

  // ----- product photos on an order -----
  const photoAdd = /^\/orders\/(\d+)\/photos$/.exec(path);
  const photoOne = /^\/orders\/(\d+)\/photos\/(\d+)(\/delete)?$/.exec(path);
  if (photoAdd || photoOne) {
    const id = Number((photoAdd || photoOne)[1]);
    const order = await DB.prepare('SELECT id, client_id, status, created_at, edit_locked FROM client_orders WHERE id = ?').bind(id).first();
    if (!order || (!who.admin && order.client_id !== who.clientId)) return json({ ok: false, error: 'Not found' }, 404);
    const actor = who.admin ? 'admin' : 'client';
    if (method === 'POST' && !who.admin && !canEditOrder(order)) return json({ ok: false, error: 'This order is already being processed. Need a change? Send us a message.' }, 409);
    if (photoAdd && method === 'POST') {
      if (!who.admin && order.status === 'cancelled') return json({ ok: false, error: 'This order was cancelled.' }, 409);
      const count = Number((await DB.prepare('SELECT COUNT(*) AS n FROM order_photos WHERE order_id = ?').bind(id).first()).n);
      if (count >= MAX_PHOTOS_PER_ORDER) return json({ ok: false, error: `Up to ${MAX_PHOTOS_PER_ORDER} photos per order` }, 400);
      let photo; try { photo = photoInput(await readBody(request)); } catch (e) { return json({ ok: false, error: e.message }, 400); }
      const out = await insertPhoto(DB, id, order.client_id, photo, actor);
      await logEvent(DB, id, order.client_id, 'photo', actor, 'added');
      await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE id=?").bind(id).run();
      const sync = syncPortalOrderToGoogleSheet(DB,env,id).catch(error=>console.error('Photo sheet sync failed',error));
      if(waitUntil)waitUntil(sync);else await sync;
      return json({ ok: true, photo: out });
    }
    if (photoOne && photoOne[3] && method === 'POST') {
      const pid = Number(photoOne[2]);
      const photo = await DB.prepare('SELECT id FROM order_photos WHERE id = ? AND order_id = ?').bind(pid, id).first();
      if (!photo) return json({ ok: false, error: 'Not found' }, 404);
      if (!who.admin) {
        if (['shipped', 'delivered', 'cancelled'].includes(order.status)) return json({ ok: false, error: 'This order is already being handled. Message us if a photo needs to change.' }, 409);
        const count = Number((await DB.prepare('SELECT COUNT(*) AS n FROM order_photos WHERE order_id = ?').bind(id).first()).n);
        if (count <= 1) return json({ ok: false, error: 'An order needs at least one photo. Add the new one first, then remove this one.' }, 409);
      }
      await DB.prepare('DELETE FROM order_photos WHERE id = ? AND order_id = ?').bind(pid, id).run();
      await logEvent(DB, id, order.client_id, 'photo', actor, 'removed');
      await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE id=?").bind(id).run();
      const sync = syncPortalOrderToGoogleSheet(DB,env,id).catch(error=>console.error('Photo sheet sync failed',error));
      if(waitUntil)waitUntil(sync);else await sync;
      return json({ ok: true });
    }
    if (photoOne && !photoOne[3] && method === 'GET') {
      const row = await DB.prepare('SELECT mime, data, blob_path, thumb_mime, thumb, thumb_blob_path FROM order_photos WHERE id = ? AND order_id = ?').bind(Number(photoOne[2]), id).first();
      const image = row && await photoBytes(env, row, url.searchParams.get('size') === 'thumb');
      if (!image?.bytes) return new Response('Not found', { status: 404 });
      return new Response(image.bytes, { headers: {
        'content-type': image.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", 'content-disposition': 'inline',
      } });
    }
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  // ----- admin-only routes -----
  if (!who.admin) return json({ ok: false, error: 'Forbidden' }, 403);

  if (path === '/admin/terms' && method === 'POST') {
    try { return json({ ok: true, policy: await publishTerms(DB,await readBody(request)) }); }
    catch (e) { return json({ ok: false, error: e.message }, 400); }
  }
  if (path === '/admin/transfers' && method === 'GET') return json({ ok:true, transfers:await transfers(DB,Number(url.searchParams.get('clientId') || 0)) });
  const recordMatch=/^\/admin\/transfers\/(\d+)\/record$/.exec(path);
  if (recordMatch && method === 'POST') {
    const transfer=await recordTransfer(DB,Number(recordMatch[1]));
    return transfer ? json({ok:true,transfer}) : json({ok:false,error:'Not found'},404);
  }
  const restorePayment=/^\/admin\/payments\/(\d+)\/restore$/.exec(path);
  if (restorePayment && method === 'POST') {
    await DB.prepare('UPDATE client_payments SET archived=FALSE WHERE id=?').bind(Number(restorePayment[1])).run();
    return json({ok:true});
  }
  // ----- file storage + backups (admin Settings → Storage & backups) -----
  // ----- supplier Work Queue in the Google Sheet (admin Settings → Supplier sheet) -----
  if (path === '/admin/supplier-sheet' && method === 'GET') return json({ ok: true, ...(await supplierSheetStatus(DB, env)) });
  if (path === '/admin/supplier-sheet/setup' && method === 'POST') {
    try { return json(await setupSupplierWorkQueue(DB, env)); } catch (e) { console.error('Supplier sheet setup failed', e); return json({ ok: false, error: 'Setup failed: ' + e.message }, 500); }
  }
  if (path === '/admin/supplier-sheet/check' && method === 'POST') return json(await pollSupplierSheet(DB, env, { waitUntil }));
  if (path === '/admin/storage' && method === 'GET') {
    let backups = [], backupError = null;
    try { backups = await listBackups(env); } catch (e) { backupError = 'Could not list backups'; console.error('List backups failed', e); }
    return json({ ok: true, storage: await fileStorageStatus(DB, env), backups, backupError });
  }
  if (path === '/admin/storage/sync' && method === 'POST') return json(await syncFileStorage(DB, env));
  if (path === '/admin/backups/run' && method === 'POST') {
    try { return json(await runBackup(DB, env)); } catch (e) { console.error('Backup failed', e); return json({ ok: false, error: 'Backup failed: ' + e.message }, 500); }
  }
  const backupFile = /^\/admin\/backups\/([\w.-]+)$/.exec(path);
  if (backupFile && method === 'GET') return downloadBackup(env, backupFile[1]);
  if (path === '/admin/overview' && method === 'GET') {
    const pendingSync = retryPendingGoogleSheetOrders(DB, env).catch(error => console.error('Google Sheets pending-order retry failed', error));
    if (waitUntil) waitUntil(pendingSync);
    const settings = await getSettings(DB);
    const termsPolicy = await currentTerms(DB);
    const termsRows = (await DB.prepare('SELECT DISTINCT ON (client_id) client_id,version,accepted_at FROM client_terms_acceptances ORDER BY client_id,version DESC').all()).results || [];
    const acceptedTerms = new Map(termsRows.map(r => [r.client_id, { version: Number(r.version), acceptedAt: Number(r.accepted_at) }]));
    const users = (await DB.prepare('SELECT id, username, role, display_name, commission_per_order, supplier_share_per_order, active, archived, created_at, trial_start, trial_end, sub_status, sub_last_payment, last_login, password_reset_required FROM users ORDER BY role, display_name').all()).results || [];
    const pendingTransfers = new Map(((await DB.prepare("SELECT f.client_id,COUNT(*) AS n FROM portal_files f LEFT JOIN client_payments p ON p.confirmation_id=f.id WHERE f.kind='confirmation' AND NOT f.archived AND p.id IS NULL GROUP BY f.client_id").all()).results || []).map(r=>[r.client_id,Number(r.n)]));
    const clients = [];
    const archived = [];
    for (const u of users.filter(u => u.role === 'client' && u.archived)) archived.push({ id: u.id, username: u.username, name: u.display_name, orders: Number((await DB.prepare('SELECT COUNT(*) AS n FROM client_orders WHERE client_id = ?').bind(u.id).first()).n) });
    for (const u of users.filter(u => u.role === 'client' && !u.archived)) clients.push({ id: u.id, username: u.username, name: u.display_name, active: u.active, pendingTransfers: pendingTransfers.get(u.id) || 0, termsAccepted: acceptedTerms.get(u.id) || null, termsRequired: acceptedTerms.get(u.id)?.version !== termsPolicy.version, lastLogin: u.last_login == null ? null : Number(u.last_login), passwordResetRequired: !!u.password_reset_required, commissionPerOrder: u.commission_per_order, supplierSharePerOrder: u.supplier_share_per_order, subscription: subscriptionOut(u, settings), ...(await clientSummary(DB, u.id, settings)) });
    const keys = ['billed', 'paid', 'outstanding', 'commission', 'supplierShare', 'ourShare'];
    const totals = clients.reduce((t, c) => { t.orders += c.orders; for (const k of keys) t[k] = round2(t[k] + c[k]); return t; },
      { orders: 0, ...Object.fromEntries(keys.map(k => [k, 0])) });
    const admins = users.filter(u => u.role === 'admin').map(u => ({ id: u.id, username: u.username, name: u.display_name, active: u.active }));
    return json({ ok: true, settings, termsPolicy, totals, clients, admins, archived, rates: SHIPPING_RATES, googleSheets: { configured: googleSheetsConfigured(env) } });
  }
  // ----- Daniel's stores (dashboard store list) -----
  if (path === '/admin/stores' && method === 'GET') {
    const rows = (await DB.prepare('SELECT * FROM dashboard_stores ORDER BY created_at, key').all()).results || [];
    return json({ ok: true, stores: rows.map(storeOut) });
  }
  if (path === '/admin/stores' && method === 'POST') {
    let f; try { f = storeFields(await readBody(request), true); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    const key = 's' + now().toString(36) + Math.random().toString(36).slice(2, 6);
    const row = await DB.prepare('INSERT INTO dashboard_stores (key, name, platform, url, builtin, hidden, created_at, updated_at) VALUES (?,?,?,?,FALSE,FALSE,?,?) RETURNING *')
      .bind(key, f.name, f.platform, f.url, now(), now()).first();
    return json({ ok: true, store: storeOut(row) });
  }
  const storeUpd = /^\/admin\/stores\/([a-z0-9]{2,24})$/.exec(path);
  if (storeUpd && method === 'POST') {
    const key = storeUpd[1], body = await readBody(request), builtin = BUILTIN_STORES.includes(key);
    const existing = await DB.prepare('SELECT * FROM dashboard_stores WHERE key = ?').bind(key).first();
    if (!existing && !builtin) return json({ ok: false, error: 'Not found' }, 404);
    let f; try { f = storeFields({ ...(existing ? storeOut(existing) : {}), ...body }, !builtin); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    const hidden = body.hidden !== undefined ? Boolean(body.hidden) : Boolean(existing?.hidden);
    const row = await DB.prepare('INSERT INTO dashboard_stores (key, name, platform, url, builtin, hidden, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name, platform=excluded.platform, url=excluded.url, hidden=excluded.hidden, updated_at=excluded.updated_at RETURNING *')
      .bind(key, f.name, f.platform, f.url, builtin, hidden, now(), now()).first();
    return json({ ok: true, store: storeOut(row) });
  }
  if (path === '/admin/google-sheets/retry' && method === 'POST') {
    return json({ ok: true, ...(await retryPendingGoogleSheetOrders(DB, env)) });
  }
  if (path === '/admin/notifications' && method === 'GET') {
    const rows = (await DB.prepare("SELECT e.*, o.order_ref, o.status, u.display_name AS client_name FROM order_events e JOIN client_orders o ON o.id = e.order_id JOIN users u ON u.id = e.client_id WHERE e.actor = 'client' AND NOT u.archived AND NOT o.archived ORDER BY e.created_at DESC, e.id DESC LIMIT 60").all()).results || [];
    return json({ ok: true, items: [...rows.map(eventOut),...await productEvents(DB,null,'client')].sort((a,b)=>b.createdAt-a.createdAt).slice(0,60), now: now() });
  }
  const archiveOrder = /^\/admin\/orders\/(\d+)\/archive$/.exec(path);
  if (archiveOrder && method === 'POST') {
    const body = await readBody(request), id = Number(archiveOrder[1]);
    if (typeof body?.archived !== 'boolean') return json({ok:false,error:'Choose archive or restore.'},400);
    const old = await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(id).first();
    if (!old) return json({ok:false,error:'Not found'},404);
    if (!!old.archived !== body.archived) {
      const row = await DB.prepare("UPDATE client_orders SET archived=?,archived_at=?,updated_at=?,sheet_sync_status='waiting' WHERE id=? AND archived<>? RETURNING *").bind(body.archived,body.archived ? now() : null,now(),id,body.archived).first();
      if (row) await logEvent(DB,id,row.client_id,body.archived ? 'archived' : 'restored','admin');
    }
    const sync = syncPortalOrderToGoogleSheet(DB,env,id).catch(error=>console.error('Archived order sheet sync failed',error));
    if (waitUntil) waitUntil(sync); else await sync;
    return json({ok:true,archived:body.archived});
  }
  if (path === '/admin/orders' && method === 'GET') {
    const clientId = Number(url.searchParams.get('clientId') || 0), archived = url.searchParams.get('archived') === '1';
    const rows = (await DB.prepare(`SELECT * FROM client_orders WHERE archived=? ${clientId ? 'AND client_id=?' : 'AND client_id NOT IN (SELECT id FROM users WHERE archived)'} ORDER BY created_at DESC, id DESC LIMIT 500`).bind(archived,...(clientId ? [clientId] : [])).all()).results;
    return json({ ok: true, orders: await withPhotos(DB, await withMessages(DB, (rows || []).map(orderOut), true)) });
  }
  if(path==='/admin/client-stores'&&method==='GET'){const clientId=url.searchParams.has('clientId')?Number(url.searchParams.get('clientId')):null;return json({ok:true,stores:await clientStores(DB,clientId)});}
  const adminStore=/^\/admin\/client-stores(?:\/(\d+))?$/.exec(path);if(adminStore&&method==='POST'){const body=await readBody(request);try{const store=await saveStore(DB,Number(body.clientId),adminStore[1]?Number(adminStore[1]):null,body);return store?json({ok:true,store}):json({ok:false,error:'Not found'},404);}catch(e){return json({ok:false,error:e.message},400);}}
  if(path==='/admin/claims'&&method==='GET')return json({ok:true,claims:await claims(DB)});
  const claimDecision=/^\/admin\/claims\/(\d+)$/.exec(path);if(claimDecision&&method==='POST'){try{const claim=await decideClaim(DB,Number(claimDecision[1]),await readBody(request));if(claim.reshipmentOrderId){const sync=syncPortalOrderToGoogleSheet(DB,env,claim.reshipmentOrderId).catch(()=>{});if(waitUntil)waitUntil(sync);}return json({ok:true,claim});}catch(e){return json({ok:false,error:e.message},409);}}
  const trackingUpdate=/^\/admin\/orders\/(\d+)\/tracking-update$/.exec(path);if(trackingUpdate&&method==='POST'){const order=await DB.prepare('UPDATE client_orders SET last_tracking_update_at=?,updated_at=? WHERE id=? AND NOT archived RETURNING *').bind(now(),now(),Number(trackingUpdate[1])).first();if(!order)return json({ok:false,error:'Not found'},404);await logEvent(DB,order.id,order.client_id,'tracking_update','admin');return json({ok:true,order:orderOut(order)});}
  if(path==='/admin/products'&&method==='GET')return json({ok:true,products:await products(DB)});
  const productQuote=/^\/admin\/products\/(\d+)$/.exec(path);if(productQuote&&method==='POST'){try{const product=await quoteProduct(DB,Number(productQuote[1]),await readBody(request));return product?json({ok:true,product}):json({ok:false,error:'Not found'},404);}catch(e){return json({ok:false,error:e.message},400);}}
  if (path==='/admin/invoices' && method==='GET') return json({ok:true,invoices:await invoices(DB,Number(url.searchParams.get('clientId')))});
  if (path==='/admin/invoices' && method==='POST') {try{return json({ok:true,invoice:await saveInvoice(DB,await readBody(request))});}catch(e){return json({ok:false,error:e.message},400);}}
  if (path === '/admin/payments' && method === 'GET') {
    const clientId = Number(url.searchParams.get('clientId') || 0);
    const rows = (await DB.prepare('SELECT * FROM client_payments WHERE client_id = ? ORDER BY paid_at DESC, id DESC').bind(clientId).all()).results || [];
    return json({ ok: true, payments: rows.map(r => ({ id: r.id, clientId: r.client_id, amount: Number(r.amount), method: r.method, note: r.note, paidAt: Number(r.paid_at), archived: !!r.archived })),adjustments:await balanceAdjustments(DB,clientId) });
  }
  if (path === '/admin/payments' && method === 'POST') {
    const body = await readBody(request);
    const clientId = Number(body.clientId), amount = money(body.amount);
    const client = await DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'client'").bind(clientId).first();
    if (!client) return json({ ok: false, error: 'Unknown client' }, 400);
    if (!(amount > 0) || !isMoney(amount)) return json({ ok: false, error: 'Amount must be more than 0' }, 400);
    const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(String(body.paidAt || '')) ? Math.floor(new Date(body.paidAt + 'T12:00:00Z').getTime() / 1000) : now();
    const row = await DB.prepare('INSERT INTO client_payments (client_id, amount, method, note, paid_at, created_at) VALUES (?,?,?,?,?,?) RETURNING id').bind(clientId, amount, text(body.method, 60), text(body.note, 500), Number.isFinite(paidAt) ? paidAt : now(), now()).first();
    return json({ ok: true, id: row.id });
  }
  // Edit a recorded payment (amount, date, method, note). The old values are kept in payment_edits.
  const payEdit = /^\/admin\/payments\/(\d+)$/.exec(path);
  if (payEdit && method === 'POST') {
    const id = Number(payEdit[1]), body = await readBody(request);
    const old = await DB.prepare('SELECT * FROM client_payments WHERE id = ?').bind(id).first();
    if (!old) return json({ ok: false, error: 'Payment not found' }, 404);
    const amount = body.amount === undefined ? Number(old.amount) : money(body.amount);
    if (!(amount > 0) || !isMoney(amount)) return json({ ok: false, error: 'Amount must be more than 0' }, 400);
    let paidAt = Number(old.paid_at);
    if (body.paidAt !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.paidAt))) return json({ ok: false, error: 'Date: use a valid date' }, 400);
      paidAt = Math.floor(new Date(body.paidAt + 'T12:00:00Z').getTime() / 1000);
      if (!Number.isFinite(paidAt)) return json({ ok: false, error: 'Date: use a valid date' }, 400);
    }
    const methodText = body.method === undefined ? old.method : text(body.method, 60), note = body.note === undefined ? old.note : text(body.note, 500);
    const day = sec => new Date(Number(sec) * 1000).toISOString().slice(0, 10);
    const changes = [['amount', Number(old.amount), amount], ['date', day(old.paid_at), day(paidAt)], ['method', old.method, methodText], ['note', old.note, note]].filter(([, a, b]) => String(a) !== String(b));
    if (changes.length) {
      await DB.prepare('UPDATE client_payments SET amount=?, method=?, note=?, paid_at=? WHERE id=?').bind(amount, methodText, note, paidAt, id).run();
      for (const [field, a, b] of changes) await DB.prepare('INSERT INTO payment_edits (payment_id, field, old_value, new_value, created_at) VALUES (?,?,?,?,?)').bind(id, field, String(a), String(b), now()).run();
    }
    return json({ ok: true, changed: changes.map(c => c[0]) });
  }
  const payDel = /^\/admin\/payments\/(\d+)\/delete$/.exec(path);
  if (payDel && method === 'POST') {
    await DB.prepare('UPDATE client_payments SET archived=TRUE WHERE id = ?').bind(Number(payDel[1])).run();
    return json({ ok: true });
  }
  if (path === '/admin/users' && method === 'POST') {
    const body = await readBody(request);
    const username = text(body.username, 60), password = String(body.password || ''), userRole = body.role === 'admin' ? 'admin' : 'client';
    if (!/^[A-Za-z0-9._@-]{3,60}$/.test(username)) return json({ ok: false, error: 'Username: 3-60 letters, numbers, . _ - @' }, 400);
    if (password.length < 8) return json({ ok: false, error: 'Password must be at least 8 characters' }, 400);
    if (env.ADMIN_USERNAME && username.toLowerCase() === env.ADMIN_USERNAME.toLowerCase()) return json({ ok: false, error: 'Username already taken' }, 409);
    const exists = await DB.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
    if (exists) return json({ ok: false, error: 'Username already taken' }, 409);
    const cpo = money(body.commissionPerOrder);
    if (!isMoney(cpo)) return json({ ok: false, error: 'Invalid commission' }, 400);
    // New clients start their free month today (an admin can change the dates later).
    let trialStart = null, trialEnd = null, subStatus = null;
    if (userRole === 'client') {
      trialStart = body.trialStart ? isoDate(body.trialStart) : todayIso();
      if (!trialStart) return json({ ok: false, error: 'Trial start: use a valid date' }, 400);
      trialEnd = addMonth(trialStart); subStatus = 'trial';
    }
    const row = await DB.prepare('INSERT INTO users (username, password_hash, role, display_name, commission_per_order, active, created_at, trial_start, trial_end, sub_status) VALUES (?,?,?,?,?,TRUE,?,?,?,?) RETURNING id')
      .bind(username, await hashPassword(password), userRole, text(body.name, 120) || username, userRole === 'client' ? cpo : null, now(), trialStart, trialEnd, subStatus).first();
    if (userRole === 'client') {
      await ensureStores(DB,row.id);
      const sheetSync = syncClientToGoogleSheet(DB, env, row.id).catch(error => console.error('Google Sheets client sync failed', error));
      if (waitUntil) waitUntil(sheetSync); else await sheetSync;
    }
    return json({ ok: true, id: row.id });
  }
  const resetMatch = /^\/admin\/users\/(\d+)\/reset-password$/.exec(path);
  if (resetMatch && method === 'POST') {
    const password = randomBytes(18).toString('base64url');
    const changed = await DB.prepare("UPDATE users SET password_hash=?, password_reset_required=TRUE, session_version=session_version+1 WHERE id=? AND role='client' AND NOT archived RETURNING id").bind(await hashPassword(password), Number(resetMatch[1])).first();
    if (!changed) return json({ ok: false, error: 'Unknown client' }, 404);
    return json({ ok: true, temporaryPassword: password });
  }
  const userUpd = /^\/admin\/users\/(\d+)$/.exec(path);
  if (userUpd && method === 'POST') {
    const id = Number(userUpd[1]);
    const u = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!u) return json({ ok: false, error: 'Not found' }, 404);
    const body = await readBody(request);
    const name = body.name !== undefined ? text(body.name, 120) || u.display_name : u.display_name;
    const active = body.active !== undefined ? Boolean(body.active) : u.active;
    let cpo = u.commission_per_order;
    if (body.commissionPerOrder !== undefined) { cpo = money(body.commissionPerOrder); if (!isMoney(cpo)) return json({ ok: false, error: 'Invalid commission' }, 400); }
    let sps = u.supplier_share_per_order;
    if (body.supplierSharePerOrder !== undefined) { sps = money(body.supplierSharePerOrder); if (!isMoney(sps)) return json({ ok: false, error: "Invalid supplier's share" }, 400); }
    let hash = u.password_hash;
    if (body.password) { if (String(body.password).length < 8) return json({ ok: false, error: 'Password must be at least 8 characters' }, 400); hash = await hashPassword(String(body.password)); }
    const archived = body.archived !== undefined && u.role === 'client' ? Boolean(body.archived) : u.archived;
    // A new username: signs the person in from now on (and is a client's payment reference).
    let username = u.username;
    if (body.username !== undefined && String(body.username).trim() !== u.username) {
      username = text(body.username, 60);
      if (!/^[A-Za-z0-9._@-]{3,60}$/.test(username)) return json({ ok: false, error: 'Username: 3-60 letters, numbers, . _ - @' }, 400);
      const taken = (env.ADMIN_USERNAME && username.toLowerCase() === env.ADMIN_USERNAME.toLowerCase()) || await DB.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> ?').bind(username, id).first();
      if (taken) return json({ ok: false, error: 'Username already taken' }, 409);
    }
    // Subscription fields (clients only). '' clears a date.
    let trialStart = u.trial_start, trialEnd = u.trial_end, subStatus = u.sub_status, lastPay = u.sub_last_payment;
    if (u.role === 'client') {
      const dateIn = (v, label) => { if (v === '' || v === null) return null; const d = isoDate(String(v)); if (!d) throw new Error(label + ': use a valid date'); return d; };
      try {
        if (body.trialStart !== undefined) trialStart = dateIn(body.trialStart, 'Trial start');
        if (body.trialEnd !== undefined) trialEnd = dateIn(body.trialEnd, 'Trial end');
        else if (body.trialStart !== undefined && trialStart && !trialEnd) trialEnd = addMonth(trialStart);
        if (body.subLastPayment !== undefined) lastPay = dateIn(body.subLastPayment, 'Last payment');
      } catch (e) { return json({ ok: false, error: e.message }, 400); }
      if (body.subStatus !== undefined) { if (!SUB_STATUSES.includes(body.subStatus)) return json({ ok: false, error: 'Unknown subscription status' }, 400); subStatus = body.subStatus; }
      if (trialStart && trialEnd && trialEnd < trialStart) return json({ ok: false, error: 'Trial end must be after the trial start' }, 400);
      if (!subStatus && trialStart) subStatus = 'trial';
    }
    await DB.prepare('UPDATE users SET display_name=?, active=?, commission_per_order=?, supplier_share_per_order=?, password_hash=CASE WHEN ? THEN ? ELSE password_hash END, archived=?, trial_start=?, trial_end=?, sub_status=?, sub_last_payment=?, password_reset_required=CASE WHEN ? THEN ? ELSE password_reset_required END, session_version=session_version+? WHERE id = ?').bind(name, active, cpo, sps, !!body.password, hash, archived, trialStart, trialEnd, subStatus, lastPay, !!body.password, u.role === 'client', body.password ? 1 : 0, id).run();
    if (username !== u.username) await DB.prepare('UPDATE users SET username=? WHERE id=?').bind(username, id).run();
    // Bulk: put this client's fee on all their existing orders too (not cancelled ones). The supplier's part never exceeds the fee.
    let ordersUpdated = 0;
    if (u.role === 'client' && body.applyFeeToOrders === true) {
      const settings = await getSettings(DB), fee = cpo ?? Number(settings.commission_per_order), share = Math.min(fee, sps ?? (Number(settings.supplier_share_per_order) || 0));
      const done = await DB.prepare("UPDATE client_orders SET commission=?, supplier_share=? WHERE client_id=? AND status<>'cancelled' RETURNING id").bind(fee, share, id).all();
      ordersUpdated = (done.results || []).length;
    }
    if (u.role === 'client') {
      if (archived !== u.archived) await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE client_id=?").bind(id).run();
      const sheetSync = syncClientToGoogleSheet(DB, env, id).catch(error => console.error('Google Sheets client update failed', error));
      if (waitUntil) waitUntil(sheetSync); else await sheetSync;
    }
    return json({ ok: true, ordersUpdated });
  }
  if (path === '/admin/settings' && method === 'POST') {
    const body = await readBody(request);
    const updates = {};
    if (body.commission_per_order !== undefined) { const v = money(body.commission_per_order); if (v === null || !isMoney(v)) return json({ ok: false, error: 'Invalid commission' }, 400); updates.commission_per_order = String(v); }
    if (body.supplier_share_per_order !== undefined) { const v = money(body.supplier_share_per_order); if (v === null || !isMoney(v)) return json({ ok: false, error: "Invalid supplier's share" }, 400); updates.supplier_share_per_order = String(v); }
    const fee = Number(updates.commission_per_order ?? (await getSettings(DB)).commission_per_order);
    const sup = Number(updates.supplier_share_per_order ?? (await getSettings(DB)).supplier_share_per_order);
    if (sup > fee) return json({ ok: false, error: "The supplier's share can't be more than the fee per order" }, 400);
    if (body.monthly_order_goal !== undefined) { const v = Number(body.monthly_order_goal); if (!(Number.isInteger(v) && v >= 0 && v <= 1e6)) return json({ ok: false, error: 'Goal must be a whole number' }, 400); updates.monthly_order_goal = String(v); }
    if (body.subscription_price !== undefined) { const v = money(body.subscription_price); if (v === null || !isMoney(v) || v > 100000) return json({ ok: false, error: 'Invalid subscription price' }, 400); updates.subscription_price = String(v); }
    if (body.volumetric_divisor !== undefined) { const v = Number(body.volumetric_divisor); if (!(v >= 1000 && v <= 10000)) return json({ ok: false, error: 'Divisor must be 1000-10000' }, 400); updates.volumetric_divisor = String(v); }
    for (const k of BANK_FIELDS) if (body[k] !== undefined) updates[k] = text(body[k], 200);
    for (const [k, v] of Object.entries(updates)) await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, v).run();
    return json({ ok: true, settings: await getSettings(DB) });
  }

  return json({ ok: false, error: 'Not found' }, 404);
}

// Returns the session role string for valid credentials, or null.
export async function authenticate(DB, env, username, password) {
  if (!username || !password) return null;
  if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD && username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) return 'admin';
  if (!DB) return null;
  const u = await DB.prepare('SELECT id, role, password_hash, active, archived, session_version FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
  if (!u || !u.active || u.archived || !(await verifyPassword(password, u.password_hash))) return null;
  await DB.prepare('UPDATE users SET last_login=? WHERE id=?').bind(now(), u.id).run();
  return u.role === 'admin' ? 'admin' : 'client-' + u.id + '-v' + Number(u.session_version || 0);
}

// authenticate() behind the failed sign-in limits (server/login-limit.mjs). Returns { role } —
// role is null for wrong details — or { retryAfter } in seconds while the sign-in is locked.
export async function signIn(DB, env, request, username, password) {
  if (!DB || !username || !password) return { role: await authenticate(DB, env, username, password) };
  const keys = loginKeys(username, clientIp(request)), at = now();
  const wait = await lockedFor(DB, keys, at);
  if (wait) return { retryAfter: wait };
  const role = await authenticate(DB, env, username, password);
  if (role) await clearFailures(DB, keys);
  else await recordFailure(DB, keys, at);
  return { role };
}
