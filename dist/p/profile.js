// Top-right profile and "Good morning, …": show the team admin who is signed in.
// The main admin login (set in Vercel) gets no name back and keeps the page's own text (Daniel).
// Runs on load and again when somebody signs in on this page without a reload (16 Nov 2026: Erwin signed in with his own
// login on the sign-in form and the header still said Daniel, because it was only filled in on load).
(() => {
  const he = document.documentElement.lang === 'he';
  const initials = name => name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const box = document.querySelector('.profile');
  const original = box ? { b: box.querySelector('b')?.textContent, strong: box.querySelector('strong')?.textContent, small: box.querySelector('small')?.textContent } : null;
  const greet = [...document.querySelectorAll('[data-user-name]')].map(el => [el, el.textContent]);
  function show(s) {
    const team = s && s.ok && s.role === 'admin' && s.name;
    const name = team ? s.name.trim() : '';
    if (box && original) {
      const b = box.querySelector('b'), strong = box.querySelector('strong'), small = box.querySelector('small');
      if (b) b.textContent = team ? initials(name) : original.b;
      if (strong) strong.textContent = team ? name : original.strong;
      if (small) small.textContent = team ? (s.position || (he ? 'מנהל' : 'Admin')) : original.small;
    }
    greet.forEach(([el, text]) => { if (el.isConnected) el.textContent = team ? name.split(/\s+/)[0] : text; });
  }
  // One retry: the very first request after the site wakes up can fail, and the header then kept saying Daniel.
  const ask = () => fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject(r.status)));
  const load = () => ask().catch(() => new Promise(r => setTimeout(r, 1500)).then(ask)).then(show).catch(() => {});
  load();
  // Signing in on this page adds the "authenticated" class to <body> (no reload): read who it is again.
  let was = document.body.classList.contains('authenticated');
  new MutationObserver(() => { const now = document.body.classList.contains('authenticated'); if (now && !was) load(); was = now; })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
