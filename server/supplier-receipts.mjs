// Supplier receipts (Erwin, 16 Nov 2026): "supplier make the invoice -> submit to us admins -> admins approved -> will be
// sent to client concerned". The portal makes the receipt, one per client payment.
//
// What clients pay includes our fee, so the supplier never sees the client's version (docs/supplier-portal.md, decision 5):
//   1. Supplier (or an admin in the supplier portal): picks a payment it received, sees only its own part and the orders,
//      adds an optional note, submits.
//   2. Admin: sees the client's version (the PDF preview with the client's amounts), approves it or sends it back with a reason.
//   3. On approval the PDF is saved as the client's receipt for that payment (portal_files kind 'invoice', the same place an
//      admin upload goes), so it shows in the client's Payments, order page, monthly download and bell.
// The client's billing details (name, address, email / phone) are only used in the PDF; they never reach the supplier.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getBilling } from './billing.mjs';
import { paidOrders, paymentOrderIds } from './payment-orders.mjs';

export const RECEIPT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS supplier_receipts (
     id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id), payment_id INTEGER NOT NULL REFERENCES client_payments(id),
     status TEXT NOT NULL DEFAULT 'submitted', note TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
     submitted_by TEXT NOT NULL DEFAULT '', submitted_at INTEGER NOT NULL, decided_by TEXT NOT NULL DEFAULT '', decided_at INTEGER,
     file_id INTEGER REFERENCES portal_files(id), archived BOOLEAN NOT NULL DEFAULT FALSE)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS supplier_receipts_payment ON supplier_receipts (payment_id) WHERE NOT archived',
];

const r2 = v => Math.round(Number(v || 0) * 100) / 100;
const now = () => Math.floor(Date.now() / 1000);
const norm = v => (v == null ? '' : String(v).trim());
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export const receiptNumber = r => 'R-' + new Date(Number(r.submitted_at) * 1000).getUTCFullYear() + '-' + String(r.id).padStart(4, '0');
const day = t => new Date(Number(t) * 1000).toISOString().slice(0, 10);
const setting = async (DB, key) => (await DB.prepare('SELECT value FROM portal_settings WHERE key = ?').bind(key).first())?.value ?? null;
export const ISSUER = 'receipt_issuer', ISSUER_DETAILS = 'receipt_issuer_details';

// ---------- the client's version of one payment (admins and the PDF only) ----------
async function clientPayment(DB, paymentId) {
  const p = await DB.prepare('SELECT p.*, u.display_name, u.username FROM client_payments p JOIN users u ON u.id = p.client_id WHERE p.id = ? AND NOT p.archived').bind(paymentId).first();
  if (!p) return null;
  const links = (await paymentOrderIds(DB, Number(p.client_id))).get(Number(p.id)) || [], first = await paidOrders(DB, Number(p.client_id));
  const ids = links.filter(id => first.get(id)?.paymentId === Number(p.id)); // an order counts on its first payment only (as in Billing)
  const rows = ids.length ? ((await DB.prepare(`SELECT id, order_ref, item_title, variant, quantity, status, price FROM client_orders WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at, id`).bind(...ids).all()).results || []) : [];
  const lines = rows.map(o => ({ id: Number(o.id), ref: norm(o.order_ref) || '#' + o.id, item: [norm(o.item_title), norm(o.variant)].filter(Boolean).join(' · '), qty: Number(o.quantity || 1),
    cancelled: o.status === 'cancelled', amount: r2(first.get(Number(o.id))?.paidPrice ?? o.price) }));
  const ordersTotal = r2(lines.reduce((n, l) => n + l.amount, 0)), amount = r2(p.amount);
  return { id: Number(p.id), clientId: Number(p.client_id), client: p.display_name || p.username, paidAt: Number(p.paid_at), method: norm(p.method), amount, lines, ordersTotal, other: r2(amount - ordersTotal) };
}

