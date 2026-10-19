/**
 * Web Push for reminders (see public/sw.js and backend/routes/reminderRoutes.js).
 *
 * Everything here is lazy and guarded: nothing touches window / navigator /
 * Notification at import time, and every call is wrapped so iOS Safari and the
 * Capacitor app (which has no Web Push) degrade to in-app pings.
 */
import api from '../api/axios';

function isNativeApp() {
  try {
    return typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (e) {
    return false;
  }
}

/** iPhone/iPad Safari only allows Web Push for apps added to the Home Screen. */
export function needsHomeScreenInstall() {
  try {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    return ios && !standalone;
  } catch (e) {
    return false;
  }
}

export function isPushSupported() {
  try {
    return !isNativeApp()
      && typeof window !== 'undefined'
      && typeof navigator !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && typeof Notification !== 'undefined'
      && window.isSecureContext !== false;
  } catch (e) {
    return false;
  }
}

export function getNotificationPermission() {
  try {
    return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  } catch (e) {
    return 'unsupported';
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** The current browser's push subscription, or null. */
export async function getCurrentSubscription() {
  try {
    if (!isPushSupported()) return null;
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch (e) {
    return null;
  }
}

/**
 * Ask for permission (must run from a tap), subscribe, and register with the server.
 * @returns {Promise<'subscribed'|'denied'|'unsupported'|'unavailable'|'error'>}
 */
export async function enablePush(publicKey) {
  if (!isPushSupported()) return 'unsupported';
  if (!publicKey) return 'unavailable';
  try {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const reg = await getRegistration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    }
    await api.post('/api/reminders/push/subscribe', { subscription: sub.toJSON() });
    return 'subscribed';
  } catch (e) {
    console.warn('[push] enable failed', e);
    return 'error';
  }
}

export async function disablePush() {
  try {
    const sub = await getCurrentSubscription();
    if (!sub) return;
    await api.post('/api/reminders/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  } catch (e) {}
}

/** Re-send an existing subscription (keeps the server in sync after sign-in on this browser). */
export async function syncExistingSubscription() {
  try {
    const sub = await getCurrentSubscription();
    if (sub) await api.post('/api/reminders/push/subscribe', { subscription: sub.toJSON() });
    return !!sub;
  } catch (e) {
    return false;
  }
}
