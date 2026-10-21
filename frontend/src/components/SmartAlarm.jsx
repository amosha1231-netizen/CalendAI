import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, AlarmClock, Volume2, Brain, BellOff, Sun, Delete, Check, Play } from 'lucide-react';
import translations from '../i18n';
import {
  DEFAULT_ALARM,
  MISSED_ALARM_GRACE_MS,
  loadAlarm,
  saveAlarm,
  loadRinging,
  saveRinging,
  computeNextFireAt,
  findFirstEventOn,
  findFirstEventTomorrow,
  minutesToTime,
  generateMathProblem,
  unlockAlarmAudio,
  isAlarmAudioRunning,
  startEscalatingAlarm,
  previewAlarmSound
} from '../utils/alarmEngine';
import { isShabbatNow } from '../utils/shabbatHelper';

const ESCALATION_OPTIONS = [30, 60, 120, 300];
const PREP_OPTIONS = [30, 45, 60, 90, 120];
const SNOOZE_OPTIONS = [0, 5, 10];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function makeTr(t) {
  return (key, vars) => {
    let text = (t && t[key]) ?? translations.en[key] ?? key;
    if (vars) Object.keys(vars).forEach(k => { text = text.replace(`{${k}}`, vars[k]); });
    return text;
  };
}

function formatCountdown(ms, tr) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return tr('alarmInHoursMinutes', { h, m });
}

function nowClock() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Smart wake-up alarm: volume climbs until you solve a few math problems.
 * Mounted once in App so it can ring from any screen; `settingsOpen` shows
 * the configuration modal.
 */
export default function SmartAlarm({ lang, t, schedule, settingsOpen, onCloseSettings }) {
  const tr = makeTr(t);
  const [alarm, setAlarm] = useState(() => loadAlarm());
  const [ringing, setRinging] = useState(() => loadRinging());
  const alarmRef = useRef(alarm);
  alarmRef.current = alarm;

  const updateAlarm = useCallback((next) => {
    setAlarm(next);
    saveAlarm(next);
  }, []);

  // The settings in force are copied into the ringing state, so a reload
  // mid-ring (or a test run with unsaved settings) keeps the same challenge.
  const startRinging = useCallback((isTest, settings) => {
    const state = { startedAt: Date.now(), solved: 0, isTest, settings };
    saveRinging(state);
    setRinging(state);
  }, []);

  // ── Scheduler: checks once a second while the app is open ──
  useEffect(() => {
    const check = () => {
      const a = alarmRef.current;
      const now = Date.now();
      const due = [a.enabled && a.nextFireAt, a.snoozeUntil].filter(Boolean);
      // The app is closed on Shabbat: never ring then (the Shabbat screen
      // would also cover the dismiss controls), and stop a ring left over.
      let shabbat = false;
      try { shabbat = isShabbatNow(); } catch (e) {}
      if (shabbat && loadRinging()) { saveRinging(null); setRinging(null); return; }
      if (!due.length || loadRinging()) return;
      const fireAt = Math.min(...due);
      if (now < fireAt) return;

      const missed = now - fireAt > MISSED_ALARM_GRACE_MS;
      const next = { ...a, snoozeUntil: null };
      if (a.enabled && a.nextFireAt && now >= a.nextFireAt) {
        if (a.repeatDaily) next.nextFireAt = computeNextFireAt(a.time, now);
        else { next.enabled = false; next.nextFireAt = null; }
      }
      updateAlarm(next);
      if (!missed && !shabbat) startRinging(false, a);
    };
    check();
    const id = setInterval(check, 1000);
    const onVisible = () => { try { if (document.visibilityState === 'visible') check(); } catch (e) {} };
    try { document.addEventListener('visibilitychange', onVisible); } catch (e) {}
    return () => {
      clearInterval(id);
      try { document.removeEventListener('visibilitychange', onVisible); } catch (e) {}
    };
  }, [updateAlarm, startRinging]);

  // ── Keep the screen on while an alarm is pending (bedside mode) ──
  const armed = (alarm.enabled || !!alarm.snoozeUntil) && alarm.keepScreenAwake;
  useEffect(() => {
    if (!armed && !ringing) return undefined;
    let lock = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.wakeLock) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) { try { lock.release(); } catch (e) {} }
      } catch (e) {}
    };
    request();
    const onVisible = () => { request(); };
    try { document.addEventListener('visibilitychange', onVisible); } catch (e) {}
    return () => {
      cancelled = true;
      try { document.removeEventListener('visibilitychange', onVisible); } catch (e) {}
      try { if (lock) lock.release(); } catch (e) {}
    };
  }, [armed, ringing]);

  const handleDismiss = () => {
    saveRinging(null);
    setRinging(null);
  };

  const handleSnooze = () => {
    const minutes = alarmRef.current.snoozeMinutes;
    saveRinging(null);
    setRinging(null);
    if (minutes > 0) updateAlarm({ ...alarmRef.current, snoozeUntil: Date.now() + minutes * 60000 });
  };

  const handleSolved = (solved) => {
    const next = { ...loadRinging(), solved };
    saveRinging(next);
    setRinging(next);
  };

  return (
    <>
      {settingsOpen && (
        <AlarmSettingsModal
          lang={lang}
          tr={tr}
          alarm={alarm}
          schedule={schedule}
          onSave={updateAlarm}
          onTest={(settings) => { unlockAlarmAudio(); onCloseSettings(); startRinging(true, settings); }}
          onClose={onCloseSettings}
        />
      )}
      {ringing && (
        <AlarmRingingScreen
          lang={lang}
          tr={tr}
          alarm={{ ...DEFAULT_ALARM, ...(ringing.settings || alarm) }}
          ringing={ringing}
          schedule={schedule}
          onSolved={handleSolved}
          onDismiss={handleDismiss}
          onSnooze={handleSnooze}
        />
      )}
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────

function ChoiceRow({ options, value, onChange, render }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
            value === opt
              ? 'bg-amber-500 text-white border-amber-500 shadow'
              : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
          }`}
        >
          {render(opt)}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition flex-shrink-0 ${checked ? 'bg-amber-500' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'start-[1.375rem]' : 'start-0.5'}`} />
      </button>
    </label>
  );
}

