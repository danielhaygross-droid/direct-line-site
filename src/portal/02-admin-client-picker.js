  // ---------- admin opening the client portal ----------
  async function adminScreen(err) {
    let clients = [];
    try { clients = (await api('/admin/overview')).clients; } catch (e) { /* ignore */ }
    $('#boot')?.remove();
    const app = $('#app'); app.hidden = false; app.className = 'admin-pick';
    app.innerHTML = `<div class="pick-card card">
      <a class="brand" href="/portal/" style="color:var(--text)"><span>direct<b>↗</b>line.</span><small>CLIENT PORTAL</small></a>
      <div><h1>You’re signed in as the Direct Line admin</h1><p class="muted">This page is the client portal, what your clients see. Pick a client to see their portal exactly as they do, or go back to the admin dashboard.</p></div>
      ${err ? `<p class="form-msg err">${esc(err)}</p>` : ''}
      <div class="pick-list">${clients.length ? clients.map(c => `<a class="pick-row" href="/portal/?as=${c.id}"><span class="avatar">${esc((c.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span><b>${esc(c.name)}</b><small>@${esc(c.username)} · ${c.orders} order${c.orders === 1 ? '' : 's'}${c.active ? '' : ' · disabled'}</small></span><em>See their portal →</em></a>`).join('')
        : '<p class="muted">No client accounts yet. Add one in the admin dashboard → Clients & orders.</p>'}</div>
      <div class="pick-actions"><a class="btn btn-primary" href="/en/#client-orders">Go to admin dashboard</a><button type="button" class="btn" data-pick-logout>Sign out (to log in as a client)</button></div>
      <p class="note">Their portal opens view only. To add orders, photos, products or stores for them, press “Log in as client” at the top of their portal.</p>
    </div>`;
    $('[data-pick-logout]').addEventListener('click', logout);
  }
  function previewBanner() {
    const bar = document.createElement('div');
    bar.className = 'preview-bar';
    bar.innerHTML = `<span><b>Preview:</b> you’re seeing ${esc(S.me.name)}’s portal as admin. View only, nothing you click here changes their account.</span><a href="/portal/?as=${S.me.id}&act=1">Log in as client</a><a href="/portal/">Pick another client</a><a href="${window.DLi18n?.lang === 'he' ? '/' : '/en/'}#client-orders">Back to admin dashboard</a>`;
    document.body.prepend(bar);
    document.body.classList.add('is-preview');
  }
  // Logged in as the client: everything works as for the client (except messages, password and terms), so say clearly that changes are real.
  function actingBanner() {
    const bar = document.createElement('div');
    bar.className = 'preview-bar acting-bar';
    bar.innerHTML = `<span><b>Logged in as ${esc(S.me.name)}.</b> Changes you make here are real and saved to their account. They are recorded as Direct Line.</span><a href="/portal/?as=${S.me.id}">Switch to view only</a><a href="${window.DLi18n?.lang === 'he' ? '/' : '/en/'}#client-orders">Back to admin dashboard</a>`;
    document.body.prepend(bar);
    document.body.classList.add('is-acting');
    // One "logged in" line in the client's activity per tab, not one per reload.
    const key = 'dl-acting-' + S.me.id;
    let logged = false; try { logged = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch (e) { /* private mode */ }
    if (!logged) api('/acting/start', { method: 'POST', body: {} }).catch(() => {});
  }

