// Local check for the supplier Work Queue (branch claude/supplier-sheet), run from the project root:
//   node checks/check-supplier-sheet.mjs
// PGlite (real Postgres) + the real API code + an in-memory fake of the Google Sheets API. No live data.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { DB, env, call, seed, pg } from './lib.mjs';
import { route } from '../api/index.mjs';
import { WQ, FIRST_ROW, HEADERS, SHIPPED, NOT_SHIPPED } from '../server/supplier-sheet.mjs';

// ---------- fake Google Sheets ----------
const sheets = new Map(); // title -> { sheetId, hidden, grid: array of rows (arrays) }
let nextId = 100;
const addTab = (title, sheetId = nextId++) => { sheets.set(title, { sheetId, hidden: false, grid: [] }); return sheets.get(title); };
const col = s => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
function parseRange(a1) {
  const [name, ref = ''] = decodeURIComponent(a1).replace(/^'|'(?=!)/g, '').split('!');
  const m = /^([A-Z]+)?(\d+)?(?::([A-Z]+)?(\d+)?)?$/.exec(ref);
  return { name, c1: m[1] ? col(m[1]) : 0, r1: m[2] ? Number(m[2]) - 1 : 0, c2: m[3] ? col(m[3]) : m[1] && !ref.includes(':') ? col(m[1]) : 200, r2: m[4] ? Number(m[4]) - 1 : m[2] && !ref.includes(':') ? Number(m[2]) - 1 : 100000 };
}
const entered = v => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v);
function write(name, r, c, rows) {
  const g = sheets.get(name).grid;
  rows.forEach((row, i) => { g[r + i] ||= []; row.forEach((v, j) => { g[r + i][c + j] = entered(v); }); });
}
function read(rg) {
  const g = sheets.get(rg.name)?.grid || [], out = [];
  for (let r = rg.r1; r <= Math.min(rg.r2, g.length - 1); r++) {
    const row = (g[r] || []).slice(rg.c1, rg.c2 + 1); while (row.length && (row.at(-1) === undefined || row.at(-1) === '')) row.pop();
    out.push(row.map(v => v ?? ''));
  }
  while (out.length && !out.at(-1).length) out.pop();
  return out;
}
const lastRow = name => { const g = sheets.get(name).grid; let n = g.length; while (n && !(g[n - 1] || []).some(v => v !== undefined && v !== '')) n--; return n; };
const requests = [];
globalThis.fetch = (real => async (url, opt = {}) => {
  url = String(url);
  if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 't', expires_in: 3600 });
  if (!url.includes('sheets.googleapis.com')) return real(url, opt);
  const path = url.split('/spreadsheets/sheet-id')[1], body = opt.body ? JSON.parse(opt.body) : null, method = opt.method || 'GET';
  requests.push(method + ' ' + decodeURIComponent(path).slice(0, 80));
  if (path.startsWith('?fields=sheets.properties')) return Response.json({ sheets: [...sheets].map(([title, s]) => ({ properties: { title, sheetId: s.sheetId, hidden: s.hidden } })) });
  if (path === ':batchUpdate') {
    const replies = [];
    for (const rq of body.requests) {
      const [kind, a] = Object.entries(rq)[0];
      const byId = id => [...sheets].find(([, s]) => s.sheetId === id);
      if (kind === 'duplicateSheet') { const [, src] = byId(a.sourceSheetId); const t = addTab(a.newSheetName); t.grid = JSON.parse(JSON.stringify(src.grid)); }
      else if (kind === 'updateSheetProperties') byId(a.properties.sheetId)[1].hidden = a.properties.hidden;
      else if (kind === 'deleteSheet') { const [title] = byId(a.sheetId); if (![...sheets].some(([t, s]) => t !== title && !s.hidden)) return Response.json({ error: { code: 400, message: "Invalid requests[0].deleteSheet: You can't remove all the visible sheets in a document." } }, { status: 400 }); sheets.delete(title); }
      else if (kind === 'addSheet') { const p = a.properties; if (p.sheetId != null && byId(p.sheetId)) throw new Error('id in use'); const t = addTab(p.title, p.sheetId ?? nextId++); replies.push({ addSheet: { properties: { sheetId: t.sheetId, title: p.title } } }); continue; }
      else if (kind === 'deleteDimension') { const [, s] = byId(a.range.sheetId); if (a.range.dimension === 'ROWS') s.grid.splice(a.range.startIndex, a.range.endIndex - a.range.startIndex); }
      replies.push({});
    }
    return Response.json({ replies });
  }
  if (path.startsWith('/values:batchUpdate')) { for (const d of body.data) { const rg = parseRange(d.range); write(rg.name, rg.r1, rg.c1, d.values); } return Response.json({}); }
  if (path.startsWith('/values:batchClear')) { for (const r of body.ranges) { const rg = parseRange(r); const g = sheets.get(rg.name).grid; for (let i = rg.r1; i <= rg.r2 && i < g.length; i++) if (g[i]) for (let c = rg.c1; c <= rg.c2; c++) g[i][c] = ''; } return Response.json({}); }
  if (path.startsWith('/values:batchGet')) {
    const ranges = new URLSearchParams(path.split('?')[1]).getAll('ranges');
    return Response.json({ valueRanges: ranges.map(r => ({ range: r, values: read(parseRange(r)) })) });
  }
  const m = /^\/values\/([^?:]+)(:append)?/.exec(path); const rg = parseRange(m[1]);
  if (!sheets.has(rg.name)) return new Response('no sheet ' + rg.name, { status: 400 });
  if (m[2]) { const r = Math.max(lastRow(rg.name), rg.r1); write(rg.name, r, rg.c1, body.values); return Response.json({ updates: { updatedRange: `'${rg.name}'!A${r + 1}:Z${r + body.values.length}` } }); }
  if (method === 'PUT') { write(rg.name, rg.r1, rg.c1, body.values); return Response.json({}); }
  return Response.json({ values: read(rg) });
})(globalThis.fetch);

