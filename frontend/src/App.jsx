import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Calendar, Send, Clock, AlertCircle, LogIn, LogOut, User, Trash2, CalendarDays, Sparkles, Loader2, AlertTriangle, Wand2, X, MapPin, Shield, Filter, Moon, Edit3, Check, ChevronLeft, ChevronRight, Sun, Bell, BellRing, CalendarCheck, RotateCcw, Menu, Share2, Download, Eye, ExternalLink, Copy, Mail, Mic, MicOff, Home, Plus, Zap, ChevronDown, ChevronUp, FileText, Layout, Trophy, Image, Upload, Search } from "lucide-react";
import { staggerContainerVariants, staggerItemVariants } from "./hooks/useStaggeredAnimation";
import GlobalSearch from "./components/GlobalSearch";
import MonthlyCalendar from "./components/MonthlyCalendar";
import DayView from "./components/DayView";
import ViewNavigation from "./components/ViewNavigation";
import LocationSelector from "./components/LocationSelector";
import Privacy from "./components/Privacy";
import ErrorBoundary from "./components/ErrorBoundary";
import SidebarDrawer from "./components/SidebarDrawer";
import MeetingWizard from "./components/MeetingWizard";
import LuxuryLoader from "./components/LuxuryLoader";
import ManualEventForm from "./components/ManualEventForm";
import HistoryModal from "./components/HistoryModal";
import PublicGoals from "./components/PublicGoals";

// ── Lazy-loaded page chunks ──
const LandingPage = lazy(() => import("./components/LandingPage"));
const AuthSuccess = lazy(() => import("./pages/AuthSuccess"));
const GuestBookingView = lazy(() => import("./components/GuestBookingView"));
const Booking = lazy(() => import("./components/Booking"));
import PrivacyPolicyPage from "./pages/PrivacyPolicy";
import TermsPage from "./pages/Terms";
import translations from "./i18n";
import safeStorage from "./utils/safeStorage";
import { isIosWhatsApp, isIosSafari, isIosNonSafari, isStandalone } from "./utils/browserDetection";
import { normalizeCredits, normalizeUserCredits } from "./utils/credits";

// ── Module-level declarations (using var/function to avoid TDZ) ──
var API_BASE = import.meta.env.VITE_API_URL || "";

function RECURRENCE_OPTIONS(lang) {
  return [
    { value: "once", label: translations[lang].recurrenceOnce },
    { value: "daily", label: translations[lang].recurrenceDaily },
    { value: "weekly", label: translations[lang].recurrenceWeekly },
    { value: "monthly", label: translations[lang].recurrenceMonthly },
    { value: "yearly", label: translations[lang].recurrenceYearly }
  ];
}

function REMINDER_MINUTES_OPTIONS(lang) {
  return [
    { value: 0, label: translations[lang].reminderNone },
    { value: 5, label: translations[lang].reminder5min },
    { value: 15, label: translations[lang].reminder15min },
    { value: 30, label: translations[lang].reminder30min },
    { value: 60, label: translations[lang].reminder1hour }
  ];
}

var LOCATION_LABELS = {
  jerusalem: "Jerusalem",
  newyork: "New York",
  london: "London",
  losangeles: "Los Angeles"
};

// ── Guest Usage Limit Constants ──
var GUEST_MAX_ACTIONS = 10;
var GUEST_COUNT_KEY = 'calendai-guest-usage-count';
var GUEST_DATA_KEY = 'calendai-guest-temp-data';

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    // Audio not supported
  }
}

function getInitialIntent() {
  if (typeof window === 'undefined') return { isAuthCallback: false, authFailed: false, wantsBooking: false };
  const params = new URLSearchParams(window.location.search);
  return {
    hasToken: !!params.get('token'),
    isAuthCallback: params.get('login') === 'success' || params.get('auth') === 'success',
    authFailed: params.get('auth') === 'failed',
    wantsBooking: params.get('book') === 'true' || params.get('book') === '1',
  };
}

// ── JWT Token Management (local helpers for email auth) ──
function setJwtToken(token) {
  try { safeStorage.setItem('token', token); safeStorage.setItem('calendai-jwt', token); } catch (e) {}
}

// ── Language configuration ──
const LANGUAGE_CYCLE = ['he', 'en', 'fr', 'es'];
const LANGUAGE_NEXT_LABELS = {
  he: '🌐 EN',
  en: '🌐 FR',
  fr: '🌐 ES',
  es: '🌐 HE'
};

// ── Timezone options ──
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jerusalem', label: 'Jerusalem (UTC+2/UTC+3)' },
  { value: 'America/New_York', label: 'New York (UTC-5/UTC-4)' },
  { value: 'America/Chicago', label: 'Chicago (UTC-6/UTC-5)' },
  { value: 'America/Denver', label: 'Denver (UTC-7/UTC-6)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8/UTC-7)' },
  { value: 'Europe/London', label: 'London (UTC+0/UTC+1)' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1/UTC+2)' },
  { value: 'Europe/Berlin', label: 'Berlin (UTC+1/UTC+2)' },
  { value: 'Europe/Madrid', label: 'Madrid (UTC+1/UTC+2)' },
  { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (UTC+8)' },
  { value: 'Australia/Sydney', label: 'Sydney (UTC+10/UTC+11)' },
  { value: 'Pacific/Auckland', label: 'Auckland (UTC+12/UTC+13)' },
];

