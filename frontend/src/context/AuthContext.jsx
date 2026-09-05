import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/axios';
import safeStorage from '../utils/safeStorage';
import { normalizeUserCredits } from '../utils/credits';

const API_BASE = import.meta.env.VITE_API_URL || '';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── JWT Decode helper (client-side expiry check) ──
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (e) {
    return null;
  }
}

function isJwtExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

// ── JWT Token Management ──
// CRITICAL: Always persist to BOTH safeStorage AND localStorage directly.
// safeStorage wraps localStorage with try/catch but has an in-memory fallback
// (Map) that is LOST on page reload. Direct localStorage access ensures
// the token survives tab closes, page refreshes, and cross-tab navigation.
const getJwtToken = () => {
  try {
    // First try: safeStorage (reads from localStorage with fallback)
    const fromSafe = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
    if (fromSafe) return fromSafe;

    // SECOND try: localStorage directly (catches cases where safeStorage
    // fell back to in-memory store but localStorage is actually available)
    try {
      const fromLocal = localStorage.getItem('token') || localStorage.getItem('calendai-jwt');
      if (fromLocal) return fromLocal;
    } catch (e) {
      // localStorage unavailable
    }

    return null;
  } catch { return null; }
};

const setJwtToken = (token) => {
  try {
    // Save to safeStorage (which tries localStorage first)
    safeStorage.setItem('token', token);
    safeStorage.setItem('calendai-jwt', token);
  } catch (e) {}

  try {
    // ALWAYS save directly to localStorage as well (belt AND suspenders)
    localStorage.setItem('token', token);
    localStorage.setItem('calendai-jwt', token);
  } catch (e) {
    // localStorage may be unavailable (private mode)
  }
};

const clearJwtToken = () => {
  try {
    safeStorage.removeItem('token');
    safeStorage.removeItem('calendai-jwt');
  } catch (e) {}

  try {
    localStorage.removeItem('token');
    localStorage.removeItem('calendai-jwt');
  } catch (e) {
    // localStorage may be unavailable
  }
};

