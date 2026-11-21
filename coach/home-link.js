// Progressive KESO COACH entry: this page and coach.html deliberately share the same origin.
// The existing KP session is read by coach.html; credentials never enter a link or URL.
(() => {
  const app = document.getElementById('app');
  if (!app) return;
  function addCoachEntry() {
    const home = app.querySelector('nav.shortcut-grid');
    if (!home || home.querySelector('[data-coach-entry]')) return;
    const link = document.createElement('a');
    link.className = 'shortcut';
    link.dataset.coachEntry = 'true';
    link.href = './coach.html';
    link.style.textDecoration = 'none';
    link.setAttribute('aria-label', 'KESO COACH：VALORANT個人・チーム分析');
    const icon = document.createElement('span');
    icon.className = 'ico';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🎯';
    const title = document.createElement('strong');
    title.textContent = 'コーチ';
    const detail = document.createElement('small');
    detail.textContent = 'VALORANT分析・練習';
    link.append(icon, title, detail);
    home.append(link);
  }
  new MutationObserver(addCoachEntry).observe(app, { childList: true, subtree: true });
  addCoachEntry();
})();
