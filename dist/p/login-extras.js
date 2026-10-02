/* Show/hide password button for every password field on the page (Hebrew/English aware). */
(function () {
  const he = (document.documentElement.lang || '').startsWith('he');
  const T = he ? { show: 'הצג סיסמה', hide: 'הסתר סיסמה' } : { show: 'Show password', hide: 'Hide password' };
  const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function enhance(root = document) {
    root.querySelectorAll('input[type="password"]:not([data-pw-ready])').forEach(input => {
      input.dataset.pwReady = '1';
      const wrap = document.createElement('span');
      wrap.style.cssText = 'position:relative;display:block;width:100%';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const side = getComputedStyle(input).direction === 'rtl' ? 'left' : 'right';
      input.style[side === 'right' ? 'paddingRight' : 'paddingLeft'] = '44px';
      input.style.width = '100%';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-toggle';
      btn.setAttribute('aria-label', T.show);
      btn.title = T.show;
      btn.innerHTML = EYE;
      btn.style.cssText = `position:absolute;top:50%;${side}:6px;transform:translateY(-50%);display:grid;place-items:center;width:34px;height:34px;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;opacity:.65;cursor:pointer`;
      btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
      btn.addEventListener('mouseleave', () => { btn.style.opacity = '.65'; });
      btn.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.innerHTML = showing ? EYE : EYE_OFF;
        btn.setAttribute('aria-label', showing ? T.show : T.hide);
        btn.title = showing ? T.show : T.hide;
        input.focus();
      });
      wrap.appendChild(btn);
    });
  }

  window.DLEnhancePasswords = enhance;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => enhance());
  else enhance();
})();
