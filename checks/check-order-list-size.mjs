// Check: admin and client order lists are not cut at 500 orders (they were LIMIT 500 until 22 Oct 2026).
// 700 orders, the oldest with a photo and a message; every list must still show all of them with their
// photos/messages (those lookups go in parts of 300 ids). Run from the project root:  node checks/check-order-list-size.mjs
import assert from 'node:assert/strict';
import { DB, call, seed } from './lib.mjs';

const { admin, client, id } = await seed();
const ok = r => { assert.ok(r.status === 200, JSON.stringify(r.data)); return r.data; };
const COUNT = 700;

// The oldest order goes through the API; the other 699 are copies made in SQL (much faster), each one newer.
const first = ok(await call('/orders', 'POST', { clientId: id, orderRef: 'OLDEST', buyerName: 'Sample', destination: 'IL', address1: '1 Sample St', etsyUrl: 'https://example.com/i' }, admin)).order;
const cols = (await DB.prepare("SELECT column_name FROM information_schema.columns WHERE table_name = 'client_orders' AND column_name NOT IN ('id', 'order_ref', 'created_at')").all()).results.map(r => r.column_name);
const base = Number((await DB.prepare('SELECT created_at FROM client_orders WHERE id = ?').bind(first.id).first()).created_at);
await DB.prepare(`INSERT INTO client_orders (order_ref, created_at, ${cols.join(', ')})
  SELECT 'COPY-' || n, ? + n, ${cols.join(', ')} FROM client_orders, generate_series(1, ?) AS n WHERE id = ?`).bind(base, COUNT - 1, first.id).run();

// A photo and a message on the oldest order, and messages on 400 other orders (more than one lookup part).
const tiny = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
await DB.prepare("INSERT INTO order_photos (order_id, client_id, mime, data, thumb_mime, thumb, bytes, added_by, created_at) VALUES (?, ?, 'image/png', ?, 'image/png', ?, 68, 'client', ?)").bind(first.id, id, tiny, tiny, base).run();
await DB.prepare("INSERT INTO order_messages (order_id, client_id, author, body, created_at) VALUES (?, ?, 'client', 'Oldest order question', ?)").bind(first.id, id, base + 1).run();
await DB.prepare(`INSERT INTO order_messages (order_id, client_id, author, body, created_at)
  SELECT id, client_id, 'admin', 'Note ' || order_ref, created_at FROM client_orders WHERE order_ref LIKE 'COPY-%' ORDER BY id LIMIT 400`).run();

const check = (orders, who) => {
  assert.equal(orders.length, COUNT, `${who}: all ${COUNT} orders listed`);
  const oldest = orders.find(o => o.id === first.id);
  assert.ok(oldest, `${who}: the oldest order is in the list`);
  assert.equal(orders[orders.length - 1].id, first.id, `${who}: newest first, oldest last`);
  assert.equal(oldest.photos.length, 1, `${who}: oldest order keeps its photo`);
  assert.equal(oldest.messages, 1, `${who}: oldest order keeps its message`);
  assert.equal(oldest.lastMessage.body, 'Oldest order question');
  assert.equal(orders.filter(o => o.messages > 0).length, 401, `${who}: messages found on every order that has them`);
  assert.ok(orders.filter(o => o.lastMessage).every(o => o.lastMessage.body), `${who}: last message text on each`);
};

check(ok(await call('/admin/orders', 'GET', null, admin)).orders, 'admin, all clients');
console.log('PASS admin Orders tab lists all 700 orders with photos and messages');
check(ok(await call('/admin/orders?clientId=' + id, 'GET', null, admin)).orders, 'admin, one client');
console.log('PASS admin client panel lists all 700 orders');
check(ok(await call('/orders', 'GET', null, client)).orders, 'client portal');
console.log('PASS client portal lists all 700 orders');
