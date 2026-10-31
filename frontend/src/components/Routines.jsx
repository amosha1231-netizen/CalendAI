import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, Flame, Trophy, Share2, Users, Search, Loader2, Trash2, Edit3, Copy, ChevronLeft, ChevronRight, Globe, Lock, Minus, BarChart3, Compass, ListChecks } from 'lucide-react';
import api from '../api/axios';
import safeStorage from '../utils/safeStorage';

// ── Strings (he, en; fr/es fall back to en) ──
const STRINGS = {
  he: {
    title: 'רוטינות ואתגרים', tabToday: 'היום', tabProgress: 'איך אני עומד', tabDiscover: 'גלה',
    newRoutine: 'רוטינה חדשה', create: 'צור', save: 'שמור', cancel: 'ביטול', close: 'סגור',
    emptyTitle: 'עוד אין לך רוטינות', emptySub: 'בחר תבנית או בנה רוטינה משלך. כל יום תסמן ✓ על מה שעשית.',
    startFrom: 'התחל מתבנית', notToday: 'לא מתוכנן להיום', doneToday: 'הושלם היום',
    steps: 'שלבים', of: 'מתוך', streak: 'רצף', days: 'ימים', day: 'יום', bestStreak: 'שיא',
    allDone: 'כל הכבוד! סיימת את הרוטינה', keepGoing: 'ימים ברצף, תמשיך ככה',
    tapToCheck: 'הקש על עיגול כדי לסמן ✓',
    share: 'שתף', edit: 'ערוך', del: 'מחק', leave: 'עזוב', copyToMine: 'העתק אליי', join: 'הצטרף', joined: 'אתה בפנים',
    whoIsIn: 'מי עוד בפנים', participants: 'משתתפים', you: 'אתה',
    confirmDelete: 'למחוק את הרוטינה לכולם?', confirmLeave: 'לעזוב את הרוטינה?',
    linkCopied: 'הקישור הועתק', shareText: 'בוא תעשה איתי את',
    routine: 'רוטינה', challenge: 'אתגר', name: 'שם', namePh: 'למשל: רוטינת בוקר',
    description: 'תיאור (לא חובה)', stepPh: 'שלב, למשל: צחצוח שיניים', addStep: 'הוסף שלב',
    whichDays: 'באילו ימים', everyDay: 'כל יום', timeOfDay: 'מתי',
    morning: 'בוקר', afternoon: 'צהריים', evening: 'ערב', any: 'כל היום',
    length: 'אורך האתגר', publicLabel: 'ציבורי', publicSub: 'אחרים יוכלו למצוא ולהצטרף',
    privateSub: 'רק מי שמקבל ממך קישור', icon: 'אייקון',
    today: 'היום', avg: 'ממוצע', perfectDays: 'ימים מושלמים', last: 'ב-', lastDays: 'הימים האחרונים',
    perRoutine: 'לפי רוטינה', successRate: 'עמידה', noStats: 'סמן ✓ כמה ימים ותראה כאן איך אתה עומד ביעדים.',
    searchPh: 'חפש רוטינות ואתגרים', all: 'הכל', routines: 'רוטינות', challenges: 'אתגרים',
    noPublic: 'עוד אין כאן רוטינות ציבוריות. פרסם את שלך ותהיה הראשון!', by: 'מאת',
    loginNeeded: 'התחבר כדי לשמור רוטינות ולסמן ✓', login: 'התחברות', error: 'משהו השתבש, נסה שוב',
    sharedInvite: 'הוזמנת לרוטינה', challengeDay: 'יום', finished: 'הושלם', back: 'חזרה',
    dayLetters: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'], todayProgress: 'ההתקדמות של היום',
    routinesToday: 'הרוטינות של היום', openRoutines: 'לרוטינות',
    restTimer: 'טיימר מנוחה', restTimerSub: 'כל הקשה מפעילה ספירה לאחור, למשל מנוחה בין סטים',
    off: 'כבוי', sec: 'שנ׳', tapToRest: 'הקש להתחלת מנוחה', tapToRestart: 'הקש כדי להתחיל מחדש',
    resting: 'מנוחה', restOver: 'המנוחה נגמרה, קדימה!', stop: 'עצור'
  },
  en: {
    title: 'Routines & Challenges', tabToday: 'Today', tabProgress: 'My progress', tabDiscover: 'Discover',
    newRoutine: 'New routine', create: 'Create', save: 'Save', cancel: 'Cancel', close: 'Close',
    emptyTitle: 'No routines yet', emptySub: 'Pick a template or build your own. Every day, tick ✓ what you did.',
    startFrom: 'Start from a template', notToday: 'Not scheduled today', doneToday: 'Done today',
    steps: 'steps', of: 'of', streak: 'Streak', days: 'days', day: 'day', bestStreak: 'Best',
    allDone: 'Well done! Routine complete', keepGoing: 'days in a row, keep it up',
    tapToCheck: 'Tap a circle to tick it ✓',
    share: 'Share', edit: 'Edit', del: 'Delete', leave: 'Leave', copyToMine: 'Copy to mine', join: 'Join', joined: "You're in",
    whoIsIn: "Who's in", participants: 'participants', you: 'You',
    confirmDelete: 'Delete this routine for everyone?', confirmLeave: 'Leave this routine?',
    linkCopied: 'Link copied', shareText: 'Do this with me:',
    routine: 'Routine', challenge: 'Challenge', name: 'Name', namePh: 'e.g. Morning routine',
    description: 'Description (optional)', stepPh: 'Step, e.g. Brush teeth', addStep: 'Add step',
    whichDays: 'Which days', everyDay: 'Every day', timeOfDay: 'When',
    morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time',
    length: 'Challenge length', publicLabel: 'Public', publicSub: 'Others can find and join it',
    privateSub: 'Only people you send the link to', icon: 'Icon',
    today: 'Today', avg: 'Average', perfectDays: 'Perfect days', last: 'Last ', lastDays: 'days',
    perRoutine: 'By routine', successRate: 'Kept', noStats: 'Tick ✓ for a few days to see how you keep up with your goals.',
    searchPh: 'Search routines and challenges', all: 'All', routines: 'Routines', challenges: 'Challenges',
    noPublic: 'No public routines yet. Publish yours and be the first!', by: 'by',
    loginNeeded: 'Sign in to save routines and tick ✓', login: 'Sign in', error: 'Something went wrong, try again',
    sharedInvite: "You're invited to", challengeDay: 'Day', finished: 'Finished', back: 'Back',
    dayLetters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], todayProgress: "Today's progress",
    routinesToday: "Today's routines", openRoutines: 'Routines',
    restTimer: 'Rest timer', restTimerSub: 'Each tap starts a countdown, e.g. rest between sets',
    off: 'Off', sec: 's', tapToRest: 'Tap to start resting', tapToRestart: 'Tap to restart',
    resting: 'Resting', restOver: 'Rest is over, go!', stop: 'Stop'
  }
};

