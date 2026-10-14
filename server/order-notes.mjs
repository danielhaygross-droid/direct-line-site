// Etsy order notes often carry a tax number (e.g. "Etsy's IOSS number: IM3720000224" + "EUR 72.37") and a
// "Gift message:" block. Those have their own fields now; this moves them out of the notes so the supplier sees
// them in their own columns. Nothing is lost: what is not recognised stays in the notes.
const TAX_LINE = /^(?:etsy'?s\s+)?(?:ioss|eori)\b[^:]{0,30}:\s*\S|^(?:vat|tax)\s*(?:number|no\.?|id|registration number)\s*:\s*\S/i;
const AMOUNT_LINE = /^[A-Z]{3}\s*[\d.,]+$|^[\d.,]+\s*[A-Z]{3}$/;
const GIFT_LINE = /^gift\s+(?:message|note)\s*:?\s*(.*)$/i;
const tidy = lines => lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

export function splitNotes(notes) {
  const lines = String(notes ?? '').split(/\r?\n/);
  const keep = [], tax = [], gift = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const g = GIFT_LINE.exec(line);
    if (g) { // the gift message runs to the end, or to a tax line
      if (g[1]) gift.push(g[1]);
      while (i + 1 < lines.length && !TAX_LINE.test(lines[i + 1].trim())) gift.push(lines[++i].trim());
      continue;
    }
    if (TAX_LINE.test(line)) {
      let t = line;
      if (i + 1 < lines.length && AMOUNT_LINE.test(lines[i + 1].trim())) t += ' ' + lines[++i].trim();
      tax.push(t);
      continue;
    }
    keep.push(lines[i]);
  }
  return { notes: tidy(keep), taxNumber: tax.join(' · '), giftMessage: tidy(gift) };
}

// One time: orders saved before the fields existed. Returns the ids that changed (their sheet rows need rewriting).
export async function splitOldNotes(DB) {
  const KEY = 'notes_split_v1';
  if ((await DB.prepare('SELECT value FROM portal_settings WHERE key=?').bind(KEY).first())?.value === '1') return [];
  const rows = (await DB.prepare("SELECT id, notes, tax_number, gift_message FROM client_orders WHERE notes ILIKE '%ioss%' OR notes ILIKE '%vat%' OR notes ILIKE '%tax%' OR notes ILIKE '%eori%' OR notes ILIKE '%gift%'").all()).results || [];
  const changed = [];
  for (const o of rows) {
    const s = splitNotes(o.notes);
    const tax = o.tax_number || s.taxNumber || null, gift = o.gift_message || s.giftMessage || null;
    if (s.notes === String(o.notes || '').trim() || (o.tax_number && s.taxNumber) || (o.gift_message && s.giftMessage)) continue; // nothing to move, or the field is already filled
    await DB.prepare("UPDATE client_orders SET notes=?, tax_number=?, gift_message=?, sheet_sync_status='waiting' WHERE id=?").bind(s.notes, tax, gift, o.id).run();
    changed.push(Number(o.id));
  }
  await DB.prepare('INSERT INTO portal_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(KEY, '1').run();
  return changed;
}
