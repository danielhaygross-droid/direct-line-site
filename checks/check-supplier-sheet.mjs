// Local check for the supplier Work Queue (branch claude/supplier-sheet), run from the project root:
//   node checks/check-supplier-sheet.mjs
// PGlite (real Postgres) + the real API code + an in-memory fake of the Google Sheets API. No live data.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { DB, env, call, seed, pg } from './lib.mjs';
import { route } from '../api/index.mjs';
import { WQ, WQ_NEW, LOG_NEW, TAB_NAMES, FIRST_ROW, HEADERS, SHIPPED, NOT_SHIPPED, SHIPPED_TAB, CANCELLED_TAB } from '../server/supplier-sheet.mjs';

// ---------- fake Google Sheets ----------
const sheets = new Map(); // title -> { sheetId, hidden, grid: array of rows (arrays), prot: protected ranges }
let nextId = 100;
const addTab = (title, sheetId = nextId++) => { sheets.set(title, { sheetId, hidden: false, grid: [], prot: [] }); return sheets.get(title); };
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
const requests = [], meta = []; // meta: the spreadsheet's developer metadata (the cron's "last seen" mark)
globalThis.fetch = (real => async (url, opt = {}) => {
  url = String(url);
  if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 't', expires_in: 3600 });
  if (!url.includes('sheets.googleapis.com')) return real(url, opt);
  const path = url.split('/spreadsheets/sheet-id')[1], body = opt.body ? JSON.parse(opt.body) : null, method = opt.method || 'GET';
  requests.push(method + ' ' + decodeURIComponent(path).slice(0, 80));
  if (path.startsWith('?fields=developerMetadata')) return Response.json({ developerMetadata: meta, sheets: [...sheets.keys()].map(title => ({ properties: { title } })) });
  if (path.startsWith('?fields=sheets(properties(sheetId),protectedRanges')) return Response.json({ sheets: [...sheets.values()].map(s => ({ properties: { sheetId: s.sheetId }, protectedRanges: s.prot.map((p, i) => ({ protectedRangeId: i + 1 })) })) });
  if (path.startsWith('?fields=sheets.properties')) return Response.json({ sheets: [...sheets].map(([title, s]) => ({ properties: { title, sheetId: s.sheetId, hidden: s.hidden } })) });
  if (path === ':batchUpdate') {
    const replies = [];
    for (const rq of body.requests) {
      const [kind, a] = Object.entries(rq)[0];
      const byId = id => [...sheets].find(([, s]) => s.sheetId === id);
      if (kind === 'duplicateSheet') { const [, src] = byId(a.sourceSheetId); if (sheets.has(a.newSheetName) || (a.newSheetId != null && byId(a.newSheetId))) return Response.json({ error: { message: 'taken' } }, { status: 400 }); const t = addTab(a.newSheetName, a.newSheetId ?? nextId++); t.grid = JSON.parse(JSON.stringify(src.grid)); t.prot = [...src.prot]; t.hidden = src.hidden; }
      else if (kind === 'addProtectedRange') byId(a.protectedRange.range.sheetId)[1].prot.push(a.protectedRange);
      else if (kind === 'moveDimension') { const [, s] = byId(a.source.sheetId), n = a.source.endIndex - a.source.startIndex; while (s.grid.length < a.source.endIndex) s.grid.push([]); const items = s.grid.splice(a.source.startIndex, n); s.grid.splice(a.destinationIndex > a.source.startIndex ? a.destinationIndex - n : a.destinationIndex, 0, ...items); }
      else if (kind === 'updateSheetProperties') {
        const [title, tab] = byId(a.properties.sheetId);
        if (a.fields.includes('hidden')) tab.hidden = a.properties.hidden;
        if (a.fields.includes('title')) { if (sheets.has(a.properties.title)) return Response.json({ error: { message: 'name taken' } }, { status: 400 }); const all = [...sheets]; sheets.clear(); for (const [t, x] of all) sheets.set(t === title ? a.properties.title : t, x); }
      }
      else if (kind === 'deleteSheet') { const [title] = byId(a.sheetId); if (![...sheets].some(([t, s]) => t !== title && !s.hidden)) return Response.json({ error: { code: 400, message: "Invalid requests[0].deleteSheet: You can't remove all the visible sheets in a document." } }, { status: 400 }); sheets.delete(title); }
      else if (kind === 'addSheet') { const p = a.properties; if (p.sheetId != null && byId(p.sheetId)) throw new Error('id in use'); const t = addTab(p.title, p.sheetId ?? nextId++); replies.push({ addSheet: { properties: { sheetId: t.sheetId, title: p.title } } }); continue; }
      else if (kind === 'createDeveloperMetadata') meta.push({ metadataId: meta.length + 1, ...a.developerMetadata });
      else if (kind === 'updateDeveloperMetadata') { const l = a.dataFilters[0].developerMetadataLookup; for (const m of meta) if (m.metadataId === l.metadataId || m.metadataKey === l.metadataKey) m.metadataValue = a.developerMetadata.metadataValue; }
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
const later = () => { for (const m of meta) m.metadataValue = String(m.metadataValue).split('|')[0] + '|0'; }; // 3+ hours since the last full check
const settle = () => new Promise(r => setTimeout(r, 300)); // background sheet syncs (waitUntil absent → awaited, but be safe)
const cron = async () => (await route(new Request('http://x/api/cron/supplier-sheet', { headers: { authorization: 'Bearer cron-test' } }), { db: DB, env })).json();
const main = () => (sheets.has(WQ) ? WQ : WQ_NEW), TABS = () => [main(), SHIPPED_TAB, CANCELLED_TAB];
const idsIn = tab => { const g = sheets.get(tab)?.grid || []; const ids = {}; for (let r = FIRST_ROW - 1; r < g.length; r++) if (Number(g[r]?.[30]) > 0) ids[Number(g[r][30])] = r; return ids; };
const wq = () => idsIn(main()); // the supplier tab (orders still to do)
// [tab, grid index] of an order, in whichever of the three tabs it is.
const where = id => { for (const t of TABS()) { const r = idsIn(t)[id]; if (r !== undefined) return [t, r]; } return null; };
const cell = (orderId, c) => { const [t, r] = where(orderId); return sheets.get(t).grid[r][c]; };
const supplierTypes = (orderId, c, v) => { const [t, r] = where(orderId); sheets.get(t).grid[r][c] = v; };
const count = id => TABS().filter(t => idsIn(t)[id] !== undefined).length;
const N = 15, O = 16, P = 18, D = 3; // layout 3: O Competitor price, P Total cost, Q Tracking, S Shipping status (AE = order id)
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
assert.deepEqual(Object.entries(wq()).sort((a, b) => a[1] - b[1]).map(([id]) => Number(id)), [X.id, C.id, B.id, A.id], 'newest order on top');
assert.ok(sheets.has(SHIPPED_TAB) && sheets.has(CANCELLED_TAB), 'Shipped and Cancelled tabs made');
assert.deepEqual(sheets.get(SHIPPED_TAB).grid[4], HEADERS, 'same columns'); assert.equal(Object.keys(idsIn(SHIPPED_TAB)).length, 0, 'nothing shipped yet');
assert.ok(sheets.get(SHIPPED_TAB).prot.length >= 3 && sheets.get(CANCELLED_TAB).prot.length >= 3, 'website columns protected in the new tabs');
assert.equal(cell(A.id, P), NOT_SHIPPED); assert.equal(cell(A.id, N) ?? '', '');
assert.equal(cell(A.id, 13), '=HYPERLINK("http://evil","x")', 'client text is stored as text, never run as a formula');
assert.match(String(cell(A.id, 6)), /^=HYPERLINK\("https:\/\/example.com\/a","Open product 1"\)$/, 'two links: numbered');
assert.equal(cell(A.id, 29), 'Product 2: https://example.com/b', 'more product links in AD, numbered');
assert.equal(cell(A.id, 14) ?? '', '', 'Competitor price starts empty');
const shopName = (await DB.prepare('SELECT s.name FROM client_stores s JOIN client_orders o ON o.store_id=s.id WHERE o.id=?').bind(A.id).first()).name;
assert.equal(cell(A.id, 2), shopName, 'column C shows the shop, not the client');
assert.equal(HEADERS[2], 'Shop');
assert.ok(!JSON.stringify(sheets.get(WQ).grid).includes('Local Client'), 'client name appears nowhere in the Work Queue');
assert.equal(sheets.get('Clients').hidden, true, 'Clients tab hidden from suppliers');
assert.deepEqual([...sheets].filter(([, s]) => !s.hidden).map(([t]) => t), [WQ, SHIPPED_TAB, CANCELLED_TAB], 'only the supplier tabs are visible; no temporary tab left');
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
assert.deepEqual(where(B.id), [SHIPPED_TAB, FIRST_ROW - 1], 'shipped with tracking: moved to the Shipped tab, on top'); assert.equal(count(B.id), 1, 'in one tab only');
assert.equal(cell(B.id, O), '9400111899223197428490', 'the supplier’s tracking moved with it, still text');
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
assert.ok(r.unchanged || r.changed.length === 0, JSON.stringify(r)); assert.equal((await events(A.id, 'billed')).length, 1); assert.equal((await events(B.id, 'tracking')).length, 1);
console.log('PASS re-check: no duplicate bills or notifications');

// ---------- always editable; sorting is safe ----------
const g = sheets.get(WQ).grid, body = g.splice(FIRST_ROW - 1); body.reverse(); g.push(...body); // supplier sorts the sheet
supplierTypes(A.id, N, '$20.00');
r = await cron();
a = await order(A.id);
assert.equal(Number(a.price), 22); assert.equal((await events(A.id, 'billed')).length, 1);
assert.deepEqual((await events(A.id, 'price_changed')).map(e => e.detail), ['14.50|22.00'], 'a later cost change is a price change, not a second bill');
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
assert.deepEqual(where(D2.id), [main(), FIRST_ROW - 1], 'a new order goes on top of the supplier tab');
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
assert.deepEqual([...sheets].filter(([t, s]) => !s.hidden && t !== 'Product Quotes').map(([t]) => t).sort(), [WQ, SHIPPED_TAB, CANCELLED_TAB].sort(), 'rebuild works; besides the supplier Product Quotes tab only the three supplier tabs are visible');
assert.equal(where(B.id)[0], SHIPPED_TAB, 'rebuilt: the shipped order is in Shipped again'); assert.equal(count(B.id), 1);
assert.equal(sheets.get(WQ).sheetId, 2026101301);
console.log('PASS running setup again keeps supplier values and the original backup');

// ---------- the tabs are renamed: hidden website log "Orders" -> "Order Log", then "Work Queue" -> "Orders" ----------
assert.ok(sheets.has(LOG_NEW) && sheets.get(LOG_NEW).hidden, 'step 1 already happened on the first poll: the hidden website log is "Order Log"');
assert.ok(!sheets.has('Orders') && sheets.has(WQ), 'the supplier tab keeps its old name for at least 10 minutes');
assert.ok(lastRow(LOG_NEW) > 5, 'the website log is written under its new name');
const logId = sheets.get(LOG_NEW).sheetId;
assert.equal((await cron()).ok, true); assert.ok(sheets.has(WQ), 'still waiting');
await DB.prepare('UPDATE portal_settings SET value=? WHERE key=?').bind('log:' + (Math.floor(Date.now() / 1000) - 700), TAB_NAMES).run();
later(); const switched = await cron(); assert.equal(switched.ok, true, JSON.stringify(switched));
assert.equal((await DB.prepare('SELECT value FROM portal_settings WHERE key=?').bind(TAB_NAMES).first()).value, 'done');
assert.ok(!sheets.has(WQ) && sheets.get(WQ_NEW).sheetId === 2026101301, 'the supplier tab is now "Orders" (same tab id, links still open it)');
assert.equal(sheets.get(LOG_NEW).sheetId, logId); assert.equal(sheets.get(WQ_NEW).grid[1][0], 'Direct Line — Orders');
assert.deepEqual([...sheets].filter(([t, s]) => !s.hidden && t !== 'Product Quotes').map(([t]) => t).sort(), [WQ_NEW, SHIPPED_TAB, CANCELLED_TAB].sort(), 'only "Orders", Shipped and Cancelled are visible');
const rowOf = id => sheets.get(WQ_NEW).grid.findIndex(r => r && Number(r[30]) === id);
const T = await mk('T-TABS'); await settle();
assert.ok(rowOf(T.id) > 0, 'a new order lands in "Orders"');
assert.ok(sheets.get(LOG_NEW).grid.some(r => r && String(r[0]) === String(T.id)), 'and in the website log "Order Log"');
sheets.get(WQ_NEW).grid[rowOf(T.id)][N] = 12; assert.equal((await cron()).ok, true);
assert.equal(Number((await order(T.id)).supplier_cost), 12, 'the supplier’s cost is read from "Orders"');
const rebuilt = await call('/admin/supplier-sheet/setup', 'POST', {}, admin); assert.equal(rebuilt.status, 200, JSON.stringify(rebuilt.data));
assert.ok(!sheets.has(WQ) && sheets.get(WQ_NEW).sheetId === 2026101301 && rowOf(T.id) > 0, 'running setup again keeps the "Orders" name');
assert.equal(sheets.get(LOG_NEW).sheetId, logId, 'the website log is not touched');
console.log('PASS tab names: "Orders" for the supplier tab, "Order Log" for the website log, in two safe steps; writes, reads and setup follow');

// ---------- Client paid (T) and the totals in row 4: the supplier sees which orders our client has paid ----------
const paidCell = id => sheets.get(WQ_NEW).grid[rowOf(id)][21];
const tabNow = sheets.get(WQ_NEW).grid;
assert.equal(tabNow[4][21], 'Client paid'); assert.deepEqual(tabNow[3].slice(14, 16), ['Totals (USD):', '=SUM(P6:P)'], 'row 4: totals worked out by the sheet');
assert.match(tabNow[3][16], /SUMIF\(V6:V,"Paid",P6:P\)/); assert.match(tabNow[3][17], /SUMIF\(V6:V,"Not paid",P6:P\)/);
assert.equal(paidCell(T.id), 'Not paid', 'billed, no payment yet');
const pay = await call('/admin/payments', 'POST', { clientId, amount: 14, orderIds: [T.id] }, admin); assert.equal(pay.status, 200, JSON.stringify(pay.data));
assert.ok(await DB.prepare("SELECT 1 AS x FROM portal_settings WHERE key='supplier_sheet_paid_dirty'").first(), 'the column is marked for the next poll');
assert.equal((await cron()).ok, true); assert.equal(paidCell(T.id), 'Paid', 'the next poll shows it');
assert.equal(await DB.prepare("SELECT 1 AS x FROM portal_settings WHERE key='supplier_sheet_paid_dirty'").first(), null, 'done');
await call('/admin/payments/' + pay.data.id + '/delete', 'POST', {}, admin); assert.equal((await cron()).ok, true);
assert.equal(paidCell(T.id), 'Not paid', 'an archived payment does not count');
console.log('PASS Client paid column follows the payments; row 4 adds up the supplier’s Total cost (all / paid / not paid)');

// Rows waiting for the sheet are rewritten by the cron too, with no admin screen open.
const W = (await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === T.id);
// Neon free plan (26 Oct): the cron only wakes the database when the supplier's columns changed.
await cron(); let q = await cron(); assert.equal(q.unchanged, true, 'sheet unchanged: database not touched ' + JSON.stringify(q));
assert.equal(meta.length, 1, 'one invisible mark on the spreadsheet');
sheets.get(WQ_NEW).grid[rowOf(W.id)][15] = 31.5; q = await cron(); assert.ok(!q.unchanged && q.checked > 0, JSON.stringify(q));
assert.equal((await order(W.id)).supplier_cost, 31.5, 'the supplier\'s new cost was applied');
assert.equal((await cron()).unchanged, true, 'and then quiet again');
// A row still waiting for the sheet keeps the cron doing full checks until it is written (26 Oct: 26 cancelled rows waited).
await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting', sheet_next_try=? WHERE id=?").bind(Math.floor(Date.now() / 1000) + 3600, W.id).run();
later(); await cron(); q = await cron(); assert.ok(!q.unchanged, 'a waiting row: no quiet minutes ' + JSON.stringify(q));
await DB.prepare("UPDATE client_orders SET sheet_sync_status='synced' WHERE id=?").bind(W.id).run(); await cron(); assert.equal((await cron()).unchanged, true, 'quiet again once written');
console.log('PASS cron reads only the sheet when nothing changed; a supplier edit wakes the database');
const gW = sheets.get(WQ_NEW).grid, rW = rowOf(W.id); gW[rW][D] = 'stale';
await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting', sheet_next_try=0 WHERE id=?").bind(W.id).run();
await DB.prepare("DELETE FROM portal_settings WHERE key='sheet_retry_until'").run();
later(); // 3 hours later: a full check even if the sheet did not change
const c = await cron(); assert.equal(c.ok, true); assert.ok(c.retry.attempted >= 1, JSON.stringify(c.retry));
assert.notEqual(gW[rW][D], 'stale', 'the cron rewrote the waiting row');
assert.equal((await order(W.id)).sheet_sync_status, 'synced');
console.log('PASS the cron rewrites rows waiting for the sheet (at least every 3 hours)');

// ---------- Shipped / Cancelled tabs (Erwin, 29 Oct 2026): the supplier tab shows only orders still to do ----------
const S1 = await mk('S-SHIP-NO-TRACK'); await settle();
supplierTypes(S1.id, N, 9); supplierTypes(S1.id, P, SHIPPED); await cron(); await settle();
assert.equal((await order(S1.id)).status, 'shipped'); assert.equal(where(S1.id)[0], main(), 'Shipped but no tracking yet: stays in the supplier tab');
supplierTypes(S1.id, O, 'LATE-TRACK-1'); supplierTypes(S1.id, 32, 'CN-DOMESTIC-1'); await cron(); await settle();
assert.deepEqual(where(S1.id), [SHIPPED_TAB, FIRST_ROW - 1], 'tracking added: moved to Shipped, on top'); assert.equal(count(S1.id), 1);
assert.equal(cell(S1.id, N), 9); assert.equal(cell(S1.id, P), SHIPPED); assert.equal(cell(S1.id, 32), 'CN-DOMESTIC-1', 'domestic tracking moved with it');
supplierTypes(S1.id, O, 'FIXED-TRACK-2'); await cron();
assert.equal((await order(S1.id)).tracking_number, 'FIXED-TRACK-2', 'a tracking fix in the Shipped tab is applied');
supplierTypes(S1.id, N, 11); await cron();
assert.equal(Number((await order(S1.id)).price), 13, 'a cost change in the Shipped tab is billed');
const K = await mk('K-CANCEL'); await settle();
const cancelled = await call('/orders/' + K.id, 'PUT', { status: 'cancelled', fee: 0 }, admin); assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data)); await settle();
assert.deepEqual(where(K.id), [CANCELLED_TAB, FIRST_ROW - 1], 'cancelled: moved to the Cancelled tab'); assert.equal(count(K.id), 1);
assert.equal(cell(K.id, P), 'Cancelled', 'Shipping status says Cancelled'); assert.equal(cell(K.id, D), 'CANCELLED - do not ship');
supplierTypes(K.id, 33, 4); await cron();
assert.equal(Number((await order(K.id)).supplier_cancel_fee), 4, 'a fee typed in the Cancelled tab is read');
assert.equal(Number((await DB.prepare("SELECT amount FROM client_balance_adjustments WHERE order_id=? AND kind='cancellation_fee'").bind(K.id).first())?.amount), 4, 'and billed');
const back = await call('/orders/' + K.id, 'PUT', { status: 'pending' }, admin); assert.equal(back.status, 200, JSON.stringify(back.data)); await settle();
assert.deepEqual(where(K.id), [main(), FIRST_ROW - 1], 'reopened: back in the supplier tab'); assert.equal(cell(K.id, 33), 4, 'fee kept with the row');
// A move that stopped halfway (row in two tabs) is cleaned up on the next write, and read once meanwhile.
const [kt, kr] = where(K.id); sheets.get(SHIPPED_TAB).grid.splice(FIRST_ROW - 1, 0, [...sheets.get(kt).grid[kr]]);
assert.equal(count(K.id), 2); assert.equal((await cron()).ok, true);
await call('/orders/' + K.id, 'PUT', { notes: 'refresh' }, admin); await settle(); assert.equal(count(K.id), 1, 'duplicate removed');
console.log('PASS Shipped (with tracking) and Cancelled tabs: rows move by themselves, newest on top, supplier edits there are read');

