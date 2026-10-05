import React, { useState, useEffect } from "react";
import { X, Loader2, Check, Plus, Trash2, Briefcase } from "lucide-react";
import safeStorage from "../utils/safeStorage";

var API_BASE = import.meta.env.VITE_API_URL || "";

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_LABELS_HE = { Sunday: "ראשון", Monday: "שני", Tuesday: "שלישי", Wednesday: "רביעי", Thursday: "חמישי", Friday: "שישי" };
const DAY_LABELS_EN = { Sunday: "Sunday", Monday: "Monday", Tuesday: "Tuesday", Wednesday: "Wednesday", Thursday: "Thursday", Friday: "Friday" };

const CATEGORY_OPTIONS = ['general', 'barber', 'trainer', 'consultant', 'therapist'];
const CATEGORY_LABELS_HE = { general: "⭐ כללי", barber: "💇 מספרה", trainer: "🏋️ מאמן", consultant: "💼 יועץ", therapist: "🧘 מטפל" };
const CATEGORY_LABELS_EN = { general: "⭐ General", barber: "💇 Barber", trainer: "🏋️ Trainer", consultant: "💼 Consultant", therapist: "🧘 Therapist" };

export default function ProviderProfileEditor({ lang, user, onClose }) {
  const isRtl = lang === "he";
  const dayLabels = lang === "he" ? DAY_LABELS_HE : DAY_LABELS_EN;
  const categoryLabels = lang === "he" ? CATEGORY_LABELS_HE : CATEGORY_LABELS_EN;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [category, setCategory] = useState("general");
  const [services, setServices] = useState([]);
  const [availability, setAvailability] = useState([]);

  const getToken = () => {
    try {
      return safeStorage.getItem("token") || safeStorage.getItem("calendai-jwt") || "";
    } catch (e) {
      return "";
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/providers/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load profile");
        const p = data.providerProfile || {};
        setEnabled(!!p.enabled);
        setBusinessName(p.businessName || "");
        setBio(p.bio || "");
        setCategory(p.category || "general");
        setServices(p.services || []);
        setAvailability(p.availability || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addService = () => {
    setServices([...services, { name: "", duration: 30, price: 0, active: true }]);
  };
  const updateService = (index, field, value) => {
    setServices(services.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };
  const removeService = (index) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const addAvailabilityRow = () => {
    setAvailability([...availability, { day: "Sunday", startTime: "09:00 AM", endTime: "05:00 PM" }]);
  };
  const updateAvailabilityRow = (index, field, value) => {
    setAvailability(availability.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };
  const removeAvailabilityRow = (index) => {
    setAvailability(availability.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/providers/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          enabled,
          businessName,
          bio,
          category,
          services: services.map(s => ({ ...s, name: s.name.trim(), duration: Number(s.duration), price: Number(s.price) || 0 })),
          availability
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setServices(data.providerProfile.services || []);
      setAvailability(data.providerProfile.availability || []);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-indigo-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {lang === "he" ? "💼 פרופיל נותן שירות" : "💼 Provider Profile"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Enable toggle */}
            <label className="flex items-center justify-between gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 cursor-pointer">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {lang === "he" ? "הצג אותי בספרייה הציבורית ואפשר הזמנות" : "List me in the public directory & accept bookings"}
              </span>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 accent-indigo-600" />
            </label>

            {/* Business info */}
            <div className="space-y-3">
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={lang === "he" ? "שם העסק / שלך" : "Business / your name"}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={lang === "he" ? "ספר קצת על השירות שלך..." : "Tell clients about your service..."}
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{categoryLabels[c]}</option>)}
              </select>
            </div>

            {/* Services */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {lang === "he" ? "שירותים" : "Services"}
                </h3>
                <button onClick={addService} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> {lang === "he" ? "הוסף שירות" : "Add service"}
                </button>
              </div>
              <div className="space-y-2">
                {services.map((s, i) => (
                  <div key={i} className="flex gap-2 items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => updateService(i, "name", e.target.value)}
                      placeholder={lang === "he" ? "שם השירות" : "Service name"}
                      className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      min={5}
                      max={480}
                      value={s.duration}
                      onChange={(e) => updateService(i, "duration", e.target.value)}
                      title={lang === "he" ? "דקות" : "minutes"}
                      className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      min={0}
                      value={s.price}
                      onChange={(e) => updateService(i, "price", e.target.value)}
                      title={lang === "he" ? "מחיר" : "price"}
                      className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button onClick={() => removeService(i)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {services.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">
                    {lang === "he" ? "הוסף לפחות שירות אחד כדי לקבל הזמנות." : "Add at least one service to accept bookings."}
                  </p>
                )}
              </div>
            </div>

            {/* Availability */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {lang === "he" ? "זמינות שבועית" : "Weekly availability"}
                </h3>
                <button onClick={addAvailabilityRow} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> {lang === "he" ? "הוסף יום" : "Add day"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                {lang === "he" ? "שבת אינה נתמכת." : "Saturday is not supported."}
              </p>
              <div className="space-y-2">
                {availability.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                    <select
                      value={row.day}
                      onChange={(e) => updateAvailabilityRow(i, "day", e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {DAYS.map(d => <option key={d} value={d}>{dayLabels[d]}</option>)}
                    </select>
                    <input
                      type="time"
                      value={to24h(row.startTime)}
                      onChange={(e) => updateAvailabilityRow(i, "startTime", to12h(e.target.value))}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <span className="text-xs text-gray-400">–</span>
                    <input
                      type="time"
                      value={to24h(row.endTime)}
                      onChange={(e) => updateAvailabilityRow(i, "endTime", to12h(e.target.value))}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button onClick={() => removeAvailabilityRow(i)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {availability.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">
                    {lang === "he" ? "הוסף לפחות שורת זמינות אחת." : "Add at least one availability row."}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg p-3">{error}</div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saved ? (lang === "he" ? "נשמר!" : "Saved!") : (lang === "he" ? "שמור" : "Save")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── "HH:MM AM/PM" <-> "HH:MM" (24h, for <input type="time">) ──
function to24h(time12) {
  if (!time12) return "09:00";
  const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return "09:00";
  let h = parseInt(match[1], 10);
  const m = match[2];
  if (match[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (match[3].toUpperCase() === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m}`;
}

function to12h(time24) {
  if (!time24) return "09:00 AM";
  const [hStr, m] = time24.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${m} ${ampm}`;
}
