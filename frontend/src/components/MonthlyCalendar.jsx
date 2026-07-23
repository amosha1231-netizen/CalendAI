import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || "";

const monthNames = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

const dayNames = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const enDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function MonthlyCalendar({ schedule }) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'year'
  const [expandedEvents, setExpandedEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Rolling 12-month window: always show 12 months starting from current month
  const rollingStartMonth = today.getMonth();
  const rollingStartYear = today.getFullYear();

  const fetchExpandedEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      if (viewMode === 'year') {
        // For year view, fetch all 12 rolling months in parallel
        const promises = [];
        for (let offset = 0; offset < 12; offset++) {
          const m = (rollingStartMonth + offset) % 12;
          const y = rollingStartYear + Math.floor((rollingStartMonth + offset) / 12);
          promises.push(
            fetch(`${API_BASE}/api/schedule/expanded?year=${y}&month=${m}&view=month`, { credentials: "include" })
              .then(res => res.ok ? res.json() : { events: [] })
          );
        }
        const results = await Promise.all(promises);
        const allEvents = results.flatMap(data => data.events || []);
        setExpandedEvents(allEvents);
      } else {
        const params = `year=${currentYear}&month=${currentMonth}&view=month`;
        const res = await fetch(`${API_BASE}/api/schedule/expanded?${params}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setExpandedEvents(data.events || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch expanded events:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentYear, currentMonth, viewMode, rollingStartMonth, rollingStartYear]);

  useEffect(() => {
    fetchExpandedEvents();
  }, [fetchExpandedEvents, schedule]);

  // Shared skeleton loader component
  const SkeletonLoader = () => (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-slate-200 rounded w-1/3 mx-auto"></div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-100 rounded"></div>
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-50 rounded border border-slate-100"></div>
        ))}
      </div>
    </div>
  );

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const prevYear = () => setCurrentYear(prev => prev - 1);
  const nextYear = () => setCurrentYear(prev => prev + 1);

  const getEventsForDate = (year, month, day) => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return expandedEvents.filter(ev => ev.date === dateStr);
  };

  // ─── Month View ───
  const renderMonthView = () => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const calendarCells = [];
    for (let i = 0; i < firstDay; i++) {
      calendarCells.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      calendarCells.push(i);
    }

    return (
      <div>
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
          <h3 className="text-lg font-bold text-slate-700">
            {monthNames[currentMonth]} {currentYear}
          </h3>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {dayNames.map(name => (
            <div key={name} className="text-center font-bold text-slate-500 py-2 bg-slate-100 rounded-t-lg text-sm">
              {name}
            </div>
          ))}

          {calendarCells.map((dayNum, idx) => {
            if (!dayNum) {
              return <div key={`empty-${idx}`} className="bg-slate-50 border border-slate-100 rounded-lg min-h-[100px] opacity-50"></div>;
            }

            const isToday = dayNum === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
            const dayEvents = getEventsForDate(currentYear, currentMonth, dayNum);

            return (
              <div 
                key={`day-${dayNum}`} 
                className={`border rounded-lg p-2 min-h-[120px] transition-colors ${
                  isToday ? 'border-indigo-500 bg-indigo-50/30 ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className={`font-bold text-sm inline-flex items-center justify-center w-7 h-7 rounded-full mb-2 ${
                  isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'
                }`}>
                  {dayNum}
                </div>
                
                <div className="flex flex-col gap-1.5">
                  {dayEvents.map((ev, i) => (
                    <div key={i} className="bg-indigo-100 text-indigo-900 text-xs p-1.5 rounded font-medium shadow-sm border border-indigo-200" title={ev.title}>
                      <div className="truncate">{ev.title}</div>
                      {ev.startTime && <div className="text-[10px] text-indigo-700 mt-0.5" dir="ltr">{ev.startTime}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Year View (rolling 12 months from current month) ───
  const renderYearView = () => {
    const months = [];
    for (let offset = 0; offset < 12; offset++) {
      const m = (rollingStartMonth + offset) % 12;
      const y = rollingStartYear + Math.floor((rollingStartMonth + offset) / 12);
      const firstDay = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();

      const cells = [];
      for (let i = 0; i < firstDay; i++) cells.push(null);
      for (let i = 1; i <= daysInMonth; i++) cells.push(i);

      months.push({ index: m, year: y, cells, daysInMonth });
    }

    return (
      <div>
        <p className="text-center text-sm text-slate-400 mb-2">תצוגה מתגלגלת - 12 חודשים קדימה מהחודש הנוכחי</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {months.map(({ index: m, year: y, cells }) => {
            const isCurrentMonth = y === today.getFullYear() && m === today.getMonth();
            return (
              <div key={`${y}-${m}`} className={`border rounded-xl bg-white p-3 shadow-sm ${isCurrentMonth ? 'ring-2 ring-indigo-400' : ''}`}>
                <h4 className="font-bold text-slate-700 text-center mb-2 border-b pb-1">
                  {monthNames[m]} {y}
                </h4>
                <div className="grid grid-cols-7 gap-0.5">
                  {dayNames.map(name => (
                    <div key={name} className="text-center text-[10px] font-bold text-slate-400 py-1">
                      {name}
                    </div>
                  ))}
                  {cells.map((dayNum, idx) => {
                    if (!dayNum) {
                      return <div key={`empty-${idx}`} className="text-center p-1"></div>;
                    }
                    const isToday = dayNum === today.getDate() && m === today.getMonth() && y === today.getFullYear();
                    const dayEvents = getEventsForDate(y, m, dayNum);
                    const hasEvents = dayEvents.length > 0;

                    return (
                      <div 
                        key={`day-${dayNum}`}
                        className={`text-center p-1 text-xs rounded ${
                          isToday ? 'bg-indigo-600 text-white font-bold' : 
                          hasEvents ? 'bg-indigo-100 text-indigo-800 font-medium' : 'text-slate-600'
                        }`}
                        title={hasEvents ? dayEvents.map(e => e.title).join(', ') : ''}
                      >
                        {dayNum}
                        {hasEvents && <div className="w-1 h-1 bg-indigo-500 rounded-full mx-auto mt-0.5"></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border mt-6">
      <div className="flex items-center justify-between mb-6 border-b pb-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl font-bold text-slate-800">
            {viewMode === 'month' ? 'לוח שנה חודשי' : 'לוח שנה שנתי מלא'}
          </h2>
        </div>
        <button
          onClick={() => setViewMode(prev => prev === 'month' ? 'year' : 'month')}
          className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-100 transition text-sm font-medium border border-indigo-200"
        >
          <Eye className="w-4 h-4" />
          {viewMode === 'month' ? 'הצג שנה מלאה' : 'הצג חודש'}
        </button>
      </div>

      {isLoading ? <SkeletonLoader /> : (viewMode === 'month' ? renderMonthView() : renderYearView())}
    </div>
  );
}