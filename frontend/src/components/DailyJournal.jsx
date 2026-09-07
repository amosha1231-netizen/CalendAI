import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Save, Search, ChevronLeft, ChevronRight, Edit3, Trash2, BookOpen, Loader2, Sun, Moon, Cloud, CloudSun, CloudRain, Sparkles, Heart, Smile, Frown, Meh, Star, Clock, List, FileText } from 'lucide-react';
import api from '../api/axios';

// ── Mood Options ──
const MOOD_OPTIONS = [
  { emoji: '😊', label: 'Happy', labelHe: 'שמח' },
  { emoji: '😌', label: 'Calm', labelHe: 'רגוע' },
  { emoji: '😴', label: 'Tired', labelHe: 'עייף' },
  { emoji: '😤', label: 'Stressed', labelHe: 'לחוץ' },
  { emoji: '😢', label: 'Sad', labelHe: 'עצוב' },
  { emoji: '🤩', label: 'Great', labelHe: 'מצוין' },
  { emoji: '😐', label: 'Okay', labelHe: 'בסדר' },
  { emoji: '🔥', label: 'Productive', labelHe: 'פרודוקטיבי' },
  { emoji: '💪', label: 'Motivated', labelHe: 'מלא מוטיבציה' },
  { emoji: '🌟', label: 'Grateful', labelHe: 'אסיר תודה' },
];