// ---------- PDF ----------
let FONTS = null;
// Written out in full so Vercel's bundler ships the files (vercel.json also includes server/fonts).
const FONT_URLS = [new URL('./fonts/NotoSans-Regular.ttf', import.meta.url), new URL('./fonts/NotoSans-Bold.ttf', import.meta.url), new URL('./fonts/NotoSansHebrew-Regular.ttf', import.meta.url), new URL('./fonts/NotoSansHebrew-Bold.ttf', import.meta.url)];
async function fonts() {
  if (!FONTS) FONTS = Promise.all(FONT_URLS.map(u => readFile(u)));
  return FONTS;
}
const HEB = /[֐-׿]/;
// Splits text into pieces in the order they are drawn from left to right. The PDF font engine already draws the letters of
// one Hebrew word right to left, so a piece keeps its letters as typed; only the order of the pieces is changed: the words
// of a Hebrew stretch go right to left, and a line whose first letter is Hebrew is right to left as a whole.
export function visualRuns(text) {
  const s = String(text), runs = [];
  for (const ch of s) {
    const heb = HEB.test(ch), weak = /[\s\d.,:;()'"\-–·/#@&+]/.test(ch), last = runs[runs.length - 1];
    if (last && (weak || last.heb === heb)) last.text += ch; else runs.push({ heb: weak ? false : heb, text: ch });
  }
  const first = /[A-Za-z֐-׿]/.exec(s), rtl = !!first && HEB.test(first[0]);
  const ordered = rtl ? runs.reverse() : runs;
  return ordered.flatMap(r => {
    const parts = r.text.match(/[֐-׿]+|[^֐-׿]+/g) || [];
    return (r.heb ? parts.reverse() : parts).map(t => ({ heb: HEB.test(t), text: t }));
  });
}
export async function receiptPdf(DB, receipt, { preview = false } = {}) {
  const { PDFDocument, rgb } = await import('pdf-lib'), fontkit = (await import('@pdf-lib/fontkit')).default;
  const pay = await clientPayment(DB, Number(receipt.payment_id));
  if (!pay) throw new Error('This payment no longer exists.');
  const bill = await getBilling(DB, pay.clientId);
  const issuer = norm(await setting(DB, ISSUER)) || 'Direct Line', issuerDetails = norm(await setting(DB, ISSUER_DETAILS));
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const [lat, latB, heb, hebB] = await Promise.all((await fonts()).map(b => doc.embedFont(b, { subset: true })));
  doc.setTitle('Receipt ' + receiptNumber(receipt)); doc.setProducer('Direct Line'); doc.setCreator('Direct Line');
  const W = 595.28, H = 841.89, M = 48; let page = doc.addPage([W, H]), y = H - M;
  const ink = rgb(0.11, 0.12, 0.14), muted = rgb(0.42, 0.42, 0.45), gold = rgb(0.72, 0.54, 0.24), line = rgb(0.86, 0.83, 0.78);
  // Each piece is drawn with the font that has its letters: Hebrew letters with the Hebrew font, everything else (also the
  // quote in סה"כ, digits and punctuation inside a Hebrew run) with the Latin one.
  const pieces = (t, bold) => visualRuns(t).map(p => ({ text: p.text, f: p.heb ? (bold ? hebB : heb) : (bold ? latB : lat) }));
  const width = (t, size, bold) => pieces(t, bold).reduce((n, p) => n + p.f.widthOfTextAtSize(p.text, size), 0);
  const draw = (t, x, yy, { size = 10, bold = false, color = ink, right = false } = {}) => {
    let cx = right ? x - width(t, size, bold) : x;
    for (const p of pieces(t, bold)) { page.drawText(p.text, { x: cx, y: yy, size, font: p.f, color }); cx += p.f.widthOfTextAtSize(p.text, size); }
  };
  const wrap = (t, max, size, bold) => { const out = []; for (const para of String(t).split('\n')) { let cur = ''; for (const w of para.split(/\s+/)) { const next = cur ? cur + ' ' + w : w; if (cur && width(next, size, bold) > max) { out.push(cur); cur = w; } else cur = next; } out.push(cur); } return out; };
  const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Header
  draw(issuer, M, y, { size: 16, bold: true }); draw('RECEIPT · קבלה', W - M, y, { size: 16, bold: true, color: gold, right: true }); y -= 16;
  for (const l of wrap(issuerDetails, 260, 9)) { draw(l, M, y, { size: 9, color: muted }); y -= 12; }
  let ry = H - M - 18;
  for (const [k, v] of [['Receipt no. · מספר', receiptNumber(receipt)], ['Date · תאריך', day(receipt.decided_at || now())], ['Payment date · תאריך תשלום', day(pay.paidAt)]]) { draw(k, W - M - 120, ry, { size: 8.5, color: muted, right: true }); draw(v, W - M, ry, { size: 9.5, bold: true, right: true }); ry -= 14; }
  y = Math.min(y, ry) - 18; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: line }); y -= 22;
  // Billed to
  draw('Billed to · לכבוד', M, y, { size: 8.5, color: muted }); y -= 15;
  const to = bill ? [bill.name, bill.company, bill.address, bill.email, bill.phone].map(norm).filter(Boolean) : [pay.client];
  to.forEach((t, i) => { for (const l of wrap(t, W - 2 * M, 10.5, i === 0)) { draw(l, M, y, { size: 10.5, bold: i === 0 }); y -= 14; } }); y -= 14;
  // Orders
  const cols = [M, M + 92, W - M - 110, W - M];
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.96, 0.94, 0.9) });
  draw('Order · הזמנה', cols[0] + 6, y, { size: 8.5, bold: true }); draw('Product · מוצר', cols[1], y, { size: 8.5, bold: true }); draw('Qty', cols[2], y, { size: 8.5, bold: true, right: true }); draw('Amount (USD)', cols[3] - 6, y, { size: 8.5, bold: true, right: true });
  y -= 22;
  for (const l of pay.lines) {
    const desc = wrap(l.item + (l.cancelled ? ' (cancelled · בוטל)' : ''), cols[2] - cols[1] - 40, 9.5);
    if (y - desc.length * 12 < M + 120) { page = doc.addPage([W, H]); y = H - M; }
    draw(l.ref, cols[0] + 6, y, { size: 9.5 }); desc.forEach((d, i) => draw(d, cols[1], y - i * 12, { size: 9.5 }));
    draw(String(l.qty), cols[2], y, { size: 9.5, right: true }); draw(money(l.amount), cols[3] - 6, y, { size: 9.5, right: true });
    y -= (Math.max(1, desc.length) - 1) * 12; page.drawLine({ start: { x: M, y: y - 7 }, end: { x: W - M, y: y - 7 }, thickness: 0.4, color: line }); y -= 22;
  }
  if (!pay.lines.length) { draw('Payment towards the account balance · תשלום על חשבון היתרה', cols[0] + 6, y, { size: 9.5, color: muted }); y -= 20; }
  // Totals: they add up to what the client paid.
  y -= 6;
  const tot = (k, v, bold = false) => { draw(k, cols[3] - 120, y, { size: bold ? 11 : 9.5, bold, right: true }); draw(v, cols[3] - 6, y, { size: bold ? 11 : 9.5, bold, right: true }); y -= bold ? 18 : 14; };
  if (pay.lines.length) tot('Orders · הזמנות', money(pay.ordersTotal));
  if (pay.lines.length && Math.abs(pay.other) >= 0.005) tot(pay.other > 0 ? 'Towards the balance · על חשבון היתרה' : 'Covered by credit · כוסה מזיכוי', money(pay.other));
  tot('Total paid · סה"כ שולם', money(pay.amount), true);
  if (pay.method) { draw('Paid by · אמצעי תשלום: ' + pay.method, cols[3] - 6, y, { size: 9, color: muted, right: true }); y -= 14; }
  if (norm(receipt.note)) { y -= 10; draw('Note · הערה', M, y, { size: 8.5, color: muted }); y -= 13; for (const l of wrap(receipt.note, W - 2 * M, 9.5)) { draw(l, M, y, { size: 9.5 }); y -= 12; } }
  draw('Thank you · תודה', M, M, { size: 9, color: muted });
  if (preview) draw('PREVIEW · NOT SENT YET', W - M, M, { size: 9, bold: true, color: rgb(0.75, 0.2, 0.2), right: true });
  return { bytes: Buffer.from(await doc.save()), pay };
}

