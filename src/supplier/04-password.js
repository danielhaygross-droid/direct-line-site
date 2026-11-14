
  // ---------- change password ----------
  function passwordHTML() {
    return `<a class="sp-backlink" href="#billing">${ICON.back}${t('Back to Billing')}</a>
      <div class="sp-head"><div><h1>${t('Change password')}</h1><p class="sp-intro">${t('Only Direct Line can add or remove supplier logins.')}</p></div></div>
      <section class="card sp-card sp-narrow"><form id="sp-password" novalidate>
        <label class="field"><span>${t('Current password')}</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>
        <label class="field"><span>${t('New password')} <small>${t('8 characters or more')}</small></span><input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>
        <label class="field"><span>${t('Confirm new password')}</span><input name="confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>
        <button type="submit" class="btn btn-primary">${t('Save password')}</button><p class="form-msg" role="status"></p></form></section>`;
  }
  function bindPassword() {
    const f = $('#sp-password'); if (!f) return;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const b = $('[type=submit]', f), m = $('.form-msg', f); if (b.disabled) return; m.className = 'form-msg';
      if (f.password.value !== f.confirm.value) { m.textContent = t('The new passwords don’t match.'); m.className = 'form-msg err'; return; }
      b.disabled = true;
      try { await api('/supplier/password', { method: 'POST', body: { currentPassword: f.currentPassword.value, password: f.password.value } }); f.reset(); m.textContent = t('Password changed.'); m.className = 'form-msg ok'; }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      b.disabled = false;
    });
  }
