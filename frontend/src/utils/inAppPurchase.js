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
 * The credit packs from the current RevenueCat offering, cheapest first,
 * with the store's own localized price (e.g. "₪29.90").
 * @returns {Promise<Array<{ id: string, title: string, priceString: string, pkg: object }>>}
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
    return { ok: true };
  } catch (err) {
    if (err && (err.userCancelled || err.code === '1' || err.code === 1)) return { cancelled: true };
    throw err;
  }
}
