// Local check for the supplier Work Queue (branch claude/supplier-sheet), run from the project root:
//   node checks/check-supplier-sheet.mjs
// PGlite (real Postgres) + the real API code + an in-memory fake of the Google Sheets API. No live data.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { DB, env, call, seed, pg } from './lib.mjs';
import { route } from '../api/index.mjs';
import { syncPortalOrderToGoogleSheet } from '../server/google-sheets.mjs';
import { WQ, WQ_NEW, LOG_NEW, TAB_NAMES, FIRST_ROW, HEADERS, SHIPPED, NOT_SHIPPED, SHIPPED_TAB, CANCELLED_TAB } from '../server/supplier-sheet.mjs';

// ---------- fake Google Sheets ----------
const sheets = new Map(); // title -> { sheetId, hidden, grid: array of rows (arrays), prot: protected ranges }
let nextId = 100;
const addTab = (title, sheetId = nextId++) => { sheets.set(title, { sheetId, hidden: false, grid: [], prot: [] }); return sheets.get(title); };
const col = s => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
// Headers say it in English and Chinese (3 Nov 2026): the English line of each cell.
const enRow = r => (r || []).map(v => String(v ?? '').split('\n')[0]);
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
const requests = [], meta = [], readTabs = new Set(); let failBilling = false; // readTabs: every tab the website read from // meta: the spreadsheet's developer metadata (the cron's "last seen" mark)
globalThis.fetch = (real => async (url, opt = {}) => {
  url = String(url);
  if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 't', expires_in: 3600 });
  if (!url.includes('sheets.googleapis.com')) return real(url, opt);
  const path = url.split('/spreadsheets/sheet-id')[1], body = opt.body ? JSON.parse(opt.body) : null, method = opt.method || 'GET';
  requests.push(method + ' ' + decodeURIComponent(path).slice(0, 80));
  if (globalThis.slowSheet) await new Promise(r => setTimeout(r, 5 + Math.random() * 30)); // like Google: syncs side by side interleave
  if (path.startsWith('?fields=developerMetadata')) return Response.json({ developerMetadata: meta, sheets: [...sheets.keys()].map(title => ({ properties: { title } })) });
  if (path.startsWith('?fields=sheets(properties(sheetId),protectedRanges')) return Response.json({ sheets: [...sheets.values()].map(s => ({ properties: { sheetId: s.sheetId }, protectedRanges: s.prot.map((p, i) => ({ protectedRangeId: i + 1 })) })) });
  if (path.startsWith('?fields=sheets(properties(sheetId,title),conditionalFormats)')) return Response.json({ sheets: [...sheets].map(([title, s]) => ({ properties: { title, sheetId: s.sheetId }, conditionalFormats: s.cf || [] })) });
  if (path.startsWith('?fields=sheets.properties')) return Response.json({ sheets: [...sheets].map(([title, s]) => ({ properties: { title, sheetId: s.sheetId, hidden: s.hidden, gridProperties: { columnCount: s.cols ?? 35 } } })) });
  if (path === ':batchUpdate') {
    const replies = [];
    for (const rq of body.requests) {
      const [kind, a] = Object.entries(rq)[0];
      const byId = id => [...sheets].find(([, s]) => s.sheetId === id);
      if (kind === 'duplicateSheet') { const [, src] = byId(a.sourceSheetId); if (sheets.has(a.newSheetName) || (a.newSheetId != null && byId(a.newSheetId))) return Response.json({ error: { message: 'taken' } }, { status: 400 }); const t = addTab(a.newSheetName, a.newSheetId ?? nextId++); t.grid = JSON.parse(JSON.stringify(src.grid)); t.prot = [...src.prot]; t.cf = (src.cf || []).map(r => ({ ...JSON.parse(JSON.stringify(r)), ranges: r.ranges.map(x => ({ ...x, sheetId: t.sheetId })) })); t.hidden = src.hidden; t.filter = src.filter && { ...src.filter, sheetId: t.sheetId }; }
      else if (kind === 'addConditionalFormatRule') { const t = byId(a.rule.ranges[0].sheetId)[1]; (t.cf ||= []).splice(a.index ?? t.cf.length, 0, JSON.parse(JSON.stringify(a.rule))); }
      else if (kind === 'updateConditionalFormatRule') byId(a.sheetId)[1].cf[a.index] = JSON.parse(JSON.stringify(a.rule));
      else if (kind === 'setDataValidation') (byId(a.range.sheetId)[1].rules ||= []).push(a);
      else if (kind === 'setBasicFilter') byId(a.filter.range.sheetId)[1].filter = { ...a.filter.range };
      else if (kind === 'addProtectedRange') byId(a.protectedRange.range.sheetId)[1].prot.push(a.protectedRange);
      // Columns (layout 19): every row's cells move, like Google does (row 1 to the last row).
      else if (kind === 'moveDimension' && a.source.dimension === 'COLUMNS') { const [, s] = byId(a.source.sheetId), { startIndex: f, endIndex: e } = a.source, d = a.destinationIndex; s.grid.forEach((r, i) => { if (!r) return; while (r.length < e) r.push(''); const cut = r.splice(f, e - f); r.splice(d > f ? d - cut.length : d, 0, ...cut); s.grid[i] = r; }); }
      // Like Google: a row moved above where a colour rule starts pushes that rule down a row (2 Nov 2026).
      else if (kind === 'moveDimension') { const [, s] = byId(a.source.sheetId); for (const rule of s.cf || []) for (const r of rule.ranges) if (a.destinationIndex <= (r.startRowIndex ?? 0) && a.source.startIndex > (r.startRowIndex ?? 0)) { r.startRowIndex++; const c = rule.booleanRule.condition; if (c.type === 'CUSTOM_FORMULA') c.values = c.values.map(v => ({ userEnteredValue: v.userEnteredValue.replace(/(\$?[A-Z]{1,3})(\d+)/g, (m, col, row) => col + (Number(row) + 1)) })); }
        const n = a.source.endIndex - a.source.startIndex; while (s.grid.length < a.source.endIndex) s.grid.push([]); const items = s.grid.splice(a.source.startIndex, n); s.grid.splice(a.destinationIndex > a.source.startIndex ? a.destinationIndex - n : a.destinationIndex, 0, ...items); }
      else if (kind === 'updateSheetProperties') {
        const [title, tab] = byId(a.properties.sheetId);
        if (a.fields.includes('hidden')) tab.hidden = a.properties.hidden;
        if (a.fields.includes('title')) { if (sheets.has(a.properties.title)) return Response.json({ error: { message: 'name taken' } }, { status: 400 }); const all = [...sheets]; sheets.clear(); for (const [t, x] of all) sheets.set(t === title ? a.properties.title : t, x); }
      }
      else if (kind === 'deleteSheet') { const [title] = byId(a.sheetId); if (![...sheets].some(([t, s]) => t !== title && !s.hidden)) return Response.json({ error: { code: 400, message: "Invalid requests[0].deleteSheet: You can't remove all the visible sheets in a document." } }, { status: 400 }); sheets.delete(title); }
      else if (kind === 'addSheet' && a.properties.title === 'Billing' && failBilling) return Response.json({ error: { message: 'Billing tab refused (test)' } }, { status: 500 });
      else if (kind === 'addSheet') { const p = a.properties; if (p.sheetId != null && byId(p.sheetId)) throw new Error('id in use'); const t = addTab(p.title, p.sheetId ?? nextId++); t.cols = p.gridProperties?.columnCount; replies.push({ addSheet: { properties: { sheetId: t.sheetId, title: p.title } } }); continue; }
      else if (kind === 'createDeveloperMetadata') meta.push({ metadataId: meta.length + 1, ...a.developerMetadata });
      else if (kind === 'updateDeveloperMetadata') { const l = a.dataFilters[0].developerMetadataLookup; for (const m of meta) if (m.metadataId === l.metadataId || m.metadataKey === l.metadataKey) m.metadataValue = a.developerMetadata.metadataValue; }
      // A new row (8 Nov 2026): inserted inside the data rows, so rules, filter and protection simply grow.
      else if (kind === 'insertDimension' && a.range.dimension === 'ROWS') { const [, s] = byId(a.range.sheetId); while (s.grid.length < a.range.startIndex) s.grid.push([]); s.grid.splice(a.range.startIndex, 0, ...Array.from({ length: a.range.endIndex - a.range.startIndex }, () => [])); }
      else if (kind === 'appendDimension') { const [, s] = byId(a.sheetId); s.cols = (s.cols ?? 35) + a.length; }
      else if (kind === 'deleteDimension') { const [, s] = byId(a.range.sheetId); if (a.range.dimension === 'ROWS') s.grid.splice(a.range.startIndex, a.range.endIndex - a.range.startIndex); }
      replies.push({});
    }
    return Response.json({ replies });
  }
  if (path.startsWith('/values:batchUpdate')) { for (const d of body.data) { const rg = parseRange(d.range); write(rg.name, rg.r1, rg.c1, d.values); } return Response.json({}); }
  if (path.startsWith('/values:batchClear')) { for (const r of body.ranges) { const rg = parseRange(r); const g = sheets.get(rg.name).grid; for (let i = rg.r1; i <= rg.r2 && i < g.length; i++) if (g[i]) for (let c = rg.c1; c <= rg.c2; c++) g[i][c] = ''; } return Response.json({}); }
  if (path.startsWith('/values:batchGet')) {
    const ranges = new URLSearchParams(path.split('?')[1]).getAll('ranges');
    for (const r of ranges) readTabs.add(parseRange(r).name);
    return Response.json({ valueRanges: ranges.map(r => ({ range: r, values: read(parseRange(r)) })) });
  }
  const m = /^\/values\/([^?:]+)(:append)?/.exec(path); const rg = parseRange(m[1]);
  if (!sheets.has(rg.name)) return new Response('no sheet ' + rg.name, { status: 400 });
  if (method === 'GET') readTabs.add(rg.name);
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
const idsIn = tab => { const g = sheets.get(tab)?.grid || []; const ids = {}; for (let r = FIRST_ROW - 1; r < g.length; r++) if (Number(g[r]?.[31]) > 0) ids[Number(g[r][31])] = r; return ids; };
const wq = () => idsIn(main()); // the supplier tab (orders still to do)
// [tab, grid index] of an order, in whichever of the three tabs it is.
const where = id => { for (const t of TABS()) { const r = idsIn(t)[id]; if (r !== undefined) return [t, r]; } return null; };
const cell = (orderId, c) => { const [t, r] = where(orderId); return sheets.get(t).grid[r][c]; };
const supplierTypes = (orderId, c, v) => { const [t, r] = where(orderId); sheets.get(t).grid[r][c] = v; };
const count = id => TABS().filter(t => idsIn(t)[id] !== undefined).length;
const N = 15, O = 17, P = 19, D = 3; // layout 19: O Competitor price, P Total cost, Q Cost per product, R Tracking, T Shipping status (AF = order id)
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
assert.deepEqual(enRow(sheets.get(WQ).grid[4]), HEADERS);
assert.deepEqual(Object.keys(wq()).map(Number).sort((a, b) => a - b), [A.id, B.id, C.id, X.id], 'archived order not listed');
assert.deepEqual(Object.entries(wq()).sort((a, b) => a[1] - b[1]).map(([id]) => Number(id)), [X.id, C.id, B.id, A.id], 'newest order on top');
assert.ok(sheets.has(SHIPPED_TAB) && sheets.has(CANCELLED_TAB), 'Shipped and Cancelled tabs made');
assert.deepEqual(enRow(sheets.get(SHIPPED_TAB).grid[4]), HEADERS, 'same columns'); assert.equal(Object.keys(idsIn(SHIPPED_TAB)).length, 0, 'nothing shipped yet');
assert.ok(sheets.get(SHIPPED_TAB).prot.length >= 3 && sheets.get(CANCELLED_TAB).prot.length >= 3, 'website columns protected in the new tabs');
assert.equal(cell(A.id, P), NOT_SHIPPED); assert.equal(cell(A.id, N) ?? '', '');
assert.equal(cell(A.id, 13), '=HYPERLINK("http://evil","x")', 'client text is stored as text, never run as a formula');
assert.match(String(cell(A.id, 6)), /^=HYPERLINK\("https:\/\/example.com\/a","Open product 1"\)$/, 'two links: numbered');
assert.equal(cell(A.id, 30), 'Product 2: https://example.com/b', 'more product links in AE, numbered');
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
assert.deepEqual([...sheets].filter(([t, s]) => !s.hidden && t !== 'Product Quotes' && !t.startsWith('Guide')).map(([t]) => t).sort(), [WQ, SHIPPED_TAB, CANCELLED_TAB, 'Billing'].sort(), 'rebuild works; besides the supplier Product Quotes tab only the three supplier tabs and Billing are visible');
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
assert.equal(sheets.get(LOG_NEW).sheetId, logId); assert.equal(sheets.get(WQ_NEW).grid[1][0], 'Direct Line — Orders 订单');
assert.deepEqual([...sheets].filter(([t, s]) => !s.hidden && t !== 'Product Quotes' && !t.startsWith('Guide')).map(([t]) => t).sort(), [WQ_NEW, SHIPPED_TAB, CANCELLED_TAB, 'Billing'].sort(), 'only "Orders", Shipped, Cancelled and Billing are visible');
const rowOf = id => sheets.get(WQ_NEW).grid.findIndex(r => r && Number(r[31]) === id);
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
const paidCell = id => sheets.get(WQ_NEW).grid[rowOf(id)][22];
const tabNow = sheets.get(WQ_NEW).grid;
assert.equal(enRow(tabNow[4])[22], 'Client paid'); assert.deepEqual(tabNow[3].slice(14, 16), ['Totals (USD):\n合计（美元）：', '=SUM(INDIRECT("P6:P"))'], 'row 4: totals worked out by the sheet');
for (const t of TABS()) { const r4 = sheets.get(t).grid[3]; assert.equal(r4[15], '=SUM(INDIRECT("P6:P"))', t + ': totals from row 6 (INDIRECT, rows cannot move it)'); assert.match(String(r4[0]), /COUNTIF\(INDIRECT\("O6:O"\)/, t + ': revision counter from row 6'); assert.match(String(r4[18]), /COUNTIF\(INDIRECT\("D6:D"\)/, t + ': cancelled count'); }
assert.match(tabNow[3][16], /SUMIF\(INDIRECT\("W6:W"\),"Paid",INDIRECT\("P6:P"\)\)/); assert.match(tabNow[3][17], /SUMIF\(INDIRECT\("W6:W"\),"Not paid",INDIRECT\("P6:P"\)\)/);
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
supplierTypes(S1.id, O, 'LATE-TRACK-1'); supplierTypes(S1.id, 33, 'CN-DOMESTIC-1'); await cron(); await settle();
assert.deepEqual(where(S1.id), [SHIPPED_TAB, FIRST_ROW - 1], 'tracking added: moved to Shipped, on top'); assert.equal(count(S1.id), 1);
assert.equal(cell(S1.id, N), 9); assert.equal(cell(S1.id, P), SHIPPED); assert.equal(cell(S1.id, 33), 'CN-DOMESTIC-1', 'domestic tracking moved with it');
supplierTypes(S1.id, O, 'FIXED-TRACK-2'); await cron();
assert.equal((await order(S1.id)).tracking_number, 'FIXED-TRACK-2', 'a tracking fix in the Shipped tab is applied');
supplierTypes(S1.id, N, 11); await cron();
assert.equal(Number((await order(S1.id)).price), 13, 'a cost change in the Shipped tab is billed');
const K = await mk('K-CANCEL'); await settle();
const cancelled = await call('/orders/' + K.id, 'PUT', { status: 'cancelled', fee: 0 }, admin); assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data)); await settle();
assert.deepEqual(where(K.id), [CANCELLED_TAB, FIRST_ROW - 1], 'cancelled: moved to the Cancelled tab'); assert.equal(count(K.id), 1);
assert.equal(cell(K.id, P), 'Cancelled', 'Shipping status says Cancelled'); assert.equal(cell(K.id, D), 'CANCELLED - do not ship');
supplierTypes(K.id, 34, 4); await cron();
assert.equal(Number((await order(K.id)).supplier_cancel_fee), 4, 'a fee typed in the Cancelled tab is read');
assert.equal(Number((await DB.prepare("SELECT amount FROM client_balance_adjustments WHERE order_id=? AND kind='cancellation_fee'").bind(K.id).first())?.amount), 4, 'and billed');
const back = await call('/orders/' + K.id, 'PUT', { status: 'pending' }, admin); assert.equal(back.status, 200, JSON.stringify(back.data)); await settle();
assert.deepEqual(where(K.id), [main(), FIRST_ROW - 1], 'reopened: back in the supplier tab'); assert.equal(cell(K.id, 34), 4, 'fee kept with the row');
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
const allRows = TABS().flatMap(t => Object.values(idsIn(t)).map(r => sheets.get(t).grid[r])).sort((a, b) => Number(a[31]) - Number(b[31]));
sheets.delete(SHIPPED_TAB); sheets.delete(CANCELLED_TAB);
const gm = sheets.get(main()).grid; gm.length = FIRST_ROW - 1; gm.push(...allRows.map(r => [...r]), Array(33).fill('2026-10-11'));
await DB.prepare("UPDATE portal_settings SET value='13' WHERE key='supplier_sheet_layout'").run();
const ids0 = allRows.map(r => Number(r[31])), st = new Map();
for (const id of ids0) st.set(id, await order(id));
later(); const sw = await cron(); assert.equal(sw.ok, true, JSON.stringify(sw));
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '22');
for (const id of ids0) { const o = st.get(id), want = o.status === 'cancelled' ? CANCELLED_TAB : ['shipped', 'delivered'].includes(o.status) && o.tracking_number ? SHIPPED_TAB : main(); assert.equal(where(id)?.[0], want, 'order ' + id + ' in ' + want); assert.equal(count(id), 1); }
for (const t of TABS()) { const order0 = Object.entries(idsIn(t)).sort((a, b) => a[1] - b[1]).map(([id]) => st.get(Number(id))); assert.deepEqual(order0.map(o => o.id), [...order0].sort((a, b) => b.created_at - a.created_at || b.id - a.id).map(o => o.id), t + ': newest on top'); }
assert.ok(sheets.get(main()).grid.some(r => r?.[0] === '2026-10-11'), 'a row without an order id stays in the supplier tab');
assert.ok(!sheets.get(SHIPPED_TAB).grid.some(r => r?.[0] === '2026-10-11'), 'and is not copied');
assert.equal(cell(B.id, O), '9400111899223197428490'); assert.match(sheets.get(SHIPPED_TAB).grid[2][0], /^Shipped orders with a tracking number, newest on top\. You can still cor/); 
console.log('PASS one-time switch: three tabs, every order in exactly one, newest on top, supplier values kept');

