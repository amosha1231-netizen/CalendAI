/**
 * Sign in with Apple, iPhone app only.
 *
 * App Store guideline 4.8: an app that offers Google / Microsoft login must
 * also offer Sign in with Apple. It runs through Apple's own native sheet (a
 * small plugin inside the iOS project: ios/App/App/AppleSignInPlugin.swift),
 * then the server checks Apple's signed token and hands back the same one-time
 * oauth_code the Google / Microsoft flows use.
 *
 * Hidden on the web and on Android. Everything is lazy and wrapped in
 * try/catch, so importing this on the web is safe.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

let plugin = null;
function getPlugin() {
  if (!plugin) plugin = registerPlugin('AppleSignIn');
  return plugin;
}

/** True only inside the iOS app, where the native Apple sheet exists. */
export function isAppleSignInAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch (e) {
    return false;
  }
}

function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Runs the whole sign-in. Resolves to null when the person closed Apple's
 * sheet, to { error } on failure, and on success sends the app to
 * /?oauth_code=... (handled by the existing OAuth code exchange).
 */
export async function signInWithApple() {
  if (!isAppleSignInAvailable()) return { error: 'apple_auth_failed' };
  const nonce = randomNonce();
  let result;
  try {
    result = await getPlugin().authorize({ nonce });
  } catch (e) {
    if (e && e.code === 'canceled') return null;
    console.warn('[Apple] Sign-in sheet failed:', e);
    return { error: 'apple_auth_failed' };
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/apple/native`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: result.identityToken,
        authorizationCode: result.authorizationCode || '',
        givenName: result.givenName || '',
        familyName: result.familyName || '',
        nonce
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.oauthCode) return { error: body.error || 'apple_auth_failed' };
    window.location.href = `/?oauth_code=${encodeURIComponent(body.oauthCode)}&login=success`;
    return { ok: true };
  } catch (e) {
    console.warn('[Apple] Sign-in failed:', e);
    return { error: 'apple_auth_failed' };
  }
}
