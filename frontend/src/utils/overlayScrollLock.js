// Keeps the page behind an open overlay (drawer, sheet, modal, full-screen view)
// from scrolling when the user scrolls inside the overlay.
//
// Instead of wiring a lock into each of the ~40 overlays, one observer watches
// the DOM: while any overlay is open, <html> gets the `overlay-open` class
// (CSS turns off page scrolling), and on iOS a touchmove guard stops the
// gesture from "leaking" to the page when it starts outside a scrollable box
// or hits the top/bottom edge of one.
//
// Must be installed from an effect (never at module init) per the iOS rules in CLAUDE.md.

const OVERLAY_SELECTOR = [
  '.sidebar-drawer.open',
  '.fixed.inset-0:not(.pointer-events-none)',
].join(',');

function isScrollableY(el) {
  try {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
  } catch (e) {
    return false;
  }
}

function isScrollableX(el) {
  try {
    const style = window.getComputedStyle(el);
    const ox = style.overflowX;
    return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  } catch (e) {
    return false;
  }
}

/**
 * Starts the global overlay scroll lock. Returns a cleanup function.
 */
export function installOverlayScrollLock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (typeof MutationObserver === 'undefined') return () => {};

  const root = document.documentElement;
  let locked = false;
  let frame = 0;
  let startX = 0;
  let startY = 0;

  const setLocked = (next) => {
    if (next === locked) return;
    locked = next;
    try { root.classList.toggle('overlay-open', next); } catch (e) {}
  };

  const check = () => {
    frame = 0;
    try {
      setLocked(!!document.querySelector(OVERLAY_SELECTOR));
    } catch (e) {
      setLocked(false);
    }
  };

  const schedule = () => {
    if (frame) return;
    try {
      frame = window.requestAnimationFrame(check);
    } catch (e) {
      check();
    }
  };

  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
  };

  const onTouchMove = (e) => {
    if (!locked || !e.cancelable) return;
    if (e.touches && e.touches.length > 1) return; // pinch-zoom stays native
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const target = e.target;
    if (target && target.closest && target.closest('input[type="range"], textarea, select')) return;

    // Walk up to the nearest box that can scroll in the gesture's direction.
    const horizontal = Math.abs(dx) > Math.abs(dy);
    let el = target && target.nodeType === 1 ? target : target && target.parentElement;
    while (el && el !== document.body && el !== root) {
      if (horizontal) {
        if (isScrollableX(el)) return;
      } else if (isScrollableY(el)) {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        // At its edge in this direction: an outer box may still scroll,
        // otherwise the gesture would chain to the page behind.
        if (!((dy > 0 && atTop) || (dy < 0 && atBottom))) return;
      }
      el = el.parentElement;
    }
    if (horizontal) return; // sideways swipes (e.g. drawer gestures) aren't page scrolls
    e.preventDefault();
  };

  const observer = new MutationObserver(schedule);
  try {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  } catch (e) {}
  try {
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  } catch (e) {}
  check();

  return () => {
    try { observer.disconnect(); } catch (e) {}
    try { if (frame) window.cancelAnimationFrame(frame); } catch (e) {}
    try {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    } catch (e) {}
    setLocked(false);
  };
}
