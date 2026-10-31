import React from "react";
import { Bell, Check, Loader2, Trash2, AlertTriangle, X } from "lucide-react";

const DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'yearly'];
const RECURRENCE_LABEL_KEYS = {
  once: 'recurrenceOnce', daily: 'recurrenceDaily', weekly: 'recurrenceWeekly',
  monthly: 'recurrenceMonthly', yearly: 'recurrenceYearly', forever: 'recurrenceForever'
};

// "06:30 PM" or "18:30" → "18:30" (what <input type="time"> expects).
export function toTime24(value) {
  if (typeof value !== 'string') return '';
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const meridiem = m[3] ? m[3].toUpperCase() : null;
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return `${String(h % 24).padStart(2, '0')}:${m[2]}`;
}

// Server preview event → the editable row the card shows.
export function toPreviewItem(ev, index) {
  return {
    ...ev,
    key: `${index}-${ev.title}`,
    startTime: toTime24(ev.startTime),
    endTime: toTime24(ev.endTime) || toTime24(ev.startTime),
    recurrence: ev.recurrence === 'forever' ? 'daily' : (ev.recurrence || 'once'),
    conflicts: Array.isArray(ev.conflicts) ? ev.conflicts : []
  };
}

export default function ParsePreviewCard({ preview, onChange, onConfirm, onCancel, saving, t, dayTranslations, isRTL }) {
  const { items } = preview;

  const updateItem = (index, patch) => {
    const next = items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, ...patch };
      // A changed day no longer matches the date or weekdays the AI picked.
      if (patch.day) {
        delete updated.targetDate;
        if (updated.repeat) updated.repeat = { ...updated.repeat, daysOfWeek: undefined };
      }
      if (patch.recurrence && updated.repeat) updated.repeat = { ...updated.repeat, frequency: patch.recurrence };
      // Any edit clears the overlap warning, which was computed for the old values.
      return { ...updated, conflicts: [] };
    });
    onChange({ ...preview, items: next, edited: true });
  };

  const removeItem = (index) => {
    onChange({ ...preview, items: items.filter((_, i) => i !== index), edited: true });
  };

  const canConfirm = !saving && items.length > 0 && items.every(item => item.title.trim() && item.startTime);
  const inputClass = "px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 outline-none";

  return (
    <div className="mt-3 bg-indigo-50/60 border border-indigo-200 rounded-2xl p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold text-indigo-900">{t.previewTitle || 'Is this what you meant?'}</span>
        <button onClick={onCancel} disabled={saving} aria-label={t.previewCancel || 'Cancel'} className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-white transition disabled:opacity-40">
          <X className="w-4 h-4" />
        </button>
      </div>
      {preview.replyMessage && <p className="text-sm text-indigo-800/80 mb-3">{preview.replyMessage}</p>}

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.key} className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              {item.isReminder && <Bell className="w-4 h-4 text-amber-500 shrink-0" aria-label={t.previewReminder || 'Reminder'} />}
              <input value={item.title} onChange={e => updateItem(index, { title: e.target.value })}
                className={`${inputClass} flex-1 min-w-0 font-medium`} aria-label={t.previewEventTitle || 'Title'} />
              <button onClick={() => removeItem(index)} disabled={saving} aria-label={t.previewRemove || 'Remove'}
                className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition shrink-0 disabled:opacity-40">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <select value={item.day} onChange={e => updateItem(index, { day: e.target.value })} className={inputClass} aria-label={t.previewDay || 'Day'}>
                {!DAY_KEYS.includes(item.day) && <option value={item.day}>{dayTranslations[item.day] || item.day}</option>}
                {DAY_KEYS.map(d => <option key={d} value={d}>{dayTranslations[d] || d}</option>)}
              </select>
              <input type="time" value={item.startTime} onChange={e => updateItem(index, { startTime: e.target.value })} className={inputClass} aria-label={t.previewStart || 'Start'} />
              {!item.isReminder && (
                <>
                  <span className="text-slate-400">–</span>
                  <input type="time" value={item.endTime} onChange={e => updateItem(index, { endTime: e.target.value })} className={inputClass} aria-label={t.previewEnd || 'End'} />
                </>
              )}
              <select value={item.recurrence} onChange={e => updateItem(index, { recurrence: e.target.value })} className={inputClass} aria-label={t.editRecurrence || 'Repeat'}>
                {RECURRENCES.map(r => <option key={r} value={r}>{t[RECURRENCE_LABEL_KEYS[r]] || r}</option>)}
              </select>
            </div>
            {item.conflicts.length > 0 && (
              <div className="flex items-start gap-1.5 mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>{t.previewConflict || 'Overlaps with'} {item.conflicts.map(c => `${c.title} (${c.startTime}-${c.endTime})`).join(', ')}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={onConfirm} disabled={!canConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? (t.previewSaving || 'Saving…') : (t.previewConfirm || 'Save')}
        </button>
        <button onClick={onCancel} disabled={saving}
          className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 transition disabled:opacity-50">
          {t.previewCancel || 'Cancel'}
        </button>
      </div>
    </div>
  );
}