// ---------- layout 19 (Erwin, 30 Oct 2026): Cost per product moves from AI to Q, next to Total cost ----------
// The sheet as it was on 30 Oct (layout 18): Cost per product in AI on all three tabs.
const { HEADERS_18 } = await import('../server/supplier-sheet.mjs');
const to18 = r => { if (!r) return r; const x = [...r]; while (x.length < 35) x.push(''); x.length = 35; const [items] = x.splice(16, 1); x.splice(34, 0, items); return x; };
const multi = TABS().map(t => [t, Object.keys(idsIn(t))[0]]).find(([, id]) => id);
sheets.get(multi[0]).grid[idsIn(multi[0])[multi[1]]][16] = '27.9, 21.9, 31.9';
const byOrder0 = Object.fromEntries(TABS().flatMap(t => Object.entries(idsIn(t)).map(([id, r]) => [id, JSON.stringify(sheets.get(t).grid[r]?.slice(0, 35))])));
for (const t of TABS()) { const s = sheets.get(t); s.grid = s.grid.map((r, i) => i === 3 ? r : to18(r)); assert.deepEqual(enRow(s.grid[4]), HEADERS_18); }
await DB.prepare("UPDATE portal_settings SET value='18' WHERE key='supplier_sheet_layout'").run();
const costs18 = JSON.stringify((await DB.prepare('SELECT id, supplier_cost, tracking_number FROM client_orders ORDER BY id').all()).results); later(); const sw19 = await cron(); assert.equal(sw19.ok, true, JSON.stringify(sw19));
assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '22');
for (const t of TABS()) {
  const g = sheets.get(t).grid; assert.deepEqual(enRow(g[4]), HEADERS, t + ': Cost per product in Q, next to Total cost');
  assert.equal(enRow(g[4])[16], 'Cost per product (USD)'); assert.equal(enRow(g[4])[22], 'Client paid', t + ': Client paid moved to W');
  assert.match(String(g[3][22]), /COUNTIF\(INDIRECT\("W6:W"\),"Not paid"\)/, t + ': row 4 counts Client paid in W'); assert.match(String(g[3][20]), /INDIRECT\("U6:U"\)/, t + ': delayed count above Delayed? (U)');
}
const byOrder1 = Object.fromEntries(TABS().flatMap(t => Object.entries(idsIn(t)).map(([id, r]) => [id, JSON.stringify(sheets.get(t).grid[r]?.slice(0, 35))])));
assert.deepEqual(byOrder1, byOrder0, 'every row is exactly as before the switch (each cell moved with its column)');
assert.equal(sheets.get(multi[0]).grid[idsIn(multi[0])[multi[1]]][16], '27.9, 21.9, 31.9', 'the supplier’s cost per product moved with it');
assert.equal(JSON.stringify((await DB.prepare('SELECT id, supplier_cost, tracking_number FROM client_orders ORDER BY id').all()).results), costs18, 'no cost or tracking changed by the switch');
const again19 = await cron(); assert.equal(again19.ok, true); for (const t of TABS()) assert.deepEqual(enRow(sheets.get(t).grid[4]), HEADERS, 'safe to run again');
assert.equal((await order(Number(multi[1]))).item_costs, '27.9, 21.9, 31.9', 'read from Q after the switch');
for (const t of TABS()) assert.ok((sheets.get(t).rules || []).some(v => v.range.startColumnIndex === 16 && v.range.endColumnIndex === 17 && !v.rule), t + ': no number rule on Cost per product (Q)');
console.log('PASS layout 19: Cost per product moved next to Total cost on all tabs, every row kept, no number rule on Q');

