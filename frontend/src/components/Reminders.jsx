import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, BellRing, Plus, Trash2, ChevronLeft, ChevronRight, Loader2, X, Check, Send } from 'lucide-react';
import api from '../api/axios';
import { getUserTimeZone } from '../utils/userLocation';
import {
  isPushSupported, needsHomeScreenInstall, getNotificationPermission, getCurrentSubscription,
  enablePush, disablePush, syncExistingSubscription
} from '../utils/pushNotifications';

// ── Strings (he, en; fr/es fall back to en) ──
const STRINGS = {
  he: {
    title: 'תזכורות', back: 'חזרה', add: 'תזכורת חדשה', save: 'שמור', cancel: 'ביטול', del: 'מחק', edit: 'ערוך',
    emptyTitle: 'עוד אין תזכורות', emptySub: 'כתוב לעוזר למשל: "תזכיר לי כל יום בשמונה בבוקר לקחת כדור", או הוסף כאן.',
    tryExample: 'תזכיר לי כל יום בשמונה בבוקר לקחת כדור',
    what: 'על מה להזכיר', whatPh: 'למשל: לקחת כדור', at: 'בשעה', repeat: 'חזרה',
    once: 'פעם אחת', daily: 'כל יום', weekly: 'ימים קבועים', monthly: 'כל חודש',
    onDate: 'בתאריך', whichDays: 'באילו ימים', dayOfMonth: 'ביום', ofMonth: 'בחודש',
    skipShabbat: 'אין פינגים בשבת', skipShabbatSub: 'תזכורות שנופלות בשבת ידלגו לפעם הבאה',
    everyDayAt: 'כל יום ב-', everyMonthOn: 'כל חודש ב-', onceOn: 'פעם אחת,', at2: 'ב-',
    next: 'הפינג הבא', today: 'היום', tomorrow: 'מחר', paused: 'מושהית', done: 'הסתיימה',
    pause: 'השהה', resume: 'הפעל', confirmDelete: 'למחוק את התזכורת?',
    notifTitle: 'התראות בטלפון', notifOn: 'התראות פעילות במכשיר הזה', notifOff: 'הפעל התראות כדי לקבל פינג גם כשהאפליקציה סגורה',
    notifEnable: 'הפעל התראות', notifDisable: 'כבה', notifTest: 'שלח בדיקה', notifTestSent: 'נשלחה התראת בדיקה',
    notifDenied: 'ההתראות חסומות בדפדפן. אפשר לפתוח אותן בהגדרות האתר.',
    notifUnsupported: 'המכשיר הזה לא תומך בהתראות דחיפה. תקבל פינג כשהאפליקציה פתוחה.',
    notifIos: 'באייפון: הוסף את CalendAI למסך הבית (שיתוף ← הוסף למסך הבית) ופתח משם כדי לקבל התראות.',
    notifServerOff: 'התראות דחיפה עוד לא הוגדרו בשרת. בינתיים תקבל פינג כשהאפליקציה פתוחה.',
    inAppOnly: 'פינג רק כשהאפליקציה פתוחה',
    loginNeeded: 'התחבר כדי לשמור תזכורות', login: 'התחברות', error: 'משהו השתבש, נסה שוב',
    reminder: 'תזכורת', gotIt: 'בוצע', open: 'לתזכורות', count: 'תזכורות',
    days: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
    dayLetters: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'], dayPrefix: 'ביום ', dayJoin: ', ',
    fieldErrors: { title: 'כתוב על מה להזכיר', time: 'בחר שעה', daysOfWeek: 'בחר לפחות יום אחד', date: 'בחר תאריך עתידי' }
  },
  en: {
    title: 'Reminders', back: 'Back', add: 'New reminder', save: 'Save', cancel: 'Cancel', del: 'Delete', edit: 'Edit',
    emptyTitle: 'No reminders yet', emptySub: 'Tell the assistant, e.g. "remind me every day at 8am to take a pill", or add one here.',
    tryExample: 'Remind me every day at 8am to take a pill',
    what: 'Remind me to', whatPh: 'e.g. Take a pill', at: 'At', repeat: 'Repeat',
    once: 'Once', daily: 'Every day', weekly: 'On days', monthly: 'Monthly',
    onDate: 'On', whichDays: 'Which days', dayOfMonth: 'On day', ofMonth: 'of the month',
    skipShabbat: 'No pings on Shabbat', skipShabbatSub: 'Pings that fall on Shabbat skip to the next time',
    everyDayAt: 'Every day at ', everyMonthOn: 'Monthly on day ', onceOn: 'Once,', at2: 'at ',
    next: 'Next ping', today: 'Today', tomorrow: 'Tomorrow', paused: 'Paused', done: 'Done',
    pause: 'Pause', resume: 'Resume', confirmDelete: 'Delete this reminder?',
    notifTitle: 'Phone notifications', notifOn: 'Notifications are on for this device', notifOff: 'Turn on notifications to get pinged even when the app is closed',
    notifEnable: 'Turn on', notifDisable: 'Turn off', notifTest: 'Send a test', notifTestSent: 'Test notification sent',
    notifDenied: 'Notifications are blocked in the browser. You can allow them in the site settings.',
    notifUnsupported: "This device doesn't support push notifications. You'll be pinged while the app is open.",
    notifIos: 'On iPhone: add CalendAI to your Home Screen (Share → Add to Home Screen) and open it from there to get notifications.',
    notifServerOff: "Push notifications aren't set up on the server yet. Until then you'll be pinged while the app is open.",
    inAppOnly: 'Pings only while the app is open',
    loginNeeded: 'Sign in to save reminders', login: 'Sign in', error: 'Something went wrong, try again',
    reminder: 'Reminder', gotIt: 'Done', open: 'Reminders', count: 'reminders',
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    dayLetters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], dayPrefix: '', dayJoin: ', ',
    fieldErrors: { title: 'Say what to remind you about', time: 'Pick a time', daysOfWeek: 'Pick at least one day', date: 'Pick a future date' }
  }
};

