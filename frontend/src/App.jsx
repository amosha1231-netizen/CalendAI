import React, { useState, useEffect, useCallback, useRef } from "react";
import { Calendar, Send, Clock, AlertCircle, LogIn, LogOut, User, Trash2, CalendarDays, Sparkles, Loader2, AlertTriangle, Wand2, X, MapPin, Shield, Filter, Moon, Edit3, Check, ChevronLeft, ChevronRight, Sun, Bell, BellRing, CalendarCheck } from "lucide-react";
import MonthlyCalendar from "./components/MonthlyCalendar";
import LocationSelector from "./components/LocationSelector";
import Privacy from "./components/Privacy";
import translations from "./i18n";

const API_BASE = import.meta.env.VITE_API_URL || "";

const RECURRENCE_OPTIONS = (lang) => [
  { value: "once", label: translations[lang].recurrenceOnce },
  { value: "daily", label: translations[lang].recurrenceDaily },
  { value: "weekly", label: translations[lang].recurrenceWeekly },
  { value: "monthly", label: translations[lang].recurrenceMonthly },
  { value: "yearly", label: translations[lang].recurrenceYearly },
  { value: "forever", label: translations[lang].recurrenceForever }
];

const REMINDER_MINUTES_OPTIONS = (lang) => [
  { value: 0, label: translations[lang].reminderNone },
  { value: 5, label: translations[lang].reminder5min },
  { value: 15, label: translations[lang].reminder15min },
  { value: 30, label: translations[lang].reminder30min },
  { value: 60, label: translations[lang].reminder1hour }
];

const LOCATION_LABELS = {
  jerusalem: "Jerusalem",
  newyork: "New York",
  london: "London",
  losangeles: "Los Angeles"
};

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    // Audio not supported
  }
}