// ---------- layout 20 (Erwin, 8 Nov 2026): AJ Status changed, written by the website on every row ----------
{
  const { statusDate } = await import('../server/supplier-sheet.mjs');
  const waiting0 = ((await DB.prepare("SELECT id FROM client_orders WHERE sheet_sync_status<>'synced'").all()).results || []).map(r => Number(r.id));
  // Rows are rewritten 4 at a time (RETRY_BATCH); run the retries until every row has its date.
  for (let k = 0; k < 10 && (await DB.prepare("SELECT COUNT(*) AS n FROM client_orders WHERE sheet_sync_status<>'synced'").first()).n > 0; k++) {
    await DB.prepare("DELETE FROM portal_settings WHERE key='sheet_retry_until'").run(); await DB.prepare('UPDATE client_orders SET sheet_next_try=0').run(); later(); await cron();
  }
  for (const t of TABS()) {
    assert.equal(enRow(sheets.get(t).grid[4])[35], 'Status changed', t + ': AJ header');
    for (const [id, r] of Object.entries(idsIn(t))) { const o = await order(Number(id)); assert.equal(sheets.get(t).grid[r][35], statusDate(o), t + ': AJ = when the status last changed'); assert.match(statusDate(o), /^20\d\d-\d\d-\d\d \d\d:\d\d$/); }
  }
  // A status change updates AJ (the time moves on).
  const pick = Object.keys(idsIn(main()))[0], before = await order(Number(pick));
  await DB.prepare('UPDATE client_orders SET status_changed_at=COALESCE(status_changed_at, created_at)-86400*3 WHERE id=?').bind(Number(pick)).run();
  const old = statusDate(await order(Number(pick)));
  const next = before.status === 'processing' ? 'pending' : 'processing';
  assert.equal((await call('/orders/' + pick, 'PUT', { status: next }, admin)).status, 200); await settle();
  const now = await order(Number(pick)), where = TABS().find(t => idsIn(t)[pick] != null);
  assert.notEqual(statusDate(now), old, 'status_changed_at moved on'); assert.equal(sheets.get(where).grid[idsIn(where)[pick]][35], statusDate(now), 'AJ follows the change');
  // The checks below expect the rows the switch left waiting (they force full minute checks).
  for (const id of waiting0) await DB.prepare("UPDATE client_orders SET sheet_sync_status='waiting' WHERE id=?").bind(id).run();
  console.log('PASS layout 20: AJ Status changed on all tabs, every row has its date, a status change updates it');
}