function AlarmSettingsModal({ lang, tr, alarm, schedule, onSave, onTest, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...DEFAULT_ALARM, ...alarm }));
  const set = (patch) => setDraft(prev => ({ ...prev, ...patch }));
  const firstEvent = findFirstEventTomorrow(schedule);
  const suggested = firstEvent ? minutesToTime(firstEvent.minutes - draft.prepMinutes) : null;
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const handleArm = () => {
    unlockAlarmAudio();
    const nextFireAt = computeNextFireAt(draft.time);
    if (!nextFireAt) return;
    const next = { ...draft, enabled: true, nextFireAt, snoozeUntil: null };
    setDraft(next);
    onSave(next);
  };

  const handleTurnOff = () => {
    const next = { ...draft, enabled: false, nextFireAt: null, snoozeUntil: null };
    setDraft(next);
    onSave(next);
  };

  const sampleProblem = useRef({});
  if (!sampleProblem.current[draft.difficulty]) {
    sampleProblem.current[draft.difficulty] = generateMathProblem(draft.difficulty).question;
  }

  const isArmed = alarm.enabled && alarm.nextFireAt;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        className="bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlarmClock className="w-6 h-6" />
            <div>
              <h3 className="font-bold text-lg leading-tight">{tr('alarmTitle')}</h3>
              <p className="text-xs text-white/85">{tr('alarmSubtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20" aria-label={tr('alarmClose')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {isArmed && (
            <div className="rounded-2xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              ⏰ {tr('alarmArmedFor', { time: alarm.time })} · {formatCountdown(alarm.nextFireAt - Date.now(), tr)}
            </div>
          )}

          {firstEvent && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 space-y-2">
              <p className="text-sm text-amber-900">
                {tr('alarmFirstEventTomorrow', { title: firstEvent.title || tr('alarmUntitledEvent'), time: minutesToTime(firstEvent.minutes) })}
              </p>
              <div className="flex items-center gap-2 flex-wrap text-xs text-amber-800">
                <span>{tr('alarmWakeBefore')}</span>
                <select
                  value={draft.prepMinutes}
                  onChange={e => set({ prepMinutes: Number(e.target.value) })}
                  className="border border-amber-300 rounded-lg px-2 py-1 bg-white"
                >
                  {PREP_OPTIONS.map(m => <option key={m} value={m}>{tr('alarmMinutes', { n: m })}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => set({ time: suggested })}
                  className="ms-auto px-3 py-1 rounded-lg bg-amber-500 text-white font-medium"
                >
                  {tr('alarmUseSuggested', { time: suggested })}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">{tr('alarmTimeLabel')}</label>
            <input
              type="time"
              value={draft.time}
              onChange={e => e.target.value && set({ time: e.target.value })}
              className="w-full text-4xl font-bold text-center text-slate-800 border-2 border-slate-200 rounded-2xl py-3 focus:border-amber-400 outline-none"
              dir="ltr"
            />
            <div className="mt-2">
              <Toggle checked={draft.repeatDaily} onChange={v => set({ repeatDaily: v })} label={tr('alarmRepeatDaily')} />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
              <Volume2 className="w-4 h-4" /> {tr('alarmEscalationLabel')}
            </p>
            <ChoiceRow
              options={ESCALATION_OPTIONS}
              value={draft.escalationSeconds}
              onChange={v => set({ escalationSeconds: v })}
              render={s => (s < 60 ? tr('alarmSeconds', { n: s }) : tr('alarmMinutes', { n: s / 60 }))}
            />
            <p className="text-xs text-slate-400 mt-1">{tr('alarmEscalationHint')}</p>
          </div>

          <div className="space-y-3">
            <Toggle
              checked={draft.mathEnabled}
              onChange={v => set({ mathEnabled: v })}
              label={<span className="flex items-center gap-1"><Brain className="w-4 h-4 text-amber-500" /> {tr('alarmMathLabel')}</span>}
            />
            {draft.mathEnabled && (
              <>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{tr('alarmMathCount')}</p>
                  <ChoiceRow options={[1, 2, 3, 4, 5]} value={draft.mathCount} onChange={v => set({ mathCount: v })} render={n => n} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{tr('alarmDifficulty')}</p>
                  <ChoiceRow
                    options={DIFFICULTIES}
                    value={draft.difficulty}
                    onChange={v => set({ difficulty: v })}
                    render={d => tr(`alarmDifficulty_${d}`)}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {tr('alarmExample')} <span dir="ltr" className="inline-block">{sampleProblem.current[draft.difficulty]} = ?</span>
                  </p>
                </div>
              </>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">{tr('alarmSnoozeLabel')}</p>
            <ChoiceRow
              options={SNOOZE_OPTIONS}
              value={draft.snoozeMinutes}
              onChange={v => set({ snoozeMinutes: v })}
              render={m => (m === 0 ? tr('alarmSnoozeOff') : tr('alarmMinutes', { n: m }))}
            />
          </div>

          <Toggle checked={draft.keepScreenAwake} onChange={v => set({ keepScreenAwake: v })} label={tr('alarmKeepAwake')} />

          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
            💡 {tr('alarmOpenAppNote')}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => previewAlarmSound()}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Volume2 className="w-4 h-4" /> {tr('alarmPreviewSound')}
            </button>
            <button
              type="button"
              onClick={() => onTest(draft)}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Play className="w-4 h-4" /> {tr('alarmTestNow')}
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            {isArmed && (
              <button
                type="button"
                onClick={handleTurnOff}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 font-semibold"
              >
                <BellOff className="w-4 h-4" /> {tr('alarmTurnOff')}
              </button>
            )}
            <button
              type="button"
              onClick={handleArm}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg"
            >
              <AlarmClock className="w-5 h-5" /> {isArmed ? tr('alarmUpdate') : tr('alarmSet')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ringing screen ───────────────────────────────────────────────────────

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];

function AlarmRingingScreen({ lang, tr, alarm, ringing, schedule, onSolved, onDismiss, onSnooze }) {
  const total = alarm.mathEnabled ? Math.max(1, alarm.mathCount) : 0;
  const solved = Math.min(ringing.solved || 0, total);
  const [problem, setProblem] = useState(() => generateMathProblem(alarm.difficulty));
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [clock, setClock] = useState(nowClock());
  const soundRef = useRef(null);
  const todayEvent = findFirstEventOn(schedule, new Date());

  // Start the sound once; it keeps escalating until this screen unmounts.
  useEffect(() => {
    soundRef.current = startEscalatingAlarm({ escalationSeconds: alarm.escalationSeconds });
    const tapCheck = setTimeout(() => setNeedsTap(!isAlarmAudioRunning()), 600);
    const clockId = setInterval(() => setClock(nowClock()), 5000);
    return () => {
      clearTimeout(tapCheck);
      clearInterval(clockId);
      if (soundRef.current) soundRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnyTap = () => {
    if (needsTap) {
      unlockAlarmAudio();
      setNeedsTap(false);
    }
  };

  const submit = () => {
    if (!input) return;
    if (Number(input) === problem.answer) {
      const nextSolved = solved + 1;
      setInput('');
      if (nextSolved >= total) {
        onDismiss();
        return;
      }
      onSolved(nextSolved);
      setProblem(generateMathProblem(alarm.difficulty));
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setInput('');
      setProblem(generateMathProblem(alarm.difficulty));
    }
  };

  const press = (key) => {
    if (key === 'del') setInput(v => v.slice(0, -1));
    else if (key === 'ok') submit();
    else setInput(v => (v.length < 5 ? v + key : v));
  };

  return (
    <div
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      onPointerDown={handleAnyTap}
      className="fixed inset-0 z-[10001] bg-gradient-to-b from-indigo-950 via-indigo-900 to-orange-700 text-white flex flex-col items-center justify-between px-6 py-8 select-none"
      style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <style>{`
        @keyframes calendai-alarm-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes calendai-alarm-shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-10px); } 40%,80% { transform: translateX(10px); } }
      `}</style>

      <div className="text-center">
        <Sun className="w-14 h-14 mx-auto text-amber-300" style={{ animation: 'calendai-alarm-pulse 1.4s ease-in-out infinite' }} />
        <div className="text-6xl font-extrabold mt-3 tracking-tight" dir="ltr">{clock}</div>
        <p className="text-lg mt-1 text-white/90">{ringing.isTest ? tr('alarmTestTitle') : tr('alarmWakeUp')}</p>
        {todayEvent && (
          <p className="text-sm mt-2 text-amber-200">
            {tr('alarmTodayFirst', { title: todayEvent.title || tr('alarmUntitledEvent'), time: minutesToTime(todayEvent.minutes) })}
          </p>
        )}
      </div>

      {needsTap && (
        <button onClick={handleAnyTap} className="px-5 py-3 rounded-2xl bg-white/20 text-white font-semibold animate-pulse">
          🔔 {tr('alarmTapForSound')}
        </button>
      )}

      {total > 0 ? (
        <div className="w-full max-w-xs">
          <div className="flex justify-center gap-2 mb-3">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`w-3 h-3 rounded-full ${i < solved ? 'bg-green-400' : 'bg-white/30'}`} />
            ))}
          </div>
          <p className="text-center text-sm text-white/80 mb-2">{tr('alarmSolveToStop', { n: solved + 1, total })}</p>
          <div
            className="bg-white/10 backdrop-blur rounded-3xl p-4 text-center"
            style={shake ? { animation: 'calendai-alarm-shake 0.45s' } : undefined}
          >
            <div className="text-4xl font-bold" dir="ltr">{problem.question} =</div>
            <div className="text-4xl font-bold mt-2 min-h-[3rem] text-amber-200" dir="ltr">{input || '?'}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4" dir="ltr">
            {KEYPAD.map(key => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className={`h-14 rounded-2xl text-2xl font-bold flex items-center justify-center active:scale-95 transition ${
                  key === 'ok' ? 'bg-green-500' : key === 'del' ? 'bg-white/10' : 'bg-white/20'
                }`}
                aria-label={key === 'ok' ? tr('alarmCheck') : key === 'del' ? tr('alarmDelete') : key}
              >
                {key === 'ok' ? <Check className="w-7 h-7" /> : key === 'del' ? <Delete className="w-6 h-6" /> : key}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onDismiss}
          className="w-full max-w-xs py-5 rounded-3xl bg-white text-indigo-900 text-xl font-extrabold shadow-xl"
        >
          {tr('alarmImUp')}
        </button>
      )}

      {alarm.snoozeMinutes > 0 && !ringing.isTest ? (
        <button type="button" onClick={onSnooze} className="text-sm text-white/70 underline underline-offset-4">
          {tr('alarmSnoozeFor', { n: alarm.snoozeMinutes })}
        </button>
      ) : ringing.isTest ? (
        <button type="button" onClick={onDismiss} className="text-sm text-white/70 underline underline-offset-4">
          {tr('alarmEndTest')}
        </button>
      ) : <span />}
    </div>
  );
}
