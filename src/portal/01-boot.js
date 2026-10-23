  // ---------- boot ----------
  async function boot() {
    try { S.me = await api('/me'); }
    catch (e) {
      if (e.status === 401 || e.status === 403) return renderLogin(document.body, { title: 'Welcome back', subtitle: 'Sign in to add and track your orders.', portal: true });
      return bootError(e);
    }
    if (S.me.termsRequired) return termsScreen();
    if (S.me.passwordResetRequired) return passwordScreen();
    if (S.me.role === 'admin') {
      // Admins don't get bounced to the dashboard any more: they pick a client and preview their portal (view only).
      // ?act=1: "Log in as client" — the admin uses the portal with the client's rights (changes are real, logged, recorded as Direct Line).
      const params = new URLSearchParams(location.search), as = Number(params.get('as'));
      if (!as) return adminScreen();
      window.DL_VIEW_AS = as; window.DL_ACT = params.get('act') === '1';
      try { S.me = await api('/me'); } catch (e) { return adminScreen(e.message); }
    }
    shell();
    if (S.me.preview) previewBanner();
    if (S.me.acting) actingBanner();
    $('#boot').remove(); $('#app').hidden = false;
    if (await refresh(true) === false) return;
    route();
    addEventListener('hashchange', route);
    setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(() => {}); });
  }

  const acceptedText = a => a ? `<span>Terms accepted:</span> <time data-no-i18n>${esc(fullDate(a.accepted_at))} · v${a.version}</time>` : '<span>Not accepted yet</span>';
  function policyHTML(data) {
    const text = window.DLi18n?.lang === 'he' ? data.policy.hebrew : data.policy.english;
    return `<article class="card card-pad terms-paper"><h2 id="terms-title">${esc(data.policy.title)}</h2><p class="muted"><span>Version</span> <b data-no-i18n>${data.policy.version}</b></p><div class="terms-content" tabindex="0" aria-labelledby="terms-title" data-no-i18n>${termsText(text)}</div></article>`;
  }
  // Lines broken mid-sentence in the stored text (the next line starts in lower case) are joined back up.
  // Numbered section titles ("2. Order Cancellation …") stand out from the text (Erwin, 23 Oct 2026).
  function termsText(text) {
    return esc(text).replace(/\n(?=[a-z(])/g, ' ').split('\n').map(l => /^\s*\d+\.\s+\S/.test(l) ? `<strong class="terms-h">${l.trim()}</strong>` : l).join('\n');
  }
  async function termsScreen() {
    try {
      const data = await api('/terms');
      document.body.innerHTML = `<main class="terms-page"><div class="terms-top"><span class="brand"><span>direct<b>↗</b>line.</span></span><button type="button" class="btn btn-sm" data-terms-lang>${window.DLi18n?.lang === 'he' ? 'EN' : 'עב'}</button></div><h1>Terms of Service</h1><p>Please read and accept before using the portal.</p>${policyHTML(data)}<form id="terms-agreement"><label class="terms-check"><input type="checkbox" name="accepted"> <span>I have read and agree to the Terms of Service</span></label><div class="terms-actions"><button type="submit" class="btn btn-primary" disabled>Accept &amp; continue</button><button type="button" class="btn" data-terms-logout>Log out</button></div><p class="form-msg err" role="alert"></p></form></main>`;
      const f = $('#terms-agreement'), b = $('[type=submit]', f);
      f.accepted.addEventListener('change', () => { b.disabled = !f.accepted.checked; });
      f.addEventListener('submit', async e => {
        e.preventDefault(); if (!f.accepted.checked) return; b.disabled = true;
        try { await api('/terms/accept', { method: 'POST', body: { version: data.policy.version, accepted: true } }); location.reload(); }
        catch (ex) { $('.form-msg', f).textContent = ex.message; b.disabled = false; }
      });
      $('[data-terms-lang]').addEventListener('click', () => window.DLi18n.setLang(window.DLi18n.lang === 'he' ? 'en' : 'he'));
      $('[data-terms-logout]').addEventListener('click', logout);
    } catch (ex) { bootError(ex); }
  }
  // Loading failed: say what to do and offer a retry (a dropped connection only gives "Failed to fetch").
  function bootError(ex) {
    const msg = ex.status ? ex.message : 'Couldn’t connect. Check your internet connection and try again.', b = $('#boot');
    if (!b) return N.popup({ icon: 'alert', title: msg });
    $('[data-boot-error]', b)?.remove(); b.style.alignContent = 'center'; b.style.gap = '8px';
    b.insertAdjacentHTML('beforeend', `<div data-boot-error style="display:grid;gap:12px;justify-items:center;text-align:center;padding:24px"><p style="margin:0">${esc(msg)}</p><button type="button" class="btn btn-primary" data-boot-retry>Try again</button></div>`);
    $('[data-boot-retry]', b).addEventListener('click', () => location.reload());
  }
  const viewTerms = () => '<section data-terms-view><p>Loading…</p></section>';
  async function bindTerms() {
    const target = $('[data-terms-view]');
    try { const data = await api('/terms'); if (target.isConnected) target.innerHTML = policyHTML(data) + `<p class="note">${acceptedText(data.accepted)}</p>`; }
    catch (ex) { if (target.isConnected) target.textContent = ex.message; }
  }

  function passwordScreen() {
    document.body.innerHTML = `<div class="login-wrap" style="display:grid;grid-template-columns:1fr;place-items:center"><section class="login-card"><h1>Choose a new password</h1><p>Your temporary password must be replaced before you can use the portal.</p><form id="password-form"><label class="field">New password<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label class="field">Confirm new password<input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button type="submit" class="btn btn-primary">Save password</button><p class="form-msg" role="alert"></p></form><button type="button" class="btn" data-password-logout>Log out</button></section></div>`;
    const f = $('#password-form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('.form-msg', f), b = $('[type=submit]', f);
      if (f.password.value !== f.confirmPassword.value) { m.textContent = 'Passwords do not match.'; return; }
      b.disabled = true;
      try { await api('/password', { method: 'POST', body: { password: f.password.value } }); location.reload(); }
      catch (ex) { m.textContent = ex.message; b.disabled = false; }
    });
    $('[data-password-logout]').addEventListener('click', logout);
  }

