/**
 * In-app purchase of AI credit packs in the iOS / Android app, via RevenueCat.
 *
 * App Store 3.1.1 and Google Play's payments policy: digital goods bought
 * inside the store apps must use Apple / Google billing. The website keeps
 * selling through Lemon Squeezy (lemonCheckout.js). Credits from either one
 * land on the same signed-in account.
 *
 * The purchase itself only charges the store. Crediting happens on the
 * server, when RevenueCat calls POST /api/payments/revenuecat-webhook with
 * the buyer's app_user_id (= our user id). The app then refreshes credits.
 *
 * Everything is lazy and wrapped in try/catch, and is a no-op on the web.
 * Inside the store apps, never mention the website, its prices, or that
 * buying elsewhere is cheaper (App Store 3.1.1 / 3.1.3).
 */
import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './nativeApp';
import safeStorage from './safeStorage';

const API_BASE = import.meta.env.VITE_API_URL || '';
const SITE_URL = 'https://www.calendai.org';

// Shown under a subscription (App Store 3.1.2 requires terms + privacy links).
export const LEGAL_LINKS = {
  terms: `${SITE_URL}/terms`,
  privacy: `${SITE_URL}/privacy`,
  // Apple's standard licensed application end user agreement.
  appleEula: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
};

export function nativePlatform() {
  try {
    return Capacitor.isNativePlatform() ? Capacitor.getPlatform() : null;
  } catch (e) {
    return null;
  }
}

/** Where a store subscription is managed or cancelled. */
export function manageSubscriptionUrl(proSource) {
  if (proSource === 'app_store') return 'https://apps.apple.com/account/subscriptions';
  if (proSource === 'play_store') return 'https://play.google.com/store/account/subscriptions';
  return null;
}

function platformKey() {
  try {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') return (import.meta.env.VITE_REVENUECAT_IOS_KEY || '').trim();
    if (platform === 'android') return (import.meta.env.VITE_REVENUECAT_ANDROID_KEY || '').trim();
  } catch (e) {}
  return '';
}

/** True in the store apps once a RevenueCat key is set for this platform. */
export function isIapAvailable() {
  return isNativeApp() && !!platformKey();
}

let purchasesPromise = null;
let configuredUserId = null;

async function getPurchases(userId) {
  if (!isIapAvailable()) throw new Error('In-app purchase is not available here.');
  if (!userId) throw new Error('Sign in first.');
  if (!purchasesPromise) {
    purchasesPromise = import('@revenuecat/purchases-capacitor')
      .then(async ({ Purchases }) => {
        await Purchases.configure({ apiKey: platformKey(), appUserID: String(userId) });
        configuredUserId = String(userId);
        return Purchases;
      })
      .catch((err) => {
        purchasesPromise = null; // allow a retry
        throw err;
      });
  }
  const Purchases = await purchasesPromise;
  // Another account signed in on the same device: purchases must go to that account.
  if (configuredUserId !== String(userId)) {
    await Purchases.logIn({ appUserID: String(userId) });
    configuredUserId = String(userId);
  }
  return Purchases;
}

/**
 * The products of the current RevenueCat offering (credit packs and the
 * Pro subscription), cheapest first, with the store's own localized price.
 * `period` is an ISO 8601 duration (e.g. "P1M") for subscriptions, else null.
 * @returns {Promise<Array<{ id: string, title: string, priceString: string, period: string|null, isSubscription: boolean, pkg: object }>>}
 */
export async function getCreditPacks(userId) {
  const Purchases = await getPurchases(userId);
  const offerings = await Purchases.getOfferings();
  const packages = offerings?.current?.availablePackages || [];
  return packages
    .filter((p) => p && p.product)
    .sort((a, b) => (a.product.price || 0) - (b.product.price || 0))
    .map((p) => ({
      id: p.identifier,
      title: p.product.title || p.product.identifier,
      priceString: p.product.priceString,
      period: p.product.subscriptionPeriod || null,
      isSubscription: !!p.product.subscriptionPeriod,
      pkg: p
    }));
}

/**
 * Opens the App Store / Google Play payment sheet for one pack.
 * @returns {Promise<{ ok?: true, cancelled?: true }>}
 */
export async function buyCreditPack(userId, pack) {
  const Purchases = await getPurchases(userId);
  try {
    await Purchases.purchasePackage({ aPackage: pack.pkg });
  } catch (err) {
    if (err && (err.userCancelled || err.code === '1' || err.code === 1)) return { cancelled: true };
    throw err;
  }
  // Pro turns on right away; credits still come from the webhook.
  if (pack.isSubscription) await syncPurchasesWithServer();
  return { ok: true };
}

/**
 * Ask the backend to re-read this user's store subscription from RevenueCat
 * (POST /api/payments/revenuecat-sync) instead of waiting for the webhook.
 * @returns {Promise<{ isPro: boolean, proExpiresAt: string|null, aiCredits: number }|null>}
 */
export async function syncPurchasesWithServer() {
  let token = null;
  try { token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt'); } catch (e) {}
  try {
    const res = await fetch(`${API_BASE}/api/payments/revenuecat-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include'
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null;
  }
}

/** "Restore purchases" (required by App Review for subscriptions). */
export async function restorePurchases(userId) {
  const Purchases = await getPurchases(userId);
  await Purchases.restorePurchases();
  return syncPurchasesWithServer();
}
