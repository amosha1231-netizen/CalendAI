import React, { useState, useEffect, useCallback, useRef } from "react";
import { Calendar, Clock, Loader2, Sparkles, X, ChevronLeft, ChevronRight, Check, Sun, Moon, MapPin, Filter, Eye, EyeOff, Square } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 - 22:00
const ALL_DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_NAMES_HE = {
  Sunday: 'ראשון', Monday: 'שני', Tuesday: 'שלישי',
  Wednesday: 'רביעי', Thursday: 'חמישי', Friday: 'שישי', Saturday: 'שבת'
};

export default function Booking({ schedule, lang, t, onClose, onConfirm }) {
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    return ALL_DAY_KEYS[today];
  });
  const [priority1Slots, setPriority1Slots] = useState([]);
  const [priority2Slots, setPriority2Slots] = useState([]);
  const [guestName, setGuestName] = useState("");
  const [duration, setDuration] = useState(30);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [dragPriority, setDragPriority] = useState(null); // 1 or 2
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [activePriority, setActivePriority] = useState(1); // 1 or 2
  const gridRef = useRef(null);

  const isRTL = lang === 'he';

  const dayEvents = schedule[selectedDay] || [];
  const busySlots = dayEvents.map(e => ({
    start: e.startTime,
    end: e.endTime,
    title: e.title
  }));

  // Determine if a specific time slot is busy
  function isSlotBusy(hour, minute) {
    const slotStart = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const slotEndHour = minute + duration >= 60 ? hour + 1 : hour;
    const slotEndMin = (minute + duration) % 60;
    const slotEnd = `${String(slotEndHour).padStart(2, '0')}:${String(slotEndMin).padStart(2, '0')}`;

    for (const busy of busySlots) {
      const busyStart = convertTo24(busy.start);
      const busyEnd = convertTo24(busy.end);
      // Check overlap
      if (slotStart < busyEnd && slotEnd > busyStart) {
        return true;
      }
    }
    return false;
  }

  function convertTo24(timeStr) {
    if (!timeStr) return "00:00";
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return timeStr;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatTimeDisplay(hour, minute) {
    const h12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
  }

  function getSlotKey(hour, minute) {
    return `${hour}:${minute}`;
  }

  function isSlotInList(hour, minute, list) {
    return list.some(s => s.hour === hour && s.minute === minute);
  }

  function getSlotPriority(hour, minute) {
    if (isSlotInList(hour, minute, priority1Slots)) return 1;
    if (isSlotInList(hour, minute, priority2Slots)) return 2;
    return 0;
  }

  // Handle click on a slot
  const handleSlotClick = (hour, minute) => {
    if (isSlotBusy(hour, minute)) return;

    const existing1 = isSlotInList(hour, minute, priority1Slots);
    const existing2 = isSlotInList(hour, minute, priority2Slots);

    if (existing1) {
      // Remove from priority 1
      setPriority1Slots(prev => prev.filter(s => s.hour !== hour || s.minute !== minute));
    } else if (existing2) {
      // Remove from priority 2
      setPriority2Slots(prev => prev.filter(s => s.hour !== hour || s.minute !== minute));
    } else if (activePriority === 1) {
      // Add to priority 1
      setPriority1Slots(prev => [...prev, { hour, minute }]);
    } else {
      // Add to priority 2
      setPriority2Slots(prev => [...prev, { hour, minute }]);
    }
  };

  // Handle drag start
  const handleDragStart = (hour, minute, e) => {
    if (isSlotBusy(hour, minute)) return;
    setIsDragging(true);
    setDragStart({ hour, minute });
    setDragCurrent({ hour, minute });

    // Determine priority level for this drag
    const existing1 = isSlotInList(hour, minute, priority1Slots);
    const existing2 = isSlotInList(hour, minute, priority2Slots);

    if (existing1) {
      setDragPriority(1);
      setPriority1Slots(prev => prev.filter(s => s.hour !== hour || s.minute !== minute));
    } else if (existing2) {
      setDragPriority(2);
      setPriority2Slots(prev => prev.filter(s => s.hour !== hour || s.minute !== minute));
    } else {
      setDragPriority(activePriority);
    }
  };

  const handleDragMove = (hour, minute) => {
    if (!isDragging || !dragStart) return;
    setDragCurrent({ hour, minute });
  };

  const handleDragEnd = () => {
    if (!isDragging || !dragStart || !dragCurrent) {
      setIsDragging(false);
      setDragStart(null);
      setDragCurrent(null);
      setDragPriority(null);
      return;
    }

    // Collect all slots in the drag range
    const startH = Math.min(dragStart.hour, dragCurrent.hour);
    const endH = Math.max(dragStart.hour, dragCurrent.hour);
    const startM = dragStart.hour < dragCurrent.hour ? dragStart.minute : dragCurrent.minute;
    const endM = dragStart.hour > dragCurrent.hour ? dragStart.minute : dragCurrent.minute;

    const newSlots = [];
    for (let h = startH; h <= endH; h++) {
      const minStart = (h === startH) ? startM : 0;
      const minEnd = (h === endH) ? endM : 0;
      for (let m = minStart; m <= minEnd; m += 30) {
        if (!isSlotBusy(h, m)) {
          newSlots.push({ hour: h, minute: m });
        }
      }
    }

    // Remove duplicates
    const unique = newSlots.filter((s, i, self) => self.findIndex(x => x.hour === s.hour && x.minute === s.minute) === i);

    if (dragPriority === 1) {
      setPriority1Slots(prev => {
        const filtered = prev.filter(s => !unique.some(u => u.hour === s.hour && u.minute === s.minute));
        return [...filtered, ...unique];
      });
    } else if (dragPriority === 2) {
      setPriority2Slots(prev => {
        const filtered = prev.filter(s => !unique.some(u => u.hour === s.hour && u.minute === s.minute));
        return [...filtered, ...unique];
      });
    }

    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
    setDragPriority(null);
  };

  // Handle touch events for drag
  const handleTouchStart = (hour, minute, e) => {
    handleDragStart(hour, minute, e);
  };

  const handleTouchMove = (e) => {
    if (!isDragging || !gridRef.current) return;
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element) {
      const slotKey = element.dataset?.slot;
      if (slotKey) {
        const [h, m] = slotKey.split(':').map(Number);
        handleDragMove(h, m);
      }
    }
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // AI Finder
  const handleAiFind = async () => {
    setAiLoading(true);
    setAiError("");
    setAiResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/booking/ai-find-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          day: selectedDay,
          durationMinutes: duration,
          guestName: guestName || "אורח"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI finder failed");
      setAiResult(data);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSelectAiSlot = (slot) => {
    // Parse the slot's startTime to get hour/minute
    const match = slot.startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      setPriority1Slots([{ hour: h, minute: m }]);
    }
  };

  const handleConfirm = () => {
    if (priority1Slots.length === 0) return;
    setShowConfirmation(true);
    const allSlots = [
      ...priority1Slots.map(s => ({ ...s, priority: 1 })),
      ...priority2Slots.map(s => ({ ...s, priority: 2 }))
    ];
    onConfirm({
      day: selectedDay,
      slots: allSlots,
      guestName: guestName || "אורח",
      duration
    });
  };

  function getDayDate(dayKey) {
    const dayIndex = ALL_DAY_KEYS.indexOf(dayKey);
    const today = new Date();
    const currentDay = today.getDay();
    let diff = dayIndex - currentDay;
    if (diff < 0) diff += 7;
    const date = new Date(today);
    date.setDate(today.getDate() + diff);
    return date.getDate();
  }

  return (
    <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="booking-header">
        <button onClick={onClose} className="booking-close-btn">
          <X className="w-5 h-5" />
        </button>
        <div className="booking-header-content">
          <Calendar className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="booking-title">{t.bookingTitle}</h2>
            <p className="booking-subtitle">{t.bookingSubtitle}</p>
          </div>
        </div>
      </div>

      {/* Guest Name Input */}
      <div className="booking-guest-section">
        <label className="booking-label">{t.bookingGuestName}</label>
        <input
          type="text"
          value={guestName}
          onChange={e => setGuestName(e.target.value)}
          placeholder={t.bookingGuestNamePlaceholder}
          className="booking-input"
          dir={isRTL ? 'rtl' : 'ltr'}
        />
      </div>

      {/* Duration Selector */}
      <div className="booking-duration-section">
        <label className="booking-label">{t.bookingDuration}</label>
        <div className="booking-duration-options">
          {[15, 30, 45, 60, 90, 120].map(m => (
            <button
              key={m}
              onClick={() => setDuration(m)}
              className={`booking-duration-btn ${duration === m ? 'active' : ''}`}
            >
              {m} {t.bookingMinutes}
            </button>
          ))}
        </div>
      </div>

      {/* Priority Selector & Filter */}
      <div className="booking-priority-section">
        <label className="booking-label">{t.bookingPrioritySelect}</label>
        <div className="booking-priority-options">
          <button
            onClick={() => setActivePriority(1)}
            className={`booking-priority-btn ${activePriority === 1 ? 'active priority-1-active' : ''}`}
          >
            <span className="booking-priority-color priority-1-dot" />
            {t.bookingFirstChoiceColor}
          </button>
          <button
            onClick={() => setActivePriority(2)}
            className={`booking-priority-btn ${activePriority === 2 ? 'active priority-2-active' : ''}`}
          >
            <span className="booking-priority-color priority-2-dot" />
            {t.bookingSecondChoiceColor}
          </button>
        </div>
      </div>

      {/* Filter Toggle */}
      <div className="booking-filter-section">
        <button
          onClick={() => setShowUnavailable(!showUnavailable)}
          className={`booking-filter-btn ${showUnavailable ? 'active' : ''}`}
        >
          {showUnavailable ? (
            <><Eye className="w-4 h-4" /> {t.bookingShowUnavailable}</>
          ) : (
            <><EyeOff className="w-4 h-4" /> {t.bookingAvailableOnly}</>
          )}
        </button>
      </div>

      {/* Day Picker - Scrollable Tabs */}
      <div className="booking-day-picker">
        <label className="booking-label">{t.bookingDayPicker}</label>
        <div className="booking-day-tabs">
          {ALL_DAY_KEYS.map(dayKey => {
            const isToday = dayKey === ALL_DAY_KEYS[new Date().getDay()];
            const dateNum = getDayDate(dayKey);
            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDay(dayKey)}
                className={`booking-day-tab ${selectedDay === dayKey ? 'active' : ''} ${isToday ? 'today' : ''}`}
              >
                <span className="booking-day-name">
                  {lang === 'he' ? DAY_NAMES_HE[dayKey] : dayKey.slice(0, 3)}
                </span>
                <span className="booking-day-date">{dateNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Grid */}
      <div className="booking-grid-wrapper">
        <div className="booking-grid" ref={gridRef} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          {/* Time labels column */}
          <div className="booking-time-labels">
            {HOURS.map(hour => (
              <div key={hour} className="booking-time-label">
                <span>{formatTimeDisplay(hour, 0)}</span>
              </div>
            ))}
          </div>

          {/* Slots */}
          <div className="booking-slots">
            {HOURS.map(hour => (
              <div key={hour} className="booking-slot-row">
                {[0, 30].map(minute => {
                  const busy = isSlotBusy(hour, minute);
                  const priority = getSlotPriority(hour, minute);
                  const isDragOver = isDragging && dragStart && dragCurrent &&
                    hour >= Math.min(dragStart.hour, dragCurrent.hour) &&
                    hour <= Math.max(dragStart.hour, dragCurrent.hour) &&
                    minute >= (Math.min(dragStart.hour, dragCurrent.hour) === hour ? Math.min(dragStart.minute, dragCurrent.minute) : 0) &&
                    minute <= (Math.max(dragStart.hour, dragCurrent.hour) === hour ? Math.max(dragStart.minute, dragCurrent.minute) : 0) &&
                    !busy;

                  // Hide busy slots if showUnavailable is false
                  if (busy && !showUnavailable) return null;

                  return (
                    <div
                      key={`${hour}-${minute}`}
                      data-slot={`${hour}:${minute}`}
                      className={`booking-slot 
                        ${busy ? 'busy' : 'free'} 
                        ${priority === 1 ? 'priority-1' : ''} 
                        ${priority === 2 ? 'priority-2' : ''}
                        ${isDragOver ? 'drag-over' : ''}
                        ${isDragging && dragStart && dragStart.hour === hour && dragStart.minute === minute ? 'drag-origin' : ''}
                      `}
                      onClick={() => handleSlotClick(hour, minute)}
                      onMouseDown={(e) => handleDragStart(hour, minute, e)}
                      onMouseEnter={() => handleDragMove(hour, minute)}
                      onMouseUp={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(hour, minute, e)}
                    >
                      {busy && (
                        <span className="booking-slot-busy-label">{t.bookingBusy}</span>
                      )}
                      {priority === 1 && (
                        <span className="booking-slot-priority-label">1</span>
                      )}
                      {priority === 2 && (
                        <span className="booking-slot-priority-label">2</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="booking-legend">
        <div className="booking-legend-item">
          <div className="booking-legend-color busy-color" />
          <span>{t.bookingBusy}</span>
        </div>
        <div className="booking-legend-item">
          <div className="booking-legend-color priority1-color" />
          <span>{t.bookingPriority1}</span>
        </div>
        <div className="booking-legend-item">
          <div className="booking-legend-color priority2-color" />
          <span>{t.bookingPriority2}</span>
        </div>
      </div>

      {/* Selected slots summary */}
      <div className="booking-summary">
        <p>
          {t.bookingPriority1}: {priority1Slots.length > 0
            ? priority1Slots.map(s => formatTimeDisplay(s.hour, s.minute)).join(', ')
            : '—'}
        </p>
        <p>
          {t.bookingPriority2}: {priority2Slots.length > 0
            ? priority2Slots.map(s => formatTimeDisplay(s.hour, s.minute)).join(', ')
            : '—'}
        </p>
      </div>

      {/* AI Finder */}
      <div className="booking-ai-section">
        <button
          onClick={handleAiFind}
          disabled={aiLoading}
          className="booking-ai-btn"
        >
          {aiLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t.bookingAiFinderLoading}</>
          ) : (
            <><Sparkles className="w-4 h-4" /> {t.bookingAiFinder}</>
          )}
        </button>

        {aiError && (
          <div className="booking-ai-error">{aiError}</div>
        )}

        {aiResult && (
          <div className="booking-ai-result">
            {aiResult.aiMessage && (
              <p className="booking-ai-message">{aiResult.aiMessage}</p>
            )}
            {aiResult.suggestion && aiResult.suggestion.type === 'merge_tasks' && (
              <div className="booking-ai-suggestion">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>{aiResult.suggestion.message}</span>
              </div>
            )}
            {aiResult.freeSlots && aiResult.freeSlots.length > 0 && (
              <div className="booking-ai-slots">
                <p className="booking-ai-slots-title">{t.bookingAiSuggestion}</p>
                {aiResult.freeSlots.slice(0, 3).map((slot, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectAiSlot(slot)}
                    className="booking-ai-slot-btn"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{slot.startTime} - {slot.endTime}</span>
                    <span className="booking-ai-slot-duration">
                      ({slot.durationMinutes} {t.bookingMinutes})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm Button */}
      <div className="booking-footer">
        <button
          onClick={handleConfirm}
          disabled={priority1Slots.length === 0}
          className="booking-confirm-btn"
        >
          <Check className="w-5 h-5" />
          {t.bookingConfirm}
        </button>
      </div>

      {/* Confirmation overlay */}
      {showConfirmation && (
        <div className="booking-overlay">
          <div className="booking-confirmation">
            <Sparkles className="w-10 h-10 text-green-500" />
            <h3>{t.bookingConfirmation}</h3>
            <p>{guestName || t.bookingGuestName} — {selectedDay}</p>
            <button onClick={onClose} className="booking-confirm-close">
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}