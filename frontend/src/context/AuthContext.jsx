import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/axios';
import safeStorage from '../utils/safeStorage';

const API_BASE = import.meta.env.VITE_API_URL || '';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── JWT Token Management ──
const getJwtToken = () => {
  try { return safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt'); } catch { return null; }
};
const setJwtToken = (token) => {
  try { safeStorage.setItem('token', token); safeStorage.setItem('calendai-jwt', token); } catch (e) {}
};
const clearJwtToken = () => {
  try { safeStorage.removeItem('token'); safeStorage.removeItem('calendai-jwt'); } catch (e) {}
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true); // true until first auth check completes
  const [authStatus, setAuthStatus] = useState('checking'); // 'checking' | 'authenticated' | 'guest'

  // Guard: ensures the auth check effect runs exactly once ever
  const hasCheckedAuth = useRef(false);
  const cancelledRef = useRef(false);

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

  // ── checkAuth: single-shot auth verification (no retries, no loops) ──
  const checkAuth = useCallback(async () => {
    if (cancelledRef.current) return;

    try {
      const token = getJwtToken();

      // No token → guest, no need to call the server
      if (!token) {
        setAuthStatus('guest');
        setAuthLoading(false);
        return;
      }

      // Token exists → call /api/auth/me exactly once
      const res = await api.get(`/api/auth/me?t=${Date.now()}`, {
        cache: 'no-store',
        validateStatus: false
      });

      // ── 401 Unauthorized → clear token, mark as guest ──
      if (res.status === 401) {
        clearJwtToken();
        safeStorage.removeItem('calendai-isLoggedIn');
        setAuthStatus('guest');
        setAuthLoading(false);
        return;
      }

      // ── Any server error (5xx, 4xx) → guest, do NOT retry ──
      if (res.status >= 400) {
        const token = getJwtToken();
        setAuthStatus(token ? 'authenticated' : 'guest');
        setAuthLoading(false);
        return;
      }

      // ── 200 OK → authenticated! ──
      const data = res.data;
      if (data.user) {
        setUser(data.user);
        setIsPro(data.user?.isPro === true || data.user?.isPro === 'true');
        setIsAuthenticated(true);
        setAuthStatus('authenticated');

        // Exchange session for a JWT token to persist login
        try {
          const tokenRes = await api.post('/api/auth/token', {}, { validateStatus: false });
          if (tokenRes.data?.token) {
            setJwtToken(tokenRes.data.token);
            safeStorage.setItem('calendai-isLoggedIn', 'true');
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
      console.warn('Auth check failed (network error):', e);
      const token = getJwtToken();
      setAuthStatus(token ? 'authenticated' : 'guest');
      setAuthLoading(false);
    }
  }, [syncGuestData]);

  const handleLogin = useCallback(() => {
    window.location.href = `${API_BASE}/api/auth/google`;
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
      setUser(null);
      setIsPro(false);
      setIsAuthenticated(false);
      setAuthStatus('guest');
      safeStorage.removeItem('calendai-isLoggedIn');
      safeStorage.removeItem('calendai-user');
    } catch (err) { console.error(err); }
  }, []);

  // ── Unified Auth State Machine ──
  // Runs exactly ONCE on mount (empty dependency array, hardened with useRef).
  useEffect(() => {
    if (hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;

    let cancelled = false;
    cancelledRef.current = false;

    // Parse initial URL intent
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const authFailed = params.get('auth') === 'failed';
    const isAuthCallback = params.get('login') === 'success' || params.get('auth') === 'success';

    // ── Step 1: Extract token from URL query params (OAuth callback) ──
    if (urlToken) {
      setJwtToken(urlToken);
      safeStorage.setItem('calendai-isLoggedIn', 'true');
      try {
        localStorage.setItem('token', urlToken);
        localStorage.setItem('calendai-jwt', urlToken);
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
    const verifyAuth = async () => {
      const token = getJwtToken();
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const res = await api.get(`/api/auth/me?t=${Date.now()}`, {
          cache: 'no-store',
          validateStatus: false
        });
        if (res.status === 200 && res.data) {
          setUser(res.data.user || res.data);
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.warn('Auth check failed', err);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    verifyAuth();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, []); // מערך תלויות ריק לחלוטין!

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