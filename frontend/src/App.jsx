import React, { useState, useEffect, useCallback } from "react";
import { Calendar, Send, Clock, AlertCircle, LogIn, LogOut, User, Trash2, CalendarDays, Sparkles, Loader2 } from "lucide-react";
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
  "תנסה אותי: תמצא לי זמן להתאמן השבוע 4 פעמים",
  "תנסה אותי: תפנה לי זמן לפגישה לשיעור תורה בערב",
  "תנסה אותי: תארגן לי זמן להכין אוכל ברביעי בערב ותן רעיונות",
  "תנסה אותי: תפנה לי שעתיים לזמן איכות עם המשפחה בסופ\"ש"
];

const SUGGESTION_CHIPS = [
  "אימון 4 פעמים השבוע",
  "שיעור תורה בערב",
  "זמן איכות עם המשפחה"
];

export default function App() {
  const [inputText, setInputText] = useState("");
  const [recurrence, setRecurrence] = useState("weekly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
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

  // Effect for rotating placeholders
  useEffect(() => {
    const intervalId = setInterval(() => {
      setPlaceholderIndex(prevIndex => (prevIndex + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 3500);
    return () => clearInterval(intervalId);
  }, []);
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
      
      // If user is logged in, try to add events to their Google Calendar
      if (user && data.events && data.events.length > 0) {
        for (const event of data.events) {
          try {
            await fetch(`${API_BASE}/api/add-to-google-calendar`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event }),
              credentials: "include"
            });
            // Optionally show a success message for each event added to GCal
          } catch (gcalError) {
            console.error("Failed to add event to Google Calendar:", gcalError);
            // Optionally show a specific error for GCal failure
          }
        }
      }
      
      await fetchSchedule();
      
      setSuccess(`נוספו ${data.events?.length || 0} אירועים חדשים! סה"כ: ${data.totalEvents || 0} אירועים`);
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
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 font-sans select-none" dir="rtl">
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-6 sm:mb-8 flex flex-wrap items-center justify-between border-b pb-4 gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">CalendAI</h1>
            <p className="text-sm text-slate-500">פירוש לוח זמנים חכם באמצעות AI</p>
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
          
          <div className="relative mt-4" style={{ minHeight: '96px' }}>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full p-4 border rounded-lg text-slate-800 placeholder-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-right"
              rows="3"
              placeholder=" "
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleParse(); }}
            />
            {/* Custom animated placeholder */}
            {!inputText && (
              <div className="absolute top-4 right-4 h-6 pointer-events-none overflow-hidden text-slate-400">
                <div className="transition-transform duration-500 ease-in-out" style={{ transform: `translateY(-${placeholderIndex * 1.5}rem)` }}>
                  {PLACEHOLDER_EXAMPLES.map((text, index) => (
                    <div key={index} className="h-6 leading-6">{text}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Suggestion Chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">נסה למשל:</span>
            {SUGGESTION_CHIPS.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setInputText(suggestion)}
                className="px-2.5 py-1 text-xs rounded-full border transition bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
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
          <h2 className="text-xl font-bold mb-6 text-slate-800 border-b pb-2">הלו"ז השבועי שלך (Weekly Schedule)</h2>
          
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

      {/* Footer with build time */}
      <footer className="max-w-6xl mx-auto mt-12 text-center text-xs text-slate-400 border-t pt-4">
        <p>גרסה מעודכנת מתאריך: {new Date(import.meta.env.VITE_BUILD_TIME).toLocaleString('he-IL')}</p>
      </footer>
    </div>
  );
}