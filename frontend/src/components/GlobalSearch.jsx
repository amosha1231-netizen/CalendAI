import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Users, Trophy, X, Loader2, User, ExternalLink } from "lucide-react";
import safeStorage from "../utils/safeStorage";

var API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * GlobalSearch — A search input in the top header that searches across
 * public goals/challenges and users, displaying a dropdown with results.
 * Supports joining challenges and viewing user profiles.
 */
export default function GlobalSearch({ lang, user, onJoinChallenge, onViewProfile, onOpenPublicGoals }) {
  const isRtl = lang === "he";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ goals: [], users: [] });
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  const getToken = () => safeStorage.getItem("token") || safeStorage.getItem("calendai-jwt") || "";

  const performSearch = useCallback(async (q) => {
    if (!q || !q.trim()) {
      setResults({ goals: [], users: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      // Search goals
      const goalsParams = new URLSearchParams({ q: q.trim() });
      const goalsRes = await fetch(`${API_BASE}/api/goals/search?${goalsParams.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const goalsData = goalsRes.ok ? await goalsRes.json() : { goals: [] };

      // Search users
      const usersParams = new URLSearchParams({ q: q.trim() });
      const usersRes = await fetch(`${API_BASE}/api/users/search?${usersParams.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const usersData = usersRes.ok ? await usersRes.json() : { users: [] };

      setResults({
        goals: goalsData.goals || [],
        users: usersData.users || []
      });
      setShowDropdown(true);
      setSelectedIndex(-1);
    } catch (err) {
      console.error("GlobalSearch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(val);
    }, 350);
  };

  const handleKeyDown = (e) => {
    const totalItems = results.goals.length + results.users.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
  };

  const handleJoinGoal = async (goal) => {
    if (!user) return;
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/goals/${goal._id}/join`, {
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
      if (onJoinChallenge) {
        onJoinChallenge(data.goal);
      }
      // Keep dropdown open but close on next interaction
    } catch (err) {
      console.error("Join goal error:", err);
    }
  };

  const handleViewProfile = (profileUser) => {
    if (onViewProfile) {
      onViewProfile(profileUser);
    }
    setShowDropdown(false);
    setQuery("");
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const totalResults = results.goals.length + results.users.length;
  const hasResults = totalResults > 0;

  return (
    <div className="relative flex-1 max-w-md mx-2">
      <div className="relative">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 ${isRtl ? 'right-3' : 'left-3'}`} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.trim()) setShowDropdown(true); }}
          placeholder={lang === "he" ? "🔍 חפש אתגרים, משתמשים..." : "🔍 Search goals, users..."}
          className={`w-full ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'} py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white dark:focus:bg-gray-600 transition`}
        />
        {loading && (
          <Loader2 className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin ${isRtl ? 'left-3' : 'right-3'}`} />
        )}
        {query && !loading && (
          <button
            onClick={() => { setQuery(""); setResults({ goals: [], users: [] }); setShowDropdown(false); }}
            className={`absolute top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition ${isRtl ? 'left-3' : 'right-3'}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className={`absolute top-full mt-1 ${isRtl ? 'right-0' : 'left-0'} w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto`}
          dir={isRtl ? "rtl" : "ltr"}
        >
          {!query.trim() ? (
            <div className="p-4 text-center text-sm text-gray-400">
              {lang === "he" ? "הקלד לחיפוש אתגרים ומשתמשים" : "Type to search goals and users"}
            </div>
          ) : loading ? (
            <div className="p-4 text-center text-sm text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          ) : !hasResults ? (
            <div className="p-4 text-center text-sm text-gray-400">
              {lang === "he" ? "לא נמצאו תוצאות" : "No results found"}
            </div>
          ) : (
            <div>
              {/* Goals Section */}
              {results.goals.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
                    <Trophy className="w-3 h-3" />
                    {lang === "he" ? "אתגרים" : "Goals"} ({results.goals.length})
                  </div>
                  {results.goals.map((goal, idx) => {
                    const isSelected = selectedIndex === idx;
                    const hasJoined = user && goal.participants?.some(
                      p => (p.userId?._id || p.userId) === user.id
                    );
                    const isCreator = user && (goal.creatorId?._id === user.id || goal.creatorId === user.id);
                    return (
                      <div
                        key={goal._id}
                        className={`px-3 py-2.5 flex items-center gap-2 cursor-pointer transition ${
                          isSelected ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-750"
                        } ${isRtl ? 'border-r-2' : 'border-l-2'} ${
                          hasJoined ? "border-green-400" : isCreator ? "border-blue-400" : "border-transparent"
                        }`}
                        onClick={() => {
                          if (!hasJoined && !isCreator && user) {
                            handleJoinGoal(goal);
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                            <span className="text-xs">{goal.category === "workout" ? "💪" : goal.category === "study" ? "📚" : goal.category === "work" ? "💼" : goal.category === "sleep" ? "🌙" : "🎯"}</span>
                            {goal.title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                            <span>👤 {goal.creatorId?.displayName || "Unknown"}</span>
                            <span>👥 {goal.participantCount || 0}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {isCreator ? (
                            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                              {lang === "he" ? "יוצר" : "Creator"}
                            </span>
                          ) : hasJoined ? (
                            <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                              {lang === "he" ? "✅ הצטרפת" : "✅ Joined"}
                            </span>
                          ) : user ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleJoinGoal(goal); }}
                              className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition"
                            >
                              {lang === "he" ? "הצטרף" : "Join"}
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400">
                              {lang === "he" ? "התחבר להצטרפות" : "Login to join"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Users Section */}
              {results.users.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    {lang === "he" ? "משתמשים" : "Users"} ({results.users.length})
                  </div>
                  {results.users.map((profileUser, idx) => {
                    const globalIdx = results.goals.length + idx;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <div
                        key={profileUser._id}
                        className={`px-3 py-2.5 flex items-center gap-2 cursor-pointer transition ${
                          isSelected ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-750"
                        }`}
                        onClick={() => handleViewProfile(profileUser)}
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 overflow-hidden flex-shrink-0">
                          {profileUser.photo ? (
                            <img src={profileUser.photo} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {profileUser.displayName || "Unknown"}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {profileUser.email || ""}
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* View All Link */}
              <div
                className="px-3 py-2.5 text-center text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer font-medium border-t border-gray-100 dark:border-gray-700"
                onClick={() => {
                  setShowDropdown(false);
                  setQuery("");
                  if (onOpenPublicGoals) onOpenPublicGoals();
                }}
              >
                {lang === "he" ? "🔍 לכל האתגרים הציבוריים" : "🔍 Browse all public goals"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}