import React from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CheckCircle2, X } from 'lucide-react';

/**
 * The long-press sheet on an event: turn a regular event into a task (done
 * circle + ping at its time), or a task back into a regular event.
 */
export default function EventKindMenu({ event, t, onPick, onClose }) {
  if (!event) return null;
  const isTask = Boolean(event.isTask);
  const sheet = (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label={event.title}
        className="w-full max-w-md bg-white rounded-t-3xl p-4 pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="font-bold text-slate-800 truncate flex-1">{event.title}</span>
          <button type="button" onClick={onClose} aria-label={t.close || 'Close'} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onPick(!isTask)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 hover:bg-slate-50 active:scale-[0.99] transition text-start"
        >
          <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isTask ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {isTask ? <CalendarDays className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </span>
          <span className="flex flex-col">
            <span className="font-semibold text-slate-800">{isTask ? (t.makeEvent || 'Make it a regular event') : (t.makeTask || 'Make it a task')}</span>
            <span className="text-xs text-slate-500">{isTask ? t.kindMenuEventHint : t.kindMenuHint}</span>
          </span>
        </button>
      </div>
    </div>
  );
  // A portal, so the sheet sits above the bottom bar wherever it is opened from.
  if (typeof document === 'undefined' || !document.body) return sheet;
  return createPortal(sheet, document.body);
}