function getStrings(lang) {
  return STRINGS[lang] || STRINGS.en;
}

// Tailwind needs literal class names.
const COLORS = {
  indigo: { ring: '#6366f1', soft: 'bg-indigo-50', text: 'text-indigo-700', solid: 'bg-indigo-600' },
  violet: { ring: '#8b5cf6', soft: 'bg-violet-50', text: 'text-violet-700', solid: 'bg-violet-600' },
  sky: { ring: '#0ea5e9', soft: 'bg-sky-50', text: 'text-sky-700', solid: 'bg-sky-600' },
  emerald: { ring: '#10b981', soft: 'bg-emerald-50', text: 'text-emerald-700', solid: 'bg-emerald-600' },
  amber: { ring: '#f59e0b', soft: 'bg-amber-50', text: 'text-amber-700', solid: 'bg-amber-500' },
  rose: { ring: '#f43f5e', soft: 'bg-rose-50', text: 'text-rose-700', solid: 'bg-rose-600' },
  slate: { ring: '#64748b', soft: 'bg-slate-100', text: 'text-slate-700', solid: 'bg-slate-600' }
};
const colorOf = name => COLORS[name] || COLORS.indigo;

const EMOJIS = ['☀️', '🌙', '💪', '🏃', '🧘', '📚', '💧', '🥗', '🙏', '🧠', '✍️', '🎯', '🦷', '🛏️', '💼', '❤️'];

const TEMPLATES = {
  he: [
    { emoji: '☀️', color: 'amber', title: 'רוטינת בוקר', timeOfDay: 'morning', steps: [['🦷', 'צחצוח שיניים'], ['💧', 'כוס מים'], ['💪', 'אימון'], ['🚿', 'מקלחת'], ['🥣', 'ארוחת בוקר']] },
    { emoji: '🌙', color: 'violet', title: 'רוטינת ערב', timeOfDay: 'evening', steps: [['📵', 'בלי מסכים שעה לפני השינה'], ['📖', 'קריאה'], ['🦷', 'צחצוח שיניים'], ['✍️', '3 דברים טובים מהיום']] },
    { emoji: '💪', color: 'emerald', title: 'כושר', timeOfDay: 'any', days: [0, 2, 4], restSeconds: 45, steps: [['🔥', 'חימום'], ['🏋️', 'אימון כוח'], ['🧘', 'מתיחות']] },
    { emoji: '💧', color: 'sky', title: 'אתגר 21 יום: 8 כוסות מים', kind: 'challenge', challengeDays: 21, steps: [['💧', 'בוקר: 2 כוסות'], ['💧', 'צהריים: 3 כוסות'], ['💧', 'ערב: 3 כוסות']] }
  ],
  en: [
    { emoji: '☀️', color: 'amber', title: 'Morning routine', timeOfDay: 'morning', steps: [['🦷', 'Brush teeth'], ['💧', 'Glass of water'], ['💪', 'Workout'], ['🚿', 'Shower'], ['🥣', 'Breakfast']] },
    { emoji: '🌙', color: 'violet', title: 'Evening routine', timeOfDay: 'evening', steps: [['📵', 'No screens an hour before bed'], ['📖', 'Read'], ['🦷', 'Brush teeth'], ['✍️', '3 good things today']] },
    { emoji: '💪', color: 'emerald', title: 'Fitness', timeOfDay: 'any', days: [0, 2, 4], restSeconds: 45, steps: [['🔥', 'Warm up'], ['🏋️', 'Strength'], ['🧘', 'Stretch']] },
    { emoji: '💧', color: 'sky', title: '21-day challenge: 8 glasses of water', kind: 'challenge', challengeDays: 21, steps: [['💧', 'Morning: 2 glasses'], ['💧', 'Noon: 3 glasses'], ['💧', 'Evening: 3 glasses']] }
  ]
};

function templateToDraft(tpl) {
  return {
    title: tpl.title, emoji: tpl.emoji, color: tpl.color, description: '',
    steps: tpl.steps.map(([emoji, title]) => ({ emoji, title })),
    days: tpl.days || [], timeOfDay: tpl.timeOfDay || 'any',
    kind: tpl.kind || 'routine', challengeDays: tpl.challengeDays || 21, restSeconds: tpl.restSeconds || 0, isPublic: false
  };
}

const EMPTY_DRAFT = {
  title: '', emoji: '✨', color: 'indigo', description: '', steps: [{ emoji: '', title: '' }],
  days: [], timeOfDay: 'any', kind: 'routine', challengeDays: 21, restSeconds: 0, isPublic: false
};

const REST_PRESETS = [30, 45, 60, 90, 120];

function errorMessage(err, s) {
  return (err && err.response && err.response.data && err.response.data.error) || s.error;
}

function shareUrl(code) {
  try {
    return `${window.location.origin}/?routine=${encodeURIComponent(code)}`;
  } catch (e) {
    return `/?routine=${encodeURIComponent(code)}`;
  }
}

/** Remember a ?routine=CODE link so it opens after sign-in. */
export function consumeSharedRoutineParam() {
  try {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('routine');
    if (code) {
      safeStorage.setItem('calendai-pending-routine', code);
      params.delete('routine');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    }
    return safeStorage.getItem('calendai-pending-routine') || null;
  } catch (e) {
    return null;
  }
}

export function clearSharedRoutineParam() {
  try { safeStorage.removeItem('calendai-pending-routine'); } catch (e) {}
}

// ── Small pieces ──

function ProgressRing({ value, size = 56, stroke = 6, color = '#6366f1', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? '#10b981' : color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function Sheet({ children, onClose, isRtl, title, s, z = 'z-[70]' }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    try { document.addEventListener('keydown', onKey); } catch (e) {}
    return () => { try { document.removeEventListener('keydown', onKey); } catch (e) {} };
  }, [onClose]);
  return (
    <motion.div
      className={`fixed inset-0 ${z} bg-slate-50 flex flex-col`}
      dir={isRtl ? 'rtl' : 'ltr'}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.2 }}
      role="dialog" aria-modal="true" aria-label={title}
    >
      <div className="flex items-center gap-2 px-3 bg-white border-b border-slate-200" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))', paddingBottom: '0.5rem' }}>
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100" aria-label={s.back}>
          {isRtl ? <ChevronRight className="w-6 h-6 text-slate-600" /> : <ChevronLeft className="w-6 h-6 text-slate-600" />}
        </button>
        <h2 className="flex-1 min-w-0 truncate text-lg font-bold text-slate-800">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        {children}
      </div>
    </motion.div>
  );
}

