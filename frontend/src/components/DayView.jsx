import React, { useState, useEffect, useCallback } from 'react';
import { 
  Clock, Moon, Bell, BellRing, MapPin, Edit3, Trash2, 
  ChevronLeft, ChevronRight, Sun
} from 'lucide-react';
import { getTodayHebrewInfo } from '../utils/hebrewCalendar';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function DayView({ 
  date, schedule, dayKey, lang, t, 
  onEditEvent, onRemoveEvent, onSlotClick, 
  locationFilter, LOCATION_LABELS 
}) {
  const [hebrewInfo, setHebrewInfo] = useState({ hebDate: '', holidays: [], holidayName: null });
  const isRTL = lang === 'he';
  const today = new Date();
  const isToday = date && 
    date.getDate() === today.getDate() && 
    date.getMonth() === today.getMonth() && 
    date.getFullYear() === today.getFullYear();

  useEffect(() => {
    getTodayHebrewInfo().then(setHebrewInfo).catch(() => {});
  }, []);

  const getEventsForDay = useCallback(() => {
    const allEvents = [];
    const todayEvents = schedule['Today'] || [];
    for (const ev of todayEvents) {
      if (!ev._dayKey) ev._dayKey = 'Today';
      allEvents.push(ev);
    }
    if (dayKey && dayKey !== 'Today') {
      const dayEvents = schedule[dayKey] || [];
      for (const ev of dayEvents) {
        if (!ev._dayKey) ev._dayKey = dayKey;
        allEvents.push(ev);
      }
    }
    // Filter by location
    if (locationFilter && locationFilter !== 'all') {
      return allEvents.filter(e => e.location === locationFilter);
    }
    return allEvents;
  }, [schedule, dayKey, locationFilter]);

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return -1;
    // Try 12-hour AM/PM format first (e.g., "03:00 PM", "05:00 AM")
    const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = parseInt(ampmMatch[2], 10);
      if (ampmMatch[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (ampmMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    }
    // Fallback to 24-hour format (e.g., "15:00", "09:30")
    const h24Match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (h24Match) {
      const h = parseInt(h24Match[1], 10);
      const m = parseInt(h24Match[2], 10);
      return h * 60 + m;
    }
    return -1;
  };

  const getEventsForHour = (hour) => {
    const startMin = hour * 60;
    const endMin = startMin + 60;
    return events.filter(ev => {
      const evStart = timeToMinutes(ev.startTime);
      const evEnd = timeToMinutes(ev.endTime);
      if (evStart === -1) return false;
      // Event overlaps with this hour
      return evStart < endMin && (evEnd === -1 || evEnd > startMin);
    });
  };

  const events = getEventsForDay();
  const sortedEvents = [...events].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const formatHour = (hour) => {
    const h12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${String(h12).padStart(2, '0')}:00 ${ampm}`;
  };

  const monthNames = t.monthNames || ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = [t.daySunday, t.dayMonday, t.dayTuesday, t.dayWednesday, t.dayThursday, t.dayFriday, t.daySaturday];
  const dayOfWeek = date ? dayNames[date.getDay()] : '';
  const monthName = date ? monthNames[date.getMonth()] : '';
  const dayNum = date ? date.getDate() : '';
  const year = date ? date.getFullYear() : '';

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5">
      {/* Day Header with Hebrew Date + Holiday Badge */}
      <div className="flex flex-col items-center mb-6 pb-4 border-b border-slate-100">
        <div className="text-sm font-medium text-slate-500">{dayOfWeek}</div>
        <div className="text-3xl font-bold text-slate-800 mt-1">
          {dayNum} {monthName} {year}
        </div>
        {isToday && (
          <div className="mt-1 px-3 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            {t.viewToday}
          </div>
        )}
        {/* Hebrew Date */}
        {hebrewInfo.hebDate && (
          <div className="mt-2 text-sm text-indigo-600 font-medium">
            {t.hebrewDatePrefix}: {hebrewInfo.hebDate}
          </div>
        )}
        {/* Holiday Badges */}
        {hebrewInfo.holidays.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {hebrewInfo.holidays.map((h, i) => (
              <span
                key={i}
                className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  h.isMajor 
                    ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                }`}
              >
                {h.isMajor ? '🕯️ ' : ''}{h.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Events Summary Bar */}
      {sortedEvents.length > 0 && (
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
          <Sun className="w-3.5 h-3.5 text-blue-500" />
          <span>{sortedEvents.length} {t.dayDetailEvents}</span>
          <span className="text-slate-300">·</span>
          <span>
            {sortedEvents[0]?.startTime} - {sortedEvents[sortedEvents.length - 1]?.endTime}
          </span>
        </div>
      )}

      {/* Hourly Timeline */}
      <div className="space-y-1">
        {HOURS.map(hour => {
          const hourEvents = getEventsForHour(hour);
          const hasEvents = hourEvents.length > 0;
          return (
            <div
              key={hour}
              className={`flex gap-3 rounded-xl transition ${
                hasEvents ? 'bg-slate-50' : 'hover:bg-slate-50/50'
              }`}
            >
              {/* Time Label */}
              <div className="w-16 shrink-0 text-right pt-2 text-xs text-slate-400 font-mono" dir="ltr">
                {formatHour(hour)}
              </div>
              {/* Content */}
              <div className="flex-1 min-h-[40px] py-1">
                {hasEvents ? (
                  <div className="space-y-1">
                    {hourEvents.map((event, idx) => {
                      const actualIndex = schedule[event._dayKey || dayKey]?.findIndex(e => e === event);
                      return (
                        <div
                          key={idx}
                          className="group relative p-3 rounded-xl border-r-[3px] flex flex-col gap-1 hover:shadow-md transition cursor-pointer bg-white border-slate-200 hover:border-blue-400"
                          onClick={() => actualIndex >= 0 && onEditEvent && onEditEvent(event._dayKey || dayKey, actualIndex)}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); if (actualIndex >= 0) onRemoveEvent && onRemoveEvent(event._dayKey || dayKey, actualIndex); }}
                            className="absolute -top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center transition shadow-sm z-10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <div className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                            {event.isSleep && <Moon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                            {event.reminderMinutesBefore > 0 && <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            <span className="truncate">{event.title}</span>
                            <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity mr-auto shrink-0" />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span dir="ltr">{event.startTime} - {event.endTime}</span>
                            {event.isSleep && <span className="text-[10px] text-indigo-500 mr-1">{t.sleepLabel}</span>}
                          </div>
                          {event.reminderMinutesBefore > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-600">
                              <BellRing className="w-2.5 h-2.5" />
                              <span>{t.reminderColon} {event.reminderMinutesBefore} {t.reminderMinutes}</span>
                            </div>
                          )}
                          {event.location && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400">
                              <MapPin className="w-2.5 h-2.5" />
                              <span>{LOCATION_LABELS?.[event.location] || event.location}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className="h-full min-h-[32px] rounded-lg border border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition cursor-pointer flex items-center justify-center"
                    onClick={() => onSlotClick && onSlotClick(dayKey, `${String(hour).padStart(2,'0')}:00`)}
                  >
                    <span className="text-[10px] text-slate-300">+</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {sortedEvents.length === 0 && !hebrewInfo.holidayName && (
        <div className="text-center py-12">
          <Sun className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t.noEvents}</p>
        </div>
      )}
    </div>
  );
}