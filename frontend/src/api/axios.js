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

// ── Request Interceptor ──
// Reads the JWT token from safeStorage on EVERY outgoing request.
// This ensures that after a page refresh, the token is always sent
// with the /api/auth/me call and any other authenticated request.
// CRITICAL: Falls back to direct localStorage read if safeStorage returns null,
// because safeStorage may have fallen back to its in-memory Map on a previous
// session, which is lost on page reload.
api.interceptors.request.use(
  (config) => {
    let token = null;
    try {
      // First try: safeStorage (reads from localStorage with in-memory fallback)
      token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
      if (!token) {
        // Second try: localStorage directly (survives page reloads)
        try {
          token = localStorage.getItem('token') || localStorage.getItem('calendai-jwt');
        } catch (e) {
          // localStorage unavailable
        }
      }
    } catch (e) {
      // storage unavailable
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor ──
// On 401 Unauthorized, clear the token from storage.
// On other errors (network, 5xx, etc.), do NOT clear the token.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Only clear token on explicit 401/403 Unauthorized
      try {
        safeStorage.removeItem('token');
        safeStorage.removeItem('calendai-jwt');
        safeStorage.removeItem('calendai-isLoggedIn');
      } catch (e) {
        // storage unavailable
      }
    }
    return Promise.reject(error);
  }
);

export default api;