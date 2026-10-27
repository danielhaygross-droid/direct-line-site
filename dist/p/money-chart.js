// Money by month: one bar chart shared by the admin Overview and the client portal (Erwin, 27 Oct 2026: "a detailed
// graph for all the money matters"). Grouped bars per month, a range switch (6 / 12 months / all), series the viewer can
// switch off, the totals for the shown range, and the same numbers as a table for screen readers and exact values.
//   DLMoneyChart.mount(el, { months: [{ month: 'YYYY-MM', <key>: number }], series: [{ key, label, tone, note? }],
//                            money: n => '$1.00', key: 'storage-key', range: 12, title: 'Money by month' })
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const lang = () => (root.DLi18n?.lang === 'he' ? 'he-IL' : 'en-GB');
  const label = (key, opts) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 15).toLocaleDateString(lang(), opts); };
  const short = key => label(key, { month: 'short', year: '2-digit' }), long = key => label(key, { month: 'long', year: 'numeric' });
  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  // Every month between the first with data and this month, so empty months show as gaps instead of disappearing.
  function fill(rows) {
    const by = new Map(rows.map(r => [r.month, r])), now = new Date(), end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const first = rows.map(r => r.month).filter(m => m <= end).sort()[0] || end, out = [];
    for (let [y, m] = first.split('-').map(Number); ; m++) { if (m > 12) { m = 1; y++; } const k = `${y}-${String(m).padStart(2, '0')}`; out.push(by.get(k) || { month: k }); if (k >= end || out.length > 240) break; }
    return out;
  }
  // A round top for the y axis (1, 2 or 5 times a power of ten) and four grid lines.
  // The top is 1, 2 or 5 times a power of ten, split in steps that stay round ($0, $10, $20... or $0, $5, $10...).
  const niceTop = v => { if (v <= 0) return [1, 5]; const p = 10 ** Math.floor(Math.log10(v)), f = v / p, m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; return [m * p, m === 2 ? 4 : 5]; };
  // Axis labels in USD, short: $0, $250, $1.5k, $12k.
  const compact = n => n >= 1000 ? '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : '$' + Math.round(n);

  // Drawn at the box's real width so the labels keep their size on a phone and in a half-width card.
  function svg(rows, series, money, W = 720) {
    const H = 240, L = 46, B = 26, T = 10, plotW = W - L - 8, plotH = H - B - T;
    const [max, steps] = niceTop(Math.max(0, ...rows.flatMap(r => series.map(s => Number(r[s.key] || 0)))));
    const slot = plotW / Math.max(rows.length, 1), gap = Math.min(10, slot * 0.25), bw = Math.max(1.5, (slot - gap) / series.length);
    const y = v => T + plotH - (v / max) * plotH, every = Math.ceil(rows.length / Math.max(2, Math.floor(plotW / 56)));
    const grid = Array.from({ length: steps + 1 }, (_, i) => i / steps).map(f => `<line x1="${L}" x2="${W - 8}" y1="${y(max * f)}" y2="${y(max * f)}" class="mc-grid"/><text x="${L - 6}" y="${y(max * f) + 4}" class="mc-ax" text-anchor="end">${esc(compact(max * f))}</text>`).join('');
    const bars = rows.map((r, i) => {
      const x0 = L + i * slot + gap / 2, tip = `${long(r.month)}\n` + series.map(s => `${s.label}: ${money(r[s.key] || 0)}`).join('\n');
      return `<g class="mc-month"><title>${esc(tip)}</title><rect x="${L + i * slot}" y="${T}" width="${slot}" height="${plotH}" class="mc-hit"/>${series.map((s, j) => { const v = Number(r[s.key] || 0); return v > 0 ? `<rect x="${(x0 + j * bw).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${(T + plotH - y(v)).toFixed(1)}" rx="2" style="fill:${s.tone}"/>` : ''; }).join('')}`
        + (i % every === 0 || i === rows.length - 1 ? `<text x="${L + i * slot + slot / 2}" y="${H - 8}" class="mc-ax" text-anchor="middle">${esc(short(r.month))}</text>` : '') + '</g>';
    }).join('');
    return `<svg class="mc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.label).join(', '))}" data-no-i18n dir="ltr">${grid}${bars}</svg>`;
  }

  function mount(el, opt) {
    if (!el) return;
    const all = fill(opt.months || []), key = opt.key || 'dl-mc';
    let range = get(key + ':range', opt.range ?? 12), off = new Set(get(key + ':off', [])), drawn = 0;
    // The inner width of the card (its padding left out); redrawn when the card gets noticeably wider or narrower.
    const measure = () => { const cs = getComputedStyle(el); return Math.max(300, Math.round((el.clientWidth || 760) - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0))); };
    const width = () => (drawn = measure());
    const draw = () => {
      const rows = range ? all.slice(-range) : all, on = opt.series.filter(s => !off.has(s.key));
      const sum = k => rows.reduce((n, r) => n + Number(r[k] || 0), 0);
      const empty = !rows.some(r => opt.series.some(s => Number(r[s.key] || 0)));
      el.innerHTML = `<div class="mc-head"><h3 class="sec-title">${esc(opt.title || 'Money by month')}</h3><div class="seg mc-range" role="group" aria-label="Range">${[[6, '6 months'], [12, '12 months'], [0, 'All']].map(([v, t]) => `<button type="button" class="${v === range ? 'on' : ''}" aria-pressed="${v === range}" data-mc-range="${v}">${t}</button>`).join('')}</div></div>
        <div class="mc-keys">${opt.series.map(s => `<button type="button" class="mc-key${off.has(s.key) ? ' off' : ''}" aria-pressed="${!off.has(s.key)}" data-mc-key="${s.key}" style="--tone:${s.tone}" title="${esc(s.note || '')}"><i></i><span>${esc(s.label)}</span><b data-no-i18n>${esc(opt.money(sum(s.key)))}</b></button>`).join('')}</div>
        ${empty ? '<p class="muted mc-empty">No money recorded in this range yet.</p>' : on.length ? svg(rows, on, opt.money, width()) : '<p class="muted mc-empty">Switch on at least one line above.</p>'}
        <details class="mc-table"><summary>Show as a table</summary><div class="table-wrap"><table class="tbl"><thead><tr><th>Month</th>${opt.series.map(s => `<th class="num">${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${[...rows].reverse().map(r => `<tr><td data-no-i18n>${esc(long(r.month))}</td>${opt.series.map(s => `<td class="num" data-no-i18n>${esc(opt.money(r[s.key] || 0))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    };
    el.onclick = e => {
      const r = e.target.closest('[data-mc-range]'), k = e.target.closest('[data-mc-key]');
      if (r) { range = Number(r.dataset.mcRange); set(key + ':range', range); draw(); }
      else if (k) { off.has(k.dataset.mcKey) ? off.delete(k.dataset.mcKey) : off.add(k.dataset.mcKey); set(key + ':off', [...off]); draw(); }
    };
    draw();
    el._mcResize?.disconnect();
    if (root.ResizeObserver) { el._mcResize = new ResizeObserver(() => { if (el.isConnected && Math.abs(measure() - drawn) > 40) draw(); }); el._mcResize.observe(el); }
  }
  root.DLMoneyChart = { mount, fill };
})(window);
