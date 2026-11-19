import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatTimeString } from '../utils/timeFormat';
import { Plus, X, Check, ArrowUp, Trash2, Search, Loader2, Trophy } from 'lucide-react';
import api from '../api/axios';
import {
  loadDailyTasks, addDailyTask, removeDailyTask, buildTodayItems, loadTodayStatuses,
  markTodayItem, EXAMPLES, TASKS_CHANGED_EVENT, notifyTasksChanged
} from '../utils/dailyTasks';

const STR = {
  he: {
    title: 'המשימות של היום',
    of: '{done} מתוך {total}',
    emptyTitle: 'משימות',
    emptySub: 'כתבו משימה, למשל ״לשתות 3 ליטר מים״',
    add: 'הוספה',
    swipeRight: 'בוצע',
    swipeLeft: 'לא בוצע',
    swipeUp: 'דחייה',
    tapOutside: 'לחיצה בחוץ סוגרת',
    allDone: 'סימנת את כל המשימות 🎉',
    position: '{i} מתוך {n}',
    sheetTitle: 'משימות ואתגרים',
    placeholder: 'משימה חדשה...',
    examples: 'רעיונות',
    mine: 'המשימות שלי',
    calendar: 'מהיומן',
    challenges: 'אתגרים',
    challengesSub: 'מצטרפים, והאתגר מופיע כל יום במשימות',
    join: 'הצטרפות',
    joined: 'במשימות',
    days: '{n} ימים',
    people: '{n} משתתפים',
    remove: 'הסרה',
    challenge: 'אתגר',
    noTasks: 'עוד אין משימות. כתבו אחת או בחרו מהרעיונות.',
    failed: 'לא נשמר. נסו שוב.',
    close: 'סגירה'
  },
  en: {
    title: "Today's tasks",
    of: '{done} of {total}',
    emptyTitle: 'Tasks',
    emptySub: 'Write a task, e.g. "Drink 3 liters of water"',
    add: 'Add',
    swipeRight: 'Done',
    swipeLeft: 'Not done',
    swipeUp: 'Later',
    tapOutside: 'Tap outside to close',
    allDone: 'All tasks marked 🎉',
    position: '{i} of {n}',
    sheetTitle: 'Tasks and challenges',
    placeholder: 'New task...',
    examples: 'Ideas',
    mine: 'My tasks',
    calendar: 'From the calendar',
    challenges: 'Challenges',
    challengesSub: 'Join one and it shows up in your tasks every day',
    join: 'Join',
    joined: 'In tasks',
    days: '{n} days',
    people: '{n} joined',
    remove: 'Remove',
    challenge: 'Challenge',
    noTasks: 'No tasks yet. Write one or pick an idea.',
    failed: 'Not saved. Try again.',
    close: 'Close'
  }
};
const strings = lang => STR[lang] || STR.en;
const fill = (s, vars) => Object.keys(vars).reduce((acc, k) => acc.split(`{${k}}`).join(String(vars[k])), s);

const RING = {
  done: 'bg-emerald-500 border-emerald-500 text-white',
  missed: 'bg-rose-500 border-rose-500 text-white',
  postponed: 'bg-amber-400 border-amber-400 text-white'
};

/** Loads today's items and their marks, and keeps them fresh. */
function useTodayTasks({ user, todayEvents, lang }) {
  const [tasks, setTasks] = useState(null);
  const [statuses, setStatuses] = useState({});
  const reload = useCallback(async () => {
    const [t, st] = await Promise.all([loadDailyTasks(user), loadTodayStatuses(user)]);
    setTasks(t);
    setStatuses(st);
  }, [user]);
  useEffect(() => {
    reload();
    const onChange = () => reload();
    try { window.addEventListener(TASKS_CHANGED_EVENT, onChange); } catch (e) {}
    return () => { try { window.removeEventListener(TASKS_CHANGED_EVENT, onChange); } catch (e) {} };
  }, [reload]);
  const items = useMemo(() => buildTodayItems({ todayEvents, dailyTasks: tasks || [], lang }), [todayEvents, tasks, lang]);
  return { items, tasks, statuses, setStatuses, reload, loaded: tasks !== null };
}