// The live layout before setup: formula Work Queue (gid 2026101301) first, technical tabs hidden.
const old = addTab(WQ, 2026101301); old.grid[1] = ['Direct Line — Work Queue']; old.grid[6] = ['=IF($Y7="","",INDEX(Orders!H:H,$Y7))'];
for (const t of ['Clients', 'Orders', 'Sync Log']) addTab(t).hidden = t !== 'Clients';

Object.assign(env, {
  GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet-id', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'writer@example.iam.gserviceaccount.com', CRON_SECRET: 'cron-test',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }),
});
const settle = () => new Promise(r => setTimeout(r, 300)); // background sheet syncs (waitUntil absent → awaited, but be safe)
const cron = async () => (await route(new Request('http://x/api/cron/supplier-sheet', { headers: { authorization: 'Bearer cron-test' } }), { db: DB, env })).json();
const wq = () => { const g = sheets.get(WQ).grid; const ids = {}; for (let r = FIRST_ROW - 1; r < g.length; r++) if (g[r]?.[27]) ids[Number(g[r][27])] = r; return ids; };
const cell = (orderId, c) => sheets.get(WQ).grid[wq()[orderId]][c];
const supplierTypes = (orderId, c, v) => { sheets.get(WQ).grid[wq()[orderId]][c] = v; };
const N = 15, O = 16, P = 18, D = 3; // layout 3: O Competitor price, P Total cost, Q Tracking, S Shipping status (AB = order id)
const order = async id => (await DB.prepare('SELECT * FROM client_orders WHERE id=?').bind(id).first());
const events = async (id, kind) => (await DB.prepare('SELECT * FROM order_events WHERE order_id=? AND kind=? ORDER BY id').bind(id, kind).all()).results;

const { admin, client, id: clientId } = await seed();
const mk = async ref => (await call('/orders', 'POST', { clientId, orderRef: ref, buyerName: 'Sample Customer', destination: 'US', address1: '1 Sample St\nPittsburgh PA 15206', etsyUrl: 'https://example.com/a https://example.com/b', quantity: 3, notes: '=HYPERLINK("http://evil","x")' }, admin)).data.order;
const A = await mk('A-COST'), B = await mk('B-SHIP'), C = await mk('C-ADMIN'), X = await mk('X-CANCEL'), Z = await mk('Z-ARCHIVE');
await call('/orders/' + X.id, 'PUT', { status: 'processing' }, admin);
await call('/admin/orders/' + Z.id + '/archive', 'POST', { archived: true }, admin);
await settle();
assert.equal(sheets.get(WQ).grid[6][0], '=IF($Y7="","",INDEX(Orders!H:H,$Y7))', 'nothing touches the Work Queue before setup');

