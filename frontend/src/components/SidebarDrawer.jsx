import React, { useState, useEffect, useCallback } from 'react';
import { X, BarChart3, Zap, Settings, Download, Moon, Sun, Target, Clock, Trophy, Activity, Share2, MapPin, Loader2, ExternalLink, CheckCircle } from 'lucide-react';

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

// Detect iOS Safari
function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|OPiOS|mercury/.test(ua);
  return isIos && isSafari;
}

// Detect iOS non-Safari browser (Chrome/Firefox on iPhone)
function isIosNonSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isNotSafari = !(/Safari/.test(ua) && !/Chrome|CriOS|FxiOS|OPiOS|mercury/.test(ua));
  return isIos && isNotSafari;
}

// Check if already in standalone mode (PWA installed)
function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
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
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectError, setDetectError] = useState("");
  const [detectedCity, setDetectedCity] = useState("");
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showIosNonSafariMsg, setShowIosNonSafariMsg] = useState(false);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });
  }, []);

  // Auto-detect location using Geolocation API + reverse geocoding
  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      setDetectError(t.detectLocationError || 'Could not detect location. Check permissions.');
      return;
    }
    setDetectLoading(true);
    setDetectError("");
    setDetectedCity("");
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });
      const { latitude, longitude } = position.coords;
      
      // Use reverse geocoding via OpenStreetMap Nominatim API
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=he`,
        { headers: { 'User-Agent': 'CalendAI/1.0' } }
      );
      if (!geoRes.ok) throw new Error('Geocoding failed');
      const geoData = await geoRes.json();
      const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.county || 'Unknown';
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      setDetectedCity(city);
      
      // Update the location in localStorage
      try {
        localStorage.setItem('calendai-detected-location', JSON.stringify({
          city,
          timezone,
          lat: latitude,
          lng: longitude,
          timestamp: Date.now()
        }));
      } catch (e) {}
      
      // If we have a city name, try to match it to a known location
      const cityLower = city.toLowerCase();
      let matchedLocation = 'none';
      if (cityLower.includes('jerusalem') || cityLower.includes('ירושלים')) matchedLocation = 'jerusalem';
      else if (cityLower.includes('new york') || cityLower.includes('nyc') || cityLower.includes('manhattan')) matchedLocation = 'newyork';
      else if (cityLower.includes('london') || cityLower.includes('לונדון')) matchedLocation = 'london';
      else if (cityLower.includes('los angeles') || cityLower.includes('la ')) matchedLocation = 'losangeles';
      
      if (matchedLocation !== 'none' && onLocationChange) {
        onLocationChange(matchedLocation);
      }
      
      // Show success via settingsSaved styled message
      setDetectLoading(false);
    } catch (err) {
      console.error('Location detection failed:', err);
      setDetectError(t.detectLocationError || 'Could not detect location. Check permissions.');
      setDetectLoading(false);
    }
  };

  const analytics = useCallback(() => computeAnalytics(schedule), [schedule])();
  const isRTL = lang === 'he';

  // Cross-browser PWA install handler
  const handleInstallClick = async () => {
    // Scenario 1: Already installed (standalone mode)
    if (isStandalone()) {
      return; // Will show green indicator in the UI
    }

    // Scenario 2: Android Chrome - has installPrompt
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstallPrompt(null);
      }
      return;
    }

    // Scenario 3: iOS Safari - show guide modal
    if (isIosSafari()) {
      setShowIosGuide(true);
      return;
    }

    // Scenario 4: iOS non-Safari (Chrome/Firefox on iPhone)
    if (isIosNonSafari()) {
      setShowIosNonSafariMsg(true);
      return;
    }

    // Scenario 5: Desktop or other browser without installPrompt
    // Show iOS guide as fallback (the user can still manually add)
    setShowIosGuide(true);
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

  // Determine install button text and style
  const getInstallButtonContent = () => {
    if (isStandalone()) {
      return {
        text: lang === 'he' ? '✅ האפליקציה מותקנת!' : '✅ App is installed!',
        style: 'bg-green-100 text-green-700 border border-green-300 cursor-default',
        icon: CheckCircle
      };
    }
    if (installPrompt) {
      return {
        text: lang === 'he' ? '📱 התקן עכשיו' : '📱 Install Now',
        style: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-xl cursor-pointer',
        icon: Download
      };
    }
    if (isIosSafari()) {
      return {
        text: lang === 'he' ? '📱 הוסף למסך הבית' : '📱 Add to Home Screen',
        style: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-xl cursor-pointer',
        icon: Download
      };
    }
    if (isIosNonSafari()) {
      return {
        text: lang === 'he' ? '📱 הוראות התקנה' : '📱 Install Instructions',
        style: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:shadow-xl cursor-pointer',
        icon: ExternalLink
      };
    }
    // Default desktop/other
    return {
      text: lang === 'he' ? '📱 הוסף למסך הבית' : '📱 Add to Home Screen',
      style: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-xl cursor-pointer',
      icon: Download
    };
  };

  const installBtn = getInstallButtonContent();
  const InstallIcon = installBtn.icon;

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={onClose} />
      )}

      {/* Drawer */}
      <div className={`sidebar-drawer ${isOpen ? 'open' : ''} w-full max-w-full box-border`} dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">{t.sidebarTitle}</h2>
          <button onClick={onClose} className="sidebar-close-btn">
            <X className="w-5 h-5" />
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
                  className="w-full max-w-full box-border px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
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
                  className="w-full max-w-full box-border px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.settingsDefaultEnd}</label>
                <input
                  type="time"
                  value={settingsData.defaultEnd}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, defaultEnd: e.target.value }))}
                  className="w-full max-w-full box-border px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
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
                    className="w-full max-w-full box-border px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="none">{t.noLocation}</option>
                    <option value="jerusalem">Jerusalem</option>
                    <option value="newyork">New York</option>
                    <option value="london">London</option>
                    <option value="losangeles">Los Angeles</option>
                  </select>
                </div>

                {/* Detect Location Button */}
                <div className="mt-3">
                  <button
                    onClick={handleDetectLocation}
                    disabled={detectLoading}
                    className="w-full max-w-full box-border flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {detectLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t.detectLocationLoading || 'Detecting location...'}</>
                    ) : (
                      <><MapPin className="w-4 h-4" /> {t.detectLocation || 'Detect Location 📍'}</>
                    )}
                  </button>
                  {detectedCity && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg p-2">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {(t.detectLocationSuccess || 'Location detected: {city}').replace('{city}', detectedCity)}
                        {' · '}
                        {(t.timezoneDetected || 'Timezone: {timezone}').replace('{timezone}', Intl.DateTimeFormat().resolvedOptions().timeZone)}
                      </span>
                    </div>
                  )}
                  {detectError && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                      {detectError}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleSettingsSave}
                className="w-full max-w-full box-border px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-sm"
              >
                {settingsSaved ? `✓ ${t.settingsSaved}` : t.settingsSave}
              </button>
            </div>
          )}

          {/* Install Tab - Always available, never disabled */}
          {activeTab === 'install' && (
            <div className="text-center py-6">
              <div className={`w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                <Download className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{t.sidebarInstall}</h3>
              <p className="text-sm text-slate-500 mb-6">
                {lang === 'he'
                  ? 'הוסף את CalendAI למסך הבית שלך לגישה מהירה מכל מקום'
                  : 'Add CalendAI to your home screen for quick access from anywhere'}
              </p>

              {/* Already installed indicator */}
              {isStandalone() && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  <span>{t.pwaInstalled || (lang === 'he' ? 'האפליקציה כבר מותקנת במסך הבית שלך! ✅' : 'The app is already installed on your home screen! ✅')}</span>
                </div>
              )}

              {/* Install button - always clickable */}
              <button
                onClick={handleInstallClick}
                className={`w-full max-w-full box-border px-6 py-3 rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center gap-2 ${installBtn.style}`}
              >
                <InstallIcon className="w-5 h-5" />
                {installBtn.text}
              </button>

              {/* Browser detection info (subtle) */}
              <p className="text-[10px] text-slate-400 mt-3">
                {installPrompt
                  ? (lang === 'he' ? 'זוהה: דפדפן תומך התקנה' : 'Detected: install-capable browser')
                  : isIosSafari()
                    ? (lang === 'he' ? 'זוהה: Safari באייפון/אייפד' : 'Detected: Safari on iPhone/iPad')
                    : isIosNonSafari()
                      ? (lang === 'he' ? 'זוהה: דפדפן iOS שאינו Safari' : 'Detected: non-Safari iOS browser')
                      : isStandalone()
                        ? (lang === 'he' ? 'האפליקציה פועלת במסך הבית' : 'App is running from home screen')
                        : (lang === 'he' ? 'לחץ לקבלת הוראות התקנה ידניות' : 'Click for manual install instructions')}
              </p>
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

      {/* iOS Safari Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]" onClick={() => setShowIosGuide(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Download className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">{t.pwaIosSafariTitle || (lang === 'he' ? 'הוסף למסך הבית' : 'Add to Home Screen')}</h3>
              <p className="text-sm text-slate-500 mb-4">{t.pwaIosSafariDesc || (lang === 'he' ? 'בצע את השלבים הבאים כדי להוסיף את CalendAI למסך הבית:' : 'Follow these steps to add CalendAI to your home screen:')}</p>
              <div className="bg-slate-50 rounded-lg p-4 space-y-3 mb-4" style={{ textAlign: isRTL ? 'right' : 'left' }}>
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <span>{t.pwaIosSafariStep1 || (lang === 'he' ? 'לחץ על כפתור השיתוף ⎘ (מלבן עם חץ למעלה)' : 'Tap the share button ⎘ (square with arrow pointing up)')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <span>{t.pwaIosSafariStep2 || (lang === 'he' ? 'גלול מטה ובחר "הוסף למסך הבית" (Add to Home Screen)' : 'Scroll down and select "Add to Home Screen"')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <span>{t.pwaIosSafariStep3 || (lang === 'he' ? 'לחץ על "הוסף" (Add) בפינה העליונה' : 'Tap "Add" at the top right corner')}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setShowIosGuide(false)} className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-blue-700 transition">
              {t.cancel || (lang === 'he' ? 'הבנתי!' : 'Got it!')}
            </button>
          </div>
        </div>
      )}

      {/* iOS Non-Safari Message Modal */}
      {showIosNonSafariMsg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]" onClick={() => setShowIosNonSafariMsg(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <ExternalLink className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">{t.pwaIosNonSafariTitle || (lang === 'he' ? 'פתח ב-Safari' : 'Open in Safari')}</h3>
              <p className="text-sm text-slate-500 mb-6">{t.pwaIosNonSafariDesc || (lang === 'he' ? 'כדי להתקין באייפון, יש לפתוח את האתר בדפדפן Safari' : 'To install on iPhone, please open this site in Safari browser')}</p>
              <button
                onClick={() => {
                  const safariUrl = window.location.href;
                  window.location.href = safariUrl;
                }}
                className="w-full px-4 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition"
              >
                {t.pwaOpenInSafari || (lang === 'he' ? 'פתח ב-Safari' : 'Open in Safari')}
              </button>
              <button onClick={() => setShowIosNonSafariMsg(false)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition">
                {t.cancel || (lang === 'he' ? 'בטל' : 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}