function Circle({ item, status, size = 56, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 shrink-0 w-[68px] active:scale-95 transition">
      <span
        className={`rounded-full border-[3px] flex items-center justify-center text-2xl shadow-sm ${status ? RING[status] : 'bg-white border-violet-300'}`}
        style={{ width: size, height: size }}
      >
        {status === 'done' ? <Check className="w-6 h-6" strokeWidth={3} /> : status === 'missed' ? <X className="w-6 h-6" strokeWidth={3} /> : status === 'postponed' ? <ArrowUp className="w-6 h-6" strokeWidth={3} /> : item.emoji}
      </span>
      <span className="text-[11px] text-slate-600 text-center leading-tight line-clamp-2 w-full">{item.title}</span>
    </button>
  );
}

/**
 * Home card: one circle per task. Shown only when there is a task; otherwise a
 * small "write a task" entry. Tapping a circle opens it in the middle to swipe.
 */
export function TasksTodayCard({ lang = 'he', user, todayEvents, onManage }) {
  const s = strings(lang);
  const { items, statuses, setStatuses, loaded } = useTodayTasks({ user, todayEvents, lang });
  const [focusIndex, setFocusIndex] = useState(null);

  if (!loaded) return null;
  if (items.length === 0) {
    return (
      <button onClick={onManage} className="w-full flex items-center gap-3 bg-white rounded-[22px] border border-dashed border-violet-300 p-3 text-start">
        <span className="w-11 h-11 rounded-full border-[3px] border-dashed border-violet-300 flex items-center justify-center text-xl">✓</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-slate-800">{s.emptyTitle}</span>
          <span className="block text-sm text-slate-500 truncate">{s.emptySub}</span>
        </span>
        <Plus className="w-5 h-5 text-violet-600 shrink-0" />
      </button>
    );
  }
  const done = items.filter(i => statuses[i.key] === 'done').length;
  return (
    <div className="bg-white rounded-[22px] shadow-soft p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-bold text-slate-800">{s.title}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">{fill(s.of, { done, total: items.length })}</span>
          <button onClick={onManage} aria-label={s.add} className="w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {items.map((item, i) => (
          <Circle key={item.key} item={item} status={statuses[item.key]} onClick={() => setFocusIndex(i)} />
        ))}
      </div>
      {focusIndex !== null && (
        <TaskFocus
          lang={lang}
          user={user}
          items={items}
          startIndex={focusIndex}
          statuses={statuses}
          onMarked={(key, status) => setStatuses(prev => ({ ...prev, [key]: status }))}
          onClose={() => setFocusIndex(null)}
        />
      )}
    </div>
  );
}

const THRESHOLD = 80;
const FLY_MS = 200;

/**
 * The task opens in the middle. Swipe right = done (green), left = not done
 * (red), up = postpone; then the next task comes. Tap outside to leave.
 */