// ---------- supplier side ----------
const STATUS = r => (r ? r.status : 'none');
async function receiptsByPayment(DB) {
  const rows = (await DB.prepare('SELECT * FROM supplier_receipts WHERE NOT archived').all()).results || [];
  return new Map(rows.map(r => [Number(r.payment_id), r]));
}
// Payments that already have a receipt an admin uploaded by hand: nothing to make for them.
async function uploadedFor(DB) {
  const rows = (await DB.prepare("SELECT DISTINCT payment_id FROM portal_files WHERE kind = 'invoice' AND NOT archived AND payment_id IS NOT NULL AND id NOT IN (SELECT file_id FROM supplier_receipts WHERE file_id IS NOT NULL)").all()).results || [];
  return new Set(rows.map(r => Number(r.payment_id)));
}
// deps: { clientsFor, clientBilling, clientSummary, getSettings } from supplier-portal.mjs / portal.mjs (no import loop).
export async function supplierReceipts(DB, deps) {
  const settings = await deps.getSettings(DB), recs = await receiptsByPayment(DB), uploaded = await uploadedFor(DB), out = [];
  let earlier = 0;
  for (const u of await deps.clientsFor(DB)) {
    const c = await deps.clientBilling(DB, u, await deps.clientSummary(DB, u.id, settings), { detail: true });
    for (const p of c.payments || []) {
      const r = recs.get(p.id);
      if (!r && uploaded.has(p.id)) { earlier++; continue; }
      out.push({ paymentId: p.id, clientId: c.id, client: c.name, paidAt: p.paidAt, yourPart: p.yourPart, orders: p.orders,
        status: STATUS(r), number: r ? receiptNumber(r) : '', note: r?.note || '', reason: r?.status === 'rejected' ? r.reason : '', submittedBy: r?.submitted_by || '', submittedAt: r ? Number(r.submitted_at) : null, decidedAt: r?.decided_at ? Number(r.decided_at) : null });
    }
  }
  out.sort((a, b) => b.paidAt - a.paidAt || b.paymentId - a.paymentId);
  // earlier: payments Direct Line already sent its own receipt for (uploaded before receipts were made here).
  return { toMake: out.filter(x => x.status === 'none' || x.status === 'rejected'), waiting: out.filter(x => x.status === 'submitted'), sent: out.filter(x => x.status === 'approved'), earlier };
}
export async function submitReceipt(DB, me, body) {
  const paymentId = Number(body?.paymentId), note = norm(body?.note).slice(0, 500);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return { error: 'Choose a payment.', status: 400 };
  const p = await DB.prepare("SELECT p.id, p.client_id FROM client_payments p JOIN users u ON u.id = p.client_id AND u.role = 'client' AND NOT u.archived WHERE p.id = ? AND NOT p.archived").bind(paymentId).first();
  if (!p) return { error: 'This payment no longer exists.', status: 404 };
  if ((await uploadedFor(DB)).has(paymentId)) return { error: 'Direct Line already sent a receipt for this payment.', status: 409 };
  const by = norm(me.display_name || me.username).slice(0, 60), t = now();
  const had = await DB.prepare('SELECT id, status FROM supplier_receipts WHERE payment_id = ? AND NOT archived').bind(paymentId).first();
  if (had && had.status !== 'rejected') return { error: had.status === 'approved' ? 'This receipt was already sent to the client.' : 'This receipt is already waiting for Direct Line.', status: 409 };
  if (had) await DB.prepare("UPDATE supplier_receipts SET status='submitted', note=?, reason='', submitted_by=?, submitted_at=?, decided_by='', decided_at=NULL WHERE id=?").bind(note, by, t, had.id).run();
  else await DB.prepare('INSERT INTO supplier_receipts (client_id, payment_id, note, submitted_by, submitted_at) VALUES (?,?,?,?,?)').bind(Number(p.client_id), paymentId, note, by, t).run();
  return { ok: true };
}
export async function receiptCount(DB) {
  return Number((await DB.prepare("SELECT COUNT(*) AS n FROM supplier_receipts WHERE status = 'rejected' AND NOT archived").first())?.n || 0);
}
// Supplier routes (also used by an admin inside the supplier portal).
export async function routeReceipts(request, path, ctx, me, deps) {
  const { DB } = ctx, method = request.method;
  if (path === '/supplier/receipts' && method === 'GET') return json({ ok: true, ...(await supplierReceipts(DB, deps)) });
  if (path === '/supplier/receipts' && method === 'POST') {
    const r = await submitReceipt(DB, me, await request.json().catch(() => ({})));
    return r.ok ? json({ ok: true, ...(await supplierReceipts(DB, deps)) }) : json({ ok: false, error: r.error }, r.status);
  }
  return null;
}

