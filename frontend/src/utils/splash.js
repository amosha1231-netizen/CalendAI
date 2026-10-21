/**
 * Hands the boot splash (#app-splash in index.html) over to the React app.
 *
 * The splash looks exactly like <LuxuryLoader />, so while React is still
 * showing a loader (lazy chunk, auth check, OAuth exchange) nothing visibly
 * changes. Once #root holds a real screen and no loader, the splash fades out
 * over the page instead of the page popping in.
 */
const MAX_SPLASH_MS = 15000;

export function installSplashHandoff() {
  try {
    if (typeof document === 'undefined') return;
    const splash = document.getElementById('app-splash');
    const root = document.getElementById('root');
    if (!splash || !root) return;

    let done = false;
    let observer = null;
    let fallbackTimer = null;

    const remove = () => {
      try { splash.remove(); } catch (e) { /* already gone */ }
    };

    const hide = () => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      clearTimeout(fallbackTimer);
      splash.addEventListener('animationend', remove, { once: true });
      // animationend can be skipped (hidden tab, reduced motion), so remove anyway.
      setTimeout(remove, 700);
      splash.classList.add('fade-out');
    };

    const check = () => {
      if (root.childElementCount > 0 && !root.querySelector('.luxury-loader-overlay')) {
        // Wait one frame so the new screen is painted under the splash first.
        requestAnimationFrame(hide);
      }
    };

    observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true });
    fallbackTimer = setTimeout(hide, MAX_SPLASH_MS);
  } catch (e) {
    // Never block the app on the splash.
    try { document.getElementById('app-splash')?.remove(); } catch (err) { /* ignore */ }
  }
}