// ---------- setup ----------
const setup = await call('/admin/supplier-sheet/setup', 'POST', {}, admin);
assert.equal(setup.status, 200, JSON.stringify(setup.data));
assert.equal(sheets.get(WQ).sheetId, 2026101301, 'same tab id, so existing links still open it');
assert.equal([...sheets.keys()].indexOf(WQ) >= 0, true);
const backup = sheets.get('Work Queue (old formulas)');
assert.ok(backup && backup.hidden && backup.grid[6][0].startsWith('=IF('), 'old formula tab kept as hidden backup');
assert.deepEqual(sheets.get(WQ).grid[4], HEADERS);
assert.deepEqual(Object.keys(wq()).map(Number).sort((a, b) => a - b), [A.id, B.id, C.id, X.id], 'archived order not listed');
assert.equal(cell(A.id, P), NOT_SHIPPED); assert.equal(cell(A.id, N) ?? '', '');
assert.equal(cell(A.id, 13), '=HYPERLINK("http://evil","x")', 'client text is stored as text, never run as a formula');
assert.match(String(cell(A.id, 6)), /^=HYPERLINK\("https:\/\/example.com\/a","Open product"\)$/);
assert.equal(cell(A.id, 26), 'https://example.com/b');
assert.equal(cell(A.id, 14) ?? '', '', 'Competitor price starts empty');
const shopName = (await DB.prepare('SELECT s.name FROM client_stores s JOIN client_orders o ON o.store_id=s.id WHERE o.id=?').bind(A.id).first()).name;
assert.equal(cell(A.id, 2), shopName, 'column C shows the shop, not the client');
assert.equal(HEADERS[2], 'Shop');
assert.ok(!JSON.stringify(sheets.get(WQ).grid).includes('Local Client'), 'client name appears nowhere in the Work Queue');
assert.equal(sheets.get('Clients').hidden, true, 'Clients tab hidden from suppliers');
assert.deepEqual([...sheets].filter(([, s]) => !s.hidden).map(([t]) => t), [WQ], 'only the Work Queue is visible; no temporary tab left');
assert.equal((await call('/admin/supplier-sheet', 'GET', null, admin)).data.enabled, true);
console.log('PASS setup: backup tab, same tab id, headers, active orders only, text-safe cells');

// ---------- supplier fills in the sheet ----------
supplierTypes(A.id, N, 12.5);                       // total cost, whole order
supplierTypes(B.id, O, '9400111899223197428490');   // 22-digit tracking stays text
supplierTypes(B.id, P, SHIPPED);
supplierTypes(X.id, N, 'abc');                      // not a number
let r = await cron(); await settle();
assert.equal(r.ok, true, JSON.stringify(r));
let a = await order(A.id);
assert.equal(Number(a.supplier_cost), 12.5); assert.equal(Number(a.price), 14.5, 'billed = supplier total + $2 commission'); assert.equal(Number(a.product_cost), 14.5); assert.equal(a.shipping_fee, null);
assert.equal((await events(A.id, 'billed')).length, 1);
let b = await order(B.id);
assert.equal(b.tracking_number, '9400111899223197428490'); assert.equal(b.status, 'shipped'); assert.ok(b.edit_locked);
assert.equal((await events(B.id, 'status')).at(-1).detail, 'shipped');
assert.equal(cell(B.id, D), 'Shipped', 'Work Queue status column refreshed from the website');
assert.equal(Number((await order(X.id)).price), 0, 'invalid cost is not billed');
assert.ok(r.skipped.some(s => s.orderId === X.id && /not a number/.test(s.why[0])), 'invalid cost reported to admin');
// Client side: billed, notified, supplier cost hidden.
const cOrders = (await call('/orders', 'GET', null, client)).data.orders;
const ca = cOrders.find(o => o.id === A.id);
assert.equal(ca.price, 14.5); assert.equal(ca.priced, true); assert.equal(ca.supplierCost, undefined); assert.equal(ca.productCost, undefined);
const notes = (await call('/notifications', 'GET', null, client)).data.items;
assert.ok(notes.some(n => n.kind === 'billed' && n.orderId === A.id && n.detail === '14.50'), 'client notified of the bill');
assert.ok(notes.some(n => n.kind === 'tracking' && n.orderId === B.id));
const me = (await call('/me', 'GET', null, client)).data;
assert.equal(me.summary.outstanding, 14.5, 'balance includes the bill');
console.log('PASS supplier → website: bill (total + fee), tracking, shipped, invalid cost refused, client notified, cost hidden from client');

// ---------- idempotent ----------
r = await cron();
assert.equal(r.changed.length, 0); assert.equal((await events(A.id, 'billed')).length, 1); assert.equal((await events(B.id, 'tracking')).length, 1);
console.log('PASS re-check: no duplicate bills or notifications');

