/**
 * Browser Detection Utility
 * 
 * Detects various browser environments, especially iOS in-app browsers
 * (WhatsApp, Facebook, Instagram, etc.) that may have limited localStorage
 * and cookie support.
 */

/**
 * Check if the current browser is iOS Safari (standalone or regular)
 */
export function isIosSafari() {
  try {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIos = /iPhone|iPad|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|OPiOS|mercury/.test(ua);
    return isIos && isSafari;
  } catch (e) {
    return false;
  }
}

/**
 * Check if the current browser is iOS non-Safari (Chrome, Firefox, etc.)
 */
export function isIosNonSafari() {
  try {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIos = /iPhone|iPad|iPod/.test(ua);
    const isNotSafari = !(/Safari/.test(ua) && !/Chrome|CriOS|FxiOS|OPiOS|mercury/.test(ua));
    return isIos && isNotSafari;
  } catch (e) {
    return false;
  }
}

/**
 * Detect iOS WhatsApp in-app browser (WKWebView)
 * WhatsApp on iOS uses a WKWebView that blocks localStorage and has limited cookie support.
 */
export function isIosWhatsApp() {
  try {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isWhatsApp = /WhatsApp/i.test(ua);
    return isIos && isWhatsApp;
  } catch (e) {
    return false;
  }
}

/**
 * Detect iOS Facebook/Messenger in-app browser
 */
export function isIosFacebook() {
  try {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isFB = /FBAN|FBAV|FBIOS|FB_IAB|FB4A/i.test(ua);
    return isIos && isFB;
  } catch (e) {
    return false;
  }
}

/**
 * Detect iOS Instagram in-app browser
 */
export function isIosInstagram() {
  try {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isIG = /Instagram/i.test(ua);
    return isIos && isIG;
  } catch (e) {
    return false;
  }
}

/**
 * Detect any iOS in-app browser (WhatsApp, Facebook, Instagram, etc.)
 */
export function isIosInAppBrowser() {
  try {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isInApp = /WhatsApp|FBAN|FBAV|FBIOS|FB_IAB|FB4A|Instagram/i.test(ua);
    return isIos && isInApp;
  } catch (e) {
    return false;
  }
}

/**
 * Check if already in standalone mode (PWA)
 */
export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch (e) {
    return false;
  }
}

/**
 * Get a human-readable description of the current browser environment
 */
export function getBrowserDescription() {
  try {
    const ua = navigator.userAgent || '';
    if (isIosWhatsApp()) return 'iOS WhatsApp';
    if (isIosFacebook()) return 'iOS Facebook';
    if (isIosInstagram()) return 'iOS Instagram';
    if (isIosSafari()) return 'iOS Safari';
    if (isIosNonSafari()) return 'iOS Browser';
    if (/Chrome/.test(ua)) return 'Chrome';
    if (/Firefox/.test(ua)) return 'Firefox';
    if (/Safari/.test(ua)) return 'Safari';
    return 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}