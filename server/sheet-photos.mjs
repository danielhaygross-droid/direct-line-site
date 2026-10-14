import { createHmac, timingSafeEqual } from 'node:crypto';
import { photoBytes, storedBytes } from './file-storage.mjs';

const DEFAULT_ORIGIN = 'https://direct-line-control.vercel.app';
// Photo-only bearer links: no session cookie or access to any order/customer fields.
// Deleting a photo or disabling/archiving its client revokes access.
export function photoSignature(env, orderId, photoId) {
  if (!env.APP_SESSION_SECRET) throw new Error('Photo sharing secret is not configured');
  return createHmac('sha256', env.APP_SESSION_SECRET).update(`sheet-photo-v1:${orderId}:${photoId}`).digest('base64url');
}
export function sheetPhotoUrl(env, orderId, photoId) {
  const origin = new URL(env.PORTAL_PUBLIC_URL || DEFAULT_ORIGIN);
  if (origin.protocol !== 'https:') throw new Error('Photo URL must use HTTPS');
  return `${origin.origin}/api/portal/sheet-photos/${orderId}/${photoId}?key=${photoSignature(env, orderId, photoId)}`;
}
export async function serveSheetPhoto(DB, env, url, orderId, photoId) {
  const missing = () => new Response('Not found', {status:404, headers:{'cache-control':'no-store'}});
  if (!env.APP_SESSION_SECRET) return missing();
  const supplied = Buffer.from(url.searchParams.get('key') || '');
  const expected = Buffer.from(photoSignature(env, orderId, photoId));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return missing();
  const row = await DB.prepare(`SELECT p.mime,p.data,p.blob_path,p.thumb_mime,p.thumb,p.thumb_blob_path FROM order_photos p
    JOIN client_orders o ON o.id=p.order_id JOIN users u ON u.id=o.client_id
    WHERE p.order_id=? AND p.id=? AND u.active AND NOT u.archived AND NOT o.archived`).bind(orderId,photoId).first();
  if (!row) return missing();
  const image = await photoBytes(env, row, url.searchParams.get('size') === 'thumb');
  if (!image.bytes || !['image/png','image/jpeg','image/webp'].includes(image.mime)) return missing();
  return new Response(image.bytes, {headers:{
    'content-type':image.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive',
    'content-security-policy':"default-src 'none'; sandbox",'content-disposition':'inline'
  }});
}

// Same idea for My Products photos in the supplier's "Product Quotes" tab.
export function productPhotoSignature(env, productId, photoId) {
  if (!env.APP_SESSION_SECRET) throw new Error('Photo sharing secret is not configured');
  return createHmac('sha256', env.APP_SESSION_SECRET).update(`sheet-product-photo-v1:${productId}:${photoId}`).digest('base64url');
}
export function sheetProductPhotoUrl(env, productId, photoId) {
  const origin = new URL(env.PORTAL_PUBLIC_URL || DEFAULT_ORIGIN);
  if (origin.protocol !== 'https:') throw new Error('Photo URL must use HTTPS');
  return `${origin.origin}/api/portal/sheet-product-photos/${productId}/${photoId}?key=${productPhotoSignature(env, productId, photoId)}`;
}
export async function serveSheetProductPhoto(DB, env, url, productId, photoId) {
  const missing = () => new Response('Not found', {status:404, headers:{'cache-control':'no-store'}});
  if (!env.APP_SESSION_SECRET) return missing();
  const supplied = Buffer.from(url.searchParams.get('key') || '');
  const expected = Buffer.from(productPhotoSignature(env, productId, photoId));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return missing();
  const row = await DB.prepare(`SELECT ph.mime, ph.data, ph.blob_path FROM portal_product_photos ph
    JOIN portal_products p ON p.id=ph.product_id JOIN users u ON u.id=p.client_id
    WHERE ph.product_id=? AND ph.id=? AND u.active AND NOT u.archived`).bind(productId, photoId).first();
  if (!row) return missing();
  const bytes = await storedBytes(env, row.data, row.blob_path);
  if (!bytes || !['image/png','image/jpeg','image/webp'].includes(row.mime)) return missing();
  return new Response(bytes, {headers:{
    'content-type':row.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive',
    'content-security-policy':"default-src 'none'; sandbox",'content-disposition':'inline'
  }});
}