// ---------- always editable; sorting is safe ----------
const g = sheets.get(WQ).grid, body = g.splice(FIRST_ROW - 1); body.reverse(); g.push(...body); // supplier sorts the sheet
supplierTypes(A.id, N, '$20.00');
r = await cron();
a = await order(A.id);
assert.equal(Number(a.price), 22); assert.equal((await events(A.id, 'billed')).length, 2);
assert.equal((await call('/me', 'GET', null, client)).data.summary.outstanding, 22);
console.log('PASS cost changed after sorting: re-billed to the right order (22.00), balance follows');

// ---------- admin changes on the website go to the sheet, supplier edits are not overwritten ----------
await call('/orders/' + C.id, 'PUT', { trackingNumber: 'ADMIN-TRACK-1' }, admin); await settle();
assert.equal(cell(C.id, O), 'ADMIN-TRACK-1');
await call('/orders/' + C.id, 'PUT', { status: 'shipped' }, admin); await settle();
assert.equal(cell(C.id, P), SHIPPED);
supplierTypes(C.id, O, 'SUPPLIER-TRACK-2');
await call('/orders/' + C.id + '/messages', 'POST', { body: 'unrelated update' }, admin); await settle(); // triggers a row refresh
assert.equal(cell(C.id, O), 'SUPPLIER-TRACK-2', 'a website refresh does not undo the supplier’s new value');
await cron();
assert.equal((await order(C.id)).tracking_number, 'SUPPLIER-TRACK-2');
console.log('PASS website → sheet for admin changes; supplier edit kept and applied');

// ---------- shipped on a cancelled order is refused ----------
await DB.prepare("UPDATE client_orders SET status='cancelled' WHERE id=?").bind(X.id).run();
supplierTypes(X.id, P, SHIPPED);
r = await cron();
assert.equal((await order(X.id)).status, 'cancelled');
assert.ok(r.skipped.some(s => s.orderId === X.id && /cancelled/.test(s.why.join())), 'reported');
console.log('PASS Shipped on a cancelled order is not applied and is reported');

// ---------- new orders and archiving ----------
const before = Object.keys(wq()).length;
const D2 = await mk('D-NEW'); await settle();
assert.equal(Object.keys(wq()).length, before + 1); assert.equal(cell(D2.id, P), NOT_SHIPPED);
await call('/admin/orders/' + D2.id + '/archive', 'POST', { archived: true }, admin); await settle();
assert.equal(wq()[D2.id], undefined, 'archived order row removed');
console.log('PASS new order appended; archived order removed');

// ---------- Competitor price (O): the client enters it in the portal ("Your numbers", any time); the sheet shows it ----------
const cp = await call('/orders/' + A.id, 'PUT', { competitorPrice: '  $24.90 on   Etsy shop X ' }, client); await settle();
assert.equal(cp.status, 200, JSON.stringify(cp.data)); assert.equal(cp.data.order.competitorPrice, '$24.90 on Etsy shop X');
assert.equal(cell(A.id, 14), '$24.90 on Etsy shop X', 'shown in the supplier sheet');
await call('/orders/' + A.id, 'PUT', { notes: 'resync me' }, admin); await settle();
assert.equal(cell(A.id, 13), 'resync me', 'row was rewritten'); assert.equal(cell(A.id, 14), '$24.90 on Etsy shop X', 'competitor price kept');
console.log('PASS competitor price from the client portal reaches the sheet and stays when the row is rewritten');

// ---------- setup again keeps supplier data ----------
supplierTypes(A.id, N, 25);
const again = await call('/admin/supplier-sheet/setup', 'POST', {}, admin);
assert.equal(again.status, 200, JSON.stringify(again.data));
assert.equal(Number((await order(A.id)).price), 27, 'pending supplier change applied before rebuilding');
assert.equal(cell(A.id, N), 25); assert.equal(cell(B.id, O), '9400111899223197428490'); assert.equal(cell(B.id, P), SHIPPED);
assert.equal(cell(A.id, 14), '$24.90 on Etsy shop X', 'competitor price kept through a rebuild');
assert.ok(sheets.get('Work Queue (old formulas)').grid[6][0].startsWith('=IF('), 'original backup kept, not replaced');
assert.deepEqual([...sheets].filter(([t, s]) => !s.hidden && t !== 'Product Quotes').map(([t]) => t), [WQ], 'rebuild works; besides the supplier Product Quotes tab only the Work Queue is visible');
assert.equal(sheets.get(WQ).sheetId, 2026101301);
console.log('PASS running setup again keeps supplier values and the original backup');

// Cron needs the secret.
assert.equal((await route(new Request('http://x/api/cron/supplier-sheet'), { db: DB, env })).status, 401);
console.log('PASS cron refuses calls without the secret');
await pg.close();
