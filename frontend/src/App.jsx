import React, { useState, useEffect, useCallback } from "react";
import { Calendar, Send, Clock, AlertCircle, LogIn, LogOut, User, Trash2, CalendarDays, Sparkles, Loader2, AlertTriangle, Wand2, X } from "lucide-react";
import MonthlyCalendar from "./components/MonthlyCalendar";

// API URL - use environment variable for production, empty for local dev (uses Vite proxy)
const API_BASE = import.meta.env.VITE_API_URL || "";

const RECURRENCE_OPTIONS = [
  { value: "once", label: "חד פעמי" },
  { value: "weekly", label: "שבועי" },
  { value: "monthly", label: "חודשי" },
  { value: "yearly", label: "שנתי" },
  { value: "forever", label: "לכל החיים" }
];

const PLACEHOLDER_EXAMPLES = [
  "תפנה לי זמן איכות עם המשפחה בסופ\"ש",
  "תמצא לי זמן לשיעור תורה בשני בערב",
  "תזמן לי 3 אימונים השבוע בבוקר",
  "תארגן לי זמן להכין אוכל ברביעי בערב",
  "קבע לי פגישת עבודה ביום שני ב-10:00",
  "תזכיר לי לשלם חשבונות בראשון בערב",
  "תארגן לי זמן ללימודים פעמיים השבוע"
];

const SUGGESTION_CHIPS = [
  "זמן איכות עם המשפחה",
  "שיעור תורה בשני בערב",
  "3 אימונים השבוע בבוקר",
  "הכנת אוכל ברביעי בערב",
  "פגישת עבודה ביום שני",
  "תשלום חשבונות",
  "לימודים פעמיים השבוע"
];