// ── Inner component that runs INSIDE BrowserRouter + AuthProvider ──
function AppRoutes() {
  // Language state - load from localStorage or default to 'he'
  const [lang, setLang] = useState(() => {
    try {
      const saved = safeStorage.getItem('calendai-lang');
      if (saved && LANGUAGE_CYCLE.includes(saved)) return saved;
      return 'he';
    } catch { return 'he'; }
  });
  const t = translations[lang] || translations['he'];

  // Timezone state
  const [selectedTimezone, setSelectedTimezone] = useState(() => {
    try {
      return safeStorage.getItem('calendai-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem';
    } catch { return 'Asia/Jerusalem'; }
  });

  const [showPrivacy, setShowPrivacy] = useState(false);
  const [inputText, setInputText] = useState("");
  // recurrence and eventType are now determined by the AI from natural language text
  // Manual dropdowns have been removed — the AI parses schedules and frequencies intelligently.
  const DEFAULT_RECURRENCE = 'weekly';
  const DEFAULT_EVENT_TYPE = 'activity';
  const DEFAULT_DURATION = 60;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [conflicts, setConflicts] = useState([]);

  // Voice-to-Text State
  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(() => {
    try {
      return typeof window !== 'undefined' && (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);
    } catch { return false; }
  });
  const recognitionRef = useRef(null);
  const inputTextRef = useRef("");
  inputTextRef.current = inputText;

  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [reschedulePreview, setReschedulePreview] = useState(null);
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleStep, setRescheduleStep] = useState("choose");
  const [rescheduleDelay, setRescheduleDelay] = useState(null);
  const [gapsResult, setGapsResult] = useState(null);
  const [rescheduleMode, setRescheduleMode] = useState(null);
  const [selectedGaps, setSelectedGaps] = useState([]);
  const [rescheduleCustomText, setRescheduleCustomText] = useState("");
  const [rescheduleCustomLoading, setRescheduleCustomLoading] = useState(false);
  const [rescheduleQuickAction, setRescheduleQuickAction] = useState(null);
  const [rescheduleQuickActionLoading, setRescheduleQuickActionLoading] = useState(false);

  const [isFreeSlotsOpen, setIsFreeSlotsOpen] = useState(false);
  const [freeSlotsData, setFreeSlotsData] = useState(null);
  const [freeSlotsLoading, setFreeSlotsLoading] = useState(false);
  const [freeSlotsError, setFreeSlotsError] = useState("");
  const [freeSlotsDay, setFreeSlotsDay] = useState("Today");

  const [editModalData, setEditModalData] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState("jerusalem");
  const [locationFilter, setLocationFilter] = useState("all");
  const { user, isPro, isAuthenticated, authLoading, authStatus, handleLogin, handleLogout, setUser, setIsPro } = useAuth();

  const handleMicrosoftLogin = useCallback(() => {
    window.location.href = `${API_BASE}/api/auth/microsoft`;
  }, []);

  // Smart Auth: show login prompt for save operations
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const intentRef = useRef(getInitialIntent());

  // ── View State ──
  const [currentView, setCurrentView] = useState(() => {
    if (intentRef.current.wantsBooking) return 'booking';
    try {
      const isLoggedIn = localStorage.getItem('calendai-isLoggedIn') === 'true' || !!localStorage.getItem('calendai-jwt') || !!localStorage.getItem('token');
      return isLoggedIn ? 'dashboard' : 'landing';
    } catch { return 'landing'; }
  });
  const [guestBookingId, setGuestBookingId] = useState(() => {
    const pathMatch = typeof window !== 'undefined' ? window.location.pathname.match(/^\/book\/(.+)$/) : null;
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }
    const params = new URLSearchParams(window.location.search);
    const bookParam = params.get('book');
    if (bookParam && bookParam !== 'true' && bookParam !== '1') {
      return bookParam;
    }
    return null;
  });

  useEffect(() => {
    if (isAuthenticated) {
      setCurrentView('dashboard');
    }
  }, [isAuthenticated]);

  const [schedule, setSchedule] = useState({
    Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
    Thursday: [], Friday: [], Saturday: [], Today: []
  });
  const scheduleHistoryRef = useRef([]);
  const [actionHistoryCount, setActionHistoryCount] = useState(0);

  const [expandedDays, setExpandedDays] = useState({});
  const [dayDetailModal, setDayDetailModal] = useState(null);
  
  // ── Calendar View State (day / weekly / monthly / yearly / 100year) ──
  const [calendarView, setCalendarView] = useState('day');
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, 1 = tomorrow, -1 = yesterday

  function getInitialNotificationPerm() {
    try {
      if (typeof Notification !== 'undefined') return Notification.permission;
    } catch (e) {}
    return 'denied';
  }
  const [notificationPerm, setNotificationPerm] = useState(getInitialNotificationPerm);
  const [toasts, setToasts] = useState([]);
  const notifiedRemindersRef = useRef(new Set());

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [guestUsageCount, setGuestUsageCount] = useState(() => {
    try {
      return parseInt(safeStorage.getItem(GUEST_COUNT_KEY) || '0', 10);
    } catch { return 0; }
  });
  const [showGuestLimitModal, setShowGuestLimitModal] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditsError, setCreditsError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // ── Advanced Options Toggle ──
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Bottom Nav Active Tab ──
  const [activeTab, setActiveTab] = useState('home');

  const handleBuyCredits = useCallback(async () => {
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }
    setCheckoutLoading(true);
    setError("");
    try {
      const token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
      const res = await fetch(`${API_BASE}/api/payments/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ lang }),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || lang === 'he' ? 'שגיאה ביצירת דף התשלום.' : 'Failed to create checkout session.');
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Invalid response from server.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.message);
      setCheckoutLoading(false);
    }
  }, [user, lang, setShowLoginPrompt, setError]);

  const [showWizard, setShowWizard] = useState(false);
  const [showManualEvent, setShowManualEvent] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPublicGoals, setShowPublicGoals] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  const [installPrompt, setInstallPrompt] = useState(null);
  const [showPwaPopup, setShowPwaPopup] = useState(false);
  const [pwaDismissed, setPwaDismissed] = useState(() => {
    try { return safeStorage.getItem('calendai-pwa-dismissed') === 'true'; } catch { return false; }
  });

  const [showPwaBanner, setShowPwaBanner] = useState(false);
  const [pwaBannerDismissed, setPwaBannerDismissed] = useState(() => {
    try { return safeStorage.getItem('calendai-pwa-banner-dismissed') === 'true'; } catch { return false; }
  });

  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  const [profileLocation, setProfileLocation] = useState(() => {
    try { return safeStorage.getItem('calendai-profile-location') || 'none'; } catch { return 'none'; }
  });

  const bookingLink = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?book=1` : '';

  const incrementGuestUsage = useCallback(() => {
    setGuestUsageCount(prev => {
      const next = prev + 1;
      safeStorage.setItem(GUEST_COUNT_KEY, String(next));
      return next;
    });
  }, []);

  const saveGuestTempData = useCallback((actionType, data) => {
    try {
      const existing = JSON.parse(safeStorage.getItem(GUEST_DATA_KEY) || '[]');
      existing.push({ type: actionType, data, timestamp: Date.now() });
      safeStorage.setItem(GUEST_DATA_KEY, JSON.stringify(existing));
    } catch (e) {}
  }, []);

  const checkGuestActionLimit = useCallback(() => {
    if (user) return true;
    if (guestUsageCount < GUEST_MAX_ACTIONS) return true;
    setShowGuestLimitModal(true);
    return false;
  }, [user, guestUsageCount]);

  const syncGuestDataToBackend = useCallback(async () => {
    try {
      const raw = safeStorage.getItem(GUEST_DATA_KEY);
      if (!raw) return;
      const guestData = JSON.parse(raw);
      if (!Array.isArray(guestData) || guestData.length === 0) return;
      for (const entry of guestData) {
        if (entry.type === 'parse' && entry.data?.text) {
          await fetch(`${API_BASE}/api/parse-schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: entry.data.text,
              recurrence: entry.data.recurrence || 'weekly',
              location: entry.data.location || 'jerusalem'
            }),
            credentials: "include"
          });
        }
      }
      safeStorage.removeItem(GUEST_DATA_KEY);
      safeStorage.removeItem(GUEST_COUNT_KEY);
      setGuestUsageCount(0);
    } catch (e) {
      console.error('Failed to sync guest data:', e);
    }
  }, []);

  const handleShareApp = useCallback(async () => {
    const shareUrl = 'https://calendai-backend-dfmi.onrender.com/';
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CalendAI',
          text: t.shareAppDesc || 'CalendAI - העוזר החכם שלך לניהול הזמן',
          url: shareUrl,
        });
      } catch (e) {
        if (e.name !== 'AbortError') {
          copyToClipboardFallback(shareUrl);
        }
      }
    } else {
      copyToClipboardFallback(shareUrl);
    }
  }, []);

  function copyToClipboardFallback(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setSuccess(t.shareLinkCopied || 'הקישור הועתק!');
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setSuccess(t.shareLinkCopied || 'הקישור הועתק!');
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setSuccess(t.shareLinkCopied || 'הקישור הועתק!');
    }
  }

  // ── Shabbat Mode ──
  const [shabbatTimes, setShabbatTimes] = useState(null);
  const [shabbatFetchError, setShabbatFetchError] = useState(false);

  const fetchShabbatTimes = useCallback(async () => {
    try {
      const res = await fetch('https://www.hebcal.com/shabbat?cfg=json&geonameid=293397&m=50');
      if (!res.ok) throw new Error('Failed to fetch Shabbat times');
      const data = await res.json();
      let candlesTime = null;
      let havdalahTime = null;
      for (const item of data.items) {
        if (item.category === 'candles' && !candlesTime) {
          candlesTime = new Date(item.date);
        }
        if (item.category === 'havdalah' && !havdalahTime) {
          havdalahTime = new Date(item.date);
        }
      }
      if (candlesTime && havdalahTime) {
        setShabbatTimes({ candles: candlesTime, havdalah: havdalahTime });
        setShabbatFetchError(false);
      } else {
        throw new Error('Could not find candles/havdalah times');
      }
    } catch (e) {
      console.error('Hebcal API error:', e);
      setShabbatFetchError(true);
    }
  }, []);

  useEffect(() => {
    fetchShabbatTimes();
    const interval = setInterval(fetchShabbatTimes, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchShabbatTimes]);

  const isShabbatNow = useCallback(() => {
    if (!shabbatTimes || !shabbatTimes.candles || !shabbatTimes.havdalah) {
      const now = new Date();
      const day = now.getDay();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const totalMinutes = hours * 60 + minutes;
      if (day === 5 && totalMinutes >= 960) return true;
      if (day === 6 && totalMinutes < 1200) return true;
      return false;
    }
    const now = new Date();
    return now >= shabbatTimes.candles && now < shabbatTimes.havdalah;
  }, [shabbatTimes]);

  const isTimeInShabbat = useCallback((date) => {
    if (!shabbatTimes || !shabbatTimes.candles || !shabbatTimes.havdalah) {
      const day = date.getDay();
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const totalMinutes = hours * 60 + minutes;
      if (day === 5 && totalMinutes >= 960) return true;
      if (day === 6 && totalMinutes < 1200) return true;
      return false;
    }
    return date >= shabbatTimes.candles && date < shabbatTimes.havdalah;
  }, [shabbatTimes]);

  const [showShabbatOverlay, setShowShabbatOverlay] = useState(() => isShabbatNow());

  useEffect(() => {
    const checkShabbat = () => {
      setShowShabbatOverlay(isShabbatNow());
    };
    checkShabbat();
    const interval = setInterval(checkShabbat, 60000);
    return () => clearInterval(interval);
  }, [isShabbatNow]);

  const handleParseOriginalRef = useRef(null);

  const handleLoginRequired = useCallback((action) => {
    if (!user) {
      setPendingAction(action);
      setShowLoginPrompt(true);
      return true;
    }
    return false;
  }, [user]);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!isStandalone() && !pwaDismissed) {
        setShowPwaPopup(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [pwaDismissed]);

  useEffect(() => {
    if (!isStandalone() && !pwaDismissed && !installPrompt) {
      const timer = setTimeout(() => {
        setShowPwaPopup(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pwaDismissed, installPrompt]);

  useEffect(() => {
    if (isStandalone()) {
      setShowPwaPopup(false);
    }
  }, []);

  useEffect(() => {
    if (!isStandalone() && !pwaBannerDismissed) {
      const timer = setTimeout(() => {
        setShowPwaBanner(true);
      }, 60000);
      return () => clearTimeout(timer);
    }
  }, [pwaBannerDismissed]);

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstallPrompt(null);
        setShowPwaPopup(false);
        setShowPwaBanner(false);
      }
    }
  };

  const handleDismissPwa = () => {
    setShowPwaPopup(false);
    setPwaDismissed(true);
    safeStorage.setItem('calendai-pwa-dismissed', 'true');
  };

  const handleDismissPwaBanner = () => {
    setShowPwaBanner(false);
    setPwaBannerDismissed(true);
    safeStorage.setItem('calendai-pwa-banner-dismissed', 'true');
  };

  const handleCopyShareLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(bookingLink).then(() => {
        setShareLinkCopied(true);
        setTimeout(() => setShareLinkCopied(false), 2500);
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = bookingLink;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setShareLinkCopied(true);
        setTimeout(() => setShareLinkCopied(false), 2500);
      });
    }
  };

  const handlePreviewLink = () => {
    window.open(bookingLink, '_blank');
  };

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/schedule`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.schedule) setSchedule(data.schedule);
      }
    } catch (err) {
      console.error("Failed to fetch schedule:", err);
    }
  }, []);

  const refreshUserCredits = useCallback(async () => {
    if (!user) return;
    try {
      const token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
      const res = await fetch(`${API_BASE}/api/auth/me?t=${Date.now()}`, {
        credentials: "include",
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          const normalizedUser = normalizeUserCredits(data.user);
          setUser(normalizedUser);
          try { safeStorage.setItem('calendai-user', JSON.stringify(normalizedUser)); } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("Failed to refresh user credits:", e);
    }
  }, [user, setUser]);

  const saveScheduleState = useCallback(() => {
    scheduleHistoryRef.current.push(JSON.parse(JSON.stringify(schedule)));
    setActionHistoryCount(prev => prev + 1);
  }, [schedule]);

  useEffect(() => {
    let pingInterval;
    const startPing = () => {
      pingInterval = setInterval(() => {
        fetch(`${API_BASE}/api/health`, { method: 'GET', cache: 'no-store' })
          .catch(() => {});
      }, 5 * 60 * 1000);
    };
    const stopPing = () => {
      if (pingInterval) clearInterval(pingInterval);
    };
    startPing();
    const handleVisibility = () => {
      if (document.hidden) {
        stopPing();
      } else {
        startPing();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopPing();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleBookingConfirm = useCallback(async (bookingData) => {
    if (handleLoginRequired('booking')) return;
    if (!checkGuestActionLimit()) return;
    saveScheduleState();
    const { day, slots, guestName, duration } = bookingData;
    try {
      let firstSlotTime = '';
      for (const slot of slots) {
        const totalStartMinutes = slot.hour * 60 + slot.minute;
        const totalEndMinutes = totalStartMinutes + duration;
        const endHour24 = Math.floor(totalEndMinutes / 60) % 24;
        const endMin = totalEndMinutes % 60;
        const startH12 = slot.hour % 12 || 12;
        const startAmpm = slot.hour >= 12 ? 'PM' : 'AM';
        const endH12 = endHour24 % 12 || 12;
        const endAmpm = endHour24 >= 12 ? 'PM' : 'AM';
        const startTime = `${String(startH12).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')} ${startAmpm}`;
        const endTime = `${String(endH12).padStart(2, '0')}:${String(endMin).padStart(2, '0')} ${endAmpm}`;
        if (!firstSlotTime) firstSlotTime = startTime;
        if (user) {
          const res = await fetch(`${API_BASE}/api/schedule/add-to-free-slot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              day: day,
              startTime,
              endTime,
              title: `פגישה עם ${guestName}`,
              recurrence: 'once',
              location: selectedLocation
            }),
            credentials: "include"
          });
          if (!res.ok) throw new Error('Failed to book slot');
        } else {
          setSchedule(prev => {
            const updated = { ...prev };
            const dayEvents = updated[day] || [];
            updated[day] = [...dayEvents, {
              title: `פגישה עם ${guestName}`,
              startTime,
              endTime,
              recurrence: 'once',
              location: selectedLocation
            }];
            return updated;
          });
        }
      }
      if (user) {
        await fetchSchedule();
      }
      setSuccess(t.bookingConfirmation);
      if (!user) {
        incrementGuestUsage();
        saveGuestTempData('booking', { day, slots, guestName, duration, location: selectedLocation });
      }
      const toastId = Date.now();
      const meetingTime = firstSlotTime || '';
      const toastMessage = t.bookingToastMessage
        .replace('{guestName}', guestName || '')
        .replace('{meetingTime}', meetingTime);
      setToasts(prev => [...prev, {
        id: toastId,
        title: t.bookingToastTitle,
        message: toastMessage
      }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, 8000);
    } catch (err) {
      setError(err.message);
    }
  }, [schedule, selectedLocation, fetchSchedule, t, handleLoginRequired, checkGuestActionLimit, user, incrementGuestUsage, saveGuestTempData]);

  const toggleLanguage = () => {
    const currentIndex = LANGUAGE_CYCLE.indexOf(lang);
    const nextIndex = (currentIndex + 1) % LANGUAGE_CYCLE.length;
    const newLang = LANGUAGE_CYCLE[nextIndex];
    setLang(newLang);
    safeStorage.setItem('calendai-lang', newLang);
  };

  const handleTimezoneChange = (newTimezone) => {
    setSelectedTimezone(newTimezone);
    safeStorage.setItem('calendai-timezone', newTimezone);
  };

  const requestNotificationPermission = useCallback(async () => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        setNotificationPerm(perm);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => requestNotificationPermission(), 3000);
    return () => clearTimeout(timer);
  }, [requestNotificationPermission]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = dayNames[now.getDay()];
      const todayEvents = [
        ...(schedule['Today'] || []),
        ...(schedule[todayName] || [])
      ];
      for (const event of todayEvents) {
        const reminderMin = event.reminderMinutesBefore;
        if (!reminderMin || reminderMin <= 0) continue;
        const timeMatch = event.startTime?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!timeMatch) continue;
        let eventHour = parseInt(timeMatch[1], 10);
        const eventMin = parseInt(timeMatch[2], 10);
        const isPM = timeMatch[3].toUpperCase() === 'PM';
        if (isPM && eventHour !== 12) eventHour += 12;
        if (!isPM && eventHour === 12) eventHour = 0;
        const eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eventHour, eventMin, 0);
        const alertTime = new Date(eventDate.getTime() - reminderMin * 60000);
        const timeDiff = now.getTime() - alertTime.getTime();
        if (timeDiff >= 0 && timeDiff < 31000) {
          const reminderKey = `${event.title}_${todayName}_${reminderMin}_${event.startTime}`;
          if (!notifiedRemindersRef.current.has(reminderKey)) {
            notifiedRemindersRef.current.add(reminderKey);
            if (notificationPerm === "granted") {
              try {
                new Notification(t.reminderTitle, {
                  body: `📅 ${event.title} ${t.reminderStartsIn} ${reminderMin} ${t.reminderMinutes}`,
                  icon: "/icon.svg"
                });
              } catch (e) {}
            }
            playNotificationSound();
            const toastId = Date.now();
            setToasts(prev => [...prev, {
              id: toastId,
              title: event.title,
              message: `${t.reminderStartsIn} ${reminderMin} ${t.reminderMinutes} (${event.startTime})`
            }]);
            setTimeout(() => {
              setToasts(prev => prev.filter(t => t.id !== toastId));
            }, 8000);
          }
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [schedule, notificationPerm, lang]);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const PLACEHOLDER_EXAMPLES = t.placeholderExamples;
  const displayedPlaceholders = [...PLACEHOLDER_EXAMPLES, PLACEHOLDER_EXAMPLES[0], PLACEHOLDER_EXAMPLES[1]];

  useEffect(() => {
    const id = setInterval(() => {
      setIsTransitioning(true);
      setPlaceholderIndex(prev => prev + 1);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (placeholderIndex >= PLACEHOLDER_EXAMPLES.length) {
      const id = setTimeout(() => {
        setIsTransitioning(false);
        setPlaceholderIndex(0);
      }, 500);
      return () => clearTimeout(id);
    }
  }, [placeholderIndex, PLACEHOLDER_EXAMPLES.length]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const handleToggleListening = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setIsListening(false);
      return;
    }
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = lang === 'he' ? 'he-IL' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => { setIsListening(true); };
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const currentText = inputTextRef.current;
        const newText = currentText ? `${currentText} ${transcript}` : transcript;
        setInputText(newText);
      };
      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };
      recognition.onend = () => { setIsListening(false); };
      recognition.start();
    } catch (e) {
      console.warn('Speech recognition failed:', e);
      setIsListening(false);
    }
  }, [isListening, lang]);

  const handleUndo = async () => {
    if (scheduleHistoryRef.current.length === 0) return;
    const previousSchedule = scheduleHistoryRef.current.pop();
    setActionHistoryCount(prev => prev - 1);
    setSchedule(previousSchedule);
    try {
      await fetch(`${API_BASE}/api/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: previousSchedule }),
        credentials: "include"
      });
      const toastId = Date.now();
      setToasts(prev => [...prev, {
        id: toastId,
        title: t.undoToast || 'Undo successful',
        message: ''
      }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, 4000);
    } catch (err) {
      console.error("Undo sync failed:", err);
    }
  };

  const handleSlotClick = (day, slot) => {
    const [hour, minute] = slot.split(':').map(Number);
    const hour12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const nextHour = (hour + 1) % 24;
    const nextHour12 = nextHour % 12 || 12;
    const nextAmpm = nextHour >= 12 ? 'PM' : 'AM';
    setInputText(`${t.slotClickPrefix} ${day} ${t.slotClickFrom}${String(hour12).padStart(2,'0')}:${String(minute).padStart(2,'0')} ${ampm} ${t.slotClickUntil} ${String(nextHour12).padStart(2,'0')}:${String(minute).padStart(2,'0')} ${nextAmpm} `);
    const ta = document.querySelector('textarea');
    if (ta) ta.focus();
  };

  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState(null);
  const [imageParsing, setImageParsing] = useState(false);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSelectedImagePreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setSelectedImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleParseImage = async () => {
    if (!selectedImage) return;
    if (showShabbatOverlay) {
      setError(t.shabbatBlockError || 'לא ניתן לתזמן פעילויות בשבת. נחזור לפעילות בצאת השבת.');
      return;
    }
    if (handleLoginRequired('parse')) return;
    if (!checkGuestActionLimit()) return;
    saveScheduleState();
    setImageParsing(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append('image', selectedImage);
      const token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
      const res = await fetch(`${API_BASE}/api/parse-image`, {
        method: "POST",
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error) throw new Error(data.error);
        else throw new Error(t.failedRequest + " " + res.status);
      }
      setSuccess(data.replyMessage || `${t.successAdded} ${data.count || 0} ${t.successEvents}`);
      setSelectedImage(null);
      setSelectedImagePreview(null);
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (data.aiCredits !== undefined) {
        setUser(prev => prev ? { ...prev, aiCredits: data.aiCredits } : prev);
      }
      await fetchSchedule();
    } catch (err) {
      setError(err.message);
    } finally {
      setImageParsing(false);
    }
  };

  const imageInputRef = useRef(null);

  const handleParse = async () => {
    if (!inputText.trim()) return;
    if (showShabbatOverlay) {
      setError(t.shabbatBlockError || 'לא ניתן לתזמן פעילויות בשבת. נחזור לפעילות בצאת השבת.');
      return;
    }
    if (handleLoginRequired('parse')) return;
    if (!checkGuestActionLimit()) return;
    saveScheduleState();
    // Clear input immediately and reset button state for responsive UX
    setInputText("");
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API_BASE}/api/parse-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, recurrence: DEFAULT_RECURRENCE, location: selectedLocation, eventType: DEFAULT_EVENT_TYPE, duration: DEFAULT_DURATION }),
        credentials: "include"
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.isBlocked === true) {
          setError(errorData.blockedMessage || errorData.replyMessage || t.shabbatBlockError);
          setInputText("");
          return;
        }
        if (res.status === 409 && errorData.hasConflict === true) {
          setError(errorData.conflictMessage || errorData.replyMessage || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?');
          return;
        }
        if (res.status === 402) {
          setCreditsError(errorData.error || 'נגמרו לך הקרדיטים! אנא רכוש חבילת פעולות נוספת כדי להמשיך להשתמש ב-AI.');
          setShowCreditsModal(true);
          return;
        }
        throw new Error(t.failedRequest + " " + res.status);
      }
      const data = await res.json();
      if (user && data.events?.length > 0) {
        const token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
        await Promise.allSettled(data.events.map(ev =>
          fetch(`${API_BASE}/api/add-to-google-calendar`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ event: ev }),
            credentials: "include"
          })
        ));
      }
      if (data.conflicts?.length > 0) setConflicts(data.conflicts);
      else setConflicts([]);
      if (data.aiCredits !== undefined && data.aiCredits !== null) {
        const normalizedCredits = normalizeCredits(data.aiCredits);
        setUser(prev => prev ? { ...prev, aiCredits: normalizedCredits } : prev);
        try {
          const stored = JSON.parse(safeStorage.getItem('calendai-user') || 'null');
          if (stored) {
            stored.aiCredits = normalizedCredits;
            safeStorage.setItem('calendai-user', JSON.stringify(stored));
          }
        } catch (e) {}
      } else {
        refreshUserCredits();
      }
      await fetchSchedule();
      setSuccess(data.replyMessage || `${t.successAdded} ${data.events?.length || 0} ${t.successEvents}`);
      setInputText("");
      if (!user) {
        incrementGuestUsage();
        saveGuestTempData('parse', { text: inputText, recurrence: DEFAULT_RECURRENCE, location: selectedLocation });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTryGuest = () => {
    setCurrentView('dashboard');
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleRemoveEvent = async (day, index) => {
    saveScheduleState();
    try {
      await fetch(`${API_BASE}/api/schedule/event`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, index }),
        credentials: "include"
      });
      setSchedule(prev => {
        const u = { ...prev };
        if (u[day]) u[day] = u[day].filter((_, i) => i !== index);
        return u;
      });
    } catch (err) { console.error(err); }
  };

  const handleOpenReschedule = () => {
    setIsRescheduleOpen(true);
    setReschedulePreview(null);
    setRescheduleError("");
    setRescheduleStep("choose");
    setRescheduleDelay(null);
    setGapsResult(null);
    setRescheduleMode(null);
    setSelectedGaps([]);
  };

  const handleDelaySelected = async (delayMinutes) => {
    setRescheduleDelay(delayMinutes);
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const gapsRes = await fetch(`${API_BASE}/api/reschedule/gaps`, { credentials: "include" });
      const gapsData = await gapsRes.json();
      setGapsResult(gapsData);
      setRescheduleStep("choose");
    } catch (err) { setRescheduleError(err.message); }
    finally { setRescheduleLoading(false); }
  };

  const handleMergeGaps = async () => {
    setRescheduleMode("merge");
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const res = await fetch(`${API_BASE}/api/reschedule/merge-gaps`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");
      setReschedulePreview(data);
      setRescheduleStep("preview");
    } catch (err) { setRescheduleError(err.message); }
    finally { setRescheduleLoading(false); }
  };

  const handleShiftEvents = async () => {
    setRescheduleMode("shift");
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const res = await fetch(`${API_BASE}/api/reschedule/shift`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delayMinutes: rescheduleDelay }), credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Shift failed");
      setReschedulePreview(data);
      setRescheduleStep("preview");
    } catch (err) { setRescheduleError(err.message); }
    finally { setRescheduleLoading(false); }
  };

  const handleReschedule = async (reason) => {
    setRescheduleLoading(true);
    setRescheduleError("");
    try {
      const res = await fetch(`${API_BASE}/api/reschedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }), credentials: "include"
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "AI failed"); }
      const data = await res.json();
      setReschedulePreview(data);
      setRescheduleStep("preview");
    } catch (err) { setRescheduleError(err.message); }
    finally { setRescheduleLoading(false); }
  };

  const handleConfirmReschedule = () => {
    if (reschedulePreview?.newSchedule) {
      saveScheduleState();
      setSchedule(reschedulePreview.newSchedule);
      setSuccess(reschedulePreview.summary || t.eventUpdated);
      setIsRescheduleOpen(false);
      setReschedulePreview(null);
    }
  };

  const handleOpenFreeSlots = (day) => {
    handleFindFreeSlots(day, 30);
  };

  const handleFindFreeSlots = async (day, durationMinutes) => {
    setFreeSlotsLoading(true);
    setFreeSlotsError("");
    setFreeSlotsData(null);
    setIsFreeSlotsOpen(true);
    try {
      const dayMapEn = { 'Sunday': 'Sunday', 'Monday': 'Monday', 'Tuesday': 'Tuesday', 'Wednesday': 'Wednesday', 'Thursday': 'Thursday', 'Friday': 'Friday', 'Saturday': 'Saturday' };
      const dayMapHe = { 'ראשון': 'Sunday', 'שני': 'Monday', 'שלישי': 'Tuesday', 'רביעי': 'Wednesday', 'חמישי': 'Thursday', 'שישי': 'Friday', 'שבת': 'Saturday', 'היום': 'Today' };
      const actualDay = dayMapEn[day] || dayMapHe[day] || day || 'Today';
      const res = await fetch(`${API_BASE}/api/schedule/free-slots?day=${actualDay}&duration=${durationMinutes}&location=${selectedLocation}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setFreeSlotsData(data);
    } catch (err) { setFreeSlotsError(err.message); }
    finally { setFreeSlotsLoading(false); }
  };

  const handleSelectFreeSlot = async (slot, title) => {
    if (!title) { setFreeSlotsError(t.freeSlotPrompt.replace(':', '')); return; }
    saveScheduleState();
    setFreeSlotsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/schedule/add-to-free-slot`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: freeSlotsData.day, startTime: slot.startTime, endTime: slot.endTime, title, recurrence: DEFAULT_RECURRENCE, location: selectedLocation }),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchSchedule();
      setIsFreeSlotsOpen(false);
      setFreeSlotsData(null);
      setSuccess(`${t.freeSlotAdded} "${title}" ${t.slotClickPrefix} ${slot.startTime}-${slot.endTime}`);
    } catch (err) { setFreeSlotsError(err.message); }
    finally { setFreeSlotsLoading(false); }
  };

  const handleOpenEditModal = (day, index) => {
    const event = schedule[day]?.[index];
    if (!event) return;
    setEditModalData({ day, index, event: { ...event, reminderMinutesBefore: event.reminderMinutesBefore || 0 } });
  };

  const handleEditEvent = async () => {
    if (!editModalData) return;
    saveScheduleState();
    setEditLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/schedule/event`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: editModalData.day, index: editModalData.index, updates: editModalData.event }),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchSchedule();
      setEditModalData(null);
      setSuccess(t.eventUpdated);
    } catch (err) { setError(err.message); }
    finally { setEditLoading(false); }
  };

  const handleEditInputChange = (field, value) => {
    setEditModalData(prev => ({ ...prev, event: { ...prev.event, [field]: value } }));
  };

  const handlePwaBannerInstall = () => {
    if (installPrompt) {
      handleInstallClick();
    } else if (isIosSafari()) {
      setShowPwaBanner(false);
      setShowPwaPopup(true);
    } else if (isIosNonSafari()) {
      setShowPwaBanner(false);
      setShowPwaPopup(true);
    }
  };

  const recurrenceLabels = {
    once: t.recurrenceOnce,
    daily: t.recurrenceDaily,
    weekly: t.recurrenceWeekly,
    monthly: t.recurrenceMonthly,
    yearly: t.recurrenceYearly,
    forever: t.recurrenceForever
  };
  const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayNamesLocalized = [t.daySunday, t.dayMonday, t.dayTuesday, t.dayWednesday, t.dayThursday, t.dayFriday, t.daySaturday];
  const todayName = (dayNamesEn && dayNamesEn[new Date().getDay()]) || 'Sunday';
  const todayNameLocalized = (dayNamesLocalized && dayNamesLocalized[new Date().getDay()]) || '';

  const dayTranslations = {
    Sunday: t.daySunday, Monday: t.dayMonday, Tuesday: t.dayTuesday, Wednesday: t.dayWednesday,
    Thursday: t.dayThursday, Friday: t.dayFriday, Saturday: t.daySaturday, Today: `${t.dayToday} (${todayNameLocalized})`
  };

  const orderedDayKeys = ['Today', ...dayNamesEn];

  const allLocationsInEvents = [...new Set(Object.values(schedule).flat().map(e => e.location).filter(Boolean))];

  const timeToSortMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return 0;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const getSortedDayEvents = (dayKey) => {
    const dayEvents = getFilteredEvents(dayKey);
    return [...dayEvents].sort((a, b) => {
      const aMin = timeToSortMinutes(a.startTime);
      const bMin = timeToSortMinutes(b.startTime);
      return aMin - bMin;
    });
  };

  const getFilteredEvents = (dayKey) => {
    const dayEvents = schedule[dayKey] || [];
    if (locationFilter === "all") return dayEvents;
    return dayEvents.filter(e => e.location === locationFilter);
  };

  const toggleDayExpanded = (dayKey) => {
    setExpandedDays(prev => ({
      ...prev,
      [dayKey]: !prev[dayKey]
    }));
  };

  const openDayDetail = (dayKey) => {
    setDayDetailModal({
      dayKey,
      dayLabel: dayTranslations[dayKey] || dayKey,
      events: getSortedDayEvents(dayKey)
    });
  };

  if (typeof window !== 'undefined' && window.location.pathname === '/privacy') {
    return <PrivacyPolicyPage />;
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/terms') {
    return <TermsPage />;
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/auth/success') {
    return <AuthSuccess />;
  }

  console.log('🔄 [App render] authLoading:', authLoading, 'isAuthenticated:', isAuthenticated, 'currentView:', currentView, 'authStatus:', authStatus);
  // Loading guard: show loader while auth is being checked.
  // Checks BOTH safeStorage and localStorage directly for the token.
  // This prevents the landing page from flashing while the OAuth callback
  // token is being saved to storage by AuthContext.
  if (authLoading && !user && !safeStorage.getItem('token') && !safeStorage.getItem('calendai-jwt') && !localStorage.getItem('token') && !localStorage.getItem('calendai-jwt')) {
    return <LuxuryLoader statusText={t.parsing || 'AUTHENTICATING...'} />;
  }

  if (guestBookingId) {
    return (
      <GuestBookingView
        bookingId={guestBookingId}
        lang={lang}
        t={t}
        onClose={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setGuestBookingId(null);
          setCurrentView('dashboard');
        }}
      />
    );
  }

  if (showPrivacy) return <Privacy onBack={() => setShowPrivacy(false)} />;

  if (currentView === 'landing' && !isAuthenticated) {
    return (
      <LandingPage
        t={t}
        lang={lang}
        onLogin={() => handleLogin(lang)}
        onMicrosoftLogin={handleMicrosoftLogin}
        onTryGuest={handleTryGuest}
        toggleLanguage={toggleLanguage}
      />
    );
  }

  if (currentView === 'booking') {
    return (
      <Booking
        schedule={schedule}
        lang={lang}
        t={t}
        onClose={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setCurrentView('dashboard');
        }}
        onBookingConfirm={handleBookingConfirm}
      />
    );
  }

  const isRTL = lang === 'he';
  const SUGGESTION_CHIPS = t.suggestionChips;

  // ── Get accent color for event card ──
  const getEventAccent = (event) => {
    if (event.isSleep) return 'border-indigo-500 bg-indigo-50/20';
    if (event.reminderMinutesBefore > 0) return 'border-amber-400 bg-amber-50/20';
    if (event.eventType === 'notification') return 'border-purple-400 bg-purple-50/20';
    return 'border-blue-500 bg-white';
  };

  return (
    <>
      {/* ── Shabbat Screen Overlay ── */}
      {showShabbatOverlay && (
        <div className="fixed inset-0 z-[10000] bg-gradient-to-b from-indigo-950 via-purple-950 to-slate-900 flex flex-col items-center justify-center p-8" dir="rtl">
          <div className="max-w-md mx-auto text-center">
            <div className="mb-8 flex items-center justify-center gap-6">
              <svg width="48" height="72" viewBox="0 0 48 72" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
                <rect x="18" y="52" width="12" height="18" rx="2" fill="#FCD34D" opacity="0.6"/>
                <ellipse cx="24" cy="50" rx="8" ry="4" fill="#FBBF24" opacity="0.4"/>
                <path d="M24 48C20 42 16 38 16 32C16 26 20 22 24 10C28 22 32 26 32 32C32 38 28 42 24 48Z" fill="#FCD34D" opacity="0.9"/>
                <path d="M24 48C22 44 20 40 20 36C20 32 22 30 24 24C26 30 28 32 28 36C28 40 26 44 24 48Z" fill="#FEF3C7" opacity="0.7"/>
                <ellipse cx="24" cy="20" rx="3" ry="5" fill="#FDE68A" opacity="0.5"/>
              </svg>
              <svg width="48" height="72" viewBox="0 0 48 72" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90 scale-x-[-1]">
                <rect x="18" y="52" width="12" height="18" rx="2" fill="#FCD34D" opacity="0.6"/>
                <ellipse cx="24" cy="50" rx="8" ry="4" fill="#FBBF24" opacity="0.4"/>
                <path d="M24 48C20 42 16 38 16 32C16 26 20 22 24 10C28 22 32 26 32 32C32 38 28 42 24 48Z" fill="#FCD34D" opacity="0.9"/>
                <path d="M24 48C22 44 20 40 20 36C20 32 22 30 24 24C26 30 28 32 28 36C28 40 26 44 24 48Z" fill="#FEF3C7" opacity="0.7"/>
                <ellipse cx="24" cy="20" rx="3" ry="5" fill="#FDE68A" opacity="0.5"/>
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-amber-100 mb-4">שבת שלום</h1>
            <p className="text-lg text-amber-200/80 font-medium">נחזור לפעילות בצאת השבת</p>
            <div className="mt-8 w-16 h-0.5 bg-amber-300/30 rounded-full mx-auto" />
            <p className="mt-6 text-sm text-amber-100/40">שבת קודש - יום מנוחה</p>
          </div>
        </div>
      )}

      <div className={`min-h-screen bg-[#F8FAFC] font-sans pb-24`} dir={isRTL ? 'rtl' : 'ltr'}>
        {/* iOS In-App Browser Banner */}
        {isIosWhatsApp() && (
          <div className="fixed top-0 left-0 right-0 z-[99999] bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-2 shadow-sm" dir="rtl">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>לקבלת חוויית התחברות מלאה, מומלץ לפתוח ב-Safari</span>
            </div>
            <button
              onClick={() => {
                const url = window.location.href;
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(url).catch(() => {});
                }
                window.location.href = url;
              }}
              className="shrink-0 px-2.5 py-1 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition text-[10px]"
            >
              פתח ב-Safari
            </button>
            <button
              onClick={(e) => {
                e.currentTarget.closest('.fixed').style.display = 'none';
              }}
              className="shrink-0 p-1 text-amber-400 hover:text-amber-600 transition"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Toast Notifications */}
        {toasts.length > 0 && (
          <div className={`fixed top-4 ${isRTL ? 'left-4' : 'right-4'} z-[100] flex flex-col gap-2 max-w-sm`}>
            {toasts.map(ti => {
              const isUndoToast = ti.title === (t.undoToast || 'Undo successful');
              return (
                <div key={ti.id} className={`bg-white ${isRTL ? 'border-r-4' : 'border-l-4'} ${isUndoToast ? 'border-emerald-500' : 'border-amber-500'} rounded-lg shadow-lg p-4 animate-slide-in flex items-start gap-3`}>
                  {isUndoToast ? (
                    <RotateCcw className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <BellRing className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-800">{ti.title}</div>
                    {ti.message && <div className="text-xs text-slate-500 mt-0.5">{ti.message}</div>}
                  </div>
                  <button onClick={() => setToasts(prev => prev.filter(x => x.id !== ti.id))} className="text-slate-300 hover:text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Minimal Header ── */}
        <header className="px-4 py-3 flex flex-wrap items-center gap-2 max-w-6xl mx-auto">
          {/* Left: Hamburger + Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setIsSidebarOpen(true)} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition text-slate-600">
              <Menu className="w-5 h-5" />
            </button>
            <Calendar className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-bold text-slate-900">CalendAI</h1>
          </div>

          {/* Center: Global Search (desktop) */}
          <div className="hidden sm:flex flex-1 justify-center min-w-0">
            <GlobalSearch
              lang={lang}
              user={user}
              onJoinChallenge={(goal) => {
                fetchSchedule();
                setSuccess(lang === "he" ? "🎯 הצטרפת לאתגר! האירוע נוסף ליומן." : "🎯 Joined the challenge! Event added to your schedule.");
              }}
              onViewProfile={(profileUser) => {
                setShowPublicGoals(true);
              }}
              onOpenPublicGoals={() => setShowPublicGoals(true)}
            />
          </div>

          {/* Right: Credits, Trophy, Search Icon, Lang, Auth */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
            {/* AI Credits Badge */}
            {(() => {
              const credits = user ? normalizeCredits(user.aiCredits) : undefined;
              if (credits === undefined || credits === null) return null;
              return (
                <button
                  onClick={handleBuyCredits}
                  disabled={checkoutLoading}
                  className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-full border shadow-sm transition ${
                    credits > 0
                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 animate-pulse'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[11px] sm:text-xs">{credits}</span>
                </button>
              );
            })()}
            {/* Public Goals & Challenges Button */}
            <button
              onClick={() => setShowPublicGoals(true)}
              className="flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1.5 rounded-full border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition"
              title={lang === "he" ? "🎯 אתגרים ומטרות משותפות" : "🎯 Public Goals & Challenges"}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{lang === "he" ? "אתגרים" : "Goals"}</span>
            </button>
            {/* Mobile Search Icon Toggle */}
            <button
              onClick={() => setShowMobileSearch(prev => !prev)}
              className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition text-slate-500"
              title={lang === "he" ? "חיפוש" : "Search"}
            >
              <Search className="w-4.5 h-4.5" />
            </button>
            {/* Language Toggle */}
            <button onClick={toggleLanguage} className="text-[11px] sm:text-xs font-medium px-1.5 sm:px-2.5 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              {LANGUAGE_NEXT_LABELS[lang] || '🌐 EN'}
            </button>
            {/* Auth */}
            {user ? (
              <button onClick={handleLogout} className="flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                {user?.photo ? <img src={user.photo} alt="" className="w-5 h-5 rounded-full" /> : <User className="w-4 h-4" />}
                <span className="hidden sm:inline">{t.logout}</span>
              </button>
            ) : (
              <button onClick={() => handleLogin(lang)} className="flex items-center gap-1 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm">
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.loginWithGoogle}</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Search Bar (collapsible, below header) */}
        {showMobileSearch && (
          <div className="sm:hidden px-4 pb-2 max-w-6xl mx-auto">
            <GlobalSearch
              lang={lang}
              user={user}
              onJoinChallenge={(goal) => {
                fetchSchedule();
                setSuccess(lang === "he" ? "🎯 הצטרפת לאתגר! האירוע נוסף ליומן." : "🎯 Joined the challenge! Event added to your schedule.");
              }}
              onViewProfile={(profileUser) => setShowPublicGoals(true)}
              onOpenPublicGoals={() => {
                setShowPublicGoals(true);
                setShowMobileSearch(false);
              }}
            />
          </div>
        )}

        <main className="px-4 max-w-6xl mx-auto space-y-5">
          {/* ── AI Prompt Floating Card ── */}
          <div className="bg-slate-50 p-5 rounded-3xl shadow-sm border border-slate-100">
            {/* Suggestion Chips */}
            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1 mb-3" style={{ scrollbarWidth: 'none' }}>
              <span className="text-xs text-slate-400 shrink-0">{t.tryForExample}</span>
              {SUGGESTION_CHIPS.map((s, i) => (
                <button key={i} onClick={() => setInputText(s)}
                  className="px-3 py-1.5 text-xs rounded-full border transition bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 shrink-0 font-medium">{s}</button>
              ))}
              <button onClick={() => setInputText(t.suggestionSleep)}
                className="px-3 py-1.5 text-xs rounded-full border transition bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 shrink-0 flex items-center gap-1 font-medium">
                <Moon className="w-3 h-3" /> {t.suggestionSleep}
              </button>
            </div>

            {/* Textarea */}
            <div className="relative" style={{ minHeight: '100px' }}>
              <textarea value={inputText} onChange={e => setInputText(e.target.value)}
                className={`w-full p-4 rounded-2xl bg-white text-slate-800 placeholder-transparent focus:ring-2 focus:ring-indigo-400 focus:bg-white focus:shadow-lg border border-slate-200 focus:border-indigo-300 transition-all duration-200 resize-none ${isRTL ? 'text-right' : 'text-left'}`}
                rows="3" placeholder=" "
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleParse(); }}
              />
              {!inputText && (
                <div className={`absolute top-4 ${isRTL ? 'right-4' : 'left-4'} pointer-events-none overflow-hidden text-slate-400`} style={{ height: '1.75rem', width: 'calc(100% - 2rem)' }}>
                  <div className={isTransitioning ? 'transition-transform duration-500 ease-in-out' : ''} style={{ transform: `translateY(-${placeholderIndex * 1.75}rem)` }}>
                    {displayedPlaceholders.map((text, i) => (
                      <div key={i} className="h-7 leading-7 whitespace-nowrap truncate" style={{ direction: isRTL ? 'rtl' : 'ltr', textAlign: isRTL ? 'right' : 'left' }}>{text}</div>
                    ))}
                  </div>
                </div>
              )}
              {/* Voice Button */}
              {speechSupported && (
                <button
                  onClick={handleToggleListening}
                  disabled={loading}
                  className={`absolute bottom-2 ${isRTL ? 'left-2' : 'right-2'} p-2 rounded-full transition shadow-sm z-10 ${
                    isListening
                      ? 'bg-red-500 text-white animate-pulse shadow-md ring-2 ring-red-300'
                      : 'bg-white text-slate-500 border border-slate-300 hover:bg-slate-100 hover:text-blue-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={isListening ? (lang === 'he' ? 'מקשיב... לחץ להפסיק' : 'Listening... Click to stop') : (lang === 'he' ? 'הקלט קול' : 'Voice input')}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Send Button */}
            <div className="mt-3 flex items-center gap-2">
              <button onClick={handleParse} disabled={loading}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-full font-semibold transition-all duration-200 shadow-md shadow-blue-200 hover:shadow-lg disabled:from-blue-400 disabled:to-indigo-400 disabled:cursor-not-allowed disabled:shadow-none flex-1 sm:flex-none sm:w-44">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.parsing}</> : <><Sparkles className="w-5 h-5" /> {t.parseButton}</>}
              </button>
              {/* Image Upload Button */}
              <div className="relative">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="image-upload-input"
                />
                {selectedImagePreview ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleParseImage}
                      disabled={imageParsing}
                      className="flex items-center gap-1 px-3 py-2.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition text-xs font-medium disabled:bg-emerald-300 disabled:cursor-not-allowed"
                      title={t.parseImage || 'עבד תמונה'}
                    >
                      {imageParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span className="hidden sm:inline">{t.parseImage || 'עבד'}</span>
                    </button>
                    <button
                      onClick={handleRemoveImage}
                      className="p-2 text-slate-400 hover:text-red-500 transition"
                      title={t.removeImage || 'הסר תמונה'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="image-upload-input"
                    className="flex items-center gap-1 px-3 py-2.5 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer text-xs"
                    title={t.uploadImage || 'העלה תמונה'}
                  >
                    <Image className="w-4 h-4" />
                    <span className="hidden sm:inline">{t.uploadImage || 'תמונה'}</span>
                  </label>
                )}
              </div>
              <button onClick={handleUndo} disabled={scheduleHistoryRef.current.length === 0} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 px-3 py-2.5 rounded-full hover:bg-slate-100 transition text-sm disabled:opacity-30 disabled:cursor-not-allowed">
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">{t.undo}</span>
              </button>
              {/* Advanced Toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-3 py-2 rounded-full hover:bg-slate-100 transition"
              >
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {t.advanced}
              </button>
            </div>
            {/* Image Preview */}
            {selectedImagePreview && !selectedImage && (
              <div className="mt-2 relative inline-block">
                <img src={selectedImagePreview} alt="Preview" className="h-20 rounded-lg border border-slate-200 object-cover" />
              </div>
            )}
            {selectedImagePreview && (
              <div className="mt-2 relative inline-block">
                <img src={selectedImagePreview} alt="Preview" className="h-20 rounded-lg border border-slate-200 object-cover" />
              </div>
            )}

            {/* ── Advanced Options have been removed ── */}
            {/* AI now parses recurrence and event type from natural language text intelligently */}

            {error && <div className="flex items-center gap-2 text-red-600 text-sm mt-3 bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
            {success && <div className="flex items-center gap-2 text-green-700 text-sm mt-3 bg-green-50 p-3 rounded-lg border border-green-200"><Sparkles className="w-4 h-4 text-green-600 shrink-0" /><span>{success}</span></div>}

            {conflicts.length > 0 && (
              <div className="mt-3 space-y-3">
                {conflicts.map((c, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-amber-800 font-semibold mb-2"><AlertTriangle className="w-5 h-5 text-amber-600" /><span>{t.conflictTitle}{dayTranslations[c.day] || c.day}</span></div>
                    <p className="text-sm text-amber-700 mb-2">"{c.event.title}" ({c.event.startTime}-{c.event.endTime}) {t.conflictOverlaps}</p>
                    <ul className="text-sm text-amber-800 list-disc list-inside mb-3 space-y-1">{c.conflicts.map((cc, i) => <li key={i}>{cc.title} ({cc.startTime}-{cc.endTime})</li>)}</ul>
                    {c.suggestions?.length > 0 && (
                      <div><p className="text-sm font-medium text-amber-800 mb-1">{t.conflictSuggestions}</p>
                        <div className="flex flex-wrap gap-2">{c.suggestions.map((s, i) => (
                          <button key={i} onClick={() => setInputText(`${t.conflictChangeTime} ${s.startTime}-${s.endTime} ${t.slotClickPrefix} ${c.day}`)}
                            className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 transition">{s.label ? `${s.label}: ` : ''}{s.startTime} - {s.endTime}</button>
                        ))}</div>
                      </div>
                    )}
                    <button onClick={() => { setFreeSlotsDay(c.day); handleOpenFreeSlots(c.day); }}
                      className="mt-2 w-full text-center px-3 py-1.5 text-xs rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition flex items-center justify-center gap-1">
                      <Sun className="w-3 h-3" /> {t.seeAllFreeSlots}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Schedule View with Navigation ── */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-slate-800">{t.weeklyScheduleTitle}</h2>
              <div className="flex items-center gap-2">
                {allLocationsInEvents.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Filter className="w-3 h-3 text-slate-400" />
                    <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                      className="text-xs border border-slate-200 rounded-full px-2.5 py-1 bg-white text-slate-600 focus:ring-1 focus:ring-indigo-500">
                      <option value="all">{t.allLocations}</option>
                      {allLocationsInEvents.map(loc => <option key={loc} value={loc}>{LOCATION_LABELS[loc] || loc}</option>)}
                    </select>
                  </div>
                )}
                <button onClick={handleOpenReschedule}
                  className="flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 px-3 py-1.5 rounded-full hover:from-indigo-100 hover:to-violet-100 transition-all duration-200 text-xs font-medium border border-indigo-200">
                  <Wand2 className="w-3.5 h-3.5" /> {t.fixSchedule}
                </button>
              </div>
            </div>

            <ViewNavigation
              currentView={calendarView}
              onViewChange={setCalendarView}
              onPrev={() => setDayOffset(prev => prev - 1)}
              onNext={() => setDayOffset(prev => prev + 1)}
              onToday={() => setDayOffset(0)}
              t={t}
            />

            {/* Day View (default) */}
            {calendarView === 'day' && (
              <DayView
                date={(() => {
                  const d = new Date();
                  d.setDate(d.getDate() + dayOffset);
                  return d;
                })()}
                schedule={schedule}
                dayKey={(() => {
                  const d = new Date();
                  d.setDate(d.getDate() + dayOffset);
                  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  return dayNames[d.getDay()];
                })()}
                lang={lang}
                t={t}
                onEditEvent={handleOpenEditModal}
                onRemoveEvent={handleRemoveEvent}
                onSlotClick={handleSlotClick}
                locationFilter={locationFilter}
                LOCATION_LABELS={LOCATION_LABELS}
              />
            )}

            {/* Weekly View (compact grid, original style) */}
            {calendarView === 'weekly' && (
              <motion.div
                variants={staggerContainerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                {orderedDayKeys.map(dayKey => {
                  if (dayKey === "Today" && (!schedule[dayKey] || schedule[dayKey].length === 0)) return null;
                  const dayEvents = getFilteredEvents(dayKey);
                  const sortedDayEvents = getSortedDayEvents(dayKey);
                  const isTodayColumn = dayKey === todayName;
                  const maxVisible = 3;
                  const isExpanded = expandedDays[dayKey] || false;
                  const visibleEvents = isExpanded ? sortedDayEvents : sortedDayEvents.slice(0, maxVisible);
                  const hasMoreThanMax = sortedDayEvents.length > maxVisible;
                  return (
                    <div key={dayKey} className={`rounded-xl p-3 flex flex-col min-h-[120px] ${isTodayColumn ? 'bg-blue-50 border border-blue-300' : 'bg-slate-50 border border-slate-200'}`}>
                      <div
                        className={`font-bold text-sm text-slate-700 mb-2 pb-1.5 border-b text-center cursor-pointer hover:text-indigo-600 transition ${isTodayColumn ? 'border-blue-200' : 'border-slate-200'}`}
                        onClick={() => { setCalendarView('day'); }}
                      >
                        {dayTranslations[dayKey]}
                        {dayEvents.length > 0 && <span className="text-xs text-slate-400 mr-1">({dayEvents.length})</span>}
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        {dayEvents.length > 0 ? (
                          <>
                            {visibleEvents.map((event, index) => {
                              const actualIndex = schedule[dayKey]?.findIndex(e => e === event);
                              return (
                                <div key={index}
                                  className={`group relative p-3 rounded-xl border-r-[3px] flex flex-col gap-1 hover:shadow-md transition cursor-pointer ${getEventAccent(event)}`}
                                  onClick={() => actualIndex >= 0 && handleOpenEditModal(dayKey, actualIndex)}>
                                  <button onClick={e => { e.stopPropagation(); if (actualIndex >= 0) handleRemoveEvent(dayKey, actualIndex); }}
                                    className="absolute -top-1.5 -left-1.5 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center transition shadow-sm z-10">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                  <div className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                                    {event.isSleep && <Moon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                                    {event.reminderMinutesBefore > 0 && <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                    <span className="truncate">{event.title}</span>
                                    <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity mr-auto shrink-0" />
                                  </div>
                                  <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span dir="ltr">{event.startTime} - {event.endTime}</span>
                                    {event.isSleep && <span className="text-[10px] text-indigo-500 mr-1">{t.sleepLabel}</span>}
                                  </div>
                                  {event.reminderMinutesBefore > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] text-amber-600">
                                      <BellRing className="w-2.5 h-2.5" />
                                      <span>{t.reminderColon} {event.reminderMinutesBefore} {t.reminderMinutes}</span>
                                    </div>
                                  )}
                                  {event.location && (
                                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                      <MapPin className="w-2.5 h-2.5" />
                                      <span>{LOCATION_LABELS[event.location] || event.location}</span>
                                    </div>
                                  )}
                                  {event.recurrence && <span className="text-[10px] text-blue-500 font-medium">{recurrenceLabels[event.recurrence] || event.recurrence}</span>}
                                </div>
                              );
                            })}
                            {hasMoreThanMax && (
                              <button onClick={() => toggleDayExpanded(dayKey)}
                                className="w-full text-center px-3 py-1.5 text-xs rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition font-medium">
                                {t.showAllEvents.replace('{count}', sortedDayEvents.length)}
                              </button>
                            )}
                          </>
                        ) : (
                          dayKey !== 'Saturday' && (
                            <p className="text-xs text-slate-300 text-center my-auto font-light">{t.noEvents}</p>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* Monthly & Yearly */}
            {(calendarView === 'monthly' || calendarView === 'yearly' || calendarView === '100year') && (
              <MonthlyCalendar schedule={schedule} lang={lang} />
            )}
          </div>
        </main>

        <footer className="max-w-6xl mx-auto mt-8 text-center text-xs text-slate-400 border-t pt-4 px-4">
          <p>{t.footerVersion} {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : t.footerLocal}</p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <button onClick={() => { window.location.href = '/privacy'; }} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 transition"><Shield className="w-3 h-3" /> {t.footerPrivacy}</button>
            <span className="text-slate-300">·</span>
            <button onClick={() => { window.location.href = '/terms'; }} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 transition"><FileText className="w-3 h-3" /> {t.footerTerms}</button>
          </div>
        </footer>

        {/* ── Bottom Navigation Bar ── */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-t border-slate-200/60 safe-area-bottom">
          <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-4">
            {/* Home Tab */}
            <button
              onClick={() => setActiveTab('home')}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition ${
                activeTab === 'home' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[10px] font-medium">{t.home}</span>
            </button>

            {/* Center Add Button - opens manual event form */}
            <button
              onClick={() => setShowManualEvent(true)}
              className="flex flex-col items-center -mt-5"
            >
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5 transition-all active:translate-y-0">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <span className="text-[10px] font-medium text-slate-500 mt-0.5">{t.addEvent}</span>
            </button>

            {/* Credits Tab */}
            <button
              onClick={() => {
                if (user) {
                  handleBuyCredits();
                } else {
                  setShowLoginPrompt(true);
                }
              }}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition ${
                activeTab === 'credits' ? 'text-amber-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Zap className="w-5 h-5" />
              <span className="text-[10px] font-medium">{t.credits}</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Reschedule Modal */}
      {isRescheduleOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setIsRescheduleOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Wand2 className="text-indigo-600" /> {t.rescheduleTitle}</h3>
              <button onClick={() => setIsRescheduleOpen(false)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            {rescheduleLoading ? (
              <div className="text-center p-8"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-4" /><p className="text-slate-600">{t.rescheduleLoading}</p><p className="text-sm text-slate-400">{t.rescheduleLoadingSub}</p></div>
            ) : rescheduleStep === "preview" && reschedulePreview ? (
              <div>
                <p className="text-sm text-slate-600 bg-indigo-50 p-3 rounded-lg border border-indigo-200 mb-4"><span className="font-bold">{t.rescheduleOffer}</span> {reschedulePreview.summary}</p>
                <p className="font-semibold text-slate-800 mb-2">{t.reschedulePreview}</p>
                <div className="max-h-60 overflow-y-auto border rounded-lg p-2 bg-slate-50 text-xs font-mono"><pre>{JSON.stringify(reschedulePreview.newSchedule, null, 2)}</pre></div>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button onClick={handleOpenReschedule} className="text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
                  <button onClick={handleConfirmReschedule} className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">{t.rescheduleConfirm}</button>
                </div>
              </div>
            ) : rescheduleStep === "choose" && rescheduleDelay ? (
              <div>
                <p className="text-sm text-slate-600 mb-4">{t.rescheduleChooseDelay} <strong>{rescheduleDelay}</strong> {t.rescheduleMinutes}</p>
                <div className="flex flex-col gap-3">
                  {gapsResult?.hasGaps ? (
                    <button onClick={handleMergeGaps} className="w-full text-right p-4 bg-green-50 rounded-lg border border-green-300 hover:bg-green-100 transition">
                      <div className="font-medium text-green-800">{t.mergeGaps}</div>
                      <div className="text-sm text-green-600 mt-1">{t.gapsFound} {gapsResult.gapCount} {t.gapsFound2}</div>
                    </button>
                  ) : (
                    <div className="w-full text-right p-4 bg-slate-50 rounded-lg border border-slate-200"><div className="font-medium text-slate-500">{t.noGaps}</div></div>
                  )}
                  <button onClick={handleShiftEvents} className="w-full text-right p-4 bg-indigo-50 rounded-lg border border-indigo-300 hover:bg-indigo-100 transition">
                    <div className="font-medium text-indigo-800">{t.shiftAll} {rescheduleDelay} {t.shiftAll2}</div>
                  </button>
                </div>
                {rescheduleError && <div className="flex items-center gap-2 text-red-600 text-sm mt-4 bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{rescheduleError}</span></div>}
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 mb-4">{t.chooseDelay}</p>
                <div className="flex flex-col gap-3">
                  {[{ label: t.delay30, delay: 30 }, { label: t.delay1hour, delay: 60 }, { label: t.delayTomorrow, delay: null }].map(item => (
                    <button key={item.label} onClick={() => item.delay ? handleDelaySelected(item.delay) : handleReschedule(item.label)}
                      className="w-full text-right p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 transition">{item.label}</button>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 mb-2">{t.rescheduleQuickActions}</p>
                  <div className="flex flex-col gap-2">
                    <button onClick={async () => {
                      setRescheduleQuickActionLoading(true);
                      try {
                        const res = await fetch(`${API_BASE}/api/reschedule/merge-gaps`, {
                          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include"
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setReschedulePreview(data);
                          setRescheduleStep("preview");
                        } else {
                          setRescheduleError(data.error || "Failed");
                        }
                      } catch (err) { setRescheduleError(err.message); }
                      finally { setRescheduleQuickActionLoading(false); }
                    }} disabled={rescheduleQuickActionLoading}
                      className="w-full text-right p-3 bg-amber-50 rounded-lg border border-amber-200 hover:bg-amber-100 transition disabled:opacity-50">
                      <div className="font-medium text-amber-800 text-sm">{t.rescheduleMergeGaps}</div>
                    </button>
                    <button onClick={() => handleReschedule(t.delayTomorrow)}
                      disabled={rescheduleQuickActionLoading}
                      className="w-full text-right p-3 bg-sky-50 rounded-lg border border-sky-200 hover:bg-sky-100 transition disabled:opacity-50">
                      <div className="font-medium text-sky-800 text-sm">{t.rescheduleMovePending}</div>
                    </button>
                    <button onClick={() => handleReschedule(t.rescheduleAddBreak)}
                      disabled={rescheduleQuickActionLoading}
                      className="w-full text-right p-3 bg-emerald-50 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition disabled:opacity-50">
                      <div className="font-medium text-emerald-800 text-sm">{t.rescheduleAddBreak}</div>
                    </button>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 mb-2">{t.rescheduleFreeText}</p>
                  <div className="flex gap-2">
                    <input type="text" value={rescheduleCustomText} onChange={e => setRescheduleCustomText(e.target.value)}
                      placeholder={t.rescheduleCustomPlaceholder}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && rescheduleCustomText.trim()) {
                          setRescheduleCustomLoading(true);
                          await handleReschedule(rescheduleCustomText.trim());
                          setRescheduleCustomLoading(false);
                        }
                      }}
                    />
                    <button onClick={async () => {
                      if (!rescheduleCustomText.trim()) return;
                      setRescheduleCustomLoading(true);
                      await handleReschedule(rescheduleCustomText.trim());
                      setRescheduleCustomLoading(false);
                    }} disabled={rescheduleCustomLoading || !rescheduleCustomText.trim()}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:bg-indigo-400 shrink-0">
                      {rescheduleCustomLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.rescheduleCustomSubmit}
                    </button>
                  </div>
                </div>
                {rescheduleError && <div className="flex items-center gap-2 text-red-600 text-sm mt-4 bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{rescheduleError}</span></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Free Slots Modal */}
      {isFreeSlotsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setIsFreeSlotsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Sun className="text-green-600" /> {t.freeSlotsTitle}</h3>
              <button onClick={() => setIsFreeSlotsOpen(false)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            {freeSlotsLoading ? (
              <div className="text-center p-8"><Loader2 className="w-8 h-8 text-green-600 animate-spin mx-auto mb-4" /><p className="text-slate-600">{t.freeSlotsLoading}</p></div>
            ) : freeSlotsError ? (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{freeSlotsError}</span></div>
            ) : freeSlotsData && (
              <div>
                <p className="text-sm text-slate-600 mb-3">{t.freeSlotsFound} <strong>{freeSlotsData.totalFreeSlots}</strong> {t.freeSlotsRequested} {t.slotClickPrefix} {dayTranslations[freeSlotsData.day] || freeSlotsData.day} ({freeSlotsData.requestedDurationMinutes} {t.freeSlotMinutes}):</p>
                {freeSlotsData.freeSlots.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg">{t.noFreeSlots}</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {freeSlotsData.freeSlots.map((slot, i) => (
                      <button key={i} onClick={() => { const ttl = prompt(t.freeSlotPrompt); if (ttl) handleSelectFreeSlot(slot, ttl); }}
                        className="w-full text-right p-3 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 transition">
                        <div className="font-medium text-green-800">🕐 {slot.startTime} - {slot.endTime}</div>
                        <div className="text-xs text-green-600 mt-0.5">{t.freeSlotDuration} {slot.durationMinutes} {t.freeSlotMinutes}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event Edit Modal */}
      {editModalData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEditModalData(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit3 className="text-blue-600" /> {t.eventEditTitle}</h3>
              <button onClick={() => setEditModalData(null)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.editTitle}</label>
                <input type="text" value={editModalData.event.title} onChange={e => handleEditInputChange('title', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.editStartTime}</label>
                <input type="text" value={editModalData.event.startTime} onChange={e => handleEditInputChange('startTime', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="HH:MM AM/PM" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.editEndTime}</label>
                <input type="text" value={editModalData.event.endTime} onChange={e => handleEditInputChange('endTime', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="HH:MM AM/PM" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.editRecurrence}</label>
                <select value={editModalData.event.recurrence || 'weekly'} onChange={e => handleEditInputChange('recurrence', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  {RECURRENCE_OPTIONS(lang).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <div className="mt-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t.recurrenceEndLabel || 'Ends'}</label>
                  <select
                    value={editModalData.event.recurrenceEndType || 'never'}
                    onChange={e => {
                      const val = e.target.value;
                      handleEditInputChange('recurrenceEndType', val);
                      if (val === 'never') {
                        handleEditInputChange('recurrenceEndDate', '');
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="never">{t.recurrenceNeverEnds || 'Never Ends'}</option>
                    <option value="date">{t.recurrenceEndsOnDate || 'Ends on date...'}</option>
                  </select>
                  {editModalData.event.recurrenceEndType === 'date' && (
                    <input type="date" value={editModalData.event.recurrenceEndDate || ''} onChange={e => handleEditInputChange('recurrenceEndDate', e.target.value)}
                      className="mt-2 w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Bell className="w-4 h-4 text-amber-500" /> {t.reminderLabel}
                </label>
                <select value={editModalData.event.reminderMinutesBefore || 0} onChange={e => handleEditInputChange('reminderMinutesBefore', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  {REMINDER_MINUTES_OPTIONS(lang).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isSleep" checked={editModalData.event.isSleep || false} onChange={e => handleEditInputChange('isSleep', e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="isSleep" className="text-sm text-slate-700 flex items-center gap-1"><Moon className="w-3.5 h-3.5 text-indigo-500" /> {t.editSleepLabel}</label>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setEditModalData(null)} className="text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
              <button onClick={handleEditEvent} disabled={editLoading}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 transition">
                {editLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.update}</> : <><Check className="w-4 h-4" /> {t.saveChanges}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Detail Modal */}
      {dayDetailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setDayDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600" />
                {t.dayDetailTitle}: {dayDetailModal.dayLabel}
                <span className="text-sm font-normal text-slate-400">({dayDetailModal.events.length} {t.dayDetailEvents})</span>
              </h3>
              <button onClick={() => setDayDetailModal(null)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            {dayDetailModal.events.length === 0 ? (
              <div className="flex-1 flex items-center justify-center"><p className="text-sm text-slate-400">{t.noEvents}</p></div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {dayDetailModal.events.map((event, index) => {
                  const actualIndex = schedule[dayDetailModal.dayKey]?.findIndex(e => e === event);
                  return (
                    <div key={index}
                      className={`group relative p-4 rounded-xl border-r-[3px] flex flex-col gap-2 hover:shadow-md transition cursor-pointer ${getEventAccent(event)}`}
                      onClick={() => { if (actualIndex >= 0) { setDayDetailModal(null); handleOpenEditModal(dayDetailModal.dayKey, actualIndex); } }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm text-slate-800 flex items-center gap-1.5 flex-1 min-w-0">
                          {event.isSleep && <Moon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                          {event.reminderMinutesBefore > 0 && <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span className="truncate">{event.title}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {actualIndex >= 0 && (
                            <button onClick={e => { e.stopPropagation(); handleRemoveEvent(dayDetailModal.dayKey, actualIndex); setDayDetailModal(prev => prev ? { ...prev, events: prev.events.filter((_, i) => i !== index) } : null); }}
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition opacity-0 group-hover:opacity-100" title={t.delete || 'מחק'}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <Edit3 className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span dir="ltr" className="font-medium">{event.startTime} - {event.endTime}</span>
                        {event.isSleep && <span className="text-[10px] text-indigo-500 mr-1 bg-indigo-100 px-1.5 py-0.5 rounded">{t.sleepLabel}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                        {event.location && <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{LOCATION_LABELS[event.location] || event.location}</span>}
                        {event.recurrence && <span className="text-blue-500 font-medium">{recurrenceLabels[event.recurrence] || event.recurrence}</span>}
                        {event.reminderMinutesBefore > 0 && <span className="flex items-center gap-1 text-amber-600"><BellRing className="w-2.5 h-2.5" />{t.reminderColon} {event.reminderMinutesBefore} {t.reminderMinutes}</span>}
                      </div>
                      {event.hasAdvice && event.aiAdvice && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">
                          <div className="flex items-start gap-1.5"><span className="text-sm">💡</span><span>{event.aiAdvice}</span></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-slate-100 shrink-0 flex items-center justify-between">
              <p className="text-xs text-slate-400">{t.dayDetailTotal} {dayDetailModal.events.length} {t.dayDetailEvents}</p>
              <button onClick={() => setDayDetailModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-lg transition">{t.close}</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Booking Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowShareModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Share2 className="w-5 h-5 text-emerald-600" /> {t.shareBookingTitle}</h3>
              <button onClick={() => setShowShareModal(false)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <p className="text-sm text-slate-600 mb-4">{t.shareBookingDesc}</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">{t.shareBookingLinkLabel}</label>
              <div className="text-sm text-slate-800 font-mono break-all bg-white p-2 rounded border border-slate-200" dir="ltr">{bookingLink}</div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleCopyShareLink}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium transition text-sm">
                {shareLinkCopied ? <><Check className="w-4 h-4" /> {t.shareBookingCopied}</> : <><Copy className="w-4 h-4" /> {t.shareBookingCopy}</>}
              </button>
              <button onClick={handlePreviewLink}
                className="flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition text-sm font-medium">
                <ExternalLink className="w-4 h-4" /> {t.shareBookingPreview}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PWA Install Popup */}
      {showPwaPopup && !isStandalone() && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]" onClick={handleDismissPwa}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            {installPrompt && (
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Download className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{t.pwaInstall}</h3>
                <p className="text-sm text-slate-500 mb-6">{t.pwaInstallDesc}</p>
                <button onClick={handleInstallClick}
                  className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition">
                  {t.pwaInstallButton}
                </button>
              </div>
            )}
            {isIosSafari() && !installPrompt && (
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Download className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{t.pwaIosSafariTitle}</h3>
                <p className="text-sm text-slate-500 mb-4">{t.pwaIosSafariDesc}</p>
                <div className="bg-slate-50 rounded-lg p-4 text-right space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <span>{t.pwaIosSafariStep1}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <span>{t.pwaIosSafariStep2}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <span>{t.pwaIosSafariStep3}</span>
                  </div>
                </div>
              </div>
            )}
            {isIosNonSafari() && !installPrompt && (
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <ExternalLink className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{t.pwaOpenInSafari}</h3>
                <p className="text-sm text-slate-500 mb-6">{t.pwaOpenInSafariDesc}</p>
                <button onClick={() => { window.location.href = window.location.href; }}
                  className="w-full px-4 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition">
                  {t.pwaOpenInSafari}
                </button>
              </div>
            )}
            <button onClick={handleDismissPwa} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition">{t.cancel}</button>
          </div>
        </div>
      )}

      {/* Smart PWA Install Banner */}
      {showPwaBanner && !isStandalone() && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-slide-up" style={{ marginBottom: '60px' }}>
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{t.pwaInstallBanner}</p>
            </div>
            <button onClick={handlePwaBannerInstall}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shrink-0">
              {installPrompt ? t.pwaInstallBannerAndroid : (isIosSafari() ? t.pwaInstallBannerIos : t.pwaInstallBannerAndroid)}
            </button>
            <button onClick={handleDismissPwaBanner} className="text-slate-400 hover:text-slate-600 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Smart Auth Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]" onClick={() => setShowLoginPrompt(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{t.loginToSave}</h3>
            <p className="text-sm text-slate-500 mb-6">{t.loginToSaveDesc}</p>
            <button onClick={() => handleLogin(lang)} className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg">{t.loginWithGoogle}</button>
            <button onClick={() => setShowLoginPrompt(false)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition">{t.cancel}</button>
          </div>
        </div>
      )}

      {/* AI Credits Exhausted Modal */}
      {showCreditsModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]" onClick={() => setShowCreditsModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-gradient-to-br from-red-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <AlertTriangle className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{lang === 'he' ? 'נגמרו לך הקרדיטים!' : 'You are out of credits!'}</h3>
            <p className="text-sm text-slate-500 mb-6">{creditsError || (lang === 'he' ? 'נגמרו לך הקרדיטים! אנא רכוש חבילת פעולות נוספת כדי להמשיך להשתמש ב-AI.' : 'You ran out of credits! Please purchase an additional action pack to continue using the AI.')}</p>
            <button onClick={() => setShowCreditsModal(false)} className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg">{lang === 'he' ? 'הבנתי' : 'Got it'}</button>
            <button onClick={() => setShowCreditsModal(false)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition">{t.cancel}</button>
          </div>
        </div>
      )}

      {/* Guest Usage Limit Modal */}
      {showGuestLimitModal && !user && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]" onClick={() => setShowGuestLimitModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{t.guestLimitTitle}</h3>
            <p className="text-sm text-slate-500 mb-6">{t.guestLimitDesc}</p>
            <button onClick={() => handleLogin(lang)} className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg flex items-center justify-center gap-2"><LogIn className="w-4 h-4" /> {t.loginWithGoogle}</button>
            <button onClick={() => { setShowGuestLimitModal(false); setShowEmailAuth(true); setAuthMode('login'); }}
              className="w-full mt-2 px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition shadow-sm flex items-center justify-center gap-2"><Mail className="w-4 h-4" /> {lang === 'he' ? 'התחבר עם אימייל' : 'Login with Email'}</button>
            <button onClick={() => setShowGuestLimitModal(false)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition">{t.cancel}</button>
          </div>
        </div>
      )}

      {/* Email/Password Auth Modal */}
      {showEmailAuth && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]" onClick={() => setShowEmailAuth(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">{authMode === 'login' ? (lang === 'he' ? 'התחברות' : 'Login') : (lang === 'he' ? 'הרשמה' : 'Register')}</h3>
              <button onClick={() => setShowEmailAuth(false)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            {authError && <div className="flex items-center gap-2 text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{authError}</span></div>}
            <div className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'he' ? 'שם' : 'Name'}</label>
                  <input type="text" value={authName} onChange={e => setAuthName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={lang === 'he' ? 'הכנס שם' : 'Enter name'} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'he' ? 'אימייל' : 'Email'}</label>
                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'he' ? 'סיסמה' : 'Password'}</label>
                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="••••••" />
              </div>
              <button onClick={async () => {
                setEmailAuthLoading(true);
                setAuthError('');
                try {
                  const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
                  const body = authMode === 'login'
                    ? { email: authEmail, password: authPassword }
                    : { email: authEmail, password: authPassword, name: authName };
                  const res = await fetch(`${API_BASE}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Authentication failed');
                  setJwtToken(data.token);
                  if (setUser) setUser(normalizeUserCredits(data.user));
                  if (setIsPro) setIsPro(data.user?.isPro === true || data.user?.isPro === 'true');
                  safeStorage.setItem('calendai-isLoggedIn', 'true');
                  safeStorage.setItem('calendai-user', JSON.stringify(normalizeUserCredits(data.user)));
                  setShowEmailAuth(false);
                  setShowLoginPrompt(false);
                  setShowGuestLimitModal(false);
                  setAuthEmail('');
                  setAuthPassword('');
                  setAuthName('');
                  setSuccess(lang === 'he' ? 'התחברת בהצלחה!' : 'Logged in successfully!');
                } catch (err) {
                  setAuthError(err.message);
                } finally {
                  setEmailAuthLoading(false);
                }
              }} disabled={emailAuthLoading || !authEmail || !authPassword}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {emailAuthLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {lang === 'he' ? 'מתחבר...' : 'Loading...'}</> : (authMode === 'login' ? (lang === 'he' ? 'התחבר' : 'Login') : (lang === 'he' ? 'הירשם' : 'Register'))}
              </button>
              <div className="text-center mt-2">
                <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
                  className="text-sm text-blue-600 hover:text-blue-800">
                  {authMode === 'login' ? (lang === 'he' ? 'אין לך חשבון? הירשם' : "Don't have an account? Register") : (lang === 'he' ? 'יש לך חשבון? התחבר' : 'Already have an account? Login')}
                </button>
              </div>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-slate-400">{lang === 'he' ? 'או' : 'or'}</span></div>
              </div>
              <button onClick={() => { setShowEmailAuth(false); handleLogin(lang); }}
                className="w-full px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition shadow-sm flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" /> {t.loginWithGoogle}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Event Form Modal */}
      {showManualEvent && (
        <ManualEventForm
          t={t}
          lang={lang}
          user={user}
          onClose={() => setShowManualEvent(false)}
          onSuccess={() => {
            setShowManualEvent(false);
            fetchSchedule();
          }}
        />
      )}

      {/* Meeting Wizard Modal */}
      {showWizard && (
        <MeetingWizard schedule={schedule} lang={lang} t={t} onClose={() => setShowWizard(false)} />
      )}

      {/* History Modal */}
      <HistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        t={t}
        lang={lang}
        onUndoSuccess={() => {
          // After undoing, refresh the schedule
          fetchSchedule();
          setSuccess(lang === 'he' ? '✅ הפעולה בוטלה בהצלחה!' : '✅ Action undone successfully!');
        }}
      />

      {/* Sidebar Drawer */}
      <SidebarDrawer
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        schedule={schedule}
        lang={lang}
        onLangChange={(newLang) => {
          setLang(newLang);
          safeStorage.setItem('calendai-lang', newLang);
        }}
        t={t}
        user={user}
        isPro={isPro}
        onLogout={handleLogout}
        onOpenShareModal={() => setShowShareModal(true)}
        onOpenHistory={() => setShowHistoryModal(true)}
        selectedLocation={profileLocation !== 'none' ? profileLocation : selectedLocation}
        onLocationChange={(loc) => {
          setProfileLocation(loc);
          safeStorage.setItem('calendai-profile-location', loc);
        }}
        selectedTimezone={selectedTimezone}
        onTimezoneChange={handleTimezoneChange}
        timezoneOptions={TIMEZONE_OPTIONS}
      />

      {/* Public Goals & Challenges Modal */}
      {showPublicGoals && (
        <PublicGoals
          lang={lang}
          user={user}
          onClose={() => setShowPublicGoals(false)}
          onJoinChallenge={(goal) => {
            fetchSchedule();
            setSuccess(lang === "he" ? "🎯 הצטרפת לאתגר! האירוע נוסף ליומן." : "🎯 Joined the challenge! Event added to your schedule.");
          }}
        />
      )}
    </>
  );
}

// ── Root App ──
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LuxuryLoader statusText="Loading..." />}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}