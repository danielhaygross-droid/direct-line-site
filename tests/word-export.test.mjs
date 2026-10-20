import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Loads dist/p/word-export.js the way the browser does, and reads the .docx (ZIP) it makes back.
async function load() {
  const src = await readFile(new URL('../dist/p/word-export.js', import.meta.url), 'utf8');
  const window = {}; new Function('window', 'document', src)(window, {});
  return window.DLWordExport;
}
export function unzip(buf) {
  const files = new Map(), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = buf.length - 22; while (dv.getUint32(end, true) !== 0x06054b50) end--;
  let p = dv.getUint32(end + 16, true);
  for (let i = 0; i < dv.getUint16(end + 10, true); i++) {
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true), local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    const data = buf.subarray(local + 30 + dv.getUint16(local + 26, true), local + 30 + dv.getUint16(local + 26, true) + size);
    files.set(name, { crc, data, text: new TextDecoder().decode(data) });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return files;
}

test('Word export: a valid .docx with every order, its price, a Paid check box and the total', async () => {
  const W = await load();
  const orders = [
    { id: 1, orderRef: '#42011', orderDate: '2026-10-12', buyerName: 'Jason Wells', itemTitle: 'Key holder', variant: 'XL', quantity: 1, status: 'processing', price: 44.9 },
    { id: 2, orderRef: '#42012', orderDate: '2026-10-13', buyerName: 'A & B <x>', itemTitle: '', variant: '', quantity: 2, status: 'shipped', price: 81.8 },
    { id: 3, orderRef: '#42013', orderDate: '2026-10-14', buyerName: 'C', itemTitle: 'Bag', variant: '', quantity: 1, status: 'cancelled', price: 0 },
  ];
  const blob = W.orders({ title: 'Orders — Test', subtitle: 'All stores', orders, money: n => '$' + Number(n).toFixed(2), statusLabel: s => s });
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const files = unzip(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual([...files.keys()], ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/document.xml']);
  for (const [name, f] of files) assert.equal(f.crc, W.crc32(f.data), 'CRC of ' + name);
  const doc = files.get('word/document.xml').text;
  for (const s of ['#42011', '$44.90', '$81.80', 'A &amp; B &lt;x&gt;', 'Key holder · XL', '$126.70', '2 orders']) assert.ok(doc.includes(s), s);
  assert.equal((doc.match(/<w14:checkbox>/g) || []).length, 2, 'a Paid box for each order that is not cancelled');
  assert.ok(doc.includes('w:orient="landscape"'));
  const he = W.orders({ title: 'הזמנות', subtitle: '', orders, money: n => '$' + n, statusLabel: s => s, rtl: true });
  const hdoc = unzip(new Uint8Array(await he.arrayBuffer())).get('word/document.xml').text;
  assert.ok(hdoc.includes('<w:bidiVisual/>'), 'Hebrew: the table reads right to left');
  assert.ok(/<w:rtl\/><\/w:rPr><w:t xml:space="preserve">הזמנות/.test(hdoc) && !/<w:rtl\/><\/w:rPr><w:t xml:space="preserve">#42011/.test(hdoc), 'only Hebrew text is marked right-to-left (order numbers keep their order)');
});

test('wired up: portal Orders and admin client panel have "Export to Word"; Hebrew', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const portal = await read('../dist/portal/portal.js'), admin = await read('../dist/admin/admin.js'), he = await read('../dist/p/i18n.js');
  assert.ok(portal.includes('data-word-export') && portal.includes('function exportOrdersToWord()'));
  assert.ok(admin.includes('data-word-export="${c.id}"'));
  for (const f of ['../dist/portal/index.html', '../dist/admin/index.html']) assert.match(await read(f), /<script src="\/p\/word-export\.js\?v=\d+"><\/script>/);
  assert.ok(he.includes("'Export to Word':"));
});
