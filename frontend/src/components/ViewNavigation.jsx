import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const viewModes = ['day', 'weekly', 'monthly', 'yearly', '100year'];
const VIEW_LABEL_KEYS = { day: 'viewDay', weekly: 'viewWeekly', monthly: 'viewMonthly', yearly: 'viewYearly', '100year': 'view100Year' };

export default function ViewNavigation({ currentView, onViewChange, onPrev, onNext, onToday, t, isRTL = false }) {
  const btnBase = "px-3 py-2 min-h-[40px] text-xs font-medium rounded-full transition border";
  // "Previous" points toward the start of the reading direction.
  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;
  
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-4">
      {/* View Mode Buttons - horizontally scrollable on mobile */}
      <div className="flex items-center gap-1 bg-white rounded-full border border-slate-200 p-0.5 shadow-sm overflow-x-auto max-w-full" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {viewModes.map(mode => (
          <button
            key={mode}
            onClick={() => onViewChange(mode)}
            className={`${btnBase} shrink-0 whitespace-nowrap ${
              currentView === mode
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100'
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
          className="px-3 py-2 min-h-[44px] text-xs font-medium rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition whitespace-nowrap"
        >
          {t.viewToday}
        </button>
        <button onClick={onPrev} aria-label={t.viewPrevious || (isRTL ? 'הקודם' : 'Previous')} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100 transition text-slate-500">
          <PrevIcon className="w-5 h-5" />
        </button>
        <button onClick={onNext} aria-label={t.viewNext || (isRTL ? 'הבא' : 'Next')} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100 transition text-slate-500">
          <NextIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