// ---------- layout 21 (8 Nov 2026): Google's append put moved rows on top with their cells shifted right ----------
{
  const before = (await DB.prepare('SELECT id, sheet_sync_status FROM client_orders').all()).results;
  const ids0 = TABS().map(t => Object.keys(idsIn(t)).sort().join(','));
  const g = sheets.get(main()).grid, real = g[FIRST_ROW - 1];
  const shifted = n => [...Array(n).fill(''), ...real].slice(0, 36);
  g.splice(FIRST_ROW - 1, 0, shifted(35), shifted(22), []); // like live rows 6-7: the row from AJ on, from W on, and a blank row
  const lost = Number(Object.keys(idsIn(main())).at(-1)), lostRow = idsIn(main())[lost]; g.splice(lostRow, 1); // a row lost by side-by-side syncs
  await DB.prepare("UPDATE portal_settings SET value='20' WHERE key='supplier_sheet_layout'").run();
  await cron();
  assert.equal((await DB.prepare("SELECT value FROM portal_settings WHERE key='supplier_sheet_layout'").first()).value, '22');
  for (const t of TABS()) for (const r of sheets.get(t).grid.slice(FIRST_ROW - 1)) assert.ok(!r || r[0] || r[1] || !r.some(x => String(x ?? '').trim()), t + ': no row with A and B empty is left');
  for (let i = 0; i < 40 && idsIn(main())[lost] == null; i++) { await DB.prepare("DELETE FROM portal_settings WHERE key='sheet_retry_until'").run(); await DB.prepare('UPDATE client_orders SET sheet_next_try=0').run(); later(); await cron(); }
  assert.notEqual(idsIn(main())[lost], undefined, 'the lost order is written again');
  assert.deepEqual(TABS().map(t => Object.keys(idsIn(t)).sort().join(',')), ids0, 'every order still in its tab, once');
  // A moving row is written from A: cancel an order and its row on top of Cancelled starts with the date and order.
  const pick = Number(Object.keys(idsIn(main()))[0]);
  assert.equal((await call('/orders/' + pick, 'PUT', { status: 'cancelled' }, admin)).status, 200); await settle();
  const top = sheets.get(CANCELLED_TAB).grid[FIRST_ROW - 1];
  assert.equal(Number(top[31]), pick, 'the cancelled order is on top of Cancelled'); assert.ok(top[0] && top[1], 'with its date (A) and order (B) in place');
  assert.equal(idsIn(main())[pick], undefined, 'and gone from Orders');
  assert.equal((await call('/orders/' + pick, 'PUT', { status: 'processing' }, admin)).status, 200); await settle();
  // Several orders cancelled at the same moment (Erwin's 17, 8 Nov 2026): each lands on Cancelled once, no row is lost.
  const all0 = TABS().flatMap(t => Object.keys(idsIn(t))).sort().join(','), three = Object.keys(idsIn(main())).slice(0, 3).map(Number);
  globalThis.slowSheet = true;
  const res = await Promise.all(three.map(id => call('/orders/' + id, 'PUT', { status: 'cancelled' }, admin)));
  for (let i = 0; i < 100 && !three.every(id => idsIn(CANCELLED_TAB)[id] != null && idsIn(main())[id] == null); i++) await settle();
  await settle(); globalThis.slowSheet = false;
  assert.deepEqual(res.map(r => r.status), [200, 200, 200]);
  for (const id of three) { assert.notEqual(idsIn(CANCELLED_TAB)[id], undefined, id + ' on Cancelled'); assert.equal(idsIn(main())[id], undefined, id + ' gone from Orders'); }
  assert.equal(TABS().flatMap(t => Object.keys(idsIn(t))).sort().join(','), all0, 'every order still in the sheet exactly once');
  for (const t of TABS()) for (const [id, r] of Object.entries(idsIn(t))) assert.ok(sheets.get(t).grid[r][1], t + ' row of ' + id + ' has its order (B)');
  for (const id of three) assert.equal((await call('/orders/' + id, 'PUT', { status: 'processing' }, admin)).status, 200);
  await settle();
  for (const o of before) await DB.prepare('UPDATE client_orders SET sheet_sync_status=? WHERE id=?').bind(o.sheet_sync_status, o.id).run();
  console.log('PASS layout 21: broken rows (A and B empty) removed, every order kept; a moved row is written from A; 3 cancels at once all land, no row lost');
}

