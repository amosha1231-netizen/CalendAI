import React, { useState, useEffect } from "react";
import { Calendar, Clock, X, Loader2, Check, Share2, Sun, Filter, MessageSquare, Mail, Copy, ChevronRight, ChevronLeft } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

const ALL_DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 - 22:00

const DAY_NAMES_HE = {
  Sunday: 'ראשון', Monday: 'שני', Tuesday: 'שלישי',
  Wednesday: 'רביעי', Thursday: 'חמישי', Friday: 'שישי', Saturday: 'שבת'
};

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function MeetingWizard({ schedule, lang, t, onClose }) {
  const [step, setStep] = useState(1); // 1 = duration+subject, 2 = select slots, 3 = share link
  const [duration, setDuration] = useState(30);
  const [subject, setSubject] = useState("");
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    return ALL_DAY_KEYS[today];
  });
  const [selectedSlots, setSelectedSlots] = useState([]); // { hour, minute }
  const [showOnlyFree, setShowOnlyFree] = useState(true);
  const [linkCreating, setLinkCreating] = useState(false);
  const [bookingLink, setBookingLink] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState("");

  const isRTL = lang === 'he';

  const dayEvents = schedule[selectedDay] || [];

  function isSlotBusy(hour, minute) {
    const slotStart = `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
    const endHour = hour + Math.ceil(duration / 60);
    const endMin = (minute + duration) % 60;
    const slotEnd = `${String(endHour % 12 || 12).padStart(2, '0')}:${String(endMin).padStart(2, '0')} ${endHour >= 12 ? 'PM' : 'AM'}`;

    function parseTime(timeStr) {
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return null;
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    }

    const newStart = parseTime(slotStart);
    const newEnd = parseTime(slotEnd);
    if (newStart === null || newEnd === null) return false;

    for (const event of dayEvents) {
      const exStart = parseTime(event.startTime);
      const exEnd = parseTime(event.endTime);
      if (exStart === null || exEnd === null) continue;
      if (newStart < exEnd && newEnd > exStart) return true;
    }
    return false;
  }

  function toggleSlot(hour, minute) {
    if (isSlotBusy(hour, minute)) return;
    setSelectedSlots(prev => {
      const exists = prev.find(s => s.hour === hour && s.minute === minute);
      if (exists) return prev.filter(s => s.hour !== hour || s.minute !== minute);
      return [...prev, { hour, minute }];
    });
  }

  function formatTimeDisplay(hour, minute) {
    const h12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
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

  const handleCreateLink = async () => {
    if (selectedSlots.length === 0) {
      setError(t.wizardNoSlots);
      return;
    }
    setLinkCreating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/booking/create-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject || "Meeting",
          duration,
          slots: selectedSlots,
          day: selectedDay,
          hostName: "Host"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create link");
      setBookingLink(data.link);
      setBookingId(data.bookingId);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLinkCreating(false);
    }
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(bookingLink).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2500);
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = bookingLink;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2500);
      });
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `${t.shareWhatsAppText || 'Hey! I invite you to schedule a meeting with me on CalendAI'} ${bookingLink}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleEmailShare = () => {
    const subjectText = encodeURIComponent(t.shareEmailSubject || 'Invitation to Schedule a Meeting - CalendAI');
    const body = encodeURIComponent(`${t.shareEmailBody || 'Pick a time that works for you at:'}${bookingLink}`);
    window.open(`mailto:?subject=${subjectText}&body=${body}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} dir={isRTL ? 'rtl' : 'ltr'}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-800">{t.wizardTitle}</h2>
              <p className="text-xs text-slate-500">
                {step === 1 ? t.wizardStep1Desc : step === 2 ? t.wizardStep2Desc : t.wizardStep3Desc}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 border-b">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                step === s ? 'bg-blue-600 text-white' : 
                step > s ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {step > s ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-green-500' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Duration & Subject */}
        {step === 1 && (
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">{t.wizardDuration}</label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map(m => (
                  <button
                    key={m}
                    onClick={() => setDuration(m)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                      duration === m 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                    }`}
                  >
                    {m <= 60 ? `${m} ${t.wizardDurationMinutes}` : 
                     m === 90 ? t.wizardDuration90 : t.wizardDuration120}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t.wizardSubject}</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder={t.wizardSubjectPlaceholder}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                dir={isRTL ? 'rtl' : 'ltr'}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition"
              >
                {t.wizardNext} {isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Slots */}
        {step === 2 && (
          <div className="p-6 space-y-4">
            {/* Day Picker - Scrollable Tabs */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t.wizardSelectDay}</label>
              <div className="flex gap-1.5 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                {ALL_DAY_KEYS.map(dayKey => {
                  const isToday = dayKey === ALL_DAY_KEYS[new Date().getDay()];
                  const dateNum = getDayDate(dayKey);
                  return (
                    <button
                      key={dayKey}
                      onClick={() => { setSelectedDay(dayKey); setSelectedSlots([]); }}
                      className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border text-xs shrink-0 transition ${
                        selectedDay === dayKey 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : isToday 
                            ? 'bg-amber-50 border-amber-300 text-amber-800' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      <span className="font-semibold">{lang === 'he' ? DAY_NAMES_HE[dayKey] : dayKey.slice(0, 3)}</span>
                      <span className="text-[10px] opacity-75">{dateNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">{t.wizardSelectSlots}</label>
              <button
                onClick={() => setShowOnlyFree(!showOnlyFree)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  showOnlyFree 
                    ? 'bg-green-50 border-green-300 text-green-700' 
                    : 'bg-white border-slate-300 text-slate-600'
                }`}
              >
                <Filter className="w-3 h-3" />
                {showOnlyFree ? t.wizardShowOnlyFree : t.wizardShowAll}
              </button>
            </div>

            {/* Time Slots Grid */}
            <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 p-2">
                {HOURS.map(hour => (
                  [0, 30].map(minute => {
                    const busy = isSlotBusy(hour, minute);
                    const selected = selectedSlots.some(s => s.hour === hour && s.minute === minute);
                    
                    if (busy && showOnlyFree) return null;

                    return (
                      <button
                        key={`${hour}-${minute}`}
                        onClick={() => toggleSlot(hour, minute)}
                        className={`flex items-center justify-center px-2 py-2.5 rounded-lg text-xs font-medium border transition ${
                          busy 
                            ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed' 
                            : selected 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                              : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                        disabled={busy}
                      >
                        <span className="flex items-center gap-1">
                          {busy ? (
                            <><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> {t.wizardBusySlot}</>
                          ) : selected ? (
                            <><Check className="w-3 h-3" /> {formatTimeDisplay(hour, minute)}</>
                          ) : (
                            formatTimeDisplay(hour, minute)
                          )}
                        </span>
                      </button>
                    );
                  })
                ))}
              </div>
            </div>

            {/* Selected Count */}
            <div className="text-xs text-slate-500 text-center">
              {selectedSlots.length > 0 
                ? `${selectedSlots.length} ${t.wizardSelectSlots || 'slots selected'} (${duration} ${t.wizardDurationMinutes})` 
                : t.wizardNoSlots}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
                <span>{error}</span>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50 transition"
              >
                {isRTL ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />} {t.cancel}
              </button>
              <button
                onClick={handleCreateLink}
                disabled={selectedSlots.length === 0 || linkCreating}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-medium transition disabled:bg-green-400 disabled:cursor-not-allowed"
              >
                {linkCreating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t.wizardCreatingLink}</>
                ) : (
                  <><Share2 className="w-4 h-4" /> {t.wizardCreateLink}</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Share Link */}
        {step === 3 && (
          <div className="p-6 space-y-6">
            {/* Success indicator */}
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">{t.wizardStep3Title}</h3>
              <p className="text-sm text-slate-500 mt-1">{t.wizardStep3Desc}</p>
            </div>

            {/* Booking details summary */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-slate-700">
                  {lang === 'he' ? DAY_NAMES_HE[selectedDay] : selectedDay} · {duration} {t.wizardDurationMinutes}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-slate-600">
                  {selectedSlots.map(s => formatTimeDisplay(s.hour, s.minute)).join(', ')}
                </span>
              </div>
              {subject && (
                <div className="text-sm text-slate-600">
                  <span className="font-medium">{t.wizardSubject}</span> {subject}
                </div>
              )}
            </div>

            {/* Link display */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">{t.shareBookingLinkLabel}</label>
              <div className="text-sm text-slate-800 font-mono break-all bg-white p-2 rounded border border-slate-200" dir="ltr">
                {bookingLink}
              </div>
            </div>

            {/* Share Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition text-sm"
              >
                {linkCopied ? (
                  <><Check className="w-4 h-4" /> {t.wizardLinkCopied}</>
                ) : (
                  <><Copy className="w-4 h-4" /> {t.wizardCopyLink}</>
                )}
              </button>

              <button
                onClick={handleWhatsAppShare}
                className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg font-medium transition text-sm"
              >
                <MessageSquare className="w-4 h-4" /> {t.wizardWhatsApp}
              </button>

              <button
                onClick={handleEmailShare}
                className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg font-medium transition text-sm"
              >
                <Mail className="w-4 h-4" /> {t.wizardEmail}
              </button>
            </div>

            {/* Close button */}
            <div className="flex justify-center pt-2">
              <button
                onClick={onClose}
                className="text-sm text-slate-500 hover:text-slate-700 px-6 py-2 rounded-lg hover:bg-slate-50 transition"
              >
                {t.wizardClose}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}