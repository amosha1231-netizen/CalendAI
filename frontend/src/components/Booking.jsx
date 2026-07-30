import React, { useState, useEffect, useCallback, useRef } from "react";
import { Calendar, Clock, Loader2, Sparkles, X, Check, Sun, Moon, MapPin, Filter, Eye, EyeOff, Square, Mail, Phone, MessageSquare, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 - 22:00
const ALL_DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_NAMES_HE = {
  Sunday: 'ראשון', Monday: 'שני', Tuesday: 'שלישי',
  Wednesday: 'רביעי', Thursday: 'חמישי', Friday: 'שישי', Saturday: 'שבת'
};

const MEETING_TYPES = [
  { id: 'quick', mins: 15, icon: '⚡' },
  { id: 'standard', mins: 30, icon: '📅' },
  { id: 'consultation', mins: 60, icon: '🔍' }
];

export default function Booking({ schedule, lang, t, onClose, onConfirm }) {
  const [step, setStep] = useState('meeting-type'); // 'meeting-type' | 'select-time' | 'details' | 'success' | 'unavailable'
  const [selectedMeetingType, setSelectedMeetingType] = useState(null);
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    return ALL_DAY_KEYS[today];
  });
  const [priority1Slots, setPriority1Slots] = useState([]);
  const [priority2Slots, setPriority2Slots] = useState([]);
  const [duration, setDuration] = useState(30);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [dragPriority, setDragPriority] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [activePriority, setActivePriority] = useState(1);
  const [slotCheckLoading, setSlotCheckLoading] = useState(false);
  const [slotCheckError, setSlotCheckError] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
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
      setPriority1Slots(prev => prev.filter(s => s.hour !== hour || s.minute !== minute));
    } else if (existing2) {
      setPriority2Slots(prev => prev.filter(s => s.hour !== hour || s.minute !== minute));
    } else if (activePriority === 1) {
      setPriority1Slots(prev => [...prev, { hour, minute }]);
    } else {
      setPriority2Slots(prev => [...prev, { hour, minute }]);
    }
  };

  // Handle drag start
  const handleDragStart = (hour, minute, e) => {
    if (isSlotBusy(hour, minute)) return;
    setIsDragging(true);
    setDragStart({ hour, minute });
    setDragCurrent({ hour, minute });

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

  // Handle selecting a meeting type
  const handleSelectMeetingType = (type) => {
    setSelectedMeetingType(type);
    setDuration(type.mins);
    setStep('select-time');
  };

  // Handle proceeding to details - FIRST check slot availability
  const handleProceedToDetails = async () => {
    if (priority1Slots.length === 0) return;

    setSlotCheckLoading(true);
    setSlotCheckError("");

    // Check if the selected slot is still available by calling backend
    try {
      const allSlots = [
        ...priority1Slots.map(s => ({ ...s, priority: 1 })),
        ...priority2Slots.map(s => ({ ...s, priority: 2 }))
      ];

      // Validate each priority 1 slot against the backend
      for (const slot of allSlots) {
        if (slot.priority !== 1) continue;
        const startH12 = slot.hour % 12 || 12;
        const ampm = slot.hour >= 12 ? 'PM' : 'AM';
        const endHour = slot.hour + Math.ceil(duration / 60);
        const endMinute = (slot.minute + duration) % 60;
        const endH12 = endHour % 12 || 12;
        const endAmpm = endHour >= 12 ? 'PM' : 'AM';

        const startTime = `${String(startH12).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')} ${ampm}`;
        const endTime = `${String(endH12).padStart(2, '0')}:${String(endMinute).padStart(2, '0')} ${endAmpm}`;

        const checkRes = await fetch(`${API_BASE}/api/schedule/check-slot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            day: selectedDay,
            startTime,
            endTime
          }),
          credentials: "include"
        });
        const checkData = await checkRes.json();
        if (!checkRes.ok || checkData.available === false) {
          setSlotCheckError(t.bookingSlotUnavailable || 'The selected slot is no longer available. Please choose another slot.');
          setSlotCheckLoading(false);
          return;
        }
      }

      // All slots are available - proceed to details
      setSlotCheckLoading(false);
      setStep('details');
    } catch (err) {
      setSlotCheckError(t.bookingSlotUnavailable || 'The selected slot is no longer available. Please choose another slot.');
      setSlotCheckLoading(false);
    }
  };

  // Handle final booking confirmation
  const handleConfirmBooking = async () => {
    if (!guestName.trim() || !guestEmail.trim()) return;
    setBookingLoading(true);
    setSlotCheckError("");

    try {
      const allSlots = [
        ...priority1Slots.map(s => ({ ...s, priority: 1 })),
        ...priority2Slots.map(s => ({ ...s, priority: 2 }))
      ];

      await onConfirm({
        day: selectedDay,
        slots: allSlots,
        guestName: guestName || "אורח",
        guestEmail,
        guestPhone,
        guestNotes,
        duration,
        meetingType: selectedMeetingType?.id || 'standard'
      });

      setShowConfirmation(true);
      setStep('success');
    } catch (err) {
      setSlotCheckError(err.message);
    } finally {
      setBookingLoading(false);
    }
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

  // Get WhatsApp message
  const getWhatsAppMessage = () => {
    const msg = encodeURIComponent(t.bookingWhatsAppMsg || 'Hi, I booked a meeting through CalendAI. I would appreciate a reminder.');
    const phone = guestPhone ? guestPhone.replace(/[^0-9]/g, '') : '';
    return `https://wa.me/${phone ? '972' + phone.slice(phone.length === 10 ? 1 : 0) : ''}?text=${msg}`;
  };

  // ===================== MEETING TYPE STEP =====================
  if (step === 'meeting-type') {
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
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

        <div className="booking-meeting-type-section">
          <label className="booking-label">{t.bookingMeetingType || 'Choose a meeting type:'}</label>
          <div className="booking-meeting-type-grid">
            {/* Quick Chat Card */}
            <div className="booking-meeting-card" onClick={() => handleSelectMeetingType({ id: 'quick', mins: 15, icon: '⚡' })}>
              <div className="booking-meeting-card-icon">⚡</div>
              <h3 className="booking-meeting-card-title">{t.bookingQuickChat || 'Quick Chat'}</h3>
              <p className="booking-meeting-card-desc">{t.bookingQuickChatDesc || 'Short meeting of 15-30 minutes'}</p>
              <div className="booking-meeting-card-footer">
                <span className="booking-meeting-card-duration">15 {t.bookingMinutes}</span>
                <span className="booking-meeting-card-select">{t.bookingSelectCard || 'Select'}</span>
              </div>
            </div>

            {/* Standard Meeting Card */}
            <div className="booking-meeting-card" onClick={() => handleSelectMeetingType({ id: 'standard', mins: 30, icon: '📅' })}>
              <div className="booking-meeting-card-icon">📅</div>
              <h3 className="booking-meeting-card-title">{t.bookingStandard || 'Standard Meeting'}</h3>
              <p className="booking-meeting-card-desc">{t.bookingStandardDesc || 'Standard meeting of 30-60 minutes'}</p>
              <div className="booking-meeting-card-footer">
                <span className="booking-meeting-card-duration">30 {t.bookingMinutes}</span>
                <span className="booking-meeting-card-select">{t.bookingSelectCard || 'Select'}</span>
              </div>
            </div>

            {/* Consultation Card */}
            <div className="booking-meeting-card" onClick={() => handleSelectMeetingType({ id: 'consultation', mins: 60, icon: '🔍' })}>
              <div className="booking-meeting-card-icon">🔍</div>
              <h3 className="booking-meeting-card-title">{t.bookingConsultation || 'Consultation'}</h3>
              <p className="booking-meeting-card-desc">{t.bookingConsultationDesc || 'In-depth consultation of 60-90 minutes'}</p>
              <div className="booking-meeting-card-footer">
                <span className="booking-meeting-card-duration">60 {t.bookingMinutes}</span>
                <span className="booking-meeting-card-select">{t.bookingSelectCard || 'Select'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===================== SELECT TIME STEP =====================
  if (step === 'select-time') {
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="booking-header">
          <button onClick={() => setStep('meeting-type')} className="booking-close-btn">
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

        {/* Selected Meeting Type Badge */}
        {selectedMeetingType && (
          <div className="booking-selected-type-badge">
            <span>{selectedMeetingType.icon}</span>
            <span>
              {selectedMeetingType.id === 'quick' ? (t.bookingQuickChat || 'Quick Chat') :
               selectedMeetingType.id === 'standard' ? (t.bookingStandard || 'Standard Meeting') :
               (t.bookingConsultation || 'Consultation')}
            </span>
            <span className="booking-selected-type-duration">({selectedMeetingType.mins} {t.bookingMinutes})</span>
          </div>
        )}

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

        {/* Slot Check Error */}
        {slotCheckError && (
          <div className="booking-slot-error">
            <AlertCircle className="w-4 h-4" />
            <span>{slotCheckError}</span>
          </div>
        )}

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
            onClick={handleProceedToDetails}
            disabled={priority1Slots.length === 0 || slotCheckLoading}
            className="booking-confirm-btn"
          >
            {slotCheckLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t.bookingAiFinderLoading}</>
            ) : (
              <><Check className="w-5 h-5" /> {t.bookingConfirm}</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ===================== DETAILS STEP =====================
  if (step === 'details') {
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="booking-header">
          <button onClick={() => setStep('select-time')} className="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="booking-header-content">
            <Calendar className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="booking-title">{t.bookingDetailsTitle || 'Your Details'}</h2>
              <p className="booking-subtitle">
                {selectedDay} {priority1Slots.length > 0 ? formatTimeDisplay(priority1Slots[0].hour, priority1Slots[0].minute) : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Selected Time Summary */}
        <div className="booking-details-summary">
          <div className="booking-details-summary-item">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>
              {lang === 'he' ? DAY_NAMES_HE[selectedDay] : selectedDay} — 
              {priority1Slots.length > 0 ? formatTimeDisplay(priority1Slots[0].hour, priority1Slots[0].minute) : ''}
              {selectedMeetingType ? ` (${selectedMeetingType.mins} ${t.bookingMinutes})` : ''}
            </span>
          </div>
        </div>

        {/* Slot Check Error */}
        {slotCheckError && (
          <div className="booking-slot-error">
            <AlertCircle className="w-4 h-4" />
            <span>{slotCheckError}</span>
          </div>
        )}

        {/* Details Form */}
        <div className="booking-details-form">
          {/* Full Name */}
          <div className="booking-details-field">
            <label className="booking-label">
              {t.bookingGuestName} <span className="booking-required">*</span>
            </label>
            <input
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder={t.bookingGuestNamePlaceholder}
              className="booking-input"
              dir={isRTL ? 'rtl' : 'ltr'}
            />
          </div>

          {/* Email */}
          <div className="booking-details-field">
            <label className="booking-label">
              <Mail className="w-3.5 h-3.5 inline mr-1" />
              {t.bookingGuestEmail || 'Email'} <span className="booking-required">*</span>
            </label>
            <input
              type="email"
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              placeholder={t.bookingGuestEmailPlaceholder || 'Enter your email address'}
              className="booking-input"
              dir="ltr"
            />
          </div>

          {/* Phone / WhatsApp */}
          <div className="booking-details-field">
            <label className="booking-label">
              <Phone className="w-3.5 h-3.5 inline mr-1" />
              {t.bookingGuestPhone || 'Phone / WhatsApp'}
            </label>
            <input
              type="tel"
              value={guestPhone}
              onChange={e => setGuestPhone(e.target.value)}
              placeholder={t.bookingGuestPhonePlaceholder || 'Enter your phone number'}
              className="booking-input"
              dir="ltr"
            />
          </div>

          {/* Notes / Meeting Topic */}
          <div className="booking-details-field">
            <label className="booking-label">
              <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
              {t.bookingGuestNotes || 'Notes / Meeting Topic'}
            </label>
            <textarea
              value={guestNotes}
              onChange={e => setGuestNotes(e.target.value)}
              placeholder={t.bookingGuestNotesPlaceholder || 'Enter a short description or topic'}
              className="booking-input booking-textarea"
              rows="3"
              dir={isRTL ? 'rtl' : 'ltr'}
            />
          </div>
        </div>

        {/* Confirm Button */}
        <div className="booking-footer">
          <button
            onClick={handleConfirmBooking}
            disabled={!guestName.trim() || !guestEmail.trim() || bookingLoading}
            className="booking-confirm-btn"
          >
            {bookingLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t.bookingAiFinderLoading}</>
            ) : (
              <><Check className="w-5 h-5" /> {t.bookingConfirm}</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ===================== SUCCESS STEP =====================
  if (step === 'success') {
    const waLink = getWhatsAppMessage();
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="booking-header">
          <button onClick={onClose} className="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="booking-header-content">
            <Calendar className="w-6 h-6 text-green-600" />
            <div>
              <h2 className="booking-title">{t.bookingSuccessTitle || 'Booking Confirmed! ✅'}</h2>
            </div>
          </div>
        </div>

        {/* Success Content */}
        <div className="booking-success-content">
          <div className="booking-success-icon">
            <Sparkles className="w-12 h-12 text-green-500" />
          </div>
          <h3 className="booking-success-heading">{t.bookingSuccessTitle || 'Booking Confirmed! ✅'}</h3>
          <p className="booking-success-desc">{t.bookingSuccessDesc || 'We received your request. A confirmation will be sent via email and phone.'}</p>

          {/* Booking Details */}
          <div className="booking-success-details">
            <div className="booking-success-detail-item">
              <span className="booking-success-detail-label">{t.bookingGuestName}</span>
              <span className="booking-success-detail-value">{guestName}</span>
            </div>
            {guestEmail && (
              <div className="booking-success-detail-item">
                <span className="booking-success-detail-label"><Mail className="w-3 h-3 inline" /> Email</span>
                <span className="booking-success-detail-value">{guestEmail}</span>
              </div>
            )}
            {guestPhone && (
              <div className="booking-success-detail-item">
                <span className="booking-success-detail-label"><Phone className="w-3 h-3 inline" /> {t.bookingGuestPhone || 'Phone'}</span>
                <span className="booking-success-detail-value">{guestPhone}</span>
              </div>
            )}
            <div className="booking-success-detail-item">
              <span className="booking-success-detail-label"><Clock className="w-3 h-3 inline" /> {t.bookingDayPicker}</span>
              <span className="booking-success-detail-value">
                {lang === 'he' ? DAY_NAMES_HE[selectedDay] : selectedDay} — 
                {priority1Slots.length > 0 ? formatTimeDisplay(priority1Slots[0].hour, priority1Slots[0].minute) : ''}
              </span>
            </div>
            {selectedMeetingType && (
              <div className="booking-success-detail-item">
                <span className="booking-success-detail-label">{t.bookingDuration}</span>
                <span className="booking-success-detail-value">{selectedMeetingType.mins} {t.bookingMinutes}</span>
              </div>
            )}
          </div>

          {/* Email Confirmation Sent */}
          <div className="booking-email-sent">
            <Mail className="w-4 h-4 text-green-500" />
            <span>{t.bookingEmailSent || '✅ Confirmation sent to your email'}</span>
          </div>

          {/* WhatsApp Button */}
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="booking-whatsapp-btn"
          >
            <MessageSquare className="w-5 h-5" />
            {t.bookingWhatsAppBtn || 'Send WhatsApp Reminder'}
          </a>

          {/* Close Button */}
          <button onClick={onClose} className="booking-success-close-btn">
            {t.bookingClose || 'Close'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}