/**
 * Live sync: keep an open tab (or the mobile app) up to date with changes made
 * on another device or browser on the same account.
 *
 * Runs `onSync` when the page becomes visible again, when the window regains
 * focus, when the network comes back, and every `intervalMs` while the page is
 * visible. Calls closer than `minGapMs` are skipped, so focus + visibilitychange
 * firing together cause one refresh, not two. Nothing runs while hidden.
 *
 * All browser access is guarded and happens only inside startLiveSync (never at
 * module load), per the iOS rules in CLAUDE.md.
 */
export const LIVE_SYNC_INTERVAL_MS = 60 * 1000;
export const LIVE_SYNC_MIN_GAP_MS = 15 * 1000;

function isHidden(doc) {
  try { return Boolean(doc && doc.visibilityState === 'hidden'); } catch (e) { return false; }
}

/**
 * Starts listening. Returns a stop function.
 * `env` lets tests pass fake window/document/timers.
 */
export function startLiveSync(onSync, {
  intervalMs = LIVE_SYNC_INTERVAL_MS,
  minGapMs = LIVE_SYNC_MIN_GAP_MS,
  env = {}
} = {}) {
  const win = env.window !== undefined ? env.window : (typeof window !== 'undefined' ? window : null);
  const doc = env.document !== undefined ? env.document : (typeof document !== 'undefined' ? document : null);
  const now = env.now || (() => Date.now());
  const setI = env.setInterval || ((fn, ms) => setInterval(fn, ms));
  const clearI = env.clearInterval || (id => clearInterval(id));
  if (!win && !doc) return () => {};

  // The page just loaded and fetched once already, so the first trigger waits a gap.
  let lastRun = now();
  let timer = null;

  const run = (force = false) => {
    if (isHidden(doc)) return;
    const t = now();
    if (!force && t - lastRun < minGapMs) return;
    lastRun = t;
    try { onSync(); } catch (e) { /* a sync failure must never break the page */ }
  };

  const startTimer = () => {
    if (timer !== null) return;
    timer = setI(() => run(true), intervalMs);
  };
  const stopTimer = () => {
    if (timer === null) return;
    clearI(timer);
    timer = null;
  };

  const onVisibility = () => {
    if (isHidden(doc)) { stopTimer(); return; }
    run();
    startTimer();
  };
  const onFocus = () => run();
  const onOnline = () => run();

  try { if (doc) doc.addEventListener('visibilitychange', onVisibility); } catch (e) {}
  try { if (win) win.addEventListener('focus', onFocus); } catch (e) {}
  try { if (win) win.addEventListener('online', onOnline); } catch (e) {}
  if (!isHidden(doc)) startTimer();

  return () => {
    stopTimer();
    try { if (doc) doc.removeEventListener('visibilitychange', onVisibility); } catch (e) {}
    try { if (win) win.removeEventListener('focus', onFocus); } catch (e) {}
    try { if (win) win.removeEventListener('online', onOnline); } catch (e) {}
  };
}

/** True when two JSON-able values are the same data (used to skip re-renders). */
export function sameData(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}
