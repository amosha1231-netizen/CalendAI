import React, { useState, useEffect, useCallback } from 'react';
import { X, BarChart3, Zap, Settings, Download, Moon, Sun, Target, Clock, Trophy, Activity, Share2 } from 'lucide-react';

const CATEGORY_KEYWORDS = {
  sport: ['אימון', 'ריצה', 'שחייה', 'הליכה', 'ספורט', 'חדר כושר', 'יוגה', 'פילאטיס', 'רכיבה', 'טיפוס', 'workout', 'run', 'swim', 'walk', 'sport', 'gym', 'yoga', 'pilates', 'bike', 'climb'],
  work: ['עבודה', 'פגישה', 'ישיבה', 'כנס', 'משרד', 'לקוח', 'פרויקט', 'work', 'meeting', 'session', 'conference', 'office', 'client', 'project'],
  sleep: ['שינה', 'sleep', 'לילה', 'night'],
  leisure: ['פנאי', 'משפחה', 'חברים', 'אוכל', 'בישול', 'קניות', 'סידורים', 'טלוויזיה', 'סרט', 'מנוחה', 'leisure', 'family', 'friends', 'food', 'cook', 'shop', 'errands', 'tv', 'movie', 'rest']
};

function categorizeEvent(title) {
  const lower = (title || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return cat;
    }
  }
  return 'leisure'; // default to leisure
}

function computeAnalytics(schedule) {
  const categories = { sport: 0, work: 0, sleep: 0, leisure: 0 };
  let totalMinutes = 0;
  let completedCount = 0;
  let overdueCount = 0;
  let totalEvents = 0;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const dayKey of Object.keys(schedule)) {
    if (dayKey === 'Today') continue;
    const events = schedule[dayKey] || [];
    for (const ev of events) {
      totalEvents++;
      const cat = categorizeEvent(ev.title);
      const match = ev.startTime?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
        const eventMinutes = h * 60 + m;

        const endMatch = ev.endTime?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (endMatch) {
          let eh = parseInt(endMatch[1], 10);
          const em = parseInt(endMatch[2], 10);
          if (endMatch[3].toUpperCase() === 'PM' && eh !== 12) eh += 12;
          if (endMatch[3].toUpperCase() === 'AM' && eh === 12) eh = 0;
          const duration = (eh * 60 + em) - eventMinutes;
          if (duration > 0) categories[cat] += duration;
        }
      }

      // Simple goal metric: events that start before now are "completed" if they have a start time
      // Events that start after now are still pending
      if (dayKey === 'Today' || dayKey === 'Today') {
        if (match) {
          let h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
          if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
          const eventMinutes = h * 60 + m;
          if (eventMinutes < currentMinutes) completedCount++;
          else overdueCount++;
        }
      }
    }
  }

  totalMinutes = Object.values(categories).reduce((a, b) => a + b, 0) || 1;

  const analytics = {};
  for (const [cat, minutes] of Object.entries(categories)) {
    analytics[cat] = {
      minutes: Math.round(minutes),
      hours: (minutes / 60).toFixed(1),
      percent: ((minutes / totalMinutes) * 100).toFixed(1)
    };
  }

  return {
    categories: analytics,
    totalMinutes,
    completedCount,
    overdueCount,
    totalEvents,
    completionRate: totalEvents > 0 ? Math.round((completedCount / totalEvents) * 100) : 0
  };
}