export default function App() {
  // Language state - load from localStorage or default to 'he'
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('calendai-lang') || 'he';
    } catch { return 'he'; }
  });
  const t = translations[lang]; // shorthand for translations

  const [showPrivacy, setShowPrivacy] = useState(false);
  const [inputText, setInputText] = useState("");
  const [recurrence, setRecurrence] = useState("weekly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [conflicts, setConflicts] = useState([]);

  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [reschedulePreview, setReschedulePreview] = useState(null);
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleStep, setRescheduleStep] = useState("choose");
  const [rescheduleDelay, setRescheduleDelay] = useState(null);
  const [gapsResult, setGapsResult] = useState(null);
  const [rescheduleMode, setRescheduleMode] = useState(null);
  const [selectedGaps, setSelectedGaps] = useState([]);

  const [isFreeSlotsOpen, setIsFreeSlotsOpen] = useState(false);
  const [freeSlotsData, setFreeSlotsData] = useState(null);
  const [freeSlotsLoading, setFreeSlotsLoading] = useState(false);
  const [freeSlotsError, setFreeSlotsError] = useState("");

  const [editModalData, setEditModalData] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState("jerusalem");
  const [locationFilter, setLocationFilter] = useState("all");
  const [user, setUser] = useState(null);

  const [schedule, setSchedule] = useState({
    Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
    Thursday: [], Friday: [], Saturday: [], Today: []
  });

  // Splash Screen State
  const [splashDone, setSplashDone] = useState(false);
  const [splashFading, setSplashFading] = useState(false);

  // Notification / Reminder State
  const [notificationPerm, setNotificationPerm] = useState(Notification.permission);
  const [toasts, setToasts] = useState([]);
  const notifiedRemindersRef = useRef(new Set());

  // Toggle language function
  const toggleLanguage = () => {
    const newLang = lang === 'he' ? 'en' : 'he';
    setLang(newLang);
    try {
      localStorage.setItem('calendai-lang', newLang);
    } catch (e) {}
  };

  const requestNotificationPermission = useCallback(async () => {
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      setNotificationPerm(perm);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => requestNotificationPermission(), 3000);
    return () => clearTimeout(timer);
  }, [requestNotificationPermission]);

  // Reminder Checker Interval
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = dayNames[now.getDay()];

      const todayEvents = [
        ...(schedule['Today'] || []),
        ...(schedule[todayName] || [])
      ];

      for (const event of todayEvents) {
        const reminderMin = event.reminderMinutesBefore;
        if (!reminderMin || reminderMin <= 0) continue;

        const timeMatch = event.startTime?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!timeMatch) continue;
        let eventHour = parseInt(timeMatch[1], 10);
        const eventMin = parseInt(timeMatch[2], 10);
        const isPM = timeMatch[3].toUpperCase() === 'PM';
        if (isPM && eventHour !== 12) eventHour += 12;
        if (!isPM && eventHour === 12) eventHour = 0;

        const eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eventHour, eventMin, 0);
        const alertTime = new Date(eventDate.getTime() - reminderMin * 60000);
        const timeDiff = now.getTime() - alertTime.getTime();

        if (timeDiff >= 0 && timeDiff < 31000) {
          const reminderKey = `${event.title}_${todayName}_${reminderMin}_${event.startTime}`;
          if (!notifiedRemindersRef.current.has(reminderKey)) {
            notifiedRemindersRef.current.add(reminderKey);

            if (notificationPerm === "granted") {
              try {
                new Notification(t.reminderTitle, {
                  body: `📅 ${event.title} ${t.reminderStartsIn} ${reminderMin} ${t.reminderMinutes}`,
                  icon: "/icon.svg"
                });
              } catch (e) {}
            }

            playNotificationSound();

            const toastId = Date.now();
            setToasts(prev => [...prev, {
              id: toastId,
              title: event.title,
              message: `${t.reminderStartsIn} ${reminderMin} ${t.reminderMinutes} (${event.startTime})`
            }]);

            setTimeout(() => {
              setToasts(prev => prev.filter(t => t.id !== toastId));
            }, 8000);
          }
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [schedule, notificationPerm, lang]);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
      .then(res => res.json())
      .then(data => { if (data.user) setUser(data.user); })
      .catch(() => {});
  }, []);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const PLACEHOLDER_EXAMPLES = t.placeholderExamples;
  const displayedPlaceholders = [...PLACEHOLDER_EXAMPLES, PLACEHOLDER_EXAMPLES[0], PLACEHOLDER_EXAMPLES[1]];

  useEffect(() => {
    const id = setInterval(() => {
      setIsTransitioning(true);
      setPlaceholderIndex(prev => prev + 1);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (placeholderIndex >= PLACEHOLDER_EXAMPLES.length) {
      const id = setTimeout(() => {
        setIsTransitioning(false);
        setPlaceholderIndex(0);
      }, 500);
      return () => clearTimeout(id);
    }
  }, [placeholderIndex, PLACEHOLDER_EXAMPLES.length]);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/schedule`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.schedule) setSchedule(data.schedule);
      }
    } catch (err) {
      console.error("Failed to fetch schedule:", err);
    }
  }, []);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  // Splash screen: fade out when schedule loads or after 2 seconds max
  useEffect(() => {
    const hasData = Object.values(schedule).some(arr => arr.length > 0);
    if (hasData || user !== null) {
      setSplashFading(true);
      const timer = setTimeout(() => setSplashDone(true), 600);
      return () => clearTimeout(timer);
    }
  }, [schedule, user]);

  useEffect(() => {
    // Force splash to end after 2 seconds max
    const timer = setTimeout(() => {
      if (!splashDone) {
        setSplashFading(true);
        setTimeout(() => setSplashDone(true), 600);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [splashDone]);

  const handleSlotClick = (day, slot) => {
    const [hour, minute] = slot.split(':').map(Number);
    const hour12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const nextHour = (hour + 1) % 24;
    const nextHour12 = nextHour % 12 || 12;
    const nextAmpm = nextHour >= 12 ? 'PM' : 'AM';
    setInputText(`${t.slotClickPrefix} ${day} ${t.slotClickFrom}${String(hour12).padStart(2,'0')}:${String(minute).padStart(2,'0')} ${ampm} ${t.slotClickUntil} ${String(nextHour12).padStart(2,'0')}:${String(minute).padStart(2,'0')} ${nextAmpm} `);
    const ta = document.querySelector('textarea');
    if (ta) ta.focus();
  };

  const handleParse = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API_BASE}/api/parse-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, recurrence, location: selectedLocation }),
        credentials: "include"
      });
      if (!res.ok) throw new Error(t.failedRequest + " " + res.status);
      const data = await res.json();
      if (user && data.events?.length > 0) {
        await Promise.allSettled(data.events.map(ev =>
          fetch(`${API_BASE}/api/add-to-google-calendar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: ev }),
            credentials: "include"
          })
        ));
      }
      if (data.conflicts?.length > 0) setConflicts(data.conflicts);
      else setConflicts([]);
      await fetchSchedule();
      setSuccess(data.replyMessage || `${t.successAdded} ${data.events?.length || 0} ${t.successEvents}`);
      setInputText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => { window.location.href = `${API_BASE}/api/auth/google`; };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
      setUser(null);
      setSchedule({ Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Today: [] });
    } catch (err) { console.error(err); }
  };

  const handleClearSchedule = async () => {
    if (!confirm(t.scheduleCleared + "?")) return;
    try {
      await fetch(`${API_BASE}/api/schedule/clear`, { method: "DELETE", credentials: "include" });
      setSchedule({ Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Today: [] });
      setSuccess(t.scheduleCleared);
    } catch (err) { console.error(err); }
  };

  const handleRemoveEvent = async (day, index) => {
    try {
      await fetch(`${API_BASE}/api/schedule/event`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, index }),
        credentials: "include"
      });
      setSchedule(prev => {
        const u = { ...prev };
        if (u[day]) u[day] = u[day].filter((_, i) => i !== index);
        return u;
      });
    } catch (err) { console.error(err); }
  };

  const handleOpenReschedule = () => {
    setIsRescheduleOpen(true);
    setReschedulePreview(null);
    setRescheduleError("");
    setRescheduleStep("choose");
    setRescheduleDelay(null);
    setGapsResult(null);
    setRescheduleMode(null);
    setSelectedGaps([]);
  };

  const handleDelaySelected = async (delayMinutes) => {
    setRescheduleDelay(delayMinutes);
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const gapsRes = await fetch(`${API_BASE}/api/reschedule/gaps`, { credentials: "include" });
      const gapsData = await gapsRes.json();
      setGapsResult(gapsData);
      setRescheduleStep("choose");
    } catch (err) { setRescheduleError(err.message); }
    finally { setRescheduleLoading(false); }
  };

  const handleMergeGaps = async () => {
    setRescheduleMode("merge");
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const res = await fetch(`${API_BASE}/api/reschedule/merge-gaps`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");
      setReschedulePreview(data);
      setRescheduleStep("preview");
    } catch (err) { setRescheduleError(err.message); }
    finally { setRescheduleLoading(false); }
  };

  const handleShiftEvents = async () => {
    setRescheduleMode("shift");
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const res = await fetch(`${API_BASE}/api/reschedule/shift`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delayMinutes: rescheduleDelay }), credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Shift failed");
      setReschedulePreview(data);
      setRescheduleStep("preview");
    } catch (err) { setRescheduleError(err.message); }
    finally { setRescheduleLoading(false); }
  };

  const handleReschedule = async (reason) => {
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const res = await fetch(`${API_BASE}/api/reschedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }), credentials: "include"
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "AI failed"); }
      const data = await res.json();
      setReschedulePreview(data);
      setRescheduleStep("preview");
    } catch (err) { setRescheduleError(err.message); }
    finally { setRescheduleLoading(false); }
  };

  const handleConfirmReschedule = () => {
    if (reschedulePreview?.newSchedule) {
      setSchedule(reschedulePreview.newSchedule);
      setSuccess(reschedulePreview.summary || t.eventUpdated);
      setIsRescheduleOpen(false);
      setReschedulePreview(null);
    }
  };

  const handleFindFreeSlots = async (day, durationMinutes) => {
    setFreeSlotsLoading(true);
    setFreeSlotsError("");
    setFreeSlotsData(null);
    setIsFreeSlotsOpen(true);
    try {
      const dayMapEn = { 'Sunday': 'Sunday', 'Monday': 'Monday', 'Tuesday': 'Tuesday', 'Wednesday': 'Wednesday', 'Thursday': 'Thursday', 'Friday': 'Friday', 'Saturday': 'Saturday' };
      const dayMapHe = { 'ראשון': 'Sunday', 'שני': 'Monday', 'שלישי': 'Tuesday', 'רביעי': 'Wednesday', 'חמישי': 'Thursday', 'שישי': 'Friday', 'שבת': 'Saturday', 'היום': 'Today' };
      const actualDay = dayMapEn[day] || dayMapHe[day] || day || 'Today';
      const res = await fetch(`${API_BASE}/api/schedule/free-slots?day=${actualDay}&duration=${durationMinutes}&location=${selectedLocation}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setFreeSlotsData(data);
    } catch (err) { setFreeSlotsError(err.message); }
    finally { setFreeSlotsLoading(false); }
  };

  const handleSelectFreeSlot = async (slot, title) => {
    if (!title) { setFreeSlotsError(t.freeSlotPrompt.replace(':', '')); return; }
    setFreeSlotsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/schedule/add-to-free-slot`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: freeSlotsData.day, startTime: slot.startTime, endTime: slot.endTime, title, recurrence, location: selectedLocation }),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchSchedule();
      setIsFreeSlotsOpen(false);
      setFreeSlotsData(null);
      setSuccess(`${t.freeSlotAdded} "${title}" ${t.slotClickPrefix} ${slot.startTime}-${slot.endTime}`);
    } catch (err) { setFreeSlotsError(err.message); }
    finally { setFreeSlotsLoading(false); }
  };

  const handleOpenEditModal = (day, index) => {
    const event = schedule[day]?.[index];
    if (!event) return;
    setEditModalData({ day, index, event: { ...event, reminderMinutesBefore: event.reminderMinutesBefore || 0 } });
  };

  const handleEditEvent = async () => {
    if (!editModalData) return;
    setEditLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/schedule/event`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: editModalData.day, index: editModalData.index, updates: editModalData.event }),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchSchedule();
      setEditModalData(null);
      setSuccess(t.eventUpdated);
    } catch (err) { setError(err.message); }
    finally { setEditLoading(false); }
  };

  const handleEditInputChange = (field, value) => {
    setEditModalData(prev => ({ ...prev, event: { ...prev.event, [field]: value } }));
  };

  const recurrenceLabels = {
    once: t.recurrenceOnce,
    daily: t.recurrenceDaily,
    weekly: t.recurrenceWeekly,
    monthly: t.recurrenceMonthly,
    yearly: t.recurrenceYearly,
    forever: t.recurrenceForever
  };
  const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayNamesLocalized = [t.daySunday, t.dayMonday, t.dayTuesday, t.dayWednesday, t.dayThursday, t.dayFriday, t.daySaturday];
  const todayName = dayNamesEn[new Date().getDay()];
  const todayNameLocalized = dayNamesLocalized[new Date().getDay()];

  const dayTranslations = {
    Sunday: t.daySunday, Monday: t.dayMonday, Tuesday: t.dayTuesday, Wednesday: t.dayWednesday,
    Thursday: t.dayThursday, Friday: t.dayFriday, Saturday: t.daySaturday, Today: `${t.dayToday} (${todayNameLocalized})`
  };

  const orderedDayKeys = ['Today', ...dayNamesEn];

  const allLocationsInEvents = [...new Set(Object.values(schedule).flat().map(e => e.location).filter(Boolean))];

  const getFilteredEvents = (dayKey) => {
    const dayEvents = schedule[dayKey] || [];
    if (locationFilter === "all") return dayEvents;
    return dayEvents.filter(e => e.location === locationFilter);
  };

  if (showPrivacy) return <Privacy onBack={() => setShowPrivacy(false)} />;

  const isRTL = lang === 'he';
  const SUGGESTION_CHIPS = t.suggestionChips;

  return (
    <>
      {/* Splash Screen */}
      {!splashDone && (
        <div className={`splash-screen${splashFading ? ' fade-out' : ''}`} dir="ltr">
          <div className="splash-logo-container">
            <div className="splash-logo-ring" />
            <div className="splash-logo-ring" />
            <CalendarCheck className="splash-logo-icon" />
          </div>
          <h1 className="splash-title">CalendAI</h1>
          <p className="splash-subtitle">{t.splashSubtitle}</p>
          <div className="splash-dots">
            <div className="splash-dot" />
            <div className="splash-dot" />
            <div className="splash-dot" />
          </div>
          <span className="splash-version">{t.splashVersion}</span>
        </div>
      )}
      <div className={`min-h-screen bg-slate-50 p-4 sm:p-6 font-sans`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className={`fixed top-4 ${isRTL ? 'left-4' : 'right-4'} z-[100] flex flex-col gap-2 max-w-sm`}>
          {toasts.map(ti => (
            <div key={ti.id} className={`bg-white ${isRTL ? 'border-r-4' : 'border-l-4'} border-amber-500 rounded-lg shadow-lg p-4 animate-slide-in flex items-start gap-3`}>
              <BellRing className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-slate-800">{t.toastReminder} {ti.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{ti.message}</div>
              </div>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== ti.id))} className="text-slate-300 hover:text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <header className="max-w-6xl mx-auto mb-6 sm:mb-8 flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-blue-600 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-400 tracking-widest mb-0.5 block">{t.besod}</span>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">CalendAI</h1>
            <p className="text-sm text-indigo-500/80 font-medium leading-snug">{t.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Language Toggle Button */}
          <button onClick={toggleLanguage}
            className="flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 transition text-sm font-medium">
            {t.languageLabel}
          </button>
          {user ? (
            <div className="flex items-center gap-3">
              {user.photo ? <img src={user.photo} alt="" className="w-8 h-8 rounded-full" /> : <User className="w-6 h-6 text-slate-500" />}
              <span className="text-sm text-slate-700">{user.displayName || user.email}</span>
              <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition"><LogOut className="w-4 h-4" /> {t.logout}</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition text-sm">
              <LogIn className="w-4 h-4" /> {t.loginWithGoogle}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 gap-6">
        {/* Input box */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
          <h2 className="text-lg font-semibold mb-2 text-slate-800">{t.inputTitle}</h2>
          <div className="relative mt-4" style={{ minHeight: '120px' }}>
            <textarea value={inputText} onChange={e => setInputText(e.target.value)}
              className={`w-full p-4 border rounded-lg text-slate-800 placeholder-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${isRTL ? 'text-right' : 'text-left'}`}
              rows="4" placeholder=" "
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleParse(); }}
            />
            {!inputText && (
              <div className={`absolute top-4 ${isRTL ? 'right-4' : 'left-4'} pointer-events-none overflow-hidden text-slate-400`} style={{ height: '1.75rem', width: 'calc(100% - 2rem)' }}>
                <div className={isTransitioning ? 'transition-transform duration-500 ease-in-out' : ''} style={{ transform: `translateY(-${placeholderIndex * 1.75}rem)` }}>
                  {displayedPlaceholders.map((text, i) => (
                    <div key={i} className="h-7 leading-7 whitespace-nowrap truncate" style={{ direction: isRTL ? 'rtl' : 'ltr', textAlign: isRTL ? 'right' : 'left' }}>{text}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1" style={{ scrollbarWidth: 'none' }}>
            <span className="text-xs text-slate-400 shrink-0">{t.tryForExample}</span>
            {SUGGESTION_CHIPS.map((s, i) => (
              <button key={i} onClick={() => setInputText(s)}
                className="px-2.5 py-1 text-xs rounded-full border transition bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300 shrink-0">{s}</button>
            ))}
            <button onClick={() => setInputText(t.suggestionSleep)}
              className="px-2.5 py-1 text-xs rounded-full border transition bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 shrink-0 flex items-center gap-1">
              <Moon className="w-3 h-3" /> {t.suggestionSleep}
            </button>
          </div>

          <div className="mt-4">
            <LocationSelector selectedLocation={selectedLocation} onLocationChange={setSelectedLocation} onSlotClick={handleSlotClick} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-600">{t.frequency}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {RECURRENCE_OPTIONS(lang).map(opt => (
                <button key={opt.value} onClick={() => setRecurrence(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition ${recurrence === opt.value ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>{opt.label}</button>
              ))}
            </div>
          </div>

          {error && <div className="flex items-center gap-2 text-red-600 text-sm mt-4 bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}
          {success && <div className="flex items-center gap-2 text-green-700 text-sm mt-4 bg-green-50 p-3 rounded-lg border border-green-200"><Sparkles className="w-4 h-4 text-green-600" /><span>{success}</span></div>}

          {conflicts.length > 0 && (
            <div className="mt-4 space-y-3">
              {conflicts.map((c, idx) => (
                <div key={idx} className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold mb-2"><AlertTriangle className="w-5 h-5 text-amber-600" /><span>{t.conflictTitle}{dayTranslations[c.day] || c.day}</span></div>
                  <p className="text-sm text-amber-700 mb-2">"{c.event.title}" ({c.event.startTime}-{c.event.endTime}) {t.conflictOverlaps}</p>
                  <ul className="text-sm text-amber-800 list-disc list-inside mb-3 space-y-1">{c.conflicts.map((cc, i) => <li key={i}>{cc.title} ({cc.startTime}-{cc.endTime})</li>)}</ul>
                  {c.suggestions?.length > 0 && (
                    <div><p className="text-sm font-medium text-amber-800 mb-1">{t.conflictSuggestions}</p>
                      <div className="flex flex-wrap gap-2">{c.suggestions.map((s, i) => (
                        <button key={i} onClick={() => setInputText(`${t.conflictChangeTime} ${s.startTime}-${s.endTime} ${t.slotClickPrefix} ${c.day}`)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 transition">{s.startTime} - {s.endTime}</button>
                      ))}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleParse} disabled={loading}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition disabled:bg-blue-400 disabled:cursor-not-allowed w-full sm:w-48">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.parsing}</> : <><Send className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} /> {t.parseButton}</>}
            </button>
            <button onClick={handleClearSchedule} className="flex items-center gap-2 text-red-500 hover:text-red-700 px-4 py-3 rounded-lg hover:bg-red-50 transition text-sm"><Trash2 className="w-4 h-4" /> {t.clearAll}</button>
          </div>
        </div>

        {/* Weekly Schedule */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b pb-2">
            <h2 className="text-xl font-bold text-slate-800">{t.weeklyScheduleTitle}</h2>
            <div className="flex items-center gap-2">
              {allLocationsInEvents.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Filter className="w-3 h-3 text-slate-400" />
                  <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-600 focus:ring-1 focus:ring-blue-500">
                    <option value="all">{t.allLocations}</option>
                    {allLocationsInEvents.map(loc => <option key={loc} value={loc}>{LOCATION_LABELS[loc] || loc}</option>)}
                  </select>
                </div>
              )}
              <button onClick={handleOpenReschedule}
                className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200 transition text-sm font-medium border border-indigo-200">
                <Wand2 className="w-4 h-4" /> {t.fixSchedule}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {orderedDayKeys.map(dayKey => {
              if (dayKey === "Today" && (!schedule[dayKey] || schedule[dayKey].length === 0)) return null;
              const dayEvents = getFilteredEvents(dayKey);
              const isTodayColumn = dayKey === todayName;
              return (
                <div key={dayKey} className={`border rounded-xl p-4 flex flex-col min-h-[150px] relative ${isTodayColumn ? 'today-column bg-blue-50 border-blue-400 ring-2 ring-blue-400 shadow-lg shadow-blue-100/50' : 'bg-slate-50 border-slate-200'}`}>
                  {/* Today badge */}
                  {isTodayColumn && (
                    <div className="today-badge">היום / Today</div>
                  )}
                  <div className={`font-bold text-slate-700 mb-3 border-b pb-1 text-center bg-white rounded shadow-sm py-1 ${isTodayColumn ? 'border-blue-300' : ''}`}>
                    {dayTranslations[dayKey]}
                    {dayEvents.length > 0 && <span className="text-xs text-slate-400 mr-1">({dayEvents.length})</span>}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-slate-300 text-center my-auto font-light">{t.noEvents}</p>
                    ) : (
                      dayEvents.map((event, index) => (
                        <div key={index}
                          className={`group relative bg-white p-3 rounded-lg shadow-xs border-r-4 flex flex-col gap-1 hover:shadow-md transition cursor-pointer ${event.reminderMinutesBefore > 0 ? 'border-amber-400 bg-amber-50/20' : event.isSleep ? 'border-indigo-500 bg-indigo-50/30' : 'border-blue-500'}`}
                          onClick={() => handleOpenEditModal(dayKey, index)}>
                          <button onClick={e => { e.stopPropagation(); handleRemoveEvent(dayKey, index); }}
                            className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center transition">
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <div className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                            {event.isSleep && <Moon className="w-3.5 h-3.5 text-indigo-500" />}
                            {event.reminderMinutesBefore > 0 && <Bell className="w-3.5 h-3.5 text-amber-500" />}
                            {event.title}
                            <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity mr-auto" />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span dir="ltr">{event.startTime} - {event.endTime}</span>
                            {event.isSleep && <span className="text-[10px] text-indigo-500 mr-1">{t.sleepLabel}</span>}
                          </div>
                          {event.reminderMinutesBefore > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-600">
                              <BellRing className="w-2.5 h-2.5" />
                              <span>{t.reminderColon} {event.reminderMinutesBefore} {t.reminderMinutes}</span>
                            </div>
                          )}
                          {event.location && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              <span>{LOCATION_LABELS[event.location] || event.location}</span>
                            </div>
                          )}
                          {event.recurrence && <span className="text-[10px] text-blue-500 font-medium">{recurrenceLabels[event.recurrence] || event.recurrence}</span>}
                          {event.hasAdvice && event.aiAdvice && (
                            <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">
                              <div className="flex items-start gap-1.5"><span className="text-sm">💡</span><span>{event.aiAdvice}</span></div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <MonthlyCalendar schedule={schedule} lang={lang} />
      </main>

      {/* Reschedule Modal */}
      {isRescheduleOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setIsRescheduleOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Wand2 className="text-indigo-600" /> {t.rescheduleTitle}</h3>
              <button onClick={() => setIsRescheduleOpen(false)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            {rescheduleLoading ? (
              <div className="text-center p-8"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-4" /><p className="text-slate-600">{t.rescheduleLoading}</p><p className="text-sm text-slate-400">{t.rescheduleLoadingSub}</p></div>
            ) : rescheduleStep === "preview" && reschedulePreview ? (
              <div>
                <p className="text-sm text-slate-600 bg-indigo-50 p-3 rounded-lg border border-indigo-200 mb-4"><span className="font-bold">{t.rescheduleOffer}</span> {reschedulePreview.summary}</p>
                <p className="font-semibold text-slate-800 mb-2">{t.reschedulePreview}</p>
                <div className="max-h-60 overflow-y-auto border rounded-lg p-2 bg-slate-50 text-xs font-mono"><pre>{JSON.stringify(reschedulePreview.newSchedule, null, 2)}</pre></div>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button onClick={handleOpenReschedule} className="text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
                  <button onClick={handleConfirmReschedule} className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">{t.rescheduleConfirm}</button>
                </div>
              </div>
            ) : rescheduleStep === "choose" && rescheduleDelay ? (
              <div>
                <p className="text-sm text-slate-600 mb-4">{t.rescheduleChooseDelay} <strong>{rescheduleDelay}</strong> {t.rescheduleMinutes}</p>
                <div className="flex flex-col gap-3">
                  {gapsResult?.hasGaps ? (
                    <button onClick={handleMergeGaps} className="w-full text-right p-4 bg-green-50 rounded-lg border border-green-300 hover:bg-green-100 transition">
                      <div className="font-medium text-green-800">{t.mergeGaps}</div>
                      <div className="text-sm text-green-600 mt-1">{t.gapsFound} {gapsResult.gapCount} {t.gapsFound2}</div>
                    </button>
                  ) : (
                    <div className="w-full text-right p-4 bg-slate-50 rounded-lg border border-slate-200"><div className="font-medium text-slate-500">{t.noGaps}</div></div>
                  )}
                  <button onClick={handleShiftEvents} className="w-full text-right p-4 bg-indigo-50 rounded-lg border border-indigo-300 hover:bg-indigo-100 transition">
                    <div className="font-medium text-indigo-800">{t.shiftAll} {rescheduleDelay} {t.shiftAll2}</div>
                  </button>
                </div>
                {rescheduleError && <div className="flex items-center gap-2 text-red-600 text-sm mt-4 bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{rescheduleError}</span></div>}
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 mb-4">{t.chooseDelay}</p>
                <div className="flex flex-col gap-3">
                  {[{ label: t.delay30, delay: 30 }, { label: t.delay1hour, delay: 60 }, { label: t.delayTomorrow, delay: null }].map(item => (
                    <button key={item.label} onClick={() => item.delay ? handleDelaySelected(item.delay) : handleReschedule(item.label)}
                      className="w-full text-right p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 transition">{item.label}</button>
                  ))}
                </div>
                {rescheduleError && <div className="flex items-center gap-2 text-red-600 text-sm mt-4 bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{rescheduleError}</span></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Free Slots Modal */}
      {isFreeSlotsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setIsFreeSlotsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Sun className="text-green-600" /> {t.freeSlotsTitle}</h3>
              <button onClick={() => setIsFreeSlotsOpen(false)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            {freeSlotsLoading ? (
              <div className="text-center p-8"><Loader2 className="w-8 h-8 text-green-600 animate-spin mx-auto mb-4" /><p className="text-slate-600">{t.freeSlotsLoading}</p></div>
            ) : freeSlotsError ? (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{freeSlotsError}</span></div>
            ) : freeSlotsData && (
              <div>
                <p className="text-sm text-slate-600 mb-3">{t.freeSlotsFound} <strong>{freeSlotsData.totalFreeSlots}</strong> {t.freeSlotsRequested} {t.slotClickPrefix} {dayTranslations[freeSlotsData.day] || freeSlotsData.day} ({freeSlotsData.requestedDurationMinutes} {t.freeSlotMinutes}):</p>
                {freeSlotsData.freeSlots.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg">{t.noFreeSlots}</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {freeSlotsData.freeSlots.map((slot, i) => (
                      <button key={i} onClick={() => { const ttl = prompt(t.freeSlotPrompt); if (ttl) handleSelectFreeSlot(slot, ttl); }}
                        className="w-full text-right p-3 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 transition">
                        <div className="font-medium text-green-800">🕐 {slot.startTime} - {slot.endTime}</div>
                        <div className="text-xs text-green-600 mt-0.5">{t.freeSlotDuration} {slot.durationMinutes} {t.freeSlotMinutes}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event Edit Modal with Reminder Dropdown */}
      {editModalData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEditModalData(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit3 className="text-blue-600" /> {t.eventEditTitle}</h3>
              <button onClick={() => setEditModalData(null)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.editTitle}</label>
                <input type="text" value={editModalData.event.title} onChange={e => handleEditInputChange('title', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.editStartTime}</label>
                <input type="text" value={editModalData.event.startTime} onChange={e => handleEditInputChange('startTime', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="HH:MM AM/PM" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.editEndTime}</label>
                <input type="text" value={editModalData.event.endTime} onChange={e => handleEditInputChange('endTime', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="HH:MM AM/PM" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.editRecurrence}</label>
                <select value={editModalData.event.recurrence || 'weekly'} onChange={e => handleEditInputChange('recurrence', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  {RECURRENCE_OPTIONS(lang).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              {/* Reminder Dropdown */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Bell className="w-4 h-4 text-amber-500" /> {t.reminderLabel}
                </label>
                <select value={editModalData.event.reminderMinutesBefore || 0} onChange={e => handleEditInputChange('reminderMinutesBefore', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  {REMINDER_MINUTES_OPTIONS(lang).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isSleep" checked={editModalData.event.isSleep || false} onChange={e => handleEditInputChange('isSleep', e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="isSleep" className="text-sm text-slate-700 flex items-center gap-1"><Moon className="w-3.5 h-3.5 text-indigo-500" /> {t.editSleepLabel}</label>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setEditModalData(null)} className="text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
              <button onClick={handleEditEvent} disabled={editLoading}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 transition">
                {editLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.update}</> : <><Check className="w-4 h-4" /> {t.saveChanges}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-6xl mx-auto mt-12 text-center text-xs text-slate-400 border-t pt-4">
        <p>{t.footerVersion} {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : t.footerLocal}</p>
        <button onClick={() => setShowPrivacy(true)} className="mt-2 inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 transition"><Shield className="w-3 h-3" /> {t.footerPrivacy}</button>
      </footer>
    </div>
    </>
  );
}