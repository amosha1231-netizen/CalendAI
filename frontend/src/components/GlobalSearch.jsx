import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Users, Trophy, X, Loader2, User, ExternalLink, Command, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import safeStorage from "../utils/safeStorage";

var API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * GlobalSearch — Command Palette style search modal.
 * Searches across public goals/challenges and users.
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

  // ── Command Palette: Listen for Cmd+K / Ctrl+K ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowDropdown(prev => !prev);
        if (!showDropdown) {
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      }
      if (e.key === 'Escape') {
        setShowDropdown(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDropdown]);

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
      const goalsParams = new URLSearchParams({ q: q.trim() });
      const goalsRes = await fetch(`${API_BASE}/api/goals/search?${goalsParams.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const goalsData = goalsRes.ok ? await goalsRes.json() : { goals: [] };

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

  // ── Command Palette Modal ──
  return (
    <>
      {/* Desktop Trigger Button */}
      <div className="relative flex-1 max-w-md mx-2 hidden sm:block">
        <button
          onClick={() => {
            setShowDropdown(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 group"
        >
          <Search className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
          <span className="flex-1 text-left">{lang === "he" ? "חפש אתגרים, משתמשים..." : "Search goals, users..."}</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-slate-400 bg-white border border-slate-200 rounded-md">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>
      </div>

      {/* Mobile Search Icon */}
      <button
        onClick={() => {
          setShowDropdown(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition text-slate-500"
        title={lang === "he" ? "חיפוש" : "Search"}
      >
        <Search className="w-4.5 h-4.5" />
      </button>

      {/* ── Command Palette Overlay ── */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] sm:pt-[20vh] bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDropdown(false)}
          >
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, scale: 0.92, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -10 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25, mass: 0.9 }}
              className="w-full max-w-lg mx-4 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden"
              onClick={e => e.stopPropagation()}
              dir={isRtl ? "rtl" : "ltr"}
            >
              {/* Search Input */}
              <div className="relative border-b border-slate-100 dark:border-gray-800">
                <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 ${isRtl ? 'right-4' : 'left-4'}`} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={lang === "he" ? "חפש אתגרים, משתמשים..." : "Search goals, users..."}
                  className={`w-full ${isRtl ? 'pr-12 pl-12' : 'pl-12 pr-12'} py-4 text-base text-slate-800 dark:text-white bg-transparent placeholder-slate-400 focus:outline-none`}
                  autoFocus
                />
                {loading && (
                  <Loader2 className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500 animate-spin ${isRtl ? 'left-4' : 'right-4'}`} />
                )}
                {query && !loading && (
                  <button
                    onClick={() => { setQuery(""); setResults({ goals: [], users: [] }); }}
                    className={`absolute top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition ${isRtl ? 'left-4' : 'right-4'}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto">
                {!query.trim() ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-400">
                      {lang === "he" ? "הקלד לחיפוש אתגרים ומשתמשים" : "Type to search goals and users"}
                    </p>
                    <p className="text-xs text-slate-300 mt-2">
                      {lang === "he" ? 'לחץ על Escape כדי לסגור' : 'Press Escape to close'}
                    </p>
                  </div>
                ) : loading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" />
                  </div>
                ) : !hasResults ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Search className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-400">
                      {lang === "he" ? "לא נמצאו תוצאות" : "No results found"}
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Goals Section */}
                    {results.goals.length > 0 && (
                      <div>
                        <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-gray-800/50 border-b border-slate-100 dark:border-gray-800 flex items-center gap-1.5">
                          <Trophy className="w-3 h-3" />
                          {lang === "he" ? "אתגרים" : "Goals"} ({results.goals.length})
                        </div>
                        <div className="py-1">
                          {results.goals.map((goal, idx) => {
                            const isSelected = selectedIndex === idx;
                            const hasJoined = user && goal.participants?.some(
                              p => (p.userId?._id || p.userId) === user.id
                            );
                            const isCreator = user && (goal.creatorId?._id === user.id || goal.creatorId === user.id);
                            return (
                              <motion.div
                                key={goal._id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.03, duration: 0.2 }}
                                className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition ${
                                  isSelected ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-slate-50 dark:hover:bg-gray-800/50"
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
                                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                    <span className="text-xs">{goal.category === "workout" ? "💪" : goal.category === "study" ? "📚" : goal.category === "work" ? "💼" : goal.category === "sleep" ? "🌙" : "🎯"}</span>
                                    {goal.title}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
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
                                    <span className="text-[10px] text-slate-400">
                                      {lang === "he" ? "התחבר להצטרפות" : "Login to join"}
                                    </span>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Users Section */}
                    {results.users.length > 0 && (
                      <div>
                        <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-gray-800/50 border-b border-slate-100 dark:border-gray-800 flex items-center gap-1.5">
                          <Users className="w-3 h-3" />
                          {lang === "he" ? "משתמשים" : "Users"} ({results.users.length})
                        </div>
                        <div className="py-1">
                          {results.users.map((profileUser, idx) => {
                            const globalIdx = results.goals.length + idx;
                            const isSelected = selectedIndex === globalIdx;
                            return (
                              <motion.div
                                key={profileUser._id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: (results.goals.length + idx) * 0.03, duration: 0.2 }}
                                className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition ${
                                  isSelected ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-slate-50 dark:hover:bg-gray-800/50"
                                }`}
                                onClick={() => handleViewProfile(profileUser)}
                              >
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-300 overflow-hidden flex-shrink-0">
                                  {profileUser.photo ? (
                                    <img src={profileUser.photo} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                    {profileUser.displayName || "Unknown"}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {profileUser.email || ""}
                                  </div>
                                </div>
                                <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* View All Link */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="px-4 py-3 text-center text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer font-medium border-t border-slate-100 dark:border-gray-800"
                      onClick={() => {
                        setShowDropdown(false);
                        setQuery("");
                        if (onOpenPublicGoals) onOpenPublicGoals();
                      }}
                    >
                      {lang === "he" ? "🔍 לכל האתגרים הציבוריים" : "🔍 Browse all public goals"}
                    </motion.div>
                  </div>
                )}
              </div>

              {/* Footer Hint */}
              <div className="px-4 py-2 bg-slate-50 dark:bg-gray-800/50 border-t border-slate-100 dark:border-gray-800 flex items-center justify-between text-[10px] text-slate-400">
                <div className="flex items-center gap-3">
                  <span><kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded text-[9px] font-mono">↑↓</kbd> Navigate</span>
                  <span><kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded text-[9px] font-mono">↵</kbd> Select</span>
                </div>
                <span><kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded text-[9px] font-mono">Esc</kbd> Close</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}