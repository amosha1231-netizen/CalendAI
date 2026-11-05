import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Day, week and month cover real planning; the yearly and 100-year views were dropped.
const viewModes = ['day', 'weekly', 'monthly'];
const VIEW_LABEL_KEYS = { day: 'viewDay', weekly: 'viewWeekly', monthly: 'viewMonthly' };

export default function ViewNavigation({ currentView, onViewChange, onPrev, onNext, onToday, t, isRTL = false }) {
    // "Previous" points toward the start of the reading direction.
  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;
  
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-4">
      {/* View mode: one segmented control */}
      <div className="flex flex-1 sm:flex-none sm:w-80 p-1 gap-1 rounded-2xl bg-[#ECEAF4]" role="tablist">
        {viewModes.map(mode => (
          <button
            key={mode}
            role="tab"
            aria-selected={currentView === mode}
            onClick={() => onViewChange(mode)}
            className={`flex-1 h-9 rounded-xl text-sm font-semibold transition ${
              currentView === mode
                ? 'bg-white text-[#0E1020] shadow-[0_2px_8px_-2px_rgba(14,16,32,0.15)]'
                : 'text-[#6E7189] hover:text-[#0E1020]'
            }`}
          >
            {t[VIEW_LABEL_KEYS[mode]] || mode}
          </button>
        ))}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
        <button
          onClick={onToday}
          className="px-3.5 h-11 text-xs font-semibold rounded-2xl bg-white text-[#2A2D45] shadow-[0_4px_14px_-8px_rgba(40,30,120,0.3)] hover:bg-slate-50 transition whitespace-nowrap"
        >
          {t.viewToday}
        </button>
        <button onClick={onPrev} aria-label={t.viewPrevious || (isRTL ? 'הקודם' : 'Previous')} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-white shadow-[0_4px_14px_-8px_rgba(40,30,120,0.3)] hover:bg-slate-50 transition text-[#2A2D45]">
          <PrevIcon className="w-5 h-5" />
        </button>
        <button onClick={onNext} aria-label={t.viewNext || (isRTL ? 'הבא' : 'Next')} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-white shadow-[0_4px_14px_-8px_rgba(40,30,120,0.3)] hover:bg-slate-50 transition text-[#2A2D45]">
          <NextIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
