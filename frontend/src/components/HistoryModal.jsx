import React, { useState, useEffect, useCallback } from "react";
import { X, Search, RotateCcw, Clock, Check, Loader2, AlertCircle, FileText, Trash2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function HistoryModal({ isOpen, onClose, t, lang, onUndoSuccess }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [undoingId, setUndoingId] = useState(null);

  const fetchHistory = useCallback(async (search) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search && search.trim()) params.set("search", search.trim());
      const queryString = params.toString();
      const url = `${API_BASE}/api/action-history${queryString ? `?${queryString}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch history");
      }
      const data = await res.json();
      setHistory(data.history || []);
    } catch (err) {
      console.error("Fetch history error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchHistory("");
      setSearchQuery("");
    }
  }, [isOpen, fetchHistory]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchHistory(searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    fetchHistory("");
  };

  const handleUndo = async (id) => {
    setUndoingId(id);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/action-history/${id}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to undo action");
      }
      // Remove from local state
      setHistory((prev) =>
        prev.map((item) =>
          item._id === id ? { ...item, undoneAt: new Date().toISOString() } : item
        )
      );
      if (onUndoSuccess) onUndoSuccess();
    } catch (err) {
      console.error("Undo error:", err);
      setError(err.message);
    } finally {
      setUndoingId(null);
    }
  };

  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const options = {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
      return d.toLocaleDateString(lang === "he" ? "he-IL" : "en-US", options);
    } catch {
      return dateStr;
    }
  };

  const actionTypeLabel = (type) => {
    const labels = {
      parse: lang === "he" ? "ניתוח טקסט" : "Parse",
      "quick-add": lang === "he" ? "הוספה מהירה" : "Quick Add",
      "manual-add": lang === "he" ? "הוספה ידנית" : "Manual Add",
      reschedule: lang === "he" ? "שינוי תזמון" : "Reschedule",
    };
    return labels[type] || type;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            {lang === "he" ? "היסטוריית פעולות" : "Action History"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 shrink-0">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === "he"
                  ? "חפש בהיסטוריה..."
                  : "Search history..."
              }
              className="w-full pl-10 pr-8 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50"
              dir={lang === "he" ? "rtl" : "ltr"}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-200 transition"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </form>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                {searchQuery
                  ? lang === "he"
                    ? "לא נמצאו תוצאות לחיפוש"
                    : "No results found"
                  : lang === "he"
                  ? "אין עדיין היסטוריית פעולות"
                  : "No action history yet"}
              </p>
            </div>
          )}

          {!loading &&
            history.map((item) => (
              <div
                key={item._id}
                className={`p-3 rounded-xl border ${
                  item.undoneAt
                    ? "bg-slate-50 border-slate-200 opacity-60"
                    : "bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm"
                } transition`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0">
                        {actionTypeLabel(item.actionType)}
                      </span>
                      {item.undoneAt && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                          {lang === "he" ? "בוטל" : "Undone"}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-sm text-slate-700 line-clamp-2"
                      dir={lang === "he" ? "rtl" : "ltr"}
                    >
                      {item.promptText || (
                        <span className="text-slate-400 italic">
                          {lang === "he" ? "ללא תיאור" : "No description"}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-400">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                    {item.createdEventIds && item.createdEventIds.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <FileText className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">
                          {item.createdEventIds.length}{" "}
                          {lang === "he" ? "אירועים" : "events"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Undo Button */}
                  <button
                    onClick={() => handleUndo(item._id)}
                    disabled={!!item.undoneAt || undoingId === item._id}
                    className={`shrink-0 p-2 rounded-lg transition ${
                      item.undoneAt
                        ? "text-slate-300 cursor-not-allowed"
                        : "text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                    }`}
                    title={
                      lang === "he" ? "בטל פעולה" : "Undo action"
                    }
                  >
                    {undoingId === item._id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : item.undoneAt ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 shrink-0 text-center">
          <p className="text-xs text-slate-400">
            {lang === "he"
              ? "ביטול פעולה ימחק את האירועים שנוצרו מהיומן"
              : "Undoing an action will delete the created events from your calendar"}
          </p>
        </div>
      </div>
    </div>
  );
}