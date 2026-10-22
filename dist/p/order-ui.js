/* Shared order UI: status pill, status tracker, side drawer and the order conversation.
   Used by the client portal and the admin Clients & orders view. Needs common.js (window.DL). */
(function () {
  const { api, esc } = window.DL;
  const STEPS = ['pending', 'processing', 'shipped', 'delivered'];
  const LABEL = { pending: 'Pending', processing: 'In Progress', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', cancellation_requested: 'Cancellation Requested' };
  const ICON = {
    pending: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
    processing: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    shipped: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    delivered: '<path d="M5 12l5 5 9-10"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const pill = s => `<span class="st st-${esc(s)}">${esc(LABEL[s] || s)}</span>`;
  // Possibly delayed: set by the supplier in the sheet (Delayed? + Delay reason). Only shown until the parcel ships.
  const isLate = o => !!o?.delayedAt && ['pending', 'processing', 'cancellation_requested'].includes(o.status);
  const delayTag = o => isLate(o) ? `<span class="delay-tag" title="${esc(o.delayReason || 'Possibly delayed')}">Possibly delayed</span>` : '';
  const delayNote = o => isLate(o) ? `<div class="delay-note" role="status"><b>Possibly delayed</b>${o.delayReason ? `<span data-no-i18n>${esc(o.delayReason)}</span>` : ''}<small><span>Marked</span> <time data-no-i18n>${esc(when(o.delayedAt))}</time></small></div>` : '';
  // A tracking number is given before the parcel leaves: it must not go on Etsy until the order is Shipped.
  const notShippedYet = o => !!o?.trackingNumber && ['pending', 'processing', 'cancellation_requested'].includes(o.status);
  const when = sec => window.DL.displayTime(sec);
  const day = when;
  function activity(events=[]) {
    const labels={delayed:'Marked possibly delayed',delay_cleared:'No longer delayed',created:'Order created',edited:'Order edited',status:'Status changed',tracking:'Tracking number changed',tracking_update:'Tracking update received',photo:'Photo changed',claim:'Claim updated',billed:'Order billed',archived:'Order archived',restored:'Order restored'};
    return `<section class="card card-pad"><h3 class="sec-title">Order activity</h3><p class="muted" data-no-i18n>${esc(window.DL.timeZoneNote())}</p>${events.length ? `<ol class="order-activity">${[...events].reverse().map(e=>`<li><b>${esc(e.kind==='edited'&&e.detail==='customer' ? 'Customer details changed' : labels[e.kind]||e.kind)}</b><span><span>${e.actor==='admin'?'Direct Line':'Client'}</span>${e.detail && e.kind!=='edited' ? ' · '+(e.kind==='status' ? `<span>${esc(LABEL[e.detail]||e.detail)}</span>` : `<span data-no-i18n>${esc(e.detail)}</span>`) : ''}</span><time datetime="${new Date(e.createdAt*1000).toISOString()}">${esc(when(e.createdAt))}</time></li>`).join('')}</ol>` : '<p class="muted">No activity recorded yet.</p>'}</section>`;
  }
  function syncConversation(order,data) {
    if(!order)return;
    const messages=data.messages||[],last=messages.at(-1);
    order.messages=messages.length;order.unreadMessages=0;
    if(last){order.lastMessageAt=last.createdAt;order.lastMessage={author:last.author,body:last.body,createdAt:last.createdAt};}
  }

  // Pending → Processing → Shipped → Delivered, with the date each step happened (when we know it).
  function tracker(order, events = []) {
    if (order.status === 'cancellation_requested') return `<div class="track-cancel"><span>Cancellation Requested</span></div>`;
    if (order.status === 'cancelled') {
      const ev = [...events].reverse().find(e => e.kind === 'status' && e.detail === 'cancelled');
      return `<div class="track-cancel">${svg(ICON.x).replace('<svg', '<svg style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2"')}<span>Cancelled${ev ? ' · ' + esc(when(ev.createdAt)) : ''}${ev ? `<br><small style="font-weight:500;opacity:.8">by ${ev.actor === 'admin' ? 'Direct Line' : 'the client'}</small>` : ''}</span></div>`;
    }
    const cur = STEPS.indexOf(order.status);
    const at = s => {
      if (s === 'pending') return (events.find(e => e.kind === 'created') || {}).createdAt || order.createdAt;
      const ev = [...events].reverse().find(e => e.kind === 'status' && e.detail === s);
      return ev ? ev.createdAt : (s === order.status ? order.updatedAt : null);
    };
    return `<div class="track" role="list" aria-label="Order progress">${STEPS.map((s, i) => {
      const cls = i < cur ? 'done' : i === cur ? (s === 'delivered' ? 'done' : 'now') : '';
      const t = i <= cur ? at(s) : null;
      return `<div class="track-step ${cls}" role="listitem"><i>${svg(i < cur || (i === cur && s === 'delivered') ? ICON.check : ICON[s])}</i><b>${LABEL[s]}</b><small>${t ? esc(day(t)) : '&nbsp;'}</small></div>`;
    }).join('')}</div>`;
  }

  // ----- side drawer (one at a time) -----
  let drawer;
  function getDrawer() {
    if (drawer) return drawer;
    const scrim = document.createElement('div'); scrim.className = 'drawer-scrim';
    const el = document.createElement('aside'); el.className = 'drawer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="drawer-resizer" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize panel" title="Drag to resize. Double-click to reset."></div><div class="drawer-head"><div><div data-d-title></div></div><button type="button" class="icon-btn" data-d-close aria-label="Close">' + svg(ICON.x) + '</button></div><div class="drawer-body" data-d-body></div><div class="drawer-foot" data-d-foot></div>';
    document.body.append(scrim, el);
    const resizer=el.querySelector('.drawer-resizer'),widthKey='dl_drawer_width';
    let preferredWidth=760;
    try{const saved=Number(localStorage.getItem(widthKey));if(Number.isFinite(saved)&&saved>=560)preferredWidth=saved;}catch(e){}
    const limits=()=>({min:Math.min(560,innerWidth),max:Math.min(1100,Math.max(0,innerWidth-24))});
    const setWidth=(width,persist=false)=>{
      const {min,max}=limits();const next=innerWidth>=900?Math.max(min,Math.min(max,width)):innerWidth;
      el.style.setProperty('--dl-drawer-width',next+'px');
      resizer.setAttribute('aria-valuemin',String(min));resizer.setAttribute('aria-valuemax',String(max));resizer.setAttribute('aria-valuenow',String(Math.round(next)));
      if(persist&&innerWidth>=900){preferredWidth=next;try{localStorage.setItem(widthKey,String(next));}catch(e){}}
    };
    const notifyParent=open=>{if(window.parent!==window)parent.postMessage({type:'dl-drawer-state',open},location.origin);};
    resizer.addEventListener('pointerdown',e=>{
      if(e.button!==0||innerWidth<900)return;e.preventDefault();
      const start=e.clientX,width=el.getBoundingClientRect().width,rtl=getComputedStyle(el).direction==='rtl';
      resizer.setPointerCapture(e.pointerId);el.classList.add('resizing');
      const move=event=>setWidth(width+(rtl?event.clientX-start:start-event.clientX));
      const finish=event=>{resizer.removeEventListener('pointermove',move);resizer.removeEventListener('pointerup',finish);resizer.removeEventListener('pointercancel',finish);el.classList.remove('resizing');setWidth(el.getBoundingClientRect().width,true);if(resizer.hasPointerCapture(event.pointerId))resizer.releasePointerCapture(event.pointerId);};
      resizer.addEventListener('pointermove',move);resizer.addEventListener('pointerup',finish);resizer.addEventListener('pointercancel',finish);
    });
    resizer.addEventListener('dblclick',()=>setWidth(760,true));
    resizer.addEventListener('keydown',e=>{
      const rtl=getComputedStyle(el).direction==='rtl';let width=el.getBoundingClientRect().width;
      if(e.key==='ArrowLeft')width+=rtl?-32:32;else if(e.key==='ArrowRight')width+=rtl?32:-32;else if(e.key==='Home')width=760;else if(e.key==='End')width=limits().max;else return;
      e.preventDefault();setWidth(width,true);
    });
    addEventListener('resize',()=>setWidth(preferredWidth));setWidth(preferredWidth);

    // Inside the store dashboard this page is a tall iframe: keep the panel in the part the user can see.
    const fit = () => {
      const area = window.DL.visibleArea?.();
      if (!area) return;
      el.style.top = area.top + 'px'; el.style.bottom = 'auto'; el.style.height = area.height + 'px';
    };
    try { if (window.frameElement) { window.parent.addEventListener('scroll', () => d.isOpen && fit(), { passive: true }); window.parent.addEventListener('resize', () => d.isOpen && fit()); } } catch (e) { /* not same-origin */ }
    const close = () => d.close();
    scrim.addEventListener('click', close);
    el.querySelector('[data-d-close]').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && d.isOpen && !document.querySelector('.dln-panel.open')) close(); });
    const d = drawer = {
      el, isOpen: false, onClose: null, key: null,
      head: el.querySelector('[data-d-title]'), body: el.querySelector('[data-d-body]'), foot: el.querySelector('[data-d-foot]'),
      open(key) {
        d.key = key; d.isOpen = true;setWidth(preferredWidth); scrim.classList.add('open'); el.classList.add('open');notifyParent(true);document.body.classList.add('dl-drawer-open');
        document.documentElement.style.overflow = 'hidden';
        d.body.scrollTop = 0;
        // Inside the dashboard, make the frame at least a screen tall so the panel has room.
        try { if (window.frameElement) document.body.style.minHeight = (window.parent.innerHeight + 20) + 'px'; } catch (e) { /* ignore */ }
        fit(); setTimeout(fit, 120);
        setTimeout(() => el.querySelector('[data-d-close]').focus({ preventScroll: true }), 50);
      },
      close() {
        if (!d.isOpen) return;
        d.isOpen = false; d.key = null; scrim.classList.remove('open'); el.classList.remove('open');notifyParent(false);document.body.classList.remove('dl-drawer-open');
        document.documentElement.style.overflow = '';
        document.body.style.minHeight = '';
        const cb = d.onClose; d.onClose = null; cb && cb();
      },
    };
    return d;
  }

  // ----- conversation about one order -----
  // role: 'client' | 'admin'. onLoad(data) gets { messages, events } each time it loads.
  function chat(root, { orderId, role, onLoad, onSent, readOnly=false }) {
    const quick = role === 'client'
      ? ['Any update on this order?', 'Can you please check this order?', 'My customer is asking where the parcel is.']
      : ['We’re checking this now.', 'Shipped, the tracking is updated.', 'Delayed at the supplier, we’ll update you soon.'];
    root.innerHTML = `<div class="chat" aria-live="polite"><div class="chat-empty">Loading messages…</div></div>
      <div class="quick">${quick.map(q => `<button type="button" data-q>${esc(q)}</button>`).join('')}</div>
      <form class="composer"><textarea name="body" rows="1" maxlength="2000" placeholder="${role === 'client' ? 'Write a message to Direct Line…' : 'Write a reply to the client…'}" aria-label="Message"></textarea><button class="btn btn-primary" type="submit">Send</button></form>
      <p class="form-msg" data-chat-msg></p>`;
    const list = root.querySelector('.chat'), form = root.querySelector('form'), ta = form.elements.namedItem('body'), msg = root.querySelector('[data-chat-msg]');
    if(readOnly){ta.readOnly=true;form.querySelector('button').disabled=true;root.querySelectorAll('[data-q]').forEach(b=>b.disabled=true);msg.textContent='Preview is read only. Sign in as the client to send messages.';}
    let count = -1;
    const render = msgs => {
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      list.innerHTML = msgs.length ? msgs.map(m => `<div class="bubble ${m.author === role ? 'mine' : 'theirs'}"><span>${esc(m.body)}</span><small>${m.author === 'admin' ? 'Direct Line' : role === 'admin' ? 'Client' : 'You'} · ${esc(when(m.createdAt))}</small></div>`).join('')
        : `<div class="chat-empty">${role === 'client' ? 'No messages yet. Ask us anything about this order and we’ll reply here.' : 'No messages on this order yet.'}</div>`;
      if (atBottom || msgs.length !== count) list.scrollTop = list.scrollHeight;
      count = msgs.length;
    };
    let alive = true, sending = false, generation = 0;
    const load = async () => {
      if(sending)return;const version=generation;
      try { const data = await api(`/orders/${orderId}/messages`); if (!alive || version!==generation) return; render(data.messages); onLoad && onLoad(data); }
      catch (e) { if (alive) list.innerHTML = `<div class="chat-empty neg">${esc(e.message)}</div>`; }
    };
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight + 2) + 'px'; };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    root.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { ta.value = b.textContent; grow(); ta.focus(); }));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if(sending || readOnly)return;
      const body = ta.value.trim();
      if (!body) { msg.textContent = 'Please write a message.'; msg.className = 'form-msg err'; ta.focus(); return; }
      const btn = form.querySelector('button'); sending=true;generation++;btn.disabled = true;ta.readOnly=true; msg.textContent = '';
      try {
        const data = await api(`/orders/${orderId}/messages`, { method: 'POST', body: { body } });
        ta.value = ''; grow(); render(data.messages); list.scrollTop = list.scrollHeight;
        msg.textContent = 'Sent.'; msg.className = 'form-msg ok'; setTimeout(() => { if (msg.textContent === 'Sent.') msg.textContent = ''; }, 2500);
        onLoad && onLoad(data); onSent && onSent(data);
      } catch (ex) { msg.textContent = ex.message; msg.className = 'form-msg err'; }
      finally { sending=false;btn.disabled = false;ta.readOnly=readOnly; }
    });
    const timer = setInterval(() => { if (!document.hidden) load(); }, 15000);
    load();
    return { reload: load, focus: () => ta.focus(), destroy() { alive = false; clearInterval(timer); } };
  }

  // Keep existing structured data when the combined text is unchanged.
  const addressKeys = ['address1','address2','city','region','postalCode','buyerPhone'];
  const addressText = order => addressKeys.map(k=>String(order?.[k]||'')).filter(Boolean).join('\n');
  function addressFields(value,order){
    if(order && value===addressText(order))return Object.fromEntries(addressKeys.map(k=>[k,order[k]||'']));
    return {address1:value,address2:'',city:'',region:'',postalCode:'',buyerPhone:''};
  }
  window.DLOrderUI = { addressText, addressFields, STEPS, LABEL, pill, isLate, delayTag, delayNote, notShippedYet, tracker, getDrawer, chat, svg, when, day, activity, syncConversation };
})();
