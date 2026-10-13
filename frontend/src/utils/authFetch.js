/**
 * Auth Fetch
 *
 * Frontend and backend live on different onrender.com subdomains, which are
 * different *sites* (onrender.com is on the Public Suffix List). iOS Safari
 * blocks cross-site cookies, so `credentials: "include"` alone does not
 * identify the user there: the backend falls back to the shared 'anonymous'
 * schedule. Many call sites only send the cookie, so this wraps window.fetch
 * once and adds the stored JWT as a Bearer token to every request aimed at
 * our own API. Requests to any other host are left untouched, so the token
 * never leaks to third parties.
 */
import safeStorage from './safeStorage';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

function getToken() {
  try {
    return safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt') || '';
  } catch (e) {
    return '';
  }
}

function isOwnApiUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  if (url.startsWith('/api/')) return true;
  if (API_BASE && url.startsWith(`${API_BASE}/api/`)) return true;
  try {
    if (typeof window !== 'undefined' && window.location) {
      const parsed = new URL(url, window.location.href);
      return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
    }
  } catch (e) {}
  return false;
}

export function installAuthFetch() {
  try {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    if (window.fetch.__calendaiAuth) return;

    const originalFetch = window.fetch.bind(window);

    const authFetch = (input, init) => {
      try {
        const isRequest = typeof Request !== 'undefined' && input instanceof Request;
        const url = isRequest ? input.url : String(input);
        if (!isOwnApiUrl(url)) return originalFetch(input, init);

        const token = getToken();
        if (!token) return originalFetch(input, init);

        const headers = new Headers((init && init.headers) || (isRequest ? input.headers : undefined));
        if (headers.has('Authorization')) return originalFetch(input, init);
        headers.set('Authorization', `Bearer ${token}`);

        return originalFetch(input, { ...(init || {}), headers });
      } catch (e) {
        return originalFetch(input, init);
      }
    };
    authFetch.__calendaiAuth = true;
    window.fetch = authFetch;
  } catch (e) {
    // Never block app start-up over this.
  }
}