export function TaskFocus({ lang = 'he', user, items, startIndex = 0, statuses, onMarked, onClose }) {
  const s = strings(lang);
  const [index, setIndex] = useState(Math.min(startIndex, items.length - 1));
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState(null); // 'done' | 'missed' | 'postponed'
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const start = useRef(null);
  const item = items[index];

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') commit('done');
      if (e.key === 'ArrowLeft') commit('missed');
      if (e.key === 'ArrowUp') commit('postponed');
    };
    try { window.addEventListener('keydown', onKey); } catch (e) {}
    return () => { try { window.removeEventListener('keydown', onKey); } catch (e) {} };
  });

  const nextIndex = (marked) => {
    // The next task without a mark, after this one (wrapping around).
    for (let step = 1; step < items.length; step += 1) {
      const j = (index + step) % items.length;
      if (!marked[items[j].key]) return j;
    }
    return null;
  };

  const commit = (status) => {
    if (!item || leaving) return;
    setLeaving(status);
    setError('');
    const previous = statuses[item.key];
    const marked = { ...statuses, [item.key]: status };
    onMarked && onMarked(item.key, status);
    // Save in the background: the next task comes right away instead of
    // waiting for the server. If the save fails, the mark is undone.
    const saving = item;
    Promise.resolve()
      .then(() => markTodayItem(user, saving, status))
      .catch(() => {
        onMarked && onMarked(saving.key, previous);
        setError(s.failed);
      });
    setTimeout(() => {
      setLeaving(null);
      setDrag({ x: 0, y: 0, active: false });
      const j = nextIndex(marked);
      if (j === null) {
        setFinished(true);
        setTimeout(onClose, 1100);
      } else {
        setIndex(j);
      }
    }, FLY_MS);
  };

  const onPointerDown = e => {
    if (leaving) return;
    start.current = { x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    setDrag({ x: 0, y: 0, active: true });
  };
  const onPointerMove = e => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    const { x, y } = drag;
    if (-y > THRESHOLD && -y > Math.abs(x)) commit('postponed');
    else if (x > THRESHOLD) commit('done');
    else if (x < -THRESHOLD) commit('missed');
    else setDrag({ x: 0, y: 0, active: false });
  };

  const intent = leaving || (-drag.y > 30 && -drag.y > Math.abs(drag.x) ? 'postponed' : drag.x > 30 ? 'done' : drag.x < -30 ? 'missed' : null);
  const fly = leaving === 'done' ? 'translate(140vw, 0) rotate(25deg)'
    : leaving === 'missed' ? 'translate(-140vw, 0) rotate(-25deg)'
    : leaving === 'postponed' ? 'translate(0, -110vh)'
    : `translate(${drag.x}px, ${Math.min(drag.y, 40)}px) rotate(${drag.x / 18}deg)`;
  const glow = intent === 'done' ? 'shadow-[0_0_0_10px_rgba(16,185,129,.35)] border-emerald-400'
    : intent === 'missed' ? 'shadow-[0_0_0_10px_rgba(244,63,94,.35)] border-rose-400'
    : intent === 'postponed' ? 'shadow-[0_0_0_10px_rgba(251,191,36,.4)] border-amber-300'
    : 'border-white/70';
  const status = item ? statuses[item.key] : null;

  const overlay = (
    <div className="fixed inset-0 z-[10001] select-none" dir="ltr" role="dialog" aria-modal="true" aria-label={item?.title || s.title}>
      <div className="absolute inset-0 bg-[#140F2E]/80 backdrop-blur-sm" onClick={onClose} />

      {/* Direction hints (physical sides, as on the phone) */}
      <div className={`pointer-events-none absolute top-1/2 -translate-y-1/2 left-3 flex flex-col items-center gap-1 transition ${intent === 'missed' ? 'opacity-100 scale-110' : 'opacity-60'}`}>
        <span className="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center"><X className="w-6 h-6" strokeWidth={3} /></span>
        <span className="text-white text-xs font-bold">{s.swipeLeft}</span>
      </div>
      <div className={`pointer-events-none absolute top-1/2 -translate-y-1/2 right-3 flex flex-col items-center gap-1 transition ${intent === 'done' ? 'opacity-100 scale-110' : 'opacity-60'}`}>
        <span className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center"><Check className="w-6 h-6" strokeWidth={3} /></span>
        <span className="text-white text-xs font-bold">{s.swipeRight}</span>
      </div>
      <div className={`pointer-events-none absolute top-[12%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 transition ${intent === 'postponed' ? 'opacity-100 scale-110' : 'opacity-60'}`}>
        <span className="w-12 h-12 rounded-full bg-amber-400 text-white flex items-center justify-center"><ArrowUp className="w-6 h-6" strokeWidth={3} /></span>
        <span className="text-white text-xs font-bold">{s.swipeUp}</span>
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {finished ? (
          <div className="text-white text-xl font-extrabold">{s.allDone}</div>
        ) : item ? (
          <>
            <div
              key={item.key}
              className={`pointer-events-auto touch-none w-56 h-56 rounded-full bg-white border-[6px] flex flex-col items-center justify-center text-center px-6 cursor-grab ${glow}`}
              style={{ transform: fly, transition: drag.active && !leaving ? 'none' : `transform ${FLY_MS}ms ease, box-shadow 160ms` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <span className="text-5xl mb-2">{item.emoji}</span>
              <span dir="auto" className="text-[17px] font-extrabold text-slate-900 leading-snug line-clamp-3">{item.title}</span>
              {item.time && <span className="text-xs text-slate-400 mt-1" dir="ltr">{formatTimeString(item.time, lang)}</span>}
              {item.source === 'challenge' && <span className="mt-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 rounded-full px-2 py-0.5">{s.challenge}</span>}
            </div>
            <div className="mt-8 flex items-center gap-1.5">
              {items.map((it, i) => (
                <span key={it.key} className={`h-2 rounded-full transition-all ${i === index ? 'w-5 bg-white' : statuses[it.key] === 'done' ? 'w-2 bg-emerald-400' : statuses[it.key] === 'missed' ? 'w-2 bg-rose-400' : statuses[it.key] === 'postponed' ? 'w-2 bg-amber-300' : 'w-2 bg-white/35'}`} />
              ))}
            </div>
            <div className="mt-2 text-white/70 text-xs" dir={lang === 'he' ? 'rtl' : 'ltr'}>
              {fill(s.position, { i: index + 1, n: items.length })}
              {status ? ` · ${status === 'done' ? s.swipeRight : status === 'missed' ? s.swipeLeft : s.swipeUp}` : ''}
            </div>
            {error && <div className="mt-2 text-rose-200 text-xs">{error}</div>}
          </>
        ) : null}
      </div>

      {/* Buttons too, for anyone who doesn't swipe */}
      {!finished && item && (
        <div className="absolute bottom-0 inset-x-0 pb-[max(env(safe-area-inset-bottom),20px)] flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => commit('missed')} aria-label={s.swipeLeft} className="w-14 h-14 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg active:scale-95"><X className="w-7 h-7" strokeWidth={3} /></button>
            <button onClick={() => commit('postponed')} aria-label={s.swipeUp} className="w-12 h-12 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-lg active:scale-95"><ArrowUp className="w-6 h-6" strokeWidth={3} /></button>
            <button onClick={() => commit('done')} aria-label={s.swipeRight} className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg active:scale-95"><Check className="w-7 h-7" strokeWidth={3} /></button>
          </div>
          <span className="text-white/50 text-[11px]">{s.tapOutside}</span>
        </div>
      )}
    </div>
  );
  return toBody(overlay);
}

/** Render above everything (the bottom bar too), outside any transformed parent. */
export function toBody(node) {
  try {
    return typeof document !== 'undefined' && document.body ? createPortal(node, document.body) : node;
  } catch (e) {
    return node;
  }
}

/** Manage tasks: write one, pick an idea, join a challenge, remove. */
export function TasksSheet({ lang = 'he', user, todayEvents, onClose, onRequireLogin }) {
  const s = strings(lang);
  const { items, tasks, reload } = useTodayTasks({ user, todayEvents, lang });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [challenges, setChallenges] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    const handle = setTimeout(() => {
      api.get('/api/goals/search', { params: { q: query.trim() } })
        .then(res => { if (alive) setChallenges((res.data?.goals || []).filter(g => g.featuredKey || g.participantCount > 1).slice(0, 30)); })
        .catch(() => { if (alive) setChallenges([]); });
    }, query ? 300 : 0);
    return () => { alive = false; clearTimeout(handle); };
  }, [query]);

  const joinedIds = new Set((tasks || []).filter(t => t.kind === 'challenge').map(t => String(t.id)));
  const joinedTitles = new Set((tasks || []).map(t => t.title));

  const add = async (payload) => {
    setBusy(true);
    setError('');
    try {
      await addDailyTask(user, payload);
      setText('');
      await reload();
    } catch (e) {
      setError(e?.response?.data?.error || s.failed);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (task) => {
    try { await removeDailyTask(user, task); await reload(); } catch (e) { setError(s.failed); }
  };

  const examples = (EXAMPLES[lang] || EXAMPLES.en).filter(ex => !joinedTitles.has(ex.title));
  const calendarItems = items.filter(i => i.source === 'calendar');

  return toBody(
    <div style={{ zIndex: 10040 }} className="fixed inset-0 flex items-end sm:items-center justify-center" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#F6F5FB] rounded-t-[28px] sm:rounded-[28px] shadow-2xl max-h-[calc(100%-16px)] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#F6F5FB] px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-[#0E1020]">{s.sheetTitle}</h2>
          <button onClick={onClose} aria-label={s.close} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-600 shadow-sm"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 space-y-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}>
          <form onSubmit={e => { e.preventDefault(); if (text.trim()) add({ title: text }); }} className="flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={s.placeholder}
              maxLength={80}
              className="flex-1 h-12 rounded-2xl bg-white border border-slate-200 px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <button type="submit" disabled={busy || !text.trim()} className="h-12 px-4 rounded-2xl bg-gradient-to-l from-violet-600 to-pink-500 text-white font-bold disabled:opacity-50 flex items-center gap-1">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{s.add}
            </button>
          </form>
          {error && <div className="text-xs text-rose-600 -mt-3">{error}</div>}

          {examples.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-400 mb-2">{s.examples}</div>
              <div className="flex flex-wrap gap-2">
                {examples.map(ex => (
                  <button key={ex.title} onClick={() => add(ex)} disabled={busy} className="h-9 px-3 rounded-full bg-white border border-slate-200 text-sm text-slate-700 flex items-center gap-1.5 hover:border-violet-300">
                    <span>{ex.emoji}</span>{ex.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-bold text-slate-400 mb-2">{s.mine}</div>
            {(tasks || []).length === 0 && calendarItems.length === 0 ? (
              <p className="text-sm text-slate-500">{s.noTasks}</p>
            ) : (
              <div className="bg-white rounded-2xl divide-y divide-slate-100">
                {calendarItems.map(i => (
                  <div key={i.key} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="text-xl">{i.emoji}</span>
                    <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{i.title}</span>
                    <span className="text-[11px] text-slate-400">{s.calendar} · <span dir="ltr">{formatTimeString(i.time, lang)}</span></span>
                  </div>
                ))}
                {(tasks || []).map(t => (
                  <div key={t.key} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="text-xl">{t.emoji || (t.kind === 'challenge' ? '🏆' : '✨')}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{lang !== 'he' && t.titleEn ? t.titleEn : t.title}</span>
                      {t.kind === 'challenge' && <span className="block text-[11px] text-orange-600">{s.challenge}{t.durationDays ? ` · ${fill(s.days, { n: t.durationDays })}` : ''}{t.streak ? ` · 🔥 ${t.streak}` : ''}</span>}
                    </span>
                    <button onClick={() => remove(t)} aria-label={s.remove} className="w-8 h-8 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Trophy className="w-4 h-4 text-orange-500" />{s.challenges}</div>
            <div className="text-xs text-slate-500 mb-2">{s.challengesSub}</div>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={lang === 'he' ? 'חיפוש אתגר: מים, שינה, קריאה...' : 'Search: water, sleep, reading...'} className="w-full h-10 rounded-xl bg-white border border-slate-200 ps-9 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            {!challenges ? (
              <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-300" /></div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {challenges.map(g => {
                  const joined = joinedIds.has(String(g._id)) || joinedTitles.has(g.title);
                  const title = lang !== 'he' && g.titleEn ? g.titleEn : g.title;
                  const desc = lang !== 'he' && g.descriptionEn ? g.descriptionEn : g.description;
                  return (
                    <div key={g._id} className="bg-white rounded-2xl p-3 flex items-center gap-3">
                      <span className="w-11 h-11 rounded-full bg-orange-50 flex items-center justify-center text-2xl shrink-0">{g.emoji || '🎯'}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-slate-800">{title}</span>
                        {desc && <span className="block text-xs text-slate-500 line-clamp-2">{desc}</span>}
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          {g.durationDays ? fill(s.days, { n: g.durationDays }) : ''}{g.participantCount ? ` · ${fill(s.people, { n: g.participantCount })}` : ''}
                        </span>
                      </span>
                      <button
                        disabled={joined || busy}
                        onClick={() => add({ title: g.title, titleEn: g.titleEn, emoji: g.emoji, challengeId: user ? g._id : null })}
                        className={`h-9 px-3 rounded-full text-xs font-bold shrink-0 ${joined ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-600 text-white'}`}
                      >
                        {joined ? `✓ ${s.joined}` : s.join}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { notifyTasksChanged };