export function AuthProvider({ children }) {
  // ── Safe setUser wrapper: ALWAYS normalizes aiCredits to a plain number ──
  const [user, setUserRaw] = useState(() => {
    try {
      const savedUser = safeStorage.getItem('calendai-user');
      if (!savedUser) return null;
      const parsed = JSON.parse(savedUser);
      const normalized = normalizeUserCredits(parsed);
      // If the raw value was different from the normalized value, update the cache
      if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
        safeStorage.setItem('calendai-user', JSON.stringify(normalized));
        try { localStorage.setItem('calendai-user', JSON.stringify(normalized)); } catch (e) {}
      }
      return normalized;
    } catch (e) {
      return null;
    }
  });
  const setUser = useCallback((userOrUpdater) => {
    setUserRaw(prev => {
      const next = typeof userOrUpdater === 'function' ? userOrUpdater(prev) : userOrUpdater;
      return normalizeUserCredits(next);
    });
  }, []);
  const [isPro, setIsPro] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = getJwtToken();
    // Only mark as authenticated if the token is not expired
    if (token && !isJwtExpired(token)) return true;
    return false;
  });
  const [authLoading, setAuthLoading] = useState(true); // true until first auth check completes
  const [authStatus, setAuthStatus] = useState('checking'); // 'checking' | 'authenticated' | 'guest'

  // Guard: ensures the initial mount auth check effect runs exactly once
  const hasCheckedAuth = useRef(false);

  // ── Sync guest temp data to backend after login ──
  const syncGuestData = useCallback(async () => {
    try {
      const raw = safeStorage.getItem('calendai-guest-temp-data');
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

      safeStorage.removeItem('calendai-guest-temp-data');
      safeStorage.removeItem('calendai-guest-usage-count');
    } catch (e) {
      console.error('Failed to sync guest data:', e);
    }
  }, []);

  // ── verifyAuthWithServer: single-shot auth verification ──
  // Does NOT clear state on transient errors. Only clears on confirmed expired token.
  const verifyAuthWithServer = useCallback(async () => {
    const token = getJwtToken();

    // No token → guest, no need to call the server
    if (!token) {
      setAuthStatus('guest');
      setAuthLoading(false);
      return;
    }

    // Token exists but is expired locally → clear immediately
    if (isJwtExpired(token)) {
      clearJwtToken();
      safeStorage.removeItem('calendai-isLoggedIn');
      safeStorage.removeItem('calendai-user');
      localStorage.removeItem('calendai-isLoggedIn');
      localStorage.removeItem('calendai-user');
      setUserRaw(null);
      setIsAuthenticated(false);
      setAuthStatus('guest');
      setAuthLoading(false);
      return;
    }

    // Token exists and is not expired → call /api/auth/me exactly once
    try {
      const res = await api.get(`/api/auth/me?t=${Date.now()}`, {
        cache: 'no-store',
        validateStatus: false
      });

      // ── 401 Unauthorized → check if token is actually expired before clearing ──
      if (res.status === 401) {
        // The axios interceptor already checked this and kept the token if valid.
        // Do a double-check here: if token is still valid, keep the user logged in
        // with cached data. The server may be cold-starting or the session cookie
        // was cleared by iOS.
        const currentToken = getJwtToken();
        if (currentToken && !isJwtExpired(currentToken)) {
          // Token is valid → keep the optimistic auth state
          // The user stays logged in with cached data until the server recovers.
          console.warn('[AuthContext] 401 from server but JWT is still valid. Keeping auth state.');
          setAuthStatus('authenticated');
          setAuthLoading(false);
          return;
        }

        // Token is actually expired → clear everything
        clearJwtToken();
        safeStorage.removeItem('calendai-isLoggedIn');
        safeStorage.removeItem('calendai-user');
        localStorage.removeItem('calendai-isLoggedIn');
        localStorage.removeItem('calendai-user');
        setUserRaw(null);
        setIsAuthenticated(false);
        setAuthStatus('guest');
        setAuthLoading(false);
        return;
      }

      // ── Any server error (5xx, 4xx that is not 401) → token may be valid but server is down/temp error
      // Do NOT clear token, do NOT log out user. Keep existing state.
      if (res.status >= 400) {
        // Keep the token and user data - server might be waking up or having a transient error
        setAuthStatus('authenticated');
        setAuthLoading(false);
        return;
      }

      // ── 200 OK → authenticated! ──
      const data = res.data;
      if (data.user) {
        const normalizedUser = normalizeUserCredits(data.user);
        setUserRaw(normalizedUser);
        setIsPro(data.user?.isPro === true || data.user?.isPro === 'true');
        setIsAuthenticated(true);
        setAuthStatus('authenticated');

        // Save user data to localStorage for persistence across app restarts
        try {
          safeStorage.setItem('calendai-user', JSON.stringify(normalizedUser));
          localStorage.setItem('calendai-user', JSON.stringify(normalizedUser));
        } catch (e) {}

        // Exchange session for a JWT token to persist login
        try {
          const tokenRes = await api.post('/api/auth/token', {}, { validateStatus: false });
          if (tokenRes.data?.token) {
            setJwtToken(tokenRes.data.token);
            safeStorage.setItem('calendai-isLoggedIn', 'true');
            localStorage.setItem('calendai-isLoggedIn', 'true');
          }
        } catch (tokenErr) {
          console.error('Failed to exchange session for JWT:', tokenErr);
        }

        // Sync guest data to backend
        syncGuestData();
        setAuthLoading(false);
      } else {
        // Response missing user → guest
        setAuthStatus('guest');
        setAuthLoading(false);
      }
    } catch (e) {
      // Network error → do NOT clear token, do NOT retry
      // Keep the user logged in with cached data
      console.warn('Auth check failed (network error):', e);
      const token = getJwtToken();
      if (token && !isJwtExpired(token)) {
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('guest');
      }
      setAuthLoading(false);
    }
  }, [syncGuestData]);

  const handleLogin = useCallback((lang) => {
    const baseUrl = `${API_BASE}/api/auth/google`;
    const url = lang ? `${baseUrl}?lang=${lang}` : baseUrl;
    window.location.href = url;
  }, []);

  // ── Set Authorization header from localStorage token on app init ──
  useEffect(() => {
    const token = getJwtToken();
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch (err) { console.error(err); }
    setUserRaw(null);
    setIsPro(false);
    setIsAuthenticated(false);
    setAuthStatus('guest');
    clearJwtToken();
    safeStorage.removeItem('calendai-isLoggedIn');
    safeStorage.removeItem('calendai-user');
    localStorage.removeItem('calendai-isLoggedIn');
    localStorage.removeItem('calendai-user');
  }, []);

  // ── Safety Fallback Timer ──
  // Forces loading to false after 3 seconds to prevent infinite loading state.
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setAuthLoading(false);
    }, 3000);
    return () => clearTimeout(safetyTimer);
  }, []);

  // ── Unified Auth State Machine ──
  // Runs exactly ONCE on mount (empty dependency array, hardened with useRef).
  useEffect(() => {
    if (hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;

    // Parse initial URL intent
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const authFailed = params.get('auth') === 'failed';
    const isAuthCallback = params.get('login') === 'success' || params.get('auth') === 'success';

    // ── Step 1: Extract token from URL query params (OAuth callback) ──
    if (urlToken) {
      // Save token to ALL storage locations (safeStorage, localStorage)
      setJwtToken(urlToken);
      safeStorage.setItem('calendai-isLoggedIn', 'true');
      try {
        localStorage.setItem('calendai-isLoggedIn', 'true');
      } catch (e) {}
      api.defaults.headers.common['Authorization'] = `Bearer ${urlToken}`;
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      url.searchParams.delete('auth');
      url.searchParams.delete('login');
      url.searchParams.delete('error');
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }

    // Handle auth failure from OAuth callback
    if (authFailed) {
      setAuthStatus('guest');
      setAuthLoading(false);
      return;
    }

    // Clean URL for auth callback without token
    if (isAuthCallback && !urlToken) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // ── Step 2: Check auth with the token from localStorage ──
    const doInitialAuth = async () => {
      const token = getJwtToken();
      if (!token) {
        setAuthStatus('guest');
        setAuthLoading(false);
        return;
      }

      // ── IMMEDIATE PERSISTENCE: Token exists → mark auth as true right away ──
      // This prevents the flash of "loading" state on every page refresh.
      // The user data will be fetched in the background and updated when ready.
      setIsAuthenticated(true);
      setAuthLoading(false);
      setAuthStatus('authenticated');

      // Try to restore cached user data from localStorage for instant display
      try {
        const cachedUser = safeStorage.getItem('calendai-user');
        if (cachedUser) {
          const parsed = normalizeUserCredits(JSON.parse(cachedUser));
          setUserRaw(parsed);
          setIsPro(parsed?.isPro === true || parsed?.isPro === 'true');
        }
      } catch (e) {}

      // ── Background fetch: refresh user data from server ──
      // This runs asynchronously — the UI is already marked as authenticated
      // so the user sees the dashboard immediately while data refreshes in the background.
      try {
        const res = await api.get(`/api/auth/me?t=${Date.now()}`, {
          cache: 'no-store',
          validateStatus: false
        });
        if (res.status === 200 && res.data) {
          const userData = res.data.user || res.data;
          const normalizedUserData = normalizeUserCredits(userData);
          setUserRaw(normalizedUserData);
          setIsAuthenticated(true);
          setAuthStatus('authenticated');
          // Save user data to localStorage for persistence
          try {
            safeStorage.setItem('calendai-user', JSON.stringify(normalizedUserData));
            localStorage.setItem('calendai-user', JSON.stringify(normalizedUserData));
          } catch (e) {}
        } else if (res.status === 401) {
          // 401 Unauthorized → check if token is actually expired
          const currentToken = getJwtToken();
          if (currentToken && !isJwtExpired(currentToken)) {
            // Token is still valid → keep the optimistic auth state
            console.warn('[AuthContext:init] 401 from server but JWT is still valid. Keeping auth state.');
            return;
          }
          // Token is actually expired → clear
          clearJwtToken();
          safeStorage.removeItem('calendai-isLoggedIn');
          safeStorage.removeItem('calendai-user');
          localStorage.removeItem('calendai-isLoggedIn');
          localStorage.removeItem('calendai-user');
          setUserRaw(null);
          setIsAuthenticated(false);
          setAuthStatus('guest');
        }
        // On any other status (5xx, etc.) — keep the optimistic auth state;
        // the user stays logged in with cached data until the server recovers.
      } catch (err) {
        // Network error → keep existing auth state, don't clear anything
        console.warn('Auth check failed (network error):', err);
        // auth state remains 'authenticated' from the optimistic set above
      }
    };

    doInitialAuth();
  }, []); // מערך תלויות ריק לחלוטין!

  // ── VISIBILITY CHANGE HANDLER ──
  // CRITICAL: When the user switches away from the app (e.g., to another tab or app on iOS)
  // and comes back, the iOS Safari WebView may have cleared the session cookie.
  // This handler re-validates the auth state by calling /api/auth/me.
  // If the server returns a 200 with valid user data, the session is refreshed.
  // If the server returns 401 but the JWT is still valid, we keep the auth state.
  useEffect(() => {
    let isChecking = false;

    const handleVisibilityChange = async () => {
      // Only check when the page becomes visible again (user returns to the app)
      if (document.hidden) return;
      if (isChecking) return;
      isChecking = true;

      // Add a small delay to let the network settle (iOS Safari needs this)
      await new Promise(resolve => setTimeout(resolve, 200));

      const token = getJwtToken();
      if (!token) {
        isChecking = false;
        return;
      }

      // Check if token is expired locally first
      if (isJwtExpired(token)) {
        console.warn('[AuthContext:visibility] Token expired. Clearing state.');
        clearJwtToken();
        setUserRaw(null);
        setIsAuthenticated(false);
        setAuthStatus('guest');
        isChecking = false;
        return;
      }

      // Token is valid → verify with the server
      try {
        const res = await api.get(`/api/auth/me?t=${Date.now()}`, {
          cache: 'no-store',
          validateStatus: false
        });

        if (res.status === 200 && res.data?.user) {
          // Server confirmed the user is authenticated
          const normalizedUser = normalizeUserCredits(res.data.user);
          setUserRaw(normalizedUser);
          setIsAuthenticated(true);
          setIsPro(res.data.user?.isPro === true || res.data.user?.isPro === 'true');
          setAuthStatus('authenticated');
          // Save user data to localStorage
          try {
            safeStorage.setItem('calendai-user', JSON.stringify(normalizedUser));
            localStorage.setItem('calendai-user', JSON.stringify(normalizedUser));
          } catch (e) {}
        } else if (res.status === 401) {
          // Server returned 401 but JWT is still valid (checked above)
          // This means the server's session was lost (e.g., Render cold start, iOS cookie clear)
          // Keep the user logged in — the JWT will be re-validated on next request
          console.warn('[AuthContext:visibility] Server returned 401 but JWT is valid. Keeping auth state.');
        } else {
          // Any other status (5xx, etc.) → keep the auth state
          console.warn(`[AuthContext:visibility] Server returned ${res.status}. Keeping auth state.`);
        }
      } catch (err) {
        // Network error → keep the auth state
        console.warn('[AuthContext:visibility] Network error during re-validation. Keeping auth state.', err);
      }

      isChecking = false;
    };

    // Listen for visibility changes (page becomes visible after being hidden)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also listen for the 'pageshow' event which fires when the page is loaded from the
    // bfcache (back/forward cache) on iOS Safari. This is CRITICAL because iOS Safari
    // may keep the page in bfcache and restore it without a full reload.
    window.addEventListener('pageshow', handleVisibilityChange);

    // Listen for 'focus' event on the window as a fallback for iOS Safari's
    // WebView behavior where 'visibilitychange' may not fire reliably.
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);

  // ── EXPOSE checkAuth to allow manual re-validation (e.g., after a 401 on a non-auth endpoint) ──
  // This is a lightweight check that looks at the stored token without calling the server.
  const checkAuth = useCallback(() => {
    const token = getJwtToken();
    if (token && !isJwtExpired(token)) {
      setIsAuthenticated(true);
      setAuthStatus('authenticated');
      return true;
    }
    setIsAuthenticated(false);
    setAuthStatus('guest');
    return false;
  }, []);

  const value = {
    user,
    isPro,
    isAuthenticated,
    authLoading,
    authStatus,
    handleLogin,
    handleLogout,
    setUser,
    setIsPro,
    setIsAuthenticated,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;