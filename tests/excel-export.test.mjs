import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Loads dist/p/excel-export.js the way the browser does, and reads the .xlsx (ZIP) it makes back.
async function load() {
  const src = await readFile(new URL('../dist/p/excel-export.js', import.meta.url), 'utf8');
  const window = {}; new Function('window', 'document', src)(window, {});
  return window.DLExcelExport;
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

test('Excel export: a valid .xlsx with every order, its price, a Yes / No Paid column and paid / not paid totals', async () => {
  const X = await load();
  const orders = [
    { id: 1, orderRef: '#42011', orderDate: '2026-10-12', buyerName: 'Jason Wells', itemTitle: 'Key holder', variant: 'XL', quantity: 1, status: 'processing', price: 44.9, priced: true },
    { id: 2, orderRef: '#42012', orderDate: '2026-10-13', buyerName: 'A & B <x>', itemTitle: '', variant: '', quantity: 2, status: 'shipped', price: 81.8, priced: true },
    { id: 3, orderRef: '#42013', orderDate: '2026-10-14', buyerName: 'C', itemTitle: 'Bag', variant: '', quantity: 1, status: 'cancelled', price: 0, priced: true },
    { id: 4, orderRef: '#42014', orderDate: '2026-10-15', buyerName: 'D', itemTitle: 'Mug', variant: '', quantity: 1, status: 'pending', price: 0, priced: false },
  ];
  const blob = X.orders({ title: 'Orders — Test', subtitle: 'All stores', orders, statusLabel: s => s });
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const files = unzip(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual([...files.keys()], ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
  for (const [name, f] of files) assert.equal(f.crc, X.crc32(f.data), 'CRC of ' + name);
  const sheet = files.get('xl/worksheets/sheet1.xml').text;
  for (const s of ['#42011', '<v>44.9</v>', '<v>81.8</v>', 'A &amp; B &lt;x&gt;', 'Key holder · XL', 'Not priced yet', 'Cancelled']) assert.ok(sheet.includes(s), s);
  assert.ok(sheet.includes('<f>SUM(G5:G8)</f>') && sheet.includes('<f>SUMIF(H5:H8,&quot;Yes&quot;,G5:G8)</f>'), 'totals: all, paid, not paid');
  assert.ok(sheet.includes('<dataValidation type="list"') && sheet.includes('<formula1>"Yes,No"</formula1>'), 'Paid is a Yes / No drop-down');
  assert.ok(sheet.includes('<autoFilter ref="A4:H8"/>') && sheet.includes('state="frozen"'), 'filter buttons, header stays on screen');
  const he = X.orders({ title: 'הזמנות', subtitle: '', orders, statusLabel: s => s, rtl: true, t: s => ({ Yes: 'כן', No: 'לא' }[s] || s) });
  const hs = unzip(new Uint8Array(await he.arrayBuffer())).get('xl/worksheets/sheet1.xml').text;
  assert.ok(hs.includes('rightToLeft="1"') && hs.includes('"כן,לא"') && hs.includes('&quot;כן&quot;'), 'Hebrew: right-to-left sheet, כן / לא');
});

test('wired up: portal Orders and admin client panel have "Export to Excel"; the Word export is gone; Hebrew', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const portal = await read('../dist/portal/portal.js'), admin = await read('../dist/admin/admin.js'), he = await read('../dist/p/i18n.js');
  assert.ok(portal.includes('data-excel-export') && portal.includes('function exportOrdersToExcel()') && !portal.includes('DLWordExport'));
  assert.ok(admin.includes('data-excel-export="${c.id}"') && !admin.includes('DLWordExport'));
  for (const f of ['../dist/portal/index.html', '../dist/admin/index.html']) { const h = await read(f); assert.match(h, /<script src="\/p\/excel-export\.js\?v=\d+"><\/script>/); assert.ok(!h.includes('word-export')); }
  assert.ok(he.includes("'Export to Excel':") && he.includes("'Not paid yet':"));
});
