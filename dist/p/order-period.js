// Orders by week or month (Erwin, 19 Nov 2026: "sort the orders by month and week across all portals").
// One picker for the client Orders, admin Client orders and supplier Orders lists: All time, This week, Last week,
// This month, Last month, one past month, or a custom from–to range. An order belongs to the day it was sent to us
// (createdAt, in the viewer's own time zone); weeks start on Monday. The lists' filter counts follow the picked period.
//   window.DLPeriod.match(createdAtSeconds, state)   state = { k: 'all' | 'this_week' | … | 'm:2026-11' | 'custom', from, to }
//   window.DLPeriod.html(state, createdAtSecondsList, { t, locale })   the <select> (+ two dates for a custom range)
//   window.DLPeriod.read(state, changedElement)   true when the change was the picker's (state updated)
(function (root) {
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const monday = d => { const x = day(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // [start, end) as Dates; null = open end.
  function range(p, now = new Date()) {
    const k = p?.k || 'all';
    if (k === 'this_week') { const a = monday(now); return [a, addDays(a, 7)]; }
    if (k === 'last_week') { const a = addDays(monday(now), -7); return [a, addDays(a, 7)]; }
    if (k === 'this_month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
    if (k === 'last_month') return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
    if (k.startsWith('m:')) { const [y, m] = k.slice(2).split('-').map(Number); return [new Date(y, m - 1, 1), new Date(y, m, 1)]; }
    if (k === 'custom') { const a = parse(p.from), b = parse(p.to); return [a, b ? addDays(b, 1) : null]; }
    return [null, null];
  }
  function match(sec, p) {
    if (!p || !p.k || p.k === 'all') return true;
    const [a, b] = range(p), ms = Number(sec) * 1000;
    if (!Number.isFinite(ms) || !ms) return false;
    return (!a || ms >= a.getTime()) && (!b || ms < b.getTime());
  }
  const LABEL = { all: 'All time', this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month', custom: 'Custom range' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function html(p, secs = [], { t = s => s, locale = 'en-GB' } = {}) {
    const k = p?.k || 'all', now = new Date();
    const short = d => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    const span = key => { const [a, b] = range({ k: key }, now); return `${short(a)} – ${short(addDays(b, -1))}`; };
    const thisM = monthKey(now), lastM = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const months = [...new Set(secs.filter(Boolean).map(s => monthKey(new Date(Number(s) * 1000))))].filter(m => m !== thisM && m !== lastM).sort().reverse();
    const mName = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 15).toLocaleDateString(locale, { month: 'long', year: 'numeric' }); };
    const opt = (v, text) => `<option value="${esc(v)}"${v === k ? ' selected' : ''}>${esc(text)}</option>`;
    const sel = `<select data-period-pick aria-label="${esc(t('Period'))}" data-no-i18n>${opt('all', t(LABEL.all))}${opt('this_week', `${t(LABEL.this_week)} · ${span('this_week')}`)}${opt('last_week', `${t(LABEL.last_week)} · ${span('last_week')}`)}${opt('this_month', `${t(LABEL.this_month)} · ${mName(thisM)}`)}${opt('last_month', `${t(LABEL.last_month)} · ${mName(lastM)}`)}${months.map(m => opt('m:' + m, mName(m))).join('')}${opt('custom', t(LABEL.custom))}</select>`;
    const dates = k === 'custom' ? `<label class="period-date"><span>${esc(t('From'))}</span><input type="date" data-period-from value="${esc(p.from || '')}"${p.to ? ` max="${esc(p.to)}"` : ''}></label><label class="period-date"><span>${esc(t('To'))}</span><input type="date" data-period-to value="${esc(p.to || '')}"${p.from ? ` min="${esc(p.from)}"` : ''}></label>` : '';
    return `<span class="period-pick${k !== 'all' ? ' on' : ''}" data-no-i18n>${sel}${dates}</span>`;
  }
  function read(p, el) {
    if (!el?.matches) return false;
    if (el.matches('[data-period-pick]')) {
      p.k = el.value;
      if (p.k === 'custom' && !p.from && !p.to) { const now = new Date(); p.from = ymd(new Date(now.getFullYear(), now.getMonth(), 1)); p.to = ymd(now); }
      return true;
    }
    if (el.matches('[data-period-from]')) { p.from = el.value; return true; }
    if (el.matches('[data-period-to]')) { p.to = el.value; return true; }
    return false;
  }
  const fresh = () => ({ k: 'all', from: '', to: '' });
  root.DLPeriod = { match, html, read, range, fresh };
})(typeof window !== 'undefined' ? window : globalThis);
