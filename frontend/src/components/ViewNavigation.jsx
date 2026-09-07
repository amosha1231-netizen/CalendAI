import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const viewModes = ['day', 'weekly', 'monthly', 'yearly', '100year'];

export default function ViewNavigation({ currentView, onViewChange, onPrev, onNext, onToday, t }) {
  const btnBase = "px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-full transition border";
  
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
            {t[`view${mode.charAt(0).toUpperCase() + mode.slice(1)}`] || mode}
          </button>
        ))}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
        <button
          onClick={onToday}
          className="px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition whitespace-nowrap"
        >
          {t.viewToday}
        </button>
        <button onClick={onPrev} className="p-1.5 rounded-full hover:bg-slate-100 transition text-slate-500">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={onNext} className="p-1.5 rounded-full hover:bg-slate-100 transition text-slate-500">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
