import React, { useState, useEffect } from "react";
import { Calendar, Clock, Loader2, Check, X, Sparkles, ExternalLink, Mail, Phone, MessageSquare } from "lucide-react";
import { isShabbatNow } from "../utils/shabbatHelper";
import ShabbatBanner from "./ShabbatBanner";

const API_BASE = import.meta.env.VITE_API_URL || "";

const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function GuestBookingView({ bookingId, lang, t, onClose }) {
  // ── Shabbat Guard ──
  const [shabbatActive] = useState(() => isShabbatNow());

  // Check every minute if Shabbat status changed
  useEffect(() => {
    if (!shabbatActive) return;
    const interval = setInterval(() => {
      if (!isShabbatNow()) {
        window.location.reload();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [shabbatActive]);

  if (shabbatActive) {
    return <ShabbatBanner t={t} lang={lang} />;
  }

  const [booking, setBooking] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const isRTL = lang === 'he';
  const dayNames = lang === 'he' ? DAY_NAMES_HE : DAY_NAMES_EN;

  useEffect(() => {
    if (!bookingId) return;
    const fetchBooking = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/booking/${bookingId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Booking not found");
        setBooking(data.booking);
        setSlots(data.slots);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [bookingId]);

  function formatTimeDisplay(hour, minute) {
    const h12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
  }

  function getDayDisplayName(dayKey) {
    const dayIndex = DAY_NAMES_EN.indexOf(dayKey);
    if (dayIndex === -1) return dayKey;
    return dayNames[dayIndex];
  }

  function getDayDate(dayKey) {
    const dayIndex = DAY_NAMES_EN.indexOf(dayKey);
    if (dayIndex === -1) return '';
    const today = new Date();
    const currentDay = today.getDay();
    let diff = dayIndex - currentDay;
    if (diff < 0) diff += 7;
    const date = new Date(today);
    date.setDate(today.getDate() + diff);
    return date.getDate();
  }

  function getMonthName(dayKey) {
    const dayIndex = DAY_NAMES_EN.indexOf(dayKey);
    if (dayIndex === -1) return '';
    const today = new Date();
    const currentDay = today.getDay();
    let diff = dayIndex - currentDay;
    if (diff < 0) diff += 7;
    const date = new Date(today);
    date.setDate(today.getDate() + diff);
    const monthNames = lang === 'he'
      ? ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
      : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return monthNames[date.getMonth()];
  }

  const handleConfirm = async () => {
    if (selectedSlotIndex === null || !guestName.trim()) return;
    setConfirming(true);
    setConfirmError("");
    try {
      const res = await fetch(`${API_BASE}/api/booking/${bookingId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotIndex: selectedSlotIndex,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim(),
          guestNotes: guestNotes.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Confirmation failed");
      setConfirmed(true);
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirming(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm w-full">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">{t.bookingAiFinderLoading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm w-full">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-7 h-7 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">{t.bookingSlotUnavailable || 'Booking Error'}</h3>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button onClick={onClose} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            {t.bookingClose || 'Close'}
          </button>
        </div>
      </div>
    );
  }

  // Confirmed state - Enhanced success screen
  if (confirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">{t.bookingSuccessTitle || t.guestViewSuccess}</h3>
          <p className="text-sm text-slate-500 mb-6">{t.bookingSuccessDesc || t.guestViewSuccessDesc}</p>

          {/* Booking Details */}
          {booking && selectedSlotIndex !== null && slots[selectedSlotIndex] && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-6">
              <div className="flex items-center gap-2 text-sm mb-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-slate-700">
                  {getDayDisplayName(booking.day)} · {getDayDate(booking.day)}/{getMonthName(booking.day)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{formatTimeDisplay(slots[selectedSlotIndex].hour, slots[selectedSlotIndex].minute)} · {booking.duration} {t.wizardDurationMinutes || 'min'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="font-medium">{t.wizardSubject}:</span> {booking.subject}
              </div>
            </div>
          )}

          {/* Referral Banner */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <span className="text-sm font-bold text-indigo-800">{t.referralBannerTitle || t.referralBannerSubtitle || 'Want to manage your time with AI too?'}</span>
            </div>
            <p className="text-xs text-indigo-600 mb-3">{t.referralBannerDesc || 'Join CalendAI and start getting the most out of your time!'}</p>
            <a
              href="https://calendai.onrender.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              {t.referralBannerButton || 'Start Free'}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
            {t.bookingClose || 'Close'}
          </button>
        </div>
      </div>
    );
  }

  // Main booking view
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-3 mb-1">
            <Calendar className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-800">
              {booking?.subject ? (
                <>{t.guestViewTitle || 'Pick a Time'} · {booking.subject}</>
              ) : (
                t.guestViewTitle || 'Pick a Time'
              )}
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {booking?.hostName ? (
              <>{t.guestViewSubtitle?.replace('{hostName}', booking.hostName) || `Schedule a meeting with ${booking.hostName}`}</>
            ) : (
              t.guestViewSubtitle || 'Select a time slot below'
            )}
          </p>
          {booking && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{booking.duration} {t.wizardDurationMinutes || 'min'}</span>
              <span className="mx-1">·</span>
              <span>{getDayDisplayName(booking.day)}, {getDayDate(booking.day)} {getMonthName(booking.day)}</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Available Slots */}
          {slots.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm">{t.wizardNoSlotsAvailable || 'No available slots'}</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                {t.guestViewSelectSlot || 'Select a time slot'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.map((slot, index) => {
                  const isSelected = selectedSlotIndex === index;
                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedSlotIndex(isSelected ? null : index)}
                      className={`flex items-center justify-center px-3 py-3 rounded-xl text-sm font-medium border-2 transition ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      {isSelected ? (
                        <><Check className="w-3.5 h-3.5 mr-1" /> {formatTimeDisplay(slot.hour, slot.minute)}</>
                      ) : (
                        formatTimeDisplay(slot.hour, slot.minute)
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Guest Details Form - shown when a slot is selected */}
          {selectedSlotIndex !== null && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-700">{t.bookingDetailsTitle || 'Your Details'}</h3>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t.guestViewName || 'Your Name'} *</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder={t.guestViewNamePlaceholder || 'Enter your name'}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  dir={isRTL ? 'rtl' : 'ltr'}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t.bookingGuestEmail || 'Email'}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={e => setGuestEmail(e.target.value)}
                    placeholder={t.bookingGuestEmailPlaceholder || 'Enter your email'}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t.bookingGuestPhone || 'Phone / WhatsApp'}</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={e => setGuestPhone(e.target.value)}
                    placeholder={t.bookingGuestPhonePlaceholder || 'Enter your phone number'}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t.bookingGuestNotes || 'Notes / Topic'}</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <textarea
                    value={guestNotes}
                    onChange={e => setGuestNotes(e.target.value)}
                    placeholder={t.bookingGuestNotesPlaceholder || 'Enter a short description or topic'}
                    rows={2}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {confirmError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
              <span>{confirmError}</span>
            </div>
          )}

          {/* Confirm Button */}
          <button
            onClick={handleConfirm}
            disabled={selectedSlotIndex === null || !guestName.trim() || confirming}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition disabled:bg-blue-400 disabled:cursor-not-allowed shadow-lg"
          >
            {confirming ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t.guestViewConfirming || 'Confirming...'}</>
            ) : (
              <><Check className="w-5 h-5" /> {t.guestViewConfirm || 'Confirm Booking'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}