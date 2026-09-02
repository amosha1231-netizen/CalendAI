import React, { useState, useEffect, useCallback } from "react";
import { Search, Users, Trophy, CheckCircle, X, Plus, Loader2, ChevronDown, Filter } from "lucide-react";
import translations from "../i18n";
import safeStorage from "../utils/safeStorage";

var API_BASE = import.meta.env.VITE_API_URL || "";

const CATEGORIES = [
  { value: "all", label: "הכל" },
  { value: "workout", label: "💪 כושר" },
  { value: "study", label: "📚 לימודים" },
  { value: "work", label: "💼 עבודה" },
  { value: "sleep", label: "🌙 שינה" },
  { value: "general", label: "🎯 כללי" }
];

const CATEGORIES_EN = [
  { value: "all", label: "All" },
  { value: "workout", label: "💪 Workout" },
  { value: "study", label: "📚 Study" },
  { value: "work", label: "💼 Work" },
  { value: "sleep", label: "🌙 Sleep" },
  { value: "general", label: "🎯 General" }
];

const DAY_NAMES = {
  Sunday: "ראשון",
  Monday: "שני",
  Tuesday: "שלישי",
  Wednesday: "רביעי",
  Thursday: "חמישי",
  Friday: "שישי",
  Saturday: "שבת"
};

const DAY_NAMES_EN = {
  Sunday: "Sunday",
  Monday: "Monday",
  Tuesday: "Tuesday",
  Wednesday: "Wednesday",
  Thursday: "Thursday",
  Friday: "Friday",
  Saturday: "Saturday"
};

