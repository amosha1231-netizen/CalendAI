import React, { useState, useEffect, useCallback } from "react";
import { Calendar, Send, Clock, AlertCircle, LogIn, LogOut, User, Trash2 } from "lucide-react";
import MonthlyCalendar from "./components/MonthlyCalendar";

// API URL - use environment variable or default to Render backend
const API_BASE = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
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
        body: JSON.stringify({ text: inputText }),
        credentials: "include"
      });

      if (!response.ok) throw new Error("נכשלה פנייה לשרת ה-Backend: " + response.status);

      const data = await response.json();
      
      // Fetch the full updated schedule (with all accumulated events)
      await fetchSchedule();
      
      setSuccess(`נוספו ${data.events?.length || 0} אירועים חדשים! סה"כ: ${data.totalEvents || 0} אירועים`);
      setInputText("");
    } catch (err) {
      console.error(err);
      setError("שגיאה בחיבור ל-Backend. ודא ששרת ה-Node.js שלך דולק.");
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
      // Reset schedule to default
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
      // Update local state
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
    <div className="min-h-screen bg-slate-50 p-6 font-sans select-none" dir="rtl">
      {/* Header */}
      <header className="max-w-5xl mx-auto mb-8 flex items-center justify-between border-b pb-4">
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

      <main className="max-w-5xl mx-auto grid grid-cols-1 gap-6">
        {/* Input box */}
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h2 className="text-lg font-semibold mb-2 text-slate-800">הזן לוח זמנים בשפה חופשית</h2>
          <p className="text-sm text-slate-400 mb-4">
            לדוגמה: "בימים א ג ד ה משעה 18:30 עד 20:30 שיעור תורה בכפר יונה"<br />
            או: "שני בשש בערב שיחת וידאו" (נוסף ליום שני הקיים)
          </p>
          
          <div className="relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full p-4 border rounded-lg text-slate-800 placeholder-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-right"
              rows="3"
              placeholder="כתוב כאן את הלוז שלך..."
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleParse(); }}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm mt-2 bg-red-50 p-2 rounded">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-green-600 text-sm mt-2 bg-green-50 p-2 rounded">
              <span>{success}</span>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleParse}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition disabled:bg-blue-300"
            >
              <Send className="w-4 h-4 rotate-180" />
              {loading ? "מנתח נתונים..." : "הוסף ללוח שנה"}
            </button>
            
            <button
              onClick={handleClearSchedule}
              className="flex items-center gap-2 text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition text-sm"
            >
              <Trash2 className="w-4 h-4" />
              נקה הכל
            </button>
          </div>
        </div>

        {/* Weekly Schedule */}
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h2 className="text-xl font-bold mb-6 text-slate-800 border-b pb-2">הלו"ז השבועי שלך (Weekly Schedule)</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                          {event.isRecurring && (
                            <span className="text-[10px] text-blue-500 font-medium">חוזר שבועי</span>
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
    </div>
  );
}