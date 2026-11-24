/**
 * Sign in with Apple (iOS app only).
 *
 * The native side is a small plugin inside the Xcode project
 * (ios/App/App/AppleSignInPlugin.swift). It returns Apple's identity token,
 * which the backend verifies at /api/auth/apple. Apple requires this option
 * whenever the app also offers Google / Microsoft sign-in (guideline 4.8).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

let plugin = null;
function getPlugin() {
  if (!plugin) plugin = registerPlugin('AppleSignIn');
  return plugin;
}

export function isAppleSignInAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch (e) {
    return false;
  }
}

/**
 * Runs the Apple sheet and signs in with our backend.
 * Resolves to { token, user }, or null when the person cancels.
 */
export async function signInWithApple(apiBase) {
  let result;
  try {
    result = await getPlugin().authorize();
  } catch (e) {
    if (e && (e.code === 'canceled' || /cancel/i.test(String(e.message || '')))) return null;
    throw e;
  }
  const res = await fetch(`${apiBase}/api/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identityToken: result?.identityToken,
      givenName: result?.givenName || '',
      familyName: result?.familyName || ''
    })
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || 'Apple sign-in failed');
    err.code = data.code;
    throw err;
  }
  return data;
}