export default function App() {
  const [inputText, setInputText] = useState("");
  const [recurrence, setRecurrence] = useState("weekly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [conflicts, setConflicts] = useState([]);

  // Reschedule state
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [reschedulePreview, setReschedulePreview] = useState(null);
  const [rescheduleError, setRescheduleError] = useState("");
  // User state
  const [user, setUser] = useState(null);
  
  // Schedule state
  const [schedule, setSchedule] = useState({
    Sunday: [],
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Today: []
  });

  // Fetch current user on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  // Effect for rotating placeholders - infinite vertical roll
  const [isTransitioning, setIsTransitioning] = useState(false);
  const displayedPlaceholders = [...PLACEHOLDER_EXAMPLES, PLACEHOLDER_EXAMPLES[0], PLACEHOLDER_EXAMPLES[1]];
  
  useEffect(() => {
    const intervalId = setInterval(() => {
      setIsTransitioning(true);
      setPlaceholderIndex(prevIndex => prevIndex + 1);
    }, 3500);
    return () => clearInterval(intervalId);
  }, []);

  // When we reach the duplicate items, reset without transition
  useEffect(() => {
    if (placeholderIndex >= PLACEHOLDER_EXAMPLES.length) {
      const timeoutId = setTimeout(() => {
        setIsTransitioning(false);
        setPlaceholderIndex(0);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [placeholderIndex]);
  // Fetch full schedule on mount
  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/schedule`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.schedule) {
          setSchedule(data.schedule);
        }
      }
    } catch (err) {
      console.error("Failed to fetch schedule:", err);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const handleParse = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_BASE}/api/parse-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, recurrence }),
        credentials: "include"
      });

      if (!response.ok) throw new Error("נכשלה פנייה לשרת ה-Backend: " + response.status);

      const data = await response.json();
      
      // If user is logged in, try to add events to their Google Calendar in parallel
      if (user && data.events && data.events.length > 0) {
        const results = await Promise.allSettled(
          data.events.map(event =>
            fetch(`${API_BASE}/api/add-to-google-calendar`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event }),
              credentials: "include"
            })
          )
        );
        const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
        const failed = results.filter(r => r.status === 'rejected' || !r.value?.ok).length;
        if (failed > 0) {
          console.error(`${failed} event(s) failed to sync to Google Calendar`);
        }
      }
      
      // Check for conflicts
      if (data.conflicts && data.conflicts.length > 0) {
        setConflicts(data.conflicts);
      } else {
        setConflicts([]);
      }
      
      await fetchSchedule();
      
      setSuccess(data.replyMessage || `נוספו ${data.events?.length || 0} אירועים חדשים! סה"כ: ${data.totalEvents || 0} אירועים`);
      setInputText("");

    } catch (err) {
      console.error("Error parsing schedule:", err);
      setError(err.message || "שגיאה בחיבור לשרת. אנא נסה שוב מאוחר יותר.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
      setUser(null);
      setSchedule({
        Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
        Thursday: [], Friday: [], Saturday: [], Today: []
      });
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleClearSchedule = async () => {
    if (!confirm("לנקות את כל האירועים?")) return;
    try {
      await fetch(`${API_BASE}/api/schedule/clear`, {
        method: "DELETE",
        credentials: "include"
      });
      setSchedule({
        Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
        Thursday: [], Friday: [], Saturday: [], Today: []
      });
      setSuccess("כל האירועים נמחקו");
    } catch (err) {
      console.error("Clear failed:", err);
    }
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
        const updated = { ...prev };
        if (updated[day]) {
          updated[day] = updated[day].filter((_, i) => i !== index);
        }
        return updated;
      });
    } catch (err) {
      console.error("Remove event failed:", err);
    }
  };

  const handleOpenReschedule = () => {
    setIsRescheduleOpen(true);
    setReschedulePreview(null);
    setRescheduleError("");
  };

  const handleReschedule = async (reason) => {
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const res = await fetch(`${API_BASE}/api/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        credentials: "include"
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "AI reschedule failed");
      }
      const data = await res.json();
      setReschedulePreview(data);
    } catch (err) {
      setRescheduleError(err.message);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleConfirmReschedule = () => {
    if (reschedulePreview && reschedulePreview.newSchedule) {
      setSchedule(reschedulePreview.newSchedule);
      setSuccess("הלו\"ז עודכן בהצלחה!");
      setIsRescheduleOpen(false);
      setReschedulePreview(null);
    }
  };
  const recurrenceLabels = {
    once: "חד פעמי",
    weekly: "שבועי",
    monthly: "חודשי",
    yearly: "שנתי",
    forever: "לכל החיים"
  };

  // תרגום שמות הימים לעברית
  const dayTranslations = {
    Sunday: "יום ראשון",
    Monday: "יום שני",
    Tuesday: "יום שלישי",
    Wednesday: "יום רביעי",
    Thursday: "יום חמישי",
    Friday: "יום שישי",
    Saturday: "יום שבת",
    Today: "היום / כללי"
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 font-sans" dir="rtl">
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-6 sm:mb-8 flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-blue-600 shrink-0" />
          <div>
            <span className="text-[11px] text-gray-400 tracking-wider mb-0.5 block leading-none">בס"ד</span>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">CalendAI</h1>
            <p className="text-sm text-slate-500 leading-snug">העוזר האישי שלך לניהול הזמן</p>
          </div>
        </div>
        
        {/* User section */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              {user.photo ? (
                <img src={user.photo} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <User className="w-6 h-6 text-slate-500" />
              )}
              <span className="text-sm text-slate-700">{user.displayName || user.email}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition"
              >
                <LogOut className="w-4 h-4" />
                התנתק
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition text-sm"
            >
              <LogIn className="w-4 h-4" />
              התחבר עם Google
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 gap-6">
        {/* Input box */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
          <h2 className="text-lg font-semibold mb-2 text-slate-800">הזן לוח זמנים בשפה חופשית</h2>
          
          <div className="relative mt-4" style={{ minHeight: '120px' }}>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full p-4 border rounded-lg text-slate-800 placeholder-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-right"
              rows="4"
              placeholder=" "
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleParse(); }}
            />
            {/* Custom animated placeholder - infinite vertical roll */}
            {!inputText && (
              <div className="absolute top-4 right-4 pointer-events-none overflow-hidden text-slate-400" style={{ height: '1.75rem' }}>
                <div
                  className={`${isTransitioning ? 'transition-transform duration-500 ease-in-out' : ''}`}
                  style={{ transform: `translateY(-${placeholderIndex * 1.75}rem)` }}
                >
                  {displayedPlaceholders.map((text, index) => (
                    <div key={index} className="h-7 leading-7 whitespace-nowrap text-right" style={{ direction: 'rtl' }}>{text}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Suggestion Chips - horizontal scroll */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <span className="text-xs text-slate-400 shrink-0">נסה למשל:</span>
            {SUGGESTION_CHIPS.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setInputText(suggestion)}
                className="px-2.5 py-1 text-xs rounded-full border transition bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300 shrink-0"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Recurrence Selector */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-600">תדירות:</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="תדירות">
              {RECURRENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRecurrence(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                    recurrence === opt.value
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm mt-4 bg-red-50 p-3 rounded-lg border border-red-200">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-green-700 text-sm mt-4 bg-green-50 p-3 rounded-lg border border-green-200">
              <Sparkles className="w-4 h-4 text-green-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Conflict warnings */}
          {conflicts.length > 0 && (
            <div className="mt-4 space-y-3">
              {conflicts.map((conflict, idx) => (
                <div key={idx} className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span>⚠️ התנגשות זמנים ב{dayTranslations[conflict.day] || conflict.day}</span>
                  </div>
                  <p className="text-sm text-amber-700 mb-2">
                    האירוע "{conflict.event.title}" ({conflict.event.startTime} - {conflict.event.endTime}) חופף לאירועים קיימים:
                  </p>
                  <ul className="text-sm text-amber-800 list-disc list-inside mb-3 space-y-1">
                    {conflict.conflicts.map((c, i) => (
                      <li key={i}>{c.title} ({c.startTime} - {c.endTime})</li>
                    ))}
                  </ul>
                  {conflict.suggestions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-amber-800 mb-1">🕒 שעות פנויות מומלצות באותו יום:</p>
                      <div className="flex flex-wrap gap-2">
                        {conflict.suggestions.map((slot, i) => (
                          <button
                            key={i}
                            onClick={() => setInputText(`שנה שעה ל${slot.startTime}-${slot.endTime} ב${conflict.day}`)}
                            className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 transition"
                          >
                            {slot.startTime} - {slot.endTime}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleParse}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition disabled:bg-blue-400 disabled:cursor-not-allowed w-full sm:w-48"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> <span>מפענח...</span></>
              ) : (
                <><Send className="w-5 h-5 rotate-180" /> <span>הוסף ללוח שנה</span></>
              )}
            </button>
            
            <button
              onClick={handleClearSchedule}
              className="flex items-center gap-2 text-red-500 hover:text-red-700 px-4 py-3 rounded-lg hover:bg-red-50 transition text-sm"
            >
              <Trash2 className="w-4 h-4" />
              נקה הכל
            </button>
          </div>
        </div>

        {/* Weekly Schedule */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b pb-2">
            <h2 className="text-xl font-bold text-slate-800">הלו"ז השבועי שלך</h2>
            <button
              onClick={handleOpenReschedule}
              className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200 transition text-sm font-medium border border-indigo-200"
            >
              <Wand2 className="w-4 h-4" />
              תקן לי את הלו"ז
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.keys(schedule).map((dayKey) => {
              if (dayKey === "Today" && schedule[dayKey].length === 0) return null;

              return (
                <div key={dayKey} className="border rounded-xl bg-slate-50 p-4 flex flex-col min-h-[150px]">
                  <div className="font-bold text-slate-700 mb-3 border-b pb-1 text-center bg-white rounded shadow-sm py-1">
                    {dayTranslations[dayKey]}
                    {schedule[dayKey].length > 0 && (
                      <span className="text-xs text-slate-400 mr-1">({schedule[dayKey].length})</span>
                    )}
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-2">
                    {schedule[dayKey].length === 0 ? (
                      <p className="text-xs text-slate-300 text-center my-auto font-light">אין אירועים</p>
                    ) : (
                      schedule[dayKey].map((event, index) => (
                        <div 
                          key={index} 
                          className="group relative bg-white p-3 rounded-lg shadow-xs border-r-4 border-blue-500 border flex flex-col gap-1 hover:shadow-md transition"
                        >
                          <button
                            onClick={() => handleRemoveEvent(dayKey, index)}
                            className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center transition"
                            title="הסר אירוע"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <div className="font-semibold text-sm text-slate-800">{event.title}</div>
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span dir="ltr">{event.startTime} - {event.endTime}</span>
                          </div>
                          {event.recurrence && (
                            <span className="text-[10px] text-blue-500 font-medium">
                              {recurrenceLabels[event.recurrence] || event.recurrence}
                            </span>
                          )}
                          {event.hasAdvice && event.aiAdvice && (
                            <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">
                              <div className="flex items-start gap-1.5">
                                <span className="text-sm">💡</span>
                                <span className="leading-relaxed">{event.aiAdvice}</span>
                              </div>
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
        
        {/* Monthly Calendar */}
        <MonthlyCalendar schedule={schedule} />
        
      </main>

      {/* Reschedule Modal */}
      {isRescheduleOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setIsRescheduleOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Wand2 className="text-indigo-600" />
                תקן לי את הלו"ז
              </h3>
              <button onClick={() => setIsRescheduleOpen(false)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {rescheduleLoading ? (
              <div className="text-center p-8">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-4" />
                <p className="text-slate-600">העוזר החכם מארגן את הלו"ז שלך מחדש...</p>
                <p className="text-sm text-slate-400">זה עשוי לקחת מספר רגעים.</p>
              </div>
            ) : reschedulePreview ? (
              <div>
                <p className="text-sm text-slate-600 bg-indigo-50 p-3 rounded-lg border border-indigo-200 mb-4">
                  <span className="font-bold">העוזר מציע:</span> {reschedulePreview.summary}
                </p>
                <p className="font-semibold text-slate-800 mb-2">תצוגה מקדימה של השינויים:</p>
                <div className="max-h-60 overflow-y-auto border rounded-lg p-2 bg-slate-50 text-xs font-mono">
                  <pre>{JSON.stringify(reschedulePreview.newSchedule, null, 2)}</pre>
                </div>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button onClick={() => setReschedulePreview(null)} className="text-sm text-slate-600 hover:text-slate-800">בטל ונסה שוב</button>
                  <button onClick={handleConfirmReschedule} className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">
                    אשר עדכון לו"ז
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 mb-4">מה קרה? ספר לעוזר החכם כדי שיוכל לארגן מחדש את הלו"ז שלך.</p>
                <div className="flex flex-col gap-3">
                  {[
                    'אני באיחור של 30 דקות',
                    'אני באיחור של שעה',
                    'דחה משימות שלא בוצעו למחר'
                  ].map(reason => (
                    <button
                      key={reason}
                      onClick={() => handleReschedule(reason)}
                      className="w-full text-left p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 transition"
                    >
                      {reason}
                    </button>
                  ))}
                  {/* Optional: Custom reason input */}
                  {/* <input type="text" placeholder="או הקלד סיבה אחרת..." className="..."/> */}
                </div>
                {rescheduleError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm mt-4 bg-red-50 p-3 rounded-lg border border-red-200">
                    <AlertCircle className="w-4 h-4" />
                    <span>{rescheduleError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer with build time */}
      <footer className="max-w-6xl mx-auto mt-12 text-center text-xs text-slate-400 border-t pt-4">
        <p>גרסה מעודכנת: 23/07/2026 בשעה {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>
      </footer>
    </div>
  );
}