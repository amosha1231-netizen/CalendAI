/**
 * Smart alarm engine: a synthesized ringtone whose volume climbs gradually,
 * math challenges for dismissal, and the time helpers the scheduler needs.
 *
 * The sound is generated with the Web Audio API (no audio files), so it can
 * ramp volume on iOS where HTMLAudioElement.volume is read-only. Browsers only
 * let audio start after a tap, so `unlockAlarmAudio()` must be called from the
 * user's gesture (arming the alarm, or tapping the ringing screen).
 *
 * Nothing here touches window/navigator at import time.
 */

import safeStorage from './safeStorage';

export const ALARM_STORAGE_KEY = 'calendai-smart-alarm';
export const ALARM_RINGING_KEY = 'calendai-smart-alarm-ringing';

// Alarms that fire this long after their time (app was closed) are skipped.
export const MISSED_ALARM_GRACE_MS = 30 * 60 * 1000;

export const DEFAULT_ALARM = {
  enabled: false,
  time: '07:00',
  repeatDaily: false,
  escalationSeconds: 60,
  mathEnabled: true,
  mathCount: 3,
  difficulty: 'medium',
  snoozeMinutes: 0, // 0 = snooze disabled
  keepScreenAwake: true,
  prepMinutes: 60,
  nextFireAt: null
};

// ── Storage ──────────────────────────────────────────────────────────────

export function loadAlarm() {
  try {
    const raw = safeStorage.getItem(ALARM_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ALARM };
    return { ...DEFAULT_ALARM, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_ALARM };
  }
}

export function saveAlarm(alarm) {
  try {
    safeStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarm));
  } catch (e) {}
}