export default function PublicGoals({ lang, user, onClose, onJoinChallenge }) {
  const t = translations[lang] || translations.he;
  const isRtl = lang === "he";
  const dayNames = lang === "he" ? DAY_NAMES : DAY_NAMES_EN;
  const categories = lang === "he" ? CATEGORIES : CATEGORIES_EN;

  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDay, setCreateDay] = useState("Monday");
  const [createTime, setCreateTime] = useState("05:00");
  const [createAmPm, setCreateAmPm] = useState("AM");
  const [createCategory, setCreateCategory] = useState("general");
  const [createLoading, setCreateLoading] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [showMyGoals, setShowMyGoals] = useState(false);
  const [myGoals, setMyGoals] = useState([]);
  const [myGoalsLoading, setMyGoalsLoading] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const getToken = () => safeStorage.getItem("token") || safeStorage.getItem("calendai-jwt") || "";

  const fetchGoals = useCallback(async (query, category) => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (query && query.trim()) params.set("q", query.trim());
      if (category && category !== "all") params.set("category", category);

      const url = params.toString()
        ? `${API_BASE}/api/goals/search?${params.toString()}`
        : `${API_BASE}/api/goals/active`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Failed to fetch goals");
      const data = await res.json();
      setGoals(data.goals || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyGoals = useCallback(async () => {
    setMyGoalsLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/goals/my`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Failed to fetch my goals");
      const data = await res.json();
      setMyGoals(data.goals || []);
    } catch (err) {
      console.error("Failed to fetch my goals:", err);
    } finally {
      setMyGoalsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals(searchQuery, selectedCategory);
  }, [selectedCategory, fetchGoals]);

  useEffect(() => {
    if (showMyGoals) {
      fetchMyGoals();
    }
  }, [showMyGoals, fetchMyGoals]);

  const handleSearch = () => {
    fetchGoals(searchQuery, selectedCategory);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleCreate = async () => {
    if (!createTitle.trim()) return;
    setCreateLoading(true);
    setError("");
    try {
      const token = getToken();
      const formattedTime = `${createTime} ${createAmPm}`;
      const res = await fetch(`${API_BASE}/api/goals/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          title: createTitle.trim(),
          scheduleTime: formattedTime,
          day: createDay,
          category: createCategory
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "שגיאה ביצירת האתגר");
      }
      const data = await res.json();
      setShowCreateForm(false);
      setCreateTitle("");
      // Refresh goals
      fetchGoals(searchQuery, selectedCategory);
      if (onJoinChallenge && data.goal) {
        onJoinChallenge(data.goal);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoin = async (goalId) => {
    setJoiningId(goalId);
    setError("");
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/goals/${goalId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "שגיאה בהצטרפות");
      }
      const data = await res.json();
      // Refresh goals
      fetchGoals(searchQuery, selectedCategory);
      if (onJoinChallenge) {
        onJoinChallenge(data.goal);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setJoiningId(null);
    }
  };

  const handleToggleCompletion = async (goalId) => {
    setTogglingId(goalId);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/goals/${goalId}/toggle-completion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error("Failed to toggle");
      const data = await res.json();
      // Refresh both lists
      fetchGoals(searchQuery, selectedCategory);
      if (showMyGoals) fetchMyGoals();
    } catch (err) {
      console.error("Toggle error:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const hasUserJoined = (goal) => {
    if (!user) return false;
    return goal.participants?.some(
      p => (p.userId?._id || p.userId) === user.id
    );
  };

  const getUserStatus = (goal) => {
    if (!user) return null;
    const p = goal.participants?.find(
      p => (p.userId?._id || p.userId) === user.id
    );
    return p?.status || null;
  };

  const formatSchedule = (goal) => {
    if (!goal.day || !goal.scheduleTime) return "";
    const dayLabel = dayNames[goal.day] || goal.day;
    return `${dayLabel} ${goal.scheduleTime}`;
  };

  const getCategoryEmoji = (cat) => {
    const found = categories.find(c => c.value === cat);
    return found ? found.label.split(" ")[0] : "🎯";
  };

  // ── Render ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {lang === "he" ? "🎯 אתגרים ומטרות משותפות" : "🎯 Public Goals & Challenges"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search + Filter + Create */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={lang === "he" ? "🔍 חפש אתגרים..." : "🔍 Search challenges..."}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              {lang === "he" ? "חפש" : "Search"}
            </button>
          </div>

          {/* Category filter + Create button */}
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex items-center gap-1">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                setShowMyGoals(!showMyGoals);
                if (!showMyGoals) fetchMyGoals();
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                showMyGoals
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {lang === "he" ? "🏆 האתגרים שלי" : "🏆 My Challenges"}
            </button>

            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              {lang === "he" ? "צור אתגר" : "Create Goal"}
            </button>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
            <div className="space-y-3">
              <input
                type="text"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder={lang === "he" ? "שם האתגר..." : "Challenge title..."}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <div className="flex gap-2 flex-wrap">
                <select
                  value={createDay}
                  onChange={(e) => setCreateDay(e.target.value)}
                  className="flex-1 min-w-[120px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {Object.entries(dayNames).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <input
                  type="time"
                  value={createTime}
                  onChange={(e) => setCreateTime(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <select
                  value={createAmPm}
                  onChange={(e) => setCreateAmPm(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                <select
                  value={createCategory}
                  onChange={(e) => setCreateCategory(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {categories.filter(c => c.value !== "all").map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={createLoading || !createTitle.trim()}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {lang === "he" ? "צור אתגר" : "Create Goal"}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition text-sm"
                >
                  {lang === "he" ? "ביטול" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 mx-4 mt-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {showMyGoals ? (
            /* My Goals Tab */
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {lang === "he" ? "🏆 האתגרים שלי" : "🏆 My Challenges"}
              </h3>
              {myGoalsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                </div>
              ) : myGoals.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {lang === "he" ? "עדיין לא הצטרפת לאתגרים" : "You haven't joined any challenges yet"}
                </div>
              ) : (
                <div className="space-y-3">
                  {myGoals.map(goal => (
                    <div key={goal._id} className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getCategoryEmoji(goal.category)}</span>
                            <h4 className="font-semibold text-gray-900 dark:text-white truncate">{goal.title}</h4>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>👤 {goal.creatorId?.displayName || "Unknown"}</span>
                            <span>📅 {formatSchedule(goal)}</span>
                            <span>👥 {goal.participantCount || 0}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            goal.myStatus === "completed"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                          }`}>
                            {goal.myStatus === "completed" ? "✅ הושלם" : "🔄 בביצוע"}
                          </span>
                          <button
                            onClick={() => handleToggleCompletion(goal._id)}
                            disabled={togglingId === goal._id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                              goal.myStatus === "completed"
                                ? "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300"
                                : "bg-green-600 text-white hover:bg-green-700"
                            }`}
                          >
                            {togglingId === goal._id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : goal.myStatus === "completed" ? (
                              lang === "he" ? "בטל" : "Undo"
                            ) : (
                              lang === "he" ? "✅ סמן כבוצע" : "Mark Complete"
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Browse Goals */
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {lang === "he" ? "🎯 אתגרים פעילים" : "🎯 Active Challenges"}
              </h3>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : goals.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {lang === "he" ? "לא נמצאו אתגרים. נסה לחפש מילה אחרת או צור אתגר חדש!" : "No challenges found. Try a different search or create one!"}
                </div>
              ) : (
                <div className="space-y-3">
                  {goals.map(goal => {
                    const joined = hasUserJoined(goal);
                    const isCreator = user && (goal.creatorId?._id === user.id || goal.creatorId === user.id);
                    return (
                      <div key={goal._id} className="p-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{getCategoryEmoji(goal.category)}</span>
                              <h4 className="font-semibold text-gray-900 dark:text-white truncate">{goal.title}</h4>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                              <span>👤 {goal.creatorId?.displayName || "Unknown"}</span>
                              {goal.scheduleTime && <span>📅 {formatSchedule(goal)}</span>}
                              <span>👥 {goal.participantCount || 0} {lang === "he" ? "משתתפים" : "participants"}</span>
                              {goal.completedCount > 0 && (
                                <span className="text-green-600 dark:text-green-400">✅ {goal.completedCount} {lang === "he" ? "השלימו" : "completed"}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            {isCreator ? (
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg">
                                {lang === "he" ? "יוצר" : "Creator"}
                              </span>
                            ) : joined ? (
                              <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-lg">
                                {lang === "he" ? "✅ הצטרפת" : "✅ Joined"}
                              </span>
                            ) : (
                              <button
                                onClick={() => handleJoin(goal._id)}
                                disabled={joiningId === goal._id}
                                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-medium disabled:opacity-50 flex items-center gap-1"
                              >
                                {joiningId === goal._id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <Users className="w-3 h-3" />
                                    {lang === "he" ? "הצטרף לאתגר" : "Join"}
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Participants preview */}
                        {goal.participants && goal.participants.length > 0 && (
                          <div className="mt-2 flex items-center gap-1">
                            {goal.participants.slice(0, 5).map((p, i) => (
                              <div
                                key={i}
                                className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 overflow-hidden"
                                title={p.userId?.displayName || "User"}
                              >
                                {p.userId?.photo ? (
                                  <img src={p.userId.photo} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  (p.userId?.displayName || "U")[0].toUpperCase()
                                )}
                              </div>
                            ))}
                            {goal.participants.length > 5 && (
                              <span className="text-xs text-gray-400">+{goal.participants.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}