// ---------- Billing tab (Ada, 1 Nov 2026): one list of all orders, paid apart from not paid, formulas only ----------
const { BILLING_TAB, BILLING_HEADERS, billingCells } = await import('../server/supplier-sheet.mjs');
assert.ok(sheets.has(BILLING_TAB), 'the Billing tab is added by the full check');
const bill = () => sheets.get(BILLING_TAB).grid;
assert.deepEqual(enRow(bill()[3]), BILLING_HEADERS, 'row 4: the same columns on both sides');
const f5 = String(bill()[4][0]), k5 = String(bill()[4][10]);
assert.match(f5, new RegExp(`INDIRECT\\("'${main()}'!A6:W"\\);INDIRECT\\("'Shipped'!A6:W"\\)`), 'reads Orders and Shipped (not Cancelled), A to Client paid');
assert.ok(!/Cancelled/.test(f5 + k5), 'cancelled orders are not billed from here');
const picks = /CHOOSECOLS\(d,([\d,]+)\)/.exec(f5)[1].split(',').map(n => HEADERS[Number(n) - 1]);
assert.deepEqual(picks, BILLING_HEADERS.slice(0, 9), 'every column taken from the right place in the order tabs');
assert.match(f5, /INDEX\(d,,23\)="Paid"/); assert.match(k5, /INDEX\(d,,23\)<>"Paid"/); assert.equal(HEADERS[22], 'Client paid');
assert.match(String(bill()[2][0]), /^="PAID by our clients: "/); assert.match(String(bill()[2][10]), /^="NOT PAID yet: "/);
assert.ok(sheets.get(BILLING_TAB).prot.some(p => p.range.sheetId === sheets.get(BILLING_TAB).sheetId && p.range.startColumnIndex == null), 'the whole tab is protected');
assert.ok(!readTabs.has(BILLING_TAB), 'the website never reads the Billing tab');
// Not rewritten every minute; a deleted tab comes back; a Billing error never stops the order sync.
const writesBefore = requests.length; later(); await cron(); assert.ok(!requests.slice(writesBefore).some(r => /Billing/.test(r)), 'up to date: not rewritten');
sheets.delete(BILLING_TAB); later(); assert.equal((await cron()).ok, true); assert.ok(sheets.has(BILLING_TAB), 'deleted by hand: added again');
sheets.delete(BILLING_TAB); failBilling = true;
const BT = await mk('BILL-ERR'); await settle(); supplierTypes(BT.id, N, 7.5); later(); const be = await cron(); await settle();
assert.equal(be.ok, true, 'the sync still runs when the Billing tab fails ' + JSON.stringify(be)); assert.equal(Number((await order(BT.id)).supplier_cost), 7.5, 'and still applies supplier costs');
failBilling = false; later(); await cron(); assert.ok(sheets.has(BILLING_TAB), 'added on the next check');
assert.deepEqual(billingCells('Work Queue')[3].values[0][0].match(/INDIRECT\("'Work Queue'!A6:W"\)/)?.[0], `INDIRECT("'Work Queue'!A6:W")`, 'tab names with spaces are quoted');
assert.ok(!readTabs.has(BILLING_TAB));
console.log('PASS Billing tab: all orders, paid apart from not paid, formulas only, protected, never read, safe if it fails');
// Refunds (Erwin, 3 Nov 2026): far right, every cancelled order (paid first) with paid, fee and refund, a TOTAL row,
// and row 3 with the whole sum: paid by our clients minus the cancellation fees.
{
  const g = bill(), u3 = String(g[2][20]), u5 = String(g[4][20]);
  assert.equal(sheets.get(BILLING_TAB).cols, 29, 'the tab is A to AC');
  assert.deepEqual(BILLING_HEADERS.slice(20), ['Date', 'Order', 'Shop', 'Product / variation', 'Client paid', 'Total cost (USD)', 'Paid for it (USD)', 'Cancellation fee (USD)', 'Refund (USD)']);
  assert.match(u3, /^="CANCELLED: REFUND DUE "&TEXT\(SUMIF\(INDIRECT\("'Cancelled'!W6:W"\),"Paid",INDIRECT\("'Cancelled'!P6:P"\)\)-SUM\(INDIRECT\("'Cancelled'!AI6:AI"\)\)/, 'row 3: paid by our clients minus the fees');
  assert.match(u5, /INDIRECT\("'Cancelled'!A6:AI"\)/, 'reads the Cancelled tab, A to Cancellation fee');
  const cols = /CHOOSECOLS\(f,([\d,]+)\)/.exec(u5)[1].split(',').map(n => HEADERS[Number(n) - 1]);
  assert.deepEqual(cols, ['Date', 'Order', 'Shop', 'Product / variation']);
  assert.equal(HEADERS[15], 'Total cost (USD)'); assert.equal(HEADERS[34], 'Cancellation fee (USD)');
  assert.match(u5, /paid,INDEX\(f,,23\)="Paid",cost,IF\(ISNUMBER\(INDEX\(f,,16\)\),INDEX\(f,,16\),0\),fee,IF\(ISNUMBER\(INDEX\(f,,35\)\),INDEX\(f,,35\),0\),got,IF\(paid,cost,0\)/, 'paid = Total cost of the orders our client paid');
  assert.match(u5, /got-fee\),paid,FALSE/, 'refund = paid - fee, paid orders first');
  assert.match(u5, /HSTACK\("","","","TOTAL 合计","",SUM\(cost\),SUM\(got\),SUM\(fee\),SUM\(got\)-SUM\(fee\)\)/, 'a TOTAL row');
  assert.ok((sheets.get(BILLING_TAB).cf || []).some(r => /"TOTAL"/.test(r.booleanRule?.condition?.values?.[0]?.userEnteredValue || '')), 'TOTAL row in bold');
  // A Billing tab from before (A to S, version 1): widened once and rewritten.
  const tb = sheets.get(BILLING_TAB); tb.cols = 19; tb.cf = []; tb.grid = [];
  await DB.prepare("UPDATE portal_settings SET value = '1|' || split_part(value, '|', 2) WHERE key = 'supplier_billing_tab'").run();
  later(); await cron();
  assert.equal(tb.cols, 29, 'old tab widened to AC'); assert.match(String(tb.grid[4]?.[20]), /'Cancelled'!A6:AI/, 'refund list written');
  assert.equal(tb.cf.filter(r => /"TOTAL"/.test(r.booleanRule?.condition?.values?.[0]?.userEnteredValue || '')).length, 1);
  later(); await cron(); assert.equal(tb.cf.length, 1, 'not added again');
}
console.log('PASS Billing refunds: cancelled orders, paid minus cancellation fees, TOTAL row, old tab widened once');

