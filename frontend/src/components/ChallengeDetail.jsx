import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Send, Trophy, Users, Loader2, MessageSquare, CheckCircle, Clock, Calendar } from "lucide-react";
import safeStorage from "../utils/safeStorage";

var API_BASE = import.meta.env.VITE_API_URL || "";

const CATEGORY_EMOJI = {
  workout: "💪",
  study: "📚",
  work: "💼",
  sleep: "🌙",
  general: "🎯"
};

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

export default function ChallengeDetail({ goalId, lang, user, onClose, onJoinChallenge }) {
  const isRtl = lang === "he";
  const dayNames = lang === "he" ? DAY_NAMES : DAY_NAMES_EN;
  const t = {
    loading: lang === "he" ? "טוען..." : "Loading...",
    error: lang === "he" ? "שגיאה" : "Error",
    participants: lang === "he" ? "משתתפים" : "participants",
    completed: lang === "he" ? "השלימו" : "completed",
    discussion: lang === "he" ? "💬 דיונים" : "💬 Discussion",
    noMessages: lang === "he" ? "אין עדיין הודעות. היה הראשון לכתוב!" : "No messages yet. Be the first to write!",
    sendMessage: lang === "he" ? "שלח הודעה..." : "Send a message...",
    send: lang === "he" ? "שלח" : "Send",
    joinToChat: lang === "he" ? "הצטרף לאתגר כדי להשתתף בדיון" : "Join the challenge to participate in the discussion",
    join: lang === "he" ? "הצטרף לאתגר" : "Join Challenge",
    joined: lang === "he" ? "✅ הצטרפת" : "✅ Joined",
    creator: lang === "he" ? "יוצר" : "Creator",
    schedule: lang === "he" ? "לוח זמנים" : "Schedule",
    close: lang === "he" ? "סגור" : "Close",
    messageSent: lang === "he" ? "ההודעה נשלחה!" : "Message sent!",
    sending: lang === "he" ? "שולח..." : "Sending..."
  };

  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const messagesEndRef = useRef(null);

  const getToken = () => safeStorage.getItem("token") || safeStorage.getItem("calendai-jwt") || "";

  const fetchGoal = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/goals/${goalId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Failed to fetch challenge");
      const data = await res.json();
      setGoal(data.goal);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    fetchGoal();
  }, [fetchGoal]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [goal?.messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || sending) return;
    setSending(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/goals/${goalId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ text: messageText.trim() })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to send");
      }
      const data = await res.json();
      setGoal(data.goal);
      setMessageText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleJoin = async () => {
    setJoining(true);
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
        throw new Error(errData.error || "Failed to join");
      }
      const data = await res.json();
      setGoal(data.goal);
      if (onJoinChallenge) onJoinChallenge(data.goal);
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const hasJoined = user && goal?.participants?.some(
    p => (p.userId?._id || p.userId) === user.id
  );
  const isCreator = user && (goal?.creatorId?._id === user.id || goal?.creatorId === user.id);
  const canMessage = hasJoined || isCreator;

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return lang === "he" ? "עכשיו" : "just now";
    if (diffMin < 60) return lang === "he" ? `לפני ${diffMin} דק'` : `${diffMin}m ago`;
    if (diffHours < 24) return lang === "he" ? `לפני ${diffHours} שע'` : `${diffHours}h ago`;
    if (diffDays < 7) return lang === "he" ? `לפני ${diffDays} ימים` : `${diffDays}d ago`;
    return d.toLocaleDateString(lang === "he" ? "he-IL" : "en-US", { month: "short", day: "numeric" });
  };

  const formatSchedule = () => {
    if (!goal) return "";
    if (!goal.day || !goal.scheduleTime) return lang === "he" ? "גמיש - כל יום" : "Flexible - any day";
    const dayLabel = dayNames[goal.day] || goal.day;
    return `${dayLabel} ${goal.scheduleTime}`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (error && !goal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-red-600">{t.error}</h3>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-600">{error}</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg text-sm">{t.close}</button>
        </div>
      </div>
    );
  }

  if (!goal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0">{CATEGORY_EMOJI[goal.category] || "🎯"}</span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{goal.title}</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                <span>👤 {goal.creatorId?.displayName || "Unknown"}</span>
                <span>👥 {goal.participantCount || 0} {t.participants}</span>
                {goal.completedCount > 0 && (
                  <span className="text-green-600">✅ {goal.completedCount} {t.completed}</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Schedule Info */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Calendar className="w-4 h-4 text-blue-500" />
          <span className="font-medium">{t.schedule}:</span>
          <span>{formatSchedule()}</span>
        </div>

        {/* Join/Creator Badge */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 shrink-0">
          {isCreator ? (
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg">
              {t.creator}
            </span>
          ) : hasJoined ? (
            <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-lg">
              {t.joined}
            </span>
          ) : user ? (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-medium disabled:opacity-50 flex items-center gap-1"
            >
              {joining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
              {t.join}
            </button>
          ) : (
            <span className="text-xs text-gray-400">{t.joinToChat}</span>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t.discussion}</h3>
            {goal.messages?.length > 0 && (
              <span className="text-xs text-gray-400">({goal.messages.length})</span>
            )}
          </div>

          {(!goal.messages || goal.messages.length === 0) ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t.noMessages}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {goal.messages.map((msg) => {
                const msgUserId = msg.userId?._id || msg.userId;
                const isOwn = user && msgUserId === user.id;
                return (
                  <div
                    key={msg._id}
                    className={`flex gap-2 ${isOwn ? (isRtl ? 'flex-row' : 'flex-row-reverse') : ''}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 overflow-hidden shrink-0">
                      {msg.userId?.photo ? (
                        <img src={msg.userId.photo} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (msg.userId?.displayName || "U")[0].toUpperCase()
                      )}
                    </div>
                    <div className={`max-w-[80%] ${isOwn ? (isRtl ? 'ml-auto' : 'mr-auto') : ''}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {msg.userId?.displayName || "Unknown"}
                        </span>
                        <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                      </div>
                      <div className={`px-3 py-2 rounded-2xl text-sm ${
                        isOwn
                          ? "bg-indigo-600 text-white rounded-tr-sm"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-sm"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          {canMessage ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={t.sendMessage}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                disabled={sending}
              />
              <button
                onClick={handleSendMessage}
                disabled={sending || !messageText.trim()}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{t.send}</span>
              </button>
            </div>
          ) : (
            <div className="text-center text-xs text-gray-400 py-2">
              {t.joinToChat}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}