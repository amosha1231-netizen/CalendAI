import React, { useState, useEffect, useRef } from 'react';
import { Check, X, CornerUpLeft, RotateCcw } from 'lucide-react';

const STYLES = {
  done: { ring: 'bg-emerald-500 border-emerald-500 text-white', Icon: Check, chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  postponed: { ring: 'bg-amber-400 border-amber-400 text-white', Icon: CornerUpLeft, chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  missed: { ring: 'bg-rose-500 border-rose-500 text-white', Icon: X, chip: 'bg-rose-50 text-rose-700 border-rose-200' }
};

/**
 * A round status button for a task. Tapping it opens three choices:
 * done, postponed, not done (and clear, when already marked).
 */
export default function TaskStatusCircle({ status, onChange, t, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const style = status ? STYLES[status] : null;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const label = status ? t[`taskStatus_${status}`] : t.taskStatusMark;
  const pick = (next) => {
    setOpen(false);
    onChange && onChange(next);
  };

  return (
    <div ref={wrapRef} className="relative shrink-0" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition active:scale-90 ${
          style ? style.ring : 'border-slate-300 bg-white hover:border-indigo-400'
        }`}
      >
        {style && <style.Icon className="w-4 h-4" strokeWidth={3} />}
      </button>
      {open && (
        <div role="menu" className="absolute top-9 start-0 z-30 w-40 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 flex flex-col gap-1">
          {['done', 'postponed', 'missed'].map(s => {
            const { Icon, chip } = STYLES[s];
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => pick(s)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-sm font-semibold transition ${
                  status === s ? chip : 'border-transparent text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${STYLES[s].ring}`}>
                  <Icon className="w-3 h-3" strokeWidth={3} />
                </span>
                {t[`taskStatus_${s}`]}
              </button>
            );
          })}
          {status && (
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(null)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-slate-500 hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t.taskStatusClear}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** "How am I doing" bar: today's marks and the last 7 days' done rate. */
export function TaskProgressSummary({ dayItems, weekSummary, dayTotal, t }) {
  const dayDone = dayItems.filter(i => i.status === 'done').length;
  const rate = weekSummary.rate;
  return (
    <div className="mb-4 rounded-2xl border border-slate-100 bg-gradient-to-l from-indigo-50/60 to-white p-3">
      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
        <span>{t.taskProgressToday.replace('{done}', dayDone).replace('{total}', dayTotal)}</span>
        <span className="text-indigo-600">
          {rate === null ? t.taskProgressNoData : t.taskProgressWeekRate.replace('{rate}', rate)}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden flex">
        {weekSummary.total > 0 && (
          <>
            <div className="bg-emerald-500" style={{ width: `${(weekSummary.done / weekSummary.total) * 100}%` }} />
            <div className="bg-amber-400" style={{ width: `${(weekSummary.postponed / weekSummary.total) * 100}%` }} />
            <div className="bg-rose-500" style={{ width: `${(weekSummary.missed / weekSummary.total) * 100}%` }} />
          </>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{t.taskStatus_done} {weekSummary.done}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{t.taskStatus_postponed} {weekSummary.postponed}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />{t.taskStatus_missed} {weekSummary.missed}</span>
        <span className="ms-auto text-slate-400">{t.taskProgressLast7}</span>
      </div>
    </div>
  );
}
