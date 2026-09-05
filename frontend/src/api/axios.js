import axios from 'axios';
import safeStorage from '../utils/safeStorage';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── JWT Decode helper (without importing a library) ──
// Decodes the payload of a JWT token to check expiry.
// Returns null if the token is malformed or invalid.
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

// ── Check if a JWT token is expired by inspecting its `exp` claim ──
function isJwtExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true; // no expiry → treat as expired
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

// ── Get the JWT token from storage (safeStorage → localStorage) ──
function getStoredToken() {
  let token = null;
  try {
    token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
    if (!token) {
      try {
        token = localStorage.getItem('token') || localStorage.getItem('calendai-jwt');
      } catch (e) {}
    }
  } catch (e) {}
  return token;
}

// ── Request Interceptor ──
// Reads the JWT token from storage on EVERY outgoing request.
// Falls back to direct localStorage read if safeStorage returns null.
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor ──
// CRITICAL: Handles 401 Unauthorized responses gracefully.
// 
// BEHAVIOR:
// - For `/api/auth/me` 401 errors: the JWT token is checked locally.
//   If the JWT is NOT expired, the token is KEPT (server may be cold-starting).
//   Only if the JWT IS expired do we clear the token and user state.
// - For other endpoints 401 errors: the token is NOT cleared.
//   The calling code handles the error appropriately.
// - For 403 errors: same as 401 for non-auth endpoints.
// - Network errors and 5xx: NEVER clear the token.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only handle 401/403 HTTP status codes
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      const requestUrl = error.config?.url || '';
      const isAuthEndpoint = requestUrl.includes('/api/auth/me') || requestUrl.includes('/api/auth/verify');

      if (isAuthEndpoint) {
        // ── Auth endpoint 401: check token expiry locally before clearing ──
        const token = getStoredToken();
        if (token && !isJwtExpired(token)) {
          // Token is still valid (not expired) → server may be cold-starting or
          // the session cookie was cleared by iOS while the JWT remains valid.
          // DO NOT clear the token. The app will retry on next visibility change.
          console.warn('[axios] 401 on auth endpoint but JWT is not expired. Keeping token.');
        } else {
          // Token is expired or missing → safe to clear
          console.warn('[axios] 401 on auth endpoint and JWT is expired. Clearing token.');
          try {
            safeStorage.removeItem('token');
            safeStorage.removeItem('calendai-jwt');
            safeStorage.removeItem('calendai-isLoggedIn');
          } catch (e) {}
        }
      }
      // For non-auth endpoints (e.g., /api/schedule, /api/parse-schedule),
      // we NEVER clear the token on 401. The calling code handles the error.
      // This prevents the Render server cold-start issue where the server
      // returns 401 due to missing session cookie but the JWT is still valid.
    }

    return Promise.reject(error);
  }
);

export default api;