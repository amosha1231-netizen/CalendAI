import React, { useState, useEffect, useCallback } from "react";
import { Search, X, Loader2, Filter, Briefcase, Calendar } from "lucide-react";
import safeStorage from "../utils/safeStorage";

var API_BASE = import.meta.env.VITE_API_URL || "";

const CATEGORIES = [
  { value: "all", label: "הכל" },
  { value: "barber", label: "💇 מספרה" },
  { value: "trainer", label: "🏋️ מאמן" },
  { value: "consultant", label: "💼 יועץ" },
  { value: "therapist", label: "🧘 מטפל" },
  { value: "general", label: "⭐ כללי" }
];

const CATEGORIES_EN = [
  { value: "all", label: "All" },
  { value: "barber", label: "💇 Barber" },
  { value: "trainer", label: "🏋️ Trainer" },
  { value: "consultant", label: "💼 Consultant" },
  { value: "therapist", label: "🧘 Therapist" },
  { value: "general", label: "⭐ General" }
];

export default function ProviderDirectory({ lang, user, onClose, onSelectProvider }) {
  const isRtl = lang === "he";
  const categories = lang === "he" ? CATEGORIES : CATEGORIES_EN;

  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const getToken = () => {
    try {
      return safeStorage.getItem("token") || safeStorage.getItem("calendai-jwt") || "";
    } catch (e) {
      return "";
    }
  };

  const fetchProviders = useCallback(async (query, category) => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (query && query.trim()) params.set("q", query.trim());
      if (category && category !== "all") params.set("category", category);

      const res = await fetch(`${API_BASE}/api/providers${params.toString() ? `?${params.toString()}` : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Failed to fetch providers");
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders(searchQuery, selectedCategory);
  }, [selectedCategory, fetchProviders]);

  const handleSearch = () => fetchProviders(searchQuery, selectedCategory);
  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  const getCategoryLabel = (cat) => {
    const found = categories.find(c => c.value === cat);
    return found ? found.label : (lang === "he" ? "⭐ כללי" : "⭐ General");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-indigo-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {lang === "he" ? "💼 מצא נותן שירות" : "💼 Find a Provider"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search + Filter */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={lang === "he" ? "🔍 חפש נותני שירות..." : "🔍 Search providers..."}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
            >
              {lang === "he" ? "חפש" : "Search"}
            </button>
          </div>

          <div className="flex items-center gap-1">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="p-3 mx-4 mt-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {lang === "he" ? "לא נמצאו נותני שירות." : "No providers found."}
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map(p => (
                <div
                  key={p._id}
                  className="p-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md transition cursor-pointer"
                  onClick={() => onSelectProvider && onSelectProvider(p._id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 overflow-hidden shrink-0">
                          {p.photo ? <img src={p.photo} alt="" className="w-full h-full object-cover" /> : (p.businessName || "P")[0].toUpperCase()}
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-white truncate">{p.businessName}</h4>
                      </div>
                      {p.bio && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{p.bio}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                          {getCategoryLabel(p.category)}
                        </span>
                        <span>{p.services?.length || 0} {lang === "he" ? "שירותים" : "services"}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectProvider && onSelectProvider(p._id); }}
                      className="shrink-0 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-medium flex items-center gap-1"
                    >
                      <Calendar className="w-3 h-3" />
                      {lang === "he" ? "הזמן" : "Book"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
