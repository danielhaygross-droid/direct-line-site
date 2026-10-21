// Billing details for receipts / invoices (Ada, 21 Oct 2026): the client's name, company, address and contact details,
// used as the header of the invoices the production team prepares for paid bills. The client fills them in on the
// Payments page; an admin can see and correct them in the client panel (Money > Payments).
export const BILLING_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS client_billing (
    client_id INTEGER PRIMARY KEY REFERENCES users(id), name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL DEFAULT 'client')`,
];
const line = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Address: up to 6 lines, spaces tidied, empty lines dropped.
const lines = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6).join('\n').slice(0, max);

export async function getBilling(DB, clientId) {
  const r = await DB.prepare('SELECT * FROM client_billing WHERE client_id = ?').bind(clientId).first();
  return r ? { name: r.name, company: r.company, address: r.address, email: r.email, phone: r.phone, updatedAt: Number(r.updated_at), updatedBy: r.updated_by } : null;
}
// Name, address and an email or phone number are needed for a receipt; the company name is optional.
export async function saveBilling(DB, clientId, body, by = 'client') {
  const b = { name: line(body?.name, 120), company: line(body?.company, 120), address: lines(body?.address, 400), email: line(body?.email, 160), phone: line(body?.phone, 60) };
  if (!b.name) throw new Error('Enter the name for the receipt.');
  if (!b.address) throw new Error('Enter the billing address.');
  if (!b.email && !b.phone) throw new Error('Enter an email or a phone number.');
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) throw new Error('Check the email address.');
  if (b.phone && !/^[+()\d][\d\s()+./-]{4,}$/.test(b.phone)) throw new Error('Check the phone number.');
  await DB.prepare(`INSERT INTO client_billing (client_id, name, company, address, email, phone, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT (client_id) DO UPDATE SET name=EXCLUDED.name, company=EXCLUDED.company, address=EXCLUDED.address, email=EXCLUDED.email, phone=EXCLUDED.phone, updated_at=EXCLUDED.updated_at, updated_by=EXCLUDED.updated_by`)
    .bind(clientId, b.name, b.company, b.address, b.email, b.phone, Math.floor(Date.now() / 1000), by === 'admin' ? 'admin' : 'client').run();
  return getBilling(DB, clientId);
}
