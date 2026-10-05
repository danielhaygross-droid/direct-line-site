/* Notification dropdown (under the bell) + pop-up cards.
   Shared by the store dashboard and the client portal. Works in English (LTR) and Hebrew (RTL),
   light and dark themes (uses the page's colour variables). */
(function () {
  if (window.DLNotify) return;
  const he = () => document.documentElement.lang === 'he';
  const L = (en, h) => (he() ? h : en);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function timeAgo(ms) {
    if (!ms) return '';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return L('just now', 'הרגע');
    if (s < 3600) { const m = Math.floor(s / 60); return L(`${m} min ago`, `לפני ${m} דק׳`); }
    if (s < 86400) { const h = Math.floor(s / 3600); return L(`${h} h ago`, `לפני ${h} שע׳`); }
    const d = new Date(ms), y = new Date(); y.setDate(y.getDate() - 1);
    const time = d.toLocaleTimeString(he() ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === y.toDateString()) return L('Yesterday', 'אתמול') + ' ' + time;
    return d.toLocaleDateString(he() ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' }) + ', ' + time;
  }

  const ICONS = {
    order: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    status: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5v11"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.bell}</svg>`;

  // ---------- styles ----------
  const css = `
  .dln-panel,.dln-pop{--n-bg:var(--surface,var(--paper,#fffdf9));--n-bg2:var(--surface-2,var(--cream,#f6f2ea));--n-line:var(--line,#e4dccd);--n-text:var(--text,#17251f);--n-muted:var(--muted,#6b6f68);--n-dim:var(--dim,#969a96);--n-acc:var(--gold,#b98a3e);
    --n-mint:var(--mint,var(--ok,#2f8f6d));--n-red:var(--red,var(--bad,#b4433a));--n-blue:var(--blue,var(--info,#2f6f9f));--n-orange:var(--orange,var(--warn,#b7791f));
    font-family:Heebo,Arial,sans-serif;color:var(--n-text);text-align:start;line-height:1.4}
  .dln-panel{position:fixed;z-index:1200;width:400px;max-width:calc(100vw - 16px);max-height:min(620px,calc(100vh - 90px));display:flex;flex-direction:column;background:var(--n-bg);border:1px solid var(--n-line);border-radius:16px;box-shadow:0 24px 70px rgba(10,20,16,.28);overflow:hidden;opacity:0;transform:translateY(-6px);transition:opacity .16s,transform .16s;pointer-events:none}
  .dln-panel.open{opacity:1;transform:none;pointer-events:auto}
  .dln-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px 10px}
  .dln-head h3{margin:0;font-size:18px;font-weight:600}
  .dln-link{border:0;background:none;color:var(--n-acc);font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:4px 2px}
  .dln-link:disabled{color:var(--n-dim);cursor:default}
  .dln-tabs{display:flex;gap:6px;padding:0 18px 10px;border-bottom:1px solid var(--n-line)}
  .dln-tabs button{border:1px solid var(--n-line);background:transparent;color:var(--n-muted);border-radius:999px;padding:4px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
  .dln-tabs button.on{background:var(--n-text);border-color:var(--n-text);color:var(--n-bg)}
  .dln-body{overflow:auto;padding:4px 0 8px}
  .dln-sec{padding:12px 18px 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--n-dim)}
  .dln-item{position:relative;display:grid;grid-template-columns:38px 1fr 10px;gap:12px;align-items:start;width:100%;padding:11px 18px;border:0;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}
  .dln-item:hover{background:color-mix(in srgb,var(--n-text) 5%,transparent)}
  .dln-item.unread{background:color-mix(in srgb,var(--n-acc) 10%,transparent)}
  .dln-item.unread:hover{background:color-mix(in srgb,var(--n-acc) 16%,transparent)}
  .dln-ic{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:color-mix(in srgb,var(--tone,var(--n-acc)) 15%,transparent);color:var(--tone,var(--n-acc))}
  .dln-ic svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .dln-tx{display:grid;gap:2px;min-width:0}
  .dln-tx b{font-size:14px;font-weight:500}
  .dln-item.unread .dln-tx b{font-weight:700}
  .dln-tx span{font-size:13px;color:var(--n-muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .dln-tx time{font-size:12px;color:var(--n-dim)}
  .dln-item.unread .dln-tx time{color:var(--n-acc);font-weight:600}
  .dln-dot{width:9px;height:9px;margin-top:14px;border-radius:50%;background:var(--n-acc)}
  .dln-item:not(.unread) .dln-dot{visibility:hidden}
  .dln-empty{display:grid;justify-items:center;gap:8px;padding:34px 20px;color:var(--n-muted);font-size:14px;text-align:center}
  .dln-empty .dln-ic{width:46px;height:46px}
  .dln-foot{padding:10px 18px;border-top:1px solid var(--n-line);font-size:12px;color:var(--n-dim)}
  .dln-ic.t-mint,.dln-pop.t-mint{--tone:var(--mint,var(--ok,#2f8f6d))}.dln-ic.t-red,.dln-pop.t-red{--tone:var(--red,var(--bad,#b4433a))}.dln-ic.t-blue,.dln-pop.t-blue{--tone:var(--blue,var(--info,#2f6f9f))}.dln-ic.t-orange,.dln-pop.t-orange{--tone:var(--orange,var(--warn,#b7791f))}.dln-ic.t-gold,.dln-pop.t-gold{--tone:var(--gold,#b98a3e)}
  .dln-ic{display:grid;place-items:center;flex:none;border-radius:50%;background:color-mix(in srgb,var(--tone,var(--gold,#b98a3e)) 15%,transparent);color:var(--tone,var(--gold,#b98a3e))}.dln-ic svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .dln-pops{position:fixed;z-index:1300;top:84px;inset-inline-end:20px;display:grid;gap:10px;width:360px;max-width:calc(100vw - 24px);pointer-events:none}
  .dln-pop{pointer-events:auto;display:grid;grid-template-columns:38px 1fr 24px;gap:12px;align-items:start;padding:14px;padding-inline-start:16px;background:var(--n-bg);border:1px solid var(--n-line);border-inline-start:4px solid var(--tone,var(--n-acc));border-radius:14px;box-shadow:0 18px 50px rgba(10,20,16,.25);cursor:pointer;animation:dlnIn .25s cubic-bezier(.22,1,.36,1)}
  .dln-pop.out{animation:dlnOut .2s forwards}
  .dln-pop .dln-tx b{font-weight:700}
  .dln-pop .dln-tx em{font-style:normal;font-size:12px;font-weight:600;color:var(--n-acc)}
  .dln-x{width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--n-dim);font-size:16px;line-height:1;cursor:pointer}
  .dln-x:hover{background:color-mix(in srgb,var(--n-text) 8%,transparent);color:var(--n-text)}
  @keyframes dlnIn{from{opacity:0;transform:translateY(-10px) scale(.98)}}
  @keyframes dlnOut{to{opacity:0;transform:translateY(-6px)}}
  @media(max-width:560px){.dln-panel{left:8px!important;right:8px!important;width:auto}.dln-pops{top:72px;inset-inline:12px;width:auto}}
  @media(prefers-reduced-motion:reduce){.dln-panel,.dln-pop{transition:none;animation:none}}`;
  const style = document.createElement('style'); style.id = 'dln-style'; style.textContent = css; document.head.appendChild(style);

  const itemHTML = (n, tag = 'button') => `<${tag} type="button" class="dln-item${n.unread ? ' unread' : ''}" data-dln-id="${esc(n.id)}">
    <span class="dln-ic t-${n.tone || 'gold'}">${icon(n.icon)}</span>
    <span class="dln-tx"><b>${esc(n.title)}</b>${n.text ? `<span>${esc(n.text)}</span>` : ''}<time${n.time ? ` datetime="${new Date(n.time).toISOString()}" title="${esc(new Date(n.time).toLocaleString())}"` : ''}>${esc(n.time ? timeAgo(n.time) : (n.timeText || ''))}</time></span>
    <i class="dln-dot" aria-label="${n.unread ? L('Unread', 'לא נקרא') : ''}"></i></${tag}>`;

  // ---------- dropdown ----------
  // opts: anchor (the bell button), onItem(item), onMarkAll(), onOpen(), onClose(), footer (text)
  function panel(opts) {
    const el = document.createElement('div');
    el.className = 'dln-panel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', L('Notifications', 'התראות'));
    el.dir = document.documentElement.dir || 'ltr';
    document.body.appendChild(el);
    let items = [], filter = 'all', isOpen = false;
    const render = () => {
      const unread = items.filter(n => n.unread);
      const shown = filter === 'unread' ? unread : items;
      const fresh = shown.filter(n => n.unread), old = shown.filter(n => !n.unread);
      el.innerHTML = `<div class="dln-head"><h3>${L('Notifications', 'התראות')}</h3><button type="button" class="dln-link" data-dln-all${unread.length ? '' : ' disabled'}>${L('Mark all as read', 'סמן הכל כנקרא')}</button></div>
        <div class="dln-tabs"><button type="button" data-dln-f="all" class="${filter === 'all' ? 'on' : ''}">${L('All', 'הכל')}</button><button type="button" data-dln-f="unread" class="${filter === 'unread' ? 'on' : ''}">${L('Unread', 'לא נקראו')}${unread.length ? ` (${unread.length})` : ''}</button></div>
        <div class="dln-body">${shown.length ? `${fresh.length ? `<div class="dln-sec">${L('New', 'חדשות')}</div>${fresh.map(n => itemHTML(n)).join('')}` : ''}${old.length ? `<div class="dln-sec">${L('Earlier', 'קודמות')}</div>${old.map(n => itemHTML(n)).join('')}` : ''}`
          : `<div class="dln-empty"><span class="dln-ic t-mint">${icon('check')}</span>${filter === 'unread' ? L('You’re all caught up.', 'אין התראות חדשות.') : L('No notifications yet.', 'אין עדיין התראות.')}</div>`}</div>
        ${opts.footer ? `<div class="dln-foot">${esc(typeof opts.footer === 'function' ? opts.footer() : opts.footer)}</div>` : ''}`;
    };
    const place = () => {
      const r = opts.anchor.getBoundingClientRect(), w = Math.min(400, innerWidth - 16);
      el.style.top = Math.round(r.bottom + 10) + 'px';
      const rtl = (document.documentElement.dir || 'ltr') === 'rtl';
      let left = rtl ? r.left : r.right - w;
      left = Math.max(8, Math.min(left, innerWidth - w - 8));
      el.style.left = Math.round(left) + 'px'; el.style.right = 'auto';
    };
    const outside = e => { if (isOpen && !el.contains(e.target) && !opts.anchor.contains(e.target)) api.close(); };
    const key = e => { if (e.key === 'Escape' && isOpen) { api.close(); opts.anchor.focus(); } };
    el.addEventListener('click', e => {
      const f = e.target.closest('[data-dln-f]'); if (f) { filter = f.dataset.dlnF; render(); return; }
      if (e.target.closest('[data-dln-all]')) { opts.onMarkAll?.(); return; }
      const it = e.target.closest('[data-dln-id]'); if (!it) return;
      const n = items.find(x => String(x.id) === it.dataset.dlnId);
      api.close(); n && opts.onItem?.(n);
    });
    const api = {
      el,
      set(list) { items = list.slice().sort((a, b) => (b.time || 0) - (a.time || 0)); if (isOpen) render(); },
      open() { if (isOpen) return; isOpen = true; clearPopups(); render(); place(); requestAnimationFrame(() => el.classList.add('open')); opts.anchor.setAttribute('aria-expanded', 'true'); document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key); addEventListener('resize', place); opts.onOpen?.(); },
      close() { if (!isOpen) return; isOpen = false; el.classList.remove('open'); opts.anchor.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key); removeEventListener('resize', place); opts.onClose?.(); },
      toggle() { isOpen ? api.close() : api.open(); },
      get isOpen() { return isOpen; },
      refresh() { if (isOpen) render(); },
    };
    opts.anchor.setAttribute('aria-haspopup', 'dialog'); opts.anchor.setAttribute('aria-expanded', 'false');
    setInterval(() => { if (isOpen) el.querySelectorAll('time[datetime]').forEach(t => { t.textContent = timeAgo(new Date(t.getAttribute('datetime')).getTime()); }); }, 30000);
    return api;
  }

  // ---------- pop-up cards ----------
  let stack;
  function clearPopups() { if (stack) stack.innerHTML = ''; }
  function popup(n, { duration = 9000, onClick } = {}) {
    if (!stack) { stack = document.createElement('div'); stack.className = 'dln-pops'; stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack); }
    stack.dir = document.documentElement.dir || 'ltr';
    const card = document.createElement('div');
    card.className = `dln-pop t-${n.tone || 'gold'}`; card.setAttribute('role', 'status');
    card.innerHTML = `<span class="dln-ic t-${n.tone || 'gold'}">${icon(n.icon)}</span><span class="dln-tx"><b>${esc(n.title)}</b>${n.text ? `<span>${esc(n.text)}</span>` : ''}${onClick ? `<em>${esc(n.action || L('Open', 'פתח'))} →</em>` : `<time>${esc(n.time ? timeAgo(n.time) : '')}</time>`}</span><button type="button" class="dln-x" aria-label="${L('Close', 'סגור')}">×</button>`;
    const remove = () => { if (!card.isConnected) return; card.classList.add('out'); setTimeout(() => card.remove(), 220); };
    let timer = setTimeout(remove, duration);
    card.addEventListener('mouseenter', () => clearTimeout(timer));
    card.addEventListener('mouseleave', () => { timer = setTimeout(remove, 3000); });
    card.addEventListener('click', e => { if (e.target.closest('.dln-x')) { remove(); return; } remove(); onClick?.(); });
    stack.prepend(card);
    while (stack.children.length > 3) stack.lastElementChild.remove();
    return remove;
  }

  window.DLNotify = { panel, popup, clearPopups, timeAgo, icon };
})();
