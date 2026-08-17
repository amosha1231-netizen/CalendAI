import React, { useState, useEffect } from "react";
import { Calendar, Clock, Loader2, Check, X, Sparkles, ExternalLink } from "lucide-react";
import { isShabbatNow } from "../utils/shabbatHelper";
import ShabbatBanner from "./ShabbatBanner";

const API_BASE = import.meta.env.VITE_API_URL || "";

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
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const isRTL = lang === 'he';

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

  const handleConfirm = async () => {
    if (selectedSlotIndex === null || !guestName.trim()) return;
    setConfirming(true);
    setConfirmError("");
    try {
      const res = await fetch(`${API_BASE}/api/booking/${bookingId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotIndex: selectedSlotIndex, guestName: guestName.trim() })
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

  // Confirmed state
  if (confirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">{t.guestViewSuccess}</h3>
          <p className="text-sm text-slate-500 mb-6">{t.guestViewSuccessDesc}</p>

          {/* Booking Details */}
          {booking && selectedSlotIndex !== null && slots[selectedSlotIndex] && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-6 text-right">
              <div className="flex items-center gap-2 text-sm mb-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-slate-700">{booking.subject}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{formatTimeDisplay(slots[selectedSlotIndex].hour, slots[selectedSlotIndex].minute)} · {booking.duration} {t.wizardDurationMinutes || 'min'}</span>
              </div>
            </div>
          )}

          {/* Referral Banner */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <span className="text-sm font-bold text-indigo-800">{t.referralBannerTitle}</span>
            </div>
            <p className="text-xs text-indigo-600 mb-3">{t.referralBannerDesc}</p>
            <a
              href="https://calendai.onrender.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              {t.referralBannerButton}
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
            <h2 className="text-xl font-bold text-slate-800">{booking?.subject || t.guestViewTitle}</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">{t.guestViewSubtitle}</p>
          {booking && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{booking.duration} {t.wizardDurationMinutes || 'min'}</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Available Slots */}
          {slots.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm">{t.wizardNoSlotsAvailable}</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                {t.guestViewSelectSlot}
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

          {/* Guest Name Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t.guestViewName}</label>
            <input
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder={t.guestViewNamePlaceholder}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              dir={isRTL ? 'rtl' : 'ltr'}
            />
          </div>

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
              <><Loader2 className="w-4 h-4 animate-spin" /> {t.guestViewConfirming}</>
            ) : (
              <><Check className="w-5 h-5" /> {t.guestViewConfirm}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}