import React, { useState, useEffect, useCallback, useRef } from "react";
import { Calendar, Clock, Loader2, Sparkles, X, Check, Sun, Moon, MapPin, Filter, Eye, EyeOff, Square, Mail, Phone, MessageSquare, AlertCircle, Share2, ExternalLink, Copy, Download, Users, Send } from "lucide-react";

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

export default function Booking({ schedule, lang, t, onClose, onConfirm, user }) {
  const [step, setStep] = useState('meeting-type'); // 'meeting-type' | 'select-time' | 'details' | 'success' | 'share-link'
  const [selectedMeetingType, setSelectedMeetingType] = useState(null);
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    return ALL_DAY_KEYS[today];
  });
  const [selectedSlots, setSelectedSlots] = useState([]); // { hour, minute, priority: 1|2 }
  const [activePriority, setActivePriority] = useState(1);
  const [duration, setDuration] = useState(30);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [ailoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [bookingId, setBookingId] = useState(null);
  const [shareLink, setShareLink] = useState("");
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [calendaiUserInput, setCalendaiUserInput] = useState("");
  const [calendaiUserSent, setCalendaiUserSent] = useState(false);
  const [calendaiUserSending, setCalendaiUserSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const gridRef = useRef(null);

  const isRTL = lang === 'he';

  const dayEvents = schedule[selectedDay] || [];
  const busySlots = dayEvents.map(e => ({
    start: e.startTime,
    end: e.endTime,
    title: e.title
  }));

  function isSlotBusy(hour, minute) {
    const slotStart = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const slotEndHour = minute + duration >= 60 ? hour + 1 : hour;
    const slotEndMin = (minute + duration) % 60;
    const slotEnd = `${String(slotEndHour).padStart(2, '0')}:${String(slotEndMin).padStart(2, '0')}`;

    for (const busy of busySlots) {
      const busyStart = convertTo24(busy.start);
      const busyEnd = convertTo24(busy.end);
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

  function getSlotPriority(hour, minute) {
    const slot = selectedSlots.find(s => s.hour === hour && s.minute === minute);
    return slot ? slot.priority : 0;
  }

  // Cycle priority: 1 -> 2 -> available -> unselected
  function cyclePriority(hour, minute) {
    const existing = selectedSlots.find(s => s.hour === hour && s.minute === minute);
    if (!existing) {
      // Add with current active priority
      return [...selectedSlots, { hour, minute, priority: activePriority }];
    }
    if (existing.priority === 1) {
      // Upgrade to priority 2
      return selectedSlots.map(s => s.hour === hour && s.minute === minute ? { ...s, priority: 2 } : s);
    }
    if (existing.priority === 2) {
      // Remove it
      return selectedSlots.filter(s => s.hour !== hour || s.minute !== minute);
    }
    return selectedSlots;
  }

  // Handle single click on a slot
  const handleSlotClick = (hour, minute) => {
    if (isSlotBusy(hour, minute)) return;
    setSelectedSlots(prev => cyclePriority(hour, minute));
  };

  // Handle drag start
  const handleDragStart = (hour, minute, e) => {
    if (isSlotBusy(hour, minute)) return;
    setIsDragging(true);
    setDragStart({ hour, minute });
    setDragCurrent({ hour, minute });
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
      return;
    }

    const startH = Math.min(dragStart.hour, dragCurrent.hour);
    const endH = Math.max(dragStart.hour, dragCurrent.hour);

    const newSlots = [];
    for (let h = startH; h <= endH; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (!isSlotBusy(h, m)) {
          newSlots.push({ hour: h, minute: m, priority: activePriority });
        }
      }
    }

    // Merge: remove existing slots in the drag range, add new ones
    setSelectedSlots(prev => {
      const filtered = prev.filter(s => !newSlots.some(u => u.hour === s.hour && u.minute === s.minute));
      return [...filtered, ...newSlots];
    });

    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  // Touch events for drag
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
      setSelectedSlots([{ hour: h, minute: m, priority: 1 }]);
    }
  };

  // Handle selecting a meeting type
  const handleSelectMeetingType = (type) => {
    setSelectedMeetingType(type);
    setDuration(type.mins);
    setStep('select-time');
  };

  // Confirm and create share link
  const handleConfirmAndCreateLink = () => {
    if (selectedSlots.length === 0) return;
    // Generate a unique booking ID
    const id = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    setBookingId(id);
    const link = typeof window !== 'undefined' 
      ? `${window.location.origin}${window.location.pathname}?book=${id}&day=${selectedDay}&slots=${selectedSlots.map(s => `${s.hour}-${s.minute}`).join(',')}&dur=${duration}`
      : '';
    setShareLink(link);
    setStep('share-link');
  };

  // Handle booking confirmation (from details form)
  const handleConfirmBooking = async () => {
    if (!guestName.trim() || !guestEmail.trim()) return;
    setBookingLoading(true);
    setBookingError("");

    try {
      await onConfirm({
        day: selectedDay,
        slots: selectedSlots,
        guestName: guestName || "אורח",
        guestEmail,
        guestPhone,
        guestNotes,
        duration,
        meetingType: selectedMeetingType?.id || 'standard'
      });

      setStep('success');
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCopyShareLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareLink).then(() => {
        setShareLinkCopied(true);
        setTimeout(() => setShareLinkCopied(false), 2500);
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = shareLink;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setShareLinkCopied(true);
        setTimeout(() => setShareLinkCopied(false), 2500);
      });
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`${t.shareWhatsAppText} ${shareLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(t.shareEmailSubject);
    const body = encodeURIComponent(`${t.shareEmailBody}${shareLink}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  const handleAddCalendaiUser = async () => {
    if (!calendaiUserInput.trim()) return;
    setCalendaiUserSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/booking/send-invitation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: calendaiUserInput.trim(),
          bookingId,
          shareLink,
          day: selectedDay,
          slots: selectedSlots,
          duration
        }),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation');
      setCalendaiUserSent(true);
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setCalendaiUserSending(false);
    }
  };

  // Generate Google Calendar link
  function getGoogleCalendarUrl() {
    if (selectedSlots.length === 0) return '#';
    const firstSlot = selectedSlots[0];
    const startDate = new Date();
    const dayIndex = ALL_DAY_KEYS.indexOf(selectedDay);
    const todayDay = new Date().getDay();
    let diff = dayIndex - todayDay;
    if (diff < 0) diff += 7;
    startDate.setDate(startDate.getDate() + diff);
    startDate.setHours(firstSlot.hour, firstSlot.minute, 0, 0);

    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + duration);

    const fmt = (d) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${t.bookingTitle}: ${guestName || 'Meeting'}`,
      dates: `${fmt(startDate)}/${fmt(endDate)}`,
      details: guestNotes || '',
      location: '',
      trp: 'false'
    });

    return `https://www.google.com/calendar/render?${params.toString()}`;
  }

  // Generate .ics file download
  function downloadIcs() {
    if (selectedSlots.length === 0) return;
    const firstSlot = selectedSlots[0];
    const startDate = new Date();
    const dayIndex = ALL_DAY_KEYS.indexOf(selectedDay);
    const todayDay = new Date().getDay();
    let diff = dayIndex - todayDay;
    if (diff < 0) diff += 7;
    startDate.setDate(startDate.getDate() + diff);
    startDate.setHours(firstSlot.hour, firstSlot.minute, 0, 0);

    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + duration);

    const fmt = (d) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CalendAI//Booking//EN',
      'BEGIN:VEVENT',
      `DTSTART:${fmt(startDate)}`,
      `DTEND:${fmt(endDate)}`,
      `SUMMARY:${t.bookingTitle}: ${guestName || 'Meeting'}`,
      `DESCRIPTION:${guestNotes || ''}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CalendAI_${selectedDay}_${firstSlot.hour}-${firstSlot.minute}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
            {MEETING_TYPES.map(type => (
              <div key={type.id} className="booking-meeting-card" onClick={() => handleSelectMeetingType(type)}>
                <div className="booking-meeting-card-icon">{type.icon}</div>
                <h3 className="booking-meeting-card-title">
                  {type.id === 'quick' ? (t.bookingQuickChat || 'Quick Chat') :
                   type.id === 'standard' ? (t.bookingStandard || 'Standard Meeting') :
                   (t.bookingConsultation || 'Consultation')}
                </h3>
                <p className="booking-meeting-card-desc">
                  {type.id === 'quick' ? (t.bookingQuickChatDesc || 'Short meeting') :
                   type.id === 'standard' ? (t.bookingStandardDesc || 'Standard meeting') :
                   (t.bookingConsultationDesc || 'In-depth consultation')}
                </p>
                <div className="booking-meeting-card-footer">
                  <span className="booking-meeting-card-duration">{type.mins} {t.bookingMinutes}</span>
                  <span className="booking-meeting-card-select">{t.bookingSelectCard || 'Select'}</span>
                </div>
              </div>
            ))}
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

        {/* Priority Selector */}
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

        {/* Single Day Time Grid */}
        <div className="booking-grid-wrapper">
          <div className="booking-grid booking-single-day" ref={gridRef} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            {/* Time labels column */}
            <div className="booking-time-labels">
              {HOURS.map(hour => (
                <div key={hour} className="booking-time-label">
                  <span>{formatTimeDisplay(hour, 0)}</span>
                </div>
              ))}
            </div>

            {/* Slots for the selected day */}
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

        {/* Error */}
        {bookingError && (
          <div className="booking-slot-error">
            <AlertCircle className="w-4 h-4" />
            <span>{bookingError}</span>
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
            {t.bookingPriority1}: {selectedSlots.filter(s => s.priority === 1).length > 0
              ? selectedSlots.filter(s => s.priority === 1).map(s => formatTimeDisplay(s.hour, s.minute)).join(', ')
              : '—'}
          </p>
          <p>
            {t.bookingPriority2}: {selectedSlots.filter(s => s.priority === 2).length > 0
              ? selectedSlots.filter(s => s.priority === 2).map(s => formatTimeDisplay(s.hour, s.minute)).join(', ')
              : '—'}
          </p>
        </div>

        {/* AI Finder */}
        <div className="booking-ai-section">
          <button
            onClick={handleAiFind}
            disabled={ailoading}
            className="booking-ai-btn"
          >
            {ailoading ? (
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
            onClick={handleConfirmAndCreateLink}
            disabled={selectedSlots.length === 0}
            className="booking-confirm-btn"
          >
            <Share2 className="w-5 h-5" /> {t.bookingCreateLink}
          </button>
        </div>
      </div>
    );
  }

  // ===================== SHARE LINK STEP =====================
  if (step === 'share-link') {
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="booking-header">
          <button onClick={() => setStep('select-time')} className="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="booking-header-content">
            <Share2 className="w-6 h-6 text-emerald-600" />
            <div>
              <h2 className="booking-title">{t.bookingShareModalTitle}</h2>
              <p className="booking-subtitle">{t.bookingShareModalDesc}</p>
            </div>
          </div>
        </div>

        {/* Selected Slots Summary */}
        <div className="booking-details-summary">
          <div className="booking-details-summary-item">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>
              {lang === 'he' ? DAY_NAMES_HE[selectedDay] : selectedDay} — 
              {selectedSlots.length > 0 ? selectedSlots.filter(s => s.priority === 1).slice(0, 3).map(s => formatTimeDisplay(s.hour, s.minute)).join(', ') : ''}
              {selectedMeetingType ? ` (${selectedMeetingType.mins} ${t.bookingMinutes})` : ''}
            </span>
          </div>
        </div>

        {/* Share Link Display */}
        <div className="booking-share-link-box">
          <label className="booking-label">{t.shareBookingLinkLabel}</label>
          <div className="booking-share-link-url" dir="ltr">
            {shareLink}
          </div>
          <button onClick={handleCopyShareLink} className="booking-share-copy-btn">
            {shareLinkCopied ? (
              <><Check className="w-4 h-4" /> {t.shareBookingCopied}</>
            ) : (
              <><Copy className="w-4 h-4" /> {t.shareBookingCopy}</>
            )}
          </button>
        </div>

        {/* Share Options */}
        <div className="booking-share-options">
          <p className="booking-share-options-title">{t.bookingOr}</p>

          {/* WhatsApp Share */}
          <button onClick={handleWhatsAppShare} className="booking-share-btn booking-share-whatsapp">
            <MessageSquare className="w-5 h-5" />
            {t.shareWhatsAppBtn}
          </button>

          {/* Email Share */}
          <button onClick={handleEmailShare} className="booking-share-btn booking-share-email">
            <Mail className="w-5 h-5" />
            {t.shareEmailBtn}
          </button>

          {/* Add CalendAI User */}
          <div className="booking-share-calendai-user">
            <label className="booking-label">
              <Users className="w-4 h-4 inline mr-1" />
              {t.shareAddCalendaiUser}
            </label>
            <div className="booking-share-calendai-input-row">
              <input
                type="text"
                value={calendaiUserInput}
                onChange={e => setCalendaiUserInput(e.target.value)}
                placeholder={t.shareAddCalendaiUserPlaceholder}
                className="booking-input"
                dir={isRTL ? 'rtl' : 'ltr'}
                disabled={calendaiUserSent}
              />
              <button
                onClick={handleAddCalendaiUser}
                disabled={!calendaiUserInput.trim() || calendaiUserSending || calendaiUserSent}
                className="booking-share-calendai-send-btn"
              >
                {calendaiUserSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : calendaiUserSent ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            {calendaiUserSent && (
              <p className="booking-share-calendai-sent">{t.shareAddCalendaiUserSent}</p>
            )}
          </div>
        </div>

        {/* Error */}
        {bookingError && (
          <div className="booking-slot-error">
            <AlertCircle className="w-4 h-4" />
            <span>{bookingError}</span>
          </div>
        )}

        {/* Proceed to Details */}
        <div className="booking-footer">
          <button
            onClick={() => setStep('details')}
            className="booking-confirm-btn booking-confirm-secondary"
          >
            <Check className="w-5 h-5" /> {t.bookingConfirm}
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
          <button onClick={() => setStep('share-link')} className="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="booking-header-content">
            <Calendar className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="booking-title">{t.bookingDetailsTitle || 'Your Details'}</h2>
              <p className="booking-subtitle">
                {selectedDay} {selectedSlots.length > 0 ? formatTimeDisplay(selectedSlots[0].hour, selectedSlots[0].minute) : ''}
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
              {selectedSlots.length > 0 ? formatTimeDisplay(selectedSlots[0].hour, selectedSlots[0].minute) : ''}
              {selectedMeetingType ? ` (${selectedMeetingType.mins} ${t.bookingMinutes})` : ''}
            </span>
          </div>
        </div>

        {/* Error */}
        {bookingError && (
          <div className="booking-slot-error">
            <AlertCircle className="w-4 h-4" />
            <span>{bookingError}</span>
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

        {/* Calendar Sync (for logged-in users) */}
        {user && (
          <div className="booking-calendar-sync-section">
            <p className="booking-calendar-sync-label">{t.bookingDuration}</p>
            <div className="booking-calendar-sync-buttons">
              <a
                href={getGoogleCalendarUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="booking-calendar-sync-btn booking-gcal-btn"
              >
                <Calendar className="w-4 h-4" />
                {t.addToGoogleCalendar}
              </a>
              <button onClick={downloadIcs} className="booking-calendar-sync-btn booking-ics-btn">
                <Download className="w-4 h-4" />
                {t.downloadIcs}
              </button>
            </div>
          </div>
        )}

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
                {selectedSlots.length > 0 ? formatTimeDisplay(selectedSlots[0].hour, selectedSlots[0].minute) : ''}
              </span>
            </div>
            {selectedMeetingType && (
              <div className="booking-success-detail-item">
                <span className="booking-success-detail-label">{t.bookingDuration}</span>
                <span className="booking-success-detail-value">{selectedMeetingType.mins} {t.bookingMinutes}</span>
              </div>
            )}
          </div>

          {/* Calendar Sync Buttons */}
          <div className="booking-calendar-sync-section">
            <div className="booking-calendar-sync-buttons">
              <a
                href={getGoogleCalendarUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="booking-calendar-sync-btn booking-gcal-btn"
              >
                <Calendar className="w-4 h-4" />
                {t.addToGoogleCalendar}
              </a>
              <button onClick={downloadIcs} className="booking-calendar-sync-btn booking-ics-btn">
                <Download className="w-4 h-4" />
                {t.downloadIcs}
              </button>
            </div>
          </div>

          {/* Email Confirmation Sent */}
          <div className="booking-email-sent">
            <Mail className="w-4 h-4 text-green-500" />
            <span>{t.bookingEmailSent || '✅ Confirmation sent to your email'}</span>
          </div>

          {/* Virality Banner */}
          <div className="booking-virality-banner">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>{t.viralityBannerText}</span>
          </div>

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