export function loadRinging() {
  try {
    const raw = safeStorage.getItem(ALARM_RINGING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveRinging(ringing) {
  try {
    if (ringing) safeStorage.setItem(ALARM_RINGING_KEY, JSON.stringify(ringing));
    else safeStorage.removeItem(ALARM_RINGING_KEY);
  } catch (e) {}
}

// ── Time helpers ─────────────────────────────────────────────────────────

/** Parse "07:30", "7:30 AM" or "19:05" into minutes since midnight, or null. */
export function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3]) {
    const pm = m[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToTime(total) {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Next timestamp (ms) at which "HH:mm" occurs, strictly after `from`. */
export function computeNextFireAt(time, from = Date.now()) {
  const minutes = parseTimeToMinutes(time);
  if (minutes == null) return null;
  const now = new Date(from);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (target.getTime() <= from) target.setDate(target.getDate() + 1);
  return target.getTime();
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * First timed event on `date`'s weekday in a schedule keyed by weekday name
 * ({ Monday: [{ title, startTime }], ... }). Returns { title, minutes } or null.
 */
export function findFirstEventOn(schedule, date) {
  if (!schedule || !date) return null;
  const events = schedule[WEEKDAYS[date.getDay()]] || [];
  let first = null;
  for (const ev of events) {
    const minutes = parseTimeToMinutes(ev?.startTime);
    if (minutes == null) continue;
    if (!first || minutes < first.minutes) first = { title: ev.title || '', minutes };
  }
  return first;
}

export function findFirstEventTomorrow(schedule, now = new Date()) {
  return findFirstEventOn(schedule, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

// ── Math challenges ──────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Returns { question, answer } with a non-negative integer answer. */
export function generateMathProblem(difficulty = 'medium') {
  if (difficulty === 'easy') {
    const a = randInt(2, 20);
    const b = randInt(2, 20);
    if (Math.random() < 0.5) return { question: `${a} + ${b}`, answer: a + b };
    const [hi, lo] = a >= b ? [a, b] : [b, a];
    return { question: `${hi} − ${lo}`, answer: hi - lo };
  }
  if (difficulty === 'hard') {
    const a = randInt(12, 39);
    const b = randInt(3, 9);
    const c = randInt(11, 99);
    if (Math.random() < 0.5) return { question: `${a} × ${b} + ${c}`, answer: a * b + c };
    // Keep the result positive: a*b >= 36 and c may exceed it, so clamp c.
    const c2 = Math.min(c, a * b - 1);
    return { question: `${a} × ${b} − ${c2}`, answer: a * b - c2 };
  }
  // medium
  const kind = randInt(0, 2);
  if (kind === 0) {
    const a = randInt(12, 89);
    const b = randInt(12, 89);
    return { question: `${a} + ${b}`, answer: a + b };
  }
  if (kind === 1) {
    const a = randInt(40, 99);
    const b = randInt(11, a - 1);
    return { question: `${a} − ${b}`, answer: a - b };
  }
  const a = randInt(3, 9);
  const b = randInt(3, 9);
  const c = randInt(5, 30);
  return { question: `${a} × ${b} + ${c}`, answer: a * b + c };
}

// ── Sound ────────────────────────────────────────────────────────────────

let audioCtx = null;

function getAudioContext() {
  try {
    if (audioCtx) return audioCtx;
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch (e) {
    return null;
  }
}

/** Call from a tap handler so the alarm can play sound later. */
export function unlockAlarmAudio() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // A silent blip inside the gesture is what actually unlocks iOS.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    return true;
  } catch (e) {
    return false;
  }
}

export function isAlarmAudioRunning() {
  try {
    return !!audioCtx && audioCtx.state === 'running';
  } catch (e) {
    return false;
  }
}

// One "ring" is a rising four-note figure; louder stages add a brighter layer.
const RING_NOTES = [523.25, 659.25, 783.99, 1046.5];
const RING_PERIOD_MS = 1400;

/**
 * Start the escalating ringtone. Volume climbs from a whisper to full over
 * `escalationSeconds`, then a sharper square-wave layer joins in.
 * Returns a controller: { stop() }.
 */
export function startEscalatingAlarm({ escalationSeconds = 60 } = {}) {
  const ctx = getAudioContext();
  let stopped = false;
  let timer = null;
  let vibrateTimer = null;
  const startedAt = Date.now();

  if (ctx) {
    try { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); } catch (e) {}
  }

  let master = null;
  if (ctx) {
    try {
      master = ctx.createGain();
      master.gain.setValueAtTime(0.03, ctx.currentTime);
      master.gain.linearRampToValueAtTime(1, ctx.currentTime + Math.max(1, escalationSeconds));
      master.connect(ctx.destination);
    } catch (e) {
      master = null;
    }
  }

  const playRing = () => {
    if (stopped || !ctx || !master) return;
    try {
      const elapsed = (Date.now() - startedAt) / 1000;
      const intense = elapsed >= escalationSeconds;
      const t0 = ctx.currentTime + 0.02;
      RING_NOTES.forEach((freq, i) => {
        const start = t0 + i * 0.16;
        const layers = intense ? ['triangle', 'square'] : ['triangle'];
        layers.forEach(type => {
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(type === 'square' ? freq * 2 : freq, start);
          const peak = type === 'square' ? 0.12 : 0.5;
          env.gain.setValueAtTime(0.0001, start);
          env.gain.exponentialRampToValueAtTime(peak, start + 0.02);
          env.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
          osc.connect(env);
          env.connect(master);
          osc.start(start);
          osc.stop(start + 0.16);
        });
      });
    } catch (e) {}
  };

  playRing();
  timer = setInterval(playRing, RING_PERIOD_MS);

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const buzz = () => { try { navigator.vibrate([400, 200, 400]); } catch (e) {} };
      buzz();
      vibrateTimer = setInterval(buzz, 2000);
    }
  } catch (e) {}

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (vibrateTimer) clearInterval(vibrateTimer);
      try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(0); } catch (e) {}
      try {
        if (master && ctx) {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setValueAtTime(0, ctx.currentTime);
          setTimeout(() => { try { master.disconnect(); } catch (e) {} }, 300);
        }
      } catch (e) {}
    }
  };
}

/** Short preview so the user can hear the tone while configuring. */
export function previewAlarmSound() {
  unlockAlarmAudio();
  const ctrl = startEscalatingAlarm({ escalationSeconds: 2 });
  setTimeout(() => ctrl.stop(), 3000);
  return ctrl;
}
