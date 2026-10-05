import React, { useState, useEffect, useCallback } from "react";
import { X, Loader2, Check, Calendar, Clock, Mail, Phone, MessageSquare } from "lucide-react";
import safeStorage from "../utils/safeStorage";

var API_BASE = import.meta.env.VITE_API_URL || "";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProviderBookingView({ providerId, lang, user, onClose }) {
  const isRtl = lang === "he";

  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [guestName, setGuestName] = useState(user?.displayName || user?.name || "");
  const [guestEmail, setGuestEmail] = useState(user?.email || "");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const getToken = () => {
    try {
      return safeStorage.getItem("token") || safeStorage.getItem("calendai-jwt") || "";
    } catch (e) {
      return "";
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/api/providers/${providerId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load provider");
        if (!cancelled) {
          setProvider(data.provider);
          if (data.provider.services?.length) setSelectedServiceId(data.provider.services[0]._id);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [providerId]);

  const fetchSlots = useCallback(async (serviceId, date) => {
    if (!serviceId || !date) return;
    setSlotsLoading(true);
    setSlotsError("");
    setSelectedSlot(null);
    try {
      const params = new URLSearchParams({ date, serviceId });
      const res = await fetch(`${API_BASE}/api/providers/${providerId}/availability?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load availability");
      setSlots(data.slots || []);
    } catch (err) {
      setSlotsError(err.message);
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    if (selectedServiceId && selectedDate) fetchSlots(selectedServiceId, selectedDate);
  }, [selectedServiceId, selectedDate, fetchSlots]);

  const handleConfirm = async () => {
    if (!selectedSlot || !guestName.trim()) return;
    setConfirming(true);
    setConfirmError("");
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/providers/${providerId}/book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          serviceId: selectedServiceId,
          date: selectedDate,
          startTime: selectedSlot.startTime,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim(),
          guestNotes: guestNotes.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed");
      setConfirmedBooking(data.booking);
      // Refresh slots so the just-taken one disappears if the user books again.
      fetchSlots(selectedServiceId, selectedDate);
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirming(false);
    }
  };

  const selectedService = provider?.services?.find(s => s._id === selectedServiceId);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-red-600">{lang === "he" ? "שגיאה" : "Error"}</h3>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-600">{error || (lang === "he" ? "נותן השירות לא נמצא." : "Provider not found.")}</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg text-sm">{lang === "he" ? "סגור" : "Close"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300 overflow-hidden shrink-0">
              {provider.photo ? <img src={provider.photo} alt="" className="w-full h-full object-cover" /> : (provider.businessName || "P")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{provider.businessName}</h2>
              {provider.bio && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{provider.bio}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {confirmedBooking ? (
            /* ── Success state ── */
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {lang === "he" ? "ההזמנה אושרה!" : "Booking confirmed!"}
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 text-center space-y-1 mb-4">
                <div className="font-medium">{confirmedBooking.serviceName}</div>
                <div>{confirmedBooking.date} · {confirmedBooking.startTime} – {confirmedBooking.endTime}</div>
                <div>{lang === "he" ? "עם" : "with"} {provider.businessName}</div>
              </div>
              <button onClick={onClose} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 transition">
                {lang === "he" ? "סגור" : "Close"}
              </button>
            </div>
          ) : (
            <>
              {/* Service picker */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {lang === "he" ? "בחר שירות" : "Choose a service"}
                </label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {(provider.services || []).map(s => (
                    <option key={s._id} value={s._id}>
                      {s.name} · {s.duration} {lang === "he" ? "דק׳" : "min"}{s.price ? ` · ₪${s.price}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date picker */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {lang === "he" ? "בחר תאריך" : "Choose a date"}
                </label>
                <input
                  type="date"
                  min={todayIso()}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Slot grid */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {lang === "he" ? "בחר שעה" : "Choose a time"}
                </label>
                {slotsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
                ) : slotsError ? (
                  <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg p-3">{slotsError}</div>
                ) : slots.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-400">
                    {lang === "he" ? "אין שעות פנויות בתאריך זה." : "No available times on this date."}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot, i) => {
                      const isSelected = selectedSlot?.startTime === slot.startTime;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedSlot(isSelected ? null : slot)}
                          className={`px-2 py-2.5 rounded-xl text-xs font-medium border-2 transition ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-indigo-400"
                          }`}
                        >
                          {slot.startTime}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Guest details */}
              {selectedSlot && (
                <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {lang === "he" ? "הפרטים שלך" : "Your details"}
                  </h3>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder={lang === "he" ? "שם מלא" : "Full name"}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder={lang === "he" ? "אימייל" : "Email"}
                      dir="ltr"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder={lang === "he" ? "טלפון" : "Phone"}
                      dir="ltr"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <textarea
                      value={guestNotes}
                      onChange={(e) => setGuestNotes(e.target.value)}
                      placeholder={lang === "he" ? "הערות (אופציונלי)" : "Notes (optional)"}
                      rows={2}
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  {confirmError && (
                    <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg p-3">{confirmError}</div>
                  )}

                  <button
                    onClick={handleConfirm}
                    disabled={confirming || !guestName.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50"
                  >
                    {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {lang === "he" ? "אשר הזמנה" : "Confirm Booking"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
