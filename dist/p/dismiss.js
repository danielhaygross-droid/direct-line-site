// Close windows and menus with a click outside or Esc, on every page (17 Nov 2026, Erwin: "when I click outside or press
// Esc the window should close, the same in all our portals").
//  - Drop-down menus (<details> marked below): a click anywhere else or Esc closes them.
//  - Pop-up windows (<dialog> opened with showModal): a click on the dark area around them closes them; Esc already did.
//  - Side menus on phones (body.menu-open): Esc closes them (the dark area already did).
//  - Typing that isn't saved yet: closing that way first asks "Discard your changes?" (Erwin chose this), so a stray click
//    doesn't lose it. Windows with their own close code use window.DLDismiss.ok(element) for the same question.
// Already closing on their own before this file: the bell panel (notify.js), order side panel (order-ui.js), photo viewer
// (common.js), admin money-card windows, supplier order drawer.
(() => {
  if (window.DLDismiss) return;
  const MENUS = 'details.sp-bell, details.sp-me, details[data-pop]';
  const WINDOWS = 'dialog, .drawer, .sp-drawer, [data-kpi-win], [data-dismiss-guard]';
  const lang = () => (window.DLi18n?.lang || document.documentElement.lang || '').toLowerCase();
  const question = () => lang().startsWith('he') ? 'לבטל את השינויים שלך? מה שהקלדת לא נשמר.'
    : lang().startsWith('zh') ? '放弃您的修改吗？您输入的内容还没有保存。'
    : 'Discard your changes? What you typed is not saved yet.';
  // A form inside a window is "changed" from the first typing until it is sent or reset.
  const tracked = el => el && el.form && el.closest(WINDOWS) && !el.closest('[data-autosave]') && !['search', 'button', 'submit', 'hidden'].includes(el.type);
  document.addEventListener('input', e => { if (tracked(e.target)) e.target.form.dataset.dirty = '1'; }, true);
  document.addEventListener('change', e => { if (tracked(e.target)) e.target.form.dataset.dirty = '1'; }, true);
  document.addEventListener('submit', e => { delete e.target.dataset.dirty; }, true);
  document.addEventListener('reset', e => { delete e.target.dataset.dirty; }, true);
  const changed = root => !!(root && [...root.querySelectorAll('form[data-dirty]')].some(f => f.isConnected));
  const ok = root => {
    if (!changed(root)) return true;
    if (!window.confirm(question())) return false;
    root.querySelectorAll('form[data-dirty]').forEach(f => delete f.dataset.dirty);
    return true;
  };
  window.DLDismiss = { ok, changed };

  const openMenus = () => [...document.querySelectorAll(MENUS)].filter(d => d.open);
  // A press outside an open menu closes it (pressing its own button still toggles it).
  document.addEventListener('pointerdown', e => {
    for (const d of openMenus()) if (!d.contains(e.target)) d.open = false;
  }, true);
  // Opening one menu closes the others.
  document.addEventListener('toggle', e => {
    const d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.open || !d.matches(MENUS)) return;
    for (const o of openMenus()) if (o !== d) o.open = false;
  }, true);

  // A click on the dark area around a pop-up window (outside its box) closes it.
  let downOnBackdrop = null;
  const outsideBox = (dlg, e) => { const r = dlg.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  document.addEventListener('pointerdown', e => { const d = e.target; downOnBackdrop = d instanceof HTMLDialogElement && d.open && outsideBox(d, e) ? d : null; }, true);
  document.addEventListener('click', e => {
    const d = e.target;
    if (!(d instanceof HTMLDialogElement) || !d.open || d !== downOnBackdrop || !outsideBox(d, e)) return; // a drag that ended outside doesn't count
    downOnBackdrop = null;
    if (ok(d)) d.close();
  }, true);
  // Esc on a pop-up window: the browser closes it; ask first when something typed would be lost.
  document.addEventListener('cancel', e => { if (e.target instanceof HTMLDialogElement && !ok(e.target)) e.preventDefault(); }, true);

  // Esc: the open menu first (and nothing else), then a phone side menu.
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.isComposing) return;
    const menus = openMenus();
    if (menus.length) {
      e.preventDefault(); e.stopImmediatePropagation();
      menus.forEach(d => { d.open = false; }); menus[0].querySelector('summary')?.focus();
      return;
    }
    if (document.body.classList.contains('menu-open')) {
      e.preventDefault(); e.stopImmediatePropagation();
      document.body.classList.remove('menu-open');
      document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
    }
  }, true);
  // Dashboard side menu on phones: a press outside it closes it.
  document.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('menu-open')) return;
    if (e.target.closest('.sidebar, .side, .mobile-menu, [data-menu], .scrim')) return;
    document.body.classList.remove('menu-open');
    document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
  }, true);
})();