// ---------- admin side ----------
export async function adminReceipts(DB) {
  const rows = (await DB.prepare("SELECT * FROM supplier_receipts WHERE NOT archived AND (status = 'submitted' OR decided_at > ?) ORDER BY submitted_at DESC, id DESC LIMIT 100").bind(now() - 30 * 86400).all()).results || [];
  const out = [];
  for (const r of rows) {
    const pay = await clientPayment(DB, Number(r.payment_id)), bill = pay && await getBilling(DB, pay.clientId);
    if (!pay) continue;
    out.push({ id: Number(r.id), number: receiptNumber(r), status: r.status, clientId: pay.clientId, client: pay.client, paymentId: pay.id, paidAt: pay.paidAt, amount: pay.amount,
      orders: pay.lines.length, note: r.note, reason: r.reason, submittedBy: r.submitted_by, submittedAt: Number(r.submitted_at), decidedBy: r.decided_by, decidedAt: r.decided_at ? Number(r.decided_at) : null,
      fileId: r.file_id == null ? null : Number(r.file_id), billingReady: !!bill });
  }
  return out;
}
export async function routeReceiptsAdmin(request, path, ctx, who) {
  const { DB } = ctx, method = request.method, adminName = who.adminName || 'Direct Line';
  if (path === '/admin/receipts' && method === 'GET') return json({ ok: true, receipts: await adminReceipts(DB) });
  const m = /^\/admin\/receipts\/(\d+)(?:\/(preview\.pdf|approve|reject))?$/.exec(path);
  if (!m) return null;
  const r = await DB.prepare('SELECT * FROM supplier_receipts WHERE id = ? AND NOT archived').bind(Number(m[1])).first();
  if (!r) return json({ ok: false, error: 'Not found' }, 404);
  if (m[2] === 'preview.pdf' && method === 'GET') {
    try {
      const { bytes } = await receiptPdf(DB, r, { preview: r.status !== 'approved' });
      return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-disposition': `inline; filename="${receiptNumber(r)}.pdf"` } });
    } catch (e) { return json({ ok: false, error: e.message }, 400); }
  }
  if (m[2] === 'reject' && method === 'POST') {
    const reason = norm((await request.json().catch(() => ({}))).reason).slice(0, 500);
    if (!reason) return json({ ok: false, error: 'Write why, so the supplier knows what to fix.' }, 400);
    if (r.status !== 'submitted') return json({ ok: false, error: 'Only a receipt waiting for approval can be sent back.' }, 409);
    await DB.prepare("UPDATE supplier_receipts SET status='rejected', reason=?, decided_by=?, decided_at=? WHERE id=?").bind(reason, adminName.slice(0, 60), now(), r.id).run();
    return json({ ok: true, receipts: await adminReceipts(DB) });
  }
  if (m[2] === 'approve' && method === 'POST') {
    if (r.status !== 'submitted') return json({ ok: false, error: 'This receipt is not waiting for approval.' }, 409);
    const t = now(), row = { ...r, decided_at: t };
    if (!await getBilling(DB, Number(r.client_id))) return json({ ok: false, error: 'The client has no billing details for receipts yet. Ask them to fill them in on their Payments page (or log in as the client and add them).' }, 409);
    let pdf; try { pdf = await receiptPdf(DB, row); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    const name = receiptNumber(r) + '.pdf', fp = createHash('sha256').update('supplier-receipt|' + r.id).digest('hex');
    const file = await DB.prepare(`INSERT INTO portal_files (client_id, kind, filename, mime, content, bytes, document_date, fingerprint, created_at, payment_id)
      VALUES (?,'invoice',?,'application/pdf',?,?,?,?,?,?) ON CONFLICT (client_id, kind, fingerprint) DO UPDATE SET archived = FALSE RETURNING id`)
      .bind(Number(r.client_id), name, pdf.bytes.toString('base64'), pdf.bytes.length, day(t), fp, t, Number(r.payment_id)).first();
    for (const l of pdf.pay.lines) await DB.prepare('INSERT INTO invoice_orders (file_id, order_id) VALUES (?,?) ON CONFLICT DO NOTHING').bind(Number(file.id), l.id).run();
    await DB.prepare("UPDATE supplier_receipts SET status='approved', reason='', decided_by=?, decided_at=?, file_id=? WHERE id=?").bind(adminName.slice(0, 60), t, Number(file.id), r.id).run();
    return json({ ok: true, receipts: await adminReceipts(DB) });
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