export default function SidebarDrawer({ isOpen, onClose, schedule, lang, t, user, onLogout, onOpenShareModal, selectedLocation, onLocationChange }) {
  const [activeTab, setActiveTab] = useState('analytics');
  const [settingsData, setSettingsData] = useState({
    lang: lang,
    defaultStart: '06:00',
    defaultEnd: '23:00'
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });
  }, []);

  const analytics = useCallback(() => computeAnalytics(schedule), [schedule])();
  const isRTL = lang === 'he';

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    }
  };

  const handleSettingsSave = () => {
    try {
      localStorage.setItem('calendai-default-start', settingsData.defaultStart);
      localStorage.setItem('calendai-default-end', settingsData.defaultEnd);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e) {}
  };

  const categoryColors = {
    sport: { bg: 'bg-green-100', text: 'text-green-700', icon: '🏃' },
    work: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '💼' },
    sleep: { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: '🌙' },
    leisure: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '🎯' }
  };

  const categoryNames = {
    sport: t.analyticsSport,
    work: t.analyticsWork,
    sleep: t.analyticsSleep,
    leisure: t.analyticsLeisure
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={onClose} />
      )}

      {/* Drawer */}
      <div className={`sidebar-drawer ${isOpen ? 'open' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">{t.sidebarTitle}</h2>
          <button onClick={onClose} className="sidebar-close-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Booking Link Button - Prominent in Sidebar */}
        <div className="sidebar-share-section">
          <button
            onClick={() => {
              onClose();
              if (onOpenShareModal) onOpenShareModal();
            }}
            className="sidebar-share-btn"
          >
            <Share2 className="w-5 h-5" />
            <span>{t.shareBookingLink}</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 className="w-5 h-5" />
            <span>{t.sidebarAnalytics}</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeTab === 'pro' ? 'active' : ''}`}
            onClick={() => setActiveTab('pro')}
          >
            <Zap className="w-5 h-5" />
            <span>{t.sidebarPro}</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings className="w-5 h-5" />
            <span>{t.sidebarSettings}</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeTab === 'install' ? 'active' : ''}`}
            onClick={() => setActiveTab('install')}
          >
            <Download className="w-5 h-5" />
            <span>{t.sidebarInstall}</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="sidebar-content">
          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                {t.analyticsTitle}
              </h3>

              {/* Category Breakdown */}
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(analytics.categories).map(([cat, data]) => {
                  const colors = categoryColors[cat] || categoryColors.leisure;
                  return (
                    <div key={cat} className={`${colors.bg} rounded-lg p-3`}>
                      <div className={`text-xs font-medium ${colors.text} mb-1 flex items-center gap-1`}>
                        <span>{colors.icon}</span>
                        <span>{categoryNames[cat]}</span>
                      </div>
                      <div className="text-lg font-bold text-slate-800">{data.hours}h</div>
                      <div className="text-xs text-slate-500">{data.percent}%</div>
                    </div>
                  );
                })}
              </div>

              {/* Total Hours */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">{t.analyticsHours} {t.analyticsTitle}</span>
                  <span className="text-lg font-bold text-blue-600">{(analytics.totalMinutes / 60).toFixed(1)}h</span>
                </div>
              </div>

              {/* Goal Metric */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200">
                <h4 className="text-sm font-bold text-purple-800 flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4" />
                  {t.analyticsGoalMetric}
                </h4>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-purple-600">{t.analyticsCompleted}</span>
                  <span className="text-sm font-bold text-green-600 flex items-center gap-1">
                    <Trophy className="w-4 h-4" />
                    {analytics.completionRate}%
                  </span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-green-400 to-green-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${analytics.completionRate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-purple-500">
                  <span>{analytics.completedCount} {t.analyticsCompleted}</span>
                  <span>{analytics.overdueCount} {t.analyticsOverdue}</span>
                </div>
              </div>
            </div>
          )}

          {/* Pro Tab */}
          {activeTab === 'pro' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{t.proTitle}</h3>
              <p className="text-sm text-slate-500 mb-6">{t.proDesc}</p>
              <ul className="text-right space-y-3 mb-6">
                <li className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded-lg">
                  <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                  {t.proFeature1}
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded-lg">
                  <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                  {t.proFeature2}
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded-lg">
                  <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                  {t.proFeature3}
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded-lg">
                  <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                  {t.proFeature4}
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded-lg">
                  <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                  {t.proFeature5}
                </li>
              </ul>
              <div className="inline-block px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl font-bold text-sm shadow-lg">
                {t.proComingSoon}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-600" />
                {t.settingsTitle}
              </h3>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.settingsLanguage}</label>
                <select
                  value={settingsData.lang}
                  onChange={(e) => {
                    setSettingsData(prev => ({ ...prev, lang: e.target.value }));
                    // Toggle language is handled by the parent's toggleLanguage
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="he">עברית</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.settingsDefaultStart}</label>
                <input
                  type="time"
                  value={settingsData.defaultStart}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, defaultStart: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.settingsDefaultEnd}</label>
                <input
                  type="time"
                  value={settingsData.defaultEnd}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, defaultEnd: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Profile Settings - Default Location */}
              <div className="border-t border-slate-200 pt-4 mt-2">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-500" />
                  {t.profileTitle}
                </h4>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.profileDefaultLocation}</label>
                  <p className="text-xs text-slate-400 mb-2">{t.profileLocationDesc}</p>
                  <select
                    value={selectedLocation || 'none'}
                    onChange={(e) => {
                      if (onLocationChange) onLocationChange(e.target.value);
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="none">{t.noLocation}</option>
                    <option value="jerusalem">Jerusalem</option>
                    <option value="newyork">New York</option>
                    <option value="london">London</option>
                    <option value="losangeles">Los Angeles</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleSettingsSave}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-sm"
              >
                {settingsSaved ? `✓ ${t.settingsSaved}` : t.settingsSave}
              </button>
            </div>
          )}

          {/* Install Tab */}
          {activeTab === 'install' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Download className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{t.sidebarInstall}</h3>
              <p className="text-sm text-slate-500 mb-6">
                {lang === 'he'
                  ? 'הוסף את CalendAI למסך הבית שלך לגישה מהירה מכל מקום'
                  : 'Add CalendAI to your home screen for quick access from anywhere'}
              </p>
              <button
                onClick={handleInstallClick}
                disabled={!installPrompt}
                className={`px-6 py-3 rounded-xl font-bold text-sm shadow-lg transition ${
                  installPrompt
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-xl cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {installPrompt
                  ? (lang === 'he' ? '📱 התקן עכשיו' : '📱 Install Now')
                  : (lang === 'he' ? '⚠️ לא זמין בדפדפן זה' : '⚠️ Not available in this browser')}
              </button>
            </div>
          )}
        </div>

        {/* User Info at Bottom */}
        {user && (
          <div className="sidebar-footer">
            <div className="flex items-center gap-2 p-3 border-t border-slate-200">
              {user.photo ? (
                <img src={user.photo} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                  {user.displayName?.charAt(0) || 'U'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700 truncate">{user.displayName || user.email}</div>
              </div>
              <button onClick={onLogout} className="text-xs text-red-500 hover:text-red-700 font-medium">
                {t.logout}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}