// ---------- Refunded (Erwin, 29 Oct 2026): a cancelled order the client had paid for ----------
const R = await mk('R-REFUND'); await settle();
supplierTypes(R.id, N, 10); await cron(); await settle();
const rp = await call('/admin/payments', 'POST', { clientId, amount: 12, orderIds: [R.id] }, admin); assert.equal(rp.status, 200, JSON.stringify(rp.data)); await cron();
assert.equal((await call('/orders/' + R.id, 'PUT', { status: 'cancelled', fee: 0 }, admin)).status, 200); await settle();
assert.equal(where(R.id)[0], CANCELLED_TAB); assert.equal(cell(R.id, P), 'Refunded', 'paid + cancelled: Shipping status says Refunded');
assert.ok((await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === R.id).paymentId, 'the portal knows it was paid (Refunded tag)');
await call('/admin/payments/' + rp.data.id + '/delete', 'POST', {}, admin); await cron();
assert.equal(cell(R.id, P), 'Cancelled', 'payment archived: back to Cancelled');
console.log('PASS Refunded: paid cancelled orders say Refunded in the Cancelled tab, and follow the payments');

// ---------- one-time switch from layout 13: one tab, oldest first, a broken row ----------
const allRows = TABS().flatMap(t => Object.values(idsIn(t)).map(r => sheets.get(t).grid[r])).sort((a, b) => Number(a[30]) - Number(b[30]));
sheets.delete(SHIPPED_TAB); sheets.delete(CANCELLED_TAB);
const gm = sheets.get(main()).grid; gm.length = FIRST_ROW - 1; gm.push(...allRows.map(r => [...r]), Array(33).fill('2026-10-11'));
await DB.prepare("UPDATE portal_settings SET value='13' WHERE key='supplier_sheet_layout'").run();
const ids0 = allRows.map(r => Number(r[30])), st = new Map();
for (const id of ids0) st.set(id, await order(id));
later(); const sw = await cron(); assert.equal(sw.ok, true, JSON.stringify(sw));
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '15');
for (const id of ids0) { const o = st.get(id), want = o.status === 'cancelled' ? CANCELLED_TAB : ['shipped', 'delivered'].includes(o.status) && o.tracking_number ? SHIPPED_TAB : main(); assert.equal(where(id)?.[0], want, 'order ' + id + ' in ' + want); assert.equal(count(id), 1); }
for (const t of TABS()) { const order0 = Object.entries(idsIn(t)).sort((a, b) => a[1] - b[1]).map(([id]) => st.get(Number(id))); assert.deepEqual(order0.map(o => o.id), [...order0].sort((a, b) => b.created_at - a.created_at || b.id - a.id).map(o => o.id), t + ': newest on top'); }
assert.ok(sheets.get(main()).grid.some(r => r?.[0] === '2026-10-11'), 'a row without an order id stays in the supplier tab');
assert.ok(!sheets.get(SHIPPED_TAB).grid.some(r => r?.[0] === '2026-10-11'), 'and is not copied');
assert.equal(cell(B.id, O), '9400111899223197428490'); assert.equal(sheets.get(SHIPPED_TAB).grid[2][0], 'Shipped orders with a tracking number, newest on top. They move here from the Orders tab by themselves. You can still correct the Total cost, Tracking number or Courier here: the website reads this tab too.');
console.log('PASS one-time switch: three tabs, every order in exactly one, newest on top, supplier values kept');

// Cron needs the secret.
assert.equal((await route(new Request('http://x/api/cron/supplier-sheet'), { db: DB, env })).status, 401);
console.log('PASS cron refuses calls without the secret');
await pg.close();
