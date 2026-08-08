import React, { useState, useEffect, useCallback, useRef } from "react";
import { Calendar, Send, Clock, AlertCircle, LogIn, LogOut, User, Trash2, CalendarDays, Sparkles, Loader2, AlertTriangle, Wand2, X, MapPin, Shield, Filter, Moon, Edit3, Check, ChevronLeft, ChevronRight, Sun, Bell, BellRing, CalendarCheck, RotateCcw, Menu, Share2, Download, Eye, ExternalLink, Copy, Mail, Mic, MicOff } from "lucide-react";
import MonthlyCalendar from "./components/MonthlyCalendar";
import LocationSelector from "./components/LocationSelector";
import Privacy from "./components/Privacy";
import ErrorBoundary from "./components/ErrorBoundary";
import SidebarDrawer from "./components/SidebarDrawer";
import MeetingWizard from "./components/MeetingWizard";
import GuestBookingView from "./components/GuestBookingView";
import Booking from "./components/Booking";
import LandingPage from "./components/LandingPage";
import translations from "./i18n";

const API_BASE = import.meta.env.VITE_API_URL || "";

const RECURRENCE_OPTIONS = (lang) => [
  { value: "once", label: translations[lang].recurrenceOnce },
  { value: "daily", label: translations[lang].recurrenceDaily },
  { value: "weekly", label: translations[lang].recurrenceWeekly },
  { value: "monthly", label: translations[lang].recurrenceMonthly },
  { value: "yearly", label: translations[lang].recurrenceYearly }
];
// "forever" is now the default behavior (no end date / no UNTIL in RRULE)

const REMINDER_MINUTES_OPTIONS = (lang) => [
  { value: 0, label: translations[lang].reminderNone },
  { value: 5, label: translations[lang].reminder5min },
  { value: 15, label: translations[lang].reminder15min },
  { value: 30, label: translations[lang].reminder30min },
  { value: 60, label: translations[lang].reminder1hour }
];

const LOCATION_LABELS = {
  jerusalem: "Jerusalem",
  newyork: "New York",
  london: "London",
  losangeles: "Los Angeles"
};

// ── Guest Usage Limit Constants ──
const GUEST_MAX_ACTIONS = 10;
const GUEST_COUNT_KEY = 'calendai-guest-usage-count';
const GUEST_DATA_KEY = 'calendai-guest-temp-data';

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

// Detect iOS Safari
function isIosSafari() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|OPiOS|mercury/.test(ua);
  return isIos && isSafari;
}

// Detect iOS non-Safari browser
function isIosNonSafari() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isNotSafari = !(/Safari/.test(ua) && !/Chrome|CriOS|FxiOS|OPiOS|mercury/.test(ua));
  return isIos && isNotSafari;
}

// Check if already in standalone mode (PWA)
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getInitialIntent() {
  if (typeof window === 'undefined') return { isAuthCallback: false, authFailed: false, wantsBooking: false };
  const params = new URLSearchParams(window.location.search);
  return {
    isAuthCallback: params.get('login') === 'success' || params.get('auth') === 'success',
    authFailed: params.get('auth') === 'failed',
    wantsBooking: params.get('book') === 'true' || params.get('book') === '1',
  };
}

