
  // ---------- video guides (26 Nov 2026) ----------
  // Erwin + Daniel: the 7 portal guides live inside the portal. Hebrew videos (Daniel's voice) when the portal is in
  // Hebrew, English otherwise. Files: /p/guides/<lang>-<nn>.mp4 + .webp poster (720p, captions burned in, sample data,
  // no prices or bank details). Videos load only when played. Home shows a card for the tour until the client closes it.
  const GUIDES = [
    ['00', 'Portal tour', 'Everything in your portal in two minutes', { en: '1:48', he: '1:58' }],
    ['01', 'Send a new order', 'The three steps to send us an order', { en: '0:46', he: '0:51' }],
    ['02', 'Follow your orders and tracking', 'Filters, search, status and tracking', { en: '0:45', he: '0:50' }],
    ['03', 'Send us a message', 'Ask us about an order and read our reply', { en: '0:31', he: '0:32' }],
    ['04', 'Pay for your orders', 'Tick the orders, transfer, upload the confirmation', { en: '0:38', he: '0:47' }],
    ['05', 'Add your stores', 'Add a store and switch between stores', { en: '0:31', he: '0:37' }],
    ['06', 'Check a product price', 'Get a price before you start selling', { en: '0:35', he: '0:43' }],
  ];
  const guideLang = () => (window.DLi18n?.lang === 'he' ? 'he' : 'en');
  const guideCardKey = () => 'dl-guide-card-' + S.me.id;
  function viewGuides() {
    const L = guideLang();
    return `<section class="guides-grid" data-guides>${GUIDES.map(([n, title, sub, len]) => `
      <article class="card guide-card" data-guide="${n}">
        <div class="guide-media"><button class="guide-play" type="button" data-guide-play="/p/guides/${L}-${n}.mp4" aria-label="${esc(title)}"><img src="/p/guides/${L}-${n}.webp" alt="" width="640" height="360" loading="lazy"><span class="guide-play-dot" aria-hidden="true">${UI.svg('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>')}</span></button></div>
        <div class="guide-body"><h3>${esc(title)}</h3><p class="muted">${esc(sub)}</p><span class="guide-len" data-no-i18n>${len[L]}</span></div>
      </article>`).join('')}</section>`;
  }
  // The cover (title card) with a play button; the video loads and starts only when it is clicked. One plays at a time.
  document.addEventListener('play', e => { if (e.target.closest?.('[data-guides]')) document.querySelectorAll('[data-guides] video').forEach(v => { if (v !== e.target) v.pause(); }); }, true);
  function guideHomeCard() {
    if (store.get(guideCardKey(), 0)) return '';
    return `<section class="card card-pad guide-home" data-guide-home>
      <div class="guide-home-icon" aria-hidden="true">${UI.svg('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>')}</div>
      <div class="guide-home-text"><h3>New here? Watch the 2-minute tour</h3><p class="muted">A quick look at everything you can do in your portal.</p></div>
      <div class="guide-home-actions"><a class="btn btn-primary" href="#/guides">${ic('play')}Watch the tour</a><a class="btn btn-ghost" href="#/guides">All video guides</a></div>
      <button class="guide-home-close" type="button" data-guide-home-close aria-label="Close">${UI.svg('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
    </section>`;
  }
  document.addEventListener('click', e => {
    const play = e.target.closest('[data-guide-play]');
    if (play) {
      const v = document.createElement('video');
      Object.assign(v, { controls: true, autoplay: true, playsInline: true, src: play.dataset.guidePlay });
      v.setAttribute('aria-label', play.getAttribute('aria-label'));
      play.replaceWith(v); v.focus();
      return;
    }
    if (e.target.closest('[data-guide-home-close]')) { store.set(guideCardKey(), 1); e.target.closest('[data-guide-home]')?.remove(); }
  });
