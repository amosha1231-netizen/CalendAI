import React, { useState, useEffect, useCallback } from 'react';
import { formatClock, formatTimeString } from "../utils/timeFormat";
import { 
  Clock, Moon, Bell, BellRing, MapPin, Edit3, Trash2, 
  ChevronLeft, ChevronRight, Sun
} from 'lucide-react';
import { getTodayHebrewInfo } from '../utils/hebrewCalendar';
import { ReminderChip } from './Reminders';
import TaskStatusCircle, { TaskProgressSummary } from './TaskStatusCircle';
import { toDateKey, addDaysKey, taskKey, fetchTaskStatuses, saveTaskStatus, summarizeStatuses } from '../utils/taskStatus';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function DayView({ 
  date, schedule, dayKey, lang, t, 
  onEditEvent, onRemoveEvent, onSlotClick, 
  locationFilter, LOCATION_LABELS,
  reminders = [], onOpenReminders, user
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

  // Task marks (done / postponed / not done) for this day and the 6 days before it.
  const dateKey = toDateKey(date || new Date());
  const weekFrom = addDaysKey(dateKey, -6);
  const isSignedIn = Boolean(user);
  const [statusItems, setStatusItems] = useState([]);
  const [statusError, setStatusError] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchTaskStatuses(isSignedIn ? user : null, weekFrom, dateKey)
      .then(items => { if (!cancelled) setStatusItems(items); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, isSignedIn]);

  const statusFor = (event) => {
    const key = taskKey(event);
    return statusItems.find(i => i.date === dateKey && i.key === key)?.status || null;
  };

  const handleStatusChange = async (event, status) => {
    const key = taskKey(event);
    if (!key) return;
    const previous = statusItems;
    const rest = statusItems.filter(i => !(i.date === dateKey && i.key === key));
    setStatusItems(status ? [...rest, { date: dateKey, key, title: event.title, startTime: event.startTime, status }] : rest);
    setStatusError('');
    try {
      await saveTaskStatus(isSignedIn ? user : null, { date: dateKey, key, title: event.title, startTime: event.startTime, status });
    } catch (e) {
      setStatusItems(previous);
      setStatusError(t.taskStatusSaveFailed);
    }
  };

  const getEventsForDay = useCallback(() => {
    // schedule['Today'] is a copy of today's weekday list (the server rebuilds
    // it from schedule[<weekday>] on every save and load), so show one list
    // or the other, never both: adding both put every event of today on the
    // screen twice, and put today's events on every other day too.
    const sourceKey = dayKey || 'Today';
    const allEvents = [];
    for (const ev of schedule[sourceKey] || []) {
      if (!ev._dayKey) ev._dayKey = sourceKey;
      allEvents.push(ev);
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
  const dayKeys = new Set(sortedEvents.map(taskKey));
  const dayStatusItems = statusItems.filter(i => i.date === dateKey && dayKeys.has(i.key));
  const weekSummary = summarizeStatuses(statusItems);

  const formatHour = (hour) => formatClock(hour, 0, lang);

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

      {sortedEvents.length > 0 && (
        <TaskProgressSummary dayItems={dayStatusItems} dayTotal={sortedEvents.length} weekSummary={weekSummary} t={t} />
      )}
      {statusError && (
        <div className="mb-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{statusError}</div>
      )}

      {/* Hourly Timeline */}
      <div className="space-y-1">
        {HOURS.map(hour => {
          const hourEvents = getEventsForHour(hour);
          const hourReminders = reminders.filter(r => parseInt(String(r.time), 10) === hour);
          const hasEvents = hourEvents.length > 0 || hourReminders.length > 0;
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
              <div className="flex-1 min-w-0 min-h-[40px] py-1">
                {hasEvents ? (
                  <div className="space-y-1">
                    {hourReminders.map(r => (
                      <ReminderChip key={r.id} reminder={r} lang={lang} onClick={onOpenReminders} />
                    ))}
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
                            aria-label={t.deleteEvent || (isRTL ? 'מחק אירוע' : 'Delete event')}
                            className="absolute -top-2 -end-2 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 bg-red-500 text-white rounded-full w-7 h-7 md:w-5 md:h-5 flex items-center justify-center transition shadow-sm z-10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <div className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                            <TaskStatusCircle status={statusFor(event)} onChange={s => handleStatusChange(event, s)} t={t} />
                            {event.isSleep && <Moon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                            {event.reminderMinutesBefore > 0 && <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            <span className={`truncate ${statusFor(event) === 'done' ? 'line-through text-slate-400' : ''}`}>{event.title}</span>
                            <Edit3 className="w-3 h-3 text-slate-300 md:opacity-0 md:group-hover:opacity-100 transition-opacity ms-auto shrink-0" />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span dir="ltr">{formatTimeString(event.startTime, lang)} - {formatTimeString(event.endTime, lang)}</span>
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
      {sortedEvents.length === 0 && reminders.length === 0 && !hebrewInfo.holidayName && (
        <div className="text-center py-12">
          <Sun className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t.noEvents}</p>
        </div>
      )}
    </div>
  );
}