function App() {
  // Language state - load from localStorage or default to 'he'
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('calendai-lang') || 'he';
    } catch { return 'he'; }
  });
  const t = translations[lang] || translations['he'];

  const [showPrivacy, setShowPrivacy] = useState(false);
  const [inputText, setInputText] = useState("");
  const [recurrence, setRecurrence] = useState("weekly");
  const [eventType, setEventType] = useState("activity"); // "activity" or "notification"
  const [activityDuration, setActivityDuration] = useState(60); // minutes
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [conflicts, setConflicts] = useState([]);

  // Voice-to-Text State (Web Speech API)
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
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);

  const intentRef = useRef(getInitialIntent());

  const [authStatus, setAuthStatus] = useState('checking'); // 'checking' | 'authenticated' | 'guest'

  const [schedule, setSchedule] = useState({
    Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
    Thursday: [], Friday: [], Saturday: [], Today: []
  });
  const scheduleHistoryRef = useRef([]);

  // Notification / Reminder State
  const [notificationPerm, setNotificationPerm] = useState(Notification.permission);
  const [toasts, setToasts] = useState([]);
  const notifiedRemindersRef = useRef(new Set());

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ── Guest Usage Limit State ──
  const [guestUsageCount, setGuestUsageCount] = useState(() => {
    try {
      return parseInt(localStorage.getItem(GUEST_COUNT_KEY) || '0', 10);
    } catch { return 0; }
  });
  const [showGuestLimitModal, setShowGuestLimitModal] = useState(false);

  // Meeting Wizard State
  const [showWizard, setShowWizard] = useState(false);

  // ── View State ──
  // 'landing'   = default for unauthenticated guests (landing page)
  // 'dashboard' = main app for authenticated users or guests who clicked "try demo"
  // 'booking'   = ONLY if ?book=true or ?book=dyn_xxx is explicitly in the URL
  // 'guest-booking' = when a dynamic booking ID is in the URL
  const [currentView, setCurrentView] = useState(() => intentRef.current.wantsBooking ? 'booking' : 'landing');
  const [guestBookingId, setGuestBookingId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const bookParam = params.get('book');
    // Check if it's a dynamic booking ID (starts with dyn_)
    if (bookParam && bookParam !== 'true' && bookParam !== '1') {
      return bookParam;
    }
    return null;
  });
  const [authLoading, setAuthLoading] = useState(() => {
    // Only show loading if we think we're logged in but don't have user yet
    try { return localStorage.getItem('calendai-isLoggedIn') === 'true'; } catch { return false; }
  });

  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showPwaPopup, setShowPwaPopup] = useState(false);
  const [pwaDismissed, setPwaDismissed] = useState(() => {
    try { return localStorage.getItem('calendai-pwa-dismissed') === 'true'; } catch { return false; }
  });

  // Smart PWA Install Banner (bottom toast, appears after 60s)
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  const [pwaBannerDismissed, setPwaBannerDismissed] = useState(() => {
    try { return localStorage.getItem('calendai-pwa-banner-dismissed') === 'true'; } catch { return false; }
  });

  // Smart Auth: show login prompt for save operations
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Email/Password Auth State
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Share Booking Link State
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  // Profile settings (location in sidebar)
  const [profileLocation, setProfileLocation] = useState(() => {
    try { return localStorage.getItem('calendai-profile-location') || 'none'; } catch { return 'none'; }
  });

  const bookingLink = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?book=1` : '';

  // ── Guest Usage Counter Helpers ──
  const incrementGuestUsage = useCallback(() => {
    setGuestUsageCount(prev => {
      const next = prev + 1;
      try {
        localStorage.setItem(GUEST_COUNT_KEY, String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  // Save guest-created data temporarily to localStorage
  const saveGuestTempData = useCallback((actionType, data) => {
    try {
      const existing = JSON.parse(localStorage.getItem(GUEST_DATA_KEY) || '[]');
      existing.push({ type: actionType, data, timestamp: Date.now() });
      localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(existing));
    } catch (e) {}
  }, []);

  // Check if guest can perform an action: return true if allowed, false if blocked
  const checkGuestActionLimit = useCallback(() => {
    if (user) return true; // Logged-in users have no limit
    if (guestUsageCount < GUEST_MAX_ACTIONS) return true;
    // Show the limit modal
    setShowGuestLimitModal(true);
    return false;
  }, [user, guestUsageCount]);

  // Sync guest temp data to backend after login
  const syncGuestDataToBackend = useCallback(async () => {
    try {
      const raw = localStorage.getItem(GUEST_DATA_KEY);
      if (!raw) return;
      const guestData = JSON.parse(raw);
      if (!Array.isArray(guestData) || guestData.length === 0) return;

      // For each saved action, replay it to the backend
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

      // Clear guest temp data after sync
      localStorage.removeItem(GUEST_DATA_KEY);
      localStorage.removeItem(GUEST_COUNT_KEY);
      setGuestUsageCount(0);
    } catch (e) {
      console.error('Failed to sync guest data:', e);
    }
  }, []);

  // ── Share App Handler ──
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
        // User cancelled or error - fallback to clipboard
        if (e.name !== 'AbortError') {
          copyToClipboardFallback(shareUrl);
        }
      }
    } else {
      copyToClipboardFallback(shareUrl);
    }
  }, []);

  const copyToClipboardFallback = (text) => {
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
  };

  // ── Shabbat Mode (Dynamic via Hebcal API) ──
  const [shabbatTimes, setShabbatTimes] = useState(null); // { candles: Date, havdalah: Date }
  const [shabbatFetchError, setShabbatFetchError] = useState(false);

  // Fetch Shabbat times from Hebcal API
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

  // Fetch on mount and every 6 hours
  useEffect(() => {
    fetchShabbatTimes();
    const interval = setInterval(fetchShabbatTimes, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchShabbatTimes]);

  const isShabbatNow = useCallback(() => {
    if (!shabbatTimes || !shabbatTimes.candles || !shabbatTimes.havdalah) {
      // Fallback: if API hasn't loaded yet, use hardcoded times
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

  // Check if a given date/time falls within Shabbat (for blocking scheduling)
  const isTimeInShabbat = useCallback((date) => {
    if (!shabbatTimes || !shabbatTimes.candles || !shabbatTimes.havdalah) {
      // Fallback: check if it's Friday 16:00 to Saturday 20:00
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

  // Check shabbat status every minute
  useEffect(() => {
    const checkShabbat = () => {
      setShowShabbatOverlay(isShabbatNow());
    };
    checkShabbat();
    const interval = setInterval(checkShabbat, 60000);
    return () => clearInterval(interval);
  }, [isShabbatNow]);

  // Block scheduling during Shabbat - wrap the parse handler
  const handleParseOriginalRef = useRef(null);
  // We'll check in handleParse before proceeding

  // Smart Auth: require login for save operations
  const handleLoginRequired = useCallback((action) => {
    if (!user) {
      setPendingAction(action);
      setShowLoginPrompt(true);
      return true;
    }
    return false;
  }, [user]);

  // Listen for beforeinstallprompt (Android Chrome)
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

  // Show iOS PWA prompt if not already dismissed
  useEffect(() => {
    if (!isStandalone() && !pwaDismissed && !installPrompt) {
      const timer = setTimeout(() => {
        setShowPwaPopup(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pwaDismissed, installPrompt]);

  // Hide PWA popup if already standalone
  useEffect(() => {
    if (isStandalone()) {
      setShowPwaPopup(false);
    }
  }, []);

  // Smart PWA Banner: show after 60 seconds of active usage
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
    try { localStorage.setItem('calendai-pwa-dismissed', 'true'); } catch (e) {}
  };

  const handleDismissPwaBanner = () => {
    setShowPwaBanner(false);
    setPwaBannerDismissed(true);
    try { localStorage.setItem('calendai-pwa-banner-dismissed', 'true'); } catch (e) {}
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

  // Fetch schedule from backend
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

  // Save the current schedule state to the undo history stack
  const saveScheduleState = useCallback(() => {
    scheduleHistoryRef.current.push(JSON.parse(JSON.stringify(schedule)));
  }, [schedule]);

  // Keep-alive ping to wake up Render server if it's sleeping
  // Pings every 5 minutes, but only when the page is visible
  useEffect(() => {
    let pingInterval;
    const startPing = () => {
      pingInterval = setInterval(() => {
        fetch(`${API_BASE}/api/health`, { method: 'GET', cache: 'no-store' })
          .catch(() => {}); // Silently fail - server might be waking up
      }, 5 * 60 * 1000); // Every 5 minutes
    };
    const stopPing = () => {
      if (pingInterval) clearInterval(pingInterval);
    };
    // Start immediately when component mounts
    startPing();
    // Stop when tab is hidden, resume when visible
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

  // ── JWT Token Management ──
  // Store/retrieve JWT from localStorage for persistent auth across server restarts
  const getJwtToken = () => {
    try { return localStorage.getItem('token') || localStorage.getItem('calendai-jwt'); } catch { return null; }
  };
  const setJwtToken = (token) => {
    try { localStorage.setItem('token', token); localStorage.setItem('calendai-jwt', token); } catch (e) {}
  };
  const clearJwtToken = () => {
    try { localStorage.removeItem('token'); localStorage.removeItem('calendai-jwt'); } catch (e) {}
  };

  // ── Unified Auth State Machine ──
  // Handles OAuth callback, auth failure, and initial auth check
  useEffect(() => {
    const intent = intentRef.current;

    // Extract token from URL query params (OAuth callback redirect with ?token=xxx)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setJwtToken(urlToken);
      try { localStorage.setItem('calendai-isLoggedIn', 'true'); } catch (e) {}
    }

    if (intent.isAuthCallback || intent.authFailed || urlToken) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (intent.authFailed) {
      setAuthStatus('guest');
      setCurrentView(intent.wantsBooking ? 'booking' : 'dashboard');
      return;
    }

    const checkAuth = async (retries = 2) => {
      try {
        const token = getJwtToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/api/auth/me?t=${Date.now()}`, { cache: 'no-store', credentials: 'include', headers });
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setIsPro(data.user?.isPro === true || data.user?.isPro === 'true');
          setAuthStatus('authenticated');
          setCurrentView(intent.wantsBooking ? 'booking' : 'dashboard');
          // Exchange session for a JWT token to persist login across server restarts
          try {
            const tokenRes = await fetch(`${API_BASE}/api/auth/token`, {
              method: 'POST',
              credentials: 'include'
            });
            const tokenData = await tokenRes.json();
            if (tokenData.token) {
              setJwtToken(tokenData.token);
              try { localStorage.setItem('calendai-isLoggedIn', 'true'); } catch (e) {}
            }
          } catch (tokenErr) {
            console.error('Failed to exchange session for JWT:', tokenErr);
          }
          syncGuestDataToBackend();
        } else if (retries > 0) {
          setTimeout(() => checkAuth(retries - 1), 400);
        } else {
          setAuthStatus('guest');
          setCurrentView(intent.wantsBooking ? 'booking' : 'dashboard');
        }
      } catch (e) {
        if (retries > 0) {
          setTimeout(() => checkAuth(retries - 1), 400);
        } else {
          setAuthStatus('guest');
          setCurrentView(intent.wantsBooking ? 'booking' : 'dashboard');
        }
      }
    };

    checkAuth();
  }, [syncGuestDataToBackend]);

  // On mount: restore user from JWT token (persistent across server restarts)
  useEffect(() => {
    let cancelled = false;
    const tryRestoreUser = async () => {
      const token = getJwtToken();
      if (!token) {
        // No JWT, try session-based restore as fallback
        try {
          if (localStorage.getItem('calendai-isLoggedIn') === 'true') {
            const res = await fetch(`${API_BASE}/api/auth/me?t=${Date.now()}`, { cache: 'no-store', credentials: "include" });
            const data = await res.json();
            if (data.user && !cancelled) {
              setUser(data.user);
              setIsPro(data.user?.isPro === true || data.user?.isPro === 'true');
            }
          }
        } catch (e) {}
        return;
      }
      // Verify JWT token with backend
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.user && !cancelled) {
          setUser(data.user);
          setIsPro(data.user?.isPro === true || data.user?.isPro === 'true');
          try { localStorage.setItem('calendai-isLoggedIn', 'true'); } catch (e) {}
        } else {
          // Token expired, clear it
          clearJwtToken();
          try { localStorage.removeItem('calendai-isLoggedIn'); } catch (e) {}
        }
      } catch (e) {
        // Server might be waking up - keep the dashboard view, don't fall back
        // The JWT is still valid, just the server is down
      }
    };
    tryRestoreUser();
    return () => { cancelled = true; };
  }, []);

  // Handle booking confirmation
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

  // Toggle language function
  const toggleLanguage = () => {
    const newLang = lang === 'he' ? 'en' : 'he';
    setLang(newLang);
    try {
      localStorage.setItem('calendai-lang', newLang);
    } catch (e) {}
  };

  const requestNotificationPermission = useCallback(async () => {
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      setNotificationPerm(perm);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => requestNotificationPermission(), 3000);
    return () => clearTimeout(timer);
  }, [requestNotificationPermission]);

  // Reminder Checker Interval
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

  // (Auth state machine handles initial auth check via the useEffect above)

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

  // ── Voice-to-Text Handler (Web Speech API) ──
  const handleToggleListening = useCallback(() => {
    if (isListening) {
      // Stop listening
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

      // Support both Hebrew and English
      recognition.lang = lang === 'he' ? 'he-IL' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        // Append to existing text with a space if not empty
        const currentText = inputTextRef.current;
        const newText = currentText ? `${currentText} ${transcript}` : transcript;
        setInputText(newText);
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.warn('Speech recognition failed:', e);
      setIsListening(false);
    }
  }, [isListening, lang]);

  const handleUndo = async () => {
    if (scheduleHistoryRef.current.length === 0) return;
    const previousSchedule = scheduleHistoryRef.current.pop();
    setSchedule(previousSchedule);
    try {
      await fetch(`${API_BASE}/api/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: previousSchedule }),
        credentials: "include"
      });
      setSuccess(t.undo + "!");
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

  const handleParse = async () => {
    if (!inputText.trim()) return;
    if (showShabbatOverlay) {
      setError(t.shabbatBlockError || 'לא ניתן לתזמן פעילויות בשבת. נחזור לפעילות בצאת השבת.');
      return;
    }
    if (handleLoginRequired('parse')) return;
    if (!checkGuestActionLimit()) return;
    saveScheduleState();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API_BASE}/api/parse-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, recurrence, location: selectedLocation, eventType, duration: eventType === 'notification' ? 0 : activityDuration }),
        credentials: "include"
      });
      if (!res.ok) throw new Error(t.failedRequest + " " + res.status);
      const data = await res.json();
      if (user && data.events?.length > 0) {
        await Promise.allSettled(data.events.map(ev =>
          fetch(`${API_BASE}/api/add-to-google-calendar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: ev }),
            credentials: "include"
          })
        ));
      }
      if (data.conflicts?.length > 0) setConflicts(data.conflicts);
      else setConflicts([]);
      await fetchSchedule();
      setSuccess(data.replyMessage || `${t.successAdded} ${data.events?.length || 0} ${t.successEvents}`);
      setInputText("");

      // Track guest usage
      if (!user) {
        incrementGuestUsage();
        saveGuestTempData('parse', { text: inputText, recurrence, location: selectedLocation });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => { window.location.href = `${API_BASE}/api/auth/google`; };

  const handleTryGuest = () => {
    setCurrentView('dashboard');
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
      setUser(null);
      setIsPro(false);
      setSchedule({ Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Today: [] });
      // Clear the logged-in flag from localStorage
      try {
        localStorage.removeItem('calendai-isLoggedIn');
        localStorage.removeItem('calendai-user');
      } catch (e) {}
    } catch (err) { console.error(err); }
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
        body: JSON.stringify({ day: freeSlotsData.day, startTime: slot.startTime, endTime: slot.endTime, title, recurrence, location: selectedLocation }),
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

  const getFilteredEvents = (dayKey) => {
    const dayEvents = schedule[dayKey] || [];
    if (locationFilter === "all") return dayEvents;
    return dayEvents.filter(e => e.location === locationFilter);
  };

  // Authenticating Screen: show inline loading indicator while verifying auth
  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">{t.parsing || 'טוען...'}</p>
        </div>
      </div>
    );
  }

  // If a dynamic booking ID is in the URL, show the guest booking view
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

  // Landing Page: Show the landing page for unauthenticated guests on the root route
  if (currentView === 'landing') {
    return (
      <LandingPage
        t={t}
        lang={lang}
        onLogin={handleLogin}
        onTryGuest={handleTryGuest}
        toggleLanguage={toggleLanguage}
      />
    );
  }

  // Booking View: ONLY when ?book=true or ?book=1 is explicitly in the URL
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

  return (
    <>
      {/* ── Shabbat Screen Overlay ── */}
      {showShabbatOverlay && (
        <div className="fixed inset-0 z-[10000] bg-gradient-to-b from-indigo-950 via-purple-950 to-slate-900 flex flex-col items-center justify-center p-8" dir="rtl">
          <div className="max-w-md mx-auto text-center">
            {/* Candle SVG Icon */}
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

      <div className={`min-h-screen bg-slate-50 p-4 sm:p-6 font-sans pb-20`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className={`fixed top-4 ${isRTL ? 'left-4' : 'right-4'} z-[100] flex flex-col gap-2 max-w-sm`}>
          {toasts.map(ti => (
            <div key={ti.id} className={`bg-white ${isRTL ? 'border-r-4' : 'border-l-4'} border-amber-500 rounded-lg shadow-lg p-4 animate-slide-in flex items-start gap-3`}>
              <BellRing className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-slate-800">{t.toastReminder} {ti.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{ti.message}</div>
              </div>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== ti.id))} className="text-slate-300 hover:text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <header className="max-w-6xl mx-auto mb-4 sm:mb-8 flex items-center justify-between border-b pb-3 sm:pb-4 gap-1 sm:gap-2">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0 flex-shrink">
          {/* Hamburger Menu Button */}
          <button onClick={() => setIsSidebarOpen(true)}
            className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg hover:bg-slate-100 transition text-slate-600 shrink-0">
            <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <Calendar className="w-5 h-5 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
          <div className="min-w-0">
            <span className="text-[8px] sm:text-[10px] text-slate-400 tracking-widest mb-0.5 block">{t.besod}</span>
            <h1 className="text-sm sm:text-2xl font-bold text-slate-900 leading-tight truncate">CalendAI</h1>
            <p className="text-[10px] sm:text-sm text-indigo-500/80 font-medium leading-snug truncate hidden sm:block">{t.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          {/* Meeting Wizard Button */}
          <button onClick={() => setShowWizard(true)}
            className="flex items-center gap-1 bg-gradient-to-r from-blue-500 to-indigo-600 border border-blue-400 text-white px-1.5 sm:px-4 py-1 sm:py-2 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition text-[11px] sm:text-sm font-medium shadow-sm whitespace-nowrap">
            <Calendar className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{t.wizardTitle}</span><span className="sm:hidden">{t.wizardShort}</span>
          </button>
          {/* Share App Button */}
          <button onClick={handleShareApp}
            className="flex items-center gap-1 bg-white border border-emerald-300 text-emerald-700 px-1.5 sm:px-3 py-1 sm:py-2 rounded-lg hover:bg-emerald-50 transition text-[11px] sm:text-sm font-medium whitespace-nowrap shadow-sm">
            <Share2 className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{t.shareAppButton || 'שתף'}</span>
          </button>
          {/* Language Toggle Button */}
          <button onClick={toggleLanguage}
            className="flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-1.5 sm:px-3 py-1 sm:py-2 rounded-lg hover:bg-slate-50 transition text-[11px] sm:text-sm font-medium whitespace-nowrap">
            {t.languageLabel}
          </button>
          {user ? (
            <div className="flex items-center gap-1 sm:gap-3">
              {user.photo ? <img src={user.photo} alt="" className="w-6 h-6 sm:w-8 sm:h-8 rounded-full shrink-0" /> : <User className="w-4 h-4 sm:w-6 sm:h-6 text-slate-500 shrink-0" />}
              <span className="hidden sm:inline text-sm text-slate-700 truncate max-w-[100px]">{user.displayName || user.email}</span>
              <button onClick={handleLogout} className="flex items-center gap-1 text-[11px] sm:text-sm text-red-500 hover:text-red-700 transition shrink-0"><LogOut className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{t.logout}</span></button>
            </div>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-1 sm:gap-2 bg-white border border-slate-300 text-slate-700 px-1.5 sm:px-4 py-1 sm:py-2 rounded-lg hover:bg-slate-50 transition text-[11px] sm:text-sm whitespace-nowrap">
              <LogIn className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{t.loginWithGoogle}</span><span className="sm:hidden">{t.loginShort}</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 gap-6">
        {/* Input box */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
          <h2 className="text-lg font-semibold mb-2 text-slate-800">{t.inputTitle}</h2>
          <div className="relative mt-4" style={{ minHeight: '120px' }}>
            <textarea value={inputText} onChange={e => setInputText(e.target.value)}
              className={`w-full p-4 border rounded-lg text-slate-800 placeholder-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${isRTL ? 'text-right' : 'text-left'}`}
              rows="4" placeholder=" "
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
            {/* Voice-to-Text Microphone Button */}
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

          <div className="mt-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1" style={{ scrollbarWidth: 'none' }}>
            <span className="text-xs text-slate-400 shrink-0">{t.tryForExample}</span>
            {SUGGESTION_CHIPS.map((s, i) => (
              <button key={i} onClick={() => setInputText(s)}
                className="px-2.5 py-1 text-xs rounded-full border transition bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300 shrink-0">{s}</button>
            ))}
            <button onClick={() => setInputText(t.suggestionSleep)}
              className="px-2.5 py-1 text-xs rounded-full border transition bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 shrink-0 flex items-center gap-1">
              <Moon className="w-3 h-3" /> {t.suggestionSleep}
            </button>
          </div>

          {/* ── Event Type and Duration Selector ── */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-600">{t.eventType}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              <button onClick={() => setEventType("activity")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition ${eventType === "activity" ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>{t.typeActivity}</button>
              <button onClick={() => setEventType("notification")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition ${eventType === "notification" ? "bg-amber-600 text-white border-amber-600 shadow-sm" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>{t.typeNotification}</button>
            </div>
            {/* Duration Selector (only for Activity) */}
            {eventType === "activity" && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">{t.activityDuration}</span>
                <select
                  value={activityDuration}
                  onChange={e => setActivityDuration(parseInt(e.target.value))}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value={15}>{t.duration15}</option>
                  <option value={30}>{t.duration30}</option>
                  <option value={45}>{t.duration45}</option>
                  <option value={60}>{t.duration60}</option>
                  <option value={90}>{t.duration90}</option>
                  <option value={120}>{t.duration120}</option>
                </select>
              </div>
            )}
            {eventType === "notification" && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">{t.notificationPing}</span>
            )}
          </div>

          {/* ── Recurrence Selector ── */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-600">{t.frequency}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {RECURRENCE_OPTIONS(lang).map(opt => (
                <button key={opt.value} onClick={() => setRecurrence(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition ${recurrence === opt.value ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>{opt.label}</button>
              ))}
            </div>
          </div>

          {error && <div className="flex items-center gap-2 text-red-600 text-sm mt-4 bg-red-50 p-3 rounded-lg border border-red-200"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}
          {success && <div className="flex items-center gap-2 text-green-700 text-sm mt-4 bg-green-50 p-3 rounded-lg border border-green-200"><Sparkles className="w-4 h-4 text-green-600" /><span>{success}</span></div>}

          {conflicts.length > 0 && (
            <div className="mt-4 space-y-3">
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
                    <Sun className="w-3 h-3" /> {t.seeAllFreeSlots || 'ראה את כל החלונות הפנויים'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleParse} disabled={loading}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition disabled:bg-blue-400 disabled:cursor-not-allowed w-full sm:w-48">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.parsing}</> : <><Send className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} /> {t.parseButton}</>}
            </button>
            <button onClick={handleUndo} disabled={scheduleHistoryRef.current.length === 0} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 px-4 py-3 rounded-lg hover:bg-slate-50 transition text-sm disabled:opacity-30 disabled:cursor-not-allowed"><RotateCcw className="w-4 h-4" /> {t.undo}</button>
          </div>
        </div>

        {/* Weekly Schedule */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b pb-2">
            <h2 className="text-xl font-bold text-slate-800">{t.weeklyScheduleTitle}</h2>
            <div className="flex items-center gap-2">
              {allLocationsInEvents.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Filter className="w-3 h-3 text-slate-400" />
                  <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-600 focus:ring-1 focus:ring-blue-500">
                    <option value="all">{t.allLocations}</option>
                    {allLocationsInEvents.map(loc => <option key={loc} value={loc}>{LOCATION_LABELS[loc] || loc}</option>)}
                  </select>
                </div>
              )}
              <button onClick={handleOpenReschedule}
                className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200 transition text-sm font-medium border border-indigo-200">
                <Wand2 className="w-4 h-4" /> {t.fixSchedule}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {orderedDayKeys.map(dayKey => {
              if (dayKey === "Today" && (!schedule[dayKey] || schedule[dayKey].length === 0)) return null;
              const dayEvents = getFilteredEvents(dayKey);
              const isTodayColumn = dayKey === todayName;
              return (
                <div key={dayKey} className={`border rounded-xl p-4 flex flex-col min-h-[150px] relative ${isTodayColumn ? 'today-column bg-blue-50 border-blue-400 ring-2 ring-blue-400 shadow-lg shadow-blue-100/50' : 'bg-slate-50 border-slate-200'}`}>
                  {isTodayColumn && (
                    <div className="today-badge">היום / Today</div>
                  )}
                  <div className={`font-bold text-slate-700 mb-3 border-b pb-1 text-center bg-white rounded shadow-sm py-1 ${isTodayColumn ? 'border-blue-300' : ''}`}>
                    {dayTranslations[dayKey]}
                    {dayEvents.length > 0 && <span className="text-xs text-slate-400 mr-1">({dayEvents.length})</span>}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-slate-300 text-center my-auto font-light">{t.noEvents}</p>
                    ) : (
                      dayEvents.map((event, index) => (
                        <div key={index}
                          className={`group relative bg-white p-3 rounded-lg shadow-xs border-r-4 flex flex-col gap-1 hover:shadow-md transition cursor-pointer ${event.reminderMinutesBefore > 0 ? 'border-amber-400 bg-amber-50/20' : event.isSleep ? 'border-indigo-500 bg-indigo-50/30' : 'border-blue-500'}`}
                          onClick={() => handleOpenEditModal(dayKey, index)}>
                          <button onClick={e => { e.stopPropagation(); handleRemoveEvent(dayKey, index); }}
                            className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center transition">
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <div className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                            {event.isSleep && <Moon className="w-3.5 h-3.5 text-indigo-500" />}
                            {event.reminderMinutesBefore > 0 && <Bell className="w-3.5 h-3.5 text-amber-500" />}
                            {event.title}
                            <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity mr-auto" />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                            <Clock className="w-3 h-3 text-slate-400" />
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
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              <span>{LOCATION_LABELS[event.location] || event.location}</span>
                            </div>
                          )}
                          {event.recurrence && <span className="text-[10px] text-blue-500 font-medium">{recurrenceLabels[event.recurrence] || event.recurrence}</span>}
                          {event.hasAdvice && event.aiAdvice && (
                            <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">
                              <div className="flex items-start gap-1.5"><span className="text-sm">💡</span><span>{event.aiAdvice}</span></div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <MonthlyCalendar schedule={schedule} lang={lang} />
      </main>

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

                {/* Quick Actions */}
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

                {/* Free text input */}
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

      {/* Event Edit Modal with Reminder Dropdown */}
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
                {/* End Date Selector - Default: Never Ends ("forever") */}
                <div className="mt-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t.recurrenceEndLabel || 'Ends'}</label>
                  <select
                    value={editModalData.event.recurrenceEndType || 'never'}
                    onChange={e => {
                      const val = e.target.value;
                      handleEditInputChange('recurrenceEndType', val);
                      // If "never", remove any endDate; if "date", keep existing endDate
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
                    <input
                      type="date"
                      value={editModalData.event.recurrenceEndDate || ''}
                      onChange={e => handleEditInputChange('recurrenceEndDate', e.target.value)}
                      className="mt-2 w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}
                </div>
              </div>
              {/* Reminder Dropdown */}
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

      <footer className="max-w-6xl mx-auto mt-12 text-center text-xs text-slate-400 border-t pt-4">
        <p>{t.footerVersion} {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : t.footerLocal}</p>
        <button onClick={() => setShowPrivacy(true)} className="mt-2 inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 transition"><Shield className="w-3 h-3" /> {t.footerPrivacy}</button>
      </footer>

      {/* Share Booking Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowShareModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-emerald-600" /> {t.shareBookingTitle}
              </h3>
              <button onClick={() => setShowShareModal(false)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">{t.shareBookingDesc}</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">{t.shareBookingLinkLabel}</label>
              <div className="text-sm text-slate-800 font-mono break-all bg-white p-2 rounded border border-slate-200" dir="ltr">
                {bookingLink}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopyShareLink}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium transition text-sm"
              >
                {shareLinkCopied ? (
                  <><Check className="w-4 h-4" /> {t.shareBookingCopied}</>
                ) : (
                  <><Copy className="w-4 h-4" /> {t.shareBookingCopy}</>
                )}
              </button>
              <button
                onClick={handlePreviewLink}
                className="flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition text-sm font-medium"
              >
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
            {/* Android Chrome Install Prompt */}
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
            {/* iOS Safari Install Instructions */}
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
            {/* iOS Non-Safari Browser */}
            {isIosNonSafari() && !installPrompt && (
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <ExternalLink className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{t.pwaOpenInSafari}</h3>
                <p className="text-sm text-slate-500 mb-6">{t.pwaOpenInSafariDesc}</p>
                <button
                  onClick={() => {
                    const safariUrl = window.location.href;
                    window.location.href = safariUrl;
                  }}
                  className="w-full px-4 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition"
                >
                  {t.pwaOpenInSafari}
                </button>
              </div>
            )}
            {/* Dismiss button */}
            <button onClick={handleDismissPwa} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition">
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Smart PWA Install Banner (bottom toast, after 60s) */}
      {showPwaBanner && !isStandalone() && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-slide-up">
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{t.pwaInstallBanner}</p>
            </div>
            <button
              onClick={handlePwaBannerInstall}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shrink-0"
            >
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
            <button onClick={handleLogin}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg">
              {t.loginWithGoogle}
            </button>
            <button onClick={() => setShowLoginPrompt(false)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition">
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ── Guest Usage Limit Modal ── */}
      {showGuestLimitModal && !user && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]" onClick={() => setShowGuestLimitModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{t.guestLimitTitle}</h3>
            <p className="text-sm text-slate-500 mb-6">{t.guestLimitDesc}</p>
            <button onClick={handleLogin}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg flex items-center justify-center gap-2">
              <LogIn className="w-4 h-4" /> {t.loginWithGoogle}
            </button>
            <button onClick={() => { setShowGuestLimitModal(false); setShowEmailAuth(true); setAuthMode('login'); }}
              className="w-full mt-2 px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition shadow-sm flex items-center justify-center gap-2">
              <Mail className="w-4 h-4" /> {lang === 'he' ? 'התחבר עם אימייל' : 'Login with Email'}
            </button>
            <button onClick={() => setShowGuestLimitModal(false)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition">
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ── Email/Password Auth Modal ── */}
      {showEmailAuth && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]" onClick={() => setShowEmailAuth(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {authMode === 'login' ? (lang === 'he' ? 'התחברות' : 'Login') : (lang === 'he' ? 'הרשמה' : 'Register')}
              </h3>
              <button onClick={() => setShowEmailAuth(false)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {authError && (
              <div className="flex items-center gap-2 text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4" /><span>{authError}</span>
              </div>
            )}

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
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'he' ? 'סיסמה' : 'Password'}</label>
                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••" />
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
                  
                  if (!res.ok) {
                    throw new Error(data.error || 'Authentication failed');
                  }

                  // Save JWT token and user
                  setJwtToken(data.token);
                  setUser(data.user);
                  setIsPro(data.user?.isPro === true || data.user?.isPro === 'true');
                  try {
                    localStorage.setItem('calendai-isLoggedIn', 'true');
                    localStorage.setItem('calendai-user', JSON.stringify(data.user));
                  } catch (e) {}
                  
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
                <button onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }} className="text-sm text-blue-600 hover:text-blue-800">
                  {authMode === 'login'
                    ? (lang === 'he' ? 'אין לך חשבון? הירשם' : 'Don\'t have an account? Register')
                    : (lang === 'he' ? 'יש לך חשבון? התחבר' : 'Already have an account? Login')}
                </button>
              </div>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-slate-400">{lang === 'he' ? 'או' : 'or'}</span></div>
              </div>

              <button onClick={() => { setShowEmailAuth(false); handleLogin(); }}
                className="w-full px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition shadow-sm flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" /> {t.loginWithGoogle}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Wizard Modal */}
      {showWizard && (
        <MeetingWizard
          schedule={schedule}
          lang={lang}
          t={t}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <SidebarDrawer
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        schedule={schedule}
        lang={lang}
        t={t}
        user={user}
        isPro={isPro}
        onLogout={handleLogout}
        onOpenShareModal={() => setShowShareModal(true)}
        selectedLocation={profileLocation !== 'none' ? profileLocation : selectedLocation}
        onLocationChange={(loc) => {
          setProfileLocation(loc);
          try { localStorage.setItem('calendai-profile-location', loc); } catch (e) {}
        }}
      />
    </div>
    </>
  );
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}