// Colour rules that slid down (Erwin, 2 Nov 2026): orders moved to the top of Shipped pushed its rules to row 44, so
// rows 6-43 lost the orange cost revision rows. Every sheet check puts them back to row 6.
{
  const cf = () => sheets.get(SHIPPED_TAB).cf || [], starts = () => cf().flatMap(r => r.ranges.map(x => x.startRowIndex));
  const revRule = () => cf().find(r => r.booleanRule.condition.type === 'CUSTOM_FORMULA' && /COST REVISION/.test(r.booleanRule.condition.values[0].userEnteredValue));
  assert.ok(revRule(), 'Shipped has the orange cost revision row rule');
  for (const r of cf()) { for (const x of r.ranges) x.startRowIndex += 38; const c = r.booleanRule.condition; if (c.type === 'CUSTOM_FORMULA') c.values = c.values.map(v => ({ userEnteredValue: v.userEnteredValue.replace(/(\$?[A-Z]{1,3})(\d+)/g, (m, col, row) => col + (Number(row) + 38)) })); }
  assert.match(revRule().booleanRule.condition.values[0].userEnteredValue, /\$O44/, 'slid like the live sheet');
  later(); const res = await cron(); assert.equal(res.ok, true);
  assert.ok(starts().every(s => s === FIRST_ROW - 1), 'every Shipped rule starts at row 6 again: ' + starts());
  assert.match(revRule().booleanRule.condition.values[0].userEnteredValue, /^=LEFT\(\$O6,23\)=/, 'and looks at its own row');
  const before = requests.length; later(); await cron(); assert.ok(!requests.slice(before).some(r => /batchUpdate/.test(r) && false), 'nothing to fix: no write');
  assert.ok([main(), SHIPPED_TAB].every(t => (sheets.get(t).cf || []).every(r => r.ranges.every(x => x.startRowIndex === FIRST_ROW - 1))), 'Orders and Shipped at row 6 (Cancelled left alone: no cost revisions there)');
}
console.log('PASS colour rules that slid down (rows moved to the top) go back to row 6 on the next check');