function Celebration({ show, text, sub }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-white rounded-3xl shadow-2xl px-8 py-6 text-center mx-6"
            initial={{ scale: 0.6 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            role="status"
          >
            <div className="text-5xl mb-2">🎉</div>
            <p className="font-bold text-slate-800 text-lg">{text}</p>
            {sub && <p className="text-slate-500 text-sm mt-1">{sub}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepCircle({ step, done, onToggle, color, busy }) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      className="flex flex-col items-center gap-2 w-full select-none"
      aria-pressed={done}
      aria-label={step.title}
    >
      <motion.div
        whileTap={{ scale: 0.88 }}
        animate={{ scale: done ? [1, 1.12, 1] : 1 }}
        transition={{ duration: 0.3 }}
        className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-colors ${
          done ? 'bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-200' : 'bg-white border-slate-200'
        }`}
        style={done ? undefined : { borderColor: color }}
      >
        {done
          ? <Check className="w-10 h-10 text-white" strokeWidth={3} />
          : <span className="text-3xl leading-none">{step.emoji || '○'}</span>}
      </motion.div>
      <span className={`text-sm text-center leading-tight break-words max-w-full ${done ? 'text-emerald-700 font-semibold' : 'text-slate-700'}`}>
        {step.title}
      </span>
    </button>
  );
}

function formatClock(total) {
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Short beeps when a rest ends. The audio context is created on the tap that
// starts the timer, since iOS only unlocks audio inside a user gesture.
function beep(ctx) {
  try {
    if (!ctx) return;
    [0, 0.25, 0.5].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
  } catch (e) {}
}

/** Countdown that (re)starts on every tap, or when startSignal changes. */
function RestTimer({ seconds, color, s, startSignal }) {
  const [endAt, setEndAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [over, setOver] = useState(false);
  const audioRef = useRef(null);

  const start = useCallback(() => {
    try {
      if (!audioRef.current && typeof window !== 'undefined') {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioRef.current = new Ctx();
      }
      if (audioRef.current && audioRef.current.state === 'suspended') audioRef.current.resume();
    } catch (e) {}
    setOver(false);
    setNow(Date.now());
    setEndAt(Date.now() + seconds * 1000);
  }, [seconds]);

  const firstSignal = useRef(startSignal);
  useEffect(() => {
    if (startSignal !== firstSignal.current) start();
  }, [startSignal, start]);

  useEffect(() => {
    if (!endAt) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt) {
        setEndAt(null);
        setOver(true);
        try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) {}
        beep(audioRef.current);
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  useEffect(() => () => {
    try { if (audioRef.current) audioRef.current.close(); } catch (e) {}
  }, []);

  const running = !!endAt;
  const remaining = running ? Math.max(0, Math.ceil((endAt - now) / 1000)) : seconds;
  const elapsed = running ? 1 - (endAt - now) / (seconds * 1000) : 0;

  return (
    <div className="mt-5 rounded-3xl bg-white border border-slate-200 p-4 flex items-center gap-4">
      <button type="button" onClick={start} aria-label={running ? s.tapToRestart : s.tapToRest}
        className="shrink-0 rounded-full active:scale-95 transition-transform">
        <ProgressRing value={running ? elapsed : (over ? 1 : 0)} size={88} stroke={8} color={color}>
          <span className="text-xl font-bold text-slate-800 tabular-nums" aria-live="polite">{formatClock(remaining)}</span>
        </ProgressRing>
      </button>
      <button type="button" onClick={start} className="flex-1 min-w-0 text-start min-h-[44px]">
        <span className="block font-semibold text-slate-800">⏱️ {running ? s.resting : over ? s.restOver : s.restTimer}</span>
        <span className="block text-sm text-slate-500">{running ? s.tapToRestart : s.tapToRest}</span>
      </button>
      {running && (
        <button type="button" onClick={() => setEndAt(null)} aria-label={s.stop}
          className="w-11 h-11 shrink-0 rounded-xl text-slate-400 hover:text-slate-600 flex items-center justify-center">
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

function DayChips({ days, s }) {
  if (!days || days.length === 0) return <span>{s.everyDay}</span>;
  return <span>{days.map(d => s.dayLetters[d]).join(' · ')}</span>;
}

// ── Routine detail: circles to tick ──

function RoutineDetail({ routine, s, isRtl, onClose, onToggle, onEdit, onDelete, onCopy, onShowLeaderboard, onShare }) {
  const c = colorOf(routine.color);
  const done = new Set(routine.doneStepIds || []);
  const total = routine.steps.length;
  const count = routine.steps.filter(st => done.has(st._id)).length;
  const [celebrate, setCelebrate] = useState(false);
  const prevCount = useRef(count);
  const progress = routine.progress || {};

  useEffect(() => {
    let timer;
    if (count === total && total > 0 && prevCount.current < total) {
      setCelebrate(true);
      try { if (navigator.vibrate) navigator.vibrate([30, 50, 30]); } catch (e) {}
      timer = setTimeout(() => setCelebrate(false), 1800);
    }
    prevCount.current = count;
    return () => clearTimeout(timer);
  }, [count, total]);

  const streakAfter = (progress.currentStreak || 0);
  const restSeconds = routine.restSeconds || 0;
  // Ticking a step done starts the rest, same as tapping the timer.
  const [restSignal, setRestSignal] = useState(0);

  return (
    <Sheet onClose={onClose} isRtl={isRtl} title={`${routine.emoji} ${routine.title}`} s={s}>
      <div className="max-w-lg mx-auto px-4 pt-5">
        <div className={`rounded-3xl ${c.soft} p-5 flex items-center gap-4`}>
          <ProgressRing value={total ? count / total : 0} size={84} stroke={8} color={c.ring}>
            <span className="text-lg font-bold text-slate-800">{count}/{total}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            {routine.kind === 'challenge' && progress.challenge && (
              <p className={`text-sm font-semibold ${c.text}`}>
                {progress.challenge.finished ? `🏁 ${s.finished}` : `${s.challengeDay} ${progress.challenge.day} ${s.of} ${progress.challenge.totalDays}`}
              </p>
            )}
            <p className="text-slate-800 font-semibold">{count === total && total > 0 ? s.allDone : s.tapToCheck}</p>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1"><Flame className="w-4 h-4 text-orange-500" />{s.streak}: {streakAfter}</span>
              <span>{s.bestStreak}: {progress.bestStreak || 0}</span>
              {progress.rate != null && <span>{s.successRate}: {progress.rate}%</span>}
            </p>
          </div>
        </div>

        {routine.description && <p className="text-slate-600 text-sm mt-4">{routine.description}</p>}

        {restSeconds > 0 && <RestTimer seconds={restSeconds} color={c.ring} s={s} startSignal={restSignal} />}

        <div className="grid grid-cols-3 gap-x-3 gap-y-6 mt-6">
          {routine.steps.map(step => (
            <StepCircle
              key={step._id}
              step={step}
              done={done.has(step._id)}
              color={c.ring}
              onToggle={() => {
                const willBeDone = !done.has(step._id);
                onToggle(routine, step._id, willBeDone);
                if (willBeDone && restSeconds > 0 && count + 1 < total) setRestSignal(n => n + 1);
              }}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-8">
          <button onClick={() => onShare(routine)} className="min-h-[44px] rounded-xl bg-white border border-slate-200 text-slate-700 font-medium flex items-center justify-center gap-2">
            <Share2 className="w-4 h-4" />{s.share}
          </button>
          <button onClick={() => onShowLeaderboard(routine)} className="min-h-[44px] rounded-xl bg-white border border-slate-200 text-slate-700 font-medium flex items-center justify-center gap-2">
            <Users className="w-4 h-4" />{s.whoIsIn}{routine.participantCount > 1 ? ` (${routine.participantCount})` : ''}
          </button>
          {routine.isOwner ? (
            <button onClick={() => onEdit(routine)} className="min-h-[44px] rounded-xl bg-white border border-slate-200 text-slate-700 font-medium flex items-center justify-center gap-2">
              <Edit3 className="w-4 h-4" />{s.edit}
            </button>
          ) : (
            <button onClick={() => onCopy(routine)} className="min-h-[44px] rounded-xl bg-white border border-slate-200 text-slate-700 font-medium flex items-center justify-center gap-2">
              <Copy className="w-4 h-4" />{s.copyToMine}
            </button>
          )}
          <button onClick={() => onDelete(routine)} className="min-h-[44px] rounded-xl bg-white border border-red-200 text-red-600 font-medium flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" />{routine.isOwner ? s.del : s.leave}
          </button>
        </div>
      </div>
      <Celebration show={celebrate} text={s.allDone} sub={streakAfter > 1 ? `🔥 ${streakAfter} ${s.keepGoing}` : null} />
    </Sheet>
  );
}

// ── Create / edit ──

function RoutineEditor({ initial, s, isRtl, onClose, onSave, saving, error, lang }) {
  const [draft, setDraft] = useState(() => ({
    ...EMPTY_DRAFT,
    ...initial,
    steps: initial && initial.steps && initial.steps.length ? initial.steps.map(st => ({ ...st })) : [{ emoji: '', title: '' }]
  }));
  const isEdit = !!(initial && initial._id);
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const setStep = (i, patch) => setDraft(d => ({ ...d, steps: d.steps.map((st, j) => (j === i ? { ...st, ...patch } : st)) }));
  const toggleDay = day => setDraft(d => {
    const current = d.days.length ? d.days : [0, 1, 2, 3, 4, 5, 6];
    const next = current.includes(day) ? current.filter(x => x !== day) : [...current, day].sort();
    return { ...d, days: next.length === 7 || next.length === 0 ? [] : next };
  });
  const canSave = draft.title.trim() && draft.steps.some(st => st.title.trim());
  const templates = TEMPLATES[lang] || TEMPLATES.en;

  return (
    <Sheet onClose={onClose} isRtl={isRtl} title={isEdit ? s.edit : s.newRoutine} s={s} z="z-[80]">
      <form
        className="max-w-lg mx-auto px-4 pt-4 space-y-5"
        onSubmit={e => { e.preventDefault(); if (canSave && !saving) onSave(draft); }}
      >
        {!isEdit && (
          <div>
            <p className="text-sm font-semibold text-slate-600 mb-2">{s.startFrom}</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
              {templates.map(tpl => (
                <button type="button" key={tpl.title} onClick={() => setDraft({ ...templateToDraft(tpl), isPublic: draft.isPublic })}
                  className="shrink-0 min-h-[44px] px-3 rounded-full bg-white border border-slate-200 text-sm text-slate-700">
                  {tpl.emoji} {tpl.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 bg-slate-200/60 rounded-xl p-1" role="radiogroup">
          {['routine', 'challenge'].map(k => (
            <button type="button" key={k} role="radio" aria-checked={draft.kind === k} onClick={() => set({ kind: k })}
              className={`min-h-[40px] rounded-lg text-sm font-semibold ${draft.kind === k ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
              {k === 'routine' ? `🔁 ${s.routine}` : `🏆 ${s.challenge}`}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{s.name}</span>
          <input value={draft.title} onChange={e => set({ title: e.target.value })} maxLength={80} placeholder={s.namePh}
            className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-base bg-white" />
        </label>

        <div>
          <span className="text-sm font-semibold text-slate-600">{s.icon}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {EMOJIS.map(e => (
              <button type="button" key={e} onClick={() => set({ emoji: e })} aria-pressed={draft.emoji === e}
                className={`w-11 h-11 rounded-xl text-xl ${draft.emoji === e ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'bg-white border border-slate-200'}`}>
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {Object.keys(COLORS).map(name => (
              <button type="button" key={name} onClick={() => set({ color: name })} aria-label={name} aria-pressed={draft.color === name}
                className={`w-9 h-9 rounded-full ${COLORS[name].solid} ${draft.color === name ? 'ring-2 ring-offset-2 ring-slate-500' : ''}`} />
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-semibold text-slate-600">{s.steps}</span>
          <div className="mt-1 space-y-2">
            {draft.steps.map((st, i) => (
              <div key={st._id || `new-${i}`} className="flex items-center gap-2">
                <input value={st.emoji} onChange={e => setStep(i, { emoji: e.target.value.slice(0, 4) })} placeholder="🙂" aria-label={s.icon}
                  className="w-12 min-h-[44px] rounded-xl border border-slate-300 text-center text-base bg-white" />
                <input value={st.title} onChange={e => setStep(i, { title: e.target.value })} maxLength={80} placeholder={s.stepPh}
                  className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-slate-300 px-3 text-base bg-white" />
                <button type="button" onClick={() => setDraft(d => ({ ...d, steps: d.steps.length > 1 ? d.steps.filter((_, j) => j !== i) : [{ emoji: '', title: '' }] }))}
                  className="w-11 h-11 shrink-0 rounded-xl text-slate-400 hover:text-red-500 flex items-center justify-center" aria-label={s.del}>
                  <Minus className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          {draft.steps.length < 20 && (
            <button type="button" onClick={() => setDraft(d => ({ ...d, steps: [...d.steps, { emoji: '', title: '' }] }))}
              className="mt-2 min-h-[44px] px-3 rounded-xl text-indigo-600 font-medium flex items-center gap-1">
              <Plus className="w-4 h-4" />{s.addStep}
            </button>
          )}
        </div>

        <div>
          <span className="text-sm font-semibold text-slate-600">⏱️ {s.restTimer}</span>
          <p className="text-xs text-slate-500">{s.restTimerSub}</p>
          <div className="mt-1 flex gap-2 items-center flex-wrap">
            {[0, ...REST_PRESETS].map(n => (
              <button type="button" key={n} onClick={() => set({ restSeconds: n })} aria-pressed={(draft.restSeconds || 0) === n}
                className={`min-h-[44px] px-3 rounded-xl text-sm font-semibold ${(draft.restSeconds || 0) === n ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                {n === 0 ? s.off : `${n} ${s.sec}`}
              </button>
            ))}
            <input type="number" min={0} max={600} value={draft.restSeconds || 0}
              onChange={e => set({ restSeconds: Math.min(600, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
              aria-label={`${s.restTimer} (${s.sec})`} className="w-20 min-h-[44px] rounded-xl border border-slate-300 px-2 text-base bg-white" />
          </div>
        </div>

        <div>
          <span className="text-sm font-semibold text-slate-600">{s.whichDays}</span>
          <div className="mt-1 flex gap-1.5">
            {s.dayLetters.map((letter, day) => {
              const on = draft.days.length === 0 || draft.days.includes(day);
              return (
                <button type="button" key={day} onClick={() => toggleDay(day)} aria-pressed={on}
                  className={`flex-1 h-11 rounded-xl text-sm font-semibold ${on ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                  {letter}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{s.timeOfDay}</span>
          <select value={draft.timeOfDay} onChange={e => set({ timeOfDay: e.target.value })}
            className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-base bg-white">
            {['morning', 'afternoon', 'evening', 'any'].map(v => <option key={v} value={v}>{s[v]}</option>)}
          </select>
        </label>

        {draft.kind === 'challenge' && (
          <div>
            <span className="text-sm font-semibold text-slate-600">{s.length}</span>
            <div className="mt-1 flex gap-2 items-center flex-wrap">
              {[7, 21, 30, 60].map(n => (
                <button type="button" key={n} onClick={() => set({ challengeDays: n })} aria-pressed={draft.challengeDays === n}
                  className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold ${draft.challengeDays === n ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                  {n} {s.days}
                </button>
              ))}
              <input type="number" min={1} max={365} value={draft.challengeDays}
                onChange={e => set({ challengeDays: Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                aria-label={s.length} className="w-20 min-h-[44px] rounded-xl border border-slate-300 px-2 text-base bg-white" />
            </div>
          </div>
        )}

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{s.description}</span>
          <textarea value={draft.description} onChange={e => set({ description: e.target.value })} maxLength={300} rows={2}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base bg-white" />
        </label>

        <button type="button" onClick={() => set({ isPublic: !draft.isPublic })} aria-pressed={draft.isPublic}
          className="w-full flex items-center gap-3 rounded-xl bg-white border border-slate-200 p-3 text-start">
          {draft.isPublic ? <Globe className="w-5 h-5 text-indigo-600 shrink-0" /> : <Lock className="w-5 h-5 text-slate-400 shrink-0" />}
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-slate-800">{s.publicLabel}</span>
            <span className="block text-sm text-slate-500">{draft.isPublic ? s.publicSub : s.privateSub}</span>
          </span>
          <span className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${draft.isPublic ? 'bg-indigo-600' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${draft.isPublic ? 'start-[22px]' : 'start-0.5'}`} />
          </span>
        </button>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3" role="alert">{error}</p>}

        <button type="submit" disabled={!canSave || saving}
          className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? s.save : s.create}
        </button>
      </form>
    </Sheet>
  );
}

// ── Leaderboard ──

function Leaderboard({ routine, s, isRtl, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api.get(`/api/routines/${routine._id}/leaderboard`)
      .then(res => { if (alive) setRows(res.data.participants || []); })
      .catch(err => { if (alive) setError(errorMessage(err, s)); });
    return () => { alive = false; };
  }, [routine._id, s]);

  return (
    <Sheet onClose={onClose} isRtl={isRtl} title={`${s.whoIsIn}: ${routine.title}`} s={s} z="z-[80]">
      <div className="max-w-lg mx-auto px-4 pt-4">
        {error && <p className="text-red-600 text-sm" role="alert">{error}</p>}
        {!rows && !error && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>}
        {rows && (
          <ol className="space-y-2">
            {rows.map((row, i) => (
              <li key={i} className={`flex items-center gap-3 rounded-2xl p-3 ${row.isMe ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-slate-200'}`}>
                <span className="w-6 text-center font-bold text-slate-400">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                {row.photo
                  ? <img src={row.photo} alt="" className="w-9 h-9 rounded-full object-cover" referrerPolicy="no-referrer" />
                  : <span className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">{row.name.slice(0, 1)}</span>}
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-slate-800 truncate">{row.isMe ? s.you : row.name}{row.isOwner ? ' 👑' : ''}</span>
                  <span className="block text-xs text-slate-500">
                    {row.challenge ? `${s.challengeDay} ${row.challenge.day}/${row.challenge.totalDays} · ` : ''}
                    ✓ {row.completedDays} {s.days}{row.rate != null ? ` · ${row.rate}%` : ''}
                  </span>
                </span>
                <span className="text-sm font-semibold text-orange-600 inline-flex items-center gap-0.5"><Flame className="w-4 h-4" />{row.currentStreak}</span>
                <ProgressRing value={row.todayTotal ? row.todayDone / row.todayTotal : 0} size={32} stroke={4}>
                  {row.todayTotal > 0 && row.todayDone === row.todayTotal ? <Check className="w-4 h-4 text-emerald-600" /> : null}
                </ProgressRing>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Sheet>
  );
}

// ── Tabs ──

function RoutineCard({ routine, s, onOpen }) {
  const c = colorOf(routine.color);
  const done = new Set(routine.doneStepIds || []);
  const total = routine.steps.length;
  const count = routine.steps.filter(st => done.has(st._id)).length;
  const p = routine.progress || {};
  return (
    <button onClick={() => onOpen(routine)} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-3 text-start shadow-sm active:scale-[0.99] transition">
      <ProgressRing value={total ? count / total : 0} size={52} stroke={5} color={c.ring}>
        <span className="text-xl">{count === total && total > 0 ? '✅' : routine.emoji}</span>
      </ProgressRing>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-slate-800 truncate">{routine.title}</span>
        <span className="block text-sm text-slate-500">
          {count}/{total} {s.steps}
          {routine.kind === 'challenge' && p.challenge ? ` · ${s.challengeDay} ${p.challenge.day}/${p.challenge.totalDays}` : ''}
        </span>
      </span>
      {(p.currentStreak || 0) > 0 && (
        <span className="text-sm font-semibold text-orange-600 inline-flex items-center gap-0.5"><Flame className="w-4 h-4" />{p.currentStreak}</span>
      )}
      {routine.participantCount > 1 && (
        <span className="text-xs text-slate-500 inline-flex items-center gap-0.5"><Users className="w-3.5 h-3.5" />{routine.participantCount}</span>
      )}
    </button>
  );
}

function TodayTab({ routines, s, lang, onOpen, onCreate, onTemplate }) {
  const todays = routines.filter(r => r.progress?.scheduledToday);
  const others = routines.filter(r => !r.progress?.scheduledToday);
  const totals = todays.reduce((acc, r) => {
    const done = new Set(r.doneStepIds || []);
    acc.total += r.steps.length;
    acc.done += r.steps.filter(st => done.has(st._id)).length;
    return acc;
  }, { done: 0, total: 0 });
  const templates = TEMPLATES[lang] || TEMPLATES.en;

  if (routines.length === 0) {
    return (
      <div className="px-4 pt-8 text-center">
        <div className="text-5xl mb-3">🌱</div>
        <h3 className="text-lg font-bold text-slate-800">{s.emptyTitle}</h3>
        <p className="text-slate-500 mt-1">{s.emptySub}</p>
        <div className="mt-6 space-y-2 text-start">
          {templates.map(tpl => (
            <button key={tpl.title} onClick={() => onTemplate(tpl)} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
              <span className="text-2xl">{tpl.emoji}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-800">{tpl.title}</span>
                <span className="block text-sm text-slate-500 truncate">{tpl.steps.map(st => st[1]).join(' · ')}</span>
              </span>
              <Plus className="w-5 h-5 text-indigo-600" />
            </button>
          ))}
        </div>
        <button onClick={onCreate} className="mt-4 w-full min-h-[48px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" />{s.newRoutine}
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 space-y-3">
      {todays.length > 0 && (
        <div className="flex items-center gap-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-4 text-white">
          <ProgressRing value={totals.total ? totals.done / totals.total : 0} size={64} stroke={7} color="#ffffff">
            <span className="font-bold">{totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%</span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="font-bold text-lg">{s.todayProgress}</p>
            <p className="text-white/80 text-sm">{totals.done}/{totals.total} {s.steps}</p>
          </div>
        </div>
      )}
      {todays.map(r => <RoutineCard key={r._id} routine={r} s={s} onOpen={onOpen} />)}
      {others.length > 0 && (
        <>
          <p className="text-sm font-semibold text-slate-500 pt-2">{s.notToday}</p>
          {others.map(r => <RoutineCard key={r._id} routine={r} s={s} onOpen={onOpen} />)}
        </>
      )}
      <button onClick={onCreate} className="w-full min-h-[48px] rounded-2xl border-2 border-dashed border-indigo-300 text-indigo-600 font-semibold flex items-center justify-center gap-2">
        <Plus className="w-5 h-5" />{s.newRoutine}
      </button>
    </div>
  );
}

function ProgressTab({ s, lang, refreshKey }) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setError('');
    api.get('/api/routines/stats', { params: { days } })
      .then(res => { if (alive) setData(res.data); })
      .catch(err => { if (alive) setError(errorMessage(err, s)); });
    return () => { alive = false; };
  }, [days, s, refreshKey]);

  if (error) return <p className="px-4 pt-6 text-red-600 text-sm" role="alert">{error}</p>;
  if (!data) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;

  const hasData = data.routines.length > 0;
  const locale = lang === 'he' ? 'he-IL' : lang;
  const weekday = key => {
    try { return new Date(`${key}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'narrow', timeZone: 'UTC' }); } catch (e) { return ''; }
  };
  const cards = [
    { label: s.today, value: data.todayPercent != null ? `${data.todayPercent}%` : '—' },
    { label: s.streak, value: `🔥 ${data.currentStreak}` },
    { label: s.bestStreak, value: `🏆 ${data.bestStreak}` },
    { label: `${s.avg} ${days} ${s.days}`, value: data.averagePercent != null ? `${data.averagePercent}%` : '—' }
  ];

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{card.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{card.value}</p>
          </div>
        ))}
      </div>

      {!hasData && <p className="text-slate-500 text-sm text-center">{s.noStats}</p>}

      {hasData && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-slate-800">{s.last}{days} {s.lastDays}</p>
            <div className="flex gap-1">
              {[14, 30].map(n => (
                <button key={n} onClick={() => setDays(n)} aria-pressed={days === n}
                  className={`min-h-[32px] px-3 rounded-lg text-sm ${days === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-[3px] h-28" dir="ltr" role="img" aria-label={`${s.avg}: ${data.averagePercent ?? 0}%`}>
            {data.daily.map(d => (
              <div key={d.date} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                <div
                  className={`w-full rounded-t ${d.percent == null ? 'bg-slate-100' : d.percent === 100 ? 'bg-emerald-500' : d.percent > 0 ? 'bg-indigo-400' : 'bg-rose-200'}`}
                  style={{ height: d.percent == null ? '4px' : `${Math.max(6, d.percent)}%` }}
                  title={`${d.date}: ${d.percent == null ? '—' : d.percent + '%'}`}
                />
                {days <= 14 && <span className="text-[10px] text-slate-400 mt-1">{weekday(d.date)}</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">{s.perfectDays}: {data.perfectDays}</p>
        </div>
      )}

      {hasData && (
        <div className="space-y-2">
          <p className="font-semibold text-slate-800">{s.perRoutine}</p>
          {data.routines.map(r => (
            <div key={r.routineId} className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{r.emoji}</span>
                <span className="flex-1 min-w-0 font-semibold text-slate-800 truncate">{r.title}</span>
                <span className="text-sm text-orange-600 inline-flex items-center gap-0.5"><Flame className="w-4 h-4" />{r.currentStreak}</span>
              </div>
              <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${r.rate >= 80 ? 'bg-emerald-500' : r.rate >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${r.rate || 0}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {s.successRate}: {r.rate != null ? `${r.rate}%` : '—'} · ✓ {r.completedDays}/{r.scheduledDays} {s.days} · {s.bestStreak}: {r.bestStreak}
                {r.challenge ? ` · ${r.challenge.finished ? s.finished : `${s.challengeDay} ${r.challenge.day}/${r.challenge.totalDays}`}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiscoverTab({ s, onJoin, onCopy, onPreview, busyId }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      api.get('/api/routines/public', { params: { q: q || undefined, kind: kind === 'all' ? undefined : kind } })
        .then(res => { if (alive) { setItems(res.data.routines || []); setError(''); } })
        .catch(err => { if (alive) setError(errorMessage(err, s)); });
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, kind, s, busyId]);

  return (
    <div className="px-4 pt-4 space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={s.searchPh} aria-label={s.searchPh}
          className="w-full min-h-[44px] rounded-xl border border-slate-300 ps-9 pe-3 text-base bg-white" />
      </div>
      <div className="flex gap-2">
        {[['all', s.all], ['routine', s.routines], ['challenge', s.challenges]].map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`min-h-[36px] px-3 rounded-full text-sm font-medium ${kind === k ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{label}</button>
        ))}
      </div>
      {error && <p className="text-red-600 text-sm" role="alert">{error}</p>}
      {!items && !error && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>}
      {items && items.length === 0 && <p className="text-slate-500 text-sm text-center py-6">{s.noPublic}</p>}
      {items && items.map(r => (
        <div key={r._id} className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          <button onClick={() => onPreview(r)} className="w-full flex items-start gap-3 text-start">
            <span className={`w-12 h-12 rounded-2xl ${colorOf(r.color).soft} flex items-center justify-center text-2xl shrink-0`}>{r.emoji}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-slate-800">{r.title}</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                {r.kind === 'challenge' ? `🏆 ${s.challenge} · ${r.challengeDays} ${s.days}` : `🔁 ${s.routine}`} · <DayChips days={r.days} s={s} /> · {s.by} {r.ownerName}
              </span>
              <span className="block text-sm text-slate-600 mt-1 line-clamp-2">{r.steps.map(st => `${st.emoji || '•'} ${st.title}`).join('  ')}</span>
            </span>
          </button>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-slate-500 inline-flex items-center gap-1 flex-1"><Users className="w-3.5 h-3.5" />{r.participantCount} {s.participants}</span>
            <button onClick={() => onCopy(r)} disabled={busyId === r._id} className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm text-slate-600 inline-flex items-center gap-1">
              <Copy className="w-4 h-4" />{s.copyToMine}
            </button>
            {r.isMember ? (
              <span className="min-h-[40px] px-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold inline-flex items-center gap-1"><Check className="w-4 h-4" />{s.joined}</span>
            ) : (
              <button onClick={() => onJoin(r)} disabled={busyId === r._id} className="min-h-[40px] px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold inline-flex items-center gap-1">
                {busyId === r._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{s.join}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SharedPreview({ routine, s, isRtl, onClose, onJoin, onCopy, busy }) {
  return (
    <Sheet onClose={onClose} isRtl={isRtl} title={s.sharedInvite} s={s} z="z-[80]">
      <div className="max-w-lg mx-auto px-4 pt-6 text-center">
        <div className={`w-20 h-20 mx-auto rounded-3xl ${colorOf(routine.color).soft} flex items-center justify-center text-4xl`}>{routine.emoji}</div>
        <h3 className="text-xl font-bold text-slate-800 mt-3">{routine.title}</h3>
        <p className="text-sm text-slate-500 mt-1">
          {routine.kind === 'challenge' ? `🏆 ${s.challenge} · ${routine.challengeDays} ${s.days}` : `🔁 ${s.routine}`} · <DayChips days={routine.days} s={s} />
          {routine.ownerName ? ` · ${s.by} ${routine.ownerName}` : ''}
        </p>
        {routine.description && <p className="text-slate-600 mt-3">{routine.description}</p>}
        <ul className="mt-5 space-y-2 text-start">
          {routine.steps.map(st => (
            <li key={st._id} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
              <span className="w-9 h-9 rounded-full border-2 border-slate-200 flex items-center justify-center">{st.emoji || '○'}</span>
              <span className="text-slate-700">{st.title}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-500 mt-4 inline-flex items-center gap-1"><Users className="w-4 h-4" />{routine.participantCount} {s.participants}</p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => onCopy(routine)} disabled={busy} className="min-h-[48px] rounded-xl border border-slate-200 bg-white text-slate-700 font-medium inline-flex items-center justify-center gap-2">
            <Copy className="w-4 h-4" />{s.copyToMine}
          </button>
          {routine.isMember ? (
            <span className="min-h-[48px] rounded-xl bg-emerald-50 text-emerald-700 font-semibold inline-flex items-center justify-center gap-2"><Check className="w-4 h-4" />{s.joined}</span>
          ) : (
            <button onClick={() => onJoin(routine)} disabled={busy} className="min-h-[48px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold inline-flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{s.join}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

// ── Main screen ──

export default function Routines({ lang = 'he', user, onClose, initialTab = 'today', sharedCode = null, onSharedHandled, onRequireLogin, onChanged }) {
  const s = getStrings(lang);
  const isRtl = lang === 'he';
  const [tab, setTab] = useState(initialTab);
  const [routines, setRoutines] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [editor, setEditor] = useState(null); // { initial }
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [leaderboardFor, setLeaderboardFor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');
  const [statsKey, setStatsKey] = useState(0);

  const showToast = useCallback(msg => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/api/routines');
      setRoutines(res.data.routines || []);
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err, s));
      setRoutines(r => r || []);
    }
  }, [user, s]);

  useEffect(() => { load(); }, [load]);

  // A shared link (?routine=CODE) opens its preview.
  useEffect(() => {
    if (!sharedCode) return;
    let alive = true;
    api.get(`/api/routines/share/${encodeURIComponent(sharedCode)}`)
      .then(res => { if (alive) setPreview(res.data.routine); })
      .catch(err => { if (alive) showToast(errorMessage(err, s)); })
      .finally(() => { if (onSharedHandled) onSharedHandled(); });
    return () => { alive = false; };
  }, [sharedCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    } catch (e) { return undefined; }
  }, []);

  const notifyChanged = useCallback(() => {
    setStatsKey(k => k + 1);
    if (onChanged) onChanged();
  }, [onChanged]);

  const openRoutine = useMemo(() => (routines || []).find(r => r._id === openId) || null, [routines, openId]);

  const patchRoutine = (id, patch) => setRoutines(list => (list || []).map(r => (r._id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));

  const toggleStep = async (routine, stepId, done) => {
    const before = routine.doneStepIds || [];
    const optimistic = done ? [...new Set([...before, stepId])] : before.filter(id => id !== stepId);
    patchRoutine(routine._id, { doneStepIds: optimistic });
    try {
      const res = await api.post(`/api/routines/${routine._id}/check`, { stepId, done });
      patchRoutine(routine._id, r => {
        const progress = { ...(r.progress || {}), todayDone: res.data.done };
        // A newly completed day extends the streak right away.
        const wasComplete = before.length > 0 && r.steps.every(st => before.includes(st._id));
        if (res.data.completed && !wasComplete) {
          progress.currentStreak = (progress.currentStreak || 0) + 1;
          progress.bestStreak = Math.max(progress.bestStreak || 0, progress.currentStreak);
        } else if (!res.data.completed && wasComplete) {
          progress.currentStreak = Math.max(0, (progress.currentStreak || 0) - 1);
        }
        return { doneStepIds: res.data.doneStepIds, progress };
      });
      notifyChanged();
    } catch (err) {
      patchRoutine(routine._id, { doneStepIds: before });
      showToast(errorMessage(err, s));
    }
  };

  const saveRoutine = async draft => {
    setSaving(true);
    setEditorError('');
    const body = {
      ...draft,
      steps: draft.steps.filter(st => st.title.trim()).map(st => ({ _id: st._id, title: st.title.trim(), emoji: (st.emoji || '').trim() }))
    };
    try {
      if (draft._id) {
        await api.put(`/api/routines/${draft._id}`, body);
      } else {
        const res = await api.post('/api/routines', body);
        setOpenId(res.data.routine._id);
      }
      setEditor(null);
      await load();
      notifyChanged();
    } catch (err) {
      setEditorError(errorMessage(err, s));
    } finally {
      setSaving(false);
    }
  };

  const deleteRoutine = async routine => {
    const ok = typeof window !== 'undefined' && window.confirm(routine.isOwner ? s.confirmDelete : s.confirmLeave);
    if (!ok) return;
    try {
      await api.delete(`/api/routines/${routine._id}`);
      setOpenId(null);
      setRoutines(list => (list || []).filter(r => r._id !== routine._id));
      notifyChanged();
    } catch (err) {
      showToast(errorMessage(err, s));
    }
  };

  const joinRoutine = async routine => {
    if (!user) { if (onRequireLogin) onRequireLogin(); return; }
    setBusyId(routine._id);
    try {
      const res = await api.post(`/api/routines/${routine._id}/join`, { code: routine.shareCode });
      await load();
      setPreview(null);
      setTab('today');
      setOpenId(res.data.routine._id);
      notifyChanged();
    } catch (err) {
      showToast(errorMessage(err, s));
    } finally {
      setBusyId(null);
    }
  };

  const copyRoutine = async routine => {
    if (!user) { if (onRequireLogin) onRequireLogin(); return; }
    setBusyId(routine._id);
    try {
      const res = await api.post(`/api/routines/${routine._id}/copy`, { code: routine.shareCode });
      await load();
      setPreview(null);
      setTab('today');
      setOpenId(res.data.routine._id);
      notifyChanged();
    } catch (err) {
      showToast(errorMessage(err, s));
    } finally {
      setBusyId(null);
    }
  };

  const shareRoutine = async routine => {
    const url = shareUrl(routine.shareCode);
    const text = `${s.shareText} ${routine.emoji} ${routine.title}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: routine.title, text, url });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast(s.linkCopied);
    } catch (e) {
      try { window.prompt(s.share, url); } catch (e2) {}
    }
  };

  const tabs = [
    { id: 'today', label: s.tabToday, Icon: ListChecks },
    { id: 'progress', label: s.tabProgress, Icon: BarChart3 },
    { id: 'discover', label: s.tabDiscover, Icon: Compass }
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col" dir={isRtl ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" aria-label={s.title}>
      <div className="bg-white border-b border-slate-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg mx-auto flex items-center gap-2 px-3 py-2">
          <h2 className="flex-1 min-w-0 truncate text-lg font-bold text-slate-800">{s.title}</h2>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100" aria-label={s.close}>
            <X className="w-6 h-6 text-slate-600" />
          </button>
        </div>
        <div className="max-w-lg mx-auto grid grid-cols-3 px-3" role="tablist">
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-semibold border-b-2 transition ${
                tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'
              }`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        <div className="max-w-lg mx-auto">
          {!user && tab !== 'discover' ? (
            <div className="px-4 pt-10 text-center">
              <div className="text-5xl mb-3">🔐</div>
              <p className="text-slate-700">{s.loginNeeded}</p>
              <button onClick={onRequireLogin} className="mt-4 min-h-[48px] px-6 rounded-xl bg-indigo-600 text-white font-bold">{s.login}</button>
            </div>
          ) : tab === 'today' ? (
            routines === null
              ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
              : (
                <>
                  {loadError && <p className="px-4 pt-4 text-red-600 text-sm" role="alert">{loadError}</p>}
                  <TodayTab
                    routines={routines} s={s} lang={lang}
                    onOpen={r => setOpenId(r._id)}
                    onCreate={() => { setEditorError(''); setEditor({ initial: null }); }}
                    onTemplate={tpl => { setEditorError(''); setEditor({ initial: templateToDraft(tpl) }); }}
                  />
                </>
              )
          ) : tab === 'progress' ? (
            <ProgressTab s={s} lang={lang} refreshKey={statsKey} />
          ) : (
            <DiscoverTab s={s} busyId={busyId} onJoin={joinRoutine} onCopy={copyRoutine} onPreview={r => setPreview(r)} />
          )}
        </div>
      </div>

      <AnimatePresence>
        {openRoutine && (
          <RoutineDetail
            key="detail"
            routine={openRoutine} s={s} isRtl={isRtl}
            onClose={() => setOpenId(null)}
            onToggle={toggleStep}
            onEdit={r => { setEditorError(''); setEditor({ initial: r }); }}
            onDelete={deleteRoutine}
            onCopy={copyRoutine}
            onShare={shareRoutine}
            onShowLeaderboard={r => setLeaderboardFor(r)}
          />
        )}
        {editor && (
          <RoutineEditor
            key="editor"
            initial={editor.initial} s={s} isRtl={isRtl} lang={lang}
            onClose={() => setEditor(null)} onSave={saveRoutine} saving={saving} error={editorError}
          />
        )}
        {leaderboardFor && (
          <Leaderboard key="board" routine={leaderboardFor} s={s} isRtl={isRtl} onClose={() => setLeaderboardFor(null)} />
        )}
        {preview && !leaderboardFor && (
          <SharedPreview
            key="preview"
            routine={preview} s={s} isRtl={isRtl} busy={busyId === preview._id}
            onClose={() => setPreview(null)} onJoin={joinRoutine} onCopy={copyRoutine}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed left-4 right-4 z-[95] mx-auto max-w-sm bg-slate-800 text-white text-sm rounded-xl px-4 py-3 text-center shadow-lg"
            style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            role="status"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Compact card for the home screen: today's routines at a glance. */
export function RoutinesTodayCard({ lang = 'he', user, onOpen, refreshKey }) {
  const s = getStrings(lang);
  const [routines, setRoutines] = useState(null);
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    api.get('/api/routines')
      .then(res => { if (alive) setRoutines(res.data.routines || []); })
      .catch(() => { if (alive) setRoutines([]); });
    return () => { alive = false; };
  }, [user, refreshKey]);

  if (!user || !routines) return null;
  const todays = routines.filter(r => r.progress?.scheduledToday);
  if (todays.length === 0) {
    return (
      <button onClick={() => onOpen('today')} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-dashed border-indigo-300 p-3 text-start">
        <span className="text-2xl">🌱</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-slate-800">{s.newRoutine}</span>
          <span className="block text-sm text-slate-500 truncate">{s.emptySub}</span>
        </span>
        <Plus className="w-5 h-5 text-indigo-600 shrink-0" />
      </button>
    );
  }
  return (
    <button onClick={() => onOpen('today')} className="w-full bg-white rounded-2xl border border-slate-200 p-3 text-start shadow-sm">
      <span className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-800 flex items-center gap-1.5"><ListChecks className="w-4 h-4 text-indigo-600" />{s.routinesToday}</span>
        <span className="text-sm text-indigo-600">{s.openRoutines}</span>
      </span>
      <span className="flex gap-3 overflow-x-auto">
        {todays.map(r => {
          const done = new Set(r.doneStepIds || []);
          const count = r.steps.filter(st => done.has(st._id)).length;
          return (
            <span key={r._id} className="flex flex-col items-center gap-1 shrink-0 w-16">
              <ProgressRing value={r.steps.length ? count / r.steps.length : 0} size={48} stroke={5} color={colorOf(r.color).ring}>
                <span className="text-lg">{count === r.steps.length && count > 0 ? '✅' : r.emoji}</span>
              </ProgressRing>
              <span className="text-[11px] text-slate-600 text-center leading-tight line-clamp-2">{r.title}</span>
            </span>
          );
        })}
      </span>
    </button>
  );
}
