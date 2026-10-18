  // ---------- side panel: add account ----------
  function openAddAccount(role = 'client') {
    const d = UI.getDrawer();
    closeChat();
    S.drawer = { kind: 'account' };
    d.onClose = () => { S.drawer = null; };
    d.open('a');
    d.head.innerHTML = `<h2 data-acc-title>${role === 'admin' ? 'Add an admin' : 'Add a client'}</h2><p>Share the username and password with them privately.</p>`;
    d.body.innerHTML = `<form class="form-grid" id="user-form" novalidate>
      <label class="field full"><span>Account type</span><select name="role"><option value="client"${role === 'client' ? ' selected' : ''}>Client (their own portal)</option><option value="admin"${role === 'admin' ? ' selected' : ''}>Admin (full access)</option></select></label>
      <label class="field full"><span>Name</span><input name="name" maxlength="120"></label>
      <label class="field"><span>Username</span><input name="username" maxlength="60" autocomplete="off" placeholder="letters, numbers, . _ - @"></label>
      <label class="field"><span>Password <small>8+ characters</small></span><input name="password" type="password" autocomplete="new-password"></label>
      <label class="field full" data-cpo><span>Fee per order <small>empty = default (${money(S.ov.settings.commission_per_order)})</small></span><span class="money"><input name="commissionPerOrder" type="number" min="0" step="0.01"></span></label>
      <p class="form-msg full" data-user-msg></p></form>
      <p class="note" data-signin-note></p>`;
    window.DLEnhancePasswords?.(d.body);
    d.foot.innerHTML = '<button type="submit" form="user-form" class="btn btn-primary">Create account</button><button type="button" class="btn btn-ghost" data-close-drawer>Cancel</button>';
    const f = $('#user-form');
    const sync = () => {
      const admin = f.role.value === 'admin';
      $('[data-cpo]').hidden = admin;
      $('[data-acc-title]').textContent = admin ? 'Add an admin' : 'Add a client';
      f.name.placeholder = admin ? 'Team member’s name' : 'Client or store name';
      // Admins sign in on the main dashboard; clients on their portal. (The admin app runs inside the dashboard.)
      $('[data-signin-note]').innerHTML = admin
        ? `They sign in at <b>${esc(location.origin)}/</b> and get full access to the dashboard.`
        : `They sign in at <b>${esc(location.origin)}/portal/</b>. Their free month starts today (${esc(fmtDay(new Date().toLocaleDateString('en-CA', { timeZone: window.DL.displayTimeZone() })))}).`;
    };
    f.role.addEventListener('change', sync); sync();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-user-msg]');
      try {
        await api('/admin/users', { method: 'POST', body: { role: f.role.value, name: f.name.value, username: f.username.value.trim(), password: f.password.value, commissionPerOrder: f.commissionPerOrder.value === '' ? null : f.commissionPerOrder.value } });
        m.textContent = `Account “${f.username.value.trim()}” created.`; m.className = 'form-msg full ok';
        tell({ type: 'dl-clients-changed' });
        f.reset(); sync();
        await loadAll(); renderList();
      } catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; }
    });
    setTimeout(() => f.name.focus({ preventScroll: true }), 60);
  }

  function refreshDrawer() {
    const s = S.drawer; if (!s) return;
    if (s.kind === 'order') { const o = [...S.orders,...S.archivedOrders].find(x => x.id === s.id); if (o) fillOrder(o, true); }
    if (s.kind === 'client') { const c = clientOf(s.id); if (c) fillClient(c, true); }
  }

  document.addEventListener('input',e=>{if(e.target.name==='color'){const f=e.target.closest('[data-client-store-form]');if(f)f.dataset.colourEdited='1';}});
  document.addEventListener('change',async e=>{
    if(e.target.matches('[data-move-order]')){const f=e.target;f.disabled=true;try{await api('/orders/'+f.dataset.moveOrder,{method:'PUT',body:{storeId:Number(f.value)}});await loadAll();renderList();refreshDrawer();toast('Order moved to store.');}catch(ex){toast(ex.message);f.disabled=false;}}
    const p=e.target.closest('[data-period-form]');if(p&&S.drawer?.kind==='client'){S.period=p.period.value;if(p.from)S.from=p.from.value;if(p.to)S.to=p.to.value;if(e.target.name==='period'||window.DLClientStoreMath.periodRange('custom',S.from,S.to)){document.activeElement?.blur();fillClient(clientOf(S.drawer.id));}}
  });
  document.addEventListener('submit',e=>{if(e.target.matches('[data-period-form]'))e.preventDefault();});
