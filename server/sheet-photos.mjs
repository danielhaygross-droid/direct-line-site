import { createHmac, timingSafeEqual } from 'node:crypto';

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
  const row = await DB.prepare(`SELECT p.mime,p.data,p.thumb_mime,p.thumb FROM order_photos p
    JOIN client_orders o ON o.id=p.order_id JOIN users u ON u.id=o.client_id
    WHERE p.order_id=? AND p.id=? AND u.active AND NOT u.archived AND NOT o.archived`).bind(orderId,photoId).first();
  if (!row) return missing();
  const thumb = url.searchParams.get('size') === 'thumb' && row.thumb;
  const mime = thumb ? row.thumb_mime : row.mime;
  if (!['image/png','image/jpeg','image/webp'].includes(mime)) return missing();
  return new Response(Buffer.from(thumb ? row.thumb : row.data,'base64'), {headers:{
    'content-type':mime,'cache-control':'private, no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive',
    'content-security-policy':"default-src 'none'; sandbox",'content-disposition':'inline'
  }});
}