function getStrings(lang) {
  return STRINGS[lang] || STRINGS.en;
}

const EMOJIS = ['🔔', '💊', '💧', '🏃', '🧘', '📞', '🛒', '📚', '🍽️', '😴', '🐶', '🌱'];
const SHORT_DAYS = {
  he: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};

function errorMessage(err, s) {
  const data = err && err.response && err.response.data;
  if (data && data.field && s.fieldErrors[data.field]) return s.fieldErrors[data.field];
  return (data && data.error) || s.error;
}

/** "Every day at 08:00", "Mon, Thu at 18:00", … */
export function describeSchedule(r, lang) {
  const s = getStrings(lang);
  const short = SHORT_DAYS[lang] || SHORT_DAYS.en;
  switch (r.frequency) {
    case 'daily': return `${s.everyDayAt}${r.time}`;
    case 'weekly': return `${(r.daysOfWeek || []).map(d => short[d]).join(s.dayJoin)} · ${r.time}`;
    case 'monthly': return `${s.everyMonthOn}${r.dayOfMonth} · ${r.time}`;
    case 'once': {
      let date = r.date;
      try {
        const [y, m, d] = r.date.split('-').map(Number);
        date = new Date(y, m - 1, d).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' });
      } catch (e) {}
      return `${s.onceOn} ${date} · ${r.time}`;
    }
    default: return r.time;
  }
}

function dayKeyInZone(date, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch (e) {
    return date.toISOString().slice(0, 10);
  }
}

/** "Today 08:00", "Tomorrow 08:00", "Thu 18:00" — in the user's zone. */
export function describeNext(nextFireAt, lang) {
  if (!nextFireAt) return '';
  const s = getStrings(lang);
  const when = new Date(nextFireAt);
  if (isNaN(when.getTime())) return '';
  const tz = getUserTimeZone();
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  let time;
  try {
    time = when.toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch (e) {
    time = when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  const now = new Date();
  const key = dayKeyInZone(when, tz);
  if (key === dayKeyInZone(now, tz)) return `${s.today} ${time}`;
  if (key === dayKeyInZone(new Date(now.getTime() + 86400000), tz)) return `${s.tomorrow} ${time}`;
  let day;
  try {
    day = when.toLocaleDateString(locale, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  } catch (e) {
    day = when.toLocaleDateString(locale);
  }
  return `${day} ${time}`;
}

function playPing() {
  try {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 988;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + offset + 0.2);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
  } catch (e) {}
}

/** Open the reminders sheet from a ?reminders=1 link (a tapped notification). */
export function consumeRemindersParam() {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('reminders')) return false;
    params.delete('reminders');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    return true;
  } catch (e) {
    return false;
  }
}

