/**
 * Sign-in for the home-screen web app on iPhone ("Add to Home Screen").
 *
 * Google sign-in has to leave the app's address, and iOS finishes it in an
 * in-app browser with its own storage. The login token lands there, never in
 * the home-screen app, so every launch asked to sign in again. Instead, before
 * leaving, the app keeps a random secret and sends only its hash; the server
 * leaves the finished login waiting under that hash, and the app collects it
 * with the secret as soon as it is back in front.
 *
 * All browser access is lazy and wrapped in try/catch (iOS rules in CLAUDE.md).
 */
import safeStorage from './safeStorage';

const PENDING_KEY = 'calendai-pwa-login';
const MAX_AGE_MS = 10 * 60 * 1000;
const API_BASE = import.meta.env.VITE_API_URL || '';

export function isStandaloneWebApp() {
  try {
    if (typeof window === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch (e) {
    return false;
  }
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Returns the hash to send as ?pwa_poll=, or null when not needed/possible. */
export async function preparePwaLogin() {
  try {
    if (!isStandaloneWebApp()) return null;
    if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) return null;
    const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const hash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)));
    try { safeStorage.setItem(PENDING_KEY, JSON.stringify({ secret, at: Date.now() })); } catch (e) {}
    return hash;
  } catch (e) {
    return null;
  }
}

function readPending() {
  try {
    const raw = safeStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    if (!pending?.secret || !(Date.now() - Number(pending.at) < MAX_AGE_MS)) {
      clearPwaLogin();
      return null;
    }
    return pending;
  } catch (e) {
    clearPwaLogin();
    return null;
  }
}

export function hasPendingPwaLogin() {
  return !!readPending();
}

export function clearPwaLogin() {
  try { safeStorage.removeItem(PENDING_KEY); } catch (e) {}
}

/** Asks the server once for the waiting login. Resolves to a token or null. */
export async function claimPwaLogin() {
  const pending = readPending();
  if (!pending) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/oauth-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: pending.secret }),
      cache: 'no-store'
    });
    if (res.status !== 200) return null;
    const data = await res.json();
    if (typeof data?.token !== 'string' || !data.token) return null;
    clearPwaLogin();
    return data.token;
  } catch (e) {
    return null;
  }
}
