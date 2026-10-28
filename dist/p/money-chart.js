// Money by month: one bar chart shared by the admin Overview and the client portal (Erwin, 27 Oct 2026: "a detailed
// graph for all the money matters"). Grouped bars per month, a range switch (6 / 12 months / all), series the viewer can
// switch off, the totals for the shown range, and the same numbers as a table for screen readers and exact values.
// v2 (Erwin, 29 Oct 2026: "change the design… very slow to show the details… make it more modern"): the details used
// the browser's own tooltip (SVG <title>, about a second late and never on a phone tap). Now hovering, tapping or the
// arrow keys show every series of a month at once in a card of our own, the month is highlighted and the other months
// fade back. Colours come from --mc-* in ui.css (checked for colour-blind separation in light and dark).
//   DLMoneyChart.mount(el, { months: [{ month: 'YYYY-MM', <key>: number }], series: [{ key, label, tone, note? }],
//                            money: n => '$1.00', key: 'storage-key', range: 12, title: 'Money by month' })
// DLMoneyChart also shows a quick tip for any element with data-tip (used by the portal's profit bars).
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const lang = () => (root.DLi18n?.lang === 'he' ? 'he-IL' : 'en-GB');
  const t = s => root.DLi18n?.lang === 'he' && root.DLi18n.t ? root.DLi18n.t(s) : s;
  const label = (key, opts) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 15).toLocaleDateString(lang(), opts); };
  const short = key => label(key, { month: 'short', year: '2-digit' }), long = key => label(key, { month: 'long', year: 'numeric' });
  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const still = () => root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Every month between the first with data and this month, so empty months show as gaps instead of disappearing.
  function fill(rows) {
    const by = new Map(rows.map(r => [r.month, r])), now = new Date(), end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const first = rows.map(r => r.month).filter(m => m <= end).sort()[0] || end, out = [];
    for (let [y, m] = first.split('-').map(Number); ; m++) { if (m > 12) { m = 1; y++; } const k = `${y}-${String(m).padStart(2, '0')}`; out.push(by.get(k) || { month: k }); if (k >= end || out.length > 240) break; }
    return out;
  }
  // The top is 1, 2 or 5 times a power of ten, split in steps that stay round ($0, $10, $20... or $0, $5, $10...).
  const niceTop = v => { if (v <= 0) return [1, 5]; const p = 10 ** Math.floor(Math.log10(v)), f = v / p, m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; return [m * p, m === 2 ? 4 : 5]; };
  // Axis labels in USD, short: $0, $250, $1.5k, $12k.
  const compact = n => n >= 1000 ? '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : '$' + Math.round(n);
  // A column with a 4px rounded top and a square foot on the baseline.
  const column = (x, y, w, h) => { const r = Math.min(4, w / 2, h); return `M${x.toFixed(1)} ${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`; };

  // Drawn at the box's real width so the labels keep their size on a phone and in a half-width card.
  function svg(rows, series, W, enter) {
    const H = W < 520 ? 220 : 260, L = 46, R = 8, B = 28, T = 12, plotW = W - L - R, plotH = H - B - T;
    const [max, steps] = niceTop(Math.max(0, ...rows.flatMap(r => series.map(s => Number(r[s.key] || 0)))));
    const slot = plotW / Math.max(rows.length, 1), gap = 2, bw = Math.max(2, Math.min(24, (slot * 0.74 - gap * (series.length - 1)) / series.length));
    const groupW = bw * series.length + gap * (series.length - 1), y = v => T + plotH - (v / max) * plotH, every = Math.ceil(rows.length / Math.max(2, Math.floor(plotW / 58)));
    const grid = Array.from({ length: steps + 1 }, (_, i) => i / steps).map(f => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" class="${f ? 'mc-grid' : 'mc-base'}"/><text x="${L - 8}" y="${y(max * f) + 4}" class="mc-ax" text-anchor="end">${esc(compact(max * f))}</text>`).join('');
    const months = rows.map((r, i) => {
      const x0 = L + i * slot + (slot - groupW) / 2;
      const bars = series.map((s, j) => { const v = Number(r[s.key] || 0); return v > 0 ? `<path class="mc-bar" style="fill:${s.tone};--i:${i}" d="${column(x0 + j * (bw + gap), y(v), bw, T + plotH - y(v))}"/>` : ''; }).join('');
      return `<g class="mc-month" data-i="${i}"><rect class="mc-band" x="${(L + i * slot + 1).toFixed(1)}" y="${T}" width="${Math.max(0, slot - 2).toFixed(1)}" height="${plotH}" rx="8"/>${bars}`
        + (i % every === 0 || i === rows.length - 1 ? `<text x="${(L + i * slot + slot / 2).toFixed(1)}" y="${H - 9}" class="mc-ax mc-x" text-anchor="middle">${esc(short(r.month))}</text>` : '') + '</g>';
    }).join('');
    return { groupW, html: `<svg class="mc-svg${enter && !still() ? ' enter' : ''}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" data-no-i18n dir="ltr">${grid}${months}</svg>`, L, slot, W };
  }

  function mount(el, opt) {
    if (!el) return;
    el.classList.add('mc');
    const all = fill(opt.months || []), key = opt.key || 'dl-mc';
    let range = get(key + ':range', opt.range ?? 12), off = new Set(get(key + ':off', [])), drawn = 0, geo = null, rows = [], on = [], active = -1, pinned = false, enter = true;
    // The inner width of the card (its padding left out); redrawn when the card gets noticeably wider or narrower.
    const measure = () => { const cs = getComputedStyle(el); return Math.max(300, Math.round((el.clientWidth || 760) - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0))); };
    const tip = () => el.querySelector('.mc-tip'), plot = () => el.querySelector('.mc-plot');

    // The month card: every series that is switched on, the value first and the series name after it.
    function show(i, { keepPin = false } = {}) {
      const box = tip(), wrap = plot(); if (!box || !wrap || !geo || i < 0 || i >= rows.length) return hide();
      if (!keepPin) pinned = false;
      const r = rows[i], was = active >= 0; active = i;
      el.querySelectorAll('.mc-month').forEach(g => g.classList.toggle('on', Number(g.dataset.i) === i));
      wrap.classList.add('has-active');
      box.textContent = '';
      const h = document.createElement('div'); h.className = 'mc-tip-h'; h.textContent = long(r.month); box.append(h);
      for (const s of on) {
        const row = document.createElement('div'); row.className = 'mc-tip-row';
        const k = document.createElement('i'); k.style.background = s.tone;
        const v = document.createElement('b'); v.textContent = opt.money(Number(r[s.key] || 0));
        const n = document.createElement('span'); n.textContent = t(s.label);
        row.append(k, v, n); box.append(row);
      }
      // Beside the month's bars (not on top of them): to their right in the left half of the chart, to their left in the
      // right half; kept inside the box.
      const scale = wrap.clientWidth / geo.W, mid = (geo.L + (i + 0.5) * geo.slot) * scale, half = Math.min(geo.slot / 2, geo.groupW / 2 + 10) * scale;
      box.classList.toggle('still', !was); box.hidden = false;
      const bw = box.offsetWidth, room = wrap.clientWidth;
      let x = mid < room / 2 ? mid + half + 6 : mid - half - 6 - bw;
      if (x < 0 || x + bw > room) x = mid - bw / 2;
      x = Math.max(0, Math.min(room - bw, x));
      box.style.transform = `translate3d(${Math.round(x)}px,0,0)`;
      requestAnimationFrame(() => { box.classList.add('show'); box.classList.remove('still'); });
      wrap.setAttribute('aria-label', `${long(r.month)}: ${on.map(s => `${t(s.label)} ${opt.money(Number(r[s.key] || 0))}`).join(', ')}`);
    }
    function hide() {
      const box = tip(); active = -1; pinned = false;
      el.querySelectorAll('.mc-month.on').forEach(g => g.classList.remove('on')); plot()?.classList.remove('has-active');
      if (box) { box.classList.remove('show'); box.hidden = true; }
    }
    const monthAt = e => { const s = el.querySelector('.mc-svg'); if (!s || !geo) return -1; const b = s.getBoundingClientRect(), x = (e.clientX - b.left) * geo.W / b.width; return Math.floor((x - geo.L) / geo.slot); };

    const draw = () => {
      rows = range ? all.slice(-range) : all; on = opt.series.filter(s => !off.has(s.key));
      const sum = k => rows.reduce((n, r) => n + Number(r[k] || 0), 0);
      const empty = !rows.some(r => opt.series.some(s => Number(r[s.key] || 0)));
      const chart = !empty && on.length ? svg(rows, on, drawn = measure(), enter) : null; geo = chart; enter = false; active = -1; pinned = false;
      el.innerHTML = `<div class="mc-head"><h3 class="sec-title">${esc(opt.title || 'Money by month')}</h3><div class="seg mc-range" role="group" aria-label="Range">${[[6, '6 months'], [12, '12 months'], [0, 'All']].map(([v, l]) => `<button type="button" class="${v === range ? 'on' : ''}" aria-pressed="${v === range}" data-mc-range="${v}">${l}</button>`).join('')}</div></div>
        <div class="mc-keys">${opt.series.map(s => `<button type="button" class="mc-key${off.has(s.key) ? ' off' : ''}" aria-pressed="${!off.has(s.key)}" data-mc-key="${s.key}" style="--tone:${s.tone}" title="${esc(s.note || '')}"><span class="mc-key-top"><i></i><span>${esc(s.label)}</span></span><b data-no-i18n>${esc(opt.money(sum(s.key)))}</b></button>`).join('')}</div>
        ${empty ? '<p class="muted mc-empty">No money recorded in this range yet.</p>' : !on.length ? '<p class="muted mc-empty">Switch on at least one line above.</p>'
          : `<div class="mc-plot" tabindex="0" role="group" aria-roledescription="chart" aria-label="${esc(t('Use the arrow keys to see each month'))}">${chart.html}<div class="mc-tip" role="status" aria-live="polite" data-no-i18n hidden></div></div><p class="mc-hint">Point at a month or tap it to see its numbers.</p>`}
        <details class="mc-table"><summary>Show as a table</summary><div class="table-wrap"><table class="tbl"><thead><tr><th>Month</th>${opt.series.map(s => `<th class="num">${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${[...rows].reverse().map(r => `<tr><td data-no-i18n>${esc(long(r.month))}</td>${opt.series.map(s => `<td class="num" data-no-i18n>${esc(opt.money(r[s.key] || 0))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
      const wrap = plot(); if (!wrap) return;
      // Mouse: follows the pointer. Touch / pen: a tap shows the month and keeps it until another tap.
      wrap.onpointermove = e => { if (e.pointerType === 'mouse' && !pinned) { const i = monthAt(e); i !== active && (i >= 0 && i < rows.length ? show(i) : hide()); } };
      wrap.onpointerleave = e => { if (e.pointerType === 'mouse' && !pinned) hide(); };
      wrap.onclick = e => { const i = monthAt(e); if (i < 0 || i >= rows.length) return hide(); if (pinned && i === active) return hide(); show(i); pinned = true; };
      wrap.onkeydown = e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const d = (e.key === 'ArrowRight') ? 1 : -1; show(Math.max(0, Math.min(rows.length - 1, (active < 0 ? rows.length - 1 : active + d)))); pinned = true; }
        else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); show(e.key === 'Home' ? 0 : rows.length - 1); pinned = true; }
        else if (e.key === 'Escape') hide();
      };
      wrap.onfocus = () => { if (active < 0 && wrap.matches(':focus-visible')) { show(rows.length - 1); pinned = true; } };
      wrap.onblur = () => hide();
    };
    el.onclick = e => {
      const r = e.target.closest('[data-mc-range]'), k = e.target.closest('[data-mc-key]');
      if (r) { range = Number(r.dataset.mcRange); set(key + ':range', range); enter = true; draw(); }
      else if (k) { off.has(k.dataset.mcKey) ? off.delete(k.dataset.mcKey) : off.add(k.dataset.mcKey); set(key + ':off', [...off]); draw(); }
    };
    draw();
    el._mcResize?.disconnect();
    if (root.ResizeObserver) { el._mcResize = new ResizeObserver(() => { if (el.isConnected && Math.abs(measure() - drawn) > 40) draw(); }); el._mcResize.observe(el); }
  }

  // Quick tips for data-tip (e.g. the portal's profit bars): shown at once on hover, focus or tap, instead of the
  // browser's slow title tooltip. One tip for the page, positioned above the element.
  let quick = null;
  function quickTip(target) {
    if (!quick) { quick = document.createElement('div'); quick.className = 'mc-quick'; quick.setAttribute('role', 'tooltip'); quick.hidden = true; document.body.append(quick); }
    if (!target) { quick.hidden = true; quick.classList.remove('show'); return; }
    quick.textContent = target.dataset.tip; quick.hidden = false;
    const b = target.getBoundingClientRect(), w = quick.offsetWidth, h = quick.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2)), y = Math.max(8, b.top - h - 8);
    quick.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`; requestAnimationFrame(() => quick.classList.add('show'));
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') { const t = e.target.closest?.('[data-tip]'); quickTip(t || null); } });
    document.addEventListener('focusin', e => { const t = e.target.closest?.('[data-tip]'); quickTip(t || null); });
    document.addEventListener('click', e => { const t = e.target.closest?.('[data-tip]'); quickTip(t || null); });
    document.addEventListener('scroll', () => quickTip(null), true);
  }
  root.DLMoneyChart = { mount, fill };
})(window);