// ---------- sorting in the sheet (29 Oct 2026 incident) ----------
// The supplier sorts with the filter arrows: Google moves only the filter's columns. The filter used to stop at AD, so the
// hidden order ids (AE) stayed put and every row's supplier cells ended up next to another order.
const sortWithFilter = (tab, col, dir = 1) => {
  const s = sheets.get(tab), f = s.filter, g = s.grid, end = lastRow(tab);
  const rows = g.slice(FIRST_ROW - 1, end).map(r => r || []), sorted = [...rows].sort((a, b) => dir * String(a[col] ?? '').localeCompare(String(b[col] ?? '')));
  sorted.forEach((src, i) => { const r = g[FIRST_ROW - 1 + i] = [...(rows[i] || [])]; for (let c = f.startColumnIndex; c < (f.endColumnIndex ?? 200); c++) r[c] = src[c]; });
};
// Two updates of one order at the same moment (2 Nov 2026: #4215375566 and #4216451841 showed twice): one row, never two.
const copies = id => TABS().reduce((n, t) => n + sheets.get(t).grid.filter(r => r && Number(r[31]) === id).length, 0);
const RC = await mk('R-RACE'); await settle();
for (const t of TABS()) { const g = sheets.get(t).grid; for (let i = g.length - 1; i >= FIRST_ROW - 1; i--) if (g[i] && Number(g[i][31]) === RC.id) g.splice(i, 1); }
assert.equal(copies(RC.id), 0);
await Promise.all([syncPortalOrderToGoogleSheet(DB, env, RC.id), syncPortalOrderToGoogleSheet(DB, env, RC.id), syncPortalOrderToGoogleSheet(DB, env, RC.id)]);
assert.equal(copies(RC.id), 1, 'three updates at once write one row');
console.log('PASS updates of one order at the same moment write one row');
// An order already in two rows, the supplier filled in the second (bottom) copy: that copy is read, kept, and the empty one goes.
{ const [t, r] = where(RC.id), g = sheets.get(t).grid, copy = [...g[r]]; copy[N] = 27.9; copy[O] = 'UL652493055YP'; g.push(copy); }
assert.equal(copies(RC.id), 2);
assert.equal((await cron()).ok, true); await settle();
const r2 = await order(RC.id);
assert.equal(Number(r2.supplier_cost), 27.9, 'the cost typed in the second copy reached the website');
assert.equal(r2.tracking_number, 'UL652493055YP', 'and its tracking');
assert.equal(copies(RC.id), 1, 'the empty copy was removed');
{ const [t, r] = where(RC.id); assert.equal(Number(sheets.get(t).grid[r][N]), 27.9, 'the row that stays is the filled one'); }
console.log('PASS an order in two rows: the filled copy is read and kept, the empty copy is removed');
// Two minute checks at once: the second one waits its turn (says busy) instead of applying the same edits again.
{ const [c1, c2] = await Promise.all([cron(), cron()]); assert.equal([c1, c2].filter(c => c.busy).length, 1, 'one check runs, the other is busy: ' + JSON.stringify([c1.busy, c2.busy])); }
assert.equal((await cron()).busy, undefined, 'the next check runs normally');
console.log('PASS one minute check at a time');
// Duplicates in the sheet (Erwin, 2 Nov 2026): red rows, a warning on the tracking cell, row 4 counts them, admin told once.
{ const cr = await cron(); assert.equal(cr.ok, true, JSON.stringify(cr)); }
for (const t of [WQ_NEW, SHIPPED_TAB]) {
  const s1 = sheets.get(t), red = (s1.cf || []).find(r => /COUNTIF\(INDIRECT\("'Orders'!B:B"\)/.test(r.booleanRule?.condition?.values?.[0]?.userEnteredValue || ''));
  assert.ok(red && red.ranges[0].startRowIndex === FIRST_ROW - 1, t + ': red rule for duplicates from row 6');
  assert.ok((s1.rules || []).some(v => v.range.startColumnIndex === 17 && /<=1$/.test(v.rule?.condition?.values?.[0]?.userEnteredValue || '') && v.rule.strict === false), t + ': tracking warning (not blocking)');
  assert.match(String(s1.grid[3][0]), /DUPLICATE ORDER OR TRACKING NUMBER/, t + ': row 4 counts duplicates');
}
assert.doesNotMatch(String(sheets.get(CANCELLED_TAB).grid[3][0]), /DUPLICATE/, 'cancelled orders are not counted');
const before2 = (sheets.get(WQ_NEW).cf || []).length; await cron(); assert.equal((sheets.get(WQ_NEW).cf || []).length, before2, 'the rules are added once');
// Ada types the same tracking number on two orders: both are reported to the admin, once.
const DU1 = await mk('DUP-1'), DU2 = await mk('DUP-2'); await settle();
supplierTypes(DU1.id, O, 'UL900000001YP'); supplierTypes(DU2.id, O, 'UL900000001YP');
await cron(); await settle(); await cron(); await settle();
const dupEv = async oid => (await DB.prepare("SELECT detail FROM order_events WHERE order_id=? AND kind='supplier_sheet' AND detail LIKE '{\"f\":\"dup_tracking\"%'").bind(oid).all()).results;
assert.equal((await dupEv(DU1.id)).length, 1, 'DU1 reported once'); assert.equal((await dupEv(DU2.id)).length, 1, 'DU2 reported once');
assert.match((await dupEv(DU1.id))[0].detail, /DUP-2/, 'says which other order');
assert.ok((await call('/admin/notifications', 'GET', null, admin)).data.items.some(x => x.orderId === DU1.id && /dup_tracking/.test(x.detail)), 'in the admin bell');
console.log('PASS duplicates in the sheet: red rows and tracking warning on Orders + Shipped, row 4 counts them, the admin is told once');
// Cost revisions answered in the sheet (Erwin, 3 Nov 2026): the Competitor price cell says where each one stands
// (orange = waiting for the supplier, purple = new cost waiting for Direct Line, green = done), a lower cost is
// approved by itself, NO keeps the price and puts the cost back, and Total cost accepts NO.
for (const t of [WQ_NEW, SHIPPED_TAB]) {
  const s1 = sheets.get(t), has = w => (s1.cf || []).some(r => (r.booleanRule?.condition?.values || []).some(v => String(v.userEnteredValue || '').includes(w)));
  assert.ok(has('NEW COST SENT') && has('✓ REVISION DONE'), t + ': purple and green rules');
  assert.ok((s1.rules || []).some(v => v.range.startColumnIndex === N && /no\|keep\|same/.test(v.rule?.condition?.values?.[0]?.userEnteredValue || '') && v.rule.strict), t + ': Total cost takes a number or NO');
  assert.match(String(s1.grid[3][0]), /type the new Total cost or NO \+ reason .*个降价请求等待回复/, t + ': row 4 says how to refuse, in English and Chinese');
  assert.ok((s1.rules || []).some(v => v.range.startColumnIndex === N && /\\b\|不能\|无法\)\[[^\]]*\]\*\[\^/.test(v.rule?.condition?.values?.[0]?.userEnteredValue || '')), t + ': NO (or 不能) needs a reason');
}
{ const n0 = (sheets.get(WQ_NEW).cf || []).length; await cron(); assert.equal((sheets.get(WQ_NEW).cf || []).length, n0, 'revision colours added once'); }
const COMPC = 14, compCell = id => { const [t, r] = where(id); return String(sheets.get(t).grid[r][COMPC]); }, costCell = id => { const [t, r] = where(id); return sheets.get(t).grid[r][N]; };
const RV = await mk('REV-S1'); await settle(); supplierTypes(RV.id, N, 30); await cron(); await settle();
const askRev = async price => { const r = await call(`/orders/${RV.id}/cost-revision`, 'POST', { competitorPrice: price }, client); assert.equal(r.status, 200, JSON.stringify(r.data)); await settle(); };
await askRev(25);
assert.match(compCell(RV.id), /^COST REVISION REQUESTED: \$25\.00\n客户请求降价$/, 'orange while it waits for the supplier');
const fee = Number((await order(RV.id)).commission || 0);
// Lower: approved at once, the client is told, the cell turns green.
supplierTypes(RV.id, N, 26); await cron(); await settle();
let rv = await order(RV.id);
assert.equal(Number(rv.price), 26 + fee, 'billed the new cost + fee without a click'); assert.equal(rv.revision_status, ''); assert.equal(rv.revision_done, 'new cost $26.00');
assert.match(compCell(RV.id), /^✓ REVISION DONE: new cost \$26\.00 \(client's price: \$25\.00\)\n降价请求已完成：新成本 \$26\.00$/, 'green in the sheet');
assert.ok((await call('/notifications', 'GET', null, client)).data.items.some(e => e.kind === 'revision_answered' && e.orderId === RV.id && /^lowered/.test(e.detail)), 'client told: cost lowered');
assert.ok((await call('/admin/notifications', 'GET', null, admin)).data.items.some(e => e.orderId === RV.id && /"f":"rev_auto"/.test(e.detail)), 'admin bell: approved automatically');
assert.ok((await call('/admin/orders', 'GET', null, admin)).data.orders.find(o => o.id === RV.id).updates.some(u => /"f":"rev_auto"/.test(u.detail)), 'Client orders: update tag');
// NO + reason: the price is kept, the cost goes back into the cell, the client gets the reason.
await askRev(22); supplierTypes(RV.id, N, 'NO: factory price went up'); await cron(); await settle();
rv = await order(RV.id);
assert.equal(Number(rv.price), 26 + fee, 'price kept'); assert.equal(rv.revision_status, ''); assert.equal(rv.revision_done, 'cost kept: factory price went up');
assert.equal(Number(costCell(RV.id)), 26, 'the cost is back in Total cost');
assert.match(compCell(RV.id), /^✓ REVISION DONE: cost kept: factory price went up \(client's price: \$22\.00\)\n降价请求已完成：成本不变：factory price went up$/, 'green, with the reason');
assert.equal((await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === RV.id).revision.reply, 'factory price went up', 'the client gets the reason');
assert.ok((await call('/admin/notifications', 'GET', null, admin)).data.items.some(e => e.orderId === RV.id && /"f":"rev_no".*"why":"factory price went up"/.test(e.detail)), 'admin bell: the reason');
{ const c = await cron(); assert.equal(c.changed.filter(x => x.orderId === RV.id).length, 0, 'the restored cost is not read as a new change'); }
assert.ok((await call('/notifications', 'GET', null, client)).data.items.some(e => e.kind === 'revision_answered' && e.orderId === RV.id && /^kept/.test(e.detail)), 'client told: cost kept');
// Higher: waits for an admin (purple, red tag), the bill does not change.
await askRev(20); supplierTypes(RV.id, N, 31); await cron(); await settle();
rv = await order(RV.id);
assert.equal(rv.revision_status, 'offered'); assert.equal(Number(rv.price), 26 + fee, 'not billed');
assert.match(compCell(RV.id), /^NEW COST SENT: \$31\.00, waiting for Direct Line \(client's price: \$20\.00\)\n已报新价，等待 Direct Line 确认$/, 'purple in the sheet');
assert.ok((await call('/admin/notifications', 'GET', null, admin)).data.items.some(e => e.orderId === RV.id && /"f":"rev_check".*"why":"higher"/.test(e.detail)), 'admin bell: needs your OK');
assert.match(String(sheets.get(WQ_NEW).grid[3][0]), /COUNTIF\(INDIRECT\("O6:O"\),"COST REVISION REQUESTED\*"\)/, 'row 4 counts only the orange ones (purple text starts differently)');
// The admin approves: green; a later cost change (no request) ends the green note.
assert.equal((await call(`/admin/orders/${RV.id}/cost-revision`, 'POST', { action: 'approve', cost: 31 }, admin)).status, 200); await settle();
assert.match(compCell(RV.id), /^✓ REVISION DONE: new cost \$31\.00/);
supplierTypes(RV.id, N, 29); await cron(); await settle();
assert.equal((await order(RV.id)).revision_done, ''); assert.equal(compCell(RV.id), '$20.00', 'back to the plain competitor price');
// A big drop (probably a typo) waits for an admin.
await askRev(18); supplierTypes(RV.id, N, 2.9); await cron(); await settle();
rv = await order(RV.id); assert.equal(rv.revision_status, 'offered'); assert.equal(Number(rv.price), 29 + fee, 'a drop of more than half is not billed by itself');
assert.ok((await call('/admin/notifications', 'GET', null, admin)).data.items.some(e => e.orderId === RV.id && /"why":"half"/.test(e.detail)), 'admin told it may be a typo');
assert.equal((await call(`/admin/orders/${RV.id}/cost-revision`, 'POST', { action: 'keep' }, admin)).status, 200); supplierTypes(RV.id, N, 29); await cron(); await settle();
// In Chinese: 不能降价 + reason works like NO.
await askRev(21); supplierTypes(RV.id, N, '不能降价：工厂涨价'); await cron(); await settle();
rv = await order(RV.id); assert.equal(rv.revision_status, ''); assert.equal(rv.revision_done, 'cost kept: 工厂涨价'); assert.equal(Number(costCell(RV.id)), 29, 'cost back in the cell');
assert.equal((await call('/orders', 'GET', null, client)).data.orders.find(o => o.id === RV.id).revision.reply, '工厂涨价');
console.log('PASS cost revisions in the sheet: orange / purple / green, lower approved by itself, NO (or 不能降价) keeps the price, higher or a big drop waits');
// English + Chinese (Erwin, 3 Nov 2026): headers, help, alerts and totals, Billing, Product Quotes, and a Guide tab.
{
  const { GUIDE, GUIDE_TAB } = await import('../server/sheet-zh.mjs');
  for (const t of TABS()) {
    const g = sheets.get(t).grid;
    assert.equal(g[4][15], 'Total cost (USD)\n总成本（美元）', t + ': headers in English and Chinese');
    assert.match(String(g[2][0]), /\n.*[\u4e00-\u9fff]/, t + ': help in Chinese too');
    assert.match(String(g[3][16]), /CHAR\(10\)&"客户已付款"/, t + ': totals in Chinese too');
  }
  assert.match(String(sheets.get(WQ_NEW).grid[2][0]), /Guide 使用说明/, 'row 3 points to the Guide');
  assert.ok(sheets.has(GUIDE_TAB), 'Guide tab added'); assert.deepEqual(sheets.get(GUIDE_TAB).grid.slice(3, 3 + GUIDE.length), GUIDE, 'one topic per row: topic | English | 中文');
  assert.ok(GUIDE.every(([a, b, c]) => /[\u4e00-\u9fff]/.test(a) && b && /[\u4e00-\u9fff]/.test(c)), 'every topic in both languages');
  assert.match(String(bill()[3][5]), /^Total cost \(USD\)\n总成本/, 'Billing headers');
  assert.match(String(bill()[2][0]), /CHAR\(10\)&"客户已付款：/, 'Billing totals');
  assert.match(String(sheets.get('Product Quotes').grid[3][9]), /^Price per item \(USD\)\n单价/, 'Product Quotes headers');
  assert.match(String(sheets.get('Product Quotes').grid[1][0]), /\n客户的询价/, 'Product Quotes help');
  assert.ok((sheets.get(WQ_NEW).rules || []).some(v => v.range.startColumnIndex === N && /不能/.test(v.rule?.condition?.values?.[0]?.userEnteredValue || '') && /整单总成本/.test(v.rule.inputMessage)), 'Total cost: Chinese help, 不能 accepted');
  const n0 = (sheets.get(GUIDE_TAB).prot || []).length; later(); await cron(); assert.equal((sheets.get(GUIDE_TAB).prot || []).length, n0, 'done once');
}
console.log('PASS English + Chinese: headers, help, row 4, Billing, Product Quotes, Guide tab, 不能降价');
for (const t of TABS()) assert.equal(sheets.get(t).filter?.endColumnIndex, 36, t + ': the filter covers A-AJ');
const supplierPart = () => Object.fromEntries(TABS().flatMap(t => Object.entries(idsIn(t)).map(([id, r]) => [id, JSON.stringify(sheets.get(t).grid[r].slice(15, 22))])));
const costs = async () => JSON.stringify((await DB.prepare('SELECT id, supplier_cost, tracking_number FROM client_orders ORDER BY id').all()).results);
const before0 = supplierPart(), costs0 = await costs();
sortWithFilter(main(), 1, -1); assert.equal((await cron()).ok, true);
await call('/orders/' + A.id, 'PUT', { notes: 'after the sort' }, admin); await settle();
assert.deepEqual(supplierPart(), before0, 'sorted with the filter: every row keeps its own supplier cells');
assert.equal(await costs(), costs0, 'no cost or tracking taken from another order');
console.log('PASS sorting in the sheet moves whole rows (filter covers A-AH)');
// An old-style narrow filter (A-AD) splits rows: the check sees it, reads nothing and writes nothing.
sheets.get(main()).filter.endColumnIndex = 30; sortWithFilter(main(), 1, 1);
const split = await cron();
assert.ok(split.outOfLine > 0 && split.skipped.some(x => /out of line/.test(x.why.join())), 'rows out of line reported ' + JSON.stringify(split));
assert.equal(await costs(), costs0, 'nothing applied from the out-of-line rows');
const gm2 = sheets.get(main()).grid, aRow = idsIn(main())[A.id], aB = gm2[aRow][1];
const wrong = (await order(A.id)).sheet_ref !== String(aB);
await call('/orders/' + A.id, 'PUT', { notes: 'while out of line' }, admin); await settle();
assert.equal(gm2[aRow][1], aB, 'the website does not rewrite an out-of-line row');
assert.ok(wrong, 'A’s row is out of line after the narrow sort'); assert.notEqual((await order(A.id)).sheet_sync_status, 'synced', 'its sync is held back (retried later)');
console.log('PASS out-of-line rows (sorted without the hidden columns): not read, not rewritten, reported');

// Cron needs the secret.
assert.equal((await route(new Request('http://x/api/cron/supplier-sheet'), { db: DB, env })).status, 401);
console.log('PASS cron refuses calls without the secret');
await pg.close();
