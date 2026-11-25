// KESO COACH is displayed inside the existing Activity document.
// Navigating the top-level Discord Activity back and forth repeats the SDK handshake
// and can leave the iOS client at the startup error screen. Keep the original document alive.
// The iframe shares the existing origin and KP session; no token is ever put in a URL.
(() => {
  const app = document.getElementById('app');
  if (!app) return;
  let overlay = null;
  let returnFocus = null;

  function closeCoach() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    app.inert = false;
    returnFocus?.focus?.({preventScroll:true});
    returnFocus = null;
  }

  function openCoach(event) {
    event?.preventDefault?.();
    if (overlay) return;
    returnFocus = event?.currentTarget ?? null;
    overlay = document.createElement('section');
    overlay.dataset.coachOverlay = 'true';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'KESO COACH');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483000',
      display: 'flex', flexDirection: 'column',
      background: '#0f1923', color: '#ffffff',
      width: '100%', height: '100dvh'
    });

    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex', flexShrink: '0', alignItems: 'center',
      padding: '8px 12px', minHeight: '56px',
      background: '#101b29', borderBottom: '1px solid #34485a'
    });
    const back = document.createElement('button');
    back.type = 'button';
    back.dataset.coachClose = 'true';
    back.textContent = '← KESO PLAYに戻る';
    Object.assign(back.style, {
      minHeight: '44px', padding: '8px 16px',
      borderRadius: '8px', border: '1px solid #677788',
      background: '#1a3042', color: '#ffffff',
      font: 'inherit', fontWeight: '700', cursor: 'pointer'
    });
    back.addEventListener('click', closeCoach);
    bar.append(back);

    const frame = document.createElement('iframe');
    frame.dataset.coachFrame = 'true';
    frame.title = 'KESO COACH 本人専用分析';
    frame.src = './coach.html?embedded=1&v=20261122-iframe-v2';
    frame.setAttribute('allow', 'clipboard-write');
    Object.assign(frame.style, {
      display: 'block', flex: '1 1 auto', width: '100%',
      height: '0', minHeight: '0', border: '0', background: '#0f1923'
    });
    overlay.append(bar, frame);
    app.inert = true;
    document.body.append(overlay);
    back.focus({preventScroll:true});
  }

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
    link.addEventListener('click', openCoach);
    home.append(link);
  }

  new MutationObserver(addCoachEntry).observe(app, {childList: true, subtree: true});
  addCoachEntry();
})();