// ── Data hook shared by the home card and the sheet ──
function useReminders(user, refreshKey) {
  const [reminders, setReminders] = useState(null);
  const [push, setPush] = useState({ available: false, publicKey: null, subscriptions: 0 });
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/api/reminders');
      setReminders(res.data.reminders || []);
      if (res.data.push) setPush(res.data.push);
    } catch (e) {
      setReminders(prev => prev || []);
    }
  }, [user]);
  useEffect(() => { load(); }, [load, refreshKey]);
  return { reminders, setReminders, push, load };
}

// ── Notifications panel ──
function NotificationsPanel({ s, lang, push }) {
  const [state, setState] = useState('checking'); // checking | on | off | denied | unsupported | ios | server-off
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const refresh = useCallback(async () => {
    if (needsHomeScreenInstall()) return setState('ios');
    if (!isPushSupported()) return setState('unsupported');
    if (!push.available) return setState('server-off');
    if (getNotificationPermission() === 'denied') return setState('denied');
    const sub = await getCurrentSubscription();
    if (sub) syncExistingSubscription();
    setState(sub && getNotificationPermission() === 'granted' ? 'on' : 'off');
  }, [push.available]);
  useEffect(() => { refresh(); }, [refresh]);

  const turnOn = async () => {
    setBusy(true); setNote('');
    const result = await enablePush(push.publicKey);
    setBusy(false);
    if (result === 'denied') setState('denied');
    else if (result === 'subscribed') setState('on');
    else setNote(s.error);
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setState('off');
  };
  const test = async () => {
    setBusy(true); setNote('');
    try {
      await api.post('/api/reminders/push/test', { lang });
      setNote(s.notifTestSent);
    } catch (e) {
      setNote(errorMessage(e, s));
    }
    setBusy(false);
  };

  if (state === 'checking') return null;
  const info = { denied: s.notifDenied, unsupported: s.notifUnsupported, ios: s.notifIos, 'server-off': s.notifServerOff }[state];
  return (
    <div className={`rounded-2xl border p-3 ${state === 'on' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-start gap-3">
        {state === 'on' ? <BellRing className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <BellOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm">{s.notifTitle}</p>
          <p className="text-sm text-slate-600">{state === 'on' ? s.notifOn : state === 'off' ? s.notifOff : info}</p>
          {note && <p className="text-sm text-slate-700 mt-1" role="status">{note}</p>}
        </div>
      </div>
      {(state === 'on' || state === 'off') && (
        <div className="flex flex-wrap gap-2 mt-3">
          {state === 'off' && (
            <button onClick={turnOn} disabled={busy} className="min-h-[44px] px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}{s.notifEnable}
            </button>
          )}
          {state === 'on' && (
            <>
              <button onClick={test} disabled={busy} className="min-h-[44px] px-4 rounded-xl bg-white border border-emerald-300 text-emerald-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{s.notifTest}
              </button>
              <button onClick={turnOff} disabled={busy} className="min-h-[44px] px-4 rounded-xl text-slate-500 text-sm">{s.notifDisable}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Editor ──
function todayKey() {
  return dayKeyInZone(new Date(), getUserTimeZone());
}

function draftFrom(r) {
  if (!r) {
    return { title: '', emoji: '🔔', time: '08:00', frequency: 'daily', daysOfWeek: [], dayOfMonth: Number(todayKey().slice(8, 10)), date: todayKey(), skipShabbat: true };
  }
  return {
    title: r.title, emoji: r.emoji || '🔔', time: r.time, frequency: r.frequency,
    daysOfWeek: r.daysOfWeek || [], dayOfMonth: r.dayOfMonth || Number(todayKey().slice(8, 10)),
    date: r.date || todayKey(), skipShabbat: r.skipShabbat !== false
  };
}

function ReminderEditor({ s, lang, isRtl, initial, onCancel, onSaved }) {
  const [draft, setDraft] = useState(() => draftFrom(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const toggleDay = d => set('daysOfWeek', draft.daysOfWeek.includes(d) ? draft.daysOfWeek.filter(x => x !== d) : [...draft.daysOfWeek, d].sort());

  const save = async () => {
    if (!draft.title.trim()) return setError(s.fieldErrors.title);
    if (draft.frequency === 'weekly' && !draft.daysOfWeek.length) return setError(s.fieldErrors.daysOfWeek);
    setSaving(true); setError('');
    try {
      const body = { ...draft, title: draft.title.trim() };
      const res = initial ? await api.patch(`/api/reminders/${initial.id}`, body) : await api.post('/api/reminders', body);
      onSaved(res.data.reminder);
    } catch (e) {
      setError(errorMessage(e, s));
      setSaving(false);
    }
  };

  const freqs = ['once', 'daily', 'weekly', 'monthly'];
  return (
    <motion.div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
      <motion.div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto overscroll-contain"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={initial ? s.edit : s.add}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-lg font-bold text-slate-800">{initial ? s.edit : s.add}</h3>
          <button onClick={onCancel} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100" aria-label={s.cancel}><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="px-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{s.what}</span>
            <input value={draft.title} onChange={e => set('title', e.target.value)} placeholder={s.whatPh} maxLength={200} autoFocus
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {EMOJIS.map(em => (
              <button key={em} onClick={() => set('emoji', em)} aria-pressed={draft.emoji === em}
                className={`w-10 h-10 shrink-0 rounded-xl text-xl flex items-center justify-center ${draft.emoji === em ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-slate-100'}`}>{em}</button>
            ))}
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{s.at}</span>
            <input type="time" value={draft.time} onChange={e => set('time', e.target.value)} dir="ltr"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </label>
          <div>
            <span className="text-sm font-medium text-slate-700">{s.repeat}</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {freqs.map(f => (
                <button key={f} onClick={() => set('frequency', f)} aria-pressed={draft.frequency === f}
                  className={`min-h-[44px] rounded-xl text-sm font-semibold border ${draft.frequency === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}`}>{s[f]}</button>
              ))}
            </div>
          </div>
          {draft.frequency === 'weekly' && (
            <div>
              <span className="text-sm font-medium text-slate-700">{s.whichDays}</span>
              <div className="mt-1 flex justify-between gap-1">
                {s.dayLetters.map((letter, d) => (
                  <button key={d} onClick={() => toggleDay(d)} aria-pressed={draft.daysOfWeek.includes(d)} aria-label={s.days[d]}
                    className={`w-10 h-10 rounded-full text-sm font-semibold ${draft.daysOfWeek.includes(d) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{letter}</button>
                ))}
              </div>
            </div>
          )}
          {draft.frequency === 'monthly' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>{s.dayOfMonth}</span>
              <select value={draft.dayOfMonth} onChange={e => set('dayOfMonth', Number(e.target.value))}
                className="rounded-xl border border-slate-300 px-3 py-2 text-base bg-white">
                {Array.from({ length: 31 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>{s.ofMonth}</span>
            </label>
          )}
          {draft.frequency === 'once' && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">{s.onDate}</span>
              <input type="date" value={draft.date} min={todayKey()} onChange={e => set('date', e.target.value)} dir="ltr"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base bg-white" />
            </label>
          )}
          {draft.frequency !== 'once' && (
            <div className="flex items-center gap-3">
              <span className="text-xl" aria-hidden="true">🕯️</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-slate-700">{s.skipShabbat}</span>
                <span className="block text-xs text-slate-500">{s.skipShabbatSub}</span>
              </span>
            </div>
          )}
          {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="flex-1 min-h-[48px] rounded-xl bg-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{s.save}
            </button>
            <button onClick={onCancel} className="min-h-[48px] px-5 rounded-xl bg-slate-100 text-slate-700 font-semibold">{s.cancel}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Full-screen sheet ──
export default function Reminders({ lang = 'he', user, onClose, onChanged, onRequireLogin }) {
  const s = getStrings(lang);
  const isRtl = lang === 'he';
  const { reminders, setReminders, push, load } = useReminders(user, 0);
  const [editing, setEditing] = useState(null); // null | 'new' | reminder
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !editing) onClose(); };
    try { document.addEventListener('keydown', onKey); } catch (e) {}
    return () => { try { document.removeEventListener('keydown', onKey); } catch (e) {} };
  }, [onClose, editing]);

  const changed = () => { load(); if (onChanged) onChanged(); };

  const toggleActive = async r => {
    setError('');
    setReminders(list => list.map(x => (x.id === r.id ? { ...x, active: !r.active } : x)));
    try {
      await api.patch(`/api/reminders/${r.id}`, { active: !r.active });
      changed();
    } catch (e) {
      setError(errorMessage(e, s));
      load();
    }
  };
  const remove = async r => {
    try { if (!window.confirm(s.confirmDelete)) return; } catch (e) {}
    setReminders(list => list.filter(x => x.id !== r.id));
    try {
      await api.delete(`/api/reminders/${r.id}`);
      changed();
    } catch (e) {
      setError(errorMessage(e, s));
      load();
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] bg-slate-50 flex flex-col"
      dir={isRtl ? 'rtl' : 'ltr'}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.2 }}
      role="dialog" aria-modal="true" aria-label={s.title}
    >
      <div className="flex items-center gap-2 px-3 bg-white border-b border-slate-200" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))', paddingBottom: '0.5rem' }}>
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100" aria-label={s.back}>
          {isRtl ? <ChevronRight className="w-6 h-6 text-slate-600" /> : <ChevronLeft className="w-6 h-6 text-slate-600" />}
        </button>
        <h2 className="flex-1 min-w-0 truncate text-lg font-bold text-slate-800">{s.title}</h2>
        {user && (
          <button onClick={() => setEditing('new')} className="min-h-[44px] px-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center gap-1.5">
            <Plus className="w-4 h-4" />{s.add}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        <div className="max-w-lg mx-auto p-4 space-y-4">
          {!user ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">🔔</div>
              <p className="font-semibold text-slate-800 mb-4">{s.loginNeeded}</p>
              <button onClick={onRequireLogin} className="min-h-[44px] px-6 rounded-xl bg-indigo-600 text-white font-semibold">{s.login}</button>
            </div>
          ) : (
            <>
              <NotificationsPanel s={s} lang={lang} push={push} />
              {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
              {reminders === null ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
              ) : reminders.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="text-5xl mb-3">⏰</div>
                  <p className="font-semibold text-slate-800">{s.emptyTitle}</p>
                  <p className="text-sm text-slate-500 mt-1">{s.emptySub}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {reminders.map(r => (
                    <li key={r.id} className={`bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3 ${r.active ? '' : 'opacity-60'}`}>
                      <span className="text-2xl w-10 h-10 shrink-0 rounded-xl bg-indigo-50 flex items-center justify-center">{r.emoji}</span>
                      <button onClick={() => setEditing(r)} className="flex-1 min-w-0 text-start">
                        <span className="block font-semibold text-slate-800 truncate">{r.title}</span>
                        <span className="block text-sm text-slate-500 truncate">{describeSchedule(r, lang)}</span>
                        <span className="block text-xs text-indigo-600 truncate">
                          {r.active && r.nextFireAt ? `${s.next}: ${describeNext(r.nextFireAt, lang)}` : (r.frequency === 'once' && r.lastFiredAt ? s.done : s.paused)}
                        </span>
                      </button>
                      <button onClick={() => toggleActive(r)} role="switch" aria-checked={r.active} aria-label={r.active ? s.pause : s.resume}
                        className={`relative w-12 h-7 shrink-0 rounded-full transition ${r.active ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${r.active ? 'start-6' : 'start-1'}`} />
                      </button>
                      <button onClick={() => remove(r)} className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label={s.del}>
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      <AnimatePresence>
        {editing && (
          <ReminderEditor
            s={s} lang={lang} isRtl={isRtl}
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); changed(); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Home card + in-app pings ──
/**
 * Shows the next reminders on the home screen and pings in the app when one
 * is due (sound + banner, and a system notification when this browser has no
 * push subscription). Push, when on, is sent by the server even if the app is
 * closed; this covers the app being open, and devices without Web Push.
 */
/**
 * Keeps the reminders list fresh, hands it to the calendar (onReminders) and
 * shows the in-app ping when one is due. Renders nothing else: reminders live
 * in the calendar, not in a card at the top of the home screen.
 */
export function RemindersPinger({ lang = 'he', user, refreshKey, onReminders }) {
  const s = getStrings(lang);
  const isRtl = lang === 'he';
  const { reminders, push, load } = useReminders(user, refreshKey);
  const [pings, setPings] = useState([]);
  const firedRef = useRef(new Set());
  const hasPushRef = useRef(false);

  useEffect(() => {
    if (onReminders) onReminders(user ? (reminders || []) : []);
  }, [user, reminders, onReminders]);

  useEffect(() => {
    let alive = true;
    getCurrentSubscription().then(sub => { if (alive) hasPushRef.current = !!sub && push.available; });
    return () => { alive = false; };
  }, [push.available, refreshKey]);

  // Refresh periodically and when the app comes back to the foreground.
  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(load, 5 * 60 * 1000);
    const onVisible = () => { try { if (document.visibilityState === 'visible') load(); } catch (e) {} };
    try { document.addEventListener('visibilitychange', onVisible); } catch (e) {}
    return () => {
      clearInterval(id);
      try { document.removeEventListener('visibilitychange', onVisible); } catch (e) {}
    };
  }, [user, load]);

  // In-app ping when a reminder's time arrives.
  useEffect(() => {
    if (!user || !reminders || !reminders.length) return undefined;
    const check = () => {
      const now = Date.now();
      let fired = false;
      for (const r of reminders) {
        if (!r.active || !r.nextFireAt) continue;
        const at = new Date(r.nextFireAt).getTime();
        const key = `${r.id}|${r.nextFireAt}`;
        if (at <= now && now - at < 5 * 60 * 1000 && !firedRef.current.has(key)) {
          firedRef.current.add(key);
          fired = true;
          playPing();
          setPings(list => [...list.filter(p => p.key !== key), { key, emoji: r.emoji, title: r.title, time: r.time }]);
          let hidden = false;
          try { hidden = document.visibilityState !== 'visible'; } catch (e) {}
          if (hidden && !hasPushRef.current && getNotificationPermission() === 'granted') {
            try { new Notification(`${r.emoji} ${r.title}`, { body: r.time, icon: '/icon.svg', tag: `reminder-${r.id}-${at}` }); } catch (e) {}
          }
        }
      }
      if (fired) setTimeout(load, 5000);
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [user, reminders, load]);

  if (!user || !reminders) return null;

  return (
    <>
      {/* In-app ping banner */}
      <div className="fixed inset-x-0 z-[95] flex flex-col items-center gap-2 px-4 pointer-events-none" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <AnimatePresence>
          {pings.map(p => (
            <motion.div key={p.key} dir={isRtl ? 'rtl' : 'ltr'} role="alert"
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-200 p-3 flex items-center gap-3">
              <span className="text-3xl shrink-0">{p.emoji}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-amber-600">{s.reminder} · <span dir="ltr">{p.time}</span></span>
                <span className="block font-bold text-slate-800 truncate">{p.title}</span>
              </span>
              <button onClick={() => setPings(list => list.filter(x => x.key !== p.key))}
                className="min-h-[44px] px-4 rounded-xl bg-amber-500 text-white font-semibold shrink-0">{s.gotIt}</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function localDayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Active reminders that ping on the given local date, sorted by time. */
export function remindersOnDate(reminders, date) {
  if (!reminders || !reminders.length || !date || isNaN(date.getTime())) return [];
  const weekday = date.getDay();
  // The server never pings on Shabbat.
  if (weekday === 6) return [];
  const key = localDayKey(date);
  return reminders.filter(r => {
    if (!r.active) return false;
    switch (r.frequency) {
      case 'daily': return true;
      case 'weekly': return (r.daysOfWeek || []).includes(weekday);
      case 'monthly': return Number(r.dayOfMonth) === date.getDate();
      case 'once': return r.date === key;
      default: return false;
    }
  }).sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** A reminder as a small amber line inside a calendar day. */
export function ReminderChip({ reminder, lang = 'he', onClick }) {
  const s = getStrings(lang);
  return (
    <button type="button" onClick={e => { e.stopPropagation(); if (onClick) onClick(reminder); }}
      title={`${s.reminder}: ${reminder.title}`}
      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 hover:bg-amber-100 transition text-start min-w-0">
      <span className="shrink-0">{reminder.emoji || '🔔'}</span>
      <span className="shrink-0 font-semibold" dir="ltr">{reminder.time}</span>
      <span className="flex-1 min-w-0 truncate">{reminder.title}</span>
      <Bell className="w-3 h-3 text-amber-500 shrink-0" />
    </button>
  );
}
