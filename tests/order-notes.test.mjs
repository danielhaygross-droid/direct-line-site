import test from 'node:test';
import assert from 'node:assert/strict';
import { splitNotes } from '../server/order-notes.mjs';

const NL = String.fromCharCode(10);
test('the Etsy IOSS number and gift message come out of the notes; everything else stays', () => {
  const real = ["Etsy's IOSS number: IM3720000224", ' EUR 72.37', '', 'Gift message:', 'Un petit cadeau.', '', '-- Jamel, Driss et Clara'].join(NL);
  assert.deepEqual(splitNotes(real), { notes: '', taxNumber: "Etsy's IOSS number: IM3720000224 EUR 72.37", giftMessage: ['Un petit cadeau.', '', '-- Jamel, Driss et Clara'].join(NL) });
  assert.deepEqual(splitNotes(['Please wrap it', 'Gift note: Happy birthday Mom'].join(NL)), { notes: 'Please wrap it', taxNumber: '', giftMessage: 'Happy birthday Mom' });
  assert.deepEqual(splitNotes(['VAT number: GB123456789', 'Fragile'].join(NL)), { notes: 'Fragile', taxNumber: 'VAT number: GB123456789', giftMessage: '' });
});

test('ordinary notes are left alone', () => {
  for (const n of ['Tax: please add an invoice', 'Fragile', '', 'A gift for my mom', 'The taxi will pick it up']) assert.deepEqual(splitNotes(n), { notes: n, taxNumber: '', giftMessage: '' }, n);
});
