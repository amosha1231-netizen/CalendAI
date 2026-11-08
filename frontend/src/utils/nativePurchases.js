/**
 * In-app purchases for the native apps (Apple IAP / Google Play Billing),
 * through RevenueCat. The web app keeps using Lemon Squeezy (lemonCheckout.js).
 *
 * The RevenueCat app user id is the CalendAI user id, so the backend webhook
 * (/api/payments/revenuecat-webhook) knows whom to upgrade.
 *
 * The plugin is imported lazily, and every function is a safe no-op on the
 * web, so importing this file never touches native code at module init.
 */
import { Capacitor } from '@capacitor/core';
import safeStorage from './safeStorage';

const API_BASE = import.meta.env.VITE_API_URL || '';
const SITE_URL = 'https://www.calendai.org';

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

function apiKey() {
  const platform = nativePlatform();
  if (platform === 'ios') return import.meta.env.VITE_REVENUECAT_IOS_KEY || '';
  if (platform === 'android') return import.meta.env.VITE_REVENUECAT_ANDROID_KEY || '';
  return '';
}

/** True when this build can sell in-app (native app with a RevenueCat key). */
export function canPurchaseInApp() {
  return !!nativePlatform() && !!apiKey();
}

let pluginPromise = null;
let configuredFor = null;

function loadPlugin() {
  if (!pluginPromise) {
    pluginPromise = import('@revenuecat/purchases-capacitor')
      .then((m) => m.Purchases)
      .catch((e) => {
        pluginPromise = null;
        throw e;
      });
  }
  return pluginPromise;
}

async function ready(userId) {
  if (!canPurchaseInApp()) throw new Error('In-app purchase is not available in this build.');
  if (!userId) throw new Error('Login required.');
  const Purchases = await loadPlugin();
  const id = String(userId);
  if (!configuredFor) {
    await Purchases.configure({ apiKey: apiKey(), appUserID: id });
    configuredFor = id;
  } else if (configuredFor !== id) {
    await Purchases.logIn({ appUserID: id });
    configuredFor = id;
  }
  return Purchases;
}

/**
 * The packages of the current RevenueCat offering, ready to show.
 * @returns {Promise<Array<{id: string, title: string, price: string, period: string|null, isSubscription: boolean, raw: object}>>}
 */
export async function getStorePackages(userId) {
  const Purchases = await ready(userId);
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings?.current?.availablePackages || [];
  return pkgs.map((p) => ({
    id: p.identifier,
    title: p.product?.title || p.identifier,
    price: p.product?.priceString || '',
    period: p.product?.subscriptionPeriod || null,
    isSubscription: !!p.product?.subscriptionPeriod,
    raw: p
  }));
}

/** Tell the backend to re-read the purchase now instead of waiting for the webhook. */
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

/** @returns {Promise<{cancelled: boolean}>} */
export async function buyStorePackage(userId, pkg) {
  const Purchases = await ready(userId);
  try {
    await Purchases.purchasePackage({ aPackage: pkg.raw });
  } catch (e) {
    if (e?.userCancelled || e?.code === '1' || e?.code === 1) return { cancelled: true };
    throw e;
  }
  await syncPurchasesWithServer();
  return { cancelled: false };
}

export async function restoreStorePurchases(userId) {
  const Purchases = await ready(userId);
  await Purchases.restorePurchases();
  return syncPurchasesWithServer();
}
