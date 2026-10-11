import { isIP } from 'node:net';
import initialPolicy from '../content/service-policy-v1.mjs';

export const TERMS_TITLE = 'Direct Line – Service, Fulfillment & After-Sales Policy';
export const TERMS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS portal_terms_versions (
    version INTEGER PRIMARY KEY, english TEXT NOT NULL, hebrew TEXT NOT NULL, published_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS client_terms_acceptances (
    client_id INTEGER NOT NULL REFERENCES users(id), version INTEGER NOT NULL REFERENCES portal_terms_versions(version),
    accepted_at INTEGER NOT NULL, ip TEXT NOT NULL, PRIMARY KEY (client_id, version))`,
];
export async function currentTerms(DB) {
  let row = await DB.prepare('SELECT * FROM portal_terms_versions ORDER BY version DESC LIMIT 1').first();
  if (!row) {
    await DB.prepare('INSERT INTO portal_terms_versions (version,english,hebrew,published_at) VALUES (?,?,?,?) ON CONFLICT(version) DO NOTHING')
      .bind(initialPolicy.version, initialPolicy.english, initialPolicy.hebrew, Math.floor(Date.now()/1000)).run();
    row = await DB.prepare('SELECT * FROM portal_terms_versions ORDER BY version DESC LIMIT 1').first();
  }
  return { version: Number(row.version), title: TERMS_TITLE, english: row.english, hebrew: row.hebrew };
}
export const termsAcceptance = (DB, id, version) => DB.prepare('SELECT version, accepted_at FROM client_terms_acceptances WHERE client_id=? AND version=?').bind(id,version).first();
export async function acceptTerms(DB, id, version, request) {
  // Vercel's edge supplies these headers: https://vercel.com/docs/headers/request-headers
  const ip = (request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  await DB.prepare('INSERT INTO client_terms_acceptances (client_id,version,accepted_at,ip) VALUES (?,?,?,?) ON CONFLICT(client_id,version) DO NOTHING')
    .bind(id,version,Math.floor(Date.now()/1000),isIP(ip) ? ip : 'unavailable').run();
  return termsAcceptance(DB,id,version);
}
export async function publishTerms(DB, body) {
  const current = await currentTerms(DB), version = Number(body.version);
  const english = typeof body.english === 'string' ? body.english.trim() : '';
  const hebrew = typeof body.hebrew === 'string' ? body.hebrew.trim() : '';
  if (!Number.isInteger(version) || version <= current.version || version > 1000000) throw new Error('Choose a higher terms version number.');
  if (!english || !hebrew || english.length > 18000 || hebrew.length > 18000) throw new Error('Both policy texts are required (up to 18000 characters each).');
  if (/EcomOrigins/i.test(english + hebrew)) throw new Error('Use the Direct Line service name in the policy.');
  const row = await DB.prepare('INSERT INTO portal_terms_versions (version,english,hebrew,published_at) VALUES (?,?,?,?) ON CONFLICT(version) DO NOTHING RETURNING version')
    .bind(version,english,hebrew,Math.floor(Date.now()/1000)).first();
  if (!row) throw new Error('This terms version already exists. Reload and choose a higher version.');
  return currentTerms(DB);
}
