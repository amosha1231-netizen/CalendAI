/**
 * Lemon Squeezy checkout helper.
 *
 * Opens the checkout as an overlay inside CalendAI (Lemon.js), so the user
 * never leaves the app and keeps their login. If Lemon.js cannot load, falls
 * back to a full-page redirect; the backend sets a redirect_url that brings
 * the buyer back to this app with ?payment=success.
 */

const LEMON_JS_URL = 'https://app.lemonsqueezy.com/js/lemon.js';

// Window event the app listens to so it can refresh the user's credits.
export const CREDITS_PURCHASED_EVENT = 'calendai:credits-purchased';

export function notifyCreditsPurchased() {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CREDITS_PURCHASED_EVENT));
  } catch (e) {}
}

let lemonLoadPromise = null;

function loadLemonJs() {
  if (lemonLoadPromise) return lemonLoadPromise;
  lemonLoadPromise = new Promise((resolve, reject) => {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        reject(new Error('No browser environment'));
        return;
      }
      if (window.LemonSqueezy) {
        resolve(window.LemonSqueezy);
        return;
      }
      const script = document.createElement('script');
      script.src = LEMON_JS_URL;
      script.defer = true;
      const timer = setTimeout(() => reject(new Error('Lemon.js load timeout')), 8000);
      script.onload = () => {
        clearTimeout(timer);
        try {
          if (typeof window.createLemonSqueezy === 'function') window.createLemonSqueezy();
        } catch (e) {}
        if (window.LemonSqueezy) resolve(window.LemonSqueezy);
        else reject(new Error('Lemon.js unavailable'));
      };
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Lemon.js failed to load'));
      };
      document.head.appendChild(script);
    } catch (e) {
      reject(e);
    }
  }).catch((err) => {
    lemonLoadPromise = null; // allow a retry next time
    throw err;
  });
  return lemonLoadPromise;
}

/**
 * Parse the /create-checkout response without throwing on an empty or HTML body
 * (e.g. the Vite dev proxy answers 500 with no body when the backend is down).
 * @returns {Promise<{ url?: string, error?: string }>}
 */
export async function readCheckoutResponse(res, lang) {
  let text = '';
  try { text = await res.text(); } catch (e) {}
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object') return data;
  } catch (e) {}
  if (res.ok) return { error: lang === 'he' ? 'תשובה לא תקינה מהשרת.' : 'Invalid response from server.' };
  return {
    error: lang === 'he'
      ? `השרת לא זמין כרגע (${res.status}). ודא שהשרת (backend) רץ ונסה שוב.`
      : `The server is unavailable (${res.status}). Make sure the backend is running and try again.`
  };
}

/**
 * @param {string} url - checkout URL from /api/payments/create-checkout
 * @param {{ onSuccess?: () => void }} [options]
 */
export async function openCheckout(url, { onSuccess } = {}) {
  try {
    const LemonSqueezy = await loadLemonJs();
    if (LemonSqueezy.Setup) {
      LemonSqueezy.Setup({
        eventHandler: (event) => {
          try {
            if (event && event.event === 'Checkout.Success' && onSuccess) onSuccess();
          } catch (e) {}
        }
      });
    }
    LemonSqueezy.Url.Open(url);
  } catch (e) {
    console.warn('[Checkout] Overlay unavailable, redirecting instead:', e.message);
    if (typeof window !== 'undefined') window.location.href = url;
  }
}

/**
 * True once, when the page was loaded by the post-payment redirect.
 * Removes ?payment=success from the address bar so a refresh does not repeat it.
 */
export function consumePaymentSuccessParam() {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'success') return false;
    params.delete('payment');
    const query = params.toString();
    const cleanUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);
    return true;
  } catch (e) {
    return false;
  }
}
