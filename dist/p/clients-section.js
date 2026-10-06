// "Clients & orders" inside the store dashboard: shows the admin view (clients,
// orders, payments, earnings) as a section of the dashboard instead of a separate page.
(function () {
  const btn = document.getElementById('nav-client-orders');
  const section = document.getElementById('client-orders');
  if (!btn || !section) return;
  const frame = section.querySelector('iframe');
  const HASH = '#client-orders';

  function sizeFrame() {
    if (section.hidden) return;
    const top = Math.max(0, frame.getBoundingClientRect().top);
    frame.style.height = Math.max(480, window.innerHeight - top) + 'px';
  }

  function open() {
    if (!frame.src) frame.src = frame.dataset.src;
    section.hidden = false;
    document.body.classList.add('client-orders-open');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n === btn));
    document.body.classList.remove('menu-open');
    document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
    if (location.hash !== HASH) history.replaceState(null, '', HASH);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(sizeFrame);
  }
  function close() {
    if (section.hidden) return;
    section.hidden = true;
    document.body.classList.remove('client-orders-open');
    btn.classList.remove('active');
    if (location.hash === HASH) history.replaceState(null, '', location.pathname + location.search);
  }

  btn.addEventListener('click', open);
  // Any other dashboard section closes this one (the dashboard handles its own nav after us).
  document.addEventListener('click', e => {
    if (e.target.closest('.nav-item[data-section], [data-section-jump]')) close();
  }, true);
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data?.type === 'dl-admin-ready') frame.dataset.ready = 'true';
  });
  window.addEventListener('resize', sizeFrame);
  window.addEventListener('hashchange', () => (location.hash === HASH ? open() : close()));
  if (location.hash === HASH) open();
})();
