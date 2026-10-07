// Turns Etsy's "Download Data" CSV files into Direct Line orders (runs in the browser; no network).
// Best file: CSV type "Order Items" (EtsySoldOrderItems…csv) — one row per item, with the listing ID
// (→ product link), quantity, variations and the shipping address. The "Orders" file
// (EtsySoldOrders…csv) can be added too: it fills in what the customer paid. On its own it has
// no listing IDs, so it can't make product links.
(function (root) {
  const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // RFC-4180-ish CSV parser: quotes, doubled quotes, commas/newlines inside quotes, BOM, CRLF.
  function parseCsv(text) {
    const s = String(text || '').replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  }

  const FIELDS = {
    orderId: ['orderid'], saleDate: ['saledate'], shipName: ['shipname', 'fullname'],
    addr1: ['shipaddress1', 'street1', 'shipaddress'], addr2: ['shipaddress2', 'street2'],
    city: ['shipcity'], state: ['shipstate'], zip: ['shipzipcode', 'shippostcode', 'shipzip', 'shippostalcode'], country: ['shipcountry'],
    listingId: ['listingid'], itemName: ['itemname', 'item', 'title'], quantity: ['quantity'], items: ['numberofitems'],
    variations: ['variations'], sku: ['sku'], price: ['price'], itemTotal: ['itemtotal'],
    orderShipping: ['ordershipping'], shipping: ['shipping'], orderTotal: ['ordertotal'], salesTax: ['ordersalestax', 'salestax'],
    currency: ['currency'], dateShipped: ['dateshipped'], status: ['status'],
  };
  function table(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { kind: 'empty', rows: [] };
    const head = rows[0].map(norm);
    const col = {};
    for (const [k, names] of Object.entries(FIELDS)) { const i = head.findIndex(h => names.includes(h)); if (i >= 0) col[k] = i; }
    const get = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
    const data = rows.slice(1).map(r => Object.fromEntries(Object.keys(col).map(k => [k, get(r, k)])));
    const kind = col.orderId === undefined ? 'unknown'
      : col.listingId !== undefined ? 'items'
        : (col.orderTotal !== undefined && (col.addr1 !== undefined || col.shipName !== undefined)) ? 'orders' : 'unknown';
    return { kind, rows: data.filter(r => r.orderId) };
  }

  const num = v => { const n = Number(String(v || '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const round2 = n => Math.round(n * 100) / 100;
  // Etsy writes dates as MM/DD/YY (sometimes MM/DD/YYYY or YYYY-MM-DD).
  function isoDate(v) {
    const s = String(v || '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
    if (!m) return '';
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mo = Number(m[1]), d = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const ALIASES = { 'united states of america': 'US', usa: 'US', 'great britain': 'UK', 'england': 'UK', 'scotland': 'UK', 'wales': 'UK', 'northern ireland': 'UK', 'czech republic': 'CZ' };
  function countryCode(name, countries) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return '';
    if (ALIASES[n]) return ALIASES[n];
    const hit = (countries || []).find(([c, label]) => label.toLowerCase() === n || c.toLowerCase() === n);
    return hit ? hit[0] : String(name).trim().slice(0, 60);
  }

  // files: [{ name, text }]. existingRefs: order numbers already in the portal.
  function build(files, { countries = [], existingRefs = [] } = {}) {
    const tables = files.map(f => ({ name: f.name, ...table(f.text) }));
    const items = tables.filter(t => t.kind === 'items'), orderFiles = tables.filter(t => t.kind === 'orders');
    const unknown = tables.filter(t => t.kind === 'unknown' || t.kind === 'empty').map(t => t.name);
    if (!items.length) {
      return { orders: [], unknown, problem: orderFiles.length ? 'orders-only' : 'not-etsy' };
    }
    const totals = new Map();
    for (const r of orderFiles.flatMap(t => t.rows)) totals.set(r.orderId, r);
    const seen = new Set(existingRefs.map(r => String(r).replace(/^#/, '').trim()));
    const groups = new Map();
    for (const r of items.flatMap(t => t.rows)) { if (!groups.has(r.orderId)) groups.set(r.orderId, []); groups.get(r.orderId).push(r); }
    const orders = [];
    for (const [orderId, rows] of groups) {
      const first = rows[0], tot = totals.get(orderId);
      const links = [...new Set(rows.map(r => r.listingId.replace(/\D/g, '')).filter(Boolean))].slice(0, 10).map(id => `https://www.etsy.com/listing/${id}`);
      const qty = rows.reduce((t, r) => t + Math.max(1, Math.round(num(r.quantity) || 1)), 0);
      const lines = rows.map(r => {
        const v = r.variations ? ` — ${r.variations}` : '';
        const q = num(r.quantity) > 1 ? ` (×${num(r.quantity)})` : '';
        return `${r.itemName || 'Item'}${v}${q}`;
      });
      const addressLines = [first.addr1, first.addr2, [first.city, [first.state, first.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean);
      // What the customer paid (without sales tax, which Etsy keeps): from the Orders file when given,
      // otherwise the item totals plus the order's shipping.
      const paid = tot
        ? num(tot.orderTotal) - num(tot.salesTax)
        : rows.reduce((t, r) => t + (r.itemTotal ? num(r.itemTotal) : num(r.price) * Math.max(1, num(r.quantity) || 1)), 0) + num(first.orderShipping);
      const ref = orderId.replace(/^#/, '').trim();
      const shipped = rows.some(r => r.dateShipped);
      orders.push({
        orderRef: ref,
        orderDate: isoDate(first.saleDate),
        sellingPrice: round2(Math.max(0, paid)),
        currency: (first.currency || tot?.currency || 'USD').toUpperCase().slice(0, 3),
        buyerName: first.shipName || tot?.shipName || '',
        address1: addressLines.join('\n'),
        destination: countryCode(first.country || tot?.country, countries),
        countryName: first.country || tot?.country || '',
        etsyUrl: links.join('\n'),
        itemTitle: rows.map(r => r.itemName).filter(Boolean).join(' + ').slice(0, 300),
        variant: lines.join('\n').slice(0, 500),
        sku: [...new Set(rows.map(r => r.sku).filter(Boolean))].join(', ').slice(0, 120),
        quantity: Math.min(999, Math.max(1, qty)),
        shippedOnEtsy: shipped,
        alreadyImported: seen.has(ref),
        missing: [!links.length && 'product link', !(first.shipName || tot?.shipName) && 'recipient', !addressLines.length && 'address'].filter(Boolean),
      });
    }
    orders.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || '') || b.orderRef.localeCompare(a.orderRef));
    return { orders, unknown, problem: null, withTotals: orderFiles.length > 0 };
  }

  root.DLEtsyImport = { parseCsv, table, build, isoDate, countryCode };
})(typeof window !== 'undefined' ? window : globalThis);
