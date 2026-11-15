// Top-right profile and "Good morning, …": show the team admin who is signed in.
// The main admin login (set in Vercel) gets no name back and keeps the page's own text (Daniel).
(() => {
  const he = document.documentElement.lang === 'he';
  const initials = name => name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  fetch('/api/auth/session', { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : null))
    .then(s => {
      if (!s || !s.ok || s.role !== 'admin' || !s.name) return;
      const name = s.name.trim(), first = name.split(/\s+/)[0];
      const box = document.querySelector('.profile');
      if (box) {
        const b = box.querySelector('b'), strong = box.querySelector('strong'), small = box.querySelector('small');
        if (b) b.textContent = initials(name);
        if (strong) strong.textContent = name;
        if (small) small.textContent = s.position || (he ? 'מנהל' : 'Admin');
      }
      document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = first; });
    })
    .catch(() => {});
})();
