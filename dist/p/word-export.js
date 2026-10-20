/* Word (.docx) export of an order list, built in the browser (no library, no upload).
   Used by the client portal (Orders) and the admin client panel (Orders).
   The "Paid" column has a real Word check box per order: click it in Word to mark the order as paid.
   window.DLWordExport.orders({ title, subtitle, orders, money, statusLabel, filename }) */
(function () {
  const enc = new TextEncoder();
  // ---------- a tiny ZIP writer (files stored, not compressed: Word opens it like any .docx) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const parts = [], central = []; let offset = 0;
    const u16 = n => [n & 0xff, (n >>> 8) & 0xff], u32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    for (const [name, text] of files) {
      const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)]);
      parts.push(local, nameB, data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nameB);
      offset += local.length + nameB.length + data.length;
    }
    const size = central.reduce((n, p) => n + p.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  // ---------- WordprocessingML ----------
  const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14"';
  function docXml({ title, subtitle, head, rows, foot, widths, rtl, note }) {
    // Right-to-left only for runs with Hebrew in them: numbers, prices, dates and English names keep their own order.
    const bidi = rtl ? '<w:bidi/>' : '', rtlRun = t => (rtl && /[֐-׿]/.test(String(t)) ? '<w:rtl/>' : '');
    const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/>${o.b ? '<w:b/><w:bCs/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 20}"/><w:szCs w:val="${o.sz || 20}"/>${rtlRun(t)}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
    // A line of text; an array is several parts joined by " · ", each with its own direction (dates stay readable in Hebrew).
    const para = (t, o = {}) => `<w:p><w:pPr>${bidi}<w:spacing w:after="${o.after ?? 60}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${t === '' ? '' : Array.isArray(t) ? t.map((part, i) => (i ? run(' · ', o) : '') + (Array.isArray(part) ? part.map((w, j) => (j ? run(' ', o) : '') + run(w, o)).join('') : run(part, o))).join('') : run(t, o)}</w:p>`;
    // A real Word check box (click to tick). Word 2010+; other apps show the box as text.
    const box = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="0"/><w14:checkedState w14:val="2612" w14:font="MS Gothic"/><w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:rPr><w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic"/><w:sz w:val="28"/></w:rPr><w:t>☐</w:t></w:r></w:sdtContent></w:sdt></w:p>`;
    const cell = (content, w, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:tcBorders><w:bottom w:val="single" w:sz="4" w:color="D9D2C3"/></w:tcBorders>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`;
    const cellText = (t, w, o = {}) => cell(`<w:p><w:pPr>${bidi}<w:spacing w:after="0"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${run(t, o)}</w:p>`, w, o);
    const border = '<w:top w:val="single" w:sz="4" w:color="D9D2C3"/><w:left w:val="single" w:sz="4" w:color="D9D2C3"/><w:bottom w:val="single" w:sz="4" w:color="D9D2C3"/><w:right w:val="single" w:sz="4" w:color="D9D2C3"/><w:insideH w:val="single" w:sz="4" w:color="D9D2C3"/><w:insideV w:val="single" w:sz="4" w:color="D9D2C3"/>';
    const tr = (cells, header) => `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells}</w:tr>`;
    const headRow = tr(head.map((h, i) => cellText(h.label, widths[i], { b: true, fill: 'EFE8DA', jc: h.jc, sz: 19 })).join(''), true);
    const bodyRows = rows.map(r => tr(r.map((v, i) => v === 'BOX' ? cell(box, widths[i]) : cellText(v.text ?? v, widths[i], { jc: head[i].jc, color: v.color, b: v.b })).join(''))).join('');
    const footRow = foot ? tr(foot.map((v, i) => cellText(v.text ?? v, widths[i], { b: true, fill: 'F7F4EE', jc: head[i].jc })).join('')) : '';
    const table = `<w:tbl><w:tblPr>${rtl ? '<w:bidiVisual/>' : ''}<w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${headRow}${bodyRows}${footRow}</w:tbl>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${para('direct↗line.', { b: true, sz: 28, color: '10221B', after: 120 })}${para(title, { b: true, sz: 32, after: 40 })}${para(subtitle, { color: '5F6862', after: 200 })}${table}${note ? para('', { after: 0 }) + para(note, { color: '5F6862', sz: 18 }) : ''}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="500" w:footer="500" w:gutter="0"/>${rtl ? '<w:bidi/>' : ''}</w:sectPr></w:body></w:document>`;
  }
  const CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  const core = title => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title)}</dc:title><dc:creator>Direct Line</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`;

  // The order list as a Word table: order, date, customer, product, qty, status, total, Paid (check box).
  function orders({ title, subtitle, orders: list, money, statusLabel, t = s => s, rtl = false }) {
    const head = [{ label: t('Order') }, { label: t('Date') }, { label: t('Customer') }, { label: t('Product') }, { label: t('Qty'), jc: 'center' }, { label: t('Status') }, { label: t('Total'), jc: rtl ? 'left' : 'right' }, { label: t('Paid'), jc: 'center' }];
    const widths = [1900, 1300, 2300, 4100, 650, 1700, 1400, 1000];
    const day = o => { const d = o.orderDate || (o.createdAt ? new Date(o.createdAt * 1000).toISOString().slice(0, 10) : ''); return d; };
    const rows = list.map(o => {
      const cancelled = o.status === 'cancelled';
      const product = [o.itemTitle, o.variant].filter(Boolean).join(' · ') || '—';
      return [o.orderRef || '#' + o.id, day(o), o.buyerName || '—', product, String(o.quantity || 1), { text: statusLabel(o.status), color: cancelled ? 'A8452F' : undefined },
        cancelled ? { text: '—', color: '8A8A8A' } : { text: money(o.price), b: true }, cancelled ? '' : 'BOX'];
    });
    const billed = list.filter(o => o.status !== 'cancelled').reduce((n, o) => n + Number(o.price || 0), 0);
    const foot = ['', '', '', t('Total'), '', String(list.filter(o => o.status !== 'cancelled').length) + ' ' + t('orders'), money(Math.round(billed * 100) / 100), ''];
    const xml = docXml({ title, subtitle, head, rows, foot, widths, rtl, note: t('Tick "Paid" in Word to mark each order you have paid. Cancelled orders are not counted.') });
    return zip([['[Content_Types].xml', CT], ['_rels/.rels', RELS], ['docProps/core.xml', core(title)], ['word/document.xml', xml]]);
  }
  function download(blob, filename) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  window.DLWordExport = { orders, download, zip, crc32 };
})();