// ── Tag Suggestions ──
const SUGGESTED_TAGS = [
  'work', 'family', 'health', 'gym', 'study', 'friends',
  'travel', 'food', 'creative', 'finance', 'spirituality', 'rest'
];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString('he-IL', options);
}

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function DailyJournal({ isOpen, onClose, lang, t, user }) {
  const [activeTab, setActiveTab] = useState('write'); // 'write' | 'history'
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [notes, setNotes] = useState('');
  const [mood, setMood] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [dayEvents, setDayEvents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success'); // 'success' | 'error'

  const isRTL = lang === 'he';

  // ── Load log for selected date ──
  const loadLog = useCallback(async (date) => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/daily-log/${date}`);
      if (res.data.ok && res.data.log) {
        setNotes(res.data.log.notes || '');
        setMood(res.data.log.mood || '');
        setTags(res.data.log.tags || []);
        setDayEvents(res.data.log.dayEvents || []);
      } else {
        setNotes('');
        setMood('');
        setTags([]);
        setDayEvents([]);
      }
    } catch (err) {
      console.error('Failed to load log:', err);
      setNotes('');
      setMood('');
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.get('/api/daily-log?limit=50');
      if (res.data.ok) {
        setLogs(res.data.logs);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Save log ──
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await api.post('/api/daily-log', {
        date: selectedDate,
        notes,
        mood,
        tags
      });
      if (res.data.ok) {
        setMessage(lang === 'he' ? '✅ היומן נשמר בהצלחה!' : '✅ Journal saved successfully!');
        setMessageType('success');
        loadHistory();
      }
    } catch (err) {
      console.error('Failed to save log:', err);
      setMessage(lang === 'he' ? '❌ שגיאה בשמירת היומן' : '❌ Failed to save journal');
      setMessageType('error');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // ── Delete log ──
  const handleDelete = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await api.delete(`/api/daily-log/${selectedDate}`);
      setNotes('');
      setMood('');
      setTags([]);
      setDayEvents([]);
      setMessage(lang === 'he' ? '🗑️ היומן נמחק' : '🗑️ Journal deleted');
      setMessageType('success');
      loadHistory();
    } catch (err) {
      console.error('Failed to delete log:', err);
      setMessage(lang === 'he' ? '❌ שגיאה במחיקה' : '❌ Failed to delete');
      setMessageType('error');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // ── Search ──
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/daily-log/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (res.data.ok) {
        setSearchResults(res.data.logs);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Navigate dates ──
  const changeDate = (delta) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setSelectedDate(newDate);
  };

  // ── Load log when date changes ──
  useEffect(() => {
    if (isOpen && user) {
      loadLog(selectedDate);
    }
  }, [isOpen, selectedDate, user, loadLog]);

  // ── Load history when tab changes ──
  useEffect(() => {
    if (isOpen && activeTab === 'history' && user) {
      loadHistory();
    }
  }, [isOpen, activeTab, user, loadHistory]);

  // ── Add tag ──
  const addTag = (tag) => {
    const normalized = tag.toLowerCase().trim();
    if (normalized && !tags.includes(normalized)) {
      setTags([...tags, normalized]);
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    setTags(tags.filter(t => t !== tag));
  };

  // ── Navigate to a date from history ──
  const openDate = (date) => {
    setSelectedDate(date);
    setActiveTab('write');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">
                {lang === 'he' ? '📖 יומן אישי' : '📖 Daily Journal'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="flex border-b border-slate-200 px-6">
            <button
              onClick={() => setActiveTab('write')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'write'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              {lang === 'he' ? 'כתיבה' : 'Write'}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
              {lang === 'he' ? 'היסטוריה' : 'History'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* ── Message Toast ── */}
            {message && (
              <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${
                messageType === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {message}
              </div>
            )}

            {/* ── Write Tab ── */}
            {activeTab === 'write' && (
              <div className="space-y-4">
                {/* Date Navigation */}
                <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                  <button
                    onClick={() => changeDate(-1)}
                    className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 hover:shadow transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-semibold text-slate-700">
                      {formatDate(selectedDate)}
                    </span>
                    {selectedDate === getTodayStr() && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                        {lang === 'he' ? 'היום' : 'Today'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => changeDate(1)}
                    className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 hover:shadow transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                {/* Mood Selector */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                    {lang === 'he' ? 'איך אתה מרגיש היום?' : 'How are you feeling today?'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {MOOD_OPTIONS.map((opt) => (
                      <button
                        key={opt.emoji}
                        onClick={() => setMood(mood === opt.emoji ? '' : opt.emoji)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition flex items-center gap-1 ${
                          mood === opt.emoji
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-base">{opt.emoji}</span>
                        <span className="text-xs">{isRTL ? opt.labelHe : opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                    {lang === 'he' ? 'תגיות' : 'Tags'}
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
                      >
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag(tagInput);
                        }
                      }}
                      placeholder={lang === 'he' ? 'הוסף תגית...' : 'Add a tag...'}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                    />
                    <button
                      onClick={() => addTag(tagInput)}
                      disabled={!tagInput.trim()}
                      className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition disabled:opacity-50"
                    >
                      {lang === 'he' ? 'הוסף' : 'Add'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_TAGS.filter(t => !tags.includes(t)).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => addTag(tag)}
                        className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] hover:bg-slate-200 transition"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes Textarea */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                    {lang === 'he' ? 'רשומות / רפלקציה יומית' : 'Daily Notes & Reflections'}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lang === 'he'
                      ? 'מה קרה היום? איך עבר היום? רשמים, מחשבות, תובנות...'
                      : 'What happened today? How was your day? Thoughts, insights...'
                    }
                    rows={8}
                    className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none resize-none leading-relaxed"
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>

                {/* Today's Events (read-only snapshot) */}
                {dayEvents.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {lang === 'he' ? 'אירועים מתוכננים להיום' : "Today's Scheduled Events"}
                    </label>
                    <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                      {dayEvents.map((ev, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                          <span className="font-medium">{ev.title}</span>
                          {ev.startTime && (
                            <span className="text-xs text-slate-400">
                              {ev.startTime}{ev.endTime ? ` - ${ev.endTime}` : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save / Delete Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium text-sm shadow-lg shadow-indigo-200 hover:shadow-xl transition disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving
                      ? (lang === 'he' ? 'שומר...' : 'Saving...')
                      : (lang === 'he' ? '💾 שמור יומן' : '💾 Save Journal')}
                  </button>
                  {notes && (
                    <button
                      onClick={handleDelete}
                      disabled={saving}
                      className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium text-sm border border-red-200 hover:bg-red-100 transition disabled:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── History Tab ── */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {/* Search */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSearch();
                      }}
                      placeholder={lang === 'he' ? 'חיפוש ביומנים...' : 'Search journal entries...'}
                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    className="px-4 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100 transition"
                  >
                    {lang === 'he' ? 'חיפוש' : 'Search'}
                  </button>
                </div>

                {/* Search Results */}
                {searchResults && (
                  <div className="bg-indigo-50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-indigo-600">
                        {lang === 'he'
                          ? `נמצאו ${searchResults.length} תוצאות`
                          : `${searchResults.length} result(s) found`}
                      </span>
                      <button
                        onClick={() => setSearchResults(null)}
                        className="text-xs text-indigo-400 hover:text-indigo-600"
                      >
                        {lang === 'he' ? 'נקה' : 'Clear'}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {searchResults.map((log) => (
                        <button
                          key={log._id}
                          onClick={() => openDate(log.date)}
                          className="w-full text-left px-3 py-2 bg-white rounded-lg text-sm hover:bg-indigo-50 transition flex items-center justify-between"
                        >
                          <span className="font-medium text-slate-700">{formatDate(log.date)}</span>
                          <span className="text-slate-400 text-xs">
                            {log.mood} {log.tags?.slice(0, 2).join(', ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Logs List */}
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {lang === 'he' ? 'עדיין לא כתבת יומן. התחל עכשיו!' : 'No journal entries yet. Start writing!'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <button
                        key={log._id}
                        onClick={() => openDate(log.date)}
                        className="w-full text-left p-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:shadow-sm transition group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-slate-700">
                                {formatDate(log.date)}
                              </span>
                              {log.mood && <span className="text-base">{log.mood}</span>}
                            </div>
                            <p className="text-sm text-slate-500 line-clamp-2">
                              {log.notes || (lang === 'he' ? '(ללא תוכן)' : '(no content)')}
                            </p>
                            {log.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {log.tags.map((tag) => (
                                  <span key={tag} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <ChevronLeft className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition shrink-0 mt-1" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}