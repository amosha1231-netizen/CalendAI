import React, { useState } from "react";
import { X, Calendar, Clock, Save, Loader2, CheckCircle, AlertCircle } from "lucide-react";

var API_BASE = import.meta.env.VITE_API_URL || "";

export default function ManualEventForm({ t, lang, onClose, onSuccess, user }) {
  const isRTL = lang === 'he';
  const [summary, setSummary] = useState("");
  const [eventDate, setEventDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSave = async () => {
    if (!summary.trim() || !eventDate || !startTime || !endTime) {
      setError(t.manualEventRequired);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Convert 24h time to 12h AM/PM format
      const to12h = (time24) => {
        const [h, m] = time24.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
      };

      const startTime12 = to12h(startTime);
      const endTime12 = to12h(endTime);

      // Map date to day name
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dateObj = new Date(eventDate + 'T12:00:00');
      const dayName = dayNames[dateObj.getDay()];

      // Check if the date is today
      const today = new Date();
      const isToday = eventDate === today.toISOString().split('T')[0];
      const dayKey = isToday ? 'Today' : dayName;

      const payload = {
        day: dayKey,
        startTime: startTime12,
        endTime: endTime12,
        title: summary.trim(),
        recurrence: 'once',
        location: 'jerusalem'
      };

      if (user) {
        const res = await fetch(`${API_BASE}/api/schedule/add-to-free-slot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t.manualEventError);
      }

      setSuccess(t.manualEventSuccess);
      if (onSuccess) onSuccess(payload);
      setTimeout(() => {
        if (onClose) onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || t.manualEventError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            {t.manualEventTitle}
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="flex items-center gap-2 text-green-700 text-sm mb-4 bg-green-50 p-3 rounded-lg border border-green-200">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t.manualEventSummary}
            </label>
            <input
              type="text"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder={t.manualEventSummaryPlaceholder}
              className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              dir={isRTL ? 'rtl' : 'ltr'}
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t.manualEventDate}
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {t.manualEventStartTime}
            </label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* End Time */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {t.manualEventEndTime}
            </label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50 transition"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !summary.trim() || !eventDate || !startTime || !endTime}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 transition"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t.manualEventSaving}</>
            ) : (
              <><Save className="w-4 h-4" /> {t.manualEventSave}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}