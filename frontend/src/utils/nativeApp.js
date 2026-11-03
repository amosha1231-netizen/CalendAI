/**
 * Native app (Capacitor iOS/Android) helpers.
 *
 * Google blocks OAuth inside embedded web views, so in the native app the
 * sign-in page opens in the system browser sheet. The backend then sends the
 * user back with a custom-scheme link (com.amos.calendai://auth?oauth_code=...)
 * that we turn into the same /?oauth_code=... URL the web flow already handles.
 *
 * Everything here is lazy and wrapped in try/catch: it is safe to import on
 * the web, where every function is a no-op.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

/** True only inside the iOS app (Sign in with Apple is offered there). */
export function isIosApp() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch (e) {
    return false;
  }
}

// Native side: frontend/ios/App/App/SignInWithApplePlugin.swift
let appleSignInPlugin = null;
function getAppleSignInPlugin() {
  if (!appleSignInPlugin) appleSignInPlugin = registerPlugin('SignInWithApple');
  return appleSignInPlugin;
}

/**
 * Runs the native Sign in with Apple sheet and exchanges Apple's identity
 * token for a CalendAI session.
 * Resolves to { token, user }, or null when the user cancelled the sheet.
 */
export async function signInWithApple(apiBase) {
  let result;
  try {
    result = await getAppleSignInPlugin().authorize();
  } catch (e) {
    if (e && (e.code === 'CANCELED' || /cancel/i.test(String(e.message || '')))) return null;
    throw e;
  }
  const res = await fetch(`${apiBase}/api/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identityToken: result?.identityToken,
      givenName: result?.givenName || '',
      familyName: result?.familyName || '',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Apple sign-in failed');
    err.code = data.error;
    throw err;
  }
  return data;
}

/** Navigate to an OAuth start URL (Google / Microsoft) in the right place. */
export function startOAuth(url) {
  if (!isNativeApp()) {
    window.location.href = url;
    return;
  }
  const nativeUrl = `${url}${url.includes('?') ? '&' : '?'}platform=native`;
  Browser.open({ url: nativeUrl, presentationStyle: 'popover' }).catch((e) => {
    console.warn('[Native] Could not open sign-in browser:', e);
  });
}

let deepLinksInstalled = false;

/** Call once at startup. Hands OAuth return links to the web app's URL handling. */
export function installNativeDeepLinks() {
  if (deepLinksInstalled || !isNativeApp()) return;
  deepLinksInstalled = true;
  try {
    CapApp.addListener('appUrlOpen', ({ url }) => {
      try {
        const queryStart = typeof url === 'string' ? url.indexOf('?') : -1;
        if (queryStart === -1) return;
        const params = new URLSearchParams(url.slice(queryStart + 1));
        if (!params.get('oauth_code') && !params.get('error')) return;
        Browser.close().catch(() => {});
        window.location.href = `/?${params.toString()}`;
      } catch (e) {
        console.warn('[Native] Bad app URL:', e);
      }
    });
  } catch (e) {
    console.warn('[Native] Deep link listener failed:', e);
  }
}
