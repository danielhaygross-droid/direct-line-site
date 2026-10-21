/* Excel (.xlsx) export of an order list, built in the browser (no library, nothing uploaded).
   Used by the client portal (Orders) and the admin client panel (Orders).
   "Paid" is a Yes / No drop-down per order; the summary under the table adds up what is paid and what is not.
   window.DLExcelExport.orders({ title, subtitle, orders, statusLabel, t, rtl }) → Blob */
(function () {
  const enc = new TextEncoder();
  // ---------- a tiny ZIP writer (files stored, not compressed: Excel opens it like any .xlsx) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
    return new Blob([...parts, ...central, end], { type: MIME });
  }
  // ---------- SpreadsheetML ----------
  const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = i => String.fromCharCode(65 + i);
  // Cell styles (index into cellXfs below): 0 normal, 1 title, 2 subtitle, 3 header, 4 text, 5 money, 6 date, 7 centered,
  // 8 total label, 9 total money, 10 grey text (not priced / cancelled), 11 paid drop-down, 12 note.
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF10221B"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF5F6862"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF8A8A8A"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE8DA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7F4EE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3CF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9D2C3"/></left><right style="thin"><color rgb="FFD9D2C3"/></right><top style="thin"><color rgb="FFD9D2C3"/></top><bottom style="thin"><color rgb="FFD9D2C3"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="13">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="1"><dxf><font><b/><color rgb="FF1F6B4F"/></font><fill><patternFill><bgColor rgb="FFE3F1EA"/></patternFill></fill></dxf></dxfs>
</styleSheet>`;
  const str = (ref, v, s) => `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  const num = (ref, v, s) => `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  const formula = (ref, f, s) => `<c r="${ref}" s="${s}"><f>${x(f)}</f></c>`;
  const serial = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null; };

  // The order list as an Excel sheet: order, date, customer, product, qty, status, total, Paid (Yes / No), and a summary.
  function orders({ title, subtitle, orders: list, statusLabel, t = s => s, rtl = false }) {
    const YES = t('Yes'), NO = t('No');
    const head = ['Order', 'Date', 'Customer', 'Product', 'Qty', 'Status', 'Total', 'Paid'].map(h => t(h));
    const first = 5, rows = [];
    rows.push(`<row r="1" ht="24" customHeight="1">${str('A1', title, 1)}</row>`);
    rows.push(`<row r="2">${str('A2', subtitle, 2)}</row>`);
    rows.push(`<row r="4" ht="20" customHeight="1">${head.map((h, i) => str(col(i) + 4, h, i === 7 ? 11 : 3)).join('')}</row>`);
    list.forEach((o, i) => {
      const r = first + i, cancelled = o.status === 'cancelled';
      const priced = o.priced ?? (o.productCost != null || o.shippingFee != null || o.quotedUnitPrice != null);
      const date = o.orderDate || (o.createdAt ? new Date(o.createdAt * 1000).toISOString().slice(0, 10) : ''), ds = serial(date);
      const product = [o.itemTitle, o.variant].filter(Boolean).join(' · ') || '—';
      const total = cancelled ? str('G' + r, t('Cancelled'), 10) : priced ? num('G' + r, Math.round(Number(o.price || 0) * 100) / 100, 5) : str('G' + r, t('Not priced yet'), 10);
      rows.push(`<row r="${r}">${str('A' + r, o.orderRef || '#' + o.id, 4)}${ds != null ? num('B' + r, ds, 6) : str('B' + r, date, 4)}${str('C' + r, o.buyerName || '—', 4)}${str('D' + r, product, 4)}${num('E' + r, Number(o.quantity || 1), 7)}${str('F' + r, statusLabel(o.status), cancelled ? 10 : 4)}${total}${cancelled ? str('H' + r, '', 7) : str('H' + r, o.paymentId ? YES : NO, 7)}</row>`);
    });
    const last = first + Math.max(list.length, 1) - 1, s = last + 2;
    // Summary: totals of the priced, not cancelled orders; "Paid" follows the Yes / No in column H.
    const range = `G${first}:G${last}`, paid = `H${first}:H${last}`;
    rows.push(`<row r="${s}">${str('F' + s, t('Total'), 8)}${formula('G' + s, `SUM(${range})`, 9)}</row>`);
    rows.push(`<row r="${s + 1}">${str('F' + (s + 1), t('Paid'), 8)}${formula('G' + (s + 1), `SUMIF(${paid},"${YES}",${range})`, 9)}</row>`);
    rows.push(`<row r="${s + 2}">${str('F' + (s + 2), t('Not paid yet'), 8)}${formula('G' + (s + 2), `G${s}-G${s + 1}`, 9)}</row>`);
    rows.push(`<row r="${s + 4}">${str('A' + (s + 4), t('"Paid" says Yes for the orders Direct Line has recorded as paid. You can change it; the totals update by themselves. Cancelled and not-priced orders are not counted.'), 12)}</row>`);
    const widths = [17, 12, 24, 44, 8, 22, 14, 10];
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:H${s + 4}"/>`
      + `<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="H5" sqref="H5"/></sheetView></sheetViews>`
      + `<sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      + `<sheetData>${rows.join('')}</sheetData>`
      + `<autoFilter ref="A4:H${last}"/>`
      + `<conditionalFormatting sqref="${paid}"><cfRule type="cellIs" dxfId="0" priority="1" operator="equal"><formula>"${x(YES)}"</formula></cfRule></conditionalFormatting>`
      + `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${paid}"><formula1>"${x(YES)},${x(NO)}"</formula1></dataValidation></dataValidations>`
      + `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
    const sheetName = x(t('Orders')).slice(0, 31);
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title)}</dc:title><dc:creator>Direct Line</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName.replace(/'/g, "''")}'!$A$4:$H$${last}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', STYLES],
      ['xl/worksheets/sheet1.xml', sheet],
    ];
    return zip(files);
  }
  function download(blob, filename) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  window.DLExcelExport = { orders, download, zip, crc32, MIME };
})();
